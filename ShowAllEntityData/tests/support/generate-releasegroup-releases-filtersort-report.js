'use strict';

/**
 * Entry point for the `releasegroup-releases-filter-sort.spec.js` report — a
 * thin config object handed to the shared, config-driven engine in
 * `tests/support/filtersortReportGenerator.js` (the same engine
 * `generate-filtersort-report.js` uses for `artist-releases-filter-sort.spec.js`).
 *
 * Usage:
 *   playwright test tests/live/releasegroup-releases-filter-sort.spec.js \
 *     --project=chromium-live --reporter=json \
 *     | node tests/support/generate-releasegroup-releases-filtersort-report.js
 *
 * Output: a TIMESTAMPED `.org`/`.html` pair in `debug/` (e.g.
 * debug/releasegroup-releases-filterSort-test-report-2026-08-31T10-15-03-123Z.org)
 * — see `filtersortReportGenerator.js`'s own `main()` JSDoc.
 */

const { main } = require('./filtersortReportGenerator');

/**
 * Classifies a case/step title into a coverage category, purely by pattern
 * matching against this suite's own section markers (§4a/§4b/§4c/Sort/
 * Uniq-drop) and keywords — mirrors `generate-filtersort-report.js`'s own
 * `classifyCase()` shape, adapted for this suite's own section names.
 *
 * @param {string} title
 * @returns {string}
 */
function classifyCase(title) {
    const t = title.toLowerCase();
    if (t.includes('§sort') || t.includes('checkpoint') || t.includes('asc -> desc -> restore')) return 'Sort-then-restore';
    if (t.includes('uniq-drop') || t.includes('dropdown')) return 'Uniq-dropdown';
    if (t.includes('§4a')) return 'Filter order: global -> subtable -> column';
    if (t.includes('§4b')) return 'Filter order: column -> subtable -> global (reversed)';
    if (t.includes('§4c')) return 'Filter order: third distinct interleaving';
    if (t.includes('combo') || t.includes('3-way')) return 'Combo (2/3-column) filter';
    if (t.includes('~')) return 'Typed column filter';
    if (t.includes('renders') && t.includes('sub-table')) return 'Smoke (baseline render)';
    return 'Other';
}

/**
 * Extracts which sub-table/group a case/step's title exercises — every
 * scenario in this suite runs once per group, each of its own
 * `test.step()`s prefixed with a `[Official release]`/`[Promotion release]`
 * marker (see the spec's own test.step naming).
 *
 * IMPORTANT: every TOP-LEVEL test() in this suite is itself titled
 * "... (Official release + Promotion release)" — covering both groups at
 * once — so `walkSteps()`'s `${parentTitle} › ${step.title}` prefixing means
 * every step's FULL title contains BOTH group name substrings regardless of
 * which one the step itself is actually about. Matching on the bare
 * substring "Official release" (checked first) would therefore
 * misclassify every Promotion-only step as Official — this must match
 * ONLY the step's own leading `[Group]` bracket marker, which is genuinely
 * step-specific. A top-level test() title alone (no bracket) correctly
 * returns null (no group dimension for it) — it covers both groups, not
 * one.
 *
 * @param {string} title
 * @returns {string|null}
 */
function classifyGroup(title) {
    if (title.includes('[Official release]')) return 'Official release';
    if (title.includes('[Promotion release]')) return 'Promotion release';
    return null;
}

main({
    suiteLabel: 'releasegroup-releases (Greetings From Asbury Park, N.J.)',
    specPath: 'tests/live/releasegroup-releases-filter-sort.spec.js',
    outputBasename: 'releasegroup-releases-filterSort-test-report',
    classifyCase,
    classifyGroup,
    methodologySections: [
        {
            heading: 'Ground-truth provenance',
            body: `Every expected count in the spec (see
tests/support/greetingsReleaseGroupReleasesFixture.js) was derived by
parsing the raw, pre-render native MusicBrainz HTML directly
(debug/Greetings-releasegroup-releases-initial-page-{1,2}.html — NOT the
already-rendered -final.html, to independently re-derive ground truth
rather than trust the thing under test), then confirmed and — where a live
run surfaced a genuine surprise (see below) — corrected against real runs
of this exact spec. "Promotion release"'s 4 rows and "Bootleg release"'s 1
row were additionally hand-confirmed via a live screenshot and the
committed debug/promotion-release.html snapshot.`,
        },
        {
            heading: 'Per-sub-table Cc/Rx/Ex checkboxes (tableMode: multi)',
            body: `\`releasegroup-releases\` is tableMode: 'multi', so — unlike
\`artist-releases\`'s single global checkbox triad — EACH sub-table has its
own independent Cc/Rx/Ex checkbox triad (inside its own h3's Sub-Table
Filter panel), which governs BOTH that sub-table's own STF string AND its
own column-level filters. The page-wide global-filter checkboxes govern
ONLY the global filter string. Confirmed directly against
\`runFilter()\`'s multi-table branch in ShowAllEntityData.user.js, not
assumed.`,
        },
        {
            heading: 'Live corrections this suite required (illustrative, not exhaustive)',
            body: `Two real, confirmed-live surprises shaped several of this
suite's expected counts: (1) the rendered "Label" column combines a
label's NAME with its own disambiguation COMMENT text — so a "CBS"/
"Columbia" substring search matches far more rows than the label name
alone would (e.g. Columbia's own comment mentions "formerly owned by
CBS"), the same convention "Country" uses for name+code; (2) the
Sub-Table Filter (STF) mechanism is a BROAD text search across every
visible column, not scoped to one column the way a "Format" column filter
is — a CD-format row whose own COMMENT happens to say "vinyl replica
edition" matches STF~"Vinyl" despite not actually being Vinyl format. Both
are genuine userscript behaviors, not bugs — see the fixture file's own
inline notes for the specific numbers each one corrected.`,
        },
    ],
    sectionKey: [
        { marker: 'Smoke', description: 'baseline render assertion — 124 rows across 3 sub-tables (Official release 119, Promotion release 4, Bootleg release 1), matching the fixture ground truth' },
        { marker: 'Typed filter', description: 'per-column typed filter cases (plus highlight assertion), one representative subset per group' },
        { marker: 'Combo', description: '2-column and 3-way simultaneous column-filter cases, per group' },
        { marker: '§4a', description: 'filter-order interleaving: global -> sub-table -> column' },
        { marker: '§4b', description: 'filter-order interleaving: column -> sub-table -> global (reversed) — confirms order-independence of the final narrowed result' },
        { marker: '§4c', description: 'a third, distinct interleaving (subtable -> column(s) -> global)' },
        { marker: 'Sort', description: 'sort-then-restore checkpoints (asc -> desc -> restore) with a pre-applied column filter plus the CAA presence filter ("yes"/"no" — its only typed-substring-searchable state; per-image type/comment text is dropdown-driven instead), confirming row count survives a sort/filter interaction on this multi-table page' },
        { marker: 'Uniq-drop', description: "uniq-value dropdown contents (filters cleared and one filter active) — Official release via the existing window.__saTest.getUniqDropSections() hook, Promotion release via a new table-scoped getUniqDropSectionsForTable() helper (that hook is NOT table-scoped — see the spec's own architecture notes)" },
    ],
});
