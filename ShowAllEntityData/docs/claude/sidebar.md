# MusicBrainz sidebar (`_sb*`)

The right-hand sidebar MusicBrainz shows on entity pages: its sections, its
picture, and its facts as tables. Mockup approved 2026-10-10:
`https://claude.ai/artifact/9ZZtr9hR7uUGBPSk2ohvfW`. Picks: remember what was
opened; external links grouped by kind; other scripts' content left where it
is (no per-script settings); facts as tables behind their own button with the
sidebar kept; the picture in the sidebar, beside the name and in the entity
hover card (not on the sidebar handle). Plan:
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
gather/hide choices were not picked and are not built.

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

MusicBrainz adds an entity's Wikimedia Commons picture to
`#sidebar .entity-image .picture img` AFTER load: the raw page has none.
`_sbInitPicture()` is called once at init, right after the required-elements
check, on MusicBrainz only (`_foreignHost`). It wires a picture that is already
there, or watches `#sidebar` with a MutationObserver for up to 15 s.

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

**Specs.** `sidebar-picture.spec.js` (5) and `sidebar-picture.mobile.spec.js`
(1). They add the picture late and serve upload.wikimedia.org from a 1×1 PNG.
A "left alone" test waits one macrotask turn (`observerRan()`): an observer
callback is a microtask, so this is a real settle, not a sleep. There are 7
mutations in `sidebar-overhaul.json`.

## "🗂 Sidebar as tables"

A button, not a part of any other render. You chose that over mixing the groups
into the discography's pipeline on 2026-10-11.

**Where it shows** (`_sbTablesButtons()`): appended to the toolbar's
`buttonsToRender` at init when all of these hold:
- the host is MusicBrainz;
- `sa_sidebar_tables_button` is on (the default);
- the path is an entity overview (`/artist|label|event|release-group|recording|work/<mbid>`);
- the page has `#sidebar dl.properties`.

`_sbTablesButtons()` runs during init, before the `_sb*` part of the file has
executed, so it must not read a module-level `const` from there (TDZ). That is
why the path pattern is a literal inside it.

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

**The button object.** It sets `type`/`pageType: 'sidebar-tables'`,
`tableMode: 'multi'`, `non_paginated`, `ownFeatures`, and its own features
(`sidebarToTables`, `groupByH3`, `integerColumns` for # and Votes). It has no
`params`, so page 1 is the live document: no request.

**The two shared `startFetchingProcess()` changes.** Both are inert for
every other button, because no other button sets these fields.
- `buttonConfig.pageType` replaces the detected `pageType` for that render.
  There is nothing to restore: a second press reloads the page, which detects
  the type afresh. Without it, `artist-releasegroups`' own branches run on the
  sidebar render; a mutation proves it.
- `ownFeatures` drops the page type's features and entity features from the
  merge. On today's pages this is covered: the leaked features find no column
  of theirs, and the event page's `eventDetailsToTables` output is removed
  again by the sidebar converter. The mutation is recorded as `expect:
  "pass"` with that reason. `ownFeatures` stays as the guard for a page type
  whose features WOULD act on `#`, `Kind` or `Votes`.

**The converter** (`applySidebarToTables()`). It is called from the live
pre-processing and for a fetched page, next to `applyEventDetailsToTables()`.
It builds groups with `_eventBuildTable()`:

| Group | Columns | Source |
|---|---|---|
| `<h2 text of dl.properties>` | #, Property, Value | `dl.properties` (dd cloned) |
| External links | #, Site, Link, Kind, Details | Site = host; Kind = `_SB_LINK_KINDS`; Details = the item's text beside its link, e.g. "(as @x)"; `.all-relationships` left out |
| Tags | #, Tag, Kind, Votes | Kind is Genre or Tag; Votes from `.tag-count` |

- An empty group is left out.
- It removes that document's own `table.tbl`s and h3s from `#content`, so only
  its groups are read.
- It puts an h2 "Sidebar" before the first h2 of `#content`, with the groups
  after it.
- The sidebar is only cloned from; our counts, icons and group heads are
  filtered out of the clones.

**Not supported: disk load of a saved "Sidebar as tables" view.** The plan
listed the disk-load restore as a third call site. It was left out, because a
save of this view would reload as its page type: Load from Disk keys on the
detected pageType, and its mismatch prompt guards it. The rows are read from
the page in milliseconds, so a saved copy adds nothing.

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

## The picture in the entity hover card (not built)

Planned as part 4, it stopped at its probe (DEBUG-NOTES.md, 2026-10-11
"The commons-image endpoint"). `/<type>/<mbid>/commons-image` answers scripts
with a bot challenge, and a browser with `{"image": null}` even for an artist
whose sidebar shows a picture. Do not build on it without new evidence. The
probes: `scripts/probe-commons-image.py` (urllib, shows the challenge) and
`tests/support/probe-commons-image.js` (from a browser page).

Measured: `_sbEnhance()` is about 1.2 ms of a 1.5 ms `makeH2sCollapsible()`
pass on the artist page (`tests/support/probe-sidebar-cost.js`,
`__saTest.sidebar.timing()`, tests/MEASUREMENTS.org 2026-10-11).
