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

## Every other page — `bb-page`: link previews only (2026-11-04)

(Since 2026-11-11 an event page — gig, nogig, recording, rehearsal,
interview — is `bb-event`'s while `sa_bb_detail_pages` is on: see "Event
pages — `bb-event`".)

vzell: "previews should run on every Brucebase page" (the G7 pre-test of
org/non-MB-coverage.org found a venue page with none). A catch-all
`@include` line lets the script onto every page of the wiki, and `bb-page`,
the LAST Brucebase definition (`match: () => true`, no button,
`features.bbPreviewOnly`), takes every page the others do not.

- **A pageType, not an early exit.** The first version installed the popup
  engine and returned from init. Init runs at the IIFE's top level, so
  every top-level declaration after that `return` (347 of them) stays in
  its temporal dead zone: the card and window worked, the artwork viewer
  threw "Cannot access '_artViewerState' before initialization"
  (tests/fixtures/bb-every-page.spec.js, which now drives card, window,
  viewer and Esc and fails on any page error). As a pageType the page runs
  the whole init like any other.
- **Nothing visible**: `_bbPreviewOnlyHeader()` gives init a HIDDEN `<h1>`
  at the end of `<body>`; `_bbPrepareLivePage()` (title hidden, side bar
  arranged, styles) is not called. The spec pins `#page-content` equal to
  the fixture's and `#page-title` visible.
- **Frames**: a wiki html block under the same host matches `bb-page` too;
  init stops there before anything (`window.top !== window`).
- The existing switches apply: `sa_enable_brucebase` (the gate),
  `sa_bb_detail_preview`, `sa_bb_event_preview`, `sa_pop_ext`.

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
- **The top-bar menus stay on top (Phase 7, 2026-11-11).** The theme puts
  `#header` at `position: relative; z-index: 30` and `#top-bar` (Manage
  Site, Help Docs, …) at its bottom, its dropdowns opening down over our
  toolbar `<h1>` and status line. The sticky filter bars stamp those
  `.mb-vsb-head` (z-index 105, 107 raised on hover or focus), from page init
  on: they covered the entries, and a pointer moving down from the toggle
  left the `li`'s `:hover`, so the menu closed before any entry was reached
  (vzell, Image #18, before a press too). `_vsbLiftChrome()` now marks
  `#header` as it marks MusicBrainz's top header (`.mb-vsb-chrome`, host
  scoped by `_isBbHost`), and `_ensureBbStyle()` gives it z-index 108
  (VSB_Z_CHROME); the shared CSS text is unchanged. Found with
  `elementFromPoint` over the theme's own rules (`bb-topbar-menu.spec.js`
  carries them verbatim: the fixtures have no theme CSS). Mutations:
  `scripts/mutations/bb-topbar-menu.json` (3). A click on an entry after a
  render still asks first: that is the navigation guard, as for any link
  leaving a loaded table.

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
  (default **on** since 2026-10-24, off before, with its `_SETTINGS_MIGRATIONS`
  entry; "Collabsable sidebar" above the right-hand option); it
  used to share MusicBrainz's `sa_collabsable_sidebar` (default on). It
  still starts collapsed with `sa_sidebar_collapsed`. `initSidebarCollapse()`
  itself is bound to MusicBrainz's `#sidebar`/`#page`/`#content`, so this is
  its own small copy. It sits against the side bar's inner edge, or the
  window's edge while collapsed, and collapses toward its own side.
  **Vertically it is at the TOP** of the side bar (collapsed: of
  `#main-content`), kept between 8 px from the window's top and 8 px above
  its bottom: MusicBrainz's `setTop()` rule from `initSidebarCollapse()`
  (vzell, 2026-11-11; until then CSS `top: 50%`). `place()` sets it inline;
  the CSS `top: 8px` is only the first frame. It stays in `document.body`
  (a foreign-host-only element, CLAUDE.md "Floating hosts").
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
post-render case, the handle at the side bar's top (open, scrolled down,
collapsed; both sides), and Date docked under its h2 bar when scrolled, with
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
  `/song:` link in `table.tbl > tbody` when `sa_bb_detail_preview` is on; on
  a desktop also one anywhere else on the page outside `_DP_PAGE_SKIP`, the
  initial page included).
  A prose column, clamped like Annotation.
- Media is `ul.mb-bb-media`, one `<li>` per icon: the site's image (16 px)
  and a visually hidden `.mb-bb-media-label` — clipped, never
  `display:none`, and NOT in `_CLEAN_STRIP_SEL`, because it is the text the
  filter and the 📊 dropdown read. A cell with two or more icons lists each
  label as its own 📊 entry with no engine change (the dropdown's per-`<li>`
  item values). Since 2026-10-26 each such entry also shows the label's
  icon after it (`bbMediaIconMap`, docs/claude/uniq-dropdown.md, "A
  Brucebase Media icon on an entry").
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

## Year listing pages — `bb-year-list` (Phase 9, 2026-11-12)

`/2026-list`, …, `/1949-64-list` (vzell, 2026-11-11): one line per entry of
the year page. Same switch as the year pages (`sa_bb_year_pages`, the gate
names `_BB_YEAR_LIST_PATH_RE`); no new `@include` (the catch-all line).

- **The page** (`scripts/probe-bb-year-list.py` over the mirror's 63
  listings, 2026-11-12 · vzell-lap · n/a): a year nav line (a
  `.list-pages-box`, every listing linked, this one too), an `h1` "1978
  listing by date / location", an intro `div.code` (62 of 63), then `<ul>`s
  of `<li><a href="/1978#050378">1978-03-05 - RECORD PLANT, NEW YORK CITY,
  NY</a> <span style="font-size:80%;"><em>(Recording Session)</em></span></li>`
  — 5,001 entries, every link `/YEAR#ddmmyy`, every label "DATE - VENUE";
  2,285 notes (589 distinct: Recording Session 467, Rehearsal 153,
  Rescheduled 121, Early/Late 113, Cancelled 104, Interview 66, band and
  event names), 308 `00` dates, one stray "]" (2005). Between the lists,
  tour boxes (`<table>`, no `h2` unlike the year page) and tour banners
  (`div.image-container`).
- **The converter** `applyBbYearListToTable()` (`features.bbYearListToTable`,
  the three call sites of `applyBbYearToTable()`): `_bbYearListEntries()`
  walks `#page-content`'s children in order — a box through
  `_bbParseTourHeading()` (a start names the tour, an end clears it), each
  `ul > li` show link with its note (the `<em>` without brackets) — and the
  range from the first list to the last list or box is replaced by the
  table; the nav line, the `h1` and the intro stay. Columns
  `_BB_YEAR_LIST_HEADERS`: Event (`_bbYearEventCell()`, the year table's
  cell, its link `a.mb-bb-show-link` to the show, which previews with the
  `bbdate` reader since Phase 8), Date (`_bbParseHeading()`, `00` dropped,
  then `dateParts`), Venue, City, State, Country (title style as on the year
  table), Note, Tour. Event is the sticky first column
  (`_bbYearListTableFeatures()`).
- **`_bbParseTourHeading()`** now also splits ", and Start of" (1981: "End
  of the 1st leg, and Start of the 2nd leg of "The River" tour - Europe"; 4
  boxes on the listings), which the year page reads the same way.
- **Two buttons**: "Show this year's events" (the live page, no request) and
  "Show the events of all years" (`bbYearListToTable: 'all'`, `pageKeys`
  over `#page-content a[href]` with `_BB_YEAR_LIST_PATH_RE_KEY`: the nav
  line's 63 listings in order). The engine reuses the live document for the
  key the URL shows, so this year is NOT emptied first: the first version
  gave the live page an empty table as the start page does and lost this
  year's rows (caught by the spec). 63 pages pass the High Page Count gate.
- **Tests**: `tests/fixtures/bb-year-list.spec.js` (11: gate on/off, 2026's
  every column against a regex read of the fixture, the five other fixtures'
  tours, notes and links, the show link's `bbdate` resolve, all years over
  three listings, the tour heading table), loader `loadBbYearListPage()`,
  fixtures `bb-year-list-{2026,1978,1949-64,1981,2005,1973}.html`
  (`scripts/build-bb-year-list-fixtures.py`), mutations
  `scripts/mutations/bb-year-list.json` (10; one `expect: pass`: no spec
  loads a listing from disk yet).

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
  href is involved in a column or elsewhere" (Event cells, Notes,
  Recent changes, the wiki's own page, a song window's Performances). A
  Media icon is an `<img>` link and stays the image card's. `isDetailUrl`
  stays `/song:`, so the Springsteen reader on other hosts (`_extDpTest()`)
  still takes no `/gig:` link — except on discogs.com, where `ownLinks`
  counts as well (2026-10-24, docs/claude/discogs.md). ← → step through the rows' event links
  (`_dpRowLinks(table, from)`: the same kind as the link opened). The
  record: `_dpParseBbPage()` (Scheduled, On stage, Setlist, images by kind,
  the tabs with content; sections for the window), `_DP_PARSER_VERSION` 5.
- **Media and "Play here"** (org/youtube.org Step 4, `_DP_PARSER_VERSION` 8):
  a Media tab that is only a YouTube player (an `<iframe>`, no text —
  debug/bb-event-youtube.html) counts in "On the page", and becomes a Media
  section between Performances and Recording (`_bbMediaSection()`: each
  player as a link to the video or `playlist?list=`, then the tab's own
  words). The record is `ytTiles`; the window adds a "Play here" tile after
  every YouTube link of its sections at RENDER (`_ytDecorateHtml()`), so the
  cached record never depends on `sa_yt_play_in_place`. The player loads only
  on a click, as the venue window's "never another site's frame on its own"
  asks. Fixture: tests/fixtures/detail-bb-gig-2026-10-03.html
  (scripts/build-bb-youtube-gig-fixture.py keeps the YouTube iframe, unlike
  build-detail-fixtures.py). docs/claude/detail-pages.md, "YouTube in place".
- **The window** (vzell, the same night; `_DP_PARSER_VERSION` 6): a
  Brucebase record (song or entry) is `collapsible` — its sections are
  `<details class="mb-dp-sec">`, open unless `open: false` (a song's
  Performances, 250 shows on 4th of July), and a section the reader
  toggles stays so for the page's life (`_dpSecState`, a captured
  `toggle`); a Ctrl-click (⌘) on a heading gives EVERY section of the
  window the state the clicked one did not have (a captured `click` in
  `_dpInitSecToggles()`, its default action prevented, 2026-10-24) — and
  `imagesByKind`: the images under one `h5.mb-dp-kind` per
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
- **Venues** (vzell, 2026-10-24; `_DP_PARSER_VERSION` 7). A venue page
  has its own reader, `_dpParseBbVenue()`: every venue page sampled by
  `scripts/probe-bb-venue-pages.py` (16, 1973–2026, five countries) has one
  shape — title, breadcrumbs ending in "Venues In <Region> (<code>)" (the
  sub-title), description paragraphs and "Source:", the count "Springsteen
  did N performances, excl. rehearsals" (the highlight), then tabs:
  Performances (rehearsals included, newest first), where they apply
  Cancelled and Appearances (interviews, recording sessions), Gallery
  (folder `venue:<slug>`, kind Photo; a renamed venue's Gallery holds the
  old name's folder too) and Streetview (a Google Maps iframe, offered as a
  link: the window never loads another site's frame by itself). Each list
  of entries is a field ("43 · 1978-05-19 to 2020-01-18") and a linked
  section. **A year table's Venue cell links the ENTRY page** — the year
  page names no venue page, and an entry's venue slug is not derivable from
  its own (`1985-03-31a-…`, truncated slugs, renamed venues). Its link is
  `a.mb-bb-venue-link`, and `_DP_SITES[…].via` makes it a target of its own
  (`via:<url>`): `_dpSiteSource()` reads the entry page (`_dpGet()`, so a
  hover on the row's Event cell already paid for it), takes its
  `venueUrl` (the "Info & Setlist | Venue" line, `_dpParseBbPage()`), and
  shows that page; what an entry named is remembered for the page's life.
  ← → from a venue step through the rows' venue links (`_dpRowLinks()`'s
  `via` rule). Spec `bb-event-preview.spec.js` ("the venue reader", "a
  Venue link previews the venue", "Space on a venue"); mutations
  `scripts/mutations/bb-venue-preview.json`; fixtures
  `detail-bb-venue-*.html` (`scripts/build-detail-fixtures.py`).
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

## Event pages — `bb-event` (Phase 2, 2026-11-11)

org/brucebase.org, "Plan (2026-11-11)", Phase 2; mockup M1,
https://claude.ai/artifact/3rAGVKsBHEv9jGspkJ5X7Z; vzell's answers 1–6 in the
plan. A gig, no-gig, recording session, rehearsal or interview page as a
release-tracks-style detail page (the foreign-detail pattern of
`bs-record`/`sl-song`, docs/claude/detail-pages.md).

- **Definition** BEFORE `bb-page`: `match` = `_BB_EVENT_PATH_RE` and
  `sa_bb_detail_pages !== false` (default **on**; off, the page is
  `bb-page`'s again — `bb-every-page.spec.js`'s gig test seeds it off). No
  `@include` of its own: the catch-all line takes these paths. One button,
  "Show the event" (`showIf`: `_bbEventHasTables()`), `tableMode: 'multi'`,
  `groupByH3`, `openSubTables: true` (new engine feature, see below).
- **No request**: `pageRequest.fetchText` returns `_bbDetailPageHtml()`, a
  copy of the page taken at the press **from a clone with every
  `<script>`/`<style>`/`<noscript>`/`<template>` removed, with a doctype**.
  The first version serialised `document.documentElement` as it was: the
  fixture harness injects the userscript inline, its source holds
  "</script>", and the re-parse ended that script early and parsed the rest
  as markup, which put Setlist and every later tab outside the tabview (only
  On Stage rendered). A real page with another script's inline text could do
  the same.
- **Two readings of the copy, once** (`_bbEventSource()`): `_bbEventRead()`
  (tables, the head's own facts) and `_dpParseBb()` — the very record the
  hover preview shows (Scheduled, images with captions, tags, Media), so the
  page and its card agree. `_dpParseBbPage()` itself is unchanged.
- **`_bbEventRead()`** reads the one tabview by label (`_bbEventTabs()`: label
  i with panel i): the cast tab (`_BB_EVENT_CAST_TABS`: On Stage, In Studio,
  On Set, On Site → `_bbEventCast()`, a band's members carry the band, the
  words after a name are the Role), Setlist (`_bbEventSetlist()`: the left
  cell of its table; a `<p>` that is one `<strong>` names the set, else
  "Show" — only 19 of 120 sampled gigs label sets; per `<li>`: first song
  link, the rest Segue, a song in `<strong>` a premiere, the rest of the
  text the Note), the list tabs (`_BB_EVENT_LIST_TABS` → `_bbEventList()`:
  Date, Event, Show = Early/Late, Type by the link's category, `self` for
  the page's own entry), Recording (`_bbEventRecording()`: `/retail:`,
  `/bootleg:` with the `<sup>` label after it, `/playlist:`, the live
  download by its `artwork-livedl` cover, "Running Time"), Storyteller
  (`_bbEventStories()`: a `<p>` led by a bold heading is a row — Moment, the
  quoted Song linked through the setlist's songs (`_bbSongKey()`), Words; a
  `<p>` without one carries on the row above; "Compiled by" the note). The
  gignote is the first `.list-pages-box` before the tabview that holds no
  `[id^="social"]` (the Share box). Gallery and Media are the head's; any
  other tab with words is a text section (`rec.texts`).
- **`_bbEventToHtml()`**: Setlist (`_BB_EVENT_HEADERS.setlist`: Set · # ·
  Song · Segue · Premiere · Note — one table, answer 1), the cast under its
  tab's name ("On stage", "In studio"), each list (Date · Event · Show ·
  Type, the page's own entry `<b>… (this page)</b>`), Recording (Release ·
  Kind · Label), Storyteller (Moment · Song · Words, answer 2;
  `collapsableColumns: ['Words']`). Songs through `_mbSiteTitleText()`, the
  wiki's capitals in a `data-mb-tip` title (answer 6). Nothing for a table →
  throws `{status: 0}`.
- **`applyBbDetailToTable()`** (press and disk-load sites, beside
  `applyBsRecordToTable()`): `h2.mb-bb-list-heading.mb-bb-event-heading`
  "Event" + an empty `table.tbl.mb-bb-detail-table` + `h2.mb-bb-native-h2`
  "Brucebase page", all before `#page-content`. `makeH2sCollapsible()` folds
  every h2 but the data one, so the wiki's page starts folded (answer 5) and
  its own h2s (an article's title in News/Memorabilia) fold too — the
  original TODO's "make the standard BB page h2/h3 click collapsable".
  `#page-content` itself is never moved or edited.
- **`_bbEventHeadSpec()`**: `sub` "~ Gig at <place> (<date>)"; About this
  show/session/interview/rehearsal; `rec.texts` as closed texts; facts: the
  Event card (Type, Date + weekday, Scheduled, Venue, Tour from `tour_`
  tags, Year page, Running time, This page); others: Tags by family
  (`_fdChips()` rows in `_BB_TAG_FAMILIES` order) and Media (the preview's
  Media section links); pictures from the preview record, `types` = kind or
  "Photo · <photographer>" (answer 3), caption from the filename.
- **`_bbScheduledText()`** now reads "Scheduled: 21:00 | Local Start Time
  …" too (the "|" form; the preview missed it before).
- **Engine: `features.openSubTables`** (`_defOpensSubTable()`, read in
  `renderGroupedTable()`'s auto-expand and the reset after a discography
  view switch): `true` or a list of h3 names that start open. No MusicBrainz
  definition sets it.

Tests: `tests/fixtures/bb-event.spec.js` (14: both gates and the default;
the Roxy gig's tables with counts read from the fixture's own tabs, title
case, the head's cards and pictures, the native page; a person link in On
stage previews (FRP); a soundcheck, a session, an interview, a no gig, a
rehearsal; Save → Load from Disk); fixtures `bb-event-*.html` from the
mirror (`scripts/build-bb-event-fixtures.py`, `loadBbEventPage()` in
`tests/support/bbFixture.js`); mutations `scripts/mutations/bb-event.json`
(12).

## Venue and person pages — `bb-venue`, `bb-relation` (Phase 4, 2026-11-11)

Same pattern as `bb-event` and `bb-song`; one reader for both kinds,
`_bbPlaceRead(doc, url, p)` (the kind from the path), one `toHtml`,
`_bbPlaceToHtml()`, one head, `_bbPlaceHeadSpec()`, features from
`_bbPlaceFeatures(kind)`. This phase is also the org/brucebase.org TODO "BB
Steve van Zandt detail page needs overhaul".

- **The wiki pages its long lists** (Wikidot ListPages, `div.pager` with
  `.pager-no` "page 1 of 6", the next pages at `/<page>/p/N`). Probe
  2026-11-11 (scratch curl of Steven Van Zandt's /p/1–7 and Patti Scialfa's
  /p/1–3; env vzell-lap, n/a): every module of a page follows the one
  `/p/N`; a module past its last page shows its LAST page again (Patti's
  /p/3: "page 3 of 3" beside "page 2 of 2"; SVZ /p/7 = /p/6); a list with
  no pager (SVZ's "Not as a member" column, 211 shows) is the same on every
  page. Hence `_bbPagedListOk(list, p)`: a paged list while its pager says
  `p`, an unpaged one on page 1 only; `_bbPagedRows()` applies it per list.
  `pageCountAsync` is the largest N (`_bbPlacePageCount()`); `pageRequest`
  gives page 1 from the copy taken at the press and page N as a GET of
  `/p/N` (same origin); `groupMergeByName` joins the pages' groups. SVZ:
  six pages → 1,517 rows (1,306 with the E Street Band, 211 without), the
  page's own count.
- **Performances**: the total ("Performed 1517 times with Bruce
  Springsteen"), the count per band (`li` "Performed 34 times as a member
  of Steel Mill", and "… excluding those as a member of bands below" →
  "Not as a member of the bands below") → *Performances by band*; the shows
  in a grid whose HEADING ROWS name the cells of the row after them ("As a
  member of The E Street Band:" / "Not as a member …:"; Patti Scialfa has a
  second heading row for The Sessions Band, beside an EMPTY cell — a
  heading row is: no list, bold in some cell, the others bold or empty) →
  the As column. Without such a grid, the lists as they are (Type "On
  stage": a show's link is the wiki's `/onstage:` redirect,
  `_BB_ENTRY_KINDS`).
- **Appearances, Cancelled**: lists (Type from the link: No gig, Interview,
  Off stage, …).
- **Recording**: a `<p><strong>` credit heading ("Performer") over
  releases (title, artist link, year) and their songs with the role in
  brackets → Credit · Release · Artist · Year · Song · Role.
- **Bands / Members**: names in sort form, shown in reading order by
  `_bbRelationDisplayName()`; Members makes the head say "Band".
- **Co-written**: song, and the others named in "(with …)".
- **Streetview / Map**: the iframe's link in the Venue card; Gallery: the
  head's pictures; other tabs with words (News): text sections.
- **Before the tabs**: the description ("About"), "Source:" (a card
  field), a venue's "Springsteen did N performances" (the Venue card) and
  its region from the breadcrumbs ("Venues In California (CA)"); a
  person's sort name from the last breadcrumb.
- `_bbEventList()` (shared) now also reads "2015-04-30, Story Chapel, …"
  (a comma after the date: Patti Scialfa's Performances), and flags it: the
  ⚠️ finding `bb-date-comma` on the Date cell (`_bbDateCell()`;
  docs/claude/findings.md). The list entries are the linked pages' titles,
  so that page's title is the one to fix.
- **A show's link is the wiki's `/onstage:<event>`** (`/offstage:` in
  Appearances), which the server answers with a 301 to the event (curl,
  2026-11-11; one of Patti Scialfa's, Story Chapel's, redirects to a gig page
  that answers 404 — the wiki's data). Since the same day both are
  `ownLinks` of the preview, and `_dpParseBb()` reads the record at the
  event's own address, `_bbRedirectedUrl()`: `fetch()` follows the 301 but
  the reader is handed the `/onstage:` URL, so the page's inline
  `WIKIREQUEST.info.requestPageName = "gig:…"` names the address (the tags'
  Category is then "gig", not something the page holds).
- `openSubTables`: a venue's tables all open; a person's Performances (up
  to 1,500 rows) folded.

Tests: `tests/fixtures/bb-place.spec.js` (8: the gate; the Roxy's tables
and head, a show previews (FRP); Patti Scialfa's three pages — every
distinct show link once, the three As headings, one request per later
page; per band, Recording, Bands, the head; a one-show person ("On
stage"); a band's Members; Save → Load from Disk with no request);
fixtures `bb-venue-roxy-theatre.html`, `bb-relation-*.html` (Patti's three
pages fetched together from the live site, 2026-11-11T15:26+01:00);
`loadBbEventPage()` serves `/p/N`; mutations `scripts/mutations/bb-place.json` (10).

## Release, playlist and bootleg pages — `bb-retail`, `bb-bootleg` (Phase 5, 2026-11-11)

Same pattern as the other detail pageTypes: a copy of the page at the
press, no request; readers `_bbReleaseRead(doc, url)` (a `/retail:` or
`/playlist:` page) and `_bbBootlegRead(doc, url)`, one `toHtml`,
`_bbReleaseToHtml(text, base, kind)`, one head, `_bbReleaseHeadSpec()`,
the cache `_bbReleaseSource()`. The same readers make the preview's
record, `_dpParseBbRelease()` (parser version 20): facts as fields, the
tracks with their times (`data.tracks`), the count as the highlight,
Overview / Personnel / Related releases (or the bootleg's notes) as closed
window sections; `ownLinks` takes `/retail:`, `/playlist:` and `/bootleg:`
links since this phase, so any link to one previews on every Brucebase page
(and, through `_extDpTest()`, on the other hosts).

Survey (2026-11-11T17:20+01:00 · vzell-lap · n/a: offline, 59 release and
20 playlist main pages and 30 bootlegs of the mirror, copied to
`debug/bb-mirror/{retail-main,playlist-main,bootleg}/`; the readers run over
every one in a throwaway spec):

- **A release and a playlist are one layout.** The discography strip at
  the top (a ListPages box with a tabview Original | Collaboration |
  Compilation | Playlist of covers: skipped by `.closest('.list-pages-box')`),
  the cover, a `div.code` block of facts, its footnotes, then h1 sections
  Overview, Released, Additional Information (48 of 59; the rest are the
  main page's SUBPAGES — `-release`, `-credits`, `-overview`, `-addinfo`,
  `-recgig`, `-liner`, `-history`, 190 of each kind in the mirror — which
  the main page includes; a subpage has no h1, so a tabview is told by its
  tab labels, `_BB_RELEASE_INFO_TAB_RE`).
- **Facts** (`_bbReleaseFacts()`): "Commercially Released*: …" (the
  footnote stars dropped, the name in sentence case), "Produced** by …"
  (a name of four words at most before "by"), a line that starts with a
  space continuing the one before ("at Record Plant Studios …"). The
  paragraphs between the block and the first h1 are its footnotes (Notes).
- **Released**: a tab per edition, a `<table>` per disc ("# · Song Title ·
  Running Time · Release", "1.1." numbering), a ONE-CELL `<th>` row inside
  a table opening a part (The Promise's six Blu-ray films), "Total Running
  Time" under the tables; a song's `<sup>` mark ("(1)") is looked up in the
  tab's footnotes ("1: Hidden in the previous track.") for the Note column
  (`_bbFootnotes()`). A disc's sub-table is named "<edition>" alone, or
  "<edition> · Disc N" (N from "2.1.") / "· <part>" when a tab has more
  than one.
- **Additional Information**, by tab label: Personnel (`_bbEventCast()`
  with `all`: every top-level list — Bruce's, then the band's — and the
  colon after a name stripped), Related Releases (group, release, its
  bracketed `<sup>` as the Note; the release is the item's words, since a
  link may name only part of the title), On The Tracks (`_bbOttRows()`,
  whose version now keeps a suffix: "V2 - take 14", "V1 (August 1, 1974)" —
  bb-song's too), Recording 'Live' Dates (one-cell rows name the disc,
  "October 18, 1975" → 1975-10-18 with the wiki's words on hover, the marks
  looked up as above), Performance (the songs' live counts); Media's players
  and Lyrics' links are head chips, Artwork and the galleries the pictures,
  any other tab with words (History, Studios, News) a text section.
- **A footnote mark is removed from a COPY** (`_bbTextWithoutSup()`): a
  string replace of "a" cut the first "a" of "Asbury Park".
- **YouTube**: the release pages embed `youtube.com/embed/playlist?list=…`,
  which `_ytParse()` read as a VIDEO named "playlist" (shared code, fixed:
  it is a playlist, like `embed/videoseries`).
- **A bootleg is free text** in its Bootleg tab (beside Artwork). Lines
  (`_bbLines()`: a `<br>` ends one) are read in order: "Disc 1: (43:31)",
  "Disc 2", "Disc One:" open a disc; a list's items, or a paragraph whose
  lines are at least half numbered ("1-Rendezvous", "01 Guns Of Kid Cole
  (4:50)", "101 - Mary Queen Of Arkansas", "1-46 reporters …"), are tracks,
  the time in brackets ("(2:27)", "(5.35)") out of the title, "//" after a
  song ending a side (sides A, B, … through the discs; a Side column only
  then); "Name: value" lines are facts (Label, Catalog #, Time, Format,
  Source, Sound, …; a name with an empty value takes the next line);
  "Notes:" starts the notes, where only `_BB_BOOTLEG_FACT_RE`'s names are
  facts ("Appel: Now people …" is a quote); the lines before any of these
  are the bootleg's own description. A note repeated under every disc is
  one. All 30 sampled bootlegs give a tracklist.
- **Pictures** are typed by what the filename says: `_bbPageImages()`
  carries `nameKind` and `part` (`_bbParseImageName()`), so a release's
  artwork shows "Release cover", "Ad poster", "Article" …, a bootleg's
  Front, Back, Disc.
- **Heading**: "Release", "Playlist" on a `/playlist:` page, "Bootleg".

Tests: `tests/fixtures/bb-release.spec.js` (16: the gate on both; Born To
Run's tables, rows and head; Live/1975-85's discs and Recording dates; The
Promise's editions and parts; a playlist; a release link previews its
tracks (FRP); four bootlegs — facts, discs, sides, numbered lines, no
facts; both readers on synthetic lines; Save → Load from Disk); fixtures
`bb-retail-*.html`, `bb-playlist-songs-of-love.html`, `bb-bootleg-*.html`
(`scripts/build-bb-event-fixtures.py`; it keeps only YouTube iframes, so
the Spotify player is not in them); mutations
`scripts/mutations/bb-release.json` (23).

## Song pages — `bb-song`, and On The Tracks — `bb-ott` (Phase 3, 2026-11-11)

Same pattern as `bb-event` (above): a definition before `bb-page` under
`sa_bb_detail_pages`, one button, no request, the head over the copy of the
page, the wiki's page folded below. The shared parts were renamed from
`_bbEvent…` when this phase made them shared: `_bbDetailPageHtml()`,
`_bbDetailUrl()`, `applyBbDetailToTable()` (now
`features.bbDetailToTable: 'event' | 'song' | 'ott'`, the data heading from
`_BB_DETAIL_HEADINGS`, the table `table.mb-bb-detail-table`, the heading
also `h2.mb-bb-<kind>-heading`).

- **`_bbSongRead()`**, tabs by label (survey of the 60 sampled song pages:
  Credits, Performances, Multiples, Released on Album, Released as Live
  Download, On The Tracks, Lyrics, Media, Snippets, Links, Gallery):
  - Credits (`_bbSongCredits()`): a release per top-level `<li>` (its
    `<em><a>` and "(1999)"), a row per person under it ("Roy Bittan: piano"
    → Person, Role); a line under a person that names no one ("String
    arrangement by Ken Asher") is a row with Role only.
  - Performances (`_bbSongPerformances()`): the LEFT cell's list
    (`_bbEventList()` — the right cell's "Performed at N show(s) of" `<li>`s
    must not be read as shows), "Performed live N times"; the right cell's
    breakdown by tour, one inner table per tour ("Performed at 1 show(s)
    of" / "**75** on the **The River Tour 2016**."), only tours with N > 0
    (the tab lists every tour, most at 0).
  - Multiples, Snippets ("Performed live N times as a snippet"), Released
    as Live Download: `_bbEventList()`. A "multi" page's kind is "Multiple
    shows" (`_BB_ENTRY_KINDS`).
  - On The Tracks (`_bbOttRows()`): a row per `<tr>` with three cells,
    "THE PROMISE - V1" → Title, Version; the time; the release
    abbreviations (each linking a `/bootleg:` or release page) or the
    text ("uncirculating"). Its paragraphs are a text section.
  - Released on Album, Lyrics (text only, its lines kept) and any other tab
    with words: text sections. Media's and the page's iframes: the Media
    card (YouTube, Spotify). Links: the Links card.
  - The paragraphs before the tabs ("Track 18 of 18 Tracks, 1999. …"):
    About this song.
- **`_bbSongToHtml(text, url, kind)`**: Credits, Performances by tour (with
  Share), Performances, Multiples, Snippets, Live downloads, On The Tracks;
  `openSubTables` lists the short ones (Performances and Live downloads,
  hundreds of rows on a well-known song, start folded).
- **`_bbSongHeadSpec()`** (both kinds): `_bbSongSource()` reads the copy with
  `_bbOttRead()` on an `/ott:` page, `_bbSongRead()` otherwise, and
  `_dpParseBb()` (Last played, Released on, Released live on, images,
  tags). The Song card: Performed live, Snippets, Last played, Released on,
  Released live on, Live downloads, Versions, This page.
- **`/ott:<song>`** (`bb-ott`, `_bbOttRead()`): the versions table and the
  page's note paragraphs.
- **`/lyrics:` stays `bb-page`'s** (link previews only): the page is the
  lyrics and nothing else, so a table view would add nothing (the plan's
  "+ lyrics:" — decided while building).

Tests: `tests/fixtures/bb-song.spec.js` (8: the gate; The Promise's tables,
counted from the fixture's tabs, Credits' person and note rows, the tours
played on with their share, which tables start open; title case and
links; the head's texts and cards; a person in Credits previews (FRP); a
song with snippets and no credits; an On The Tracks page; Save → Load from
Disk); fixtures `bb-song-*.html` and `bb-ott-*.html` (lyrics blanked with
`build-detail-fixtures.py`'s `blank_lyrics()`); mutations
`scripts/mutations/bb-song.json` (9).

## What a filename says, and the page's tags (Phase 1, 2026-11-11)

org/brucebase.org, "Plan (2026-11-11)", Phase 1; mockups
https://claude.ai/artifact/3rAGVKsBHEv9jGspkJ5X7Z (org/bb-overhaul-mockups.html,
the "Filenames" tab). `_DP_PARSER_VERSION` 19.

- **`_bbParseImageName(url)`** reads the wiki's naming convention: shapes
  A–H (A `YYYYMMDD[a]_<Kind|Photographer>_NN[a][_detail]`, B `Retail-…`,
  C `YYYY-TOUR_…`, D `disco_|digital_`, E `bs<YYMMDD>`, F
  `lyricsheet_|note_|recording_|graph_`, H `Bootleg_<Title>[_<Label>]_<Part>N`,
  G `<slug>_NN[_date|subject]`). 98.5 % of the 3,804 distinct names of the
  sample (`scripts/probe-bb-detail-pages.py` over `debug/bb-mirror/`,
  written by `scripts/sample-bb-mirror.py` from the BruceParser mirror). In
  shape A the second slot is a kind when `_BB_IMG_NAME_KINDS` knows the word,
  "Unknown" a photographer not known, anything else a photographer
  (CamelCase split: "CliffBreining" → "Cliff Breining"). The name is
  decoded first and spaces around `_` dropped (`WarrenLinhart%20_01`). What
  no shape reads (7-digit dates, site icons, `register_…` documents) gets
  `shape: ''`: the folder's kind (`_bbImageKind()`) is all there is, as
  before. Dates drop `00` parts as MusicBrainz writes them.
- **`_bbImageCaption(p, folderKind)`** words it: "Photo · Cliff Breining ·
  #01", "Setlist · #01a · Handwritten". `_bbPageImages()` stores it as
  `caption` with the photographer as `credit`. The window's tile shows the
  caption after the kind (the whole caption is its `data-mb-tip` title),
  the viewer's comment is "caption — filename" (`_bbFiImages()`), and the
  window's "Images" groups Photo once per photographer ("Photo · Mic
  Hampton"; vzell's answer 3), named ones first, plain Photo (no known
  photographer) last. Each group is a `details.mb-dp-kindsec`
  (`data-mb-dp-sec="img:<group>"`): a click on its heading folds it, a
  Ctrl+click folds or opens every GROUP and leaves the sections alone (and
  a Ctrl+click on a section leaves the groups), remembered in `_dpSecState`
  for the page's life (`_dpInitSecToggles()`; vzell, 2026-11-11, a
  212-image gig window).
- **`_bbPageTags(doc, url)`**: `div.page-tags > span > a`, on every page,
  signed out too. **`_bbTagFamily(tag, ctx)`** sorts each into
  `_BB_TAG_FAMILIES` (Date, Place, Tour, On the page, Songs, People,
  Releases, On The Tracks, Bootleg labels, Playlists, Keys, Tour snippets,
  Letter, Category, Other). Songs and people are recognised by the page's
  own `/song:` and `/relation:` links (slug squashed), places by the
  title's comma parts, `(xx)` and a country list. The page's own category
  ("gig" on a gig) is Category; another category word on it ("news",
  "bootleg", "retail") says what the page holds (On the page). Song
  abbreviations ("btn", "tas") are Other: nothing on the page names them.
- **`_dpParseBb()`** is now a wrapper: `_dpParseBbRecord()` (the old body:
  song, venue, entry) plus `tags` and a last, CLOSED "Tags (N)" section
  (`_bbTagsSection()`, pills by family, each linking the wiki's
  `/system:page-tags/tag/<tag>#pages`). The window's remembered fold key
  strips the count, so a toggled Tags section stays so.

Tests: `tests/fixtures/bb-image-names.spec.js` (every shape on real names,
captions, the three misses; tag families with and without the page's
category), `bb-event-preview.spec.js` ("tags by family" — counted from the
fixture's tag block; "grouped by photographer" — 1985-01-04's Mic Hampton,
1985-01-13's unknown photographer; "image groups fold"); mutations
`scripts/mutations/bb-names-tags.json` and `bb-window-sections.json`.

## Show links on Brucebase's own pages (Phase 8, 2026-11-11)

A show on its year page (`/<yyyy>#<ddmmyy>`: an event's "Info & Setlist", a
release's or song's "recorded July 6, 1981", the copies in our head and
tables) previews on Brucebase's own pages with the `bbdate` reader, as it did
on every other site and, since G3 (2026-11-03), inside a window here. The
mirror sample has them on most event pages (gig 103/120, nogig 37/40,
recording 54/60, rehearsal 34/40, interview 28/40), every playlist main page,
some release and song pages; none on venue, relation, onstage, bootleg or
lyrics pages. Details: docs/claude/detail-pages.md, "The Brucebase date
anchor" and the G3 bullet.

Two follow-ups from vzell's live check (2026-11-12): the show's window draws
the year page's icons (Photo, Setlist, Memorabilia, Video, …: the site's own
images, each with its word) where the Fields said "The gig page has …"; and
every Brucebase window (a venue's, a show's, a Brucebase page's on another
site) opens any link with a reader in place, as a MusicBrainz entity's window
does — a venue's "Source: Wikipedia" opens the article there, with Back
(`_dpWinIsBb()`).

## A page's history in the window — `_bbHist*` (Phase 6, 2026-11-11)

vzell's mockup M4 (org/bb-overhaul-mockups.html): a closed "History"
section in the window of any Brucebase page, read when it opens and never
on a hover; the Discogs look; a "changes" entry in the ☰ menu. Answer 4:
signed out, "Sign in to Brucebase to see the history".

- **The probe decided the scope.** `scripts/probe-bb-history.user.js`
  (privacy pinned by `scripts/check-probe-bb-history.js`), run by vzell on
  song:streets-of-minneapolis signed in and signed out
  (`debug/bb-history-probe-20261111-{in,out}.json`): Wikidot's history
  modules — PageHistoryModule, PageRevisionListModule, PageSourceModule,
  PageVersionModule, PageDiffModule (`show_type: inline`) — answer a
  visitor exactly as a member: status "ok", the same bodies (only the
  random tabview id differs), 110–400 ms each. The site hides its history
  button signed out, not the history. So the section is everyone's, and
  "Sign in…" is what a refusal (a permission or token answer) shows.
- **Requests**: `_bbHistPost(module, params)`, a same-origin `fetch()` POST
  to `/ajax-module-connector.php` with `wikidot_token7` (the cookie's value,
  `_bbWikidotToken()`, as Recent changes), after `_dpAwaitSlot()` (the
  window's one-a-second gate). The page id is `WIKIREQUEST.info.pageId` in
  the page's script (`_bbHistPageIdOf()`): the record carries it as
  `bbPageId` (`_dpParseBb()`, `_DP_PARSER_VERSION` 21; 22 for story pages), the ☰ entry reads it
  from the live page. Only on brucebase.wikidot.com (`_bbHistOn()`, with
  `sa_bb_history`): a cross-origin POST with the token was not probed, so a
  Brucebase window on another host has no section.
- **Readers.** `_bbHistParseList()`: `tr#revision-row-<id>`, newest first —
  number, flag letters (`_BB_CHANGES_FLAGS`), member and profile link,
  `odate time_N`, comment; the pager's page count ("page 2 of 3", or on page
  1 only "page 1" with links up to the last). `_bbHistParseSource()`:
  `div.page-source` (a `<br />` and a newline per line; the brs dropped, the
  newline after `<div>` and trailing blank lines too).
- **What is read, when.** `_bbHistStart(pid)`: the list's page 1 (20
  revisions), then the sources of the shown revision and the one before it
  (its predecessor may be on the next list page, read first). Memory only,
  for the page's life (`_bbHist`, `_bbHistSrc`, `_bbHistUi`); a revision's
  source is read once. **A failure is asked again only on a click** ("Try
  again", or the revision's row): the section's `toggle` also fires on
  every repaint that draws it open, and a retry from there loops.
- **The diff is ours**, not PageDiffModule's (one stream of ins/del marks):
  `_bbHistDiffRows(a, b)` trims the common start and end, matches lines
  (`_slLcs()`; a rewrite larger than 4 M cells is all removed + added), and
  pairs a removed run with an added one line by line into a changed row when
  `_cmpDiff()` finds them close (not `plain`). `_bbHistDiffHtml()`: OLD | NEW
  in the MusicBrainz history's grid (`mb-dgh-diff mb-meh-diff`, the new
  column `.mb-meh-n`, a fold row `.mb-meh-ctx`), line numbers, words marked
  `mb-dgh-rem` / `mb-dgh-add`; "Only what changed" (default) folds the
  unchanged lines into "⋯ N unchanged lines", "Everything" shows them. A
  revision whose source equals the one before (tags, title, parent) says
  so, with its flags.
- **The window.** `_bbHistSection(data)` is drawn by `_dpExtractedCols()`
  after the record's sections, `details.mb-dp-sec[data-mb-dp-sec="History"]`
  (so Ctrl+click and `_dpSecState` treat it as any section), closed by
  default, "History (N)" once the list is in (N = the newest number + 1).
  Rows are buttons (`[data-mb-bbh-act="rev"]`); controls `all`, `more`,
  `retry`, wired once by `_bbHistInit()` (delegated). ✎ in the title bar and
  H (`_dpHasHistory()` → `_bbHistHasSubject()`, `_dpOpenEdits()` →
  `_bbHistReveal()`) open the section in place.
- **☰ "✎ Page history"** (`_saedBbHistoryEntry()`, the SAED History group):
  on EVERY page with our toolbar and a page id (since vzell's live check of
  round 2: Recent changes, year pages — 2026 is at revision 310 —, stats
  pages; it first required a page a link previews), it opens the window on
  the page itself with the section open. The window reads any page of the
  wiki (`_dpParseBbPage()`); no link test at all (`src.resolve()` would also
  refuse a link outside a table on a touch screen).
- **Story pages** (`/story:`, 1,486 of them, no pageType; listed by
  `system:page-tags/tag/storyteller`): their links preview since the same
  check (`ownLinks`), so their window and its History are reachable; the
  window shows the story's words as a "Story" section, and a page without
  a tabview now folds its sections like every Brucebase window
  (`_DP_PARSER_VERSION` 22). Fixture `tests/fixtures/bb-history-story-1978-09-15.html`
  (its title change 6 → 7 and rename 3 → 4 drive the Page title / Page
  name rows end to end).

### Phase 10: the Recent changes button and the first difference (2026-11-12)

- **The button** (`button.mb-bb-changes-btn`, in our Recent changes table's
  Page cell after the link; the original "BB changes button" TODO): its glyph
  is CSS (`::before`), so the cell's text, which the filter and
  `bb-recent-changes.spec.js` read, stays the title. Rows are cloned on every
  render, so one delegated click (`_bbChangesBtnInit()`) opens the row's
  page in the window with History open (`_dpSecState`), as the ☰ entry does.
  The row knows the revision NUMBER, the History state wants an id: the
  click leaves `_bbHistWant` (page URL, `_bbHistKey()` → number);
  `_bbHistSection()` moves it to `_bbHistPick` (page id) when the window's
  record names the page; `_bbHistStart()` finds the row — reading the
  list's next pages while the number is older than the last row read — and
  sets To to it, From to the one before. Only under `sa_bb_history`.
- **The first changed line** (the TODO "create userscript which directly
  scrolls to the first difference … when clicking history"):
  `_bbHistScrollFirst()` at the end of `_bbHistStart()`, once per pair
  (`ui.scrolled`): the first `.mb-bbh-chg/-rem/-add` cell of the grid gets
  `.mb-bbh-first` (a bar at its left edge) and is scrolled to the middle.
- **The wiki's own history** (signed in): `_bbWikiDiffScrollInit()`, called
  with the ☰ entry, observes `#action-area` only (the wiki's history module
  draws there; our tables never do), and when a `div.diff-box` arrives
  (PageDiffModule's answer: `table.page-compare`, then `div.inline-diff` with
  `ins`/`del`), `_bbWikiDiffScroll()` marks its first `ins`/`del`
  (`.mb-bb-first-diff`) and scrolls it to the middle, at once and again after
  `_BB_WIKI_DIFF_AGAIN_MS` (the wiki's own animated scroll), unless the
  reader scrolled (wheel, key, touch) meanwhile. Where the module puts the
  comparison inside `#action-area` was not probed signed in; the observer
  takes it anywhere below it. Under `sa_bb_history`.
- **Tests**: `tests/fixtures/bb-history-changes.spec.js` (5: the button on
  revision 46 — the pickers, ONE comparison 45→46, the first change marked
  and in view; an older revision from the list's page 2; no button with the
  history off; the wiki's comparison, the saved PageDiffModule answer put
  under `#action-area`, scrolled and marked; left alone with the history
  off). `loadBbHistoryPage()` takes a `fixtureFile` (Recent changes, its list
  answered with one change of song:the-promise). Mutations
  `scripts/mutations/bb-history-changes.json` (11).

### Round 2: kinds, tag changes, any two revisions (2026-11-11)

vzell's asks and answers (org/brucebase.org, "History round 2"; mockups
https://claude.ai/artifact/7X2g3wBLVotb1cFfZdrCxz, built by
`scripts/build-bb-history-r2-mockups.py` from the real history of
song:streets-of-minneapolis): all six as recommended.

- **The list is read 100 a page** (`_bbHistLoadList()`): a normal page's
  whole history in one answer (probe: 44 in 0.6 s); "Load 100 more" past it.
- **Kind chips** (`_BB_HIST_KINDS`, `ui.kinds`): All, Source, Title, Page
  name, Tags, Metadata, Files — the wiki's `rev-type-*` checkboxes, each
  matching a flag letter (S, T, R, A, M, F; probe: the wiki's per-kind
  counts are the flags' counts, "ST" counting for both). They filter the
  rows READ, by flag (answer 1: instant, no request), several at once
  (answer 2, OR as the checkboxes), each with its count; All is exclusive; a
  kind with none is disabled; "N shown" in the meta line.
- **Tag pills in the list** (answer 3, `_bbHistTagChanges()`): "Added tags:
  a, b. Removed tags: c." → `+ a`, `+ b`, `− c`; the rest of the comment
  after them; the whole comment on hover.
- **The comparison first** (`_bbHistLoadCompare()`, `_bbHistCmp` by
  "<older id>:<newer id>"): PageDiffModule with the older revision as
  `from_revision_id`; `_bbHistParseCompare()` reads `table.page-compare` by
  row label — "Tags:", "Page title:", "Page name:", each present only when
  it differs (probe on story:story-1978-09-15-palladium-new-york-city-ny,
  `debug/bb-history-shapes-story.json`) — and "Page sources are identical".
  The two sources are read only when they differ: a tags-only revision costs
  one request. Rebuilding the sources from the module's inline diff did not
  match PageSourceModule (indentation, line counts), so the line diff stays
  ours.
- **The Tags strip, always** (answer 4, `_bbHistTagStrip()`): every tag of
  both, the added `+`, the removed struck; "the same in both" with no Tags
  row. Page title / Page name rows (`_bbHistValueRow()`): old → new, words
  marked.
- **From / To pickers on every row** (answer 5, `_bbHistPair()`): `ui.to`
  ('' = the newest), `ui.from` ('' = the revision before `to`); a row's text
  sets `to` and clears `from` (today's "against the one before"). The older
  is always on the left (answer 6), the rows between tinted
  (`.mb-bbh-in`), the older row `.mb-bbh-from`, the heading "Revision 28 →
  43 · 15 revisions apart · N editors". One revision picked twice: "Pick
  two different revisions". A picker's click is cancelled (the repaint draws
  the radios from the state); an arrow key on a picker clicks the radio it
  moves to, so the keyboard goes through the same handler (a `change`
  listener was tried and removed: its mutation passed).

Tests: `tests/fixtures/bb-history.spec.js` over
`tests/fixtures/bb-history-song-the-promise.html` and
`tests/fixtures/bb-history/` (`scripts/build-bb-history-fixtures.py`: the
real answers for song:the-promise, members scrubbed to "Editor N"; loader
`loadBbHistoryPage()`; the comparisons `compare-<from>-<to>.json`, the story
page's `story-compare-{title,name}.json`; the list answers asked 20 a page so
that a pager stays in them); mutations `scripts/mutations/bb-history.json`.
