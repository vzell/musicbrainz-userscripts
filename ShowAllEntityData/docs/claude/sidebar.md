# MusicBrainz sidebar (`_sb*`)

The right-hand sidebar MusicBrainz shows on entity pages: its sections, its
picture, and its facts as tables. Mockup approved 2026-10-10:
`https://claude.ai/artifact/9ZZtr9hR7uUGBPSk2ohvfW`. Picks: remember what was
opened; external links grouped by kind; other scripts' content left where it
is (no per-script settings); facts as tables behind their own button with the
sidebar kept; the picture in the sidebar, beside the name and in the entity
hover card (not on the sidebar handle; the viewer opens from the window, not
the card: decided 2026-10-11, the card closes on mousedown). Plan:
`~/.claude/plans/` "MusicBrainz sidebar overhaul", branch `feature/sidebar-overhaul`.

## Sections

`_sbEnhance()` runs at the end of every `makeH2sCollapsible()` pass, on
`#sidebar` only. The main content's headings keep their old behaviour; every
change below is gated on `#sidebar.contains(h2)`.

**Where a sidebar section ends.** `makeH2sCollapsible()` used to walk an h2's
siblings up to the next h2. MusicBrainz puts Tags in its own wrapper
element, so the walk ran into that wrapper and treated it as part of
"Artist information": closing Artist information hid Tags, and its count would
have included the tags. Inside `#sidebar` the walk now also stops at an element
that CONTAINS an h2. `_sbSectionNodes()` applies the same rule for the
`_sb*` helpers; keep the two in step.

**Initial state.**
- `sa_sidebar_remember_sections` (default on): open as last left, per entity
  type and section kind, in the GM key `sa_sidebar_open_sections`
  (`{ artist: { 'external-links': true, 'text:tags>genres': false, … } }`).
- Nothing remembered means closed, so a first visit looks as it did before.
- `sa_sidebar_open_all` (default off) opens everything and takes precedence.
- The kind is the h2's own MusicBrainz class (`_sbKind()`), else
  `text:<heading text>` (Tags has no class). An h3 or a link group is
  `<h2 kind>><its name>`.
- `h2._mbToggle` is WRAPPED, so every route remembers: click, Ctrl+Click on a
  peer, the Open all / Close all bar, Enter/Space. The initial toggle is
  suppressed with `_mbSbInit`. Without that, loading a page would record every
  section as a choice.

**Counts** (`sa_sidebar_section_counts`): `li` items that are not
`.separator`, not our `.mb-sbl-head`, not `.all-relationships`, plus `dt`.
Zero shows nothing (Rating).

**Sub-sections.**
- Native sidebar h3s (Tags: Genres / Other tags; Collections) fold their
  siblings up to the next h3 or h2 (`_sbWireH3()`).
- An h2 that opens shows every sibling under it, folded h3 lists included, so
  the wrapper re-applies the h3 states (`_sbReapplyUnder()`).
- A folded link group needs nothing there: the h2 shows the list, never the
  items inside it. A mutation proved that branch dead, and it was removed.

**External links by kind** (`sa_sidebar_link_groups`, `_sbGroupLinks()`).
- **No link is moved or rebuilt.** Each native `li` gets `data-mb-sbl-kind` and a
  CSS `order`. The `ul` becomes a flex column, and one heading `li` per kind is
  appended.
- That keeps MusicBrainz's markup and any other script's references intact.
- An `li` without a known `*-favicon` class (`no-favicon`, or another script's
  item) is "Other".
- `li.all-relationships` ("View all relationships") is MusicBrainz's own link,
  not an external site: it stays last, ungrouped and uncounted.
- The site → kind map is `_SB_LINK_KINDS`; a new MusicBrainz favicon falls to
  "Other" until it is added there.

**Other scripts.** Nothing of theirs is read, moved or hidden. Their h2s get
the same toggle as MusicBrainz's own, as they always did. The mockup's
gather/hide choices were not picked and are not built. The one exception, by
the user's consent (2026-10-11): the sidebar picture another script adds
(`div.entity-image`, below) gets a hover card and the viewer; only its img's
address is read.

**Re-runs.** `makeH2sCollapsible()` runs again after a disk load. `_sbReset()`
removes our counts, bar, group heads and h3 icons, and unhooks our handlers
first.

Specs:
- `sidebar-sections.spec.js` (8) and `sidebar-sections.mobile.spec.js` (1), on
  `tests/fixtures/artist-releasegroups-live-titles.html`. That is Bruce
  Springsteen's real artist page: 57 external links plus "View all
  relationships", and Tags in its own wrapper.
- Mutations: `scripts/mutations/sidebar-overhaul.json`.
- **Mobile trap:** this fixture has no MusicBrainz stylesheet, so its sidebar is a
  sticky block wider than the phone. The spec adds MusicBrainz's phone layout
  rule (`#sidebar { position: static; width: auto }`), scrolls the target to the
  middle with its left edge in view, and taps with `page.touchscreen` at
  visual-viewport coordinates.
- `locator.tap()` scrolls again by itself, to the top edge under the sticky
  header bar, and a zoomed-out phone's `getBoundingClientRect()` is in
  layout-viewport coordinates.

## The sidebar picture

**Whose picture it is** (musicbrainz-server source, read 2026-10-11):
- MusicBrainz's own `CommonsImage` component renders
  `div.commons-image > div.picture > img` plus an "Image from Wikimedia
  Commons" note. Its server side returns nothing unless
  `WIKIMEDIA_COMMONS_IMAGES_ENABLED`, and on musicbrainz.org it returns
  `{"image": null}` for every entity and the page shows no picture: the switch
  is off there.
- The picture in the user's browser is `div.entity-image > div.picture > img`,
  with no note: **another userscript adds it**. The user consented on
  2026-10-11 to it being decorated; only the img's address is read.

Both arrive AFTER load: the raw page has neither. `_sbInitPicture()` is called
once at init, right after the required-elements check, on MusicBrainz only
(`_foreignHost`). It wires a picture that is already there (selector
`.entity-image .picture img, .commons-image .picture img`, a literal because
this runs before its part of the file: TDZ), or watches `#sidebar` with a
MutationObserver for up to 15 s.

**Nothing is requested.** The picture is MusicBrainz's own, already in the
browser. The viewer loads it through the external path (`external: true`: no
art cache, no referrer), like `_dpArtViewerClick()` does for another site's
images.

**Rules.**
- **Only a Commons file** (`_sbCommonsFile()`: the host ends in `wikimedia.org`).
  The event sidebar's event art already has the artwork viewer, and is left
  alone.
- **The picture's own control** (`_sbPictureControl()`): a `_setTip()` hover
  card ("Artist image · Wikimedia Commons · <file>. Click to open it in the
  viewer."), `role=button`, `tabindex=0`, and click, Enter or Space.
- **The viewer context** is its own (`_SB_PIC_CTX`, column "Entity image"). A
  shared context would make the bar read "Detail page" or "CAA".
- **The viewer bar** shows an image's `pageUrl` as a link (`pageLabel`, here
  "Open on Commons", `data-mb-artv-page`). That is an optional field, so
  every other caller is unchanged.
- **The copy beside the name** (`sa_sidebar_picture_in_header`) is a
  `span.mb-sb-avatar` prepended to the header h1, 34 px with `object-fit:
  cover`, with the same control. It stays in sight when the sidebar is
  collapsed.

**Settings.** `sa_sidebar_picture` (default on) and `sa_sidebar_picture_in_header`
(default on).

**Specs.** `sidebar-picture.spec.js` (6: both markups) and
`sidebar-picture.mobile.spec.js` (1). They add the picture late and serve
upload.wikimedia.org from a 1×1 PNG. A "left alone" test waits one macrotask
turn (`observerRan()`): an observer callback is a microtask, so this is a real
settle, not a sleep. There are 8 mutations in `sidebar-overhaul.json`.

## "🗂 Sidebar as tables"

A button, not a part of any other render. You chose that over mixing the groups
into the discography's pipeline on 2026-10-11.

**Where it shows** (`_sbTablesButtons()`): appended to the toolbar's
`buttonsToRender` at init when all of these hold:
- the host is MusicBrainz;
- `sa_sidebar_tables_button` is on (off by default since the inline views, below);
- the path is an entity overview
  (`/artist|label|event|release-group|recording|work|series|place|area|instrument/<mbid>`,
  or `/release/<mbid>` with an optional `/disc/N`);
- the page has `#sidebar dl.properties`.

`_sbTablesButtons()` runs during init, before the `_sb*` part of the file has
executed, so it must not read a module-level `const` from there (TDZ). That is
why the path pattern is a literal inside it.

**A page type is needed first.** The button joins a toolbar, and a page with
no page type gets none: the script stops at init. Release (`release-tracks`)
and series (`series-releases`) have one. Place, area and instrument overviews
got theirs from main's relationship tables (`place-overview`,
`area-overview`, `instrument-overview`, merged into this branch 2026-10-14).
Those match while `sa_enable_relationship_tables` OR
`sa_sidebar_tables_button` is on; their own "Relationships" button carries
`showIf` on the first, so with the relationship tables off only the Sidebar
button shows. A release page needs `sa_enable_release_tracks` (default on)
for the same reason.

**In the toolbar.**
- It sits behind its own divider (`ownGroup`,
  `.mb-button-own-group-divider`), so it does not read as one of the page
  type's buttons, or as part of a group label like "RGs:".
- Its tooltip is its own `description` ("… nothing is fetched"). The toolbar
  now prefers that over its generic "Fetch …" texts.
- Its painted text follows the toolbar convention, `🧮N Sidebar`: every button
  carries 🧮 and its Ctrl+M number.
- The full suite found the first two problems:
  `action-button-shortlabel-and-rich-tooltip.spec.js` counted the artist
  page's buttons, and now also pins the divider and the description (two
  mutations).

**The button object.** It sets `type: 'sidebar-tables'`,
`tableMode: 'multi'`, `non_paginated`, `replaceFeatures`, and its own
features (`sidebarToTables`, `groupByH3`, `integerColumns` for # and Votes).
It has no `params`, so page 1 is the live document: no request.

**How `startFetchingProcess()` treats it.** The same two fields main's
relationship-tables buttons use (`_relTablesButton()`). The branch had its
own `ownFeatures`/`pageType` pair for this; the merge of `main` on
2026-10-14 replaced it with main's fuller version (it also drops
`entityFeatures` and lets a disk load find the button again).
- A button `type` replaces the detected `pageType` for that render.
  There is nothing to restore: a second press reloads the page, which detects
  the type afresh. Without it, `artist-releasegroups`' own branches run on the
  sidebar render; a mutation proves it.
- `replaceFeatures` drops the page type's features and entity features from
  the merge. On today's pages this is covered: the leaked features find no
  column of theirs, and the event page's `eventDetailsToTables` output is
  removed again by the sidebar converter. The mutation is recorded as
  `expect: "pass"` with that reason. `replaceFeatures` stays as the guard for
  a page type whose features WOULD act on `#`, `Kind` or `Votes`.

**The converter** (`applySidebarToTables()`). It is called from the live
pre-processing and for a fetched page, next to `applyEventDetailsToTables()`.
It builds groups with `_eventBuildTable()`:

| Group | Columns | Source |
|---|---|---|
| `<h2 text of dl.properties>` | #, Property, Value | every `dl.properties` (dd cloned); a release has two: "Release information", "Additional details" |
| Labels (release) | #, Label, Catalog number | the `ul.links` whose items link a label's own page (`/label/<mbid>`, never `/label/<mbid>/edit`: a label's Editing list); `.catalog-number` |
| Release events (release) | #, Country, Date | `ul.release-events > li`: the `.flag` area link, `.release-date` |
| `<h2 text of ul.external_links>` | #, Site, Link, Kind, Details | every `ul.external_links` (a release has "Release group external links" too); Site = host; Kind = `_SB_LINK_KINDS`; Details = the item's text beside its link, e.g. "(as @x)"; `.all-relationships` left out |
| Tags | #, Tag, Kind, Votes | Kind is Genre or Tag; Votes from `.tag-count` |

- An empty group is left out.
- It removes that document's own `table.tbl`s and h3s from `#content`, so only
  its groups are read.
- It puts an h2 "Sidebar" before the first h2 of `#content`, with the groups
  after it. Where it starts does not decide where it ends:
  `_relocateTrailingH2Sections()` (`sa_enable_h2_section_relocation_on_final_page`)
  moves the page's other h2 sections above it after the render, as on every
  page. On a release (headings in `div.annotation` and
  `div.tracklist-and-credits`, no direct h2) the groups come last, under the
  annotation and the emptied Tracklist heading; placing them earlier was
  tried on 2026-10-14 and undone by that pass.
- The sidebar is only cloned from; our counts, icons and group heads are
  filtered out of the clones.

**Disk load of a saved "Sidebar as tables" view.** Supported since the merge
of main (2026-10-14). Before it, a save reloaded as its page type (Load from
Disk keyed on the detected pageType), so the restore was left out. Main's
`_activateButtonForSavedPageType()` makes the saved pageType's button active
first; `_buttonForSavedPageType()` also asks `_sbTablesButtons()`, and the
disk-load restore runs `applySidebarToTables()` beside the other converters.

**Specs.** `sidebar-tables.spec.js` (5), on the artist and event fixtures:
- the three groups with their rows;
- no discography view buttons, and no Relationships or CAA column even with
  both switched on;
- the global filter;
- the sidebar unchanged;
- no request;
- no button off an overview page or with the switch off.

There are 7 mutations in `sidebar-overhaul.json`, 6 caught and 1 recorded
`expect: "pass"`, as above.

**Specs for the five more kinds** (2026-10-14, 8 more in the same file), on
main's `rel-<kind>-overview.html` captures:
- per kind (release, series, place, area, instrument): the button, a render
  of sidebar groups only (every h3 is a sidebar heading), the first being the
  kind's facts with one row per fact, and no request;
- the release: both facts lists, Labels and Release events with their rows,
  both external-links lists, no tracklist table;
- with the relationship tables off: place, area and instrument keep the
  button, and no Relationships button shows;
- a disk round trip on the release: the same groups, under their own
  "Sidebar" heading at the top level of `#content`. Without the converter on
  the load path the groups still render, but nested in the release's
  `div.tracklist-and-credits` with no heading; counting tables anywhere in
  `#content` missed that, so the test also checks where they sit.

9 more mutations, all caught. One ("the saved Sidebar button is not found")
fails by the spec's timeout, not an assertion: Load from Disk's
pageType-mismatch prompt comes up instead of the render button.

## The picture in the entity previews (`_mbPopImageLoad()`)

Part 4. MusicBrainz's `/<type>/<mbid>/commons-image` is no use: its switch
is off (above), so it answers `{"image": null}` (DEBUG-NOTES.md, 2026-10-11,
two entries). The popup engine does in the browser what that server code would
do, and only on Space.

**What is asked, in order** (`_mbPopImageLoad(t, relations, again, repaint)`):
1. An `image` or `logo` relationship to `commons.wikimedia.org/wiki/File:…`
   (`_mbPopCommonsFile()`) gives the file. No request. Bruce Springsteen and
   Columbia both have one.
2. Else the `wikidata` relationship's item: one `wbgetclaims` per property of
   `_MB_POP_IMG_PROPS` until one names a file.
   - An artist or a place asks P18 (image), then P154 (logo). **A label asks
     P154 first**, unlike the server: Columbia's P18 is a photograph of
     something else (`scripts/probe-wikidata-image.py`).
   - A preferred value wins; a deprecated one is never taken
     (`_mbPopClaimFile()`).
   - Through `_extGet()`: Wikidata's own rate gate, anonymous,
     `Api-User-Agent`, `wanted()` after the slot.
3. Neither: "no picture".

**Cache.** `_mbLoad()` under `pop:img:<type>:<id>`, version
`_MB_POP_IMG_VERSION`, `_mbTtlMs()`. "No picture" is kept too, so a second
Space asks nothing. A failure is retried only by ⟳ or "Try again".

**When.** Only from the kinds' `pin()` (artist, label, place), once their
url-rels answer is there: the artist's and label's window lookups, the place's
own card lookup. `relations` is null before that; a ⟳ that comes while the
url-rels reload is remembered in `_mbPopImgAgain`, so the next start skips the
caches. Not area (locator maps), not event (event art).

**The card never asks.** `_mbPopImagePeek()` reads the record from memory,
else ONE IndexedDB read per key per page load, and repaints on a hit. The
card is then a grid (`_mbPopCardShell()`'s `aside`, `spec.cardAside`): a
64 px picture, then the facts; the foot says "Space picture & more". A place's
card lookup carries the Wikidata link, and still starts nothing.

**The window.** Under the title (`_mbPopWindowPicture()`): a ◌ line while
loading, nothing when there is none, the failure with "Try again", else the
picture as an `a[data-mb-artv-ext]` with `data-mb-artv-page`. A click goes
through `_dpArtViewerClick()`, which now passes that page as the viewer's
"Open on Commons" link (an optional field: other images are unchanged). The
caption names the file and, for P18/P154, the item.

**Addresses.** `commons.wikimedia.org/wiki/Special:FilePath/<file>?width=330`
(the card and the window) and `?width=1280` (the viewer). They redirect to
upload.wikimedia.org (probe: 28 KB and 404 KB for Bruce Springsteen's file).
These hosts are first reached on that Space; a later card loads the 330 px
thumbnail again, from the browser's cache.

**Setting.** `sa_pop_mb_image` (default on), after the touch twins. Not a
`_popSettingOn()` twin: it is part of `sa_pop_mb`, not a source.

**Specs.** `pop-mb-image.spec.js` (8) and `pop-mb-image.mobile.spec.js` (1).
Wikidata is the GM stub's `__gmXhrResponses`; Commons a local PNG.
`popup-mb.spec.js` routes the Wikimedia hosts too, since its artist, label and
place windows now show the Commons-relationship picture. A trap: the window's
scroll area takes focus on `mouseenter`, which the closing viewer overlay fires
under a pointer parked on the picture, so the focus test moves the pointer
off first. There are 10 mutations in `sidebar-overhaul.json`.

Measured: `_sbEnhance()` is about 1.2 ms of a 1.5 ms `makeH2sCollapsible()`
pass on the artist page (`tests/support/probe-sidebar-cost.js`,
`__saTest.sidebar.timing()`, tests/MEASUREMENTS.org 2026-10-11).

## The sidebar beside the page's own data (`_sbInline*`, `_sbAppendRelTablesGroups()`)

Mockup picked 2026-10-15 (`https://claude.ai/artifact/FUdHYEuiLqhmrX3hqitzX4`,
"P2 + A3, B1, skip duplicate links on"); request in org/sidebar-info.org
"Overwhole". Branch `feature/sidebar-inline`. The same groups as the button
above, without pressing it.

**One reader.** `_sbCollectGroups(doc, {links, tags})` returns
`[{ key, name, cols, rows }]` (`info`, `labels`, `events`, `links`, `tags`);
every call clones afresh, so each consumer may insert the cells.
`applySidebarToTables()` builds its tables from it (always every group), and
so do the two views below. Change what is read there, once.

**In a relationship-tables render** (`sa_sidebar_in_rel_tables`, default on).
`applyRelDetailsToTables()` calls `_sbAppendRelTablesGroups(doc, frag)` just
before inserting its fragment, so the live render, a fetched page and a disk
load all get the tables, and the place / area / instrument overviews too.
- Named `Sidebar: <heading>`: sub-table state is keyed by name, and a release
  has a relationship "Labels" table as well as the sidebar's.
- Same dataset as the relationship tables (the "one dataset per page" rule in
  relationship-tables.md): the h2's global filter covers them; each has its
  STF, CFs and 📊. `Votes` is in `_relTablesFeatures()`' integer columns.
- Duplicates (`sa_sidebar_inline_skip_dup_links`, default on): a sidebar link
  whose `_sbLinkKey()` (host without `www.`, path without trailing slash,
  query; no scheme) is already a link in the fragment is dropped, the rows
  renumbered, an empty links group dropped. On a release both link groups
  usually go: its own URLs and its group's are relationship rows already.

**After every other render: the read-only "Sidebar" section**
(`sa_sidebar_inline_main`, default on; `sa_sidebar_inline_collapsed`,
default off).
- Markup: `div.mb-sb-inline-wrap > h2.mb-sb-inline-h2 + div.mb-sb-inline >
  div.mb-sb-cards > section.mb-sb-card[data-mb-sb-key]`. **No `table.tbl`,
  no h3**, so no table pass, filter, sort, Picard, CAA or the
  `renderGroupedTable()` h3 sweep ever sees it. Cards fold through a
  delegated listener on `div.mb-sb-inline` (never cloned).
- **Cards are a wrapping flex row, never fixed grid columns.** A value can
  hold a line that never breaks: More Flags Everywhere makes every area
  `span.mfe-flag-wrapper` `white-space: nowrap !important`, and in a
  220 px-minimum grid column its flags stuck out of the card (DEBUG-NOTES.md
  2026-10-15). Facts cards take their content's width, links and tags a
  whole row, a dd that still cannot fit scrolls inside its card. Pinned by
  "NO OVERFLOW". The section is also capped to the window
  (`max-width: calc(100vw - 32px - 1.5em)`, the Cover art section's cap): on a
  release it sits in the tracklist's wrapper, thousands of px wide with a
  wide tracklist, and on a phone a facts card took all of it
  (`sidebar-inline.mobile.spec.js`). Specs about other features on a release
  page that are sensitive to the table's vertical position switch the cards
  off (`title-el-without-bdi`, `release-tracks-cover-art.mobile`).
- `_sbInlineInsertSection()` runs in the render tails right after
  `_makeCreditsH3sCollapsible()`: in `finalCleanup()` and in the disk-load
  tail, which relocates again after `finalCleanup()`. It builds once per
  page and PLACES on every call (`_sbInlinePlace()`): after
  `#bottom-credits`; else after the `h2.relationships` section (before the
  next h2 or element holding one); else right above the data h2; else at the
  end of `#content`. Placing again after each relocation is required: the
  relocation treats our h2 as one more trailing section and would put it
  BEFORE the Relationships section (reverse-order pass; pinned by the
  release-group disk round trip in `sidebar-inline.spec.js`).
- `makeH2sCollapsible()` makes the h2 an ordinary collapsible section and,
  like every non-data h2, closes it; `_sbInlineOpen()` opens it right after
  (both tails), as `_releaseArtInsertSection()`'s h2 is opened.
- **The section boundary.** `makeH2sCollapsible()`'s sibling walk stops at a
  `.mb-sb-inline-wrap`: without that, folding Credits / Relationships would
  fold ours with it, because the walk only stops at an H2 element and ours
  sits inside a div.
- Skipped on a relationship-tables render (it gets the tables) and on the
  "🗂 Sidebar as tables" render; MusicBrainz only.

**`sa_sidebar_tables_button` is off by default** since this change (it
duplicated the two views). Its reads are `=== true` / `!== true` so a stub
`Lib` keeps it off; `_SETTINGS_MIGRATIONS` carries `was: [true]`.

**Specs.** `sidebar-inline.spec.js` (15) and `sidebar-inline.mobile.spec.js` (1, the window cap): order and columns of the
`Sidebar:` tables, duplicates on/off, global filter + a sort that ORDERS,
the place overview, the switches, a disk round trip; the cards' place on a
release (after `#bottom-credits`), a release group (after Relationships,
again after an empty-query re-render), an artist (above the data h2),
folding (Credits leaves it open, its own h2, a card by click and Enter),
content counts against the sidebar itself, the switches. The rel-tables
specs seed `sa_sidebar_in_rel_tables: false` (they pin the relationship
tables); `sidebar-tables.spec.js` seeds the button on and pins the new
default. Mutations: `scripts/mutations/sidebar-inline.json`.
