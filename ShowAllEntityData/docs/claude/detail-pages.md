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
page with `sa_pop_mb` or `sa_pop_ext` on (the entity cards and the external
links, below; on a touch-primary device their `_on_touch` twins instead), and
nowhere else, so with those off every other MusicBrainz page gets no
stylesheet, no listener and no database from it. **Since
org/non-MB-sites.org (2026-10-08) both are ON by default on a desktop**, so
the engine is installed on every MusicBrainz page with a pageType unless the
user switches them off. On a phone or tablet the twins, off by default,
decide (`_popSettingOn()`, below). The specs pin that: `"on a MusicBrainz page, every
preview setting on changes nothing"` (every FOREIGN preview setting on, an
`/iswc/` page) and popup-mb.spec.js's `"off when switched off"`.

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
| `liveFailTitle`, a target's `noLive`      | the Live page's failure heading ("Could not load the detail page." unless set; the external source: "the page"); no Live page button for that target (YouTube) |
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
  card waits for Ctrl unless `sa_event_rg_tooltip_without_ctrl` is on (default
  on since org/non-MB-sites.org: a plain hover is enough); ‹ › step
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
org/iframe.org answer 6), behind ONE setting, `sa_pop_mb` (default off by
answers 1 and 3, default ON since org/non-MB-sites.org, 2026-10-08). Its card
waits for Ctrl through `_dpNeedsCtrl()` (`sa_dp_hover_without_ctrl`,
relabelled "every preview", answer 2) unless that is on — which it is by
default since the same change. A tap opens the window, as on the foreign
hosts (kept, decided 2026-10-07).

- **Touch twins: `_popSettingOn(key)`.** Every read of `sa_pop_mb`,
  `sa_pop_mb_page` and `sa_pop_ext` goes through it. On a touch-primary
  device (`_isTouchPrimaryDevice()`) it reads `<key>_on_touch` INSTEAD of the
  key, so the twin REPLACES the plain switch, it does not gate it (decided
  2026-10-08). On a desktop it reads the plain key, and the twins do nothing.
  The twins default to off: an enabled source turns a tap into "open the
  window" (`_initDetailPreview()`'s click handler), which with the plain
  switches on by default would take ordinary link navigation away from
  every phone. A new MusicBrainz-side preview switch goes through the same
  helper and gets its own `_on_touch` checkbox. Pinned by
  `popup-mb.mobile.spec.js`, `popup-ext.mobile.spec.js` and
  `scripts/mutations/popup-touch-twins.json`.

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
  (9.99.1274); event — card `artist-rels+place-rels+event-rels+series-rels+url-rels`
  (the setlist is a field of the event; the three later includes since WIP.2 for
  "Part of" — an event's `parts` backward, whose target carries its `life-span`,
  shown as "(2026-06-04 – 2026-06-05)" — and the window's "URLs": one row per
  relationship type, each address in full plus an "[info]" link to
  `/url/<id>`; 6.3 KB for the OceanFirst show), window `recording-rels+release-rels`
  plus the Event Art Archive index
  (`_mbPopArtLoad(_mbPopEventArt, EAA_CTX, …)`, on pin only, R4) plus the area
  chain of "Held at" (below); place — card
  `area-rels+url-rels`, window `event?place=…&limit=100` sorted by date (the
  browse is not); series — one lookup with every item-kind relation (R1),
  items by `ordering-key` (the lookup is not in order) (9.99.1275); ISRC
  (`artist-credits`), ISWC, disc ID and collection — one lookup each, no extras
  (9.99.1276); url, the "[info]" link (U2, section "MusicBrainz URL entities"
  below). Browse keys: `pop:browse:<entity>?<query>` (`_mbPopBrowse()`).
- **Codes** are a second path pattern, `_MB_POP_CODE_RE` (`/isrc/`, `/iswc/`,
  `/cdtoc/`); `_MB_POP_CODE_TYPES` maps the page segment to the kind and Web
  Service path — a disc ID's page is `/cdtoc/<id>`, its lookup
  `/ws/2/discid/<id>`, and the target's `url` (↗, Live page) keeps the PAGE's
  segment. A kind may add `failNote(detail)` to its failure line: a private
  collection answers 401 (the Web Service shows public collections only) and
  its card says "It is probably private." — still not kept, as any failure.
- **The setlist is MusicBrainz's markup** (`_mbPopSetlist()`): `@ ` line-up
  artist, `# ` comment (between artists, the billing word "&"/"with"),
  `* ` song. The window LINKS `[mbid|name]` tokens (`_mbPopSetlistLine()`,
  org/event-GPE.org, WIP.1): every token of an `@` line is an artist; in a
  song line a token is a work, unless it sits inside a `(with …)` /
  `(feat. …)` / `(featuring …)` / `(ft. …)` group, where it is an artist; a
  `#` comment's tokens stay names (the markup says nothing there). The token
  regex is case-INSENSITIVE and the link takes the MBID lowercased: editors
  type mixed-case MBIDs (`[E497263c-…-Dca99482962c|The Fever]` on the Stone
  Pony event `26cead1c…`, 14 of its 44 tokens), which the old lowercase-only
  regex left as raw `[…|…]` text, and `_MB_POP_PATH_RE` (so drill-down)
  matches lowercase only. MusicBrainz's own page links EVERY token of a song
  line as `/work/`, the "with" artists included (`debug/mb-event-initial.html`)
  — not a model to copy. The card keeps names only (plain text). (The
  event-overview page's `_eventSetlistParse()` reads the rendered HTML, a
  different input.)
- **An area is named in its area chain** (`_mbPopAreaChain()`, WIP.2):
  "OceanFirst Bank Center in West Long Branch, New Jersey, United States", as
  MusicBrainz writes it — an event's "Held at" and a recording's "Recorded at"
  / "Mixed at" (`_mbPopPlaceRelHtml()`: the chain right after the place's
  name, before the relation's attributes and dates), and the Area row of a
  place, a label and an artist, plus the artist's Born/Died areas
  (`_mbPopAreaChainHtml()`). The Web Service gives an area without its
  parents, so the WINDOW walks up, one `/ws/2/area/<id>?inc=area-rels` lookup
  per level, following the `part of` backward relation
  (`_mbPopAreaChainLoad(t, areas, …)`, from each kind's `pin()`; the
  recording's once its credits lookup is there), and stops at a Country (no
  lookup for it) or a missing parent, at most `_MB_POP_AREA_DEPTH` levels.
  **A country is told by `_mbPopIsCountry()`**: a relation's area carries its
  `type`, but an entity's own `area`/`begin-area`/`end-area` has `type: null`,
  so there the ISO 3166-1 code decides (only countries have one) — otherwise
  every artist and label in the United States would look up its 26 KB area.
  The key is the area card's own (`pop:area:<id>:area-rels`), so every card
  shares the steps: New Jersey is paid once for every event, studio, label and
  birthplace there, and two chains that meet (two Manhattan studios) share
  theirs. Shown are the start area and the ancestors of type
  City/Subdivision/Country (`_MB_POP_CONTAINMENT_TYPES`) — musicbrainz-server's
  `load_containment` (`Data/Area.pm`, checked 2026-10-08) keeps parent types
  1, 2, 3, which is why "Monmouth County" and the district "Manhattan" are not
  in the line ("Midtown Manhattan, New York, New York, United States"). Probes
  (`scripts/probe-mb-entity-lookups.py --only event-details` and
  `--only area-chains`, 2026-10-08): West Long Branch / Asbury Park / Long
  Branch (City) → Monmouth County (County) → New Jersey (Subdivision) →
  United States; Midtown Manhattan (City) → Manhattan (District) → New York
  (City) → New York (Subdivision) → United States. A CARD makes no area
  request: it shows the chain (`_mbPopAreaChainText()`, `_mbPopHeldAtText()`)
  only when every step is already in memory, else the area's own name as
  before. Cost: a window whose region is new pays about three 1/s rate slots
  more, AFTER its own requests (the artist's links and five counts come
  first).
- **Instruments in relationship lists are links** (`_mbPopRelTargetHtml()`,
  WIP.2, every kind): an instrument attribute's `attribute-ids` value IS the
  instrument's MBID (probe `--only attr-instruments`: trumpet and "drums (drum
  set)" answer 200 as instruments; "lead vocals", "background vocals" and
  "time" answer 404). `_mbPopIsInstrumentAttr()` leaves out names ending in
  "vocals" and `_MB_POP_NON_INSTRUMENT_ATTRS` (MusicBrainz's generic
  attributes). The target's disambiguation follows its name, and an event
  target's days follow it unless its name already starts with that day.
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
  whole sections for the dialog). Released on Album is prose, split into one
  release per line by `_bbReleaseLines()` (2026-10-09, `_DP_PARSER_VERSION` 2).
  A release starts at each `<em>` holding a link (or a bare `/retail:` or
  `/stats:discography` link) and runs to the next one, so its year, kind and
  "(recorded …)" stay with it. The paragraph beginning "Live versions" becomes
  its own field, "Released live on". A paragraph with no such element is kept
  whole.

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
  false until org/non-MB-sites.org made it true on 2026-10-08, one setting for
  all four hosts and the MusicBrainz previews). Specs run with it false: it is
  in `FIXTURE_SETTINGS_OVERRIDE`. The `mouseover` always records the
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

**Images open the artwork viewer (2026-10-09).** A plain primary click on an
image in the window opens `#mb-art-viewer` over it. `_dpArtViewerClick()` runs
from the scroll area's delegated click listener, before `_dpDrill()`, so
nothing needs re-wiring after a repaint. Ctrl, Shift, Alt and ⌘ leave the link
alone, so the image opens in a new tab as before. The thumbnails are marked
when the HTML is built:
- `data-mb-artv-ctx`/`-path`/`-i` (`_mbPopArtvAttrs()`): a release's Cover art
  strip and front cover, an event's Event art strip. The viewer reads
  `ctx.imagesCache` and asks nothing. The front cover is marked only once the
  record is there; until then it stays the `/cover-art` link;
- `data-mb-artv-ext="<n>"`: another site's cover and scans
  (`_dpExtractedCols()`, so also a Springsteen site's record seen from another
  host, U4) and a linked page's picture (`_extLeftCol()`). The click builds the
  list from every such link in the window, in that order, cover first. The
  cover links its scan's FULL image (it used to link the thumbnail it shows).
The dialog passes `keepOpenWithin: ['#mb-art-viewer']`, so a click in the viewer
is not a click outside. Keys need nothing: the viewer's `window`-capture
listener stops Esc and ← → before `createInfoDialog()`'s Esc handler and
`_dpDialogKeys()`. Esc closes the viewer only, and focus returns to the
thumbnail. Another site's images never touch the art IndexedDB and load with no
referrer. The viewer's external mode is described in artwork-caa-eaa.md "Release
page Cover art section and the viewer". The hover card's thumbnails are not
clickable and stay as they are.

**Tracklist columns.** `.mb-dp-discs` is
`repeat(auto-fit, minmax(180px, 1fr))`. Until 2026-10-09 it was `auto-fill`,
which keeps empty tracks, so a one-disc list sat in one ~180 px column and
wrapped its titles next to empty space (springsteenlyrics.com, from a real
browser).

**A field value of several lines** (`\n`-joined) is one line each in the
window (`<br>`, each line escaped) and one "; "-joined run in a card, where
`maxLen` cuts it anyway (`_dpFieldsHtml()`). Brucebase's releases use it
(`_bbReleaseLines()`, below).

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
- has no `<link rel="preload|modulepreload|prefetch|preconnect|dns-prefetch">`
  (2026-10-08): with the scripts gone they only downloaded what nothing used,
  and Chrome logged "preloaded using link preload but not used" for each (a
  YouTube page, reported from a real browser);
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
sub-tables by status) pins off when switched off, the schema defaults (on,
plain hover, page-wide), the touch twin doing nothing on a desktop, the Ctrl gate and its "every
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

## MusicBrainz: beyond table links (org/iframe.org, Phase 4)

- **`data-mb-pop="<kind>:<id>"`** on any element makes it a target
  (`_mbPopTarget()`'s first branch; the source's selector always includes
  `[data-mb-pop]`). Stamp it at pre-processing or in a formatter that runs on
  the SOURCE rows: an attribute survives `cloneNode(true)`, so the re-renders
  keep it for free, and it changes no cell text, so none of the four
  post-render cache duties (filter-and-cache-invariants.md) apply.
  `data-mb-pop-name` names the target for its loading card. The kind is
  looked up as an OWN key of `_MB_KINDS` (an attribute string like
  `constructor:1` must not find an inherited property). A kind's page is
  `k.path(id)` when it has one (a disc ID: `/cdtoc/<id>`), else
  `/<kind>/<id>`. The arrows treat a stamped cell like a link
  (`_mbPopSteps()` looks at `a[href], [data-mb-pop]`).
- **Page-wide scope, `sa_pop_mb_page`** (default on since org/non-MB-sites.org;
  on touch `sa_pop_mb_page_on_touch`, default off): the selector is a
  getter, `[data-mb-pop], #page a[href]` instead of
  `[data-mb-pop], table.tbl > tbody a[href]`, read at every event (no
  reload). Outside a table body `_MB_POP_PAGE_SKIP` leaves out the entity's
  tabs (its "Overview" is a bare entity link), pagination, `nav`, and the
  script's toolbar and menus. `@include` is unchanged (answer 6).
- **Barcode cells** need no stamp: MusicBrainz's own `td.barcode-cell` (plain
  text) is a target as it is (`_mbPopTarget()`'s TD branch; the selector names
  `table.tbl > tbody td.barcode-cell`). Its id is `_findCellBarcodeParts()`'s
  digits as the cell writes them; the `barcode` kind is one release search,
  `release?query=barcode:<digits>&limit=25` (`_mbPopLookupKind({query})`). The
  search index ignores a leading zero (probed 2026-10-08: with and without, the
  same 6 releases). Its page (`k.path`) is the advanced search. The step finder
  considers the cell itself (`[td, ...td.querySelectorAll(…)]`). An invalid
  barcode's own "Liner notes" card gives way to this one (`_OTHER_RICH_TIPS`);
  a click on a grouped cell still toggles its merge boxes (the card hides on
  mousedown).
- **📊 entries** are stamped where the dropdown builds them: a plain entry in
  `renderItems()` and an "Entity info" name entry in `_emitNameSynItem()`
  (`makeValueSynItem()` now returns its element), through
  `_mbPopStampHref(el, hrefs, name)` from the dropdown's own
  `entityNameHrefsMap` — only when the name has exactly ONE href (two areas
  both named "New York": no stamp). Entries keep no value in the DOM, which is
  why the stamp happens at build time. `_mbPopParsePath()` is the one path →
  kind parser for links and stamps. Pinning from an entry closes the dropdown
  (`_dpOpenDialog()`): its z-index 999999 is above the window's 10050. Space
  over a shown card pins (the engine's capture listener runs before the
  dropdown's own Space-toggles-entry). In specs, open a dropdown with its
  column header scrolled into view: it is fixed-position beside its button,
  and opened off screen it stays there (2 of 10 runs).
- **Catalog# → its label.** MusicBrainz's Catalog# and Label cells list
  their values INDEPENDENTLY (unique labels, unique numbers: three labels
  against two numbers on a Greetings row), so a number cannot be paired with
  a label by position — a per-column declaration (the 1b sketch's
  `popTargets`) would mis-pair them. Instead a `span.catalog-number` in a row
  that links a release is a target `catno:<release>~<number>`
  (`_mbPopRowRelease()`); the kind loads the release lookup (the release
  card's own request and cache key), takes the `label-info` whose
  catalog number matches (`_mbPopCatnoKey()`: case, spaces and separators
  ignored, as MusicBrainz compares `catno`), and with ONE label hands over to
  the label kind with a target that keeps the catalog number's key (so
  `_mbPopWanted()` still recognises the card and the window). The label's
  lookup starts from the repaint the release answer causes, only when never
  asked (the `_rgWindowFor()` exception). `liveUrl(t)` on a kind lets the
  Live page be the label's once known.

## Drill-down inside the window (org/iframe.org, Phase 5)

A plain click (left button, no modifier) on an entity link in the
Extracted view shows that entity in the same window (`_dpDrill()`, delegated
on the scroll area, before the source's own `onAreaClick`); the current target
goes on `_dpDialog.stack`. Ctrl/Shift/Alt/middle clicks keep the link's own
new tab. Rules:

- Only links the MusicBrainz cards know, via `_mbPopTarget(a, {inWindow:
  true})` (without it the card and the window exclude themselves), and only
  while `sa_pop_mb` is on (the `mb-entity` source must be enabled — a release
  page's own release-group window then drills too).
- The title is the path of kinds, its last three ("… › Release group ›
  Release"); **← Back**, Backspace and Alt+← pop the stack (`_dpBack()`); the
  answer comes from memory.
- A drilled target (`drilled: true`) never takes the page row's
  `tr.mb-dp-current`: its element is a row of the window's own table.
- ‹ › and ← → step from the PAGE target the drill-down started from
  (`stack[0]`) and drop the path; a target opened from the page
  (`_dpOpenDialog()`) starts a new path. Closing the window clears it.
- The side drawer of the plan was not built (the user, 2026-10-08: the
  window as it is suffices).

## Links to other sites (org/iframe.org "* generalize to URLs", U1)

`_extSource()` serves a link to ANOTHER site behind ONE setting, `sa_pop_ext`
(default on since org/non-MB-sites.org, 2026-10-08, and on touch
`sa_pop_ext_on_touch` instead, default off; its own ⚙️ divider "🔎 EXTERNAL
LINK PREVIEWS"), independent
of `sa_pop_mb`. It sits in `_popSources()` just before `_mbEntitySource()`;
the two never claim the same link (one takes only another origin, the other
only this one). U1 was MusicBrainz only; since U5 it serves the four
Springsteen sites too (section "On the Springsteen sites" below). Design,
probes (X1–X9) and the answers it rests on: org/iframe.org, section "*
generalize to URLs".

- **What is previewed: `_extTarget()`.** An `http(s)` link whose host is not
  the page's (`www.` aside), read from the `href` ATTRIBUTE, never `a.href`
  (the property is normalised; MusicBrainz looks a URL up by its exact
  string, X7). **A protocol-relative `//host/…` is read as https** (since
  U3): MusicBrainz's sidebar writes its Wikidata link that way, and until
  U3's live spec hovered it no such link had a card at all; https is also
  how MusicBrainz stores it. Not the MetaBrainz family or the artwork archives
  (`_EXT_SKIP_HOST_RE`), not a share button (`_EXT_SKIP_URL_RE`), not around
  `img:not(.avatar)`, not in `_EXT_SKIP_SEL` (chrome, `td.mb-rel-cell`, the
  card and the window, `_MB_POP_PAGE_SKIP`). Scope: `_EXT_SCOPE_SEL` (table
  bodies, `table.details`, `.annotation`, `ul.external_links`), plus `#page`
  with `sa_pop_mb_page` — a getter, read at every event.
- **Fetching: `_extFetch()`, never `fetch()`** (another origin, no CORS):
  `GM_xmlhttpRequest` with **`anonymous: true`** — no cookie sent or stored,
  so a card describes the page everyone sees (X9: logged in to Brucebase, the
  cookie request got 3 KB more). At `readyState` 2 a 2xx that is not HTML
  (`type`) or whose Content-Length passes `_EXT_MAX_DOWNLOAD` (`size`) is
  aborted: its headers name it. The body is cut to `_EXT_MAX_BYTES` (512 KB,
  answer 4; every `og:` tag sat within 8.2 KB, X5). Never rejects: failures
  come back as `error` (`refused`, `unreachable`, `timeout`).
  `_extGet()` adds the gate, `wanted()` after the slot, and one retry on a
  transient status.
- **One rate gate per HOST: `_extAwaitSlot(host)`** (`_extSpacingMs(host)`:
  `_EXT_SPACING_MS`, except Discogs' API since U3), reserved synchronously. Never `_relAwaitRateSlot()`: another site, another
  budget. `__saTest.extRateSlotWaitMs(host)` reads it.
- **First contact (answer 7).** With only `@connect *` covering a host,
  Tampermonkey asks the user once before the first request to it (X9, B1).
  So `_extCard()` makes NO request for a host that is neither in
  `_EXT_CONNECT_HOSTS` (the header's own `@connect` hosts: YouTube's, and since
  U3 Wikipedia's, Wikidata's and Discogs' API) nor in
  the GM value `sa_pop_ext_hosts` (hosts that answered once, any status):
  the card says *not contacted yet*, and Space (or a tap, or an arrow in the
  window) makes the request. `_extGet()` remembers a host on any answer with
  a status, never on an error, so a refused host stays unknown. **The gate
  covers a FAILED state too** (`!st0 || st0.status === 'failed'`): a host
  whose try from the window got no answer is still unknown, and a hover
  retrying it would bring the prompt back; its card shows "The last try
  failed: …" instead. The first version gated only a link with no state at
  all (found in review, pinned by a mutation).
  `sa_pop_ext_hosts` is the script's state like `sa_dp_dialog_geometry`: not
  in `configSchema`, not exported (the permission it mirrors lives in that
  browser's Tampermonkey).
- **Readers: `_EXT_READERS`, first match wins** (`_extTarget()` puts the
  reader on the target; its id is in the key `ext:<reader>:<url>`). A reader
  has `kind` (the window's title), `test(url)`, `askHost(url)` — the host its
  request goes to, which first contact checks (a youtu.be link asks
  www.youtube.com) —, `load(t, wanted)` and `noLive`. `_extLoad()` runs the
  reader's load through `_mbLoad()`.
  - **YouTube (`_extYouTubeTest()`, `_extYouTubeLoad()`)**, brought from U3
    into U1 on 2026-10-08 after the user's real playlist link: the PAGE is
    1 MB, 97 % script, bounced through consent.youtube.com when no cookie is
    sent (302, then 303 back with `&cbrd=1&ucbcb=1`), its tags at 769 KB, its
    Live page blank (`scripts/probe-ext-youtube-page.py`). The reader asks
    oEmbed once (`https://www.youtube.com/oembed?format=json&url=<link, https>`,
    `accept` JSON), takes watch (with v), /v/, youtu.be, playlist (with
    list), shorts, embed and live (oembed.com's providers.json); a channel
    or user page stays generic (oEmbed answers 404, U0 X3). 400/401/403/404
    are `dead` with its own `note`; the pill then says "not available"
    unless the status is 404 or 410. `noLive`: the window hides its Live page
    button (`_dpRenderDialog()` forces Extracted for a `noLive` target).
    `www.youtube.com` is in `_EXT_CONNECT_HOSTS` and the header's `@connect`.
  - **Wikipedia, Wikidata, Discogs** (U3): section "Readers of known sites"
    below.
  - **Generic (`_extGenericLoad()`)**: the page itself, `_extRecord()`.
- **Records: `_extRecord()`.** States `ok` (a 2xx page; `moved` only when
  the final HOST or PATH differs — added query parameters such as YouTube's
  consent bounce do not count, and http → https on the same host and path is
  `toHttps`, a quiet "→ https" with a green pill: decided 2026-10-08),
  `dead` (404, 410), `checked` (a bot check, `_extBotCheck()`, **never a
  dead link**, whatever its status; `checkedBy` names the vendor for the
  pill), `http` (any other 4xx), `notpage`, `big`. A bot check is told by
  the vendor's own HEADER, never by status or title: Cloudflare's
  `cf-mitigated: challenge` (a 403; X6 found it in Python on discogs.com,
  allmusic and rateyourmusic, X9 in a real browser only on rateyourmusic),
  AWS WAF's `x-amzn-waf-action` (its CAPTCHA a 405 "Human Verification",
  its challenge a 202 that would pass for an empty page; us.7digital.com,
  reported 2026-10-08, `scripts/probe-ext-refusal.py`). It is checked before
  the status, so even a 5xx bot check is named. No response, a 5xx or a 429
  after the retry is NO record: a failure, not kept, retried by the next
  hover. `_extReadHead()` reads `og:`/`twitter:`/`description`,
  `<title>`, canonical, `lang`, `article:published_time` from the first
  `_EXT_MAX_BYTES`; a field still empty is filled from the rest of the
  downloaded page (`tail` from `_extFetch()`), by picking only the `<title>`,
  matching `<meta>` and canonical `<link>` tags out of it and parsing those
  (decided 2026-10-08: U0 X5's "every og: tag within 8.2 KB" held only for
  the sites probed, not for YouTube).
- **Loading: `_extLoad()` through `_mbLoad()`**, key `ext:generic:<url>`,
  `_EXT_IDB_VERSION`, `ttlMs: _extTtlMs()` (`sa_pop_ext_ttl_hours`, 168,
  answer 1) — `_mbLoad()` and `_rgIdbGet()` take a time to live for this.
  `keep: d => d.state === 'ok'`: everything else stays in `_mbPop` for this
  page load only (answer 2), so a dead link is not asked twice on one page
  and is asked again after a reload. A read page also goes to `_dpRawMem`, so
  hover then Live page is one request.
- **Context at no cost: `_extContext()`**: a `table.details` row's `th`, or a
  `table.tbl`'s "Relationship" column (by header name), plus "of this
  <entity>" from the page path; else *in the annotation* / *in the sidebar's
  external links*. Nothing on a foreign host.
- **Live page: `_EXT_LIVE`.** `_dpGetRaw()` now takes a source's
  `fetchText(url, charset)` and calls `awaitSlot(url)` with the URL, so the
  external Live page goes through `_extFetchText()` (anonymous, remembers the
  host) and the host's own gate. No `liveRoot`: the generic reader knows no
  site's layout, so the whole page shows (a reader may bring its own fields,
  `live`: U3's Wikipedia). Since U3 the Live page reads up to
  `_EXT_MAX_DOWNLOAD`, not the card's 512 KB (a long article showed half). The copy is `_dpLiveDocHtml()`'s
  (no scripts); its CSS and images load from the site. Since 2026-10-08
  `_dpLiveDocHtml()` also drops `<link rel="preload|modulepreload|prefetch|preconnect|dns-prefetch">`
  for every source: without the scripts they only fetched what nothing used
  (Chrome warned "preloaded … but not used" for YouTube's player bundle).
- **Site icons (`_extIconEnsure()`, `sa_pop_ext_favicons`, default on;
  asked for and decided 2026-10-08).** One anonymous request per HOST
  through `_extGet()` (`responseType: 'blob'`, `accept` image, at most
  `_EXT_ICON_MAX_BYTES`), state in `_extIcons`, a found icon kept as a
  `data:` URL in IndexedDB (`mb:ext-icon:<host>`, `_EXT_ICON_VERSION`,
  `_EXT_ICON_TTL_MS` 30 days); `none` stays in memory for the page load.
  `_extIconUrl()` asks ONLY the host the target's own request goes to (a
  CDN would be a new host: Tampermonkey's prompt) and only a known host:
  the page's `<link rel="icon">` (`_extReadHead()` reads it, past the cap
  too) when it is on that host, else `/favicon.ico`; the YouTube reader's
  is www.youtube.com's. The request may start from the repaint after the
  page's answer (only then is the icon's URL known): the `_rgWindowFor()`
  exception, never a failure. The icon covers the initial, which stays
  underneath. `_extFetch()` takes `responseType` for this and answers
  `blob`. The test stub builds a Blob from `base64` + `contentType`; the spec
  turns icons OFF by default so the other tests count only the page's
  request. The known-host check in `_extIconUrl()` is recorded `"expect":
  "pass"`: the first-contact card returns before it asks for an icon.
- **The site's initial (`_extInitial()`)** stands in for the icon while it
  loads, when there is none, or with icons off. It is the first letter of the host's
  name, leading prefixes skipped while two labels remain: `www` (`www2`…),
  `m`, `mobile`, a two-letter country or language. Not "any label up to three
  letters": that took `bbc` from `www.bbc.co.uk` (the spec's first run).
- **Live page failure**: the source's `liveFailTitle`, "Could not load the
  page." (the engine's default, "detail page", is the foreign hosts' word).
- **Tampermonkey's refusal text** (checked 2026-10-08): Firefox `Refused to
  connect to "…": Request was blocked by the user`; Chrome's matched the same
  `refused` pattern. Tampermonkey logs it itself (`injected: … content.js`).
- **Images**: the card's and window's `og:image` is an ordinary `<img>` with
  `referrerpolicy="no-referrer"` (not a `GM_xmlhttpRequest`: an image CDN
  would be one more host for Tampermonkey to ask about).
- **Stepping: `_extSteps()`** — in a table, `_popColumnSteps()` (shared with
  `_mbPopSteps()` since U1) over external links; elsewhere the external links
  of the same `table.details`, `.annotation` or `ul.external_links`.
  `_extStepId()` = row index + the `href` attribute.

**Tests.** `tests/fixtures/popup-ext.spec.js` on `event-overview.html` (its
"URLs" sub-table renders collapsed and the render collapses the annotation's
h2: the spec opens both) pins off when switched off, the schema default, the
touch twin doing nothing on a desktop, what is previewed, first
contact, the card and its context, memory → IndexedDB → TTL, the statuses,
failures and a refused host, a moved-on hover and the per-host gate, and the
window (Live page from the hover's fetch, no script, ⟳, ← →). Its mobile
sibling taps a link. Every external answer comes from the
`GM_xmlhttpRequest` stub (`tests/support/gmStubs.js`), which since U1 logs
each call in `window.__gmXhrLog` (url, anonymous, headers) and answers with
`responseHeaders`, `finalUrl`, `error`, `timeout` or `delayMs`, calling
`onreadystatechange` (readyState 2) first. **Filter the log**: the script's
own changelog check (raw.githubusercontent.com) is in it too. Mutation
list: `scripts/mutations/popup-ext.json`.

## MusicBrainz URL entities (org/iframe.org "* generalize to URLs", U2)

Two halves, one request and one cache key between them:

- **The `url` kind: the "[info]" link.** MusicBrainz writes
  `[<a href="/url/<mbid>">info</a>]` after every URL of a relationship list
  and of the rendered "URLs" sub-table. `url` is in `_MB_POP_PATH_RE` and
  `_MB_KINDS`, so under `sa_pop_mb` it is an entity card like any other
  (table links; `#page` with `sa_pop_mb_page`). ONE lookup for card and
  window, `url/<mbid>?inc=_MB_POP_URL_INC` — **every relationship include and
  nothing else**: a url lookup answers 400 to `annotation`, `tags`, `genres`,
  `aliases`, `ratings` (U0 X7). Card: host, address, "N relationships",
  `_mbPopUrlRelRows()` with `_MB_POP_URL_CARD_NAMES` (3) per row and
  "+ N more"; window: `_MB_POP_URL_WINDOW_NAMES` (100) per row, then
  "+ N more" links `/url/<mbid>`. Live page `/url/<mbid>`. While it loads the
  card is named after the external link just before it (`_mbPopUrlNameOf()`,
  through the kind's optional `nameOf(a)`), not "info".
- **Rows by type, direction and entity kind** (`_mbPopUrlRelRows()`), each
  entity "Kind: name". **A release group is `release_group` twice**: the
  target type AND the entity's key in a url lookup
  (`ws2-pop-url-sl-bootlegs.json`, captured 2026-10-08), only its page is
  `/release-group/`. `_mbPopRelKind()` gives the page segment,
  `_mbPopRelEntity()` the entity (both spellings tried);
  `_mbPopRelTargetHtml()` takes that entity as a third argument. The first
  version read `r['release-group']`, as `_relWriteResult()`'s comment
  records for another lookup, and every release group dropped out of the card
  (found by the spec; pinned by a mutation).
- **"MusicBrainz knows this URL"**, a section of an external link's WINDOW
  (`_extExtracted()`), never of its card: one request per pinned link, not per
  hover (pinned by a mutation that asks from the card). `_extMbQuery(t)`: by
  the MBID of the "[info]" link right after the link on the same line
  (`_extInfoMbid()`: the next `<a>` before a `<br>`; any other link stops it,
  so an "[info]" never describes the link before the one it follows) — the
  "[info]" card's own key, so either answer serves the other — else
  `url?resource=<href ATTRIBUTE, verbatim>&inc=…` (exact match but for the
  host's case, U0 X7: `a.href` would add a `/` to a bare origin), key
  `pop:url:<href>:<inc>`. Null on a foreign host (U5). Loaded by
  `_extMbLoad()` through `_mbLoad()` and `_rgWsGet()` — the ONE MusicBrainz
  gate, never the site's — with `wanted()` the window still on that link.
  **A 404 is an answer**, `{notFound: true}`: "Not in MusicBrainz", plus "it is
  only in the annotation" on an annotation link; kept for this page load
  only (`keep`), like a dead link (answer 2). The section shows in every state
  of the site's answer (loading, failed, dead): a dead link's window still
  says which entities point at it. It needs `sa_pop_ext` only, not `sa_pop_mb`
  (a drill-down from its links does).
- **`_MB_POP_PAGE_VERSION` 2**: `_mbParseEditPage()` collects an edit's
  entities with `_MB_POP_PATH_RE`, which now matches `/url/`.

**Tests.** The "MusicBrainz URL entities (U2)" block of
`tests/fixtures/popup-ext.spec.js` and the second test of its mobile sibling
(a tap on "[info]" opens the window). Web Service answers are captures
(`scripts/capture-ws2-fixtures.py`: `url-setlist`, `url-setlist-resource`,
`url-schedule`, `url-sl-bootlegs`); `openEvent()` answers `/ws/2/url`
lookups from them, else 404, and logs each with its time. Mutations: the
`U2:` entries of `scripts/mutations/popup-ext.json`.

## Readers of known sites (org/iframe.org "* generalize to URLs", U3)

Three readers in `_EXT_READERS`, before the generic one, each ONE request
to the site's API through `_extGet()` (anonymous, the host's gate, `wanted()`
after the slot). An API says as data, in a few KB, what a card wants; the
pages are hundreds of KB, or say nothing in their `<head>` (a Wikipedia
article has `og:title` only, U0 X1). Their hosts are in the header's
`@connect` and `_EXT_CONNECT_HOSTS` (`wikipedia.org` covers every language's
subdomain, matched by `endsWith`), so a hover loads them from the first time.

- **The record: `_extApiRecord()`**, `_extRecord()`'s shape plus `facts`
  (label/value pairs: the card shows `_EXT_CARD_FACTS`, the window all, under
  "<site> says" in place of the generic "The page says") and `links`
  (label/URL pairs, the window's "See also"). **`_extApiOutcome()`** turns
  any answer but a 200 into the reader's outcome: no answer, a 5xx or a 429
  is a failure (not kept), a bot check is `checked`, a 404/410 `dead` with
  the reader's own `note`, any other status `http`. `_EXT_AGENT` names the
  script for both identifying headers.
- **Wikipedia (`_extWikipediaTest()`, `_extWikipediaLoad()`)**: an article
  link (`/wiki/<title>`, not `Special:`, not the `www.` portal; `m.` too) →
  `https://<lang>.wikipedia.org/api/rest_v1/page/summary/<title>` with
  `Api-User-Agent` (browser scripts cannot set User-Agent; Wikimedia's policy
  asks for this one). The title goes as the link writes it, a `/` encoded as
  `%2F` (or the REST path splits: AC/DC). Card: title, "Wikipedia (<lang>)",
  the opening paragraph (`extract`), the short description ("About"), "a
  disambiguation page" for `type` disambiguation, "Redirected from" only when
  the decoded title differs from the canonical one (MusicBrainz's `%2C` is no
  redirect), the thumbnail; See also: the Wikidata item. **Live page**: the
  reader's own `live`, `_EXT_LIVE_WIKIPEDIA` (`liveRoot` = `#content`: the
  header and menus hidden). A target carries `live` (`_extTarget()`) and
  `_dpRenderDialog()` uses `t.live || src.live`. `liveRoot` is a FUNCTION of
  the document, never a selector (the first version passed `'#content'` and
  `_dpIsolateFrame()` threw).
- **Wikidata (`_extWikidataTest()`, `_extWikidataLoad()`)**: an item link
  (`/wiki/Q<n>`; properties and lexemes stay generic) →
  `w/api.php?action=wbgetentities&props=labels|descriptions|aliases|sitelinks`
  in `_extUiLang()` (the browser's language) and English, the sitelinks
  filtered to those two wikis (U0 X2: 612 bytes, against 229 KB for
  `Special:EntityData`). `missing` (an item that does not exist, still a 200)
  and an API `error` are `dead` ("not available" on the pill); a merged item
  says "Merged into". See also: its Wikipedia articles.
- **Discogs (`_extDiscogsTest()`, `_extDiscogsLoad()`)**: a release, master,
  artist or label page (`_EXT_DISCOGS_PATH_RE`: a language prefix and a slug
  allowed) → `https://api.discogs.com/<kind>s/<id>` with the User-Agent
  Discogs requires. Release/master: artists, released, country, formats
  ("Vinyl, LP, Album, Stereo"), labels with catalogue numbers, genres and
  styles, track count, the primary image; a master links its main release.
  Artist/label: name (Discogs' " (2)" suffix dropped), the profile with
  Discogs' markup removed (`_extDiscogsText()`: `[a=…]`, `[l123]`, `[url]`),
  real name, members, groups, parent label, sublabels. `noLive`: the page is
  another host than the API's, which Tampermonkey would ask about, and the
  API says more. **Rate: `_extSpacingMs()`** — 2.5 s apart without a token
  (25 a minute, Discogs' own `X-Discogs-Ratelimit`, U0 X4), 1 s with one (60:
  the same header answered 60 to `Authorization: Discogs token=…`, probed
  with the user's token 2026-10-08 12:09Z, which also confirms the header
  form).
- **The token: `sa_pop_ext_discogs_token`** (text, default empty), read by
  `_extDiscogsToken()` (trimmed) and sent ONLY as `Authorization: Discogs
  token=…` to api.discogs.com — never in a URL, so `_extGet()`'s debug line
  cannot show it. It is the first **`secret: true`** setting, a new rule
  (docs/claude/settings-and-config.md): left out of the config export, never
  set or blanked by an import, and shown as dots in the dialog
  (`_maskSecretSettingInputs()`, from `_injectSettingsConfigButtons()`'s
  observer, so every entry point gets it).

**Tests.** The "readers of known sites (U3)" block of
`tests/fixtures/popup-ext.spec.js` (which reader takes which link; each
reader's card, window and dead case; the Wikipedia Live page past 512 KB
with the site hidden; the token in the header only, the spacing either way,
no console line with the token), `config-import-export.spec.js` (the token
neither exported nor imported) and `settings-dialog.spec.js` (masked from
both entry points). Answers are captures: `python3
scripts/capture-ext-fixtures.py` writes `tests/fixtures/ext-*.json`
(`{url, status, contentType, body}`, each the exact request a reader builds
for an English browser). Mutations: the `U3:` entries of
`scripts/mutations/popup-ext.json`.

## The Springsteen sites across hosts (org/iframe.org "* generalize to URLs", U4)

Two readers in `_EXT_READERS`, before the generic one; the four hosts are in
the header's `@connect` and `_EXT_CONNECT_HOSTS` (the parent domain covers
`www.`), so a hover loads them from the first time.

- **The four sites' own parsers (`_extDpTest()`, `_extDpLoad()`).** A link to
  a detail page of springsteenlyrics.com, jungleland.it, brucespringsteen.it
  or Brucebase — by that site's own `_DP_SITES[…].isDetailUrl()` — gets the
  card that site's own list shows: the page through `_extGet()` (another
  origin: never `_dpFetchText()`), `_extRecord()` for its status, then the
  site's `parse(doc, finalUrl)`, unchanged, as `rec.dp`. A page the parser
  finds nothing in keeps the generic record. The HTML goes to `_dpRawMem`,
  so the Live page reuses the hover's fetch.
- **Charset: `_extFetch()`'s `charset`** becomes `overrideMimeType`
  (`text/html; charset=windows-1252` for jungleland.it, which names none);
  `_extFetchText(url, charset)` and `_EXT_LIVE.fetchText` pass it on from
  the source's `live.charset`. The test stub logs `overrideMimeType`.
- **Rendering.** `_dpCardHtml()` is now `_dpCardBodyHtml()` plus its foot,
  and `_dpExtractedHtml()` is `_dpExtractedCols()` in two columns plus its
  foot: the foreign hosts' own output is unchanged (detail-preview.spec.js and
  its mutation list), and `_extCard()`/`_extExtracted()` put `rec.dp`'s body
  in the external card and its columns in the window, the link's own parts
  (Link, On this page, "MusicBrainz knows this URL", See also) at the top of
  the right one. The generic left column moved into `_extLeftCol()`.
- **A reader may say more per link**: `liveFor(url)` (its Live page fields:
  the site's own `liveRoot`/`liveHide`/`liveCss`/`livePrepare` through
  `_extDpLive()`), `version` (its IndexedDB records' version: the
  Springsteen reader's is `_EXT_IDB_VERSION * 100 + _DP_PARSER_VERSION`, so a
  parser change is never served stale for a week), `loadingNote` (its loading
  card and window say it).
- **Different origins, different caches.** IndexedDB is per origin: a card
  cached on brucebase.wikidot.com's own list is not seen on musicbrainz.org.
- **The Brucebase date anchor (`_extBbDateTest()`, `_extBbDateLoad()`; U0
  X8).** MusicBrainz links a show as `/<year>#<ddmmyy>`: the year page,
  scrolled to `<a name="ddmmyy">`. `_extBbYear()` reads the year page ONCE
  (as https, which the site redirects http to; `_EXT_BB_MAX_BYTES` 1 MB; 1 to
  7.5 s, hence its `loadingNote`) and `_extBbParseYear()` parses every show
  in it; the year is kept by URL in `_extBbYears` for the page load (a
  failure or skip is forgotten) and in IndexedDB as `ext-bbyear:<year page>`
  (`_EXT_BB_YEAR_VERSION`, `_extTtlMs()`), so a second date of that year,
  even after a reload, costs nothing. A show is the `#page-content` child
  holding the anchor (its bold heading "2025-10-26 - THE STONE PONY, …"
  linking `/gig:`, or `/nogig:` for one that did not take place) and its
  siblings up to the next `<hr>` or anchor (a retail-release table sits
  between shows, after an `<hr>`): the setlist paragraph (" / " between
  titles; none for a cancelled show), `.list-pages-box` notes with their
  `/relation:` people, and the icons naming what the gig page has ("Help Us"
  is a request for information, not one of them). The record is a detail
  record in `rec.dp` (venue, date, the setlist as tracks, People, notes) plus
  the gig page in See also. A date its year page has no show for is `dead`
  ("not available"). Live page: the year page as Brucebase's own Live page
  trims a song page, the show's heading marked (`.mb-dp-anchor`) and scrolled
  to (`_extBbDateLive()`), from the year page's https address
  (`liveUrlFor()` → the target's `liveUrl`, which the source's `liveUrl(t)`
  prefers). **The frame runs no script, so scroll it from the userscript's
  window**: the first version called the frame's own `setTimeout`, which
  never fired (Chrome: "Blocked script execution in 'about:srcdoc'") and left
  the page at its top; `scrollIntoView()` would also scroll the page behind
  the window. Now the frame document's `scrollingElement.scrollTop` is set at
  once and again at `_EXT_BB_SCROLL_AGAIN_MS`. And with the http link as its
  base, the page's own relative form pointed at http from an https copy
  (Chrome: "Mixed Content"). Both reported from a real browser, both pinned
  by mutations.

**Tests.** The "Springsteen sites across hosts (U4)" block of
`tests/fixtures/popup-ext.spec.js`: which reader takes which link; each
site's card from its detail-preview fixture (jungleland.it read as latin1
bytes, as a right decoding gives it, and asked with its charset); a site's
window and its trimmed Live page from the hover's fetch; a Brucebase date
(one year request for three dates, a date with no show, the year from
IndexedDB after a reload; two dates asked while the year page loads share
it — the only test that sees `_extBbYears`, since IndexedDB covers it once
the year is kept), a show's window and marked Live page, and a cancelled
show. Year page fixture: `tests/fixtures/ext-bb-year-2025.html`
(`scripts/build-detail-fixtures.py`). Mutations: the `U4:` entries of
`scripts/mutations/popup-ext.json`. The live spec's Brucebase review is the
date reader's since U4, and its "U4: a work's annotation links" test runs on
https://musicbrainz.org/work/55d593ce-52cc-30ec-9494-eca1ab879f5c ("Born in the
U.S.A."): Brucebase's and springsteenlyrics.com's song pages in the
annotation, the Wikidata item, and the English Wikipedia article in the box
MusicBrainz's own script adds after the page (outside a table, so the test
switches `sa_pop_mb_page` on and waits for it).

## On the Springsteen sites (org/iframe.org "* generalize to URLs", U5)

`_extSource()` serves the four foreign hosts too (answer 6: every off-site
link there, not only the other Springsteen sites). `enabled()` is
`sa_pop_ext` alone: on a foreign host the script runs only past that site's
own `sa_enable_<site>` gate, and the engine installs only where the script
has a pageType (`_initDetailPreview()` at the end of initialization).

- **Scope: `_DP_SITES[host].extRoot`.** The selector on a foreign host is
  `table.tbl > tbody a[href]` plus `<extRoot> a[href]`: springsteenlyrics.com
  `.project-detail` (its text), Brucebase `#page-content` (the wiki's text),
  none for jungleland.it and brucespringsteen.it (their lists link no other
  site). Stepping (`_extSteps()`) uses the same root as its block. The census
  of the fixtures (2026-10-08) chose these: springsteenlyrics.com's intro
  text links Brucebase, its `.top-bar` and `.footer-col` Facebook, X and
  Reddit; Brucebase's song list links estreetshuffle.com in a tab, wikidot's
  `#top-bar` menus, `#login-status` and `#footer` wikidot's own pages.
- **Chrome stays out — by the scope first.** On all four sites the share
  bars, menus, login status and footers sit OUTSIDE the table and the
  `extRoot`, so the scope alone leaves them out. `_EXT_SKIP_SEL` also gained
  `.top-bar`, `#top-bar`, `.footer-col` and `#login-status` as a second line,
  for a site that ever puts a share bar inside its text; the mutation that
  removes them is recorded `"expect": "pass"` (the spec cannot see it while
  the scope covers for it).
- **The site's own links stay its own**: the host comparison (`www.` aside,
  lower case: jungleland.it writes its own host in capitals) leaves them to
  the detail-page source, `_dpSiteSource()`, listed first.
- **No MusicBrainz parts there**: `_extContext()` says nothing and
  `_extMbQuery()` is null on a foreign host — the Web Service is MusicBrainz's
  origin, and a relative `/ws/2` path would be the foreign site's.
- **A link to another Springsteen site** gets that site's card through U4's
  readers, from any host (springsteenlyrics.com → Brucebase's song card).
- **Where it cannot help**: springsteenlyrics.com's bootleg INTRO page, where
  the census found its Brucebase links, has no pageType, so the script and
  the engine stop early there; its list pages have the same `.project-detail`
  and get cards.
- **Caches**: IndexedDB is per origin, so each site keeps its own
  external-link records; the known hosts (`sa_pop_ext_hosts`) are a GM value,
  shared by every site the script runs on.

**Tests.** `tests/fixtures/popup-ext-foreign.spec.js` (off when switched off; what
is previewed — the text's link, not the share bar, footer, menus or login
status, not the site's own link, not a link outside the content area; a
link to Brucebase from springsteenlyrics.com with Brucebase's card and no
Web Service request; Brucebase's estreetshuffle.com link) and
`popup-ext-foreign.mobile.spec.js` (a tap opens the window). Mutations: the
`U5:` entries of `scripts/mutations/popup-ext.json`.

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
