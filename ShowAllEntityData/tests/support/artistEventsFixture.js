'use strict';

const path = require('path');

/**
 * Shared identifiers for the `artist-events` performance-comparison
 * fixture (Bruce Springsteen's own events tab — 4174 rows, 21 columns,
 * single-table mode; see `tests/snapshots/registry.org`'s own note on why
 * this page was picked). Used by `tests/live/artist-events-interactions
 * .spec.js`, `tests/support/capture-interaction-perf.js`, and
 * `tests/support/capture-snapshots.js`'s post-filter/post-sort snapshot
 * capture — kept in one place so the "canonical" filter/sort/uniq-drop
 * targets those three files exercise never drift apart from each other.
 *
 * `FILTER_VALUE`/`FILTER_VALUE_COUNT` and the multi-row Location cell count
 * below were derived directly from the committed fixture/snapshot data
 * (`tests/fixtures/saved-data/artist-events.json.gz`,
 * `tests/snapshots/artist-events/rendered.html`) — re-verify them if that
 * fixture is ever re-captured against materially different data.
 */

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'saved-data', 'artist-events.json.gz');
const SEED_GM_VALUES = { sa_enable_caa_pics: false };
const TOTAL_ROWS = 4174;

// Country: 37 uniques, smallest-cardinality collapsable column. "United
// Kingdom" narrows to a real, stable, mid-size subset — large enough to be
// a meaningful filter, small enough that a wrong/empty result is obvious.
const FILTER_COLUMN = 'Country';
const FILTER_VALUE = 'United Kingdom';
const FILTER_VALUE_COUNT = 158;

const SORT_COLUMN = 'Date';

const UNIQ_DROP_COLUMN = 'Location';
// Total multi-row (>=2 list items) Location cells across the whole table —
// used by the cache-invalidation correctness test.
const UNIQ_DROP_COLLAPSABLE_CELL_COUNT = 5;

// Column-header badge constants for the chunked-re-render regression test.
//
// 'Event' is deliberately the highest-cardinality column on this page (4158
// distinct values across 4174 rows): a scan that only reaches part of the
// tbody produces a visibly, unmistakably wrong number there, whereas a
// low-cardinality column like Country (37) can look plausible while still
// being computed over a fraction of the rows.
//
// All four values were derived from tests/snapshots/artist-events/
// rendered.html — the ONLY committed snapshot of this page whose render path
// awaits renderFinalTable(), and therefore the only one whose header badges
// were computed over the complete table. (post-sort.html predates the fix and
// still bakes in the partial-scan numbers 984/6/1.) The extraction was
// validated against that snapshot's own `.mb-col-uniq-count` badge before
// being committed here: same 4158.
const UNIQ_COUNT_COLUMN = 'Event';
const UNIQ_COUNT_TOTAL = 4158;
// 3 rows, each with a distinct Event value, so the filtered badge reads 3.
// Small enough that the filtered re-render stays under
// sa_chunked_render_threshold (1000) and takes renderFinalTable()'s
// synchronous fast path — which is exactly why applying the filter always
// looked correct while clearing it did not.
const UNIQ_COUNT_FILTER_VALUE = 'Bon Jovi';
const UNIQ_COUNT_FILTER_ROWS = 3;
const UNIQ_COUNT_FILTER_UNIQ = 3;

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
    UNIQ_DROP_COLLAPSABLE_CELL_COUNT,
    UNIQ_COUNT_COLUMN,
    UNIQ_COUNT_TOTAL,
    UNIQ_COUNT_FILTER_VALUE,
    UNIQ_COUNT_FILTER_ROWS,
    UNIQ_COUNT_FILTER_UNIQ,
};
