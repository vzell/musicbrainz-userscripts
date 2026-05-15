# ShowAllEntityData Userscript — Claude Code Guide

## Project overview

`ShowAllEntityData_user.js` is a Tampermonkey userscript (~44,000 lines, ~2.4 MB) for
MusicBrainz. It consolidates paginated and non-paginated entity table lists into a single
view with real-time multi-column filtering and sorting.

**Current version:** `9.99.588+2026-05-15`
**Changelog:** `ShowAllEntityData_CHANGELOG.json` (JSON, lives alongside the script)
**Library dependency:** `VZ_MBLibrary.user.js` (external `@require`; provides `Lib.*`)
**External dependencies:** `iro` (colour picker), `pako` (compression)

---

## Mandatory conventions — apply to every change

- Bump `// @version` in the `==UserScript==` header (line 4). Format: `M.MM.NNN+YYYY-MM-DD`
- Add a changelog entry to `ShowAllEntityData_CHANGELOG.json` in the same session
- 4-space indentation, no tabs, no trailing whitespace
- All functions must have JSDoc `/** … */` blocks

---

## Changelog format

```json
{
  "version": "9.99.XXX",
  "date": "YYYY-MM-DD",
  "sections": [
    {
      "label": "🐛 Fix | ✨ Improve | 🚀 Feature | 🔧 Refactor | 📝 Docs",
      "items": [ "Description of the change." ]
    }
  ]
}
```

Prepend new entries at the top of the JSON array.

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
               applyInsertH2, applyInsertPrependH2, applyShowAllTags
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
7. Bump version, add changelog entry

---

## Adding a new column extractor — checklist

1. Add extractor function to `ColumnDataExtractor` (line ~2064) with JSDoc
2. Reference by function-name string in `features.columnExtractors` of the page definition
3. Add corresponding header name strings to `syntheticColumns`
4. If the extractor produces a sort-key span, add its class to `_CLEAN_STRIP_SEL`
   (so `getCleanColumnText` does not leak sentinel values into filter matching)

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
