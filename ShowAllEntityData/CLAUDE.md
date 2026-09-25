# ShowAllEntityData Userscript — Claude Code Guide

## Project overview

`ShowAllEntityData.user.js` is a large single-file Tampermonkey userscript for
MusicBrainz. It consolidates paginated and non-paginated entity table lists into
a single view with real-time multi-column filtering and sorting.

Read the current version from the `// @version` line of the `==UserScript==`
header, and the current size with `wc -l`/`wc -c` — never quote either from
memory or from this file. Same for the changelog: the newest entry in
`ShowAllEntityData_CHANGELOG.json` is the authority on what shipped.

**Changelog:** `ShowAllEntityData_CHANGELOG.json` (JSON, lives alongside the script)
**Help:** `ShowAllEntityData_HELP.md` (MARKDOWN, lives alongside the script — it
is what the ❓ button opens on GitHub; see its own section below)
**Library dependency:** `VZ_MBLibrary.user.js` (external `@require`; provides `Lib.*`)
**External dependencies:** `iro` (colour picker), `pako` (compression)
**Other top-level docs:** `PERFORMANCE.org` (measurements + numbered Steps),
`PAGETYPES-TESTING-REFERENCE.org` (every pageType, its URL, its coverage plan),
`DEBUG-NOTES.md` (dated root-cause log), `REFACTORING.org`, `FORUM.org`

## File structure

Everything lives inside a single IIFE `(function() { 'use strict'; … })()`.
There are no ES modules.

**This inventory carries grep anchors, not line numbers, on purpose.** The file
grows on nearly every commit, so absolute line numbers are stale almost
immediately — a previous version of this table had 21 of 23 rows wrong, several
by more than 6,000 lines, which is worse than having no table at all. Grep the
anchor. The listing order below is the file's own top-to-bottom order, which is
the part that stays true and is what makes it useful for orientation.

| Grep for                                        | What it is                                                                                                                      |
|-------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `// ==UserScript==`                             | Header, then a third-party attribution block (do not edit)                                                                      |
| `const SCRIPT_BASE_NAME`                        | Script constants: `SCRIPT_ID`, remote URLs                                                                                      |
| `const configSchema`                            | Settings-menu definitions (checkboxes, colour pickers, …); by far the largest single block                                      |
| `const Lib = (typeof VZ_MBLibrary`              | Library init, with a fallback stub if the `@require`'d library failed to load                                                   |
| `const ColumnDataExtractor`                     | Named column-extractor registry                                                                                                 |
| `const SyntheticColumnDataExtractor`            | Synthetic-column extractor registry                                                                                             |
| `function buildActiveColumnExtractors`          | First of the `buildActive*` helpers (extractors, erasers, injected columns)                                                     |
| `function applyListToTable`                     | DOM pre-processing; `applyRenameH2ToH3`/`applyRenameH2ToH1`/`applyInsertH2`/`applyInsertPrependH2`/`applyShowAllTags` follow it |
| `function applyExtractTrackTitleData`           | `release-tracks`' bespoke AR pipeline (see its own section below)                                                               |
| `const pageDefinitions = [`                     | One entry per recognised URL pattern                                                                                            |
| `let ctrlMFunctionMap`                          | Declared empty here; populated right after `initBarcodeHighlight()`                                                             |
| `function sortLargeArray`                       | Async row-array sort — defined much earlier than its callers                                                                    |
| `// --- Initialization Logic ---`               | Page-type detection, header location, button injection                                                                          |
| `function runFilter`                            | Real-time filter logic                                                                                                          |
| `function startFetchingProcess`                 | Main fetch-pipeline entry point                                                                                                 |
| `function renderFinalTable`                     | Single-table render (`tableMode: 'single'`)                                                                                     |
| `function renderGroupedTable`                   | Multi-table render (`tableMode: 'multi'`)                                                                                       |
| `function makeH2sCollapsible`                   | Page-level h2 collapse                                                                                                          |
| `function makeTableSortableUnified`             | Column-header sort handlers; delegates to `sortLargeArray()`                                                                    |
| `function initExpandRGsFeature`                 | Release-group expand/collapse                                                                                                   |
| `const CAA_CTX` / `const EAA_CTX`               | Artwork context descriptors                                                                                                     |
| `function initCaaPics` / `function initEaaPics` | Artwork feature entry points                                                                                                    |
| `function initBarcodeHighlight`                 | Barcode highlighting                                                                                                            |

## Page definition anatomy

All supported URL patterns are registered in `const pageDefinitions` (grep
`const pageDefinitions = [`). To count them, count `type:` keys inside that
array — don't carry the number here; `PAGETYPES-TESTING-REFERENCE.org` is the
authority on the pageType roster and its coverage plan. Each entry follows this
shape:

```javascript
{
    type: 'kebab-case-identifier',          // unique string used in debug output
    match: (path, params) => boolean,        // URL matcher — receives pathname + URLSearchParams
    buttons: [
        { label: 'Button label', params: { query_param: 'value' } }
    ],
    features: {
        // DOM pre-processing (applied before fetch, in order):
        renameH2ToH3: true,           // demote native <h2>s inside #content to <h3>
        renameH2ToH1: true,           // promote native <h2>s to <h1> (page has no native h1 at all)
        insertH2: 'Section title',    // inject <h2> after .tabs container
        insertPrependH2: 'Title',     // inject <h2> before first table
        listToTable: ['genres','tags'], // convert <ul id="X"> → <table class="tbl">
        removeSelector: 'css-selector', // remove DOM element after rendering
        showAllTags: true,
        mergeContinuationRows: true,  // fold "<td colspan=N> empty" continuation rows
                                      // into the preceding row as extra <li> rows —
                                      // pair with renderMultiRowCell on the same columns

        // Column pipeline:
        columnExtractors: [ { extractor: 'name', sourceColumn: 'Col', syntheticColumns: ['A','B'] } ],
        syntheticColumnExtractors: [ … ],
        injectedColumns: [ … ],
        injectedColumnExtractors: [ … ],
        columnErasers: [ … ],
        integerColumns: [ … ],
        collapsableColumns: [ … ],
        stickyColumn: 'Column name',
        tooltipColumns: [ … ],
        renderMultiRowCell: [ … ],
        splitCD: true,
        splitLocation: true,
        splitArea: true,
        extractMainColumn: 'Column name',

        // Artwork:
        addCAA: true,
        addEAA: true,
    },
    tableMode: 'single' | 'multi',  // routes to renderFinalTable vs renderGroupedTable
    targetHeader: element | null,   // rarely set explicitly
}
```

**`tableMode: 'single'`** → fetches all pages, accumulates rows, calls `renderFinalTable()`.
**`tableMode: 'multi'`** → fetches grouped data, calls `renderGroupedTable()` which creates
one `<h3>` + `<table class="tbl">` pair per group.

Entity-driven page types (e.g. `series-releases`, `user-ratings-type`,
`collections-releases`) can also carry an `entityFeatures` map, resolved per
`<h2>` heading at fetch time by `resolveEntityFeaturesFromH2()` and merged in
*before* `baseDef.features`/`buttonConfig.features` — see the Render
pipeline section below.

## Render pipeline (`startFetchingProcess` → render)

```
startFetchingProcess(e, buttonConfig, baseDef)
  │
  ├─ resolveEntityFeaturesFromH2(baseDef) → entitySpecificFeatures (entity-
  │     driven page types only; can even override activeDefinition.tableMode
  │     at runtime — e.g. collections-releases' "Release groups" sub-entity
  │     is 'multi' even though the page's base tableMode is 'single')
  ├─ merges baseDef.features + buttonConfig.features → activeDefinition
  ├─ buildActive* helpers populate: activeColumnExtractors, activeColumnErasers, etc.
  ├─ applyRenameH2ToH3 / applyInsertH2 / applyListToTable  (DOM pre-processing)
  ├─ fetch loop (paginated GM_xmlhttpRequest calls)
  ├─ row extraction + column pipeline per row
  │
  ├─ tableMode === 'single'  →  renderFinalTable(rows)
  │     container = table.tbl tbody  (must exist in DOM)
  │
  └─ tableMode === 'multi'   →  renderGroupedTable(dataArray, isArtistMain)
        container = div#content  OR  table.tbl.parentNode  (re-rooted if targetHeader
        is outside initial container — see re-root block in renderGroupedTable)
        creates h3 + table.tbl pairs, inserts master-toggle button
```

## `startFetchingProcess()` is entered TWICE only by a resume — a second press reloads

Anything that reasons about "what happens when the fetch runs again" has to
start here, because the obvious answer is wrong. A second press does not
re-enter the function:

```javascript
// Reload the page if a fetch process has already run to fix column-level
// filter unresponsiveness
if (isLoaded && !_isResume) {
    sessionStorage.setItem('mb_show_all_reload_pending', 'true');
    window.location.reload();
    return;
}
```

Nothing re-presses after the reload — init only clears the flag — so the error
arm's own advice, *repress the "Show all" button*, means **reload, then press
again**. Do not read that comment as evidence that the render tail is exercised
a second time on a live page; it is not, and building item 5 on that inference
cost five stalled spec runs whose only symptom was a renderer blocked so hard
that `page.evaluate()` timed out (DEBUG-NOTES.md, 2026-09-20).

**The `_isResume` exemption is the ONE way back in**, and it is deliberately
narrow. `startFetchingProcess(e, buttonConfig, baseDef, resumeFrom)` with a
`resumeFrom` record changes exactly six things and nothing else:

1. the page count is reused from the record, not re-probed — and its two
   threshold dialogs stay shut, so the user is not asked twice about the same
   pages;
2. the four HEADING pre-processing steps are skipped (see the defect below);
3. the artist-releasegroups official-headers pre-fetch, and the
   `h3_*_category_header_array` reset that sits **in front of** its pageType
   guard, are skipped — that reset is unconditional and would otherwise empty
   the very arrays the accumulator guard protects;
4. the row accumulators are **not** cleared — `allRows`, `groupedRows`,
   `_mbRowIdxCounter`, `expandedCells`, `_inlineArtSettled`,
   `_areaFlagRegionCorrected`, `_seenTopCdStubHrefs`, the `h3_*` arrays;
5. the loop starts at `resumeFrom.nextPage`;
6. the "this page is the page we are standing on, use `document`" shortcut is
   disabled — by then the render has replaced the live table with the
   consolidated one, so it would re-extract this script's own output as page N.

**`_mbRowIdxCounter` staying un-zeroed is the load-bearing one.** It is what
gives resumed rows fresh `data-mb-row-idx` values continuing from where the
interrupted run stopped, so every map keyed `"rowIdx:colIdx"` stays consistent
with no merge step and no renumbering pass. Re-zeroing it is invisible to every
row-count, status-text and request-log assertion.

**The filter is NOT preserved across a resume**, and that is a decision, not an
oversight: the render tail never calls `runFilter()`, so a preserved filter
input would sit above a table showing every row. A resume is a fetch, and a
fetch starts from a clean filter.

`_resumeState` is written only by the loop's page-failure arm and cleared at the
top of every run (including a resumed one) and on a disk load. `__saTest.resumeState()`
exposes it, because a resumed run that silently re-fetched everything looks
identical on screen to one that kept its rows.

## The heading pre-processing must never touch the anchor it injected

`applyInsertH2()` guards itself with a `data-mb-injected-h2="1"` marker it
stamps and then queries for. `applyRenameH2ToH3()` and `applyRenameH2ToH1()`
run **before** it and rename `<h2>`s wholesale, copying all attributes onto the
substitute — so without an exclusion a second pass turns the injected
`<h2 data-mb-injected-h2="1">` into an `<h3 data-mb-injected-h2="1">`, the
marker query finds nothing, and another heading is injected beside the orphan.
**Both renamers therefore exclude `h2:not([data-mb-injected-h2])`.** Do not
widen that back: demoting MusicBrainz's OWN section headings is the whole point
of the feature, which is why the spec has a counter-guard for it.

**Two corrections to what this section said while the defect was still open,
both worth keeping because the reasoning was wrong in instructive ways:**

- **It is NOT reachable by pressing the button twice.** That path never re-runs
  pre-processing at all — `startFetchingProcess()` answers a second press with
  `window.location.reload()` long before the block. The real path is **Load from
  Disk after the page has already rendered**: `_hydrateAndRenderFromSnapshotData()`
  re-runs the block itself, gated on `features.listToTable`. Two loads in a row
  do it as well as fetch-then-load.
- **17 pageTypes can reach it, not 18.** The count of those declaring
  `renameH2ToH3` + `insertH2` is 18, but `notes-received` lacks `listToTable`,
  so the disk-load block never re-runs for it. The others are every `*-tags`
  type plus `user-ratings`, `popular-tags`, `reports-index`, `edit-types`,
  `instrument-list` and `privileged-accounts`.

**It produced no visible breakage, and that is the interesting part.** Measured
on 2026-09-20 through a real Save→Load round trip: the disk-load pass logged
`renamed 1 <h2>` then `inserted <h2>"Ratings"`, and the ORIGINAL anchor element
left the document entirely — the surviving `<h2>` was a different node. The
rendered page still looked correct, because `renderGroupedTable()`'s own cleanup
swept the demoted orphan. So a COUNT of anchors was 1 before and after; only
element IDENTITY distinguished them, which is what
`tests/fixtures/preprocessing-group-idempotency.spec.js` pins. It was a latent
dependency on cleanup ordering that nothing documented or tested, not a visible
bug — and the guard removes the dependency rather than fixing a symptom.

## Critical bug fix: user-tags container re-root (v9.99.521)

`/user/<n>/tags` has no `div#content`. Native DOM:

```
div#page
  h2 "Tags vzell upvoted"    ← targetHeader
  div#all-tags               ← initial container (table.tbl parentNode)
    h3 / table.tbl pairs
```

`renderGroupedTable` uses `let container` (not `const`) and re-roots it after cleanup:

```javascript
if (targetHeader && !container.contains(targetHeader)) {
    container = targetHeader.parentNode;  // div#page
}
```

Without this, all rendered h3/table pairs land outside `div#all-tags` and the
master-toggle's `container.querySelectorAll('table.tbl')` finds nothing.

**Do not add `renameH2ToH3` or `insertH2` to the `user-tags` definition.**
The native `<h2>Tags vzell upvoted</h2>` is already the correct targetHeader.

## CAA/EAA artwork — what must not break

**Single- and multi-table sorting currently works correctly for all three
artwork surfaces — inline thumbnails, the CAA/EAA columns, and the big-image
strips. Keeping it that way outranks any change that would jeopardise it.**
Every one of these mechanisms was landed to fix a real, shipped regression, and
several of them failed silently rather than loudly. If a change touches sorting,
filtering, re-rendering, or the artwork pipeline, say up front how it preserves
each of the following.

**Sorting by artwork presence** goes through **`_sortCellText()`** (declared next
to `_sortColumnKind()`), called by **both** `createSortComparator()` and
`createMultiColumnComparator()`. The single shared resolver exists because those
two have silently disagreed before. It is scoped to
`.mb-caa-sort-key`/`.mb-eaa-sort-key` **alone**, and the rule to carry forward is:
*only add a class to `_sortCellText()` if that class is also stripped from the
visible text.* Folding in `mb-cancelled-sort-key` would silently reverse the
order of a column that was never broken — a cancelled-event cell also carries the
visible word "cancelled", so its sort text is `"cancelled yes"` vs `"no"`, and
`"c" < "n"` already puts cancelled events first ascending.

For the background: `_CLEAN_STRIP_SEL` strips the artwork sentinels, and
`getCleanVisibleText()` removes them by clone-and-remove before its TreeWalker
runs. **The strip is correct and must stay** — a typed filter of `"no"` would
otherwise match `"not readable"` and the sentinel text itself. Sorting was simply
the one consumer never given a replacement for it. `.mb-eaa-sort-key` is in the
selector but never actually created; the `caa` extractor writes
`mb-caa-sort-key` for both.

**Artwork presence is filtered exclusively via the 📊 unique-values dropdown's
structure mode** ("✓ has artwork" / "✗ no artwork", `_cellMatchesStructureMode()`).
The old typed-filter sentinel bypass in `testRowMatch()` was **removed** — it made
one typed word mean two unrelated things, since `no` matched both "no artwork"
and rows whose image type genuinely contains it (e.g. `Matrix/Runout`). Do not
reintroduce it. Removing it also fixed a plain-vs-regexp inconsistency: both
bypasses lived in the NON-regexp branch, so an anchored `^no$` matched nothing
while a plain `no` matched presence. `mb-inline-art-sort-key`'s bypass was
deliberately **kept** — its `caa-inline-yes`/`caa-inline-no` values collide with
no English word.

**Inline-thumbnail presence is matched through `_inlineArtSentinelFor()`, never
the cell's own span.** `_artSetInlineSortKey()` stamps `.mb-inline-art-sort-key`
on whichever `<td>` was LIVE when the fetch settled, but `runFilter()` matches
SOURCE rows. On `tableMode: 'multi'` the live row is always a clone, so the 📊
"🖼️ front-image available" / "∅ NO front-image available" entries (and a typed
`caa-inline-yes`) filtered to **zero rows** while counting correctly; on
`tableMode: 'single'` the same happened to any thumbnail settling after the first
re-render. The settle is now also recorded in `_inlineArtSettled`, keyed
`"rowIdx:colIdx"` like `expandedCells` and reset with it, and all three readers —
the structure modes, the typed bypass and `openUniqDrop()`'s count pass — go
through the one resolver, so a count and its rows cannot disagree. Three things
not to undo:

- **Do not "fix" this by mirroring the span onto the master row** with
  `_findMasterRowByIdx()`: that is a linear scan measured at ~0.7 ms per lookup on
  4174 rows (1.9 ms at 10 000), paid once per settle — seconds of main-thread time
  on a big page. See `tests/MEASUREMENTS.org`.
  (`_artMirrorInlineThumbToSourceRow()` used to pay that per row on every
  multi-table re-render — 1479 ms at 4174 rows, 13 152 ms at 10 000. Fixed in
  the version the `// @version` header names: `_artInitInlinePics()` builds ONE
  `_buildMasterRowIndex()` per pass, lazily, and hands it to `_artResolveSourceCell()`
  as an optional argument. **Only the SYNCHRONOUS Case C1 call site may pass
  one.** The four deferred mirrors — an image `load`, a `.then()` — keep the
  scan, because a pass-scoped map is stale by the time they run, which
  `_buildMasterRowIndex()`'s own JSDoc forbids. The icon mirror
  `_artMirrorIconToSourceRow()` is deferred at both its call sites and still
  scans once per painted icon; that is the remaining half, measured as 7 of the
  14 scans a keystroke used to cost on the `releasegroup-releases` fixture.)
- **Record connected cells only, and validate the GUID on read.** A detached `<td>`
  is either a clone some later render replaced, or a single-table source cell (a
  late 404), where the span already is what the matcher reads. The GUID check
  rejects an entry written for a previous fetch that reused the `rowIdx`.
- **Drop the filter-result cache only on a CHANGE, and only the keys that can read
  what changed** — `_invalidateFilterCacheWhere()` with
  `_filterKeyReadsInlineArtSentinel()` (inline art) or
  `_filterKeyReadsArtColumn(colIdx)` (a CAA/EAA column's synced facts, from
  `_artSyncSearchTextToSourceRow()`). Case C1 re-stamps every cell with its
  existing value on every render, so an unconditional drop would empty the cache
  on every keystroke; a wholesale drop would throw away global-filter caching and
  incremental narrowing for the whole time artwork is loading.

Covered by `tests/fixtures/art-inline-uniq-filter-late-load.spec.js`, whose
isolation variants separate "never reached the source row" from "replayed a cached
row list" (the H3 sequence is both at once). Mutation list:
`scripts/mutations/art-inline-late-load.json`.

**A CAA/EAA cell's image types and comments are resolved by
`_artSearchTextFor()`, never by reading `ul.mb-caa-art-ul` directly.** The same
source-row asymmetry: `_artBuildMultiRowArtCell()` builds that `<ul>` on the
RENDERED cell, while `_artSyncSearchTextToSourceRow()` mirrors the text onto the
source `<td>` as `data-mb-art-search-sync`. A reader that knows only the `<ul>`
therefore finds nothing on every multi-table page, which is what made a PLAIN
global filter for "Booklet" match no rows while the same query with Rx ticked,
and the CAA column filter, both matched — they went through
`getCleanColumnText()`, i.e. through this resolver.
`tests/fixtures/global-filter-art-search.spec.js` pins all three paths against
each other, and its regexp/column-filter controls are what tell "the plain path
is broken" apart from "the fixture has no artwork".

**Surviving a re-render.** `renderFinalTable`/`renderGroupedTable` insert
`cloneNode(true)` copies, so live artwork has to be mirrored back onto the SOURCE
rows or it is destroyed and re-fetched on every sort and every filter keystroke:

- `_artMirrorIconToSourceRow()` copies a `background-image` VALUE onto a
  `span.caa-icon` the source row already owns (it comes from MusicBrainz's own
  markup, and inline styles survive the clone).
- `_artMirrorInlineThumbToSourceRow()` clones the whole placeholder, because an
  inline thumbnail is a NODE this script creates — on a multi-table page the
  source rows have never held one, so there is nothing to copy a value onto and
  `_stripTransientCellState()`'s `preserveLiveArt` branch had nothing to match.
- Both resolve their target via `_artResolveSourceCell()` plus
  `_findMasterRowByIdx()`. The latter is required because merged view folds other
  groups' rows into the first-occurrence table, so a group-index lookup misses
  exactly those rows.
- The receiving halves are `_stripTransientCellState()`'s `preserveLiveArt`
  branch and `_artInitInlinePics()`'s Case C1 (hover + bigbox re-wired, live
  image kept, nothing re-resolved).

**Scoped sub-table sort.** `_renderDirtyGroupIdxs` (a `Set`, or `null` meaning
"render everything", which is what every non-sort entry into `runFilter()` sees),
`_invalidateFilterCacheForGroups()` and `_sortDirtyGroupIdxs()`. Sorting one
sub-table now re-renders only that group. Two consequences bind any new test:

- **Artwork in an untouched sub-table is never re-inserted**, so it cannot appear
  in an insertion-time tally. Compare against the SORTED sub-table's own counts,
  never a page-wide count. Getting this wrong is how one spec silently became
  `1 of 1` in three views and `0 of 0` in a fourth — passing, proving nothing.
- **The colon-alignment finalizers are deliberately skipped on a scoped pass.**
  They measure one shared width across the whole rendered row set; a re-order
  does not change that set, and running them with the undisturbed groups emptied
  would narrow every column to what the sorted sub-table alone needs.

The cache drop is by group index across ALL `discographyViewState` values (the
key is `m:<view>:<groupIdx>`), or a pre-sort ordering cached under another view
comes back on the next switch.

**Big-image strips** are `#mb-caa-toggle-btn-global` /
`#mb-eaa-toggle-btn-global`, with per-section `#mb-caa-toggle-btn-{i}` and
retry buttons at `#mb-caa-toggle-btn-retry-{i}`.
`sa_caa_pics_initially_collapsed` defaults **true**, so they load nothing until
toggled — see the testing section for why that matters to every artwork test.

**Those ids are constructed, not literal — grepping for them in the userscript
finds only JSDoc.** They are `ctx.btnPrefix + '-global'`, where `btnPrefix` is
`'mb-caa-toggle-btn'` on `CAA_CTX` and `'mb-eaa-toggle-btn'` on `EAA_CTX`. To
find the code, grep `btnPrefix`. This is the same trap as the `caa`/`eaa` debug
channels (see that section): a real, stable identifier that no string search for
its full name will locate.

## Writing cell text AFTER the render: the four things you owe

Anything that changes a cell's CONTENT once the table exists — an async column
populator, a toggle that rewrites a column, a correction that reacts to a
third-party userscript — changes what rows MATCH while every filter INPUT stays
identical. Four consumers cannot see that on their own, and each has shipped as
a bug (AUDIT.md §1 has the full history):

1. **The uniq-dropdown/header-count caches** — `_invalidateUniqDropDataCache(table, colIdx)`
   or `…ForTable(table)`. Their signature is the visible row set, which a
   content write does not change.
2. **`_filterResultCache`** — keyed by `_buildFilterKey()`, i.e. filter inputs
   alone, so the previous row list is REPLAYED under the same key.
   `_invalidateFilterCache()` wholesale for a one-shot (a button press, one
   answer), or `_invalidateFilterCacheWhere(affectsKey)` with a key predicate
   for a stream of writes, so filter typing keeps its cache while artwork loads.
3. **`_rowTextCache` on the SOURCE row** — `runFilter()` matches source rows,
   and `_cachedColText()`/`_cachedFullText()` hand back the text read before the
   write. Clear `cols` (whole array, or the written index) AND `full`, honouring
   the two DIFFERENT sentinels: `cols` is "not cached" at `undefined`, `full` at
   `null`. Writing `null` into `cols` makes `testRowMatch()` throw — that is
   `a861512`.
4. **The rows on screen right now** — dropping caches only makes the NEXT pass
   correct. If `_anyFilterActive()`, re-run `runFilter()` once, or the user goes
   on looking at a table filtered against the old values.

**The same applies to STATE the modes read, not just text.** `expandedCells`
(keyed `"rowIdx:colIdx"`) is what the 📊 `collapsed`/`expanded` entries match on,
so one toggle changes which rows they match with every input unchanged. All five
writers now go through `_applyExpandedCellState()`, which owes items 1, 2 and 4
above (item 3 does not apply — those modes read the map, not the row's text).

**A summary COUNT owes the same "read the source rows" rule**, for the same
reason and with a nastier symptom: `_updateLengthMismatchButtons()` and
`_updateLiveDateFlagButtons()` hide a button whose count is 0, so a tally taken
from the live DOM makes the button disappear exactly when a filter excludes its
rows — removing the only way back to them. `_countLengthMismatchRows()` walks
`_msSourceRows()`; `_countLiveDateFlags()` did not until AUDIT.md §3.6, and it
resolves column names from the RENDERED table because a source row has no header
of its own (`groupedRows[i]` ↔ `tables[i]`).

And one that is not a cache at all: **write to the rows the matcher reads.**
`runFilter()` REMOVES non-matching rows, so a pass that collects its targets
from the live DOM silently skips whatever is filtered out — and if it runs once
per fetch, those rows never get the data at all (§3.3, `initReleaseEventsColumn()`).
Collect from `groupedRows`/`allRows` as well, or mirror onto the master row.

Worked examples, all with fixture specs and mutation lists:
`_msApplyLengthPrecision()` (⏱, one-shot), `initReleaseEventsColumn()` (one
answer for many rows), `_maybeCorrectAreaFlagRegion()` (a stream, coalesced per
frame by `_scheduleAreaFlagFilterRefresh()`), `_artSetInlineSortKey()` /
`_artSyncSearchTextToSourceRow()` (per-cell, key-predicate invalidation).

## Testing expectations

**Every implementation ships with test cases. More coverage is always better.**
This is not a judgement call to re-litigate per change; the only question is
which kind of test, and the routing is:

| Kind              | Where                                                      | When                                                                                                           |
|-------------------|------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Fixture spec      | `tests/fixtures/*.spec.js`                                 | Anything reproducible from saved HTML. Network-free, fast, the default. Prefer this.                           |
| Live spec         | `tests/live/*.spec.js`, tagged `@core`/`@extended`/`@perf` | Real-page behavior that a fixture cannot reproduce (pagination, real artwork throughput, third-party interop). |
| Snapshot baseline | `tests/snapshots/<pageType>/`                              | A new pageType's structural shape.                                                                             |

The existing rule stands and is stricter than the table: **every DOM/rendering
fix needs a regression test that fails before the fix and passes after.** Verify
the "fails before" half rather than assuming it — mutation-check by reverting the
fix, or by planting an early `return`. `scripts/mutation-check.py` runs a JSON
list of planted defects (`scripts/mutations/*.json`) unattended: each `find`
must match exactly once, the userscript is restored and hash-verified
afterwards, and a guard the spec genuinely cannot see because another covers
for it is recorded as `"expect": "pass"` rather than left unmentioned.

**Name the guarantee precisely, or the test proves something adjacent.** The
CAA/EAA presence-sorting bug above went unnoticed for the whole visible history
of the repo *while two specs covered the column*: they asserted artwork
**survives** a sort, which is a different guarantee and was always met. Nothing
asserted it **orders** by artwork. When writing an assertion, state which
property it pins, and check that a plausible bug in the neighbouring property
would still fail it.

See `tests/README.org` for how to run each suite and what it costs in wall clock.

## Performance is a priority

**Performance is a gate, not an afterthought. If a change would make filtering,
sorting, rendering, or artwork throughput worse, flag it BEFORE implementing and
let the user decide** — including when the change is otherwise correct and the
regression is the price of correctness. Say what gets slower, by roughly how
much, and what the alternative would be.

- `PERFORMANCE.org` holds the measurements and the numbered Steps. Its
  TODO/DONE keyword tracks "landed on `main`", not effort.
- **Re-read `PERFORMANCE.org` for what your change made FALSE — when you
  implement, and again when you merge — and fix what it says, not just the
  keyword.** The file is written as prediction and plan, so landing a Step
  routinely invalidates prose several sections away that nothing will flag: a
  sibling Step's prerequisite, a "still TODO" aside, a stated blocker, a
  prediction about which primitive you would reuse. Merging 9.99.1049 (Steps 3
  and 22) falsified six such statements — Step 8 became fully DONE by
  construction, Step 6's scope narrowed to a single caller, and Step 4's "Step 3
  will key off the same primitive" turned out backwards, since Step 3 needs an
  order-INDEPENDENT key and Step 4 cannot have one. None of that surfaces from
  flipping a keyword.
- **Derive the "DONE set is exactly Steps …" sentence from the keywords, never
  by hand.** It has drifted twice, in both directions. `scripts/audit-docs.py`
  derives it and fails on a mismatch, so run that rather than counting; it also
  catches a step whose keyword reads DONE while its body still says "Still TODO
  on `main`", and an "IN PROGRESS" section naming a branch that is gone. It is
  the mechanical half of the re-read only — a step whose bug description is no
  longer true reads perfectly well to a script (Step 25 did, for four commits
  after 9.99.1100 fixed it).
- **`PERFORMANCE.org` carries NO `~:NNNNN~` line references, and
  `audit-docs.py` fails if one reappears.** It used to carry 118, and a survey
  on 2026-09-20 found them all pointing at unrelated code — measurably so for
  the 32 that paired a symbol with a number, of which **0** still resolved
  within ±2 lines. The file
  had even recorded that conclusion for one paragraph of Step 30 on its own
  ("already ~600 lines stale before they were removed") without generalising
  it. This is the same rule, and the same reason, as the File-structure table
  above: the userscript grows on nearly every commit, so a number is stale
  within days and is worse than nothing, because it reads as precise. Name the
  symbol; where a pointer cannot be recovered, rewrite the sentence to stand
  without one rather than guess an anchor. `scripts/strip-perf-line-refs.py`
  did the conversion and records which shapes were mechanical and which needed
  a judgement call.
- **Record the machine and the wall-clock time. Every timing, every time.**
  `capture-interaction-perf.js` and `capture-snapshots.js` write a `machine`
  block (hostname, cores, node and Playwright versions, plus `uptimeHours` and
  `claudeResident` — host conditions that are not hardware but move timings,
  added after a same-version cross-machine arm came back 1.5-1.85x apart with
  neither box's uptime on record) plus UTC `startedAt`/`finishedAt` into their
  JSON, and every measurement that ends up in prose — a commit message,
  `PERFORMANCE.org`, `DEBUG-NOTES.md` — must name the host and when it ran. The time matters because every sample fetches its
  page shell from the live site, so "was MusicBrainz busy at that hour" is a
  standing hypothesis for any unexplained difference — one that can only be
  tested against runs that recorded when they happened. A number with no machine attached cannot be compared to a later one,
  so it is not evidence. This rule exists because a 1.5-2x gap between two
  `main` arms could not be resolved at all: nothing recorded which machine
  either ran on, so it was attributed first to machine state and then to
  concurrent load, both guesses, and the second was disproved. Mark an unknown
  host as unknown rather than inferring it — at least one archived arm is known
  to be from a different machine.
- **Filenames carry version, capture date, and hostname too, not just the
  JSON content.** `interaction-perf-<branch>-<version>-<capturedAt>[-
  <hostname>].json` and `perf-baseline-<version>-<capturedAt>[-
  <hostname>].json` (the latter written alongside the single mutable
  `perf-baseline.json` that `--perf`'s own WARN/FAIL verdict compares
  against — that one file's name stays plain since it is the comparison
  target, not an archived arm). `<hostname>` is omitted, not guessed, when
  `os.hostname()` isn't a meaningful identifier. This exists because the
  branch-only naming let a same-named file get silently overwritten by a
  later machine's run — `interaction-perf-main.json` had already lost its
  original 9.99.1045 data to a 9.99.1048 overwrite once, and had no
  `machine` block at all by the time it was finally retired.
- **`tests/MEASUREMENTS.org` is the log**: every timing, wall clock and count,
  with its host, what it was probing, and — for anything naming a page, a URL or
  a `rendered.html` — that page's pageType, `tableMode` and human title. Add a
  row there when you measure something, rather than leaving it in a commit
  message where the next person will not find it.
- The `run-perf-comparison` skill runs and interprets the instrumentation.
- Committed baselines: `tests/snapshots/artist-events/interaction-perf-*.json`
  (interaction latency) and `tests/snapshots/artist-releasegroups/perf-baseline*.json`
  (end-to-end fetch/render). Both are medians of 5 samples, kept as one file
  per arm (branch/label + version + capture date [+ hostname]).
- Current `main` reference point, on the 4174-row `artist-events` disk fixture,
  captured 2026-09-08 at 9.99.1048: global filter ~3033 ms, column filter
  ~3295 ms, sort ~6410 ms, uniq-dropdown ~45 996 ms cold / ~1676 ms warm,
  header counts ~8033 ms initial / ~12 319 ms restore. Re-measure rather than
  trusting these if a decision hinges on them. That arm is `petri`; the
  current-version one is **`NB-3641`, 9.99.1111, 2026-09-18**: global filter
  ~1759 ms, column filter ~1802 ms, sort ~3697 ms, uniq-dropdown ~30 972 ms cold
  / ~803 ms warm, header counts ~5663 ms initial / ~5501 ms restore. The two are
  DIFFERENT HOSTS and are not comparable to each other — that is the point of
  the next bullet, not an exception to it.
- **Never quote an absolute across versions or sessions — capture your own
  `main` arm alongside your branch's, in one session.** `main` measured
  1735/1730/3968/31149/863 at 9.99.1045 and roughly twice that at 9.99.1048,
  which looked like a regression across three versions. It was not: re-running
  the SAME 9.99.1045 script on `petri` produced 3117/3285/6044/42948/1640,
  within noise of 9.99.1048. The whole ~2x is environment, and the older arm
  never recorded its host, so what changed cannot now be recovered. Two things
  follow — quote only within-session A/B ratios, and **bisect before attributing
  a gap to anything, in either direction**; the environment guess happened to be
  right here, and was still a guess until it was measured. Full workings in
  `tests/MEASUREMENTS.org`.
- `capture-interaction-perf.js` also reports `headerCountsInitial` and
  `headerCountsRestore` — the column-header count scan timed directly rather
  than as main-thread pressure on a status-text poll. Both carry a ~1 s floor
  from `waitForColHeaderCountsStable()`, identical on every arm.

Note the warm uniq-dropdown figure: it was ~29 700 ms before caching landed. A
change that reverts a win that large should be impossible to make by accident,
which is the reason these baselines are committed.

## Publishing: this repo is NOT the one users install from

`vzell/mb-userscripts` is the announced repository, and its
`raw.githubusercontent.com/.../master/` URLs are what every user's Tampermonkey
fetches — including the in-script ❓ Help and 📜 ChangeLog dialogs, which read
those files at runtime. Publishing is copying files there by hand.

**The library `@require` differs between the two on purpose.** This repo points
at the working copy (`file:///V:/…/lib/VZ_MBLibrary.user.js`) so a live browser
check exercises the library in this tree; the published copy must carry the
network URL. That changed on 2026-09-23 — VZ_MBLibrary 4.1.0 and 4.2.0 both
rewrote parts of the settings dialog, and against the mirror's 4.0.0 none of
that code runs, so a live test was testing the published library while looking
like a real one.

**Shipping a `file://` `@require` fails silently for every user**: `Lib` falls
back to a stub whose `settings` is `{}`, every setting resolves to its inline
fallback, and nothing errors. `CustomizableMultiSelector.user.js` has been
published in exactly that state since 2026-02-02.

So: `python3 scripts/check-publish-ready.py` before a republish, and
`--strict` after one. It is read-only, it sweeps EVERY `.user.js` in the mirror
for `file://` (the one real instance has no counterpart here, so a pairwise
check misses it), and it treats "the mirror is behind" as pending rather than
broken — that is the normal state between releases, and a check that failed on
it would stop being run. Its arms are mutation-checked by
`scripts/check-publish-ready-gate.py` against a scratch mirror in a temp
directory, never the real one. Full checklist: `org/config-handling.org` F6.

## Git Workflow
- Never commit feature work directly to `main`. Always create a feature branch first (`git checkout -b <topic>`), commit there, then merge via PR or fast-forward and push.
- **NEVER merge an implementation branch into `main` without asking first —
  even when a green suite was the stated condition, and even when the user
  earlier said "go ahead".** A passing fixture suite is not evidence that the
  feature works; it is evidence that the assertions someone already thought of
  still hold. The `merge-push-remove` skill describes HOW to merge once that
  decision is made; invoking it is never the decision itself. Ask, and let the
  user exercise the change in a real browser first.
  This rule exists because it was broken: on 2026-09-16 the Relationships
  batch/load-state branch was merged locally on the strength of 287 green
  fixture tests, and minutes later a human clicking through a real
  `release-group` page found that filtering from the 📊 dropdown on the
  Relationships column silently stops working after one collapse/uncollapse
  cycle — a bug no spec in the suite covered. The merge had to be unwound
  (`git reset --hard`). Nothing had been pushed, which is the only reason it
  cost nothing.
- Every user-visible change requires: version bump in the userscript header, a CHANGELOG entry, and a HELP/docs resync in the same commit.
- At merge time, re-read `PERFORMANCE.org` for statements your change made false — see "Performance is a priority" above. Flipping a Step's keyword is the easy half; the prose that predicted your change is the half that rots silently.
- After finishing a task, always commit AND push; then offer to merge `main` into the active perf/feature branch to keep it current.

## File Safety
- NEVER use the Write tool on existing long-lived files such as `DEBUG-NOTES.md`, `CHANGELOG`, `PERFORMANCE.org`, or `PAGETYPES-TESTING-REFERENCE.org`. Read the file first, then use Edit to append or modify. Write is only for genuinely new files.

## Tooling Conventions
- Never run inline `python3 -c "..."` or inline `node -e "..."`. Write a script file under `scripts/` (or `test/`) and execute it, so the logic is reviewable and re-runnable.
- Every DOM/rendering fix must be accompanied by a jsdom or Playwright regression test that fails before the fix and passes after.

## Debugging DOM/Rendering Bugs
Before proposing a fix for a rendering or 'element not appearing' bug, first confirm the root cause with evidence: check for late/async DOM injection (MutationObserver), stale node references, and third-party userscript CSS. Do not ship a CSS-overflow or rAF-batching guess as the fix.

## DOM conventions

| Element / class                             | Purpose                                                                                                                                                                                         |
|---------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `table.tbl`                                 | All data tables created by this script                                                                                                                                                          |
| `.mb-master-toggle`                         | Show/Hide all sub-sections button (multi-table pages)                                                                                                                                           |
| `.mb-toggle-h3`                             | Clickable h3 section headers                                                                                                                                                                    |
| `.mb-toggle-h2`                             | Clickable h2 section headers                                                                                                                                                                    |
| `.mb-filter-container`                      | Filter bar wrapper                                                                                                                                                                              |
| `.mb-sort-status`                           | Sort indicator                                                                                                                                                                                  |
| `.mb-caa-sort-key`                          | Hidden sort/filter sentinel for CAA artwork presence                                                                                                                                            |
| `.mb-eaa-sort-key`                          | Hidden sort/filter sentinel for EAA artwork presence                                                                                                                                            |
| `.mb-inline-art-sort-key`                   | Hidden sort key for inline thumbnail presence                                                                                                                                                   |
| `.mb-rel-cell`                              | Relationship icon cell                                                                                                                                                                          |
| `.mb-rel-col-hdr-btn`                       | Per-table ▶🔗/▼🔗 Relationships load/empty toggle; glyph from CSS `::before` keyed on `aria-pressed`                                                                                            |
| `.mb-sticky-col`                            | Sticky first column                                                                                                                                                                             |
| `.mb-cell-collapse-toggle`                  | Per-cell ▶/▼ collapse toggle — drives BOTH list cells (`ul>li`) and prose cells (`.mb-text-clamp-inner`)                                                                                        |
| `.mb-collapse-toggle-has-match`             | Tint on a collapsed cell's toggle meaning "a filter match is hidden in here" — driven ONLY by `_COLLAPSE_MATCH_SEL` spans; see its own section                     |
| `.mb-text-clamp-marker`                     | Unconditional marker on every prose-collapse column's wrapper — `_isProseCollapseColumn` keys off this, independent of the `.mb-text-clamp-inner` clamp itself (see `collapsableColumns` below) |
| `.mb-text-clamp-inner`                      | Wrapper around a "prose" collapsable cell's content (e.g. "Annotation"); height-clamped by default                                                                                              |
| `.mb-text-clamp-expanded`                   | Toggled on `.mb-text-clamp-inner` to lift the height clamp                                                                                                                                      |
| `.mb-col-collapse-hdr-btn`                  | Column-header collapse/expand-all button                                                                                                                                                        |
| `.mb-col-collapse-count`                    | Per-column live multi-row count badge, kept in sync by `_updateAllColHeaderCounts`                                                                                                              |
| `[data-caa-expand-btn]`                     | CAA/EAA cell-expand button attribute — the precedent `collapsableColumns` below points to for a "fourth cell kind"                                                                              |
| `.mb-uniq-section` / `.mb-uniq-section-hdr` | Unique-values dropdown's collapsible section wrapper/header (see `SYN_SECTION_META` below)                                                                                                      |
| `.mb-col-uniq-item`                         | Unique-values dropdown row item                                                                                                                                                                 |

## Things to check before any DOM-related fix

- Does the page have `div#content`? (Most do. `user/*/tags` does not.)
- Where does `table.tbl` live relative to `targetHeader`?
- Is `targetHeader` a sibling or ancestor of `container`?
- Does `applyListToTable` run before `renderGroupedTable`? (Changes parentNode of tables.)

## Plan Mode
When in plan mode, do not edit files. Present the plan first and explicitly state which branch the work will happen on and whether a version bump/changelog entry is needed, so the user can correct scope before any code changes.

## Settings keys (GM storage via `Lib.settings`)

All settings are prefixed `sa_`. This is a curated "key ones" subset, and a
small fraction of the whole — **`ShowAllEntityData_CONFIG_DEFAULTS.json` is the
full set**, generated from `configSchema` by `scripts/dump-config-defaults.py`
and kept current by `scripts/audit-config-defaults.py`. Read it rather than
assuming this list is complete or that a key you remember still has the name you
remember. (`sa_enable_expand_rg` was documented here for a long time; the real
key is `sa_enable_expand_rgs`, plural.) **Nothing in the userscript reads that
file** — it is an artifact for review and for the audit, and
org/config-handling.org's "Why it must not be read at runtime" says why it must
stay that way.

**A default has two places it can be wrong, and changing one is how they
drift.** The schema's `default:` is what the settings dialog shows and what
RESET restores; an inline `Lib.settings.sa_X || literal` is what applies when
that key reads falsy. All **166** fallback sites now agree with their own
schema default — 15 did not until 9.99.1137, because `bfb8ac3` changed seven
defaults "to sensible values" and left the literals thousands of lines away
untouched. **When you change a `default:`, grep for that key's inline
fallbacks and change them too**, or run the audit, which is there precisely so
you do not have to remember.

`scripts/audit-config-defaults.py` fails on a NEW disagreement, and on an
ORPHAN — an inline read of a key no longer in the schema, which is always its
fallback, silently and for ever. `scripts/config-fallback-drift-baseline.json`
is the accepted set and is currently EMPTY; keep it that way rather than
baselining a new one. A version bump alone is a NOTE, never a failure, so the
gate survives `merge-push-remove`'s fold. Run
`scripts/check-config-defaults-gate.py` after touching the audit: it
mutation-checks all eleven arms, and is what caught the ORPHAN case exiting 0.

**Storage holds only what the user CHANGED, and changing a `default:` now owes
a third thing.** VZ_MBLibrary 4.1.0's SAVE deletes a value equal to its schema
default instead of writing it, so an absent key follows the schema and a stored
one does not. Before that, one SAVE — even with nothing changed — wrote all
~232 keys and every later default was invisible to that user for ever
(org/config-handling.org F1). `_migrateFrozenSettings()` repairs a profile that
already froze, once, consumer-side so it ships without waiting on the mirror
republish.

So when you change a `default:`, the third obligation is **an entry in
`_SETTINGS_MIGRATIONS`** naming the value it moved away from — otherwise
everyone who has ever pressed SAVE keeps the old one. You do not have to
remember: refresh `scripts/config-default-history.json` with
`scripts/dump-default-history.py` (a walk of all 591 revisions, ~26 s) and the
audit's Stage 3 names what is missing. It fails on an INVENTED entry too, which
is the worse direction — that one silently overwrites a value the user may have
chosen on purpose.

**A seeded GM value in a spec looks exactly like a frozen one**, so
`tests/support/loadPage.js` seeds the migration level far above anything the
script ships and every fixture starts with migrations already applied. Four
call sites in `collapse-column-width-stable-on-sort.spec.js` seed
`sa_auto_resize_columns: false`, which IS a retired default. Only
`tests/fixtures/settings-migration.spec.js` opts back in.

**The settings dialog belongs to VZ_MBLibrary, and every entry point must go
through `Lib.configureSettings()`.** Six routes open it — the ⚙️ toolbar
button, `Ctrl+,`, `Ctrl+M ,`, the Tampermonkey menu item, the MusicBrainz
*Editing* menu link, and anything added later. The first three are this
script's; the next two are registered by the library itself and used to call
`showModal()` with no arguments, so opened either of those ways the 💾/📂
buttons were never injected and the 🔧 *Edit Pinned Filter List* button did
nothing (org/config-handling.org F5). `_registerSettingsIntegration()` now
records the `functionRegistry` and the `beforeOpen` hook ONCE, at bootstrap,
and every path falls back to it — **do not go back to passing either at a call
site**, which fixes only the paths you remember.

**The five `type: 'table'` settings now receive rows added in a later version,
and `sa_table_seed_ledger` is why.** They are lazy-seeded on first use and never
reconsult the built-ins, so F1's closing note called this unsolvable: stored
rows alone cannot tell "the user deleted this row" from "never seen it". The
answer is to record it rather than infer it — the ledger holds every built-in
row key this profile has been OFFERED, so absent ⇒ add, present-but-missing ⇒
stay deleted. Same pattern and same reason as `vz-mb-colvis-touched-*`.

- **`_seedNewTableRows()` is called at the FOOT of the IIFE, never the startup
  block.** `_TABLE_SEED_REGISTRY()` reads `SA_UNICODE_CHARS_DEFAULT` and the
  three `REL_*_DEFAULT` maps, all declared far below it; module-level `const`s
  are in the TDZ until evaluated, and `node --check` cannot see a TDZ error.
  The try/catch around `rows()` makes it SILENT — hence the `unreadable`
  counter in its result.
- **A test that drives `__saTest.seedNewTableRows()` cannot see where the
  production call is**, because the hook always runs late. `table-seed-ledger.spec.js`
  reads the ledger the PAGE LOAD produced for exactly that reason.
- **The ledger is exported in the config file; the migration trio is not.** Its
  difference from the stored rows is the only record that the user deleted a
  built-in row — drop it and an import resurrects their deletions.
- **Adding a built-in row is now a user-visible change.** It reaches existing
  profiles, so `ShowAllEntityData_CONFIG_DEFAULTS.json`'s `seed_rows` is what
  puts it in a diff. Only `sa_default_hidden_columns` announces it (a new row
  there hides a column); the other four are additive and stay silent.
- **The `REL_*_DEFAULT` constants have three readers and must stay one copy
  each.** They were written out twice before — the `let REL_*` initializer and
  the `_loadMap()` argument — with nothing keeping the two equal.

**The config file carries a second block, and `_CFG_WORKSPACE_GROUPS` is the
only thing that declares its keys.** `schema_version` 2 added `workspace`
beside `settings`: the pinned filter list, per-pageType *and per-sub-table*
column visibility, filter history, the two panel geometries, the 📊 dropdown's
section collapse, the settings dialog's own size/column widths/section
collapse, and `vz-lib-prefs`. `configSchema` is what types the `settings` half;
these keys have nothing, so that registry is read by BOTH the exporter and the
importer — one list, twice — because the `settings` half's two loops skipped
different entry types for three months when each had its own (F3).

Three rules, each of which fails silently if broken:

- **Verbatim, both directions. Never `String()`, never a helpful `JSON.parse()`.**
  The shapes genuinely differ per key: `vz-mb-colvis-*` holds a
  `JSON.stringify()`ed STRING (both readers parse it), `persistent-sa-hist-list`
  an array, the geometries objects. This is F3's defect in a worse place —
  those five tables had `Lib.getTableRows()` re-seeding built-ins behind them,
  and nothing re-seeds a pinned filter list.
- **An allowlist, never a sweep.** `GM_listValues()` also returns
  `mb_sa_subtable_snapshot_*` payloads and the library's caches — and the file
  is user-supplied data, so without the gate a hand-edited one could set
  `sa_settings_migration_level` and disable F1's repair for good. The migration
  trio is deliberately out of the registry in both directions: it is INSTALL
  state, not user state.
- **An empty `[]`/`{}` IS exported here**, unlike an unseeded `type: 'table'`
  key. Copying that arm across is the plausible mistake and is wrong for the
  opposite reason — the table seeders read `[]` as "re-seed from the built-ins",
  and nothing re-seeds these. There is also no prune: no schema, no default,
  nothing to compare against.

`// @grant GM_listValues` exists for the sub-table colvis keys
(`vz-mb-colvis-<pageType>-sub-<safeId>` is built from a runtime heading id and
cannot be derived from `pageDefinitions`). Feature-detected like
`GM_deleteValue`; the fallback's gap is documented and asserted rather than
papered over. `gmStubs.js` stubs it, so tests exercise the sweep rather than
only the fallback.

**Nothing but `applyVisibility()` may assign `display` to a settings row, a
section header or a popup sub-grid.** Search and per-section collapse used to
be two mechanisms both writing `row.style.display`, last writer winning; the
"changed only" filter would have made it three. Visibility is computed in one
pass from three inputs — the needle, the changed-only toggle, each section's
stored collapse state. A filter opens the sections holding matches WITHOUT
touching their stored state, so clearing it restores the user's own layout;
mutations exist for both directions of getting that wrong.

**A fixture profile is not a pristine profile.** `FIXTURE_SETTINGS_OVERRIDE`
forces `sa_enable_caa_pics` and `sa_enable_relationships_column` OFF and both
DEFAULT to true, so any test that counts "changed" settings is off by two
unless it puts them back — `settings-dialog.spec.js`'s `PRISTINE` is what that
looks like. Related: **`data-section` holds the divider's schema KEY**
(`divider_thresholds`), not its label; matching on the label finds nothing and
reads as the feature being broken.

**The drift is mostly invisible, which is why it lasted.**
`settingsInterface.init()` writes the schema default into `Lib.settings` for
every key, so the `||` is inert unless the stored value is falsy (a cleared
colour field, a `0`) or the `VZ_MBLibrary` `@require` failed and `Lib.settings`
is `{}`. Do not conclude from "nothing looks wrong" that the literals agree.

- `sa_enable_debug_logging` — enables `Lib.debug(channel, …)` output
- `sa_ui_h2_bg`, `sa_ui_h3_bg` — h2/h3 header background colours
- `sa_ui_thead_th_bg/color` — table header colours
- `sa_enable_barcode_highlight` — gates `initBarcodeHighlight()`
- `sa_enable_caa_pics` — shared CAA/EAA master toggle (there is no separate
  `sa_enable_eaa_pics` — EAA reuses this same key)
- `sa_enable_picard_tagger` — gates the Picard-tagger column feature;
  `sa_picard_tagger_initially_collapsed` (default **true**) decides only the
  STARTING state of the per-table ▶♪/▼♪ header toggle, never whether the
  column exists — see the Picard section below
- `sa_enable_expand_rgs` — gates `initExpandRGsFeature()` (note the plural)
- `sa_enable_ms_track_length` — master toggle for the ⏱ millisecond Length
  feature; `sa_ms_idb_enable`/`sa_ms_idb_ttl_days` gate its per-recording
  IndexedDB cache (`ms-rec-len` store)
- `sa_enable_annotation_collapse`, `sa_annotation_column_max_width`,
  `sa_annotation_column_max_height_em`, `sa_annotation_h2_bg`/
  `sa_annotation_h2_color` — prose-cell (Annotation) collapse/clamp behavior
  (see `collapsableColumns` below)
- `sa_enable_ars_collapse`, `sa_ars_column_max_width`,
  `sa_ars_column_max_height_em` — the "ARs" column's own independent
  collapse/clamp settings (release-tracks only, not shared with Annotation)
- `sa_enable_relationships_column` — master gate for the injected
  Relationships column (off ⇒ no `<th>`, no `<td>`, nothing);
  `sa_rel_collapse_threshold` (default **200** distinct entities, `0` = never)
  decides only which tables START collapsed — the `▶🔗` toggle is always
  present. See the Relationships section below

## Debug channels (`Lib.debug('channel', …)`)

Enable via the `sa_enable_debug_logging` setting or the Tampermonkey menu.

**For the current list, grep `Lib.debug(` and collect the first arguments** — a
hardcoded list here goes stale silently (the previous one had drifted to include
a channel with no call site and to omit a real one). What a naive grep will
*not* tell you, and what is therefore worth recording:

- **`caa` and `eaa` have no literal call sites at all.** They are emitted as
  `Lib.debug(ctx.key, …)`, where `ctx` is `CAA_CTX`/`EAA_CTX` and `key` is
  `'caa'`/`'eaa'`. Grepping for `'eaa'` as a debug channel finds nothing; the
  channel is entirely real.
- **`filter-hist` and `gf`** likewise come from `Lib.debug(cfg.context, …)`,
  defaulting to `'filter-hist'` with a single `context: 'gf'` override.

So three of the channel names exist only as data. Anything new that routes a
channel through a variable should be added to this note.

## Debug material
- HTML snapshots and console logs live in `debug/`
- **`DEBUG-NOTES.md` is the dated root-cause log and lives at the project top
  level, tracked and committed like any other doc.** It used to be
  `debug/NOTES.md`; it was moved out precisely so it no longer depends on an
  index-only exception to an ignore rule. Always read it before starting work,
  and append a dated entry when you finish — write it as durable, reviewable
  material, not scratch
- `debug/` is gitignored via a bare `debug/` in the ROOT `.gitignore`, so
  snapshots and logs stay local. **There is no `!` negation anywhere in the
  repo, and one could not work** — git never descends into an excluded
  directory, so `!debug/<file>` has no effect. The one file still tracked in
  there, `debug/adjust-mainColumn-extractor.org`, is tracked only because it
  was force-added to the index; re-adding it after a `git rm --cached` needs
  `git add -f`. Prefer the top level for any new durable doc
- Always read the relevant `debug/*.html` before proposing any DOM fix
- Document snapshots in `DEBUG-NOTES.md` with date and what they show

## Testing (Playwright)

A full Playwright harness lives under `tests/` (`ShowAllEntityData/
package.json`, `playwright.config.js`). Two projects, split by directory:

- **`chromium-fixtures`** (`tests/fixtures/*.spec.js`) — local HTML
  fixtures via `page.route()`, no network. Two selections, and the difference
  matters at merge time:
  - `npm test` — everything EXCEPT `@slow`. The default for iterating.
  - `npm run test:slow` — only `@slow`.
  - **`npm run test:full` — every fixture test. This is the merge gate**, and
    `merge-push-remove` runs it rather than `npm test`.

  **`@slow` is opt-in for iteration, mandatory at a merge.** Two specs carry
  it — `rel-auto-retry-failed` (~295 s on `petri`, ~324 s on `NB-3641`) and
  `resume-from-failed-page` (~84 s) — and between them they are most of the
  suite's wall clock
  and *all* of its coverage of org/503-handling.org items 5 and 7. Neither is
  slow because of slow code: both spend their time in rate gates and retry
  backoffs that the feature under test exists to respect, so shortening them
  means testing something other than what ships. The cost of the tag, stated
  plainly: a `@slow` spec can now rot for a whole working session. That is
  bounded by the merge gate, not eliminated — so if you change the merge
  workflow, keep it on `test:full`.
- **`chromium-live`** (`tests/live/*.spec.js`) — real musicbrainz.org
  pages. Every spec carries exactly one tag:
  - `@core` — shared-mechanism sanity net (filter/sort/fetch/pagination
    basics). `npm run test:live` (default).
  - `@extended` — bespoke/pageType-specific edge cases (Stop-button, IDB
    cache tiers, third-party interop, sub-table filter). `npm run
    test:live:extended` (`@core`+`@extended`, today's full live suite).
  - `@perf` — the deliberate perf-comparison instrumentation only
    (`tests/live/artist-events-interactions.spec.js`). `npm run
    test:live:perf`.
  - `npm run test:all` runs literally everything (fixtures + live).

`tests/README.org` is the end-user-facing guide to the harness: every npm
script, measured wall-clock timings per suite, the login step, and how to read
the results. Keep it in sync when a script or a project timeout changes.

Three pieces of harness infrastructure worth knowing before you reach for
something new:

- **`tests/support/customDialog.js`** — clicks through `Lib.showCustomConfirm`'s
  plain-DOM overlay, which Playwright's native dialog handling cannot see. See
  the threshold-dialog table below for its one blind spot.
- **`tests/fixtures/live-userscripts/`** — real third-party userscript bodies
  copied from the local Tampermonkey install, driven by `manifest.json` and
  `tests/support/run-live-interop.js` (`npm run live-interop`). The bodies are
  gitignored (not ours to redistribute); only the harness and manifest are
  committed. This is a **debugging aid with no pass/fail, deliberately not a
  regression gate** — don't treat a clean run as coverage. The
  `register-live-userscript` skill maintains the manifest.
- **`npm run auth:login`** writes `playwright/.auth/vzell.json` (gitignored — a
  session cookie is as good as a password). Without it live specs run **logged
  out**, which silently changes what login-gated pageTypes render rather than
  failing; `tests/support/authState.js` warns when the file exists but has
  expired.

The `vz-mb-saed-art-cache` IndexedDB database is shared by three unrelated
features purely so they get one sweep/count/clear code path: `images` +
`metadata` (artwork), `rel-ws2` (Relationships column), and `ms-rec-len`
(millisecond Length). Adding a store means bumping `_ART_IDB_VERSION`. Note
the two record shapes timestamp themselves differently — `storedAt` for the
artwork stores, `ts` for the other two — which `sweepStore()` must keep
reading both of; keying on `storedAt` alone made the sweep a silent no-op for
`rel-ws2` for its whole existence.

**Snapshot regression coverage** (`tests/snapshots/<pageType>/{raw,
rendered}.html`, captured via `node tests/support/capture-snapshots.js`) covers
a small minority of pageTypes. Don't carry the count here — `tests/snapshots/registry.org`
is the authority for what is captured, and `tests/pagetypes.json` for what is
wired into the harness. The two can legitimately differ: a pageType on a
personal account can be configured without its baseline being committed.

`PAGETYPES-TESTING-REFERENCE.org`'s "Coverage clusters & representatives"
section is the authoritative coverage *plan* — it groups the pageTypes into
structural clusters, names 1-2 representatives per cluster (avoiding redundant
captures of near-identical shapes), gives identifier-selection criteria
(Springsteen-connected first, smallest qualifying catalog unless pagination is
specifically the point), and tracks `captured` vs `planned` per representative.
`tests/live/registry.org` and `tests/snapshots/registry.org` are the
hand-maintained dashboards of what's wired up today (spec/pageType, URL, what
it verifies); the latter also has an "Expected drift" section to read before
treating a re-capture diff as a regression.

Keep any filename in this file on ONE line. A hard-wrapped
`PAGETYPES-TESTING-REFERENCE.org` (broken across a newline mid-name) is
invisible to the `git grep` that a rename audit depends on, and that is exactly
how one reference here survived a rename undetected.

**Cross-tab sub-table handoff** (`tests/support/subtableTab.js`) drives the
real `openSubtableAsSingleTableTab()` → `_hydrateAndRenderFromSnapshotData()`
round trip, in the same spirit as `diskFixture.js`: the source page captures
its own snapshot, nothing is hand-built. Three non-obvious requirements, all
documented in that file — the GM store must be shared (it is:
`gmStubs.js` keeps every value in ONE `localStorage` entry,
`__sa_test_gm_values__`, installed via `context.addInitScript`), routes must
be registered on the CONTEXT (the popup navigates before a `page.route()`
could attach), and the userscript must be `addScriptTag`'d into the popup by
hand. Note the destination `GM_deleteValue`s the payload the moment it
consumes it, so `openSubtableTab()` reads it in the window before injecting
the script — reading afterwards always comes back empty. Sub-sections render
COLLAPSED, so a test must click the master toggle before anything inside a
sub-table is clickable (a toggle in a hidden table is a 0×0 element
Playwright will never click).

**CAA/EAA artwork tests: expand every sub-table BEFORE measuring, and assert
it worked.** A collapsed sub-table is `display:none`, so none of its artwork
ever loads — a test that measures a partly-collapsed page reports clean,
plausible numbers while measuring almost nothing. It passes for the wrong
reason, which is worse than failing. Specifics, each of which cost a wasted
run:

- **Do not trust `.mb-master-toggle`'s `data-state`.** On `artist-releasegroups`
  it reads `expanded` while individual sub-tables are still hidden. Drive a
  full collapse→expand cycle whenever anything is hidden rather than believing
  the flag.
- **Never click the master toggle unconditionally.** The initial state differs
  per pageType — `releasegroup-releases` renders sub-sections COLLAPSED,
  `artist-releasegroups` renders them EXPANDED — so a blind click collapses all
  17 sub-tables and the run reports clean zeros. `liveAssertions.js`'s
  `clickMasterToggleAndExpandAll()` asserts `collapsed` first and therefore
  cannot drive both; see `caa-icon-survives-sort-multi.spec.js`'s
  `ensureSubSectionsExpanded()`.
- **Re-expand after every discography view switch.** `_applyDiscographyViewFilter()`
  re-collapses the sub-sections, silently undoing the expansion done at page
  load. Measured: after switching to "Complete", the painted-icon count SETTLED
  at 6 on a page that settles at 85 expanded. Exclude view-hidden sections
  (`[data-mb-disc-hidden="true"]`) from the "nothing is collapsed" assertion —
  Official/Non-Official hide sections legitimately.
- **Assert a plausible floor after settling** (zero collapsed tables, and an
  artwork count in the expected range), so a mostly-hidden page fails loudly.
- **Settle, don't sleep.** A view switch re-inits artwork page-wide, so a fixed
  `waitForTimeout()` samples mid-repaint. Poll until the painted count is
  stable AND non-zero — a count of 0 means "the pass has not produced anything
  yet", not "settled". (A view with genuinely no artwork is the one exception,
  so allow zero to settle only after a longer run of identical samples.)
- **`waitForCaaEaaComplete()` DOES NOT WORK on a large page — do not reach for
  it as the artwork wait.** It waits for `#mb-info-display-caa` to become
  visible, which `_showCaaCompletionToast()` writes on the `_caaQueue`'s
  `onIdle`. On a big listing that toast never fires: measured still empty and
  hidden after 300 s (529 polls) on `artist-releasegroups` while artwork was
  visibly painting the whole time, and the same on `releasegroup-releases`'
  124-row "Greetings From Asbury Park, N.J." page — at the archive's
  ~1.2 req/s a per-entity metadata sweep of that size simply outlasts any
  sane timeout. **Poll the thing you actually care about until it stops
  changing** (painted icons, built `<ul>`s, `.mb-caa-type-badge` spans),
  per "Settle, don't sleep" above; `caa-icon-survives-sort-multi.spec.js`'s
  `waitForArtworkSettled()` is the worked example. The same applies to
  `waitForRelationshipsComplete()`/`#mb-info-display-rel`. This has cost a
  wasted run many times over, and it is ALSO why
  `releasegroup-releases-filter-sort.spec.js` fails on `main` — its
  `setupExpandedGreetingsPage()` still waits on both toasts, so all six of
  its tests fail in setup on that page regardless of the code under test.
  A "toast never appeared" timeout is evidence about the page's size, never
  about the change being tested — re-run the spec standalone, or on reverted
  code, before believing it caught anything.
- **Always uncollapse the big-image strips, in BOTH single- and multi-table
  pageTypes, and assert the uncollapse worked.** `sa_caa_pics_initially_collapsed`
  defaults true, so a strip loads *nothing* until toggled — the same
  "passes while measuring nothing" failure as a collapsed sub-table, and it
  applies to `tableMode: 'single'` too, where there is no master toggle to make
  the problem visible. Click `#mb-caa-toggle-btn-global` (and
  `#mb-eaa-toggle-btn-global` on a page carrying EAA — `tag-value-sort-overflow-row.spec.js`
  needs both), then verify the strips actually populated before measuring.
  Per-section buttons are `#mb-caa-toggle-btn-{i}`.
  There is no shared helper for this yet: roughly seven live specs hand-roll
  the click, unlike sub-table expansion which has
  `liveAssertions.js`'s `clickMasterToggleAndExpandAll()`. If you touch more
  than one of them, factor it out.

**Threshold dialogs will stall a test — check this before writing a new spec or
re-running an old one on a bigger page.** There are FOUR blocking dialogs, they
are plain DOM overlays rather than native `confirm()`s (so Playwright's
`page.on('dialog')` never fires), and the existing helper only clears three:

| Gate                         | Fires when                                                    | Shape                                                                            | Cleared by                     |
|------------------------------|---------------------------------------------------------------|----------------------------------------------------------------------------------|--------------------------------|
| `ℹ️ Unknown Page Count`       | `features.unboundedPagination` + ambiguous pagination widget  | `Lib.showCustomConfirm`, OK/Cancel                                               | `dismissCustomConfirmDialog()` |
| `⚠️ High Page Count`          | `maxPage > sa_max_page` (default **50**)                      | `Lib.showCustomConfirm`, OK/Cancel                                               | `dismissCustomConfirmDialog()` |
| `showRenderDecisionDialog()` | `totalRows > sa_render_threshold` (default **5000**)          | **three** buttons: `#mb-dialog-save` / `#mb-dialog-render` / `#mb-dialog-cancel` | **nothing — see below**        |
| `⚠️ Large Render Warning`     | `totalRows > sa_render_warning_threshold` (default **10000**) | `Lib.showCustomConfirm`, OK/Cancel                                               | `dismissCustomConfirmDialog()` |

Three things make this a live hazard rather than a theoretical one:

- **`tests/support/customDialog.js`'s `dismissCustomConfirmDialog()` cannot clear
  the render-decision dialog.** It clicks `getByRole('button', {name: 'OK', exact: true})`;
  that dialog's buttons are `💾 Save to Disk` / `🎨 Render Now` / `❌ Cancel`.
  A test that can reach it must click `#mb-dialog-render` explicitly.
- **No `tests/live/*.spec.js` calls that helper at all** — it is wired only into
  `capture-snapshots.js`, `capture-fixture.js` and `run-live-interop.js`. The
  live suite passes today only because its largest page (`artist-events`, 4174
  rows) sits just under the 5000 default. Any new spec on a bigger listing
  crosses it.
- **The last two gates fire AFTER the fetch completes**, so hitting one burns
  the entire multi-minute fetch and then times out with nothing to show. The
  symptom is a run that looks stalled with no console error and no progress.

**Preferred fix is to seed the settings so the dialogs never fire**, not to
dismiss them: `seedGmValues` in `tests/pagetypes.json`,
`buildGmStubsScript(initialValues)` for fixture specs, `realNetworkGmXhr`'s
`settingsOverride` for live specs. Dismissing is the fallback.

**One trap when seeding: `sa_render_threshold: 0` does NOT disable that dialog**,
despite the setting's own description saying "0 to disable". The code reads
`Lib.settings.sa_render_threshold || 5000`, so `0` is falsy and becomes 5000 —
seed a large number instead. `sa_render_warning_threshold` uses `?? 10000` and
*does* honour `0`. `sa_chunked_render_threshold` has the same `|| 1000` defect.
This is a real bug in the settings, filed but not yet fixed; don't write a test
against the "0 to disable" premise.

**Skills.** This project's recurring workflows are packaged as skills in
`.claude/skills/`. They are auto-discovered and listed with their own
descriptions at the start of every session, so they are NOT enumerated here —
an out-of-date list is worse than none (this file named 3 of them long after
there were 10). Check the session's skill listing, or `ls .claude/skills/`, and
prefer invoking the matching skill over improvising the workflow.

**`PERFORMANCE.org` Step numbers were reconciled — check the provenance table
before following any "Step N" reference.** Three copies of that file (`main`,
`perf-steps-1-4`, `filter-performance-fix-caa-throughput`) had drifted into
three incompatible schemes, each with a different Step 6, which silently broke
a cross-reference in the userscript's own JSDoc. Steps 1-5 never moved;
`perf-steps-1-4`'s 6-14 became canonical; `caa-throughput`'s 6/7/8 became
15/16/17; `main`'s Step 6 became 18. Branch commit messages and older
`debug/*.org` session logs still carry the OLD numbers, so map them through
`PERFORMANCE.org`'s "Step-number provenance" section rather than reading them
at face value. Its TODO/DONE keyword tracks "landed on `main`", not effort —
several steps were implemented on an unmerged branch and still read TODO.

No `// @version` bump or `ShowAllEntityData_CHANGELOG.json` entry for
anything under `tests/` — test tooling isn't part of the userscript
runtime.

**Before implementing any change to the userscript, check its test-framework
impact.** The Playwright harness under `tests/` isn't just coverage of the
script — parts of it (`tests/support/diskFixture.js` and the committed
`tests/fixtures/saved-data/*.json.gz` fixtures) are built directly on runtime
mechanisms like the Save/Load-from-Disk pipeline, so a behavior change there
can silently invalidate fixtures or turn documentation (JSDoc/comments) in
`tests/support/*.js` false without any test actually failing. Before writing
code, check for: stale JSDoc/comments in `tests/support/*.js` that describe
the pre-change behavior, existing fixtures/snapshots captured under
assumptions the change invalidates, and live-spec assertions or timing
(`waitForRenderComplete`/`waitForRelationshipsComplete`/`waitForCaaEaaComplete`
etc.) tied to the changed behavior. Call out every affected test file
explicitly in the plan/PR description, even when no test code needs to
change — a stale comment is still a defect.

## Adding a new page type — checklist

1. Add entry to `pageDefinitions` array (grouped by entity class, in
   MusicBrainz's own tab/entity ordering — NOT alphabetical; find the
   closest existing sibling in the same entity class and insert near it)
2. Set `type`, `match`, `buttons`, `features`, `tableMode`
3. Check DOM structure of the actual page — use a snapshot in `debug/`
4. If the page has no `div#content`, verify `renderGroupedTable`'s container re-root
   handles it (targetHeader must be inside the resolved container)
5. If `tableMode: 'multi'` and the page has no native h2, add `insertH2`
6. If the page has native h2s that should become h3s, add `renameH2ToH3: true`
7. If the page has no native h1 at all (its only heading is a `<h2>`), add
   `renameH2ToH1: true` plus `insertH2: '…'` — otherwise the page-load button
   toolbar and the post-render filter/count UI both end up crammed onto the
   same native heading (see `applyRenameH2ToH1`'s JSDoc; the standalone
   `debug/user-edits-wrong.org` snapshot this used to point to is gone — see
   `DEBUG-NOTES.md`'s `## 2026-07-29 — user-edits/user-open-edits cram
   everything onto one heading` entry instead)
8. Bump version, add changelog entry

## Adding a new column extractor — checklist

1. Add extractor function to `ColumnDataExtractor` with JSDoc
2. Reference by function-name string in `features.columnExtractors` of the page definition
3. Add corresponding header name strings to `syntheticColumns`
4. If the extractor produces a sort-key span, add its class to `_CLEAN_STRIP_SEL`
   (so `getCleanColumnText` does not leak sentinel values into filter matching)

## `collapsableColumns`: list vs. prose cells

`features.collapsableColumns` (an array of column-header names, see
`initCollapsableColumns`) auto-detects two independent cell shapes per
declared column — no separate feature key or page-definition change needed:

- **List cells** — a `<ul><li>` with ≥2 items, found via `_findCellListItems()`
  (near `_COLLAPSE_MATCH_SEL`), NOT a plain `:scope > ul > li` query. It
  recognises both a direct-child `<ul>` (script-generated: `renderMultiRowCell`,
  `splitCountryDate`, `video`, …) AND native MB markup that wraps its list one
  level deeper behind non-competing `<script>`/`<div>` wrappers (e.g.
  "Authors": `<td><script type="application/json">…</script><div
  class="artist-roles-container"><ul class="artist-roles">…`) — while still
  rejecting a wiki list *embedded inside* "Annotation" prose (real sibling
  text at some level along the walk up to `<td>` disqualifies it). Collapsed
  to the first `<li>`; toggle shows an item count (`▶ 2 ▤`). Every place that
  needs "does this cell have a qualifying list" must go through
  `_findCellListItems()` — a fresh `ul > li` (or `:scope > ul > li`) query at
  a new call site is exactly how this regressed once already (see git log for
  "Authors" column collapse-toggle fixes).
  **`_findCellListItems()`'s sibling "competing text" check MUST exclude
  everything matching `_CLEAN_STRIP_SEL`** (script/eaa/caa cache-hint spans,
  sort-key sentinels, and critically `.mb-cell-collapse-toggle` itself) — the
  toggle it builds is *itself* appended as a `<td>`-level sibling of the list,
  so any later re-call of this function (a click, `_applyCollapseState` from
  the column-header/global buttons) would otherwise see the toggle's own
  glyph/count text ("▶3▤") as competing prose and wrongly return `[]`,
  silently breaking that cell's collapse/expand for good the moment its
  toggle is built. This exact regression happened once already — if you touch
  this function's sibling-exclusion list, re-verify a multi-row cell's toggle
  is still clickable *after* `initCollapsableColumns` has already run once.
  Single-item list cells (`length === 1`) are excluded from prose-candidacy
  too (not just `>= 2`) — a work with exactly one author is still a list cell
  (no toggle, rendered untouched), never prose.
- **Prose cells** — free-form content with no direct-child list (e.g.
  "Annotation" columns, which are wiki-rendered `<div>/<p>/<bdi>` text — see
  `debug/annotations.html`). Always wrapped in `.mb-text-clamp-marker`
  (unconditionally — this is what `_isProseCollapseColumn` keys off, see
  below). When the `sa_enable_annotation_collapse` setting (default `true`,
  "📝 ANNOTATION COLUMNS" section in `configSchema`) is on, the wrapper also
  gets `.mb-text-clamp-inner` and is height-clamped (~4 lines); toggle shows
  a "more"/"less" label instead of a count. Only cells that actually overflow
  the clamp get a toggle. When the setting is off, cells stay bare (full,
  unclamped text, no toggle).

Two prose-cell columns carve out their own gating, independent of the
generic `sa_enable_annotation_collapse` behavior described above:
- **"Edit details"/"Edit notes"** (`edits` pageType) — always get the
  clamp/toggle regardless of `sa_enable_annotation_collapse` (that setting
  isn't consulted for them at all); `sa_edits_enable_details_collapse`/
  `sa_edits_enable_notes_collapse` control only their *initial* expand
  state instead.
- **"ARs"** (`release-tracks`) — gated by its own independent
  `sa_enable_ars_collapse` setting, with its own independent
  `sa_ars_column_max_width`/`sa_ars_column_max_height_em` clamp settings,
  not the generic `sa_annotation_*` ones.

Auto-resize (`toggleColumn`, `toggleColumnInTable`, `toggleSubTableAutoResize`,
`toggleAutoResizeColumns`) caps prose columns' measured width via
`_getProseColumnMaxWidth()` (reads `sa_annotation_column_max_width`, default
`480` — except the "ARs" column, which reads `sa_ars_column_max_width`
instead, per the carve-out above) instead of sizing them to a paragraph's
unwrapped nowrap width. This cap is **always active** for any column
`_isProseCollapseColumn` identifies (via the always-present
`.mb-text-clamp-marker`) — independent of `sa_enable_annotation_collapse`.

Both share the same `.mb-cell-collapse-toggle` DOM shape, the same
`ensureCollapseDelegate` click delegate, `_applyCollapseState` (driven by the
column-header and global mass-toggle buttons), `_syncCollapseHasMatchInTable`
(filter-match tinting), and `expandedCells` state persistence — each has a
branch keyed on whether the `<td>` contains a list or a
`.mb-text-clamp-inner` wrapper. When adding a fourth cell kind (following the
existing CAA/EAA `[data-caa-expand-btn]` precedent), extend all of: the
gathering pass in `initCollapsableColumns`, its idempotent cleanup selector,
`ensureCollapseDelegate`, `_applyCollapseState`, and
`_syncCollapseHasMatchInTable`.

Wiki-rendered `<h2>` sub-headings nested *inside* a prose cell (e.g.
"== Known performances ==" inside an Annotation cell) are a separate concern
from the cell-level clamp/toggle above — see `makeH2sCollapsible()` /
`_rewireNestedTableH2Toggles()` and the "Common pitfalls" entry on
`cloneNode(true)` dropping listeners. Their colors are `sa_annotation_h2_bg`
/ `sa_annotation_h2_color` (CSS: `table.tbl h2.mb-toggle-h2`, scoped to
out-specificity the page-level `.mb-toggle-h2` rule that uses `sa_ui_h2_bg`
— these nested headings intentionally do NOT share the page-level H2 colors).

Ctrl+Click on a prose cell's `.mb-cell-collapse-toggle`, or on the column
header's `.mb-col-collapse-hdr-btn` (Ctrl+Click expanding the WHOLE column),
always forces expand (never toggles to collapsed) and additionally calls
`h2._mbToggle(true)` on every nested `<h2>` inside the affected cell(s) —
see the `expandH2s` param on `_applyCollapseState()` and the `ev.ctrlKey`
branches in `ensureCollapseDelegate()`. `_proseToggleTitle()` builds the
per-cell tooltip text, mentioning the shortcut only when that specific cell
actually contains a nested `<h2>` (`columnHasNestedH2` does the same for the
column-header tooltip) — do not hardcode the Ctrl+Click hint into a cell/
column that has no headings to expand.

**`_classifyCollapseCell(cell)`** (near `_COLLAPSE_MATCH_SEL`) is the single
source of truth for "is this cell multi-row / single-row?", unifying list
cells (via `_findCellListItems()`, ≥2 items) and prose cells (a
`.mb-cell-collapse-toggle` present — i.e. it overflowed its clamp) under one
concept. Every place that independently answers this question must go
through it — it replaced several ad hoc, inconsistent
`cell.querySelectorAll('ul > li')` checks (unscoped, so also matched a wiki
list *embedded inside* Annotation prose, and blind to prose cells entirely)
in `testRowMatch`'s multi-row column filter, `openUniqDrop`'s "Cell
structure" counts, `_updateAllColHeaderCounts`'s `.mb-col-collapse-count`,
and `showStatsPanel`'s per-column multi-row count. A new call site with its
own hand-rolled `ul > li` count is exactly how this bug came back twice
already — don't reintroduce it.

**The column's NAME has the same rule, and a nastier reason: resolve it with
`_cleanColHeaderText(th)`, never a `th.textContent` regex strip.**
`_initColHeaderGlyph()` gives a column an entity glyph, and
`_guardGlyphAgainstEmptySelectorHiding()` appends **U+200B** to that span so it
is never an empty selector target. U+200B is **not JS whitespace** — neither
`\s` nor `.trim()` touches it — so a strip that removes the glyph CHARACTERS
still yields `"Instruments​"`, which matches nothing in
`collapsableColumns`. `initCollapsableColumns()` knew this and used the
resolver; `openUniqDrop()`'s `isCollapsableCol` hand-rolled the strip, decided
every glyph-bearing column was not collapsable, and silently dropped the 📊
"▶ collapsed"/"◀ expanded multi-row cells" entries — while the header directly
above showed its `▶9▤` toggle. It looked like two different bugs, because a
column WITH empty cells still got a Structure section (containing only
"○ empty cells") and a column without got none at all. Fixed in the version the
`// @version` header names; `tests/fixtures/uniq-drop-collapse-gate-glyph-column.spec.js`
pins the header count and the dropdown count against each other, and asserts the
U+200B trap itself so the guard's reason cannot evaporate unnoticed.

## The collapsed-cell "there is a match in here" tint is highlight-driven

`mb-collapse-toggle-has-match` on a `.mb-cell-collapse-toggle` (and on a
`[data-caa-expand-btn]`) means "expanding this cell reveals something the
current filter matched". Its ONLY input is `_COLLAPSE_MATCH_SEL` — the four
highlight classes — found inside the HIDDEN `<li>`s (`lis.slice(1)`), or
anywhere inside a prose cell's `.mb-text-clamp-inner`. Roughly ten sites read
it: `initCollapsableColumns()`'s initial stamp, `_syncCollapseHasMatchInTable()`'s
three passes, four arms of `ensureCollapseDelegate()`/`_applyCollapseState()`,
`updateSubTableCollapseButton()` and `updateGlobalCollapseButtonHighlight()`.

**So a STRUCTURAL filter — one with no text to type — gets no tint unless it
writes a highlight span of its own.** That is not a quirk of the tint; it is
what makes adding one cheap. The `⏳` pending-edits toggle had exactly this
gap: `.mp` is a CSS-only marker carrying no text, `testRowMatch()` consulted
`ctx.pendingEditsOnly` as a predicate and marked nothing, and a collapsed
"Authors" cell hiding the pending author looked identical to one with no
pending author at all. Measured on
`debug/artist-works-pending-edits-collapsed.html`: 12 toggles, 0 tinted, with
`span.mp` at `<li>` index 1 and 2 of `td.mb-has-collapse-toggle` cells.

**The fix is one hook, not ten.** `_highlightRowPendingEdits(row)` is called
from `testRowMatch()`'s existing `if (finalHit && !matchOnly)` block and
delegates to `_highlightPendingEditsMatch(td, 'pending-edits-yes')`, the helper
the 📊 `⏳ has pending edits` entry already used — so the class is
`mb-column-filter-highlight`, which is already in `_COLLAPSE_MATCH_SEL`, already
cleared by `testRowMatch()`'s own reset, and already unwrapped by
`getCleanColumnText()`. **Do not invent a new highlight class for a case like
this**: it would have to be added to `_COLLAPSE_MATCH_SEL`, to the reset, to
`getCleanColumnText()`/`getCleanVisibleText()`'s unwrap, to `clearAllFilters()`
and to the ~10 sites that spell the four classes out by hand.

Three properties that make the hook safe, each of which a different rule in
this file would otherwise demand work for:

- **It runs on the CLONE.** `runFilter()` calls `testRowMatch(clone, matchCtx)`
  with `matchOnly` false; the source rows are matched with `matchOnly` true and
  never mutated. So none of the "Writing cell text AFTER the render" obligations
  apply — no `_rowTextCache` clear, no uniq-dropdown invalidation.
- **`_buildFilterKey()` already carries `p: !!matchCtx.pendingEditsOnly`**, so
  `_filterResultCache` cannot replay a pre-toggle row list.
- **`initCollapsableColumns()` runs after the highlight pass**, from the render
  tail, so the tint needs no extra sync call.

Pinned by `tests/fixtures/pending-edits-collapsed-cell.spec.js`, which asserts
that EXACTLY the toggles whose hidden `<li>`s carry a `span.mp` are tinted — "a
toggle is tinted" would also pass if every toggle were.

## `release-tracks`: dynamic AR-column classification

`release-tracks` does NOT use the generic `columnExtractors`/
`syntheticColumnExtractors`/`injectedColumns` pipeline described above — it
has its own bespoke system, `applyExtractTrackTitleData()`, because it needs
in-place DOM surgery on the Title `<td>` rather than additive per-column
extraction. Every relationship ("AR") on a track lives as sibling
`<dt>label:</dt><dd>target(s)</dd>` pairs inside `<div class="ars"><dl
class="ars">`; a handful of shapes get dedicated columns (Recording of/date,
Recorded at event/place, Recorded in area, Mixed at place, Performer, the
five `CREDIT_ROLES` engineer/producer/mixer/etc. columns, Phonographic
copyright by artist/label, Produced for label, Instruments, Vocals) and
everything else is auto-discovered. Column order is controlled purely by the
SEQUENCE these insertion blocks run in inside `applyExtractTrackTitleData`
(all `.before()` against one shared `_arsHeaderRef` — see the "Common
pitfalls" entry below) — check that block first before assuming a column's
position needs a new mechanism.

**`_classifyArDt(dt)`** is the single source of truth for "what kind of AR
relationship is this `<dt>`", checked in priority order:

1. **Fixed handler** (`_dtMatchesAnyFixedHandler`) — matches any of the
   dedicated columns above via the same `roleWords`/`_creditDtMatch`
   machinery those columns already use.
2. **Instrument/Vocals** (`_parseInstrumentVocalsDt`) — a `<dt>` whose
   content is ENTIRELY instrument credit(s) and/or a vocals credit (with
   recognized attribute-word prefixes: additional/guest/solo/lead/
   background/spoken/choir). A single unrecognized word anywhere rejects
   the WHOLE `<dt>`, not just one component — this is what correctly keeps
   e.g. `<dt><a href="/instrument/…">strings</a> arranger:</dt>` OUT of
   "Instruments" ("arranger" isn't a recognized attribute word), leaving it
   for the dynamic fallback to claim as its own "Strings arranger" column.
3. **Dynamic fallback** — anything else gets bucketed by its own literal
   phrase text (`_dynamicRolePhraseKey`, lowercased/whitespace-collapsed) into
   an auto-created column, sentence-cased for display
   (`_dynamicRoleDisplayName`). Two different phrases NEVER merge (e.g.
   "strings arranger:" and "cello arranger:" become two separate columns) —
   simple, predictable, and immune to future MusicBrainz relationship types
   without a code change.

Both the page-wide "does any track need this column" scan and the per-row
`<td>` builder call `_classifyArDt` — never re-derive the classification
independently at a new call site, or the two can silently disagree.

**Entity-kind column-name uniqueness** (`_splitColumnByEntityKind`/
`_buildKindSplitListTd`, generalized from the original "Phonographic
copyright (℗) by artist"/"…by label" special case): when a relationship's
targets span more than one entity kind on the page (detected via each
target's own `<span class="{kind}link">` marker — `KNOWN_ENTITY_LINK_KINDS`
lists every kind actually seen: recording/artist/label/place/event/work/
area/series — `recording` was added later, for dynamic recording-to-
recording columns like "Samples"/"Music videos"), the column CAN split into
one per kind, named `` `${baseColumnName} ${kind}` ``.
A single-kind relationship's column name is never suffixed.

**`PEER_SPLIT_KINDS` — only `artist`/`label`/`recording` may ever trigger
that split.** This is a load-bearing distinction, not an arbitrary
restriction — two different relationship *shapes* share the same
`<span class="{kind}link">` marker syntax but need opposite treatment:
- **Peer-shaped** (artist/label/recording): repeated markers of the same or
  different peer kind mean MULTIPLE DISTINCT credited entities
  (comma/"and"-joined artists, or a mix of artists and labels — see
  `_buildPhonographicCopyrightTds`; comma/"and"-joined source recordings on a
  dynamic-fallback column like "DJ-mix of", a 26-target credit — the
  `debug/DJ-mix-of-original.html` snapshot this used to cite is gone, so see
  `DEBUG-NOTES.md` for the dated entry instead). Each marker is a real segment
  boundary. `recording` is
  safe here specifically because a credited recording's own artist marker
  (`<span class="artistlink">`) always sits nested inside a `<bdi>`, never as
  a direct child of `<dd>` — so it never itself competes as a second kind, and
  `_collectEntityKinds` reports only `{recording}`, keeping the column
  unsplit/unsuffixed even with multiple targets.
- **Chain-shaped** (place/event/work/area/series): a SINGLE primary target
  (if any) accompanied by its own nested geographic/hierarchical decoration
  that legitimately reuses `arealink` repeatedly — e.g. a place's own "in
  `<area>`, `<area>`, `<country>`" chain, or an area crediting its OWN parent
  area (`"recorded in:"`, `"mixed at:"` — see `debug/therising.html`).
  Marker KIND alone can't tell "the credited target" from "its own
  decoration" here, sometimes not even marker IDENTITY (an area's own
  ancestry reuses the exact same `arealink` class as the area itself).
  `recording` deliberately stays OUT of this category: a dynamic-fallback
  recording-to-recording relationship never nests a `recordinglink` inside
  another as its own "decoration" the way an area nests its own ancestry.

Treating a chain-shaped relationship as peer-splittable is exactly the bug
that shipped once already: "mixed at:" fragmented into separate "…place"/
"…area" columns, and "recorded in:" showed only its first area, dropping the
rest of the chain and the trailing date. Any relationship shaped like that
needs its OWN dedicated handler (`_buildRecordedAtPlaceTd`/
`_buildRecordedInAreaTd` — segment on the ONE primary marker only, or don't
segment at all when cardinality is 1) rather than the generic kind-splitter;
the dynamic-fallback discovery scan (`_dynamicRoleColumns`) always filters
through `_filterPeerKinds` before calling `_splitColumnByEntityKind`/
`_buildKindSplitListTd`, so an unrecognized FUTURE chain-shaped relationship
safely falls back to `_buildKindSplitListTd`'s `kinds.size === 0` "clone
whole `<dd>` verbatim, one row" behavior instead of fragmenting.

**Runtime `collapsableColumns`/header-glyph registration**:
`initCollapsableColumns()` and `_initColHeaderGlyph()` both match columns by
exact header-text string only — no wildcard support — so a
dynamically-discovered column's name (unknown at authoring time) can't be a
pre-declared page-definition entry or a static `_initColHeaderGlyph()` call.
Instead, `applyExtractTrackTitleData(def)` pushes each dynamic column's name
onto `def.features.collapsableColumns`, and — via `_glyphClassForDynamicColumn`,
which picks the first entity kind present by priority order (whether the
column carries exactly one kind or several, e.g. a chain-shaped multi-kind
decoration) — a `{columnName, glyphClass}` pair onto
`def.features._dynamicArColumnGlyphs`,
both at `<th>`-creation time (dedup-guarded, since this function can re-run
per its own idempotency design). This works because `def` is the exact same
object reference as `activeDefinition`, and `applyExtractTrackTitleData`
always runs (during `startFetchingProcess`) before `initCollapsableColumns()`/
the glyph re-injection loop are ever called (from `renderGroupedTable()`'s
tail) — a NEW static/fixed AR column (not dynamically-discovered) still
needs its OWN explicit `_initColHeaderGlyph('Column Name', 'kindlink')` call
added to that tail, mirroring the existing ones for "Recording of
work"/CREDIT_ROLES/etc. — don't forget it, or the header silently renders
with no icon (exactly the second half of the bug above).

## `release-tracks` has TWO AR levels, and the finders must not be merged

Everything above describes the RECORDING's own relationships. A track also
carries the **work's** — and they live one nesting level below, inside the
`<dd>` of the `recording of:` `<dt>` (`debug/work-ARs.html`):

```
td.title > div.ars
  dl.ars > dt "recording of:"
           dd  > a[/work/…]
                 dl.ars > dt "publisher:"              (artist)
                          dt "lyricist and composer:"
                 dl.ars > dt "publisher:"              (label)
                 dl.ars > dt "is based on:" ×3
```

**`_findAllArDts()` is `:scope > dl.ars > dt` and must stay that way.** That
scoping is why the work `<dt>`s reach neither `_classifyArDt()` nor the
dynamic-fallback scan — correct, since they are the work's relationships and
not the recording's, and also why they rendered nowhere but the raw "ARs"
column for the whole life of the feature. `_findWorkArDts()` is the second
finder; widening the first one instead would merge two relationship levels
into one set of columns.

Everything downstream is the dynamic-fallback mechanism re-used verbatim —
`_collectEntityKinds`, `_filterPeerKinds`, `_splitColumnByEntityKind`,
`_buildKindSplitListTd`, `_glyphClassForDynamicColumn`. What differs is the
keying, and each difference is load-bearing:

- **A separate `_workRoleColumns` Map, and a `work ` key prefix**
  (`WORK_AR_KEY_PREFIX`). A work `arranger:` and a recording `arranger:` are
  different relationships between different entities. Sharing a Map buckets
  them together; sharing a column NAME is worse, because the header block's
  own `_headerCells.some(...)` dedup then silently drops the second one.
- **`_workRoleComponentKeys()` SPLITS on `,`/` and `** — the exact opposite of
  `_dynamicRolePhraseKey`'s "two different phrases NEVER merge" rule, and
  deliberately so. On Born to Run seven tracks say `lyricist and composer:` in
  one `<dt>` while the eighth states the roles separately; unsplit that is
  three part-filled columns instead of a full `Work lyricist` and
  `Work composer`. The split pattern is `_creditDtMatch`'s own, so the two
  agree on what a component is. A `<dt>` yielding two keys feeds BOTH columns
  from its one `<dd>`.
- **`work` stays OUT of `PEER_SPLIT_KINDS`.** `is based on:`'s multi-row cell
  comes from its three sibling `<dt>`s through `_buildKindSplitListTd`'s
  `kinds.size === 0` branch, not from peer splitting. Adding `work` there
  would be a different change with the chain-shape risk that JSDoc describes.
- **Never `.find()` a work `<dt>`.** `is based on:` is three `<dt>`s on one
  track — the same shape already fixed twice, for
  `_findPhonographicCopyrightDts` and `_findRecordedAtDt`.

**`def.features._workArColumnNames` is a second registry beside
`_dynamicArColumnGlyphs`, on purpose.** The glyph array records only a column
that RESOLVED a glyph, and "is this an extracted column" (the header tint) is a
different question from "does it have an entity icon". Every work relationship
in real data credits an artist, a label or a work, so the two lists are
identical today and no fixture can tell them apart — recorded as an honest
`expect: "pass"` in the mutation list rather than left looking covered.

**Placement is part of the requirement, not a detail.** The columns sit between
`Recorded in area` and `Performer`, so a track reads recording → the work it
records → who played on it → raw ARs. Header creation order and row `<td>`
append order are mirrored by hand, as everywhere else in this function, and
`_workColumnThs.length === 0` had to join the row loop's no-op early return —
otherwise a table whose ONLY new columns are work ones keeps its `<th>`s while
every row comes up short.

Gated by `sa_enable_release_tracks_work_ar_columns` (default **true**), read as
`!== false`. Covered by `tests/fixtures/release-tracks-work-ars.spec.js`, which
reuses the committed `release-tracks-ms-length.html` fixture (the real Born to
Run page — it already carries every shape this needs); mutation list
`scripts/mutations/release-tracks-work-ars.json`.

## Unique-values dropdown: `SYN_SECTION_META` section-splitting

The per-column unique-values filter dropdown (`openUniqDrop()`) renders
collapsible sections inside a `synBox`, driven by three module-level tables
(defined together, just above `openUniqDrop()` itself):

- **`SYN_SECTION_META`** — `{ key: { label, glyph|markerClass } }`, the
  display metadata (name + icon) for every possible section.
- **`MB_UNIQ_MODE_TO_SECTION`** — maps a `makeSynItem()` "mode" string (a
  fixed structural/flag state, e.g. `empty`/`collapsed`/`title-mismatch`/
  `multi-medium`) to a `SYN_SECTION_META` key.
- **`MB_UNIQ_KIND_TO_SECTION`** — maps a `makeValueSynItem()` "kind" string
  (a dynamic per-value entry, e.g. `attr`/`date`/`formatsize`/`role`) to a
  `SYN_SECTION_META` key.

`getOrCreateSynSection(key)` lazily creates each section's DOM (header +
collapsible items box) on first use and caches it — sections render in
`synBox` purely in first-requested order, driven by the fixed call sequence
of `makeSynItem()`/`makeValueSynItem()` calls inside `openUniqDrop()`, not
by `SYN_SECTION_META`'s own object-key order (which just mirrors it for
readability).

Two kinds bypass the static `MB_UNIQ_KIND_TO_SECTION` table entirely and
resolve their target section dynamically inside `makeValueSynItem()`'s own
`sectionKey` ternary, because a static kind→section map can't express a
target that depends on data outside the kind string itself:
- `'name'` → routes to `` `entity_${entityType}` `` (falls back to
  `entity_other`), keyed by the entry's own `entityType`.
- `'arttype'`/`'artcomment'` → route to `caaInfoType`/`caaInfoComment` or
  `eaaInfoType`/`eaaInfoComment`, keyed by BOTH which column is actually
  open (`_caaOrEaaColName`) AND the kind itself.

One caveat: `makeInlineArtItem()` (inline-artwork-presence entries) is a
bespoke sibling function that bypasses `MB_UNIQ_MODE_TO_SECTION` altogether
and hardcodes its target section (`structureInlineArt`) directly — don't
assume every mode in that table is actually routed through it; check the
mode's real caller first.

**Naming convention**: every section label follows `"Topic - Capitalized
subtopic"` (a dash, capitalizing only the first word after the dash — e.g.
`'Credit details - Attribute'`, `'Release events - Country'`). This is the
single convention in force as of this file's latest revision; two earlier
deviations (`'Release events - country'` lowercase, and `'Country name
details'`/`'Country code details'` with no dash at all) were normalized to
match it. Any new section should follow this convention.

**Recognizing a split candidate**: when a `SYN_SECTION_META` key is fed by
2+ semantically distinct `kind`/`mode` strings — grep both lookup tables for
every value pointing at the same key — that's the same shape as every split
below. To split it: give each kind/mode its own `SYN_SECTION_META` key (or
extend the dynamic `sectionKey` branch in `makeValueSynItem()` if the
target genuinely depends on runtime data, not just the kind/mode string),
then update whichever lookup table(s) fed the old flat key. No other code
needs to change — `getOrCreateSynSection()`, `_applySynBoxQuickFilter()`
(iterates `_synSections` generically), and `MB_UNIQ_SECTION_COLLAPSE_KEY`
persistence (a plain string-keyed object, no fixed-key validation) all key
off the section key generically already. Not every multi-kind bucket is a
split candidate, though — `structure`'s own five cell-shape modes
(`empty`/`single`/`collapsed`/`expanded`/`any`) and `catalogPresence`'s
three prefix-flags stay merged deliberately: each group is genuinely one
topic (mutually-exclusive facets of one question), unlike the buckets
below, which mixed unrelated topics under one header.

**Split history**, for context:

| Version   | What split                                                                                                                                                                                                                        |
|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v9.99.872 | "Entity info" → one sub-section per entity type (`entity_*`) plus Comment/Alias                                                                                                                                                   |
| v9.99.873 | New sections carved out: Format info, Release events (country/date/weekday), Country name/code details, Tracks info, Catalog info                                                                                                 |
| v9.99.882 | New "Event info" section (event dates on native tag-value listings)                                                                                                                                                               |
| v9.99.886 | "Event info" renamed to "Event info - Event date"; new sibling "Event info - Event cancelled"                                                                                                                                     |
| v9.99.893 | "Credit details" → `creditAttr`/`creditTask`/`creditDate`/`creditInstrument`/`creditAltName`                                                                                                                                      |
| next      | Structure/Flags/Format info/Tracks info/Catalog info/CAA info/EAA info each split further; "Release events"/"Country details" labels normalized to the current naming convention (see `// @version` header for the exact version) |

## Flags in the dropdown: two third-party shapes, and what "hollow" means

`hasFlagIcons` is a column-NAME whitelist and `iconSel` is a SHAPE selector.
Both have to recognise a column before any flag reaches the 📊 panel, and each
has been the sole reason a column showed none.

**"Right Side Flags Everywhere" has TWO shapes and picks by whether the `.flag`
element wraps an `a[href*="/area/"]`.** This is the whole of the double-flag
story and is not obvious from the script's name:

- **With an anchor** — it neutralizes the sprite in place and puts its `<img>`
  in a sibling `span.mfe-flag-wrapper`. Excluded by `iconSel` since the Israel
  fix.
- **Without one** — `el.appendChild(img)` puts the `<img>` INSIDE the flag
  element and leaves the hollow element in the DOM. Both then matched
  `iconSel`, so one cell icon rendered as two dropdown icons, one before the
  name and one after.

Anything this script BUILDS is the anchorless case unless it emits a real
`<a>`, which is why the injected "Release country" column hit it and native
markup never did.

**Never infer "a userscript neutralized this flag" from the absence of a
paintable background.** They are different facts, and conflating them breaks a
working guarantee: a native flag paints from MusicBrainz's sprite stylesheet,
which is **absent in every fixture** and briefly absent on a slow real page, so
`resolveFlagVisual()` legitimately returns null for a perfectly good flag.
Keyed on that absence alone, `_bakeFlagIconNode()` stripped the trailing flag
from every "Entity info - Area name" entry — caught by
`uniq-drop-area-name-flag-position.spec.js`. Key on the userscript's own
`data-hq-processed` marker instead.

**A release event's country and date need an explicit gap, in TWO places.**
MusicBrainz's own markup puts `.release-country` and `.release-date` adjacent
with no whitespace, and this script's injected column reproduces that exactly.
Once a flag userscript replaces the sprite with a real `<img>`, the date ends up
against the flag on EVERY release-event column, native ones included. The gap
goes on `.release-date` (a stylesheet rule), never on the image — that script
sets its margins inline WITH `!important`, which no stylesheet rule can outrank.
CSS alone is not enough: the 📊 panel rebuilds an entry from `flagIconMap`
segments and never clones `.release-date`, so it needs `spaceAfter` on the icon
segment. Scoped to an icon inside a `.release-country`, because elsewhere an
icon decorates the text that FOLLOWS it and a blanket space would push every
flag away from its own name.

**A real flag NEVER goes in a dropdown entry's leading marker slot.** That slot
holds a generic entity glyph (`arealink` and friends); the flag is appended
AFTER the label, so an entry reads `[glyph] » area name: Spain [flag]`. This
was settled once for `'name'` entries and then drifted, because `'revcountry'`/
`'countrycode'` arrive by a different route — they pass their flag as a CLASS
STRING in `glyphClass` while `'name'` passes a baked NODE in `flagNode`, and the
marker slot rendered whatever `glyphClass` held. One panel showed both
conventions at once. A new flag-bearing kind must pick the trailing slot.

**Every `.flag` clone BAKED FROM A CELL carries `data-hq-skip`.** The class-only
glyph spans above deliberately do not: they have no inline background to
protect and are painted by the page's own stylesheet or by the flag userscript
itself, so opting them out would leave an empty span. RSFE's own rule
`.flag:not([data-hq-processed]):not([data-hq-skip]) { background-image: none
!important }` beats a normal-priority inline background (author `!important`
outranks normal inline in the cascade), and its MutationObserver watches
`document.documentElement` while the panel is appended to `document.body` — so
an unmarked clone is blanked and then redecorated with a foreign image.

**`iconSel` and the bake guard cover for each other, in both directions.**
Mutating either one alone leaves `uniq-drop-hollow-flag-double-icon.spec.js`
green; only removing both reproduces the defect, and
`scripts/mutations/release-events-native-markup.json` records that as one
combined entry plus two `expect: "pass"` singles. Do not "tidy" either guard
away on the evidence that its own mutation passes.

## The cell finders must agree on where one entity ends, and a 📊 pick AND's a typed filter

Two defects from the same report
(`org/uvd-filtering-join-phrases-missing-bug.org`, DEBUG-NOTES 2026-09-21), on
`/work/<mbid>`'s native Artist column. They are unrelated in mechanism and
worth keeping apart.

**`_findCellJoinPhrases()` and `_findCellEntityRefs()` answer the same
question** — where does one credited entity end and the next begin — and they
disagreed for the whole life of the feature. The entity finder walks up with
`a.closest('bdi')`, so MusicBrainz's own native `<span class="mp">` open-edits
wrapper is transparent to it. The join-phrase finder demanded a DIRECT-child
`<a>` (or a direct-child `span.name-variation`), so
`<bdi><span class="mp"><a>Guns N’ Roses</a></span> feat. <a>Bruce
Springsteen</a></bdi>` reported ONE entity and `" feat. "` existed nowhere: not
in the 📊 "Join phrases" section, not for `_cellMatchesStructureMode()`'s
`joinphrase:` mode, not for `_highlightJoinPhraseMatch()`. **The symptom that
identified it was what the same cell DID offer** — its "» artist name: Guns N’
Roses" entry. A finder that disagrees with its neighbour about one cell is the
shape to look for here.

- **The boundary is now structural, not an allowlist of wrapper classes.** For
  each consecutive anchor pair: their nearest common ancestor inside the
  `<bdi>`, then each anchor's own highest ancestor strictly below it. Do not
  "simplify" that to a walk up to the `<bdi>` — that handles `.mp`,
  `.name-variation` and both nesting orders, and still drops the phrase when
  ONE wrapper encloses both anchors. Fixture row H is the only guard on that
  half, which is why `uniq-drop-join-phrases.spec.js` asserts each cell
  separately rather than in aggregate.
- **The highlight anchor is the first text node that CARRIES TEXT**, not the
  first text node. MusicBrainz nests each entity's own `<span class="comment">`
  inside the shared `<bdi>`, so the slice between two anchors is routinely
  `[ " ", <span class="comment">, " & " ]` — three nodes for a
  one-character phrase — and the mark was landing on the non-breaking space in
  front of the PREVIOUS entity's comment.

**A 📊 selection NARROWS a typed column filter; it does not replace it.** The
panel counts the rows currently VISIBLE, so with text already in the box its
badges mean "…and that text". Overwriting the text made the badge and the
result disagree: `(3)` on "» join phrase: with" produced 9 rows. The typed text
is stashed on `input.dataset.mbUniqTypedText` at the transition into value-set
mode, and **`getColFilters()` can now return TWO descriptors for one column
index** — the `isMultiValueFilter` one and a plain one built from the stash.

- **Nothing downstream needed teaching, and that is the design.**
  `testRowMatch()` iterates `colFilters` and breaks on the first miss (so they
  AND), both highlight loops iterate it (so the typed text keeps its mark), and
  `_buildFilterKey()`/`_buildIncrPartialKey()` map over it (so the stash enters
  both cache keys with no new field, and no pre-selection row list is replayed).
  **Anything NEW that indexes `colFilters` by column must not assume one entry
  per column.**
- **Every clear path goes through `_clearColFilterValueSet()`.** The stash is
  INVISIBLE — the input shows a summary label — so a site that clears only
  `mbUniqValues` leaves the column narrowed by text the user can neither see nor
  reach. `mbUniqValues` alone was forgiving about this, because
  `getColFilters()`'s empty-field early return deletes it; that return is
  unreachable while the field displays a label. `clearAllFilters()` had in fact
  been relying on exactly that self-heal.
- **The stash is written ONCE, on the transition.** From the second checkbox on,
  `input.value` holds the composite label, so re-reading it appends the label to
  itself.
- **The reverse order stays asymmetric on purpose**: typing into a field holding
  a value set still drops it. The field's text IS the summary, so editing it can
  only mean editing that string.

**Two testing notes.** This pageType's tbody is led by a `<tr class="subh">`, so
it renders GROUPED — and on a grouped render `#mb-filter-status-display` reports
only the GLOBAL filter, reading `"✓ Global filter"` from the first column-filter
change onward and never changing again. `waitForFilterSettled()` therefore works
exactly ONCE per test and then times out on a baseline identical to its last
read. Poll the visible row set for a KNOWN value instead, which also refuses a
trigger that silently did nothing. And assert the badge count against the row
count rather than against a literal: the agreement is the guarantee, and a
literal passes while both sides drift together.

## Track length precision (`Length` column) and the `treleases` trap

**`treleases` is a NATIVE MusicBrainz class**, not a jesus2099 marker. A
release page renders its Length column as `<th class="treleases">` plus one
`<td class="treleases">` per track — verified in
`tests/snapshots/release-tracks/raw.html`, which the Playwright harness
captures with only this script loaded (9 occurrences, zero `jesus2099`
strings). jesus2099's `RECORDING_LENGTH_COLUMN` merely REUSES that class name
on the page types MusicBrainz does not mark (work, artist-relationships,
place-performances), and never adds it alone — the same statements also set
its own script name as the `title` and, on the header, a yellow
`text-shadow`. `_isJesus2099Treleases()` tests for exactly that
co-occurrence and is the ONLY correct way to ask "did jesus2099 put this
here"; three separate call sites once keyed on the bare class and were each
deleting native markup (see git log). Anything new that touches `treleases`
must go through that predicate.

**A `title` THIS script writes is not evidence of jesus2099**, and the
carve-out is load-bearing. The predicate's cheapest discriminator is bare
`title` presence — sound only because nothing else ever put one on a Length
`<th>`/`<td>`. `_initLengthColHeaderTooltips()` now does, and without the
exemption it made the predicate report the release tracklist's own NATIVE
header as jesus2099's: `purgeJesus2099Artifacts()` then stripped
MusicBrainz's `treleases` class off it and removed the tooltip again on
every render — the exact destructive failure above, reintroduced from a
completely unrelated direction. Our tooltips carry `data-mb-col-tip`, and
BOTH bare-`title` call sites (`_isJesus2099Treleases()` and
`_stripJesus2099InTable()`'s disposition-3 title removal) go through
`_isOwnColumnTooltip()`. Anything that puts a `title` on a `treleases`
`<th>`/`<td>` must mark it the same way.

`purgeJesus2099Artifacts()`/`_stripJesus2099InTable()` strip every remaining
jesus2099 artifact from the tables this script renders — header row included,
plus the captured source rows in `groupedRows`/`allRows` (cleaning only the
live DOM would let the next `runFilter()` keystroke paste them back from the
clones). Scope stops at `table.tbl`: jesus2099's features on the surrounding
page keep working. The cover-art icon family is deliberately EXCLUDED — it
already has its own `_hadInlineArtPh`-gated handling in
`applyColumnErasers()` Strategy 2 / `_stripTransientCellState()`.

**Sorting** goes through `_sortColumnKind()` (`'duration'`/`'numeric'`/
`'text'`) for BOTH `createSortComparator()` and
`createMultiColumnComparator()` — they used to disagree. `_compareDurations()`
returns a DIRECTION-FINAL number, which is how `"?:??"` is pinned last in
both directions; a caller must never negate it, and only its `0` may fall
through to a tie-breaking column.

**`release-tracks` has a SECOND duration column, "Recording length"**, fed by
`tracks[].recording.length` from the same embedded payload
(`_buildReleaseRecordingLengthMap()`), inserted right after the native
"Length" by `applyExtractTrackTitleData()`. It is page-wide-gated by
`_releaseHasDifferingRecordingLength()` — added ONLY where some track's
recording length is present AND disagrees with its track length, so it can
never render as an exact copy of "Length". A track length with no recording
length behind it deliberately does not qualify (that alone would be a column
of `?:??`). Its cells carry the same `data-mb-ms`/`data-mb-sec-text` stamps,
which is the whole reason the single ⏱ button switches both columns:
`_msApplyLengthPrecision()` rewrites every `td[data-mb-ms]` on a row, NOT one
resolved column index. Independent of `sa_enable_ms_track_length` — that
setting governs the toggle and the stamping, not whether the column exists.

**Track-vs-recording length mismatch flagging** (`_lengthMismatchFlag()`/
`_applyLengthMismatchFlag()`, release-tracks only) marks BOTH duration cells
when the two lengths differ by more than `sa_release_tracks_length_mismatch_threshold_ms`
(default 1000), promoting `⚠️` to `❌` past `threshold × sa_release_tracks_length_mismatch_severe_factor`
(default 3). The severe level is disabled whenever that product is not
strictly greater than the threshold — a factor of 1, or a threshold of 0.

**The marking is ATTRIBUTES ONLY (`data-mb-len-flag`), with the tint and the
glyph both coming from CSS (`td[data-mb-len-flag]::after`).** All three
reasons are load-bearing, and two of them are silent if broken:
- `applyIntegerColumnStyling()` rebuilds these cells with
  `cell.textContent = ''` to build the `:`-alignment spans, so a marker
  appended as a CHILD is simply deleted.
- A glyph in the cell TEXT reaches `_compareDurations()`, which parses this
  column's rendered text — the flagged row would sort as if its duration were
  unparseable — and would also widen that one row's colon-split segment.
- Attributes survive `cloneNode(true)`, so the marking needs NO re-wire hook
  on any render path. A JS-painted marker would need one on every path.

The `<td>`s also carry `data-mb-col-tip` alongside their `title`, for the
same reason the headers do — a native Length `<td>` is `class="treleases"`,
and `_isJesus2099Treleases()` reads "a treleases cell with a title" as
jesus2099's. See the `treleases` section above.

**What attributes do NOT survive is serialization.** Save to Disk and the
sub-table handoff store a cell as its `innerHTML` (`_buildDiskCellData()`), so
until this was fixed a reopened tracklist lost every flag, tint and LENGTH
button — no error, the table just looked clean. The writer now records
`lenFlag`/`lenTip` in the cell record, and `_restoreLenMismatchFlag()` puts them
back from BOTH of `_hydrateAndRenderFromSnapshotData()`'s cell loops. Three
things about it are deliberate:
- **Restored as saved, never re-derived.** The millisecond values the
  comparison needs do not survive a snapshot either (`data-mb-ms` — see the
  millisecond section below), so there is nothing to recompute from. Only the
  on/off switch is honoured on load.
- **Allowlisted.** A saved file is user-supplied data: only `warn`/`severe`
  reach `data-mb-len-flag`, and the tooltip only as a string.
- **The reader re-sets `data-mb-col-tip`**, or a SECOND save would refuse the
  tooltip (the writer takes a title only when that marker says it is ours).
  Only the save-again test in `len-flag-disk-roundtrip.spec.js` sees this.

Any other `<td>`-level state a feature needs after a reload has the same
problem, and the rel cell's `mbid`/`relDone` is the older precedent for the
same fix.

**The `(N) LENGTH ⚠️`/`(N) LENGTH ❌` summary buttons filter STRUCTURALLY**,
not by typing a glyph into the global filter the way the live-date
WARNING/ERROR buttons do (they can, because `.mb-live-date-flag`'s glyph is
real cell text; this one has no text at all). `testRowMatch()` reads the
module-level `_lenMismatchFilterKind` directly. Three things must stay in
sync with it, each of which broke in testing:
- **`_buildFilterKey()` must include it.** It appears nowhere else in the
  key, so "no query, no column filters" hashed identically whether the flag
  filter was on or off — `_filterResultCache` returned the previous pass's
  rows and pressing the button a second time did nothing at all.
- **`_countLengthMismatchRows()` must count the SOURCE rows (the arrays
  `_msSourceRows()` flattens), not the live tbody.** `runFilter()` REMOVES
  non-matching rows from a multi-table tbody rather than hiding them, so a
  live-DOM tally reports only what the current filter left — filtering to ⚠️
  made the ❌ button vanish.
- **`updateFilterButtonsVisibility()` must count it as an active filter**, or
  the rows narrow while every "clear" affordance stays hidden. It is the one
  active filter with no input holding it, so `clearAllFilters()` resets it
  explicitly too.
- **Its count and the ⏳ pending-edits counts are memoized per source-row
  ARRAY** (`_sourceRowTally()`, PERFORMANCE.org Step 26), validated by the
  array's length, with no invalidation hook: every way the row set changes —
  fetch, hydrate, sort, resume — replaces or grows an array. The one thing
  that would go stale is a write of `data-mb-len-flag` or `span.mp` into a row
  that is ALREADY captured; no such writer exists, and one that ever does must
  replace the array. Don't "simplify" the key to the length alone: two
  same-sized sub-tables would then share one answer, and
  `source-row-tally-memo.spec.js`'s multi-table fixture is built to catch it.
It counts TRACKS, not cells — each flagged track marks two.

**Millisecond precision** is opt-in per page via the `▶⏱`/`▼⏱`
`.mb-ms-col-hdr-btn` prepended to the Length header's `.mb-col-hdr-flex`
(same slot/idiom as `.mb-caa-col-hdr-btn`), gated by
`sa_enable_ms_track_length`. Key invariants:

- Source is **`tracks[].length`**, never `tracks[].recording.length`. Those
  are different MusicBrainz fields and differ constantly (4 of `Born to Run`'s
  8 tracks, one by 3 s). MusicBrainz renders the TRACK length ROUNDED, so the
  contract is "reveal more precision in the number already shown", never
  "show a different measurement". The recording's own length is not
  discarded, just kept out of THIS column — it feeds "Recording length"
  above, where showing a different measurement is the point.
  `_msStampReleaseTrackLengths()` enforces it
  with a round-trip check and discards any value that disagrees with the
  seconds MusicBrainz rendered.
- `data-mb-sec-text` stores the original seconds string verbatim; toggling
  back restores it rather than recomputing (MusicBrainz rounds, so `3:11.666`
  must return to `3:12`, not `3:11`). Both stampers refuse to stash a
  millisecond-shaped string there — if the cell already displays milliseconds
  they derive the seconds form via `_msFormatSeconds()` instead, or switching
  the toggle OFF would "restore" milliseconds.
- **Millisecond display must be reset on CAPTURED and HYDRATED cells only.**
  `captureSubtableSnapshot()` stores `cell.innerHTML`, so the `<td>`'s own
  `data-mb-*` never survives the sub-table handoff — only the rendered
  `"11:17.000"` text does — and the destination then re-stamped it as if it
  were MusicBrainz's seconds. `_msResetCarriedOverPrecision()` recovers the
  seconds form from the text and is called from `getCleanCellHtml()` (capture)
  and both `_hydrateAndRenderFromSnapshotData()` cell loops. **Do NOT put it in
  `_stripTransientCellState()`** — that helper looks like the natural home, but
  `runFilter()` also calls it on the live re-render clones, so the reset would
  undo the toggle on every keystroke (tried; it broke five tests).
- State lives in the DOM (`data-mb-ms-shown`), not a module variable, so it
  survives `cloneNode(true)` re-renders for free — and travels with a
  sub-table opened in its own tab, whose rows are hydrated from a snapshot
  and so can arrive already rendered at millisecond precision.
- **`_initMsLengthColHeaderToggle()` is hooked at the END of
  `makeTableSortableUnified()`, and that is the only correct place.** That
  function is what builds the `.mb-col-hdr-flex` the button lives in (it wipes
  `th.innerHTML` first), so it is the one site guaranteed to run after the
  layout exists. Every other candidate has to *know* it runs late enough, and
  two didn't: `startFetchingProcess()`'s single-table branch and
  `_hydrateAndRenderFromSnapshotData()` both call `renderFinalTable()` — whose
  tail also tries — several steps BEFORE reaching it, so the button was
  silently never injected on `tableMode: 'single'` pages or on a sub-table
  tab. Don't add a fourth per-caller call site; extend the hook.
- Toggling rewrites the SOURCE rows then calls `runFilter()`; filters, sort
  order and highlighting come along because every consumer reads the rendered
  text — but only because THREE caches are dropped first, none of which can
  notice a text change on its own: the uniq-dropdown cache (its key is the
  visible row set), `_filterResultCache` (its key is the filter inputs, so an
  active Length filter would replay its pre-toggle rows), and each rewritten
  row's `_rowTextCache` entry (`cols[cellIndex] = undefined`, `full = null` —
  the two DIFFERENT sentinels, AUDIT.md §4), which `testRowMatch()` reads even
  on a result-cache miss. The last two were missing until the async-population
  audit; `tests/fixtures/ms-length-filter-after-toggle.spec.js` pins each one
  separately (its isolation test flips the key, so it cannot be served a
  replay).
- `_msLengthSource()` is the single answer to "where can this page's
  milliseconds come from", checked in cost order: `'embedded'` (release pages —
  already in the page's own `<script type="application/json">` at
  `$.release.mediums[].tracks[]`, so stamped during pre-processing, no
  network), `'ws2'` (ONE lookup of the page entity, declared per pageType via
  `features.msTrackLengthWs2` — work/artist-relationships/place-performances/
  area-recordings have NO length data in the page at all, confirmed by
  `scripts/probe-work-page-json.py`), `'batch'` (SEVERAL requests keyed on the
  rendered recording MBIDs, `features.msTrackLengthBatch`), or `null` (no
  toggle offered). All three branches must stay O(1) — `_initMsLengthColHeaderToggle()`
  calls this on every render specifically to avoid a row walk, which is why
  `'batch'` keys off the feature flag alone rather than checking for recording
  links.
- Both fetching sources are LAZY: `_msToggleLengthPrecision()` fires them on
  the first press only, never during render. `_msToggleInFlight` guards a
  double click.

**`'ws2'` vs `'batch'` — pick by what the page's table IS**, not by entity
type. `'ws2'` works only where the table is one entity's own relationship
list, so a single `inc=recording-rels` answer covers it; verified per entity
with `scripts/probe-ms-browse-endpoints.py`. An `area`'s answer covers its
recordings page exactly (Asbury Park: 24 relations, 24 rows). An
`instrument`'s returns **zero** relations for a page listing 100 recordings —
MusicBrainz models instrument credits as artist-recording relationships
carrying an instrument attribute — so `instrument` is deliberately absent from
`_msWs2PageKey()`'s regex and uses `'batch'`.

**The `'batch'` source uses the SEARCH endpoint, not the browse endpoint,
and that is load-bearing.** `/ws/2/recording?query=rid:(m1 OR m2 …)` costs
`ceil(rendered rows / 100)`; `/ws/2/recording?artist=…` costs
`ceil(the artist's whole catalogue / 100)` — 746 requests for Bruce
Springsteen (`recording-count: 74540`) whether the page shows ten rows or ten
thousand, and it cannot serve instrument/isrc/search at all.
`_MS_BATCH_SIZE = 100` is a **measured** ceiling
(`scripts/probe-ms-rid-batch-size.py`): 150 MBIDs is accepted but silently
capped by the endpoint's own `limit`, 200 is `HTTP 414 URI Too Long`. Values
come back identical to the browse endpoint's.

- **`_msCollectRecordingMbids()` is the "what is still outstanding" list**, and
  three exclusions matter: already stamped, already answered in
  `_msBatchMemCache` (INCLUDING answered as `null`/"no length on record" — such
  a row is never stamped, so without this it looks like pending work forever),
  and a Length cell that does not parse (`"?:??"` has no seconds text to
  round-trip an answer against). Its emptiness is what tells
  `_msToggleLengthPrecision()` there is nothing left to fetch. Exposed to tests
  as `__saTest.msPendingLengthLookups()` because none of this is visible in the
  DOM.
- **A partly-failed batched run is its own outcome (`'partial'`), not a
  success and not an error.** Failed batches cache nothing, so the rows that
  arrived are shown while the button keeps the yellow retry tint, and pressing
  the toggle off and on again re-requests exactly the outstanding MBIDs. This
  is why `needFetch` in `_msToggleLengthPrecision()` cannot simply be
  `!_msAnyStamped()` — that would strand the gap permanently, since partial
  data makes `_msAnyStamped()` true.
- **The L2 cache is keyed per RECORDING, not per page** (`ms-rec-len` store,
  `_msIdbGetLength`/`_msIdbPutLengths`, gated by `sa_ms_idb_enable`/
  `sa_ms_idb_ttl_days`). A recording seen on one pageType is free on every
  other one that lists it. `null` is cached deliberately — "MusicBrainz has no
  sub-second length for this recording" is a stable fact, and caching it is
  what stops a page of length-less recordings re-requesting them every visit.
- **`recording-releases` is deliberately excluded and must stay that way** —
  its rows are RELEASES carrying no `/recording/` link at all, and its Length
  is the per-release TRACK length, a different stored field from the
  recording's own. Same correctness objection as `release-discids`'
  TOC/sector-derived Length. Doing it properly needs a release-keyed source
  (`/ws/2/release?recording=<mbid>&inc=media+recordings`). The reasoning is
  repeated as a comment on the pageDefinition itself, because the pageType sits
  among neighbours that all DO have a source.
- **Only a SUCCESSFUL answer is cached in `_msWs2Cache`** — including a
  successful-but-empty one, which is a real, stable fact about the entity. A
  transport failure (any non-OK status or thrown error) is deliberately NOT
  cached: MusicBrainz's Web Service 503s under bot load, and caching that
  turned a few seconds of upstream trouble into a permanently dead button
  *and* claimed "no sub-second length on record", which was simply untrue.
  `_msFetchWs2RecordingLengths()` therefore returns
  `{outcome: 'ok'|'empty'|'error', map, detail}` (the batched sibling adds
  `'partial'`), and the button has five states: `loading` (⏳, carrying
  `"2/5"` batch progress when there is more than one), `retry` (yellow, still
  clickable, names the error, not cached), `partial` (yellow, pressed, some
  rows shown and the rest retryable), `unavailable` (dimmed +
  `aria-disabled`, the settled "no data" answer, cached), and normal. Never
  collapse `retry` back into `unavailable` — they are different facts and only
  one of them is worth a second click. Per-batch 503s are retried three times
  with a widening backoff before a batch is called failed, because MusicBrainz
  fails in bursts (measured at roughly one request in three during this work).
- MusicBrainz DOES populate the Length column natively on those pages
  (`scripts/probe-native-work-length.js` reads back `5:05`/`5:35`/`?:??`), and
  it rounds there too — so `data-mb-sec-text` round-tripping and the
  round-trip discard check are both meaningful, and the check doubles as a
  guard against a mis-resolved column index.

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

## HTTP failure classification: two sets, and they are not opposites

`_isTransientHttp(status)` + `_TRANSIENT_HTTP_STATUSES` (429/502/503/504) and
`_parseRetryAfterMs(headerValue)` + `_RETRY_AFTER_MAX_MS` (30 s) live together
just above `_ws2GetJson()`, which is their only consumer today. Everything
below is a decision, not an accident.

**`_TRANSIENT_HTTP_STATUSES` is NOT the complement of `_ART_MISS_STATUSES`**
(`[404, 410]`, "this artwork does not exist"). The two answer different
questions and a status can be in neither — a 403 is not transient and not a
definitive absence. Never express one in terms of the other, and do not
"complete" the transient set with 500 (a real server-side error, not a burst)
or 408. The boundary is pinned by the `a 400 is final` test, which passes on
unfixed code on purpose: it guards the overshoot, not the original defect.

**`_ws2GetJson()` applies no floor of its own.** It parses the header and hands
it on as `beforeRetry(attempt, retryAfterMs)`; a `beforeRetry` that ignores the
second argument silently does not honour `Retry-After`. All three call sites —
`_msFetchOneBatch()`, `_relFetchWs2()`, `_relBrowseFetchPage()` — fold it in as
`Math.max(ownDelay, retryAfterMs)`, so the server's ask is a **floor**, never a
replacement (a `Retry-After: 0.5` must not let us retry faster than
MusicBrainz's 1 req/s rule) and never additive. Each is written out separately,
so each is its own guard and needs its own test.

**On both Relationships sites the extra wait precedes `_relAwaitRateSlot()`.**
See PERFORMANCE.org Step 36: reserving the slot first and topping up afterwards
would spend a reservation and then fire late.

**Delta-seconds is parsed BEFORE the HTTP-date form.** `Date.parse('12')`
succeeds on some engines as the year 12, so a bare number would otherwise be
read as two millennia past and discarded as `0`. The parser returns `0`, never
`null`, for missing/garbage/past — that is what lets callers use a bare
`Math.max()`.

**The rate gate MASKS a lost backoff**, which is why an assertion here has to
name the number. Dropping the hint argument entirely makes every caller compute
`Math.max(delay, undefined)` = `NaN`, i.e. no pause at all — and the measured
retry gap was still 1100 ms, because `_relAwaitRateSlot()` alone held the line.
A spec that only checked "was there a pause" would not see it.

Covered by `tests/fixtures/ws2-transient-classifier.spec.js`; mutation list
`scripts/mutations/ws2-transient-classifier.json`. Two WS/2 paths deliberately
do NOT go through `_ws2GetJson()` and so have no retry at all —
`_msFetchWs2RecordingLengths()` and `_msFetchFullReleaseTrackLengths()` (the ⏱
`'ws2'` source) — and neither does `initReleaseEventsColumn()`. That is
`org/503-handling.org`'s remaining work, not an oversight.

**`fetchHtml()` has its own retry on the same helpers**, with a longer backoff
(`_HTML_FETCH_BACKOFF_MS`, 2 s then 5 s) because a lost page fetch costs a whole
page of rows rather than one cell, and there are far fewer of them. It throws an
Error carrying `status` so callers classify without parsing `message`, and its
backoff is interruptible (`_sleepInterruptible()`) or a pressed Stop would sit
out up to seven seconds. **There is no shared retry budget across pages and none
is needed** — every caller stops at its first failed page, so exactly one page
can ever pay the retries. That stops being true the moment anything makes the
loop continue past a failure.

## The artwork summary panel (zone 2)

`org/503-handling.org`'s "zone 2 opens an artwork summary for the table".
`_artCollectSummary()` + `_artRenderSummary()`, opened by
`#mb-caa-toggle-btn-summary-{i}`.

- **It costs ZERO requests.** `_artEnrichIcon()` Tier 3 stores `json.images`
  verbatim in `ctx.imagesCache`, so the whole archive record — `edit`,
  `front`/`back` and the thumbnail ladder — is already there. **There is no
  `release` field**, whatever the archive's documentation says: probed
  2026-09-20 (`scripts/probe-caa-release-group-release-field.py`), a
  release-group lookup returns the same nine keys a release lookup does. The archive has no batch endpoint, so anything the
  panel could not answer from that cache would be one request per entity, which
  is the cost the whole 503 file exists to reduce. **Do not add a request to
  enrich this.**
- **`img.front` is NOT `types.includes('Front')`.** An image can be typed Front
  without being the archive's chosen main front, and that distinction is
  invisible everywhere else in the script. The fixture makes the two disagree on
  purpose, and there is a mutation for conflating them.
- **It must open MID-LOAD, gated on nothing.** `_showCaaCompletionToast()` fires
  on the `_caaQueue`'s `onIdle`, and CLAUDE.md records that on a large listing it
  never fires at all — so a panel gated the same way is useless on exactly the
  pages that motivated it. There is a mutation that adds such a gate.
- **"pending" must say WHY it is pending.** `initCaaPics()`'s Pass 2 enqueues
  every JSON lookup BEHIND every image fetch on the page, deliberately, so
  icons and strips paint first. On a 2144-row discography that is half an hour
  before the first lookup runs — diagnosed from `debug/bs-debug.html`
  (2026-09-20), where not one of 2144 art anchors carried `data-caa-enriched`.
  The count was literally true and read as stuck, which is how it was reported
  as a bug. The panel now shows the queue depth alongside it.
- **It does not reuse `_caaFetchStats`.** Those are PAGE-WIDE tallies; this is
  per table and does its own pass.
- **The scope is declared, not implied.** `runFilter()` REMOVES non-matching
  rows, so the tally is of what is SHOWN. The design's trap 2 asks for a walk
  over source rows instead; that needs a table → source-rows mapping this file
  calls unreliable, so the panel says "a filter is active" in its own header
  instead of quietly reporting a subset as the whole table. That is the org's
  own second option, chosen knowingly.
- **Driven from `ctx`, never the string "CAA"** — `ctx.column` is `'CAA'` or
  `'EAA'`, so the same panel serves event art without mislabelling it.
- **A separate sibling button, not the count badge.** The design drew the count
  as the opener; a click target inside the toggle `<button>` would be a nested
  interactive element (its own trap 3), and `.mb-caa-toggle-count` is located by
  two specs and read by `_artRetryTable()`'s badge arithmetic.
- Entity paths are **deduped**: the sticky-column duplicate of a row carries the
  same art anchor, and a release-group breadcrumb can repeat one.
- **The opener re-anchors on EVERY pass, never "already exists, bail".**
  `.mb-row-count-stat` is removed and re-created whenever the count changes,
  i.e. on every filter, and is re-inserted relative to the master toggle or
  (single-table) the filter container. `_artCreateOrUpdateToggleButton()` copes
  because it re-derives its position from the LIVE stat every call —
  `countStat.after(btn)` runs whether or not the button existed — and ⟳ and 🔗⟳
  chain off it. A control that bails out on "already exists" opts out of that
  and gets stranded: reported live on an artist-releases page with the opener
  sitting between the heading text and the stat while the rest of the run moved
  on. `_artCreateOrUpdateRetryButton()` therefore calls
  `_artCreateSummaryButton()` on BOTH paths, before its own early return.
  Pinned by `tests/fixtures/caa-summary-button-position.spec.js`, which asserts
  ORDER — the button never disappeared, so an existence check passed throughout
  the bug. **Single-table only:** on a multi-table page the per-table controls
  live in an `<h3>` that carries no row-count stat, which is why the panel's own
  spec (releasegroup-releases) never saw this.

Covered by `tests/fixtures/caa-artwork-summary.spec.js`; mutation list
`scripts/mutations/caa-artwork-summary.json`, with one honest `expect: "pass"`
for the dedup (this fixture has no sticky duplicate reaching an art anchor).
There is no "Cover sourced from" group: it was built from the archive's
documented `release` field, shipped untested because the fixture could not
exercise it, and removed once a probe showed the field does not exist. **A
group nothing could test was a group nothing had checked** — that is the
transferable part.

## CAA/EAA retry: the transient-failure record that unblocked it

`org/503-handling.org` F7, CAA half — blocked until `ctx.failedCache` existed.

**After F5, `ctx.countCache` holds `0` for both "the archive has no artwork" (a
404) and "the request failed" (a 503).** F5 kept the in-memory zero for both on
purpose: dropping it would re-fire one request per failed entity on every
keystroke and every sort. So the zero stays, and `ctx.failedCache` — a
session-scoped `Set` of entity paths per archive, written in `_artEnrichIcon()`'s
Tier 3 where F5 decided not to persist — records WHY it is there.

- **Never persisted**, exactly like the zero it annotates. A transport failure is
  not a fact about the release; that is the whole of F5.
- **Keyed by entity path, not by DOM.** `runFilter()` REMOVES non-matching rows,
  so anything derived from the live table loses exactly the failures a filter is
  hiding. The Relationships half had to read the captured source rows to get this
  property; here it is structural.
- **Only a NON-definitive status is recorded.** A 404 is the commonest answer the
  archive gives; recording it too would put a `⚠⟳` carrying a large number on
  almost every page, which is the same as no signal at all.
- **The network-error branch records too, and is the only place the success-path
  clear is observable.** A thrown request caches no zero, so an ordinary
  re-render retries the entity and the success arm is what removes the record.
  The failed-only retry path cannot show it — that one empties the set up front.
- **`_artRetryFailedAll()` clears the record BEFORE re-enriching**, because
  `_artEnrichIcon()` re-adds anything that fails again; clearing afterwards would
  wipe the fresh record and claim everything recovered.
- **It must delete the cached zero**, or Tier 1 serves it straight back and no
  request is made — the same defect F5 fixed one layer down, where
  `_artRetryTable()` cleared the session caches but not the IDB record.
- **Nothing is evicted from IDB here.** A transient failure was never written
  there (that IS F5), so there is nothing to evict, and clearing would throw away
  good records for entities that merely share the table.

**What this does NOT touch**, per the CAA/EAA section's standing requirement: no
sort key is rewritten, no source-row mirror is re-resolved, no strip is rebuilt
and no image is cache-busted. A metadata failure means the JSON never arrived, so
recovery is "clear the zero, drop the `enriched` marker, re-run
`_artEnrichIcon()`" — and `_artEnrichTable()` is the same entry point an ordinary
render uses. `_artRetryTable()` keeps its full eight-step rebuild for the
stale-artwork case.

**The refresh IS hooked per-frame here, unlike the Relationships one.** The count
is `Set.size`, not a DOM walk, so `_artScheduleFailedBtnRefresh()` costs nothing;
`_relFailedMbidsPageWide()` walks every captured source row, which is why its
equivalent hook was removed.

Covered by `tests/fixtures/caa-retry-failed-only.spec.js`; mutation list
`scripts/mutations/caa-retry-failed-only.json`, carrying one honest
`expect: "pass"` — the membership test in the anchor loop is an EFFICIENCY guard,
not the correctness one, since re-arming an anchor whose entity is still cached
produces no request. `__saTest.artFailedPaths(which)` exists because the set has
no DOM surface once a filter has removed its rows, and because the 404/503
distinction is invisible on screen: both render as a release with no artwork.

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

## Release events: one request for the whole page, so losing it costs the column

`org/503-handling.org` F4. `initReleaseEventsColumn()` now goes through
`_ws2GetJson()` (`_RE_WS2_TRIES`, `_RE_WS2_BACKOFF_MS`) instead of a bare
`fetch()`, and a final failure is **visible and retryable** via
`.mb-re-col-hdr-btn` — the eighth member of the column-header family.

- **It is deliberately NOT on `_relAwaitRateSlot()`.** That gate spaces a
  STREAM of one request per entity; this is one request for the whole page, so
  joining it would couple two unrelated features' pacing for nothing. The
  pre-existing bare `fetch()` did not join it either, so nothing regressed.
- **A failure must not mark the cells `reDone`.** They stay unpopulated, which
  is what lets the retry — or any later render path — pick every one of them up.
  Marking them done would look completely settled and be permanently wrong.
- **`_reInitColHeaderState()` destroys and rebuilds the control, never reuses
  it**, and both halves of that matter. The control has to change STATE (⏳ →
  ⚠), so reusing leaves it stuck on whatever it was first painted as; and
  `renderGroupedTable()` rebuilds every `<thead>` from a `cloneNode(true)`,
  which carries classes and attributes but **not** the click listener, so a
  reused control would look normal and do nothing. One mutation covers both;
  the spec clicks the control after a re-render rather than just looking at it.
- **It is called from every render path**, beside `_relInitColHeaderToggles()`,
  for the same reason that one is.
- **The glyph is CSS `::before`, never element text** — this `<th>`'s
  textContent feeds `_cleanColHeaderText()`'s fallback,
  `_exportCleanHeaderText()` and the 📊 dropdown's column lookup. U+FE0E keeps
  it monochrome, as on `.mb-rel-col-hdr-btn`.
- **`_reFetchState` resets at the start of every run**, or a ⚠ from the
  previous fetch is painted into the fresh headers.

Covered by `tests/fixtures/release-events-transient.spec.js`; mutation list
`scripts/mutations/release-events-transient.json`. **A test here must wait on
`[data-re-state="error"]`, not the bare class** — the control is painted while
loading too, so waiting on the class alone proceeds mid-retry and sees one
request where three are coming. That cost a run.

## A truncated fetch must never be reported like a complete one

`org/503-handling.org` F1-F3. The rule: anything that makes the fetched set
smaller than the listing goes into `startFetchingProcess()`'s `fetchIncomplete`
record, and **every surface renders it through the one resolver
`_fetchIncompleteSummary()`** — status line, render-decision dialog,
save-without-rendering line, disk-load line, saved file. Four of those printed
"Loaded N pages" independently before, and a truncated run reached all four in
the words of a complete one.

- **`pagesProcessed++` happens AFTER the fetch.** It used to run before the try
  block, so the page that 503'd was counted as loaded. Any assertion here must
  name the NUMBER (`"1 of 3"`), not just look for a warning glyph.
- **`dataIncomplete` is narrower than "something went wrong", deliberately.** A
  failed page or an unreadable page count means rows are missing. An incomplete
  artist-releasegroups pre-fetch does not — the main pass fetched everything,
  and only the Official/Non-Official split is lost. Marking a complete row set
  INCOMPLETE would train the user to ignore the word.
- **`fetchMaxPageGeneric()` returns `{maxPage, ok, detail}`, not a number.**
  `maxPage` is still `1` on failure so nothing fetches zero pages; `ok: false`
  is what lets the line say "of an unknown total" rather than "1 of 1 pages" —
  which would read as a complete one-page listing, i.e. the same lie in new
  words.
- **An incomplete pre-fetch DISCARDS its partial official set.** Every consumer
  — the view-button builder, the two re-render walks and `saveTableDataToDisk()`
  — gates on `h3_official_category_header_array.length > 0`, so discarding
  switches all of them off at once. Threading a flag out instead misses the save
  path, which does not run inside `startFetchingProcess()`. A short set does not
  truncate the Official view: the consumer matches against the FRONT of that
  array in sequence, so a missing tail MISFILES genuinely-official categories as
  non-official.
- **The saved file carries an optional `incomplete` block, and no format bump
  was needed.** It is absent on a clean run and in every file written before it
  existed, so `!incomplete` keeps its old meaning. `_lastFetchIncomplete` is
  module-level because the Save button fires whenever the user likes, long
  outside the fetch; the disk-load path re-points it so re-saving a partial file
  keeps it partial.

Covered by `tests/fixtures/html-fetch-transient.spec.js`, whose two shells
`scripts/build-html-fetch-fixtures.py` derives from the committed snapshots with
only the pagination widget rewritten to 3 pages (the real ones say 42 and 22,
and a fixture route serves the same shell for every page). Mutation list
`scripts/mutations/html-fetch-transient.json`. **Note the trap that spec hit:
once `fetchHtml()` retries, failing ONE attempt of a request proves nothing** —
the retry absorbs it and the run comes back clean. A test that wants a final
failure has to exhaust all three attempts.

## Column-header toggle family (`.mb-col-hdr-flex` slot)

**Eight** controls share that slot and that visual language. Seven share **one
CSS rule**; the eighth — the `⇅ ▲ ▼` sort group — cannot, and the reason matters
before anyone "finishes the job" by adding it to the selector list: the family
rule styles **one element as one pill**, and the sort glyphs are **three sibling
`span.sort-icon-btn`** that must read as one pill. Applying the family rule to
them gives three pills. They are drawn as a segmented pill instead — see "The
sort group" below — and the two share values through custom properties
(`--mb-hdr-pill-*`) so they cannot drift apart.

**The tokens are declared on `table.tbl thead`, not on `.mb-col-hdr-flex`,
deliberately.** `.mb-picard-col-hdr-btn` is inserted straight into its `<th>`
because the Picard header is the one header with no `.mb-col-hdr-flex` at all;
scoping the tokens to the flex row leaves that one control resolving `var()` to
nothing — silently unstyled while everything else looks fine. Custom properties
resolve through inheritance at computed-value time, so consuming rules may sit
earlier in the stylesheet than the declaration.

The seven that do share the rule, six of them since 9.99.1060:
`.mb-caa-col-hdr-btn` (▶🖼 + a real 16px thumbnail `<img>`, not an emoji),
`.mb-ms-col-hdr-btn` (▶⏱), `.mb-picard-col-hdr-btn` (▶♪),
`.mb-rel-col-hdr-btn` (▶🔗), `.mb-col-collapse-hdr-btn` (▶N▤),
`.mb-col-uniq-wrap` (`N 📊`) and `.mb-re-col-hdr-btn` (⚠/⏳, added for
org/503-handling.org F4 — see the Release-events section below). They were six
near-identical copies of the same declarations; grouping them means "these are
the same kind of control" is structural rather than something six blocks have
to keep agreeing on. The seventh was added by extending the three selector
lists, which is how to add an eighth — never by copying a block.

`.mb-re-col-hdr-btn` is the only member that is **not always present**: it is
painted only while the Release-events lookup is in flight or after it has
finally failed. That is deliberate, and it is what keeps a clean
`rendered.html` baseline free of new markup — only the `<style>` block moves
(`tests/snapshots/registry.org`'s "Expected drift").

`.mb-col-uniq-wrap` is the one member that is **not a toggle** — it opens the
unique-values dropdown — so it has no `aria-pressed`/`aria-expanded` arm; its
"on" state is `.mb-col-uniq-active`, which wins on specificity (two classes)
regardless of source order.

**Per-control deltas MUST sit after the family rule.** Same specificity, so
source order decides: `.mb-col-uniq-wrap`'s own block used to sit *before* it,
where the family's `margin-right: 3px` would have silently beaten the `0` it
needs as the flex row's last element.

Three per-control deltas are load-bearing and must not be "tidied" into the
family: `.mb-caa-col-hdr-btn` keeps `gap: 3px` / `margin-right: 0` for its
thumbnail; `.mb-col-uniq-wrap` keeps `gap: 0` plus `margin-left: auto` /
`margin-right: 0`; and `.mb-col-collapse-hdr-btn` keeps `margin-right: 0` because it is
NOT laid out by the family's margin — it carries an inline `margin-left: auto`
(set alongside clearing `.mb-col-uniq-wrap`'s own inline one), so both it and
the uniq wrap have `margin-left: auto` and the flex row splits the free space
between them. That split is the gap before 📊. Its state attribute is
`aria-expanded`, not `aria-pressed`, so it has its own arm in the engaged rule;
and its focus ring comes from the page-wide `:focus-visible` group (with
`!important`), which is why it is deliberately absent from the family's own.

**The resting state is a light pill, not 60% opacity on a transparent ground.**
The old style came from when these sat only on the plain `#e8e8e8` header. It
fails on an injected column: that header is `#b8b8d0` and 🔗 renders as a
*blue-grey colour emoji*, so glyph and ground were the same hue at the same
lightness — and sorting made it worse, blending `rgba(255,200,80,.60)` over the
header (`_MSCOL_HDR_TINT_RGBA`) to `rgb(227,194,131)`, i.e. a cool glyph on a
warm ground. A ground of the control's own fixes every combination including a
header the user recoloured via `sa_ui_thead_th_bg` /
`sa_ui_thead_th_injected_bg`, which no hand-picked glyph colour could.

**Two traps, both of which bit during that change.**

- **Raising the resting opacity silently merged two ⏱ states.** The settled
  "no sub-second data on record" look had *no CSS rule of its own* — it was
  dimmed purely by the family's `opacity: 0.60`, so lifting that made
  `unavailable` look identical to a normal available button, collapsing it into
  the `retry` state the millisecond feature is at pains to keep distinct (one is
  worth a second click, the other is not). It now has an explicit
  `[aria-disabled="true"]` rule, and `work-recordings-ms-length.spec.js` pins
  the dimming. **Before changing any base declaration here, check which states
  were relying on inheriting it.**
- **A state tint's alpha is relative to what is behind it.** The retry yellow
  went `0.45 → 0.55` (hover `0.65 → 0.75`) and the engaged blue `0.13 → 0.20`
  purely because they now sit over a white pill rather than over the header.
  Those exact values are asserted, deliberately.
- **`em` compounds inside these controls, and it bit the one number a user
  actually reads.** `.mb-col-collapse-count` was `0.82em` inside a `0.80em`
  button — `0.66em` of the header, i.e. the multi-row COUNT was the smallest
  thing in the header. Anything nested inside one of these buttons needs sizing
  against the button's own `font-size`, not against the header's.

**Glyph presentation differs per button, and the reason is per button:**

| Button                   | Glyph comes from                         | Text presentation                             |
|--------------------------|------------------------------------------|-----------------------------------------------|
| `.mb-rel-col-hdr-btn`    | CSS `::before`                           | 🔗 + **U+FE0E**                               |
| `.mb-picard-col-hdr-btn` | CSS `::before`                           | ♪ is already a text char — no selector needed |
| `.mb-ms-col-hdr-btn`     | **element text**, `_msUpdateColHdrBtn()` | ⏱ + **U+FE0E**, in that function's strings    |
| `.mb-caa-col-hdr-btn`    | child `<span>` + a real `<img>`          | no emoji at all                               |

U+FE0E (VARIATION SELECTOR-15) forces an emoji to render as a monochrome
outline in the header's own colour. It is why ♪ never had the legibility
problem and 🔗 did. Where a font declines to honour it the glyph falls back to
the colour emoji *on a white pill*, which is still the old problem solved — so
it degrades safely. The ⏱ one lives in JS because that glyph is element text;
the `⏳` loading glyph deliberately keeps its colour, being transient and
informative. Three fixture specs assert these glyph strings **exactly, U+FE0E
included**, so dropping it fails a test rather than quietly regressing the look.

**The CSS is inside a `GM_addStyle` template literal.** A backtick in a comment
there terminates the literal and breaks the whole script; and a CSS `\\XXXX`
escape is read as a *JS* escape first, which is why this file writes glyphs as
literal characters. **Both have now cost a debugging round three times** — the
backtick one on the very commit that first documented it, and again at
9.99.1129 — and `node --check` reports the failure at the *start of the
template*, often hundreds of lines before the real cause, which is what makes
it slow to find. Grep the region you just edited for a backtick before reaching
for anything else.

**And `node --check` does NOT always catch it.** At 9.99.1129 a comment used
backticks for four id fragments; because they BALANCED, the file stayed
syntactically valid JavaScript and `node --check` passed cleanly. What
happened instead was silent: the literal closed and reopened, so every CSS rule
after that point stopped applying. The symptom was five failing pill tests —
including four that had nothing to do with the change — which reads like a
broken feature rather than a broken string. **An even number of backticks is
the dangerous case**, because the one tool you would reach for says the file is
fine. If a CSS change makes unrelated rules stop working, grep the edited
region for a backtick before debugging anything else.

## The h1 toolbar is two pull-down menus plus two pinned buttons

`org/action-button-redesign.org`. The bar used to be one flat run of up to 13
controls, nine of them labelled. It is now:

| Order | Element                                | Present                                      |
|-------|----------------------------------------|----------------------------------------------|
| 1     | `🧮N …` fetch buttons                  | always                                       |
| 2     | `#mb-stop-btn`                         | always (hidden outside a fetch)              |
| 3     | `#mb-button-divider-initial`           | always — the only surviving `\|`             |
| 4     | `#mb-disc-menu-btn` `📀 Discography ▾` | `artist-releasegroups`, post-render          |
| 5     | `#mb-data-menu-btn` `📦 Data ▾`        | from the initial render                      |
| 6     | `#mb-view-menu-btn` `🛠 View ▾`         | from the initial render (🎹 seeds it)        |
| 7     | `#mb-settings-btn` `⚙️`                 | always, pinned — left half of the ⚙️❓ pill   |
| 8     | `#mb-app-help-btn` `❓`                | always, pinned — right half of the ⚙️❓ pill  |
| 9     | `#mb-fetch-progress-wrap`              | always (hidden outside a fetch) — trails everything, `org/action-button-redesign.org` |

`_TOOLBAR_TAIL_ORDER` declares 3-9 and `_orderToolbar()` asserts it; anything
not named there keeps whatever position it was appended at. The progress bar
sits LAST rather than beside `#mb-stop-btn` deliberately — it used to sit
between the fetch buttons and Stop, which read as if Stop belonged to the
menus/pill that followed it rather than to the fetch buttons that preceded it.

**7 and 8 are drawn as ONE segmented pill** — a fourth run alongside the three
in "The h2/h3 control runs are segmented pills" below, and built the same way,
so read that section's rules first. Three things are specific to this one:

- **Selected by the class `.mb-toolbar-pinned-btn`, not an id prefix**, because
  these two ids share none. The caps use the run-relative pair
  (`:not(.c + .c)` / `:not(:has(+ .c))`) — `:first-of-type`/`:last-of-type` are
  wrong here for exactly the reason they are wrong for the sort group: they
  count elements of the same TAG, and these `<button>`s are neither the first
  nor the last button among their siblings.
- **A class, never a wrapper element.** They must stay DIRECT children of
  `#mb-show-all-controls-container`: `_TOOLBAR_TAIL_ORDER` re-appends them
  there, and `toolbar-menus.spec.js` reads the container's own children to
  assert they are the last two BUTTONS — `#mb-fetch-progress-wrap` (present
  but `display:none` outside a fetch) is the true last child, per row 9 above.
- **It cancels the flex gap, and the margin sits on the LEFT half.** The bar is
  `display:inline-flex` with a gap between every pair of children, and a flex
  gap cannot be suppressed for one pair — so one segment pulls back by exactly
  one `--mb-toolbar-gap`, a custom property both sides read so the pill cannot
  split open if that number is retuned. **Which side carries it is the
  load-bearing part.** The bar is also `flex-wrap: wrap`, and at some widths the
  two halves land on different lines — measured at 1040-1080px and 550-590px,
  ordinary window territory. With the pull on the RIGHT half, ❓ then started
  8px past the bar's own left edge: content outside its container. On the LEFT
  half the same pull merely shortens a line that has nothing after it, so a
  split degrades to a square left edge. The split itself is not preventable
  without a wrapper, and a wrapper costs the direct-children contract above.

**Their backgrounds are settings, not pill CSS.** `sa_ui_settings_btn_style`
and `sa_ui_help_btn_style` kept their own keys and had their DEFAULTS changed
to match `sa_ui_toolbar_menu_btn_style`, with `_SETTINGS_MIGRATIONS` entries
naming the old slate values — so the pill reads as one control by default while
a user who chose their own colours keeps them. Forcing one ground in the
stylesheet would silently override that choice.
`ensureSettingsButtonIsLast()` is a back-compat alias, still called from ~7
sites, and no longer does anything else. Two of the three old divider spans
(`.mb-button-divider-after-load`, `.mb-button-divider-before-shortcuts`) are
gone — they separated groups that no longer exist.

**The menus ADOPT the existing buttons; they do not replace them.** A menu row
IS the button that used to sit in the bar — same id, same `title`, same
`onclick`, same colour setting, same `ctrlMFunctionMap` entry — moved into a
panel by `adopt()` and restyled as a full-width row. That is the rule to carry
forward: build a new toolbar control the way every other one is built, then
adopt it. Row order inside a panel comes from `_TOOLBAR_MENU_ROW_ORDER`, not
from the sequence the render tail happens to adopt in — 🎹 is adopted on the
INITIAL render and would otherwise head the 🛠 View list.

Six things are load-bearing, and every one of them fails silently:

- **A row in a CLOSED panel has a ZERO bounding rect.** Density's and Export's
  own pull-downs, and `showLoadFilterDialog()`, all position themselves from a
  rect. So **every programmatic activation goes through `_toolbarInvoke()`**,
  which opens the host menu first and degrades to a plain click for a control
  that was never adopted; and **anything wanting an ANCHOR asks
  `_toolbarAnchorFor()`** for the menu BUTTON, never the row. A bare
  `.click()` opens the sub-menu pinned to the top-left corner of the viewport.
  The seven `isShortcutEvent()` arms, the `ctrlMFunctionMap` entries, the four
  export-dialog `triggerButton:` sites and `showSaveDialog()`'s anchor all go
  through one or the other.
- **The row-activation close listener is CAPTURE phase.** `densityBtn.onclick`
  and `exportBtn.onclick` both open with `e.stopPropagation()` — they must, or
  their own document-level outside-click handler would close the pull-down they
  just opened — so a bubble listener never fires for exactly the two rows that
  need it. Found by `toolbar-menus.spec.js` on its first run.
- **An open panel is `display:flex; flex-direction:column`, not `block`.** Flex
  items are blockified by the CSS display spec, so each row's own inline
  `display:inline-flex` computes to `flex` and lays out full-width while
  `display:none` still hides it. The three sites revealing Save to Disk had to
  move from `'inline-block'` to `'flex'`: `inline-block` blockifies to plain
  `block`, where the `::after` hint's `margin-left:auto` computes to zero.
- **The keyboard hint is CSS `::after` from `data-mb-menu-hint`, never text.**
  It keeps the hint out of the row's `textContent`, so a read of the row is its
  label alone — same rule, same reason, as the column-header family's glyphs,
  and `toolbar-menus.spec.js` asserts exactly that.
  **This entry used to give a different and false reason**: that
  `updateBarcodeHighlightBtnState()` rewrites its button's `innerHTML`
  wholesale, so an attribute survives where a `<kbd>` child would not. That
  function writes `style.background`/`borderColor`/`color` and `title` only;
  the button's content is set once at creation. Corrected in 9.99.1148 rather
  than quietly dropped, because a plausible-but-wrong reason is what licenses
  the next person to conclude "no rewrite here, so a `<kbd>` is fine".
  **And the barcode row is the one that had no hint at all** until 9.99.1148 —
  `adopt()` was called without the argument. Every row now passes one.
- **Layout lives in the `.mb-toolbar-menu-item` class with `!important`.**
  `_applyDiscButtonTints()` rewrites a row's whole `cssText` on every view
  switch; without `!important` that flattens the row back to a bar button.
- **An empty menu must not render**, and what delivers that is LAZY CREATION —
  each `_ensure*Menu()` call sits inside its own `sa_enable_*` gate, so the menu
  is never constructed. `_orderToolbar()`'s emptiness reconcile is a second line
  for a future call site that ensures a menu and then adopts nothing; no fixture
  can tell the two apart, and `scripts/mutations/toolbar-menus.json` records
  that as an honest `"expect": "pass"`.

**`tests/support/toolbarMenu.js` is where the layout knowledge lives on the test
side** — `clickToolbarItem()` reads `data-mb-menu-owner` off the DOM rather than
carrying a table of its own, so a control that moves between menus needs no
change there. Nine call sites migrated to it. A spec that hard-codes "click
`#mb-data-menu-btn`, then click the row" pins the current grouping as if it were
the behaviour under test; don't.

## ↔️ Resize and 👁️ Visible live in the h2, before `#mb-filter-container`

They act on ONE table, so they sit beside that table's heading — the slot the
per-sub-table `.mb-subtable-resize-btn`/`.mb-subtable-vis-btn` pair has always
occupied in every h3. `_mountH2TableControl()` puts them there and returns false
when there is no h2-hosted filter bar, in which case both callers keep their old
`controlsContainer.appendChild()`. They keep their ids; only their content
became glyph-only.

- **One WRAPPER (`span.mb-h2-table-controls`), not two loose buttons.**
  `updateH2Count()` REPLACES `.mb-row-count-stat` on every filter change and
  re-anchors a fixed selector list of direct h2 children after the new span;
  anything it does not know about is displaced to the front of the heading on
  the first keystroke — this file records the same trap for `mb-rel-retry-*`. A
  single cached wrapper makes `_reanchorH2TableControls()` one sibling test and
  one `before()` call, **with no DOM query**, in a function that runs once per
  keystroke.
- **It is NOT in that selector list, and must not be added.** That list anchors
  on the count stat, i.e. inside the artwork/Relationships control runs, which
  are drawn as segmented pills selected by id prefix — an element between two of
  them splits one pill in two. Anchoring on `#mb-filter-container` puts the pair
  past the end of every run. (Adding the wrapper to the list anyway does not
  reproduce the bug: `_reanchorH2TableControls()` runs later in the same
  function and moves it back. The guard is the anchor, not the absence.)
- **`#mb-resize-btn`'s `title` is a TEST CONTRACT.**
  `tests/support/browser.js`'s `waitForRenderComplete({ waitForAutoResize })`
  polls for a title starting with `Restore` to know the auto-resize-on-load pass
  finished. `updateResizeButtonState()` is glyph-only now, so the title is the
  only thing carrying the state; moving the wording into the glyph would hang
  every render wait in the suite rather than failing loudly.
- **The rest state RESTATES `background`/`borderColor`, it does not clear them.**
  `uiActionBtnBaseCSS()` set neither, so `''` used to fall back to the UA button
  default; `uiHeadingGlyphBtnCSS()` sets both, and `''` removes them, leaving a
  transparent borderless button. Purely visual, so no spec sees it — recorded in
  the mutation list as `"expect": "pass"` rather than left unmentioned.

Covered by `tests/fixtures/h2-table-controls-anchor.spec.js` (mutation list
`scripts/mutations/h2-table-controls-anchor.json`), which turns
`sa_enable_caa_pics` back on — `FIXTURE_SETTINGS_OVERRIDE` forces it off, and
without it the pill assertion measures an empty run and passes for the wrong
reason.

## ❓ opens GitHub; Shift-❓ renders the same file in the page

`org/action-button-redesign.org` item 2. Help is
**`ShowAllEntityData_HELP.md`**, hand-written, and the `.txt` is retired. Three
things read it and they must stay in agreement:

| | |
|---|---|
| `HELP_GITHUB_URL` | the `/blob/` page — where a plain ❓ click goes |
| `REMOTE_HELP_URL` | the same file raw — what the dialog fetches |
| the committed `_HELP.md` | what a publish copies to the mirror |

`openAppHelp(e)` is the button's handler and branches on `e.shiftKey` alone;
`showAppHelp()` is the dialog and is no longer wired to the button directly.
**Prefix-mode `H` stays on `showAppHelp()`**, because prefix mode refuses Shift
(`!e.shiftKey` in its own guard) — so the keyboard has one route and it is the
one a mouse-free user cannot otherwise reach. The dialog's title bar carries
`#mb-app-help-github-link` so the other destination is not lost.

**`window.open()`, never `GM_openInTab()`.** The latter needs a new `@grant`,
and a new grant re-prompts every existing Tampermonkey user on their next
update — a real cost to everyone for a tab `window.open()` already opens from a
click handler's user gesture.

Six things about the renderer (`_mdRenderInto()` / `_mdInline()` /
`_mdHeadingId()`), each of which fails quietly:

- **It is styled by `GM_addStyle` classes, not per-node inline styles** — like
  every other panel since the 9.99.736-9.99.745 CSP run, and far less code than
  setting a dozen properties on each node of a long document.
  **The CSP half of that rule is narrower than this file used to say.** What
  `/account/*`'s `style-src 'self'` blocks is `<style>` elements and `style="…"`
  written into an **`innerHTML` template**; CSSOM writes (`el.style.foo = …`)
  are not blocked, which is why the entire h1 toolbar sets its styles that way
  and renders correctly there. A node-building renderer was never in the
  blocked case. Corrected in 9.99.1149, along with the mutation that had
  recorded itself an honest `"expect": "pass"` on the strength of it — the
  stylesheet's absence IS observable, as a computed value, and is now asserted.
- **`_italic_` is deliberately unsupported; only `*italic*`.** Half the nouns
  here are snake_case settings keys, and an underscore rule renders
  `sa_enable_caa_pics` as "sa" + *enable_caa* + "pics". CommonMark refuses
  intra-word underscore emphasis for the same reason, so leaving it out makes
  this agree with GitHub on the case that occurs.
- **Nodes, never `innerHTML`.** The bytes arrive over the network at runtime;
  "it is our own file" is a fact about the repository, not about what a fetch
  returns. A link href is admitted only when `http(s)` or `#`.
- **`<details>` renders OPEN.** Collapsed content is still in the DOM, so the
  dialog's quick filter would highlight matches the reader cannot see. GitHub is
  where the sections collapse; this dialog exists to be searched.
- **An `#anchor` link scrolls the DIALOG.** It is a fixed overlay with its own
  scroll area, so following the fragment scrolls MusicBrainz's page underneath
  while the table of contents appears to do nothing. Heading ids carry an
  `mb-md-` prefix so they cannot collide with the page's own, and both the
  heading and the link resolve through `_mdHeadingId()` — which is why a table
  of contents written for GitHub's bare slug works here too.
- **The coupling runs file → renderer, not the other way.** The renderer covers
  exactly what `_HELP.md` uses; the file is written to stay inside it. The last
  test in the spec renders the REAL committed file and is what keeps that true.
- **A list item's continuation line must be INDENTED, and that is a guard.** An
  indented non-bullet line appends to the item above it; without the rule every
  wrapped bullet ends its list, and without the INDENT part a list swallows the
  heading under it. The first half shipped broken for an afternoon and no
  assertion saw it — see `scripts/probe-help-md-render.js`, and the
  DEBUG-NOTES entry on why fifteen green tests could not.

**`CACHE_KEY_HELP` was renamed to `…-remote-help-md`** because
`Lib.fetchCachedText()` keys on the cache key alone and stores no URL beside the
bytes — an upgrading user's cached plain text would otherwise be fed to the
Markdown renderer for up to a TTL. Any future format change owes the same
rename. No fixture starts with a stale cache, so this is a second
`"expect": "pass"`.

Covered by `tests/fixtures/app-help-github-and-markdown.spec.js`; mutation list
`scripts/mutations/app-help-github-and-markdown.json`.

## The h2/h3 control runs are segmented pills too — three of them, not one

A second family, distinct from the `.mb-col-hdr-flex` one above: the buttons
that sit beside a table's heading. `org/503-handling.org`, "Retry UI: one
segmented control per table". The h2's ↔️/👁️ pair (above) is deliberately NOT
part of any of these runs — it anchors past the end of them all.

**A FOURTH run now uses this idiom outside the h2/h3**: the h1 toolbar's
`⚙️`/`❓` pinned pair, selected by class rather than id prefix. The rules below
apply to it unchanged; what differs is written up under "The h1 toolbar is two
pull-down menus plus two pinned buttons" rather than repeated here.

**Three runs, selected by ID PREFIX, and no DOM change at all.** The ids were
already prefix-consistent, so the CSS needs no class and no wrapper:

| Run           | Prefix               | Members                                                                           |
|---------------|----------------------|-----------------------------------------------------------------------------------|
| CAA artwork   | `mb-caa-toggle-btn-` | `-{i}`, `-global`, `-retry-{i}`, `-global-retry`, `-retry-failed`, `-summary-{i}` |
| EAA artwork   | `mb-eaa-toggle-btn-` | the same set                                                                      |
| Relationships | `mb-rel-retry-`      | `-{i}`, `-global`, `-failed`                                                      |

A button added later joins its pill for free **provided it keeps the naming
convention** — so do not tidy an id out of its prefix. Conversely, the three
are kept apart deliberately: one shared selector would render a page carrying
both archives as a single long pill, implying one control group where there
are three sources. That regression *looks tidier*, which is why
`tests/fixtures/control-run-segmented-pill.spec.js` asserts the CAA run keeps
its right cap and the Relationships run opens its own left cap **while the two
are adjacent siblings**.

**Every declaration needs `!important` here, unlike the sort group.** These
buttons set `border`, `border-radius`, `background` and `margin-left` INLINE
(`_artCreateOrUpdateToggleButton`, `_REL_RETRY_BTN_CSS`, and the two rel-retry
creation sites), and a normal-priority stylesheet rule cannot outrank inline.
Same cascade fact this file records for the flag userscript's margins, reached
from the other side. A middle segment computing `border-radius: 3px` is the
symptom.

**Backgrounds are deliberately NOT unified.** The `⚠⟳` segment is yellow
because it means something; flattening the run to one ground would erase that
to gain nothing. The pill here is the shared height, one hairline between
segments, and rounded caps at each run's two ends.

**`_ctlRunEnd(el, skip)` — every control must append to the END of its run.**
This is the load-bearing part, and it fixed a real ordering defect the pill
merely exposed. `_artCreateOrUpdateRetryButton()` creates the `📊` summary and
then, a few lines later, the per-table `🔗⟳` — and both used to `.after()` the
*same* artwork `⟳`. Whichever ran last took the slot, so `🔗⟳` landed between
two artwork controls and the artwork run rendered as two pills with a foreign
one wedged between them. **All four insertion sites now resolve the run's end**
(the summary's create and re-anchor paths, the per-table `🔗⟳`, and the global
`🔗⟳`), which makes both creation orders converge on the same DOM. The `skip`
argument exists so the summary cannot anchor on its own position when it
re-anchors after a filter re-creates `.mb-row-count-stat`.

Before the pill this was invisible — the buttons merely looked shuffled — so
there was nothing to notice. Do not "simplify" any of those four back to
`anchor.after(...)`.

**`_hdrCtlAnchor(header)` is the sibling rule for the OTHER direction — where a
run does not exist yet.** `_ctlRunEnd()` answers "this control belongs beside
that one"; this answers "this is the first control in that heading, where does
it go". Both are needed, and getting the second wrong is how a control ends up
outside the run entirely rather than merely mis-ordered inside it.

It queries `:scope >` only, in the order
`[id^="mb-caa-toggle-btn-"] / [id^="mb-eaa-toggle-btn-"] / [id^="mb-rel-retry-"]`
(last match) → `.mb-row-count-stat` → `.mb-toggle-icon` → `lastElementChild`
→ `null`. **Never `header.querySelector('button:last-of-type')`**, which is
what `_relRetryAnchorFor()` used and which means "the first `<button>` in
document order that is the last `<button>` among ITS OWN parent's children" —
on an `<h3>` carrying a sub-table filter that is `#mb-stf-<col>-clear`, so the
control was appended INSIDE `span.mb-stf-input-wrap`. See the Relationships
retry section for the measurement.

`.mb-row-count-stat` is the right default because it is the slot
`_artCreateOrUpdateToggleButton()` already targets (`countStat.after(btn)`), and
because `updateH2Count()` re-anchors every `:scope > [id^="mb-rel-retry-"]`
after the rebuilt stat — so an `<h2>`-hosted control survives a filter
re-render with no new hook. An `<h3>` gets no such re-anchor, but
`renderGroupedTable()` rebuilds the whole heading and the controls with it.

### The sort group — a segmented pill, with zero DOM change

`⇅ ▲ ▼` are three sibling spans drawn as one pill: shared background and
top/bottom border, one hairline between segments, rounded caps on the run's two
ends only. Four things are load-bearing.

- **No wrapper element, ever — and never the class `sort-icon-btn` on one.**
  19 spec files locate these as
  `locator('.sort-icon-btn', { hasText: '▲' }).first()`. `hasText` is a
  **substring** match, so a wrapper whose text is `⇅▲▼` matches all three
  queries and, being first in document order, wins `.first()` — every one of
  those clicks would land on the wrapper's centre instead of the glyph it named.
  A differently-classed wrapper avoids that but still costs a re-capture of 14
  snapshot baselines.
- **The dividers are borders, never a `|` character.** A literal pipe is TEXT,
  and this header's text is read by ~25 places — most stripping a fixed glyph
  set by regex, including `makeTableSortableUnified()`'s own re-derivation of
  `colName`, which feeds `th.dataset.colName` and ~65 consumers from there. It
  would also break two exact-equality readers: `_exportCleanHeaderText()`'s
  `g === '▲'` and the `_clickSortIcon(bare)` resolver behind Ctrl+↑/↓/#.
- **`:first-of-type`/`:last-of-type` are WRONG here.** They count elements of
  the same TAG, and these spans are neither the first nor the last `<span>` in
  `.mb-col-hdr-flex`: a `.mb-caa-`/`.mb-ms-`/`.mb-rel-col-hdr-btn` or a
  `.worklink` glyph can precede them, and `.mb-col-uniq-wrap` **always** follows.
  Use the run-relative pair — `:not(.sort-icon-btn + .sort-icon-btn)` for the
  first, `:not(:has(+ .sort-icon-btn))` for the last. Mutated separately to
  attribute them: `:first-of-type` breaks only PREFIXED columns,
  `:last-of-type` breaks **every** column.
  `tests/fixtures/sort-pill-segments.spec.js`'s Length-column test is the sole
  guard on the first-in-run rule.
- **Side borders start at 0 and are re-grown.** Leaving the `border` shorthand's
  right border in place pairs it with the next segment's left border and draws
  every divider twice — 2px between segments, 1px at the edges. The spec caught
  this on its first run.

`.sort-icon-active` stays a bare class with `!important` (so it also beats
`:hover`) and keeps green-on-yellow rather than the family's blue: it is a
long-standing signal and far easier to find across a wide table. It now fills
the whole segment, which is only possible because the per-span radius is 0 for
anything mid-run.

## Column resize: the drag floor must be measured LATE

`makeColumnsResizable()` stamps `th.dataset.mbResizeMin`, but the value the drag
enforces is re-measured by `_measureHeaderMinWidth()` **at every mousedown**.
Both halves matter and the reasons are easy to get backwards.

- **Measure `max-content`, never `scrollWidth`.** `scrollWidth` on an element
  that FITS returns its `clientWidth` — i.e. the current column width — so a
  floor derived from it ratchets upward once a column has been widened, and the
  column can never be narrowed again. `max-content` is independent of the
  current width, which is what makes re-measuring safe at all.
- **Measure late, because the header is not finished at set-up time.** The
  `▶🔗` / `▶🖼` / `▶⏱` toggles are injected into `.mb-col-hdr-flex` *after*
  `makeColumnsResizable()` runs, and the `.mb-col-uniq-count` /
  `.mb-col-collapse-count` digits are written later still by the idle-scheduled
  `_updateAllColHeaderCounts()`. A floor frozen at set-up is short by 4-6 px on
  a plain column and by 43-126 px on one carrying a late toggle — which let a
  column be dragged narrower than its own header and clipped the 📊 pill.
- **The fresh measurement REPLACES the stamped one; do not `max()` them.** The
  stamped value is unreliable in both directions — too small for the reason
  above, and too large wherever it was taken after auto-resize had widened the
  column (measured: a floor of 765 px for a header needing 211, i.e.
  un-narrowable).
- **`_minWidth` lives in the per-column closure scope, not inside the mousedown
  handler.** `onMouseMove` is a sibling function, not a closure inside
  mousedown, so a `const` there throws `ReferenceError` on the first drag
  movement — and `node --check` cannot see it.

**When reproducing anything in this area, check the fixture settings first.**
`loadPage.js`'s `FIXTURE_SETTINGS_OVERRIDE` forces `sa_enable_caa_pics` and
`sa_enable_relationships_column` OFF for every fixture spec — i.e. it removes
the two largest late-injected controls. The first attempt to reproduce this bug
reported **0 of 21** affected columns for exactly that reason, against **20 of
21** on the real page. A "cannot reproduce" here means nothing until that
override has been switched back on.

## Common pitfalls

- `str_replace` requires the `old_str` to be **unique** in the file — include
  surrounding context if a pattern repeats
- `renderGroupedTable` inserts new h3/table pairs via `lastInsertedElement.after()` —
  changes near the cleanup pass affect where pairs land
- `getCleanColumnText` strips elements matching `_CLEAN_STRIP_SEL` — new hidden
  sort-key spans must be added there or they leak into filter matching
- `activeDefinition` is a module-level variable updated by `startFetchingProcess` —
  helper functions called during fetch see the merged definition, not `baseDefinition`
- `sortLargeArray` is async — callers must `await` it before touching the sorted array
- `renderFinalTable`/`renderGroupedTable` insert `cloneNode(true)` copies of rows on
  every sort/filter re-render — any element with a direct `addEventListener` call or a
  custom JS property (not a DOM attribute/class) loses it silently on the clone, even
  though classes/attributes/inline styles survive and can make the clone *look* still
  wired up. Existing re-wire-after-clone functions, all called from `runFilter()`'s
  single-table branch and/or `renderGroupedTable()`: `initExpandRGsFeature()`,
  `_cdtocInitTracklistToggles()`, `_rewireNestedTableH2Toggles()` (nested `<h2>`
  headings inside table cells, e.g. wiki-rendered Annotation sub-sections — see
  `makeH2sCollapsible()` for the page-level h2 mechanism this mirrors at a smaller
  scale), and `initPicardTaggerColumn(/* rewireOnly */ true)` (identical
  "cloneNode(true) strips listeners, this call only re-attaches them"
  rationale, called from the same two places, plus
  `_applyDiscographyViewFilter()`'s tail — that function re-clones source rows
  into live tbodies twice without going through `renderGroupedTable()`, so
  nothing else re-wires them; note it is *a per-row no-op while the Picard
  column is collapsed*, which is the default — it still walks every row, but
  per row it empties an already-empty `<td>` and stops, so nothing is scanned,
  built or wired. Its own header toggle is the one part of Picard that is
  already delegated, on the `<table>` element). **Three more members belong to this family and
  used to be missing from both this list and `PERFORMANCE.org` Step 23's:**
  `applyStickyColumn()` (per-row `mouseenter`/`mouseleave` plus the custom props
  `tr._mbStickyEnter`/`_mbStickyLeave` — the largest of them),
  `barcodeProcessTable()` (per-cell `click`), and
  `initAnnotationCompareRadios()` — which is *not* a listener at all:
  `cloneNode(true)` re-applies MusicBrainz's pristine `disabled` attribute, so
  event delegation could never fix it. A new interactive element
  injected into table cells needs the same treatment if it uses
  `addEventListener` directly instead of event delegation.
- **The two table modes render differently, and assuming otherwise is how a
  column silently loses its cells.** `renderFinalTable` **MOVES** the rows it is
  handed (`rows.forEach(r => tbody.appendChild(r))`), so on a single-table
  page's initial render the live rows *are* `allRows`' rows and anything
  appended to a live row lands on the source row for free.
  `renderGroupedTable` **ALWAYS CLONES** (`group.rows.forEach(r =>
  …r.cloneNode(true))`), on the first render too — so in `tableMode: 'multi'`
  nothing appended to a live row ever reaches `groupedRows[i].rows`, and the
  next re-render clones a row that never had it. This is documented in
  `_artResolveSourceCell()`'s JSDoc and is the reason
  `_artMirrorIconToSourceRow()`/`_artMirrorInlineThumbToSourceRow()` exist. It
  is also exactly how the Picard column came to empty out on every multi-table
  re-render (see `DEBUG-NOTES.md`, 2026-09-10): its own comment asserted the
  opposite. **Any feature that appends a cell or an element to a live row must
  mirror it onto the master row** — resolve it with `_findMasterRowByIdx()`
  (`data-mb-row-idx`, propagated by `cloneNode`), or with
  `_buildMasterRowIndex()` when the pass touches every row, since
  `_findMasterRowByIdx()` is a linear scan and per-row use makes the pass
  O(N²). **Mirror the BUILT node, do not re-derive it on the master:** a master
  row lacks the classes the live pass added (`.mb-sticky-col` above all, which
  `_picardExtractRowEntities()` skips), so re-deriving can legitimately produce
  *different* content than the live row.
- **`release-tracks` AR finders: never `.find()`/take-first on a "does this track
  have this relationship" lookup.** MusicBrainz can render the SAME relationship
  phrase (or a closely related one, e.g. "recorded at:" and "additionally recorded
  at:") as TWO OR MORE separate sibling `<dt>` elements for one track, each with its
  own `<dd>` — not multiple targets joined inside one `<dd>` (that's a different,
  already-handled case — see `_buildRecordedAtPlaceTd`'s own placelink-marker
  segmentation). A `.find()`-based finder silently drops every match after the
  first, with no error and no obviously-missing UI (the column still renders,
  just incomplete). This has bitten twice already: `_findPhonographicCopyrightDts`
  (artist-crediting `<dt>` in one `<dl>`, label-crediting `<dt>` in a sibling
  `<dl>`) and `_findRecordedAtDt`/`_findMixedAtDt` (a bare "recorded at:" `<dt>`
  and a separate "additionally recorded at:" `<dt>` for two different studios —
  see `debug/double-ars.html`). Both are now `.filter()`-based, returning every
  match; their builders (`_buildPhonographicCopyrightTds`/`_buildRecordedAtPlaceTd`)
  merge all of them into one cell. Any NEW finder over `_findAllArDts(titleTd)`
  should default to `.filter()`, and only narrow to "first match only" with an
  explicit, documented reason (e.g. "Recorded at event" intentionally stays
  single-anchor/never-a-list, so its row-building call site takes `[0]`).
