# ShowAllEntityData Userscript — Claude Code Guide

## Project overview

`ShowAllEntityData.user.js` is a large single-file Tampermonkey userscript for
MusicBrainz. It consolidates paginated and non-paginated entity table lists into
a single view with real-time multi-column filtering and sorting.

Read the current version from the `// @version` line of the `==UserScript==`
header, and the current size with `wc -l`/`wc -c` — never quote either from
memory or from this file. Same for the changelog: the newest entry in
`ShowAllEntityData_CHANGELOG.json` is the authority on what shipped.

**Changelog:** `ShowAllEntityData_CHANGELOG.json` (JSON, lives alongside the script)
**Help:** `ShowAllEntityData_HELP.md` (MARKDOWN, lives alongside the script — it
is what the ❓ button opens on GitHub; see docs/claude/toolbar-and-header-ui.md)
**Library dependency:** `VZ_MBLibrary.user.js` (external `@require`; provides `Lib.*`)
**External dependencies:** `iro` (colour picker), `pako` (compression)
**Other top-level docs:** `PERFORMANCE.org` (measurements + numbered Steps),
`PAGETYPES-TESTING-REFERENCE.org` (every pageType, its URL, its coverage plan),
`DEBUG-NOTES.md` (dated root-cause log), `REFACTORING.org`, `FORUM.org`

## Scope: one table engine, MusicBrainz first

**The engine is source-agnostic.** Display, sorting, filtering, the 📊
dropdown, column extraction and the rest work the same way whatever shape the
data arrived in: a single native table, several grouped tables, or no table at
all. Non-tabular sources (lists, cards, record pages) are turned into ordinary
`table.tbl` rows at DOM pre-processing time (`applyListToTable`,
`applySlCardsToTable()`, `applyJlListToTable()`, `applyBsRecordsToTable()`,
…), and from there they go through the unchanged pipeline. So supporting a new
source means writing a converter plus a `pageDefinitions` entry. It never means
a parallel render, filter or sort path. If a feature only works for one source
shape, treat that as a bug in the converter, not as something the engine needs
a special case for.

**MusicBrainz is the primary product; every other site is an add-on.**
Besides musicbrainz.org the script supports a growing set of Bruce
Springsteen sites (springsteenlyrics.com, jungleland.it, brucespringsteen.it,
brucebase.wikidot.com; others are planned). The rules for each new one:

- **Nothing may change for MusicBrainz.** Its behaviour, output and
  performance stay the same. When a foreign-site change touches shared code
  (the pipeline, the detection loop, shared CSS, settings), prove MusicBrainz
  is unaffected with the MusicBrainz fixture suite, not just the new site's
  specs. When in doubt, add a host-scoped branch instead of generalising
  shared behaviour.
- **Opt-in, off by default.** Each site gets its own `sa_enable_<site>`
  checkbox with `default: false`. Its gate exits before anything visible
  happens on that host, and its `pageDefinitions` entries carry `host:` so
  that `_foreignHost` keeps them out of MusicBrainz detection, and keeps
  MusicBrainz definitions out of the foreign site's detection.
- **Own topic doc.** Each site gets a `docs/claude/<site>.md` and a row in the
  doc map below.

## Abbreviations used in prompts

When a prompt uses one of these abbreviations, read it with the full meaning
and context below.

| Abbreviation | Meaning                                        | Context                                                                        | Example translation                                                        |
|--------------|------------------------------------------------|--------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| UVD          | column specific unique value drop-down menu    | typically used in the context of the "uniq-dropdown-section" skill             |                                                                            |
| A            | MusicBrainz "Artist" entity                    | https://musicbrainz.org/doc/MusicBrainz_Entity                                 | The A RG => The artist release group                                       |
| RG           | MusicBrainz "Release Group" entity             | "                                                                              |                                                                            |
| R            | MusicBrainz "Release" entity                   | "                                                                              |                                                                            |
| REC          | MusicBrainz "Recording" entity                 | "                                                                              |                                                                            |
| W            | MusicBrainz "Work" entity                      | "                                                                              |                                                                            |
| L            | MusicBrainz "Label" entity                     | "                                                                              |                                                                            |
| E            | MusicBrainz "Event" entity                     | "                                                                              |                                                                            |
| S            | MusicBrainz "Series" entity                    | "                                                                              |                                                                            |
| ARE          | MusicBrainz "Area" entity                      | "                                                                              |                                                                            |
| P            | MusicBrainz "Place" entity                     | "                                                                              |                                                                            |
| I            | MusicBrainz "Instrument" entity                | "                                                                              |                                                                            |
| PT           | pageType(s)                                    | const pageDefinitions                                                          |                                                                            |
| GF           | global filter for single/multi-table pageTypes | <span id="mb-global-filter-wrapper"                                            |                                                                            |
| STF          | sub-table filter on multi-table pageTypes      | <span class="mb-subtable-filter-wrapper">                                      |                                                                            |
| CF           | column specific filter                         | <span class="mb-col-filter-wrapper mb-col-modes">                              |                                                                            |
| T            | table                                          |                                                                                |                                                                            |
| ST           | sub-table                                      |                                                                                |                                                                            |
| C            | column                                         |                                                                                | In the "Title" C of ST "1-CD" => In the "title" column of sub-table "1-CD" |
| AR           | advanced relationship                          | the release-tracks AR columns, _findAllArDts(), the split-ar-peer-column skill |                                                                            |
| ETI          | extra title information                        | https://musicbrainz.org/doc/Style/Titles#Extra_title_information               | "(single version)" in "I Believe in Your Sweet Love (single version)"      |
| IP           | initial page                                   | raw HTML on the initial page                                                   |                                                                            |
| FRP          |                                                | raw HTML on the final rendered page                                            |                                                                            |

## Doc map — what to read, and when

This file is deliberately the short version. Per-feature design rationale lives
in `docs/claude/`, split out of this file **verbatim** on 2026-09-27 with every
section heading unchanged (userscript comments and skills cite headings by
name, so `grep -rn "<heading text>" docs/claude/` finds them). **Read the topic
file BEFORE changing code in its area** — each one records rules that fail
silently when broken. Plain paths, not imports: nothing below is in context
until you open it.

| Read (under `docs/claude/`)                | When you touch                                                                                            | The one rule to carry even if you do not open it                                                                                                                                  |
|--------------------------------------------|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `fetch-and-render-pipeline.md`             | `startFetchingProcess()`, resume, heading pre-processing, `user/*/tags`, WS/2 retries, partial fetches    | A second press RELOADS (only `_isResume` re-enters); only a SUCCESSFUL WS/2 answer is cached; a short fetch goes through `_fetchIncompleteSummary()`                              |
| `artwork-caa-eaa.md`                       | CAA/EAA columns, inline thumbnails, big-image strips, artwork sorting/filtering, retry, summary panel     | Sorting/filtering by artwork keep working — presence sort goes through `_sortCellText()`; the summary panel makes ZERO requests                                                   |
| `filter-and-cache-invariants.md`           | Anything that writes cell text after render, `collapsableColumns`, highlights, `colFilters`               | Post-render cell writes owe FOUR things (uniq cache, `_filterResultCache`, `_rowTextCache` on the SOURCE row, re-run `runFilter()`); `colFilters` can hold two entries per column |
| `deferred-columns-picard-relationships.md` | Picard column, Relationships column (load states, retry, batching, auto-retry)                            | Never remove the deferred column's `<td>`; write to master rows too (multi-table clones); the auto-retry is bounded four ways                                                     |
| `release-tracks-and-length.md`             | `release-tracks` AR columns, `treleases`/Length precision, ⏱ millisecond toggle, length-mismatch flags    | AR finders use `.filter()`, never `.find()`; `_findAllArDts()` stays `:scope > dl.ars > dt`; ask `_isJesus2099Treleases()`, never the bare class                                  |
| `uniq-dropdown.md`                         | 📊 dropdown sections/entries (`SYN_SECTION_META`), flag icons in entries                                  | A new section = `SYN_SECTION_META` + the two lookup tables; a real flag goes AFTER the label, never in the marker slot                                                            |
| `findings.md`                              | ⚠️ WARNING / ❌ ERROR h1 menus, `FINDINGS`, `stampFindings()`, the generic cell tint, `_findingRowFilter`  | A new finding = one `FINDINGS` entry; its `test()` reads SOURCE-row data, never render-tail decoration; the tally memo needs the stamp generation                                 |
| `toolbar-and-header-ui.md`                 | Column-header buttons, h1 toolbar menus, h2/h3 button runs, ❓ help, column resize                        | Extend the shared CSS selector lists, never copy a block; NO backtick in a `GM_addStyle` comment; menus ADOPT existing buttons, activate via `_toolbarInvoke()`                   |
| `settings-and-config.md`                   | `configSchema`, `default:` changes, settings dialog, config export/import                                 | See the digest below; full text has the migration and workspace-export rules                                                                                                      |
| `testing-playwright.md`                    | Writing/running specs, fixtures, live specs, harness helpers                                              | See the digest below; full text has the CAA/EAA and threshold-dialog traps                                                                                                        |
| `performance-rules.md`                     | Anything on the filter/sort/render/artwork hot path, measurements                                         | See the digest below; full text has the baselines                                                                                                                                 |
| `springsteenlyrics.md`                     | springsteenlyrics.com: `_isSlHost`, the `sl-*` pageTypes, `applySlCardsToTable()`, `_ensureSlStyle()`     | The opt-in gate exits before anything visible; the converter runs in THREE places (live, fetched, disk load); find the list from its cards, never via `.project-detail`           |
| `jungleland.md`                            | jungleland.it: `_isJlHost`, `_foreignHost`, `jl-list`, `applyJlListToTable()`, the shared table CSS       | Only list.htm as its own tab (a frame gate, no `@noframes`); `_foreignHost` names WHICH host; the table CSS is shared — extend its `:is()` list                                   |
| `brucespringsteen.md`                      | brucespringsteen.it: `_isBsHost`, `bs-records` (two buttons), `applyBsRecordsToTable()`                   | Rows come from the FETCHED page (button params); the live page gets an empty table; own tab only; the server sends UTF-8                                                          |
| `brucebase.md`                             | brucebase.wikidot.com: `_isBbHost`, `bb-songs`, `applyBbSongsToTable()`, the letter tabview; `bb-year`, `bb-home`, `applyBbYearToTable()`, `pageKeys.pathRe`, the side bar (`_bbArrangeSideBar()`) | Read ONLY the `=- … -=` tabview (a second one links songs too); one row per song (Alt. repeats); the toolbar `<h1>` is injected, not the wiki's own. Year pages: an entry opens at a paragraph that is one date-led `<strong>`, never at the anchor; set vs description by content; `00` dates are normalised in the converter, never in `dateParts` |
| `detail-pages.md`                          | The popup engine (card + dialog): `_popSources()`, `_DP_SITES` and the `_dpParse*()` parsers, the release page's release-group sources, the MusicBrainz entity cards (`_mbEntitySource()`, `_MB_KINDS`, `_mbWsLoad()`, `sa_pop_mb`), links to other sites (`_extSource()`, `_extFetch()`, `sa_pop_ext`), MusicBrainz URL entities (the `url` kind, `_extMbQuery()`), the Wikipedia/Wikidata/Discogs readers (`_EXT_READERS`, `sa_pop_ext_discogs_token`), the Springsteen sites across hosts and the Brucebase date anchor (`_extDpLoad()`, `_extBbYear()`), external links ON those sites (`_DP_SITES[…].extRoot`), `#mb-dp-peek`, `#mb-dp-dialog` | Bump `_DP_PARSER_VERSION` (foreign hosts) or `_MB_POP_PAGE_VERSION` (edit/editor pages) when a parser's output changes; only a call with `start` may start a request (never a repaint); a request asks `wanted()` after its rate slot; cache keys carry the inc set; Space pins unless the user is TYPING; its IndexedDB is its own, never the art cache's; an external request is `anonymous`, and a host never reached is first contacted on Space, never from a hover; a url lookup takes relationship includes only, `?resource=` the `href` ATTRIBUTE verbatim |

**Big files — grep, never read whole** (a whole read costs 10–250k tokens):
`DEBUG-NOTES.md` (dated root-cause log, ~1 MB), `PERFORMANCE.org`,
`tests/MEASUREMENTS.org`, `tests/live/registry.org`,
`tests/snapshots/registry.org`, `PAGETYPES-TESTING-REFERENCE.org`, `AUDIT.md`,
`org/503-handling.org`, `org/config-handling.org`,
`ShowAllEntityData_HELP.md`. Grep by function, `Step N`, pageType or symptom
and `Read` with `offset`/`limit`.

**Small and current:** `tests/README.org` (how to run each suite),
`FORUM.org`, `org/picard.org`, `org/relationships.org`,
`org/action-button-redesign.org`. **Backlog:** `org/TODO.org` (active),
`REFACTORING.org`.

**Historical — do not read unless asked:** the other `org/*.org` files
(finished prompt/answer session logs; their conclusions already live in
`DEBUG-NOTES.md` and `PERFORMANCE.org`), `org/artist-releases-filterSort-test-report*.org`
(generated), `org/tag-rock-*.org` (raw HTML dumps), `tasks/*.md` (old plans;
`tasks/task-playwright-*` are cited by two skills), and the repo-root
`README.org` (pasted terminal transcripts).

## File structure

Everything lives inside a single IIFE `(function() { 'use strict'; … })()`.
There are no ES modules.

**This inventory carries grep anchors, not line numbers, on purpose.** The file
grows on nearly every commit, so absolute line numbers are stale almost
immediately — a previous version of this table had 21 of 23 rows wrong, several
by more than 6,000 lines, which is worse than having no table at all. Grep the
anchor. The listing order below is the file's own top-to-bottom order, which is
the part that stays true and is what makes it useful for orientation.

| Grep for                                        | What it is                                                                                                                      |
|-------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `// ==UserScript==`                             | Header, then a third-party attribution block (do not edit)                                                                      |
| `const SCRIPT_BASE_NAME`                        | Script constants: `SCRIPT_ID`, remote URLs                                                                                      |
| `const configSchema`                            | Settings-menu definitions (checkboxes, colour pickers, …); by far the largest single block                                      |
| `const Lib = (typeof VZ_MBLibrary`              | Library init, with a fallback stub if the `@require`'d library failed to load                                                   |
| `const ColumnDataExtractor`                     | Named column-extractor registry                                                                                                 |
| `const SyntheticColumnDataExtractor`            | Synthetic-column extractor registry                                                                                             |
| `function buildActiveColumnExtractors`          | First of the `buildActive*` helpers (extractors, erasers, injected columns)                                                     |
| `function applyListToTable`                     | DOM pre-processing; `applyRenameH2ToH3`/`applyRenameH2ToH1`/`applyInsertH2`/`applyInsertPrependH2`/`applyShowAllTags` follow it |
| `function applyExtractTrackTitleData`           | `release-tracks`' bespoke AR pipeline (see docs/claude/release-tracks-and-length.md)                                            |
| `const pageDefinitions = [`                     | One entry per recognised URL pattern                                                                                            |
| `let ctrlMFunctionMap`                          | Declared empty here; populated right after `initBarcodeHighlight()`                                                             |
| `function sortLargeArray`                       | Async row-array sort — defined much earlier than its callers                                                                    |
| `// --- Initialization Logic ---`               | Page-type detection, header location, button injection                                                                          |
| `function runFilter`                            | Real-time filter logic                                                                                                          |
| `function startFetchingProcess`                 | Main fetch-pipeline entry point                                                                                                 |
| `function renderFinalTable`                     | Single-table render (`tableMode: 'single'`)                                                                                     |
| `function renderGroupedTable`                   | Multi-table render (`tableMode: 'multi'`)                                                                                       |
| `function makeH2sCollapsible`                   | Page-level h2 collapse                                                                                                          |
| `function makeTableSortableUnified`             | Column-header sort handlers; delegates to `sortLargeArray()`                                                                    |
| `function initExpandRGsFeature`                 | Release-group expand/collapse                                                                                                   |
| `const CAA_CTX` / `const EAA_CTX`               | Artwork context descriptors                                                                                                     |
| `function initCaaPics` / `function initEaaPics` | Artwork feature entry points                                                                                                    |
| `function initBarcodeHighlight`                 | Barcode highlighting                                                                                                            |

## Page definition anatomy

All supported URL patterns are registered in `const pageDefinitions` (grep
`const pageDefinitions = [`). To count them, count `type:` keys inside that
array — don't carry the number here; `PAGETYPES-TESTING-REFERENCE.org` is the
authority on the pageType roster and its coverage plan. Each entry follows this
shape:

```javascript
{
    type: 'kebab-case-identifier',          // unique string used in debug output
    match: (path, params) => boolean,        // URL matcher — receives pathname + URLSearchParams
    buttons: [
        { label: 'Button label', params: { query_param: 'value' } }
    ],
    features: {
        // DOM pre-processing (applied before fetch, in order):
        renameH2ToH3: true,           // demote native <h2>s inside #content to <h3>
        renameH2ToH1: true,           // promote native <h2>s to <h1> (page has no native h1 at all)
        insertH2: 'Section title',    // inject <h2> after .tabs container
        insertPrependH2: 'Title',     // inject <h2> before first table
        listToTable: ['genres','tags'], // convert <ul id="X"> → <table class="tbl">
        removeSelector: 'css-selector', // remove DOM element after rendering
        showAllTags: true,
        mergeContinuationRows: true,  // fold "<td colspan=N> empty" continuation rows
                                      // into the preceding row as extra <li> rows —
                                      // pair with renderMultiRowCell on the same columns
        eventDetailsToTables: true,   // event-overview: table.details lists → h3 + table.tbl
                                      // groups, each with its own columns (data-mb-col-headers
                                      // → group.colHeaders; see docs/claude/fetch-and-render-pipeline.md)

        // Column pipeline:
        columnExtractors: [ { extractor: 'name', sourceColumn: 'Col', syntheticColumns: ['A','B'] } ],
        syntheticColumnExtractors: [ … ],
        injectedColumns: [ … ],
        injectedColumnExtractors: [ … ],
        columnErasers: [ … ],
        integerColumns: [ … ],
        collapsableColumns: [ … ],
        stickyColumn: 'Column name',
        tooltipColumns: [ … ],
        renderMultiRowCell: [ … ],
        splitCD: true,
        splitLocation: true,
        splitArea: true,
        extractMainColumn: 'Column name',

        // Pagination:
        pageParam: 'pg',              // query parameter naming the page (default 'page';
                                      // springsteenlyrics.com's collection entry page uses 'pg')
        pageKeys: { param: 'letter', selector: '.element-buttons a[href*="letter="]' },
                                      // pages named by KEY, not number: each matching link on
                                      // the live page is one page, fetched by its own href
                                      // (_readPageKeys(); springsteenlyrics.com's lyrics index)

        // Artwork:
        addCAA: true,
        addEAA: true,
    },
    tableMode: 'single' | 'multi',  // routes to renderFinalTable vs renderGroupedTable
    targetHeader: element | null,   // rarely set explicitly
}
```

**`tableMode: 'single'`** → fetches all pages, accumulates rows, calls `renderFinalTable()`.
**`tableMode: 'multi'`** → fetches grouped data, calls `renderGroupedTable()` which creates
one `<h3>` + `<table class="tbl">` pair per group.

Entity-driven page types (e.g. `series-releases`, `user-ratings-type`,
`collections-releases`) can also carry an `entityFeatures` map, resolved per
`<h2>` heading at fetch time by `resolveEntityFeaturesFromH2()` and merged in
*before* `baseDef.features`/`buttonConfig.features` — see the Render
pipeline section below.

## Render pipeline (`startFetchingProcess` → render)

```
startFetchingProcess(e, buttonConfig, baseDef)
  │
  ├─ resolveEntityFeaturesFromH2(baseDef) → entitySpecificFeatures (entity-
  │     driven page types only; can even override activeDefinition.tableMode
  │     at runtime — e.g. collections-releases' "Release groups" sub-entity
  │     is 'multi' even though the page's base tableMode is 'single')
  ├─ merges baseDef.features + buttonConfig.features → activeDefinition
  ├─ buildActive* helpers populate: activeColumnExtractors, activeColumnErasers, etc.
  ├─ applyRenameH2ToH3 / applyInsertH2 / applyListToTable  (DOM pre-processing)
  ├─ fetch loop (paginated GM_xmlhttpRequest calls)
  ├─ row extraction + column pipeline per row
  │
  ├─ tableMode === 'single'  →  renderFinalTable(rows)
  │     container = table.tbl tbody  (must exist in DOM)
  │
  └─ tableMode === 'multi'   →  renderGroupedTable(dataArray, isArtistMain)
        container = div#content  OR  table.tbl.parentNode  (re-rooted if targetHeader
        is outside initial container — see re-root block in renderGroupedTable)
        creates h3 + table.tbl pairs, inserts master-toggle button
```

## Testing expectations

**Every implementation ships with test cases. More coverage is always better.**
This is not a judgement call to re-litigate per change; the only question is
which kind of test, and the routing is:

| Kind              | Where                                                      | When                                                                                                           |
|-------------------|------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Fixture spec      | `tests/fixtures/*.spec.js`                                 | Anything reproducible from saved HTML. Network-free, fast, the default. Prefer this.                           |
| Live spec         | `tests/live/*.spec.js`, tagged `@core`/`@extended`/`@perf` | Real-page behavior that a fixture cannot reproduce (pagination, real artwork throughput, third-party interop). |
| Snapshot baseline | `tests/snapshots/<pageType>/`                              | A new pageType's structural shape.                                                                             |

The existing rule stands and is stricter than the table: **every DOM/rendering
fix needs a regression test that fails before the fix and passes after.** Verify
the "fails before" half rather than assuming it — mutation-check by reverting the
fix, or by planting an early `return`. `scripts/mutation-check.py` runs a JSON
list of planted defects (`scripts/mutations/*.json`) unattended: each `find`
must match exactly once, the userscript is restored and hash-verified
afterwards, and a guard the spec genuinely cannot see because another covers
for it is recorded as `"expect": "pass"` rather than left unmentioned.

**Name the guarantee precisely, or the test proves something adjacent.** The
CAA/EAA presence-sorting bug (docs/claude/artwork-caa-eaa.md) went unnoticed for the whole visible history
of the repo *while two specs covered the column*: they asserted artwork
**survives** a sort, which is a different guarantee and was always met. Nothing
asserted it **orders** by artwork. When writing an assertion, state which
property it pins, and check that a plausible bug in the neighbouring property
would still fail it.

See `tests/README.org` for how to run each suite and what it costs in wall clock.

## Performance is a priority

**A gate, not an afterthought. If a change would make filtering, sorting,
rendering or artwork throughput worse, flag it BEFORE implementing and let the
user decide** — including when the change is otherwise correct and the
regression is the price of correctness. Say what gets slower, by roughly how
much, and what the alternative would be.

- `PERFORMANCE.org` holds the measurements and the numbered Steps (grep
  `Step N`); its TODO/DONE keyword tracks "landed on `main`", not effort.
  Re-read it for prose your change made FALSE when you implement AND when you
  merge, then run `python3 scripts/audit-docs.py` (derives the "DONE set is
  exactly Steps …" sentence; fails on a `~:NNNNN~` line reference — name the
  symbol instead).
- **Every timing records the machine and the wall-clock time** — host, UTC
  start/finish; `capture-interaction-perf.js`/`capture-snapshots.js` write a
  `machine` block. Filenames carry version, capture date and hostname. Rows go
  in `tests/MEASUREMENTS.org` with the page's pageType, `tableMode` and title.
- **Never quote an absolute across versions or sessions.** Capture your own
  `main` arm beside your branch's in one session and quote only the ratio;
  bisect before attributing a gap to anything.
- Committed baselines: `tests/snapshots/artist-events/interaction-perf-*.json`
  and `tests/snapshots/artist-releasegroups/perf-baseline*.json`; the
  `run-perf-comparison` skill runs and interprets them.

Full text, reference numbers and reasoning: `docs/claude/performance-rules.md`.

## Publishing: this repo is NOT the one users install from

`vzell/mb-userscripts` is the announced repository, and its
`raw.githubusercontent.com/.../master/` URLs are what every user's Tampermonkey
fetches — including the in-script ❓ Help and 📜 ChangeLog dialogs, which read
those files at runtime. Publishing is copying files there by hand.

**The library `@require` differs between the two on purpose.** This repo points
at the working copy (`file:///V:/…/lib/VZ_MBLibrary.user.js`) so a live browser
check exercises the library in this tree; the published copy must carry the
network URL. That changed on 2026-09-23 — VZ_MBLibrary 4.1.0 and 4.2.0 both
rewrote parts of the settings dialog, and against the mirror's 4.0.0 none of
that code runs, so a live test was testing the published library while looking
like a real one.

**Shipping a `file://` `@require` fails silently for every user**: `Lib` falls
back to a stub whose `settings` is `{}`, every setting resolves to its inline
fallback, and nothing errors. `CustomizableMultiSelector.user.js` has been
published in exactly that state since 2026-02-02.

So: `python3 scripts/check-publish-ready.py` before a republish, and
`--strict` after one. It is read-only, it sweeps EVERY `.user.js` in the mirror
for `file://` (the one real instance has no counterpart here, so a pairwise
check misses it), and it treats "the mirror is behind" as pending rather than
broken — that is the normal state between releases, and a check that failed on
it would stop being run. Its arms are mutation-checked by
`scripts/check-publish-ready-gate.py` against a scratch mirror in a temp
directory, never the real one. Full checklist: `org/config-handling.org` F6.

## Git Workflow
- Never commit feature work directly to `main`. Always create a feature branch first (`git checkout -b <topic>`), commit there, then merge via PR or fast-forward and push.
- **NEVER merge an implementation branch into `main` without asking first —
  even when a green suite was the stated condition, and even when the user
  earlier said "go ahead".** A passing fixture suite is not evidence that the
  feature works; it is evidence that the assertions someone already thought of
  still hold. The `merge-push-remove` skill describes HOW to merge once that
  decision is made; invoking it is never the decision itself. Ask, and let the
  user exercise the change in a real browser first.
  This rule exists because it was broken: on 2026-09-16 the Relationships
  batch/load-state branch was merged locally on the strength of 287 green
  fixture tests, and minutes later a human clicking through a real
  `release-group` page found that filtering from the 📊 dropdown on the
  Relationships column silently stops working after one collapse/uncollapse
  cycle — a bug no spec in the suite covered. The merge had to be unwound
  (`git reset --hard`). Nothing had been pushed, which is the only reason it
  cost nothing.
- Every user-visible change requires: version bump in the userscript header, a CHANGELOG entry, and a HELP/docs resync in the same commit.
- At merge time, re-read `PERFORMANCE.org` for statements your change made false — see "Performance is a priority" above. Flipping a Step's keyword is the easy half; the prose that predicted your change is the half that rots silently.
- After finishing a task, always commit AND push; then offer to merge `main` into the active perf/feature branch to keep it current.

## File Safety
- NEVER use the Write tool on existing long-lived files such as `DEBUG-NOTES.md`, `CHANGELOG`, `PERFORMANCE.org`, or `PAGETYPES-TESTING-REFERENCE.org`. Read the file first, then use Edit to append or modify. Write is only for genuinely new files.

## Tooling Conventions
- Never run inline `python3 -c "..."` or inline `node -e "..."`. Write a script file under `scripts/` (or `test/`) and execute it, so the logic is reviewable and re-runnable.
- Every DOM/rendering fix must be accompanied by a jsdom or Playwright regression test that fails before the fix and passes after.
- ESLint is report-only (`eslint.config.js`, `tests/README.org` section "Lint"). Before committing, run `python3 scripts/lint-summary.py --check`: a change must not raise any (file, rule) count above `tests/lint-baseline.json`. After a fix lowers one, rewrite the baseline with `--write` in the same commit. Never weaken a rule to make a count fit.

## Debugging DOM/Rendering Bugs
Before proposing a fix for a rendering or 'element not appearing' bug, first confirm the root cause with evidence: check for late/async DOM injection (MutationObserver), stale node references, and third-party userscript CSS. Do not ship a CSS-overflow or rAF-batching guess as the fix.

## DOM conventions

| Element / class                                            | Purpose                                                                                                                                                                                                                                                                                                                    |
|------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `table.tbl`                                                | All data tables created by this script                                                                                                                                                                                                                                                                                     |
| `.mb-master-toggle`                                        | Show/Hide all sub-sections button (multi-table pages)                                                                                                                                                                                                                                                                      |
| `.mb-toggle-h3`                                            | Clickable h3 section headers                                                                                                                                                                                                                                                                                               |
| `.mb-toggle-h2`                                            | Clickable h2 section headers                                                                                                                                                                                                                                                                                               |
| `.mb-filter-container`                                     | Filter bar wrapper                                                                                                                                                                                                                                                                                                         |
| `.mb-sort-status`                                          | Sort indicator                                                                                                                                                                                                                                                                                                             |
| `.mb-row-count-stat[data-mb-sizer]`                        | Row-count stat (h2/h3). Fixed-width slot: an inline grid whose invisible `::after` renders `data-mb-sizer`, the widest text the span can show; write its text ONLY via `_setCountStatText()` (see docs/claude/toolbar-and-header-ui.md)                                                                                    |
| `.mb-caa-sort-key`                                         | Hidden sort/filter sentinel for CAA artwork presence                                                                                                                                                                                                                                                                       |
| `.mb-eaa-sort-key`                                         | Hidden sort/filter sentinel for EAA artwork presence                                                                                                                                                                                                                                                                       |
| `.mb-inline-art-sort-key`                                  | Hidden sort key for inline thumbnail presence                                                                                                                                                                                                                                                                              |
| `.mb-rel-cell`                                             | Relationship icon cell                                                                                                                                                                                                                                                                                                     |
| `.mb-rel-col-hdr-btn`                                      | Per-table ▶🔗/▼🔗 Relationships load/empty toggle; glyph from CSS `::before` keyed on `aria-pressed`                                                                                                                                                                                                                       |
| `.mb-sticky-col`                                           | Sticky first column                                                                                                                                                                                                                                                                                                        |
| `.mb-cell-collapse-toggle`                                 | Per-cell ▶/▼ collapse toggle — drives BOTH list cells (`ul>li`) and prose cells (`.mb-text-clamp-inner`)                                                                                                                                                                                                                   |
| `.mb-collapse-toggle-has-match`                            | Tint on a collapsed cell's toggle meaning "a filter match is hidden in here" — driven ONLY by `_COLLAPSE_MATCH_SEL` spans; see docs/claude/filter-and-cache-invariants.md                                                                                                                                                  |
| `.mb-text-clamp-marker`                                    | Unconditional marker on every prose-collapse column's wrapper — `_isProseCollapseColumn` keys off this, independent of the `.mb-text-clamp-inner` clamp itself (see `collapsableColumns` in docs/claude/filter-and-cache-invariants.md)                                                                                    |
| `.mb-text-clamp-inner`                                     | Wrapper around a "prose" collapsable cell's content (e.g. "Annotation"); height-clamped by default                                                                                                                                                                                                                         |
| `.mb-text-clamp-expanded`                                  | Toggled on `.mb-text-clamp-inner` to lift the height clamp                                                                                                                                                                                                                                                                 |
| `.mb-col-collapse-hdr-btn`                                 | Column-header collapse/expand-all button                                                                                                                                                                                                                                                                                   |
| `.mb-col-collapse-count`                                   | Per-column live multi-row count badge, kept in sync by `_updateAllColHeaderCounts`                                                                                                                                                                                                                                         |
| `[data-caa-expand-btn]`                                    | CAA/EAA cell-expand button attribute — the precedent `collapsableColumns` (docs/claude/filter-and-cache-invariants.md) points to for a "fourth cell kind"                                                                                                                                                                  |
| `.mb-uniq-section` / `.mb-uniq-section-hdr`                | Unique-values dropdown's collapsible section wrapper/header (see `SYN_SECTION_META` in docs/claude/uniq-dropdown.md)                                                                                                                                                                                                       |
| `.mb-col-modes` / `.mb-col-mode-chip` / `.mb-col-mode-btn` | Per-column Cc/Rx/Ex switches (`sa_enable_column_filter_modes`): `.mb-col-modes` makes the filter wrapper a CSS query container; chips vs compact button is decided by width, state lives in the input's `data-mb-mode-*` (see "Which Cc / Rx / Ex boxes govern which query" in docs/claude/filter-and-cache-invariants.md) |
| `#mb-col-mode-pop` / `.mb-uniq-ex-banner`                  | The one shared pop-up behind every compact `.mb-col-mode-btn`; the 📊 panel's banner when its column is in Exclude mode                                                                                                                                                                                                    |
| `.mb-col-uniq-item`                                        | Unique-values dropdown row item                                                                                                                                                                                                                                                                                            |
| `[data-mb-tip]`                                            | Marks a hover text as the script's own, so the engine shows it as a "Liner notes" card; stamped ONLY by `_setTip()` (or `data-mb-tip title="…"` in markup), never a bare `el.title =` (see docs/claude/toolbar-and-header-ui.md)                                                                                           |
| `.mb-release-art-h2` / `.mb-release-art-sec`               | release-tracks "Cover art (N)" section above `h2.tracklist` (and event-overview's "Event art (N)" above the tables: `data-mb-art-ctx`, `_artSectionDesc()`) — not a table, never cloned; tiles are `figure.mb-release-art-tile[data-mb-art-i]` with their hover card in `data-mbtt` (see docs/claude/artwork-caa-eaa.md)                                                                                                                       |
| `.mb-release-art-spread` / `.mb-medium-art`                | The section's Spreads layout blocks (pairs, the Liner pager, singles); the Medium-image thumbs (`button.mb-medium-art-btn`, image `pointer-events: none`) or "not assigned" note inside a medium's h3 (see docs/claude/artwork-caa-eaa.md)                                                                                    |
| `#mb-art-viewer`                                           | The full-screen artwork viewer overlay (z-index 2147483400, under the tooltips); while open it owns every key through a window-capture listener (see docs/claude/artwork-caa-eaa.md)                                                                                                                                         |
| `.mb-tt-liner`                                             | The one look of every floating tooltip (`#mb-stat-tooltip`, the cover-art card, the Relationships panels, the Ctrl+M overlay); rows use `.mb-tt-title`/`-body`/`-foot`/`-comment`/`-dim`/`-rule`/`-pill`/`-alert`, never inline colours                                                                                    |

## Things to check before any DOM-related fix

- Does the page have `div#content`? (Most do. `user/*/tags` does not.)
- Where does `table.tbl` live relative to `targetHeader`?
- Is `targetHeader` a sibling or ancestor of `container`?
- Does `applyListToTable` run before `renderGroupedTable`? (Changes parentNode of tables.)

## Plan Mode
When in plan mode, do not edit files. Present the plan first and explicitly state which branch the work will happen on and whether a version bump/changelog entry is needed, so the user can correct scope before any code changes.

## Settings keys (GM storage via `Lib.settings`)

All settings are prefixed `sa_`. The full set is
`ShowAllEntityData_CONFIG_DEFAULTS.json` (generated from `configSchema` by
`scripts/dump-config-defaults.py`) — read it rather than memory; nothing in the
userscript reads that file.

- **Changing a `default:` owes three things**: the schema value, every inline
  fallback literal (`Lib.settings.sa_X || literal` — grep the key), and an
  entry in `_SETTINGS_MIGRATIONS` naming the value it moved away from
  (otherwise everyone who ever pressed SAVE keeps the old one). Run
  `scripts/audit-config-defaults.py`; refresh
  `scripts/config-default-history.json` with `scripts/dump-default-history.py`.
- **Read numeric settings with `typeof === 'number' && >= 0` or `??`, never
  `|| default`** — `0` is falsy (`sa_render_threshold` has this defect).
- **Every route to the settings dialog goes through `Lib.configureSettings()`**;
  `_registerSettingsIntegration()` records the registry and `beforeOpen` hook
  once — never pass them at a call site.
- `type: 'table'` settings receive new built-in rows through
  `sa_table_seed_ledger`; `_seedNewTableRows()` is called at the FOOT of the
  IIFE (TDZ). The config export's `workspace` block is declared only by
  `_CFG_WORKSPACE_GROUPS` — verbatim values, allowlist not sweep.
- Only `applyVisibility()` may assign `display` to a settings row or header.
- **`secret: true` (`sa_pop_ext_discogs_token`) never leaves the profile**:
  not exported, never set or blanked by an import, masked in the dialog,
  never logged.
- A fixture profile is not pristine (`FIXTURE_SETTINGS_OVERRIDE` forces nine
  settings off; a spec that needs a schema default back seeds the key as
  `undefined`).

Full text: `docs/claude/settings-and-config.md`; design history:
`org/config-handling.org`.

## Debug channels (`Lib.debug('channel', …)`)

Enable via the `sa_enable_debug_logging` setting or the Tampermonkey menu.

**For the current list, grep `Lib.debug(` and collect the first arguments** — a
hardcoded list here goes stale silently (the previous one had drifted to include
a channel with no call site and to omit a real one). What a naive grep will
*not* tell you, and what is therefore worth recording:

- **`caa` and `eaa` have no literal call sites at all.** They are emitted as
  `Lib.debug(ctx.key, …)`, where `ctx` is `CAA_CTX`/`EAA_CTX` and `key` is
  `'caa'`/`'eaa'`. Grepping for `'eaa'` as a debug channel finds nothing; the
  channel is entirely real.
- **`filter-hist` and `gf`** likewise come from `Lib.debug(cfg.context, …)`,
  defaulting to `'filter-hist'` with a single `context: 'gf'` override.

So three of the channel names exist only as data. Anything new that routes a
channel through a variable should be added to this note.

## Debug material
- HTML snapshots and console logs live in `debug/`
- **`DEBUG-NOTES.md` is the dated root-cause log and lives at the project top
  level, tracked and committed like any other doc.** It used to be
  `debug/NOTES.md`; it was moved out precisely so it no longer depends on an
  index-only exception to an ignore rule. **It is ~1 MB with 200+ dated
  entries — never read it whole**: `grep -n` for the function, pageType or
  symptom you are about to touch and read those entries, plus the last
  three, before starting work. Append a dated entry when you finish —
  write it as durable, reviewable material, not scratch
- `debug/` is gitignored via a bare `debug/` in the ROOT `.gitignore`, so
  snapshots and logs stay local. **There is no `!` negation anywhere in the
  repo, and one could not work** — git never descends into an excluded
  directory, so `!debug/<file>` has no effect. The one file still tracked in
  there, `debug/adjust-mainColumn-extractor.org`, is tracked only because it
  was force-added to the index; re-adding it after a `git rm --cached` needs
  `git add -f`. Prefer the top level for any new durable doc
- Always read the relevant `debug/*.html` before proposing any DOM fix
- Document snapshots in `DEBUG-NOTES.md` with date and what they show

## Testing (Playwright)

The harness lives under `tests/`; how to run each suite and what it costs:
`tests/README.org`.

- **`chromium-fixtures`** (`tests/fixtures/*.spec.js`, local HTML, no
  network): `npm test` = everything except `@slow`; `npm run test:slow`;
  **`npm run test:full` is the merge gate**. The two `@slow` specs
  (`rel-auto-retry-failed` ~295 s, `resume-from-failed-page` ~84 s) spend
  their time in the rate gates and backoffs under test — do not shorten them.
- **`chromium-mobile`** (`tests/fixtures/*.mobile.spec.js`, Pixel 7
  emulation: touch, no hover, zoomed-out viewport): `npm run test:mobile`,
  included in `npm test` and `test:full`. Chromium emulation, not Firefox
  Android; mutation entries need `"project": "chromium-mobile"`.
- **`chromium-live`** (`tests/live/*.spec.js`, real musicbrainz.org, one tag
  each): `@core` (`npm run test:live`), `@extended`, `@perf`;
  `npm run test:all` runs everything. `npm run auth:login` writes
  `playwright/.auth/vzell.json` (gitignored) — without it live specs run
  logged out, silently.
- Registries: `tests/pagetypes.json`, `tests/snapshots/registry.org` (what is
  captured + "Expected drift"), `tests/live/registry.org`,
  `PAGETYPES-TESTING-REFERENCE.org` (coverage plan). Helpers:
  `tests/support/{customDialog,diskFixture,subtableTab,toolbarMenu,liveAssertions}.js`.
- **`FIXTURE_SETTINGS_OVERRIDE`** (`tests/support/loadPage.js`) forces
  `sa_enable_caa_pics`, `sa_enable_relationships_column`,
  `sa_enable_release_tracks_cover_art`, `sa_event_overview_event_art` and the
  five link-preview keys (`sa_pop_mb`, `sa_pop_mb_page`, `sa_pop_ext`,
  `sa_dp_hover_without_ctrl`, `sa_event_rg_tooltip_without_ctrl`) OFF
  — a "cannot reproduce" means nothing until they are back on. Seeding a key
  as `undefined` in `settingsOverride` un-seeds it (the schema default).

**Threshold dialogs will stall a test.** Four blocking plain-DOM overlays (not
native `confirm()`, so `page.on('dialog')` never fires):

| Gate                         | Fires when                                                    | Cleared by                                    |
|------------------------------|---------------------------------------------------------------|-----------------------------------------------|
| `ℹ️ Unknown Page Count`       | `features.unboundedPagination` + ambiguous pagination widget  | `dismissCustomConfirmDialog()`                |
| `⚠️ High Page Count`          | `maxPage > sa_max_page` (default **50**)                      | `dismissCustomConfirmDialog()`                |
| `showRenderDecisionDialog()` | `totalRows > sa_render_threshold` (default **5000**)          | click `#mb-dialog-render` — the helper cannot |
| `⚠️ Large Render Warning`     | `totalRows > sa_render_warning_threshold` (default **10000**) | `dismissCustomConfirmDialog()`                |

Prefer seeding settings so they never fire (`seedGmValues` in
`tests/pagetypes.json`, `buildGmStubsScript(initialValues)`, `realNetworkGmXhr`'s
`settingsOverride`). **`sa_render_threshold: 0` does NOT disable** (falsy →
5000) — seed a large number. The last two gates fire AFTER the fetch, so
hitting one burns the whole fetch.

**CAA/EAA specs:** expand every sub-table and uncollapse the big-image strips
BEFORE measuring, and assert it worked; never click the master toggle
unconditionally; re-expand after every discography view switch; settle, don't
sleep. `waitForCaaEaaComplete()` / `waitForRelationshipsComplete()` do NOT work
on a large page — poll the painted count until stable.

Full text: `docs/claude/testing-playwright.md`.

## Adding a new page type — checklist

1. Add entry to `pageDefinitions` array (grouped by entity class, in
   MusicBrainz's own tab/entity ordering — NOT alphabetical; find the
   closest existing sibling in the same entity class and insert near it)
2. Set `type`, `match`, `buttons`, `features`, `tableMode`
3. Check DOM structure of the actual page — use a snapshot in `debug/`
4. If the page has no `div#content`, verify `renderGroupedTable`'s container re-root
   handles it (targetHeader must be inside the resolved container)
5. If `tableMode: 'multi'` and the page has no native h2, add `insertH2`
6. If the page has native h2s that should become h3s, add `renameH2ToH3: true`
7. If the page has no native h1 at all (its only heading is a `<h2>`), add
   `renameH2ToH1: true` plus `insertH2: '…'` — otherwise the page-load button
   toolbar and the post-render filter/count UI both end up crammed onto the
   same native heading (see `applyRenameH2ToH1`'s JSDoc; the standalone
   `debug/user-edits-wrong.org` snapshot this used to point to is gone — see
   `DEBUG-NOTES.md`'s `## 2026-07-29 — user-edits/user-open-edits cram
   everything onto one heading` entry instead)
8. Bump version, add changelog entry

## Adding a new column extractor — checklist

1. Add extractor function to `ColumnDataExtractor` with JSDoc
2. Reference by function-name string in `features.columnExtractors` of the page definition
3. Add corresponding header name strings to `syntheticColumns`
4. If the extractor produces a sort-key span, add its class to `_CLEAN_STRIP_SEL`
   (so `getCleanColumnText` does not leak sentinel values into filter matching)

## Common pitfalls

- `str_replace` requires the `old_str` to be **unique** in the file — include
  surrounding context if a pattern repeats
- `renderGroupedTable` inserts new h3/table pairs via `lastInsertedElement.after()` —
  changes near the cleanup pass affect where pairs land
- `getCleanColumnText` strips elements matching `_CLEAN_STRIP_SEL` — new hidden
  sort-key spans must be added there or they leak into filter matching
- **A `_highlightXxxMatch()` regex runs against `highlightCrossTag()`'s own
  `fullText`, not against `getCleanColumnText()`'s — and the two only agree if
  `highlightCrossTag()` is careful.** `getCleanColumnText()` reads highlight
  spans through; `highlightCrossTag()` walks the live text nodes, and any
  earlier highlight (a typed filter, another ticked entry) has already split
  one node into several, which it joins with a virtual space. Since 2026-09-26
  it adds NO gap between two nodes that were one node before a highlight
  wrapper split them (`splitByHighlight`). Reported as "ticking BUMA then STEMRA
  ID highlights only BUMA". **Do not fix a symptom of this with `\s*` inside one
  highlighter's regex** — that hides it for one column and leaves the rest. A
  test for a highlighter has to tick TWO entries that mark the same text, in
  both orders; a single tick can never see it.
- **Highlight AFTER the DOM you are highlighting is final.** `runFilter()`
  highlights a fresh clone, and `initIsrcFormatting()` (like any render-tail
  rebuild of a cell's inner markup) runs after it: a tail pass that replaces
  spans wipes the marks placed inside them. Make the tail pass idempotent
  (`_formatIsrcAnchor()`), or do the transform on the clone before matching.
- `activeDefinition` is a module-level variable updated by `startFetchingProcess` —
  helper functions called during fetch see the merged definition, not `baseDefinition`
- `sortLargeArray` is async — callers must `await` it before touching the sorted array
- `renderFinalTable`/`renderGroupedTable` insert `cloneNode(true)` copies of rows on
  every sort/filter re-render — any element with a direct `addEventListener` call or a
  custom JS property (not a DOM attribute/class) loses it silently on the clone, even
  though classes/attributes/inline styles survive and can make the clone *look* still
  wired up. Existing re-wire-after-clone functions, all called from `runFilter()`'s
  single-table branch and/or `renderGroupedTable()`: `initExpandRGsFeature()`,
  `_cdtocInitTracklistToggles()`, `_rewireNestedTableH2Toggles()` (nested `<h2>`
  headings inside table cells, e.g. wiki-rendered Annotation sub-sections — see
  `makeH2sCollapsible()` for the page-level h2 mechanism this mirrors at a smaller
  scale), and `initPicardTaggerColumn(/* rewireOnly */ true)` (identical
  "cloneNode(true) strips listeners, this call only re-attaches them"
  rationale, called from the same two places, plus
  `_applyDiscographyViewFilter()`'s tail — that function re-clones source rows
  into live tbodies twice without going through `renderGroupedTable()`, so
  nothing else re-wires them; note it is *a per-row no-op while the Picard
  column is collapsed*, which is the default — it still walks every row, but
  per row it empties an already-empty `<td>` and stops, so nothing is scanned,
  built or wired. Its own header toggle is the one part of Picard that is
  already delegated, on the `<table>` element). **Three more members belong to this family and
  used to be missing from both this list and `PERFORMANCE.org` Step 23's:**
  `applyStickyColumn()` (per-row `mouseenter`/`mouseleave` plus the custom props
  `tr._mbStickyEnter`/`_mbStickyLeave` — the largest of them),
  `barcodeProcessTable()` (per-cell `click`), and
  `initAnnotationCompareRadios()` — which is *not* a listener at all:
  `cloneNode(true)` re-applies MusicBrainz's pristine `disabled` attribute, so
  event delegation could never fix it. A new interactive element
  injected into table cells needs the same treatment if it uses
  `addEventListener` directly instead of event delegation.
- **The two table modes render differently, and assuming otherwise is how a
  column silently loses its cells.** `renderFinalTable` **MOVES** the rows it is
  handed (`rows.forEach(r => tbody.appendChild(r))`), so on a single-table
  page's initial render the live rows *are* `allRows`' rows and anything
  appended to a live row lands on the source row for free.
  `renderGroupedTable` **ALWAYS CLONES** (`group.rows.forEach(r =>
  …r.cloneNode(true))`), on the first render too — so in `tableMode: 'multi'`
  nothing appended to a live row ever reaches `groupedRows[i].rows`, and the
  next re-render clones a row that never had it. This is documented in
  `_artResolveSourceCell()`'s JSDoc and is the reason
  `_artMirrorIconToSourceRow()`/`_artMirrorInlineThumbToSourceRow()` exist. It
  is also exactly how the Picard column came to empty out on every multi-table
  re-render (see `DEBUG-NOTES.md`, 2026-09-10): its own comment asserted the
  opposite. **Any feature that appends a cell or an element to a live row must
  mirror it onto the master row** — resolve it with `_findMasterRowByIdx()`
  (`data-mb-row-idx`, propagated by `cloneNode`), or with
  `_buildMasterRowIndex()` when the pass touches every row, since
  `_findMasterRowByIdx()` is a linear scan and per-row use makes the pass
  O(N²). **Mirror the BUILT node, do not re-derive it on the master:** a master
  row lacks the classes the live pass added (`.mb-sticky-col` above all, which
  `_picardExtractRowEntities()` skips), so re-deriving can legitimately produce
  *different* content than the live row.
- **`release-tracks` AR finders: never `.find()`/take-first on a "does this track
  have this relationship" lookup.** MusicBrainz can render the SAME relationship
  phrase (or a closely related one, e.g. "recorded at:" and "additionally recorded
  at:") as TWO OR MORE separate sibling `<dt>` elements for one track, each with its
  own `<dd>` — not multiple targets joined inside one `<dd>` (that's a different,
  already-handled case — see `_buildRecordedAtPlaceTd`'s own placelink-marker
  segmentation). A `.find()`-based finder silently drops every match after the
  first, with no error and no obviously-missing UI (the column still renders,
  just incomplete). This has bitten twice already: `_findPhonographicCopyrightDts`
  (artist-crediting `<dt>` in one `<dl>`, label-crediting `<dt>` in a sibling
  `<dl>`) and `_findRecordedAtDt`/`_findMixedAtDt` (a bare "recorded at:" `<dt>`
  and a separate "additionally recorded at:" `<dt>` for two different studios —
  see `debug/double-ars.html`). Both are now `.filter()`-based, returning every
  match; their builders (`_buildPhonographicCopyrightTds`/`_buildRecordedAtPlaceTd`)
  merge all of them into one cell. Any NEW finder over `_findAllArDts(titleTd)`
  should default to `.filter()`, and only narrow to "first match only" with an
  explicit, documented reason (e.g. "Recorded at event" intentionally stays
  single-anchor/never-a-list, so its row-building call site takes `[0]`).
