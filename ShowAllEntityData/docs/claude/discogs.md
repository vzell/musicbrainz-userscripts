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

## What it is

Seven pageTypes on discogs.com's own pages, opt-in via `sa_enable_discogs`
(default off; the gate exits before anything visible, as for every foreign
site), `host: 'www.discogs.com'`, three `@include` lines:

| pageType     | Page                     | Button(s)                                                         | Table                                                                                                                       |
|--------------|--------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `dg-master`  | `/master/<id>`           | Show all versions                                                 | single: Image, Title (★ main release), Format, Label, Cat#, Country, Year                                                   |
| `dg-release` | `/release/<id>`          | Show tracklist, credits and other versions                        | multi: Tracklist, Credits, Companies, etc., Barcode and Other Identifiers, Other versions (the release itself left out)     |
| `dg-artist`  | `/artist/<id>`           | Show the whole discography                                        | multi: one sub-table per Discogs role run (Releases, Credits: Producer, …, Appearances, Track appearances, Unofficial)       |
| `dg-label`   | `/label/<id>`            | Newest: 500 · 1,000 · 5,000 — Oldest: 500 · 1,000 — Then: All     | single: Image, Artist, Title, Format, Cat#, Year                                                                            |
| `dg-submissions` | `/submissions?…`     | Show all submissions                                              | single: Artist, Title, Changed by, Changed, Matched artist, History (rows from the FLAT view's pages, not the API)            |
| `dg-user`    | `/user/<name>`           | Submissions · Contributions · Collection · Wantlist (shown when the page counts them) | multi: Releases / Artists / Labels (submissions), or one table; + Status, or Added (collection, wantlist) |

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
  the document, capture: renders clone the rows), captioned with the row's
  title (`_DG_ART_CTX`). **Since 2026-10-18 at full size:** each shown row is
  a viewer group (`onGroupStep`: Shift+← →, and ← → past either end with
  `sa_art_viewer_cross_rows`); its images are the link previews' record of
  the row's release or master (`_extTarget()` on the Title link, then
  `_extLoad()` with its own `wanted`: memory, IndexedDB, or ONE request),
  asked by `_dgArtLoad()` only when the viewer SHOWS the row — never ahead.
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
Marked). Pages: the pager's "Jump to" when there is one — a long history's
pager was not seen yet. A plain click on "View changes" opens the window;
the history reader reads `?diff=<rev>` from the link and opens on that
revision (`revFor`: once per opening).

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
that source never switches on), `extRoot: '#app'` — Discogs' content, not its
header or footer (vzell). `_extTarget()` takes a link to the page's own host
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
- A click on our MusicBrainz icons opens musicbrainz.org in a new tab: the
  link previews skip musicbrainz.org hosts (`_EXT_SKIP_HOST_RE`).

Probe: `scripts/probe-mb-url-batch-by-discogs.py` (2026-10-19, NB-3641; its
docstring has the results): up to 100 resources a request, the 101st DROPPED
SILENTLY; answers in the server's order (matched by `resource`); one unknown
alone 404, several 200 with url-count 0; no paging; several relationship
incs in one request; `ended` per relation. Its answers are the
`tests/fixtures/mb-url-discogs-*.json` files.

## Known differences from the mockup (raised with vzell)

- Sub-tables start collapsed ("Show all sub-sections"), as on every
  multi-table pageType; the mockup showed them open.
- The Image column is as wide as its header's controls (sort, 📊, the
  column filter), not the mockup's 48 px.
- ~~The viewer shows the lists' 150 px thumbnails, not full-size images.~~
  Full size since 2026-10-18 (above).
- The label's "All" button cannot show the total before a request.

## Tests

| Spec                                          | Pins                                                                                                                                                                                                                                                                                                                                                                  |
|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/discogs-pages.spec.js`        | gate off: nothing; the section between the header root and `#app`, no request before the press; master: `masters/<id>` then versions p1-4 in order, 387 rows, one ★, thumbnails; release: the five sub-tables 8/18/12/12/386 and the release not among its versions; artist (Max Weinberg, 6 pages): the role groups in order with their counts, the toolbar named from `#app h1`; Springsteen's 68 pages meet High Page Count ("This list"), Cancel asks nothing more; label: the three button groups, Newest 500 = desc p1-5 and 500 rows, Oldest 500 = asc p1-5; previews: a table link and a content link get the card, the header and footer do not |
| `tests/fixtures/discogs-pages.mobile.spec.js` | a tap loads the master's versions; a tap on a version opens its window, the page stays                                                                                                                                                                                                                                                                               |
| `tests/fixtures/sl-include-regex.spec.js`     | the `@include` line: the four page kinds (slug, language prefix, query, no www), not the image pages, search, sell, user pages or the API host                                                                                                                                                                                                                         |
| `tests/fixtures/discogs-submissions.spec.js`  | submissions: flat view (section first in `<body>`, 12 flat pages same-origin in order, the split, every column), browser view (flat pages, the title), the check at a submissions URL; the history: a history link (card asks nothing, Space one request, 14 changes, filter, order, diff marked blocks / whole release, memory), a title ("History, then the release", one request each), a sign-in page; full size: a row's 5 images from one request, ← →, Shift+← →, back from the cache, a failure and "Try again"; MusicBrainz: a history link, an anonymous request on Space |
| `tests/fixtures/discogs-links.spec.js`        | round 2: a plain click opens the window (every table link a new tab, the page stays); a search (25, Load 25 more = page 2, a result drilled, Back); in the history window a user (profile, the activity from their page, Back) and RSG §6.12.2 (the article, the section marked and in view, Back); View changes (6 buttons, 2 Images links, revision 8 → 10 only the Notes, Back to the latest, asked once); dg-user (only Submissions and Contributions, 642 in 7 requests, Releases 641 + Labels 1, columns; Contributions 3; the synthetic collection page: Collection, 2 pages, Added) |
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
`dg-user-collection.html`);
the API answers are `scripts/capture-ext-fixtures.py`'s `ext-discogs-*.json`
(Columbia oldest-first pages 2-5 added 2026-10-18; round 2: users vzell and
GuiBeal, vzell's submissions pages 1 and 7 — the specs serve page 1 for 2-6,
~600 KB a page —, contributions, GuiBeal's collection page 1, the Columbia
label search pages 1-2, the support article). Mutations:
`scripts/mutations/discogs-pages.json`, `scripts/mutations/discogs-submissions.json`,
`scripts/mutations/discogs-links.json`, `scripts/mutations/discogs-mb-column.json`. `discogs-links.spec.js` also checks the column on a submissions list, a user's lists and its absence on a history page.
