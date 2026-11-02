# setlist.fm

The seventh non-MusicBrainz host (2026-11-02, branch `feat/setlistfm-venue`,
org/setlistfm.org "venue additions"). Mockup v1, with vzell's answers Q1–Q9:
https://claude.ai/artifact/71itNE6a2ekiAtQxcTi1hq (`org/setlistfm-venue-mockups.html`).

Two parts that share the host and a parser:

| Part | What | Where |
|---|---|---|
| pageTypes `sfm-venue`, `sfm-artist`, `sfm-search` | setlist.fm's list of a venue's or an artist's setlists, or its search for an artist's setlists (`/search?artist=…`, 2026-11-03) → one table of every setlist | `_sfm*()`, `applySfmToTable()`, `_sfmPrepareLivePage()` |
| reader `setlistfm` | any setlist.fm setlist, artist, venue (or our tour) link → card on hover, window on Space, through the API with the user's key; setlist.fm's own search for an artist (`search?artist=…`, every Tour cell's link) read from its page, key or not (2026-11-03) | `_extSfm*()` in `_EXT_READERS`; docs/claude/detail-pages.md "setlist.fm through its API" and "Venue additions" |

The reader's windows also read setlist.fm's pages (set times, a venue's
facts); the parser of a list card's set times, `_extSfmPreviewTimes()`, is
shared with the pageTypes.

Switch: `sa_enable_setlistfm` (the site, default on, per CLAUDE.md's rule for
a new site; its gate exits before anything visible on setlist.fm, and only
the top window runs). The reader runs under the link previews' own switches
on every host, and only with `sa_pop_ext_setlistfm_key` set.

## Reading setlist.fm's pages

- **The pages answer the script.** `scripts/probe-setlistfm-session.user.js`
  (vzell's browser, Windows, Chrome 152, Tampermonkey unknown,
  2026-11-02 19:32–20:01 CET): a `GM_xmlhttpRequest` from musicbrainz.org,
  anonymous or with cookies, and a same-origin `fetch()` on setlist.fm all
  got 200 and the full page (10 `.setlistPreview`, 7 with set times). The
  Python probe of 2026-10-29 had got a bot check (202, empty body); a browser
  does not.
- **Claude Code cannot fetch them.** A shell request with a browser's
  User-Agent is refused by auto mode as bot-check circumvention: every page
  shape comes from vzell's saved snapshots (`debug/setlistfm-*.html`).
- **The page family** (all snapshots, 2026-10-29 and 11-02): a venue's list
  (State Farm Arena, 93 pages; Los Angeles Sports Arena; a one-page venue
  without a pager), an artist's list (Bruce Springsteen, 301 pages), a tour
  search (`search?query=artist:(Journey) tour:(Final Frontier Tour)`, its
  pager `search?page=N&query=…`), a setlist with and without set times.
  Ten setlists a page everywhere; the API pages by 20.

### A list card (`.setlistPreview`)

- `.dateBlock` `.month` / `.day` / `.year` ("Oct", "19", "2026").
- `h2 a`: the setlist, its id at the end (`…-3374e495.html`). Its text is
  "<artist> at <venue>", or names an event or festival instead ("Bruce
  Springsteen at Jersey 4 Jersey", "… at Power to the People Festival 2026").
- `.details > span`, one per label: "Artist:", "Tour:" (setlist.fm's own
  `search?artist=<id>&tour=<id>`), "Venue:" — which may be two `<strong>`s,
  a stage at a venue ("Pavilion Stage at Merriweather Post Pavilion,
  Columbia, MD, USA"), each linked. Read by label, never by position: a card
  without a tour has no Tour line.
- `.setlistPreviewSetTimes` in three shapes: "Doors: 6:00 PM", "Show: 8:00 PM
  – 11:05 PM", both. Missing when nobody entered times.
- `.setSummary li`: up to 12 songs, then a `<li>...</li>`.
- The Upcoming Shows box (`.upcomingSetlistsList`, page 1 of a venue or an
  artist) is `.setlistLink`, never `.setlistPreview`: it stays out by class.
- The venue's info box (`.venueInfo .info .form-group`): City, Address,
  "Opened" (open) or "Open" with a range (closed: Los Angeles Sports Arena),
  "Also known as" (several `<span>`s), "Info", Web (links), Actions;
  `.attendance`. The page's own newlines between `<span>`s are spaces: a
  `<br>` is turned into a private-use marker before whitespace is squeezed.

## sfm-venue / sfm-artist / sfm-search

- Gate: `_isSfmHost` is setlist.fm or www.setlist.fm. Its `@include` takes
  `/venue/<slug>-<id>.html` and `/setlists/<slug>-<id>.html` with any query
  (`?page=N`); a setlist, a search, statistics, the venue index stay out
  (`tests/fixtures/sl-include-regex.spec.js`). `_SFM_LIST_PATH_RE`,
  `_sfmKind()`. A search (`sfm-search`, vzell 2026-11-03,
  `debug/setlistfm-artist-serch.html`) is `/search` with a non-empty
  `artist=` and any of `tour`, `country`, `city`, `venue`, … (its own
  `@include` line); one without an artist is not (many artists' rows), nor
  our own `query=` tour links. It has no `<h1>`: its section is named by its
  filter form's selected options (`_sfmSearchChoices()`: "setlist.fm search:
  Bruce Springsteen · Land of Hope & Dreams American Tour"; the smallest of
  their counts is the number found). Its rows are an artist's (Venue).
- `_sfmPrepareLivePage()`: `<section id="mb-sfm-root">` FIRST in `<body>`,
  as on archive.org — never inside setlist.fm's `div.body`: the sticky
  headers pin every `<body>` child but `_sphPageEl()`, which returns this
  section on setlist.fm. Its `<h1 class="mb-sfm-h1">` holds the toolbar,
  named by the page's own `<h1>` ("State Farm Arena Atlanta Concert
  Setlists"). `body.mb-sa-host-sfm` joins `_ensureForeignTableStyle()`'s
  `:is()` list; `_ensureSfmStyle()`.
- `features.sfmToTable` → `applySfmToTable()`: an empty
  `table.tbl.mb-sfm-table` under `h2.mb-sfm-list-heading` "Setlists", on the
  press and on reload/disk load (the same two engine sites as `iaToTable`).
- `features.pageRequest`: page `p` is the page's own URL with `page=p` (page
  1 without, other parameters kept: `_sfmPageUrl()`), fetched same-origin
  (no `fetchText`: `fetchHtml()`), page 1 too — the engine never reuses the
  live document for a `pageRequest` pageType. `toHtml` is `_sfmListToHtml()`:
  every `.setlistPreview` → `_sfmCardRow()`; a page without one throws, so
  the run records a failed page (a bot check, a changed page), never "no rows".
- `features.pageCountAsync`: `_sfmPageCount()`, the highest `page=` of the
  live page's `ul.listPagingNavigator`, 1 without a pager — no request, and
  "⚠️ High Page Count" sees it before anything is fetched (State Farm Arena:
  93; Bruce Springsteen: 301).
- Columns (`_SFM_HEADERS`, vzell's Q1 and Q7): Date (ISO, linked to the
  setlist) · Artist (venue page) or Venue (artist page), linked · Event (only
  when the heading names one) · Tour (setlist.fm's own link) · Doors · Start
  · End (24-hour, `_extSfm24h()`) · Songs ("12+" when the card ends in
  "...", an `integerColumns` column) · Setlist (the card's songs, " · ",
  `collapsableColumns`). Every link is absolute and opens in a new tab.
- On setlist.fm a setlist.fm link of the table is previewed by the
  `setlistfm` reader while it has its key (`_extTarget()`'s same-host
  exception `_extSfmTest(u)`, as archive.org's and Discogs'); without a key
  it is this site's own link and not previewed. `_DP_SITES['www.setlist.fm']`
  (no detail pages of its own, `extRoot: '#mb-sfm-root'`) must exist:
  without it `_extSource()`'s selector threw on setlist.fm (found by the spec).

### The window would not scroll sideways (2026-11-03)

vzell: "The table is not scrollable to the right" (a 9-column table on
an artist's tour list and on a one-page venue). setlist.fm's stylesheet
(`//w1.cdn.setlistfm.com/css/setlist-5.9.163-…css`, read with a plain
request 2026-11-03 — a static file, not the bot-checked pages) has
`body{…;overflow-x:hidden}`. With `<html>` at `visible`, CSS hands the
body's overflow to the viewport: the window itself cannot scroll
sideways, and our section (`width: fit-content; min-width: 100%`) is cut
off. `_ensureSfmStyle()`: `body.mb-sa-host-sfm { overflow-x: visible
!important }`, only while our host class is on. The spec injects the
site's exact rule after ours in a 700 px window and scrolls to the right.

### Event: a stage's venue is no event (2026-11-03)

"Bruce Springsteen at National Arts Centre, Ottawa, ON, Canada" on a card
whose venue is "NAC Opera Hall at National Arts Centre, Ottawa, ON,
Canada" filled Event with the venue. The heading's place is no event when
it is the venue's whole text or one of its `<strong>` parts
(`_sfmCardData()`'s `venue.parts`).

## Tests

| Spec | Pins |
|---|---|
| `tests/fixtures/sfm-list.spec.js` | section first in `<body>`, named by the page; nothing before the press; both pages of a 2-page list fetched once each, page 1 too; a one-page venue; an artist; cells (links, event, a stage at a venue, set times, "12+"); Upcoming Shows out; previews on setlist.fm with and without a key; switched off |
| `tests/fixtures/sfm-list.mobile.spec.js` | a tap on the button renders the table |
| (2026-11-03) `sfm-list.spec.js` | the window scrolls past setlist.fm's `overflow-x: hidden`; a stage's venue is no event; a search page (named by its choices, its query kept); a Tour cell previewed without a key |
| `tests/fixtures/sl-include-regex.spec.js` | the `@include` line |
| `tests/fixtures/popup-ext.spec.js` | the reader (Part A/B) |

Fixtures: `scripts/build-setlistfm-fixtures.py` — `sfm-page-*.html` (the
live pages in setlist.fm's skeleton; State Farm Arena's pager cut from 93
pages to 2, said in each file's banner) and `sfm-site-*.html` (what the
reader's windows read). Mutations: `scripts/mutations/setlistfm-list.json`
(Part C), `scripts/mutations/setlistfm-venue.json` (the reader).

## Known differences from the mockup

- The toolbar section is above setlist.fm's own header (first in `<body>`,
  for the sticky headers), not inside its page panel as view 4 drew it.
- Songs and Setlist are what the card shows (at most 12); the Setlist cell
  is collapsable.
- Event is filled only for a heading that is not "<artist> at <venue>".
