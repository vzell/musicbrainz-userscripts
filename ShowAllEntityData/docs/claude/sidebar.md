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
