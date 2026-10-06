<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# CAA/EAA artwork

## CAA/EAA artwork — what must not break

**Single- and multi-table sorting currently works correctly for all three
artwork surfaces — inline thumbnails, the CAA/EAA columns, and the big-image
strips. Keeping it that way outranks any change that would jeopardise it.**
Every one of these mechanisms was landed to fix a real, shipped regression, and
several of them failed silently rather than loudly. If a change touches sorting,
filtering, re-rendering, or the artwork pipeline, say up front how it preserves
each of the following.

**Sorting by artwork presence** goes through **`_sortCellText()`** (declared next
to `_sortColumnKind()`), called by **both** `createSortComparator()` and
`createMultiColumnComparator()`. The single shared resolver exists because those
two have silently disagreed before. It is scoped to
`.mb-caa-sort-key`/`.mb-eaa-sort-key` **alone**, and the rule to carry forward is:
*only add a class to `_sortCellText()` if that class is also stripped from the
visible text.* Folding in `mb-cancelled-sort-key` would silently reverse the
order of a column that was never broken — a cancelled-event cell also carries the
visible word "cancelled", so its sort text is `"cancelled yes"` vs `"no"`, and
`"c" < "n"` already puts cancelled events first ascending.

For the background: `_CLEAN_STRIP_SEL` strips the artwork sentinels, and
`getCleanVisibleText()` removes them by clone-and-remove before its TreeWalker
runs. **The strip is correct and must stay** — a typed filter of `"no"` would
otherwise match `"not readable"` and the sentinel text itself. Sorting was simply
the one consumer never given a replacement for it. `.mb-eaa-sort-key` is in the
selector but never actually created; the `caa` extractor writes
`mb-caa-sort-key` for both.

**Artwork presence is filtered exclusively via the 📊 unique-values dropdown's
structure mode** ("✓ has artwork" / "✗ no artwork", `_cellMatchesStructureMode()`).
The old typed-filter sentinel bypass in `testRowMatch()` was **removed** — it made
one typed word mean two unrelated things, since `no` matched both "no artwork"
and rows whose image type genuinely contains it (e.g. `Matrix/Runout`). Do not
reintroduce it. Removing it also fixed a plain-vs-regexp inconsistency: both
bypasses lived in the NON-regexp branch, so an anchored `^no$` matched nothing
while a plain `no` matched presence. `mb-inline-art-sort-key`'s bypass was
deliberately **kept** — its `caa-inline-yes`/`caa-inline-no` values collide with
no English word.

**Inline-thumbnail presence is matched through `_inlineArtSentinelFor()`, never
the cell's own span.** `_artSetInlineSortKey()` stamps `.mb-inline-art-sort-key`
on whichever `<td>` was LIVE when the fetch settled, but `runFilter()` matches
SOURCE rows. On `tableMode: 'multi'` the live row is always a clone, so the 📊
"🖼️ front-image available" / "∅ NO front-image available" entries (and a typed
`caa-inline-yes`) filtered to **zero rows** while counting correctly; on
`tableMode: 'single'` the same happened to any thumbnail settling after the first
re-render. The settle is now also recorded in `_inlineArtSettled`, keyed
`"rowIdx:colIdx"` like `expandedCells` and reset with it, and all three readers —
the structure modes, the typed bypass and `openUniqDrop()`'s count pass — go
through the one resolver, so a count and its rows cannot disagree. Three things
not to undo:

- **Do not "fix" this by mirroring the span onto the master row** with
  `_findMasterRowByIdx()`: that is a linear scan measured at ~0.7 ms per lookup on
  4174 rows (1.9 ms at 10 000), paid once per settle — seconds of main-thread time
  on a big page. See `tests/MEASUREMENTS.org`.
  (`_artMirrorInlineThumbToSourceRow()` used to pay that per row on every
  multi-table re-render — 1479 ms at 4174 rows, 13 152 ms at 10 000. Fixed in
  the version the `// @version` header names: `_artInitInlinePics()` builds ONE
  `_buildMasterRowIndex()` per pass, lazily, and hands it to `_artResolveSourceCell()`
  as an optional argument. **Only the SYNCHRONOUS Case C1 call site may pass
  one.** The four deferred mirrors — an image `load`, a `.then()` — keep the
  scan, because a pass-scoped map is stale by the time they run, which
  `_buildMasterRowIndex()`'s own JSDoc forbids. The icon mirror
  `_artMirrorIconToSourceRow()` is deferred at both its call sites and still
  scans once per painted icon; that is the remaining half, measured as 7 of the
  14 scans a keystroke used to cost on the `releasegroup-releases` fixture.)
- **Record connected cells only, and validate the GUID on read.** A detached `<td>`
  is either a clone some later render replaced, or a single-table source cell (a
  late 404), where the span already is what the matcher reads. The GUID check
  rejects an entry written for a previous fetch that reused the `rowIdx`.
- **Drop the filter-result cache only on a CHANGE, and only the keys that can read
  what changed** — `_invalidateFilterCacheWhere()` with
  `_filterKeyReadsInlineArtSentinel()` (inline art) or
  `_filterKeyReadsArtColumn(colIdx)` (a CAA/EAA column's synced facts, from
  `_artSyncSearchTextToSourceRow()`). Case C1 re-stamps every cell with its
  existing value on every render, so an unconditional drop would empty the cache
  on every keystroke; a wholesale drop would throw away global-filter caching and
  incremental narrowing for the whole time artwork is loading.

Covered by `tests/fixtures/art-inline-uniq-filter-late-load.spec.js`, whose
isolation variants separate "never reached the source row" from "replayed a cached
row list" (the H3 sequence is both at once). Mutation list:
`scripts/mutations/art-inline-late-load.json`.

**A CAA/EAA cell's image types and comments are resolved by
`_artSearchTextFor()`, never by reading `ul.mb-caa-art-ul` directly.** The same
source-row asymmetry: `_artBuildMultiRowArtCell()` builds that `<ul>` on the
RENDERED cell, while `_artSyncSearchTextToSourceRow()` mirrors the text onto the
source `<td>` as `data-mb-art-search-sync`. A reader that knows only the `<ul>`
therefore finds nothing on every multi-table page, which is what made a PLAIN
global filter for "Booklet" match no rows while the same query with Rx ticked,
and the CAA column filter, both matched — they went through
`getCleanColumnText()`, i.e. through this resolver.
`tests/fixtures/global-filter-art-search.spec.js` pins all three paths against
each other, and its regexp/column-filter controls are what tell "the plain path
is broken" apart from "the fixture has no artwork".

**Surviving a re-render.** `renderFinalTable`/`renderGroupedTable` insert
`cloneNode(true)` copies, so live artwork has to be mirrored back onto the SOURCE
rows or it is destroyed and re-fetched on every sort and every filter keystroke:

- `_artMirrorIconToSourceRow()` copies a `background-image` VALUE onto a
  `span.caa-icon` the source row already owns (it comes from MusicBrainz's own
  markup, and inline styles survive the clone).
- `_artMirrorInlineThumbToSourceRow()` clones the whole placeholder, because an
  inline thumbnail is a NODE this script creates — on a multi-table page the
  source rows have never held one, so there is nothing to copy a value onto and
  `_stripTransientCellState()`'s `preserveLiveArt` branch had nothing to match.
- Both resolve their target via `_artResolveSourceCell()` plus
  `_findMasterRowByIdx()`. The latter is required because merged view folds other
  groups' rows into the first-occurrence table, so a group-index lookup misses
  exactly those rows.
- The receiving halves are `_stripTransientCellState()`'s `preserveLiveArt`
  branch and `_artInitInlinePics()`'s Case C1 (hover + bigbox re-wired, live
  image kept, nothing re-resolved).

**Scoped sub-table sort.** `_renderDirtyGroupIdxs` (a `Set`, or `null` meaning
"render everything", which is what every non-sort entry into `runFilter()` sees),
`_invalidateFilterCacheForGroups()` and `_sortDirtyGroupIdxs()`. Sorting one
sub-table now re-renders only that group. Two consequences bind any new test:

- **Artwork in an untouched sub-table is never re-inserted**, so it cannot appear
  in an insertion-time tally. Compare against the SORTED sub-table's own counts,
  never a page-wide count. Getting this wrong is how one spec silently became
  `1 of 1` in three views and `0 of 0` in a fourth — passing, proving nothing.
- **The colon-alignment finalizers are deliberately skipped on a scoped pass.**
  They measure one shared width across the whole rendered row set; a re-order
  does not change that set, and running them with the undisturbed groups emptied
  would narrow every column to what the sorted sub-table alone needs.

The cache drop is by group index across ALL `discographyViewState` values (the
key is `m:<view>:<groupIdx>`), or a pre-sort ordering cached under another view
comes back on the next switch.

**Big-image strips** are `#mb-caa-toggle-btn-global` /
`#mb-eaa-toggle-btn-global`, with per-section `#mb-caa-toggle-btn-{i}` and
retry buttons at `#mb-caa-toggle-btn-retry-{i}`.
`sa_caa_pics_initially_collapsed` defaults **true**, so they load nothing until
toggled — see the testing section for why that matters to every artwork test.

**Those ids are constructed, not literal — grepping for them in the userscript
finds only JSDoc.** They are `ctx.btnPrefix + '-global'`, where `btnPrefix` is
`'mb-caa-toggle-btn'` on `CAA_CTX` and `'mb-eaa-toggle-btn'` on `EAA_CTX`. To
find the code, grep `btnPrefix`. This is the same trap as the `caa`/`eaa` debug
channels (see that section): a real, stable identifier that no string search for
its full name will locate.

## The artwork summary panel (zone 2)

`org/503-handling.org`'s "zone 2 opens an artwork summary for the table".
`_artCollectSummary()` + `_artRenderSummary()`, opened by
`#mb-caa-toggle-btn-summary-{i}`.

- **It costs ZERO requests.** `_artEnrichIcon()` Tier 3 stores `json.images`
  verbatim in `ctx.imagesCache`, so the whole archive record — `edit`,
  `front`/`back` and the thumbnail ladder — is already there. **There is no
  `release` field**, whatever the archive's documentation says: probed
  2026-09-20 (`scripts/probe-caa-release-group-release-field.py`), a
  release-group lookup returns the same nine keys a release lookup does. The archive has no batch endpoint, so anything the
  panel could not answer from that cache would be one request per entity, which
  is the cost the whole 503 file exists to reduce. **Do not add a request to
  enrich this.**
- **`img.front` is NOT `types.includes('Front')`.** An image can be typed Front
  without being the archive's chosen main front, and that distinction is
  invisible everywhere else in the script. The fixture makes the two disagree on
  purpose, and there is a mutation for conflating them.
- **It must open MID-LOAD, gated on nothing.** `_showCaaCompletionToast()` fires
  on the `_caaQueue`'s `onIdle`, and CLAUDE.md records that on a large listing it
  never fires at all — so a panel gated the same way is useless on exactly the
  pages that motivated it. There is a mutation that adds such a gate.
- **"pending" must say WHY it is pending.** `initCaaPics()`'s Pass 2 enqueues
  every JSON lookup BEHIND every image fetch on the page, deliberately, so
  icons and strips paint first. On a 2144-row discography that is half an hour
  before the first lookup runs — diagnosed from `debug/bs-debug.html`
  (2026-09-20), where not one of 2144 art anchors carried `data-caa-enriched`.
  The count was literally true and read as stuck, which is how it was reported
  as a bug. The panel now shows the queue depth alongside it.
- **It does not reuse `_caaFetchStats`.** Those are PAGE-WIDE tallies; this is
  per table and does its own pass.
- **The scope is declared, not implied.** `runFilter()` REMOVES non-matching
  rows, so the tally is of what is SHOWN. The design's trap 2 asks for a walk
  over source rows instead; that needs a table → source-rows mapping this file
  calls unreliable, so the panel says "a filter is active" in its own header
  instead of quietly reporting a subset as the whole table. That is the org's
  own second option, chosen knowingly.
- **Driven from `ctx`, never the string "CAA"** — `ctx.column` is `'CAA'` or
  `'EAA'`, so the same panel serves event art without mislabelling it.
- **A separate sibling button, not the count badge.** The design drew the count
  as the opener; a click target inside the toggle `<button>` would be a nested
  interactive element (its own trap 3), and `.mb-caa-toggle-count` is located by
  two specs and read by `_artRetryTable()`'s badge arithmetic.
- Entity paths are **deduped**: the sticky-column duplicate of a row carries the
  same art anchor, and a release-group breadcrumb can repeat one.
- **The opener re-anchors on EVERY pass, never "already exists, bail".**
  `.mb-row-count-stat` is removed and re-created whenever the count changes,
  i.e. on every filter, and is re-inserted relative to the master toggle or
  (single-table) the filter container. `_artCreateOrUpdateToggleButton()` copes
  because it re-derives its position from the LIVE stat every call —
  `countStat.after(btn)` runs whether or not the button existed — and ⟳ and 🔗⟳
  chain off it. A control that bails out on "already exists" opts out of that
  and gets stranded: reported live on an artist-releases page with the opener
  sitting between the heading text and the stat while the rest of the run moved
  on. `_artCreateOrUpdateRetryButton()` therefore calls
  `_artCreateSummaryButton()` on BOTH paths, before its own early return.
  Pinned by `tests/fixtures/caa-summary-button-position.spec.js`, which asserts
  ORDER — the button never disappeared, so an existence check passed throughout
  the bug. **Single-table only:** on a multi-table page the per-table controls
  live in an `<h3>` that carries no row-count stat, which is why the panel's own
  spec (releasegroup-releases) never saw this.

Covered by `tests/fixtures/caa-artwork-summary.spec.js`; mutation list
`scripts/mutations/caa-artwork-summary.json`, with one honest `expect: "pass"`
for the dedup (this fixture has no sticky duplicate reaching an art anchor).
There is no "Cover sourced from" group: it was built from the archive's
documented `release` field, shipped untested because the fixture could not
exercise it, and removed once a probe showed the field does not exist. **A
group nothing could test was a group nothing had checked** — that is the
transferable part.

## CAA/EAA retry: the transient-failure record that unblocked it

`org/503-handling.org` F7, CAA half — blocked until `ctx.failedCache` existed.

**After F5, `ctx.countCache` holds `0` for both "the archive has no artwork" (a
404) and "the request failed" (a 503).** F5 kept the in-memory zero for both on
purpose: dropping it would re-fire one request per failed entity on every
keystroke and every sort. So the zero stays, and `ctx.failedCache` — a
session-scoped `Set` of entity paths per archive, written in `_artEnrichIcon()`'s
Tier 3 where F5 decided not to persist — records WHY it is there.

- **Never persisted**, exactly like the zero it annotates. A transport failure is
  not a fact about the release; that is the whole of F5.
- **Keyed by entity path, not by DOM.** `runFilter()` REMOVES non-matching rows,
  so anything derived from the live table loses exactly the failures a filter is
  hiding. The Relationships half had to read the captured source rows to get this
  property; here it is structural.
- **Only a NON-definitive status is recorded.** A 404 is the commonest answer the
  archive gives; recording it too would put a `⚠⟳` carrying a large number on
  almost every page, which is the same as no signal at all.
- **The network-error branch records too, and is the only place the success-path
  clear is observable.** A thrown request caches no zero, so an ordinary
  re-render retries the entity and the success arm is what removes the record.
  The failed-only retry path cannot show it — that one empties the set up front.
- **`_artRetryFailedAll()` clears the record BEFORE re-enriching**, because
  `_artEnrichIcon()` re-adds anything that fails again; clearing afterwards would
  wipe the fresh record and claim everything recovered.
- **It must delete the cached zero**, or Tier 1 serves it straight back and no
  request is made — the same defect F5 fixed one layer down, where
  `_artRetryTable()` cleared the session caches but not the IDB record.
- **Nothing is evicted from IDB here.** A transient failure was never written
  there (that IS F5), so there is nothing to evict, and clearing would throw away
  good records for entities that merely share the table.

**What this does NOT touch**, per the CAA/EAA section's standing requirement: no
sort key is rewritten, no source-row mirror is re-resolved, no strip is rebuilt
and no image is cache-busted. A metadata failure means the JSON never arrived, so
recovery is "clear the zero, drop the `enriched` marker, re-run
`_artEnrichIcon()`" — and `_artEnrichTable()` is the same entry point an ordinary
render uses. `_artRetryTable()` keeps its full eight-step rebuild for the
stale-artwork case.

**The refresh IS hooked per-frame here, unlike the Relationships one.** The count
is `Set.size`, not a DOM walk, so `_artScheduleFailedBtnRefresh()` costs nothing;
`_relFailedMbidsPageWide()` walks every captured source row, which is why its
equivalent hook was removed.

Covered by `tests/fixtures/caa-retry-failed-only.spec.js`; mutation list
`scripts/mutations/caa-retry-failed-only.json`, carrying one honest
`expect: "pass"` — the membership test in the anchor loop is an EFFICIENCY guard,
not the correctness one, since re-arming an anchor whose entity is still cached
produces no request. `__saTest.artFailedPaths(which)` exists because the set has
no DOM surface once a filter has removed its rows, and because the 404/503
distinction is invisible on screen: both render as a release with no artwork.

## Release page Cover art section and the viewer

`org/CAA-release-tracks-handling.org` (mockups R1, R4, R5). On release-tracks,
after "Show all Tracks for Release", `_releaseArtInsertSection()` puts a
"Cover art (N)" h2 + `div.mb-release-art-sec` before `h2.tracklist` in
`startFetchingProcess()`'s render tail, BEFORE `makeH2sCollapsible()`, and opens
it after. Setting `sa_enable_release_tracks_cover_art` (forced off in
`FIXTURE_SETTINGS_OVERRIDE`).

**The event page has the same section** ("Event art (N)", pageType
`event-overview`, `org/event-overview-pt.org`). Everything that differs lives in
`_artSectionDesc('caa'|'eaa')` — context, setting, tab setting, entity regex,
anchor, label, archive name, title selector, layouts, layout GM key — and every
handler resolves it from the section's `data-mb-art-ctx` (`_artSectionOf(sec)`),
never from a hard-coded `CAA_CTX`. Rules that come with that:
- **A function, not a `const` table**: it is reachable from code that can run
  before its line is evaluated, and it names `CAA_CTX`/`EAA_CTX`, declared
  further down.
- **The `.mb-release-art-*` classes stay on both pages** — specs and mutation
  lists key on them; read them as "the art section".
- **Release-only**: Spreads (only the CAA descriptor lists `'spreads'`) and the
  Medium art (gated on the release-tracks pageType).
- **Event art records have no `back` key** (probed 2026-10-06,
  `scripts/probe-caa-release-images.py --event`), and their URLs are already
  `https:`. The viewer prints "Main back" only when the flag exists.
- **The viewer's title is the h1's entity LINK text** (`_releaseArtTitle()`):
  after a render the h1 also holds the script's toolbar.
- Setting `sa_event_overview_event_art` is forced off in
  `FIXTURE_SETTINGS_OVERRIDE` too; `sa_event_overview_art_tab` gates the tab
  click (the release page's tab click has no setting).

- **One record, one cache.** `_artFetchEntityImages(ctx, entityPath)` is the
  table-free copy of `_artEnrichIcon()`'s three tiers with the same 404 vs
  429/5xx bookkeeping, so the section and the CAA column share
  `ctx.imagesCache` and the IDB `metadata` store. `_artEnrichIcon()` is not yet
  rewired onto it (it is on the table render path — a separate, mutation-checked
  step). The viewer reads `ctx.imagesCache` and makes NO request of its own.
- **The ★ reads `front`**, never the Front type — same rule as the summary panel.
- **Older records carry only `small`/`large` thumbnails** (probed 2026-10-06);
  every URL picker falls back to them. Every archive URL is `http:` and is
  stripped to `//`.
- **The section is not a table.** Never cloned, so its one click listener on
  the section survives every re-render; the hover card is `data-mbtt` on each
  tile, shown by the shared tooltip engine (positioning, clamping and the tap
  guard come free). The string has no whitespace between tags:
  `#mb-stat-tooltip` is `white-space: pre-wrap`.
- **Tiles must survive a failed thumbnail.** A 404 `<img>` renders alt text and
  ignores `aspect-ratio`; the link box is the square and clips. The sheet is
  capped at `calc(100vw - 32px)` because the tracklist container can be
  thousands of px wide.
- **The viewer owns every key while open, from `window` capture.** Everything
  else that listens for keys does so on `document` (Ctrl+M,
  `initKeyboardShortcuts()`, the navigation guard's Tab trap, the VZ_MBLibrary
  dialogs), so a window-capture listener with `stopImmediatePropagation()` runs
  first and stops them all; it also traps Tab itself. Registered on open,
  removed on close. Viewer keys act only without Ctrl/Cmd/Alt, so browser
  shortcuts keep their default.
- **The tab click is intercepted on `window` capture too.** After a render,
  `initNavigationGuard()`'s anchor guard (document capture) asks "leave this
  page?" for any link to another path — before any handler further down could
  act. Plain left click only; Ctrl/Cmd/Shift/Alt/middle clicks and a click
  while nothing is loaded go their normal way (including that confirm).
- **Spreads (R6) pairs only when unambiguous.** `_releaseArtFindSpreads()`
  keys on FIRST type + the comment before a final "left"/"right"; a key with
  two lefts or two rights pairs nothing. `_releaseArtSpreadsPlan()` is the one
  source of the layout's order (pairs, then every Liner/Booklet page, then the
  rest), used by both the render and the viewer.
- **The viewer's list is `_releaseArtViewerOrder(sec)`, not the tiles on
  screen.** In Spreads the pager hides all but two Liner pages, so collecting
  the visible tiles (right for Grid / By type) would drop the rest from the
  viewer. The pager index lives on the section (`data-mb-art-book-page`) and is
  clamped and written back by the render; a chip or layout switch resets it.
- **Medium art in the medium h3s (R7) never guesses.**
  `_releaseArtMediumAssign()` is pure and assigns in this order: one medium
  takes every Medium image; a comment naming exactly one EXISTING medium
  ("disc/CD/LP/DVD/medium/vinyl/record N", or "side X" only when every medium
  is two-sided) assigns it; archive order only when NO Medium image has a
  comment and the counts are equal — an unreadable comment ("disc two") is not
  "no comment". Everything else lands in one `.mb-medium-art-note` on the first
  medium's h3. Setting `sa_enable_release_tracks_medium_art` (default on,
  inert without the section).
- **A thumb in a medium h3 is a `<button>` whose `<img>` has
  `pointer-events: none`.** The h3's collapse handler (in `renderGroupedTable()`)
  exempts a click only by `e.target.tagName` (A, BUTTON, INPUT, …) and stops
  propagation otherwise: with the IMG as target, a click collapses the medium
  and the delegated viewer listener on `document` never sees it.
- **`_releaseArtApplyMediumArt()` rides `updateFilterButtonsVisibility()`**
  (beside `_updateMediumEventBadges()`), and runs once more when the record
  arrives. It reads `CAA_CTX.imagesCache` only, memoises the assignment per
  images array, and skips an h3 whose `data-mb-art-key` already matches: a
  filter pass costs a query per medium.

Covered by `release-tracks-cover-art.spec.js`, `release-tracks-cover-art-viewer.spec.js`,
`release-tracks-cover-art-spreads.spec.js`, `release-tracks-medium-art.spec.js`
and `release-tracks-cover-art.mobile.spec.js`; mutation lists
`release-tracks-cover-art.json`, `-p2.json`, `-p3.json` and `-p4.json`. The
event page: `event-overview-art.spec.js`, `event-overview-art.mobile.spec.js`,
mutation list `event-overview.json`.

## The CAA/EAA column redesign: tiles, chips, cards, the column viewer

`org/redesign-CAA-EAA-column.org` (A2, B1/B2, C1/C2, D1; decided 2026-10-06).
Grep `// ── CAA/EAA column redesign` for the code. Rules that fail silently:

- **The tiles ARE the image `<li>`s.** Grid and grouped are pure CSS on
  `html[data-mb-art-layout]` (`_artApplyCellLayout()`), so
  `.mb-caa-type-badge > span`, `.mb-caa-art-comment`, `_findCellListItems()`,
  the collapse machinery, the has-match tint and `_artHighlightImageLi()` see
  the same markup in every layout. A switch rebuilds nothing. **Never add a
  header `<li>`** for the grouped layout: `_findCellListItems()` and the art
  sync attributes count `:scope > li`. Group headers are
  `data-mb-art-grp-hdr` drawn by `::before`, the order a `--mb-art-gorder`
  custom property (both stamped by `_artDecorateArtCell()`, both branches of
  `_artBuildMultiRowArtCell()`).
- **The grid applies only while the cell is expanded**: the selector is
  `ul.mb-caa-art-ul:has(> li.mb-caa-art-li-image:not([style*="display: none"]))`.
  Expansion is inline `display` set by several paths, so this reads the
  outcome rather than one button's state. Without it every collapsed cell
  takes the grid's fixed width.
- **The type pill is `.mb-caa-type-pill`, not an inline style** — the tile
  layouts restyle it, and an inline style always wins.
- **Chip letters and group headers are CSS content, never text.** A chip with
  a text node would put "Bk"/"Sp" into `getCleanColumnText()`.
  `.mb-caa-type-chips` is in `_CLEAN_STRIP_SEL` as a second line of defence.
  The vocabulary comes from the ctx (`_artChipTypes()`: `sa_caa_chip_types` /
  `sa_eaa_chip_types`), and is also the grouped layout's group order.
- **Cards are `[data-mbtt-fn]`, resolved at hover time** by `_mbttResolve()`
  inside `_initStatTooltip()`: `art-sum` (B1, on the icon, its anchor and the
  count) and `art-img` (B2, on the image `<li>`; replaces
  `_artWireImageLi()`'s two boxes while `sa_caa_tip_image` is on). Built at
  hover time so they read the cache and the active filter as they are NOW;
  the attribute survives `cloneNode(true)`. **Filter marks are copied, not
  recomputed**: `_artCardCopy()` clones the cell's own pill/comment nodes,
  which `_artHighlightImageLi()` already marked — the viewer's info panel does
  the same through `opts.liFor`. A second highlight path would drift.
- **The column click listens on `window` capture**, like the tab click above:
  the icon is a link and the navigation guard's document-capture listener
  would ask "leave the page?" first. Tile and ▦ clicks go the same way; ▦ in
  capture also keeps a header click from sorting. A plain left click only.
- **The viewer steps the VISIBLE rows** (`_artColumnViewerRows()`: the live
  tbody, which `runFilter()` empties of rejected rows) with art in the cache,
  wrapping. `_artViewerStep()` crosses into the next row at either end only
  when `opts.onGroupStep` is given and `sa_art_viewer_cross_rows` is on; the
  release/event sections pass none and keep wrapping.
- **Old records**: `_artViewerBigUrls()` derives `-1200.jpg` from a `-500.jpg`
  `large` (probe: served, HEAD 200) and `_artViewerLoadFirst()` falls back to
  `large`. Register a spec's 404 route BEFORE the viewer opens — it preloads
  the neighbours, and a file the browser already has never fails.
- **The artwork findings are the first on async data** — see
  docs/claude/findings.md.
- **Fixtures**: `span.caa-icon` is 0×0 without MusicBrainz's (scrubbed)
  stylesheet; `tests/support/caaColumnFixture.js` adds the size so it can be
  hovered and clicked. Column filter inputs are read-only until a trusted
  interaction: click, then `pressSequentially`; clear with ✕.

Covered by `caa-column-redesign.spec.js`, `caa-column-redesign.mobile.spec.js`
(setup in `tests/support/caaColumnFixture.js`); mutation list
`caa-column-redesign.json`. `caa-col-hdr-deferred-visibility.spec.js` pins the
old preview + type box with `sa_caa_tip_image` off.

**The CAA/EAA column's ▶N▤ is a proxy owned by the art code**
(`_artEnsureColCollapseProxy()`), not `initCollapsableColumns()`'s button:
that pass runs before any art cell exists, and art cells have no
`.mb-cell-collapse-toggle` to drive. The proxy forwards to ▶🖼's ▶ and mirrors
its state; its count class is `.mb-art-col-collapse-count` so
`_updateAllColHeaderCounts()`'s per-row-set cache cannot overwrite it; the
h2/h3 expand-all controls skip it through `_COLLAPSE_HDR_BTN_SEL` (expanding
every art cell would load every thumbnail). **li-0 must wrap**: the first
render's prose marker div holds the icon, hint and count, and as a shrinkable
flex item beside the chips it collapsed to the icon's width.
