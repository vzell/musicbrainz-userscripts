<!-- Written on branch feature/bb-songs (org/brucebase.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# brucebase.wikidot.com: the fourth non-MusicBrainz host

ShowAllEntityData also runs on the Brucebase wiki's song list,
`https://brucebase.wikidot.com/stats:songs`, as the pageType `bb-songs`. It
is **opt-in**: `sa_enable_brucebase`, default **off**. The request
(`org/brucebase.org`) was springsteenlyrics.com's lyrics treatment, "extract
the song title, then let our userscript handle the rest" — so this is the
jungleland.it design (docs/claude/jungleland.md) once more: a host gate, one
definition with `host`, one converter, the shared table CSS. No bar, no
hand-off, nothing fetched (except the song pages read by the opt-in detail
preview, `sa_bb_detail_preview`, docs/claude/detail-pages.md).

## The page

Checked on the snapshot `debug/bb-songs.html` (saved from the browser,
2026-10-07):

- **Wikidot**, theme "flannel-ocean". `#container` > `#header` (whose `<h1>`
  is the wiki's name, "Brucebase Wiki"), `#side-bar`, `#main-content` >
  `#page-title` (a `<div>`, "Songs"), `#breadcrumbs`, `#page-content`. No
  `#content`, no `table`.
- **The songs** sit in a YUI tabview, `div.yui-navset`: `ul.yui-nav` holds 28
  tabs labelled `=- 0-9 -=`, `=- A -=` … `=- Z -=`, `=- Alt. -=`, and
  `.yui-content` one `div#wiki-tab-0-N` panel per tab, in the same order. Each
  panel is `div.list-pages-box > ul > li > a[href="/song:SLUG"]`, the title as
  the link text. One shape, no exceptions. "X" is empty.
- **Counts:** 1,689 links, **1,679 distinct**. The "Alt." tab repeats the 10
  songs whose title starts with a parenthesised subtitle ("(I Can't Get No)
  Satisfaction" is under S and under Alt.). The page's own "We currently have
  **1683** different songs" is a different count; nothing compares against it.
- **A second tabview** further down (News, Media, "Released (Not on
  Springsteen Album)") links 41 songs in its last tab. All 41 are also in the
  letter tabs.
- **Titles** carry entities and notes as written: "Devils &amp; Dust",
  "Angel Eyes ( - Little Steven &amp; The Disciples Of Soul - )", "Jolé Blon".
- **An iframe on the same path:** an html-block,
  `<iframe src="/stats:songs/html/<hash>">`, and a YouTube embed.

## The gate — `_isBbHost`

`const _isBbHost` sits beside `_isBsHost`, part of `_foreignHost`
(`'brucebase.wikidot.com'`), and its opt-in gate sits after the
brucespringsteen.it ones: setting off → `Lib.info('… brucebase.wikidot.com
support is off …')`, return, before anything visible.

**There is no frame gate.** The site is not a frameset, and the html-block
iframe's URL (`/stats:songs/html/<hash>`) is outside the `@include` line:
`/^https?:\/\/brucebase\.wikidot\.com\/stats:songs\/?(?:[?#].*)?$/`. That
line is the gate for it, and `sl-include-regex.spec.js` pins the iframe URL
as out.

Other host-aware code:

- **`performClutterCleanup()`** stands down here too.
- **`initNavigationGuard()`** needs nothing: one page, the tabs are
  `javascript:;` links, and a song link is a different path.

## The toolbar anchor — `_bbPrepareLivePage()`

The page HAS an `<h1>`, the wiki's name in `#header`, and the generic header
lookup's last fallback (`document.querySelector('h1')`) would put the toolbar
there. So the init block's `else if (baseDefinition?.host ===
'brucebase.wikidot.com')` branch calls `_bbPrepareLivePage()`, which:

- inserts `<h1 class="mb-bb-h1"><bdi>Brucebase — Songs</bdi></h1>` before
  `#page-title` (its text taken from there), so `_cachedEntityName` reads
  "Brucebase — Songs";
- hides `#page-title` (`mb-bb-hidden`), not removes it;
- adds `body.mb-sa-host-bb` and installs `_ensureBbStyle()`.

## The converter — `applyBbSongsToTable(def, docContext)`

Gated by `features.bbSongsToTable`, called from the same three places as
`applyJlListToTable()`: click-time pre-processing, the pagination loop when
`doc !== document` (not reached: one page, the live document is reused), and
`_hydrateAndRenderFromSnapshotData()` (Load from Disk).

- **Finding the list:** `_bbFindSongTabview()` takes the first
  `div.yui-navset` whose every tab label has the `=- … -=` shape and which
  links a song. Not "any `/song:` link": that would read the second tabview.
- **Reading it:** `_bbCollectItems()` pairs tab label i with panel i, reads
  `li > a[href^="/song:"]`, and keeps a song once, by its href as written.
  Alt. is the last tab, so the first sighting is under the song's own letter.
- **Letter:** `_bbParseTabLabel()` (also `window.__saTest.bbParseTabLabel`)
  takes what sits between `=-` and `-=`.
- **Rows** are Title / Letter (`_BB_HEADERS`). Title links to the resolved
  absolute `/song:` URL in the same tab (no frames here, unlike jungleland.it
  and brucespringsteen.it).
- **Placement:** the table goes where the tabview was. The tabview is
  removed, with the inline script right after it that built the YUI widget
  (it has run). On the live document `<h2 class="mb-bb-list-heading">Songs</h2>`
  goes before the table, where `updateH2Count()` anchors. The `<sup>` note
  and the second tabview stay.
- **Never silent:** with no tabview and no `table.mb-bb-table`, it logs a
  `Lib.warn` with the number of song links seen.

1,679 rows is below `sa_render_threshold` (5000): no dialog.

Text sort is the engine's own (`localeCompare` with `numeric: true`), so
"96 Tears" sorts after "7 Rooms Of Gloom".

## Styling

- **`_ensureForeignTableStyle()`**'s `:is()` list names `.mb-sa-host-bb`.
- **`_ensureBbStyle()`** adds only the injected `<h1>`/`<h2>` and
  `.mb-bb-hidden`; the wiki's own fonts are kept.

## Tests

| Spec                                        | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/bb-songs.spec.js`           | the fixture's shape (28 tabs, 1,689/1,679, Alt. all repeats); setting off: untouched (log line as proof); setting on: only the `<h1>` toolbar, not on the wiki's header `<h1>`, `#page-title` hidden, both tabviews intact; after the press: one row per distinct song of the letter tabs, exact headers, the letter tabview gone and the second one intact, `<h2>` before the table, the shared table CSS; Letter per tab, no Alt., subtitle songs once with their own letter; titles verbatim (entities, notes, accents), absolute same-tab links; a Letter column filter; Title sort order (numeric collation); zero MusicBrainz/CAA/EAA requests with CAA and Relationships back ON; Save → Load from Disk (twice, the second without a warning); `_bbParseTabLabel` shapes |
| `tests/fixtures/sl-include-regex.spec.js`   | the `@include` line: stats:songs in (http/https, trailing slash, hash, query); the html-block iframe, sibling lists, song pages, other wikidot wikis, `www.` and look-alike hosts out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/live/bb-songs.spec.js` (`@extended`) | the real page: rows = the distinct song links of the letter tabview, counted before the click                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

The fixture is generated: `python3 scripts/build-bb-fixtures.py` keeps the
WHOLE page and removes every `<script>`, `<iframe>` and theme `@import`.
`tests/support/bbFixture.js` serves it behind a catch-all abort for every
other URL. Mutation list: `scripts/mutations/bb-support.json` (the
first-tabview scoping is `"expect": "pass"`: every "Released" song is also in
the letter tabs, so first-wins de-duplication hides it).
