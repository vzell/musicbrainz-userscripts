# ShowAllEntityData Userscript — Claude Code Guide

## Project overview

`ShowAllEntityData.user.js` is a Tampermonkey userscript (~44,000 lines, ~2.4 MB) for
MusicBrainz. It consolidates paginated and non-paginated entity table lists into a single
view with real-time multi-column filtering and sorting.

**Changelog:** `ShowAllEntityData_CHANGELOG.json` (JSON, lives alongside the script)
**Help:** `ShowAllEntityData_HELP.txt` (TEXT, lives alongside the script)
**Library dependency:** `VZ_MBLibrary.user.js` (external `@require`; provides `Lib.*`)
**External dependencies:** `iro` (colour picker), `pako` (compression)

---

## File structure

Everything lives inside a single IIFE `(function() { 'use strict'; … })()`.
There are no ES modules. Key sections in order:

```
lines 1-57     ==UserScript== header + attribution comments
lines 60-139   Third-party script attribution block (do not edit)
lines 140-163  Script constants: SCRIPT_BASE_NAME, SCRIPT_ID, remote URLs
lines 164-1941 configSchema — settings menu definitions (checkboxes, colour pickers, etc.)
line 1942      const Lib = new VZ_MBLibrary(…)  — library initialisation
lines 1999-    ColumnDataExtractor registry (named extractor functions)
lines 3090-    SyntheticColumnDataExtractor registry
lines 3352-    buildActive* helpers (column extractors, erasers, injected columns)
lines 3913-    DOM pre-processing helpers: applyListToTable, applyRenameH2ToH3,
               applyRenameH2ToH1, applyInsertH2, applyInsertPrependH2, applyShowAllTags
lines 4954-    pageDefinitions[] array — one entry per recognised URL pattern
lines 16400-   Init block: page type detection, header location, button injection
lines 22828-   runFilter() — real-time filter logic
lines 24295-   startFetchingProcess() — main fetch pipeline entry point
lines 26806-   renderFinalTable() — single-table render (tableMode: 'single')
lines 27830-   renderGroupedTable() — multi-table render (tableMode: 'multi')
lines 29593-   makeH2sCollapsible()
lines 31973-   Sort click handler and sortLargeArray() delegation
lines 38009-   initExpandRGsFeature() — release-group expand/collapse
lines 39158-   CAA_CTX / EAA_CTX context descriptors
lines 44338-   initCaaPics() / initEaaPics() — artwork feature entry points
lines 44837-   initBarcodeHighlight()
line 44860-    ctrlMFunctionMap — keyboard shortcut registry
```

---

## Page definition anatomy

All supported URL patterns are registered in `const pageDefinitions` (line 4954).
Each entry follows this shape:

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

---

## Render pipeline (`startFetchingProcess` → render)

```
startFetchingProcess(e, buttonConfig, baseDef)
  │
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

---

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

---

## DOM conventions

| Element / class | Purpose |
|---|---|
| `table.tbl` | All data tables created by this script |
| `.mb-master-toggle` | Show/Hide all sub-sections button (multi-table pages) |
| `.mb-toggle-h3` | Clickable h3 section headers |
| `.mb-toggle-h2` | Clickable h2 section headers |
| `.mb-filter-container` | Filter bar wrapper |
| `.mb-sort-status` | Sort indicator |
| `.mb-caa-sort-key` | Hidden sort/filter sentinel for CAA artwork presence |
| `.mb-eaa-sort-key` | Hidden sort/filter sentinel for EAA artwork presence |
| `.mb-inline-art-sort-key` | Hidden sort key for inline thumbnail presence |
| `.mb-rel-cell` | Relationship icon cell |
| `.mb-sticky-col` | Sticky first column |
| `.mb-cell-collapse-toggle` | Per-cell ▶/▼ collapse toggle — drives BOTH list cells (`ul>li`) and prose cells (`.mb-text-clamp-inner`) |
| `.mb-text-clamp-inner` | Wrapper around a "prose" collapsable cell's content (e.g. "Annotation"); height-clamped by default |
| `.mb-text-clamp-expanded` | Toggled on `.mb-text-clamp-inner` to lift the height clamp |

---

## Settings keys (GM storage via `Lib.settings`)

All settings are prefixed `sa_`. Key ones:

- `sa_enable_debug_logging` — enables `Lib.debug(channel, …)` output
- `sa_ui_h2_bg`, `sa_ui_h3_bg` — h2/h3 header background colours
- `sa_ui_thead_th_bg/color` — table header colours
- `sa_enable_barcode_highlight`, `sa_enable_caa_pics`, `sa_enable_eaa_pics`
- `sa_enable_picard_tagger_column`, `sa_enable_expand_rg`

---

## Debug channels (`Lib.debug('channel', …)`)

`init`, `render`, `fetch`, `filter`, `sort`, `parse`, `extract`, `caa`, `eaa`,
`idb`, `cache`, `collapse`, `expand`, `cleanup`, `highlight`, `ui`, `settings`,
`picard`, `barcode`, `erg`, `cdtoc`, `navigation`, `meta`, `density`, `export`

Enable via the `sa_enable_debug_logging` setting or the Tampermonkey menu.

---

## Debug material
- HTML snapshots and console logs live in `debug/` subdirectories
- `debug/` folders are gitignored
- Always read `debug/NOTES.md` if it exists before starting work
- Always read the relevant `debug/*.html` before proposing any DOM fix
- Document snapshots in `debug/NOTES.md` with date and what they show

---

## Adding a new page type — checklist

1. Add entry to `pageDefinitions` array (maintain alphabetical grouping within entity class)
2. Set `type`, `match`, `buttons`, `features`, `tableMode`
3. Check DOM structure of the actual page — use a snapshot in `debug/`
4. If the page has no `div#content`, verify `renderGroupedTable`'s container re-root
   handles it (targetHeader must be inside the resolved container)
5. If `tableMode: 'multi'` and the page has no native h2, add `insertH2`
6. If the page has native h2s that should become h3s, add `renameH2ToH3: true`
7. If the page has no native h1 at all (its only heading is a `<h2>`), add
   `renameH2ToH1: true` plus `insertH2: '…'` — otherwise the page-load button
   toolbar and the post-render filter/count UI both end up crammed onto the
   same native heading (see `applyRenameH2ToH1`'s JSDoc,
   `debug/user-edits-wrong.org`)
8. Bump version, add changelog entry

---

## Adding a new column extractor — checklist

1. Add extractor function to `ColumnDataExtractor` with JSDoc
2. Reference by function-name string in `features.columnExtractors` of the page definition
3. Add corresponding header name strings to `syntheticColumns`
4. If the extractor produces a sort-key span, add its class to `_CLEAN_STRIP_SEL`
   (so `getCleanColumnText` does not leak sentinel values into filter matching)

---

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
  `debug/annotation.html`). Always wrapped in `.mb-text-clamp-marker`
  (unconditionally — this is what `_isProseCollapseColumn` keys off, see
  below). When the `sa_enable_annotation_collapse` setting (default `true`,
  "📝 ANNOTATION COLUMNS" section in `configSchema`) is on, the wrapper also
  gets `.mb-text-clamp-inner` and is height-clamped (~4 lines); toggle shows
  a "more"/"less" label instead of a count. Only cells that actually overflow
  the clamp get a toggle. When the setting is off, cells stay bare (full,
  unclamped text, no toggle).

Auto-resize (`toggleColumn`, `toggleColumnInTable`, `toggleSubTableAutoResize`,
`toggleAutoResizeColumns`) caps prose columns' measured width via
`_getProseColumnMaxWidth()` (reads `sa_annotation_column_max_width`, default
`480`) instead of sizing them to a paragraph's unwrapped nowrap width. This
cap is **always active** for any column `_isProseCollapseColumn` identifies
(via the always-present `.mb-text-clamp-marker`) — independent of
`sa_enable_annotation_collapse`.

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

---

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
lists every kind actually seen: artist/label/place/event/work/area/series),
the column CAN split into one per kind, named `` `${baseColumnName} ${kind}` ``.
A single-kind relationship's column name is never suffixed.

**`PEER_SPLIT_KINDS` — only `artist`/`label` may ever trigger that split.**
This is a load-bearing distinction, not an arbitrary restriction — two
different relationship *shapes* share the same `<span class="{kind}link">`
marker syntax but need opposite treatment:
- **Peer-shaped** (artist/label): repeated markers of the same or different
  peer kind mean MULTIPLE DISTINCT credited entities (comma/"and"-joined
  artists, or a mix of artists and labels — see
  `_buildPhonographicCopyrightTds`). Each marker is a real segment boundary.
- **Chain-shaped** (place/event/work/area/series): a SINGLE primary target
  (if any) accompanied by its own nested geographic/hierarchical decoration
  that legitimately reuses `arealink` repeatedly — e.g. a place's own "in
  `<area>`, `<area>`, `<country>`" chain, or an area crediting its OWN parent
  area (`"recorded in:"`, `"mixed at:"` — see `debug/therising.html`).
  Marker KIND alone can't tell "the credited target" from "its own
  decoration" here, sometimes not even marker IDENTITY (an area's own
  ancestry reuses the exact same `arealink` class as the area itself).

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
onto `def.features.collapsableColumns`, and — when exactly one entity kind
is known for it (see `_glyphClassForDynamicColumn`) — a
`{columnName, glyphClass}` pair onto `def.features._dynamicArColumnGlyphs`,
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

---

## Things to check before any DOM-related fix

- Does the page have `div#content`? (Most do. `user/*/tags` does not.)
- Where does `table.tbl` live relative to `targetHeader`?
- Is `targetHeader` a sibling or ancestor of `container`?
- Does `applyListToTable` run before `renderGroupedTable`? (Changes parentNode of tables.)

---

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
  scale). A new interactive element injected into table cells needs the same
  treatment if it uses `addEventListener` directly instead of event delegation.
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
