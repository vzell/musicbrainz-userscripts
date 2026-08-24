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
};
