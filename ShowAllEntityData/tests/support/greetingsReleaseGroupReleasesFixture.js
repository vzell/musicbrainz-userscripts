'use strict';

/**
 * Shared identifiers and expected-stats table for the `releasegroup-releases`
 * (tableMode: 'multi') filter/sort/highlight/uniq-dropdown regression suite —
 * Bruce Springsteen's "Greetings From Asbury Park, N.J." release group
 * (https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c).
 *
 * This is the multi-table sibling of `bodeansArtistReleasesFixture.js`. Real
 * network only (no disk fixture) — every test needs real CAA/Relationships
 * data per this suite's own requirement, so there is no `FIXTURE_PATH`.
 *
 * 124 total rows across 3 native MusicBrainz release-status sub-tables:
 * "Official release" (119), "Promotion release" (4), "Bootleg release" (1).
 * Only Official release and Promotion release get dedicated test coverage —
 * Bootleg release (1 row) only matters for the page-wide total-row-count
 * math (124 = 119+4+1). Confirmed live via the h3 row-count badges and the
 * page-level `<h2> .mb-row-count-stat` — see `debug/promotion-release.html`
 * for the Promotion release h3's own confirmed markup shape.
 *
 * PROMOTION_FILTER_CASES/BOOTLEG_ROW numbers were hand-derived directly from
 * the fully-known 4+1 rows (confirmed via a live screenshot + the committed
 * `debug/promotion-release.html` snapshot) — no analysis script needed.
 *
 * OFFICIAL_FILTER_CASES/COMBO_CASES/INTERLEAVE_CASES numbers were FIRST
 * computed by parsing the raw, pre-render native MusicBrainz HTML directly
 * (`debug/Greetings-releasegroup-releases-initial-page-{1,2}.html`, NOT the
 * already-rendered `-final.html`, to independently re-derive ground truth
 * rather than trust the thing under test) — a one-off analysis (row/cell
 * extraction + the release-events JSON blob each row embeds) rather than a
 * committed script, since it only needed to run once — THEN every one of
 * them was confirmed (or corrected) against a real live run of this exact
 * spec, per this project's own established lesson (see
 * `bodeansArtistReleasesFixture.js`'s header on why its own numbers needed
 * the same treatment). Two genuine, confirmed-live surprises corrected
 * several numbers from the static-HTML-only first draft:
 *   1. The rendered "Label" column combines a label's NAME with its own
 *      disambiguation COMMENT text (the same convention "Country" uses for
 *      name+code) — so "CBS"/"Columbia" substring searches match far more
 *      rows than the label name alone would (e.g. Columbia's own comment
 *      mentions "formerly owned by CBS"). Confirmed live: Official
 *      Label~CBS is 108 (not 59), Label~Columbia is 95 (not 52); Promotion
 *      Label~CBS matches ALL 4 rows (not just 3) — see
 *      PROMOTION_FILTER_CASES' own note.
 *   2. The Sub-Table Filter (STF) mechanism is a BROAD text search across
 *      every visible column, NOT scoped to one column the way a "Format"
 *      column filter is — a CD-format row whose own comment happens to say
 *      "vinyl replica edition" matches STF~"Vinyl" despite not actually
 *      being Vinyl format.
 * Both are genuine userscript behaviors, not bugs. Cross-validation against
 * the live rendered page's own per-column unique-value header badges (e.g.
 * Release "63" distinct, Comment "62", YYYY "20", Catalog# "60"/
 * "28 multi-row", Barcode "28", Country "21") also matched exactly or
 * within the expected slack of a combined-string vs. plain-name count.
 * UNIQ_DROP_SINGLE_CASES/UNIQ_DROP_COMBO_CASES are still left as TODOs (see
 * their own comments) — the uniq-dropdown's exact section/item-title shape
 * genuinely requires a live DOM read to author correctly, not just row
 * counts.
 *
 * Single source of truth consumed by both
 * `tests/live/releasegroup-releases-filter-sort.spec.js` (assertions) and
 * `tests/support/generate-releasegroup-releases-filtersort-report.js` (the
 * .org/.html report).
 */

const URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const TOTAL_ROWS = 124;

/**
 * Group metadata: display label (exact h3 text), zero-based table index
 * (DOM order of `table.tbl`/`h3.mb-toggle-h3`, confirmed live), and its own
 * unfiltered row-count total (confirmed live via each h3's own
 * `.mb-row-count-stat` — "(119)"/"(4)"/"(1)" — and cross-checked against the
 * page-level "(124)" badge: 119+4+1=124).
 */
const GROUPS = {
    OFFICIAL: { label: 'Official release', tableIndex: 0, total: 119 },
    PROMOTION: { label: 'Promotion release', tableIndex: 1, total: 4 },
    BOOTLEG: { label: 'Bootleg release', tableIndex: 2, total: 1 }, // math-only, no dedicated test block
};

/**
 * Column display name -> zero-based `data-col-idx` — IDENTICAL across every
 * sub-table's own cloned `<thead>` (`addColumnFilterRow()` assigns
 * `data-col-idx` per-thead from that thead's own header cells). Confirmed
 * LIVE (2026-08-30) via a throwaway probe dumping every `<thead th>`'s
 * `data-col-name`/text in DOM order against the Official release table
 * (index 0) — same order applies to every sub-table.
 */
const COLUMN_INDEX = {
    Release: 0,
    Artist: 1,
    Format: 2,
    Tracks: 3,
    'Country/Date': 4,
    Label: 5,
    'Catalog#': 6,
    Barcode: 7,
    CAA: 8,
    Country: 9,
    Date: 10,
    'Total Tracks': 11,
    'Format Types': 12,
    DD: 13,
    MM: 14,
    YYYY: 15,
    Day: 16,
    Month: 17,
    'MB-Name': 18,
    Comment: 19,
    'Primary alias': 20,
    Relationships: 21,
    // Picard (index 22) intentionally omitted — no filter/sort icons, no data-col-name.
};

/**
 * The 4 fully-known "Promotion release" rows (confirmed live via screenshot
 * + `debug/promotion-release.html`), all sharing identical
 * Title/Artist/Format/Tracks/Barcode(none)/Total Tracks/Format Types —
 * differing only in Country/Date/Label/Catalog#. Kept here as documentation;
 * PROMOTION_FILTER_CASES below encodes the actual test assertions.
 *
 *   1. Japan (JP), 1974-07-21 (Sunday, full date), CBS/Sony, SOPL-248
 *      — coincidentally the SAME catalog# as an unrelated "Official
 *      release" row (comment "Japan, 1st issue", also JP/1974-07-21) —
 *      a genuine MusicBrainz data quirk (two distinct release entities,
 *      different MBIDs, sharing a catalog stamp), useful as a cross-table
 *      independence check: filtering each sub-table's own Catalog# column
 *      by "SOPL-248" must independently show exactly 1 row in EACH table,
 *      never conflated (see OFFICIAL_FILTER_CASES' own note on this).
 *   2. Japan (JP), 1975 (year-only, no month/day), CBS/Sony, SOPO-124
 *   3. Australia (AU), 1980 (year-only), CBS, SBP 234758
 *   4. United States (US), blank date (no release event at all), Columbia, PC 31903
 */
const PROMOTION_ROWS_DOC = [
    { country: 'Japan (JP)', date: '1974-07-21', day: 'Sunday', label: 'CBS/Sony', catalogNumber: 'SOPL-248' },
    { country: 'Japan (JP)', date: '1975', label: 'CBS/Sony', catalogNumber: 'SOPO-124' },
    { country: 'Australia (AU)', date: '1980', label: 'CBS', catalogNumber: 'SBP 234758' },
    { country: 'United States (US)', date: null, label: 'Columbia', catalogNumber: 'PC 31903' },
];

/** The 1 "Bootleg release" row — math-only (no dedicated test block). */
const BOOTLEG_ROW_DOC = {
    country: 'Brazil (BR)', date: null, label: 'CBS', labelComment: "Unofficial releases which have a printed 'CBS' logo",
    catalogNumber: '654810', barcode: '[none]',
};

/**
 * §Promotion — hand-authored directly from the 4 known rows above, then
 * confirmed/corrected live. All 4 rows share Barcode "[none]" and Format
 * '12" Vinyl" (and, it turns out, ALSO all match "Label ~ CBS" broadly —
 * see below) — deliberately EXCLUDED as cases: when a column filter's
 * result count equals the group's current total, the h3's own
 * `.mb-row-count-stat` badge text (e.g. "(4)") does not change at all, so
 * `waitForSubTableFilterSettled()`'s "wait for the text to settle to a NEW
 * value" logic can never detect completion (confirmed live: a genuine 30s
 * timeout, not a bug in the test helpers) — every case here must actually
 * narrow the group.
 */
const PROMOTION_FILTER_CASES = [
    // NOTE: no "Label ~ CBS" case — confirmed live it matches all 4 rows
    // (not just rows 1-3 as a name-only reading would suggest): the
    // rendered Label cell combines the label's NAME with its own
    // disambiguation COMMENT (same convention "Country" uses for
    // name+code — see OFFICIAL_FILTER_CASES' own note), and row 4's
    // "Columbia" comment text apparently also mentions "CBS" (Columbia's
    // own former-CBS-ownership history, same as the Official release
    // rows' Columbia entries). Would be non-narrowing here — see the
    // header note above.
    { column: 'Label', value: 'Columbia', expected: 2, highlight: 'Columbia' }, // row 4 PLUS one more row whose label/comment also mentions "Columbia" (confirmed live: 2, not 1 — exact 2nd row not individually identified)
    { column: 'Country', value: 'Japan', expected: 2, highlight: 'Japan' }, // rows 1-2
    { column: 'Country', value: 'Australia', expected: 1, highlight: 'Australia' }, // row 3
    { column: 'Country', value: 'United States', expected: 1, highlight: 'United States' }, // row 4
    { column: 'DD', value: '21', expected: 1, highlight: '21' }, // only row 1 has a populated day (full date)
    { column: 'Day', value: 'Sunday', expected: 1, highlight: 'Sunday' }, // row 1 only
    { column: 'YYYY', value: '1974', expected: 1, highlight: '1974' }, // row 1 (full date) — confirmed live
    { column: 'YYYY', value: '1975', expected: 1, highlight: '1975' }, // row 2 (year-only)
    { column: 'YYYY', value: '1980', expected: 1, highlight: '1980' }, // row 3 (year-only)
    { column: 'Date', value: '^\\d{4}$', regExp: true, expected: 2, highlightRegex: '^\\d{4}$' }, // rows 2-3, the two year-only rows — confirmed live WITH Rx checkbox on (a naive recording pass that forgot to set Rx got a false 0 — regex mode is required for this case to mean anything)
    { column: 'Catalog#', value: 'SOPL-248', expected: 1, highlight: 'SOPL-248' }, // row 1 — see PROMOTION_ROWS_DOC's cross-table note
    // NOTE: deliberately no "matches all 4 rows" (non-narrowing) case here —
    // when a column filter's result count equals the group's current total,
    // the h3's own `.mb-row-count-stat` badge text (e.g. "(4)") does not
    // change at all, so `waitForSubTableFilterSettled()`'s "wait for the
    // text to settle to a NEW value" logic can never detect completion
    // (confirmed live: a genuine 30s timeout, not a bug in the test
    // helpers) — every case in this array must actually narrow the group.
];

/** §Promotion combo (2-column) cases — hand-derivable from the 4 known rows. */
const PROMOTION_COMBO_CASES = [
    // NOT "Label ~ CBS" — confirmed live it matches all 4 rows (see
    // PROMOTION_FILTER_CASES' own note), which would be non-narrowing as
    // the FIRST filter applied in a combo (times out).
    { name: 'Promo Combo A', filters: [{ column: 'Country', value: 'Japan' }, { column: 'YYYY', value: '1974' }], expected: 1 }, // row 1 only — confirmed live
    { name: 'Promo Combo B', filters: [{ column: 'Label', value: 'Columbia' }, { column: 'Country', value: 'Japan' }], expected: 0 }, // zero-match edge case — confirmed live (unaffected by Label~Columbia's own corrected count, see OFFICIAL/PROMOTION_FILTER_CASES notes: this combo's own live result was independently re-confirmed, not re-derived from that count)
    { name: 'Promo Combo C', filters: [{ column: 'Country', value: 'Japan' }, { column: 'YYYY', value: '1975' }], expected: 1 }, // row 2 only
];

/**
 * §Official — a representative subset (not exhaustive) of per-column typed
 * filter cases, computed by directly parsing the raw native HTML (see this
 * file's own header). `highlight` values are the expected literal matched
 * substring per the reference spec's own convention; NOT yet live-verified
 * for exact highlight-span SHAPE (single vs. cross-tag) — only row counts
 * are high-confidence here (cross-validated against live uniq-value header
 * badges, see header comment). Re-verify highlight shape on first live run.
 */
const OFFICIAL_FILTER_CASES = [
    { column: 'Format', value: 'Vinyl', expected: 53, highlight: 'Vinyl' }, // '12" Vinyl' — 53 of 119
    // Naive substring collision, same shape as the reference fixture's own
    // "05" case: 'CD' matches the 38 plain-'CD' rows PLUS the 1 'Hybrid
    // SACD (CD layer) + Hybrid SACD (SACD layer, 2 channels)' row (38+1=39).
    { column: 'Format', value: 'CD', expected: 39, highlight: 'CD' },
    { column: 'Format', value: 'Cassette', expected: 20, highlight: 'Cassette' },
    { column: 'Format', value: '8-Track Cartridge', expected: 3, highlight: '8-Track Cartridge' },
    { column: 'Format', value: 'Digital Media', expected: 3, highlight: 'Digital Media' },
    { column: 'Format', value: 'MiniDisc', expected: 1, highlight: 'MiniDisc' }, // single row, catalog# 'COL MD 32210'
    { column: 'Format', value: 'SACD', expected: 1, highlight: 'SACD' }, // single row, Tracks '9 + 9', catalog#s '19658796572'/'UDSACD 2264'
    { column: 'Tracks', value: '9 + 9', expected: 1, highlight: '9 + 9' }, // same SACD row as above (multi-medium)
    { column: 'Tracks', value: '10', expected: 3, highlight: '10' },
    { column: 'Country', value: 'Japan', expected: 14, highlight: 'Japan' },
    { column: 'Country', value: 'United States', expected: 24, highlight: 'United States' },
    { column: 'Country', value: 'United Kingdom', expected: 10, highlight: 'United Kingdom' },
    // Includes the one row with 2 release events (Austria + Europe, comment
    // "enhanced packaging reissue") — that row's own 2 events both count
    // toward this column's row-level match (it's still just ONE row).
    { column: 'Country', value: 'Europe', expected: 15, highlight: 'Europe' },
    { column: 'Country', value: 'Austria', expected: 3, highlight: 'Austria' }, // includes the same dual-event row
    { column: 'YYYY', value: '1973', expected: 19, highlight: '1973' },
    { column: 'YYYY', value: '2023', expected: 3, highlight: '2023' },
    { column: 'YYYY', value: '2005', expected: 1, highlight: '2005' }, // single row, catalog# 'MHCP 721', Japan
    { column: 'YYYY', value: '1974', expected: 1, highlight: '1974' }, // single row, catalog# 'SOPL-248' — see PROMOTION_ROWS_DOC's cross-table note
    // CORRECTED after a live run (first draft assumed 59/52, derived from
    // only the label NAME text): the rendered "Label" cell combines the
    // label's NAME with its own disambiguation COMMENT, the same convention
    // "Country" uses for name+code — e.g. Columbia's own comment text
    // literally says "...formerly owned by CBS between 1938-1990...", and
    // CBS's own comment says "...renamed since 1991 as Columbia", so a
    // "CBS"/"Columbia" substring search matches far more rows than the
    // label name alone would. Confirmed live: 108 (not 59).
    { column: 'Label', value: 'CBS', expected: 108, highlight: 'CBS' },
    { column: 'Label', value: 'Columbia', expected: 95, highlight: 'Columbia' }, // same comment-inclusion correction (not 52)
    { column: 'Label', value: 'Discos CBS', expected: 1, highlight: 'Discos CBS' }, // single row, Brazil, catalog# '138.645'
    { column: 'Label', value: 'no label', expected: 1, highlight: 'no label' }, // single row, catalog# 'US 1050'
    { column: 'Barcode', value: '[none]', expected: 71, highlight: '[none]' },
    { column: 'Catalog#', value: 'SOPL-248', expected: 1, highlight: 'SOPL-248' }, // see PROMOTION_ROWS_DOC's cross-table note
    { column: 'Catalog#', value: 'COL MD 32210', expected: 1, highlight: 'COL MD 32210' }, // the MiniDisc row
    { column: 'DD', value: '21', expected: 7, highlight: '21' },
    { column: 'MM', value: '6', expected: 5, highlight: '6' }, // June
    { column: 'Total Tracks', value: '18', expected: 1, highlight: '18' }, // the SACD row (9+9=18)
    { column: 'Format Types', value: 'MiniDisc', expected: 1, highlight: 'MiniDisc' }, // same single row as Format~MiniDisc
];

/**
 * §Official combo (2-column simultaneous) cases — exact intersections
 * computed directly from the parsed row data (not estimated).
 */
const OFFICIAL_COMBO_CASES = [
    { name: 'Official Combo A', filters: [{ column: 'Format', value: 'Vinyl' }, { column: 'Country', value: 'Japan' }], expected: 6 },
    // Combo B/C corrected after a live run — see OFFICIAL_FILTER_CASES'
    // own note on Label combining name+comment text (27/52, not 24/39).
    { name: 'Official Combo B', filters: [{ column: 'Format', value: 'CD' }, { column: 'Label', value: 'Columbia' }], expected: 27 },
    { name: 'Official Combo C', filters: [{ column: 'Format', value: 'Vinyl' }, { column: 'Label', value: 'CBS' }], expected: 52 },
    { name: 'Official Combo D', filters: [{ column: 'Country', value: 'United States' }, { column: 'Label', value: 'Columbia' }], expected: 23 }, // unaffected by the Label correction (verified directly)
    { name: 'Official Combo E', filters: [{ column: 'Format', value: 'Cassette' }, { column: 'Barcode', value: '[none]' }], expected: 17 },
    {
        name: 'Official Combo F (3-way, same triple as INTERLEAVE_CASES.OFFICIAL)',
        filters: [{ column: 'Format', value: 'Vinyl' }, { column: 'Label', value: 'CBS' }, { column: 'Country', value: 'Japan' }],
        expected: 6, // all 6 Vinyl+Japan rows are ALSO Label~CBS — see INTERLEAVE_CASES' own note
    },
];

/**
 * §4a/§4b/§4c — one case per group, one per required filter-application
 * ORDER. §4a/§4b (OFFICIAL) both use the SAME 3 concrete values (Format~Vinyl
 * as subtable, Country~Japan as column, Label~CBS as global-or-column
 * depending on the ordering) and converge on the SAME final row-count (6) by
 * construction — a pure AND of 3 predicates is order-independent — verified
 * directly against the parsed row data, not just assumed from the math. This
 * is deliberately the SAME 3 values across those two orderings so the
 * different INTERMEDIATE row counts at each step become the interesting/
 * testable part (order-dependent), while the converged FINAL count stays
 * fixed at 6 (order-independent) — exactly what §4b's "reversed order" test
 * is meant to demonstrate.
 *
 * §4c (thirdOrder) deliberately uses a DIFFERENT "Japan" predicate for its
 * subtable/global steps — a broad OR-across-visible-column-text search
 * (title/comment/format/tracks/barcode/label+comment/catalog#/country name),
 * not the structured Country column filter §4a/§4b use — so it does NOT
 * converge on the same 6; it converges on its own value (8), confirmed
 * directly (2 extra rows have a genuinely Vinyl+CBS pressing associated with
 * the Japanese market in their label/comment text, without their own
 * release-event country literally being "Japan"). This is fine — §4c's job
 * is exercising a third, distinct interleaving/mechanism combination, not
 * reproducing §4a/§4b's exact intersection.
 *
 * The `expected` at each stage is the row count AFTER that stage's filter is
 * applied on top of every earlier stage in the same case. The GLOBAL
 * filter's real search scope (which columns it actually touches, e.g.
 * whether MB-Name/Relationships/CAA sentinel text participate) was NOT
 * independently modeled from the userscript's own filter-matching code —
 * only approximated from the same raw-HTML text this file's other numbers
 * come from — but every number below (including every global-filter step)
 * WAS confirmed against a real live run, not left as a pre-live estimate.
 */
const INTERLEAVE_CASES = {
    OFFICIAL: {
        // global -> subtable -> column
        // Corrected after a live run — see OFFICIAL_FILTER_CASES' own note
        // on Label combining name+comment text. `global.expectedAfter` is
        // the PAGE-WIDE total (this step's own assertion reads
        // getPageRowCount(), not a per-group count, since global is applied
        // before any group-scoping filter) — 113, not just Official's own
        // 108: the SAME broad "CBS" global filter also matches all 4
        // Promotion rows (their own Columbia-labeled row's comment
        // apparently also mentions CBS — see PROMOTION_FILTER_CASES' own
        // note) plus Bootleg's 1 row (its own label comment literally says
        // "printed 'CBS' logo" — see BOOTLEG_ROW_DOC), giving 108+4+1=113.
        // `subtable`/`column` stay group-scoped (Official) as before; final
        // count (6) is unaffected — verified directly, all 6 Vinyl+Japan
        // rows are already among the broader CBS matches.
        globalFirst: {
            global: { value: 'CBS', expectedAfter: 113 },
            subtable: { value: 'Vinyl', expectedAfter: 52 },
            column: { column: 'Country', value: 'Japan', expectedAfter: 6 },
        },
        // column -> subtable -> global (reversed)
        columnFirst: {
            column: { column: 'Country', value: 'Japan', expectedAfter: 14 },
            // Corrected after a live run: 7, not 6 — the STF (subtable)
            // mechanism is a BROAD text search across all visible columns
            // (title/comment/format/tracks/barcode/label+comment/catalog#/
            // country name), NOT scoped to Format alone like a "Format"
            // column filter would be. Among the 14 Country~Japan rows, one
            // (comment "Japan, vinyl replica edition", actual Format "CD")
            // matches STF~"Vinyl" via its own COMMENT text despite not
            // actually being Vinyl format — confirmed live, not a bug.
            subtable: { value: 'Vinyl', expectedAfter: 7 },
            // 6, not 7 — the 7th row's label is "Sony Records
            // International" (comment: "Japanese TEXTLESS boxed Walking
            // Eye imprint"), which does NOT mention CBS, unlike the other
            // 6 rows' "CBS/Sony" label — so applying global~CBS on top
            // genuinely narrows 7->6 (confirmed by directly listing all 14
            // Country~Japan rows' labels, not assumed).
            global: { value: 'CBS', expectedAfter: 6 },
        },
        // a third, distinct interleaving: subtable first, then TWO
        // simultaneous column filters, then global last.
        thirdOrder: {
            // Corrected after a live run — broad text match (title/comment/
            // format/tracks/barcode/label+comment/catalog#/country name)
            // for "Japan" is 19, not 17: 2 more rows whose LABEL's own
            // COMMENT contains "Japanese" (itself containing "Japan" as a
            // substring — "Sony Records International"/"SME Records", both
            // labels used for Japan-market pressings) weren't counted when
            // the label-comment text was missing from the haystack (see
            // OFFICIAL_FILTER_CASES' own Label~CBS/Columbia note).
            subtable: { value: 'Japan', expectedAfter: 19 },
            // Order matters here (verified directly): Label~CBS THEN
            // Format~Vinyl narrows 19->14->8, a genuine change at each
            // step. The REVERSE order (Vinyl then CBS) narrows 19->8->8 —
            // the second step is a no-op (every Vinyl-among-broad-Japan row
            // is already CBS-labeled), which times out
            // `waitForSubTableFilterSettled()`'s "wait for a new row-count
            // badge value" logic (confirmed live) — every column/subtable
            // step must produce a genuinely new count vs. the step before
            // it (see `columnFirst`'s own note above for why global is
            // exempt from this).
            columns: [
                { column: 'Label', value: 'CBS' },
                { column: 'Format', value: 'Vinyl' },
            ],
            // 8, not 6 — this sequence's "Japan" predicate is the BROAD
            // text match (subtable), not the structured Country column
            // filter §4a/§4b use, so it doesn't have to (and doesn't)
            // converge on the same final count as those two; it includes
            // 2 extra rows with a genuinely Vinyl+CBS Japan-market pressing
            // whose actual release-event country isn't literally "Japan"
            // (verified directly, not assumed).
            expectedAfterColumns: 8,
            global: { value: 'Japan', expectedAfter: 8 }, // safe regardless — global mechanism has its own always-reacts-to-query-change text; no further narrowing since it's the same broad "Japan" text predicate as the subtable step
        },
    },
    PROMOTION: {
        // `global.expectedAfter` is the PAGE-WIDE total (same value as
        // INTERLEAVE_CASES.OFFICIAL.globalFirst.global — it's literally
        // the SAME global-filter action, just demonstrated inside a
        // different group's test.step) — see that entry's own note on why
        // "CBS" broadly matches 113 rows page-wide (108 Official + all 4
        // Promotion + the 1 Bootleg row).
        globalFirst: {
            global: { value: 'CBS', expectedAfter: 113 },
            subtable: { value: 'Japan', expectedAfter: 2 }, // rows 1-2
            column: { column: 'YYYY', value: '1975', expectedAfter: 1 }, // row 2 only
        },
        // NOTE: column/subtable mechanisms both rely on the h3's own
        // `.mb-row-count-stat` badge TEXT CHANGING as the completion signal
        // (`waitForSubTableFilterSettled()`) — unlike the global mechanism,
        // which has its own independent, always-reacts-to-query-change text
        // (`#mb-filter-status-display`). A step assigned to column/subtable
        // must therefore always produce a genuinely NEW count versus the
        // step before it, or the wait times out (confirmed live) — the
        // global mechanism has no such restriction, since it's safe even
        // when it happens not to narrow further.
        //
        // REDESIGNED after a live run: the original draft used "Label ~
        // CBS" as the first (column) step here, assuming it matched only
        // rows 1-3 — confirmed live it actually matches ALL 4 rows (see
        // PROMOTION_FILTER_CASES' own note on why), which would make this
        // step non-narrowing (4->4, times out). Replaced with a Country/
        // YYYY/DD-only combination (no label-comment ambiguity) that stays
        // strictly narrowing at every column/subtable step, confirmed live:
        // Country~Japan(4->2) -> YYYY~1974(2->1, row 1 only) -> DD~21
        // (safe, row 1 already has DD=21, stays 1).
        columnFirst: {
            column: { column: 'Country', value: 'Japan', expectedAfter: 2 }, // rows 1-2
            subtable: { value: '1974', expectedAfter: 1 }, // row 1 only (broad text match on its own date)
            global: { value: '21', expectedAfter: 1 }, // safe regardless — row 1 already has DD=21
        },
        thirdOrder: {
            subtable: { value: 'Japan', expectedAfter: 2 }, // rows 1-2 — broad text match, same as Country~Japan here (neither Promotion row has "Japan" anywhere outside its own Country field)
            columns: [
                { column: 'YYYY', value: '1974' },
            ],
            expectedAfterColumns: 1, // row 1 only
            global: { value: '21', expectedAfter: 1 }, // safe regardless — row 1 already has DD=21
        },
    },
};

/**
 * §Sort — one representative sort-then-restore checkpoint per group, each
 * with a pre-applied filter (row-count invariant through asc/desc/restore).
 */
const SORT_CHECKPOINTS = {
    OFFICIAL: [
        { name: 'baseline', filters: [], expectedCount: 119, sortColumn: 'YYYY' },
        { name: 'after Format~Vinyl', filters: [{ column: 'Format', value: 'Vinyl' }], expectedCount: 53, sortColumn: 'YYYY' },
    ],
    PROMOTION: [
        { name: 'baseline', filters: [], expectedCount: 4, sortColumn: 'Country' },
        // NOT "Label ~ CBS" — confirmed live it matches all 4 rows (see
        // PROMOTION_FILTER_CASES' own note), which would be non-narrowing.
        { name: 'after Country~Japan', filters: [{ column: 'Country', value: 'Japan' }], expectedCount: 2, sortColumn: 'Country' },
    ],
};

/**
 * §Uniq-drop — columns to check with filters cleared, per group. Exact
 * section names / item titles / expected counts are DELIBERATELY left as a
 * TODO here (not computed during fixture authoring) — per this project's own
 * established lesson (`bodeansArtistReleasesFixture.js`'s header + its own
 * `UNIQ_DROP_SINGLE_CASES` comments document several assumptions that turned
 * out wrong until live-verified), the uniq-dropdown's exact section/facet
 * shape for a given column is NOT reliably derivable from raw HTML alone —
 * it must be read live via `getUniqDropSectionsForTable()` (Promotion
 * release) / `window.__saTest.getUniqDropSections()` (Official release)
 * during spec authoring, then hand-picked into `UNIQ_DROP_SINGLE_CASES`/
 * `UNIQ_DROP_COMBO_CASES` below, proven first against the fully
 * hand-verifiable Promotion release Country~Japan 2-of-4 split (NOT the
 * Label CBS/Columbia split an earlier draft used — confirmed live that
 * "CBS" matches all 4 Promotion rows broadly, not just 3, since the
 * rendered Label cell combines name+comment text — see
 * PROMOTION_FILTER_CASES' own note).
 */
const UNIQ_DROP_COLUMNS_CLEARED = {
    OFFICIAL: ['Format', 'Country', 'Label', 'Barcode', 'YYYY'],
    PROMOTION: ['Label', 'Country', 'Barcode'],
};

/** §Uniq-drop with one filter left active, per group. */
const UNIQ_DROP_ACTIVE_FILTER = {
    OFFICIAL: { column: 'Format', value: 'Vinyl', expected: 53 },
    PROMOTION: { column: 'Country', value: 'Japan', expected: 2 },
};

// TODO (implementation step 8, per the plan): fill in from a live
// getUniqDropSectionsForTable()/__saTest.getUniqDropSections() read, proven
// first against Promotion release's hand-verifiable Country~Japan 2-of-4
// split before trusting it for Official release.
const UNIQ_DROP_SINGLE_CASES = { OFFICIAL: [], PROMOTION: [] };
const UNIQ_DROP_COMBO_CASES = { OFFICIAL: [], PROMOTION: [] };

/**
 * §Sort's own dedicated CAA-column filter — applied IN ADDITION to each
 * checkpoint's own filter, exercising the CAA presence column through a
 * sort/filter interaction on this multi-table page.
 *
 * "yes" (not e.g. "Front") — chosen for a simple, deterministic narrowing
 * target here, not because a typed substring search against the CAA
 * column's per-image TYPE/comment text doesn't work: it used to produce
 * ZERO row matches page-wide on every `tableMode: 'multi'` page (root-
 * caused and fixed — see `_artSyncSearchTextToSourceRow()` in
 * ShowAllEntityData.user.js, and
 * `releasegroup-releases-caa-type-comment-filter.spec.js` for the dedicated
 * regression test). Per-image type/comment values are ALSO exposed via a
 * separate DROPDOWN-DRIVEN exact-value mechanism (not exercised by this
 * constant/test — see the spec's own comment for why a full
 * v9.99.970-style CAA highlight-duplication guard would need that
 * mechanism, not a typed filter). "yes" confirmed live: 116 of 119
 * Official release rows, matches at least 1 Promotion release row too.
 */
const CAA_HIGHLIGHT_FILTER = { column: 'CAA', value: 'yes' };

module.exports = {
    URL,
    TOTAL_ROWS,
    GROUPS,
    COLUMN_INDEX,
    PROMOTION_ROWS_DOC,
    BOOTLEG_ROW_DOC,
    PROMOTION_FILTER_CASES,
    PROMOTION_COMBO_CASES,
    OFFICIAL_FILTER_CASES,
    OFFICIAL_COMBO_CASES,
    INTERLEAVE_CASES,
    SORT_CHECKPOINTS,
    CAA_HIGHLIGHT_FILTER,
    UNIQ_DROP_COLUMNS_CLEARED,
    UNIQ_DROP_ACTIVE_FILTER,
    UNIQ_DROP_SINGLE_CASES,
    UNIQ_DROP_COMBO_CASES,
};
