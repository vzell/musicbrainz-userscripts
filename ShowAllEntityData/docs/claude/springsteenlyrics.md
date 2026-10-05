<!-- Written on branch sl-support (org/springsteenlyrics.org), extended on feature/sl-all-categories. This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# springsteenlyrics.com: the one non-MusicBrainz host

ShowAllEntityData also runs on springsteenlyrics.com's paginated list pages —
the **collection** (`collection.php?cmd=list…`) and the **bootleg** lists
(`bootlegs.php?cmd=list…`), every category and every `f_*` filter — as the
pageTypes `sl-collection` and `sl-bootlegs`, and on the collection's entry
page `collection.php` ("Latest additions", every item, `pg=` pagination) as
`sl-collection-intro`. It is **opt-in**:
`sa_enable_springsteenlyrics`, default **off**. Only what each list card shows
is used; no item detail page is fetched. The bootleg landing page
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

Three places read `_isSlHost` after that, and each says why:

| Where                                | Why                                                                                                                                           |
|--------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| the `pageDefinitions` detection loop | `if (Boolean(def.host) !== _isSlHost) continue;` — a definition with a `host` belongs to that site alone, and on SL only those are considered |
| `performClutterCleanup()`            | every target is MusicBrainz furniture; some removals (any `<details>` with >5 images, any 700px div) would hit unrelated content              |
| `initNavigationGuard()`              | every SL page is one PHP script told apart by its query string, so there only a HASH-only change is "the same page"                           |

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

## The compact category/filter bar — `_slInstallScopeBar()`

Behind its own setting, `sa_sl_compact_nav` (default **off**; needs
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
`f_nbcopies`/`f_multi` → Copies. **Format does not map**: the site's codes and
chip labels (`12i`, `12" vinyl`) are not the cells' free text (`LP`, `2xLP`,
`4x12" + 7"`). It joins once the formats glossary maps codes to cell text.
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
- **`body.mb-sa-sl-nav-only` hides `#mb-button-divider-initial`, 📦 Data and 🛠
  View**: with no table they act on nothing, and the divider would open a
  toolbar with no fetch button. ⚙️ and ❓ stay.

Nothing is recorded there: `_slRecordListCount()` needs `cmd=list`, and the
Statistics counts are not read (decided 2026-10-05: they drift from the lists'
own totals). "Show all bootlegs" (every category into one table, about 7,300
rows from about 82 pages) was offered as a further level and deliberately left
out.

The fixture `sl-bootlegs-intro-page1.html` is generated from
`debug/sl-bootleg.html` through `build-sl-fixtures.py`'s `PLAIN_TARGETS`: the
same sanitising (shared `sanitise()`), no splitting. Re-running the script
leaves the other fixtures byte-identical.

## Tests

| Spec                                        | Pins                                                                                                                                                                                                                                                |
|---------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/sl-collection.spec.js`      | both pages in one table, exact headers, parsed fields (incl. a FETCHED-page card), item links, lazy thumbnails, Cat. no. text sort, Copies numeric sort, a column filter, zero MusicBrainz/CAA requests with CAA and Relationships switched back ON |
| `tests/fixtures/sl-bootlegs.spec.js`        | the bootleg columns and flags, `?:??`, Duration as a duration in both directions (an `H:MM:SS` value and unknowns pinned last), First date chronological, `_slFirstIsoDate()` / `_slSplitTrailingParen()` shapes the fixtures lack                  |
| `tests/fixtures/sl-host.spec.js`            | the gate off (page untouched, with the log line as proof the script ran), the gate on, the navigation guard, the Load from Disk round trip                                                                                                          |
| `tests/fixtures/sl-collection-intro.spec.js` | the stray-`</div>` shape (asserted present first): entry page in two `pg=` pages, opened on `?pg=2`; sampler as one widget-less page; the `<h1>` reads the list heading                                                                          |
| `tests/fixtures/sl-sticky-headers.spec.js`  | album, sampler, memorabilia: breadcrumb, `<h1>`, category buttons, list `<h2>` (and the year filter) keep their left edge and stay in the window; Title docks at the table's left. Each shape again with the compact bar on, the bar in place of the walls, plus a bootleg list (with `.col-md-12` CSS) |
| `tests/fixtures/sl-scope-bar.spec.js`       | the compact bar: off by default changes nothing; one menu per wall whose entries ARE the wall's links; walls hidden, not removed; the room above the list shrinks; choices keep the other filters and drop the page; category change drops the album; chips; Year range from the slider or the fallback; search, arrows, Escape, outside press; Enter navigates. Bootlegs: one Category menu, forms untouched; counts recorded for whole categories only (not a filtered list, not a search) and shown; the era timeline (one bar per era, chronological, width by span, height per year, unknown dashed); a search page labelled by its heading, a category change dropping the search. Search box: Auto reads five date forms and falls back to titles, slash dates stay text; impossible days and non-dates in Date mode disable Search with a reason; partial dates link their era and a title search; a hand-picked field; Enter navigates; a result page prefills the box; Recent moves a repeat to the front, keeps eight, forgets on request; no box on collection pages. After the fetch: Country, Year and Copies narrow the loaded table to the rows computed from it, no reload, chips and button follow both ways (incl. the column ✕), two table chips clear in place, Format and Category still navigate with their note, a filter carried in the URL still reloads, nothing-in-range shows an empty table; a pull-down opened low fits the window. Landing page: bar off leaves it untouched (no heading, toolbar or class, no error); bar on gives Category ("Choose a list"), search box and Recent, forms and buttons hidden, no fetch button, Data/View hidden, Statistics kept and not recorded; its Category menu has the era timeline with nothing current; its search box searches. Mutations: `scripts/mutations/sl-scope-bar.json` |
| `tests/fixtures/sl-include-regex.spec.js`   | the `@include` header lines                                                                                                                                                                                                                         |
| `tests/live/sl-lists.spec.js` (`@extended`) | real pagination: rows = the page's own "Showing items … of N" (album/12i, book, the entry page, aud_live1967); Sticky Page Headers under the site's real CSS                                                                                       |

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
