# archive.org (the Internet Archive)

The sixth non-MusicBrainz host (2026-10-31, branch `feat/internet-archive`,
org/internet.archive.org). Mockup v1, with vzell's answers:
https://claude.ai/artifact/4aXkdPxudwhuzACj4Wg81C (`org/internet-archive-mockups.html`,
built from `org/internet-archive-mockups.src.html` and the probe's data).

Two parts that share nothing but the host:

| Part | What | Where |
|---|---|---|
| pageType `ia-search` | archive.org/search?query=… → one table of every item | `_iaSearch*()`, `_iaPrepareLivePage()`, `applyIaToTable()` |
| reader `iadetails` | any archive.org/details/… link → card on hover, window on Space | `_extIa*()` in `_EXT_READERS` |
| Art column card + viewer | a picture in the `ia-search` table → the item's pictures | `_IA_FI`, `_iaArtImages()` |
| Collection column | links to each collection, named by archive.org's own titles | `_iaCollTitles`, `_iaCollTitlesFor()` |

Switches: `sa_enable_internetarchive` (the site, default on; its gate exits
before anything visible on archive.org), `sa_ia_tip_images` (the Art
column's card, default on) and `sa_ia_play_in_place` (the window's player,
default on). The reader itself runs under the link
previews' own switches (`sa_pop_ext`, …), on every host.

## The search page has no rows (why everything comes from the API)

`debug/ia-1975-tile-view-initial-.html` and
`debug/ia-1975-compact-list-view-initial.html` are byte-identical, 10.5 KB:
`<body>` holds only `<app-root>`, a Lit web-component app that draws the
results, and the Tile / List / Compact list views, into shadow DOM after
load. So the user's idea "scrape the Compact list view" has nothing to
scrape. The rows come from `advancedsearch.php`, the documented Solr search
API, anonymous and without a token (`scripts/probe-ia-search.py`, 2026-10-31):

- 1975, subject "Bruce Springsteen": 73 items (69 audio, 4 movies); 2000:
  59 (4 texts, Backstreets magazines); 2016: 1,064.
- `sort[]=date asc` works. `date`, `title` and `creator` may be ARRAYS
  (`["1975-08-15T00:00:00Z", "1974-01-01T00:00:00Z"]`): the API orders such
  an item by its earliest date, so the Date column shows the earliest
  (`_iaEarliestDate()`), or the column disagrees with the order.
- `num_favorites` equals the number of `fav-<user>` collections on every
  sampled row; Favorites reads `num_favorites`, Collection leaves `fav-*` out.
- The scrape API (`/services/search/v1/scrape`) also answers, with a cursor
  past 10,000 rows. Not used: a run stops at `_IA_SEARCH_MAX_PAGES` (100
  pages of 100), as Discogs' search does.

The page's query becomes one Solr query (`_iaSearchSolr()`): `(query) AND
<and[] …> AND NOT <not[] …>` — archive.org writes its filters in Lucene
already (`year:"1975"`). A full-text search (`sin=TXT`, `TV`, `RADIO`) gets
no button: advancedsearch.php does not index what it searches.

## ia-search

- Gate: `_isIaHost` is archive.org or www.archive.org only — never
  web.archive.org (the Wayback Machine). Its `@include` needs a non-empty
  `query`. Top window only.
- `_iaPrepareLivePage()`: `<section id="mb-ia-root">` FIRST in `<body>`,
  before `<app-root>`, so the site's redraws (inside its shadow DOM) never
  reach it. `_sphPageEl()` returns it on archive.org (as `#mb-dg-root` on
  discogs.com): the sticky headers must never pin the site's shell whole.
  `body.mb-sa-host-ia` joins `_ensureForeignTableStyle()`'s `:is()` list.
- `features.iaToTable` → `applyIaToTable()`: an empty `table.tbl.mb-ia-table`
  under `h2.mb-ia-list-heading`, on the press and on reload/disk load (the
  same two engine sites as `dgToTable`).
- `features.pageRequest` + `pageCountAsync`: page 1 asked once by the count
  and kept in `_iaTexts` for the loop (Discogs' `_dgTexts` pattern),
  `_iaFetchText()` through `_extGet()` (archive.org's own 1 s spacing; Stop
  honoured). Columns `_IA_HEADERS`; Views, Favorites, Reviews, Size are
  `integerColumns` (numeric sort strips non-digits: Size is whole MB,
  Reviews is the count plus ★ without digits).
- Collection (vzell, 2026-11-02: "the cell values should have their
  hyperlinks intact as on the IP"): one link per collection
  (`/details/<id>`, a new tab), named by archive.org's own title, the one
  the item page shows ("Radio Nowhere", "Folksoundomy: A Library of
  Sound"). The search API returns identifiers only, so after each page ONE
  more advancedsearch request (`identifier:("a" OR "b" …)`,
  `fl[]=identifier,title`, the ids sorted, at most 100 a request:
  `_iaCollTitlesUrl()`) asks for the titles not yet seen in this page
  load (`_iaCollTitlesFor()`, kept in `_iaCollTitles`; an id the answer
  leaves out is kept as `''`, never asked again) — in practice pages 1–2
  only. A failed or stopped lookup never fails the page: the cell falls
  back to `_IA_COLLECTION_NAMES`, then the id. The column is
  `renderMultiRowCell` + `collapsableColumns`. On archive.org a collection
  link is an `iadetails` link too (a card, a window "Internet Archive ·
  Collection"). Probe `scripts/probe-ia-collection-titles.py`
  (Env: 2026-11-02T15:32:52+01:00 · vzell-lap · WSL2 Ubuntu 24.04.4 (Linux
  6.18.54.1) · n/a): the 1975 search's 12 collections in one request of
  384 characters, 11 with a title; `community` has none (the id is shown).
- Titles open the item in a new tab (the navigation guard skips `_blank`);
  their card and window are the reader's. On archive.org itself
  `_extTarget()` takes a link to the same host only through
  `_extIaTest()` (as Discogs' `_extDgSiteTest()`), and `_DP_SITES['archive.org']`
  has `extRoot: '#mb-ia-root'`: the site's own links are in shadow DOM.

## The site's own result list, in shadow DOM (G4, 2026-11-03)

Before any button, archive.org's own results preview too (G4 of
NON-MB-COVERAGE.org; vzell chose to implement it). Three pieces, all gated
on `_isIaHost`, so no other host changes:

- **`_dpEventTarget(e)`**: the popup engine's listeners sit on the document,
  which sees an event inside `<app-root>` retargeted to `<app-root>`; the
  first element of `composedPath()` is the one under the pointer.
- **`mousemove`, not `mouseover`/`mouseout`, inside the shadow DOM**
  (`_dpInIaShadow()`, in `_initDetailPreview()`): a boundary event whose
  target and `relatedTarget` both retarget to the same shadow host never
  reaches the document, so moving from a result's link to the empty space
  beside it fired NO `mouseout` there (found by the G4 spec, which logged the
  events). `mousemove` always does; the engine follows the element under the
  pointer with it and runs the same over/out steps with the exact elements
  on both sides. The two boundary handlers leave shadow-DOM elements to it.
- **Scope** (`_iaShadowLinkInScope()`, `_IA_SHADOW_SKIP`): the `ext`
  source's selector on archive.org adds a bare `a[href]` (no root selector
  crosses a shadow root); `resolve` keeps a document link only in the table
  or `#mb-ia-root`, and a shadow-DOM link anywhere but under `nav`, `header`,
  `footer`, `<ia-topnav>` or `<ia-footer>`, walking up through each shadow
  host. Result links are relative (`/details/<id>`); `_extTarget()` reads
  them against the page on archive.org. **Only a shadow-DOM link with text
  of its own** (2026-11-04, vzell in the browser: our card came on top of
  archive.org's own hover card). The probe (`scripts/probe-ia-shadow-links.js`
  v1, three views): in the Tile view the whole tile is one link whose
  picture and title sit in further shadow roots (no own text); the List
  views have a text-less picture link and a separate title link per
  result. So the List views' titles get our card, and pictures and tiles
  keep archive.org's.

The fixture cannot hold shadow DOM (a saved page loses it), so
tests/fixtures/ia-search.spec.js builds it. The real page's link shapes —
whether a tile's link wraps its picture (then it is the image's, never a
card), which custom elements hold the list — come from
`scripts/probe-ia-shadow-links.js`, run in vzell's browser (paste it into
the console on a search page, once per view).

## An item page: `ia-details` (2026-11-03)

Plan, mockup and vzell's answers: org/foreign-detail-PTs.org (mockup
https://claude.ai/artifact/ECoqApKnedJqbTMSuBBN14, tab "archive.org item").
Modelled on MusicBrainz's release-tracks.

- **Match**: `_IA_DETAILS_PATH_RE`, `/details/<id>[/<file>]`, never
  `/details/@user`; its own `@include` line. `_iaPrepareLivePage()` names
  the section after the item (`_iaDetailsName()`: `h1.item-title`, else the
  document title).
- **The page is plain HTML** (both probed kinds:
  debug/ia-1975-02-05-setlist-songs.html, ia-amanson-1973-video.html): no
  `<app-root>`, the item's content is `main#maincontent`, which previews
  before any button (`_iaShadowLinkInScope()` adds it on an item page).
- **Rows**: ONE anonymous request, `/metadata/<id>` (`features.pageRequest`,
  `pageCountAsync: () => 1`, `_iaFetchText()`); `_iaDetailsToHtml()` writes
  `<h3>` + `table.tbl[data-mb-col-headers]` pairs (`groupByH3`, multi):
  - a show (original audio files, the best format it has,
    `_IA_DET_FORMAT_ORDER`): a sub-table per disc from "1-01." in the
    name, else one ("Tracks"); its h3 names the format and the running
    time. Columns: # · Title (the track's archive.org link: the item's card
    with the track marked) · Length · File · Size · one column per AUDIO
    derivative format (VBR MP3, Ogg Vorbis: the copy's size, linking it;
    spectrograms, PNG waveforms and peak files are not columns) · Play
    (`sa_ia_play_in_place`, archive.org's own player);
  - a video item: its video files (Play · Title · Format · Length · Size);
  - anything else, or the second button "All files" (`iaView: 'files'`):
    every file, one row (Name · Format · Source · Original · Size · Length ·
    MD5).
  Sizes are always in MB (`_iaSizeText()`), so a size column sorts by its
  numbers.
- **Pictures and facts above the tables** (`_iaDetailsAfterRender()`, in
  the three render tails, a no-op on any other pageType): the item record
  of `_extIaItem()` from the same answer (`_iaDetailsRec`), as
  release-tracks has its Cover art section and Sidebar cards there. A
  picture opens the artwork viewer: `_dpArtViewerClick()` on the strip
  (`data-mb-artv-ext`), every picture in order. Host-scoped, not a
  generalisation of the release-tracks code (CLAUDE.md: nothing may change
  for MusicBrainz).
- **Probe** `scripts/probe-ia-details.py` (2026-11-03, 18 items): every
  show's FLAC originals carry `track`, `title` and `length`; disc prefixes
  up to 3; one tape ("SideA.flac") without; video items 1–3 video
  originals; a text item neither. Every audio item's raw page HTML embeds
  the metadata JSON (`input.js-ia-metadata`), no video item's: the
  pageType asks the API, which covers both.
- **Not yet**: the pictures and facts are not saved with "Save to disk" (a
  disk load shows the tables only); a song's Brucebase page (the mockup's
  "Song (Brucebase)" column) needs matching a live title to a song, a later
  step.

## The Art column's card and viewer (`_IA_FI`)

vzell, 2026-11-01, after the first live check: "looks good, except image
hovering" — the Art picture was a bare `<img>`, while every other foreign
table's picture has the shared image card and viewer (docs/claude/discogs.md,
"The Image column's hover card"). Now it is `a.mb-ia-thumblink`
(`data-mbtt-fn="fi-img"`, `data-mb-fi="ia"`, href the item tile) and a
provider `_IA_FI` like Discogs' `_DG_FI`: the row's record is the TITLE
link's `iadetails` record (`_iaArtRowFor()` → `_extTarget()`), asked through
`_extLoad()` — one `/metadata/<id>` for that row, wanted only while its card
or viewer shows, the record the title's card and window then reuse.
`_fiInstall()` runs in `_iaPrepareLivePage()`; `_fgalProviderFor()` lists it
(🖼 gallery).

What the pictures are (`scripts/probe-ia-images.py`, 2026-11-01T00:17+01:00,
vzell-lap, 18 items of the 1975 search): an item's ORIGINAL image files are
the uploader's scans (Cover, Front, Back, Booklet …, Disc 1 …), each with a
`JPEG Thumb` derivative (`original` = the scan's name); the PNG files are
DERIVATIVES — a spectrogram per audio track — and `__ia_thumb.jpg` ("Item
Tile") is what `/services/img/<id>` answers. So `_extIaItem()` keeps
`pictures` (originals of `_EXT_IA_PICTURE_RE`, not the tile, a cover or front
first, at most 60, each with its thumb; `_EXT_IA_VERSION` 2) and
`_iaArtImages()` shows them, else a video's stills (`thumbs`, the first 12),
else the tile with a note. Types come from the file name
(`_iaPictureTypes()`: Front, Back, Booklet, Medium); archive.org records
none.

## The `iadetails` reader

- `test`: `archive.org/details/<id>[/<file>]` on any page (not `/details/@user`).
  `keyUrl`: the item, so a link to one file shares its show's request.
  `askHost` archive.org is in `_EXT_CONNECT_HOSTS` (the header has had
  `@connect archive.org` since the Cover Art Archive): a hover may ask it.
- `load()`: ONE anonymous `_extGet()` of `/metadata/<id>`, with large
  `maxBytes`/`maxDownload` (an item with thousands of files answers long).
  `200 {}` is "no such item" and `is_dark` "taken down": both a dead link,
  never an empty card. `_extIaItem()` keeps what the card and window use:
  the tracks are the ORIGINAL audio files carrying a title or track number
  (else the MP3 derivatives), one per name stem, in file order, numbered;
  a video's files and its first 12 thumbnails. Bump `_EXT_IA_VERSION` when
  that output changes.
- Card: `cardExtra` adds the first six songs, or a track link's track
  ("Tenth Avenue Freeze-Out · track 2 of 19 · 3:50"), or a video's length.
- Window (`swap`): generic facts and links on the left with the description
  (`.mb-ia-desc`, its own scroll box) and lineage; on the right the setlist
  as a List table (`ia-setlist`, which fills the window's height), the
  linked track's row `tr.mb-ia-mark`; a video: a "Play here" tile with the
  item's picture, the thumbnails, a Compact table of its files.
- Images (vzell, 2026-11-02: "the POH should also display ALL images …
  in a separate IMAGES section"): an item with pictures of its own
  (`it.pictures`) gets an "Images · N" gallery (`out.lead`, under the
  cover), Discogs' gallery's shape — `data-mb-artv-ext` links, so
  `_dpArtViewerClick()` steps through all of them. `rec.imageFull` is the
  first picture (a cover or front), so a click on the cover opens it at
  full size and the viewer (which counts one href once) holds exactly the
  N pictures, never the tile besides. `_EXT_IA_VERSION` 3 since then.
- `iadetails` is in `_DP_WIN_EXT_READERS`: an archive.org link inside any
  window opens there.

## Play in the window: one player, two sources

vzell's answer Q7. The YouTube player (`_yt*`, docs/claude/detail-pages.md,
"YouTube in place") plays archive.org too, rather than a second player
beside it: a playable `v` carries `src: 'ia'` (`{kind: 'audio'|'video', id,
file}`), and `_ytKey()`, `_ytWatchUrl()`, `_ytEmbedUrl()`
(`archive.org/embed/<id>[/<file>]?autoplay=1`), `_ytPlayerHtml()` (an audio
file's frame is a 40 px bar, `.mb-yt-frame-audio`), `_ytFromTile()`
(`data-mb-yt-src`, `data-mb-yt-file`) and the tile (`mini`: the ▶ alone for
a setlist row) branch on it. Each source has its own setting (`_ytOnFor()`)
and its own refused-frame state (`_ytBlockedFor()`, `_yt.blockedIa`,
`_ytOnPolicy()` matching `archive.org/embed/`). The setlist sits in a
`[data-mb-yt-slots]` box whose slot is above the table, so playing never
moves the rows, and `_ytAreaRepaint()` carries a playing track through the
window's repaints.

Probe `scripts/probe-ia-embed.py` (2026-10-31): `/embed/<id>` and
`/embed/<id>/<file>` answer 200 with no `X-Frame-Options` and no
`frame-ancestors`. MusicBrainz's own `frame-src` was NOT checkable from
vzell-lap (MetaBrainz resets IPv4 there): the refused-frame fallback covers
it either way. The audio bar's 40 px height is a guess to check in the
browser.

## Tests

| Spec | What |
|---|---|
| `tests/fixtures/ia-search.spec.js` | the section before `<app-root>`, the button, nothing before the press, page 1 once then its titles request, the request's q/sort/rows, columns, a known row's cells (Collection: `ul > li` links with archive.org's titles), dates ascending (two-date item), two pages (page 2's titles request asks none of page 1's), the titles request failing (503: ids or fixed names, no page error), a collection link's card and window, `sin=TXT`, the switch off, a title's card and window on archive.org; the Art column: card with the seven scans (cover first, from their thumbs, one request), the viewer at full size from memory, a video's stills, `sa_ia_tip_images` off |
| `tests/fixtures/ia-search.mobile.spec.js` | a tap loads the table; a tap on a title opens its window, the page stays |
| `tests/fixtures/popup-ext.spec.js` "archive.org items" | on a MusicBrainz event page: card (one request), window (19-song setlist, swap, Brucebase link), the window's Images (7 scans in the left column, cover first, the viewer on all 7 and never the tile, the cover = picture 1; none for a video), a track link (no second request, its row marked), Play here (song in the slot, one player, Esc; a video's tile), a missing item |
| `tests/fixtures/sl-include-regex.spec.js` | the `@include` line: searches with a query; not without one, not an item, not the Wayback Machine |

Fixtures from `scripts/build-ia-fixtures.py` (the live APIs, the same URLs
the script builds; metadata trimmed to the fields read; `--metadata-only`
rewrites the items alone, as on 2026-11-01 for the files' `original`;
`--titles-only` writes `ext-ia-colltitles-<year>-p<N>.json` from the search
pages already there, keyed by `_iaCollTitlesUrl()`'s URL, as on 2026-11-02 —
the 2016 pages are cut to 200 rows in the spec, so they are not refetched). The
spec serves archive.org's pictures with routes set AFTER
`loadUserscriptPage()`, whose own route aborts every archive.org image and,
being newer, would win (until 2026-11-01 the Art thumbnails of these specs
never loaded, unnoticed). Mutations
`scripts/mutations/internet-archive.json` (24 caught, 1 recorded `pass`:
Favorites from the `fav-` count, which equals `num_favorites` in the data).
Fixture specs force `sa_ia_play_in_place` off (`FIXTURE_SETTINGS_OVERRIDE`),
like YouTube's.

## Known differences from the mockup

- Collections are named by archive.org's own titles, read from the search
  API (since 9.99.1523, 2026-11-02); the mockup's "ROIO" is archive.org's
  "Recordings of Independent Origin". Until then the table showed ids
  besides a few fixed names, one of them wrong (`folksoundomy` is
  "Folksoundomy: A Library of Sound", not "Community Audio").
- The mockup's description had a "▾"; the window shows it in a scroll box of
  its own height instead (the mockup's own box scrolled too).
- The button's hover text names the count only after a run (the page holds
  no count of its own before the press).
- Our section sits ABOVE archive.org's own header (the shell gives no place
  inside it).
