# AUDIT — asynchronous cell population vs. the filter caches

Started 2026-09-16, on branch `rel-column-batch-and-cell-states`. Written to be
picked up cold in a fresh session: everything needed to continue is here, and
nothing below depends on remembering the conversation that produced it.

Line numbers are given only as a hint and **will drift** — this file grows on
nearly every commit. Grep the named function instead, per `CLAUDE.md`'s own
rule about anchors.

---

## 1. The defect class

**A feature that populates cells asynchronously changes cell CONTENT while every
filter INPUT stays identical.** Anything keyed on inputs alone therefore goes
stale, silently, and usually permanently for that exact filter.

Two confirmed instances, both found by a human clicking through a real page
*after* a 287-test fixture suite was green, and both now fixed on this branch:

| Commit | Defect | Symptom |
|---|---|---|
| `a861512` | `_relDropRowTextCache()` invalidated the row-text cache by writing `null`, but `_cachedColText()`'s "not cached" sentinel is `undefined` — so a collapse **poisoned** the entry instead of clearing it | `testRowMatch()` threw `TypeError: … (reading 'toLowerCase')` mid-`runFilter()`, aborting the row loop; the 📊 relationship filter stopped outlining matches, and where the throw landed earlier it stopped narrowing too |
| `d551df6` | A rel write dropped the uniq-dropdown cache but **not** `_filterResultCache` | Picking the same 📊 entry again after another row loaded replayed the first pick's row list; the second matching row was *removed from the DOM*, never re-tested |

Both are the same shape. The audit is to find the rest.

---

## 2. The two caches, and what each one misses

### `_filterResultCache` (grep `const _filterResultCache`)

Keyed by `_buildFilterKey()`, which hashes **only filter inputs**: global query,
case/regexp/exclude flags, `_lenMismatchFilterKind`, `pendingEditsOnly`, and per
column either `{idx, valueSet, structureModes, …}` or `{idx, val, flags}`.
**Nothing in the key describes cell content.**

Cleared by `_invalidateFilterCache()`, which also resets the incremental-filter
state (`_incrMatchSet`, `_incrLastGlobalQuery`, `_incrLastPartialKey`).
`_invalidateFilterCacheForGroups(idxSet)` is the multi-table sort's narrower
variant — it matches keys by **group index** (`^m:[^:]*:(\d+)\|`), so it is not
usable from a writer that only knows a `<table>` element: merged discography view
folds other groups' rows into the first-occurrence table, and a single-table
page's one `s|…` key does not match that pattern at all.

### The uniq-dropdown data cache (grep `_invalidateUniqDropDataCacheForTable`)

Its signature is the **visible row set**, which a content write does not change —
this is already documented in its own JSDoc. Most async writers do drop it.

### The asymmetry that IS the audit

As of `d551df6`: **eighteen** sites drop the uniq-dropdown cache, **four** drop
the filter-result cache (three of which are wholesale resets: fetch start, sort,
disk-load).

> **Correction (2026-09-17).** The first version of this section said "ten", and
> §3.1 said no `_invalidate*` call appears in the artwork path. Both came from
> a regeneration command that matched only `_invalidateUniqDropDataCacheForTable(`
> and silently missed the per-column `_invalidateUniqDropDataCache(` — which the
> artwork path and the cell-collapse handlers DO call. The command below matches
> both.

Regenerate the map at any time with:

```sh
awk '/^    (async )?function [A-Za-z_]/ { match($0, /function [A-Za-z_0-9]+/); fn=substr($0, RSTART+9, RLENGTH-9) } /_invalidateUniqDropDataCache(ForTable)?\(|_invalidateFilterCache\(|_invalidateFilterCacheForGroups\(/ && !/function _invalidate/ && !/^ *\*/ && !/^ *\/\// { printf "%-6s %-42s %s\n", NR, fn, $0 }' ShowAllEntityData.user.js
```

Result on 2026-09-17 (branch @ `ee65c35`):

| Enclosing function | uniq-drop | filter-result |
|---|---|---|
| `_msApplyLengthPrecision` | yes (table) | **no** |
| `_maybeCorrectAreaFlagRegion` | yes (table) | **no** |
| `initReleaseEventsColumn` (×2) | yes (table) | **no** |
| `_artSetInlineSortKey` | yes (column) | **no** |
| `_artBuildMultiRowArtCell` (×2, REBUILD + FIRST-BUILD) | yes (column) | **no** |
| `_applyCollapseState` (×2), `ensureCollapseDelegate` (×3) | yes (column) | **no** |
| `initPicardTaggerColumn`, `_picardToggleTable` | yes (table) | **no** (probably correct — see §3.5) |
| `_relLoadRow`, `_relToggleTable`, `_initRelationshipsColumnImpl` | yes (table) | via `_relScheduleProgressRefresh` |
| `_relScheduleProgressRefresh` | yes (table) | **yes** (the `d551df6` fix) |
| `startFetchingProcess`, `makeTableSortableUnified`, `_hydrateAndRenderFromSnapshotData` | — | yes (wholesale) |

### The structural fact every §3 target turns on

**`runFilter()` matches SOURCE rows** — `testRowMatch(r, ctx, true)` over
`allRows` / `groupedRows[i].rows`, reading `_cachedColText()` /
`_cachedFullText()` — while **the 📊 dropdown counts LIVE rows** (`tbody.rows`).
So there are two independent ways for an async writer to break a filter, and a
fix for one does not fix the other:

1. **It never writes the source row at all** (only the rendered clone). No cache
   drop can help: the matcher reads a row that does not carry the new content.
2. **It writes the source row but leaves a cache stale** — `_filterResultCache`
   (same key → replayed row list) and/or `_rowTextCache` (stale column/full text
   for that source row).

The symptom of both is the same — **"📊 count N, fewer rows rendered"** — which is
why each repro needs a variant that isolates one from the other (§5, and §10's
L2 vs L3 for the concrete case).

---

## 3. What to audit, in priority order

For each: does it mutate text or a sentinel that **filtering, sorting or the 📊
dropdown can read**? If yes, does it write the **source row**, and does it drop
**both** caches (see §2's structural fact)?

Every target carries a **Status** (`suspect` / `reproduced` / `found sound`) and a
pointer to its **live pre-test in §10** — a real URL, exact clicks, and the
prediction if the bug is real. The live pre-tests can be run in a real browser
before, and independently of, the fixture specs.

**Case (§9):** every target below lives in code that is **identical on `main`**
(`git diff main` shows no change to any of them, checked 2026-09-17), so anything
that reproduces is Case B → hotfix.

### 3.1 CAA/EAA inline artwork — PRIME SUSPECT

**Status:** H1–H4 **reproduced** on `main` 9.99.1093 and **fixed** on hotfix branch
`fix/art-async-filter-staleness` (`06a8629`, pushed, **not merged** — awaiting the
merge decision and live pre-tests L1–L4 against the worktree's userscript). H2b
behaves as predicted (sound). H4b not covered. **H5 suspect, new** (see below,
live pre-test L4b). **Spec:** `tests/fixtures/art-inline-uniq-filter-late-load.spec.js`.
**Mutations:** `scripts/mutations/art-inline-late-load.json` (11/11 as expected).
Root-cause write-up: that branch's `DEBUG-NOTES.md`, 2026-09-17.

Fixture results (each test run alone, `vzell-lap`, 2026-09-17):

| Test | `main` 9.99.1093 | hotfix | What it establishes |
|---|---|---|---|
| single-table baseline (nothing late) | ✅ yes 10/10, no 2/2 | ✅ | The spec drives the dropdown correctly |
| multi-table control (ordinary "» country code: AU" entry) | ✅ 3/3 | ✅ | Same, on the multi-table page |
| **H1** multi-table, nothing late | ❌ **count 5, rows 0** | ✅ | Not a timing bug: inline-art entries never matched on a multi-table page |
| **H1 typed** `caa-inline-yes` column filter, multi-table | ❌ **5 vs 0** | ✅ | Same defect through `testRowMatch()`'s typed bypass (test added with the fix; fails on `main`) |
| **H2** single-table, late thumbnail after a sort | ❌ **count 10, rows 9** | ✅ | The sort wiped the cache and no key was cached, so this is the source-row gap alone |
| H2b single-table, late **404** after a sort | ✅ 2/2 | ✅ | The predicted asymmetry is real: the error path does reach the source cell |
| **H3** single-table, pick → unpick → late → pick | ❌ **count 10, rows 9** | ✅ | BOTH causes at once: mutation 4 (source-row fix in, cache drop out) still renders 9 — the replay is real and stacked on H2 |
| **H4** multi-table CAA "» image type: Front", pick → unpick → late → pick | ❌ **count 6, rows 5** | ✅ | Replay |
| H4 isolation: same late metadata, but a sort instead of pick/unpick | ✅ 6/6 | ✅ | The source-row sync works, so **H4 is purely a replayed `_filterResultCache` entry** |

Hotfix verification: full fixture suite **267 passed, 0 failed** (shards 96/83/88,
01:03–01:14Z); live `caa-icon-survives-sort.spec.js` (BoDeans releases, 36/36
thumbnails painted at insertion, 0 archive fetches) and
`caa-icon-survives-sort-multi.spec.js` (Tougher Than the Rest, 6/6, 0 fetches)
both pass.

**How it was fixed, in one paragraph** (details in the hotfix's CLAUDE.md and
DEBUG-NOTES): a settle is recorded in `_inlineArtSettled` (`"rowIdx:colIdx"` →
`{value, guid}`, reset with `expandedCells`), and the structure modes, the typed
bypass and the 📊 count pass all read it through `_inlineArtSentinelFor()`.
`_invalidateFilterCacheWhere(affectsKey)` drops only the keys that can read what
changed — `_filterKeyReadsInlineArtSentinel()` or `_filterKeyReadsArtColumn(colIdx)`
— and only on a real change. Mirroring the span onto master rows was rejected on
measurement: `_findMasterRowByIdx()` costs 0.69 ms per lookup at 4174 rows. **That
invalidator is reusable for §3.2, §3.3, §3.4 and §3.8** once the hotfix is on
`main`.

`_artSetInlineSortKey()` stamps `.mb-inline-art-sort-key` (`caa-inline-yes` /
`caa-inline-no`) **after each fetch settles**, and `_cellMatchesStructureMode()`'s
`inline-art-yes`/`inline-art-no` modes match exactly that sentinel (📊 entries
"🖼️ front-image available" / "∅ NO front-image available", section
"Structure - Inline artwork"). Same shape as the Relationships column:
asynchronous, per cell, and filterable.

*Corrected 2026-09-17:* the uniq-dropdown cache **is** dropped here
(`_invalidateUniqDropDataCache(td.closest('table.tbl'), td.cellIndex)`), and in
both branches of `_artBuildMultiRowArtCell()`. What is NOT dropped anywhere in
the artwork path is `_filterResultCache`. And the sentinel is written to the
**live** `<td>` only:

| # | Mode / trigger | Hypothesis | Predicted symptom |
|---|---|---|---|
| H1 | multi-table, nothing late | `renderGroupedTable()` always clones, so the stamp lands on the clone. `_artMirrorInlineThumbToSourceRow()` copies the placeholder `<span>` to the source row but **not** the sort-key span, which is a `<td>` child outside it. No source row ever carries the sentinel. | Both entries render **0 rows** while their counts read Y and N. Not a timing bug at all. |
| H2 | single-table, a thumbnail settles AFTER a re-render (sort) | On the first render `allRows`' rows ARE the live rows, so early settles reach the source. After any re-render the original loadTask bails on `!ph.isConnected`, and the clone's own re-fetch stamps only the clone. | Rows = thumbnails settled before the re-render; count = all. No cached key is involved, so this isolates the source-row gap. |
| H2b | same, but the late answer is a 404 | The error path has **no** `isConnected` guard and stamps the closure's detached `<td>`, which on single-table IS the source cell. | "∅ NO front-image available" stays correct: the asymmetry is itself a prediction. |
| H3 | either mode, settle after a pick/unpick of the same entry | `_filterResultCache` replay — identical key (the `d551df6` shape). | Rows = first pick's rows; late rows **absent from the DOM**. |
| H4 | CAA column, multi-table, metadata settles after pick/unpick of a "CAA info - Type" entry | `_artSyncSearchTextToSourceRow()` DOES sync the facts to the source row and drops that row's `_rowTextCache` correctly (`cols[i] = undefined; full = null`), but never `_filterResultCache`. | Replay: first pick's rows. |
| H4b | CAA column, single-table, metadata settles after a re-render | `_artSyncSearchTextToSourceRow()` returns early for `tableMode !== 'multi'` on the premise "allRows' rows ARE the live rows" — true only until the first re-render. | Late metadata never reaches `allRows`. Not yet covered by a §10 entry (needs a single-table page with a CAA column). |
| H5 | CAA column, multi-table, **plain global** filter for an image type, nothing late (added 2026-09-17, suspect) | `testRowMatch()`'s plain-global fallback for art text reads only `cell.querySelector(':scope > ul.mb-caa-art-ul').dataset.mbArtSearch`. Multi-table source rows never carry that `<ul>` — they carry `td[data-mb-art-search-sync]`, which only `getCleanColumnText()` reads. The regexp global path and a column filter go through `getCleanColumnText()`, so they do match. | Plain global "Booklet"/"Front" finds **no** CAA-only matches on a multi-table page; the same query with **Rx** ticked finds them. Structural twin of H1. Live pre-test §10 L4b. |

Checked and expected exempt: `_artMirrorIconToSourceRow()` (writes only
`background-image`; the icon is in `_CLEAN_STRIP_SEL`), and `.mb-caa-sort-key`
(stamped before the row is ever cloned).

Also note, for whoever fixes H1/H2: `_stripTransientCellState()`'s "sort-key
spans intentionally NOT removed … removing it from the clone would … match
nothing" comment predates `runFilter()` matching SOURCE rows. The clone's copy is
no longer what the matcher reads.

### 3.2 Millisecond Length toggle (⏱)

**Status:** **reproduced** on `main` 9.99.1093 and **fixed** on hotfix branch
`fix/ms-length-filter-staleness` (`634e03c`, pushed, **not merged**), 2026-09-17.
**Live pre-test:** §10 L5. **Spec:** `tests/fixtures/ms-length-filter-after-toggle.spec.js`.
**Mutations:** `scripts/mutations/ms-length-filter-after-toggle.json` (5/5 as expected).
Root-cause write-up: that branch's `DEBUG-NOTES.md`, 2026-09-17.

| Test | `main` 9.99.1093 | hotfix |
|---|---|---|
| control: ▶⏱, then Length filter `.` | ✅ 8/8 | ✅ |
| **A**: filter `.`, then ▶⏱ | ❌ **8 expected, 0** | ✅ |
| **A isolation**: same, then flip the page-wide Case checkbox (new key, same matches) | ❌ **0** — the stale row-text cache on its own | ✅ |
| **B**: ms, filter `.666`, then ▼⏱ | ❌ **0 expected, 1** (showing `3:12`) | ✅ |
| **C**: global filter `11.666`, then ▶⏱ (added with the fix) | ❌ nothing rendered | ✅ |

Both predicted causes are real and stacked: removing only the result-cache drop
fails A while A-isolation stays green. Fix: per rewritten cell
`cols[cellIndex] = undefined`, per changed row `full = null`, and a wholesale
`_invalidateFilterCache()` (once per button press, so affordable). Full fixture
suite on the hotfix tree: 262 passed + 1 known load-sensitive flake
(`picard-cells-survive-rerender`, the `68f6aff` budget that `main` lacks) that
passes 2/2 standalone.

Original analysis:

`_msApplyLengthPrecision()` rewrites the Length column's **visible text** on the
SOURCE rows (`groupedRows`/`allRows`), which is read by filtering, by
`getCleanColumnText()`, and by `_compareDurations()` for sorting. It drops the
uniq-dropdown cache (page-wide) and then calls `runFilter()`. The text genuinely
changes (`3:12` ↔ `3:11.666`), so membership can change too.

It drops **neither** `_filterResultCache` (same key → replayed row list) **nor**
the rewritten rows' `_rowTextCache` entries. So there are two stacked defects:
even with the result cache dropped, `_cachedColText()` would still hand back
`3:12`. A fix must clear `cols[idx]` → `undefined` **and** `full` → `null` (§4),
because the global filter reads `full`.

Check both `_msToggleLengthPrecision()` and `_msApplyLengthPrecision()`.

### 3.3 Release events column (also covers §3.7)

**Status:** suspect. **Live pre-test:** §10 L6.

`initReleaseEventsColumn()` makes ONE page `fetch()` for the page entity
(`/ws/2/<entity>/<id>?inc=release-rels`). It populates `td.mb-re-cell` in the live
DOM and syncs `innerHTML` into `groupedRows`/`allRows`, then calls
`applyInjectedColumnExtractors()`, which fills the "Release country"/"Release
date" ICE cells on live AND source rows. It drops the uniq-dropdown cache twice.
It does NOT drop `_filterResultCache`, nor `_rowTextCache` for the source rows it
rewrites. A filter typed before population therefore caches `''`-derived results
and text. Used by `place-performances(-filtered)` and
`label-relationships(-filtered)`.

### 3.4 `_maybeCorrectAreaFlagRegion`

**Status:** suspect. **Live pre-test:** §10 L7 (needs the "MusicBrainz: More Flags
Everywhere" userscript).

Moves a flagged Locality value into Region on the live row AND the master row
(`_forceLocalityToRegion`), up to ~6 s after render, reacting to a third-party
userscript's decoration. It drops the uniq-dropdown cache for the table, but not
`_filterResultCache` or the master row's `_rowTextCache`. The moved text is plain
area-link text, not inside `_CLEAN_STRIP_SEL`, so it reaches
`getCleanColumnText()`. Both Locality and Region have filter inputs.

### 3.5 Picard column — expected EXEMPT, but verify

**Status:** code check pending; no live pre-test (§10 L9).

`CLAUDE.md` states a Picard cell contributes `''` to filtering, sorting and 📊
(its content is a `<button>` plus an `<img alt="♪">`), which is why its
uniq-only drop is correct rather than an oversight. Verify that is still true
before dismissing it.

### 3.6 Live-date flags — expected SOUND

**Status:** expected found sound, pending a code confirmation; no live pre-test
(§10 L9).

`.mb-live-date-flag`'s glyph **is real cell text** (unlike the length-mismatch
flag, which is attribute-only by design). But all four `_appendLiveDateFlag()`
callers (`applyExtractTrackTitleData`, `_buildRecordedAtPlaceTd`,
`_buildCreditListItem`, `_buildInstrumentVocalsListItem`) run **synchronously**
while rows are built, before the first render. No async writer was found.
Remaining check: confirm nothing re-runs `applyExtractTrackTitleData()` after
render with different output.

### 3.7 Injected-column extractors / ICE cells — folded into §3.3

**Status:** see §3.3. *Corrected 2026-09-17:* the original premise here — that
`applyInjectedColumnExtractors()` derives cells from the Relationships cells — was
wrong. Its only caller is `initReleaseEventsColumn()`, and its injected-cell map
is seeded from `td.mb-re-cell` alone. It is §3.3's second write, and L6's
"Release country" filter is its live test.

### 3.8 Cell collapse / expand — added 2026-09-17

**Status:** suspect. **Live pre-test:** §10 L8.

`_applyCollapseState()` (column-header and global mass toggles) and
`ensureCollapseDelegate()` (per-cell ▶N▤ clicks) mutate `expandedCells`, which the
📊 "▶ collapsed multi-row cells" / "◀ expanded multi-row cells" structure modes
read in `_cellMatchesStructureMode()`. `_buildFilterKey()` does not include
`expandedCells`. These sites drop the uniq-dropdown cache per column, never
`_filterResultCache`. Not asynchronous, but the same defect class: state changes,
inputs do not.

---

## 4. A second, related trap: the row-text cache sentinels

`_rowTextCache` (a `WeakMap`, grep `const _rowTextCache`) has **two different
sentinels**, and mixing them up is what caused `a861512`:

* `cols[idx]` — "not cached" is **`undefined`** (`_cachedColText`).
* `full` — "not cached" is **`null`** (`_cachedFullText`).

Correct writers: `_relDropRowTextCache()` (now `delete _c.cols[colIdx]`) and the
site near `getCleanCellHtml`/snapshot capture, which already does
`cached.cols[colIdx] = undefined; cached.full = null;`.

**Any new invalidator must honour both.** Writing `null` into a `cols` slot does
not clear it — it makes `testRowMatch()` throw.

---

## 5. Method — what counts as evidence

1. **Reproduce first, in a fixture spec, before changing any code.** Both fixed
   bugs needed a *specific* sequence; the obvious minimal one did not reproduce
   either of them. For the rel filter, the missing ingredient was *another
   column's filter being active across the cycle* — that is what puts
   `runFilter()` on the `matchOnly` path that reads the row-text cache at all.
2. **Include a baseline test** that performs the same action *without* the
   suspected trigger. Without it, a red repro cannot be told apart from a spec
   that drives the UI wrongly — which happened three times in one afternoon.
3. **Assert both caches separately.** The dropdown's entry COUNT comes from the
   uniq-drop cache; the rendered ROWS come from the filter-result cache. Before
   `d551df6` the count read `2` while one row rendered. A test asserting only
   rows cannot distinguish a replayed filter from a stale dropdown.
4. **A removed row is not an unmatched row.** `runFilter()` REMOVES non-matching
   rows from the tbody. If a row is absent from the DOM it was never tested —
   that single observation is what identified a replayed result.
5. **Mutation-check every fix** (`scripts/mutation-check.py`,
   `scripts/mutations/*.json`) and **read WHICH assertion failed**, not merely
   that it failed. Label assertions so the summary names them.

---

## 6. Harness facts (each one cost a wasted run)

* **Column filter inputs are readonly until a genuine trusted interaction**
  (anti-autofill hardening). `locator.fill()` times out with "element is not
  editable" — `click()` first, then `pressSequentially()`.
* **`fill('')` cannot clear a column filter**: `_isGenuineFilterInputEvent()`
  rejects it and the filter silently never re-runs. Use `columnFilterClear()`'s
  ✕ button (`tests/support/filterSortAssertions.js`).
* **Choose a text-filter needle by frequency across rows**, never from row 0, and
  assert `0 < hits < rowCount` — a needle matching every row makes the step a
  silent no-op. Column 0's `textContent` also fuses the expand glyph and the
  `caa-inline-yes` sentinel onto the title with no separator.
* **`expect.poll`'s message goes in the options object** (`{ timeout, message }`),
  not as a second argument to `toBe()`, where it is ignored.
* **📊 dropdown**: `window.__saTest.getUniqDropSections('<Column>')` opens the
  panel and returns `[{label, items:[{label,count}]}]`. Click an entry by
  `dataset.mbUniqSynLabel`. Close it by dispatching `mousedown` on
  `document.body` — clicking the 📊 wrap again makes Playwright scroll, which
  closes and then REOPENS the panel, and Escape is taken by the quick-filter.
* **`collectPageErrors()` keeps only `err.message`.** Add a local
  `page.on('pageerror', e => …e.stack)` when diagnosing — "Cannot read properties
  of null" with no stack is indistinguishable among ~40 `.toLowerCase()` sites.
* **Background suite runs were memory-killed three times**; foreground
  `--shard=1/3`, `2/3`, `3/3`, run **one at a time**, completed reliably
  (~8 min each). Never run two Playwright processes concurrently here.
* `mutation-check.py` used to score "no tests found" as a pass; fixed this
  session to report ERROR. **The older mutation lists were written before that
  fix** — see the parking lot.

---

## 7. State when this file was written

* Branch `rel-column-batch-and-cell-states` @ `d551df6`, pushed, **unmerged**.
* `main` @ `43d11cf` (9.99.1093), untouched. An earlier local merge was unwound
  with `git reset --hard` after the first live bug; nothing was ever pushed.
* Full fixture suite: **291 green** across three foreground shards.
* `ShowAllEntityData_CHANGELOG.wip.json` holds WIP.1–WIP.8.
* `CLAUDE.md` now forbids merging an implementation branch to `main` without
  asking first — a green suite is evidence that the assertions someone already
  thought of still hold, not that the feature works.
* Root-cause write-ups for both bugs: `DEBUG-NOTES.md`, 2026-09-16 entries.

---

## 8. Parking lot — other observations, not yet acted on

* **Audit the five pre-existing mutation lists for stale `grep` strings.** Until
  this session, a `grep` that matched no test was scored as a passing mutation.
  Every `expect: "fail"` entry written before that fix is only as trustworthy as
  its grep string.
* **Live specs are runnable again** (`npm run auth:login` was refreshed
  2026-09-16), and the live suite was never part of this branch's verification.
* `org/relationships.org` records the two live-testing bug reports; they could be
  marked resolved with `a861512` / `d551df6`.
* The notes there say `bootleg.php`; the real data and the fixtures use
  `bootlegs.php`. Harmless in prose, but it will not match a grep against real
  URLs.
* **`_adoptJesus2099MsLength()` also rewrites Length text** (adopting a
  jesus2099-leaked value), possibly after a filter has run. Found while fixing
  §3.2, not examined — a candidate for this audit's defect class, third-party
  dependent.
* **Pre-existing perf cost found while fixing §3.1 (on `main`, not changed):**
  `_artInitInlinePics()`' Case C1 calls `_artMirrorInlineThumbToSourceRow()` for
  EVERY settled row on EVERY multi-table re-render, and that resolves the master
  row with `_findMasterRowByIdx()` — a linear scan measured at 0.69 ms per lookup
  at 4174 rows, 1.89 ms at 10 000 (`vzell-lap`, see the hotfix's
  `tests/MEASUREMENTS.org`). So a keystroke on a big multi-table page with inline
  art pays it once per row. Recorded in the hotfix's PERFORMANCE.org as a
  candidate Step, unnumbered.
* `tests/snapshots/artist-releases-dylan/` holds the 2026-09-15 perf arms
  (`main` vs branch, absent/collapsed). The `expanded` arm could not run: it hit
  the harness's icon-floor guard because of a `main` defect fixed as 9.99.1093,
  so an expanded-arm measurement is still missing.

---

## 9. Where to fix what — branch or hotfix off `main`

**Let the location of the defective code decide, not convenience.** The feature
branch is under live testing and may stay open for a while; that is a reason to
keep `main`-side fixes OFF it, not a reason to pile them on.

### The deciding question

> Does the bug reproduce on `main` (9.99.1093) with none of this branch's code?

Cheap proxies: does it still happen with `sa_enable_relationships_column: false`,
or on a plain `main` checkout in a worktree?

### Case A — the defect is in code this branch introduced

Fix it **on the branch**, with a WIP.N changelog entry. Both bugs fixed so far
are this case: `_relDropRowTextCache()` and `_relScheduleProgressRefresh()` do
not exist on `main`, so there is nowhere else to fix them.

### Case B — the defect is in pre-existing `main` code

Branch from `main`, release it, then merge `main` into the feature branch.
Three reasons:

1. **It affects users today.** A CAA/EAA, ⏱ Length or Release-events cache bug
   is live in 9.99.1093 right now. Parking it behind a large feature branch
   means shipping nothing to the people hitting it.
2. **It keeps the branch's diff honest.** This branch is already ~1450 changed
   lines of userscript plus eight WIP entries plus harness work. Every unrelated
   fix folded in makes the merge riskier and the changelog fold harder to read.
3. **It is the play that already worked twice.** 9.99.1092 (release listings
   looked up as labels) and 9.99.1093 (Load-from-Disk built a Relationships
   header with no cells) were both found *while* working on this branch, fixed
   on hotfix branches off `main`, released, and merged in — neither disturbed
   the branch.

**Most of the §3 targets are Case B**: the artwork path, the ⏱ toggle, Release
events and the area flags are all `main` code. Expect this audit to produce
hotfixes rather than branch commits.

### The mechanic that protects live testing

Do `main`-side work in a **git worktree**; never switch the primary checkout:

```sh
git worktree add <scratchpad>/hotfix -b fix/<topic> main
```

The primary checkout stays on the feature branch, so whatever path Tampermonkey
loads keeps serving the branch's userscript and a live session is untouched.
Both of today's hotfixes were built this way. Remove the worktree afterwards
(`git worktree remove --force <path>` — its `node_modules` is a symlink).

**After each `main` release, merge `main` into the feature branch promptly.**
Otherwise live testing keeps re-finding a bug that is already fixed, with no way
to tell.

### The ambiguous case

Code that lives on `main` but whose bug is only *reachable* through branch
features. **Decide by reachability, not authorship**: if a 9.99.1093 user can
trigger it, it is a hotfix; if only branch code can, it is a branch fix. The
`_rowTextCache` sentinel trap in §4 is the former — `_cachedColText()` is `main`
code and any future invalidator there could hit it.

### Cost, and when to batch

A hotfix still owes a regression spec, a mutation check and a full suite on the
merged tree — roughly an hour each at current suite times. So batching two or
three small `main` defects into one hotfix branch is reasonable: one release,
one suite run. Do **not** batch a risky fix with a trivial one; the trivial one
then cannot be shipped or reverted independently.

---

## 10. Live pre-tests — real pages, exact clicks, predictions

Added 2026-09-17. Each entry can be run in a real browser **before** any fixture
spec exists, against the userscript as it is today. It says what a real bug
looks like and what a sound implementation looks like, so the result means
something whichever way it comes out. These are the live twins of the fixture
specs the audit writes. If a live result disagrees with its fixture spec, stop
and reconcile before fixing anything.

Two readings apply to every entry:

* **Run the control before the trigger.** The control proves the clicks are
  driven correctly (three wasted repros in one afternoon came from UI driven
  wrongly, §5.2). It also tells you which value to use as the needle.
* **A row that is absent from the table was never tested** (§5.4). "📊 says N,
  fewer rows rendered, and the missing ones are simply gone" is the signature.

### L0 — making something load late, on purpose

GM_xmlhttpRequest traffic runs inside Tampermonkey, and **DevTools cannot
throttle it**. To slow the artwork paths down:

1. Userscript settings → turn **off** "Enable IndexedDB art image/metadata cache"
   (`sa_art_idb_enable`). Inline thumbnails then fall back to native `img.src`,
   and CAA metadata already uses page `fetch()`. Both show up in DevTools and
   both can be throttled.
2. DevTools → Network → tick **Disable cache**. In the throttling dropdown,
   **Add custom profile** with download ≈ 30 kbit/s. Select it **right before**
   clicking the Show-all button.
3. On multi-table pages, **expand every sub-section first**. A collapsed
   sub-table is `display:none`, and its artwork never loads.
4. Afterwards, turn the IDB setting back on and remove the throttle.

### L1 — §3.1 H1: inline art on a multi-table page, nothing late (no L0)

* **URL:** <https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c>
  — "Tougher Than the Rest", 7 releases, 2 sub-tables.
* **Steps:**
  1. Click **Show all Releases for ReleaseGroup** and expand both sub-sections
     (they render collapsed).
  2. Wait until every **Release** cell shows its thumbnail or a blank spacer.
  3. In the first sub-table, click 📊 on **Release** and find section
     **"Structure - Inline artwork"**. Note **"🖼️ front-image available (Y)"** and
     **"∅ NO front-image available (N)"**.
  4. Click the Y entry and count the rows. Uncheck it, then click the N entry.
* **Control:** in the same dropdown, pick any ordinary value. The table narrows
  to that entry's count.
* **Prediction if real:** **0 rows** for both entries, while the counts still
  read Y and N.
* **If sound:** Y rows, then N rows.

### L2 — §3.1 H2/H2b: single-table, thumbnails settle after a sort (L0)

* **URL:** <https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908>
  — "Bruce Springsteen Studio Collection", 12 releases.
* **Control:**
  1. With the L0 throttle, click **Show all Releases for Series**, and wait
     until all 12 Release cells have settled.
  2. Sort by any column.
  3. Click 📊 on **Release**, then **"🖼️ front-image available (Y)"**. Expect Y
     rows.
* **Trigger:**
  1. Reload, keep the throttle on, and click Show-all.
  2. While thumbnails are still arriving, count the ones already visible (**S**),
     then sort by any column.
  3. Wait until every cell has settled. Thumbnails reload after the sort;
     that's expected with the cache disabled.
  4. Click 📊 on **Release**, then **"🖼️ front-image available"** — it reads Y.
     Click it.
* **Prediction if real:** **S rows** (S < Y). Only the thumbnails that settled
  before the sort are rendered.
* **Side prediction (H2b):** **"∅ NO front-image available"** renders exactly its
  count, even for 404s that arrived late.
* **If sound:** Y rows.

### L3 — §3.1 H3: pick/unpick replay (L0, same URL as L2)

* **Trigger:**
  1. Reload, then Show-all with the throttle on.
  2. While thumbnails are still arriving, click 📊 on **Release**, then
     **"🖼️ front-image available (Y1)"**. Y1 rows render.
  3. Click the same entry again to uncheck it. All 12 rows come back.
  4. Wait until every cell has settled.
  5. Click 📊 again — the count now reads **Y2 > Y1**. Click the entry.
* **Prediction if real:** **Y1 rows**. The releases whose thumbnails arrived late
  are absent from the table.
* **If sound:** Y2 rows.
* **Note:** H2 predicts the same number here, so this run shows the user-visible
  symptom but cannot say which of the two it is. L2 (live) and the fixture spec
  separate them.

### L4 — §3.1 H4: CAA column metadata, multi-table, pick/unpick replay (L0)

* **URL:** same as L1. The **CAA** column's per-release metadata comes from page
  `fetch()`, so L0 slows it down.
* **Control:**
  1. Show-all, expand the sub-sections, and wait until every CAA cell shows its
     image-count number.
  2. In the first sub-table, click 📊 on **CAA**, open section
     **"CAA info - Type"**, note **"Front (F)"** and click it. Expect F rows.
* **Trigger:**
  1. Reload and Show-all with the throttle on. Expand the sub-sections.
  2. As soon as **some** CAA cells show an image-count number, click 📊 on
     **CAA**, then **"Front"** — it reads F1. F1 rows render.
  3. Uncheck it.
  4. Wait until every CAA cell has its count.
  5. Click 📊 again — **"Front" reads F2 > F1**. Click it.
* **Prediction if real:** **F1 rows** (a replay).
* **If sound:** F2 rows.

### L4b — §3.1 H5: plain global filter vs. CAA image types, multi-table (no throttle)

* **URL:** same as L1.
* **Steps:**
  1. Show-all, expand both sub-sections, and wait until every **CAA** cell shows
     its image-count number.
  2. Click 📊 on **CAA** → **"CAA info - Type"**. Note a type that exists but
     whose word appears nowhere else on those rows, e.g. **"Booklet" (B)** or
     **"Back" (K)**. Close the dropdown.
  3. Type that word into the **global** filter, with **Rx unticked**, and count
     rows.
  4. Tick **Rx**, same word, and count again.
* **Prediction if real:** step 3 renders **0 rows** (or only rows where the word
  happens to be visible text); step 4 renders **B rows**.
* **If sound:** both steps render the same number, ≥ B.

### L5 — §3.2 ⏱ millisecond Length toggle (no throttle)

* **URL:** <https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897>
  — "Born to Run", 8 tracks. "Enable millisecond track lengths" must be on (the
  default).
* **Control:**
  1. Click **Show all Tracks for Release**.
  2. Click **▶⏱** in the Length header. Cells now read `4:50.160`, `3:11.666`, …
  3. Click into the **Length** column filter and type `.`. Expect **8 rows**.
* **Trigger A (seconds → ms):**
  1. Reload and Show-all.
  2. Type `.` into the Length filter. Expect **0 rows**, since seconds text has
     no `.`.
  3. Click **▶⏱**.
* **Prediction if real:** **still 0 rows**. The replayed row list is empty, and
  `_cachedColText()` still returns `3:12`.
* **If sound:** 8 rows.
* **Trigger B (ms → seconds), from a fresh reload:** do not chain it onto
  Trigger A. If A's bug is real, the row-text cache already holds seconds text,
  and B's own precondition fails.
  1. Reload, Show-all, click **▶⏱** before typing anything.
  2. Type `.666`. Expect **1 row** (A2, `3:11.666`).
  3. Click **▼⏱**.
* **Prediction if real:** **still 1 row**, now displaying `3:12`.
* **If sound:** 0 rows.

### L6 — §3.3 + §3.7 Release events / Release country (L0 throttle only; the IDB setting does not matter)

* **URL (candidate):**
  <https://musicbrainz.org/label/0b805b9c-ea03-4fc1-b50d-6dcef76433e0/relationships>.
  If the control run shows no populated **Release country** cells, this label
  is the wrong candidate. Any `place/<id>/performances` or
  `label/<id>/relationships` page whose Release events cells fill will do.
* **Control:**
  1. Click **Show all Relationships for Label** and wait for the **Release
     events** cells to fill.
  2. Click 📊 on **Release country** and pick a value, e.g. `US (n)`. That is the
     needle. Uncheck it and close the dropdown.
  3. Click into the Release country filter and type the needle. Expect **n
     rows**.
* **Trigger:**
  1. Reload with the throttle on and click Show-all.
  2. **Before** the Release events cells fill, type the needle. Expect **0 rows**.
  3. Wait until the cells fill.
  4. Clear the filter with its ✕ and type the needle again.
* **Prediction if real:** **0 rows**, while 📊 on Release country shows `US (n)`.
* **If sound:** n rows.

### L7 — §3.4 area-flag Locality → Region (needs "MusicBrainz: More Flags Everywhere" enabled)

* **URL:** <https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events>
  — 4174 rows, so it is slow. Any events page with UK/US/CA/AU venues works, and
  a smaller artist is quicker.
* **Control:**
  1. Click **Show all Events for Artist** and open 📊 on **Region** right after
     render. Note a UK/US/CA/AU value's count.
  2. Wait ≥ 10 s and reopen 📊. A value whose count **grew** is the needle
     (final count **n**).
* **Trigger:**
  1. Reload and Show-all.
  2. Within ~2 s of render, type the needle into the **Region** filter. **r1**
     rows render.
  3. Wait 10 s.
  4. Clear with ✕ and type the needle again.
* **Prediction if real:** **r1 rows**, while 📊 on Region shows n > r1.
* **If sound:** n rows.
* **Provisional:** the needle and the timing window are confirmed when §3.4's
  code is read.

### L8 — §3.8 cell collapse/expand (no throttle)

* **URL:** same as L1. Its sub-tables carry `▶N▤` multi-row toggles.
* **Trigger:**
  1. Show-all and expand the sub-sections.
  2. Pick a column whose header shows a `▶N▤` count. Click its 📊, then
     **"▶ collapsed multi-row cells (K)"**. Expect **K rows**.
  3. Click the same entry again to uncheck it.
  4. Click one cell's own `▶N▤` toggle so that cell shows all its items.
  5. Reopen 📊. It should now read **"▶ collapsed multi-row cells (K−1)"** and
     **"◀ expanded multi-row cells (1)"**.
  6. Click **"▶ collapsed multi-row cells"**.
* **Prediction if real:** **K rows**, including the cell you just expanded (a
  replay).
* **If sound:** K−1 rows.

### L9 — no live pre-test

* **§3.5 Picard:** a code check that `getCleanColumnText()` on
  `td.mb-picard-cell` is still `''`, and that the column has no filter input and
  no 📊.
* **§3.6 live-date flags:** a code check that nothing re-runs
  `applyExtractTrackTitleData()` after render (see §3.6).
