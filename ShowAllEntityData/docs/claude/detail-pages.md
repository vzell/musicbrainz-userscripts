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

| Host                  | Setting                | Detail links                                                                                                        |
|-----------------------|------------------------|---------------------------------------------------------------------------------------------------------------------|
| springsteenlyrics.com | `sa_sl_detail_preview` | `collection.php`/`bootlegs.php`/`brucelegs.php` with `item=N`; `lyrics.php?song=SLUG` (the lyrics index, 9.99.1264) |
| jungleland.it         | `sa_jl_detail_preview` | `/html/*.htm` except list, images, artwork                                                                          |
| brucespringsteen.it   | `sa_bs_detail_preview` | `/DB/detrec.aspx?code=`                                                                                             |
| brucebase.wikidot.com | `sa_bb_detail_preview` | `/song:<slug>`                                                                                                      |

All four default **off** and sit under their host's own `sa_enable_<site>`
setting, which still has to be on.

**Scope (WIP.4, 2026-10-12):** `_dpSiteForLink()` takes a detail link in a
`table.tbl > tbody` as before, AND — on a desktop — one anywhere on the page
outside `_DP_PAGE_SKIP` (the script's toolbar and menus, the card, the
window): the initial page, before any button, has the site's own lists
(Brucebase's song tabview), and they preview like the table's rows. ‹ › from
such a link walk `_dpPageLinks()` (the visible detail links, each URL once, in
page order; a tabview's hidden panels are skipped) instead of a table. On a
touch-primary device only the table body counts: a target turns a tap into
"open the window", and a native link keeps its navigation — the reason
`sa_pop_mb_page_on_touch` is off by default. Spec: detail-preview.spec.js
"the initial page, before any button" (+ mobile); mutations
`scripts/mutations/foreign-ip-popups.json` (5/5). `_DP_SITES` is keyed by `_foreignHost`,
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

**Gate order (2026-10-21, 9.99.1402, org/initial-page-footprint.org):**
1. `sa_pop_enabled` (master, default on), at the call site
   `if (pageType && headerContainer && …) _initDetailPreview()`: off, the
   engine is never installed — no listener, no `#mb-dp-style`, no request,
   on every host.
2. `_initDetailPreview()` itself installs only when some source is enabled.
3. `sa_pop_initial_page` (default on), FIRST in `_popResolve()`: off, on
   MusicBrainz (`!_foreignHost`) nothing resolves while `!isLoaded` — the
   initial page, before a button rendered the table or a disk load drew
   one. `isLoaded` is declared far below; reading it at event time only is
   safe because the init IIFE is synchronous. Foreign hosts ignore it.
4. Each source's `enabled()` (the `sa_pop_*` keys), then `needsCtrl()`.

The card and the dialog are an engine that serves SOURCES (`_popSources()`,
built once; `_popResolve(node)` finds the first enabled source whose
`selector` matches `node.closest()` and whose `resolve()` accepts it, and
returns a TARGET `{src, el, key, url, …}`). The four foreign sites are one
source each (`_dpSiteSource()`, the behaviour above, unchanged); a MusicBrainz
release page adds two (below). On Brucebase the MB-Event glyph is one
(`_bbMbevSource()`), on discogs.com the MusicBrainz icons are one
(`_dgMbSource()`, 2026-10-24: MusicBrainz's cards from another origin,
docs/claude/discogs.md "The MusicBrainz column"). A source has:

| Member                                | What it is                                                                                                                                                     |
|---------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `selector`, `resolve(el)`             | which element it previews (a link, or a container such as a "#" cell), and that element's `{key, url}`, or null                                                |
| `enabled()`                           | its host and settings, read at every event                                                                                                                     |
| `needsCtrl()`                         | whether its card waits for Ctrl (the foreign sites: `_dpNeedsCtrl()`)                                                                                          |
| `card(t, start, repaint)`             | the card's HTML for the CURRENT state, at once                                                                                                                 |
| `extracted(t, start, force, repaint)` | the Extracted view's HTML, the same way                                                                                                                        |
| `live`, `liveUrl(t)`                  | the Live page view: `_dpIsolateFrame()`'s fields, plus `charset` and `awaitSlot` (the rate gate `_dpGetRaw()` waits on)                                        |
| `liveFailTitle`, a target's `noLive`  | the Live page's failure heading ("Could not load the detail page." unless set; the external source: "the page"); no Live page button for that target (YouTube) |
| `steps(t)`, `stepId(el)`              | what ‹ › step through, and an identity that survives the `cloneNode(true)` re-renders                                                                          |
| `kind`, `wide`, `onAreaClick(e, t)`   | the dialog's title, a wider card, a click in the Extracted view (a sortable header)                                                                            |
| `stack(t, start, repaint)` (optional) | cards of its own in the note stack, right above its card: `[{kind, html, target?}]`; a `target` gets its kind line (`_dpFillNotes()`; the "#" cell's event)    |

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
  - **Its stacked event card (`stack`, `_eventRgEventStack()`, 2026-10-21,
    mockup https://claude.ai/artifact/JekitWKi2rFCiC7r3HYzru, decision 2
    variant A; `sa_event_rg_event_card`, default on).** Above the release
    group card, as the last box of `#mb-dp-notes`: the event the row's
    "Recorded at event" cell links (`_eventRgEventLink()`, by column name
    through the findings plan, NEVER the row's first event link: the title
    cell's own `dl.ars` links events too), shown as `_MB_KINDS.event.card()`,
    the same lookup, IndexedDB cache and rate gate as the event link's own
    preview. Its target is `_mbPopTarget(a)` with `el` set to the HOVERED "#"
    cell, because `_mbPopWanted()` drops a request whose element shows no card
    at its rate slot; `src` is `_EVENT_RG_EVENT_SRC` (`mb-entity`, so the
    kind line gets the event glyph). `_dpShowPeek()` fills the notes without
    `start` before the card, and again WITH `start` after the card's own
    `card(t, true)`, so the release-group search or browse keeps the first
    rate slot. Every repaint refills the stack without `start` (a failed
    lookup is asked again by the next hover only). A row that links no
    event (the event named only in a comment has no MBID) stacks nothing.
    The box is `.mb-dp-note-event`, with a card's padding and border, not a
    note's left rule. Its body's CSS comes from extending the card's
    `:is(#mb-dp-peek, …)` selector lists with `.mb-dp-note-event`, not from
    copies. Covered by `release-event-colours-rg-tooltip.spec.js` "the "#"
    card's stacked event card" (fixture answers
    `ws2-pop-event-{brixton-0424,rah-0422}.json`, from
    `scripts/probe-event-card-fixtures.py`, routed by
    `tests/support/eventLookups.js`, which `release-rg-popup.spec.js` uses
    too, so no spec that hovers a "#" cell reaches the network); mutation
    list `event-hash-event-card.json`.

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
  org/caa-artwork-requests.org F1), and load lazily. Each is a sidebar-cover
  trigger since 2026-10-24 (`_mbPopCoverThumbHtml()`: card of that release's
  images, click or Space the viewer; see the collection cards below), and so
  is the group's own cover on the left.
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
  wrapping an `<img>` (artwork has its own preview), except a Relationships
  icon (`td.mb-rel-cell`, a "single from" release group, since 2026-10-26;
  its image IS the link, as for the column's links to other sites since
  2026-10-17; named by `_relLinkName()`, because its text is the hidden
  filter key). Not inside the card or the window, and only a kind
  `_MB_KINDS` knows. Such an icon's `href` is fully qualified
  (`_relAppendIcon()`'s `href` argument), while its filter key stays the
  bare path that `_findCellRelIcons()` and `_findCellRelSiteDupes()` read. Its target carries `type`, `id`, `kind` (the window's
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
  (`artist-credits`), ISWC and disc ID — one lookup each, no extras
  (9.99.1276); url, the "[info]" link (U2, section "MusicBrainz URL entities"
  below); tag and collection, read from their pages (sections "MusicBrainz:
  tag cards" and "MusicBrainz: collection cards" below).
  Browse keys: `pop:browse:<entity>?<query>` (`_mbPopBrowse()`).
- **Pictures** (artist, label, place; `sa_pop_mb_image`, the sidebar overhaul's
  part 4): the window shows the entity's Commons picture, from an `image`/`logo`
  relationship or the Wikidata item's P18/P154 (`_mbPopImageLoad()`, from
  `pin()` only), and a later card shows it from memory or IndexedDB
  (`_mbPopImagePeek()`, `spec.cardAside`). A hover never asks Wikidata. Full
  rules: docs/claude/sidebar.md, "The picture in the entity previews".
- **Codes** are a second path pattern, `_MB_POP_CODE_RE` (`/isrc/`, `/iswc/`,
  `/cdtoc/`); `_MB_POP_CODE_TYPES` maps the page segment to the kind and Web
  Service path — a disc ID's page is `/cdtoc/<id>`, its lookup
  `/ws/2/discid/<id>`, and the target's `url` (↗, Live page) keeps the PAGE's
  segment. A kind may add `failNote(detail)` to its failure line (a page
  kind too, `_mbPopPageKind()`): a collection we may not see says so ("It
  may be private, or no longer exist.") — still not kept, as any failure.
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
  regex left as raw `[…|…]` text. `_MB_POP_PATH_RE` accepts uppercase hex
  too since WIP.3 (2026-10-12: the event page's own setlist links keep the
  case the editor typed, and were no preview target), and every reader
  lowercases the MBID, so one entity has one cache key and one lookup. MusicBrainz's own page links EVERY token of a song
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
  card shows). Since WIP.1 (2026-10-16) the same holds for the CELL's own
  tip (a finding, "no work"), which used to show beside or under the card
  depending on which of two equal timers fired first. Its text is a box of
  the card's note stack now, and its card comes back once the preview card is
  gone ("The note stack" under "The card" below).

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
  whole. Since 2026-10-23 (`_DP_PARSER_VERSION` 3, org/foreign-images.org
  phase 3) a song record carries its gallery images (`_bbPageImages()`:
  graph, lyric sheets), and any OTHER Brucebase page goes to
  `_dpParseBbPage()`, which the foreign-image card of the year table's
  Media icons asks for (docs/claude/brucebase.md, "Images: the Media icons
  and the song glyph"). `_DP_PARSER_VERSION` 4 (2026-10-24): a
  `files:setlist-YYYY` image is of kind Setlist. Version 5 (the same day):
  such an entry page has fields and sections, and any text link to one
  previews it under its own setting (`ownLinks`, `_dpOwnLinksOn()`,
  `sa_bb_event_preview`) while `isDetailUrl` stays `/song:`
  (docs/claude/brucebase.md, "Entry pages preview under their own
  setting"). Version 6: a record may be `collapsible` (sections as
  `details.mb-dp-sec`, `_dpSecState`) and `imagesByKind` (`h5.mb-dp-kind`,
  Photo last), and a section may carry `html` (`_dpBlockHtml()`); a link in
  the window to the host's own detail page opens there (`_dpDrill()`,
  `_dpWinWhat()`, `_dpSiteForUrl()`). Version 7 (2026-10-24): Brucebase
  venue pages have their own reader (`_dpParseBbVenue()`), and an entry
  page names its venue (`venueUrl`), which a site's `via` links (the year
  table's Venue cells) preview in its place: `_dpSiteSource()` keys such a
  target `via:<url>` and reads the two pages in turn
  (docs/claude/brucebase.md, "Venues").

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
- **The note stack (`#mb-dp-notes`, org/TODO.org "stacking multiple rich
  tooltips", WIP.1, 2026-10-16).** The track/recording name note below was
  the first box stacked above the card; it is now one box of a column of
  them, `#mb-dp-notes` (fixed, flex column, 4 px gap, its own z-index, since
  a fixed box is a stacking context of its own). `_dpCollectNotes(t)` builds
  them from `_dpTitledChain(t.el)`: the card's element and every titled
  ancestor up to its table cell (the cell included). "Titled" reads
  `_dpTitleText()`: `title`, a title this engine parked
  (`data-mb-dp-saved-title`), or one `#mb-stat-tooltip` stashed
  (`data-mb-tip-saved`). Top to bottom (decided 2026-10-16):
  - the cell's tips, outermost first. A `data-mb-tip` element (a finding's
    tip from `_writeFindingAttrs()`, `_NO_WORK_FLAG_TIP`) is rendered with
    `_tipTextToHtml()`, exactly as the "Liner notes" card it replaces
    (`.mb-dp-note-tip`, amber rule). A native title is plain text;
  - the link's own title: the "≠" note as `#mb-dp-origin` (below), its own
    `data-mb-tip` as a tip, else plain text (`.mb-dp-note-title`). On an
    artist or label target it is MusicBrainz's sort name and is labelled
    "Sort name". A title that only repeats the link's text (MusicBrainz's on
    a recording with a disambiguation, debug/expand.html) gets NO box.
  - last, the link's own ready-made card: a `data-mbtt` ON THE LINK (the
    Sidebar cards' links, `_sbLinkTip()`, 2026-10-17), its HTML as is
    (`.mb-dp-note-tip`). Before, that card and the preview showed side by
    side (vzell's browser, "Tougher Than the Rest"). Only the link itself:
    a `data-mbtt` on an ancestor is no note. Nothing is parked for it:
    `#mb-stat-tooltip` gives way (below) and does not show it again over the
    preview when the pointer comes back onto the link (the mouseover branch
    for `data-mbtt` checks `_dpPeekShown() && _dpPeek.link === el` and keeps
    the link as its target, so `resume()` can show it afterwards).
  - **Every** title of that chain is parked while the card is due or shows
    (`_dpStashTitles()`, from `_dpSchedulePeek()` and `_dpShowPeek()`), and
    `_dpRestoreTitles()` gives them back by sweeping
    `[data-mb-dp-saved-title]` (clones included). This **supersedes** the
    "Only the note is parked" rule of 2026-10-09: those titles had no box of
    their own then, and the browser drew them over the card (images 21-23 of
    the TODO: "Born to Run", "Springsteen, Bruce"). A title already stashed by
    `#mb-stat-tooltip` (an empty `title`) is left to that engine.
  - **`#mb-stat-tooltip` gives way** through `_statTipApi` (declared beside
    `_dpPeek`, assigned in `_initStatTooltip()`): `_dpShowPeek()` calls
    `yieldTo(el)`, which hides an own card whose element contains the link,
    or the link's own `data-mbtt` card (stash kept, hover not dismissed);
    `_dpHidePeek()` calls `resume()`, which shows an own card again after the
    usual delay (a link's `data-mbtt` card at once, as it first showed) if
    the pointer is still on its element and the hover was not dismissed by a
    mousedown. Pinned for `data-mbtt` by `sidebar-search-card.spec.js`
    "HOVER STACK" (three mutations in `sidebar-search-card.json`). `_showOwn()`
    also returns while a card is DUE for a link inside its element. That
    guard only removes a moment in between, since both timers use
    `sa_rich_tooltip_delay_ms`, so its mutation is `"expect": "pass"`.
  - Writers respect the park: `_setTip()` on a parked element writes into
    `data-mb-dp-saved-title`, and `_writeFindingAttrs()` counts a parked
    title as the cell's title and removes it with the finding tip. Readers
    that run only on a click (`_buildDiskCellData()` reading `cell.title`)
    are safe: a mousedown hides the card, which restores the titles first.
  - **Entity glyphs** (`_MB_KIND_ICON`, `_mbKindIconUrl()`): MusicBrainz's own
    `/static/images/entity/<stem>.svg`, same origin, browser-cached, outside
    the WS/2 rate gate. Probe 2026-10-16 (vzell-lap, curl): artist, release,
    release_group, recording, work, label, area, place, event, series,
    instrument, genre, collection and editor answer 200; url, isrc, iswc,
    cdtoc and `release-group` answer 404. Those kinds have none. The card
    (superseded 2026-10-21, see "The kind line" below): ~~`_dpAddKindIcon()`
    prepends `img.mb-pop-kind-icon` to the first `.mb-tt-title`~~. The window: `_dpShowInDialog()`
    puts `img.mb-dp-kind-icon` INSIDE the title-bar span, before the kind path
    (the current kind's glyph). Inside, because the bar is `space-between`, so
    a sibling `<img>` would leave a gap; the span's text stays the kinds alone.
  Covered by `popup-mb.spec.js` "the note stack and the entity glyphs (WIP.1)"
  and its "only repeats its name" control; mutation list
  `gpe-art-viewer.json`.
  - **The kind line (`.mb-pop-kind-head`, 2026-10-21, mockup
    https://claude.ai/artifact/JekitWKi2rFCiC7r3HYzru variant A).** The
    card's first child: the glyph (when there is one) and the kind, a small
    version of the window's title bar, with a hairline under it.
    `_dpAddKindHead()` adds it to `#mb-dp-peek` after EVERY paint (show and
    repaint, in `_dpShowPeek()`): a repaint replaces the card's HTML and the
    line with it. It replaced `_dpAddKindIcon()`, so the glyph is no longer
    inside the title. The text is `_dpKindLabel(t)` (`t.kind || t.src.kind`),
    which `_dpShowInDialog()` reads for its path too, so the card and the
    window never name different kinds. EVERY source gets the line, the other
    sites' cards included ("Discogs release", "Wikipedia", "Detail page"),
    without a glyph, since `_mbKindIconUrl()` returns '' for them. The release
    page's own release-group sources (`_rgLinkSource()`, `_eventRgSource()`,
    `_MB_RG_SOURCE_IDS`) do get the release-group glyph, in the window too.
    `_mbPopCardShell()`'s loading and failed shells no longer repeat the kind
    as a `.mb-tt-comment` under the title. A kind's own comment line ("Rejected
    edits · editor", "Discogs · release") stays: it says more than the kind.
    Covered by `popup-mb.spec.js` "the kind line…", `popup-ext.spec.js`
    "names link their Discogs pages…" and
    `release-event-colours-rg-tooltip.spec.js` "\"#\" card, main event";
    mutation list `popup-card-kind-head.json`.
    **Every box of the note stack has one too** (vzell, 2026-10-21: "there
    should also be a thin horizontal line after the header line"):
    `_dpCollectNotes()` gives each note a `label` ("Finding" for a finding's
    tip, `data-mb-finding-tip`; "Note" for any other tip or title of the
    cell; "Track ≠ recording"; "Link title"; "Link" for the link's own
    `data-mbtt` card and a Relationships icon's box; "Filter"), and
    `_dpFillNotes()` writes it with `_dpPrependKindHead()`, the helper
    `_dpAddKindHead()` uses too (a box with a `target`, the "#" cell's
    event, gets that target's line, glyph included). One CSS rule,
    `:is(#mb-dp-peek, #mb-dp-notes .mb-dp-note) > .mb-pop-kind-head`, draws
    the line and its hairline for all of them.
- **The track/recording name note (`#mb-dp-origin`, 2026-10-09).** jesus2099's
  "mb. INLINE STUFF" gives a release page's recording link a native
  `title="track name: …\n≠rec. name: …"` when the track is named differently
  from its recording. The browser drew that box over the recording card. Now:
  - `_dpStashOriginTitle()` parks the title in `data-mb-dp-saved-title` as
    soon as a card is DUE (`_dpSchedulePeek()`, and `_dpShowPeek()` for Ctrl's
    immediate card). That is before the browser's own delay runs out.
  - The same content shows as `#mb-dp-origin`, a `.mb-tt-liner` box of its own
    STACKED ABOVE the card: same left, 4 px gap, at most as wide as the card.
    `_dpPlacePeek()` places the two as one unit.
  - `_dpHidePeek()` hides the box, and `_dpRestoreOriginTitles()` gives back
    every parked title, including any clone a re-render made of the row
    meanwhile. It sweeps the document only after a stash
    (`_dpPeek.stashed`), so a hide costs nothing on a page without notes.
  - ~~Only the note is parked, because only the note has a box of its own. A
    link's other titles (MusicBrainz's sort names, other scripts') stay; a
    mutation pins this.~~ Superseded by the note stack (above, WIP.1): every
    title has a box now, and every title is parked.
  - The box is now a child of `#mb-dp-notes` (the stack above), built by
    `_dpFillNotes()`; `_dpPlacePeek()` places the whole stack.
  - **The diff view (2026-10-17, org/TODO.org "the rich tooltips should show
    track/recording differences below each other").** `_dpOriginHtml()`
    renders the two names with `_cmpHtml()`: one under the other, only the
    differing runs marked (`mark.mb-tt-cmp-d`, in both rows), and a summary
    line in plain words. The diff (`_cmpDiff()`) is a token LCS refined
    letter by letter inside a replaced pair of similar words, with
    diff-match-patch's "semantic cleanup" idea; below 40 % shared text
    nothing is marked. The same renderer serves every comparison tooltip:
    the findings that name two values, the length mismatch
    (`_cmpLenCardHtml()`), the one-row `kind: 'mark'` card of a truncated
    title (`_cmpMarkHtml()`), the window badge's tip and a foreign site's
    original title, through `data-mb-tip-cmp` (see docs/claude/findings.md,
    "compare rides beside detail"). The note stack shows them too: a cell
    tip goes through `_tipTextToHtml()` there. No parser output changed, so no
    `_DP_PARSER_VERSION` bump. Mockup:
    https://claude.ai/artifact/7Nbqih988jfzpGxbiQTX75 (variant A).
  - `_titleHasRecNameMismatch()` (the 📊 flag and the ⚠️ finding) reads the
    title OR the parked attribute (`_dpOriginTitle()`), so a count, a stamp or
    a clone taken while a card shows still sees the flag.
  - In the window, `_dpShowInDialog()` writes the note as a badge
    (`.mb-dp-origin`) right after the title in createInfoDialog()'s title bar:
    "from track “…” ≠ recording “…”", maroon italic Georgia, ellipsed, with
    the full text as its own tip. It takes `margin-right: auto` in the
    `space-between` bar, so the controls stay right. Along a drill-down path
    it keeps the page target's note (`stack[0]`, where ← → go on from too).
  Covered by `popup-mb.spec.js` (the note and its control); mutation list
  `gpe-art-viewer.json`.

## The dialog (`#mb-dp-dialog`)

`createInfoDialog()`'s shell (drag, ✕, Esc, click outside), with
`geoKey: 'sa_dp_dialog_geometry'` (position and size). The title bar adds ‹
row position ›, the Extracted / Live page switch, ⟳ and ↗. Opening it moves
the focus INTO it, out of the global filter, so ← → step through the visible
rows (`_dpRowLinks()`, one detail link per row, in display order). The
current row carries `tr.mb-dp-current`, a transient class taken off by a
`MutationObserver` when `createInfoDialog()` removes the dialog. The class is
on a live row and never written to cell content, so the four post-render
obligations (filter-and-cache-invariants.md) do not apply. The row is
brought into view VERTICALLY only (`_scrollIntoViewVertically()`): a plain
`tr.scrollIntoView({block: 'nearest'})` also aligns inline, and a row wider
than the window then had its left edge lined up with the window's — on a
Brucebase year page (rows 39 px in) that slid MB-Event under the sticky
Event column every time the window opened or stepped (vzell, 2026-10-24,
from a console log: `scrollIntoView`, then `scrollX 0 → 39.2`). Shared with
MusicBrainz's windows, where a wide table jumped sideways the same way.
`bb-event-preview.spec.js` "never scroll the page sideways" (its fixture
has no theme, so the spec gives the table the real page's 40 px inset).

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

`_dpIsolateFrame()` runs as soon as the copy is PARSED (since 2026-10-17):
the frame runs no script and its new document exists only once the srcdoc
navigation has started, so `_dpIsolateWhenParsed()` looks at it from this
window every `_DP_LIVE_PARSE_POLL_MS` (50) for up to
`_DP_LIVE_PARSE_WAIT_MS` (30 s); a document still `loading` is left alone,
and the copy's `load` stays as the fallback. **Before, it ran on `load`, which
waits for every image and stylesheet of the page**: a Brucebase year page
names 260 images, and on a slow site the page stayed untrimmed and its show
unmarked until the last one had come (found because the spec's Brucebase
Live page test was not network-free: it failed whenever wikidot was slow). A
`livePrepare` may return a function, which runs on that `load` (Brucebase:
scroll to the show once more). Listeners added from this window to the
frame's document DO fire (wheel, keydown, mousedown, scroll; probed
2026-10-17), unlike the frame's own `setTimeout`. What it does:
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
the bare edit or profile only (not `/edit/<n>/data`; `/user/<name>/edits` is
an editing history since 2026-10-20, see below; an editor's other lists, edit
searches, `/user/<name>/subscribers` and `/account/applications` since
2026-10-21, section "an editor's lists, edit searches, subscribers and
applications" below).

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

## MusicBrainz: tag cards, read from the page (2026-10-19)

A tag is the third PAGE kind (`tag`, `_mbPopPageKind()`), beside the edit and
the editor: the Web Service has no lookup of a tag by name. Lookups go by
MBID, and the tag search answers names and scores only (MusicBrainz_API and
MusicBrainz_API/Search, checked 2026-10-19). Its page, `/tag/<name>`, has
everything the card needs in one request.

- **Path:** `_MB_POP_PAGE_RE`'s third branch, `/tag/<name>` bare. The id is
  the name percent-encoded as in the link (`tag:alternative%20rock`), like
  `user`. Not previewed: the tabs (`/tag/<name>/artist`) and `/tags`. An
  editor's own tag (`/user/<name>/tag/<name>`) is its own kind since
  2026-10-21 (`usertag`, below with the editor's lists).
- **`_mbParseTagPage()`** reads `#content`: the name from `.tagheader h1 a`,
  the genre from the first `a[href^="/genre/"]` (only a tag that is a genre
  has one), "N entities found", and per `h3` (one per entity kind, and only
  for a kind that has entities) its list of the first ten. A kind's count
  is the number in its "See all N …" `em > a` when there is one, otherwise
  its list's length (Areas: two, no link). Text and `{type, id, name, extra}`
  only, so it can be stored in IndexedDB for `sa_pop_mb_ttl_hours`.
- **Card:** name, "Tag of the genre …" or "Tag", pills (Genre, the total),
  the six largest kinds with counts (`_mbPopTagKinds()`: largest first).
  **Window:** the genre (a link to `/genre/<id>`, which since 2026-10-26
  drills into the `genre` kind below), the total, a Kind/Count table linking each kind's
  `/tag/<name>/<slug>` (`_mbPopTagKindHref()`: the page's "See all" link,
  else `SA_TAG_VALUE_CATEGORY_SLUGS`), and per kind its entities as plain
  entity links, so they drill down (Phase 5).
- **Where:** every `/tag/<name>` link, e.g. MusicBrainz's own
  `ul.genre-list`/`ul.tag-list`, the "Sidebar" Tags card's pills
  (`.mb-sb-pill`), tags tables. Outside a table body only with
  `sa_pop_mb_page`, as for every kind. The pill's vote number is a SIBLING
  of the link and has its own hover card (sidebar.md).
- Fixture: `tests/fixtures/tag-page-alternative-rock.html`
  (`scripts/fetch-mb-page-fixture.js /tag/alternative%20rock`). Specs:
  `popup-mb.spec.js` "tags, read from the page", `sidebar-inline.spec.js`
  "tag pills"; mutations `scripts/mutations/tag-reader.json`.

## MusicBrainz: genre cards, read from the page (2026-10-26)

A genre is a PAGE kind too (`genre`, `_mbPopPageKind()`), though it has an
MBID: `_MB_POP_PATH_RE` names `genre`, so `/genre/<MBID>` resolves like any
entity link, and the kind's `card`/`extracted` read `/genre/<MBID>` with
`_mbParseGenrePage()` rather than the Web Service. Why the page: it carries
the primary tag, the Wikipedia extract and the collections count, none of
which a genre lookup returns, and the genre lookup's inc behaviour could not
be probed when this was written (the session's container had no route to
musicbrainz.org). `scripts/probe-mb-genre-lookup.py` sends the candidate
inc sets; run it before moving the card to `/ws/2/genre/<MBID>`.

- **`_mbParseGenrePage()`** reads `#content` (`debug/genre-initial.html`):
  the name from `.genreheader h1 a`, a `span.comment` disambiguation, the
  "Associated tags" `table.details` (`[phrase, names]`), the Wikipedia
  extract and its "Continue reading" link, `div.annotation`, and every
  `table.details` under `h2.relationships` as `{phrase, items}`. Each URL
  row's "[info]" link (`/url/<MBID>`) is skipped, so a URL is one item;
  `//host` hrefs get `https:`. The sidebar gives "Found in N user
  collections" and "Last updated". Text only (IndexedDB).
- **Card:** name, pills (Genre, "in N collections"), the primary tag and
  the entity relationship phrases with three names each (`+N`), then the
  first `_MB_POP_GENRE_CARD_WIKI` characters of the extract. No URLs.
  **Window:** facts (the tag linked, the collections page, last updated),
  the whole extract, the annotation; "Related genres" with every target
  linked to its bare page (drills, Phase 5), and "Links" for the URL rows.
- **Paths that came with it:** `_MB_POP_EDITS_RE`, `_MB_POP_EDITLIST_RE` and
  `_MB_POP_ENTITY_LIST_RE` name `genre` (the sidebar's "Editing history",
  "Open edits" and "Found in N user collections"); `_MB_KIND_ICON` has its
  glyph. Annotation pages are not previewed for a genre.
- **`_MB_POP_PAGE_VERSION` 4:** `_MB_POP_PATH_RE` is also read by
  `_mbParseEditPage()` and `_mbParseCollectionPage()`, whose records now
  include genres (an edit's entities, a genre collection's rows).
- Fixture: `tests/fixtures/rel-genre-overview.html`, shared with the
  `genre-overview` pageType. Specs: `popup-mb.spec.js` "genres, read from
  the page"; mutations `scripts/mutations/genre.json`.

## MusicBrainz: collection cards, read from the page (2026-10-20)

The collection kind was a Web Service lookup until 2026-10-20; it is now a
PAGE kind (`_mbPopPageKind()`, `wide: true`). The Web Service answers a
collection's name, type, `type-id`, `entity-type`, `<entity>-count` and
`editor` only — no description, no collaborators, no subscribers, neither in
the lookup nor in `/ws/2/collection?editor=` (probed 2026-10-20). The page
has them. Mockup picked 2026-10-20:
https://claude.ai/artifact/KtfNY1XfjyJoPb8fGjLGeu (25 entries a window page,
a pager, covers, eight entries on the card).

- **Path:** unchanged, `_MB_POP_PATH_RE`'s `collection`. Key
  `pop:page:collection:<MBID>`; page n > 1 of the window's pager is its own
  record, `pop:page:collection:<MBID>:p<n>` (`_mbCollKey()`, `_mbCollLoad()`).
- **`_mbParseCollectionPage()`** (selectors in DEBUG-NOTES.md, 2026-10-20 "what
  a collection page holds"): the name from `.collectionheader h1`, public from
  the subheader, the sidebar's Owner / Type / "Number of entities", the
  collaborators from `div.collaborators` (always there, EMPTY when none), the
  description from `div.description` through `_mbEditsHtml()` (the edits'
  sanitizer: links kept, other userscripts' classes dropped), the entity kind
  and plural from `#content`'s own h2, the rows and the page count. **Every
  `table.tbl` is read**: a release group collection's page is one table per
  release group type, each after its h3 ("Album + Compilation"); the first
  alone held 65 of 100 rows, and the pager then asked for a page 3 that does
  not exist. The h3 becomes a "Type" column in front. A row's entity is its
  first link to a bare page of the table's kind; its cells are kept as safe
  HTML except `_MB_COLL_SKIP_COLS` (Rating, Begin area, End area) and an
  event's Artists. `.caa-icon` marks a row with artwork.
- **Card:** pills (type, size via `_mbCollHolds()`, pages, public/private),
  Owner, Collaborators, About (the description's text, clamped to two lines),
  the first `_MB_COLL_CARD_ROWS` (8) entries in the two-column
  `.mb-dp-tracks` list.
- **Window:** facts and the whole description on the left; on the right
  `_MB_COLL_WIN_ROWS` (25) entries in `_mbPopTableHtml()` (never `tbl`) with
  ◀ ▶ (`_mbCollAreaClick()`, `_mbCollUi`). A MusicBrainz page holds 100, so
  slices 1–4 cost nothing and slice 5 reads `?page=2` — only then
  (`__saTest.mbPopStatus()` lets the spec show page 2 was not even started).
  Release and release group collections show the slice's covers as
  `coverartarchive.org/<kind>/<MBID>/front-250` images, only for rows the
  page marks with `.caa-icon`, and only in the window (Space), never on a
  hover. **Since 2026-10-24 they are the table's first column**
  (`_mbPopTableHtml()`'s `thumbs`, `td.mb-rg-thumb` as the release group's
  window; a strip above the table before — org/TODO.org "some more BB and MB
  fixes/enhancements" 3a). Each is `_mbPopCoverThumbHtml()`: a sidebar-cover
  trigger (`sb-cover`, `data-mb-sb-cover`, `data-mb-sb-cover-title` the
  row's name), so a rest shows the card of every image of THAT entity
  (`_sbCoverCardHtml()`: one CAA index request, the first rest only), a click
  (`_dpCoverClick()`, before `_dpArtViewerClick()` in the area's click) or
  Space (`_artSpaceOpen()`) opens them in the viewer (`_sbOpenCover(path,
  opener, name)`), Ctrl-click opens the entity's page. `_dpWinWhat()` takes
  it as kind `fi`. The release group window's release covers and its own
  cover (`_rgWindowTableHtml()`, `_rgWindowHtml()`) are the same trigger (3b).
- **No editing history** (H, "✎ Editing history"): a collection's
  `/collection/<MBID>/edits` says "Found 0 edits" logged in and did not load
  within 90 s logged out (probed twice, 2026-10-20), so `_mbEditsSubject()`
  still returns null for it. The window does not link "Open edits" /
  "Editing history" either.
- **Never read:** the pending-edits count beside "Open edits"
  (`.jesus2099PendingEditsCount`), the "PRINT ALL PAGES" item in the
  pagination (the page count comes from `a[href*="page="]` only), flag
  markup in the description (`_MB_EDITS_FOREIGN_CLS`).
- Fixtures (`scripts/fetch-mb-page-fixture.js`, 2026-10-20):
  `collection-page-coverart-video.html` and `-p2.html` (chaban's public
  "Cover art: Video", committed with the user's consent),
  `collection-page-attending.html` (the user's own, empty). Specs:
  `popup-mb.spec.js` "ISRC, ISWC, disc ID, collection" (five collection
  tests), `popup-mb.mobile.spec.js` (tap and ▶); mutations in
  `scripts/mutations/popup-mb.json`.

## MusicBrainz: an entity's editing history in the window (2026-10-20)

Plan, probe and decisions: `org/mb-edit-history.org`; mockups (real parsed
edits): `org/mb-edit-history-mockups.html`. **✎ Editing history** in the
window's header (`hist` in `_dpDialog.controls`, key **H** in
`_dpDialogKeys()`) shows the `/…/edits` page of what the window shows, in the
same window, with the look of a Discogs release's history
(`_extDgHistSectionsHtml()`, above): `_dpOpenEdits()` pushes the current
target on `_dpDialog.stack` and shows an `edits` target, so ← Back,
Backspace, Alt+← and the kinds-path title need nothing new.

- **Who has one: `_mbEditsSubject(t)`.** Read from the target's own
  MusicBrainz URL (`t.src.liveUrl(t)` against `_MB_POP_PATH_RE`), so a
  release group shown by the release-group sources counts too; every MBID
  kind but a collection ("Found 0 edits": collections are not edited
  through edits, probed); an editor (`user` kind) → `user/<name>`. Null on a
  foreign host and while `sa_pop_mb` is off (the history is one of its
  cards, and `_dpRenderDialog()` refuses a disabled source). The button is
  hidden wherever it is null, the history itself included.
- **The kind: `_MB_KINDS.edits`**, id `<kind>/<MBID>` or `user/<name>`,
  `path()` → `/<id>/edits`. `_MB_POP_EDITS_RE` makes the page's links
  targets too (`_mbPopParsePath()` returns `seg: ''` so `_mbPopTarget()`
  takes the kind's `path()`): the sidebar's "Editing history" and the editor
  window's "Their edits" get a card (`card`: subject, total, latest edit,
  commonest types) and open the same window.
- **Pages: one record each**, `pop:page:edits:<id>:<n>` (`_mbEditsKey()`),
  through `_mbPageLoad()` (the one MusicBrainz gate, `_dpRawMem`), 50 edits
  a page. `_mbEditsUi` (per id, this page load) holds the chips, the order,
  the selection, "Only what changed" and how many pages are read;
  `_mbEditsPages()` collects them and the next one's state; "Load page N"
  (`data-mb-meh-act="more"`) asks for it; ⟳ (`force`) re-reads page 1 and
  starts over at one page. **`keep`: no entry `open`** — a page holding an
  open edit stays in memory only, as an open edit's card. A busy entity says
  "Found at least 500 edits" and links pages 1–10, deeper pages raising both
  (probed), so with `atLeast` the footer has no "of M".
- **The parser: `_mbParseEditsPage()`**, null without "Found (at least) N
  edit(s)" in `#content .search-toggle` (a login page, the browser check).
  An entry per `div.edit-list` with an "Edit #N - Type" link, deduped by
  number (another userscript nests batch members inside a summary block on
  the LIVE page; fetched pages never carry it, so that guard is unseen by
  the specs and recorded so in the mutation list). Rows
  (`_mbEditsRows()`): `td.old`+`td.new` → diff; `th[rowspan=2]` over an old
  row and a new row → one diff (edit relationship); nested old/new tables
  in a value → one diff per track ("Track N", set track lengths); an
  Old/New table in a value → its halves (`_mbEditsSplitTable()`: an edit
  medium's "Old tracklist | New tracklist", artist credits' "# | Old artist
  | New artist"); "Old X"+"New X" values → one diff (reorder art); anything
  else a value, a context row once the edit has a diff; `same` when both
  sides read alike. The summary line and the editor's own note are worked
  out here, so the render is strings only.
- **The sanitizer: `_mbEditsHtml()`** keeps what a node HOLDS, never its
  own tag. Links stay MusicBrainz paths (a plain click drills, `_dpDrill()`;
  `/edit/N` opens the edit card, `/user/x` the editor's); **a nested table
  is `table.mb-meh-sub`, never `tbl`** (every global `table.tbl` query of
  the script would count the window's content; the RG test pins the count);
  artwork only from the two archives, from the `<noscript>` thumbnail (a
  DOMParser document runs no script, so `<noscript>` is markup), its link
  `a.mb-meh-art`, numbered `data-mb-artv-ext` when the pane is built so
  `_dpArtViewerClick()` opens the viewer; `diff-only-a`/`-b` →
  `mb-dgh-rem`/`-add`; other userscripts' markup dropped by class prefix.
- **The window: `_mbEditsWindowHtml()`.** The subject and "MusicBrainz says"
  (edits and pages read, latest, first or oldest read, statuses when mixed,
  editors); `_extDgSection('meh-hist', …)` with category chips, status chips
  only when mixed, Newest/Oldest, rows in a list that scrolls on its own
  (`.mb-meh-list`, `data-mb-keep-scroll`), so the pane stays under it, and
  the footer; `_extDgSection('meh-diff', …)` = `_mbEditsPaneHtml()`: a facts
  line, the OLD | NEW grid (`mb-dgh-diff mb-meh-diff`; a merge Merge | Into)
  or one column ("Added", "Removed", "Details"), the legend, the notes, "Only
  what changed" (default on: hides context rows after the first and `same`
  rows, never MusicBrainz's own "Note" row; says so when nothing visible
  changed), and `Edit #N` (a link, so the drill). **The grid's column border
  goes by class (`.mb-meh-n`), not Discogs' `nth-child(even)`**: a context
  row spans both columns and shifts the parity.
- **Clicks and keys.** `_mbEditsAreaClick()` (the kind's `onAreaClick`):
  section heads through the Discogs windows' `_extDgCollapsed`, then
  `data-mb-meh-act` = group | status | order | only | sel | more. A row is a
  `role="button"` with `data-mb-keep-focus`; `_mbEditsRowKeys()` (from
  `_dpDialogKeys()`): Enter selects, ↑ ↓ move and select — **by a click on
  the row, which repaints and detaches it mid-dispatch**: that closed the
  dialog until `createInfoDialog()`'s outside-click check also asked
  `e.composedPath().includes(dialog)` (2026-10-20). A mouse click survived
  only by the `_lastMousedownInDialog` flag; a keyboard click (Enter on a
  focused chip of ANY window that repaints, the Discogs history's included)
  has no mousedown.
- **Failures.** `_mbPageLoad()` names MusicBrainz's "Verifying your browser"
  page (`_mbIsBrowserCheck()`, `_MB_BROWSER_CHECK_NOTE`) for every page
  card, instead of "not the page expected". Logged out, MusicBrainz hides
  every editor and sends no notes (`editorHidden`, `notesHidden`), and the
  window says so.
- **Glyph.** `_mbKindIconUrl()` gives an `edits` target its subject's icon.
- **Tests:** `tests/fixtures/popup-mb-edits.spec.js` (PATH, BUTTON, DIFF,
  SPLIT, ONLY, ADDED, RG, KEEP, EDITOR, NONE, LOGGEDOUT, CHECK) and
  `popup-mb-edits.mobile.spec.js`; fixtures `tests/fixtures/edits-page-*.html`
  (real pages, scrubbed by `scripts/fetch-mb-page-fixture.js`; logged in, so
  they name other editors, with the user's consent, answer 6); mutations
  `scripts/mutations/popup-mb-edits.json`. Research scripts:
  `scripts/probe-mb-entity-edits.py`, `scripts/inventory-mb-edits.js` (the
  prototype parser `scripts/lib/mb-edits-parser.browser.js` over saved pages:
  39 edit types), `scripts/show-mb-edits-samples.py`,
  `scripts/build-mb-edit-history-mockups.py`.

## MusicBrainz: an editor's lists, edit searches, subscribers and applications (2026-10-21)

The links of a profile's statistics (`user-profile`, rendered by
`applyUserProfileToTables()`): "view", "N%", "View all", "view list", and
(9.99.1408) the "Tags and ratings" sub-section's tags and ratings. All are read
from the page (no Web Service), through `_mbPageLoad()`.

- **Edit lists are the `edits` kind.** `/user/<name>/edits/<status>` (the
  seven statuses the profile links: open, accepted, autoedits, applied,
  rejected, failed, cancelled), `/user/<name>/votes` and `/search/edits?…`
  are the same page as an editing history ("Found N edits",
  `div.edit-list`, the same pager; captured logged in 2026-10-21), so they
  reuse `_mbParseEditsPage()` and the whole window unchanged.
  - **Id = the page path** (`_MB_POP_EDITLIST_RE`), or path + query for a
    search (`_mbEditsSearchId()`: the query as the link spells it, minus
    `page=`). A history's ids (`<kind>/<MBID>`, `user/<name>`) and cache
    keys are unchanged. `_mbEditsPagePath(id)` / `_mbEditsUrl(id, n)` build
    the page (`&page=n` after a search's own query).
  - **A search is a target only with `conditions.` and without
    `form_only=`**: the empty form (the header's "Edit search") and an edit
    list's "Quick links" to the prefilled form list nothing.
    `_mbPopParsePath(pathname, search)` takes the query for this one case;
    `_mbPopTarget()` and `_mbPopStampHref()` pass it.
  - **Names: `_mbEditsLabel(id)`** gives the window's title (`titleOf` on the
    kind: "Rejected edits", "Votes", "Edit search"), the card's comment, the
    window's subline, the empty-list line and the glyph. A list's own
    heading ("Rejected edits by vzell") is NOT read: the name comes from the
    id, so `_mbParseEditsPage()`'s subject regex stays "(Open )Edits by".
  - **`keep`**: a status list or votes as a history (no open edit → kept for
    `sa_pop_mb_ttl_hours`); **an edit search memory-only**, whatever it holds,
    since its conditions may be relative ("24 hours ago").
  - No "✎ Editing history" on a list: `_mbEditsSubject()` returns null, as
    for a history.
  - **An entity's open edits (2026-10-23)**: `/<kind>/<MBID>/open_edits`,
    the sidebar's "Open edits" next to "Editing history", is the same page
    again ("Open Edits for <a>…" is an `h1 a` subject), so it is a list of
    this kind too: the entity form in `_MB_POP_EDITLIST_RE` (the kinds of
    `_MB_POP_EDITS_RE`; a collection's lists nothing, as its history),
    id `/<kind>/<mbid>/open_edits` (MBID lowercased, no trailing slash, by
    `_mbPopParsePath()`), named by its own `_mbEditsLabel()` branch ("Open
    edits", "Open edits · <kind>"). Every entry is open, so `keep` makes
    every page memory-only. Specs: `popup-mb-edits.spec.js` PATH and OPEN
    (the host page's real sidebar link, with `sa_pop_mb_page`).
- **`subscribers`** (`_MB_POP_ACCOUNT_RE`, id the name):
  `_mbParseSubscribersPage()` reads the section after `h2` "Subscribers"
  (`_mbPopH2Section()`; the page has no `#content`): the editor links of its
  `ul`, "Plus N other anonymous users", "There are currently N users". Card:
  the count, the anonymous count, the first 12 names; window: every editor
  linked, so a click drills to their card.
- **`applications`** (`_MB_POP_ACCOUNT_RE`, id `me`; only the logged-in
  owner sees the page, else a login page → `failNote`):
  `_mbParseApplicationsPage()` reads the "Authorized applications" and
  "Developer applications" sections and the digest-auth line. **Only the
  `_MB_APPS_COLS` columns, as text** (Application, Name, Access, Last granted
  token, Type): the Actions cell is "Revoke access", a GET link that revokes,
  and a developer application's row holds its OAuth client id and secret.
  The real page had no developer table on capture, so the APPS spec plants
  one with "OAuth Client ID"/"OAuth Client Secret" columns and asserts
  neither value reaches the window. **Memory-only** (`keep: () => false`).
- **`usertags`** (`/user/<name>/tags`, `_MB_POP_ACCOUNT_KINDS`, id the
  name): `_mbParseUserTagsPage()` needs the h2 "Tags <name> upvoted" and
  reads `#all-tags ul.genre-list > li` and `ul.tag-list > li` (name +
  `span.tag-count`); one page, no pager (112 tags on capture, their counts
  sum to the profile's "Tags upvoted 347"). Card: tags, genres, votes, the
  ten most used together; window: both lists by count, each tag linked to
  the GLOBAL `/tag/<name>` so it drills into the tag card (written when the
  editor's own `/user/<name>/tag/<name>` was no kind; it is `usertag` since
  2026-10-21, the window's links stay global). `?show_downvoted=1` returns null in
  `_mbPopParsePath()`: another list than the page read, never seen live
  (the account has 0 downvotes, so the profile links none).
- **`usertag`** (`/user/<editor>/tag/<tag>`, 2026-10-21, vzell: "tag detail
  popup support on PTs like /user/vzell/tags when hovering the tag
  anchors"): `_MB_POP_USERTAG_RE`, checked in `_mbPopParsePath()` after the
  account pages and before `_MB_POP_PAGE_RE`; the id is `<editor>/<tag>`,
  both as the link spells them, and `path()` puts `/tag/` back between them.
  Not previewed: its kind pages (`…/tag/<tag>/release`) and
  `?show_downvoted=1`. The page is fullwidth, WITHOUT `#content`
  (`tests/fixtures/user-tag-page-vzell-{live,acoustic-rock,gig}.html`,
  `scripts/fetch-mb-page-fixture.js`, anonymous, 2026-10-21T21:54+02:00,
  NB-3641): h1 the editor, h2 "Entities <editor> tagged as “<a
  href=/tag/…>”", then the same "N entities found" and h3/`ul`/"See all N"
  body as `/tag/<name>`. So `_mbParseTagPage()`'s body moved into
  `_mbParseTagSections(root)`, which both parsers call
  (`_mbParseUserTagPage()` with `#page`), and the window into
  `_mbPopTagWindowHtml(d, base, head, empty)`, `base` being the page path
  `_mbPopTagKindHref(base, s)` builds a kind's page from. Card: the tag,
  "<editor>’s tag", the total, the kinds by count and the first
  `_MB_POP_USERTAG_CARD_ROWS` (6) entries with "+ N more". Window: Editor,
  Entities, Everyone's (`/tag/<tag>`, a drill into the tag card), then the
  tag window's kinds. Glyph: the editor's (`_MB_KIND_ICON`). Specs:
  `popup-mb-user-lists.spec.js` "USER TAG: …" (on the tags page before and
  after its render), PATH; mutations `scripts/mutations/popup-user-tag.json`.
- **`userratings`** (`/user/<name>/ratings`): `_mbParseUserRatingsPage()`
  reads per h2 "<Kind> ratings" its `ul > li`: `.current-user-rating` (1–5),
  the first link to a bare entity page outside `.inline-rating`, the rest of
  the item's text with `.inline-rating` removed, and the "View all ratings"
  link. **The stars are `/rating/rate/?…` GET links that change the
  rating**: never copied (the window draws ★/☆ text). The page shows a few
  per kind, so the counts say "shown".
- Fixtures (`scripts/fetch-mb-page-fixture.js --auth`, then
  `scripts/anonymize-user-fixtures.py`, which replaces the subscribers' names
  with editor-1… and blanks developer-application cells):
  `edits-page-user-vzell-{rejected,open,votes}.html`,
  `edits-page-search-type.html`, `subscribers-page-vzell.html`,
  `applications-page-vzell.html`, `user-{tags,ratings}-page-vzell.html`.
  Spec: `popup-mb-user-lists.spec.js` (PATH, STATUS, EMPTY, VOTES, SEARCH,
  SUBS, APPS, TAGS, RATINGS), one tap test in
  `popup-mb-edits.mobile.spec.js`; mutations
  `scripts/mutations/popup-user-lists.json` (14, all caught).

## MusicBrainz: an entity's subscribers and collections (2026-10-22)

The sidebar's "Subscribers" (`/<kind>/<MBID>/subscribers`) and "Found in N
user collections" (`/<kind>/<MBID>/collections`) links. Both are read from
the page (`_mbPopPageKind()`). Those pages are also pageTypes since the same
branch (PAGETYPES-TESTING-REFERENCE.org #115–#127).

- **Path:** `_MB_POP_ENTITY_LIST_RE`, checked in `_mbPopParsePath()` after
  the account pages. The id is `<kind>/<MBID>`, with the MBID lowercased.
  - Subscribers exist only for `_MB_POP_SUBSCRIBABLE` (artist, label,
    series, collection).
  - Collections exist for every collectable kind except a collection.
  - Any other combination is `null`: no card rather than one that can only
    fail.
- **`subscribers` is the editor's kind, widened.**
  - `path()` tells the two cases apart by `_mbPopListOf(id)` (the entity
    kind, or '' for an editor's name).
  - The card's and window's kind word comes from the same function.
  - `_mbParseSubscribersPage()` takes the name from the h1's editor link, and
    otherwise from the h1's first `<bdi>`: an entity page's h1 links nothing.
  - The page shape is the same, except it sits inside `#content`, which
    `_mbPopH2Section(#page)` reaches anyway.
- **`collections`** (`_mbParseEntityCollectionsPage()`):
  - It reads `#content`'s h2 "Collections". **The sidebar has an h2
    "Collections" of its own** (the reader's collections, "Add to a new
    collection"). It comes later in the document, so the first match is
    already right. Reading `#content` makes that explicit, and the mutation
    is recorded as `expect: pass`.
  - The total is the `<p>`'s "has been added to N collections" (N includes
    the private ones). The private count comes from the last `<li>`. An
    empty page ("has not been added to any collections", no `<ul>`) falls
    back to the counted rows, 0.
  - The card shows pills, then the first `_MB_POP_COLLS_CARD_ROWS` (8) as
    "name by owner".
  - The window has a Collection | Editor table, both linked, so a click
    drills into the collection's or the editor's card.
- **Glyph:** both kinds are in `_MB_KIND_ICON_FROM_ID`, which now applies
  only to an id containing `/`. An editor's subscribers (the id is the name)
  keep the editor glyph.
- **No `_MB_POP_PAGE_VERSION` bump.** An editor's subscribers record is
  unchanged, and the entity records are new keys.
- **Fixtures:** `entity-artist-subscribers.html` (the host: its sidebar holds
  the real snapshot's two links), `entity-artist-collections.html` and
  `entity-release-collections-empty.html`, all built by
  `scripts/make-entity-list-fixtures.py`.
- **Spec:** `popup-mb-entity-lists.spec.js` (PATH, SUBS, COLLS, EDITOR,
  EMPTY).
- **Mutations:** `scripts/mutations/popup-entity-lists.json` has 12 entries.
  10 are caught; 2 are recorded as `pass`: the total is covered by the
  fallback on this page, and the `#content` scope by document order.

## MusicBrainz: an annotation's history and its versions (2026-10-21)

An annotation's own line ("View annotation history | Edit annotation", in
`.annotation-details`), the sidebar's "View annotation history" and every
"View this version" / "View current revision" link get a card and a window.
Two kinds read from the page (`_mbPopPageKind()`), both found by
`_MB_POP_ANNOT_RE` in `_mbPopParsePath()` for the eleven annotated entity
kinds (no `url`, no `collection`); `edit_annotation` and
`annotations-differences` do not match (the pattern is anchored).

- **`annotations`** (`/<kind>/<MBID>/annotations`, id `<kind>/<MBID>`, the
  shape of an `edits` id). **Probed 2026-10-21: MusicBrainz shows this page
  to a logged-in editor only** — logged out the page never loads, so a
  fixture needs `--auth` and a login page is the `failNote`.
  `_mbParseAnnotationsPage()` reads `table#annotation-history` (by header:
  "Date", "Version history"; editor = the row's `/user/` link; changelog =
  the history cell without its link, "(no changelog specified)" → '') and
  takes each version's TEXT from the page's own JSON inside the form
  (`annotations[].html`, keyed by `id`). Card: versions, the latest date,
  editor, changelog and the first three blocks; window: the latest text and
  every version ("Version N", newest first as the page lists them), each
  linked to its `/annotation/<n>` so a click drills into the `annotation`
  kind, each editor to `/user/<name>`.
- **`annotation`** (`/<kind>/<MBID>/annotation/<n>`, id `<kind>/<MBID>/<n>`;
  the current one at `/<kind>/<MBID>/annotation`, id `<kind>/<MBID>`;
  `titleOf` says "Annotation version" or "Annotation"). Shown to anyone.
  `_mbParseAnnotationVersionPage()` reads `div.annotation`: the body, "Changelog:",
  and `.annotation-details`. **Logged out, an old version's line reads like
  the current one's** ("Annotation last modified on <date> UTC.", logged
  in "This is an old revision … as edited by <editor> on <date>."), so
  old/current is decided by the page JSON's `annotation.id` against
  `entity.latest_annotation.id`, and the editor comes from
  `annotation.editor.name` when the line names none. **The header has a JSON
  script of its own first** (`{"entityType":…,"gid":…}`): the parser looks
  for the one with an `annotation` key.
- **Text only, never markup.** `_mbAnnotationBlocks()` turns a rendered body
  into `{h}` / `{p}` blocks of `textContent` (a `<br>` kept as a newline, a
  list item as "• …"); `_mbAnnotationHtml()` escapes them. The JSON's `html`
  is parsed in an inert `DOMParser` document. So a link inside an
  annotation is its text in the card; the SAFE spec plants an `<img
  onerror>` and asserts it neither reaches the window nor runs.
- **Glyph:** `_MB_KIND_ICON_FROM_ID` — both kinds show the glyph of the
  entity named by the id's first segment.
- Fixtures (`scripts/fetch-mb-page-fixture.js`, release 3ec14d03-…):
  `release-annotations-history.html` (`--auth`),
  `release-annotation-version.html` (version 810603) and
  `release-annotation-current.html` (logged out). Spec:
  `popup-mb-annotations.spec.js` (PATH, HISTORY, VERSION, CURRENT, LOGIN,
  SAFE) on `release-tracks-sidebar-search-links.html`; mutations
  `scripts/mutations/popup-annotations.json` (9, all caught).
- **The version page itself** (2026-10-21, 9.99.1415) is the pageType
  `annotation-version` (PAGETYPES-TESTING-REFERENCE.org #114): its button
  runs `applyAnnotationCompareToTables()`, which reads the SAME page JSON
  through the shared `_mbAnnotationPageData()` (the preview's parser uses it
  too) and builds "This version" (Field | Value) and "Compared with the
  current version" (`_annotationCompareRows()`: an LCS of equal blocks, the
  gaps paired by kind as "changed", the rest "only in this version" / "only
  in the current version"). A changed row's status is a SPAN with the rich
  card (`_setTipCmp()`): a disk file keeps a cell's markup but only listed
  `<td>` attributes, so a card on the `<td>` came back empty after Load
  from Disk. No disk-load hook: the file's groups render as saved. Spec
  `annotation-version-compare.spec.js`; mutations
  `scripts/mutations/annotation-version-compare.json` (8; the fetched-copy
  hook is `expect: pass` — a non_paginated page is read from the live
  document).

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

## Hovering inside the window (2026-10-23, org/dp-window-hover.org)

vzell: hovering a link in the window did nothing. Mockup
https://claude.ai/artifact/APF35bPAyvFZvKjFHGHrZU
(`org/dp-window-hover-mockups.html`), all six suggestions taken; grep
`// ── Hovering inside the window`.

- **One question, asked the click's way** (`_dpWinWhat()`): an image
  (`a[data-mb-artv-i|ext]` → the viewer), `here` (the target a click would
  show: `_mbPopTarget(a, {inWindow: true})` while `mb-entity` is on, or
  `_extTarget(a, {inWindow: true})` in a window whose reader has
  `onAreaClick`, the Discogs family), `out` (a new tab); `#…` and
  `javascript:` are none. **`_popResolve()` is NOT widened**: the page's
  click handler (taps) and `_dpStep()` use it, and a window target there
  would open a new path instead of drilling. Only the hover, focus and Ctrl
  paths fall back to `_dpWinTarget()`.
- **H1 foot line** (`_dpWinFoot()`): `createInfoDialog()`'s close-hint row,
  emptied and restyled (`.mb-dp-wfoot`; its inline padding/border need
  `!important`), so the window's layout is unchanged. At rest the keys that
  apply. "read before, no request" from `_dpWinRead()`: a MusicBrainz
  entity's `pop:<type>:<id>:` entry done in `_mbPop` (any inc set), another
  site's record by its key.
- **H2 marks** (`_dpWinMark()`): classes `mb-dp-l-here` / `-out` /
  `-noglyph` (its text already says ↗) / `-img` / `-read` (only with H5 on),
  laid by a MutationObserver on the scroll area, one pass a frame: every
  repaint path (`innerHTML`, `_dpAreaRepaint()`, a section's own toggles) is
  covered without a hook. CSS draws the rest. Never generated content that
  appears only on `:hover`: it widens the link and reflows an auto-sized
  table column (the ↳ on `-here` did, until 9.99.1459 removed it).
- **H3 card**: the target is the drill target itself (`drilled: true`), so
  its source's card, `_mbPopWanted()` and the page's Ctrl rule
  (`needsCtrl()`, decision 2) apply unchanged, and so does "a host never
  reached is first contacted on Space". **Space** on a `drilled` card pushes
  the current target and shows it (as `_dpDrill()`), it does not call
  `_dpOpenDialog()`. A link that leaves the page has no card (decision 3).
- **H4 image preview**: a pseudo source `_DP_IMG_SRC` in the same card
  element (`img: true`, its own `delay: 250`, which `_dpSchedulePeek()`
  honours), no Ctrl, no request beyond the image (the archive's 500 px, or the
  linked image). `_dpImgInfo()` counts the images as the viewer does. Shift
  repaints it larger (`_dpWinBig()`). **Space opens the viewer at that
  image**, exactly as a click (`_dpWinImgOpen()` → `_dpArtViewerClick()` with
  a stand-in event), the preview hidden first; before the preview has shown
  (its 250 ms) `_dpWinImgSpace()` does the same from `_dpPeek.hover`. It used
  to be swallowed (org/TODO.org "some more BB and MB fixes/enhancements" 1b,
  vzell 2026-10-24: "Open the viewer at it"); Esc closes the viewer, then the
  window. The card and the foot line say "Click or Space: viewer".
  The preview's element is the `<img>` (`t.el`; its link is `t.a`), and
  `_dpWinWhat(node, pointer)` counts an image link only on its picture: the
  cover's link used to span the column (now `inline-block`), and a focus —
  the one the viewer gives back on closing, too — never opens the preview,
  or the next Esc would close it instead of the window. The foot line still
  names the viewer for a focused image link.
- **A foreign-image trigger in the window** (`a[data-mb-fi]`: the Discogs
  window tables' thumbnails, `_extDgThumbHtml()`, provider `_DGW_FI`) is
  `_dpWinWhat()`'s kind `fi`: ringed like an image, the foot line "Viewer:
  <row> · every image of it", but no window preview — its card, click and
  Space are the hover card's (`_fiCardHtml()`, `_fiClick()`,
  `_onImageSpace`), the same as the page's Image column (item 1a).
  `_extDiscogsWindow()` calls `_fiInstall()`, so on MusicBrainz the click is
  installed once a Discogs window shows.
- **H5 read-ahead** (`sa_dp_window_read_ahead`, off): after 600 ms the
  target's own `card(t, true)` with `t.readAhead`; `_mbPopWanted()` wants it
  while the link is still `:hover`. MusicBrainz entities only.
- **H6** (`_dpWinNavTips()`, from `_dpShowInDialog()`): ← Back names the
  stack's top, ‹ › the neighbouring steps' text.
- **Touch** (decision 4): a long press (500 ms, cancelled by a move) shows the
  card or the image; `touchend` is `preventDefault()`ed after it, so no
  compatibility mousedown (which hides the card) and no click follow.
- **Specs**: `popup-mb.spec.js` "hovering inside the window" (6),
  `popup-ext.spec.js` "hovering inside a Discogs window" (with a version's
  thumbnail and the gallery's Space), `bb-event-preview.spec.js` "Space on an
  image opens the viewer", `popup-mb.mobile.spec.js` "inside the window: a
  long press" (the press through the DevTools protocol); mutations
  `scripts/mutations/dp-window-hover.json`,
  `scripts/mutations/dp-window-images.json`.

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
  `img:not(.avatar)`, not in `_EXT_SKIP_SEL` (chrome, the card and the
  window, `_MB_POP_PAGE_SKIP`). **A Relationships column icon is the
  exception to both (2026-10-17):** it is an image link that IS the link, so
  it gets the card, named by its site (`_relLinkName()`, the icon's text is
  its hidden filter key), and `_dpCollectNotes()` gives it the icon's own
  boxes (`_relStackParts()`: the filter box while a filter matches the
  cell, then the icon box) instead of its bare title and the cell's "click
  outside the icons" hint; `_dpShowPeek()` hides the column's own stack
  (`_relHideTooltip()`), whose timer also yields while `_dpPeek.link` is the
  icon. Mockup https://claude.ai/artifact/NonAS8iqfjSMRUaXojzSnT;
  `rel-icons.spec.js`, mutations `rel-icons.json`. Scope: `_EXT_SCOPE_SEL` (table
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
  budget. `__saTest.extRateSlotWaitMs(host)` reads it. **Discogs' API is
  shared by every tab** since 2026-10-19 (`_EXT_SHARED_SLOT_HOSTS`: its next
  slot also in GM storage, a 429 or `X-Discogs-Ratelimit-Remaining: 0` pauses
  every tab for a minute, up to `_EXT_SHARED_TRIES` asks): see
  docs/claude/discogs.md, "Discogs' request limit, shared by every tab".
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
  real name, members, groups, aliases (since 2026-10-18), parent label,
  sublabels — as counts on the card (`cardFacts`). `noLive`: the page is
  another host than the API's, which Tampermonkey would ask about, and the
  API says more. **Rate: `_extSpacingMs()`** — 2.5 s apart without a token
  (25 a minute, Discogs' own `X-Discogs-Ratelimit`, U0 X4), 1 s with one (60:
  the same header answered 60 to `Authorization: Discogs token=…`, probed
  with the user's token 2026-10-08 12:09Z, which also confirms the header
  form).
- **The Discogs window (2026-10-17, mockup
  https://claude.ai/artifact/49tucEnfghTCMtyvwN6qaM, layout A).** A release
  or master record keeps `rec.discogs` (`_EXT_DISCOGS_VERSION` 2 on top of
  `_EXT_IDB_VERSION`, the reader's own `version`, so only Discogs records are
  read again): the tracklist with each track's `extraartists`, the images
  (`_extDiscogsImages()`), the notes; a release also companies, credits,
  identifiers, videos, and the facts "Community" and "Data quality" (after
  `_EXT_CARD_FACTS`: window only). Same answer, no request more.
  Rendering goes through three optional READER hooks, so `_extExtracted()`
  and `_extCard()` stay generic: `window(t, rec, {start, force, repaint})`
  → `{left, right, full}` (`_extDiscogsWindow()`), `cardExtra(t, rec)`
  (`_extDiscogsCardExtra()`), and `onAreaClick`/`onAreaInput`, reached from
  the dialog's delegated listeners through `_extSource()`. Sections are
  collapsible (`_extDgCollapsed`, page load, across Discogs windows); the
  per-target state (open track credits, filter, chips, sort, the load run)
  is `_extDgUi`. **Names are links** (vzell, 2026-10-17, after trying the
  branch): every artist, label and company keeps its Discogs `id`
  (`_EXT_DISCOGS_VERSION` 3) and `_extDgLink()` links `/artist/<id>` or
  `/label/<id>` (id 0: plain text); the facts' "Artist" and "Label" go
  through a fifth reader hook, `factsHtml(t, rec, facts)` (the card keeps
  `_dpFieldsHtml()`'s plain text). A click drills down like a version's row.
  **The title says what the link is**: a sixth hook, `kindFor(u)`, gives the
  target its `kind` ("Discogs release" …, `_extDiscogsKind()`), so a
  drill-down's path reads "Discogs master › Discogs release"; `rec.subtitle`
  ("Discogs · master release", as the mockup had it) replaces `siteName`
  under the title in card and window, while "Discogs says" keeps `siteName`.
  A VERSION's label has no id (the versions rows carry `catno, country,
  format, id, label, major_formats, released, resource_url, stats, status,
  thumb, title`; checked 2026-10-17), so it links Discogs' label SEARCH
  (`/search/?q=<name>&type=label`, vzell's pick), `a.mb-dg-label`, new tab:
  `_extDgDrill()` takes only the Discogs reader's pages, so a click on it
  never opens the search in the window.
  The cover links the full primary image (`rec.imageFull`)
  and is the same file as the gallery's first: `_dpArtViewerClick()` counts
  a URL once.
  **Versions** (`_extDgListLoad()` on `_EXT_DG_LISTS.versions` since
  2026-10-18, key `ext:discogs-versions:<master>:<page>`): `masters/<id>/versions`, 100 a
  page — `per_page` is capped at 100 (probe 2026-10-17,
  `scripts/probe-discogs-versions.py`: master 26725 = 387 versions, 4 pages
  of ~76 KB; page 1 carries `filters.available`, counts for ALL versions).
  Page 1 when the window starts — or, the `_rgWindowFor()` exception, on the
  repaint that brings the master's own record when the window loaded it (a
  tap: no card before), once, while page 1 has no state. Never from a card
  (`wanted()` needs the window on the master). "Load the other N" runs
  `_extDgLoadNext()`: ONE page at a time through the host's gate, so Stop
  leaves nothing waiting; a failed page does not stop the run, and the
  button then asks only the failed ones. **`_mbLoad()` forgets a skipped
  load without notifying**, so the versions loader repaints itself after a
  skip (found by the spec: Stop before a page's slot left the bar
  "Running"). A later visit reads pages 2..N from IndexedDB once page 1 is
  there (`_extDgPeekCached()`, no request). Year "0" is no year; empty
  values sort last both ways. A Discogs link IN the window (a version's
  row, See also, `[r=…]` in notes) drills down (`_extDgDrill()`,
  `_extTarget(a, {inWindow: true})`), Back returns.
  **Two engine changes came with it**: `_dpDialog.repaint` and
  `_dpAreaRepaint()` (a repaint keeps `data-mb-keep-scroll` scroll positions
  and the `data-mb-keep-focus` field's focus and caret), and
  `createInfoDialog()`'s scroll area no longer takes the focus on
  `mouseenter` from an element inside it — Chrome fires `mouseenter` again
  when a repaint swaps the content under a resting pointer, which took the
  focus out of the versions' filter while pages arrived (found by the spec).
- **The Discogs artist and label windows (2026-10-18, mockup
  https://claude.ai/artifact/WuBNbFTgNHJtxip4xBv6yc, approved by vzell
  2026-10-18 with: show the API's production credits plus a link to all of
  them; a master row's "▸ versions" is the collapsible master table; label
  batches of 5 pages; tables of 150 rows, then "Show more").** An artist or
  label record keeps `rec.discogs` too (`_EXT_DISCOGS_VERSION` 4): the
  profile WITH its markup, every image (the answer's `images` IS the "More
  images" set: Bruce Springsteen 27, Columbia 74), the names with ids
  (members, groups with `active`, aliases; parent label, sublabels), name
  variations, sites, a label's contact info, the data quality. Two generic
  record fields came with it: `descInWindow` (`_extLeftCol()` leaves the
  description out: the window's Profile section shows it, with links —
  `_extDiscogsMarkupHtml(s, {names: true})`: `[a123]`/`[l123]` link the page,
  `[a=Name]`/`[l=Name]` Discogs' search, as a version's label) and
  `cardFacts` (the card shows only the counts; "Data quality" is the
  window's). "Discogs says" is the reader's own (`_extDgEntityFactsHtml()`).
  **The lists are one loader**: `_EXT_DG_LISTS` names each list's key, URL,
  answer field and row shape — `versions`, `artist`
  (`artists/<id>/releases?sort=year&sort_order=asc`, key
  `ext:discogs-artist-releases:<id>:<page>`), `label`
  (`labels/<id>/releases?sort=year&sort_order=desc|asc`, key
  `ext:discogs-label-releases:<id>:<order>:<page>`, `batch: 5`) — and
  `_extDgListLoad()`, `_extDgLoadNext()`, `_extDgPeekCached()`,
  `_extDgListState()`, `_extDgListStart()` serve all three; a list's run
  (chain, Stop, tried pages, `upTo`) is `_extDgRun()`, per target and list.
  Probe 2026-10-17/18 (`scripts/probe-discogs-artist-label.py`): an artist's
  list is ordered **by role, then year** — Bruce Springsteen's 6,782 rows run
  Main p1–4, Producer 78 and Co-producer 2 p4–5, Appearance p5–33,
  TrackAppearance p33–48, UnofficialRelease p48–68; Max Weinberg's 528 (6
  pages) hold Main, Producer, Mixed by, Appearance, TrackAppearance,
  UnofficialRelease. So the sections (Releases = Main; Appearances = On
  releases + On tracks; Unofficial; Credits = every other role) fill in that
  order, and `_extDgRoleState()` calls a role complete once the pages loaded
  without a gap from page 1 hold a LATER role (`_EXT_DG_ROLE_ORDER`; a
  credit is 1); until then its count reads "N so far". The API's credits are
  only the production ones (the website's 4,445 for Springsteen —
  written-by, instruments, vocals — come from its own service), so Credits
  links `?type=Credits` on Discogs. Masters carry no format, so the website's
  Albums / Singles & EPs / Compilations split cannot be made: the chips are
  All / Masters / Releases. A master row's "▸ versions" asks that master's
  versions page 1 (the versions list's own key, shared with the master's
  window) on the click and shows `_EXT_DG_NEST_ROWS` (12) with "Open the
  master here". A label's list has releases only, no facets, and thousands
  of pages (Columbia 396,611 = 3,967): it never loads all — "Load 5 more
  pages" sets the run's `upTo`; its bar shows only the pages it has or will
  ask; its later-visit lookup reads IndexedDB in order up to the first page
  not kept; newest/oldest first are two lists (the order is in the key), and
  the other order's page 1 comes from the repaint, as the master's does.
  Typing in the artist's or label's filter repaints the whole window
  (`data-mb-keep-focus` keeps the field), not a list part as the versions do.
- **On discogs.com itself (2026-10-18)** the readers also feed the
  `dg-*` pageTypes' tables (`_EXT_DG_LISTS` rows, `_extDiscogsTracklist()`),
  and a Discogs link there — the page's OWN host — is previewed:
  `_extTarget()` takes it when `_extDiscogsTest()` does, and
  `_DP_SITES['www.discogs.com']` (`setting: null`, `extRoot: '#app'`) limits
  it to the table and Discogs' content. See docs/claude/discogs.md.
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
`scripts/mutations/popup-ext.json`. The Discogs window: the block "the
Discogs window (2026-10-17)" of the same spec (sections and counts from the
release fixture, track credits, grouping, the gallery in the viewer; a
master's versions — none from a hover, page 1 on opening, the rest on the
button in order, typing through page arrivals, chips, sort ORDER with no-year
last, memory on reopening, a version drilled into and Back; a failed page and
its retry; Stop with a page under way and before a page's slot; an old reader
version not served) and the last test of `popup-ext.mobile.spec.js` (a tap
opens a master's window, page 1 comes on the record's repaint, the controls
answer taps). Versions fixtures `ext-discogs-master-versions-p1..p4`
(captured 2026-10-17). Mutations: the `Discogs:` entries, "artwork viewer:
the same image counted twice" and "dialog shell: mouseenter …". The artist
and label windows: the block "the Discogs artist and label windows
(2026-10-18)" (no list from a hover; sections by role and "so far" after page
1, complete after the rest; the credits box; 150 rows and "Show more"; sort;
the filter and chips; a master row's versions, one request, shared between
two roles; Springsteen's page 1 of 68 and the cost on its button without a
token; the profile's links; 27 images in the viewer; a master drilled into
and Back; a label's warning, its batch of 5 and no page more, Show all,
format chips, the other order asked once; Stop and a later visit from
IndexedDB; an artist record of reader version 3 not served) and the last test
of `popup-ext.mobile.spec.js` (taps on the run, a section, a master's
versions, a label's order). Fixtures `ext-discogs-artist-small*`,
`ext-discogs-artist-releases-p1`, `ext-discogs-label-releases-*`,
`ext-discogs-master-450426-versions-p1` (captured 2026-10-18). Mutations: the
`Discogs artist…`/`Discogs label…` entries.

### A Discogs release's edit history (2026-10-18)

Mockup https://claude.ai/artifact/Y69bUJTvYSksKTFRMcYJvZ, tab C; vzell's
answers: on discogs.com AND on MusicBrainz; on a submissions list a title
opens "History, then the release" (docs/claude/discogs.md, "Submissions").

- **Reader `dghistory`, BEFORE `discogs` in `_EXT_READERS`**:
  `_EXT_DISCOGS_PATH_RE` ends in `(?:[-/]|$)`, so the Discogs reader takes
  `/release/<id>/history` too — `_extDgHistTest()` must win first.
- **The page**: `/release/<id>/history` (saved as
  `debug/discogs-release-history.html`) holds the same parts as the
  submissions browser view's `#historyData` pane: `#editing_header` (name,
  100 px picture, `[r…]`), `table#hist` (one `tr.datarow` per change, the
  newest `#latest`; `.linked_username`, `.hili` — none for a comment —,
  `.history_notes_content`, the date in `span[title]` as "Feb 24, 2016
  01:24 PM", View/Changes/Images links, `href` on the standalone page,
  `data-sb-navigate` in the pane), `#rating .vote_info_helper`, and
  `table.diff` (two cells, each the whole release page as it was, marks
  `hl_added`/`hl_changed1`/`hl_changed2`; Discogs' legend: removed, changed,
  added). `_extDgHistParse()` reads either; `_extDgHistHtml()` keeps text,
  breaks, links, bold and the marks, nothing else; `_extDgHistBlocks()` cuts
  a diff side into named blocks (the profile's facts, each section) and a
  block is `changed` when either side has a mark.
- **Only on Space** (`windowOnly`: the card says "Not read yet" until the
  window has read it) — a new reader flag in `_extCard()`. ONE request,
  `_extDgHistGet()`: on discogs.com a same-origin `fetch()` with the
  browser's session (an anonymous request there would meet the browser
  check that session has already passed), through the host's slot; on
  MusicBrainz `_extGet()` (anonymous, as every external request), and a
  Cloudflare answer is the usual `checked` record. `_extHostKnown()` counts
  the page's own host as known (a same-origin request never prompts).
- **One cache entry per release**: `keyUrl` (new reader option) makes the
  key `ext:dghistory:https://www.discogs.com/release/<id>/history` whatever
  the link's slug or language, and `_extDgHistTarget()` builds the same
  target for a release's window, so a history link and a title share one
  request. Records: `_EXT_IDB_VERSION * 100 + _EXT_DGH_VERSION` — bump
  `_EXT_DGH_VERSION` when the parser's output changes.
- **The window**: card facts Last change, Changes ("15: 9 edits, 2 images,
  …"), Data quality, First; sections `dgh-hist` (every change: ISO date with
  Discogs' relative time on hover, user, kind pill, note cut to two lines
  with more/less, links; kinds as a filter, Newest/Oldest first; state per
  release in `_extDgHistUi`) and `dgh-diff` ("revision 13 → 14", only the
  marked blocks unless *The whole release*). Controls:
  `_extDgHistControl()`, from the reader's own `onAreaClick` and from
  `_extDiscogsAreaClick()` (the release window on a submissions list).
- **New window part `top`**: a reader's `window()` may return `top`, drawn
  full width ABOVE the two columns (`_extExtracted()`); only the release
  window on a submissions list uses it.
- **`_extLoad(t, {wanted})`**: a caller other than the card or the window
  on `t` passes who still wants the answer (the release window asking for
  its history; the artwork viewer on a Discogs row, docs/claude/discogs.md).

Tests: `tests/fixtures/discogs-submissions.spec.js` (the history link, the
title, a sign-in page, the MusicBrainz link) and the last test of
`discogs-pages.mobile.spec.js`. Fixture `dg-release-history.html`
(`scripts/build-discogs-fixtures.py`). Mutations:
`scripts/mutations/discogs-submissions.json`, the `dghistory:` entries.

**View changes (round 2, 2026-10-18).** Discogs' View and Changes links are
one button per change that has a diff (`e.rev`, from its links;
`_EXT_DGH_VERSION` 2); an image change keeps its Images link. The click sets
`_extDgHistUi.rev` and starts `_extDgHistDiffLoad()`: ONE request for the
`?diff=<rev>` page (saved as `debug/discogs-release-history-diff.html` — the
same markup, its diff the one asked, the changed row `highlight`, no rating
or form), key `ext:dghistory-diff:<id>:<rev>`. The second section then
reads "Change · revision 8 → 10" — Discogs' numbers from the page: it
compares 10 with 8 when 9 changed no data — with "Back to the latest
change". **Each diff side holds the release page, whose tracklist is a
table too:** the parser takes `:scope > thead/tbody` of `table.diff` only
(it took a tracklist cell as the "new" side before; revision 14 came out
right by luck).

### Discogs users, searches, support articles; every link in the window (2026-10-18)

Mockup https://claude.ai/artifact/XRTM8v1aLNj3voVt6RxVJz, tab B. Three
readers, after `discogs` and before `generic` (their paths are not
`_EXT_DISCOGS_PATH_RE`'s), each with `keyUrl` and `_EXT_DGX_VERSION`:

- **`dguser`** (`/user/<name>`): `api.discogs.com/users/<name>` (no token):
  the card's facts (`cardFacts` 6); the window adds the **Recent activity**
  (`_extDgUserActivity()`: the user's page through `_extDgHistGet()`,
  `table.broadcast_table` rows — kind from the icon's `aria-label`, the text
  with its links, the date; saved as `debug/discogs-user-vzell.html`) and the
  user's Discogs pages.
- **`dgsearch`** (`/search/?q=…[&type=…]`): `database/search` — Discogs'
  docs say it needs authentication, it answered 200 without (probe
  2026-10-18); page 1 in the record, "Load 25 more" via
  `_EXT_DG_LISTS.search` and `_extDgListLoad()` (25 a request, vzell).
- **`dgsupport`** (support.discogs.com `/hc/…/articles/<id>`): the pages
  answer with Cloudflare's check, the Help Center API
  `/api/v2/help_center/articles/<id>.json` does not; `_extDgSupportHtml()`
  keeps the article's structure and links, its anchors as
  `data-mb-dgs-anchor` (never ids in our page), marks the block of the
  link's `#section`; the window scrolls to it once per opening
  (`scrolledFor`); a link to another section of the article scrolls there.

**A secondary request inside a window starts on `start` OR while it has no
state yet** (as `_extDgListStart()`): after a drill-down the target's own
record arrives on a repaint, which is not a `start` render — the activity
and a release window's history never started then (`discogs-links.spec.js`
caught it; the release case had passed only because the card had loaded the
release first).

**Every link in a Discogs window drills** (`_extDgDrill()`: any reader, not
only `discogs`; vzell: "ALL links should be resolved inside the same
popup"), from every Discogs-family window (`_extDgFamilyClick()`: section
heads, "Load 25 more", in-article anchors, then the drill). On discogs.com a
same-host link gets a target only through `_extDgSiteTest()`.

Tests: `tests/fixtures/discogs-links.spec.js`. Fixtures
`ext-discogs-user-*`, `ext-discogs-search-columbia-label-p1/p2`,
`ext-discogs-support-360005006654` (`scripts/capture-ext-fixtures.py`),
`dg-user-vzell.html`, `dg-release-history-diff.html`. Mutations:
`scripts/mutations/discogs-links.json`.

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
  so the Live page reuses the hover's fetch. On discogs.com only, a site's
  `ownLinks` pages count too (Brucebase's shows, venues, people; 2026-10-24,
  docs/claude/discogs.md "Link previews on discogs.com"); on MusicBrainz a
  `/gig:` link stays generic (popup-ext U4 "which reader serves which link").
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
  once and again at `_EXT_BB_SCROLL_AGAIN_MS`, and once more on the frame's
  `load` (the page is prepared when parsed, its images can come much later) —
  each only until the reader has used the wheel, a key, a mouse button or
  touch in the page. Not by comparing scroll positions: hiding the
  navigation moves the page right after the first scroll, and Chrome's
  scroll anchoring then changes `scrollTop` by itself (the first version of
  this guard, 2026-10-17, stopped every later scroll that way). Chrome's
  anchoring also keeps the show in place while images land, so the spec
  turns it off (`overflow-anchor: none`) to see the scroll on `load`. And
  with the http link as its
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
the year is kept), a show's window and marked Live page, the Live page
prepared before its images (held back 6 s, 40×40 each: trimmed, marked and
scrolled before they come, scrolled again on `load`) and a reader's wheel
not undone (2026-10-17), and a cancelled show. **`openEvent()` refuses the
four sites' hosts and wikidot/wdfiles** (a Live page frame fetches the site's
own CSS and images; the Brucebase test failed whenever the real site was
slow); a test that wants them answers them with a later route. Year page fixture: `tests/fixtures/ext-bb-year-2025.html`
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
