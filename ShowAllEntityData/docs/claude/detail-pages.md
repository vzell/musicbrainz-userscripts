<!-- Written on branch feature/detail-pages (org/detail-pages.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# Detail-page preview on the non-MusicBrainz hosts

Every row of the four foreign tables links to a detail page the list does
not show: a bootleg's tracklist and scans (springsteenlyrics.com), an artwork
page's uploader and scans (jungleland.it), a record's tracklist with the show
each track comes from (brucespringsteen.it), a song's history (Brucebase).
Resting the pointer on such a link shows a **card** with what the page adds;
**Space** pins it into a **dialog** with an Extracted and a Live page view.
Design study, probes and the mockups the user chose from:
`org/detail-pages.org`, `org/detail-pages-mockups.html`.

## Gates: one setting per host, nothing on MusicBrainz

| Host                  | Setting                | Detail links                                                                                                    |
|-----------------------|------------------------|-----------------------------------------------------------------------------------------------------------------|
| springsteenlyrics.com | `sa_sl_detail_preview` | `collection.php`/`bootlegs.php`/`brucelegs.php` with `item=N`; `lyrics.php?song=SLUG` (the lyrics index, 9.99.1264) |
| jungleland.it         | `sa_jl_detail_preview` | `/html/*.htm` except list, images, artwork                                                                      |
| brucespringsteen.it   | `sa_bs_detail_preview` | `/DB/detrec.aspx?code=`                                                                                         |
| brucebase.wikidot.com | `sa_bb_detail_preview` | `/song:<slug>`                                                                                                  |

All four default **off** and sit under their host's own `sa_enable_<site>`
setting, which still has to be on. `_DP_SITES` is keyed by `_foreignHost`,
so on MusicBrainz `_dpActiveSite()` is null and no foreign source is
enabled. Since the popup engine (next section) `_initDetailPreview()` is
called on every page and installs only where a source is enabled: on
MusicBrainz that is a release page with a release-group card on, or any
page with `sa_pop_mb` on (the entity cards, below), and nowhere else, so with
`sa_pop_mb` off every other MusicBrainz page gets no stylesheet, no listener
and no database from it. The specs pin that: `"on a MusicBrainz page, every
preview setting on changes nothing"` (every FOREIGN preview setting on, an
`/iswc/` page) and popup-mb.spec.js's `"off by default"`.

## The popup engine: sources (org/iframe.org, Phase 1)

The card and the dialog are an engine that serves SOURCES (`_popSources()`,
built once; `_popResolve(node)` finds the first enabled source whose
`selector` matches `node.closest()` and whose `resolve()` accepts it, and
returns a TARGET `{src, el, key, url, …}`). The four foreign sites are one
source each (`_dpSiteSource()`, the behaviour above, unchanged); a MusicBrainz
release page adds two (below). A source has:

| Member                                    | What it is                                                                                                           |
|-------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `selector`, `resolve(el)`                 | which element it previews (a link, or a container such as a "#" cell), and that element's `{key, url}`, or null      |
| `enabled()`                               | its host and settings, read at every event                                                                           |
| `needsCtrl()`                             | whether its card waits for Ctrl (the foreign sites: `_dpNeedsCtrl()`)                                                |
| `card(t, start, repaint)`                 | the card's HTML for the CURRENT state, at once                                                                       |
| `extracted(t, start, force, repaint)`     | the Extracted view's HTML, the same way                                                                              |
| `live`, `liveUrl(t)`                      | the Live page view: `_dpIsolateFrame()`'s fields, plus `charset` and `awaitSlot` (the rate gate `_dpGetRaw()` waits on) |
| `steps(t)`, `stepId(el)`                  | what ‹ › step through, and an identity that survives the `cloneNode(true)` re-renders                                |
| `kind`, `wide`, `onAreaClick(e, t)`       | the dialog's title, a wider card, a click in the Extracted view (a sortable header)                                  |

Rules that fail silently if broken:

- **Only a call with `start` may start a request.** `card()`/`extracted()`
  are called again by `repaint()` whenever their source's state changes (a
  page of releases arrives); a repaint that started a request would retry a
  failed one for ever (the "#" card's lesson, release-tracks-and-length.md).
  The one exception is `_rgWindowFor()`: a repaint may start what was never
  asked (a "#" window opened before its search answered), never a failure.
- **A source keeps its own per-URL state for repaints.** `_dpSiteSource()`
  keeps the latest card and window outcome per URL, so a repaint shows
  "fetched now" until the next hover, as before.
- **`repaint()` checks that its target is still shown** (`_dpPeekShowing()`,
  `_dpDialogShowing()`): a late answer for a card the pointer has left paints
  nothing.
- **The dialog's title is the source's `kind`** (`_dpShowInDialog()` sets it on
  the title span `createInfoDialog()` made), so one dialog serves every source.

## MusicBrainz: the release-group sources

On a release page (`_isReleasePagePath()`), two sources serve the release
group cards that release-tracks-and-length.md describes ("Item 4" and "Per-event
tints and the "#" card"):

- `_rgLinkSource()`: the subheader link "N versions available in <name>"
  (`[data-mb-rg-link]`, written by `initReleaseGroupLink()`). Its card shows on
  a PLAIN hover, as it always did (org/iframe.org, answer 8). Off with
  `sa_release_rg_link`.
- `_eventRgSource()`: the "#" cell of a live track (`_EVENT_RG_CELL_SEL`). Its
  card waits for Ctrl unless `sa_event_rg_tooltip_without_ctrl` is on; ‹ › step
  down the "#" cells of every visible row (`stepId` = `data-mb-row-idx`). Off
  with `sa_event_rg_tooltip`. Alt+click stays its own handler
  (`initEventRgTooltip()`).

Both share `_rgReleases` (a group's releases as far as loaded) and `_rgFacts`
(its lookup), and the window `_rgWindowFor()` builds:

- **Every release, paged by the releases RETURNED.** `_rgReleasesLoad()`
  browses `release?release-group=…&inc=media+labels&limit=100&offset=<n>`, `n`
  being the releases it has, not a multiple of 100: the Web Service caps a
  release browse at 500 tracks (MusicBrainz_API, checked 2026-10-07). The card
  needs the first page only; the window asks for all of them, up to
  `sa_rg_window_max_releases` (default 500), and joins a load that is running.
  A page that fails keeps what loaded before it; ⟳ starts again from the first.
- **Facts on pin only**: one lookup,
  `release-group/<gid>?inc=artist-credits+genres+ratings+url-rels+annotation`.
- **Kept a day**: both in this file's database (`vz-saed-detail-pages`, keys
  `mb:rg-releases:<gid>` and `mb:rg-facts:<gid>`, `_RG_TTL_MS`,
  `_RG_IDB_VERSION`). IndexedDB is per origin, so on musicbrainz.org this is a
  database of its own, and the art cache's `_ART_IDB_VERSION` is untouched.
  Only a success is kept; the card's foot says "fetched now" / "saved today".
- **One rate gate**: every request goes through `_relAwaitRateSlot()`
  (`_rgWsGet()`), the gate of the Relationships column too, so the two together
  stay at one request per 1.1 s (org/iframe.org, answer 7). The foreign sites
  keep `_dpAwaitSlot()`: another origin, another budget.
- **Covers only where the archive has a front**: the window's thumbnails read
  each release's own `cover-art-archive.front` (accurate:
  org/caa-artwork-requests.org F1), and load lazily.
- **The Live page root is `#page`, not `#content`.** `_dpIsolateFrame()` hides
  the siblings of the root and of each ancestor: `#page` hides MusicBrainz's
  `.header`, the browser warning and `#footer`, and keeps `#content` and
  `#sidebar`; `#content` would hide the sidebar too (`_MB_LIVE`, org/iframe.org
  R6; every probed page, `/user/` and `/isrc/` included, has `#page`).

## MusicBrainz: entity cards on table links (org/iframe.org, Phase 2)

`_mbEntitySource()` is the LAST source of `_popSources()`, so the release
page's two (the subheader link, the "#" cell) keep what they serve. It serves
`table.tbl > tbody a[href]` on every MusicBrainz page the script runs on
(`_initDetailPreview()` is reached only with a pageType: a page without one,
such as a bare `/work/<mbid>`, gets nothing; `@include` is unchanged,
org/iframe.org answer 6), behind ONE setting, `sa_pop_mb` (default off,
answers 1 and 3). Its card waits for Ctrl through `_dpNeedsCtrl()`
(`sa_dp_hover_without_ctrl`, relabelled "every preview", answer 2). A tap
opens the window, as on the foreign hosts (kept, decided 2026-10-07).

- **What is previewed: `_mbPopTarget()`**, the one URL test. Same origin,
  and the BARE entity path only (`_MB_POP_PATH_RE`): `/cover-art` (the CAA/EAA
  icon column's anchor, and MusicBrainz's own hidden one in a native release
  list's first cell), `/edit`, `/merge` and the tabs never match. Not a link
  wrapping an `<img>` (artwork has its own preview), not in `td.mb-rel-cell`
  (its own tooltip), not inside the card or the window, and only a kind
  `_MB_KINDS` knows. Its target carries `type`, `id`, `kind` (the window's
  title) and `wide`, and `col`, the cell's header name.
- **The kinds: `_MB_KINDS`**, by path segment, each with `title`, `wide`,
  `card()`, `extracted()`, optional `onAreaClick()`. The release group reuses
  Phase 1 whole (`_rgCardHtml()`/`_rgWindowFor()` with `n` = `null`: the
  count then comes from the browse's `release-count`, and no row is "this
  release"). A lookup kind is built by `_mbPopLookupKind({cardInc, cardHtml,
  windowHtml, pin})`: the card is ONE lookup, the window the same answer plus
  what `pin()` starts once that answer is there (the release: the Cover Art
  Archive index through `_artFetchEntityImages(CAA_CTX, …)`, only where the
  answer's `cover-art-archive.count` says there are images). `pin()` may run
  from a repaint, but starts only what was never asked (or ⟳), so a failure
  does not loop — the same exception `_rgWindowFor()` has. A pin's MusicBrainz
  requests go through `_mbPopPinLoad()`, which skips a key that FAILED unless
  it is ⟳ (pinned by a mutation); a ⟳ reaches the extras started from the
  lookup's own callback too (`start && force`).
- **Kinds so far**: release group, release (9.99.1272); recording — card
  `artist-credits+isrcs+releases+work-rels`, window `artist-rels+place-rels+event-rels`
  plus `release?recording=…&limit=1` ONLY when the lookup's list is full
  (`_MB_POP_SUBLIST_CAP` 25, org/iframe.org R3); work — card
  `artist-rels+label-rels+work-rels`, window `recording?work=…&limit=100&inc=artist-credits`
  (9.99.1273); artist — card `genres+ratings+aliases` (url-rels left to the window,
  R1), window `url-rels` plus one `release-group?artist=…&type=<t>&limit=1`
  per `_MB_POP_RG_TYPES`; label — card `genres+aliases`, window
  `url-rels+label-rels` plus `release?label=…&limit=1`; area — `area-rels`;
  instrument — `instrument-rels+aliases`, no description from the Web Service
  (9.99.1274); event — card `artist-rels+place-rels` (the setlist is a field of the
  event), window `recording-rels+release-rels` plus the Event Art Archive index
  (`_mbPopArtLoad(_mbPopEventArt, EAA_CTX, …)`, on pin only, R4); place — card
  `area-rels+url-rels`, window `event?place=…&limit=100` sorted by date (the
  browse is not); series — one lookup with every item-kind relation (R1),
  items by `ordering-key` (the lookup is not in order) (9.99.1275); ISRC
  (`artist-credits`), ISWC, disc ID and collection — one lookup each, no extras
  (9.99.1276). Browse keys: `pop:browse:<entity>?<query>` (`_mbPopBrowse()`).
- **Codes** are a second path pattern, `_MB_POP_CODE_RE` (`/isrc/`, `/iswc/`,
  `/cdtoc/`); `_MB_POP_CODE_TYPES` maps the page segment to the kind and Web
  Service path — a disc ID's page is `/cdtoc/<id>`, its lookup
  `/ws/2/discid/<id>`, and the target's `url` (↗, Live page) keeps the PAGE's
  segment. A kind may add `failNote(detail)` to its failure line: a private
  collection answers 401 (the Web Service shows public collections only) and
  its card says "It is probably private." — still not kept, as any failure.
- **The setlist is MusicBrainz's markup** (`_mbPopSetlist()`): `@ ` line-up
  artist, `# ` comment (between artists, the billing word "&"/"with"),
  `* ` song. `[mbid|name]` tokens are shown by NAME only: inside a song line
  the markup does not say whether one is a work or an artist. (The
  event-overview page's `_eventSetlistParse()` reads the rendered HTML, a
  different input.)
- **Relations are grouped by type AND direction** (`_mbPopRelsByType()`), and
  `_MB_POP_REL_LABELS` names a group whose meaning turns on its direction, as
  read off the captures, not guessed: Columbia's forward "label ownership"
  targets are labels it owns (Vocalion), New Jersey's 21 forward "part of"
  are its counties, guitar's forward "subtype" include slide guitar. Any other
  group is its type, with an arrow when the type comes in both directions.
- **The label code is "LC" and five digits** (`_mbPopLabelCode()`), as
  MusicBrainz's own formatter writes it ("LC 00162" for Columbia): written
  from memory (musicbrainz.org answered curl with a browser check) and
  confirmed against a label page by the user in a browser, 2026-10-07.
- **One loader: `_mbWsLoad(cacheKey, url, …)`**, state in `_mbPop`. Memory,
  then IndexedDB (`_rgIdbGet(key, _MB_POP_IDB_VERSION)`, the release group's
  helpers with a version argument), then `_rgWsGet()`. The key is
  `pop:<type>:<id>:<inc>` — WITH the inc set, unlike `_relFetchWs2()`'s
  `type:mbid` (org/iframe.org, "Risks"). In-flight sharing per key; only a
  success is kept; a failure is retried by the next call with `start`.
- **`wanted()` after the rate slot.** `_rgWsGet(url, label, wanted)` asks it
  once `_relAwaitRateSlot()` resolves: a hover that has moved on makes NO
  request (`skipped`; the load is forgotten, so the next hover starts again;
  the slot is spent anyway, it was reserved synchronously). `_mbPopWanted(t)`
  = the card still shows that link, or the window is open on that entity.
  `_rgReleasesLoad()` takes a `wanted` too, passed only from a table link:
  a caller without one always wants, so the release page's sources are as in
  Phase 1.
- **TTL: `_mbTtlMs()`** = `sa_pop_mb_ttl_hours` (default 24) for every
  MusicBrainz answer of the engine, the release group's included (it replaced
  the constant `_RG_TTL_MS`).
- **Stepping: `_mbPopSteps(t)`** — the same kind in the same column, the
  column found by HEADER NAME (`_resolveColHeaderName()`) in every visible
  top-level `table.tbl`, so the arrows go on into the next sub-table even
  when the columns differ; one link per visible row (the first of its kind in
  that cell). `_mbPopStepId()` = `data-mb-row-idx` (unique on the page) plus
  the entity; a never-rendered native table falls back to the row's place.
- **One box at a time.** `#mb-stat-tooltip`'s own-card path already gives way
  to `#mb-dp-peek` (`_OTHER_RICH_TIPS`); on a link with its own `data-mb-tip`
  text the card wins. Pinned with a control (previews off → the Liner notes
  card shows).

**The detail pages match no `@include` line.** The script never runs ON them,
in a tab or in the Live page frame. Everything is fetched (same origin) and
parsed from the list page.

A link qualifies (`_dpSiteForLink()`) when it is in a `table.tbl > tbody`,
wraps no image (springsteenlyrics.com's Cover cell links to the same page),
and its URL is same-origin and passes the host's `isDetailUrl`.

## Fetching, parsing, caching

- **`_dpFetchText()`, not `fetchHtml()`.** `fetchHtml()` decodes everything as
  UTF-8 (`res.text()`). jungleland.it serves windows-1252 with no charset, so
  the bytes are decoded with the response's charset, else the host's
  (`_DP_SITES[…].charset`), else UTF-8. brucespringsteen.it's header says UTF-8
  and wins over its meta tag, as on the list. A transient status is retried
  once.
- **Rate gate `_dpAwaitSlot()`**, `_DP_SPACING_MS` (1 s) apart, reserved
  synchronously like `_relAwaitRateSlot()`. A hover that has moved on by the
  time its slot comes up makes **no request**: `_dpGet()` asks every waiting
  caller's `wanted()` first and returns `{outcome: 'skipped'}`.
- **Outcomes**, as the Relationships fetches: `ok` (cached), `error` (NOT
  cached: a failed request, or a page with none of a detail page's parts, e.g.
  a CloudFlare challenge), `skipped`. Callers of one URL share one request.
- **Cache:** `_dpMem` (this session), then IndexedDB `vz-saed-detail-pages`,
  store `pages`, keyed by URL, `{url, v, at, data}`, used for `_DP_TTL_MS`
  (30 days) and only when `v === _DP_PARSER_VERSION`. **Bump that version when
  a parser's output changes**, or users keep seeing the old fields for a
  month. It is deliberately NOT a store in the art cache: that would bump
  `_ART_IDB_VERSION` on MusicBrainz too. The dialog's ⟳ fetches again,
  bypassing both tiers.

Every parser returns the same record, `_dpEmpty()`'s shape: `title`,
`subtitle`, `fields` (label/value pairs, in page order), `tracks`
(`{disc, pos, title, from}`), `notes`, `images` (`{thumb, full, label}`),
`cover`, `sections` (`{label, text}`), `highlight`, `unnumbered`, `excerpt`
(`{label, lines, total}`: the card's opening lines of a long text) and
`summary` (a paragraph for the card only, since the dialog shows it inside a
section). The card and the dialog render only that shape, never a host's
markup.

### The parsers (all probed 2026-10-07; fixtures from `debug/detail-*`)

- **`_dpParseSl()`**: the info block is the same `div.blog-post` card the list
  shows, so `_slFindCards()`, `_slReadCardFields()` and `_slCardSubtitle()`
  apply. The site's unknown "–" / "– (–)" values are left out. The tracklist
  is the `span.monospaced` DIRECTLY after the card's `div.divide30`; the
  artwork section's own `span.monospaced` ("300 dpi scans") and the info-file
  one are not it. `_dpSlTracklist()` splits it: headers ("Disc 1:", "Side
  A:"), numbered lines (`_DP_TRACK_RE`; one to three digits, so "1975 - …" is
  a note), then notes by paragraph. With no numbered line at all, a first
  paragraph of three or more title-like lines is an UNNUMBERED tracklist
  (bootleg 1331); an all-capitals line may end in a dot there ("BORN IN THE
  U.S.A.").
- **`_dpParseSlSong()`** (reached from `_dpParseSl()` for `lyrics.php`): a
  song page has no card. In `.project-detail`: an `<h3>` title, a `<p><em>`
  version ("Album version"; empty when unknown), then between the first two
  `<hr>`s the lyrics `<p>` (a `<br/>` per line, a blank line between verses,
  `span.text-info` stage notes) or an `alert-warning` "Lyrics not available"
  (that becomes the note). Then `h3.heading` sections, each up to the next
  heading, album sub-headings included (Info, Writing and Recording,
  releases, Live History, Covers, Credits / References, Available Versions).
  The site's "SECTION NOT YET COMPLETED" lines are dropped. Available
  Versions gives the field "Versions on the site" (its `span.monospaced`
  lines). Info's first paragraph is the card's `summary`, and the first four
  sung lines (stage notes left out) its `excerpt`. Every lyrics-index row links
  its own version's page, so the card describes exactly that version.
- **`_dpParseJl()`**: `<a>Title|Date|Uploader: …</a>` lines; "0000-00-00" is
  the site's unknown date and is left out. Scans are
  `..\artwork\<decade>\thumb\tn_<stem>_<label>.jpg` with backslashes
  (`_dpAbsUrl()` turns them); the label (front, back, cd1, booklet1) is the
  part after the last `_`. Paths with "ö" resolve to UTF-8 percent-encoding,
  which the server accepts (checked: both `%F6` and `%C3%B6` answer 200).
- **`_dpParseBs()`**: the run of `Label: <b>value</b><br>` after "Title  :",
  read as a list (bootleg and official records use different labels). The
  tracklist table is found by its header CELLS: the row's `textContent` is
  "PosTitleFromNotesVer", where `\bPos\b` never matches. Its From column writes
  `"` for "same as above" (carried down) and a "/1" show index (dropped).
  Links are `href="#"` script calls; only their text is kept. A photo, when
  there is one, is `..\blegs\images\<code>.jpg`, often missing.
- **`_dpParseBb()`**: `#page-title`; the origin is the text of
  `#page-content` before the tabview; the tabview pairs label i with panel i,
  as on the song list, and panels are read by label (Performances, Released
  on Album, Released as Live Download; Credits, On The Tracks and Lyrics as
  whole sections for the dialog).

**`_dpBlockText()` collapses the source's whitespace before it turns `<br>`
into a line break.** The sites write `line<br />\nline`; keeping that
newline beside the `<br>`'s gave every line a paragraph of its own, and bootleg
1331's tracklist came out as 36 notes. Pinned by a mutation.

## The card (`#mb-dp-peek`)

A `.mb-tt-liner` card, its own element and controller, NOT a `data-mbtt-fn`
case of `_initStatTooltip()`: that engine shows a resolver card at once and
synchronously, and this one needs the delay (`sa_rich_tooltip_delay_ms`,
default 400 ms, so a pointer crossing the table requests nothing), a loading
state, Esc and Space. It is in `_OTHER_RICH_TIPS`, per the rule for every
floating hover tooltip.

- **Placement** (`_dpPlacePeek()`): beside the link (right, else left, else
  below), so the rows under the pointer stay visible as it moves down.
- **Hidden** on leaving the link, on any mousedown, on any scroll, and by
  **Esc** (which stops there: an open dialog under it stays open).
- **Space pins** unless the user is TYPING in a text field: Space within
  `_DP_TYPING_GRACE_MS` (1.5 s) of an `input` event in a field stays the
  field's. **Not "focus is in a field"**: after a render the script focuses
  the global filter itself, so that rule made Space never pin. That was the
  first version, found by the spec, and is pinned by a mutation.
- **Ctrl gate** (`_dpNeedsCtrl()`, `sa_dp_hover_without_ctrl`, default
  false, one setting for all four hosts). The `mouseover` always records the
  link in `_dpPeek.hover`, but schedules the card only with `e.ctrlKey`. A
  Ctrl `keydown` (not consumed, not on repeat) shows the card AT ONCE for
  `_dpCtrlTarget()`: the hovered link if it still matches `:hover`, else a
  `:focus-visible` detail link. Keyboard focus alone shows nothing while the
  gate is on. The tap path is untouched (a touch screen has no Ctrl). Specs
  hold Ctrl in `hover()`; `plainHover()` is the ungated one.
- **Keyboard focus** on a link (`:focus-visible`) shows the card too (only
  with the Ctrl gate off; with it on, Ctrl on the focused link does).
- **A tap** (`_isTouchCompatMouseEvent()` or `_isTouchPrimaryDevice()`) on a
  detail link opens the dialog INSTEAD of the page. A touch screen has no hover;
  the dialog's ↗ opens the page. The hover handler's own tap guard is covered
  by the mousedown hide (recorded `"expect": "pass"`).

## The dialog (`#mb-dp-dialog`)

`createInfoDialog()`'s shell (drag, ✕, Esc, click outside), with
`geoKey: 'sa_dp_dialog_geometry'` (position and size). The title bar adds ‹
row position ›, the Extracted / Live page switch, ⟳ and ↗. Opening it moves
the focus INTO it, out of the global filter, so ← → step through the visible
rows (`_dpRowLinks()`, one detail link per row, in display order). The
current row carries `tr.mb-dp-current`, a transient class taken off by a
`MutationObserver` when `createInfoDialog()` removes the dialog. The class is
on a live row and never written to cell content, so the four post-render
obligations (filter-and-cache-invariants.md) do not apply.

**Live page view.** An `<iframe sandbox="allow-same-origin allow-popups
allow-popups-to-escape-sandbox">` whose `srcdoc` is a cleaned copy of the page
(`_dpLiveDocHtml()`, since 9.99.1265): same origin, so its document is the
script's to change, and NO scripts, so no trackers, no pop-ups and no second
run of the page's own code. The copy:
- has every `<script>` and `<noscript>` removed. Until 9.99.1265 the frame loaded
  the page's URL and the sandbox refused its scripts, and Chrome logged
  "Blocked script execution … sandboxed" once per script (29 on a
  springsteenlyrics.com song page, reported from a real browser);
- has every inline event handler (`on…` attribute) and every `javascript:`
  URL removed (9.99.1266). The sandbox refuses those too, ONE MESSAGE EACH, as the
  page is parsed, click or no click: eight on a Brucebase song page (the
  search box's `onfocus`, the login, report and cookie-settings links'
  `onclick`). Found only from a real browser's console after 9.99.1265; the
  elements and their text stay;
- shows every `<iframe>` as a link ("▶ Watch on YouTube" for a YouTube
  embed): a player cannot start without scripts, and YouTube's fallback image
  then 404'd;
- has no `<meta http-equiv="refresh">`;
- starts its `<head>` with a `<base href>` naming the page, so relative
  links, images and stylesheets resolve as on the site (a page's own `<base
  target>` keeps its target);
- keeps the doctype, so a quirks-mode page (jungleland.it) stays one.

The HTML comes from `_dpRawMem`, the last `_DP_RAW_KEEP` (12) pages' decoded
HTML in this session, which `_dpGet()` fills: **opening Live page after a hover
makes no second request**. Otherwise `_dpGetRaw()` fetches it through the
same rate gate. ⟳ bypasses that memory. A new frame first loads an empty
`about:blank` document whose `load` fires too, so the listener is attached
only once `srcdoc` is set, and `_dpIsolateFrame()` also skips `about:blank`.

`_dpIsolateFrame()` runs on the copy's load:
- it hides every sibling of the host's `liveRoot` and of each of its ancestors,
  plus the `liveHide` selectors. Both go through
  `html.mb-dp-isolate .mb-dp-hide`, which the "Hide the site's navigation" box
  toggles;
- it runs `livePrepare`. Brucebase's tabview cannot switch without its
  scripts, so every panel is shown under an `h3.mb-dp-tablabel`;
- it hides images that failed to load. The pages' own `onerror` handlers do
  not run;
- it makes links open in a new tab.

**Testing it: Playwright's trace recorder also trips the sandbox.** The
config's `trace: 'retain-on-failure'` records every test and injects its
snapshot script into every frame, and the sandbox refuses it with the same
"Blocked script execution" message: once in `about:blank`, once or twice in
`about:srcdoc`, with the userscript switched off as much as on. Bisected on
2026-10-07: a standalone Playwright script and `--trace=off` show none. So
the live spec that counts those messages (`tests/live/detail-preview.spec.js`)
runs with `test.use({ trace: 'off' })`, which Playwright allows only per file.

## Performance

Nothing here is on the filter, sort or render path. The listeners are
delegated on the document and return at once for anything that is not a
detail link. `_dpRowLinks()` walks the table's rows once per dialog step,
which is about 1,900 rows and as many `new URL()` calls on brucespringsteen.it's
unofficial list. That happens on the key press, not on a render.

## Tests

| Spec                                              | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|---------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/detail-preview.spec.js`           | every parser on saved pages (discs, a lineage note, scans; side numbers; the unnumbered list; tracklist shapes the pages lack; jungleland's labelled backslash scans and unknown date; bs's label run, ditto marks, official labels, the photo; Brucebase's count, last show, releases, downloads, sections); the preview off = no card, no request; the Ctrl gate (a plain hover = no card, no request; Ctrl pressed on a rested title shows it at once; Ctrl on nothing = nothing; `sa_dp_hover_without_ctrl` on = a plain hover shows it); MusicBrainz with every preview on = nothing; one request then memory; beside the link; Esc; Space pins; ← → steps with a 404 row; Space TYPED stays typed and render focus does not block the pin; a moved-on hover makes no request; a photo, a failed photo; sl's Live page view with the navigation hidden and the box; jungleland decoded from windows-1252 and read from IndexedDB after a reload; Brucebase's card, lyrics, and Live page with every tab; song pages (version, lyrics by shape, sections without placeholders, versions count; "Lyrics not available"); the lyrics index's card (excerpt and line count as parsed from the fixture), its dialog, and a song without lyrics; the Live page copy (no scripts, inline handlers or javascript: URLs, videos as links, its own base URL, the doctype kept); Brucebase's Live page has no handler left (its fixture has them); the Live page reuses the hover's fetch (one request) and ⟳ refetches |
| `tests/fixtures/detail-preview.mobile.spec.js`    | a tap opens the dialog, not the page, and shows no card                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Fixtures: `python3 scripts/build-detail-fixtures.py` turns the curl captures
`debug/detail-*` into `tests/fixtures/detail-*.html`. It works on bytes, so the
jungleland.it pages stay windows-1252, and it strips scripts, noscripts,
iframes, links and background images. `tests/support/detailFixture.js` serves
them after a list loader's catch-all and answers a detail URL with no fixture
with a 404. Mutation list: `scripts/mutations/detail-preview.json`.

The release-group sources (Phase 1): `tests/fixtures/release-rg-popup.spec.js`
pins the subheader card (plain hover, beside the link, one request), the
window over a 150-release double whose first page holds 90 (offsets 0 and
90), the facts lookup, this release first, covers only where `front` is true,
the sort, ⟳, IndexedDB after a reload, the shared rate gate
(`__saTest.reserveMbRateSlots()`), ← → over the "#" cells, the no-match
window's links and the Live page (`#page` root). Its mobile sibling taps a "#"
cell at its centre: on the zoomed-out Pixel 7 page `visualViewport.offsetTop`
is not 0 and `Locator.tap()` lands on the unstyled header. Mutation list:
`scripts/mutations/popup-engine.json`.

The MusicBrainz entity cards (Phase 2): `tests/fixtures/popup-mb.spec.js` on
the "Greetings From Asbury Park, N.J." release group page
(`releasegroup-releases-multirow-catalog.html`, whose releases split into
sub-tables by status) pins off by default, the Ctrl gate and its "every
preview" switch, what is previewed (`__saTest.popResolve()`), memory then
IndexedDB then the TTL setting (by ageing the stored record), a failure not
kept, a moved-on hover asking nothing (release and release group), the shared
gate, the release window and its Cover Art Archive strip, ⟳, the arrows in one
column across sub-tables, the Live page, and one box at a time. Its mobile
sibling taps a release link. The Web Service answers are real captures:
`python3 scripts/capture-ws2-fixtures.py` writes `tests/fixtures/ws2-pop-*.json`
(the exact request each card makes). Mutation list:
`scripts/mutations/popup-mb.json`. **A native release list's first cell holds
a hidden `/cover-art` link before the release link**: a locator for "the
first release link" must exclude it (`:not([href$="/cover-art"])`), as
`_mbPopTarget()` does.

The live twin, `tests/live/popup-mb.spec.js` (`@extended`), hovers one real
link per kind on five light pages (a release group, a release, an artist's
works and events, the instrument list) WITHOUT "Show all": the engine serves
the native first page's table too. Series, collection, ISRC-in-a-table and
disc ID are fixture-only (no light page links them in a table).

## MusicBrainz: edit and editor cards, read from the page (org/iframe.org, Phase 3)

The Web Service has no edits and no editors, so `edit` and `user` are PAGE
kinds (`_mbPopPageKind()`): `_mbPageLoad()` fetches `/edit/<n>` or
`/user/<name>` through `_dpGetRaw(url, _MB_LIVE, …)` — the one MusicBrainz
rate gate, and the raw-page memory the Live page view reads, so a hover then
Live page costs ONE request — and parses it into a record kept like any card
(`_mbLoad()`, the loader both kinds of card share; `_MB_POP_PAGE_VERSION`:
**bump it when a page parser's output changes**). Paths: `_MB_POP_PAGE_RE`,
the bare edit or profile only (not `/edit/<n>/data`, `/user/<name>/edits`).

- **`_mbParseEditPage()`** reads `.edit-header` (number, type; the editor, or
  "Editor hidden" when logged out), every `table.details` row (`td.old` +
  `td.new` → "old → new"), the vote tally, `#sidebar` (status, Opened, Closed
  or Voting, …) and `div.edit-note`s — `div.`, because the logged-in "add a
  note" form's `<textarea class="edit-note">` matches `.edit-note` too (the
  spec saw "Notes · 2" for one note). Notes and editor show only to a
  logged-in reader (`notesHidden`).
- **`_mbParseUserPage()`** reads the user type, member since, subscribers and
  the Edits statistics, and deliberately NOTHING else of a profile: no email
  line, age, gender, location, languages or bio (org/iframe.org R9).
- **An open edit is memory-only** (`keep: d => d.status !== 'Open'`): its
  votes change. A closed edit and a profile are kept for `sa_pop_mb_ttl_hours`.
- **A page that does not parse** (a login page, an error page) is a failure,
  AND is deleted from `_dpRawMem`: `_dpGetRaw()` remembers every page it
  fetched, and the next try would otherwise re-read the login page without
  asking (found by the spec).
- **An editor link's avatar is not artwork.** MusicBrainz puts an
  `<img class="avatar">` inside every editor link; `_mbPopTarget()` skips links
  around `img:not(.avatar)` only. Found by the live spec: with plain `img`,
  no editor link on a real page had a card, while the fixture's probe links,
  which had no avatar, passed.

**Fixtures and privacy.** `scripts/fetch-mb-page-fixture.js --auth` loads the
live specs' login state for pages that show more (or anything) only when
logged in, and blanks the page's tokens and the logged-in editor's
preferences. Committed: the user's OWN applied edit (logged in, editor and
note shown), an open edit captured LOGGED OUT (no other editor's name or
notes), and the user's own profile logged out with its age, gender and
location rows removed. Never commit another editor's profile.

`python3 scripts/check-mutation-anchors.py` checks, without running a spec,
that every `find` of every mutation list still matches once. Run it after
editing a line a list anchors on: Phase 2's first step changed two lines that
`popup-engine.json` anchored on.

**No song lyrics in the repository** (decided 2026-10-07). The build blanks
every word of a song page's lyrics block to "la" (springsteenlyrics.com: between
the first two `<hr>`; Brucebase: the "Lyrics" tab's panel), keeping tags,
line breaks, punctuation and entities, so the parser sees the same lines and
verses. A "Lyrics not available" alert is left as it is. **Specs assert the
SHAPE of lyrics (sections, line counts, the excerpt as parsed from the
fixture), never lyric text** — fixture and live specs alike. A spec that
quoted lyrics also made a model-generated reply fail with "Output blocked by
content filtering policy" while it was being written.

The live spec also checks the lyrics index. The site throws its own
`Uncaught (in promise) Error: Container is not defined` on its lyrics pages
with no userscript loaded (checked with a bare Chromium, 2026-10-07), and
that one message is exempted, as `sl-lists.spec.js` exempts the site's
`init is not defined`.
