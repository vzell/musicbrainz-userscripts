<!-- Written on branch feature/findings-menus (org/generalize-error-warning.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# Findings: the ⚠️ WARNING / ❌ ERROR menus and the generic cell tint

A **finding** is a data-quality fact about one cell: a track and recording
length that disagree, a live-title date that cannot exist, a pending edit, an
ALL UPPERCASE title, an invalid ISRC, … Every finding is one entry of the
`FINDINGS` registry (grep `const FINDINGS = [`), and from that one entry it
gets three things:

- a row in the **⚠️ WARNING** or **❌ ERROR** pull-down in the h1 toolbar,
  after ❓ behind its own `|` divider, with a row count and a tooltip;
- an entry in the 📊 **"Findings - Warning" / "Findings - Error"** section of
  the column that holds it (mode `finding-<id>`);
- the yellow (warn) or red (error) **cell tint** with a ⚠️/❌ glyph, unless the
  finding already had a look of its own.

**A new finding is one `FINDINGS` entry.** Nothing else needs a per-finding
line: the menus, the 📊 section, the matcher, the labels and the tally all read
the registry. The checklist for adding, reclassifying or debugging one is the
project skill `add-finding` (`.claude/skills/add-finding/SKILL.md`).

## The registry contract

| Field                                  | Meaning                                                                                                                                                                                  |
|----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`, `level`, `glyph`, `label`, `tip` | Identity, `'warn'`/`'error'`, and the menu row's text. Ids are `[a-z-]` tokens: they go into a CSS attribute selector unescaped.                                                         |
| `scope`                                | `'cell'` → the menu ticks a 📊 entry; `'row'` → the row filter. See below.                                                                                                               |
| `coFlagged`                            | Length only: both duration cells always carry the same flag, so ticking the first column suffices.                                                                                       |
| `inlineGlyph`                          | The cell already shows its own ⚠️/❌ (ISRC, ISWC, barcode, live credit): tint only.                                                                                                       |
| `enabled()`                            | Optional; the finding's own feature setting (`sa_enable_pending_edits_section`, `sa_enable_barcode_validation`).                                                                         |
| `cols(name, plan)`                     | Which columns are tested. `'*'` = every cell of a row that passes `rowGate()`.                                                                                                           |
| `test(cell, row, plan)`                | The detector.                                                                                                                                                                            |
| `detail(cell, row, plan)`              | Optional, per cell (either scope; a row finding's since 2026-10-21): this cell's own text, appended to its tooltip line after the label (`rec-event-mismatch`/`rec-place-mismatch` name both values; `live-credit-nodate` the date the credit is deduced to be from). Same source-row rule as `test()`. |
| `compare(cell, row, plan)`             | Optional, per cell (either scope): `{la, lb, a, b}` for the rich card, which shows the two values one under the other, the difference marked (`_cmpHtml()`).                              |
| `tint(cell)`                           | Whether this finding paints. `false` for the families that already had CSS (length, video, no-work, live titles); the rest read their `sa_findings_tint_*` setting.                      |

**`test()` reads SOURCE-row data, never post-render decoration.** The stamp
reaches master rows, and a master row never saw the render tail —
`initIsrcFormatting()`, `initIswcValidation()` and `initBarcodeValidation()`
decorate the live clones. So ISRC validity comes from `_findCellIsrcParts()`,
not from `a[data-mb-isrc-invalid]`. Reuse the 📊 readers (`_findCell*`), which
were written for detached clones already.

**Column gates on `plan`.** `_findingPlanForTable()` hands every `cols()`
two name predicates: `plan.titleInfo(name)` (Title + `sa_uvd_title_info_columns`)
and `plan.eventName(name)` (Event + `sa_uvd_event_name_columns`). The
release/RG live-title findings (`live-*`) and the event-name ones
(`event-live-sep`, `event-style-nearmiss`, `event-live-invalid`,
`event-live-nearmiss`) are separate entries on purpose: different columns,
different readers (`_findCellLiveTitle()` vs `_findCellEventName()`), so
neither family ever counts the other's cells.

Recording comments add `plan.recComment(name)` (`_recCommentColumnKind()`:
`'plain'`/`'link'`/`null`, read per cell via `_findingRecComment()`),
`plan.recPlainIdx` (the row's "Disambiguation" cell, which `rec-date-*`
compares with the "Recording date" cell they test and tint) and
`plan.eventStateIdx` (for `event-state-missing` on Event-Country).
`rec-event-mismatch`/`rec-place-mismatch` read the same `plan.recPlainIdx`
through `_rowRecCommentEvent()` (only the full "<type>, DATE: Venue, …" form
names an event and a venue) and compare it with the event/place names of the
cell they test (`_findCellLinkedNames()`; a place's name is its `<bdi>`, the
text before " in …"). The
`rec-date-*` tint deliberately sits on the Recording date cell, not on the
comment cell: that one may already carry `data-mb-live-flag`, which
suppresses the generic tint.

## The stamp: `stampFindings()`

Same shape and same reasons as `stampLiveTitleFlags()`, and called right after
it at the fetch tail and the disk-load tail: ONCE per fetch or load, never on a
filter or sort re-render. It writes live rows, their master rows
(`_buildMasterRowIndex()`) and the owner arrays' rows the current filter left
out, because `renderGroupedTable()` always renders clones. Per cell:

- `data-mb-findings="id id"` — every finding, regardless of settings. The 📊
  matcher, the row filter and the menu tally read this.
- `data-mb-finding="warn|error"` — the worst level among the findings that
  tint. Drives the generic CSS rule pair.
- `data-mb-finding-inline` — the cell shows its own glyph at that level.
- `title` — only on a cell with no tooltip of its own and no family flag
  (`data-mb-finding-tip` marks one the stamp wrote).

**A cell a per-family rule already paints gets no `data-mb-finding`.** The
generic `::after` selector carries a `:not()`, so it out-ranks the family's
`::after` on specificity and would put a ⚠️ on a red cell. The family flags are
`data-mb-len-flag`, `data-mb-video-flag="mismatch"`, `data-mb-work-flag`,
`data-mb-live-flag`; a new family attribute must be added to that check in
`_writeFindingAttrs()` and to the track-target rule's `:not()` list.

The same pass stamps each release-tracklist row's `data-mb-event-key`
(`_eventKeyColsForTable()`/`_stampRowEventKey()`), which the h3 "🎪 N events"
badge (`_updateMediumEventBadges()`, memoized on `_findingStampGen`) and the
📊 "Event info - Events on this medium" section count (org/live-bootleg.org 3).

Since item 4 the stamp runs in TWO passes, both through `_forEachStampRow()`
(live row, master row, filtered-out owner rows): pass 1 writes every event
key page-wide, `_computeMainEventCtx()` then decides the main event from the
release group title in the page's JSON (by DATE, for a valid live title; the
table's `data-mb-multi-event`, which the green "#" needs, only with 2+ dates on
the page), and pass 2 writes `data-mb-main-event` before the
findings, because `rg-title-mismatch` reads it. `_forEachStampRow()` reaches
a live clone AND its master, so anything that COUNTS rows there must dedupe
by `data-mb-row-idx` (`_computeMainEventCtx()` once counted 76 tracks for 38).

**`compare` rides beside `detail`, never instead of it.** The plain title
keeps `detail`'s prose (the native fallback, and what specs and the disk file
read); `_writeFindingAttrs()` writes each finding's `compare` value into
`data-mb-tip-cmp` (`_setTipCmp()`), tagged with the tip line it belongs to
and the label as its `head`, so the "Liner notes" card shows the label and
the two values one under the other instead of the prose. The attribute also
records the text it was built for: a card shows it only while the title is
still that text (`_cmpTipData()`), so a tip rewritten by anything else never
pairs with an old comparison. `title-mismatch` marks its entry `origin`: under
a preview card the link's own note box compares the same two names, so the
cell's box in the stack gives the label alone (`_dpCollectNotes()`,
`noOrigin`). The diff and its look: mockup
https://claude.ai/artifact/7Nbqih988jfzpGxbiQTX75 (approved 2026-10-17,
variant A); mutation list `scripts/mutations/tooltip-diff.json`.

Three more cards since 2026-10-20 (branch `feat/mb-title-style-findings`,
WIP.2):

- **`eti-case`**: `_findingEtiCaseCmp()`, the title over the same title with
  the keywords of each capitalized group in lower case (the finding's own
  `etiCase`/`etiRanges` and `_etiKeywords()`, so names in the group stay).
- **`truncated`**: `_findingTruncatedCmp()`, a ONE-row entry, `kind: 'mark'`
  (`_cmpMarkHtml()`): the title with its closing "…" marked and a summary.
  There is no honest second value — the full title is not on the page — and
  "the title without …" would propose a fix that may be wrong (the user's
  choice). `_cmpTipData()` validates the kind (`a`, `la`, `s`, `e`, `sum`).
- **`live-sep` / `event-live-sep` / `rec-live-sep`**: these are
  family-painted (`data-mb-live-flag`), so `_writeFindingAttrs()` never
  writes their tip and a `compare` on the finding would be ignored. The
  comparison is written where the tip is: `_stampLiveTitleRow()` stores
  `_liveSepCmp()` with the flag's own sentence, `at: 0`, for a `warn` flag
  only (a red cell's error is the date, not the hyphen). `_liveSepFixed()`
  changes only the date head before the first ": " of each " / " part,
  so "Wilkes-Barre" in a venue stays. Clearing the flag removes
  `data-mb-tip-cmp` with the title.
- **The live near misses** (2026-10-21, 9.99.1412: `live-nearmiss`,
  `event-live-nearmiss`, `rec-live-nearmiss`): same family, same place.
  `_stampLiveTitleRow()` now calls `_liveFlagCmp()`, which keeps the
  separator card for `warn`, gives a near miss (the flag carries its
  problem as `nearmiss`, from `_liveTitleFlag()`/`_recCommentFlag()`) the
  text over `_liveNearMissFixed()`'s form, and still gives an impossible
  date nothing. **The fixer never guesses**: it makes only fixes that read
  one way (a comment's type lower-cased, ", " after it, "live, " before a
  typeless date-led comment, a YEAR-FIRST date padded and "‐"-joined, ": "
  after the date), and the result must pass the parser that flagged it
  (`_liveNearMissCheck()`: `_parseLiveTitle()` "valid", or a comment's live
  forms with a valid date). A day-first or month-first date ("05.02.1975"),
  two years ("1973/1976"), a bad location or several dates get the one-row
  `kind: 'mark'` card instead (`_liveNearMissMark()`, the date run or the
  location marked) — which needs `at: 0` like every entry, or
  `_tipTextToHtml()` places it nowhere. "live: KBCO Studios, …" IS fixed to
  "live, KBCO Studios, …": the location-only form is the one valid reading.
  `_liveFlagText()` is the text reader both cards share.

Spec `tests/fixtures/findings-diff-cards.spec.js`, mutations
`scripts/mutations/diff-cards.json`.

Attributes only, so none of the "writing cell text after the render" duties
apply (docs/claude/filter-and-cache-invariants.md) — except the 📊 cache,
whose `findingCounts` come from these attributes: the stamp invalidates each
table's uniq cache.

## Findings on data that arrives later: the artwork findings

`art-no-front` and `art-no-medium` (org/redesign-CAA-EAA-column.org) are the
first findings whose input is not in the page: the archive record, which
arrives AFTER `stampFindings()` ran. The rules for any such finding:

- **`test()` reads the data, not the decoration.** `_artFindingImages()` takes
  the entity path from the cell's NATIVE anchor (a master row keeps it) and
  looks it up in `CAA_CTX.imagesCache`. Not loaded, or no image → false: a
  release with no artwork is not flagged, and nothing is flagged on a guess.
  Because the stamp reads the cache, `stampFindings()` itself already gets
  every record that was cached before it ran (IDB, a re-fetch).
- **A per-row re-stamp, not another `stampFindings()`.**
  `_artBuildMultiRowArtCell()` (both branches) queues the row
  (`_artQueueFindingsRestamp()` → the shared `_queueFindingsRestamp()`);
  `_flushFindingsRestamp()` re-runs `_stampFindingRow()` on each queued live
  row AND its master row, 150 ms later in one batch. A full pass per record
  would be O(rows) per row. (Until 2026-10-19 the pair was artwork-only,
  `_artFlushFindingsRestamp()`.)
- **Only a CHANGED stamp goes on** — gen bump, the touched tables' 📊 caches,
  `updateFilterButtonsVisibility()` (the menus), and `runFilter()` only while
  an artwork finding is filtering. That condition is what stops a loop:
  `runFilter()` re-clones the rows, the clones re-enrich from the cache and
  queue themselves again, and their stamps then come out unchanged.
- A row the active filter removed is never enriched, so it is stamped only
  once its art loads in some later view. The menu count therefore grows while
  the CAA column loads; its tip says so.

### The Relationships column: `rel-multi-site` (was `rel-multi-discogs`)

The second kind of late data (2026-10-19, `feat/link-site-uvd`): the deferred
Relationships column (docs/claude/deferred-columns-picard-relationships.md)
writes its cells after `stampFindings()` ran. "Several links to one site in
Relationships" (⚠️, cell scope, column "Relationships") follows the same
rules. Until 2026-10-21 (9.99.1401, `feat/rel-multi-site-and-initial-page`) it
was "Several Discogs links in Relationships", Discogs only:

- `test()` reads `_findCellRelSiteDupes()`: the icons' hidden
  `.mb-rel-filter-key` spans, which `_relWriteResult()` writes into the live
  cells AND copies onto the master rows — source-row data. Grouped by HOST
  without "www." — never by site kind (`_siteFamilyOf()`): amazon.de and
  amazon.com, music. and itunes.apple.com are different sites, one link each
  is what MusicBrainz expects. Distinct by host + path, so a `?…` variant of
  one page is one URL (which also makes two YouTube `watch?v=` links ONE);
  a host with 2+ flags. Hosts in `sa_findings_rel_multi_site_ignore` never
  count. Only icons that are drawn count (a link type with no icon class —
  wikipedia by default — never reaches the cell).
- `detail()` (`_relSiteDupesDetail()`) names EVERY site involved, one line
  each: "Discogs (discogs.com): url, url". The cell title, its hover title
  and the icon's popup finding box (`_relFindingNoteHtml()`) all show it.
- `_relWriteResult()` queues each live row it wrote (both the answer and
  the "no relationships" branch, so a ⟳ reload can also CLEAR a stamp)
  through `_queueFindingsRestamp(tr, ['rel-multi-site'])`.
- The filter re-run condition is `_LATE_FINDING_IDS` (artwork + this one).
  No loop: a re-rendered clone never reaches `_relWriteResult()` again
  (`relDone`).
- A write to master rows ONLY (a clicked row the filter has since hidden:
  `cells` empty) is not re-stamped: nothing live to queue. The next fetch or
  disk load stamps it; `stampFindings()` reads the master's spans.
- Settings `sa_findings_rel_multi_discogs` (the finding, needs
  `sa_enable_relationships_column`) and `sa_findings_tint_rel_multi_discogs`
  — **the keys keep "discogs"** on purpose: renaming them would drop every
  saved value (`_SETTINGS_MIGRATIONS` moves defaults, not keys). Plus
  `sa_findings_rel_multi_site_ignore` (text, hosts).
- The cell draws its ⚠️ with `::before`, not the generic `::after` (that is
  the hover ⟳ here) — see "Pseudo-element slots of a loaded cell" in
  docs/claude/deferred-columns-picard-relationships.md.
- Specs `rel-column-site-kind-discogs.spec.js` (Discogs cases, filter,
  survival), `rel-multi-site-finding.spec.js` (every site, ignore list,
  glyphs on hover, popup stack); mutations
  `scripts/mutations/link-site-uvd.json`, `scripts/mutations/rel-multi-site-and-ip.json`.

## On demand: the title-style findings

`title-case`, `title-typography`, `title-series-sep`, `title-feat` and
`title-eti-remove` (branch `feat/mb-title-style-findings`,
org/title-style-guidelines.org) check MusicBrainz titles against the style
guide. They are the first findings that run only when ASKED for, because the
check costs real render time: about 20 µs per distinct title in Node, so
~0.2 s per 10,000 (`node scripts/check-mb-title-case.js --mb-sample`;
0.85 µs for a repeated title, which the memo serves).

- **The gate is `enabled()`** — `_titleStyleEnabled(key)`: `_titleStyleActive()`
  (`!_foreignHost` and either `_titleStyleRequested` or
  `sa_findings_title_style_auto`, default OFF) plus the finding's own
  `sa_findings_title_*` setting. A disabled finding is not in any plan, so
  the default render pays nothing but `_titleStyleAvail`'s header scan.
- **The trigger is the first row of the ⚠️ WARNING menu**
  (`_titleStyleMenuRow()`, `_buildTitleStyleMenuRow()`, placement option B
  of the mockup https://claude.ai/artifact/5MUe9Ti1hGBu9tAP6PYXVV, chosen
  2026-10-20). It is offered while `_titleStyleAvail` (the last
  `stampFindings()` met a `plan.titleInfo()` column on a MusicBrainz page),
  so `_updateFindingMenus()` now builds the WARNING menu even with no
  finding rows — the one exception to "a menu is hidden while the page has
  nothing of its kind". Without rows its label carries no "(0)".
- **The click re-runs `stampFindings()`** (`_runTitleStyleCheck()`), which is
  idempotent — `initReleaseGroupLink()` included — and then shows the time
  and the memo size as the row's status line. Later fetches and disk loads
  of the page keep the findings on; a reload drops them.
- **One checker, `_mbTitleStyleCheck(text)`**, in the shared title section
  (so `scripts/check-mb-title-case.js` cuts and tests it), memoized by text.
  It reuses the converters' `_mbTitleCase()` and `_mbTypographyFixed()`
  READ-ONLY and keeps their output only where the guideline is certain;
  docs/claude/foreign-title-case.md has the rules, and every exemption is a
  mutation in `scripts/mutations/title-style.json`.
- **`compare`** gives `{la: 'Title', lb: 'MB style', own: 'b'}` for case,
  typography and series; `title-feat` and `title-eti-remove` propose no
  title and give a `detail` instead.
- **One tint setting** for all five, `sa_findings_tint_title_style`.
- Overlaps are deliberate: an ALL UPPERCASE title also carries `title-case`
  (its card shows the proposal), and "(Live)" both `eti-case` and
  `title-case`. `_MBTC_ETI` (the case rule's lower-case ETI words) and
  `sa_findings_eti_keywords` (`eti-case`'s) are different lists, so a group
  such as "(Second Night)" is `title-case` only.

Spec `tests/fixtures/findings-title-style.spec.js` (plants titles into
`artist-releasegroups-live-titles.html`), cases
`tests/support/mbTitleStyleCases.js` (Node and browser).

## Counting: `_findingRowTally()` and the stamp generation

The menus count ROWS (a length mismatch marks two cells of one track), over the
captured SOURCE rows — never the live tbody, which `runFilter()` empties of
non-matching rows (AUDIT.md §3.6: a count of 0 would remove the only way back).

The tally is memoized per source-row array like `_sourceRowTally()`, plus
`_findingStampGen`. **`_sourceRowTally()`'s "no invalidation hook" argument
does not carry over**: it holds because its marker (`span.mp`) exists before
capture, while the stamp writes into rows that are ALREADY captured — and
`updateFilterButtonsVisibility()` can tally them during the render, before the
stamp. Without the generation that pre-stamp "nothing" is what the menus show
(`scripts/mutations/findings-menus.json`).

## Applying a menu row

`_toggleFinding(id)` composes with every other filter (AND), like ticking 📊
entries by hand, and runs `runFilter()` once.

- **Cell scope** — `_findingTickTargets()` finds the column of the name that
  holds the finding (on the source rows) and ticks `\u0003finding-<id>` in that
  column of **every** table through `_writeUniqValueSet()` (the
  `applyUniqValueSet()` body without its `runFilter()`). A table without the
  finding is ticked too: that is what empties it. The column filter box shows
  the entry's label; every clear path unticks it.
- **Row scope** — `_findingRowFilter`, a page-wide Set: a row passes when some
  cell carries each id. `testRowMatch()` reads it, `_buildFilterKey()` and
  `_buildIncrPartialKey()` key it, `clearAllFilters()` empties it, and the
  filter bar shows one chip per id (`#mb-findings-chips`) with a ✕.
- **Fallback to the row filter** for a cell finding whose 📊 tick cannot say
  "rows with it": two unrelated columns in one table (ticks AND), different
  column names across tables, a table without that column, or a target column
  in Exclude mode.

**Pending edits is a plain row finding and does NOT drive the ⏳ toggles.** The
global ⏳ filters only the sub-tables that have pending edits and leaves the
others showing every row; "only these rows, page-wide" is what a menu row
means. The two filter side by side.

**The checked state is derived, never stored** — from the inputs'
`mbUniqValues` or the Set, on every refresh. That is why "Clear ALL COLUMN
filters", Shift+Esc, a ✕ in a column box or an untick in 📊 keep the menu
honest without a hook of their own.

## The menus

`_ensureFindingMenu(level)` → `createToolbarMenu({ segment: true })` with keys
`findings-warn` / `findings-error`. Since 2026-10-22 they are the two
attention INDICATORS of the SAED button (`_SAED_INDICATORS`,
docs/claude/toolbar-and-header-ui.md "The SAED button"): a segment
"❌ N ▾" / "⚠️ N ▾" in its `attn` area (errors first), tinted by level, and a
row of the SAED menu's "Needs attention" group opening the same list beside
the menu; `menu.indicatorCount` carries the count, and ticking a row keeps
the list open. Unlike the Data and View groups they **build their own rows**
(`_buildFindingMenuRows()`, `menuitemcheckbox`, adopted via `adopt()` for the
keyboard and close behaviour) instead of adopting existing toolbar buttons —
there are no such buttons; the rows ARE the feature. Row styling therefore
lives in `.mb-findings-menu-item` CSS, not in an adopted button's own inline
style. `_updateFindingMenus()` runs from `updateFilterButtonsVisibility()` (and
the stamp's tail), rebuilds rows only when a count or a checked state changed,
and shows `#mb-button-divider-findings` only while a findings menu is attached.
`sa_enable_findings_menus` turns both off.

Pinned by `tests/fixtures/findings-menus.spec.js` and
`tests/fixtures/findings-stamp.spec.js` (helpers:
`tests/support/findingsMenu.js`), mutation-checked by
`scripts/mutations/findings-menus.json`.

## Replaced

The filter bar's live-date "(N) WARNING ⚠️ / (N) ERROR ❌" buttons
(`_countLiveDateFlags()`, `_applyLiveDateFlagFilter()`, which typed the glyph
into the GLOBAL filter and cleared every other filter) and its "(N) LENGTH
⚠️/❌" buttons (`_lenMismatchFilterKind`). Their specs now pin the same
guarantees on the menu rows.
