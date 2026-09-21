'use strict';

// `type: 'number'` settings are coerced back to real Numbers on read, because
// VZ_MBLibrary's settings dialog stores them as strings.
//
// ── The bug ──────────────────────────────────────────────────────────────────
//
// The library's SAVE handler writes `input.value` for every non-checkbox
// widget, and `input.value` is always a string. It also iterates the WHOLE
// schema rather than a dirty-set, so the first time a user presses SAVE — even
// without changing anything — all 38 numeric settings become strings in GM
// storage, and `settingsInterface.init()` hands them straight back on every
// later load.
//
// Four settings are read through a `typeof v === 'number'` guard, which fails
// on a string and falls back to a hardcoded default, silently discarding the
// user's value. Confirmed live on 2026-09-21: an auto-collapse threshold of 0
// ("never auto-collapse") still collapsed a 1000-entity table, because the read
// fell back to 200. See org/config-handling.org F2.
//
// ── Why the guarantees are split between a hook and the DOM ──────────────────
//
// The sharpest case — a stored `"0"` meaning "never auto-collapse" — is NOT
// falsifiable through behaviour on any committed fixture. The largest shell
// here has 12 distinct entities, so the broken read's fallback of 200 renders
// it EXPANDED, and a correctly-honoured 0 renders it expanded too. Identical
// outcome, so such a test would pass on unfixed code — the "proves something
// adjacent" failure CLAUDE.md warns about. Showing it in the DOM would need a
// fixture with >200 distinct entities, i.e. hundreds of routed WS/2 lookups.
//
// So the mechanism is pinned via `__saTest.numericSettings()` (value AND JS
// type), and the user-visible half is pinned with a threshold that genuinely
// changes what renders: the string `"2"` against 12 entities must collapse,
// where the broken fallback of 200 would leave it expanded.
//
// The `"500"` case is not decoration. Without it, "a string threshold
// collapses the table" would also pass if strings were being mishandled in the
// opposite direction — it pins that the number is actually PARSED, in both
// directions, rather than merely being non-default.
//
// ── What this file deliberately does NOT cover ────────────────────────────────
//
// The same commit changes three `Lib.settings.sa_X || N` reads to `?? N`
// (`sa_render_threshold` in `startFetchingProcess()`, and
// `sa_chunked_render_threshold` in `renderFinalTable()` and
// `renderGroupedTable()`). That half is unobservable on any committed fixture
// and is recorded as `"expect": "pass"` in the mutation list, with the reason:
// the difference between `||` and `??` only appears when the value is 0 AND
// the row count exceeds the hardcoded fallback (5000 / 1000). Every fixture
// here renders 12 rows, so both operators take the same branch.
//
// It is still required, and it is required BECAUSE of the coercion: before it,
// the stored `"0"` was truthy, survived the `||`, and then failed `"0" > 0` —
// so "0 to disable" worked by accident. Coercing to a real `0` makes `||`
// swallow it. Shipping the coercion without the operator change would be a
// regression, which is why they are one commit.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

// "Bruce Springsteen Studio Collection" — 12 releases in one sub-table,
// `tableMode: 'single'`. Chosen because 12 sits below the broken fallback of
// 200 and above a seeded threshold of 2, which is what makes the two outcomes
// differ. Same shell as rel-column-collapse-toggle.spec.js.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_LABEL = 'Show all Releases for Series';
const SERIES_GLOB = 'https://musicbrainz.org/series/**';
const SERIES_ENTITIES = 12;

const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/**
 * Loads the series shell with `settings` seeded into GM storage and clicks
 * "Show all".
 *
 * `sa_enable_relationships_column: true` is required because `loadPage.js`'s
 * `FIXTURE_SETTINGS_OVERRIDE` forces the column OFF for every fixture spec.
 * `sa_rel_browse_batch_enable: false` keeps the per-entity lookup path, so the
 * collapse decision is the only thing under test.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings  Seeded GM values, verbatim — string
 *   values are the whole point and must NOT be normalised here.
 * @returns {Promise<void>}
 */
async function loadSeriesPage(page, settings) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            sa_rel_browse_batch_enable: false,
            ...settings,
        },
    });

    await page.route('**/ws/2/**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: WS2_BODY,
    }));
    await page.route(SERIES_GLOB, (route) => route.fulfill({
        path: SERIES_SHELL, contentType: 'text/html',
    }));

    await page.click(`button[data-label="${SERIES_LABEL}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** @returns {Promise<Object<string, {value: *, type: string}>>} */
const readNumericSettings = (page) =>
    page.evaluate(() => window.__saTest.numericSettings());

/**
 * Per-table Relationships collapse state, straight from `__saTest` rather than
 * re-derived — the distinct-entity count is `_relTableUniqueMbidCount()`'s job.
 *
 * @returns {Promise<Array<{uniqueMbids: number, expanded: boolean}>>}
 */
const readRelTables = (page) =>
    page.evaluate(() => window.__saTest.relTableStates()
        .map((t) => ({ uniqueMbids: t.uniqueMbids, expanded: t.expanded })));

test.describe('numeric settings survive being stored as strings', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    // ── Mechanism ───────────────────────────────────────────────────────────

    test('a numeric string is coerced to a Number, keeping its value', async ({ page }) => {
        await loadSeriesPage(page, { sa_rel_collapse_threshold: '0', sa_max_page: '7' });
        const nums = await readNumericSettings(page);

        // The case that motivated the whole fix: 0 must survive as 0, as a
        // Number. On unfixed code this is `{ value: '0', type: 'string' }`.
        expect(nums.sa_rel_collapse_threshold).toEqual({ value: 0, type: 'number' });
        expect(nums.sa_max_page).toEqual({ value: 7, type: 'number' });
    });

    test('every numeric setting ends up a real Number, none left as a string', async ({ page }) => {
        // Seeds nothing numeric: the schema defaults are already Numbers, so
        // this pins that the pass does not CORRUPT an untouched profile — a
        // coercion that wrote NaN or undefined over defaults would still pass
        // the targeted assertions above.
        await loadSeriesPage(page, {});
        const nums = await readNumericSettings(page);

        const keys = Object.keys(nums);
        expect(keys.length, 'the schema still has number settings to check').toBeGreaterThan(30);

        const notNumbers = keys.filter((k) => nums[k].type !== 'number');
        expect(notNumbers, 'no numeric setting is left non-Number').toEqual([]);

        const notFinite = keys.filter((k) => !Number.isFinite(nums[k].value));
        expect(notFinite, 'no numeric setting is NaN or Infinity').toEqual([]);
    });

    test('an empty string falls back to the schema default, NOT to 0', async ({ page }) => {
        // `Number('') === 0`, so naive coercion turns a cleared number field
        // into a deliberate-looking 0 — which for a threshold reads as the
        // documented "0 to disable". It must take the schema default instead.
        // Deliberately NOT sa_max_page here: under the mutation that makes ''
        // become 0, a page count of 0 stalls the fetch loop and the spec fails
        // by a 90 s render timeout instead of a one-line value mismatch. A
        // mutation has to fail LEGIBLY, not just fail — measured at 91 s vs 2 s.
        await loadSeriesPage(page, {
            sa_rel_collapse_threshold: '',
            sa_uniq_dropdown_visible_rows: '   ',
        });
        const nums = await readNumericSettings(page);

        expect(nums.sa_rel_collapse_threshold).toEqual({ value: 200, type: 'number' });
        expect(nums.sa_uniq_dropdown_visible_rows).toEqual({ value: 30, type: 'number' });
    });

    test('an unparseable value falls back to the schema default', async ({ page }) => {
        await loadSeriesPage(page, { sa_max_page: 'abc', sa_rel_collapse_threshold: null });
        const nums = await readNumericSettings(page);

        expect(nums.sa_max_page).toEqual({ value: 50, type: 'number' });
        expect(nums.sa_rel_collapse_threshold).toEqual({ value: 200, type: 'number' });
    });

    // ── User-visible behaviour ──────────────────────────────────────────────
    //
    // 12 distinct entities per table. A threshold of 2 must collapse it; the
    // broken read's fallback of 200 would leave it expanded.

    test('a string threshold BELOW the entity count collapses the table', async ({ page }) => {
        await loadSeriesPage(page, { sa_rel_collapse_threshold: '2' });
        const tables = await readRelTables(page);

        expect(tables.length, 'one table with a rel column').toBe(1);
        expect(tables[0].uniqueMbids, 'the shell still has 12 distinct entities')
            .toBe(SERIES_ENTITIES);
        // On unfixed code: typeof '2' !== 'number', so the threshold becomes
        // 200, 12 <= 200, and this reads `true`.
        expect(tables[0].expanded, 'string "2" is honoured, so 12 > 2 collapses').toBe(false);
    });

    test('a string threshold ABOVE the entity count leaves the table expanded', async ({ page }) => {
        // The counter-guard: without this, "a string collapses the table"
        // would also pass if strings were mishandled the other way. This pins
        // that the value is genuinely parsed and compared.
        await loadSeriesPage(page, { sa_rel_collapse_threshold: '500' });
        const tables = await readRelTables(page);

        expect(tables[0].uniqueMbids).toBe(SERIES_ENTITIES);
        expect(tables[0].expanded, 'string "500" is honoured, so 12 <= 500 stays expanded')
            .toBe(true);
    });

    test('a NUMBER threshold still behaves exactly as before', async ({ page }) => {
        // The regression control: numbers were never broken, and the coercion
        // pass must leave them alone. rel-column-collapse-toggle.spec.js seeds
        // this same value as a number, so a change here would show up there too
        // — which is the point of asserting it in both places.
        await loadSeriesPage(page, { sa_rel_collapse_threshold: 2 });
        const tables = await readRelTables(page);

        expect(tables[0].expanded, 'number 2 collapses 12 entities, as it always did')
            .toBe(false);
    });
});
