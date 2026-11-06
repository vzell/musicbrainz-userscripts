---
name: add-image-section
description: Give a pageType's own pictures (a release's or item's cover art, scans, images, photos) the shared ART SECTION of ShowAllEntityData — the component behind MusicBrainz's "Cover art (N)" — with type chips, Grid / By type (/ Spreads), the ★ main image, the picture card, the viewer stepping the tiles shown and, where the data allows, medium thumbs in the sub-table headings. Use whenever the user asks to "show the pictures like the Cover art section", "add chips/layouts to the Scans/Images/Pictures", "group the images by type", "make <site>'s pictures work like MusicBrainz's", wants a new detail pageType's pictures, or touches `_artSectionDesc()`, `_fdArtSection()`, `_artSectionCreate()`, `_releaseArt*` with a non-archive source. For the rest of a foreign detail page (sub-tables, the head's cards) use foreign-detail-pagetype; for picture cells in TABLE ROWS (the FICE) use add-foreign-page-or-reader.
---

# A pageType's own pictures as an art section

Design and phases: `org/image-handling.org` (the Answer's 2a, then P0, P1,
…), mockups https://claude.ai/artifact/PnoG9pbnsqjGKYVgUQCzqh. Rules that fail
silently: `docs/claude/artwork-caa-eaa.md`, "Release page Cover art section
and the viewer". Read both before changing anything here.

## 1. Which path

- **A foreign detail page with a head** (`_fdHeadSpec()` returns a spec):
  nothing to build. Give the spec's `pictures` (or `pictureGroups`) their
  `types` and `front`; `_fdHeadInsertSections()` makes one art section per
  group through `_fdArtSection()`. Go to 3.
- **Anything else** (a MusicBrainz page, a page without the head): an
  adapter of your own. Go to 2.

## 2. The adapter

`_artSectionDesc(key)` returns it for the two archives (caa, eaa);
`_artSectionAdapters()` holds the ones made at run time (`_fdArtSection()` is
the model). Every handler reads ONLY these members:

```js
{
    key: 'xyz',                         // data-mb-art-ctx; unique per section on the page
    ctx: { key, column, external: true, imagesCache: new Map() },  // the viewer's context
    label: 'Pictures',                  // "Loading pictures…"
    archiveName: 'the page', what: 'item',   // "<archiveName> has no images for this <what>"
    images: sec => ctx.imagesCache.get(sec.dataset.mbArtEntity) || [],
    load: sec => Promise.resolve({ state: 'ok' | 'none' | 'failed', images }),
    retry: null,                        // or sec => { forget what load() remembered }
    tab: false,                         // true only for a native tab that opens the viewer
    title: () => 'Name for the viewer bar',   // or titleSel: an h1 holding an entity link
    layouts: ['grid', 'grouped'],       // 'spreads' only with left/right comments and Liner/Booklet types
    layoutKey: MB_X_LAYOUT_KEY,         // its own GM key, declared beside the others (TDZ) and
                                        // listed in _CFG_WORKSPACE_GROUPS
    secClass: 'mb-x-art',               // optional extra class for the section
    // Optional, P2 (all default to the types; MusicBrainz sets none):
    groupOf: im => im.group,            // the grouped layout's group
    chipsOf: im => [im.group],          // the chips an image counts for
    groupedLabel: 'By copy',            // the grouped layout's button
    groupOrder: ['Copy #1', 'Copy #2'], // the page's order of groups (chips and groups)
    placeholders: () => [{ group: 'Copy #1', note: 'No scans available yet' }],
}
```

A placeholder is `figure.mb-release-art-missing`, never a tile: the viewer,
the counts and the card must not see it. Its group gets a chip with 0. On a
foreign head, a spec asks for all of it with `pictureGroupLabel`,
`pictureGroupOrder`, `picturePlaceholders` and each picture's `group`
(`_slItemHeadSpec()` is the model).

Records: archive JSON, or the external shape
`{ image, thumbnails: { 250 }, types: [], comment, front, external: true, source }`.
`external` changes the tile (URLs kept, no referrer, the `fd-pic` card,
"★ primary"). Records already on the page: `_artSectionCreate(desc, key)`,
set `data-mb-art-state="ok"`, `_releaseArtRenderSheet(sec)`. Records to
fetch: `_artSectionBuild(desc, anchor, key, count)` (h2, section, load).

Never query `.mb-release-art-sec` bare: `_artSectionFind(key, loaded)`.
Never read a cache or `location` in a handler: the adapter does.

## 3. Types

The chips and By type come from `types` (the FIRST type groups). Use the
site's own kind when it has one (Discogs Primary/Secondary,
`_dgHeadPictures()`), else guess only from what the site names the file
(`_iaPictureTypes()`), else the section's kind (springsteenlyrics Scan /
Artwork). An untyped picture shows "(no type)". `front: true` on the ONE
image the site calls its main; never derive it from a "Front" type.
`caption` is the comment under the type; one that repeats the type is
dropped.

Medium thumbs (`_releaseArtApplyMediumArt()`, since P3 on any page): the
adapter gives `mediaOf()` (`[{pos, format, h3}]` from the page's sub-table
headings; `_artForeignMedia()` reads "Disc N", "Record N", a lone "Disc")
and `mediumOn()`; `_artMediumAdapter()` finds it. A picture goes into a
heading only by `_releaseArtMediumAssign()`'s rules: type Medium, and a
comment naming exactly one medium ("Disc 2") or a single medium on the page.
So type from the site's own words — file names (`_iaPictureTypes()`),
captions (`_slArtworkTypes()`) — and never guess a disc. A new adapter on a
MusicBrainz page other than release-tracks must also get past the
`_foreignHost === null` early return there, which keeps the filter pass free.

## 4. Tests and mutations

- A fixture spec beside the pageType's own (`discogs-release-tracks.spec.js`
  "image section P1" is the model): chip texts, the layout buttons, the ★,
  an external tile's href/`rel`/`referrerpolicy`/`data-mbtt-fn`, a chip
  click narrowing the tiles, the viewer's position ("2 / 4") and title, the
  layout's GM key (and that MusicBrainz's key stays untouched).
- Planted defects in `scripts/mutations/image-section.json` (one per
  guard); run `python3 scripts/mutation-check.py scripts/mutations/image-section.json`.
  When a change moves a line other lists target, find them by comparing
  every list's `find` count against the previous commit, and repoint.
- The MusicBrainz art specs must stay green: `release-tracks-cover-art*.spec.js`,
  `release-tracks-medium-art.spec.js`, `event-overview-art*.spec.js`.
- Docs: a line in `docs/claude/<site>.md`, HELP where the page is
  described, the coverage registry when a new pageType comes with it.
