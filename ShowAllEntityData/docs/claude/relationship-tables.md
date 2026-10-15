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
| `/place/<mbid>`, `/area/…`, `/instrument/…`, `/url/…` | pageTypes `place-overview`, `area-overview`, `instrument-overview`, `url-overview` | themselves |
| series, work, release group, recording  | a second button, `_relTablesButton()` | `<entity>-relationship-tables`       |
| artist / label `/relationships` tab     | second button "Relationship lists"    | `artist-` / `label-relationship-tables` |
| release                                 | second button "Credits"               | `release-credit-tables`              |

## Rules that fail silently when broken

**The parsing options are shared with the event page.** What this feature
added to the shared helpers is behind options — `_eventRelColumns(…, opts)`
with `opts.attrs`, `_eventRelRowsFrom(…, opts)` / `_eventRelParseLine(…,
opts)` with `opts.rel` — and since WIP.7 (user request 2026-10-12) the event
converter passes them too, so the event page has the same Begin/End,
Number/Order, Primary alias and ended-URL handling. A change here changes the
event page: run the event-overview specs (and their mobile variant) with
the rel-tables ones.

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

**The render ends with the sidebar's groups** (`sa_sidebar_in_rel_tables`,
since the sidebar-inline branch, 2026-10-15): `_sbAppendRelTablesGroups()`
appends `Sidebar: <heading>` tables to the fragment right before it is
inserted, dropping sidebar links that are already relationship links. Specs
that count this render's tables seed the setting off; design in
docs/claude/sidebar.md "The sidebar beside the page's own data".

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

**A primary alias is not a disambiguation.** MusicBrainz prints it inside the
same `span.comment`, as `<i title="Primary alias">…</i>` (a name in another
script); `opts.rel` moves it to `alias` → a "Primary alias" column, and leaves
a real disambiguation in place.

**A date can also LEAD an attribute group**: "(from 1964-12 until 1965-06:
lead vocals, <a>electric guitar</a>)" (an artist's "member of"). That group
ends in a link, so `_relPeelAttrs()` never sees it; `_relPeelLeadingDate()`
reads the first text node for a date phrase followed by ":", and the rest
becomes the multi-row Credits.

**Third-party markup inside a line.** "MusicBrainz More Flags Everywhere"
wraps an area's glyph, link, flag image and the ", " before its parent chain
in one `span.mfe-flag-wrapper` (`AREA_ICON_WRAPPER_SEL`). With `opts.rel` the
comma is moved back out of the target, or the chain lands in Details.

jesus2099's "mb. SUPER MIND CONTROL" puts a text-less cover-art link
(`<a href="…/release/<mbid>/cover-art"><span class="caa-icon
jesus2099userjs154481">`) before every release-group link of a release's
"Via release group" lists, and its own `div.…bigbox` above them. It does this
once its lookup returns, so whether the converter sees the link is a race.
`_eventRelParseLine()` drops such a link (a text-less `<a>` holding only
`span.caa-icon`/`span.eaa-icon`) before choosing the target, with or without
`opts.rel`. If it were taken as the target, the row would read "Release", the
group's link would land in Details, a Picard column would appear, and no
cover art of ours would be drawn, since the Target cell holds no
release-group link (2026-10-14, `debug/release-tracks-with-sidebar-initial.html`;
pinned by "jesus2099's cover-art icon before a release group is never the
target").

**Inline artwork** (`addCAA: ['Target', 'Release group', 'Release']`,
`addEAA: ['Target', 'Event']` in `_relTablesFeatures()`): each row's link
decides (`CAA_CTX`/`EAA_CTX.inlineLinkSel`), so a mixed Target column gets a
cover-art placeholder on release-group/release rows and an event-art one on
event rows. `_artEntityAnchorSelector()` scopes the big-image strips' link
scan to those columns for these renders, as for `report-detail`; no spec
sees that scope yet (recorded as an `"expect": "pass"` mutation).

**Header glyphs**: Genre and Instrument are in `_eventColGlyphs()` only, never
in `_ENTITY_TYPE_GLYPH`, which also drives the 📊 entity-info sections on every
page.

**📊 "Entity info - Type"** (modes `enttype-<type>`, section `entityTypeMix`):
`_eventRelColumns()` stamps `data-mb-entity-type` on a mixed table's Target
and Type cells (only `withType` tables), and the section counts that
attribute (`_findCellEntityType()`), like "Video info - Medium format" —
attribute-driven, so no column gate and no text highlight. Entries carry the
kind's glyph through `makeSynItem()`'s `glyphClass` argument
(`_entityTypeGlyphClass()`, from `_eventColGlyphs()`); a kind without one (URL)
gets "🔗" in its label. Shared with the event page.

**`url-overview`** needs `url` in the `@include` line for bare entity pages;
the fixture harness injects unconditionally, so only
`sl-include-regex.spec.js` sees that line.

**An ended URL relationship has no link** (`<span class="deleted">`); with
`opts.rel` it is read as a URL whose href is its text, and its "[info]" goes
back to the link after the date is taken off.

## Tests

`tests/fixtures/rel-tables-recording.spec.js`, `rel-tables-pages.spec.js`;
raw captures `tests/fixtures/rel-*-overview.html` (2026-10-12,
`tests/support/capture-raw-page.js`, re-read with
`scripts/probe-rel-sections.js`); mutations `scripts/mutations/rel-tables.json`.
