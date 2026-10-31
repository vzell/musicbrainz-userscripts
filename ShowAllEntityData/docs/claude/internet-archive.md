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

Switches: `sa_enable_internetarchive` (the site, default on; its gate exits
before anything visible on archive.org) and `sa_ia_play_in_place` (the
window's player, default on). The reader itself runs under the link
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
- Titles open the item in a new tab (the navigation guard skips `_blank`);
  their card and window are the reader's. On archive.org itself
  `_extTarget()` takes a link to the same host only through
  `_extIaTest()` (as Discogs' `_extDgSiteTest()`), and `_DP_SITES['archive.org']`
  has `extRoot: '#mb-ia-root'`: the site's own links are in shadow DOM.

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
| `tests/fixtures/ia-search.spec.js` | the section before `<app-root>`, the button, nothing before the press, page 1 once, the request's q/sort/rows, columns, a known row's cells, dates ascending (two-date item), two pages, `sin=TXT`, the switch off, a title's card and window on archive.org |
| `tests/fixtures/ia-search.mobile.spec.js` | a tap loads the table; a tap on a title opens its window, the page stays |
| `tests/fixtures/popup-ext.spec.js` "archive.org items" | on a MusicBrainz event page: card (one request), window (19-song setlist, swap, Brucebase link), a track link (no second request, its row marked), Play here (song in the slot, one player, Esc; a video's tile), a missing item |
| `tests/fixtures/sl-include-regex.spec.js` | the `@include` line: searches with a query; not without one, not an item, not the Wayback Machine |

Fixtures from `scripts/build-ia-fixtures.py` (the live APIs, the same URLs
the script builds; metadata trimmed to the fields read). Mutations
`scripts/mutations/internet-archive.json` (12 caught, 1 recorded `pass`:
Favorites from the `fav-` count, which equals `num_favorites` in the data).
Fixture specs force `sa_ia_play_in_place` off (`FIXTURE_SETTINGS_OVERRIDE`),
like YouTube's.

## Known differences from the mockup

- Collections are shown by archive.org's own name only where it has one
  (Community Audio, Community Video, Live Music Archive, …); the others by
  their identifier (`radionowhere`, `roiocollection`). The mockup's
  "Radio Nowhere" and "ROIO" were invented labels.
- The mockup's description had a "▾"; the window shows it in a scroll box of
  its own height instead (the mockup's own box scrolled too).
- The button's hover text names the count only after a run (the page holds
  no count of its own before the press).
- Our section sits ABOVE archive.org's own header (the shell gives no place
  inside it).
