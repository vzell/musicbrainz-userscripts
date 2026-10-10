'use strict';

const path = require('path');

/**
 * Shared identifiers for the `artist-recordings` performance-comparison
 * fixture (Tom Petty and the Heartbreakers' recordings tab, ?all=1 — 2512
 * rows, 21 columns, single-table mode).
 *
 * The FOURTH interaction-perf arm, and the first carrying the two columns
 * INSERTED after "Name" — "Recording of" and "Performance attributes"
 * (`features.recordingOf`, the `_recOf*` family) — empty, as a real page
 * renders them until the user loads them. See `capture-fixture.js`'s entry for
 * the sizing (scripts/probe-artist-recording-counts.py): every
 * Springsteen-connected artist is either far too small or far too big.
 *
 * Two arms share these constants:
 *   - `artist-recordings-petty` — the committed fixture, WITH the columns;
 *   - `artist-recordings-petty-nocols` — the same page captured with
 *     `sa_enable_recording_of_column: false` (local, git-ignored). Measured on
 *     the same branch in the same session, their ratio is the cost of the two
 *     extra cells per row.
 *
 * ── Every constant below was MEASURED from the committed disk fixture ────────
 *
 * `node scripts/probe-fixture-columns.js --url=<URL> --fixture=<FIXTURE_PATH>`
 * (with --filterColumn / --countColumn / --countSubstrings) on 2026-10-10,
 * petri. Re-run it if the fixture is re-captured; do not adjust these by hand.
 */

const URL = 'https://musicbrainz.org/artist/f93dbc64-6f08-4033-bcc7-8a0bb4689849/recordings';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'saved-data', 'artist-recordings-petty.json.gz');
const TOTAL_ROWS = 2512;

/** CAA and Relationships off at measurement time too (no requests inside a timing bracket). */
const SEED_GM_VALUES = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

// Comment carries the live-recording disambiguation ("live, 1997-02-07: The
// Fillmore, San Francisco, CA, USA"), 125 badge uniques: a substring filter on
// a venue keeps a real, mid-size subset.
const FILTER_COLUMN = 'Comment';
const FILTER_VALUE = 'Fillmore';
/** Rows a column filter of "Fillmore" keeps — measured, 17 distinct comments. */
const FILTER_VALUE_COUNT = 138;

// Name, not Length: Length's header text carries the ⏱ toggle glyph
// ("⏱︎Length" stripped), and the harness matches stripped header text.
const SORT_COLUMN = 'Name';

// Release groups is this page's multi-row collapsable column (352 badge uniques).
const UNIQ_DROP_COLUMN = 'Release groups';

/**
 * Five distinct column-filter values, one per sample (defeats
 * `_filterResultCache` identically on every arm). Measured rows: 138, 89, 67,
 * 33, 14.
 */
const PERF_FILTER_VALUES = [FILTER_VALUE, 'Gainesville', 'Oakland', 'Chicago', 'Hamburg'];

// Name is the highest-cardinality column (1642 badge uniques over 2512 rows).
const UNIQ_COUNT_COLUMN = 'Name';
const UNIQ_COUNT_TOTAL = 1642;
// 37 rows across 22 distinct Name values; far below
// sa_chunked_render_threshold, so the filtered re-render is synchronous.
const UNIQ_COUNT_FILTER_VALUE = 'Mary Jane';
const UNIQ_COUNT_FILTER_ROWS = 37;
const UNIQ_COUNT_FILTER_UNIQ = 22;

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
