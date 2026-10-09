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
`_BB_YEAR_HEADERS` order — Date, Type, Venue, City, State, Country, Tour,
Soundcheck, Setlist, Set note, Notes, Media, Info wanted — and a `Range` from
the first heading to the last entry's last block is replaced by the table:
entries, `<hr>`s and tour boxes go; the legend, the year, "Jump to" and the
Previous / Listing / Next line stay. On the live document
`<h2 class="mb-bb-list-heading">Events</h2>` goes before the table.

- Soundcheck and Setlist are `<ul><li>`, one song per row, split on " / " in
  the paragraph's TOP-LEVEL text only (a song keeps its `<strong>`/`<em>` and
  "(with …)"); `collapsableColumns` gives them the ▶N toggle.
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
- Date goes through the MusicBrainz `dateParts` extractor unchanged.

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
