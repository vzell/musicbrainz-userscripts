---
name: add-column-extractor
description: Add a new column extractor to ShowAllEntityData.user.js — a function that splits, parses, or transforms one column's cell content into one or more synthetic columns. Use this whenever the user asks to "add a column extractor for X", "split this column into Y and Z", "parse this cell shape", wants a new `ColumnDataExtractor`/`SyntheticColumnDataExtractor` entry, or describes a native MusicBrainz cell shape (a date string, an entity link, a format+count string, an icon-prefixed value, …) that should become its own filterable/sortable synthetic column(s).
---

# Adding a column extractor

`ShowAllEntityData/CLAUDE.md`'s own "Adding a new column extractor"
checklist is four lines — enough to remind you the pieces exist, not enough
to actually place a new extractor correctly on the first try. The real
decision isn't "write a function," it's "which of three related registries
does this belong to, and does it need any of four optional side-wirings
(cleanup, sentinel registration, alignment, collapse)?" This skill is that
decomposition, with real precedent to copy from instead of inventing a
shape from scratch.

Line numbers below are current as of this writing but drift with every
edit to this ~63k-line file — re-grep the symbol name (`grep -n "function
buildActiveColumnExtractors"`, etc.) rather than trusting a stale number,
same convention `CLAUDE.md` itself states.

## Before writing any code

1. **Which registry does the source column belong to?**
   - Already native on the fetched page (scraped straight from
     MusicBrainz's own HTML, found by a `<th>` header-name scan) →
     `ColumnDataExtractor` (registry opens at `ShowAllEntityData.user.js:3019`,
     contract comment at 2778-2795), referenced via a page definition's
     `features.columnExtractors` array.
   - Itself the OUTPUT of another extractor entry on the SAME page
     definition — a column that only exists because a `columnExtractors`
     entry (or `extractMainColumn`) produced it earlier in the same fetch
     pass → `SyntheticColumnDataExtractor` (registry opens at 4136,
     contract comment 4113-4135), referenced via
     `features.syntheticColumnExtractors`. Resolved by NAME against a map
     of already-produced cells (`primarySyntheticCellMap`), not a DOM
     `colIdx` scan — this is the one structural difference from the first
     registry; the function contract (`extractorFn(sourceCell) →
     HTMLTableCellElement[]`, array length must match `syntheticColumns`)
     is otherwise identical.
   - Only exists because of an async-populated `injectedColumns` entry (a
     wholly new column with no native source at all, e.g.
     `'Relationships'`/`'Release events'`, populated by a dedicated
     fetcher function, not by transforming existing DOM) →
     `features.injectedColumnExtractors` (JSDoc ~4510-4530) — a third pass,
     can even chain: a later descriptor in the same array may consume an
     earlier descriptor's own output column name.
2. **Reuse first.** Grep `columnExtractors:`/`syntheticColumnExtractors:`
   across `pageDefinitions` for a shape that already matches this cell —
   date/date-range split, entity-link routing, format+count parsing,
   icon-prefixed value, etc. Nearly every "new" cell shape on a new column
   turns out to be a shape another column already handles; reference the
   existing extractor by name rather than writing a near-duplicate.
3. **Does the native cell need cleanup before extraction?** A third-party
   userscript (jesus2099's cover-art icon, Dvir Yitzchaki's "Expand events"
   toggle button, …) can inject its own DOM noise into the same cell your
   extractor needs to read cleanly. If so, this needs a `columnErasers`
   entry (see touch point 4) — not a defensive check inside the extractor
   itself.
4. **Will the extractor emit any hidden sort/filter sentinel text** (an
   invisible `<span>` carrying a machine-readable value alongside the
   visible content, e.g. a sort key)? If so, its class MUST be registered
   in `_CLEAN_STRIP_SEL` in the same change (touch point 5) — this is the
   single most common silent bug in this family (see "Known failure
   modes").

## The touch points

1. **Write the extractor function** under the registry chosen above, with
   a JSDoc block matching this file's existing style — see `dateParts`
   (`ColumnDataExtractor`, 3634-3688) for a simple text→N-column split, or
   `splitLocation`/`splitArea` (3084-3230) for native `<a href>` entity-link
   routing. Document: the exact input shape expected, the exact output
   array (order matching `syntheticColumns`), and — if a twin exists in the
   other registry (e.g. `dateParts` also exists as a
   `SyntheticColumnDataExtractor` entry at 4167, identical contract, only
   differing in how the source cell is located) — cross-reference it so
   the two don't silently diverge.
2. **Reuse an existing DOM-walking technique** rather than inventing a new
   traversal: `_routeAreaLink()` (~2913-2933) for per-anchor entity-link
   routing, `_findCellListItems()` for "does this cell have a qualifying
   list" (never a fresh ad hoc `ul > li` query — see `CLAUDE.md`'s own
   warning on this). If the source cell is (or should become) a
   multi-row list, every produced synthetic column must stay
   `<ul><li>`-wrapped even for a single item — downstream merge/correction
   passes and `collapsableColumns` depend on that consistent shape (see
   "Known failure modes").
3. **Register the descriptor** in the right `pageDefinitions` array —
   `{ sourceColumn, extractor, syntheticColumns }` for
   `columnExtractors`/`syntheticColumnExtractors`, same shape plus ordering
   awareness for `injectedColumnExtractors`. Real two-pass example,
   `taglookup` (~12000-12022): `columnExtractors` splits `'Country/Date'`
   into `['Country', 'Date']` via `splitCountryDate`, and a sibling
   `syntheticColumnExtractors` entry then splits that same `'Date'` output
   via `dateParts` into `['DD', 'MM', 'YYYY', 'Day', 'Month']` — the second
   entry's `sourceColumn` is the first entry's own synthetic output, not a
   native column. Insert the new entry near the nearest sibling on the
   SAME page definition, not appended at the array's end.
4. **If a `columnEraser` is needed**, add it to `features.columnErasers`
   (JSDoc ~4591-4778, applied via `applyColumnErasers()`). Real example,
   area-events' "Event" column (~13374):
   `columnErasers: [ { sourceColumn: 'Event', erasers: ['expandEvents'] } ]`.
   Erasers are already called before extractors at the fetch-loop call
   site ("Must run before extractors so that copied cell content is
   clean") — no extra ordering wiring needed beyond declaring the entry.
5. **If the extractor emits a hidden sentinel span**, add its class to
   `_CLEAN_STRIP_SEL` (~3363-3393, a single concatenated CSS-selector
   string) in the SAME change, with a comment explaining what the sentinel
   carries and why it must not leak into filter text (mirror the
   `.mb-inline-art-sort-key` entry's own comment). This is what
   `getCleanColumnText()` (~33423+) reads before every filter/sort/
   unique-values text extraction — skip this and the column silently
   matches against invisible sentinel text with no visible cause until
   someone filters it.
6. **If any produced synthetic column needs right/center alignment or
   collapse behavior**, add it to `features.integerColumns`
   (`[{sourceColumn, align}]`, `align` one of `'R'`/`'C'`/`':'`) and/or
   `features.collapsableColumns` (a flat array of column-name strings) too
   — these are independent arrays keyed purely by the synthetic column
   name string; nothing links them to the extractor descriptor
   automatically. Real example: `taglookup`'s own `integerColumns`/
   `collapsableColumns` are keyed against `DD`/`MM`/`YYYY`/`Country`/`Date`
   — exactly the names the extractors two lines above produce.
7. **Check for a synthetic-column-name collision** against every OTHER
   `columnExtractors`/`syntheticColumnExtractors` entry already declared on
   the SAME page type — two entries resolving to the same output name
   silently misaligns every row (see "Known failure modes"). This matters
   most on page types flexible enough to accept many independently-added
   entries over time (e.g. `report-detail`); a same-named collision is
   fixed by renaming the new entry's output, not by removing the old one.
8. **Changelog + version bump** — mandatory, same session, no exceptions:
   bump `// @version` (`M.MM.NNN+YYYY-MM-DD`, read the current value first,
   don't assume it), prepend a `ShowAllEntityData_CHANGELOG.json` entry
   labeled `"✨ Improve"` (or `"🚀 Feature"` for a page type's first
   extractor) naming the new column(s)/extractor function, and apply the
   project's standing source conventions: JSDoc every new function,
   4-space indentation, no tabs, no trailing whitespace.

## Known failure modes

- **Sentinel leaking into filter text**: a new extractor emits a hidden
  sort-key span but its class never gets added to `_CLEAN_STRIP_SEL` —
  filtering that column starts matching against invisible sentinel text
  with no visible cause (the exact failure `.mb-inline-art-sort-key`'s own
  registration comment documents fixing).
- **Silent row misalignment from a synthetic-column-name collision**: two
  `columnExtractors`/`syntheticColumnExtractors` entries on the same page
  type both resolve to the same output column name — row-level cell
  appending has no dedup against an already-injected header, so BOTH
  entries unconditionally append their own `<td>` per row, giving rows more
  cells than the (deduped) header row and silently shifting every
  subsequent column's data left. Hit once on `report-detail` (v9.99.881,
  fixed by renaming the new entry's output to `'MB-Country'` instead of the
  already-used `'Country'`) — flagged there as a standing landmine
  specifically because that page type is generic enough to accept many
  independently-added entries.
- **Broken single-item-list convention**: an entity-link-routing extractor
  (`splitLocation`/`splitArea`-style) must always wrap its output in
  `<ul><li>`, even for exactly one item — a bug that instead produced two
  adjacent `<ul>`s joined by a bare comma (rather than one merged `<li>`)
  broke downstream merge/correction logic and `collapsableColumns` alike.
- **Stale `activeColumnExtractors` reads outside the fetch loop**: on
  `tableMode: 'multi'` pages (`tag-value`/`user-tag-value`),
  `activeColumnExtractors` is reassigned PER GROUP during the multi-table
  fetch loop — code reading it from OUTSIDE that loop (e.g. dropdown
  rendering) only ever sees whichever group ran last. Use
  `activeDefinition.type` (page-scoped, never reassigned) instead for any
  page-scoped gating decision, not `activeColumnExtractors` itself
  (v9.99.885/886 lesson).
- **Mutating the source cell**: extractors are purely additive by
  convention — read `sourceCell`, return brand-new `<td>`s, never mutate
  the source cell in place. A feature that genuinely needs in-place DOM
  surgery on an existing column (à la `release-tracks`'s bespoke AR-column
  system) needs its own dedicated mechanism, not a `columnExtractors` entry
  stretched to do something it isn't built for.

## How to drive this skill

Describe the cell shape and where it lives, e.g.:

> "Add a column extractor for the 'Duration' column on `label-recordings` —
> split it into 'Minutes'/'Seconds', same pattern as `dateParts`."

Claude Code will find the nearest existing precedent for the cell shape,
decide which of the three registries it belongs in, register the
descriptor next to its closest sibling in `pageDefinitions`, wire in any
needed `columnErasers`/`_CLEAN_STRIP_SEL`/`integerColumns`/
`collapsableColumns` side-effects, and finish with the changelog entry and
version bump before showing the diff.
