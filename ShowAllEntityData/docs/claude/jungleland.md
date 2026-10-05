<!-- Written on branch feature/jl-support (org/jungleland.it.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# jungleland.it: the second non-MusicBrainz host

ShowAllEntityData also runs on jungleland.it's bootleg **artwork** list,
`https://www.jungleland.it/html/list.htm`, as the pageType `jl-list`. It is
**opt-in**: `sa_enable_jungleland`, default **off**. The request
(`org/jungleland.it.org`) was springsteenlyrics.com's treatment "albeit not
so complex": read each entry's title and year, and let the pipeline do the
rest. It is deliberately the smallest version of the springsteenlyrics.com
design (docs/claude/springsteenlyrics.md): a host gate, one definition with
`host`, one converter, and the shared table CSS. It has no bar, no hand-off
and fetches nothing.

## The page

Checked on the snapshot `debug/jungleland.it.html` and live on 2026-10-05:

- **Format:** one static FrontPage page, served as windows-1252 with no
  doctype (quirks mode). It has no `<h1>`/`<h2>`, no table, no `#content` and
  no pagination. Its `<title>` is "Anni".
- **Year jump menu:** `form[name="theForm"]` with a `<select>` whose options
  are `#1966` … `#2026`, `#others`. Its `goThere()` navigates to the anchor.
- **Year headings:** one `<p>` per year holding `<a name="1975">` (plus
  up-arrow links to `#TOP`), then one `<p>` per entry:
  `<a target="inferioredx1" href="19750815.htm">The way it was(1975-08-15)</a>`.
- **Counts:** 6,326 entries in all.
  - 5,840 sit under 59 year headings, and every one of them ends in
    `(YYYY-MM-DD)`, glued to the title.
  - 486 sit under "others": 485 are undated, and one has its date after a
    space ("Magic In The Köln Night (2007-12-13)").
  - A few entries start with a space.
  - A re-issue has `_N` in its href and usually "(Version N)" in its title.
- **Odd nesting:** the "others" heading has a second `<a name="others">`
  inside its first entry's `<p>`.
- **Frameset:** the site's real entry point is `html/artwork.htm`, a frameset
  with list.htm as the 25 % **left** frame (`inferioredx`). Entries open in
  the right frame (`inferioredx1`, default `images.htm`), which shows that
  bootleg's front/back artwork, title, date and uploader.

## The gates — `_isJlHost`, `_foreignHost`

`const _isJlHost` sits beside `_isSlHost`, and its two gates sit right after
the springsteenlyrics one, before anything visible, for the same reason:

1. Setting off → `Lib.info('… jungleland.it support is off …')`, return.
2. **`window.top !== window` → return.** The header has no `@noframes`, so
   Tampermonkey also runs the script in the 25 % frame. Decided 2026-10-05:
   only a list.htm opened as its own tab is converted.

`const _foreignHost` (`'springsteenlyrics.com'`, `'jungleland.it'` or `null`)
replaced the detection loop's `Boolean(def.host) !== _isSlHost`. With two
foreign hosts, "has a host" is not enough: a definition must name THIS
one. No spec can see the difference today, because no SL matcher claims
`/html/list.htm`. Removing the host check entirely is invisible too, because
no MusicBrainz matcher claims that path either (checked 2026-10-06). Both
are recorded as `"expect": "pass"` in `scripts/mutations/jl-support.json`.

Other host-aware code:

- **`performClutterCleanup()`** stands down on both hosts.
- **`initNavigationGuard()`** needs nothing. It is one static page, `#year`
  links are hash changes, and the table's links open a new tab.
- **`initStickyPageHeaders()`** runs unchanged, just as on SL.

## The toolbar anchor — `_jlPrepareLivePage()`

Called from the init block's `else if (baseDefinition?.host === 'jungleland.it')`
beside the SL branch. It:

- prepends `<h1 class="mb-jl-h1"><bdi>jungleland.it — Bootleg artwork list</bdi></h1>`
  to `<body>`. `_cachedEntityName` reads the `<bdi>`, so that text becomes the
  file name stem;
- adds `body.mb-sa-host-jl`;
- installs `_ensureJlStyle()`.

Nothing else changes before the button is pressed.

## The converter — `applyJlListToTable(def, docContext)`

Gated by `features.jlListToTable`, it is called from the same three places as
`applySlCardsToTable()`:

1. click-time pre-processing in `startFetchingProcess()`;
2. the pagination loop when `doc !== document`. This is not reached today,
   because one page means the live document is reused;
3. `_hydrateAndRenderFromSnapshotData()`, i.e. Load from Disk, where the
   reloaded page is the plain list again.

How it works:

- **Reading the entries:** `_jlCollectItems()` runs ONE
  `querySelectorAll('a[name], a[target="inferioredx1"][href]')`, which
  returns document order. So the last year/"others" anchor seen is the
  entry's section, and `<a name="TOP">` is ignored.
- **Parsing:** `_jlParseItem(text, section)`, also exposed as
  `window.__saTest.jlParseItem`, cuts a trailing `(YYYY-MM-DD)` off the
  title.
  - Year is the date's year, else a 4-digit section, else empty.
  - A date at the START of a title ("1978-09-19  30th Anniversary
    Rendition", under "others") stays part of the title.
- **Rows** are Title / Date / Year.
  - Title links to the resolved absolute href with `target="_blank"`: there
    is no `inferioredx1` frame in a standalone tab.
  - Date is ISO, so a text sort is chronological.
  - Year is an `integerColumns` entry (`align: 'C'`).
- **Placement:** the table takes the first year heading's place. Every entry
  `<p>` and year-heading `<p>` is removed.
- **Live document only:**
  - an `<h2 class="mb-jl-list-heading">Bootlegs</h2>` is inserted before the
    table. `updateH2Count()` anchors to the last `<h2>` before it;
  - the jump menu and its "Choose the year"/`=====` paragraphs get
    `mb-jl-hidden`, so they are hidden but not removed. Their anchors are
    gone, and the Year column does their job.
- **Never silent:** with no entries and no `table.mb-jl-table`, it logs a
  `Lib.warn`, as the SL converter does.

The whole page (6,326 rows) is above `sa_render_threshold`'s default of 5000,
so the render-decision dialog appears. That is expected, just as on SL's
5,365-row entry page.

## Styling

- **`_ensureForeignTableStyle()`** holds the minimal `table.tbl` look
  (borders, padding, header background, zebra), split out of
  `_ensureSlStyle()` on 2026-10-06 and keyed on
  `body:is(.mb-sa-host-sl, .mb-sa-host-jl)` inside `:where()`. A further
  host extends that `:is()` list rather than copying the block.
- **`_ensureJlStyle()`** adds only the injected headings, `.mb-jl-hidden`,
  and a guard against the site's `A:hover { font-weight: bold }`, which
  would reflow a table row under the pointer.

## Tests

| Spec | Pins |
|---|---|
| `tests/fixtures/jl-list.spec.js` | setting off: untouched (log line as proof); setting on: only the `<h1>` toolbar; inside the artwork.htm frameset: untouched (log line); one row per fixture entry, exact headers, no entry or year heading left, `<h2>` before the table, jump menu hidden not removed, the shared table CSS applied; title/date/year parsing incl. "(Version N)", the dated Köln row under "others", an undated leading-space entry, `_blank` links; a Year column filter; Date sorts chronologically; zero MusicBrainz/CAA/EAA requests with CAA and Relationships back ON; Save → Load from Disk round trip (twice, the second without a warning); `_jlParseItem` shapes |
| `tests/fixtures/sl-include-regex.spec.js` | the `@include` line: list.htm in (http/https, www/bare, hash, query); artwork.htm, images.htm, item pages, the splash page and look-alike hosts out |
| `tests/live/jl-list.spec.js` (`@extended`) | the whole real page: rows = its entry-link count, "Köln" decoded from windows-1252 and kept with its date |

The fixture is generated: `python3 scripts/build-jl-fixtures.py` keeps
sections 1966, 1975, 2026 and "others" (677 entries) of
`debug/jungleland.it.html`, and removes the `<script>` and the body
background. The BOM is replaced with `<meta charset="utf-8">`, and no doctype
is added. `tests/support/jlFixture.js` serves it behind a catch-all abort for
the host. `loadJlFramesetPage()` routes `artwork.htm` to the site's own
frameset markup and injects the userscript into the left frame. Mutation
list: `scripts/mutations/jl-support.json`.
