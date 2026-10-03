<!-- Written on branch sl-support (org/springsteenlyrics.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# springsteenlyrics.com: the one non-MusicBrainz host

ShowAllEntityData also runs on springsteenlyrics.com's paginated list pages —
the **collection** (`collection.php?cmd=list…`) and the **bootleg** lists
(`bootlegs.php?cmd=list…`), every category and every `f_*` filter — as the
pageTypes `sl-collection` and `sl-bootlegs`. It is **opt-in**:
`sa_enable_springsteenlyrics`, default **off**. Only what each list card shows
is used; no item detail page is fetched.

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

Four places read `_isSlHost` after that, and each says why:

| Where | Why |
|---|---|
| the `pageDefinitions` detection loop | `if (Boolean(def.host) !== _isSlHost) continue;` — a definition with a `host` belongs to that site alone, and on SL only those are considered |
| `performClutterCleanup()` | every target is MusicBrainz furniture; some removals (any `<details>` with >5 images, any 700px div) would hit unrelated content |
| `initStickyPageHeaders()` | with no `#page`, `_sphCollectTargets()` pins every `<body>` child — SL's navbar and footer |
| `initNavigationGuard()` | every SL page is one PHP script told apart by its query string, so there only a HASH-only change is "the same page" |

**The `host` filter is a guard no spec can see today** — no MusicBrainz matcher
claims `/collection.php`, and no MusicBrainz URL reaches the SL matchers. It is
recorded as `"expect": "pass"` in `scripts/mutations/sl-support.json` and
exists for the next broad `path.includes()` matcher.

**The `@include` line is the real outer gate**, and the fixture harness never
evaluates it (`loadPage.js` injects unconditionally), so
`tests/fixtures/sl-include-regex.spec.js` reads the header and checks it:
every list page in, item pages / intro pages / `lyrics.php` / look-alike hosts
out. `cmd=list` is matched anywhere in the query, because the site's own filter
forms submit `?f_date=…&cmd=list&category=f_date`.

## The toolbar anchor — `_slPrepareLivePage()`

Called from the init block right after the header lookup, for SL definitions
only (beside the scoped `user-edits` fallback). It injects
`<h1 class="mb-sl-h1"><bdi>Collection — OFFICIAL ALBUMS</bdi></h1>` as the
first child of `.project-detail`, the section name coming from the breadcrumb
`.breadcrumb-wrap h4` and the rest from the list heading. The `<bdi>` is what
lets the init-time `_cachedEntityName` capture read it like a MusicBrainz
`<h1>`. It also adds `body.mb-sa-host-sl`, installs `_ensureSlStyle()`, and
measures the site's sticky navbar into `--mb-sl-navbar-h`.

**Scope every SL lookup to `.project-detail`.** The page carries ten
`h3.heading`s; seven belong to the navigation mega-menu. Exactly one — the
list heading — is inside `.project-detail` (checked on both snapshots and four
live categories, 2026-10-04).

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

On the live document it also renames the list `h3.heading` to `<h2>` (so
`updateH2Count()` anchors the count and filter bar there) and tags the table's
fixed-width Bootstrap `.container` ancestors `mb-sl-wide`.

**Read card fields by label, never by position.** `_slReadCardFields()` maps
each `<span class="text-primary"><em>Label:</em></span> value<br>` line by its
label text; a card that lacks a line just yields no key. Cards vary: 7 of 100
collection cards and 16 of 100 bootleg cards have no sub-title line (the bold
text after `glyphicon-option-vertical`).

Columns (`_SL_HEADERS`):

| sl-collection | sl-bootlegs |
|---|---|
| Cover, Title, Version, Label, Cat. no., Format, Country, Release date, Original year, Copies | Cover, Title, Label, Date, First date, Location, Format, Duration, Lossy, Artwork, Info file |

- **Label / Cat. no.** and **Release date / Original year** split the site's
  "Label (Cat #)" and "Release date (Original year)" at the LAST parenthesised
  group (`_slSplitTrailingParen()`).
- **Copies**: "I have N copies" only appears for N ≥ 2; no line means 1 (the
  site's own "Nb. of copies = 1" filter says so).
- **First date**: `_slFirstIsoDate()` turns the first date of the site's free
  text ("16-17 Sep 1967", "16 Sep 1967, 30 Sep 1967", "Sep 1967",
  "30 Sep - 1 Oct 1967", "20 Sep 1969 (early show)") into ISO, so a text sort
  is chronological. Date keeps the site's text.
- **Duration**: `integerColumns` `align: ':'`, which is what makes
  `_sortColumnKind()` sort it as a duration. The site's "–" (unknown) is written
  as MusicBrainz's **`?:??`**: `_buildSplitAlignWrap()` emits the separator even
  for a value that has none, so "–" would render as ":–". That is a latent
  quirk of the shared helper (MusicBrainz never shows it, because its unknown
  length always contains a colon) — see DEBUG-NOTES.md, 2026-10-04.

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
classes for). On SL none of it exists, so `_ensureSlStyle()` supplies a minimal
equivalent. **Every table rule is wrapped in `:where()`** so it carries almost
no specificity and any of the script's own styling (sticky header colours,
finding tints, hover, highlights) still wins. The sticky `<thead>` is offset by
`--mb-sl-navbar-h`: the site's `jquery.sticky` navbar turns `position: fixed`
once scrolled and would otherwise cover it (checked live, 2026-10-04).

## Page count and fetching need nothing

- `fetchHtml()` is a same-origin `fetch()`; SL is behind CloudFlare, and the
  browser's cookie lets same-origin requests through (the reason
  `SpringsteenCoverArtUploader` cannot fetch cross-origin, see its own notes).
- The per-page URL is `new URL(location.href)` with only `page=N` set, so every
  `f_*` filter is kept.
- `determineMaxPageFromDOM()`'s no-"Next" branch takes the highest `page=`
  link, and SL's windowed widget always ends in a "»" pointing at the LAST page
  (album/12i → 6, single → 14, aud_comp → 6; a 99-item category has no widget,
  i.e. 1 page). Checked live 2026-10-04.

## Tests

| Spec | Pins |
|---|---|
| `tests/fixtures/sl-collection.spec.js` | both pages in one table, exact headers, parsed fields (incl. a FETCHED-page card), item links, lazy thumbnails, Cat. no. text sort, Copies numeric sort, a column filter, zero MusicBrainz/CAA requests with CAA and Relationships switched back ON |
| `tests/fixtures/sl-bootlegs.spec.js` | the bootleg columns and flags, `?:??`, Duration as a duration in both directions (an `H:MM:SS` value and unknowns pinned last), First date chronological, `_slFirstIsoDate()` / `_slSplitTrailingParen()` shapes the fixtures lack |
| `tests/fixtures/sl-host.spec.js` | the gate off (page untouched, with the log line as proof the script ran), the gate on, the navigation guard, the Load from Disk round trip |
| `tests/fixtures/sl-include-regex.spec.js` | the `@include` header line |
| `tests/live/sl-lists.spec.js` (`@extended`) | real pagination: rows = the page's own "Showing items … of N" |

Fixtures are generated: `python3 scripts/build-sl-fixtures.py` splits the two
logged-out snapshots in `debug/` into two 50-card pages each, rewrites only the
pagination widget, and strips scripts, `<link>`s and inline background images.
`tests/support/slFixture.js` serves them: a catch-all ABORT for the host
registered first (thumbnails and stray subresources), page 1 at the list URL,
and a predicate route for every `page=N` fetch (a glob cannot work: the list
URL already contains `?`). Mutation list: `scripts/mutations/sl-support.json`.
