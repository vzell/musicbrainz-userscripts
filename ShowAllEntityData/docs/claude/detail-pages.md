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
| springsteenlyrics.com | `sa_sl_detail_preview` | `collection.php`/`bootlegs.php`/`brucelegs.php` with `item=N`; `lyrics.php?song=SLUG` (the lyrics index, WIP.2) |
| jungleland.it         | `sa_jl_detail_preview` | `/html/*.htm` except list, images, artwork                                                                      |
| brucespringsteen.it   | `sa_bs_detail_preview` | `/DB/detrec.aspx?code=`                                                                                         |
| brucebase.wikidot.com | `sa_bb_detail_preview` | `/song:<slug>`                                                                                                  |

All four default **off** and sit under their host's own `sa_enable_<site>`
setting, which still has to be on. `_DP_SITES` is keyed by `_foreignHost`,
so on MusicBrainz `_dpActiveSite()` is null, and `_initDetailPreview()` is
only called when `_foreignHost` is set. Nothing of this feature runs there: no
stylesheet, no listener, no database. The spec pins that with every preview
setting on (`"on a MusicBrainz page, every preview setting on changes nothing"`).

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
- **Keyboard focus** on a link (`:focus-visible`) shows the card too.
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
allow-popups-to-escape-sandbox">` of the page itself: same origin, so its
document is the script's to change, and NO scripts, so no trackers, no
pop-ups and no second run of the page's own code. `_dpIsolateFrame()` runs on
load:
- it hides every sibling of the host's `liveRoot` and of each of its ancestors,
  plus the `liveHide` selectors. Both go through
  `html.mb-dp-isolate .mb-dp-hide`, which the "Hide the site's navigation" box
  toggles;
- it runs `livePrepare`. Brucebase's tabview cannot switch without its
  scripts, so every panel is shown under an `h3.mb-dp-tablabel`;
- it hides images that failed to load. The pages' own `onerror` handlers do
  not run;
- it makes links open in a new tab.

The frame is a second request for the page; it is user-initiated (a press of
"Live page", or a step while that view is shown) and goes through no gate.

## Performance

Nothing here is on the filter, sort or render path. The listeners are
delegated on the document and return at once for anything that is not a
detail link. `_dpRowLinks()` walks the table's rows once per dialog step,
which is about 1,900 rows and as many `new URL()` calls on brucespringsteen.it's
unofficial list. That happens on the key press, not on a render.

## Tests

| Spec                                              | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|---------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/detail-preview.spec.js`           | every parser on saved pages (discs, a lineage note, scans; side numbers; the unnumbered list; tracklist shapes the pages lack; jungleland's labelled backslash scans and unknown date; bs's label run, ditto marks, official labels, the photo; Brucebase's count, last show, releases, downloads, sections); the preview off = no card, no request; MusicBrainz with every preview on = nothing; one request then memory; beside the link; Esc; Space pins; ← → steps with a 404 row; Space TYPED stays typed and render focus does not block the pin; a moved-on hover makes no request; a photo, a failed photo; sl's Live page view with the navigation hidden and the box; jungleland decoded from windows-1252 and read from IndexedDB after a reload; Brucebase's card, lyrics, and Live page with every tab; song pages (version, lyrics by shape, sections without placeholders, versions count; "Lyrics not available"); the lyrics index's card (excerpt and line count as parsed from the fixture), its dialog, and a song without lyrics |
| `tests/fixtures/detail-preview.mobile.spec.js`    | a tap opens the dialog, not the page, and shows no card                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Fixtures: `python3 scripts/build-detail-fixtures.py` turns the curl captures
`debug/detail-*` into `tests/fixtures/detail-*.html`. It works on bytes, so the
jungleland.it pages stay windows-1252, and it strips scripts, noscripts,
iframes, links and background images. `tests/support/detailFixture.js` serves
them after a list loader's catch-all and answers a detail URL with no fixture
with a 404. Mutation list: `scripts/mutations/detail-preview.json`.

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
