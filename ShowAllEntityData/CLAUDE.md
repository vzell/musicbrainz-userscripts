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
**Help:** `ShowAllEntityData_HELP.txt` (TEXT, lives alongside the script)
**Library dependency:** `VZ_MBLibrary.user.js` (external `@require`; provides `Lib.*`)
**External dependencies:** `iro` (colour picker), `pako` (compression)
**Other top-level docs:** `PERFORMANCE.org` (measurements + numbered Steps),
`PAGETYPES-TESTING-REFERENCE.org` (every pageType, its URL, its coverage plan),
`DEBUG-NOTES.md` (dated root-cause log), `REFACTORING.org`, `forum.org`

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
fix, or by planting an early `return`.

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
  by hand.** It has drifted twice, in both directions.
- **Record the machine and the wall-clock time. Every timing, every time.**
  `capture-interaction-perf.js` and `capture-snapshots.js` write a `machine`
  block (hostname, cores, node and Playwright versions) plus UTC
  `startedAt`/`finishedAt` into their JSON, and every measurement that ends up
  in prose — a commit message, `PERFORMANCE.org`, `DEBUG-NOTES.md` — must name
  the host and when it ran. The time matters because every sample fetches its
  page shell from the live site, so "was MusicBrainz busy at that hour" is a
  standing hypothesis for any unexplained difference — one that can only be
  tested against runs that recorded when they happened. A number with no machine attached cannot be compared to a later one,
  so it is not evidence. This rule exists because a 1.5-2x gap between two
  `main` arms could not be resolved at all: nothing recorded which machine
  either ran on, so it was attributed first to machine state and then to
  concurrent load, both guesses, and the second was disproved. Mark an unknown
  host as unknown rather than inferring it — at least one archived arm is known
  to be from a different machine.
- **`tests/MEASUREMENTS.org` is the log**: every timing, wall clock and count,
  with its host, what it was probing, and — for anything naming a page, a URL or
  a `rendered.html` — that page's pageType, `tableMode` and human title. Add a
  row there when you measure something, rather than leaving it in a commit
  message where the next person will not find it.
- The `run-perf-comparison` skill runs and interprets the instrumentation.
- Committed baselines: `tests/snapshots/artist-events/interaction-perf-*.json`
  (interaction latency) and `tests/snapshots/artist-releasegroups/perf-baseline*.json`
  (end-to-end fetch/render). Both are medians of 5 samples, kept per-branch.
- Current `main` reference point, on the 4174-row `artist-events` disk fixture,
  captured 2026-09-08 at 9.99.1048: global filter ~3033 ms, column filter
  ~3295 ms, sort ~6410 ms, uniq-dropdown ~45 996 ms cold / ~1676 ms warm,
  header counts ~8033 ms initial / ~12 319 ms restore. Re-measure rather than
  trusting these if a decision hinges on them.
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

## Git Workflow
- Never commit feature work directly to `main`. Always create a feature branch first (`git checkout -b <topic>`), commit there, then merge via PR or fast-forward and push.
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
| `.mb-sticky-col`                            | Sticky first column                                                                                                                                                                             |
| `.mb-cell-collapse-toggle`                  | Per-cell ▶/▼ collapse toggle — drives BOTH list cells (`ul>li`) and prose cells (`.mb-text-clamp-inner`)                                                                                        |
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
small fraction of the whole — grep `const configSchema` and read the block for
the full set rather than assuming this list is complete or that a key you
remember still has the name you remember. (`sa_enable_expand_rg` was documented
here for a long time; the real key is `sa_enable_expand_rgs`, plural.)

- `sa_enable_debug_logging` — enables `Lib.debug(channel, …)` output
- `sa_ui_h2_bg`, `sa_ui_h3_bg` — h2/h3 header background colours
- `sa_ui_thead_th_bg/color` — table header colours
- `sa_enable_barcode_highlight` — gates `initBarcodeHighlight()`
- `sa_enable_caa_pics` — shared CAA/EAA master toggle (there is no separate
  `sa_enable_eaa_pics` — EAA reuses this same key)
- `sa_enable_picard_tagger` — gates the Picard-tagger column feature
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
  fixtures via `page.route()`, no network. Run via plain `npm test`; this
  is the default, CI-safe suite.
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
- **`_countLengthMismatchRows()` must count `_msSourceRows()`, not the live
  tbody.** `runFilter()` REMOVES non-matching rows from a multi-table tbody
  rather than hiding them, so a live-DOM tally reports only what the current
  filter left — filtering to ⚠️ made the ❌ button vanish.
- **`updateFilterButtonsVisibility()` must count it as an active filter**, or
  the rows narrow while every "clear" affordance stays hidden. It is the one
  active filter with no input holding it, so `clearAllFilters()` resets it
  explicitly too.
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
  order and highlighting come along automatically because every consumer reads
  the rendered text. The uniq-dropdown cache must be force-invalidated (its
  key is the visible row set, which does not change).
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
  rationale, called from the same two places). A new interactive element
  injected into table cells needs the same treatment if it uses
  `addEventListener` directly instead of event delegation.
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
