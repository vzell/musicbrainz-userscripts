<!-- The fifth non-MusicBrainz site (2026-10-18). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# discogs.com

**Mockup (approved by vzell 2026-10-18, version 2):**
https://claude.ai/artifact/KTtCM7SaYVHZDaQdNqjUAK — placement A, the label
buttons, the five release sub-tables, an Image column, artist sections by
Discogs' role, link previews on discogs.com (main content only).

## What it is

Four pageTypes on discogs.com's own pages, opt-in via `sa_enable_discogs`
(default off; the gate exits before anything visible, as for every foreign
site), `host: 'www.discogs.com'`, one `@include` line:

| pageType     | Page                     | Button(s)                                                         | Table                                                                                                                       |
|--------------|--------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `dg-master`  | `/master/<id>`           | Show all versions                                                 | single: Image, Title (★ main release), Format, Label, Cat#, Country, Year                                                   |
| `dg-release` | `/release/<id>`          | Show tracklist, credits and other versions                        | multi: Tracklist, Credits, Companies, etc., Barcode and Other Identifiers, Other versions (the release itself left out)     |
| `dg-artist`  | `/artist/<id>`           | Show the whole discography                                        | multi: one sub-table per Discogs role run (Releases, Credits: Producer, …, Appearances, Track appearances, Unofficial)       |
| `dg-label`   | `/label/<id>`            | Newest: 500 · 1,000 · 5,000 — Oldest: 500 · 1,000 — Then: All     | single: Image, Artist, Title, Format, Cat#, Year                                                                            |

A language prefix (`/de/release/…`) and a slug are allowed; a page's
sub-pages (`/release/<id>-…/image/…`) are not (`sl-include-regex.spec.js`).

## The rows come from Discogs' API, through the link previews' readers

**Never from the page.** Discogs' pages are a React app (`#app`) with
generated class names (`releases_mxLkA`, `labelReleasesTable_b3YFz`) that
shows one slice of each list: the artist page one tab (392 rows of
Springsteen's 6,782), the label page 500 of Columbia's 396,611, the master
41 of Born To Run's 387 versions. The API answers every row with stable
fields, and the link previews already parse them (docs/claude/detail-pages.md,
"The Discogs artist and label windows"): `_EXT_DG_LISTS.versions/artist/label`
(URL and row shape) and, for a release, `_extDiscogsTracklist()`,
`_extDiscogsCredit()`. One source of truth for previews and pageTypes.

**Engine: one extension of `features.pageRequest`** (Brucebase's Recent
changes is the other user), both parts optional and unset everywhere else:

- `pageRequest(p, def)` may return `fetchText()`: the loop calls it instead
  of `fetchHtml()` (a same-origin `fetch()`). `_dgFetchText()` goes through
  `_extGet()` — GM_xmlhttpRequest (`@connect api.discogs.com`), the host's
  gate (`_extSpacingMs()`: 2.5 s apart without a token, 1 s with one), the
  User-Agent and token (`_extDiscogsHeaders()`); any answer but 200 throws an
  error with `status`, so the loop records a failed page as for any HTTP
  error.
- `features.pageCountAsync(def)`: asked in the page-count step, BEFORE the
  gates, so "⚠️ High Page Count" sees the real number (Springsteen 68 > 50).
  `_dgPageCount()` reads `pagination.pages` of page 1, capped by the
  button's `features.pageCap` (a label's "Newest 500" = 5), and keeps what
  it asked in `_dgTexts` for the loop (page 1 is asked once). A release asks
  for itself and its master's versions page 1 (1 + their pages; `_dgRun.masterId`);
  a master also for `masters/<id>` (its main release for the ★; a failure
  costs only the mark). These requests ignore Stop (`stoppable` false): the
  engine clears `stopRequested` only after its gates.

`toHtml()` is `_dgToHtml(p, text)`: one API page → `table.tbl`, the
multi-table pageTypes as `<h3>` + table pairs with `data-mb-col-headers`
(the loop's `groupByH3` branch gives each group its own columns). An
artist's page splits by role RUN (`_DG_ROLE_GROUPS`; any other role is
"Credits: <role>"), so the groups come in Discogs' order — Releases, then
the credits, then Appearances… — not the mockup's order (credits last).

**The High Page Count question says "This list has N pages"** on a foreign
host (it said "This MusicBrainz entity", also on the Springsteen sites).

**A second press reloads the page**, as on every pageType
(docs/claude/fetch-and-render-pipeline.md): "Newest 500" then "Oldest 500"
is a reload, then a press.

## The live page

`_dgPrepareLivePage()` (from the init header lookup, Discogs definitions
only) adds `<section id="mb-dg-root">` **between Discogs' header root
(`#__header_root_<n>`, its number varies per load) and `#app`**
(`app.before()`), outside the part React renders. Checked on the live site
2026-10-18 02:04 (headless Chromium): a node put there survived the page's
own scripts; a click on a release link from a master page is a full page
load, so the userscript runs afresh on each page. Its `<h1 class="mb-dg-h1">`
(the toolbar) is named after Discogs' own `#app h1` (the document title is
longer). Body class `mb-sa-host-dg`, `_ensureDgStyle()`; the table look is
the shared `_ensureForeignTableStyle()` (its `:is()` lists name the host).
At the press (and on Load from Disk) `applyDgToTable()` adds the `<h2>` and
an empty `table.tbl` with the columns; the rows come from the fetched pages.

A toolbar button may now open a group of its own (`groupLabel`: "| Newest:"),
the same look as a pageType's `buttonGroupLabel`; its hover text says what it
costs (`_dgCost()`, `_dgCostPer()`).

## Links, credits and thumbnails (vzell's browser round, 2026-10-18)

- **Names without ids link Discogs' search.** The lists carry an artist and
  a label as text only (`artist`, `label`), so `_dgSearchCell()` links
  `/search/?q=<name>&type=artist|label`, as a version's label already did in
  the preview window: the artist list's Artist and Label, a label's Artist,
  every version's Label. An artist cell is ONE link however many names it
  holds (vzell: splitting on " & ", ", " … breaks group names such as "Bruce
  Springsteen & The E-Street Band"); a label cell is split on ", "
  ("Columbia, Sony Music"). Discogs' `*` is left out of the query.
- **A track's credits are a list**: `<ul><li>Role – <a>Name</a></li>`, the
  name linked to `/artist/<id>` (the release record has the ids), and
  `collapsableColumns: ['Credits']` on `dg-release` collapses it like
  MusicBrainz's Instruments column (vzell).
- **A thumbnail opens the artwork viewer** (`_dgThumbClick()`, delegated on
  the document, capture: renders clone the rows), on the thumbnails of the
  table's shown rows, captioned with their titles (`_DG_ART_CTX`). The lists
  give the 150 px thumbnail only and its URL is signed (no other size can be
  made from it); a full-size image would be one request per release.

## Layout on a page wider than the window

**Our section is MusicBrainz's `#page` for the sticky page headers.**
`_sphCollectTargets()` pins every `<body>` child as "chrome" except `#page`,
and walks `#page` for the h1, h2/h3 and content bodies. Discogs has a `#page`
of its own inside `#app`, so our `#mb-dg-root` — a `<body>` child — was pinned
and capped WHOLE with its tables, and Discogs' header (also chrome) shrank to
the left (vzell's screenshots, artist page: columns cut off when scrolled
right, rows showing past the stuck h2/h3 bars). `_sphPageEl()` answers
`#mb-dg-root` on discogs.com; nothing changes on MusicBrainz or the
Springsteen sites. Reproduced and checked on the saved artist page served
at a live URL with Discogs' own CSS (the probe-style scratch run, a 2000 px
window: header 840 px wide before, the window's width after).

**The section sits at the window's left edge and is as wide as its widest
table** (`width: fit-content; min-width: 100%`; vzell: "the first column of
a table at the left side of the browser window"), so the h2/h3 bars span the
table and no row shows past a stuck bar.

**Not on Cloudflare's check.** An automated browser got Cloudflare's "Just
a moment…" page at a Discogs URL, and the script put its section there: the
gate now leaves a page without `#app` alone (`tests/fixtures/dg-challenge.html`).

## Link previews on discogs.com

`_DP_SITES['www.discogs.com']`: no detail pages of its own (`setting: null`,
that source never switches on), `extRoot: '#app'` — Discogs' content, not its
header or footer (vzell). `_extTarget()` takes a link to the page's own host
on discogs.com when the Discogs reader does (`_extDiscogsTest()`), so a title
in our table or a Discogs link in the content gets the same card and window
as on MusicBrainz (Ctrl + hover unless `sa_dp_hover_without_ctrl`; a tap opens
the window). The MusicBrainz parts of the window stay off on a foreign host.

## Known differences from the mockup (raised with vzell)

- Sub-tables start collapsed ("Show all sub-sections"), as on every
  multi-table pageType; the mockup showed them open.
- The Image column is as wide as its header's controls (sort, 📊, the
  column filter), not the mockup's 48 px.
- The viewer shows the lists' 150 px thumbnails, not full-size images.
- The label's "All" button cannot show the total before a request.

## Tests

| Spec                                          | Pins                                                                                                                                                                                                                                                                                                                                                                  |
|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/discogs-pages.spec.js`        | gate off: nothing; the section between the header root and `#app`, no request before the press; master: `masters/<id>` then versions p1-4 in order, 387 rows, one ★, thumbnails; release: the five sub-tables 8/18/12/12/386 and the release not among its versions; artist (Max Weinberg, 6 pages): the role groups in order with their counts, the toolbar named from `#app h1`; Springsteen's 68 pages meet High Page Count ("This list"), Cancel asks nothing more; label: the three button groups, Newest 500 = desc p1-5 and 500 rows, Oldest 500 = asc p1-5; previews: a table link and a content link get the card, the header and footer do not |
| `tests/fixtures/discogs-pages.mobile.spec.js` | a tap loads the master's versions; a tap on a version opens its window, the page stays                                                                                                                                                                                                                                                                               |
| `tests/fixtures/sl-include-regex.spec.js`     | the `@include` line: the four page kinds (slug, language prefix, query, no www), not the image pages, search, sell, user pages or the API host                                                                                                                                                                                                                         |

Since vzell's browser round `discogs-pages.spec.js` also pins: the search
links (an artist cell one link, a label cell one per label), a track's
credits as a collapsible linked list, the viewer from a thumbnail (position,
← →, Esc, the page stays), a page wider than the window (`html.mb-sph-on`:
`#mb-dg-root` never pinned whole, its h1 pinned, at x 0, as wide as its
widest table) and Cloudflare's check page left alone.

Fixtures: `python3 scripts/build-discogs-fixtures.py` turns
`debug/discogs-*.html` into `tests/fixtures/dg-*.html` (title, the three
roots, Discogs' `<h1>`, five Discogs links, a header and a footer link);
the API answers are `scripts/capture-ext-fixtures.py`'s `ext-discogs-*.json`
(Columbia oldest-first pages 2-5 added 2026-10-18). Mutations:
`scripts/mutations/discogs-pages.json`.
