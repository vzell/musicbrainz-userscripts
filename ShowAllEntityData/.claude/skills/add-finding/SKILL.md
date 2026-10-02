---
name: add-finding
description: Add, reclassify or debug a data-quality "finding" in ShowAllEntityData — an entry of the `FINDINGS` registry that drives the ⚠️ WARNING / ❌ ERROR h1 menus, the 📊 "Findings - Warning/Error" sections and the generic yellow/red cell tint. Use this whenever the user asks to "flag X as a warning/error", "add X to the WARNING/ERROR menu", "tint cells that …", "make X filterable page-wide", "move X from WARNING to ERROR", "why does finding X not show / not filter / count wrong", or names any new data problem a cell can have (a style issue, an invalid identifier, a mismatch between two columns, a third-party marker). Also trigger when touching `stampFindings()`, `_findingRowFilter`, `_toggleFinding()`, `_updateFindingMenus()` or `data-mb-findings`.
---

# Findings: add or change one

A **finding** is one entry of `const FINDINGS = [` in `ShowAllEntityData.user.js`.
From that one entry it gets a row in the ⚠️ WARNING or ❌ ERROR h1 menu (after ❓),
an entry in its column's 📊 "Findings - Warning/Error" section (mode
`finding-<id>`), and — unless it already has a look of its own — the generic
cell tint and ⚠️/❌ glyph. Nothing else needs a per-finding line: the menus, the
📊 section, the matcher, labels, tooltips and tally all read the registry.

**Read `docs/claude/findings.md` before changing anything** — it is the authority
for the design and records why each rule below exists. This skill is the
checklist.

## Before writing code: answer five questions

1. **Level** — `'warn'` or `'error'`? Menu order is registry order within a
   level; put it where it reads best in its menu.
2. **What is the detector, and does it already exist?** Grep the 📊 matchers in
   `_cellMatchesStructureMode()` and the `_findCell*()` readers — most data
   problems already have one (title anatomy, live titles, ISRC/ISWC/barcode
   parts, release data quality, pending edits). Reuse it.
3. **Does it read SOURCE-row data?** `stampFindings()` stamps master rows, which
   never saw the render tail. Anything `initIsrcFormatting()`,
   `initIswcValidation()`, `initBarcodeValidation()` or another render-tail pass
   adds to a live cell is NOT on the master row. Derive from the cell's own
   markup or hrefs (the `_findCell*()` readers are written for detached clones).
   A detector that reads a render-tail decoration counts on one render and
   vanishes on the next filter pass.
4. **Scope** — can it sit in only one column per table (`'cell'`), or in
   several unrelated columns of one row (`'row'`)? 📊 ticks OR within one column
   and AND across columns, so a cell-scope finding spread over two unrelated
   columns would keep only rows flagged in both. Two cells that ALWAYS carry it
   together (length: Length + Recording length) are `coFlagged: true`, still
   `'cell'`.
5. **Look** — does it already have a tint of its own (a per-family CSS rule:
   `data-mb-len-flag`, `data-mb-video-flag`, `data-mb-work-flag`,
   `data-mb-live-flag`)? Then `tint: () => false`. Does the cell already show
   its own ⚠️/❌ (inline glyph)? Then `inlineGlyph: true` (tint only). Otherwise
   it gets a new `sa_findings_tint_<x>` setting.

## Touch points, in order

1. **The registry entry** in `FINDINGS` — `id` (`[a-z-]` only: it goes into a CSS
   attribute selector unescaped), `level`, `glyph`, `label` (descriptive, the
   menu row text), `tip` (the tooltip: what is wrong, and where the rule comes
   from — link the MusicBrainz style page if there is one), `scope`, optional
   `coFlagged` / `inlineGlyph` / `enabled()` / `rowGate()`, `cols(name, plan)`,
   `test(cell, row, plan)`, `tint(cell)`.
   - `cols` mirrors the column gate `openUniqDrop()` uses for the problem's own
     📊 entries (`plan.titleInfo(name)` for Title-info columns; a name test
     otherwise). Return `'*'` for "every cell", and give such a finding a cheap
     `rowGate(row)` (one `querySelector`) so rows without it cost nothing.
   - `enabled()` when the finding belongs to a feature with its own setting.
2. **A tint setting** (only for a new generic tint) — `sa_findings_tint_<x>` in
   the `⚠️ FINDINGS` group of `configSchema` (grep `divider_findings`), default
   `true`, read through `_findingTintSetting('sa_findings_tint_<x>')`. Then
   `python3 scripts/dump-config-defaults.py` and
   `python3 scripts/audit-config-defaults.py`. A new key needs no migration.
3. **A new per-family attribute** (rare: only if the finding brings its own
   CSS) — add it to `familyPainted` in `_writeFindingAttrs()` AND to the
   track-target rule's `:not()` list (grep `tr[data-mb-track-target] > td:not`).
   The generic `::after` out-ranks a family `::after` on specificity, so a cell
   both rules match must get no `data-mb-finding`.
4. **Nothing else in the code.** If you find yourself adding a branch to
   `_toggleFinding()`, `_cellMatchesStructureMode()`, `_structureModeLabel()`,
   `MB_UNIQ_MODE_TO_SECTION` or the 📊 emit blocks for ONE finding, stop — the
   registry already feeds all of them. The one exception is a finding whose
   filter semantics differ (see "Pending edits" in findings.md for why it is a
   plain row finding and does NOT drive ⏳).
5. **HELP** — the "What is checked" table under `## Warnings and errors` in
   `ShowAllEntityData_HELP.md`, and the ⚠️ Findings row of the settings-group
   table if a setting was added.
6. **WIP changelog** — `ShowAllEntityData_CHANGELOG.wip.json` on a feature
   branch (never `// @version` or the real changelog there).

## Tests (every finding ships with one)

Fixture specs, helpers in `tests/support/findingsMenu.js`
(`findingsMenuState`, `findingRow`, `clickFinding`, `clickClearFindings`,
`findingRowState`). Model new tests on `tests/fixtures/findings-menus.spec.js`
and `tests/fixtures/findings-stamp.spec.js`. Pin, for the new finding:

- **The count** — the menu row's count equals the number of ROWS carrying it,
  computed from the page, not a literal alone.
- **The filter** — clicking the row leaves exactly those rows (`visible ===
  withFinding === count`), on a multi-table fixture if the finding can occur
  there, and clicking again restores every row.
- **The look** — computed `background-color` and `::after` content, not only the
  attribute; for `inlineGlyph`, assert the `::after` is NOT the generic
  absolutely positioned one; with the tint setting off, no tint but the menu row
  stays.
- **Survival** — the stamp is still there after a filter re-render (proves the
  master rows were stamped), and, if the pageType supports Save to Disk, after a
  round trip.

Then add entries to `scripts/mutations/findings-menus.json` (or a new list) for
the finding's own guards — at minimum "the detector never matches" and, for a
tint, "the tint setting is ignored" — and run
`python3 scripts/mutation-check.py scripts/mutations/<list>.json`. A guard no
fixture can see is recorded `"expect": "pass"` with the reason and what fixture
would cover it, never left out.

Run `npm test` (and `npm run test:full` before asking to merge). Specs that
read the menus: grep `findingsMenu` under `tests/`.

## Performance

`stampFindings()` runs once per fetch/disk load and walks rows × the finding's
columns; per keystroke nothing is walked (the menu tally is memoized per
source-row array AND per stamp generation). A new detector therefore costs
render time, not filter time. If its `test()` does real work (parsing, a
`getCleanColumnText()` per cell), say so before implementing and measure on
`artist-events` with the `run-perf-comparison` skill (CLAUDE.md, "Performance
is a priority").

## Known failure modes

| Symptom | Cause |
|---|---|
| Menu row appears after one render, gone after a filter | `test()` reads a render-tail decoration, so master rows are never stamped |
| Menu never appears though cells are stamped | a tally memo without the stamp generation (`_findingStampGen`) |
| Count drops when a filter hides the rows | a tally of the live tbody instead of the source rows (AUDIT.md §3.6) |
| Clicking leaves other sub-tables untouched | a tick written only to tables holding the finding — every table must be ticked |
| Two-column finding shows almost nothing | a cell-scope finding in two unrelated columns: 📊 ticks AND; make it `'row'` |
| ⚠️ on a red cell | a family-painted cell got `data-mb-finding` (step 3) |
| Two glyphs in one cell | the cell has its own glyph but the finding lacks `inlineGlyph` |
| Toggling off does nothing | a structural filter missing from `_buildFilterKey()` / `_buildIncrPartialKey()` |
