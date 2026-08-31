'use strict';

/**
 * Entry point for the `artist-releases-filter-sort.spec.js` report — a thin
 * config object handed to the shared, config-driven engine in
 * `tests/support/filtersortReportGenerator.js` (extracted from what used to
 * be this file's own ~360-line standalone implementation, so a future new
 * suite's report doesn't require copy-pasting it).
 *
 * Usage (unchanged from before the extraction):
 *   playwright test tests/live/artist-releases-filter-sort.spec.js \
 *     --project=chromium-live --reporter=json \
 *     | node tests/support/generate-filtersort-report.js
 *
 * Output filenames are now TIMESTAMPED (e.g.
 * debug/artist-releases-filterSort-test-report-2026-08-31T10-15-03-123Z.org)
 * so repeated runs never overwrite a previous report — see
 * `filtersortReportGenerator.js`'s own `main()` JSDoc.
 */

const { main } = require('./filtersortReportGenerator');

/**
 * Classifies a case/step title into a coverage category, purely by pattern
 * matching against the section markers (§A/§A2/§A3/§B/…) and keywords this
 * spec's own titles consistently use — no per-step custom metadata needed.
 * Order matters: more specific patterns are checked before their broader
 * parent section (e.g. "§A3"/"highlight" before the bare "§A" filter-case
 * fallback), since `title` often contains multiple section markers (the
 * parent test's title is prefixed onto every one of its steps).
 *
 * @param {string} title
 * @returns {string}
 */
function classifyCase(title) {
    const t = title.toLowerCase();
    if (t.includes('§a3') || t.includes('caa column expanded')) return 'Highlighting (CAA expanded)';
    if (t.includes('§a2') || t.includes('chaban') || t.includes('third-party')) return 'Third-party interop';
    if (t.includes('collapse') || t.includes('multi-row') || t.includes('has-match')) return 'Multi-row / collapse indicator';
    if (t.includes('§d') || t.includes('§e') || t.includes('dropdown')) return 'Uniq-dropdown contents';
    if (t.includes('§f') || t.includes('single value:') || t.includes('combination:')) return 'Uniq-dropdown-driven filter';
    if (t.includes('§j') || t.includes('pre-filtered')) return 'Pre-filtered disk-load (§J)';
    if (t.includes('§k') || t.includes('column-visibility') || t.includes('hiding then re-showing')) return 'Column visibility (§K)';
    if (t.includes('§c') || t.includes('checkpoint:')) return 'Sort-then-restore';
    if (t.includes('§b') || t.includes('combo:') || t.includes('order pair')) return 'Combo / global+column order';
    if (t.includes('§a ') || t.includes('§a per-column')) return 'Typed column filter';
    return 'Other';
}

main({
    suiteLabel: 'artist-releases (BoDeans)',
    specPath: 'tests/live/artist-releases-filter-sort.spec.js',
    outputBasename: 'artist-releases-filterSort-test-report',
    classifyCase,
    // No classifyGroup — artist-releases is tableMode: 'single', no
    // per-sub-table dimension to break coverage down by.
    methodologySections: [
        {
            heading: 'Ground-truth provenance',
            body: `Every expected count in the spec (see
tests/support/bodeansArtistReleasesFixture.js) was derived directly from
debug/BoDeans-artist-releases-final.html (the committed rendered baseline,
captured with real CAA/Relationships network access) and cross-checked
against debug/BoDeans-artist-releases-original.html (the true raw,
pre-script MusicBrainz HTML) — 8 of 8 core stats matched exactly between
the two files (Artist 55/1 case-variant split, all 9 Format buckets,
Label/Catalog#/Barcode breakdowns, CAA's 37/19 sort-key split).`,
        },
        {
            heading: 'Single Cc/Rx/Ex checkbox triad',
            body: `\`artist-releases\` is tableMode: 'single', so there is only ONE Cc/Rx/Ex
checkbox triad on the whole page — it governs the global filter AND every
column filter identically. There is no per-column-filter-row override (that
only exists on tableMode: 'multi' pages' Sub-Table Filter panel).`,
        },
    ],
    sectionKey: [
        { marker: '§A', description: 'per-column typed filter cases (plus highlight assertion, and — since the same test.step loop also folds in §I — the filter-status text/row-count tooltip/highlight-toggle-button UI-state assertions, and a multi-row collapse-indicator (`.mb-collapse-toggle-has-match`) check on the Catalog# case)' },
        { marker: '§A2', description: 'chaban day-of-week third-party-interop case (Country/Date ~ "Tue")' },
        { marker: '§A3', description: "CAA column expanded, type/comment highlighting (live fetch only — see that test's own JSDoc for why the disk-fixture path can't cover this)" },
        { marker: '§B', description: 'combo / global+column-order-pair cases (also folds in §I)' },
        { marker: '§C', description: 'sort-then-restore checkpoints (also folds in §I where a filter is active)' },
        { marker: '§D', description: 'uniq-dropdown checks, filters cleared' },
        { marker: '§E', description: 'uniq-dropdown checks, one filter left active' },
        { marker: '§F', description: 'uniq-dropdown-DRIVEN filtering (checking items, not typing)' },
        { marker: '§J', description: 'pre-filtered disk-load repeat (opt-in, TEST_PREFILTER_LOAD=1)' },
        { marker: '§K', description: 'column-visibility exercise (opt-in, TEST_COLVIS=1)' },
    ],
});
