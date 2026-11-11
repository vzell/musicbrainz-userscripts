<!-- The fifth non-MusicBrainz site (2026-10-18). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# discogs.com

**Mockup (approved by vzell 2026-10-18, version 2):**
https://claude.ai/artifact/KTtCM7SaYVHZDaQdNqjUAK — placement A, the label
buttons, the five release sub-tables, an Image column, artist sections by
Discogs' role, link previews on discogs.com (main content only).

**Mockup (submissions, edit history, full-size images; vzell's answers
2026-10-18):** https://claude.ai/artifact/Y69bUJTvYSksKTFRMcYJvZ — tab A the
viewer, tab B the Submissions page, tab C the history card and window. His
answers: the browser view too; Artist and Title split; other `mode=` pages
not yet; a title on the list opens "History, then the release"; the history
reader on discogs.com AND on MusicBrainz; a master row shows the master's
own images.

**Mockup 2 (links that stay, every link in the window, View changes, user
pages; vzell's answers 2026-10-18):** https://claude.ai/artifact/XRTM8v1aLNj3voVt6RxVJz
— his answers: support.discogs.com articles open in the window; searches via
the API (25 at a time, "Load 25 more"); a plain click on ANY link of our
tables opens the window; user links get a profile reader with the Recent
activity; `dg-user` with all four lists, a button hidden when its list is
empty or private; the Recent activity read from MusicBrainz too.

**Mockup 3 (the windows' sides swapped, Ctrl-click facets, a sublabels
table, MusicBrainz links in the window; vzell's answers 2026-10-26):**
https://claude.ai/artifact/H4b3yAWX6UvHr2ASRFAjuS — his answers: columns
0.7 : 1.3; 25 sublabels a page; a click on a facet chip keeps only its
value, Ctrl-click adds or takes one out, OR inside a facet and AND across.
The details: docs/claude/detail-pages.md, "The Discogs window's sides
swapped". Discogs' own artist hover card on the page: see "Discogs' own
artist hover card" below.

**Shared window tables (2026-10-27, org/MB-POH-sync-withDiscogs.org Phase
2):** a label window's sublabels and releases are now the shared Compact and
List tables (`_dpCompactTableHtml()`, `_dpListTableHtml()`), the same ones
the MusicBrainz windows use; their filter, chips, sort, page and row limit
live in `_dpTblUi(t, 'dg-sub' | 'dg-label')`, not in `_extDgUiOf()`. The
details: docs/claude/detail-pages.md, "Shared window tables and the
MusicBrainz paged loader".

## What it is

Ten pageTypes on discogs.com's own pages, opt-in via `sa_enable_discogs`
(the gate exits before anything visible, as for every foreign site),
`host: 'www.discogs.com'`, six `@include` lines (counted 2026-10-27, Phase 4;
the sentence said "seven" and "three" from 2026-10-18 until then, though
`dg-history` and `dg-ratings` had joined):

| pageType     | Page                     | Button(s)                                                         | Table                                                                                                                       |
|--------------|--------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `dg-master`  | `/master/<id>`           | Tracks (`dgView: 'tracks'`) · Versions (`dgView: 'versions'`)     | multi since 2026-11-04. Tracks: a sub-table per medium + Videos, the head above (see "A master's Tracks view"); Versions: one "Versions" sub-table: Image, Title (★ main release), Format, Label, Cat#, Country, Year |
| `dg-release` | `/release/<id>`          | Tracks (`dgView: 'tracks'`) · Credits, versions (`dgView: 'more'`) | Tracks: multi, a sub-table per medium + Release credits, the head above (see "A release's Tracks view"); Credits, versions: Credits, Companies, etc., Barcode and Other Identifiers, Videos (when it has any), Other versions (the release itself left out) |
| `dg-artist`  | `/artist/<id>`           | Show the whole discography                                        | multi: one sub-table per Discogs role run (Releases, Credits: Producer, …, Appearances, Track appearances, Unofficial)       |
| `dg-label`   | `/label/<id>`            | Newest: 500 · 1,000 · 5,000 — Oldest: 500 · 1,000 — Then: All     | single: Image, Artist, Title, Format, Cat#, Year                                                                            |
| `dg-submissions` | `/submissions?…`     | Show all submissions                                              | single: Artist, Title, Changed by, Changed, Matched artist, History (rows from the FLAT view's pages, not the API)            |
| `dg-user`    | `/user/<name>`           | Submissions · Contributions · Collection · Wantlist (shown when the page counts them) | multi: Releases / Artists / Labels (submissions), or one table; + Status, or Added (collection, wantlist) |
| `dg-user-list` | `/user/<name>/collection`, `/user/<name>/wantlist`, `/wantlist?user=<name>`, `/mywantlist`; since 2026-11-10 `/user/<name>/submissions`, `/contributions?user=<name>` | Collection or Wantlist: the page's own list, hidden when the page says it is empty | as `dg-user`'s button for it (2026-10-29: `_dgUserFeatures()`; the user from the path, the query, or on `/mywantlist` the page's config, `_dgLoggedInUser()` — elsewhere that config names the READER) |
| `dg-history` | `/<kind>/<id>/history`   | Show the changes and the diff                                     | multi: Changes, and on page 1 the Diff (below)                                                                              |
| `dg-ratings` | `/users/ratings/<name>`  | Show all ratings                                                  | single: the user's ratings, 250 a page (below)                                                                              |
| `dg-images` / `dg-image-history` | `/release/<id>/images`, `…/images/update` | Show every image                  | single: #, Image, Type, Uploaded by, Uploaded (date, time), W × H, Size (KB) — the same on both (below)                     |
| `dg-entity-images` | `/master|artist|label/<id>/images` | Show every image | single: #, Image, Type, W × H (2026-10-29): the API's `<kind>s/<id>` images, one request; the page lists only the images, and these kinds have no image editor's data |
| `dg-search` | `/search?q=…`, since 2026-11-10 also a search by the page's filters (`?style_exact=…`, below) | Show all results (count from the page; the first 10,000) | single: Image, Type, Title, Format, Label, Year (2026-10-29): the API's `database/search` (the search reader's query, `_extDgSearchSub()`), 100 a page; the API serves 100 pages at most (`_DG_SEARCH_MAX`). The page is NEXT.JS: no `#app`, no `#page_content`; the gate lets `/search` in by path and `<main>`; our section goes first in `<body>` — the one placement not checked against a live hydration |
| `dg-seller` | `/seller/<name>/profile` | Show everything for sale (hidden on an empty shop) | single (2026-11-10): Image, Artist, Title, Format, Label, Cat#, Media, Sleeve, Comments, Rated, Have, Want, Ships from, Price, Shipping, About, Item — `table.mpitems` of the shop's own pages, same-origin, 250 a page, its filters and sort kept (below) |
| `dg-listing` | `/shop/item/<id>` (a `/sell/item/<id>` link lands there) | Show all tracks | multi (2026-11-10): the listed release's Tracks view (dg-release's), a "For sale" card first in the head; the listing, then its release from the API (below) |
| `dg-sell` | `/sell/release/<id>` | Show every listing (its count from the pager) | single: Item, Media, Sleeve, Comments, Seller, Rating, Ratings, Ships from, Price, Shipping, About (2026-10-29): `table.mpitems` of the page's own pages, same-origin, 250 a page, its sort kept; the API has no listings list. About is Discogs' conversion into the reader's currency, the comparable column |

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

**Discogs' own section headings (2026-10-24, org/TODO.org "some more BB and
MB fixes/enhancements" 5c).** `makeH2sCollapsible()` walks every h2 of the
document, Discogs' too. A React section is `<section> > <header> > <h2>` +
spacer + Discogs' show/hide button, then `div.content_*`: the sibling walk
folded the button and spacer (the content was never a sibling), and
`stopPropagation()` kept the click from React, so a click did nothing
visible and Discogs' own button was gone. Now (`_dgSectionHeader()`) such a
heading folds what follows its header; an h2 in a table cell (the info
table's "Label:", "Format:") gets no toggle; Ctrl+click's peers are the h2s
of the same container, `#app` being one on discogs.com, so it never folds our
own headings. Collapsed at first, as every non-main h2. Not checked live:
whether a React re-render of a section (Discogs' own button) replaces the
content div our toggle hid.

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
- **A thumbnail opens the artwork viewer** (`_fiClick()`, the shared
  foreign-image click since 2026-10-23, provider `_DG_FI`; delegated on the
  window, capture: renders clone the rows), captioned with the row's
  title (`_DG_ART_CTX`). **Since 2026-10-18 at full size:** each shown row is
  a viewer group (`onGroupStep`: Shift+← →, and ← → past either end with
  `sa_art_viewer_cross_rows`); its images are the link previews' record of
  the row's release or master (`_extTarget()` on the Title link, then
  `_extLoad()` with its own `wanted`: memory, IndexedDB, or ONE request),
  asked by `_fiLoad()` only when the viewer SHOWS the row — never ahead.
  Until it arrives, the list's 150 px thumbnail (signed: no other size can
  be made from it) with `im.note` ("Loading the full size…"); a failure
  says why and offers "Try again" (`im.retry`); `_artViewerReplaceImages()`
  swaps the row's images in place. A row the previews already read costs
  nothing (the info panel's *Source* says which).

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

## Submissions (`dg-submissions`, 2026-10-18)

`/submissions?mode=list&id=…` (a language prefix allowed, `pt_BR` with an
underscore): what was changed recently in a list's releases. **Plain
server-rendered HTML, not React** — no `#app`, so the Cloudflare gate lets a
`/submissions` page through only with `#page_content` (the check has
neither; `dg-challenge.html` at a submissions URL is still left alone).

- **Rows from the FLAT view's pages, same-origin.** The API has no such
  list, and the browser view's list has no release ids (its links are
  `javascript:void(0)`), so every page is fetched as `view=flat`
  (`_dgSubsPageUrl()`) by `fetchHtml()` with the browser's session, and
  `_dgSubsToHtml()` turns `div.history > table` into `table.tbl`. The page
  count is read from the live page, no request (`_dgSubsSize()`: the flat
  view's "Jump to" `max`, else "… of 1,140" at 100 a page, both views).
  The engine never reuses the live document for a `pageRequest` pageType, so
  page 1 is fetched too.
- **Discogs' row has a fourth, unlabelled cell**: the list's artist the
  release matched → *Matched artist*. Discogs links it by NAME
  (`/artist/Bruce+Springsteen`), which no reader takes (no id): since round 2
  it is a search link, as the Artist column (vzell: "not hyperlinked"). "Artist - Title" is split at the first
  " - " (vzell); *Changed* is the history link's `title` (a timestamp),
  the "6 minutes ago" text its hover text.
- **Our section is the first `<body>` child**, above Discogs' header (a
  difference from the mockup, which showed it below). Without `#app`,
  Discogs' header and page share `#main_wrapper`, and the sticky headers pin
  every `<body>` child but `_sphPageEl()` whole — inside `#main_wrapper` our
  section would have pinned Discogs' whole page with it. The toolbar's name
  is the flat view's `.browser_flat_title > h1` (its document title is just
  "Discogs"), on the browser view the document title (its only `<h1>` is the
  selected release's history).
- **The browser view locks the window's scrolling; we unlock it** (vzell,
  2026-10-19: "the page is NOT scrollable downwards and to the right").
  Its `sections/subbrowser.css` has `body{overflow:hidden;height:100%;
  width:100%}`; `<html>` has no overflow of its own, so the body's reaches
  the viewport. Discogs' split pane (`table#browser`: the list in
  `aside#items`, the history in `#hpane_wrap`, both sized to the window by
  `submissions.js`) scrolls inside itself, but our section is in the
  page's flow above it and was cut at the window's edges, scrollbars and
  all. `_dgPrepareLivePage()` tags `<body>` `mb-dg-unlock-scroll` when
  `table#browser`/`#hpane_wrap` is there, and `_ensureDgStyle()` sets that
  body back to `overflow: visible; height: auto` (`!important`). The split
  pane keeps working below our section. The flat view, a user's page and
  the React pages never load that stylesheet and are not tagged. **A spec
  must scroll with the mouse wheel**: `overflow: hidden` still lets
  `window.scrollTo()` move the window, so a scripted scroll passes with the
  lock in place. The `item=/release/…/history` in the URL's hash is Discogs'
  own (its hashchange handler loads that history into the pane), not ours.
- **A release title's window opens with its edit history** (vzell: "History,
  then the release"): `_extDiscogsWindow()` puts `_extDgHistReleaseParts()`
  in the window's `top` part when `_dgOnSubmissions()`. It is the history
  reader's own load (`_extDgHistTarget()`, the same key as a history link),
  started by the window only; the card shows the last change once read.
  The edit-history reader itself is in docs/claude/detail-pages.md, "A
  Discogs release's edit history".

## A user's page (`dg-user`, 2026-10-18)

`/user/<name>`: an older page like the submissions list (no `#app`; the gate
admits it with `#page_content`; our section first in `<body>`; the toolbar
named from `#user_header h1`). Its lists come from Discogs' API without a
token (`scripts/probe-discogs-user.py`): `users/<name>/submissions` (an
object of `releases`, `artists`, `labels` — vzell's page 7 has a label),
`contributions`, `collection/folders/0/releases` and `wants`, 100 a request
(`_DG_USER_LISTS`, `_dgUserPageUrl()`, `_dgUserToHtml()`).

**One group per kind, across pages** (`features.groupMergeByName`, a new
engine option only `dg-user` sets): every API page holds its own releases,
artists and labels, and the fetch loop's `groupByH3` branch started a new
group whenever the heading changed from the last one (right for an artist's
discography, ordered by role) — vzell's 642 submissions came out as
"Releases, Labels, Releases, Artists, Releases, …". With the option a
heading seen before takes its rows back (that group moved last while rows
land in it), and the groups are sorted back to first-seen order before the
render (the fetch path only; a disk load has them merged already).

**Discogs' stylesheet vs. our filters.** The older pages load
st.discogs.com's `discogs.css`, whose `input[type=search]{box-sizing:
content-box}` is more specific than `.mb-col-filter-input`: each column filter
(width 100%, 78 px right padding for the Cc/Rx/Ex chips) ran ~86 px past its
column (vzell's `debug/stretch.html`, measured with that stylesheet served).
`_ensureDgStyle()` sets `body.mb-sa-host-dg input.mb-col-filter-input {
box-sizing: border-box }`; the spec adds Discogs' exact rule to the fixture.
The React pages do not load that stylesheet.

**A button only for a list the page counts** (`showIf`, `_dgUserCount()`:
the `<small>` of its link in `#user_header` or `#page_aside` — Pending is
the submissions, Contributed the contributions). vzell's page has no
collection or wantlist link at all, so those buttons are hidden. A user
with a public collection was not saved: `dg-user-collection.html` is a
SYNTHETIC copy of vzell's page made GuiBeal's with a "Collection 197" link;
check the real markup on such a page when one is at hand.

## A release's history page (`dg-history`, 2026-10-18)

**Since 2026-10-29 also a master's, artist's and label's**
(`/<kind>/<id>[-slug]/history`; vzell: the master's history had no
button). Four things had kept them out: the history `@include` line and
`_DG_HIST_PATH_RE` (also the `#app` gate) named releases only, and
`dg-master`/`dg-artist`/`dg-label` would have claimed the page first —
all four entity definitions now match through `_dgEntityPageIs()`, which
excludes the history and images pages. Their diffs differ: an artist's or
label's facts are bare `div.head` + `div.content` pairs in the cell (no
`.profile`, no section), read by `_extDgHistBlocks()`'s `:scope > .head`
arm — before, such a diff was empty, in the window too.

`/release/<id>[-slug]/history[?diff=<rev>]` (vzell: "natively support … as
PTs"; his answers: the changes AND the diff, "View changes" opens the
window, straight to code). An older page like the submissions list (gate:
`_DG_HIST_PATH_RE` with `#page_content`; our section first in `<body>`; the
toolbar named from `#editing_header > h1`). **`dg-release` must exclude it**:
`_EXT_DISCOGS_PATH_RE` takes `/history` too. The rows are the history
reader's own parse (`_extDgHistParse()`, so the pageType and the window
cannot disagree), one same-origin GET a page (`_dgHistToHtml()`): "Changes"
(Changed → `dateTimeParts`, User with picture, Action, Notes, Revision,
View) and, from page 1, "Diff · revision 8 → 10" (Section, Old, New,
Marked). Pages: `_extDgHistParse()`'s `pages` (`.pagination_links`), the
count the window uses too. Until 2026-10-29 this read a `nav.pagination`
"Jump to" box no history page has, so only page 1 — the OLDEST changes —
was ever read. A plain click on "View changes" opens the window;
the history reader reads `?diff=<rev>` from the link and opens on that
revision (`revFor`: once per opening).

## A release's images (`dg-images`, `dg-image-history`, Phase 4, 2026-10-27)

`/release/<id>[-slug]/images` and its image editor `…/images/update`
("Image history"; org/MB-POH-sync-withDiscogs.org Phase 4, mockup
https://claude.ai/artifact/TkNduhLjJmD2FrcURn5yaV part 4). Probe first
(`scripts/probe-dg-release-images.py`): the API's `images` carry type, URL
and the SERVED size only (at most 600 px), no uploader, date or file size;
both pages answer Python with Cloudflare's check; the editor needs the
login. **The editor's page holds no image**: the server sends an empty
`#image_uploader_app`, and Discogs' uploader script (`image-uploader-app.js`,
`scripts/probe-dg-image-uploader.py`) draws the list from ONE JSON request,
`/release/<id>/images/data` — per image `primary` ("true"/"false"),
`sortOrder`, `originalSrc` (600 px) and `thumbSrc` (300 px), the served
`width`/`height`, `original_width`/`original_height`, `size` in bytes,
`username`, `userUrl`, `timestamp` (ISO, UTC), `pending`, `disabled`
(vzell's copy: debug/discogs-release-images-data.json). The first build
parsed a SAVED editor page, whose list the browser had drawn, and found
nothing in vzell's browser (DEBUG-NOTES 2026-10-28). vzell's answers: the Images page gets the SAME table as the Image history;
from MusicBrainz, the editor is read with the user's Discogs session (the
popup engine's one non-anonymous request; docs/claude/detail-pages.md).

- Both are older pages (gate: `_DG_IMG_PATH_RE` with `#page_content`);
  **`dg-release` must exclude them** (`_EXT_DISCOGS_PATH_RE` takes
  `/images`); `_dgImgPathIs()` tells the two apart; one `@include` line.
- The rows are the images READER's load (`_extDgImgLoad()`, as `dg-history`
  uses its reader's parser): `fetchText()` (`_dgImgFetchText()`) returns its
  `dgImg` as JSON — the API (`/releases/<id>`, through `_extGet()`: the
  title), then the editor's data (`/images/data`, same-origin here,
  `_extDgImgDataGet()`, with `X-Requested-With` as Discogs' `$.get`) — and
  `_dgImgToHtml()` builds the table. Never the live page's own list. The
  Image cell's link is the 600 px `originalSrc` (the card's and the
  viewer's, `_DG_FI`), its `<img>` the 300 px `thumbSrc`. Size is "Size
  (KB)", an integer column (bytes / 1000: 1,167,852 is 1168), the date and
  time in the browser's time zone (the UTC time on hover), split by
  `dateTimeParts`, the uploader through `_dgUserCell()`.
- Signed out the data is Discogs' login page: the API's images, types and
  order remain, the editor's columns empty (logged with the reason).

**A release's image revision page (`dg-image-revisions`, 2026-11-10).**
`/release/<id>[-slug]/images/history?rev=N` ("Previous State of Images",
debug/d-image-revision-{5,6}.html) had NO script: no `@include` line took it
(the history test even listed it as not injected). It has its own line now,
`_DG_IMGREV_PATH_RE` (the gate with `#page_content`; `dg-release` excludes
it), and one button, "Show every image revision" (vzell: every revision):
`pageCountAsync` is `_dgImgRevPageCount()` — the release history, every page
(the window's `_extDgHistPagesRun()` and page cache), its image changes —
and page p is the p-th revision newest first (`_dgImgRevPageRequest()`): its
images and the revision before it (`_extDgImgRevRows()`, the `dgimgrev`
window's cache, so the next page asks nothing for it: one request a
revision), one `<h3>` + table each (`_dgImgRevToHtml()`, the page's own
heading "this page"), a Change column by image id, a removed image as its own
greyed row (`tr.mb-dgir-gone`). The page's own list is never read: Discogs'
script draws it. Previews on the page's links: `#page_content` is in
`_DP_SITES['www.discogs.com'].extRoot` already.

**The Image column's card (2026-11-10).** Until then a hover on these two
tables showed nothing: their thumbnails were `_DG_FI`'s (`data-mb-fi="dg"`),
whose row is the release or master of the row's Title link
(`_dgArtRowFor()`), and these tables have no Title column, so `hasRecord()`
was false. A row here IS one image, so it has its own provider, `_DGI_FI`
(`data-mb-fi="dgi"`, `single`): the record is the row itself (no request),
the card the picture big with its caption (type, uploader, date, W × H,
KB, from the cell's `data-mb-dgi-*`), a click the viewer, Shift+← → the
rows shown, in their order. A table saved to disk before carries `dg`:
`_fiProviderOf()` takes a `dg` link in a table with an Uploaded column and
no Title as `dgi`. Off with `sa_dg_tip_images` (the card only). The
Image history WINDOW's table (`_extDgImgCols()`, the images reader on
`/images/update`) had the same gap — its thumbnails were `_DGW_FI`'s, which
looks for the row's release — and on MusicBrainz no click handler at all
(`_fiInstall()` came only with `_extDiscogsWindow()`): its thumbnails are
`_DGWI_FI`'s now (`data-mb-fi="dgwi"`, `_extDgImgThumbHtml()`: the 600 px
image, the caption), and `_extDgImgWindow()` installs the click.

## A user's ratings (`dg-ratings`, 2026-10-19)

`/users/ratings/<name>` (language prefix allowed; snapshot
`debug/discogs-user-ratings.html`): the releases a user rated. An older page
like the submissions list (no `#app`, the gate admits it with
`#page_content`, our section first in `<body>`, the toolbar named from
`#user_header h1`). **Not in the API** — it has one release's rating by one
user, no list — so the rows come from these pages, fetched same-origin by
`fetchHtml()` with the browser's session, as the submissions list's are.

- **The pages asked** (`_dgRatingsPageUrl()`): the live URL with
  `limit=250` (the largest "Show" choice), `page=N` and `layout=med`. The
  layout matters: "Large Covers" (`layout=big`) is cards, not a table, and
  Discogs remembers a user's choice. The user's own `sort`/`sort_order` stay
  in the query, so the rows come in their order. The page count is the live
  page's `.pagination_total` ("1 – 2 of 2") at 250 a page, no request
  (`_dgRatingsSize()`); the live page's own `limit` does not matter.
- **The row** (`_dgRatingsToHtml()`, `table.release_list_table`): the
  thumbnail (`_dgThumbCell()`, so the viewer and the Image card work as
  elsewhere); `td.status [data-title]` → *Data quality* ("New Submission");
  one cell "Artist - Title (Label - Cat#)" of links, split by NODES around
  the release link — before it the artists (the text between artist links
  kept, the trailing " - " dropped), after it each label link followed by
  " - <cat#>" (`_dgRatingsLinksCell()`, `_dgCatnoCell()`: "none" is no
  number); `td[data-header=Format]`, `td[data-header=Year]`; and
  `span.rating[data-value]` → *Rating* (`integerColumns`). "Added" is a sort
  key on Discogs' page, never shown in its rows, so there is no such column.
- **A page without the table** (a sign-in page, a browser check) throws
  `status` 0: a FAILED page, logged with its reason, never zero rows.
- **Unseen so far:** the snapshot has 2 rows, one artist and one label each,
  and one page. Several artists or labels in a row and the multi-page pager
  are parsed by the rules above but not checked against real markup; the
  "of 300" fixture is SYNTHETIC.

## The Image column's hover card (2026-10-19)

vzell: "when hovering the Image column in Discogs PTs make all images shown
in a popup like what we do in the CAA/EAA column on MB PTs". Every
`_dgThumbCell()` link carries `data-mbtt-fn="fi-img"` and `data-mb-fi="dg"`,
so the shared tooltip engine (`_initStatTooltip()`, `#mb-stat-tooltip`)
resolves it through `_mbttResolve()` → `_fiCardHtml()` with the Discogs
provider `_DG_FI`: delegated, so it survives every re-render's clones with no
re-wiring. Since 2026-10-23 the card, the click and the load-on-show are the
shared foreign-image path (`_fiCardHtml()`, `_fiClick()`, `_fiLoad()`; the
springsteenlyrics Cover column is its second provider, docs/claude/springsteenlyrics.md);
`_DG_FI` holds what is Discogs': the row (`_dgArtRowFor()`), its record's
state (`_mbPop`), the request (`_extLoad()`), the images (`_dgArtImages()`)
and the card's primary/secondary view (`cardImages`). The old stamp
`data-mbtt-fn="dg-img"` (a table saved to disk before) still resolves as
Discogs'. One visible change came with it: a row with nothing but its
thumbnail and a note now shows the thumbnail beside the note.

- **The card is the B1 artwork card** (`_artCardCoreHtml()`): the row's
  title, the count, up to `sa_caa_tip_summary_tiles` tiles, the type tally.
  Discogs' `primary` image takes the ★ (as MusicBrainz's main front) and the
  tally reads primary / secondary; the facts line says "★ primary" / "no
  primary" for an external context (`ctx.external`), never "main front".
- **The record is the viewer's and the link preview's** (`_extLoad()` on
  `_dgArtRowFor()`'s target — the row's Title link read by the Discogs
  reader; `_fiClick()` builds its rows with the same helper): memory,
  IndexedDB, else ONE request for the hovered row, never a neighbour's.
  Until it is in, "Loading" with the list's thumbnail; `repaint` re-resolves
  the card while it still shows; `wanted` is `_fiCardShows()` (the card
  on screen, the pointer on the link), asked after the rate slot — a row the
  pointer only passed over costs nothing. A later click or Space costs
  nothing either.
- **Plain hover, no Ctrl** (vzell's choice): like the CAA column's card and
  the users' picture card. `api.discogs.com` is an `@connect` host, so no
  first-contact rule applies.
- **Off** with `sa_dg_tip_images` (default on); no card for a row without a
  release or master link (`_extTarget()` gives none).
- **A viewer spec must switch it off**: a Playwright click moves the pointer
  over the thumbnail first, so the card asks for the record before the
  click, and the viewer then truthfully says "the cache"
  (`discogs-submissions.spec.js`'s full-size test).
- Specs: `tests/fixtures/discogs-image-card.spec.js` (tiles, ★, tally, one
  request; second hover and click ask nothing; moved on before its slot →
  "no longer wanted, not asked"; setting off); mutations
  `scripts/mutations/discogs-image-card.json`.

## Users' pictures (2026-10-18)

vzell: "the user's own avatar". A history (page and window) carries every
user's picture (`.user_thumbnail_with_username img`; `_EXT_DGH_VERSION` 3).
A submissions list does not: `_dgUserCell()` writes an empty
`img.mb-dg-avatar[data-mb-dg-user]` and `_dgAvatarInit()` (set up by
`_dgPrepareLivePage()`) asks for it once the row is on screen
(IntersectionObserver), ONE request at a time through the user reader's
`_extLoad()` (the card's record, IndexedDB-kept), so a hover card never
waits behind a queue at the API's gate. A MutationObserver fills the copies
every render makes. Cost measured 2026-10-18T20:02+02:00 on petri (fixture,
1,200 rows, the engine's "Rendering"): 0.48/0.48/0.49 s with it,
0.48/0.47/0.47 s without — within noise. The picture is never inside the
name's link (`_extTarget()` leaves a link around an image to the image).

**In the 📊 list too** (vzell, 2026-10-19): the "Changed by" and "User"
entries show the user's picture after the name — what the cells hold, plus
`_dgAvatars` for a submissions list's pictures that came after the panel's
data was cached; the panel never asks for one. See
docs/claude/uniq-dropdown.md, "Discogs' columns".

**The picture at its largest** (vzell: "in highest resolution in our
internal viewer"; his answer: click opens the viewer, hover a card): Discogs
signs its image URLs, so no size can be made from a small one; the largest
is the profile's `avatar_url` (500 × 500), `_dgAvatarBig()`. A hover (300 ms)
shows `#mb-dg-avatar-card` (Liner notes, its own styles) with it; a click
opens the viewer (`_DG_AVATAR_CTX`) on the small picture with a note, then
the profile's (`_artViewerReplaceImages()`). `_dgAvatarUiInstall()`: once,
delegated, on discogs.com and wherever a history window shows a picture.

**Sub-tables with their own columns** (dg-history, dg-user): the fetch
loop re-resolves the extractors per sub-table only for a list of pageTypes;
without it the Changes table's date/time split ran on the Diff table's
first column ("Companies, etc." → "Companies," / "etc." under no header,
vzell's `debug/2columns-missing.html`), and the releases' on a user's
Artists/Labels tables. Both pageTypes are on that list now.

## The columns as MusicBrainz's (round 2, 2026-10-18)

vzell: "as we do with the Instruments column", "the same treatment as the
Catalog# column", "treat Year like Date", "split Changed in date/time with
our usual treatment". Every one is a sentinel or a name test, scoped to
discogs.com where a name test could reach MusicBrainz:

- **Credits** (dg-release Tracklist): `_dgRoleHtml()` writes each role in
  `.mb-credit-role` and each bracket word in `.mb-credit-attr` (the existing
  "Credit details - Attribute"); the new section "Credit details - Role"
  (`creditRole`, kind `dgrole`, docs/claude/uniq-dropdown.md). Discogs' anv
  is a NAME variation, not MusicBrainz's credited-as instrument name, so it
  is not `.mb-credit-altname`.
- **Cat#** (`_dgCatnoCell()`): one `<li><span class="catalog-number">` per
  number — Discogs joins several with ", " (86 of Born To Run's 387
  versions) —, `collapsableColumns: ['Cat#']`, and `isCatalogCol` takes
  "Cat#" on discogs.com ("Catalog info - Prefix/Presence").
- **Year**: `isDateExprCol` takes "Year" on discogs.com; a bare year is a
  partial date expression (Decade, Year).
- **Date and time** (`columnExtractors` with MusicBrainz's `dateTimeParts`):
  "Changed date/time" (dg-submissions), "Added date/time", "Last changed
  date/time" (dg-user). `_dateExprColumnNames()` already registers a split's
  date half; `isTimeCol` takes its time half on discogs.com ("Time info -
  Time of day"; on MusicBrainz still only "Time").

## Discogs' request limit, shared by every tab (2026-10-19)

vzell, with no token and 4+ Discogs tabs open: "HTTP 429 from Discogs" on
dg-release and the other API pageTypes (`debug/discogs-429.html`: the page
count's first request answered 429, retried once 1.5 s later, 429 again,
then page 1 the same). Setting the token cured it. Discogs counts per IP
(per token with one) over a moving minute (25 / 60 a minute), and every
tab spaced only its OWN requests, beside murdos' importer (one unauthenticated
request per release page load), users' pictures, previews and the like.

- **One slot for every tab** (`_EXT_SHARED_SLOT_HOSTS`, only
  `api.discogs.com`): `_extReserveSlot()` takes the later of this tab's
  slot and GM storage's `sa_ext_next_slot:api.discogs.com` (Tampermonkey
  shares GM values across tabs) and writes the next one back. A stored slot
  more than 2 minutes ahead is ignored (`_EXT_SHARED_SLOT_MAX_AHEAD_MS`: a
  wrong clock or an old pause never blocks every tab). Not a lock: two tabs
  reserving in the same few ms can take one slot — the pause below catches
  what slips through.
- **A spent budget pauses every tab** (`_extNoteBudget()`): a 429, or
  `X-Discogs-Ratelimit-Remaining: 0` before one, pushes the shared slot a
  minute ahead (`_extRateLimitPauseMs`; a longer `Retry-After` wins) — the
  window resets after a minute without requests, so EVERY tab has to hold
  off. The request is then asked again from the gate, up to
  `_EXT_SHARED_TRIES` (4) times in all; the old single retry 1.5 s later sat
  inside the same minute and could never succeed.
- **The wait ends on Stop**: `_extGet()` sleeps with
  `_sleepInterruptible()` on `!wanted()`, so a run's Stop (and a hover that
  moved on) does not sit out a minute. A run's status line says
  "Discogs' request limit is reached — waiting N s…" for a wait over 5 s
  (`_dgFetchText()`'s `onWait`).
- **Specs:** `tests/fixtures/discogs-rate-limit.spec.js` (three 429s then
  the list; four 429s fail as a 429; another tab's slot honoured and ours
  written back; a slot an hour ahead ignored; Remaining 0 pauses), with
  `__saTest.setExtRateLimitPauseMs()` at 4 s (longer than the 2.5 s
  spacing, so a pause shows apart from it); mutations
  `scripts/mutations/discogs-rate-limit.json`. Two real tabs are not
  tested: the GM stub caches a key per tab once read, so a second page
  would not see the first's later writes as Tampermonkey's would.

## Links in our tables never leave the page (2026-10-18)

A plain click on "Columbia" (a label search link) left the page through the
script's own "You are about to leave this page" question (vzell's
screenshot). Every link our tables write now opens a new tab
(`_DG_NEW_TAB`), and with the link previews on, the popup engine's click
handler opens the window for a plain click on a link in `#mb-dg-root
table.tbl` (`_dgTableClickOpens()`), as it always did for a tap. Discogs' own
page keeps its own behaviour. Ctrl/⌘-click: the new tab.

## Link previews on discogs.com

`_DP_SITES['www.discogs.com']`: no detail pages of its own (`setting: null`,
that source never switches on), `extRoot: '#app, #page_content, main'` — Discogs'
content, not its header or footer (vzell); `#page_content` is the older,
server-rendered pages' (submissions, history, ratings, user), added
2026-10-24 (org/TODO.org "some more BB and MB fixes/enhancements" 5a);
`main` is the search page's (Next.js, `dg-search`: neither of the other
two), added 2026-11-03 (G4 of NON-MB-COVERAGE.org); and
`_extSource()`'s selector appends `a[href]` to each root of the list. The
`dg-mb` source (murdos' importer icons) names `#page_content` too since
2026-11-03 (G5): an icon in the older layout had no card before a render.
**Discogs writes its own links relative** (`/release/…`): `_extTarget()`
reads a relative href against the page on discogs.com only (on MusicBrainz a
relative link is MusicBrainz's, refused by the same-host rule anyway). Until
then only our tables' (absolute) links previewed: the fixture builder
(`scripts/build-discogs-fixtures.py`) made the content links absolute and so
hid it; it keeps them relative now. A Brucebase link in the content (a show,
venue or person page: `_DP_SITES['brucebase.wikidot.com'].ownLinks`) is the
Springsteen reader's on discogs.com (`_extDpTest()`), Brucebase's own card;
elsewhere such a link stays generic. The engine runs from the initial page
(`_initDetailPreview()` right after `_dgPrepareLivePage()`), so none of this
waits for a render. `_extTarget()` takes a link to the page's own host
on discogs.com when a Discogs reader does (`_extDgSiteTest()`: a release,
master, artist, label or its history, and since round 2 a user or a search), so a title
in our table or a Discogs link in the content gets the same card and window
as on MusicBrainz (Ctrl + hover unless `sa_dp_hover_without_ctrl`; a tap opens
the window). The MusicBrainz parts of the window stay off on a foreign host.

## The MusicBrainz column (murdos' importer present, 2026-10-19)

**Mockup (approved by vzell 2026-10-19):**
https://claude.ai/artifact/6CmnUoNf4LHd44yxvp3rvu — the release's Credits,
Companies and Other versions, the 📊 entries, background lookups with the
job popup, cell anatomy. His answers: key on murdos' "Import Discogs releases
to MusicBrainz" (registered as `murdos-discogs-importer` in
`tests/fixtures/live-userscripts/manifest.json`; Anakunda's "Discogs API
links", named first, makes no icons at all); reimplement its lookup and use
its cache; look up automatically in the background; a cell covers the row's
OWN entity; the column only with the importer present.

**The Picard column rides on it** (vzell, 2026-10-19: master and release
pages had it, the ratings page not): a table whose MusicBrainz column looks
up releases gets the Picard column from the render on, an open one takes a
late answer per row, and Picard is sent the MusicBrainz release page. See
docs/claude/deferred-columns-picard-relationships.md, "On discogs.com the
column comes from the MusicBrainz column".

**Why our tables never get the importer's icons.** It decorates Discogs'
React page only (`#app`: `div[class^=info_]`, `#release-companies`,
`table[class^=releases_]` …); all 120 `span.mb_wrapper` of
`debug/discogs-release-withMB-icons.html` sit there. Its `$('h1')` reaches our
`h1.mb-dg-h1` (it gets `mlink_processed` and the page's icon) — nothing else
of ours.

- **Gate:** `_dgMbOn()` = discogs.com + `sa_dg_mb_column` (default on) +
  `_dgMbImporterPresent()`: its localStorage key
  (`/^DISCOGS_MBLINKS_CACHE-v\d/`) or its page marks (`[mlink_processed],
  span.mb_wrapper`), remembered once true.
- **Where:** `features.decorateDoc` — a new, optional engine hook run on each
  fetched `pageRequest` document before its rows are read (six dg-*
  definitions set it; dg-history does not). `_dgMbDecorateTable()` adds the
  header and `data-mb-col-headers` entry right after **Title** (else
  **Name**) and a cell per row from that column's Discogs link; a table
  headed Tracklist, or without Title/Name, is left alone. A single-table
  pageType's EMPTY live table gets the header too (`applyDgToTable()`), since
  the render fills its tbody.
- **What a row asks for** (`_dgMbSpec()`, the importer's mapping): release →
  release, master → release-group, artist → artist, label → label, and in
  "Companies, etc." place first, label not shown once a place is found (its
  `mlink_stop`). The resource is `https://www.discogs.com/<type>/<id>` (exact:
  the probe found slugged, `http:` and no-www forms all 404).
- **Sources, in order:** the importer's cache (`_dgMbReadImporterCache()`,
  READ ONLY, re-read at most every 30 s; its entries `"<dgType>/<id>/<mbType>":
  {timestamp, urls: ["url" | {url, ended}]}`, trusted while non-empty and
  under 90 days, its own rule), our own IndexedDB `vz-saed-dg-mblinks`
  (store `links`, keyPath `key`, same keys; a match 90 days, a "nothing found"
  7 days, which the importer never keeps; preloaded once a page by
  `_dgMbLoadOwn()`; listed in the browser cache overview on discogs.com only),
  then MusicBrainz (`_dgMbAsk()`).
- **Lookup:** `_dgMbRun()` after the first render and a disk load
  (`_dgMbAfterRender(true)`; re-renders only re-add the toggles), when
  `sa_dg_mb_auto_lookup` (default on), else on ▶ MB or a failed cell's ⚠.
  Up to 100 entities a request with EVERY type the batch misses in one `inc`
  (`artist-rels+label-rels+place-rels+release-rels` on a release page), via
  `_extGet()` (GM_xmlhttpRequest, anonymous) after the shared WS rate slot
  `_relAwaitRateSlot()` (1.1 s). A failure is not stored; the cells show ⚠.
- **Cell** (`_dgMbCellInner()`): `span.mb-dg-mb-row` (nowrap) of search boxes
  first (`.mb-dg-mb-search`, the importer's look; `data-state` pending →
  spinner, error → ⚠), then `a.mb-dg-mb-link` per entity (MusicBrainz's own
  entity SVG; `.mb-dg-mb-ended` grey), `.mb-dg-mb-n` from two links up, and a
  hidden `.mb-dg-mb-ids` ("release <mbid> …") as the column's filter and
  sort text. The boxes and the count are in `_CLEAN_STRIP_SEL`. The td carries
  `data-mb-dg-key/-types/-name/-state/-n`; own class names, never `mb_*`, so
  the importer's CSS and selectors leave our cells alone.
- **Late writes** (filter-and-cache-invariants.md): `_dgMbCellIndex()`
  indexes the live cells AND the source rows (`_msSourceRows()`), and
  `_dgMbRenderCell()` rewrites both in place and drops the row's
  `_rowTextCache`; `_dgMbScheduleRefresh()` (≤ every 1.5 s) drops the 📊
  caches of those tables and the filter cache, repaints ▶ MB and re-runs an
  active filter. The precedent is "Recording of" (`_recOfApply()`).
- **📊:** section `dgMbCount` "MusicBrainz - Links" (🧠, kind `dgmbcount`,
  `_findCellDgMbCount()` reads `data-mb-dg-n`/`-state`), entries "» MB links:
  N", "pending", "error"; a ticked one rings the matched icons with the
  Relationships column's `mb-rel-icon-match` (cleared by every filter pass —
  a highlight span would not do: its reset turns its content into text).
- ~~A click on our MusicBrainz icons opens musicbrainz.org in a new tab: the
  link previews skip musicbrainz.org hosts (`_EXT_SKIP_HOST_RE`).~~ Since
  2026-10-24 (org/TODO.org "some more BB and MB fixes/enhancements" 5b/5c)
  our icons AND murdos' importer's icons in Discogs' content
  (`#app a[href^="https://musicbrainz.org/"]`) are the source `_dgMbSource()`
  (listed before `_extSource()`, under `sa_pop_mb`): MusicBrainz's own card
  and window, `_MB_KINDS[kind]` unchanged. Their requests go through
  `_mbWsLoad()` → `_rgWsGet()`, which on a foreign host asks
  `https://musicbrainz.org/ws/2/…` through `_mbWsGetForeign()` (one GM
  request after `_relAwaitRateSlot()`, no retry, as `_dgMbAsk()`); the
  HTML's MusicBrainz-relative links are made absolute (`_dgMbAbs()`).
  ~~No Live page (MusicBrainz's browser check).~~ Since 2026-10-28
  (org/POH-headerline.org item 3) the window has its Live page and its
  editing history (✎, H, the ▾ presets): MusicBrainz PAGES, read with the
  browser's musicbrainz.org cookies (`_MB_LIVE.fetchText` →
  `_mbPageGetForeign()`, the second consented `session` request; probe P1:
  an anonymous request gets the 1394-byte "Verifying your browser" page).
  `_mbWinSource()` is the window's MusicBrainz source on either host,
  `_mbOrigin()` its origin; `_dpOpenHistPath()` reads a preset's path with
  `_mbPopTarget(…, {mbOrigin: true})`. The glyph is musicbrainz.org's
  (`_mbKindIconUrl()`). An icon is an image link and gets the
  card anyway (`_DG_MB_LINK_RE`: only `/<kind>/<MBID>`, so the importer's
  search boxes get none). A plain click on our column's icon opens the
  window, as every link in our tables (`_dgTableClickOpens()`); Ctrl-click
  the new tab. ~~Links inside the window go to musicbrainz.org in a new tab
  (`_mbPopTarget()` is same-origin, so nothing drills there).~~ Since
  2026-10-26 (org/discogs.org 1b/4b) a musicbrainz.org entity link inside
  the window — a Discogs window's Sites or Notes, a MusicBrainz window's
  links made absolute — is `_dgMbWinTarget()`: the `dg-mb` source's card on
  a hover and the window on a click, *Back* returning. Since 2026-10-28
  (vzell: "Genres -> tags link do not open inside the same window and do not
  have a hover window") any musicbrainz.org link a MusicBrainz card reads is
  one too, not only an entity by MBID: `_mbPopTarget(a, {inWindow, mbOrigin})`
  after `src.resolve()` — a genre's `/tag/<name>`, an edit, an editor, a
  documentation page, their pages read with the cookies. A tag's paged lists
  build on `_mbOrigin()` (`_mbPagedHtml()`), as does a series window's item
  glyph. The source's selector also takes our own `h1.mb-dg-h1`
  (2026-10-28, vzell: the importer's icon there "is not hoverable"): the
  importer processes it too (`mlink_processed`) and puts its icon in front
  of the page's name; such an icon is named after the `<bdi>`. The SAED
  menu's "✎ Edit history" (`_saedDgHistoryEntry()`, the Editing history
  group) opens the page entity's Discogs edit history in the window, built
  with the toolbar, so on the initial page and after a render alike.

Probe: `scripts/probe-mb-url-batch-by-discogs.py` (2026-10-19, NB-3641; its
docstring has the results): up to 100 resources a request, the 101st DROPPED
SILENTLY; answers in the server's order (matched by `resource`); one unknown
alone 404, several 200 with url-count 0; no paging; several relationship
incs in one request; `ended` per relation. Its answers are the
`tests/fixtures/mb-url-discogs-*.json` files.

### Discogs' own artist hover card

org/discogs.org item 0 (vzell, 2026-10-26): Discogs' React page shows its
own box when the pointer rests on an artist name, and with our link previews
on it sat on top of our card. `_dgMuteNativeArtistHover()` (installed once by
`_dgPrepareLivePage()`) stops `_DG_NATIVE_HOVER_EVENTS` (mouse/pointer
over/out/enter/leave) of `#app a[href*="/artist/"]` at `document` in the
capture phase while `sa_pop_ext` is on (read per event), so they never
reach React's root in `#app`. Since the second round (vzell's screenshot of
a label page, debug/discogs-label-initial.html, 2026-10-26) "of an artist
name" is `_dgArtistHoverHost()`: the link, or its wrapper up to 5 levels up
holding exactly one Discogs artist link and no release, master or label
link — a label page binds the card to `span.link_… > .mb_wrapper >
(a.mb_search_link, a[href^="/artist/"])`, so the importer's icons beside the
name count — and an event counts when its `target` OR its `relatedTarget`
is one: React builds its enter from the mouseout of what the pointer left
when it moves inside the page. The first round only stopped events whose
target was in the link, and its spec moved in from outside `#app`, which
never takes React's mouseout path. Our own `document` listeners still run: a
stop never skips the other listeners of its node, and all of ours there are
capture listeners (checked 2026-10-26: the popup engine, the tooltips, the
avatars, the async job popup). The box's markup is unknown (discogs.com was
unreachable from the session that wrote this, and the fixtures hold none),
so nothing is hidden by selector; a snapshot of the open box would allow a
CSS rule in `_ensureDgStyle()` as well.

### Discogs' own lists on the initial page: the image card (2026-10-26)

org/discogs.org 4a (vzell: "the image before a master or release name … should
get our standard image handling"). An artist's, a master's and a label's
page list rows in `#app table > tbody > tr` whose first cell is a link around
an `i.discogs.com` thumbnail (debug/discogs-{artist,master,label}-initial.html;
fixtures cut from them by `scripts/build-dg-ip-fixtures.py`). `_DGP_FI`
(`'dgp'`, `..._DG_FI`) gives them our tables' card and viewer: the row is its
first link to a release or master OTHER than the thumbnail's
(`_dgIpArtRowFor()`: a master page's thumbnail links the master with
`?image=…`, the version is the title's `/release/<id>`). React owns the
nodes, so nothing is stamped up front: `_dgIpThumbInstall()` (from
`_dgPrepareLivePage()`) stamps a whole list on `pointerover`/`focusin`
(`_dgIpThumbStamp()`: `data-mb-fi="dgp"`, `data-mbtt-fn="fi-img"`), before
the `mouseover` the card reads, and again on every visit. A plain click and
Space open our viewer (window-capture `_fiClick()` stops Discogs' gallery),
Shift+← → steps the list. `sa_dg_tip_images` turns the card off, as for our
tables. Spec: tests/fixtures/discogs-ip-thumbs.spec.js.

### The submissions list's initial page (2026-10-26)

org/discogs.org item 2 (debug/discogs-submissions-artist-bug.html): Discogs'
flat view has a fourth column, the list's matched artist, with no heading;
`_dgSubsIpHeader()` gives the table "Matched artist". Its link names the
artist (`/artist/Bruce+Springsteen`), which `_EXT_DISCOGS_PATH_RE` (an id)
never took: on discogs.com `_extTarget()` reads such a link as that artist's
search (`_extDgNamePathUrl()`), the search reader's, as our table's own cell
(`_dgSearchCell()`) already wrote it.

## Contributions, user submissions, a shop, filter searches, a listing (2026-11-10)

feature/dg-user-seller-search. **Mockup (vzell's answers 2026-11-10):**
https://claude.ai/artifact/2gnX1gagFEHTCC2LsFEn6n — tab A the two user
list pages, B the shop, C the filter searches, D the list reader's card and
window. His answers: a shop's rows from its own pages (250 a page, its
filters, sort and converted price kept); a search parameter the API cannot
express is dropped AND said; a reader of its own for list links, collection
and wantlist too; Discogs' item text split AND kept whole. After his live
test: a listing page and its links (below), and the filter searches worked
once the `@include` was the new one.

**Probe** (`scripts/probe-dg-user-seller-search.py`, no token;
Env: 2026-11-10T22:48:57+01:00 · vzell-lap · WSL2 · n/a · n/a; the
`--search-more` round 23:04, `--listing 4466508653` 23:26):

- `database/search`: `style=Rock & Roll` 381,029 (the page: 381,026);
  `decade=1970` is IGNORED (the same count), `year=1970-1979` works
  (40,364), `year=1975` 4,082; `sort=title|year|have` with `sort_order`
  each answer in their own order (`have` was believed unsupported in the
  mockup, tab C); a second `style` is ignored (the count of the first
  alone); an empty `q=` is harmless.
- `users/vzell/contributions` takes the page's `sort`/`sort_order`;
  `users/vzell/submissions` counted 638, as the page (642 on 2026-10-18).
- `users/<name>/inventory` and `marketplace/listings/<id>` answer without a
  token. A listing's `price` is converted for an anonymous request (USD),
  `original_price` is the seller's; `original_shipping_price` is empty.

**dg-user-list** gains `submissions` and `contributions`
(`_DG_USER_LIST_PATH_RE`, `_dgUserListKind()`). The submissions page is the
browser view (`table#browser`: the scroll unlock applies); its count is the
short pager (`#browser_tdl_items_pager_short`). A contributions page sorts
by a column Discogs remembers without the URL saying so: `_dgContribSort()`
reads the URL's sort, else `a.sortable_link_selected` (its `title` says the
direction; its href is the OTHER direction). The submissions page's `q` has
no API counterpart: `_dgUserListDropped()` names it in the hover text and as
`features.dgNote` — a `p.mb-dg-note` under the list heading
(`applyDgToTable()`), kept there in multi mode by `keepH2Intro`.

**dg-seller**: `_dgSellerToHtml()`; the listing row's columns are
`_dgMpRowParts()`, shared with dg-sell (whose output is unchanged:
discogs-sell.spec.js). `_dgMpSplitItem()`: artist before the first " - ",
the format in the LAST parentheses at the end. The page URLs and the count
are dg-sell's (`_dgSellPageUrl()`, `_dgSellSize()`). `_dgSellerEmpty()`:
`p.no_marketplace_results`.

**dg-search** by filters: `_extDgSearchMap()` (also the reader's key) maps
`genre|style|format|country[_exact]`, `year`, `decade` (alone: a range) and
the sort; anything else is `dropped` (`_extDgSearchDroppedText()`: hover
text, `dgNote`, the card's "Not applied"). A `q` search's key is unchanged.
The `@include` takes `q` OR one of these filters.

**dg-listing**: a Next.js page (`<main>`, the gate lets it in by path, as
the search). `_dgListingPageCount()` asks the listing (`_dgListing`), then
its release (kept in `_dgTexts`); the page is `_dgReleaseTracksHtml()`, the
head `_dgListingHeadSpec()` = the release's plus a "For sale" card, whose
shipping and total are the page's own (`_dgListingLivePrices()`: empty on a
disk load).

**Readers.** `dgulist` (`_EXT_DGL_KINDS`, list `ulist` in `_EXT_DG_LISTS`
with a `rowsOf` hook in `_extDgListLoad()`: a shop is `listings`, the
submissions an object of three lists) and `dglisting` (window: the release
target `_extDgListingRelTarget()`, loaded by the window, its parts from
`_extDiscogsWindow()`; clicks in them are `_extDiscogsAreaClick()` with the
release's target). The user window's "On Discogs" gains For sale.

**Known differences from the mockup:** a sort by Have is kept (the probe
showed the API takes it); the list window's left column is the user's lists
only (the profile facts are in the user's own window); the shop's window
lists the API's inventory (price as listed, no converted price — the
pageType has it).

**Tests:** `discogs-user-lists.spec.js`, `discogs-seller.spec.js`,
`discogs-seller.mobile.spec.js`, `discogs-search-page.spec.js` (the filter
describe), `discogs-user-list-reader.spec.js`, `discogs-listing.spec.js`,
`sl-include-regex.spec.js`; fixtures `dg-contributions.html`,
`dg-user-submissions.html`, `dg-seller-profile[-empty].html`,
`dg-search-facets.html`, `dg-listing.html` (scripts/build-discogs-fixtures.py
from debug/d-*.html) and the `ext-discogs-*` captures named in
`scripts/capture-ext-fixtures.py` (2026-11-10). Mutations:
`scripts/mutations/dg-user-seller-search.json`.

## Known differences from the mockup (raised with vzell)

- Sub-tables start collapsed ("Show all sub-sections"), as on every
  multi-table pageType; the mockup showed them open.
- The Image column is as wide as its header's controls (sort, 📊, the
  column filter), not the mockup's 48 px.
- ~~The viewer shows the lists' 150 px thumbnails, not full-size images.~~
  Full size since 2026-10-18 (above).
- The label's "All" button cannot show the total before a request.

## Videos and "Play here" (org/youtube.org, 2026-10-28)

Decision 3, all three places, every one from the API answer already read:
- the release window's Videos section and, since record version 5
  (`_EXT_DISCOGS_VERSION`), the master window's — `_extDiscogsLoad()` reads
  `videos` for both kinds now: `_extDgVideosHtml()`, a small tile per
  YouTube video and the player in a slot ABOVE the list
  (`[data-mb-yt-slots]` › `.mb-yt-slot`), so the list does not move. With
  `sa_yt_play_in_place` off the section's markup is what it always was;
- the release page's "Videos" sub-table after Barcode and Other Identifiers
  (`_dgVideosTableHtml()`, `_DG_HEADERS.release.Videos`: Play, Title,
  Length, URL), only when the release has videos, and without Play when the
  setting is off. Page 1 only, no request of its own.

The frame policy (decision 6) is the one open point: discogs.com's real
`frame-src` was behind Cloudflare's check for the probe. The fallback
(`_ytOnPolicy()`: a new tab, every tile saying so) works either way; read
the document's response headers in a real browser and record them in
org/youtube.org. Full design: docs/claude/detail-pages.md, "YouTube in place".

## Tests

| Spec                                          | Pins                                                                                                                                                                                                                                                                                                                                                                  |
|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/discogs-pages.spec.js`        | gate off: nothing; the section between the header root and `#app`, no request before the press; master: `masters/<id>` then versions p1-4 in order, 387 rows, one ★, thumbnails; release: the five sub-tables 8/18/12/12/386 and the release not among its versions; artist (Max Weinberg, 6 pages): the role groups in order with their counts, the toolbar named from `#app h1`; Springsteen's 68 pages meet High Page Count ("This list"), Cancel asks nothing more; label: the three button groups, Newest 500 = desc p1-5 and 500 rows, Oldest 500 = asc p1-5; previews: a table link and a content link get the card, the header and footer do not |
| `tests/fixtures/discogs-pages.mobile.spec.js` | a tap loads the master's versions; a tap on a version opens its window, the page stays                                                                                                                                                                                                                                                                               |
| `tests/fixtures/sl-include-regex.spec.js`     | the `@include` line: the four page kinds (slug, language prefix, query, no www), not a single image's page (`/image/…`), search, sell, user pages or the API host; since Phase 4 a release's `/images` and `/images/update` (not `/imagesx`, not a master's)                                                                                                         |
| `tests/fixtures/discogs-images.spec.js`       | dg-images / dg-image-history: one button, one API and one editor request after the press, 17 rows with uploader, date and time, own W × H, Size (KB), the thumbnail linking the 600 px image; Size (KB) sorts as a number; signed out, the API's 17 images. The reader's window from MusicBrainz: `popup-ext.spec.js` "Discogs Images and Image history (Phase 4)" |
| `tests/fixtures/discogs-submissions.spec.js`  | submissions: flat view (section first in `<body>`, 12 flat pages same-origin in order, the split, every column), browser view (flat pages, the title), the check at a submissions URL; the history: a history link (card asks nothing, Space one request, 14 changes, filter, order, diff marked blocks / whole release, memory), a title ("History, then the release", one request each), a sign-in page; full size: a row's 5 images from one request, ← →, Shift+← →, back from the cache, a failure and "Try again"; MusicBrainz: a history link, an anonymous request on Space |
| `tests/fixtures/discogs-links.spec.js`        | round 2: a plain click opens the window (every table link a new tab, the page stays); a search (25, Load 25 more = page 2, a result drilled, Back); in the history window a user (profile, the activity from their page, Back) and RSG §6.12.2 (the article, the section marked and in view, Back); View changes (6 buttons, 2 Images links, revision 8 → 10 only the Notes, Back to the latest, asked once); dg-user (only Submissions and Contributions, 642 in 7 requests, Releases 641 + Labels 1, columns; Contributions 3; the synthetic collection page: Collection, 2 pages, Added) |
| `tests/fixtures/discogs-ratings.spec.js`      | dg-ratings: the section first, the name, the button's count, nothing before the press; one page `limit=250&page=1&layout=med`, every column (links absolute, Cat# "none" dropped, Rating 5/4, Data quality); Rating ▲/▼; 300 ratings = 2 pages with the page's sort kept; a sign-in page fails, logged; a thumbnail opens the viewer |
| `tests/fixtures/discogs-mb-column.spec.js`    | the MusicBrainz column: none without the importer (no request); after Name/Title on Credits, Companies, Other versions, never Tracklist/Identifiers; the importer's cache at once, the rest in ≤100-resource requests (one inc, anonymous, exact URLs, none asked twice), a place before a label, one line, the importer's localStorage unchanged; our store (a second visit asks nothing, a "nothing found" too); ended grey, count badge, filtered by MBID not by "R?"; 📊 "MusicBrainz - Links" (ticking 2, pending drains as answers arrive); a sort keeps late answers (source rows); ⚠ and retry; auto lookups off → ▶ MB |

Since vzell's browser round `discogs-pages.spec.js` also pins: the search
links (an artist cell one link, a label cell one per label), a track's
credits as a collapsible linked list, the viewer from a thumbnail (position,
← →, Esc, the page stays), a page wider than the window (`html.mb-sph-on`:
`#mb-dg-root` never pinned whole, its h1 pinned, at x 0, as wide as its
widest table) and Cloudflare's check page left alone.

Fixtures: `python3 scripts/build-discogs-fixtures.py` turns
`debug/discogs-*.html` into `tests/fixtures/dg-*.html` (title, the three
roots, Discogs' `<h1>`, five Discogs links, a header and a footer link;
since 2026-10-18 also `dg-submissions-flat.html`, `dg-submissions-browser.html`
and `dg-release-history.html`, the older pages' `#main_wrapper` shell;
round 2: `dg-release-history-diff.html`, `dg-user-vzell.html`, the synthetic
`dg-user-collection.html`; 2026-10-19: `dg-user-ratings.html` and the synthetic
`dg-user-ratings-300.html`; Phase 4, 2026-10-27: `dg-release-images.html`
and `dg-release-images-update.html`, scripts and `data-reactid` dropped);
the API answers are `scripts/capture-ext-fixtures.py`'s `ext-discogs-*.json`
(Columbia oldest-first pages 2-5 added 2026-10-18; round 2: users vzell and
GuiBeal, vzell's submissions pages 1 and 7 — the specs serve page 1 for 2-6,
~600 KB a page —, contributions, GuiBeal's collection page 1, the Columbia
label search pages 1-2, the support article). Mutations:
`scripts/mutations/discogs-pages.json`, `scripts/mutations/discogs-submissions.json`,
`scripts/mutations/discogs-links.json`, `scripts/mutations/discogs-mb-column.json`, `scripts/mutations/dg-images.json`. `discogs-links.spec.js` also checks the column on a submissions list, a user's lists and its absence on a history page.

## The table-wide 🖼 gallery (2026-10-23)

A Discogs table with an Image column gets the foreign tables' 🖼 gallery
(docs/claude/artwork-caa-eaa.md, "The table-wide 🖼 gallery on the foreign
tables"): `_DG_FI`'s `peekSaved()` is `_dgFiPeek()` (the link previews'
records are in the detail-page database as `mb:<key>`), `spacingS()` is
`_extSpacingMs('api.discogs.com')`, and without a token the button names
the token's pace too. On a multi-table page (dg-release) only the sub-table
with images (Other versions) gets one.

## A release's Tracks view (dg-release, 2026-11-04)

org/foreign-detail-PTs.org, the Discogs step; vzell's answers 2026-11-03:
replace the view (first button "Tracks", today's sub-tables but the
Tracklist on the second), the role columns of the mockup, release-wide
credits as a "Release credits" sub-table.

- **One request**: the release. `_dgPageCount()` returns 1 for
  `features.dgView === 'tracks'`, so the master's versions are not asked.
  `_dgToHtml()` page 1 writes `_dgReleaseTracksHtml(d)` and keeps the answer
  in `_dgRelRec` for the head; the other view clears it.
- **Media** (`_dgReleaseMedia()`): a track's medium comes from its position —
  the part before the last "-" or "." ("1-1", "CD-1", "2.10", "Vinyl.A");
  sides ("A1", "B", "AA") pair into a record, a new one at a third side or a
  side seen again (a 10 × 7" box: "Record N" headings over A/AA each time);
  a plain number starts a new medium when it counts down; "16.1" right after
  plain "15" is a part of track 16, not disc 16. A heading right before a
  new medium names it; one inside a medium is the **Section** of the tracks
  after it; a named medium with sections (a split LP, a heading per side)
  turns its name into the first section. An index track's sub-tracks are
  rows, the index title before theirs. **A vinyl record is ONE sub-table**
  (its two sides), as MusicBrainz has one medium per record — the mockup
  drew a sub-table per side, which made a single's two one-row tables.
- **Names**: `_dgFormatUnits()` expands `formats` into units (2×LP is two,
  a box and "All Media" none, files one); a medium takes the unit of its
  index when the counts agree, else the one unit label, else a disc
  prefix's ("CD", "DVD"). h3: word (Disc, Record, Tape, Files) and number,
  the heading, the unit, the running time.
- **Credits** (`_dgExpandTrackSpec()`): a release credit's `tracks` spec is
  placed part by part — "X to Y" / "X-Y" (each end a position, or a side's,
  disc's or heading's first or last track), a position, a side or disc
  ("D", "CD1"), a heading's name ("Record 10"). Any part that cannot be
  placed keeps the WHOLE credit in Release credits, its spec shown: Discogs'
  data names discs that do not exist ("3-10" on a two-disc release).
- **Columns** (`_dgRoleColumn()`): vocals → Vocals; producer, engineer and
  recorded-by, mixed-by, arranged-by → their columns; `_DG_OTHER_ROLE_RE`
  (writing, mastering, art, crew, conducting, featuring, …) → Other credits;
  the rest → Instruments (the API has no role categories). Instruments,
  Vocals and Other credits read "Role – Name" through `_dgRoleHtml()` (the
  📊 Credit details sentinels); the named columns read the name, with what
  the role adds ("Engineer [Assistant]" → "(Assistant)"). Only columns with
  a credit appear; Artist and Section only when a track has one.
- **Track tables carry `data-mb-dg-tracks`**: `_dgMbDecorateTable()` gives
  them no MusicBrainz column (rows are tracks); Release credits gets one.
- **The head** (`_dgReleaseHeadSpec()`) is the shared foreign-detail head
  (`_fdHeadInsertSections()`, docs/claude/internet-archive.md "An item
  page"): "~ Release by <artists> (released: country)", Notes, Details
  (left: Release, External links, Genres and styles, Contributors (the
  API's, the submitter first, each `/user/<name>`), Community last — Discogs'
  Statistics box in full: have, want, avg rating and ratings from the API
  answer, linked to `/release/stats/<id>` as the box links them, Last sold,
  Low, Median and High read from that box on the page (`_dgLiveStats()`,
  `#app #release-stats`, by label; Discogs' API has no sales figures, and the
  page is already there: no request), then the copies for sale, linked to
  `/sell/release/<id>`, and the data quality; right: Identifiers,
  long and with long values; vzell 2026-11-04 — either column of the shared
  head takes facts or built cards),
  Images (`_extDiscogsImages()`, Primary / Secondary N). vzell's live test
  (2026-11-04): values are linked as Discogs' own page links them (a label
  or series to `/label/<id>`, format, country and year to the search, a
  genre or style to `/music/genre|style/<name>`); Notes go through
  `_extDiscogsMarkupHtml()` (`[url=…]`, `[r=…]`, `[a=…]` as links); an
  identifier's description goes with its VALUE, never the label — a long one
  ("A-side deadwax, stamped except …") made the label column the card's whole
  width and the values 18 px wide (`.mb-fd-details dt` is capped too, as a
  second guard). The head's links preview like the tables' (`_extSource()`'s
  foreign selector names `.mb-fd-head`/`.mb-fd-sub`), and a plain click on
  one opens the window (`_dgTableClickOpens()`).
- **Probe** `scripts/probe-dg-release-shapes.py` (2026-11-04, 52 releases,
  anonymous; `--multi` for multi-disc, boxes, DVDs, cassettes) and
  `scripts/check-dg-release-media.js DIR [--roles]`, which runs the shipped
  splitter on saved answers: 348 of 354 ranged credits placed, the 6 left
  name positions the releases do not have. Fixtures: 1874253 and four from
  the probe (`scripts/wrap-dg-release-fixtures.py`).

## A master's Tracks view (dg-master, 2026-11-04)

org/discogs.org, "the discogs master release PT"; mockup
`org/dg-master-mockups.html`. vzell's answers the same day: Credits by person
on the right, the number of versions in the head — configurable
(`sa_dg_master_versions_count`, on) — Community grouped in two columns, the
videos as a sub-table under the tracks.

- **Two buttons, multi-table.** "Tracks" (`dgView: 'tracks'`) first, then
  "Versions" (`dgView: 'versions'`, today's rows). The engine has one table
  mode per page, so `dg-master` is `multi` with `groupByH3` since then: the
  versions are ONE "Versions" sub-table (every page the same heading), as a
  release's other versions.
- **Requests.** `_dgPageCount()` keeps the master's record (`masters/<id>`,
  `_dgPageUrl()` page 1 of the Tracks view) and, with the setting on, asks
  versions page 1 — the same URL as the Versions view's page 1 — for
  `pagination.items` (`_dgRun.versions`; a failure costs the count, not the
  view). One page.
- **Tracks.** A master's record has a release's tracklist, so `_dgToHtml()`
  runs it through `_dgReleaseTracksHtml()` unchanged, then
  `_dgVideosTableHtml()`. No `formats`: a medium is named by its positions
  (sides → "Record", "1-1" → "Disc", plain numbers → "Disc"), by a heading
  when there is one per disc. No release-wide credits: no Producer column on
  most masters, no Release credits table.
- **The head** (`_dgMasterHeadSpec()`, `_dgMasterRec`): "~ Master release by
  <artists> (year)", Notes (a master rarely has any: 1 of 24 probed),
  Details — left: Master release (Year linked to the search, the main
  release ★, the newest release when it differs, Versions), External links
  (Master, History, Main release, Newest release), Genres and styles,
  Community; right: **Credits** (`_dgCreditsByPerson()`: a person per line,
  the most tracks first, then first seen; roles on the same set of tracks
  joined; tracks as runs in tracklist order, `_dgPosRuns()`: "A1–B2, B4").
  Images.
- **Community from the page.** A master's API answer has no `community`
  block: Have, Want, Avg Rating and Ratings are read from Discogs'
  Statistics box (`_dgLiveStats('#master-statistics')`, same markup as the
  release's `#release-stats`), for sale, the price range and the formats on
  sale from its For Sale box (`_dgLiveMasterSale()`, `#shopping-box-host`:
  "From €1 to €4,000" → "€1 – €4,000", "Shop 3,064 Listings"); the API's
  `num_for_sale` only when the box is missing. Data quality from the answer.
  No request; on a disk load or before Discogs drew the boxes, the card has
  only what the answer had.
- **Two columns** (a release's Community card too): a facts entry
  `[key, name, [left, right], { twoCol: true }]` in `_fdHeadInsertSections()`
  becomes `div.mb-fd-2col` with two `dl.mb-fd-kv` (flex, 13em each, so one
  under the other on a narrow card); a half without a row makes it one plain
  list. Grouped: the collection and the data quality, then the market.
- **The media split, a fix for both kinds**: a plain number with a letter
  ("1b" after "1a", a medley's parts) is a part of the same track, not a new
  medium — "The Very Best Of Stars On 45" (master 203805) was 147 tables.
- **Probe** `scripts/probe-dg-master-shapes.py OUT [N]` (2026-11-04, 24 of his
  225 masters, anonymous; the named shapes first — The River, Tracks, The
  Promise, Essential, Greatest Hits — then a spread over the years, then
  three he appears on), then `node scripts/check-dg-release-media.js OUT`
  (now reads `master-<id>.json` too). Every master lacks `formats`, `labels`,
  `identifiers`, `extraartists`, `community`, `released` and `country`;
  shapes: 9-9 (Tracks: 4 discs), A9 (The River, Greatest Hits: 2 records;
  The Promise: 3), 9, A, 9a. Fixtures: 26725 plus 1123030 (two discs named
  by headings, and its versions page 1), 203805, 27194
  (`scripts/wrap-dg-release-fixtures.py … master-<id> master-<id>-versions-p1`).
- **Tests**: `tests/fixtures/discogs-master-tracks.spec.js`; mutations
  `scripts/mutations/dg-master-tracks.json` (16).

## Section bands of the Tracks view (2026-11-11)

org/discogs.org, "make a nice mockup for a release with subheaders"; mockup
`org/discogs-subheaders-mockups.html` (https://claude.ai/artifact/JHuxeos1Yvu7DFwtBftHzg).
vzell's answers the same day: variant A (bands as on Discogs' page), sticky
on a desktop and off on touch devices, the Section column hidden by
default, the window as an outline (all open up to ~40 tracks, else Disc 1
only), the card's word always "sections", masters the same.

- **Levels come from `_dgReleaseMedia()`, unchanged**: a heading right
  before a new medium names it (the h3), every other heading is the
  `section` of the tracks after it. Discogs' API has no heading level;
  this split already was the right one (release 2012001: "Volume 1: …" →
  Disc 1, "Cologne 13/02/1981" … → sections).
- **The converter marks, the render draws.** `_dgReleaseTracksHtml()` puts
  `data-mb-sec`, `data-mb-sec-n` and `data-mb-sec-len` (`_dgSectionStats()`,
  per medium) on each track row, and `data-mb-sec` on its Title cell.
  Attributes only: no text a filter could match, and they survive
  `cloneNode`.
- **A band is a REAL row** (`tr.mb-nd-row.mb-sec-band`, one
  `td colspan=999` holding a button), because only a row can stick across
  the table; a CSS label on a track row cannot leave its cell. Bands live in
  the live tbody only, never in `groupedRows`: `_dgSecBandsSync()` removes
  and rebuilds them at the END of `renderGroupedTable()` (after every
  other post-render pass), after the sub-table filter (`applySubFilter()`,
  both exits) and after a fold. Every engine pass that walks live rows
  skips `_NON_DATA_ROW_SEL` — docs/claude/filter-and-cache-invariants.md,
  "Rows that are not data"; `scripts/list-live-row-passes.py` lists them.
- **In order or not**: bands only while the live rows' `data-mb-row-idx`
  rise (the tracklist's order). Sorted by anything else the table gets
  `.mb-sec-sorted`: no bands, and the Title cell's `::after` shows
  `attr(data-mb-sec)` as a tag (drawn, never written).
- **Counts**: "N tracks · length" from the row attributes; while a page
  filter leaves rows out or the sub-table filter hides some
  (`display: none`), "k of N tracks"; a section with nothing shown has no
  band. Never counted as a track (the h3 "(13)", zebra striping, CSV).
- **Folding**: `_dgSecFolded` ("<table index>\u0001<section>", the
  table's place among `#mb-dg-root table.tbl`), applied as
  `tr.mb-sec-folded` on every rebuild, so a fold survives sort and filter.
  The row counts still include folded rows: folding is not filtering.
- **Sticky**: `table.mb-sec-sticky` (`_dgSecBandsSticky()`: always on a
  hover device, on a touch-primary one only with
  `sa_dg_section_bands_sticky_on_touch`, default off), the band's `td`
  `position: sticky` at `--mb-sec-band-top` = the thead's computed `top`
  plus its height (`_dgSecBandTop()`), z-index 99 (thead 100, sticky
  column 1-3). Re-measured on resize and whenever `_vsbRefresh()` rewrites
  the sticky filter bars' offsets (`_dgSecBandsRemeasure()`). The button
  inside is `position: sticky; left: 8px`, so the name stays in view while
  the table scrolls sideways.
- **Section column hidden by default**: `SA_DEFAULT_HIDDEN_COLUMNS_DEFAULT`
  rows `dg-release` and `dg-master` → `"Section"` (announced by the seed
  ledger: a column vanishing on upgrade is explained).
- **The window and the card** (docs/claude/detail-pages.md, "The Discogs
  tracklist outline"): the same `_dgReleaseMedia()`, fed back the record's
  list (`_extDgOutline()`); `_dgMediumUnit()` names a disc for both.
- **Tests**: `tests/fixtures/discogs-release-sections.spec.js` (bands,
  places, counts, Section hidden, striping, fold through a re-render, page
  filter "k of N", sub-table filter, sorted tags, sticky docking, split LP,
  no bands without sections, CSV), `discogs-release-sections.mobile.spec.js`
  (not sticky on touch, the setting); `popup-ext.spec.js` "the Discogs
  window: the tracklist as an outline". Mutations
  `scripts/mutations/dg-section-bands.json`. A spec on this page must OPEN
  the sub-tables first (they start collapsed): on a hidden table every
  "hidden" and geometry assertion passes for nothing.
