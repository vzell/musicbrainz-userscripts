<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Deferred columns: Picard and Relationships

## Picard column: collapsed by default, and the four traps in that

The `Picard` column (grep `initPicardTaggerColumn`) is added per TABLE, purely
from the data — "does this tbody contain a `/release/<mbid>` link" — and is
page-type-agnostic. Since 9.99.1057 it renders COLLAPSED by default: the `<th>`
and every `<td class="mb-picard-cell">` always exist, and only the cell
CONTENT is deferred behind a per-table `▶♪`/`▼♪` header toggle.
`sa_picard_tagger_initially_collapsed` (default `true`) decides the STARTING
state only; `sa_enable_picard_tagger` is still the master gate.

**The `<td>` must never be removed.** Deferring content, not the column, is the
whole reason this was buildable at all — `PERFORMANCE.org` Step 32 rejected
runtime column insertion/removal because the column COUNT is what every index
in the script churns off (`data-col-idx`, sort state, the sticky index, the
per-`colIndex` `_uniqDropDataCache`/`_colHeaderCountsCache`, the
colon-alignment descriptors, saved widths). With the cell always present none
of them move and `addColumnFilterRow()`'s ghost-cell self-healing still runs
exactly once. A cell also keeps `applyStickyColumn()`'s `data-mb-rest-bg`
stamp, so uncollapsing needs no sticky re-run.

**The state is stored explicitly on `<table>.dataset.mbPicardExpanded`, and
must not be inferred from cell content.** `data-mb-ms-shown` /
`_msLengthPrecisionShown()` look like the precedent to copy and are the wrong
model here: for Picard "no content" is ambiguous, because a collapsed cell and
an "expanded, nothing to tag" cell are byte-identical.
`tests/snapshots/notes-received/rendered.html` is the counter-example, with
**1688** `mb-picard-cell` behind only **8** `mb-picard-btn`. The `<table>` is
the right host (`data-picard-th-injected` is the existing precedent on the same
element) because `renderGroupedTable()`'s reuse branch replaces the `<tbody>`'s
contents but never the `<table>`, its `dataset` or its `<thead>`.

**The header glyph comes from CSS `::before`, never from text.** The Picard
`<th>` is the one header in the file with no `.mb-col-hdr-flex`, no
`dataset.colName`, no sort icons and no 📊 — `makeTableSortableUnified()`
always runs BEFORE Picard injects, so it never sees this header (and now skips
it explicitly, in case a second full render ever does). That means
`_cleanColHeaderText()` resolves it through its step-3 clone-and-strip
fallback, i.e. ultimately from `th.textContent`, and a text glyph would make
that read `"▶♪Picard"` — silently breaking `initCollapsableColumns`' column
lookup (the multi-row Picard cells would lose their per-cell toggles),
`_exportCleanHeaderText`, `openUniqDrop`'s `isCollapsableCol` and
`_updateAllColHeaderCounts`. Same argument as the length-mismatch flag being
attributes-only. Two corollaries: do NOT set `th.dataset.colName = 'Picard'`
to "fix" the lookup instead (it flips this `<th>` from original to extracted in
three Statistics-panel heuristics), and do NOT name the toggle
`.mb-col-collapse-hdr-btn` or `.mb-caa-col-hdr-btn` — `initCollapsableColumns`'
idempotent cleanup removes both table-wide and `initPicardTaggerColumn` re-runs
it, so the toggle would delete itself on the pass that built it.

**The toggle mutates cells in place; it must not call `runFilter()`.** The ⏱
millisecond toggle has to, because the Length column's rendered TEXT is what
sorting, filtering, highlighting and the colon-alignment finalizers read. A
Picard cell contributes to none of that — its content is a `<button>` plus an
`<img alt="♪">`, so `getCleanColumnText()` was always `''` for the whole
column, and it has no filter input and is never a sort key. `runFilter()` is
also page-wide, which would defeat the per-table scope outright. Both toggle
directions mirror onto the master rows via `_buildMasterRowIndex()` plus the
owner-array sweep — not as a last line of defence (`_picardApplyToRow()`
reconciles every clone against its table's state on the next pass regardless),
but so masters and live rows never disagree and so a collapsed column's
re-renders stop cloning `<ul><li><button><img>` subtrees only to discard them.

Two smaller things worth knowing:

- **Collapsable-column registration happens on EXPAND, not only during the
  render pass.** While collapsed nothing is multi-row, so
  `initPicardTaggerColumn()`'s own `_anyMultiRowPicardCell` never gets set;
  `_picardToggleTable()` calls `_picardRegisterCollapsableColumn()` itself, or a
  multi-button cell would come back with no per-cell `▶N▤` toggle.
- **The uniq-dropdown cache drop is gated on a row having actually changed.**
  `initPicardTaggerColumn` used to call
  `_invalidateUniqDropDataCacheForTable(table)` unconditionally on every pass,
  which also drops `_colHeaderCountsCache`. A collapsed column changes nothing,
  so it no longer drops either. Do not retrofit that gate onto the expanded
  path — there every pass really does rebuild every cell, which is the case the
  helper's JSDoc exists for.

**A release's own tracklist has no Picard column**, and that trips people up
when picking a test page: `release-tracks` rows link `/recording/<mbid>`, and
the guard asks for `/release/<mbid>`. `org/picard.org` named a release URL as
the single-table verification target on that assumption and it was wrong —
`series-releases` is the single-table pageType that carries the column
(`tests/snapshots/series-releases/rendered.html`, 12 `mb-picard-btn` in one
table), and it is what `tests/live/picard-header-toggle.spec.js` uses.

**The toggle state does not travel to a sub-table opened in its own tab.**
`captureSubtableSnapshot` strips both `mb-picard-th` and `mb-picard-cell`, so
the destination rebuilds the column and applies its own default.
`__saTest.picardEntityScans()` exposes how many times
`_picardExtractRowEntities()` has run, because the gate's effect is otherwise
invisible in the DOM.

## Relationships column: collapsed by THRESHOLD, and what that costs

Since 9.99.1060 the injected `Relationships` column defers the same way Picard
does — `<th>` and every `td.mb-rel-cell` always exist, only the CELL CONTENT
waits, behind a per-table `▶🔗`/`▼🔗` toggle plus a multi-table-only
`#mb-rel-col-hdr-toggle-all-btn`. Read the Picard section above first; this one
records only what differs, and everything below is a difference that bit.

**What defers is the NETWORK.** `_initRelationshipsColumnImpl()` issues one
WS/2 request per distinct MBID with a hard-coded 1100 ms sleep between them, and
unique-MBID count ≈ row count on all 26 pageTypes declaring
`injectedColumns: ['Relationships']` — Bob Dylan's 2301-release page cost ~42
minutes of trickling requests from the render tail. So the measurement for
anything here is a REQUEST COUNT, not a latency ratio, and
`tests/fixtures/rel-column-collapse-toggle.spec.js` intercepts `**/ws/2/**` to
assert it exactly.

**The default is a THRESHOLD (`sa_rel_collapse_threshold`, 200 distinct
entities, `0` = never), not a flat "collapsed", and that is not a preference.**
A Picard cell contributed `''` to filtering, sorting and 📊, so hiding it cost
the user nothing. A rel cell is a first-class filter participant — its
`display:none` `.mb-rel-filter-key` spans feed `getCleanColumnText()`,
`_highlightRelCellIcons()`, `openUniqDrop()`'s `isRelCellCol`/`relIconCounts`
and the `rel:<domainKey>` structure modes — so collapsing removes searchable
content. Affordable at 2301 entities, pointless at 12. **Sorting is unaffected
either way**: `_sortCellText()` already returned `''` for every rel cell, since
`getCleanVisibleText()` FILTER_REJECTs that span and the icons are `<img>`.
Read the setting explicitly (`typeof === 'number' && >= 0`), never `|| 200` —
that is the `sa_render_threshold` falsy-zero defect this file documents.

**The Phase-2 queue is FIRE-AND-FORGET, and `_relColumnActivePromise` does NOT
cover it.** `_initRelationshipsColumnImpl()` resolves as soon as *Phase 1*
does, while the queue is still trickling one request per 1100 ms — so a later
call starts a *second* pass beside the first. Do not re-derive "passes cannot
overlap" from the re-entrancy guard's existence; that mistake shipped the
multiplying-icons bug (5 copies of one URL in
`debug/relationships-multiplying.html`, see `DEBUG-NOTES.md` 2026-09-11). Two
guards prevent it, and a third makes it harmless:

- **`_relCellWritable()` refuses to write into a table whose column is
  collapsed.** This is the actual fix — the only one of the three whose removal
  fails a test. Applied inside `_populateCells()` so Phase 1's IDB hits and
  Phase 2's network answers both go through it. A DETACHED cell is deliberately
  writable (`_srcCells` then carries content to the masters).
- **`_relQueueStillWants()`'s `!relDone` check** stops a second queue
  re-answering an mbid the first already wrote. Its pre-sleep placement is a
  cost win only (a superseded queue drains at microtask speed instead of
  holding a ~40-minute timer chain); the post-sleep check is what prevents the
  request.
- **`_populateCells()` is idempotent** (`td.textContent = ''` — it replaces,
  `_relAppendIcon()` appends). Defence in depth, not the fix, and labelled that
  way in the code. Keep it: the other two make overlap unreachable, this makes
  it harmless, and Phase 1 has no `relDone` guard in front of it.

*Rejected, with reasons, so it is not re-proposed:* a cancellation epoch bumped
on every toggle (it would cancel a DIFFERENT table's legitimate in-flight
fetch), and `await queue` to make the guard honest (it would serialise tables
and block a re-expand behind a stale queue).

**Three more things any change here must not undo.** Each was a real defect in
the first version, and all three were silent.

- **`initRelationshipsColumn()` COALESCES; it must not go back to "await and
  return".** A table expanded mid-flight is not in the running pass's
  `allCells` snapshot, so the old wrapper would have stranded it empty forever.
  One boolean, not a counter — N callers owe one follow-up. Note this loop is
  about not LOSING work; it is not what prevents doubling (see above).
- **Both `runFilter()` gates go through `_relAnyPendingInExpandedTable()`.** The
  old page-wide `td.mb-rel-cell:not([data-rel-done="1"])` matches a collapsed
  cell forever, so every keystroke would re-read three GM tables and sweep the
  live tbody + `groupedRows` + `allRows`. Its `[data-mbid]` qualifier also fixes
  a pre-existing instance of the same bug — the row-build pass creates the
  `<td>` unconditionally but stamps `data-mbid` only for a row that links a
  release/release-group/work.
- **`_relTableExpanded()` returns `true` WITHOUT stamping when the table has no
  rel cell.** Its callers run on every page, so stamping would put
  `data-mb-rel-expanded` into every rendered table on every pageType, including
  the eleven `tests/snapshots/*/rendered.html` baselines that carry no rel cell.
  That guard is the only reason no baseline gains real MARKUP from this
  change — the nine new CSS selectors still land in every one's `<style>`
  block, since `snapshot.js` strips `<script>` but keeps `<style>`. See
  `tests/snapshots/registry.org`'s "Expected drift" for the exact delta.
- **Collapsing MIRRORS onto the master rows, and here that IS load-bearing**
  (unlike Picard's, which mutation-testing showed was not). Nothing reconciles a
  cloned rel cell against its table's state on a later pass —
  `_stripTransientCellState()` has no `.mb-rel-*` arm and never touches
  `relDone` — so a collapse that left the masters populated has every icon
  reappear on the next keystroke. Test it on a **multi**-table page:
  `renderFinalTable()` MOVES rows, so on a single-table initial render the live
  row IS the master and the mirror is untestable there.

**Collapsing keeps both caches** (`_relWs2Cache` and the `rel-ws2` IDB store),
which is what makes re-expanding cost zero requests. Only `_relRetryMbids()`
evicts. **A table restored from a 1.1 snapshot starts EXPANDED** regardless of
the threshold — its icons are already in the file. The converse matters when
re-capturing: saving a collapsed page writes empty rel cells, and
`tests/fixtures/saved-data/artist-releases-bodeans.json.gz` is the one committed
fixture carrying real relationship data (56 populated cells that
`tests/live/artist-releases-filter-sort.spec.js` counts on).

**`#mb-info-display-rel` publishes `🔗Rels: collapsed`**, so
`waitForRelationshipsComplete()` still resolves on the shipped default — read
its TEXT, not just visibility, if you need to know which happened. Publishing it
needs `_relPublishCollapsedStatus()` called from **both** the impl and just
after each status reset: `startFetchingProcess()`'s status block clears that
element synchronously AFTER the render tail already called us, so an inline
publish is wiped (measured — the first version came back empty).

**`_relInitColHeaderToggles()` must be called from every render path and NOT
from inside the fetch impl.** The impl is gated on there being something to
fetch, so on a settled page it does not run — which is exactly when
`renderGroupedTable()` has just rebuilt every `<thead>` from a clone.

**`__saTest.relInitRuns()` / `relTableStates()`** exist because none of this is
visible in the DOM: a collapsed rel cell is byte-identical whether a pass ran
and found nothing or never ran.

Two smaller notes. Unlike Picard's, this `<th>` carries `dataset.colName` and
gets a real `.mb-col-hdr-flex` from `makeTableSortableUnified()`, so the toggle
prepends into that flex like `.mb-caa-col-hdr-btn`/`.mb-ms-col-hdr-btn` and the
text-glyph hazard does not apply (CSS `::before` is used anyway, so
`aria-pressed` stays the single state representation). And do NOT name the
toggle `.mb-caa-col-hdr-btn` or `.mb-col-collapse-hdr-btn` — same
`initCollapsableColumns()` self-deletion trap as Picard's.

### Batched source + per-row load states (9.99.1101-9.99.1108)

**Shipped 2026-09-18.** Plan, probe results and the perf gate: `PERFORMANCE.org`
Step 36. Decisions and the mockup: `org/relationships.org`'s 2026-09-15 answer.

What shipped. None of it relaxes a guard listed above:

- **A failure is its own outcome.** `_relFetchWs2()` resolves
  `{outcome: 'ok'|'error', data, detail}`, retries through `_ws2GetJson()`
  (shared with the ⏱ batch source), never caches an error, and every request
  waits on one rate gate, `_relAwaitRateSlot()`.
- **CSS-only per-cell load-state glyphs, and click-to-load ONE row** — also in a
  COLLAPSED table: 🔗︎ not loaded, ⋯ queued, ◌ loading, – none, ⚠︎ failed,
  hover ⟳ reload. `sa_rel_cell_state_glyphs` turns both off. The writers are
  module-level — `_relWriteResult()`, `_relWriteFailure()`,
  `_relMasterCellsFor()` — shared by the bulk pass and `_relLoadRow()`. The
  click and hover delegates are installed by `_relEnsureHdrDelegate()`.

- **A browse-endpoint bulk source** on the seven pageTypes that passed
  `scripts/probe-rel-batch-endpoints.py` (search results carry no `relations`;
  browse matched lookups exactly). Declared per pageType as
  `features.relBrowse: { entity, by }` and resolved by `_relBrowseSource()`,
  which requires BOTH that the URL's own entity is `by` and that the TABLE's
  entity type is `entity`. The impl's browse phase runs ahead of the per-row
  queue; kill switch `sa_rel_browse_batch_enable`.

- **A `done/total` badge on the ▶🔗/▼🔗 toggle** — CSS `::after { content:
  attr(data-rel-progress) }`, set by `_relUpdateColHdrBtn()` from
  `_relTableProgress()` (distinct entities done / total / failed) only while
  something is unloaded. Both cell writers call `_relScheduleProgressRefresh()`,
  coalesced to one refresh per animation frame per table.
- **A 📊 "Relationships - Load state" section** (`relLoadState`): four fixed
  `rel-state-*` modes — pending / has / none / error — whose counts and whose
  `_cellMatchesStructureMode()` branch both go through ONE classifier,
  `_relCellLoadState()`, so a count and the rows its entry filters to cannot
  disagree. Offered on a collapsed column too.

**The perf gate passed before the merge, and its question was narrow**: a
collapsed column now paints a CSS glyph into every pending cell, and Step 35 had
measured a collapsed column as free. It still is — every `collapsed` ratio sits
inside the noise its own metric shows on the `absent` arm, where both trees run
identical code (2026-09-15, `vzell-lap`, four arms in one session, median of 5).
What it does NOT cover: these are filter, sort and dropdown latencies, so no
claim is made about scrolling or first paint. The `expanded` arm never ran — the
harness's own icon-floor guard aborted it on `main` too, over an unrelated
9.99.1086 defect (`PERFORMANCE.org` Step 36, DEBUG-NOTES 2026-09-16).

The traps. Every one of them fails silently:

- **inc parity.** A browse request must ask for
  exactly `_relIncOptionsForEntityType(entityType)`. Browse answers are cached
  under the lookup's own ckey, so a record missing `release-group-rels` would be
  served as complete forever after, showing fewer icons than a lookup would.
- **The browse source trusts the table's entity stamp.** Until 9.99.1092,
  `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` ran its work/label
  sniff before its release/release-group scan, so every release listing with a
  "Label" column and no entityFeatures map was stamped `label`: the resolver
  refused all of them and, live, each release was looked up as a label (a 404
  per row). Keep the release scan FIRST in that function. Specs that answer
  every `**/ws/2/**` URL with a relationship cannot see this class of bug — pin
  the request's entity segment, as `rel-column-release-listing-entity.spec.js`
  does.
- **A transport failure is not "no relationships".** Before this branch, a 503
  was stamped `relDone` exactly like an entity with zero relationships, and the
  `null` stayed in `_relWs2Cache` for the session. Cache only a successful
  answer — the millisecond feature's lesson, verbatim.
- **A failed or loading cell is skipped in three places** —
  `_relAnyPendingInExpandedTable()`, the impl's candidate scan, and
  `_relQueueStillWants()` — or every filter keystroke re-requests every failure.
  The scan's and `_relQueueStillWants()`'s exclusions cover for each other, so a
  spec can only pin them as a PAIR; the mutation files under
  `scripts/mutations/` record that as `"expect": "pass"` entries.
- **`_relLoadRow()` must not reuse `_relCellWritable()`.** That guard exists to
  refuse collapsed tables, which is exactly where a click has to write. A click
  writes only into cells, live AND master, that still carry its own
  `data-rel-loading` token. `_relToggleTable()`'s collapse clears the token, so
  a late answer for an emptied column is dropped. A per-cell question, not the
  rejected per-table epoch.
- **When the clicked row is filtered out mid-flight, render into a master.**
  With no live cell, `_relWriteResult()` uses the first master as its primary.
  Mirroring an empty `innerHTML` over the masters instead would bring the row
  back marked done with no icons.
- **A partly loaded snapshot must not restore as expanded.**
  `_relTableExpanded()` defaults to expanded only when EVERY rel cell is done;
  a partly populated table goes by the threshold, or one hand-loaded row turns
  into a queued fetch of every other row when the snapshot is reopened.
- **Progress never goes to `#mb-info-display-rel`.**
  `waitForRelationshipsComplete()` resolves on that element's VISIBILITY, so
  live progress there would let every test settle early. `_relLoadRow()` never
  touches it.
- **The glyph is `::before`/`::after`, never text**, so `getCleanColumnText()`,
  the icon-count sort, 📊, export and Save-to-Disk (`innerHTML`) cannot see it.
  `td.mb-rel-cell` sets `font-size: 0; line-height: 0`, so each pseudo-element
  sizes itself. The stylesheet, `#mb-rel-cell-glyph-style`, is injected only
  while the setting is on. **Never gate it with a class on `<html>`**: the
  snapshot harness serializes the whole `documentElement`, so a page-level class
  drifts every rendered baseline, including pageTypes with no Relationships
  column at all.
- **The progress badge is `attr()`, never header text**, for the same reason
  as the toggle's own glyph: this `<th>`'s text feeds `colName` derivation,
  export and the 📊 dropdown. And its refresh is also where the table's 📊
  cache is dropped after every write — the cache's signature is the visible
  row set, which a write does not change, so a dropdown reopened mid-fetch
  would otherwise show stale load-state counts. `_relLoadRow()` drops it too,
  which is why the spec cannot see a missing per-write drop (recorded as an
  `expect: "pass"` overlap in `scripts/mutations/uniq-drop-rel-load-state.json`).
- **Icon counts for a collapsed column are computed once any cell is loaded.**
  A collapsed column can hold rows loaded by hand, and their icons are as
  filterable as an expanded column's; `relIconCounts` used to be skipped
  whenever the column was collapsed.

## The automatic retry pass, and why it is bounded four ways

`org/503-handling.org` item 7 — the only change in that file that makes the
script talk to the network without the user asking, which is why it is bounded
on four independent axes and ANY ONE of them stopping it is enough:

1. **It starts only after the Phase-2 queue drains**, plus
   `_REL_AUTO_RETRY_DELAY_MS` (30 s), so it can never compete with the first
   load for the rate gate.
2. **`_REL_AUTO_RETRY_MAX_PASSES` (2) per page.** Reset per run by
   `_relAutoRetryReset()`, so a fresh page gets its own budget.
3. **It does not start above `_relAutoRetryMaxFailed()`** (setting
   `sa_rel_auto_retry_max_failed`, default 25). That many is an outage, and an
   automatic retry of an outage is the hammering the org file refuses to
   propose. **Read with `typeof === 'number' && >= 0`, never `|| 25`** — `0`
   disables it and is meaningful, and the falsy-zero read is the defect
   CLAUDE.md already records for `sa_render_threshold`.
4. **`_REL_AUTO_RETRY_BREAK_AFTER` (5) CONSECUTIVE refusals abort the pass
   mid-flight**, through `_relQueueStillWants()` — which already drains a
   superseded pass with no requests at all, so the breaker needed no new
   mechanism. Consecutive and not cumulative on purpose: a pass mostly
   succeeding with the odd refusal is the case the feature exists for.

**`_relAutoRetry.active` is closed at the drain, before scheduling.** A pass
that has just finished must not count a LATER pass's outcomes into its own
breaker.

Covered by `tests/fixtures/rel-auto-retry-failed.spec.js`; mutation list
`scripts/mutations/rel-auto-retry-failed.json`, 8 entries with one honest
`expect: "pass"` — no test here can tell consecutive from cumulative counting,
because a retry pass only asks about entities that already failed, so either
all of its requests fail or none does.

**Two test traps this cost, both worth knowing.** A second page load leaves the
`rel-ws2` IDB store populated and IDB **survives a reload**, so entities
answered before the reload are served from cache and never fail — pick the
victims in the route on first sight instead. And after the breaker trips, a
fixed `waitForTimeout()` bounds the request count by the WAIT (~1 request per
1.1 s) rather than by the pass, so an unguarded pass looks identical to an
aborted one; settle the request log instead. Mutation-testing caught the second.

**It is the slowest fixture spec in the repo — ~324 s on `NB-3641`
(2026-09-20, `--workers=1`), ~295 s on `petri` (2026-09-23, nine runs across
three versions, flat)** — four times the previous worst, and that is the rate
gate rather than slow code.

**It is also the whole suite's critical path, and costs the same inside a
parallel run as alone.** `playwright.config.js` sets `fullyParallel: false`, so
its 7 tests run serially in ONE worker: measured 296.9 s in-suite against
294.5 s standalone, with the suite finishing 1.5 s after it. Anything that
makes this file longer moves `test:full` by the same amount. Do not repeat the
retracted claim that its tests "spread across workers" — see
`tests/MEASUREMENTS.org`'s "where the `test:full` step actually is".

## Relationships retry: two buttons, two intentions

`org/503-handling.org` F7. `#mb-rel-retry-{i}` / `#mb-rel-retry-global` still
reload EVERYTHING; `#mb-rel-retry-failed` (one page-wide control, `⚠⟳ N`)
recovers only what failed. **Keep both** — "force a refetch of a table I believe
is stale" and "recover the failures" are different intentions, and a mutation
exists for the plausible future simplification that collapses them.

- **The failed set reads the captured SOURCE rows, not just the live DOM**
  (`_relFailedMbidsPageWide()`). `runFilter()` REMOVES non-matching rows, so a
  live-DOM tally loses exactly the failures a filter is hiding. An earlier draft
  kept the control present but DIMMED at zero instead of absent, thinking that
  answered the trap: it did not — a filter still dimmed it into uselessness.
  The control is absent at zero, which is safe only BECAUSE the count is
  filter-proof.
- **There is now one per table AND one page-wide**, the same split the global
  and per-table `🔗⟳` already have — "recover everything" and "recover what
  failed in THIS table" are different intentions. It was page-wide only until
  9.99.1128, on the grounds that scoping needed "a table → source-rows mapping
  this file says is unreliable". **That was wrong, and the mapping was already
  in use**: `_tableSourceRows()` now names it, and it is the binding
  `runFilter()`'s own multi-table loop uses (`tables[groupIdx]` over the
  `.mb-col-filter-row` tables) and that `_pendingEditsGroups()` had relied on
  all along. Merged view does not break it — the merge pass CLONES, so
  `groupedRows` stays intact.
- **The per-table counts read SOURCE rows, and the artwork one is THROTTLED,
  not per-frame.** The page-wide artwork count is `ctx.failedCache.size`, O(1),
  which is why it can afford a `requestAnimationFrame`. A per-table count
  cannot be O(1) — it attributes paths to tables, which is a source-row walk,
  **measured at ~5 ms for 4174 rows (`NB-3641`, 2026-09-20)**, about a third of
  a 60 fps frame budget sustained for the whole artwork load. At one walk per
  second it is ~0.5%. Do not "simplify" `_artSchedulePerTableFailedRefresh()`
  into the per-frame path. Settle-only is also wrong: the CAA completion never
  fires on a large listing, so the controls would never appear there at all.
- **No per-table ⚠⟳ on a single table without a global row.** The page-wide
  one anchors after the global ⟳, which only multi-table pages build; without
  it, it falls back to table 0's run, and table 0's per-table ⚠⟳ was its
  identical twin in the same run. `_failedRetrySharesTableSlot()` leaves the
  per-table one out in both halves (CAA and Relationships) when there is one
  table and no global row (`single-table-failed-retry.spec.js`,
  `rel-retry-failed-only.spec.js`, `scripts/mutations/live-multidate-retry-dup.json`).
- **Nothing recomputes the per-table counts after a filter**, because the
  refresh is driven by the enrich pass, which has finished by then. That is
  benign — the counts only change while failures are being recorded — but it
  means a spec that filters and re-reads the buttons proves NOTHING about
  filter-proofness. Mutation-testing caught exactly that: "read the live table
  only" passed against the first version of the test.
  `__saTest.artRefreshPerTableFailed()` forces the real recompute so the
  property can actually be pinned.
- **`_relRetryMbids()` clears markers on the source rows too.** It used to clear
  only the live DOM, so a filtered-out failure kept `data-rel-error` — which the
  impl's candidate scan and `_relQueueStillWants()` both read as "leave alone",
  stranding it permanently. It is now merely pending and loads when it returns
  to view. **What is NOT guaranteed: it is not re-fetched while off screen**,
  because the candidate scan is live-DOM-based. The spec pins the recovery, not
  an immediate fetch.
- **Do NOT hook the repaint into `_relScheduleProgressRefresh()`.** It is
  redundant — `_relCreateRetryButtons()` runs when the Phase-2 queue drains,
  i.e. once every failure has settled, and ends by calling the refresh — and it
  is expensive, since `_relFailedMbidsPageWide()` walks every source row, so a
  per-frame call is thousands of `querySelectorAll()`s per frame on a big page.
  Mutation-testing is what found the redundancy.
- **`_relRetryAnchorFor()` resolves its heading with `caaFindHeaderForTable()`,
  never a `previousElementSibling` walk, and anchors on that heading's own
  control run via `_hdrCtlAnchor()`, never `button:last-of-type`.** Both halves
  replaced a rule that was wrong in a different way, and each had its own
  silent symptom:
  - **The sibling walk never left a wrapper.** MusicBrainz nests many listings'
    `table.tbl` inside `<form action="/<entity>/merge_queue…"><nav></nav>` (works,
    events, user edits) or a plain `<div>` (notes-received,
    recording-fingerprints), so the walk ran out of siblings inside the wrapper,
    returned `null`, and `_relCreateRetryButtons()`'s `if (sb && a)` dropped the
    built button on the floor — taking `⚠⟳` with it, since both failed-retry
    controls anchor on `#mb-rel-retry-{i}` / `#mb-rel-retry-0`. Measured on
    `debug/artist-works-pending-edits-uncollapsed.html` at 9.99.1130: 5
    `td.mb-rel-cell`, zero `mb-rel-retry-*`. `caaFindHeaderForTable()` is
    document-order (`findH3ForTable()`, then the last `<h2>` preceding the
    table), so wrapper nesting stops mattering; it is the same resolver
    `_artCreateOrUpdateToggleButton()` already used.
  - **`button:last-of-type` matched the wrong button.** It means "the first
    `<button>` in document order that is the last `<button>` among ITS OWN
    parent's children" — not "the heading's last button". On an `<h3>` carrying
    a sub-table filter it resolves to `#mb-stf-<col>-clear`, several levels deep,
    so the control was inserted INSIDE `span.mb-stf-input-wrap`. Measured on
    `debug/right-flags-release-events.html` (place-performances, 2026-09-18): 4
    of 5 sub-tables, the exception being the one sub-table that had artwork and
    so took the `_art` branch instead.
  - **The multi-table `<h2>` guard stays.** There the `<h2>` is the page heading
    and belongs to `#mb-rel-retry-global`; only an `<h3>` may own a per-table
    control. On a SINGLE-table page the `<h2>` is this table's only heading —
    before 9.99.1121 the walk stopped there and returned `null` too, which is
    why no spec had ever seen these buttons: `FIXTURE_SETTINGS_OVERRIDE` forces
    `sa_enable_caa_pics` off, so every single-table fixture took the null path.
  - **The gate is `_relTableHasColumn(table)`, per TABLE, not
    `_relPageHasColumn()`.** Both creation sites — the loop in
    `_relCreateRetryButtons()` and the block inside
    `_artCreateOrUpdateRetryButton()` — asked the PAGE-wide question, so on a
    page whose sub-tables differ, every sub-table got a `🔗⟳` for a column it
    does not have. `place-performances` groups by relationship type, so one page
    mixes recording-targeted sub-tables (column stripped by
    `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()`) with
    release-targeted ones: `debug/place-performances-bug.html` (2026-09-21) has
    4 strays of 5. **`_relTableHasColumn()` asks the `<thead>` first, and that
    is the load-bearing half** — `runFilter()` REMOVES non-matching rows, so a
    tbody-only test reports "no column" for a sub-table a filter has narrowed to
    nothing, and these callers do not re-run on a keystroke. A sweep alongside
    the loop drops a stray left by the other site, matched on
    `/^mb-rel-retry-(\d+)$/` — **the numeric form only**, since
    `mb-rel-retry-global` and `mb-rel-retry-failed` share the prefix and are not
    per-table.
  - **Every `mb-rel-retry-{i}` in every saved snapshot was built by the `_art`
    branch**, i.e. by `_artCreateOrUpdateRetryButton()` anchoring on the artwork
    run. That is why both defects survived: the fallback had essentially never
    produced a correctly placed control, and the spec that names
    `#mb-rel-retry-0` asserts EXISTENCE. On `series-releases` with artwork off
    it existed, inside `#mb-filter-container`, and the spec was green. **Assert
    the parent element, not the id's presence.**

Where the controls LAND is covered separately, by
`tests/fixtures/rel-retry-anchor-placement.spec.js` (mutation list
`scripts/mutations/rel-retry-anchor-placement.json`), on the new
`tests/fixtures/artist-works-pending-edits.html` fixture — which keeps the
real `<form>` wrapper that `artist-works-attributes.html` drops, and is the
reason the missing-control half is reproducible at all.

What they DO is covered by `tests/fixtures/rel-retry-failed-only.spec.js`;
mutation list
`scripts/mutations/rel-retry-failed-only.json`, which carries one honest
`expect: "pass"` — the done-wins rule needs a fixture listing the same entity
twice, and no committed fixture has one. `__saTest.relFailedMbids()` exists
because the set has no DOM surface once a filter has removed its rows, and the
button's label is repainted only on a cell write, so asserting the label alone
measures "the button was not repainted" instead.

## Recording of column: two columns after "Name", loaded only on request

`features.recordingOf` (artist-recordings) adds "Recording of" and
"Performance attributes" — what Michael Wiencek's batch-add "performance of"
userscript writes under each recording title, as two real columns. The code
is the `_recOf*` family just above the Relationships section;
`buildActiveRecordingOfColumns()` gates it (`sa_enable_recording_of_column`).
Show only: no edit is ever submitted. API facts (browse parity, 74 567
recordings for Springsteen, only `performance` relations, search carries no
relations): `scripts/probe-recording-work-rels.py`, `tests/MEASUREMENTS.org`.

**They are the only injected columns that are not appended.** Every other
injected column goes at the row END, which is what lets the ⏱/Relationships
code say "nothing they drop can shift Length". These two are INSERTED after
"Name", and three things keep that from misplacing positional work:
- `_recOfInsertCells()` runs in each of the three row-assembly sites BEFORE
  `applyIntegerColumnStyling()`, not after;
- `_finalColNames` splices the two names in after "Name", so every
  integer-column `colIdx` (styling, `finalizeSplitAlignedColumns()`,
  `finalizeRLCColumnWidths()`, `_repairTreleasesTd()`) is resolved against
  the final layout;
- `_recOfInjectHeaders()` inserts the `<th>`s after the "Name" `<th>` in
  `cleanupHeaders()`.
The audit that found the post-render `colIdx` readers is in DEBUG-NOTES
(2026-10-10). Inserting after styling instead "works" for the inserted cells
and silently moves Length's colon alignment two columns left — pinned by
`recording-of-column.spec.js` "Length keeps its integer-column styling".
Anything new that reads a pre-render `colIdx` after assembly must count them.

**No collapse state, unlike Relationships.** Nothing loads until asked: a
cell's 🎼 loads one row (`_recOfLoadRow()`), the header's ▶🎼 every row
(`_recOfLoadAll()`); ▼🎼 only means "nothing left". A loaded cell stays
loaded. That removes the whole collapsed-table writability problem the
Relationships section above spends most of its length on.

**State lives on the cell** (`data-recof`: absent = not asked, `queued`,
`loading`, `has`, `suggested`, `none`, `error`), glyphs are CSS (only while
`sa_recording_of_cell_state_glyphs` is on), and ONE classifier,
`_recOfCellLoadState()`, feeds both the 📊 "Recording of - Load state" counts
and its `recof-state-*` matcher. Writes go to live AND master cells through
`_recOfCellIndex()` (live tables plus `_msSourceRows()`, merged by a Set — on
a single-table first render they are the same cells).

**Cost choice.** `_recOfLoadAllOnce()`: memory, IndexedDB (`recof-ws2`, key
`recording:<mbid>|work-rels` so it can never collide with `rel-ws2`), then
ONE browse page of the artist's recordings — it answers up to 100 rows and
returns `recording-count` — then whichever is cheaper for the rest: more
browse pages (`pagesLeft`) or one lookup per remaining row (`wanted.size`).
Worst case one extra request. Every request waits on the shared
`_relAwaitRateSlot()`, retries through `_ws2GetJson()`, and only a
SUCCESSFUL answer is cached (404 = "no work", a 503 = ⚠).

**The pending count is cached, and must count loading rows.**
`_recOfUpdateHdrBtns()` runs on every render tail (it is called with
`_relInitColHeaderToggles()`), so it reads `_recOf.pendingCount`, dropped
only by a write, a mark or a new fetch — never a row walk per keystroke.
`_recOfPending(…, withLoading)`: a loader must not re-ask for a row being
loaded, but the COUNT must include it, and "pressed" also requires no job
running — otherwise ▼🎼 appears while the last lookup is still waiting for
its rate slot (found by `recording-of-column.spec.js` "batching off", which
read the request log one request early).

**Write path** (`_recOfApply()` + `_recOfScheduleRefresh()`): drop the row's
`_rowTextCache` on each write; then, throttled (every 2 s while a bulk job
runs, at once for a click and at the job's end), drop the 📊 and filter
result caches, re-run `initCollapsableColumns()` (both columns are in the
pageType's `collapsableColumns`, so a medley gets its ▶2▤ toggle) and
`runFilter()` only when `_anyFilterActive()`.

**Suggestions** (`_recOfSuggestTitle()`), for rows answered "no work": the
batch-add userscript's normalisation (trailing ` (…)` clauses off the
recording title, lower case, no whitespace, typographic → ASCII
punctuation), an exact `Map` lookup first, then the CLOSEST work within
`sa_recording_of_suggest_max_distance_pct` (default 25 %, that script's
0.25). Bounded where that script is not: memoised per DISTINCT normalised
title, a length pre-check skips any work that cannot be within the
threshold, the distance itself exits early, and `_recOfSuggestAll()` yields
every ~8 ms. The work list comes from IndexedDB (`artist-works`), else the
batch-add userscript's own `bpr_works <artist>` localStorage list
(read-only, `sa_recording_of_import_bpr_cache`), else the Web Service.

**Progress card provider** `recof` (`_recOfRegisterProvider()`, registered at
render time — `_ajRegister()` reads consts declared below the init call).
Its `cache` rows show the store, its record count (`onOpen`, throttled to one
count per 5 s), this run's memory/IndexedDB/network split and the work list
with its source and date — "N works … (cached <date>)" as the batch-add
userscript shows it.

Specs: `recording-of-column.spec.js`, `recording-of-suggest.spec.js`,
`recording-of-uniq.spec.js`, `recording-of-third-party.spec.js` (the batch-add
userscript's markup: until this, nothing pinned the `'wiencek'` eraser or the
foreign "Performance Attributes" strip). Fixtures come from
`scripts/build-recording-of-fixture.py` (page, the `-bpr` variant, and
`recording-of-data.json`, which the WS/2 mock in `tests/support/recordingOf.js`
serves). Mutations: `scripts/mutations/recording-of.json`.
