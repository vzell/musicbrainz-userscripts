'use strict';

/**
 * The one registry of instrumented perf pageTypes, and the shape the capture
 * scripts consume.
 *
 * Before this module a pageType had to be registered in THREE places —
 * `ARMS` in `capture-interaction-perf.js`, `DESCRIPTORS` in
 * `scripts/probe-fixture-columns.js`, and a bare `const PAGE_TYPE` in
 * `capture-pass-cost.js` (which had no `--pageType=` flag at all, so its one
 * committed arm sat on the single instrumented page carrying neither a Picard
 * column nor an ERG button). That is the same drift `runMetadata.js` was
 * extracted to prevent, one level up: not "which host and which filename" but
 * "which pages can be measured at all".
 *
 * A descriptor is a plain constant module under `tests/support/`, shared with
 * the correctness specs (see `artistEventsFixture.js`'s own JSDoc on why those
 * constants live in one place). Every constant in one must be MEASURED from the
 * committed disk fixture via `scripts/probe-fixture-columns.js`, never chosen —
 * a filter value that matches nothing reads as a fast result, not as a failure.
 *
 * ── The multi-table contract ─────────────────────────────────────────────────
 *
 * `TABLE_MODE` is what makes a descriptor's numbers interpretable, and it is
 * not cosmetic. On a `'multi'` page most of the harness's helpers are silently
 * sub-table-0-scoped: `columnIndex()` `findIndex`es across every
 * `table.tbl thead th` on the page, and `columnFilterInput()`/
 * `columnFilterClear()` take `.first()` of one input per sub-table. So on a
 * 47-sub-table page a "column filter" metric measures ONE sub-table, while the
 * global filter and both header-count metrics really are page-wide
 * (`waitForColHeaderCountsStable()` reads every badge on the page). Sorting is
 * stricter still: a multi-table sort writes only its own group's
 * `h3 .mb-sort-status` and never touches `#mb-sort-status-display`, so
 * `waitForSortSettled()` MUST be given that group — omit it and the wait times
 * out with the page having sorted perfectly well.
 *
 * A `'multi'` descriptor therefore also declares `SUB_TABLE_INDEX` (which
 * sub-table the per-table metrics act on) and its `UNIQ_COUNT_*` constants
 * describe THAT SUB-TABLE, not the page. Resolution is by INDEX, never by
 * heading text: `waitForSortSettled()`'s own JSDoc records that a `hasText`
 * lookup on `artist-releasegroups` can land on a view-hidden section whose
 * heading merely contains the wanted one, after which every action against it
 * times out.
 *
 * *A multi-table arm's numbers are not comparable to a single-table arm's*, for
 * the same reason the two existing single-table arms are not comparable to each
 * other — different row counts, different columns, different data, and now
 * different scopes. Compare arms of the SAME pageType, captured in the same
 * session, per CLAUDE.md's "quote only within-session A/B ratios".
 */

const artistEvents = require('./artistEventsFixture');
const dylanArtistReleases = require('./dylanArtistReleasesFixture');
const springsteenArtistReleaseGroups = require('./springsteenArtistReleaseGroupsFixture');

/** Every instrumented pageType, keyed by its `--pageType=` value. */
const DESCRIPTORS = {
    'artist-events': artistEvents,
    'artist-releases-dylan': dylanArtistReleases,
    'artist-releasegroups': springsteenArtistReleaseGroups,
};

/**
 * Picard-column arms, selected with `--arm=`.
 *
 * The three of them separate two PERFORMANCE.org steps that could not be told
 * apart while the harness had no page carrying a Picard column at all:
 *
 *   absent    — `sa_enable_picard_tagger: false`. No column, so no <td> in any
 *               of the five O(rows x columns) walks. The whole Picard prize,
 *               Steps 23 and 32 together, is `collapsed - absent`... plus the
 *               one extra column's own share of those walks, which is Step
 *               32's stated, unfixable residue.
 *   collapsed — the shipped default since 9.99.1057. The column exists and is
 *               walked; its CELL CONTENT is not built.
 *   expanded  — `sa_picard_tagger_initially_collapsed: false`, i.e. the
 *               pre-9.99.1057 behaviour. `expanded - collapsed` is exactly
 *               what Step 32 banked, and what Step 23 still has to win on a
 *               page where the user opens the column.
 *
 * Meaningful only on a pageType whose rows carry a `/release/<mbid>` link.
 * `artist-events` has none, so all three arms are identical there — and
 * `artist-releasegroups`' rows link `/release-group/<mbid>`, so it has no
 * Picard column either. Neither is an error worth blocking on, but both ARE
 * worth saying out loud, since a run that silently reports three identical arms
 * looks like a bug in the feature.
 *
 * @type {Object<string, Object<string, *>>}
 */
const PICARD_ARMS = {
    absent:    { sa_enable_picard_tagger: false },
    collapsed: { sa_enable_picard_tagger: true, sa_picard_tagger_initially_collapsed: true },
    expanded:  { sa_enable_picard_tagger: true, sa_picard_tagger_initially_collapsed: false },
};

/** pageTypes whose rows carry no `/release/<mbid>` link, so `--arm=` is a no-op. */
const NO_PICARD_COLUMN = new Set(['artist-events', 'artist-releasegroups']);

/**
 * Turns one descriptor module into the shape the capture scripts consume.
 *
 * The perf-specific fields — the five distinct filter values, and the naming of
 * which column carries the header-count metric — are derived here rather than
 * duplicated into every descriptor.
 *
 * @param {string} pageType
 * @returns {Object}
 * @throws {Error} when `pageType` is not registered.
 */
function toArm(pageType) {
    const d = DESCRIPTORS[pageType];
    if (!d) {
        throw new Error(`Unknown pageType "${pageType}". Supported: ${pageTypeList().join(', ')}`);
    }
    return {
        pageType,
        url: d.URL,
        fixturePath: d.FIXTURE_PATH,
        seedGmValues: d.SEED_GM_VALUES,
        totalRows: d.TOTAL_ROWS,
        // 'single' is the default so the two original descriptors need no new
        // field, and so a descriptor that forgets it cannot silently be treated
        // as multi-table (which would scope its metrics to one sub-table).
        tableMode: d.TABLE_MODE || 'single',
        subTableIndex: d.SUB_TABLE_INDEX ?? 0,
        filterColumn: d.FILTER_COLUMN,
        filterValue: d.FILTER_VALUE,
        // A different, never-before-typed value each sample avoids
        // `_filterResultCache` hits skewing the comparison. That is the filter
        // pipeline's own row-match cache — unrelated to, and untouched by, any
        // PERFORMANCE.org step, so it must be defeated identically on every
        // arm being compared. Real values from the fixture's own data, the
        // first matching the correctness spec's canonical FILTER_VALUE.
        filterValues: d.PERF_FILTER_VALUES,
        sortColumn: d.SORT_COLUMN,
        uniqDropColumn: d.UNIQ_DROP_COLUMN,
        // The header-count metrics assert an EXACT badge value rather than
        // "stopped changing": a scan that is superseded and abandoned leaves the
        // badges stable-but-wrong, which a stability heuristic would happily
        // time as a fast result.
        headerCountColumn: d.UNIQ_COUNT_COLUMN,
        headerCountTotal: d.UNIQ_COUNT_TOTAL,
        headerCountFilterValue: d.UNIQ_COUNT_FILTER_VALUE,
        headerCountFilterUniq: d.UNIQ_COUNT_FILTER_UNIQ,
    };
}

/** @returns {string[]} every registered `--pageType=` value. */
function pageTypeList() {
    return Object.keys(DESCRIPTORS);
}

/**
 * Merges a `--arm=` seed override on top of a descriptor's own seeds, and
 * warns when the arm cannot mean anything on that page.
 *
 * The arm's seeds go ON TOP, so a descriptor keeps control of everything the
 * arm does not name — CAA and Relationships stay off, which an arm must never
 * be able to re-enable, since that would put thousands of live requests inside
 * a measurement bracket.
 *
 * @param {Object} config - a `toArm()` result
 * @param {string|null} arm
 * @returns {Object} config, with `seedGmValues` merged
 * @throws {Error} when `arm` is not a known arm name.
 */
function applyPicardArm(config, arm) {
    if (!arm) return config;
    if (!PICARD_ARMS[arm]) {
        throw new Error(`Unknown arm "${arm}". Supported: ${Object.keys(PICARD_ARMS).join(', ')}`);
    }
    if (NO_PICARD_COLUMN.has(config.pageType)) {
        console.warn(`  NOTE: --arm=${arm} has no effect on ${config.pageType} — its rows carry no `
            + '/release/<mbid> link, so it never gets a Picard column and all three arms '
            + 'measure the same thing.');
    }
    return { ...config, seedGmValues: { ...config.seedGmValues, ...PICARD_ARMS[arm] } };
}

module.exports = {
    DESCRIPTORS,
    PICARD_ARMS,
    NO_PICARD_COLUMN,
    toArm,
    pageTypeList,
    applyPicardArm,
};
