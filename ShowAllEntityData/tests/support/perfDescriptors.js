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
 * Relationships-column arms, selected with `--rel-arm=`.
 *
 * ── Why these are separate from PICARD_ARMS, and why they are safe ──────────
 *
 * `applyPicardArm()` below states the rule these look like a violation of: an
 * arm must never re-enable the Relationships column, because "that would put
 * thousands of live requests inside a measurement bracket". That rule is
 * correct and is why PERFORMANCE.org Step 35 shipped explicitly NOT claiming an
 * interaction-latency number — `_initRelationshipsColumnImpl()` issues one WS/2
 * request per distinct MBID with a hard-coded 1100 ms gap, so the Dylan arm's
 * 2301 rows cost ~42 minutes.
 *
 * The `expanded` arm does not break that rule; it removes the reason for it.
 * `capture-interaction-perf.js` pre-seeds the `rel-ws2` IndexedDB store from a
 * committed capture of the REAL WS/2 data (`relWs2Seed.js`,
 * `scripts/capture-rel-ws2-seed.py`) before the render that reads it, so the
 * column's Phase 1 hits on every MBID, `_missMbids` is empty and the Phase-2
 * network queue issues nothing. *The seeding is not optional for this arm* —
 * `--rel-arm=expanded` without a committed seed for that pageType is refused
 * rather than run, because the failure mode is a slow run rather than an error.
 *
 *   absent    — `sa_enable_relationships_column: false`. No column at all: no
 *               `<th>`, no `<td>`, nothing in any O(rows x columns) walk. This
 *               is what every committed arm before this one measured, since
 *               both existing descriptors seed the column off.
 *   collapsed — the column exists and is walked, but every cell is empty.
 *               `sa_rel_collapse_threshold: 1` forces it (the shipped default
 *               of 200 would also collapse a 2301-entity page, but pinning it
 *               makes the arm independent of that default ever changing).
 *   expanded  — `sa_rel_collapse_threshold: 0`, i.e. never auto-collapse: the
 *               pre-9.99.1060 behaviour, with every cell populated from the
 *               seeded cache.
 *
 * `expanded - collapsed` is what Step 35 banked on the DOM side. `collapsed -
 * absent` is the column's own irreducible cost — the residue Step 32 records as
 * unfixable for Picard, for the same reason: a collapsed column still has a
 * `<td>` in every row, deliberately, so no column INDEX moves.
 *
 * Expect the win to be SMALLER than Picard's 19%/13%/21%, and this page says
 * why more precisely than Step 35's prose could: the committed seed covers 2301
 * entities carrying **2329 icons in total, 1.01 per row**, and *947 of those
 * entities have no url-rel at all*, so ~41% of cells are empty even when
 * expanded. A collapsed rel cell saves cloning one `<a><img>` plus a
 * `.mb-rel-filter-key` span on average, where a collapsed Picard cell saved a
 * whole per-row anchor walk plus `<ul>/<li>/<button>/<img>` construction and an
 * `addEventListener`.
 *
 * @type {Object<string, Object<string, *>>}
 */
const REL_ARMS = {
    absent:    { sa_enable_relationships_column: false },
    collapsed: {
        sa_enable_relationships_column: true,
        sa_rel_collapse_threshold: 1,
        sa_rels_idb_enable: true,
    },
    expanded: {
        sa_enable_relationships_column: true,
        sa_rel_collapse_threshold: 0,
        sa_rels_idb_enable: true,
    },
};

/** Arms that read the seeded cache, and so must not run without one. */
const REL_ARMS_NEEDING_SEED = new Set(['expanded']);

/**
 * pageTypes with no `injectedColumns: ['Relationships']`, where `--rel-arm=` is
 * a no-op.
 *
 * `artist-events`' rows link neither a release, a release-group nor a work, so
 * `_extractMbidFromRow()` returns null for every one of them and no cell ever
 * gets a `data-mbid` to fetch against. Same shape of limitation as
 * `NO_PICARD_COLUMN`, and worth saying out loud for the same reason: three
 * identical arms look like a broken feature rather than an inapplicable page.
 */
const NO_REL_COLUMN = new Set(['artist-events']);

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

/**
 * Merges a `--rel-arm=` seed override on top of whatever the descriptor and any
 * Picard arm already decided.
 *
 * Applied AFTER `applyPicardArm()` so the two compose, and so this one wins on
 * the Relationships keys specifically — which is the whole point, since every
 * descriptor deliberately seeds `sa_enable_relationships_column: false`.
 *
 * @param {Object} config - a `toArm()` result
 * @param {string|null} relArm
 * @returns {Object} config, with `seedGmValues` merged
 * @throws {Error} when `relArm` is not a known arm name.
 */
function applyRelArm(config, relArm) {
    if (!relArm) return config;
    if (!REL_ARMS[relArm]) {
        throw new Error(`Unknown rel arm "${relArm}". Supported: ${Object.keys(REL_ARMS).join(', ')}`);
    }
    if (NO_REL_COLUMN.has(config.pageType)) {
        console.warn(`  NOTE: --rel-arm=${relArm} has no effect on ${config.pageType} — its rows `
            + 'link no release/release-group/work, so no cell ever gets a data-mbid and all '
            + 'three arms measure the same thing.');
    }
    return { ...config, seedGmValues: { ...config.seedGmValues, ...REL_ARMS[relArm] } };
}

module.exports = {
    DESCRIPTORS,
    PICARD_ARMS,
    NO_PICARD_COLUMN,
    REL_ARMS,
    REL_ARMS_NEEDING_SEED,
    NO_REL_COLUMN,
    toArm,
    pageTypeList,
    applyPicardArm,
    applyRelArm,
};
