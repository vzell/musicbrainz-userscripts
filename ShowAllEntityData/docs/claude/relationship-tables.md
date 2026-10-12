# Relationship tables (`relDetailsToTables`)

Design record and decisions: `org/relationship-tables-pt.org`. User-facing
text: `ShowAllEntityData_HELP.md`, "Relationships as tables on other pages".

## What it is

`applyRelDetailsToTables()` turns an entity page's relationship lists
(`table.details`, one `<th>phrase:</th><td>target<br>target…</td>` per
relationship type) into h3 + `table.tbl` groups, one per kind of related
entity. It is the event page's converter (`applyEventDetailsToTables()`)
applied elsewhere: the same parser (`_eventRelRowsFrom()` →
`_eventRelParseLine()`), the same table builder (`_eventBuildTable()`), the
same per-group columns (`_eventRelColumns()` → `data-mb-col-headers` →
`group.colHeaders`). It runs on:

| Where                                   | How                                   | Runs as pageType                     |
|-----------------------------------------|---------------------------------------|--------------------------------------|
| `/place/<mbid>`, `/area/…`, `/instrument/…` | pageTypes `place-overview`, `area-overview`, `instrument-overview` | themselves |
| series, work, release group, recording  | a second button, `_relTablesButton()` | `<entity>-relationship-tables`       |
| artist / label `/relationships` tab     | second button "Relationship lists"    | `artist-` / `label-relationship-tables` |
| release                                 | second button "Credits"               | `release-credit-tables`              |

## Rules that fail silently when broken

**The event page's output must not change.** Everything this feature adds
to the shared helpers is opt-in: `_eventRelColumns(…, opts)` with
`opts.attrs`, `_eventRelRowsFrom(…, opts)` / `_eventRelParseLine(…, opts)`
with `opts.rel`. The event converter never passes them. The event specs are
the proof; run them after any change here.

**One dataset per page, so the buttons are either/or.** The engine keeps
exactly one live dataset (`activeDefinition`, `allRows`/`groupedRows`, the
filter cache, the `mb-global-filter-*` ids), so two h2 sections cannot each
have their own global filter. The relationship-tables button therefore
removes the page's other data sections for its render
(`relDetailsToTables.removeMain` → `_relRemoveMainSections()`), as
`area-releases`' `targetHeader` buttons already do. Leaving a native
`table.tbl` on the page would make it the render's anchor ("last h2 before the
first `table.tbl`", `renderGroupedTable()`) and the input of about twenty
render-tail passes that walk every `table.tbl`.

**The page's own button is unchanged.** It never runs the converter: the
native lists stay a collapsible h2 section, as before (user decision
2026-10-12). Pinned by `rel-tables-recording.spec.js` "renders as before".

**A relationship-tables button runs as its own pageType with its own
features only.** `buttonConfig.type` switches `pageType` in
`startFetchingProcess()` (every later press reloads, which re-detects), and
`replaceFeatures` skips `baseDef.features` and `entityFeatures`. Without them
`release-tracks`' AR-column code, `recording-releases`' release columns, the
injected Relationships column, CAA and MB-Name extraction act on the
relationship tables. Code that must treat these renders like the event page
asks `_isRelTablesRun()`, never a pageType name: the per-group extractor
re-resolution in the fetch loop (Begin/End sit at a different index in every
group) and the header glyphs (`_initColHeaderGlyph()`).

**A saved file records the button's pageType, not the page's.**
`_buttonForSavedPageType()` accepts it in the load dialog's mismatch check,
and `_activateButtonForSavedPageType()` makes that button's definition active
before the disk-load pre-processing, which runs the converter again on the
reloaded page.

**Release credits are read by block id.** `#release-relationships` (own) and
`#release-group-relationships` ("Via release group: <title>", the title from
the sidebar link with a `<bdi>`). Never "everything under the Credits h2": in
MusicBrainz's "Display credits at bottom" layout `#bottom-credits` also holds
one `div.bottom-credits` per medium with every track's credits, placed before
those two (`scripts/probe-release-credits-layouts.js`, 2026-10-12; the choice
survives a reload). The h2 moves out of `#bottom-credits` before the tables go
in, because `renderGroupedTable()`'s h3 sweep spares every h3 inside
`#bottom-credits` and the tables would otherwise be rendered twice.

**Attributes are peeled from the end of the line only.** `_relPeelAttrs()`
reads the last text node and takes trailing groups that `_relClassifyAttr()`
recognises: `from X until|to Y|present`, `from X`, `until X`, `in|on X`, a bare
date, `ended`, `number: N`, `order: N`, `in|on X: number: N`. A group holding a
link (an instrument credit) is never touched. The line's `extra` may have lost
its outer parentheses (`_eventTrimNodes(…, true)`); that is detected from the
text, not assumed. A place's date sits after its area chain, so `area` is
peeled too.

**Number/Order:** one Number column unless some row in that table has both
with different values; then Number and Order (user decision 2026-10-12).

**An ended URL relationship has no link** (`<span class="deleted">`); with
`opts.rel` it is read as a URL whose href is its text, and its "[info]" goes
back to the link after the date is taken off.

## Tests

`tests/fixtures/rel-tables-recording.spec.js`, `rel-tables-pages.spec.js`;
raw captures `tests/fixtures/rel-*-overview.html` (2026-10-12,
`tests/support/capture-raw-page.js`, re-read with
`scripts/probe-rel-sections.js`); mutations `scripts/mutations/rel-tables.json`.
