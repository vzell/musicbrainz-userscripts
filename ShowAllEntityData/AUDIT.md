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

As of `d551df6`: **ten** sites drop the uniq-dropdown cache, **four** drop the
filter-result cache (three of which are wholesale resets: fetch start, sort,
disk-load).

Regenerate the map at any time with:

```sh
awk '/^    (async )?function [A-Za-z_]/ { match($0, /function [A-Za-z_0-9]+/); fn=substr($0, RSTART+9, RLENGTH-9) } /_invalidateUniqDropDataCacheForTable\(|_invalidateFilterCache\(|_invalidateFilterCacheForGroups\(/ && !/function _invalidate/ && !/^ *\*/ && !/\/\// { printf "%-6s %-42s %s\n", NR, fn, $0 }' ShowAllEntityData.user.js
```

Result on 2026-09-16 (after both fixes):

| Enclosing function | uniq-drop | filter-result |
|---|---|---|
| `_msApplyLengthPrecision` | yes | **no** |
| `_maybeCorrectAreaFlagRegion` | yes | **no** |
| `initReleaseEventsColumn` (×2) | yes | **no** |
| `initPicardTaggerColumn`, `_picardToggleTable` | yes | **no** (probably correct — see below) |
| `_relLoadRow`, `_relToggleTable`, `_initRelationshipsColumnImpl` | yes | via `_relScheduleProgressRefresh` |
| `_relScheduleProgressRefresh` | yes | **yes** (the `d551df6` fix) |
| `startFetchingProcess`, `makeTableSortableUnified`, `_hydrateAndRenderFromSnapshotData` | — | yes (wholesale) |

---

## 3. What to audit, in priority order

For each: does it mutate text or a sentinel that **filtering, sorting or the 📊
dropdown can read**? If yes, does it drop **both** caches?

### 3.1 CAA/EAA inline artwork — PRIME SUSPECT

`_artSetInlineSortKey()` stamps `.mb-inline-art-sort-key` (`caa-inline-yes` /
`caa-inline-no`) **after each fetch settles**, and `_cellMatchesStructureMode()`'s
`inline-art-yes`/`inline-art-no` modes match exactly that sentinel. This is the
same shape as the Relationships column: asynchronous, per cell, and filterable.

**No `_invalidate*` call appears anywhere in the artwork path** — the grep hits
are all comments. So it looks like *neither* cache is dropped when a late
artwork load flips a cell from "no" to "yes".

Also check the CAA/EAA count badges and the `<ul>` building, and
`_artMirrorIconToSourceRow()` / `_artMirrorInlineThumbToSourceRow()`, which write
to master rows — remember `_rowTextCache` is keyed on the SOURCE row.

### 3.2 Millisecond Length toggle (⏱)

`_msApplyLengthPrecision()` rewrites the Length column's **visible text**, which
is read by filtering, by `getCleanColumnText()`, and by `_compareDurations()` for
sorting. It drops the uniq-dropdown cache (page-wide) and then `runFilter()` is
called. Question: with a column filter or a 📊 value-set active on Length, does
the toggle replay a stale row list? Note the text genuinely changes (`3:12` ↔
`3:11.666`), so membership can change too.

Check both `_msToggleLengthPrecision()` and `_msApplyLengthPrecision()`.

### 3.3 Release events column

`initReleaseEventsColumn()` populates `mb-re-cell` content from WS/2, after
render, and drops the uniq-dropdown cache at two sites. Same question.

### 3.4 `_maybeCorrectAreaFlagRegion`

Rewrites a flag/region in a cell. Confirm whether the rewritten text reaches
`getCleanColumnText()` (i.e. is it inside `_CLEAN_STRIP_SEL`?) and whether a
filter could be active on that column.

### 3.5 Picard column — expected EXEMPT, but verify

`CLAUDE.md` states a Picard cell contributes `''` to filtering, sorting and 📊
(its content is a `<button>` plus an `<img alt="♪">`), which is why its
uniq-only drop is correct rather than an oversight. Verify that is still true
before dismissing it.

### 3.6 Live-date flags

`.mb-live-date-flag`'s glyph **is real cell text** (unlike the length-mismatch
flag, which is attribute-only by design). If anything writes it asynchronously,
it belongs in this audit.

### 3.7 Injected-column extractors / ICE cells

`applyInjectedColumnExtractors()` derives cells from the (asynchronously
populated) Relationships cells. Check whether it runs again after a late rel
write, and what it invalidates.

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
