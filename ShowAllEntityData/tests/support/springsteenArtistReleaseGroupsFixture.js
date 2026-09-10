'use strict';

const path = require('path');

/**
 * Shared identifiers for the `artist-releasegroups` performance-comparison
 * fixture (Bruce Springsteen's own release-groups tab, `?all=1&va=0` — 2143
 * rows across 47 sub-tables, 9 columns, *multi-table* mode).
 *
 * This is the THIRD interaction-perf arm and the FIRST `tableMode: 'multi'`
 * one, and that is the whole reason it exists. Both earlier arms are
 * single-table, so every committed interaction number in
 * `tests/MEASUREMENTS.org` describes `renderFinalTable()`'s path — which MOVES
 * the rows it is handed. `renderGroupedTable()` ALWAYS CLONES, on the first
 * render too, and that is where the per-pass costs `PERFORMANCE.org`'s Tier 1
 * is about are at their largest. Until this fixture there was no way to measure
 * any of them there. Recorded as a harness gap in that tier's "Two harness
 * gaps" note.
 *
 * It is also the ERG-heaviest page in the repo — 4286 `[data-erg-btn]` and
 * 6429 `data-erg-injected` in its committed `rendered.html`, against ~2301 on
 * `artist-releases-dylan` and ZERO on `artist-events`, whose rows carry no
 * `/release` link at all. It has NO Picard column, though: its rows link
 * `/release-group/<mbid>` and that guard asks for `/release/<mbid>`. So
 * `--arm=absent|collapsed|expanded` is a no-op here and
 * `perfDescriptors.js`'s `NO_PICARD_COLUMN` says so out loud, since three
 * identical arms otherwise read as a bug in the feature.
 *
 * ── Multi-table scoping: read this before quoting any number from this arm ───
 *
 * `TABLE_MODE: 'multi'` is not cosmetic. Three of the seven metrics are
 * inherently per-sub-table and are scoped here to `SUB_TABLE_INDEX`:
 *
 *   - `columnFilter`, `sort`, `uniqDropCold`/`uniqDropWarm` and both
 *     `headerCounts*` badge assertions act on sub-table `SUB_TABLE_INDEX`.
 *   - `globalFilter` is genuinely page-wide: it re-renders all 47 groups.
 *   - `waitForColHeaderCountsStable()` is page-wide too, so the *settle* half
 *     of both `headerCounts*` metrics covers every sub-table's scan even
 *     though the *value* half asserts one badge.
 *   - `sort` additionally takes Step 18's SCOPED path — a multi-table sort
 *     re-renders only the group it sorted — so this arm's `sort` number is not
 *     the same shape of work as a single-table arm's, which re-renders
 *     everything. That is a feature: it is the only committed measurement of
 *     the scoped path.
 *
 * *`SUB_TABLE_INDEX` is 29, not 0, and that is measured rather than chosen.*
 * Sub-table 0 is "Album" with 21 of the page's 2143 rows; index 29 is
 * "Album + Live" with 830, the largest on the page. A descriptor written
 * against the default 0 would have had every per-table metric measuring 1% of
 * the page and reporting it as a fast result. The index is stable for a given
 * committed payload — the render order is deterministic — but it is NOT stable
 * across a re-capture, so re-run the probe if this fixture is ever recaptured
 * and expect the index to move.
 *
 * Resolution is by INDEX, never by heading text. An `<h3>`'s own `textContent`
 * swallows its entire per-table filter-bar UI (history dropdown, pinned list,
 * every toggle label — hundreds of characters), and `waitForSortSettled()`'s
 * JSDoc separately records that a `hasText` lookup on THIS page can land on a
 * view-hidden section whose heading merely contains the wanted one, after which
 * every action against it times out.
 *
 * ── Every constant below was MEASURED from the committed disk fixture ────────
 *
 *   node scripts/probe-fixture-columns.js \
 *     --url='https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0' \
 *     --fixture=tests/fixtures/saved-data/artist-releasegroups.json.gz \
 *     --tableIndex=29 --filterColumn=Year --countColumn=Title \
 *     --countSubstrings='Stockholm|Tunnel of Love|Greetings'
 *
 * Re-run it if that fixture is ever re-captured; do not adjust these by hand.
 * Measured 2026-09-10 (`NB-3641`): page-wide 2143 rows / 47 `table.tbl` / 47
 * index-aligned `h3.mb-toggle-h3`; sub-table 29 = 830 rows; badges Year 49,
 * Title 824, Artist 45, Releases 24; all nine header names strip cleanly, so
 * `columnIndex()`'s stripped-textContent match resolves every one of them.
 *
 * @see tests/support/artistEventsFixture.js - the first arm (single-table).
 * @see tests/support/dylanArtistReleasesFixture.js - the second (single-table).
 * @see tests/support/perfDescriptors.js - the registry, and the multi-table contract.
 */

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'saved-data', 'artist-releasegroups.json.gz');

/** Page-wide data rows, across all 47 sub-tables. NOT sub-table 29's 830. */
const TOTAL_ROWS = 2143;

/** `tableMode` — see the multi-table scoping section above. */
const TABLE_MODE = 'multi';

/**
 * Which sub-table every per-table metric acts on: index 29, "Album + Live",
 * 830 rows — the largest on the page. Measured, not chosen; see above for why
 * the default 0 would have silently measured 21 rows.
 */
const SUB_TABLE_INDEX = 29;

/**
 * CAA and Relationships OFF at MEASUREMENT time, not merely at capture time.
 *
 * Same reasoning as the other two descriptors: the fixture carries table DATA
 * only, and `loadFromDiskFixture()` re-runs the script's own post-render
 * passes, so leaving either on would fire thousands of live requests in the
 * middle of a timing bracket. This page carries a CAA column (index 5), so the
 * CAA half is load-bearing rather than precautionary.
 */
const SEED_GM_VALUES = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

/**
 * `Year`: 49 badge uniques in sub-table 29, the lowest-cardinality genuinely
 * filterable column there (Artist's 45 is lower but is near-constant on an
 * artist's own release-groups tab, so it makes a poor filter — the same
 * judgement, for the same reason, as Dylan's Country-over-Artist choice).
 *
 * `2005` keeps 40 of the sub-table's 830 rows. Measured as a real SUBSTRING
 * filter (`--countSubstrings`), which is what a column filter performs — not
 * as a distinct-value tally. The two agree here because a four-digit year
 * cannot contain another year as a substring and these cells are single-valued;
 * they do NOT agree in general, and Dylan's descriptor records the case where
 * the derived answer was 167 against a true 181.
 */
const FILTER_COLUMN = 'Year';
const FILTER_VALUE = '2005';
const FILTER_VALUE_COUNT = 40;

/**
 * `Title`: 824 distinct of sub-table 29's 830 rows — the highest-cardinality
 * column, so a sort does the most comparator work, and a plain text sort
 * rather than one routed through `_compareDurations()`/date parsing.
 */
const SORT_COLUMN = 'Title';
const UNIQ_DROP_COLUMN = 'Title';

/**
 * Five real Year values from sub-table 29's own data, the first matching
 * `FILTER_VALUE`. A different, never-before-typed value per sample keeps
 * `_filterResultCache` from skewing the comparison — that is the filter
 * pipeline's own row-match cache, untouched by any PERFORMANCE.org step, so it
 * must be defeated identically on every arm being compared.
 *
 * Measured as substring filters: 40, 25, 22, 22, 22 rows, each matching exactly
 * one distinct Year value. Deliberately similar in size, so a sample's timing
 * is not dominated by how much its own filter happened to keep.
 */
const PERF_FILTER_VALUES = ['2005', '1988', '1986', '1999', '2013'];

/**
 * The header-count metrics' column and its badge values, all for sub-table 29.
 *
 * `Stockholm` keeps 17 rows carrying 16 distinct Titles. Several distinct
 * values is the requirement, not an accident: a badge of 1 is also what a
 * badly-truncated scan would produce, so a one-value filter cannot tell a
 * correct scan from a broken one. 17 rows is also far below
 * `sa_chunked_render_threshold` (1000), so the filtered re-render takes the
 * synchronous path — the same property both other descriptors' choices have.
 */
const UNIQ_COUNT_COLUMN = 'Title';
const UNIQ_COUNT_TOTAL = 824;
const UNIQ_COUNT_FILTER_VALUE = 'Stockholm';
const UNIQ_COUNT_FILTER_ROWS = 17;
const UNIQ_COUNT_FILTER_UNIQ = 16;

module.exports = {
    URL,
    FIXTURE_PATH,
    SEED_GM_VALUES,
    TOTAL_ROWS,
    TABLE_MODE,
    SUB_TABLE_INDEX,
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
