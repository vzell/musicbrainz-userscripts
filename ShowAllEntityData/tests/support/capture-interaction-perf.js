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
 * time. Note what that does and does not make network-free: the TABLE DATA
 * comes off disk, but `loadFromDiskFixture()` still `page.goto()`s the real
 * musicbrainz.org for the page shell (it passes no `fixtureFile`, so
 * `loadUserscriptPage()` registers no route). Hence `withRetry()` below — the
 * page load itself is outside every measurement bracket, but a navigation
 * timeout still aborts the whole run. Each sample gets its own fresh page load (mirroring
 * `capture-snapshots.js`'s `runPerf()`/`measureOnce()` convention), so an
 * interaction's timing bracket never includes another sample's leftover
 * state.
 *
 * `headerCountsInitial`/`headerCountsRestore` time the column-header count
 * scan (`_updateAllColHeaderCounts()`) directly, by waiting on the `Event`
 * badge reaching its true 4158 AND THEN on every badge on the page holding
 * still. Both halves are needed: the value wait proves the scan really reached
 * that column (a scan that is superseded and abandoned leaves the badges stable
 * but wrong, which a stability check alone would happily time as a fast
 * result), and the stability wait covers the other twenty columns, which on
 * this page are still empty long after `Event` is correct. Measured with only
 * the value wait, this page reported ~1.9 s while most of its header was still
 * blank.
 *
 * `waitForColHeaderCountsStable()` needs four identical polls at 250 ms, so
 * both metrics carry a ~1 s floor. That floor is identical on every arm being
 * compared, so it compresses the ratio between arms slightly and never
 * exaggerates it. They replace
 * an earlier note here claiming no such metric was possible because the
 * scan's cost "is already folded into the filter/sort numbers" — that is true
 * but not sufficient. The five metrics below observe it only indirectly, as
 * main-thread pressure delaying a CDP poll of `#mb-filter-status-display`,
 * which understates it and cannot separate it from the render it follows.
 * PERFORMANCE.org Step 3 caches exactly this scan, so it needs a metric that
 * looks at the scan itself. Note `_updateAllColHeaderCounts()` is still not
 * reachable from `openUniqDrop()`, so it remains absent from the uniq-drop
 * numbers, which stay Step 4's.
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
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('./diskFixture');
const { seedGmValues } = require('./gmStubs');
const { waitForRenderComplete } = require('./browser');
const {
    waitForFilterSettled, waitForSortSettled, waitForColHeaderUniqCount,
    waitForColHeaderCountsStable,
} = require('./filterSortAssertions');
const {
    URL, FIXTURE_PATH, SEED_GM_VALUES, FILTER_COLUMN, FILTER_VALUE, SORT_COLUMN, UNIQ_DROP_COLUMN,
    UNIQ_COUNT_COLUMN, UNIQ_COUNT_TOTAL, UNIQ_COUNT_FILTER_VALUE, UNIQ_COUNT_FILTER_UNIQ,
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
    // `_filterResultCache` hits skewing the comparison. That is the filter
    // pipeline's own row-match cache — unrelated to, and untouched by, any
    // PERFORMANCE.org step, so it must be defeated identically on every
    // branch being compared. Five real country values from the fixture's own
    // data, the first matching the correctness spec's canonical FILTER_VALUE.
    filterValues: [FILTER_VALUE, 'Germany', 'Canada', 'Spain', 'Italy'],
    sortColumn: SORT_COLUMN,
    uniqDropColumn: UNIQ_DROP_COLUMN,
    // The header-count metrics assert an EXACT badge value rather than
    // "stopped changing": a scan that is superseded and abandoned leaves the
    // badges stable-but-wrong, which a stability heuristic would happily
    // time as a fast result. Same reasoning as artist-events-interactions
    // .spec.js's own preference for waitForColHeaderUniqCount().
    headerCountColumn: UNIQ_COUNT_COLUMN,
    headerCountTotal: UNIQ_COUNT_TOTAL,
    headerCountFilterValue: UNIQ_COUNT_FILTER_VALUE,
    headerCountFilterUniq: UNIQ_COUNT_FILTER_UNIQ,
};

/**
 * `--label=<name>` overrides the branch-derived output filename. Needed to
 * measure a DIFFERENT script than the branch implies — the established
 * technique for a baseline arm is to check out `main`'s
 * `ShowAllEntityData.user.js` alone into the feature branch's working tree
 * (see PERFORMANCE.org's own "the working tree with only
 * ShowAllEntityData.user.js stashed" note), which would otherwise write
 * `main`'s numbers under the branch's name.
 *
 * @param {string[]} argv
 * @returns {{ pageType: string|null, label: string|null }}
 */
function parseArgs(argv) {
    const arg = argv.find((a) => a.startsWith('--pageType='));
    const labelArg = argv.find((a) => a.startsWith('--label='));
    return {
        pageType: arg ? arg.slice('--pageType='.length) : null,
        label: labelArg ? labelArg.slice('--label='.length) : null,
    };
}

/** @returns {string} */
function readScriptVersion() {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').slice(0, 2000);
    const m = header.match(/\/\/ @version\s+(\S+)/);
    return m ? m[1] : 'unknown';
}

/**
 * Identifies the machine a run happened on, so absolutes are never compared
 * across machines by accident.
 *
 * This exists because two `main` captures three script versions apart were
 * 1.5-2x apart, and "which machine was that on" could not be answered from the
 * committed JSON at all — the gap got attributed to machine state, then to
 * load, before anyone checked. Both turned out to be guesses. Record enough to
 * settle it next time: host, core count, and the two versions that actually
 * move browser timings.
 *
 * @returns {{hostname: string, platform: string, release: string, cpus: number,
 *   totalMemGb: number, node: string, playwright: string}}
 */
function machineInfo() {
    let playwright = 'unknown';
    try {
        playwright = require('playwright/package.json').version;
    } catch { /* leave unknown */ }
    return {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        cpus: os.cpus().length,
        totalMemGb: Math.round(os.totalmem() / 1024 ** 3),
        node: process.version,
        playwright,
    };
}

/** @returns {string} */
function readCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT }).toString().trim();
    } catch {
        return 'unknown';
    }
}

/**
 * Runs one sample, retrying a few times before giving up.
 *
 * Every sample loads its page with `page.goto()` against the real
 * musicbrainz.org: the disk fixture supplies the TABLE DATA, not the page
 * shell, so "no network" describes this harness's data determinism and not its
 * page load. MusicBrainz is intermittently unreachable often enough that two
 * complete 20-minute runs were lost to a single 30 s navigation timeout, with
 * host probes timing out roughly one request in three at the time.
 *
 * A retry cannot distort a timing: the measurement bracket inside each
 * `measure*Once()` starts AFTER its page has loaded, so a failed attempt
 * contributes nothing but wall clock. Only genuinely completed samples reach
 * `median()`.
 *
 * @template T
 * @param {string} label - metric name, for the retry notice
 * @param {() => Promise<T>} fn
 * @param {number} [attempts]
 * @returns {Promise<T>}
 */
async function withRetry(label, fn, attempts = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            console.warn(`  ${label}: attempt ${attempt}/${attempts} failed (${err.message.split('\n')[0]})`);
        }
    }
    throw lastErr;
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
 * One column's ✕ clear button, scoped through its enclosing
 * `.mb-col-filter-wrapper` rather than indexed — a checkbox column gets a bare
 * `<th>` with no input and no ✕, so the ✕ list is not index-aligned with the
 * column list. Same helper as artist-events-interactions.spec.js's own.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} colIdx
 * @returns {import('@playwright/test').Locator}
 */
function columnFilterClear(page, colIdx) {
    return page.locator(
        `table.tbl thead .mb-col-filter-wrapper:has(.mb-col-filter-input[data-col-idx="${colIdx}"]) .mb-col-filter-clear`
    ).first();
}

/**
 * Time from "the page says it has finished rendering" to "the header-count
 * scan has actually finished", measured as the `Event` badge reaching its true
 * unique count over all 4174 rows.
 *
 * This gap is real and large on `main`: the committed
 * `tests/snapshots/artist-events/rendered.html` baseline — captured right after
 * the same `waitForRenderComplete()` this function awaits — has 1 of its 21
 * `.mb-col-uniq-count` badges populated, because the scan is still working
 * through its per-column slices.
 *
 * @param {import('playwright').Browser} browser
 * @param {typeof ARTIST_EVENTS} config
 * @returns {Promise<number>}
 */
async function measureHeaderCountsInitialOnce(browser, config) {
    const page = await loadPage(browser, config);
    const start = Date.now();
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountTotal, { timeout: 120000 });
    await waitForColHeaderCountsStable(page);
    const ms = Date.now() - start;
    await page.close();
    return ms;
}

/**
 * Time to restore the full-table header counts after clearing a narrow column
 * filter — the cleanest read on PERFORMANCE.org Step 3's cache, because the row
 * set being restored to is exactly the one the initial render already scanned.
 *
 * Deliberately waits for the initial scan to COMPLETE before starting: without
 * that, the filter would race a still-running full-table pass and the bracket
 * would time two overlapping scans instead of one.
 *
 * @param {import('playwright').Browser} browser
 * @param {typeof ARTIST_EVENTS} config
 * @returns {Promise<number>}
 */
async function measureHeaderCountsRestoreOnce(browser, config) {
    const page = await loadPage(browser, config);
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountTotal, { timeout: 120000 });
    await waitForColHeaderCountsStable(page);

    const colIdx = await page.evaluate((name) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th')).findIndex((t) => strip(t.textContent) === name);
    }, config.headerCountColumn);

    // .click() then .pressSequentially() — column filter inputs are
    // readonly-until-a-genuine-trusted-interaction (anti-autofill hardening),
    // and .fill() is rejected by _isGenuineFilterInputEvent().
    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially(config.headerCountFilterValue));
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountFilterUniq, { timeout: 120000 });

    // The per-column ✕ clears the value, re-focuses the input and calls
    // runFilter() immediately — undebounced, unlike typing, so the bracket
    // below is the re-render plus the header-count scan and nothing else.
    const start = Date.now();
    await columnFilterClear(page, colIdx).click();
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountTotal, { timeout: 120000 });
    await waitForColHeaderCountsStable(page);
    const ms = Date.now() - start;
    await page.close();
    return ms;
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
    const headerCountsInitialMs = [];
    const headerCountsRestoreMs = [];

    for (let i = 0; i < SAMPLES; i++) {
        globalFilterMs.push(await withRetry('globalFilter',
            () => measureGlobalFilterOnce(browser, config, config.filterValues[i])));
        columnFilterMs.push(await withRetry('columnFilter',
            () => measureColumnFilterOnce(browser, config, config.filterValues[i])));
        sortMs.push(await withRetry('sort',
            () => measureSortOnce(browser, config, i % 2 === 0)));
        const { coldMs, warmMs } = await withRetry('uniqDrop',
            () => measureUniqDropColdWarmOnce(browser, config));
        uniqDropColdMs.push(coldMs);
        uniqDropWarmMs.push(warmMs);
        headerCountsInitialMs.push(await withRetry('headerCountsInitial',
            () => measureHeaderCountsInitialOnce(browser, config)));
        headerCountsRestoreMs.push(await withRetry('headerCountsRestore',
            () => measureHeaderCountsRestoreOnce(browser, config)));
    }

    return {
        globalFilter: { medianMs: median(globalFilterMs), samples: SAMPLES },
        columnFilter: { medianMs: median(columnFilterMs), samples: SAMPLES },
        sort: { medianMs: median(sortMs), samples: SAMPLES },
        uniqDropCold: { medianMs: median(uniqDropColdMs), samples: SAMPLES },
        uniqDropWarm: { medianMs: median(uniqDropWarmMs), samples: SAMPLES },
        headerCountsInitial: { medianMs: median(headerCountsInitialMs), samples: SAMPLES },
        headerCountsRestore: { medianMs: median(headerCountsRestoreMs), samples: SAMPLES },
    };
}

(async () => {
    const { pageType, label } = parseArgs(process.argv.slice(2));
    if (pageType !== 'artist-events') {
        console.error('Only --pageType=artist-events is currently supported.');
        process.exit(1);
    }

    const branch = readCurrentBranch();
    const outName = label || branch;
    const browser = await chromium.launch();
    try {
        const interactions = await runAll(browser, ARTIST_EVENTS);

        const outPath = path.join(SNAPSHOTS_DIR, ARTIST_EVENTS.pageType, `interaction-perf-${outName}.json`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify({
            pageType: ARTIST_EVENTS.pageType,
            url: ARTIST_EVENTS.url,
            branch: outName,
            gitBranch: branch,
            capturedAt: new Date().toISOString().slice(0, 10),
            machine: machineInfo(),
            scriptVersion: readScriptVersion(),
            interactions,
        }, null, 2) + '\n');

        const m = machineInfo();
        console.log(`${ARTIST_EVENTS.pageType} [interaction-perf, ${outName}] `
            + `on ${m.hostname} (${m.cpus} cores, node ${m.node}, playwright ${m.playwright}):`);
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
