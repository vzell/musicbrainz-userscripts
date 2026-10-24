<!-- Written on branch feature/bb-songs (org/brucebase.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# brucebase.wikidot.com: the fourth non-MusicBrainz host

ShowAllEntityData also runs on the Brucebase wiki's song list,
`https://brucebase.wikidot.com/stats:songs`, as the pageType `bb-songs`. It
is **opt-in**: `sa_enable_brucebase`, default **off**. The request
(`org/brucebase.org`) was springsteenlyrics.com's lyrics treatment, "extract
the song title, then let our userscript handle the rest" — so this is the
jungleland.it design (docs/claude/jungleland.md) once more: a host gate, one
definition with `host`, one converter, the shared table CSS. No bar, no
hand-off, nothing fetched (except the song pages read by the opt-in detail
preview, `sa_bb_detail_preview`, docs/claude/detail-pages.md).

Since `feature/bb-years` it also runs on the **year pages** (`/1975`, …,
`/1949-64`) as the pageType `bb-year`, behind a second opt-in,
`sa_bb_year_pages`: see "Year pages — `bb-year`" below. The sections up to
there describe `bb-songs`.

Since `feature/bb-recent-changes-relations` it also runs on **Relations**
(`stats:relations`, `bb-relations`) and **Recent changes**
(`system:recent-changes`, `bb-recent-changes`, the one pageType whose pages
are AJAX requests, `features.pageRequest`), both under `sa_enable_brucebase`:
see the last two sections. Titles on every Brucebase table follow
docs/claude/foreign-title-case.md.

## The page

Checked on the snapshot `debug/bb-songs.html` (saved from the browser,
2026-10-07):

- **Wikidot**, theme "flannel-ocean". `#container` > `#header` (whose `<h1>`
  is the wiki's name, "Brucebase Wiki"), `#side-bar`, `#main-content` >
  `#page-title` (a `<div>`, "Songs"), `#breadcrumbs`, `#page-content`. No
  `#content`, no `table`.
- **The songs** sit in a YUI tabview, `div.yui-navset`: `ul.yui-nav` holds 28
  tabs labelled `=- 0-9 -=`, `=- A -=` … `=- Z -=`, `=- Alt. -=`, and
  `.yui-content` one `div#wiki-tab-0-N` panel per tab, in the same order. Each
  panel is `div.list-pages-box > ul > li > a[href="/song:SLUG"]`, the title as
  the link text. One shape, no exceptions. "X" is empty.
- **Counts:** 1,689 links, **1,679 distinct**. The "Alt." tab repeats the 10
  songs whose title starts with a parenthesised subtitle ("(I Can't Get No)
  Satisfaction" is under S and under Alt.). The page's own "We currently have
  **1683** different songs" is a different count; nothing compares against it.
- **A second tabview** further down (News, Media, "Released (Not on
  Springsteen Album)") links 41 songs in its last tab. All 41 are also in the
  letter tabs.
- **Titles** carry entities and notes as written: "Devils &amp; Dust",
  "Angel Eyes ( - Little Steven &amp; The Disciples Of Soul - )", "Jolé Blon".
- **An iframe on the same path:** an html-block,
  `<iframe src="/stats:songs/html/<hash>">`, and a YouTube embed.

## The gate — `_isBbHost`

`const _isBbHost` sits beside `_isBsHost`, part of `_foreignHost`
(`'brucebase.wikidot.com'`), and its opt-in gate sits after the
brucespringsteen.it ones: setting off → `Lib.info('… brucebase.wikidot.com
support is off …')`, return, before anything visible.

**There is no frame gate.** The site is not a frameset, and the html-block
iframe's URL (`/stats:songs/html/<hash>`) is outside the `@include` line:
`/^https?:\/\/brucebase\.wikidot\.com\/stats:songs\/?(?:[?#].*)?$/`. That
line is the gate for it, and `sl-include-regex.spec.js` pins the iframe URL
as out.

Other host-aware code:

- **`performClutterCleanup()`** stands down here too.
- **`initNavigationGuard()`** needs nothing: one page, the tabs are
  `javascript:;` links, and a song link is a different path.

## The toolbar anchor — `_bbPrepareLivePage()`

The page HAS an `<h1>`, the wiki's name in `#header`, and the generic header
lookup's last fallback (`document.querySelector('h1')`) would put the toolbar
there. So the init block's `else if (baseDefinition?.host ===
'brucebase.wikidot.com')` branch calls `_bbPrepareLivePage()`, which:

- inserts `<h1 class="mb-bb-h1"><bdi>Brucebase — Songs</bdi></h1>` before
  `#page-title` (its text taken from there), so `_cachedEntityName` reads
  "Brucebase — Songs";
- hides `#page-title` (`mb-bb-hidden`), not removes it;
- adds `body.mb-sa-host-bb` and installs `_ensureBbStyle()`.

## The converter — `applyBbSongsToTable(def, docContext)`

Gated by `features.bbSongsToTable`, called from the same three places as
`applyJlListToTable()`: click-time pre-processing, the pagination loop when
`doc !== document` (not reached: one page, the live document is reused), and
`_hydrateAndRenderFromSnapshotData()` (Load from Disk).

- **Finding the list:** `_bbFindSongTabview()` takes the first
  `div.yui-navset` whose every tab label has the `=- … -=` shape and which
  links a song. Not "any `/song:` link": that would read the second tabview.
- **Reading it:** `_bbCollectItems()` pairs tab label i with panel i, reads
  `li > a[href^="/song:"]`, and keeps a song once, by its href as written.
  Alt. is the last tab, so the first sighting is under the song's own letter.
- **Letter:** `_bbParseTabLabel()` (also `window.__saTest.bbParseTabLabel`)
  takes what sits between `=-` and `-=`.
- **Rows** are Title / Letter (`_BB_HEADERS`). Title links to the resolved
  absolute `/song:` URL in the same tab (no frames here, unlike jungleland.it
  and brucespringsteen.it).
- **Placement:** the table goes where the tabview was. The tabview is
  removed, with the inline script right after it that built the YUI widget
  (it has run). On the live document `<h2 class="mb-bb-list-heading">Songs</h2>`
  goes before the table, where `updateH2Count()` anchors. The `<sup>` note
  and the second tabview stay.
- **Never silent:** with no tabview and no `table.mb-bb-table`, it logs a
  `Lib.warn` with the number of song links seen.

1,679 rows is below `sa_render_threshold` (5000): no dialog.

Text sort is the engine's own (`localeCompare` with `numeric: true`), so
"96 Tears" sorts after "7 Rooms Of Gloom".

## Styling

- **`_ensureForeignTableStyle()`**'s `:is()` list names `.mb-sa-host-bb`.
- **`_ensureBbStyle()`** adds only the injected `<h1>`/`<h2>` and
  `.mb-bb-hidden`; the wiki's own fonts are kept.

## Tests

| Spec                                        | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/bb-songs.spec.js`           | the fixture's shape (28 tabs, 1,689/1,679, Alt. all repeats); setting off: untouched (log line as proof); setting on: only the `<h1>` toolbar, not on the wiki's header `<h1>`, `#page-title` hidden, both tabviews intact; after the press: one row per distinct song of the letter tabs, exact headers, the letter tabview gone and the second one intact, `<h2>` before the table, the shared table CSS; Letter per tab, no Alt., subtitle songs once with their own letter; titles verbatim (entities, notes, accents), absolute same-tab links; a Letter column filter; Title sort order (numeric collation); zero MusicBrainz/CAA/EAA requests with CAA and Relationships back ON; Save → Load from Disk (twice, the second without a warning); `_bbParseTabLabel` shapes |
| `tests/fixtures/sl-include-regex.spec.js`   | the `@include` line: stats:songs in (http/https, trailing slash, hash, query); the html-block iframe, sibling lists, song pages, other wikidot wikis, `www.` and look-alike hosts out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/live/bb-songs.spec.js` (`@extended`) | the real page: rows = the distinct song links of the letter tabview, counted before the click                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

The fixture is generated: `python3 scripts/build-bb-fixtures.py` keeps the
WHOLE page and removes every `<script>`, `<iframe>` and theme `@import`.
`tests/support/bbFixture.js` serves it behind a catch-all abort for every
other URL. Mutation list: `scripts/mutations/bb-support.json` (the
first-tabview scoping is `"expect": "pass"`: every "Released" song is also in
the letter tabs, so first-wins de-duplication hides it).

## The side bar — `_bbArrangeSideBar()`

On every Brucebase pageType (called from `_bbPrepareLivePage()`).
`#content-wrap` holds exactly `#side-bar` and `#main-content`; the wiki
floats the side bar left (210 px) and gives `#main-content` a 223 px
`margin-left`. The script makes `#content-wrap` a flex row (`.mb-bb-cw`,
both floats and margins reset), so either order lays out without those
numbers:

- **Right** (`sa_bb_sidebar_right`, default OFF — it was on for a day; the
  user found the left looks better; that day's `true` is in
  `_SETTINGS_MIGRATIONS` since 2026-10-14, because the config audit walks
  every revision, released or not): `#side-bar` is moved after
  `#main-content` and is `position: sticky; right: 0`. Once a table is
  rendered the sticky page headers widen the content to the table's width
  (5,000 px on a year page); the side bar's natural place is then far to the
  right and it sticks to the window's edge instead.
- **Left** (the default): it stays first, and is `position: sticky; left:
  0`. Until 2026-10-09 it stayed in the flow with no z-index, and the docked
  Date column and its mask painted over it once the page was scrolled
  sideways; the user asked for it to stay in view ALWAYS (screenshots of
  `/2026` scrolled down). Now it stays at the window's left edge, z-index
  150, over the Date column's gutter mask, and Date docks at its natural
  left, just right of it. A box-shadow mask is invisible to hit testing, so
  `bb-sidebar.spec.js` reads a painted pixel of the side bar's padding.
- **Both sides are `top: 0`**, capped at the window's height
  (`max-height: calc(100vh - 2em - 2px)`, the theme's content-box padding
  and borders off) and scrolling inside itself when taller.
- **The handle** (`#mb-bb-sidebar-handle`): the MusicBrainz sidebar's look,
  behind its OWN setting since 2026-10-09, `sa_bb_collabsable_sidebar`
  (default **off**, "Collabsable sidebar" above the right-hand option); it
  used to share MusicBrainz's `sa_collabsable_sidebar` (default on). It
  still starts collapsed with `sa_sidebar_collapsed`. `initSidebarCollapse()`
  itself is bound to MusicBrainz's `#sidebar`/`#page`/`#content`, so this is
  its own small copy. It sits against the side bar's inner edge, or the
  window's edge while collapsed, and collapses toward its own side.
  Re-placed on scroll, resize and (ResizeObserver on `#content-wrap`) layout
  changes.
- Side bar z-index 150 on either side: over the table's sticky header and
  column (100/101) and the sticky filter bars (102/103), under the handle
  (10000).
- Opening/closing it moves the table sideways; the sticky page headers
  re-measure by themselves (the content bodies they observe change width),
  so Date still docks under its h2 bar — pinned by `bb-sidebar.spec.js`
  "re-measures". An explicit refresh call from the toggle was tried and
  mutation-checked as redundant, so it is not there.
- **The sticky page headers must leave it alone**: with `float: none` it
  became a pinned body (`.mb-sph-target`, sticky against the LEFT).
  `_sphExcludedSidebar()` returns `#side-bar` on this host for the two
  exclusion lookups (`_sphCollectTargets()`, `_sphContentBodies()`); on
  MusicBrainz it is `#sidebar` as before. `_sphSidebarBlocksWidening()` is
  NOT given it.

Tests: `tests/fixtures/bb-sidebar.spec.js` (left by default and collapsing
left, the right opt-in, starts hidden, open/close by click and keyboard, no
handle without `sa_bb_collabsable_sidebar` nor by default with MusicBrainz's
setting on, in view on both sides after scrolling down and sideways and
painted over the gutter mask, untouched behind the gate, the right-hand
post-render case, and Date docked under its h2 bar when scrolled, with
nothing masked unscrolled); mutations `scripts/mutations/bb-sidebar.json`.

## The status line — under the toolbar `<h1>`, above the theme's rule

The theme draws a thin rule under every `<h1>` (flannel-ocean: `h1 {
border-bottom: 1px dotted #AAA }`) and base pulls `#breadcrumbs` up by
0.5em (`margin-top: -0.5em`), both meant for `#page-title`. The status line
(`#mb-status-displays-wrapper`, no `p.subheader` here) is inserted right
after the toolbar `<h1>`, so it sat below that rule and the breadcrumbs ran
into it (reported 2026-10-09, stats:songs). `_ensureBbStyle()` moves the
rule: `h1.mb-bb-h1:has(+ #mb-status-displays-wrapper)` loses it, the status
line carries it with a 10 px bottom margin, so the order is h1, status,
rule, breadcrumbs. The theme is stripped from the fixtures, so
`bb-songs.spec.js` ("the status line sits between …") injects those two
rules; mutation in `scripts/mutations/bb-support.json`.

## Year pages — `bb-year`

Written on branch `feature/bb-years` (org/BB-events.org, 2026-10-09). The
year pages, `https://brucebase.wikidot.com/<YYYY>` (1965 to 2026) and the one
exception `/1949-64`, list everything of that year: shows, studio sessions,
rehearsals, interviews, cancelled dates. Same design as `bb-songs`: one
definition with `host`, one converter, the shared table CSS, nothing fetched.

### The gate

`sa_bb_year_pages` (default **off**) on top of `sa_enable_brucebase`: the
host gate exits first, then a year path (`_BB_YEAR_PATH_RE`,
`/^\/(?:\d{4}|1949-64)\/?$/`, declared beside `_isBbHost` because the gate
runs before `pageDefinitions` exists) with the year setting off logs
`… year pages are off (sa_bb_year_pages) …` and returns. The `@include` line
admits exactly those paths (`/2026-list`, `/2026/html/…`, `/19750` stay out;
`sl-include-regex.spec.js`). The toolbar `<h1>` is `_bbPrepareLivePage()`'s,
unchanged: it reads `#page-title`, so it says "Brucebase — 2026".

### The page — what the probe found

`scripts/probe-bb-year-pages.py` read all 63 pages (2026-10-09, cached in
`debug/bb-year-cache/`, gitignored); `scripts/check-bb-year-converter.js`
runs the converter over that cache in Chromium and reports fill rates and
anything that looks mis-parsed (0 problems, 5,009 rows for 5,009 headings).
The rules below come from those two runs, not from the handful of pages read
by hand, and each one was wrong at least once before the probe:

- **Entries are flat siblings** of `#page-content`: a heading paragraph, set
  paragraphs, the description, the icon row, `<hr>`. 37 to 277 entries a
  year (1973), 5,009 in all; far below `sa_render_threshold`.
- **An entry opens at its heading paragraph**: a `<p>` whose whole text is
  one date-led `<strong>` (`_bbYearEntryHead()`). NOT at the anchor:
  `<a name="ddmmyy">` carries a letter for several entries on one date (712
  of 5,009: `000065a`, `180718b`), and twice sits in a paragraph of its own.
  Two headings have no link (`<strong><span>`, 1980, 1998). A few lack the
  " - " after the date. **`_extBbParseYear()` (the MusicBrainz-side date
  reader) still keys on `/^\d{6}$/` and so misses the lettered entries** —
  left alone here, because changing it changes MusicBrainz.
- **Link prefixes → Type** (`_BB_YEAR_TYPES`): gig 3,589, recording 563, nogig
  446, rehearsal 211, interview 187, nobruce 11.
- **Dates**: 302 with a `00` day, 7 with a `00` month (`1971-00-00`). The
  converter drops them (`1954-10-00` → `1954-10`); **never** teach `dateParts`
  about `00` — it is shared with MusicBrainz.
- **Locations, split from the right** (`_bbParseHeading()`): a last part of
  two-letter codes is a state or province (`CO/KS/NE` once; Canada by
  `_BB_CA_PROVINCES`), otherwise the country. A four-part non-US heading is
  VENUE, SUB-VENUE, CITY, COUNTRY ("ICC BERLIN, SAAL 1, BERLIN, GERMANY")
  EXCEPT for the regions in `_BB_REGIONS` — the Australian states and GRAN
  CANARIA, the whole set the probe found — which go to State.
- **Descriptions come in two shapes**: a `.list-pages-box` (2,277) or plain
  paragraphs right after the sets (2,732, e.g. most of 1985). So a paragraph
  is classified by content (`_bbSetParagraphKind()`): a song list is in
  capitals outside parentheses after an optional mixed-case "Label:", judged
  per " / " segment (one lowercase "blues improvisation" must not turn a 1969
  setlist into prose); `<p><sup><em>No set details known.</em></sup></p>` and
  a lone `<em>` naming the set are notes; a lone `<em>` in capitals is a
  setlist set in italics (the 2018 Broadway tapings). The first paragraph
  that is none of these starts the description.
- **Set labels**: Soundcheck 665 (its own column, any label starting
  "Soundcheck"), then a long tail — Pre-show, Solo acoustic, "With R.E.M.",
  "Without Bruce", "Episode 1" … — which stay in Setlist, the first row led by
  `span.mb-bb-set-label` (decided with the user).
- **Icons are read by file** (`…/00Photo-32.png`, `_BB_ICON_LABELS`), not by
  `title`: the titles carry typos ("Newss", "Bootlef", "Photos"). "Help Us"
  is the Info wanted column, and its request text (a top-level `<sup>`) is
  skipped.
- **Tour boxes** sit after an `<hr>`, in a `<table>` with an `<h2>`: "Start
  of …", "End of …", legs ("End of the 1st leg …", "Start of the 2nd leg …
  - Europe"), "Continuation of …" for a year that opens mid-tour (a start),
  and combined ones ("End of the "Castiles" era / Start of the "Earth" era",
  read part by part, the last one decides — `_bbParseTourHeading()`). A year
  with no box at its top leaves its first entries' Tour empty.

### The converter — `applyBbYearToTable(def, docContext)`

Gated by `features.bbYearToTable`, called from the same three places as
`applyBbSongsToTable()`. `_bbYearEntries()` collects the entries (node
references, nothing moved), `_bbYearBuildRow()` builds each row in
`_BB_YEAR_HEADERS` order — Event, MB-Event, Media, Date, Type, Venue, City, State,
Country, Tour, Soundcheck, Setlist, Set note, Notes, Info wanted (Event and
Media in front since 2026-10-24; Media was 12th, a horizontal scroll away) —
and a `Range` from
the first heading to the last entry's last block is replaced by the table:
entries, `<hr>`s and tour boxes go; the legend, the year, "Jump to" and the
Previous / Listing / Next line stay. On the live document
`<h2 class="mb-bb-list-heading">Events</h2>` goes before the table.

- Soundcheck and Setlist are `<ul><li>`, one song per row, split on " / " in
  the paragraph's top-level text AND inside an inline run that spans several
  songs (`_bbSplitInline()`, `_bbIsSplittableInline()`; a song keeps its
  `<strong>`/`<em>` — each piece gets its own shallow copy of the run — and
  "(with …)"); `collapsableColumns` gives them the ▶N toggle. Top-level only
  was the first version, and it left a tour opener set in bold as ONE row
  (2012-03-18: eighteen songs in one `<strong>`, then "<strong>/ LAND OF HOPE
  AND DREAMS</strong> - PEOPLE GET READY"). The probe cache has four such
  openers (1984-06-29, 1999-04-09, 2009-04-01, 2012-03-18; +102 songs over
  `check-bb-year-converter.js`, 0 problems); the italic runs with " / " in
  the cache are lyrics in descriptions, which never reach the splitter.
  Fixture `bb-year-2012.html`.
- Notes clones the description with links made absolute (`_bbAbsHref()`),
  so its `/song:` links get the song preview (`_dpSiteForLink()` takes any
  `/song:` link in `table.tbl > tbody` when `sa_bb_detail_preview` is on).
  A prose column, clamped like Annotation.
- Media is `ul.mb-bb-media`, one `<li>` per icon: the site's image (16 px)
  and a visually hidden `.mb-bb-media-label` — clipped, never
  `display:none`, and NOT in `_CLEAN_STRIP_SEL`, because it is the text the
  filter and the 📊 dropdown read. A cell with two or more icons lists each
  label as its own 📊 entry with no engine change (the dropdown's per-`<li>`
  item values).
- **Event** (`_bbYearEventCell()`, 2026-10-24, mockup
  https://claude.ai/artifact/DmsNyUkUa1Hq8nPr2B5EGA): the heading as one
  name, "1985-01-13 - Carolina Coliseum, Columbia, SC", linked
  (`a.mb-bb-event-link`). The heading's own date (a `00` day stays) and its
  own comma parts, none added (a state code gets no ", USA", which the
  Country column derives) and none dropped; each part cased as its column
  writes it (State and "USA" as written, the rest `_mbSiteTitleText()` per
  part — never the whole name: the typography rules would make the date's
  hyphens U+2010 and " - " an en dash). The heading as written is the tip.
  Always one line (`td.mb-bb-event-cell { white-space: nowrap }`), the column
  as wide as its longest name — vzell's choice on a wide screen, kept after
  the cost was measured: docked (scrolled sideways) the longest 2026 name
  takes 775 px, which leaves −25 px of a 1280 px window and 615 px of a
  1920 px one beside it (2026-10-24). Specs clicking past it use a 1920 px
  window or `revealPastStickyColumn()` (`tests/support/bbFixture.js`).
- **MB-Event** (2026-10-24, `// ── The Brucebase MB-Event column`): a
  glyph per entry type (`_BB_MBEV_GLYPHS`, approved in the mockup; any
  other type a calendar standing in for MusicBrainz's event icon), linked to
  the MusicBrainz event once found. Built with the row (`_bbMbevCell()`):
  the row key (entry page, or `heading:<text>`), type, date (00 parts
  dropped, as MusicBrainz writes a partial date), the anchor URL
  (`_bbMbevAnchorUrl()`: `http://`, no www, `1949-64` before 1965 — the
  only spelling `/ws/2/url` matches) and the name query, all as data on the
  cell. Filled after the render (`_bbMbevAfterRender()` beside
  `_dgMbAfterRender()` in the four render tails) by `_bbMbevRun()`, year by
  year (`_bbMbevAskYear()`): the url lookup of the anchors (100 a request;
  an event on the row's date that MusicBrainz links to the row's own anchor
  is the row's), the year search (`arid` + `begin` range, 100 a page; by
  date, several on one date by place words), the name search for the rest
  (top hit on the row's date only), and an event lookup (`inc=url-rels`)
  for an event found by search whose Brucebase links are not known from the
  url lookups. Every answer goes to the cells (live and source rows,
  `_bbMbevCellIndex()`), to memory and to IndexedDB `vz-saed-bb-mbevents`
  (90 days, 7 for no event, a failure never), and owes the four filter
  duties (`_bbMbevScheduleRefresh()`, the row text cache in
  `_bbMbevRenderCell()`). The column's text is the hidden MBID
  (`.mb-bbev-ids`). Setting `sa_bb_mb_event_lookup` (default on; forced off
  in `FIXTURE_SETTINGS_OVERRIDE`), else the ▶ MB header button
  (`.mb-bbmbev-col-hdr-btn`, the shared header-button CSS lists); progress in
  the async job popup (`bbmbev`). Probes `scripts/probe-mb-event-lookups.py`,
  `scripts/probe-mb-event-anchor-coverage.py` (89/94 of 1985's entries and
  105/107 of 2012's are linked from MusicBrainz). Specs
  `tests/fixtures/bb-mb-event.spec.js` (the stub answers from the FIXTURE's
  entries, never the page: a filter can empty the table while the lookup
  runs); mutations `scripts/mutations/bb-mb-event.json`.
  **The glyph's card** (item f, `_bbMbevSource()`, a popup-engine source on
  Brucebase only, under `sa_bb_event_preview`): MusicBrainz's own event card
  (`_MB_KINDS.event.card(t, false, …)`), fed by `_bbMbevPopLoad()` — one GM
  request in the shared rate slot, the answer put under the very `_mbPop`
  key the card reads (its `cardInc`; the entity cards' own `_mbWsLoad()`
  asks the CURRENT origin) — with the row's Brucebase block before its foot
  (`_bbMbevCheckHtml()`: how it was found, ✓ / ERROR with both links /
  WARNING). Space: the same card and the event's links, no Live page view.
  **The findings** (item g): `bb-mbev-link-mismatch` (❌) and
  `bb-mbev-link-missing` (⚠️), docs/claude/findings.md.
- Date goes through the MusicBrainz `dateParts` extractor unchanged.
- **The sticky column must be the FIRST one** — Event since 2026-10-24,
  Date before (the paragraph below tells it with Date). The first
  version made Venue sticky. On a real page (not in a fixture: the fixtures
  carry no theme CSS) the Date column then vanished, header and all, while
  hit-testing still found it. The sticky page headers (`html.mb-sph-on`)
  dock the columns before the sticky one as well and give each a gutter
  mask: a page-coloured `box-shadow` shifted left by the table's left offset
  (`_sphEnsureColRules()`). On MusicBrainz that offset is a small page
  margin; on Brucebase it is the wiki's side bar, 262 px, so Type's mask
  covered all of Date. And a sticky first column counts as docked already at
  scrollX 0, so ITS mask painted the side bar white below the table's top.
  Hence `stickyColumn: 'Date'` (no columns before it), and a Brucebase
  table docks only once the page is scrolled: `_sphUpdateColDocked()` adds
  `scrollX > 0` for `table.mb-bb-table` (a first sticky column otherwise
  counts as docked at scrollX 0 and its mask covers the gutter, here the
  side bar). Since 2026-10-09 the side bar is sticky with z-index 150 and
  paints over the mask either way (see "The side bar" above); the guard
  still keeps the unscrolled gutter clear.
  A first attempt instead left Brucebase tables out of the column alignment
  altogether; the user then saw Date dock at the window edge, left of its
  pinned "Events" bar, when scrolling right — aligned again now, and pinned
  by `bb-sidebar.spec.js` ("stays under its h2 bar", collapsed and open, and
  after opening the side bar). MusicBrainz tables never carry the class.

### The start page — `bb-home`

`https://brucebase.wikidot.com/` (and `/home`, its wiki name;
`_BB_HOME_PATH_RE`, its own `@include` line) behind the SAME opt-in as the
year pages: the year gate tests both paths. Its toolbar `<h1>` reads
"Brucebase — Home"; its one button, "Show all events of all years" ("All
years"), pages through the year links of the side bar's "Gig Pages"
paragraph (`/1949-64`, `/1965` … `/2026`, read from the live page, so a new
year joins by itself):

- **Keys by path.** `features.pageKeys` gained `pathRe` (with `unit` for
  the status line) next to `param`: `_readPageKeys()` keys a same-host link
  by the first capture group of its pathname (`_BB_YEAR_PATH_RE_KEY`), and
  the loop's "this page" key comes from the live path (never a year on the
  start page, so every year is fetched). The lyrics index's `param` path is
  untouched; no MusicBrainz pageType sets `pageKeys`.
- **The live page gets an empty table** (`bbYearToTable: 'all'` →
  `_bbHomeEmptyTable()`), at the top of `#page-content` under
  `<h2 class="mb-bb-list-heading">Events — all years</h2>`; the start page's
  own text stays below. Each fetched year page is converted by
  `applyBbYearToTable()` as on its own page (its own tour boxes).
- Both definitions share `_bbYearTableFeatures()` (a fresh object per call).
- The table is placed at the top of `#page-content`, beside the side bar —
  the same layout as a year page, so the same sticky-column rule applies.
- **A full run hits two of the engine's gates, by design:** 63 pages is more
  than `sa_max_page` (50, "⚠️ High Page Count"), and about 5,000 rows is at
  `sa_render_threshold` (5000, the render-decision dialog). One request per
  year; wikidot answers in 1 to 8 s.

The fixture `tests/fixtures/bb-home.html` (from `debug/bb-initial.html`)
keeps only the four fixture years' side-bar links, so
`tests/fixtures/bb-home.spec.js` pages through exactly those (gate, toolbar,
one request per year in order, rows per year, the sticky Date and no gutter
mask with the sticky page headers on). Mutations:
`scripts/mutations/bb-home.json`.

### Tests

| Spec / script                               | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|---------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/bb-year.spec.js`            | four real pages (2026, 1968, 1985, 2018): both gates (the year one with the master on), toolbar on the injected `<h1>`; one row per heading, exact headers, nothing left on the page but the legend and footer, table between "Jump to" and Previous; heading split (00 day, sub-venue, missing " - ", Types); Soundcheck/Setlist rows, labels, medley, blockquote, bold; Set note detached; Tour start/end, combined box, Continuation; Notes paragraphs and absolute links (plain-paragraph descriptions in 1985); Media labels, Help Us → Info wanted, a Media and a Setlist filter, Date sort; Australian regions; letter anchors, italic setlists; no MusicBrainz/CAA request; a Notes song link gets the preview; Save → Load from Disk twice; `bbParseHeading`/`bbParseTourHeading` tables |
| `tests/fixtures/sl-include-regex.spec.js`   | the year `@include` line: in and out                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `tests/live/bb-year.spec.js` (`@extended`)  | the real 2026 page: rows = its heading paragraphs, counted before the click                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `scripts/mutations/bb-year.json`            | 19 planted defects; the link rewrite is `"expect": "pass"` (on the live page a relative link resolves against the page anyway)                                                                                                                                                                                                                                                                                                                                                                              |

Fixtures: `python3 scripts/build-bb-fixtures.py` writes
`tests/fixtures/bb-year-{2026,1968,1985,2018}.html` from
`debug/bb-2026-initial.html` (saved from the browser, so it writes `"` where
the server writes `&quot;`) and `debug/bb-year-cache/` (the probe's cache);
a snapshot not on the machine is skipped and its fixture kept.
`tests/support/bbFixture.js`'s `loadBbYearPage()` serves them.

## Relations — `bb-relations`

Written on branch `feature/bb-recent-changes-relations` (2026-10-13).
`https://brucebase.wikidot.com/stats:relations`: everyone Bruce Springsteen
shared a stage or a studio with, plus family and friends. Under the master
switch `sa_enable_brucebase` (no setting of its own), its own `@include` line
together with Recent changes.

### The page

Checked on the user's snapshots `debug/bb-relations-0-9.html` and
`debug/bb-relations-a.html` (`#main-content` only, the same page with another
tab active) and on the page as the server sends it
(`debug/bb-relations-raw.html`, `scripts/probe-bb-recent-changes.py`,
2026-10-12):

- One YUI tabview like the song list's, 28 tabs: `=- 0-9 -=`, `=- A -=` …
  `=- Z -=`, `=- & -=` (the band names with "&": "Bob Seger & The Silver
  Bullet Band"). No second tabview.
- Each panel is a two-column table: `<p><strong>Persons</strong> (77)</p>`,
  `<hr>`, a `.list-pages-box` with `ul > li > a[href^="/relation:"]`; then the
  same for **Bands**. No other group in the tabs (the "#1 Fan: 2" and
  "Animals: 1" counts above it are not tabs).
- **2,892 entries, all distinct** (no entry in two tabs); 2,627 persons, 265
  bands. The site's own per-tab counts are out of date on C, F and M; nothing
  compares against them.
- **Names are in sort form**: "Adams, Bryan", "Alliance Singers, The", "Edge,
  The", "lang, k.d.", "Fields, Elysian". 61 persons have no comma (Akil, Bono,
  D'Angelo). Exactly three names have a comma that is not a sort form, all
  bands: "Crosby, Stills & Nash", "Crosby, Stills, Nash & Young" (in "&") —
  and "Fields, Elysian", which is one.

### The converter — `applyBbRelationsToTable()`

Gated by `features.bbRelationsToTable`, called from the same three places as
the others. `_bbFindSongTabview(doc, '/relation:')` (the song-list finder,
which now takes the link prefix), `_bbRelationsCollect()` pairs tab i with
panel i and reads `p > strong` group headings and the links after them in
document order. Rows: **Name** (linked, the display form), **Sort name** (as
the site lists it), **Type** (Person / Band), **Letter**.
`_bbRelationDisplayName()` turns the sort name round at its one ", " — not when
there is more than one, and not when what follows holds an "&" — so "Adams,
Bryan" → "Bryan Adams", "Alliance Singers, The" → "The Alliance Singers",
"Crosby, Stills & Nash" stays. With `sa_foreign_typography` on both names get
typographic punctuation ("D’Angelo", "1992–93 World Tour Band, The"); their
case is never changed (docs/claude/foreign-title-case.md). Placement as on the
song list: the table takes the tabview's place, the YUI script goes, `<h2
class="mb-bb-list-heading">Relations</h2>` before it, the counts above stay.

## Recent changes — `bb-recent-changes`

Written on the same branch. `https://brucebase.wikidot.com/system:recent-changes`:
Wikidot's change log of the whole wiki. Under `sa_enable_brucebase`.

### The page — not paginated by URL

- The user's snapshot `debug/bb-recent-changes.html` (`#main-content` only,
  after switching "Revisions per page" to 200) and the server's page
  (`debug/bb-recent-changes-raw.html`, 20 changes).
- The list sits in `#site-changes-list`: a pager, then one
  `div.changes-list-item` per change — a `<table>` with `td.title` (a link
  whose text is "category: Title", the category only when the page has one),
  `td.flags` (one `span.spantip` per flag letter), `td.mod-date`
  (`span.odate time_<epoch>`), `td.revision-no` ("(rev. 34)", or "(new)"),
  `td.mod-by` (`span.printuser` with the Wikidot profile link) — and, for
  about three changes in four, a `div.comments`.
- **The pager and "Update list" never change the URL.** Wikidot's
  `SiteChangesModule.js` (fetched 2026-10-12) POSTs to
  `/ajax-module-connector.php` with `moduleName=changes/SiteChangesListModule`,
  `page`, `perpage` (10–200), `categoryId`, `options` (the ticked revision
  types as JSON) and `wikidot_token7`, and drops the JSON answer's `body` into
  `#site-changes-list`. The token must equal the `wikidot_token7` cookie
  (`wrong_token7` otherwise).
- **The flag letters' meaning is in the SERVER's `title`s** ("content source
  text changed" …); the live page's hover-tip script empties them, which is
  why the user's snapshot shows `title=""`. `_BB_CHANGES_FLAGS` holds the
  seven, verbatim from the probe: N, S, T, R, A, M, F.
- **The history is deep.** At 200 a page, page 100 is a year back
  (2025-10-17) and page 1,000 is 2020-12-14; the pager never shows a last
  page. So no "all" button.
- `scripts/probe-bb-recent-changes.py` reads the page, AJAX pages 1 and 2 and
  `stats:relations`, prints counts, flags and timings (0.7 s, 1.4 s, 1.1 s;
  Relations 19.5 s), and saves them under `debug/` for the fixture builder.
  Env: 2026-10-12T22:32Z · vzell-lap · WSL2 Ubuntu (Linux 6.18.40.1) · n/a.

### The engine hook — `features.pageRequest`

The one pageType whose pages are not URLs. `pageRequest(p, def)` returns
`{url, init, toHtml}`; the loop calls `fetchHtml(url, init)` (its new optional
`init`, merged over `{credentials: 'same-origin'}`), parses `toHtml(text)`,
and never reuses the live document for such a page. `features.pageCount`
(from the pressed button) is `maxPage`. Without `pageRequest` nothing in the
loop changes, so MusicBrainz is untouched. A thrown `toHtml` (a non-JSON
answer, a status other than "ok") is a failed page like an HTTP error: the
run stops there and offers the rest (resume calls `pageRequest` again).

### The pageType

Three buttons: "Show the last 200 changes" (1 page), "… 1,000 …" (5),
"… 5,000 …" (25 — 5,000 rows, exactly `sa_render_threshold`, so no dialog).
Every request asks for 200 per page and repeats what the site's form says at
that moment (revision types, category: `_bbChangesFormChoice()`), so the form
still filters. At init `_bbPrepareLivePage()` also sets the site's own "Revisions
per page" select to 200 (`_bbChangesPerPageSelect()`, the request's "change to
200 revisions per page beforehand"), so its own "Update list" matches.

`applyBbChangesToTable()` is built like `applyBsRecordsToTable()`: the live
page gets an EMPTY table after the (hidden, not removed) `#site-changes-list`,
under `<h2 class="mb-bb-list-heading">Recent changes</h2>`; each fetched AJAX
answer becomes rows (`_bbChangesBuildRow()`): **Page** (the title without the
category prefix, linked), **Category** (from the link, "" for none),
**Flags** (one row per letter: `span.mb-bb-flag` + the meaning; a
multi-row column since 2026-10-22, `collapsableColumns: ['Flags']`, so a
two-flag change collapses behind its ▶ toggle and the header counts them),
**Date**
and **Time** (local "YYYY-MM-DD" and "HH:MM:SS" from the epoch, as the site's
script shows it; two columns since the user's second round, 2026-10-13, so
that Date goes through `dateParts` — DD, MM, YYYY, Day, Month — and both get
their MusicBrainz 📊 sections with no engine change: "Date info - …" for a
`dateParts`-fed column, "Time info - Time of day" for a column named
"Time"), **Revision** (integer; "(new)" is 0), **User** (profile, new tab),
**Comment**. Rows are not de-duplicated across pages: a change made while the
pages load shifts the list by one, and that row then shows twice.

### Tests

| Spec / script                                                            | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|--------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/bb-relations.spec.js`                                    | gate, toolbar, the fixture's shape (28 tabs, all distinct, the comma names); every entry one row with its type, letter and (typographic) sort name; the tabview gone, the counts kept, `<h2>` before the table; display names (five shapes, the "&" exception); typography on names and its setting; a Type filter; `bbRelationDisplayName`; Save → Load from Disk                                                                                                                                                                                                                                                                                 |
| `tests/fixtures/bb-recent-changes.spec.js` (`timezoneId: Europe/Berlin`) | gate, three buttons, the select at 200, no request before a press; "200": one POST, every field (`moduleName`, `page`, `perpage` 200, `categoryId`, `options`, token = cookie), every column of all 200 rows against an independent regex read of the answer; Date's DD/MM/YYYY/Day/Month; the 📊 "Date info" sections on Date and "Time info - Time of day" on Time, counts against the answer; "1,000": pages 1–5 in order; the site's form decides types and category; Flags rows, its multi-row cells (toggle on two-flag cells only, header count) and a Flags filter; Revision sorts from 0; a Wikidot error answer stops the run; an HTTP 500 on page 3 keeps pages 1–2; Save → Load from Disk with no request |
| `tests/fixtures/sl-include-regex.spec.js`                                | the new `@include` line: in and out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `scripts/mutations/bb-relations-changes.json`                            | 20 planted defects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Fixtures: `python3 scripts/build-bb-fixtures.py` writes
`tests/fixtures/bb-relations.html`, `bb-recent-changes.html` and
`bb-recent-changes-p{1,2}.json` (the AJAX answers, verbatim) from the probe's
saves; `tests/support/bbFixture.js`'s `loadBbRelationsPage()` and
`loadBbChangesPage()` (which answers every POST with p1/p2 in turn, or an
error, and records each request's fields).

## Images: the Media icons and the song glyph — `_BB_FI`, `_BBS_FI`

vzell, 2026-10-23 (org/foreign-images.org, phase 3, mockups B1 and B2): the
year table's Media icons and the song list's titles get MusicBrainz's image
card and the artwork viewer, through the shared foreign-image path
(`_fiCardHtml()`, `_fiClick()`, `_fiDpProvider()`; docs/claude/springsteenlyrics.md,
"The Cover column's image card and viewer").

- **The reader.** `_dpParseBb()` sends a `/song:` page to the song parser
  and every other page to `_dpParseBbPage()` (title and images only). Both
  take their images from `_bbPageImages()`: the thumbnails of the gallery
  boxes in `#page-content` (`.gallery-box .gallery-item img`), whichever
  tab holds them. That one selector leaves out the side bar's promo cover
  (`files:artwork-disco/…`, the same on every page), the 32 px status icons,
  the Storyteller badge and the social links. The kind is the wiki folder
  (`_bbImageKind()`): `gallery:` Photo, `files:ticket-` Ticket,
  `files:pass-` Memorabilia, `files:setlist-` Setlist, `news:` News,
  `files:song-graph`, `files:song-lyricsheet`. `_DP_PARSER_VERSION` 4
  (Setlist since 2026-10-24: `files:setlist-YYYY` on every sampled entry
  page with a Setlist icon, 1978–2024, `scripts/probe-bb-setlist-images.py`;
  before, such an image was Other and the Setlist icon was never ringed).
- **Entry pages preview under their own setting** (since 2026-10-24,
  org/TODO.org "Some enhancements" 3b; until then "read, never previewed").
  `_DP_SITES['brucebase.wikidot.com'].ownLinks` (`test`: `/gig:`, `/nogig:`,
  `/recording:`, `/rehearsal:`, `/interview:`, `/nobruce:`; setting
  `sa_bb_event_preview`, default on) makes EVERY text link to one on a
  Brucebase page a preview target — vzell: "on all BB PTs where an event
  href is involved in a column or elsewhere" (Event and Venue cells, Notes,
  Recent changes, the wiki's own page, a song window's Performances). A
  Media icon is an `<img>` link and stays the image card's. `isDetailUrl`
  stays `/song:`, so the Springsteen reader on other hosts (`_extDpTest()`)
  still takes no `/gig:` link. ← → step through the rows' event links
  (`_dpRowLinks(table, from)`: the same kind as the link opened). The
  record: `_dpParseBbPage()` (Scheduled, On stage, Setlist, images by kind,
  the tabs with content; sections for the window), `_DP_PARSER_VERSION` 5.
- **The window** (vzell, the same night; `_DP_PARSER_VERSION` 6): a
  Brucebase record (song or entry) is `collapsible` — its sections are
  `<details class="mb-dp-sec">`, open unless `open: false` (a song's
  Performances, 250 shows on 4th of July), and a section the reader
  toggles stays so for the page's life (`_dpSecState`, a captured
  `toggle`) — and `imagesByKind`: the images under one `h5.mb-dp-kind` per
  kind, in page order, Photo last; `data-mb-artv-ext` is numbered in that
  order, so the viewer follows it. Sections carry `html` (`_dpBlockHtml()`:
  the block's lines with its links and nothing else; the entry's Setlist
  built from its `<li>`s, cased as the card), so On stage's people,
  Setlist's songs, Performances' shows and a song's Credits link. In the
  window such a link to one of this host's detail pages (`_dpSiteForUrl()`,
  the place-free half of `_dpSiteForLink()`) opens in the window
  (`_dpDrill()`, Back: Backspace / Alt+←) and shows its card on hover
  (`_dpWinWhat()` → `here`), as a MusicBrainz link does. `ownLinks` takes
  `/venue:` and `/relation:` pages too, so a person or a venue previews
  (title, images, what its tabs give).
  Specs `tests/fixtures/bb-event-preview.spec.js`; mutations
  `scripts/mutations/bb-event-preview.json`.
- **Renditions** (HEAD 200 for a `files:`, a `gallery:` and a `news:`
  image, `scripts/probe-foreign-images.py --small`, 2026-10-23): the viewer
  record is `{image: original, thumbnails: {1200: original, large: the
  page's medium.jpg, 250: small.jpg}}`, so `_artViewerBigUrls()` tries the
  original, then `medium.jpg`, then the thumbnail; the card's tiles are
  `small.jpg`.
- **Media icons (B1).** `_bbYearBuildRow()` wraps an UNLINKED Photo, Ticket,
  Setlist, News or Memorabilia icon (`_BB_FI_MEDIA_KINDS`) of an entry with a heading
  link in `a.mb-fi-media[data-mb-fi="bb"][data-mb-fi-kind]` to that page — any
  entry kind, not only `/gig:` (vzell, 2026-10-23). The year page's icons
  are bare `<img>`s (only the side bar's legend links them), and the label
  span keeps its text, so the Media filter and the 📊 entries read the
  same. The icon's name (`_setTip()`) goes on that `a`, never the `<li>`:
  the card stashes its trigger's title while it shows, but an ancestor's
  title the browser draws over the card (vzell, 2026-10-24); an unringed
  icon keeps it on the `<li>`. Build time, so a save to disk keeps the stamps. The ring is CSS
  (`_ensureFiStyle()`). The card shows the icon's kind (`cardImages`, titled
  "date · kind"), or a note when the page has none of it; the viewer opens on
  that kind's first image (`startAt`; on an unread row the record's arrival
  moves it there, `_artViewerReplaceImages()`'s `start`), every kind grouped
  and one ← → away. A row is ONE stop for Shift+← →, whichever icon was
  clicked (`_fiClick()` keeps one trigger per `<tr>`); a row reached that way
  opens at its first image.
- **Song glyph (B2).** `_bbBuildRow()` appends `_fiGlyph()`: an
  `a.mb-fi-glyph` with no text — dashed 🖼 while unread, 🖼 and the count once
  read, `display: none` for a page with none, all CSS — so Title's text, sort
  and filter do not change. It is lazy (`cellView`): every answer paints its
  glyphs live and in the source rows (`_fiPaint()`), and `_fiAfterRender()`
  paints the songs read before from the database at render (30 days).
  `_dpSiteForLink()` skips it, so the preview stays on the title link.
- **Side effect:** a song record now has `images`, so the song preview's card
  shows the thumbnails and its window an "Images (n)" gallery.
- **Setting** `sa_bb_tip_images` (default on): the card only, for both.
- **Cost.** Nothing at render (one `<a>` per icon or row; the sweep only on a
  table with glyphs). `_fiClick()` builds a row only when the viewer shows it:
  doing it for every row up front cost minutes on a 10,348-row table (five
  columns read by name per row); now ~0.17 s, 18 ms on the 398-row
  four-year fixture (Playwright Chromium, petri, 2026-10-23).
- **Specs** `tests/fixtures/bb-image-card.spec.js` (the readers; the
  triggers; the kind's card; the viewer on the kind and one stop per row;
  Ctrl-click; the Media filter; no gig preview; the glyph: no text, its
  count, the sweep, gone for none, not the preview's; the song preview's
  thumbnails; the sl-lyrics glyph), `bb-image-card.mobile.spec.js` (a tap
  opens the viewer); mutations `scripts/mutations/bb-image-card.json` (11,
  one `"expect": "pass"`: the click's own `startAt`, covered by the record's
  arrival). Fixtures `detail-bb-gig-1985-01-04.html` and `-01-07.html`
  (`scripts/build-detail-fixtures.py`).
