<!-- Written on branch sl-support (org/springsteenlyrics.org), extended on feature/sl-all-categories. This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# springsteenlyrics.com: the first non-MusicBrainz host

ShowAllEntityData also runs on springsteenlyrics.com's paginated list pages —
the **collection** (`collection.php?cmd=list…`) and the **bootleg** lists
(`bootlegs.php?cmd=list…`), every category and every `f_*` filter — as the
pageTypes `sl-collection` and `sl-bootlegs`, and on the collection's entry
page `collection.php` ("Latest additions", every item, `pg=` pagination) as
`sl-collection-intro`, on the **CD and vinyl bootleg** list
(`brucelegs.php?cmd=list…`) as `sl-brucelegs`, and on the **lyrics index**
(`lyrics.php`, one page per first letter) as `sl-lyrics`. It has its own
switch, `sa_enable_springsteenlyrics`, default **on** since 2026-10-26 (off
before). Only what each list card shows goes into the table; an item's own
page is read by the detail preview (`sa_sl_detail_preview`, docs/claude/detail-pages.md)
and, since 2026-11-04, has pageTypes of its own (`sl-collection-item`,
`sl-bootlegs-item`, `sl-brucelegs-item`; see "An item's own page" below), and
since 2026-11-05 a song's own page has one too (`sl-song`; see "A song's own
page" below). The bootleg landing page
`bootlegs.php` (`sl-bootlegs-intro`) has no cards; it is supported only for the
compact bar, and only while `sa_sl_compact_nav` is on as well — see "The
bootleg landing page" below.

Those pages are not MusicBrainz in any way the script normally relies on: no
`table.tbl`, no `div#content`, no `<h1>` or `<h2>`, no MusicBrainz stylesheet,
Bootstrap 3 instead. Each page shows 100 `div.blog-post` cards. Everything
below is what it takes to feed those into the unchanged pipeline.

## The host gate — `_isSlHost`

`const _isSlHost` (grep it) is computed right after the settings are copied,
and the gate below it returns from the IIFE when the host is SL and the setting
is off. **It sits before the migration notice, the Ctrl-M listener and the
toolbar on purpose**: with the setting off the site's page must be untouched.
The library's own Tampermonkey menu items are registered earlier still, so the
setting can be switched on from the SL page itself; settings are per-script GM
storage, so MusicBrainz and SL share them.

Three places read `_isSlHost` after that, and each says why. Since
2026-10-06 there is a second foreign host, jungleland.it
(docs/claude/jungleland.md), so the detection loop compares through
`_foreignHost`, the host's name or `null`, rather than `_isSlHost` itself:

| Where                                | Why                                                                                                                                               |
|--------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| the `pageDefinitions` detection loop | `if ((def.host || null) !== _foreignHost) continue;` — a definition with a `host` belongs to that site alone, and on SL only those are considered |
| `performClutterCleanup()`            | every target is MusicBrainz furniture; some removals (any `<details>` with >5 images, any 700px div) would hit unrelated content                  |
| `initNavigationGuard()`              | every SL page is one PHP script told apart by its query string, so there only a HASH-only change is "the same page"                               |

`initStickyPageHeaders()` used to be a fourth and stand down on SL; since
2026-10-05 it runs there too — see "Sticky Page Headers and the sticky Title"
below.

**The `host` filter is a guard no spec can see today** — no MusicBrainz matcher
claims `/collection.php`, and no MusicBrainz URL reaches the SL matchers. It is
recorded as `"expect": "pass"` in `scripts/mutations/sl-support.json` and
exists for the next broad `path.includes()` matcher.

**The three `@include` lines are the real outer gate**, and the fixture harness
never evaluates them (`loadPage.js` injects unconditionally), so
`tests/fixtures/sl-include-regex.spec.js` reads the header and checks it:
every list page and both entry pages in; item pages, `lyrics.php` and
look-alike hosts out. `cmd=list` is matched anywhere in the query, because the
site's own filter forms submit `?f_date=…&cmd=list&category=f_date`. The
second line admits `collection.php` bare, with `cmd=intro` anywhere in the
query, or with only `pg=N` (the entry page's "»" link is `?pg=54&cmd=intro`).
The third admits `bootlegs.php` bare or with `cmd=intro` (added 2026-10-05 for
the compact bar; it was deliberately excluded before, having no cards).

## The toolbar anchor — `_slPrepareLivePage()`

Called from the init block right after the header lookup, for SL definitions
only (beside the scoped `user-edits` fallback). It injects
`<h1 class="mb-sl-h1"><bdi>Collection — OFFICIAL ALBUMS</bdi></h1>` as the
first child of `.project-detail`, the section name coming from the breadcrumb
`.breadcrumb-wrap h4` and the rest from the list heading. The `<bdi>` is what
lets the init-time `_cachedEntityName` capture read it like a MusicBrainz
`<h1>`. It also adds `body.mb-sa-host-sl`, installs `_ensureSlStyle()`, and
measures the site's sticky navbar into `--mb-sl-navbar-h`.

**Never scope a lookup to `.project-detail`; find the list from its cards.**
That was the rule until 2026-10-05, and it made the converter a silent no-op
on every collection category but "Official Albums". Those pages render a
"Filter by original year of release" block that ends in a stray `</div>`, and
the parser closes `.project-detail` right there — the list heading and every
card come AFTER it (on book and memorabilia a second stray `</div>` also
closes the floated `.col-sm-12` around it). Checked live: sampler, book,
memorabilia and the entry page close it before the first card; album and the
bootleg lists after the last. So `_slFindCards()` takes every `div.blog-post`
outside the navbar and footer (its count equals the page's "Showing items"
count), and `_slFindListHeading()` takes the `h3.heading`/`h2.heading` that
is a direct child of the first card's parent (or, once converted, of the
table's) — which also keeps out the seven `h3.heading`s of the navigation
mega-menu. `.project-detail` is still where the toolbar `<h1>` goes: it
exists on every page and still holds the category buttons.

## The converter — `applySlCardsToTable(def, docContext)`

The counterpart of `applyEditsToTable()`, gated by
`features.slCardsToTable: 'collection' | 'bootlegs'`, and called in the same
**three** places as the other converters — miss one and a whole class of rows
disappears:

1. click-time pre-processing in `startFetchingProcess()` (the live page, page 1);
2. the pagination loop, `doc !== document` (every fetched page);
3. `_hydrateAndRenderFromSnapshotData()` (Load from Disk: after a reload the
   live page holds cards again, and without the table the headers block
   fabricates a shell at the end of `<body>` — the site has no `#content`).

**It never returns silently on a page without cards.** If it finds no card and
no `table.mb-sl-table` (the one legitimate case: a page it already converted,
which Load from Disk hits on a second load), it logs a `Lib.warn` with the
number of `div.blog-post`s it saw — "only Official Albums works" stayed
invisible precisely because the button rendered "0 rows" and the console said
nothing. On a fetched page the likeliest cause is a CloudFlare challenge.

On the live document it also renames the list `h3.heading` to
`<h2 class="… mb-sl-list-heading">` (so `updateH2Count()` anchors the count
and filter bar there; the class carries its style, since the heading usually
sits outside `.project-detail`) and tags the table's fixed-width Bootstrap
`.container` ancestors `mb-sl-wide`.

**Read card fields by label, never by position.** `_slReadCardFields()` maps
each `<span class="text-primary"><em>Label:</em></span> value<br>` line by its
label text; a card that lacks a line just yields no key. Cards vary: 7 of 100
collection cards and 16 of 100 bootleg cards have no sub-title line (the bold
text after `glyphicon-option-vertical`).

Columns (`_SL_HEADERS`):

| sl-collection                                                                                | sl-bootlegs                                                                                                                                                                               | sl-brucelegs                                                                                                         |
|----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Cover, Title, Version, Label, Cat. no., Format, Country, Release date, Original year, Copies; logged in also MusicBrainz, Good scans, Kept in | Cover, Title, Label, Date, First date, Show, Location, Format, Duration, Lossy, Artwork, Info file; logged in also MusicBrainz (+ DD, MM, YYYY, Day, Month, Place, Locality, Region, Country from `columnExtractors`) | Cover, Title, Version, Label, Cat. no., Date, First date, Show, Location, Format, PDF, Artwork (+ the same nine extracted columns) |

- **sl-brucelegs** (`brucelegs.php?cmd=list`, 402 cards on 2026-10-06, `page=N`):
  - **Cards and fields.** It uses the same `div.blog-post` cards, so the same
    converter applies with a third kind. Its fields are Label (often a
    `f_label=` link) and Cat # on separate lines, then Date, Location and
    Format. The sub-title is the pressing, so it goes in Version as on the
    collection.
  - **PDF and Artwork.** "PDF available" and "artwork available" appear on
    all 402 cards, so until 2026-11-04 they got no column; vzell asked for
    both anyway (answer 5 of that day). PDF links the item page (the PDFs'
    own file names are not on the card).
  - **Dates.** The real shapes are `DD Mon YYYY` 169, `YYYY / YYYY` 170,
    `YYYY` 59, `Mon YYYY` 2, and `Mon YYYY / Mon YYYY` 1, all read by
    `_slFirstIsoDate()`.
  - **Locations.** The shape that matters for `splitLocationText`: 221 of
    402 Locations are one-part descriptions ("Various Location", "Studio /
    Live", "Unknown location"), which go to Place. 137 end in "USA",
    sometimes with a show note ("USA (Early Show)"). The Show column falls
    back to that note, since Date never carries one here.
  - **Tests and the compact bar.** No fixture card has such a note, so the
    `@extended` live spec checks it on every real row, and the mutation is
    recorded `"expect": "pass"`. The compact bar does not apply: the kind is
    not in its gate's list.

- **Label / Cat. no.** and **Release date / Original year** split the site's
  "Label (Cat #)" and "Release date (Original year)" at the LAST parenthesised
  group (`_slSplitTrailingParen()`).
- **Copies**: "I have N copies" only appears for N ≥ 2; no line means 1 (the
  site's own "Nb. of copies = 1" filter says so).
- **First date**: `_slFirstIsoDate()` turns the first date of the site's free
  text ("16-17 Sep 1967", "16 Sep 1967, 30 Sep 1967", "Sep 1967",
  "30 Sep - 1 Oct 1967", "20 Sep 1969 (early show)") into ISO, so a text sort
  is chronological. Date keeps the site's text.
- **Show**: `_slShowQualifier()` reads the parenthesised notes of the Date
  text ("early show", "Today Show soundcheck"). Repeats collapse, and
  different notes are comma-joined. The lyrics pages' Show column uses the
  same reader.
- **DD / MM / YYYY / Day / Month** (since 2026-10-06): the MusicBrainz
  `dateParts` extractor, run on First date through `features.columnExtractors`.
  Because First date is already ISO (or `YYYY-MM`, or `YYYY`), nothing
  SL-specific is needed. The pipeline appends extracted columns at the END
  of the row, not beside their source. That is how every MusicBrainz page
  does it too.
- **Place / Locality / Region / Country** (since 2026-10-06):
  `ColumnDataExtractor.splitLocationText`. It is the plain-text sibling of
  `splitLocation`, which cannot be used here because it routes
  `/place/`/`/area/`/`.flag` LINKS and SL's Location is text.
  `_parseLocationText()` reads one location from the end:
  - The last part is a US state or Canadian province (Region, with its
    Country filled in as `United States`/`Canada`), or else the Country.
  - A state or province just before a Country is the Region.
  - The next part back is the Locality, and the rest, comma-joined, is the
    Place.
  - A ONE-part location is a description and goes to Place ("Various
    Location", "Studio / Live" on brucelegs).
  - A parenthesised note is dropped ("USA (Early Show)").
  - `USA`/`US`/`U.S.A.` read as `United States`
    (`_LOCATION_TEXT_COUNTRY_ALIASES`).
  - Several locations joined by ` - ` (the multi-show bootlegs) become
    parallel `<ul><li>` lists, one item per location in every column. This
    is the layout `splitLocation` uses for multi-row cells.

  Survey of page 1 of all 21 bootleg categories (2,055 cards, 2026-10-06):

  | Location shape                              | Cards |
  |---------------------------------------------|-------|
  | `Venue, City, ST` or `Venue, City, Country` | 1,763 |
  | `–`                                         | 243   |
  | `City, ST` or `City, Country`               | 27    |
  | ` - ` joined                                | 20    |

  In that sample, venue names contain `&` but never a comma. State codes and
  names come from `_LOCATION_TEXT_REGION_CODES` plus the existing
  `AREA_FLAG_REGION_SUBDIVISIONS`.
- **Duration**: `integerColumns` `align: ':'`, which is what makes
  `_sortColumnKind()` sort it as a duration. The site's "–" (unknown) is written
  as MusicBrainz's **`?:??`**: `_buildSplitAlignWrap()` emits the separator even
  for a value that has none, so "–" would render as ":–". That is a latent
  quirk of the shared helper (MusicBrainz never shows it, because its unknown
  length always contains a colon) — see DEBUG-NOTES.md, 2026-10-04.

## Logged in: the cards' icons as columns (2026-11-04)

Only while the tab is logged in (`_slLoggedIn()`: the login box has
`button[name="hBtnLogout"]`; a visitor gets `hTxtPassword`), a card has a
flags line: `<a href="https://musicbrainz.org/release/<mbid>"><img
src="img/collection_musicbrainz.png"></a>`, and on the collection
`img/collection_goodscans.png` and `img/collection_in<place>.png` ("In
Switzerland", "In Lebanon"). The same line is on the item page.
`_SL_LOGGED_IN_HEADERS` adds MusicBrainz, Good scans and Kept in (collection)
and MusicBrainz (bootlegs) after the kind's own columns; `_slHeaders()` asks
the LIVE document once per run, so every fetched page's rows have the same
cells, and a logged-out run is exactly as before. Kept in is one column for
every `collection_in*.png` (vzell's answer 3). The MusicBrainz cell is
`a.mb-sl-mb-link` reading "MB" (`_slMbCell()`); its card and window are
MusicBrainz's own, through the `dg-mb` source, whose selector names SL's card
links, our tables and the item head on this host only (`_dgMbSource()`,
`_slMbIconName()`).

A logged-in card also writes the item number and a second ⋮ marker BEFORE the
title, so `_slCardSubtitle()` takes the bold text after the first marker that
has one (until 2026-11-04 every logged-in card's Version was empty).

Counts over 100 cards (vzell's logged-in snapshots, 2026-11-04): collection
album MusicBrainz 19, Good scans 99, Switzerland 99, Lebanon 1; bootlegs
aud_live1978 MusicBrainz 86, artwork 61, info file 84; brucelegs PDF and
artwork 100.

**Info file** links `bootlegs/<category>/<item>_infofile.txt`
(`_slInfoFileUrl()`, from the card's item link; checked on items 9507 and
2567). The SL preview takes that link too (`_SL_INFO_FILE_PATH_RE`,
`_dpParseSlInfoFile()`), with `windowOnly`: its card makes no request and says
Space reads it (vzell's answer 2).

## An item's own page — `sl-collection-item`, `sl-bootlegs-item`, `sl-brucelegs-item`

Since 2026-11-04 (org/springsteenlyrics.org "Add new SL PTs and POHs";
mockups `org/sl-item-pts-mockups.html`, https://claude.ai/artifact/GBFJp9Ebo8LDoGPSskVMkg).
`@include` admits `(collection|bootlegs|brucelegs).php?…item=N`;
`_slItemKind()` matches. One button, "Show the tracklist"; the CD and vinyl
bootlegs add "Show all versions of this bootleg" (`slItemView: 'versions'`)
when the page's "All versions of this bootleg" lists more than one card
(`_slItemVersionCount()`): on most items it lists the item itself alone (148,
281); item 41 lists six pressings (fixture `detail-sl-brucelegs-41.html`, from
a snapshot saved with the script running: `strip_script_ui()` in
`scripts/build-sl-item-fixtures.py` takes the script's toolbar, styles and
menu out again).
No request: `features.pageRequest`'s `fetchText` returns the page's own HTML,
`tableMode: 'multi'` with `groupByH3`.

- **Read the copy, never the live page.** `_slItemPageHtml()` takes the page's
  HTML once, at the first press (`applySlItemToTable()`), and the head
  (`_slItemHeadSpec()`) and every view read that copy (`_slItemSourceDoc()`):
  the grouped render clears the site's own `h3.heading` sections out of
  `.project-detail`, the container the tables go into, before the head is
  built.
- **Page anatomy** (13 snapshots of 2026-11-04): `.project-detail` holds the
  card, `div.divide30`, the tracklist `span.monospaced` (on the CD and vinyl
  bootlegs after an `<h3>Trackslist</h3>`, `_slTracklistBlock()`), then the
  `h3.heading` sections (`_slItemSections()`): collection `Scans/Photos[
  (copy #N)]`, `Private info`; bootleg `Original info file`, `Artwork`,
  `Private info`; brucelegs `Details`, `Trackslist`, `Runout groove etchings
  (vinyl) or inner ring text (CD)`, `Release info`, `Artwork and PDF`, `All
  versions of this bootleg`. Two of the "collection" snapshots are bootleg
  pages.
- **Tracklist** (`_slParseTracklist()`, shared with the preview): headers
  `Disc N:`, `Disc: (82:40.00)` (a total), `Record 2: "Cover Me" (catalogue #
  …)`, `Disc 2: [DVD]` (the kind in brackets, collection item 7457; until
  2026-11-05 it was no header, and the DVD's tracks were read as notes;
  `_DP_DISC_RE` takes text after the colon only when it opens with a quote,
  a parenthesis or a bracket, so "Tape: Sony …" stays a note); lines `A1- TITLE`, `01- TITLE #2 [partial]`, and without a separator
  `A1 Title - V1`, `01 Title (5:45.15)` (only in a block where no line has
  one). `_slItemGroups()`: a sub-table per header; a list of side positions
  without headers is paired into records, A/B → Record 1 (vzell's answer 4);
  anything else "Tracks". A block with headers and NO track line is a box
  set's contents (sampler items 5618, 5619; vzell 2026-11-05): each header
  with its paragraph's lines is a `contents` entry, those lines are no notes,
  and the unnumbered-titles reading is skipped (it had taken the first
  record's "Aussie pressing", "Cat# …", sleeve lines for three tracks).
  `_slContentsRow()` splits an entry into Pos ("Record 1"), Title (inside the
  quotes), Cat. no. ("Cat# …" line or "(catalogue # …)") and Details; the
  item page shows one "Contents (no tracklists on the page)" table, the
  record a `highlight` ("6 records listed, without their tracklists") and a
  "Contents (6)" section (`ol.mb-dp-contents`). `_slSplitTrackTitle()`: "Artist: Title" on a
  various-artists page (half the lines or more), " - V1 …" → Version and
  Note, "#2" → Take (answer 3), "[…]" → Note.
- **Columns**: collection Pos, Title, (Artist), Version / note; bootlegs Pos,
  Title, Take, Note; brucelegs Pos, Title, Version, Note, (Length, sorted as a
  duration).
- **Head** (`_fdHeadInsertSections()`, extended for it with `texts`,
  `textsAfter`, `pictureGroups`, a text's `note` and `lazyText`): Notes and
  Release info; Details — Release (or Show and Recording), the runout
  etchings, "Your collection" (logged in: MusicBrainz link, Good scans, Kept
  in, item number, edit link) and Files; one pictures section per scans or
  artwork section, with the page's captions; then "Original info file", read
  same-origin once when its section is first opened (answer 2), and "Private
  info" (logged in, closed).
- **Private info never leaves the item page**: `_SL_ITEM_OWN_SECTION_RE` keeps
  it out of the preview's record, and the fixtures are scrubbed
  (`scripts/build-sl-item-fixtures.py`).
- **The site's own item content is hidden** (`mb-sl-item-native`) once the
  view is in place: the head and the tables show all of it. The navbar and
  breadcrumb stay.
- **Full width.** `applySlItemToTable()` marks the `.container`s around
  `.project-detail` `mb-sl-wide`, as the list converter does: without it the
  view sat in the site's 1170 px column ("so much empty space on both
  sides", bootlegs.php?item=4615), and All versions' one-row table (~2300 px)
  squeezed the toolbar and the head into a column ~150 px wide
  (brucelegs.php?item=148; vzell, 2026-11-04, `debug/sl-detail-empty-space.html`,
  `debug/sl-brucelegs-all-versions.html`). Pinned under Bootstrap's grid rules
  in `sl-item.spec.js` ("the width of the window").

Song links and work glyphs in the tracklists: see "Song links and
MusicBrainz works in tracklists" below. Not built: the logged-in collection
list's two extra filter forms (`filter_collection_info_public` /
`…_private`, answer 6).

## A song's own page — `sl-song`

Since 2026-11-05 (org/springsteenlyrics.org "Overwhole of the SL PTs and
POHs", vzell's answers 1–8; mockups `org/sl-song-mockups.html`,
https://claude.ai/artifact/XFubyj74n1CAouHYT2m5ou). `@include` admits
`lyrics.php?…song=SLUG` and `lyrics.php?…item=N` without any `cmd=` (a
lookahead: `cmd=edit&item=N` is the site's edit form,
`cmd=displaycoverrelease&item=N` a cover release); `_slIsSongPage()`
matches, and `sl-lyrics`' match leaves `item=` alone. Two buttons: "Show
the song" and "Show all versions of this song" (`slItemView: 'versions'`,
only when the page links another version). No request, as the item pages:
the features (`_slSongFeatures()`) use the item pages' live part
(`applySlItemToTable()`, kind 'song') and their copy of the page
(`_slItemPageHtml()`/`_slItemSourceDoc()`).

- **One reader, two uses.** `_slSongRead()` reads the page into one record:
  the version (through `_slLyricsParseVersion()`, so Type/Date/Show match the
  lyrics index), the lyrics, the text sections, the releases with their
  editions (`_slSongPanels()`), the `.blog-post` rows (`_slSongRow()`:
  releases, covers, movies, and live releases from one sentence each,
  `_slSongLiveSentence()`), the versions, the pictures, a live version's
  show (Info's "performance of X at VENUE in PLACE, during the TOUR",
  answer 5) and release, the studio facts, Private Info and Request's text.
  The page view (`_slSongToHtml()`, `_slSongHeadSpec()`) and the preview
  (`_dpParseSlSong()` → `_dpSlSongFacts()`, parser version 11) both read it.
  The preview adds only counts and, for a live version, its release's
  tracklist (`self` marked ● by `_dpTrackListHtml()`); an album version's
  tracklist would have pushed its lyrics down in the window.
- **Page anatomy** (four logged-in snapshots of 2026-11-04: album,
  unofficial studio, live, no lyrics): `.project-detail` holds the `<h3>`
  title, `<p><em>` version, the lyrics between two `<hr>`s, then
  `h3.heading` sections to the next heading or the `<h5>` "Page last
  updated". A heading that is one `<em>` is a release, its `.panel-group`
  one panel per edition (`<p><strong>Side 1:</strong></p>` + `<ol>`, or a
  bare `<ol>`; a release row's panel is text lines "01- <a>…"). The site
  writes "Disc 5:" among "Side 1:" to "Side 8:" (Hammersmith Odeon's vinyl):
  read as side 5 (`_slSongEditionGroups()`). Logged in, every version line
  has its number and edit link, a cover row "view item / edit item / add N
  songs" (answer 8: the first two as an Item column), and the page ends with
  Private Info.
- **Tables**: an edition each ("<release> · <edition>[ · Disc N | Record
  N]": Pos, Title); Other official releases; Live releases (Cover, Date, Show,
  Release, Kind, Released, Version — this song's page of that show, found by
  date and show among the versions —, Note); Covers (+ Item logged in);
  Appearance in movies; Available versions (the lyrics index's columns, ID
  logged in). Date is split by `dateParts`; the sub-tables differ, so
  `sl-song` is in the per-table extractor re-resolution list. This version is
  `td.mb-sl-self` (a ● by CSS, the cell's text unchanged), unlinked in the
  versions as on the site.
- **Head**: Lyrics (stage notes greyed), the text sections, Request without
  its form (answer 3), Details (Version, Show, Released on, Studio recording,
  On this page), Pictures, Private Info (logged in, closed: answer 2).
- **The site's `overflow:hidden`.** Only the song pages give
  `.project-detail` an inline `style="overflow:hidden"`. That made it the
  scroll container of everything sticky in it: before any press the toolbar
  `<h1>` (`.mb-vsb-head`, `top: 80px`) was drawn 80 px down its box, over
  the site's own title, and after a render the sticky Title column sat at
  `left: 34.5px` of it, 15 px over the next column (vzell's screenshots,
  2026-11-05; measured under the site's real CSS from
  `debug/sl-song-official.html`). `_ensureSlStyle()` overrides it with
  `overflow: visible !important; display: flow-root` (the float containment
  kept). Pinned by `sl-song.spec.js` "layout".

**MusicBrainz → SL, old addresses.** MusicBrainz still carries two old forms,
nearly all in work annotations (sample of 2026-11-04,
`scripts/probe-mb-sl-urls.py`): `/lyrics/<l>/<slug>.php` and
`/collection/moreinfo.php?item=N`, both 404 now. `_slCurrentAddress()` maps
them to `lyrics.php?song=<slug>` and `collection.php?item=N`; the springsteen
reader takes them (`_extDpTest()`), reads the current address
(`_extDpLoad()`, whose record's first field is "Old address"), and its
Live page frames that address (`liveUrlFor`). The ⚠️ finding
`sl-old-address` (docs/claude/findings.md) marks Annotation cells with such
a link, on an annotation search or an annotation report.

## Song links and MusicBrainz works in tracklists

Since 2026-11-05 (org/springsteenlyrics.org "URLify the tracklist to song
URLs (SL and MB)"; mockups `org/sl-tracklist-links-mockups.html`,
https://claude.ai/artifact/9etFwvJXtoLWkfZzPxnTJo, vzell's answers 1-8; probe
results in DEBUG-NOTES.md of that day). Three settings, all on:
`sa_sl_song_links`, `sa_sl_song_versions`, `sa_sl_mb_works`. Where: the item
pageTypes' tracklists (`_slItemToHtml()`), the item's preview WINDOW
(`_dpTrackListHtml(tracks, sl)`; the card stays plain), and the song page's
edition tables (`_slSongToHtml()`'s `editionCell`).

- **One span per song.** `_slSongTitleHtml()` turns a title into
  `span.mb-sl-song[data-mb-sl-song=<base slug>][data-mb-sl-title]` (plus
  `data-mb-sl-date`/`-qual` on a dated item, `data-mb-sl-fixed` when the
  site's own link is kept), holding `span.mb-sl-work-slot` and
  `a.mb-sl-song-link`. Its TEXT is the title and nothing else: the glyph is an
  `<img alt="">`, "this show" is a CSS `::after`. So filter, sort and 📊 see
  what they saw before, and the late writes owe only the source rows (see
  below), not the four filter-cache duties.
- **Only known slugs are linked (answer 1).** An unknown `lyrics.php?song=`
  answers HTTP 200 with "does not exist!" (probed 2026-11-05), so a rule
  alone would make dead links. `_slSongSlugOf()`: the exception list
  (`_SL_SONG_TITLE_EXCEPTIONS`, keyed by `_slExcKey()`, which keeps "(" and
  ")": `SOMEDAY (WE'LL BE TOGETHER)` is `someday`, `SOMEDAY WE'LL BE
  TOGETHER` is `somedaywellbetogether`), then the title, without a trailing
  "(…)", without a leading one, without both (`_slTitleVariants()`), each
  normalised (`_slNorm()`: NFD, accents off, a-z0-9); the first that is a
  known base slug wins. Known = `_SL_SONG_BASE_SLUGS` (1,381, embedded) or a
  base slug of the runtime index. On the whole index the rule alone gets
  1,315 of 1,334 titles right; 19 exceptions.
- **The embedded list is GENERATED.** `scripts/build-sl-song-slugs.py`
  writes the block between `// BEGIN GENERATED` / `// END GENERATED` from
  `docs/sl-song-base-slugs.json` (committed), which `--index
  debug/sl-song-index.json` (the output of `scripts/probe-sl-song-index.py`)
  refreshes. `--check` fails on a stale block or a title the rule plus
  exceptions still gets wrong. Its `slug_of()`/`norm()`/`exc_key()` mirror
  the JS; `sl-tracklist-links.spec.js` runs the JS over every title of the
  JSON.
- **Medleys** (`_slSongParts()`): the whole title first ("BEDROCK RAP / MEET
  THE FLINTSTONES" is one song), else the first name of "X aka Y" that is a
  song (the whole text linked), else its " / " parts when any is a song,
  else its " - " parts only when every one is. `_slTitleVariants()` drops
  EVERY trailing "(…)" in turn ("Rosalita (Come Out Tonight)
  (instrumental)" → rosalita), the build script the same.
- **A title without an SL page still gets its glyph** (vzell's
  "Adjustments" 3b, 2026-11-05): with `sa_sl_mb_works` on it becomes a span
  with an EMPTY `data-mb-sl-song`, no link, matched by title and MusicBrainz
  aliases ("Circus Song" is an alias of Wild Billy's Circus Story). Another
  artist's line on a various-artists item stays plain text, in the table and
  in the window (`_slTrackTitleHtml()`: "Bruce Springsteen: BORN TO RUN"
  links the song, "Chase: Get It On" stays plain).
- **Various artists**: a line whose artist is not Springsteen stays plain
  (9685's "Chase: Get It On" — the site has Bruce's GET IT ON).
- **The window's numbers** (`ol.mb-dp-tracks.mb-sl-tracks`, item 7457,
  2026-11-05): the site's fonts have proportional old-style figures, which
  `tabular-nums` cannot change, so "10"…"12" sat left of "01"…"09". Each
  number is an inline-block with `min-width: var(--mb-sl-pos-w)`, the
  longest position's length in `ch` set on the list; only SL tracklists
  carry the class, so no other window changes.
- **This show's version (answer 2).** The title always links the song's
  MAIN page; the version is a link of its own after it,
  `a.mb-sl-show-link`, with NO text ("this show" is its CSS `::after`, not
  `::before`: the window's read-ahead dot owns `a.mb-dp-l-here::before`),
  each with its own preview (vzell's "Adjustments" 3a: one link doing both
  doubled the functionality). A dated item (`_slShowOf()`: ONE full
  date; a range or list keeps the main page) has it for
  `<base>_<date>[-early|-late|-morning]`, else the one slug that goes on from
  `<base>_<date>` (`_2014-02-05-wgoe`), from the runtime index
  (`_slVersionSlug()`). The index is every slug of the 32 letter pages,
  one IndexedDB record per letter in `vz-saed-sl-songs` (store `data`, keys
  `letters`, `letter:<x>`, `mb-works`), 30 days. Read by `_slVerFetch()`
  (same-origin, `_SL_VER_GAP_MS` apart, only when a dated song is shown and
  the index is not whole and young), and refreshed for free by every letter
  page `applySlLyricsToTable()` converts (`_slVerStoreLetter()`).
- **Work glyphs (answers 3-6).** `_slMbwMatch()`: logged in, the card's
  MusicBrainz release first (`_slMbRelFetch()`: one
  `release?inc=recordings+recording-level-rels+work-rels`, by title, class
  `mb-sl-work-release`); then Bruce's works (`_slMbwFetch()`: `/ws/2/work?
  artist=…&inc=aliases+annotation`, 100 a request, `_rgWsGet()` so the
  MusicBrainz rate slot and GM, kept whole or not at all, 30 days): the work
  whose annotation links the song (`exact`, both address forms MusicBrainz
  carries), else one work by title or alias (`title`, dashed), else several
  (`ambig`: a glyph each, at most three, the count on the first). Faded
  glyphs (`mb-sl-work-wait`) while the works load. A url lookup of the item's
  address was rejected: MusicBrainz stores SL item URLs as typed
  (`http://…&category=album&pg=4`). The glyph is a plain musicbrainz.org
  work link, so `_dgMbSource()` gives it MusicBrainz's card; no reader.
- **The window** (`_dpTrackListHtml(tracks, sl)` → `_slSongsWindowKick()`,
  SL host only): once painted, the saved data, then — the window opens on
  Space, an explicit ask — the works and, for a dated item, the runtime index;
  `_slSongsDecorate()` repaints `#mb-dp-dialog` spans too. Before this
  (Adjustments 6) a window opened from a LIST page never had glyphs: nothing
  had loaded the catalogue there. The gap before a window link is not a slot:
  it is the read-ahead dot's reserved place (`.mb-dp-dots a.mb-dp-l-here::before`).
- **The window's glyph is an icon in the line.** The slot is `inline-flex`,
  which makes the glyph link a flex item; with `sa_pop_mb` on the window
  marks it as a link that opens here (`mb-dp-l-here`), and with read-ahead on
  that reserves a dot as `::before` — inside the flex item it took a line of
  its own and pushed the icon below the title (vzell's screenshot,
  2026-11-05). The dot is switched off on glyph links
  (`.mb-dp-dots .mb-dp-tracks a.mb-sl-work::before`). The test needs
  `sa_pop_mb` on AND a second paint (→ ←): a glyph added by
  `_slSongsDecorate()` after the paint is never marked.
- **The item page's own tracklist, before any press** (`_slLinkLiveTracklist()`,
  from the SL init block next to `_slPrepareLivePage()`): each track line's
  title text node becomes the same span (the site's text, `raw`); the page's
  copy (`_slItemPageHtml()`) is taken first. Glyphs and versions there come
  from what is saved only: a visit asks nothing; a press or a window reads
  the rest. `_slSongsDecorate()` walks `.project-detail span.monospaced`
  too, `_dgMbSource()`'s SL selector names its glyphs.
- **The glyphs pulse while the works load** (`mb-sl-work-pulse`, off under
  `prefers-reduced-motion`; Adjustments 3c).
- **Late writes reach the source rows.** `_slSongsAfterRender()` (both render
  tails, after `_fiAfterRender()`) paints from memory, reads the saved data,
  then the network as needed, calling `_slSongsDecorate()` as each lands. It
  walks live spans AND `_msSourceRows()`: the item and song pages render
  multi-table, which clones, so a live-only write is gone at the next
  filter keystroke (pinned by a mutation). It writes attributes and the
  empty-text slot only, so highlights survive.
- **Before the render**: both pageRequests `await _slSongsLoadSaved()` in
  `fetchText`, so a page whose data is saved is converted linked and with its
  glyphs, no flash.
- **The page's own origin.** The site answers with and without "www.", and
  a fetch of the other one is cross-origin: on SL every link and the index
  read go to `location.origin` (`_slSiteRoot()`), "www." only from another
  host. Pinned by the no-www test and a mutation.
- **Off-host**: the window on another host (an SL link previewed on
  MusicBrainz) links songs from the embedded list; glyphs and versions need
  this origin's IndexedDB and are SL-only (`_slSongsLoadSaved()` returns at
  once elsewhere). `_DP_PARSER_VERSION` 12: item records carry `slTracks` and
  `slShow`.
- **Song page editions**: the site's own link is kept (`data-mb-sl-fixed`,
  never re-pointed); a song the site leaves unlinked links its main page
  when known (until 2026-11-05 plain text, `sl-song.spec.js`); this version's
  row gets its glyph without a link.

### Labels, IDs, head pictures (2026-11-05, "Adjustments" 3a, 4, 5a)

- **A label's page is a CD and vinyl bootleg list** (`brucelegs.php?cmd=list&
  f_label=…`, `_slIsLabelListUrl()`): the only one. `collection.php` and
  `bootlegs.php` ignore `f_label=` (probed 2026-11-05: 5,372 and 8,445
  items with or without it), so a collection or bootleg label has no page to
  link (Adjustments 3b: not extensible on the site's side). The CD and vinyl
  bootleg list's Label cell keeps the site's link; `_DP_SITES` takes the URL
  as a detail page and `_dpParseSlLabel()` reads it into a record (the label,
  "N CD and vinyl bootlegs", the first page's items as lines, their covers;
  `_DP_PARSER_VERSION` 13; 14: the window's item lines link their item
  pages, the section's `html`). The item page's Release card already linked it,
  so it previews there too. Fixture `detail-sl-brucelegs-label-greatdane.html`.
- **ID** (logged in, collection and bootleg lists; the CD and vinyl bootleg
  cards have no number): the card's `<b>N</b>` outside its links
  (`_slCardIdCell()`), linked to the item page, with the empty `a.mb-sl-edit`
  pencil, numeric through `_slListIntegerColumns()` — `integerColumns` is a
  GETTER on the three list definitions, as on the lyrics index, so a
  logged-out run does not warn about a missing ID column.
- **The head's pictures have a card** (every foreign detail pageType, it is
  `_fdHeadInsertSections()`): `data-mbtt-fn="fd-pic"` → `_fdPicCardHtml()`,
  the picture at 320 px, with Shift as large as the window allows (`fd-pic`
  is in `_ART_CARD_FNS`, so the artwork cards' Shift repaint and Space →
  `_artSpaceOpen()` → the art section's `_releaseArtOnClick()` apply); the
  thumbnail first, the full picture swapped in when loaded (`_fdPicSwap()`).
  Not the FICE (`fi-img`): that one is table-row shaped. Since 2026-11-06
  each pictures section is an art section (`_fdArtSection()`,
  docs/claude/artwork-caa-eaa.md): the section's kind as the type (Scan,
  Artwork), the page's caption as the comment, chips and Grid / By type;
  the card's "Picture k of n" counts the section's tiles shown.

## Column names: the `_sortColumnKind()` heuristic trap

For a column not declared in `integerColumns`, `_sortColumnKind()` falls back
to a NAME heuristic: anything containing `#`, `Track`, `Releases`, `Year` or
`Length` sorts as a number (`parseFloat` of its digits). The site's own column
is "Cat #"; named that, catalogue numbers would sort by their digits alone. So
it is **"Cat. no."**, and `sl-collection.spec.js` asserts the text order and
that the numeric order would differ. Avoid "Disambiguation" too — the findings
check it as MusicBrainz text.

## Styling — `_ensureSlStyle()`

MusicBrainz's site CSS is what normally styles `table.tbl` (borders, padding,
header background, the `tr.even` zebra that `applyZebraStriping()` only toggles
classes for). On SL none of it exists, so a minimal equivalent is supplied —
since 2026-10-06 by `_ensureForeignTableStyle()`, which `_ensureSlStyle()`
calls first and which jungleland.it shares (keyed on
`body:is(.mb-sa-host-sl, .mb-sa-host-jl)`; a further host extends that list).
**Every table rule is wrapped in `:where()`** so it carries almost
no specificity and any of the script's own styling (sticky header colours,
finding tints, hover, highlights) still wins. The sticky `<thead>` is offset by
`--mb-sl-navbar-h`: the site's `jquery.sticky` navbar turns `position: fixed`
once scrolled and would otherwise cover it (checked live, 2026-10-04).

## Sticky Page Headers and the sticky Title

All three definitions set `stickyColumn: 'Title'` (without it
`applyStickyColumn()` falls back to column 0, the Cover thumbnail).

`initStickyPageHeaders()` runs on SL since 2026-10-05; the user asked for
"everything from the top of the page down to the list heading" to stay put
while a wide table is scrolled sideways. With no MusicBrainz `#page`, the
generic collector does that: every `<body>` child without a table (top bar,
navbar wrapper, breadcrumb, footer) is pinned as chrome, and
`_sphContentBodies()` walks from `<body>` down the chain of elements holding
the table, pinning everything beside it (`.project-detail` with the toolbar
`<h1>` and category buttons, the filter blocks, the pagination) and the list
`<h2>` as a bar. Two things had to change for the real page, both found only
by the live check (`tests/live/sl-lists.spec.js`, under the site's own CSS):

- **A full-width float is descended into** (`_sphIsFullWidthFloat()`). On
  book/memorabilia the column closed by the second stray `</div>` is a
  floated Bootstrap `.col-sm-12` beside the table; `_sphIsEligible()` never
  pins a float, so it scrolled away whole. A narrow float is still left
  alone, so a MusicBrainz page only changes if it has a full-width float
  beside its data table.
- **Inner Bootstrap `.container`s lose their auto side margins**
  (`_ensureSlStyle()`). Centred in the table-wide column, the year-filter and
  "Formats guide" blocks sat off-screen, and pinned, each width cap grew the
  auto margins (book: left 1198 px, capped to 120 px).

The navbar wrapper gets the chrome z-index (106), so the site's mega-menu
still opens above the pinned bars. A sticky cell cannot travel past its
table's right edge, so a Title column wider than the room left of it is
pushed back at the far right — plain `position: sticky`, on any host.

## Page count and fetching need nothing

- `fetchHtml()` is a same-origin `fetch()`; SL is behind CloudFlare, and the
  browser's cookie lets same-origin requests through (the reason
  `SpringsteenCoverArtUploader` cannot fetch cross-origin, see its own notes).
- The per-page URL is `new URL(location.href)` with only the page parameter
  set, so every `f_*` filter is kept. That parameter is `page` except on the
  entry page, which answers `page=N` with page 1 again and needs `pg=N`:
  `features.pageParam: 'pg'`, read through `_pageParamName()` by
  `determineMaxPageFromDOM()`, the fetch loop and the loop's "current page"
  shortcut (read as `page`, `?pg=3` would count as page 1 and its live cards
  would stand in for page 1).
- `determineMaxPageFromDOM()`'s no-"Next" branch takes the highest `page=`
  link, and SL's windowed widget always ends in a "»" pointing at the LAST page
  (album/12i → 6, single → 14, aud_comp → 6; a 99-item category has no widget,
  i.e. 1 page). Checked live 2026-10-04; the entry page's "»" is
  `?pg=54&cmd=intro` (2026-10-05).
- The entry page's 54 pages and 5365 rows trip ⚠️ High Page Count and the
  render-decision dialog at the default thresholds — expected, not a bug.

## The lyrics index — `sl-lyrics`, `features.pageKeys`, `applySlLyricsToTable()`

Added 2026-10-06. The URLs are `lyrics.php?cmd=list&letter=X` and the landing
page `lyrics.php` (bare or `cmd=intro`). A song page (`?song=`) and
`cmd=songslistedbyrelease` are NOT this list, and the `@include` line and
`match` both keep them out.

**Survey** (all 32 letter pages, fetched once at 1 request/s):

- **Letters:** there are 32 (`( 1 3 4 5 6 7 a…z`, no `x`), exactly the links
  in `div.element-buttons a[href*="letter="]`. The `9`/`x` buttons sit inside
  an HTML comment, which `querySelectorAll` does not see.
- **Pages:** every letter is ONE page ("Showing items 1-N of N"; T, the
  largest, has 514).
- **Lines:** 3,552 lines and 1,336 distinct titles, with unique `song=`
  slugs. The landing page's own `chartData` holds the same per-letter counts,
  which the live spec compares against.
- **Line shape:** one shape with no exceptions:
  `<span class="monospaced"><i class="ICON"></i> <a href="lyrics.php?song=SLUG">TITLE</a> [BRACKET]</span><br>`.
  - ICON `bi-file-earmark-text` (3,352) means lyrics are present. The plain
    `bi-file-earmark` (200) means "Lyrics not available" (checked on
    `song=babyme`). That gives the **Lyrics** column, ✓/✗.
  - A line has 0 or 1 brackets, never 2 (312 have none).

**Fetching by key: `features.pageKeys = { param, selector }`.** Nothing in the
fetch loop fetched anything but `p = 1..maxPage`, and these pages have no
number. `_readPageKeys()` reads the matching links of the LIVE page into
`[{key, href}]`, in order and de-duplicated case-insensitively.
`startFetchingProcess()` then works as follows:

- **Page count:** `maxPage = keys.length`. This branch sits right after
  `_isResume`, before every numbered branch. No links at all logs
  `Lib.warn`.
- **URL:** page p is `new URL(keys[p-1].href)`, the link ITSELF. The landing
  page's own URL has no `cmd=list`, so "current URL + letter" would fetch
  the landing page 32 times.
- **Reusing the live page:** "is this the live page" compares
  `keys[p-1].key` with the current URL's `letter`, not `p` with
  `currentPageNum`. Started on `letter=b`, page 1 is `(`, and the live B
  list is reused when the loop reaches `b`.
- **Resume:** `_resumeState.pageKeys` carries the key list, so a resume's
  `nextPage` indexes the same order.
- **Progress:** the label reads "Loading H (9 of 32)".

`p` stays a 1-based index, so the counters, the progress bar, `pagesPhrase`,
the High Page Count dialog (32 < 50 never fires) and "page X of M failed"
all work unchanged. No MusicBrainz pageType sets `pageKeys`, so every new
branch is dead code there. The full fixture suite proves this.

**The converter, `applySlLyricsToTable()`** is not `applySlCardsToTable()`:
the rows are song lines, not cards. It runs at the same three call sites
(live, fetched, Load from Disk).

- **Finding lines:** lines are found from themselves (`span.monospaced` with a
  `lyrics.php?song=` link, outside navbar, footer and tables).
- **Letter:** comes from the page's own `Starting with "X"` heading, so a
  fetched page needs no URL.
- **Landing page:** it has no lines but has the letter wall. The LIVE landing
  page gets an empty table plus `<h2 class="mb-sl-list-heading">All
  lyrics</h2>` right after the wall, for the fetched letters to fill (the
  `bs-records` precedent).
- **Empty fetched page:** a fetched page without lines warns.

**Columns** (`_SL_LYRICS_HEADERS`): Title, Lyrics, Version (the bracket
verbatim), Type, Artist, Date, Show, No., Letter, then DD … Month from
`dateParts` on Date. `_slLyricsParseVersion()` fills these from ordered
rules. Survey counts:

| Type               | Rows  | Type        | Rows     |
|--------------------|-------|-------------|----------|
| Live               | 1,792 | Studio      | 61       |
| Original           | 337   | Rehearsal   | 46       |
| (none)             | 312   | Handwritten | 30       |
| Album              | 254   | Outtake     | 30       |
| Official studio    | 217   | Version     | 20       |
| Demo               | 107   | Soundcheck  | 14       |
| Unofficial studio  | 100   | Draft       | 13       |
| Cover              | 93    | Other       | about 35 |
| Other artist album | 91    |             |          |

- **Artist:** `Original X version` gives X. `X's [word] version` gives X, and
  the LAST possessive wins ("Manfred Mann's Earth Band's cover version"). The
  first draft took the first one, and the rendered fixture row caught it.
- **Date:** `_slFirstIsoDate()` on ANY type. Live shapes: `DD Mon YYYY` 1,734;
  `Mon YYYY` / `Month YYYY` about 50; `YYYY` 3; `DD Mon YYYY / DD Mon YYYY`
  5 (first date kept); `18 Oct (early show) 1975` 1.
- **Show:** `_slShowQualifier()` on Live or Soundcheck lines only, with a
  "take #N" left out because it belongs in No.
- **No.:** from `#N`, `version N` or `take N`.

### Two buttons on a letter page; the logged-in ID column (2026-11-04)

vzell, 2026-11-04 (org/springsteenlyrics.org, "Overwhole of the SL PTs and
POHs", branch `feat/sl-songs`):

- **"This letter" first, then "Show all lyrics".** A letter page's one button
  used to load all 32 letters. Now its first button, "Show the lyrics of this
  letter", carries `features: { pageKeys: null }`. The merge in
  `startFetchingProcess()` spreads the button's features last, so the key
  list is off and the run takes the numbered path: one page with no widget,
  the live one, and no request. `showIf: _slLyricsLetterHeading(document)`
  means the landing page (no `Starting with "X"` heading) has "Show all
  lyrics" alone. A press after the render still finds the heading, which is
  then an `h2.heading`.
- **Logged in, every line carries more:**
  `<a href="lyrics.php?cmd=edit&item=N"><i class="bi bi-pencil-square"></i></a>`,
  then the lyrics glyph, then `<a href="lyrics.php?item=N">N</a>` and a ⋮
  (`glyphicon-option-vertical`, the same on every line), then the title.
  Counts on B: 312 of 312.
  - **The Lyrics column reads a named glyph** (`_SL_LYRICS_GLYPH_SEL`), never
    the line's first `<i>`. That one is now the pencil, and every row read ✗.
  - **ID** (`_SL_LYRICS_LOGGED_IN_HEADERS`) is appended while
    `_slLoggedIn(document)`. The live document decides for every page of a
    run, as `_slHeaders()` does. `_slLyricsIdCell()` writes the number as a
    link plus an EMPTY `a.mb-sl-edit`, whose ✎ comes from `_ensureSlStyle()`'s
    `::before`. The cell's text, filter, sort and 📊 therefore see the number
    alone.
  - **Numeric only while logged in.** `features.integerColumns` is a GETTER
    (`_slLyricsIntegerColumns()`). Declared always, "ID" would make every
    logged-out run warn "column not found". The merge spreads `features`, so
    the getter is read at the press.
  - **Logged out, nothing changes:** no column and no warning.
- **The number is a song page.** Probed 2026-11-04 (curl, logged out):
  `lyrics.php?item=2099` serves the page of `song=babycomeback`. So
  `_DP_SITES['springsteenlyrics.com'].isDetailUrl` takes
  `lyrics.php?item=N` (without `cmd`), and the ID link gets the song's card,
  from MusicBrainz too.
- **A song page's "Private Info" never leaves the page** (the item pages'
  rule). A logged-in song page ends with `<h3 class="heading">Private
  Info</h3>`, which `_dpParseSlSong()` used to copy into the card, the window
  and the 30-day cache. It is skipped now (`_SL_SONG_PRIVATE_RE`), the
  record carries `session` (as the item records do), and
  `_DP_PARSER_VERSION` is 10.
- **Left as it is, by decision:** the window's Live page view frames the
  site's own page, so logged in on SL it shows Private Info. That is the
  site's page in the user's own session, and it stays unchanged (vzell,
  2026-11-05, answer 7 to `org/sl-song-mockups.html`). Only the views the
  script builds (card, window, page views) leave the notes out or closed.

## The compact category/filter bar — `_slInstallScopeBar()`

Behind its own setting, `sa_sl_compact_nav` (default **on** since 2026-10-26; needs
`sa_enable_springsteenlyrics`), on the collection and bootleg list pageTypes
(`slCardsToTable` `'collection'`/`'bootlegs'`; on the bootleg lists the
category wall becomes the Category menu and the four search forms the search
box, see "The bootleg search box" below). Design
study and the decisions behind it: `org/springsteenlyrics.org`, `** analyze`.
Called from the init block right after `_slPrepareLivePage()`, after
`_slRecordListCount()`.

**It reads the walls, it never lists them.** `_slReadNavFacets()` turns every
`.element-buttons` block of same-page links into a facet: links that set no
`f_*` parameter are the Category facet, the rest one facet per wall. The year
slider is a form and becomes a range facet (`_slReadYearSpan()`: the inline
rSlider `values:`, else the rendered `.rs-scale`, else 1973 to this year). So a
category's own option set (8 formats on album, 26 on the entry page; the
country list shrinks under a format filter) is what its menu shows, and a
category the site adds appears by itself. Only the Category GROUPING is a
list (`_SL_CATEGORY_GROUPS`; an unknown key lands under "More").

**The site's links already combine filters, and that shaped the reader.**
On a filtered page (checked in the fixtures, 2026-10-05):

- every link of the OTHER walls carries the active filter (`f_format=12i` on
  every country, album and copies link);
- the active entry of a wall is red (`label-danger`) and its href DROPS its own
  filter, so a click removes it.

So a wall's keys are the `f_*` parameters NOT carried, with the page's own
value, by every one of its links, and the red entry's value comes from the
page's query, not its href. Take every `f_*` as the wall's and the walls merge
into one Format menu; read the red entry from its href and the bar shows
`12i` instead of `12" vinyl`. Both are pinned by mutations. The live probe
(15 GETs) also showed the server combines any mix of `f_format`, `f_country`,
`f_range` and the category (album 1315 → 12i 539 → plus USA 125).

**Targets come from one builder, `_slScopeHref()`**: the page parameter
dropped (`page`, `pg`), `cmd=list`, `category=all` on the entry page (its own
filter links say the same), then the change. A category change keeps every
filter except `_SL_CATEGORY_SPECIFIC_PARAMS` (`f_date_main` names an
album title).

**Every choice is a plain `<a href>`**, never `location.href =`, so
`initNavigationGuard()`'s anchor guard asks before a loaded table is lost, and
middle-click works. The pull-down is appended to `<body>`, `position: fixed`,
so no pinned ancestor's stacking context or the sticky `<thead>` covers it.
**It follows its button on scroll instead of closing**
(`_slPlaceScopePop()`): opening it can scroll the page itself, and
close-on-scroll shut every menu as it opened. That is pinned by a mutation.

The walls are only hidden (`mb-sl-nav-hidden`, `display: none`), which also
takes them out of Sticky Page Headers: `_sphIsEligible()` skips an element with
no client rects. The bar sits where the first wall was, in `.project-detail`,
and is pinned like the walls before it.

**The bootleg lists differ in three ways**, each in a named table rather than
a branch in the reader:

- **Grouping** comes from `_SL_CATEGORY_GROUPS[pathname]`, a list of
  `[name, predicate]` (bootlegs: `aud_live\d{4}` → Live shows, other `aud_` →
  Other audio, `vid_` → Video). "All categories" is offered on the collection
  only; the bootleg lists have no "all" list.
- **A category change drops every `f_*`** (`_SL_CATEGORY_CHANGE_DROPS_FILTERS`).
  There a search IS the category (`category=f_date&f_date=…`), and a list
  category ignores a search parameter (live probe: `aud_live1975&f_date=…`
  returns the whole era). On a search page the Category button shows the list
  heading ("SHOWS BY TITLE"), and no entry is marked current.
- **The era timeline** (`_slBuildEraRuler()`) heads the Category menu when at
  least three labels parse as "Live YYYY[-YYYY]" (`_slParseEra()`). The bars
  are absolutely positioned on one year axis: width = span, height =
  recordings PER YEAR, relative to the densest counted era. Raw counts would
  make "Live 2014-2026" (222 in thirteen years) taller than "Live 2005" (159
  in one); a mutation pins it.

**Exact counts, never estimates** (decided 2026-10-05). `_slRecordListCount()`
reads the site's "Showing items 1-100 of N" and stores N under
`mb_sa_sl_list_counts` (`{"<path>?category=<key>": {n, at}}`), but only for a
WHOLE category: `cmd=list`, a real category key, and no `f_*` parameter (album
with `f_format=12i` has 539 items, the category 1315). The Category menus show
the count beside each entry, and the timeline sizes by it. A category never
visited shows no number and a dashed "?" bar. The bootleg landing page's
"Statistics" numbers are deliberately NOT used: they drift from the lists' own
totals (544 vs 487 for Live 1975-1977). The key is a cache, not a setting, so
it is not in the config export. It is written only while the bar is on.

### The bootleg search box — `_slBuildSearchBox()`

The bootleg lists' four GET forms (date, title, version, public info) each
send their field AS the category: `?f_date=…&cmd=list&category=f_date`.
`_slReadSearchForms()` finds them by exactly that shape (a hidden
`category=f_X` beside a text input named `f_X`), so the box reads its fields
and labels from the page, and hides the forms' shared `.container`.

What the live probe (2026-10-05) fixed in the design:

- **One field per search.** `f_title=born&f_version=soundboard` returns the same
  73 rows as `f_title=born`; the server reads the category's field only. So the
  box is a field switch (Auto plus one button per form) over ONE input, and
  `_slSearchHref()` builds the URL from scratch (path, `cmd=list`, the field as
  category, the query), keeping nothing of the current query.
- **`f_date` matches full dates only** (1975-08-15 → 21 rows; 1975-08 and 1975
  → 0). `_slReadSearchDate()` returns `full` (normalised to ISO), `partial`
  (year, or year and month), `invalid` (a day the calendar lacks) or `null`.
  A partial date leaves Search off and links the era list that holds the year
  (`_slParseEra()` over the Category facet's options) plus a title search. Slash
  forms are deliberately not dates: `08/09/1975` is August or September
  depending on who typed it.
- **The site's own check is dead.** `checkForm()` reads `form.filter_date`,
  the input is `f_date`, so it throws and the form submits anyway. The box
  validates before Search gets an `href`.

Auto = date when `_slReadSearchDate()` sees one (full or partial), else
titles. A field picked by hand takes the text as it is (a date typed into
Public info stays text). Search is an `<a href>` that follows the input, like
every other choice; Enter clicks it, so the navigation guard still applies.
Disabled = no `href` plus `aria-disabled`.

**Recent searches** (`mb_sa_sl_recent_searches`, newest first, at most
eight, `[{field, q}]`) are recorded by `_slRecordRecentSearch()` when a search
RESULT page opens with the bar on, not on submit. That way a search started
from the site's own forms or a bookmark counts too, and a search that never
navigated does not. The same search opened again moves to the front instead
of repeating. A cache, not in the config export.

### After the fetch: the bar filters the loaded table — `_slHandoff()`

Decided 2026-10-05: once a list is loaded, a facet whose values ARE a column's
cell values filters that column instead of reloading. They are listed in
`_SL_TABLE_FILTER_COLUMNS`: `f_country` → Country, `f_range` → Original year,
`f_nbcopies`/`f_multi` → Copies, and since part 6 `f_format` → Format through
the formats glossary (see "The formats guide" below). The site's codes and
chip labels (`12i`, `12" vinyl`) are not the cells' free text (`LP`, `2xLP`,
`4x12" + 7"`), so Format needed `_slFormatCode()` before it could join.
**Album** has no column, and **Category** is another list, so these keep
navigating. Every menu says which kind it is (`_slAddScopeNote()`).

Rules, each pinned by a mutation:

- **Through `applyUniqValueSet()`, the 📊 dropdown's own exact-value path**,
  never a typed filter. So the AND with a typed filter, the cache keys, the
  highlight and the status lines all hold unchanged
  (`filter-and-cache-invariants.md`). Values come from ALL loaded rows
  (`_slColumnValues()` over `allRows`), not only the visible ones.
- **A facet the query already carries does NOT hand off** (`f_country=USA` in
  the URL): the server narrowed the fetch, so the table holds only USA, and
  only a reload can widen it.
- **Nothing in range is an empty TABLE, not a cleared filter.** An empty value
  set means "no filter" to `applyUniqValueSet()`, so `_slHandoffValues()`
  returns a value no cell holds (`∅ no … matches`).
- **The bar follows the column, both ways.** The bar's label for a choice is
  kept on the input (`data-mb-sl-bar-label`/`-values`) and believed only while
  `mbUniqValues` still equals what the bar wrote. Otherwise a 📊 pick is
  summarised. A `MutationObserver` filtered to `data-mb-uniq-values` (one rAF
  redraw per burst) catches the column's ✕, the 📊 dropdown and Clear all.
- **TDZ**: the bar is built at init, long before `let isLoaded`/`allRows`.
  `_slLoadedTable()` tests for a column filter row FIRST, and none exists
  before a render.
- **Clear all** is a link (reload) while the query holds filters, and a button
  clearing the table filters in place when only those are active.

**A pull-down must fit the window** (`_slPlaceScopePop()`). It is
`position: fixed`, so the page cannot scroll it into view. It opens upwards
when there is more room above, and is capped to the room it opens into. The
hand-off specs found this: after a render the bar sat low and the Country
list hung past the window, with its last entries unreachable.

Cost: one choice reads one column of every loaded row once (about 5,400
`getCleanColumnText()` calls on the entry page). That happens on the click, not
on the filter, sort or render path.

### The formats guide — `_SL_FORMATS`

The site keeps three vocabularies for one format, and none of them maps to the
others: filter codes (`cd5`, chip label "Compact Disc (CD5)"), its "Formats
guide" panel (abbreviation `CD`, text "Compact Disc") and the cards' free text
("4xCD + Blu-ray", "2 x Cassette Tape", "SACD-HYBRID"). The guide also lacks
seven filter formats (Flexi, NT, Betamax, Betacam SP, U-matic, BD-R, Print),
and has two (5", 8") no filter offers. `_SL_FORMATS` is one entry per code:
group (Audio / Video / Print), the site's label, the guide's abbreviation and
text (`guide: false` where the text is ours), and `re` — the card texts that
name the medium.

**How the server files an item, probed rather than guessed**
(`scripts/probe-sl-format-codes.py`, page 1 of each of the 26 codes,
2026-10-05): by its **first** medium. "VHS + CD" is under vhs, "Blu-ray + DVD"
under bd, "SACD-HYBRID + 2xCD" under cd5, and 12i holds the "LP"s (it is 12"
vinyl, singles and albums). One "CD" filed under cdr is a slip in the site's
own data. `_slFormatParts()` splits a text into media with counts;
`_slFormatCode()` is the first medium's code. Order in `_SL_FORMATS` matters:
the first `re` that matches wins, so CD-R, DVD-R and Blu-ray-R come before CD,
DVD and Blu-ray. A medium the table does not name maps to nothing, so that row
matches no Format choice. Print is known only as Paperback/Hardcover (the
probe's first page).

The glossary is used in three places:

- **The Format menu is the guide.** Entries are grouped Audio / Video / Print,
  each with its guide line as a second line (`mb-sl-scope-sub`, inside the
  label span). The menu's search reads the whole entry, so "mc" finds Cassette
  tape. The site's "Formats guide" panel is hidden WITH the format wall
  (`_slReadNavFacets()`, its own `.container` only; a page with the panel but
  no format wall, such as memorabilia, keeps it).
- **Every collection Format cell carries a tip** (`_slFormatTip()`, set by
  `_slBuildRow()` through `_setTip()`): the text, one line per medium with its
  count and guide text, then "Filed under: <label>". It is an attribute, so it
  survives every `cloneNode(true)` re-render and Save/Load, and the cell's
  text, which filters, sorts and highlights, is unchanged. Set at conversion,
  so the live page, fetched pages and Load from Disk all get it; it is not
  gated on the bar.
- **After the fetch, Format filters the table**: `_slHandoffValues()` keeps
  the column values whose `_slFormatCode()` is the chosen code. A spec pins
  that "CD + 2xDVD" counts as CD; a last-medium rule fails it.

### The bootleg landing page — `sl-bootlegs-intro`, `features.slNavOnly`

`bootlegs.php` (bare or `cmd=intro`) has the 21 category buttons, the four
search forms and a "Statistics" block, but no item cards. The pageType has
`buttons: []` (the init loop renders none; nothing guards against an empty
list, and nothing needs to), and `slNavOnly: true`, which does three things:

- **With `sa_sl_compact_nav` off, the init block returns right after
  detection**, before `_slPrepareLivePage()`, the toolbar or `mb-sa-host-sl`,
  and logs at info level. A skipped definition would instead have reached the
  required-elements check and logged an ERROR. Enabling the springsteenlyrics
  support alone must not change a page it has nothing to do on.
- **The bar is installed** (the init gate admits `slNavOnly` beside
  `slCardsToTable`): Category, the search box and Recent. With no category in
  the query, the Category button reads "Choose a list"; the bootleg lists have
  no "all" list, and no entry is current.
- **`body.mb-sa-sl-nav-only` hides the SAED menu's Data and View groups**:
  with no table they act on nothing. Help (⚙️ Settings, ❓ Help) and Changelog
  stay. (Until 2026-10-22: `#mb-button-divider-initial`, 📦 Data and 🛠 View.)

Nothing is recorded there: `_slRecordListCount()` needs `cmd=list`, and the
Statistics counts are not read (decided 2026-10-05: they drift from the lists'
own totals). "Show all bootlegs" (every category into one table, about 7,300
rows from about 82 pages) was offered as a further level and deliberately left
out.

The fixture `sl-bootlegs-intro-page1.html` is generated from
`debug/sl-bootleg.html` through `build-sl-fixtures.py`'s `PLAIN_TARGETS`: the
same sanitising (shared `sanitise()`), no splitting. Re-running the script
leaves the other fixtures byte-identical.

## The Cover column's image card and viewer — `_SL_FI`

vzell, 2026-10-23 (org/foreign-images.org, phase 1, mockups S1/V1): the
Cover column of every card list (collection, latest additions, bootlegs, CD
and vinyl bootlegs: everything `_slBuildRow()` builds) gets MusicBrainz's B1
image card and the artwork viewer. It is the springsteenlyrics provider of
the shared foreign-image path (`_fiCardHtml()`, `_fiClick()`, `_fiLoad()`,
`_fiProvider()`), the one Discogs' Image column uses too (docs/claude/discogs.md,
"The Image column's hover card").

- **The stamps are the converter's**: the Cover `<a>` gets
  `data-mbtt-fn="fi-img"` and `data-mb-fi="sl"`, and on a bootleg list
  `data-mb-sl-art="1"`/`"0"` from the card's own `.bi-image` ("artwork
  available", the Artwork column's test). Attributes, so every render's
  clones keep them, and all three converter runs (live, fetched, disk) set
  them. No cell text changes, so no filter-cache duty applies. A collection
  or brucelegs card has no such flag (brucelegs prints "artwork available"
  on every card), so those rows ask.
- **The record is the detail preview's**: the item page through `_dpGet()`
  (memory, IndexedDB 30 days, else ONE request through `_dpAwaitSlot()`),
  keyed on the cover link's `href`, the same URL as the Title link. So the
  card, the viewer and the preview share one request whichever came first,
  and `sa_sl_detail_preview` does not matter here. `_dpParseSl()` already
  returns the scans (the `_tn.` thumbnails, each linking its full size); the
  list's cover is the item page's cover (same URL), shown first with the ★.
  A brucelegs item page also shows related items' covers, which are not
  `_tn.` images and stay out (fixture `detail-sl-brucelegs-148.html`: 31
  scans).
- **States** (`_SL_FI.state()`): `none` (flag "0": "Cover only", never asked),
  `cold`, `loading` (the provider's `loads.pending`), `done` (`_dpMem` has it),
  `failed` (`loads.failed`: the reason and "Try again" in the viewer). Since
  phase 2 `_SL_FI` is built by `_fiDpProvider()`, as jungleland's and
  brucespringsteen.it's providers are (docs/claude/jungleland.md, "The Art
  column"); its cover is its own picture (`ownPicture`), so it has no lazy cell
  and no sweep.
  `wanted` is the card showing (`_fiCardShows()`) or the viewer on that row,
  asked after the rate slot: a row the pointer only passed over costs
  nothing (`_dpGet()` logs "no longer wanted, not asked" on `detail`).
- **The click is on the window, capture** (`_fiInstall()`, from
  `_slPrepareLivePage()`), ahead of `initNavigationGuard()`: a plain click
  opens the viewer and never asks "leave this page". Ctrl, Shift, Alt, ⌘ or
  another button keep the link. Shift+← → walk the rows the filter left;
  each record is asked only when the viewer shows its row. The viewer's
  "Item page" button is the record's `pageUrl`.
- **`sa_sl_tip_images`** (default on, inside `sa_enable_springsteenlyrics`)
  gates the card only; the click opens the viewer either way, as on Discogs.
- **No count badge on the cover** (the mockup's `span.n`): it would be a
  post-render cell write owed to the master rows; the card shows the count.

### The lyrics index's Title glyph — `_SLL_FI`

vzell, 2026-10-23 (org/foreign-images.org, phase 3, mockup L1):
`applySlLyricsToTable()` appends `_fiGlyph(doc, 'sll', href)` after each title
link, with the link's own (relative) `href`, so both resolve to the same URL in
the live, a fetched or a reloaded document. The glyph has no text (CSS: dashed
🖼 unread, 🖼 and the count, hidden for none; see docs/claude/brucebase.md,
"Images: the Media icons and the song glyph"). The record is
`_dpParseSlSong()`'s, unchanged: every `lyrics/images/` picture — the covers
of the albums the song is on (Badlands: 14) and now and then a hand-written
sheet (Baby Me: one); the probe's four "Baby …" songs had none. One picture
is the card itself, big (`single`). `_fiAfterRender()` paints the songs read
before (30 days). Setting: `sa_sl_tip_images`, as the Cover column. Specs in
`tests/fixtures/bb-image-card.spec.js` ("sl-lyrics: …"); title-link
locators in the detail-preview specs use `a:not(.mb-fi-glyph)`.


## Tests

| Spec                                         | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/sl-collection.spec.js`       | both pages in one table, exact headers, parsed fields (incl. a FETCHED-page card), item links, lazy thumbnails, Cat. no. text sort, Copies numeric sort, a column filter, zero MusicBrainz/CAA requests with CAA and Relationships switched back ON                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/fixtures/sl-bootlegs.spec.js`         | the bootleg columns and flags, `?:??`, Duration as a duration in both directions (an `H:MM:SS` value and unknowns pinned last), First date chronological, the DD…Month split agreeing with First date on every row, Show, Location split into Place/Locality/Region/Country (a multi-location card as aligned `<li>`s, every single-location row rebuilt from its parts), a Country filter, `_slFirstIsoDate()` / `_slShowQualifier()` / `splitLocationText` / `_slSplitTrailingParen()` shapes the fixtures lack                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/fixtures/sl-host.spec.js`             | the gate off (page untouched, with the log line as proof the script ran), the gate on, the navigation guard, the Load from Disk round trip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/fixtures/sl-collection-intro.spec.js` | the stray-`</div>` shape (asserted present first): entry page in two `pg=` pages, opened on `?pg=2`; sampler as one widget-less page; the `<h1>` reads the list heading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/fixtures/sl-sticky-headers.spec.js`   | album, sampler, memorabilia: breadcrumb, `<h1>`, category buttons, list `<h2>` (and the year filter) keep their left edge and stay in the window; Title docks at the table's left. Each shape again with the compact bar on, the bar in place of the walls, plus a bootleg list (with `.col-md-12` CSS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/fixtures/sl-scope-bar.spec.js`        | the compact bar: off by default changes nothing; one menu per wall whose entries ARE the wall's links; walls hidden, not removed; the room above the list shrinks; choices keep the other filters and drop the page; category change drops the album; chips; Year range from the slider or the fallback; search, arrows, Escape, outside press; Enter navigates. Bootlegs: one Category menu, forms untouched; counts recorded for whole categories only (not a filtered list, not a search) and shown; the era timeline (one bar per era, chronological, width by span, height per year, unknown dashed); a search page labelled by its heading, a category change dropping the search. Search box: Auto reads five date forms and falls back to titles, slash dates stay text; impossible days and non-dates in Date mode disable Search with a reason; partial dates link their era and a title search; a hand-picked field; Enter navigates; a result page prefills the box; Recent moves a repeat to the front, keeps eight, forgets on request; no box on collection pages. After the fetch: Country, Year and Copies narrow the loaded table to the rows computed from it, no reload, chips and button follow both ways (incl. the column ✕), two table chips clear in place, Format and Category still navigate with their note, a filter carried in the URL still reloads, nothing-in-range shows an empty table; a pull-down opened low fits the window. Landing page: bar off leaves it untouched (no heading, toolbar or class, no error); bar on gives Category ("Choose a list"), search box and Recent, forms and buttons hidden, no fetch button, Data/View hidden, Statistics kept and not recorded; its Category menu has the era timeline with nothing current; its search box searches. Formats guide: the Format menu grouped Audio/Video/Print with a guide line per entry, found by abbreviation; the site panel hidden with the format wall and kept where there is none; every Format cell's tip (compound and counted texts); after the fetch Format filters by first medium ("CD + 2xDVD" is CD); Album and Category still navigate. Mutations: `scripts/mutations/sl-scope-bar.json` |
| `tests/fixtures/sl-include-regex.spec.js`    | the `@include` header lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tests/fixtures/sl-brucelegs.spec.js`        | the CD and vinyl bootleg columns across two pages, card fields (no sub-title, a label link, year and month spans), the DD…Month split at each date precision, Location split incl. a description in Place and "USA" as United States, YYYY numeric sort, a Country filter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests/fixtures/sl-lyrics.spec.js`           | pageKeys: from the landing page every letter fetched by its OWN link (one request each), from a letter page "Show all lyrics" reuses that letter live and keeps the order; a letter page's "This letter" first, no request, that letter's rows only; the landing page without it; logged in (`sl-lyrics-b-logged-in.html`): the ID column (number alone, linked, an empty edit link with a CSS pencil, an integer column), Lyrics ✓/✗ from the named glyph (296/16), logged out no ID; a failed letter resumes at that letter with the rows kept; the line split (Lyrics ✓/✗, Type, Artist incl. the last possessive, Date, Show, No.), DD…Month at each precision, a Type filter, YYYY numeric sort; `_slLyricsParseVersion()` over 42 bracket shapes. Mutations: `scripts/mutations/sl-songs.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/fixtures/sl-image-card.spec.js`       | the Cover column's card and viewer: nothing asked at render; one request on hover, cover ★ + scans, `Cover`/`Scan ×N`; a bootleg without the flag "Cover only", never asked; second hover and click from the cache, the "Item page" button; Shift+→ to the next VISIBLE row; Ctrl-click keeps the link; a collection row asks (no flag); brucelegs 148 cut at the cap, Space shows all 32; one record shared with the Title's preview; the setting off (no card, click still opens); moved on before its slot, never asked. Mutations: `scripts/mutations/sl-image-card.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/fixtures/sl-tracklist-links.spec.js`  | the slug rule over every title of `docs/sl-song-base-slugs.json`, vzell's four examples, exceptions, the paren-keyed pair, medleys; item 10163 linked, text/filter unchanged, no request; settings off; VA 9685 (only Bruce's line); bootleg 6739's this-show links from a stubbed index (landing + 3 letters, then saved: none), kept through a filter re-render; the lyrics index keeping a letter; glyphs exact (both annotation forms)/title/several/none, one request then saved, kept through a filter; the glyph's MusicBrainz card; 8595's release first; sl-song editions; the item window's links (card plain). the same from springsteenlyrics.com without www (index and links on the page's origin). Mutations: `scripts/mutations/sl-tracklist-links.json` (14) |
| `tests/fixtures/sl-song.spec.js`             | the song pageType: backstreets (two Born To Run editions, sides paired; Other official releases' fields and a track panel; 28 live releases split, the version link, "first released"; Covers' Item column with its edit link and no "add N songs"; movies; 61 versions with ID; three ● marks, not text; no request), its head (sections in order, Request without the form, Version/Studio/On this page cards, 44 pictures, Private Info closed), the live version (seven edition tables, Disc 5 as side E, Show and Released on cards), unofficial (versions only), babyme (no All versions button, Lyrics not available), All versions (ID numeric sort), `item=2298`, logged out (no ID, no Private Info), the layout (the h1 above the site's title, the sticky Title never over the next column). Mutations: `scripts/mutations/sl-song.json` (with the old-address reader and the `sl-old-address` finding, `findings-sl-old-address.spec.js`) |
| `tests/fixtures/sl-item.spec.js`             | the item pageTypes: collection 8595 (one record, Release and Your collection cards, scans, the native content hidden, Private info closed, no request), 5240 (five named records, one scans section per copy with pictures), 9685 (Artist column), bootleg 9507 (two discs, Take/Note, Show card, the info file read once on opening), 2567 (sides paired, MusicBrainz link, captions), CD bootleg 281 (Length, notes, inner ring text, PDF), All versions on a fresh load, vinyl 148 logged out (four records, Version split, no Your collection); the preview cache's login state. Mutations: `scripts/mutations/sl-item-pts.json` |
| `tests/fixtures/sl-logged-in-columns.spec.js` | logged-in lists: collection MusicBrainz/Good scans/Kept in (incl. Lebanon) and the Version after the second marker, bootlegs MusicBrainz and the Info file link, brucelegs PDF/Artwork, logged out unchanged; the Info file's card (no request) and window (one), the MusicBrainz cell's card |
| `tests/live/sl-lists.spec.js` (`@extended`)  | real pagination: rows = the page's own "Showing items … of N" (album/12i, book, the entry page, aud_live1967, brucelegs); Sticky Page Headers under the site's real CSS; on every real brucelegs row: a Location show note reaches Show, no description or "USA" reaches Country, every dated row has YYYY; the whole lyrics index (32 letters) against the landing page's own per-letter `chartData`, with bounds on "Other" and undated Live lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Fixtures are generated: `python3 scripts/build-sl-fixtures.py` splits three
logged-out snapshots in `debug/` into two 50-card pages each (rewriting only
the pagination widget, `page=` or `pg=`), keeps two whole categories
(sampler, memorabilia, curl captures) as one widget-less page each, writes the
card-less bootleg landing page whole (`PLAIN_TARGETS`), and strips
scripts, `<link>`s, inline background images and jquery.sticky's inline
navbar-wrapper height (without the site CSS the unstyled navbar spilled out of
it over the toolbar once pinned).
`tests/support/slFixture.js` serves them: a catch-all ABORT for the host
registered first (thumbnails and stray subresources), page 1 at the list URL,
and a predicate route for every `page=N`/`pg=N` fetch (a glob cannot work: the
list URL already contains `?`). Mutation list: `scripts/mutations/sl-support.json`.

The logged-in fixtures (2026-11-04) come from `python3
scripts/build-sl-item-fixtures.py` (`--check` verifies): the item snapshots
whole, the user name replaced by "USER" and every "Private info" section's
content by a placeholder, with a leak check on the output; the logged-in
LIST snapshots were saved with the script running (its toolbar and styles in
the page), so their cards and logged-in login box are grafted into the clean
anonymous page 1 of the same kind. `slFixture.js` serves them as the kinds
`collection-logged-in`, `bootlegs-logged-in`, `brucelegs-logged-in`.
Since `feat/sl-songs`, the builder also makes two more fixtures:
- `sl-lyrics-b-logged-in.html`: the logged-in song lines of
  `debug/sl-songs-B.html` grafted line for line into `sl-lyrics-b.html`
  (`graft_lines()`, kind `lyrics-b-logged-in`);
- `detail-sl-song-backstreets-logged-in.html`: "Private Info" scrubbed. The
  scrub regex is now case-insensitive, and the leak check knows two phrases
  of the song note. `detailFixture.js` serves it for `song=backstreets` and
  `item=2298`.
Since `feat/sl-song-pt` (2026-11-05) three more song pages (live 1975-11-18,
unofficial1, babyme), and every song page's lyrics are blanked through
`build-detail-fixtures.py`'s `blank_lyrics()`, as the logged-out fixtures'
are: the repository carries no lyrics (the backstreets fixture of
`feat/sl-songs` had them).

## Titles

Since 2026-10-13 (`feature/bb-recent-changes-relations`) the Title column of
the card lists (`_slBuildRow()`, all kinds) and of the lyrics index
(`applySlLyricsToTable()`) is in MusicBrainz title style with typographic
punctuation, the site's text as the cell's tooltip — `sa_foreign_mb_titles`,
`sa_foreign_typography`, both on by default. The cover's `alt` keeps the
site's text. The sl specs load with both OFF (`slFixture.js`'s `titles`);
`tests/fixtures/mb-title-case.spec.js` covers the ON side. See
docs/claude/foreign-title-case.md.
