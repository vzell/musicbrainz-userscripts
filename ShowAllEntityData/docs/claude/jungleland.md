<!-- Written on branch feature/jl-support (org/jungleland.it.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# jungleland.it: the second non-MusicBrainz host

ShowAllEntityData also runs on jungleland.it's bootleg **artwork** list,
`https://www.jungleland.it/html/list.htm`, as the pageType `jl-list`. It is
**opt-in**: `sa_enable_jungleland`, default **off**. The request
(`org/jungleland.it.org`) was springsteenlyrics.com's treatment "albeit not
so complex": read each entry's title and year, and let the pipeline do the
rest. It is deliberately the smallest version of the springsteenlyrics.com
design (docs/claude/springsteenlyrics.md): a host gate, one definition with
`host`, one converter, and the shared table CSS. It has no bar, no hand-off
and fetches nothing, except the opt-in detail preview's artwork pages
(`sa_jl_detail_preview`, docs/claude/detail-pages.md; they are windows-1252,
which `fetchHtml()` cannot decode, so it has its own fetch).

## The page

Checked on the snapshot `debug/jungleland.it.html` and live on 2026-10-05:

- **Format:** one static FrontPage page, served as windows-1252 with no
  doctype (quirks mode). It has no `<h1>`/`<h2>`, no table, no `#content` and
  no pagination. Its `<title>` is "Anni".
- **Year jump menu:** `form[name="theForm"]` with a `<select>` whose options
  are `#1966` … `#2026`, `#others`. Its `goThere()` navigates to the anchor.
- **Year headings:** one `<p>` per year holding `<a name="1975">` (plus
  up-arrow links to `#TOP`), then one `<p>` per entry:
  `<a target="inferioredx1" href="19750815.htm">The way it was(1975-08-15)</a>`.
- **Counts:** 6,326 entries in all.
  - 5,840 sit under 59 year headings, and every one of them ends in
    `(YYYY-MM-DD)`, glued to the title.
  - 486 sit under "others": 485 are undated, and one has its date after a
    space ("Magic In The Köln Night (2007-12-13)").
  - A few entries start with a space.
  - A re-issue has `_N` in its href and usually "(Version N)" in its title.
- **Odd nesting:** the "others" heading has a second `<a name="others">`
  inside its first entry's `<p>`.
- **Frameset:** the site's real entry point is `html/artwork.htm`, a frameset
  with list.htm as the 25 % **left** frame (`inferioredx`). Entries open in
  the right frame (`inferioredx1`, default `images.htm`), which shows that
  bootleg's front/back artwork, title, date and uploader.

## The gates — `_isJlHost`, `_foreignHost`

`const _isJlHost` sits beside `_isSlHost`, and its two gates sit right after
the springsteenlyrics one, before anything visible, for the same reason:

1. Setting off → `Lib.info('… jungleland.it support is off …')`, return.
2. **`window.top !== window` → return.** The header has no `@noframes`, so
   Tampermonkey also runs the script in the 25 % frame. Decided 2026-10-05:
   only a list.htm opened as its own tab is converted.

`const _foreignHost` (`'springsteenlyrics.com'`, `'jungleland.it'`, since
2026-10-06 also `'brucespringsteen.it'` — docs/claude/brucespringsteen.md —,
since 2026-10-07 `'brucebase.wikidot.com'` — docs/claude/brucebase.md — or
`null`)
replaced the detection loop's `Boolean(def.host) !== _isSlHost`. With two
foreign hosts, "has a host" is not enough: a definition must name THIS
one. No spec can see the difference today, because no SL matcher claims
`/html/list.htm`. Removing the host check entirely is invisible too, because
no MusicBrainz matcher claims that path either (checked 2026-10-06). Both
are recorded as `"expect": "pass"` in `scripts/mutations/jl-support.json`.

Other host-aware code:

- **`performClutterCleanup()`** stands down on both hosts.
- **`initNavigationGuard()`** needs nothing. It is one static page, `#year`
  links are hash changes, and the table's links open a new tab.
- **`initStickyPageHeaders()`** runs unchanged, just as on SL.

## The toolbar anchor — `_jlPrepareLivePage()`

Called from the init block's `else if (baseDefinition?.host === 'jungleland.it')`
beside the SL branch. It:

- prepends `<h1 class="mb-jl-h1"><bdi>jungleland.it — Bootleg artwork list</bdi></h1>`
  to `<body>`. `_cachedEntityName` reads the `<bdi>`, so that text becomes the
  file name stem;
- adds `body.mb-sa-host-jl`;
- installs `_ensureJlStyle()`.

Nothing else changes before the button is pressed.

## The converter — `applyJlListToTable(def, docContext)`

Gated by `features.jlListToTable`, it is called from the same three places as
`applySlCardsToTable()`:

1. click-time pre-processing in `startFetchingProcess()`;
2. the pagination loop when `doc !== document`. This is not reached today,
   because one page means the live document is reused;
3. `_hydrateAndRenderFromSnapshotData()`, i.e. Load from Disk, where the
   reloaded page is the plain list again.

How it works:

- **Reading the entries:** `_jlCollectItems()` runs ONE
  `querySelectorAll('a[name], a[target="inferioredx1"][href]')`, which
  returns document order. So the last year/"others" anchor seen is the
  entry's section, and `<a name="TOP">` is ignored.
- **Parsing:** `_jlParseItem(text, section)`, also exposed as
  `window.__saTest.jlParseItem`, cuts a trailing `(YYYY-MM-DD)` off the
  title.
  - Year is the date's year, else a 4-digit section, else empty.
  - A date at the START of a title ("1978-09-19  30th Anniversary
    Rendition", under "others") stays part of the title.
- **Rows** are Title / Date / Year / Version (`_JL_HEADERS`), and the
  pipeline appends DD / MM / YYYY / Day / Month after them.
  - Title links to the resolved absolute href with `target="_blank"`: there
    is no `inferioredx1` frame in a standalone tab.
  - Date is ISO, so a text sort is chronological.
  - Year is an `integerColumns` entry (`align: 'C'`).
  - **Version** comes from `_jlVersionFromHref()`, reading the href AS
    WRITTEN (`getAttribute`): `…_N.htm` is N, any other `.htm` is 1. This
    applies to named "others" pages too (`2009 TV Compilation DVD_3.htm`).
    The title is not used, because the site cuts long titles off ("… (Versi").
    Checked on 2026-10-06 against all 6,327 entries: no "(Version N)" title
    disagrees. The title keeps its "(Version N)", as before.
  - **DD … Month** come from the MusicBrainz `dateParts` extractor, run on
    Date through `features.columnExtractors`. This is the first foreign-site
    use of a `ColumnDataExtractor`. It works because the converter writes a
    plain `table.tbl` before the header scan resolves `sourceColumn` by
    name. YYYY duplicates Year on dated rows. Year is kept because it also
    carries the heading's year for an undated entry (e.g. "Santiago, Spain -
    AUGUST 2, 20092009-08-02 - DVD -" under 2009).
  - DD sorts as a number even without its `integerColumns` entry (the sort
    reads all-digit cells by content). The entry only aligns the column.
    Recorded as an `"expect": "pass"` mutation in
    `scripts/mutations/jl-support.json`.
- **Placement:** the table takes the first year heading's place. Every entry
  `<p>` and year-heading `<p>` is removed.
- **Live document only:**
  - an `<h2 class="mb-jl-list-heading">Bootlegs</h2>` is inserted before the
    table. `updateH2Count()` anchors to the last `<h2>` before it;
  - the jump menu and its "Choose the year"/`=====` paragraphs get
    `mb-jl-hidden`, so they are hidden but not removed. Their anchors are
    gone, and the Year column does their job.
- **Never silent:** with no entries and no `table.mb-jl-table`, it logs a
  `Lib.warn`, as the SL converter does.

The whole page (6,326 rows) is above `sa_render_threshold`'s default of 5000,
so the render-decision dialog appears. That is expected, just as on SL's
5,365-row entry page.

## Styling

- **`_ensureForeignTableStyle()`** holds the minimal `table.tbl` look
  (borders, padding, header background, zebra), split out of
  `_ensureSlStyle()` on 2026-10-06 and keyed on
  `body:is(.mb-sa-host-sl, .mb-sa-host-jl)` inside `:where()`. A further
  host extends that `:is()` list rather than copying the block, as
  brucespringsteen.it did (`.mb-sa-host-bs`).
- **The sticky thead has a white backing of its own** (2026-10-14). A
  sorted column's header tint (`.mb-mscol-hdr-N`) is a 60 % alpha
  `background-color !important` that replaces the cell's own colour; on
  MusicBrainz MB's stylesheet paints an image on the thead behind it, here
  nothing did, and rows scrolling under the pinned header showed through
  (brucespringsteen.it, then springsteenlyrics.com). So
  `_ensureForeignTableStyle()` gives `table.tbl > thead` `#fff` — the one
  rule of that block deliberately NOT inside `:where()`: it must outrank the
  site's own CSS, and springsteenlyrics.com's Bootstrap 3.3.2 has
  `table { background-color: transparent }`, which also beats the
  zero-specificity table colour (a first fix that made the thead inherit
  the table's colour failed there for exactly that reason). Spec:
  `sorted-thead-opaque.spec.js` (that arm injects the Bootstrap rule).
- **The list table is a direct `<body>` child**, and Sticky Page Headers
  collected every `<body>` child as chrome: the table was capped like a bar
  and, hovered, raised over every stuck bar, so its rows painted over the
  stuck h1, status line and h2 (2026-10-14, `debug/jl.html`).
  `_sphCollectTargets()` now leaves `table.tbl` out of that pass; the table
  pass pins it whole only while it fits, never raised. Spec:
  `sticky-filter-bars.spec.js` "a data table that is a direct <body> child".
- **`_ensureJlStyle()`** adds only the injected headings, `.mb-jl-hidden`,
  and a guard against the site's `A:hover { font-weight: bold }`, which
  would reflow a table row under the pointer.

## The Art column — `_JL_FI` (2026-10-23)

org/foreign-images.org phase 2, mockups J1 (lazy Art column) and J3 (the
labels as types). `_JL_HEADERS` starts with `Art`; `_jlBuildRow()` adds the
cell, linking the entry's page (the anchor's absolute `href`).

- **The cell is the shared lazy cell** (`_fiLazyCell()`, `_fiCellApply()`,
  `_ensureFiStyle()`): `<a class="mb-fi-cell" data-mbtt-fn="fi-img"
  data-mb-fi="jl" href="<the row's page>">`, a dashed tile (`data-mb-fi-state=
  "cold"`) until that page is read, then the picture and the count
  (`data-mb-fi-n`), or the CSS words for none. Its clean text stays EMPTY: the
  tile, the count and the words are CSS, and the hidden `.mb-fi-sort-key`
  ("a-yes" < "b-unread" < "c-none") is in `_CLEAN_STRIP_SEL` and read by
  `_sortCellText()` — the one MusicBrainz-path change, a class in its one
  lookup. So a late paint owes no filter-cache duty, only the write to the
  SOURCE rows (`_fiPaint()` over `_fiCellIndex()`: live tables and
  `_msSourceRows()`; docs/claude/filter-and-cache-invariants.md).
- **The record is the detail preview's** (`_dpGet()`, `_DP_SITES['jungleland.it']`), now
  kept **half a year** (`ttlDays: 182`, `_dpTtlMs()`; vzell: "these sites barely
  change"). `_fiAfterRender()`, from both render tails (fresh render and disk
  load), reads the whole detail-page store once (`_dpIdbAll()`, no request to
  the site) and paints every row read before, within that lifetime and of this
  parser version. Nothing is asked at render; a hover asks for its row only,
  wanted while its card shows, after the rate slot.
- **The cell is the image card's, not the detail preview's**: a cold cell links
  the same page with no picture, so `_dpSiteForLink()` skips `a.mb-fi-cell`;
  the preview stays on the Title. Specs that point at a row's page by href use
  `a:not(.mb-fi-cell)[href…]`.
- **The click** is `_fiClick()` (window capture, installed by the page
  preparation through `_fiInstall()`): plain left click opens the viewer,
  Ctrl/⌘/Shift/middle keep the link.
- **Types from the file names** (`_jlFiType()`, no parser change: `_dpParseJl()`
  already keeps each scan's `_label`): `front` Front (★ primary), `back` Back,
  `cdN` Medium "CD N", `bookletN` Booklet "page N", anything else Other with
  the label as comment. The cell shows `data.cover` (the front) or the first
  scan; a page with no scans paints "no scans".
- **Setting** `sa_jl_tip_images` (default on): the card only.
- **Specs** `tests/fixtures/jl-image-card.spec.js` (render asks nothing; one
  request on hover, the typed pills; the cell's text matches nothing typed;
  a cell painted on a filtered clone survives the filter's removal; the sort;
  the reload sweep; 100 vs 200 days; card off, click and Ctrl-click; the
  detail preview leaves the cell alone). Mutations:
  `scripts/mutations/foreign-lazy-cells.json`.

## Tests

| Spec                                       | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/jl-list.spec.js`           | setting off: untouched (log line as proof); setting on: only the `<h1>` toolbar; inside the artwork.htm frameset: untouched (log line); one row per fixture entry, exact headers, no entry or year heading left, `<h2>` before the table, jump menu hidden not removed, the shared table CSS applied; title/date/year parsing incl. "(Version N)", the dated Köln row under "others", an undated leading-space entry, `_blank` links; the Date split into DD/MM/YYYY/Day/Month (empty when undated, consistent with Date on every row); Version from the link (a site-truncated title, a named "others" `_N` page, the `_N` count from the fixture's own links); DD sorts numerically; a Year column filter; Date sorts chronologically; zero MusicBrainz/CAA/EAA requests with CAA and Relationships back ON; Save → Load from Disk round trip (twice, the second without a warning); `_jlParseItem` and `_jlVersionFromHref` shapes |
| `tests/fixtures/sl-include-regex.spec.js`  | the `@include` line: list.htm in (http/https, www/bare, hash, query); artwork.htm, images.htm, item pages, the splash page and look-alike hosts out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tests/live/jl-list.spec.js` (`@extended`) | the whole real page: rows = its entry-link count, "Köln" decoded from windows-1252 and kept with its date                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The fixture is generated: `python3 scripts/build-jl-fixtures.py` keeps
sections 1966, 1975, 2026 and "others" (677 entries) of
`debug/jungleland.it.html`, and removes the `<script>` and the body
background. The BOM is replaced with `<meta charset="utf-8">`, and no doctype
is added. `tests/support/jlFixture.js` serves it behind a catch-all abort for
the host. `loadJlFramesetPage()` routes `artwork.htm` to the site's own
frameset markup and injects the userscript into the left frame. Mutation
list: `scripts/mutations/jl-support.json`.

## Titles

Since 2026-10-13 (`feature/bb-recent-changes-relations`) the Title column is
in MusicBrainz title style with typographic punctuation, the site's text as
the cell's tooltip — `sa_foreign_mb_titles`, `sa_foreign_typography`, both on
by default. The converter specs load with both OFF (the fixture loader's
`titles` option); `tests/fixtures/mb-title-case.spec.js` covers the ON side.
See docs/claude/foreign-title-case.md.
