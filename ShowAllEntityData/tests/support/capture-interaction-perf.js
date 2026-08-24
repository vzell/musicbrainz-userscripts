'use strict';

/**
 * Interaction-latency perf capture — standalone Node script (not a
 * Playwright test), run directly:
 *
 *   node tests/support/capture-interaction-perf.js --pageType=artist-events
 *
 * Unlike `capture-snapshots.js`'s `--perf` mode (which times the INITIAL
 * fetch+render of a "Show all" click), this times the *interactions*
 * PERFORMANCE.org's Steps 1-4 specifically target — global filter, column
 * filter, sort, and unique-values-dropdown open (cold vs cache-warm) — on
 * the `artist-events` pageType (4174 rows), which `tests/snapshots/
 * registry.org` earmarks as the dedicated performance-comparison target for
 * exactly these interactions.
 *
 * Loads via the committed disk fixture (`tests/support/capture-fixture.js`,
 * `tests/support/diskFixture.js`) rather than a live "Show all" click, so
 * repeated samples are fast and don't re-pay a ~42-page live fetch each
 * time. Each sample gets its own fresh page load (mirroring
 * `capture-snapshots.js`'s `runPerf()`/`measureOnce()` convention), so an
 * interaction's timing bracket never includes another sample's leftover
 * state.
 *
 * There is deliberately no separate "header-count cold vs warm" metric:
 * `_updateAllColHeaderCounts()` runs exactly once at initial render for a
 * single-table page and is never re-triggered by filter/sort on
 * `perf-steps-1-4` (Step 1 removed that call) — its cost differential
 * between branches is already folded into the filter/sort numbers below,
 * not a separable signal.
 *
 * Currently only supports `--pageType=artist-events`; the interactions
 * (filter column/values, sort column, uniq-drop column) are specific to
 * that page's own data, not read from `tests/pagetypes.json`.
 *
 * Output: `tests/snapshots/<pageType>/interaction-perf-<branch>.json`, where
 * `<branch>` is the current git branch (auto-detected) — kept side by side
 * per branch rather than a single mutable file, so a `main` run and a
 * `perf-steps-1-4` run can be compared directly without one overwriting the
 * other.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('./diskFixture');
const { seedGmValues } = require('./gmStubs');
const { waitForRenderComplete } = require('./browser');
const { waitForFilterSettled, waitForSortSettled } = require('./filterSortAssertions');
const {
    URL, FIXTURE_PATH, SEED_GM_VALUES, FILTER_COLUMN, FILTER_VALUE, SORT_COLUMN, UNIQ_DROP_COLUMN,
} = require('./artistEventsFixture');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');
const USERSCRIPT_PATH = path.join(REPO_ROOT, 'ShowAllEntityData.user.js');
const SAMPLES = 5;

const ARTIST_EVENTS = {
    pageType: 'artist-events',
    url: URL,
    fixturePath: FIXTURE_PATH,
    seedGmValues: SEED_GM_VALUES,
    filterColumn: FILTER_COLUMN,
    // A different, never-before-typed value each sample avoids
    // `_filterResultCache` hits (a separate cache, unrelated to Steps 1-4,
    // present unmodified on both branches) skewing the comparison — five
    // real country values from the fixture's own data, the first matching
    // the correctness spec's own canonical FILTER_VALUE.
    filterValues: [FILTER_VALUE, 'Germany', 'Canada', 'Spain', 'Italy'],
    sortColumn: SORT_COLUMN,
    uniqDropColumn: UNIQ_DROP_COLUMN,
};

/** @param {string[]} argv @returns {{ pageType: string|null }} */
function parseArgs(argv) {
    const arg = argv.find((a) => a.startsWith('--pageType='));
    return { pageType: arg ? arg.slice('--pageType='.length) : null };
}

/** @returns {string} */
function readScriptVersion() {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').slice(0, 2000);
    const m = header.match(/\/\/ @version\s+(\S+)/);
    return m ? m[1] : 'unknown';
}

/** @returns {string} */
function readCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT }).toString().trim();
    } catch {
        return 'unknown';
    }
}

/** @param {number[]} values @returns {number} */
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {import('playwright').Browser} browser
 * @param {typeof ARTIST_EVENTS} config
 * @returns {Promise<import('playwright').Page>}
 */
async function loadPage(browser, config) {
    const page = await browser.newPage();
    await seedGmValues(page, config.seedGmValues);
    await loadFromDiskFixture(page, { url: config.url, fixturePath: config.fixturePath, testMode: true });
    // waitForRenderComplete (not a bare #mb-filter-container wait) — needed
    // for artist-events' 4174 rows, which exceed the chunked-render
    // threshold; see browser.js's own JSDoc for the confirmed race.
    //
    // waitForAutoResize: false — the auto-resize-on-load pass lives inside
    // startFetchingProcess() (the live "Show all" fetch pipeline only) and
    // is never triggered by loadFromDiskFixture()'s hydration path; see
    // artist-events-interactions.spec.js's identical note.
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
    return page;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function colFilterInputLocator(page, colName) {
    const colIdx = await page.evaluate((name) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th')).findIndex((t) => strip(t.textContent) === name);
    }, colName);
    return page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
}

/** @param {import('playwright').Browser} browser @param {typeof ARTIST_EVENTS} config @param {string} value @returns {Promise<number>} */
async function measureGlobalFilterOnce(browser, config, value) {
    const page = await loadPage(browser, config);
    const input = page.locator('#mb-global-filter-input');
    await input.click();
    const start = Date.now();
    await waitForFilterSettled(page, () => input.pressSequentially(value));
    const ms = Date.now() - start;
    await page.close();
    return ms;
}

/** @param {import('playwright').Browser} browser @param {typeof ARTIST_EVENTS} config @param {string} value @returns {Promise<number>} */
async function measureColumnFilterOnce(browser, config, value) {
    const page = await loadPage(browser, config);
    const input = await colFilterInputLocator(page, config.filterColumn);
    await input.click();
    const start = Date.now();
    await waitForFilterSettled(page, () => input.pressSequentially(value));
    const ms = Date.now() - start;
    await page.close();
    return ms;
}

/** @param {import('playwright').Browser} browser @param {typeof ARTIST_EVENTS} config @param {boolean} ascending @returns {Promise<number>} */
async function measureSortOnce(browser, config, ascending) {
    const page = await loadPage(browser, config);
    const columnTh = page.locator('table.tbl thead th', { hasText: config.sortColumn }).first();
    const btn = columnTh.locator('.sort-icon-btn', { hasText: ascending ? '▲' : '▼' }).first();
    const start = Date.now();
    await waitForSortSettled(page, () => btn.click());
    const ms = Date.now() - start;
    await page.close();
    return ms;
}

/** @param {import('playwright').Browser} browser @param {typeof ARTIST_EVENTS} config @returns {Promise<{coldMs: number, warmMs: number}>} */
async function measureUniqDropColdWarmOnce(browser, config) {
    const page = await loadPage(browser, config);
    const wrap = page.locator('table.tbl thead th', { hasText: config.uniqDropColumn }).first().locator('.mb-col-uniq-wrap');
    const dropdown = page.locator('#mb-col-uniq-dropdown');

    // el.click() (a plain DOM click dispatched in-page), NOT Playwright's
    // Locator.click() — confirmed empirically that a real mouse-simulated
    // click at computed pixel coordinates misses this element roughly half
    // the time (openUniqDrop() never invoked, dropdown stays hidden for the
    // full wait), while a DOM-level click is 100% reliable. The existing
    // window.__saTest.getUniqDropSections() hook already uses this same
    // approach for exactly this reason.
    const coldStart = Date.now();
    await wrap.evaluate((el) => el.click());
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const coldMs = Date.now() - coldStart;

    await page.evaluate(() => window.__saTest.closeUniqDrop());

    const warmStart = Date.now();
    await wrap.evaluate((el) => el.click());
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const warmMs = Date.now() - warmStart;

    await page.close();
    return { coldMs, warmMs };
}

/**
 * @param {import('playwright').Browser} browser
 * @param {typeof ARTIST_EVENTS} config
 * @returns {Promise<Object>}
 */
async function runAll(browser, config) {
    const globalFilterMs = [];
    const columnFilterMs = [];
    const sortMs = [];
    const uniqDropColdMs = [];
    const uniqDropWarmMs = [];

    for (let i = 0; i < SAMPLES; i++) {
        globalFilterMs.push(await measureGlobalFilterOnce(browser, config, config.filterValues[i]));
        columnFilterMs.push(await measureColumnFilterOnce(browser, config, config.filterValues[i]));
        sortMs.push(await measureSortOnce(browser, config, i % 2 === 0));
        const { coldMs, warmMs } = await measureUniqDropColdWarmOnce(browser, config);
        uniqDropColdMs.push(coldMs);
        uniqDropWarmMs.push(warmMs);
    }

    return {
        globalFilter: { medianMs: median(globalFilterMs), samples: SAMPLES },
        columnFilter: { medianMs: median(columnFilterMs), samples: SAMPLES },
        sort: { medianMs: median(sortMs), samples: SAMPLES },
        uniqDropCold: { medianMs: median(uniqDropColdMs), samples: SAMPLES },
        uniqDropWarm: { medianMs: median(uniqDropWarmMs), samples: SAMPLES },
    };
}

(async () => {
    const { pageType } = parseArgs(process.argv.slice(2));
    if (pageType !== 'artist-events') {
        console.error('Only --pageType=artist-events is currently supported.');
        process.exit(1);
    }

    const branch = readCurrentBranch();
    const browser = await chromium.launch();
    try {
        const interactions = await runAll(browser, ARTIST_EVENTS);

        const outPath = path.join(SNAPSHOTS_DIR, ARTIST_EVENTS.pageType, `interaction-perf-${branch}.json`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify({
            pageType: ARTIST_EVENTS.pageType,
            url: ARTIST_EVENTS.url,
            branch,
            capturedAt: new Date().toISOString().slice(0, 10),
            scriptVersion: readScriptVersion(),
            interactions,
        }, null, 2) + '\n');

        console.log(`${ARTIST_EVENTS.pageType} [interaction-perf, branch ${branch}]:`);
        for (const [name, { medianMs }] of Object.entries(interactions)) {
            console.log(`  ${name}: ${medianMs.toFixed(1)}ms`);
        }
        console.log(`Written to ${outPath}`);
    } finally {
        await browser.close();
    }
})().catch((err) => {
    console.error('capture-interaction-perf failed:', err);
    process.exit(1);
});
