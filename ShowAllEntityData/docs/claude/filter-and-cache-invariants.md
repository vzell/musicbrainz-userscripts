<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Filter, cache and collapse invariants

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

## Which Cc / Rx / Ex boxes govern which query

**With `sa_enable_column_filter_modes` on (the default), every level owns its
switches**: the global boxes govern the global query only, a sub-table's 🔍
boxes its text only, and each column's own chips (or its compact button's
pop-up) that column's typed text and 📊 selection. **`_colFilterFlags(inp,
table)` is the one place that decides a column filter's flags**; it reads the
input's `data-mb-mode-{cc,rx,ex}` attributes (`_readColFilterModes()`), which
survive a `cloneNode(true)` of the header where JS properties would not. Pinned
by `tests/fixtures/column-filter-modes.spec.js` and
`scripts/mutations/column-filter-modes.json`.

- `getColFilters()`'s three flag arguments are the OWNER's and are ignored per
  input while modes are on — do not "fix" a caller to pass column flags.
- Every clear path resets a column's modes (`_resetColFilterModes()`): the ✕,
  Escape, `clearAllFilters()`, the clear buttons, a new fetch. Backspacing a
  field empty does not — the switches are the field's, not its text's.
- The chips/button switch is a CSS container query on
  `.mb-col-filter-wrapper.mb-col-modes`, threshold
  `sa_column_filter_modes_compact_width` (160). Below ~155 px the chips cover
  the field's middle, so the obvious click would toggle a switch; the spec
  asserts `elementFromPoint(middle) === input` for every cell showing chips. A
  layout guard asserts that the container class changes no column's width.
- Chips and the button are handled by ONE delegated listener
  (`_ensureColFilterModeDelegate()`), and a capture-phase `mousedown`
  `preventDefault()` keeps the caret in the field.

**With the setting off**, column filters have no boxes of their own. They
borrow a wider level's, and **`_resolveColFilterFlags(table)` is the one place
that decides which**:

| Page         | Global boxes govern | A sub-table's 🔍 boxes govern                             |
|--------------|---------------------|-----------------------------------------------------------|
| single-table | global query AND every column filter | — (no panel)                           |
| multi-table  | global query only   | that sub-table's text AND every column filter in it — also while the panel is CLOSED |

📊 selections follow the same owner's Cc and Ex (never Rx). Four rules keep this
consistent, each written after it had been broken (findings F3–F7 of
`org/column-level-checkbox-filtering.org`, pinned by
`tests/fixtures/filter-flag-scoping.spec.js` — which seeds the setting off — and
`scripts/mutations/filter-flag-scoping.json`):

- **Never hand-roll the lookup.** `runFilter()`, `_artHighlightArtCell()` and
  the status lines each had their own copy, and they disagreed about a table
  with no panel (Rx `false` in one, the global Rx in another). Also: inside
  `createSubTableFilterContainer()` the names `caseCheckbox`/`rxCheckbox`/
  `exCheckbox` are the SUB-TABLE's boxes and shadow the global ones — that is
  how the h3 status came to label the global query with the sub-table's Cc.
  Use `_globalFilterFlags()` for the global boxes.
- **A box change must re-run everything it governs.** A sub-table box governs
  column filters, so its `change` goes through `applySubTableModes()`, which
  calls `runFilter()` when that table has a column filter (`applySubFilter()`
  alone only re-applies the sub-table text). Anything that sets a box
  programmatically — the history widget's `_applyEntry()` does — needs the same
  path, because `.checked =` fires no `change`.
- **The highlight context's own flags are the GLOBAL ones.**
  `_activeFilterHighlightCtx.isRegExp/isCaseSensitive` and
  `_artHighlightArtCell()`'s snapshot are what `_artHighlightImageLi()` compiles
  the global query with; column descriptors carry their own flags. Writing a
  sub-table's flags there made the image rows highlight a global regexp as
  literal text.
- **Every status line goes through the shared builders.**
  `_buildSubTableFilterStatus()` (both writers of a sub-table's h3 span) and
  `_describeColFilters()` (the column parts of every line) print the modifiers
  in force per part and the query as typed. The two h3 writers used to disagree
  about the global flags and about the row count; the last one to run won.

**A plain global query is matched one cell at a time**, like a regexp one:
`_cachedFullText()` joins the cells with `_CELL_TEXT_SEP` (U+001F) through
`getCleanVisibleText(row, cellSeparator)`, so "Rest Bruce" can no longer match
the end of one cell plus the start of the next. Text nodes INSIDE one cell are
still joined with a space — a name and its disambiguation comment must stay
matchable, which the spec's `guard: F6` test pins.
