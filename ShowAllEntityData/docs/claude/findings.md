<!-- Written on branch feature/findings-menus (org/generalize-error-warning.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# Findings: the ⚠️ WARNING / ❌ ERROR menus and the generic cell tint

A **finding** is a data-quality fact about one cell: a track and recording
length that disagree, a live-title date that cannot exist, a pending edit, an
ALL UPPERCASE title, an invalid ISRC, … Every finding is one entry of the
`FINDINGS` registry (grep `const FINDINGS = [`), and from that one entry it
gets three things:

- a row in the **⚠️ WARNING** or **❌ ERROR** pull-down in the h1 toolbar,
  after ❓ behind its own `|` divider, with a row count and a tooltip;
- an entry in the 📊 **"Findings - Warning" / "Findings - Error"** section of
  the column that holds it (mode `finding-<id>`);
- the yellow (warn) or red (error) **cell tint** with a ⚠️/❌ glyph, unless the
  finding already had a look of its own.

**A new finding is one `FINDINGS` entry.** Nothing else needs a per-finding
line: the menus, the 📊 section, the matcher, the labels and the tally all read
the registry. The checklist for adding, reclassifying or debugging one is the
project skill `add-finding` (`.claude/skills/add-finding/SKILL.md`).

## The registry contract

| Field | Meaning |
|---|---|
| `id`, `level`, `glyph`, `label`, `tip` | Identity, `'warn'`/`'error'`, and the menu row's text. Ids are `[a-z-]` tokens: they go into a CSS attribute selector unescaped. |
| `scope` | `'cell'` → the menu ticks a 📊 entry; `'row'` → the row filter. See below. |
| `coFlagged` | Length only: both duration cells always carry the same flag, so ticking the first column suffices. |
| `inlineGlyph` | The cell already shows its own ⚠️/❌ (ISRC, ISWC, barcode, live credit): tint only. |
| `enabled()` | Optional; the finding's own feature setting (`sa_enable_pending_edits_section`, `sa_enable_barcode_validation`). |
| `cols(name, plan)` | Which columns are tested. `'*'` = every cell of a row that passes `rowGate()`. |
| `test(cell, row, plan)` | The detector. |
| `detail(cell, row, plan)` | Optional, cell scope: this cell's own text, appended to its tooltip line after the label (`rec-event-mismatch`/`rec-place-mismatch` name both values). Same source-row rule as `test()`. |
| `tint(cell)` | Whether this finding paints. `false` for the families that already had CSS (length, video, no-work, live titles); the rest read their `sa_findings_tint_*` setting. |

**`test()` reads SOURCE-row data, never post-render decoration.** The stamp
reaches master rows, and a master row never saw the render tail —
`initIsrcFormatting()`, `initIswcValidation()` and `initBarcodeValidation()`
decorate the live clones. So ISRC validity comes from `_findCellIsrcParts()`,
not from `a[data-mb-isrc-invalid]`. Reuse the 📊 readers (`_findCell*`), which
were written for detached clones already.

**Column gates on `plan`.** `_findingPlanForTable()` hands every `cols()`
two name predicates: `plan.titleInfo(name)` (Title + `sa_uvd_title_info_columns`)
and `plan.eventName(name)` (Event + `sa_uvd_event_name_columns`). The
release/RG live-title findings (`live-*`) and the event-name ones
(`event-live-sep`, `event-style-nearmiss`, `event-live-invalid`,
`event-live-nearmiss`) are separate entries on purpose: different columns,
different readers (`_findCellLiveTitle()` vs `_findCellEventName()`), so
neither family ever counts the other's cells.

Recording comments add `plan.recComment(name)` (`_recCommentColumnKind()`:
`'plain'`/`'link'`/`null`, read per cell via `_findingRecComment()`),
`plan.recPlainIdx` (the row's "Disambiguation" cell, which `rec-date-*`
compares with the "Recording date" cell they test and tint) and
`plan.eventStateIdx` (for `event-state-missing` on Event-Country).
`rec-event-mismatch`/`rec-place-mismatch` read the same `plan.recPlainIdx`
through `_rowRecCommentEvent()` (only the full "<type>, DATE: Venue, …" form
names an event and a venue) and compare it with the event/place names of the
cell they test (`_findCellLinkedNames()`; a place's name is its `<bdi>`, the
text before " in …"). The
`rec-date-*` tint deliberately sits on the Recording date cell, not on the
comment cell: that one may already carry `data-mb-live-flag`, which
suppresses the generic tint.

## The stamp: `stampFindings()`

Same shape and same reasons as `stampLiveTitleFlags()`, and called right after
it at the fetch tail and the disk-load tail: ONCE per fetch or load, never on a
filter or sort re-render. It writes live rows, their master rows
(`_buildMasterRowIndex()`) and the owner arrays' rows the current filter left
out, because `renderGroupedTable()` always renders clones. Per cell:

- `data-mb-findings="id id"` — every finding, regardless of settings. The 📊
  matcher, the row filter and the menu tally read this.
- `data-mb-finding="warn|error"` — the worst level among the findings that
  tint. Drives the generic CSS rule pair.
- `data-mb-finding-inline` — the cell shows its own glyph at that level.
- `title` — only on a cell with no tooltip of its own and no family flag
  (`data-mb-finding-tip` marks one the stamp wrote).

**A cell a per-family rule already paints gets no `data-mb-finding`.** The
generic `::after` selector carries a `:not()`, so it out-ranks the family's
`::after` on specificity and would put a ⚠️ on a red cell. The family flags are
`data-mb-len-flag`, `data-mb-video-flag="mismatch"`, `data-mb-work-flag`,
`data-mb-live-flag`; a new family attribute must be added to that check in
`_writeFindingAttrs()` and to the track-target rule's `:not()` list.

The same pass stamps each release-tracklist row's `data-mb-event-key`
(`_eventKeyColsForTable()`/`_stampRowEventKey()`), which the h3 "🎪 N events"
badge (`_updateMediumEventBadges()`, memoized on `_findingStampGen`) and the
📊 "Event info - Events on this medium" section count (org/live-bootleg.org 3).

Since item 4 the stamp runs in TWO passes, both through `_forEachStampRow()`
(live row, master row, filtered-out owner rows): pass 1 writes every event
key page-wide, `_computeMainEventCtx()` then decides the main event from the
release group title in the page's JSON (by DATE, for a valid live title; the
table's `data-mb-multi-event`, which the green "#" needs, only with 2+ dates on
the page), and pass 2 writes `data-mb-main-event` before the
findings, because `rg-title-mismatch` reads it. `_forEachStampRow()` reaches
a live clone AND its master, so anything that COUNTS rows there must dedupe
by `data-mb-row-idx` (`_computeMainEventCtx()` once counted 76 tracks for 38).

Attributes only, so none of the "writing cell text after the render" duties
apply (docs/claude/filter-and-cache-invariants.md) — except the 📊 cache,
whose `findingCounts` come from these attributes: the stamp invalidates each
table's uniq cache.

## Counting: `_findingRowTally()` and the stamp generation

The menus count ROWS (a length mismatch marks two cells of one track), over the
captured SOURCE rows — never the live tbody, which `runFilter()` empties of
non-matching rows (AUDIT.md §3.6: a count of 0 would remove the only way back).

The tally is memoized per source-row array like `_sourceRowTally()`, plus
`_findingStampGen`. **`_sourceRowTally()`'s "no invalidation hook" argument
does not carry over**: it holds because its marker (`span.mp`) exists before
capture, while the stamp writes into rows that are ALREADY captured — and
`updateFilterButtonsVisibility()` can tally them during the render, before the
stamp. Without the generation that pre-stamp "nothing" is what the menus show
(`scripts/mutations/findings-menus.json`).

## Applying a menu row

`_toggleFinding(id)` composes with every other filter (AND), like ticking 📊
entries by hand, and runs `runFilter()` once.

- **Cell scope** — `_findingTickTargets()` finds the column of the name that
  holds the finding (on the source rows) and ticks `\u0003finding-<id>` in that
  column of **every** table through `_writeUniqValueSet()` (the
  `applyUniqValueSet()` body without its `runFilter()`). A table without the
  finding is ticked too: that is what empties it. The column filter box shows
  the entry's label; every clear path unticks it.
- **Row scope** — `_findingRowFilter`, a page-wide Set: a row passes when some
  cell carries each id. `testRowMatch()` reads it, `_buildFilterKey()` and
  `_buildIncrPartialKey()` key it, `clearAllFilters()` empties it, and the
  filter bar shows one chip per id (`#mb-findings-chips`) with a ✕.
- **Fallback to the row filter** for a cell finding whose 📊 tick cannot say
  "rows with it": two unrelated columns in one table (ticks AND), different
  column names across tables, a table without that column, or a target column
  in Exclude mode.

**Pending edits is a plain row finding and does NOT drive the ⏳ toggles.** The
global ⏳ filters only the sub-tables that have pending edits and leaves the
others showing every row; "only these rows, page-wide" is what a menu row
means. The two filter side by side.

**The checked state is derived, never stored** — from the inputs'
`mbUniqValues` or the Set, on every refresh. That is why "Clear ALL COLUMN
filters", Shift+Esc, a ✕ in a column box or an untick in 📊 keep the menu
honest without a hook of their own.

## The menus

`_ensureFindingMenu(level)` → `createToolbarMenu()` with keys `findings-warn` /
`findings-error`. Unlike 📦 Data and 🛠 View they **build their own rows**
(`_buildFindingMenuRows()`, `menuitemcheckbox`, adopted via `adopt()` for the
keyboard and close behaviour) instead of adopting existing toolbar buttons —
there are no such buttons; the rows ARE the feature. Row styling therefore
lives in `.mb-findings-menu-item` CSS, not in an adopted button's own inline
style. `_updateFindingMenus()` runs from `updateFilterButtonsVisibility()` (and
the stamp's tail), rebuilds rows only when a count or a checked state changed,
and shows `#mb-button-divider-findings` only while a findings menu is attached.
`sa_enable_findings_menus` turns both off.

Pinned by `tests/fixtures/findings-menus.spec.js` and
`tests/fixtures/findings-stamp.spec.js` (helpers:
`tests/support/findingsMenu.js`), mutation-checked by
`scripts/mutations/findings-menus.json`.

## Replaced

The filter bar's live-date "(N) WARNING ⚠️ / (N) ERROR ❌" buttons
(`_countLiveDateFlags()`, `_applyLiveDateFlagFilter()`, which typed the glyph
into the GLOBAL filter and cleared every other filter) and its "(N) LENGTH
⚠️/❌" buttons (`_lenMismatchFilterKind`). Their specs now pin the same
guarantees on the menu rows.
