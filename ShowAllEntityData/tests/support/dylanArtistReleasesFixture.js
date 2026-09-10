'use strict';

const path = require('path');

/**
 * Shared identifiers for the `artist-releases` performance-comparison fixture
 * (Bob Dylan's own releases tab — 2301 rows, 21 columns, single-table mode).
 *
 * This is the SECOND interaction-perf arm, and the reason it exists is narrow:
 * it is the first instrumented page that HAS a Picard column. `artist-events`,
 * the original arm, contains no `/release/<mbid>` link anywhere, so
 * `initPicardTaggerColumn()` skips every one of its tables and
 * `PERFORMANCE.org` Steps 23 and 32 are both structurally invisible to the
 * harness — a fact those steps had recorded as an obstacle for weeks without
 * anything being done about it. See `capture-fixture.js`'s own entry for why
 * Dylan and not Springsteen (8125 rows crosses `sa_render_threshold`, popping
 * the one blocking dialog `customDialog.js` cannot clear) and why not a
 * Springsteen-connected artist (measured: the largest is Nils Lofgren at 163
 * releases, so `PAGETYPES-TESTING-REFERENCE.org`'s identifier criteria simply
 * cannot be met at this size — a deliberate, recorded deviation).
 *
 * ── Every constant below was MEASURED from the committed disk fixture ────────
 *
 * `node scripts/probe-fixture-columns.js` loads
 * `tests/fixtures/saved-data/artist-releases-dylan.json.gz` through the real
 * Load-from-disk pipeline and reports these numbers. Re-run it if that fixture
 * is ever re-captured; do not adjust these by hand.
 *
 * Two of them are only obtainable that way, and guessing either would have
 * produced a silently wrong measurement rather than a failure:
 *
 *   - `UNIQ_COUNT_TOTAL` is read from the rendered `.mb-col-uniq-count` BADGE,
 *     not from a distinct-textContent tally. The two disagree on most columns
 *     of this page — Country reads 68 against a naive 58 (a multi-row cell
 *     contributes each of its items), Label 257 against 240, Date 644 against
 *     645 — because the badge comes from the real uniq-drop machinery. It
 *     happens to agree on `Release` (1433), which is the column used here, but
 *     that is luck and not a rule.
 *   - `UNIQ_COUNT_FILTER_VALUE` is a SUBSTRING, because that is what a column
 *     filter does. "Nashville Skyline" keeps 27 rows carrying 5 distinct
 *     Release values; the probe reports both numbers for a candidate list, so
 *     a value that drags in unrelated rows (as any short title does — "Desire"
 *     keeps 22 rows across 6 titles) is rejected before it reaches a run.
 *
 * Smoke-verified against the fixture on 2026-09-10 (petri): 2301 rows, the
 * Picard column present with 2301 cells / 2 `<th>` / 1 header toggle and
 * **0 `_picardExtractRowEntities()` calls** while collapsed, `Release` badge
 * 1433, the "Nashville Skyline" filter keeping 27 rows at badge 5, and the
 * badge restoring to 1433 on clear.
 *
 * @see tests/support/artistEventsFixture.js - the first arm, same shape.
 */

const URL = 'https://musicbrainz.org/artist/72c536dc-7137-4477-a521-567eeb840fa8/releases?va=0';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'saved-data', 'artist-releases-dylan.json.gz');
const TOTAL_ROWS = 2301;

/**
 * CAA and Relationships OFF at MEASUREMENT time, not merely at capture time.
 *
 * The capture entry in `capture-fixture.js` forces both off for the usual
 * reason (a real CAA queue or a WS/2 relationships fetch across 2301 rows does
 * not finish in a practical window), but the fixture only carries table DATA —
 * `loadFromDiskFixture()` re-runs the script's own post-render passes, so
 * leaving either on here would fire thousands of live requests in the middle
 * of a timing bracket. `artist-events` needs only the CAA half; this page has
 * an `injectedColumns: ['Relationships']` feature and so needs both.
 */
const SEED_GM_VALUES = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

// Country: 68 badge uniques, the lowest-cardinality genuinely filterable
// column on this page (Artist's 63 is lower but is near-constant on an
// artist's own releases tab, so it makes a poor filter). "United Kingdom"
// narrows to a real, stable, mid-size subset — the same choice, for the same
// reasons, as artist-events' own FILTER_COLUMN/FILTER_VALUE.
const FILTER_COLUMN = 'Country';
const FILTER_VALUE = 'United Kingdom';
/**
 * Rows a column filter of "United Kingdom" keeps: **181**, measured against
 * the fixture, not derived.
 *
 * Worth recording how the derived answer went wrong, because the same mistake
 * is available for any multi-row column. Adding up the probe's per-value
 * tallies — 164 cells reading exactly "United Kingdom (GB)" plus 3 reading
 * "United Kingdom (GB)▶2▤" — gives 167. But a column filter matches
 * `getCleanColumnText()`, which concatenates ALL items of a multi-row cell, so
 * every cell that merely LISTS the UK among several countries matches too, and
 * those cells appear in the probe under their own combined text rather than
 * under "United Kingdom". Hence 181. Only the running filter knows this
 * number; a distinct-value tally structurally cannot produce it.
 */
const FILTER_VALUE_COUNT = 181;

const SORT_COLUMN = 'Date';

// Country/Date is this page's multi-row column (splitCD), so it is the
// analogue of artist-events' Location for the uniq-drop metric: 1060 badge
// uniques over 2301 rows, with real collapsed cells among them.
const UNIQ_DROP_COLUMN = 'Country/Date';

/**
 * Five DISTINCT filter values, one per sample, for the global- and
 * column-filter metrics.
 *
 * A different, never-before-typed value each sample is what stops
 * `_filterResultCache` hits from skewing the comparison. That cache is the
 * filter pipeline's own row-match memo — unrelated to, and untouched by, any
 * PERFORMANCE.org step — so it has to be defeated identically on every arm.
 * All five are real Country values from this fixture (measured counts: 164,
 * 116, 73, 62, 52), and the first is the correctness-facing FILTER_VALUE so
 * the two never drift apart.
 */
const PERF_FILTER_VALUES = [FILTER_VALUE, 'Japan', 'Germany', 'Australia', 'Netherlands'];

// Release is the highest-cardinality column (1433 badge uniques over 2301
// rows), chosen for the same reason artist-events uses Event: a scan that
// reaches only part of the tbody produces a visibly, unmistakably wrong number
// there, whereas a low-cardinality column can look plausible while still being
// computed over a fraction of the rows.
const UNIQ_COUNT_COLUMN = 'Release';
const UNIQ_COUNT_TOTAL = 1433;
// 27 rows across 5 distinct Release values. Both halves matter: SEVERAL
// distinct values, so the filtered badge (5) is a number a truncated scan
// would not also produce — a value narrowing to a single title would read 1,
// which is indistinguishable from a broken scan. And 27 rows keeps the
// filtered re-render far below sa_chunked_render_threshold (1000), so it takes
// renderFinalTable()'s synchronous fast path, exactly as artist-events' own
// choice does.
const UNIQ_COUNT_FILTER_VALUE = 'Nashville Skyline';
const UNIQ_COUNT_FILTER_ROWS = 27;
const UNIQ_COUNT_FILTER_UNIQ = 5;

module.exports = {
    URL,
    FIXTURE_PATH,
    SEED_GM_VALUES,
    TOTAL_ROWS,
    FILTER_COLUMN,
    FILTER_VALUE,
    FILTER_VALUE_COUNT,
    SORT_COLUMN,
    UNIQ_DROP_COLUMN,
    PERF_FILTER_VALUES,
    UNIQ_COUNT_COLUMN,
    UNIQ_COUNT_TOTAL,
    UNIQ_COUNT_FILTER_VALUE,
    UNIQ_COUNT_FILTER_ROWS,
    UNIQ_COUNT_FILTER_UNIQ,
};
