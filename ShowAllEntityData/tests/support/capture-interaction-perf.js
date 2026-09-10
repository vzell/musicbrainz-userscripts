'use strict';

/**
 * Interaction-latency perf capture — standalone Node script (not a
 * Playwright test), run directly:
 *
 *   node tests/support/capture-interaction-perf.js --pageType=artist-events
 *   node tests/support/capture-interaction-perf.js --pageType=artist-releases-dylan \
 *        --arm=collapsed
 *
 * Unlike `capture-snapshots.js`'s `--perf` mode (which times the INITIAL
 * fetch+render of a "Show all" click), this times the *interactions*
 * PERFORMANCE.org's Steps 1-4 specifically target — global filter, column
 * filter, sort, and unique-values-dropdown open (cold vs cache-warm).
 *
 * Three pageTypes are instrumented, and which one to use depends on the step.
 * They are registered in `perfDescriptors.js` — one place, not the three this
 * used to take:
 *
 *   - `artist-events` (4174 rows, 21 columns, SINGLE-table) — the original
 *     arm, which `tests/snapshots/registry.org` earmarks as the dedicated
 *     performance-comparison target. Every committed baseline before
 *     9.99.1057 is this page.
 *   - `artist-releases-dylan` (2301 rows, 21 columns, SINGLE-table) — added
 *     for Steps 23 and 32, which `artist-events` structurally CANNOT measure:
 *     it has no `/release/<mbid>` link anywhere, so `initPicardTaggerColumn()`
 *     skips every one of its tables and the Picard column those steps are
 *     about never exists. Pair it with `--arm=` (see PICARD_ARMS).
 *   - `artist-releasegroups` (2143 rows across 47 sub-tables, 9 columns,
 *     MULTI-table) — the first multi-table arm. Every metric committed before
 *     it describes `renderFinalTable()`, which MOVES its rows;
 *     `renderGroupedTable()` ALWAYS CLONES, on the first render too, and that
 *     is where Tier 1's per-pass costs are largest. Also the ERG-heaviest page
 *     in the repo (4286 `[data-erg-btn]`), and it has no Picard column at all,
 *     so `--arm=` is a no-op there.
 *
 * The three are not interchangeable and their numbers are not comparable to
 * each other — different row counts, different columns, different data, and on
 * the multi-table one a different SCOPE (see `scope()`/`metricTable()` below
 * and `perfDescriptors.js`'s multi-table contract). Compare arms of the SAME
 * pageType, captured in the same session, per CLAUDE.md's "quote only
 * within-session A/B ratios".
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
 * A pageType is instrumented by adding a descriptor module (the ARMS registry
 * below resolves `--pageType=` against it), not by adding an entry to
 * `tests/pagetypes.json`: the interactions — which column to filter, which
 * values to type, which column to sort, which column carries the header-count
 * metric — are specific to that page's own data, and every one of those
 * constants has to be MEASURED from the committed disk fixture rather than
 * chosen. `scripts/probe-fixture-columns.js` is what measures them; see
 * `dylanArtistReleasesFixture.js` for the two that cannot be guessed at all.
 *
 * Output: `tests/snapshots/<pageType>/interaction-perf-<branch>-<version>-
 * <capturedAt>[-<hostname>].json`, where `<branch>` is the current git
 * branch (auto-detected), `<version>` is the userscript header's version
 * NUMBER without its `+YYYY-MM-DD` ship stamp, `<capturedAt>` is the run's
 * own date, and `<hostname>` is appended only when the host resolves to
 * something meaningful — an unresolvable host is left OUT of the name rather
 * than guessed, matching CLAUDE.md's "mark an unknown host as unknown" rule.
 * All of that naming, and the `machine` block below, live in
 * `runMetadata.js`, shared with `capture-pass-cost.js` so the two capture
 * scripts cannot drift apart on the convention. This is kept side by side per arm rather
 * than a single mutable file, so a `main` run and a `perf-steps-1-4` run —
 * or the same branch captured on two different machines — can be compared
 * directly without one overwriting the other.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('./diskFixture');
const { seedGmValues } = require('./gmStubs');
const { waitForRenderComplete } = require('./browser');
const {
    waitForFilterSettled, waitForSortSettled, waitForColHeaderUniqCount,
    waitForColHeaderCountsStable, columnIndex, columnFilterInput, columnFilterClear,
    ensureSubTableVisible,
} = require('./filterSortAssertions');
const {
    toArm, pageTypeList, applyPicardArm, PICARD_ARMS,
} = require('./perfDescriptors');
const {
    readScriptVersion, machineInfo, readCurrentBranch, archiveFileStem,
} = require('./runMetadata');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');

/**
 * Samples per metric. 5 is the committed convention and what every baseline in
 * `tests/MEASUREMENTS.org` is a median of — do not publish a number captured at
 * anything else.
 *
 * `--samples=N` overrides it for one purpose only: proving the plumbing works
 * before committing to a long run. A full arm is 30 fresh page loads and takes
 * roughly 15-20 minutes, and everything that can go wrong at the END of it —
 * the output path, the JSON shape, the filename — goes wrong after all of that
 * work is already done. That is not hypothetical: `sanitizeForFilename` was
 * left out of this file's import list when `runMetadata.js` was extracted
 * (fcae7a2, 2026-09-09), so from then until 9.99.1057 EVERY run measured
 * everything and then died on the last line with a ReferenceError, writing
 * nothing. Three arms were lost to it before it was noticed. Pair
 * `--samples=1` with `--label=` so the throwaway run cannot overwrite a real
 * arm's file.
 */
const DEFAULT_SAMPLES = 5;

/**
 * The root every PER-TABLE metric resolves against.
 *
 * On a multi-table page the harness's helpers are otherwise silently
 * sub-table-0-scoped — `columnIndex()` searches every sub-table's `<thead>`,
 * `columnFilterInput()`/`columnFilterClear()` take `.first()` of one input per
 * sub-table — and sub-table 0 is routinely tiny (21 of `artist-releasegroups`'
 * 2143 rows), so an unscoped metric there measures 1% of the page and reports
 * it as a fast result. `perfDescriptors.js` documents the whole contract; this
 * is the one place that applies it.
 *
 * On a single-table page there is exactly one `table.tbl`, so index 0 and the
 * unscoped form resolve the identical element and the two committed
 * single-table arms stay directly comparable to their predecessors.
 *
 * @param {ReturnType<typeof toArm>} config
 * @returns {{tableIndex: number}} option bag for the scoped helpers
 */
function scope(config) {
    return { tableIndex: config.subTableIndex };
}

/**
 * The `<table>` a per-table metric acts on, for the locators that take an
 * element rather than an option bag.
 *
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof toArm>} config
 * @returns {import('playwright').Locator}
 */
function metricTable(page, config) {
    return page.locator('table.tbl').nth(config.subTableIndex);
}

/**
 * Where a sort writes its completion status.
 *
 * A multi-table sort writes ONLY its own group's `h3 .mb-sort-status` and never
 * touches `#mb-sort-status-display` — confirmed empirically, and
 * `waitForSortSettled()`'s own JSDoc records that omitting the group makes the
 * wait time out on a page that sorted perfectly well. It is resolved here by
 * INDEX and handed over as `statusLocator`, which is that function's documented
 * escape hatch: a `hasText` lookup on this very page can land on a view-hidden
 * section whose heading merely contains the wanted one.
 *
 * `h3.mb-toggle-h3` is index-aligned with `table.tbl` (measured: 47 of each on
 * `artist-releasegroups`, and every heading's own `(N)` matches its table's row
 * count). `null` on a single-table page, where the page-wide display is right.
 *
 * @param {import('playwright').Page} page
 * @param {ReturnType<typeof toArm>} config
 * @returns {import('playwright').Locator|undefined}
 */
function sortStatusLocator(page, config) {
    if (config.tableMode !== 'multi') return undefined;
    return page.locator('h3.mb-toggle-h3').nth(config.subTableIndex).locator('.mb-sort-status');
}

/**
 * `--label=<name>` overrides the branch-derived PREFIX of the output
 * filename (the `<version>-<capturedAt>[-<hostname>]` suffix is still
 * appended). Needed to measure a DIFFERENT script than the branch implies —
 * the established technique for a baseline arm is to check out `main`'s
 * `ShowAllEntityData.user.js` alone into the feature branch's working tree
 * (see PERFORMANCE.org's own "the working tree with only
 * ShowAllEntityData.user.js stashed" note), which would otherwise write
 * `main`'s numbers under the branch's name.
 *
 * `--arm=absent|collapsed|expanded` selects a seed override and, unless
 * `--label=` says otherwise, appends itself to the output filename — so three
 * arms of the same branch land side by side instead of overwriting each other.
 * See `perfDescriptors.js`'s `PICARD_ARMS` for what the three separate, and its
 * `NO_PICARD_COLUMN` for the two pageTypes where they are all the same thing.
 *
 * `--samples=N` overrides `DEFAULT_SAMPLES` for plumbing checks only; see that
 * constant's own JSDoc.
 *
 * @param {string[]} argv
 * @returns {{ pageType: string|null, label: string|null, arm: string|null,
 *   samples: number }}
 */
function parseArgs(argv) {
    const arg = argv.find((a) => a.startsWith('--pageType='));
    const labelArg = argv.find((a) => a.startsWith('--label='));
    const armArg = argv.find((a) => a.startsWith('--arm='));
    const samplesArg = argv.find((a) => a.startsWith('--samples='));
    const samples = samplesArg ? parseInt(samplesArg.slice('--samples='.length), 10) : DEFAULT_SAMPLES;
    return {
        pageType: arg ? arg.slice('--pageType='.length) : null,
        label: labelArg ? labelArg.slice('--label='.length) : null,
        arm: armArg ? armArg.slice('--arm='.length) : null,
        samples: Number.isFinite(samples) && samples > 0 ? samples : DEFAULT_SAMPLES,
    };
}

/** Samples per metric for the current run; set once in main() from --samples=. */
let SAMPLES = DEFAULT_SAMPLES;

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
 * @param {ReturnType<typeof toArm>} config
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
    // 120 s on a multi-table arm: renderGroupedTable() builds 47 <h3>/<table>
    // pairs and clones every row into them, where the single-table path moves
    // its rows. The probe needed the same allowance.
    await waitForRenderComplete(page, {
        waitForAutoResize: false,
        timeout: config.tableMode === 'multi' ? 120000 : 60000,
    });
    // Multi-table only, and BEFORE every measurement bracket: 45 of
    // artist-releasegroups' 47 sub-tables render display:none despite the
    // master toggle reading "expanded", so a per-table metric's target is a
    // 0x0 element Playwright will never click. See that helper's own JSDoc.
    if (config.tableMode === 'multi') await ensureSubTableVisible(page, config.subTableIndex);
    return page;
}


/** @param {import('playwright').Browser} browser @param {ReturnType<typeof toArm>} config @param {string} value @returns {Promise<number>} */
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

/** @param {import('playwright').Browser} browser @param {ReturnType<typeof toArm>} config @param {string} value @returns {Promise<number>} */
async function measureColumnFilterOnce(browser, config, value) {
    const page = await loadPage(browser, config);
    const colIdx = await columnIndex(page, config.filterColumn, scope(config));
    if (colIdx < 0) throw new Error(`column "${config.filterColumn}" not found in sub-table ${config.subTableIndex}`);
    const input = columnFilterInput(page, colIdx, scope(config));
    await input.click();
    const start = Date.now();
    await waitForFilterSettled(page, () => input.pressSequentially(value));
    const ms = Date.now() - start;
    await page.close();
    return ms;
}

/** @param {import('playwright').Browser} browser @param {ReturnType<typeof toArm>} config @param {boolean} ascending @returns {Promise<number>} */
async function measureSortOnce(browser, config, ascending) {
    const page = await loadPage(browser, config);
    const columnTh = metricTable(page, config).locator('thead th', { hasText: config.sortColumn }).first();
    const btn = columnTh.locator('.sort-icon-btn', { hasText: ascending ? '▲' : '▼' }).first();
    const start = Date.now();
    await waitForSortSettled(page, () => btn.click(), { statusLocator: sortStatusLocator(page, config) });
    const ms = Date.now() - start;
    await page.close();
    return ms;
}

/** @param {import('playwright').Browser} browser @param {ReturnType<typeof toArm>} config @returns {Promise<{coldMs: number, warmMs: number}>} */
async function measureUniqDropColdWarmOnce(browser, config) {
    const page = await loadPage(browser, config);
    const wrap = metricTable(page, config)
        .locator('thead th', { hasText: config.uniqDropColumn }).first()
        .locator('.mb-col-uniq-wrap');
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
 * @param {ReturnType<typeof toArm>} config
 * @returns {Promise<number>}
 */
async function measureHeaderCountsInitialOnce(browser, config) {
    const page = await loadPage(browser, config);
    const start = Date.now();
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountTotal,
        { timeout: 120000, ...scope(config) });
    await waitForColHeaderCountsStable(page, { timeout: config.tableMode === 'multi' ? 300000 : 90000 });
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
 * @param {ReturnType<typeof toArm>} config
 * @returns {Promise<number>}
 */
async function measureHeaderCountsRestoreOnce(browser, config) {
    const page = await loadPage(browser, config);
    const stableTimeout = config.tableMode === 'multi' ? 300000 : 90000;
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountTotal,
        { timeout: 120000, ...scope(config) });
    await waitForColHeaderCountsStable(page, { timeout: stableTimeout });

    const colIdx = await columnIndex(page, config.headerCountColumn, scope(config));
    if (colIdx < 0) throw new Error(`column "${config.headerCountColumn}" not found in sub-table ${config.subTableIndex}`);

    // .click() then .pressSequentially() — column filter inputs are
    // readonly-until-a-genuine-trusted-interaction (anti-autofill hardening),
    // and .fill() is rejected by _isGenuineFilterInputEvent().
    const colInput = columnFilterInput(page, colIdx, scope(config));
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially(config.headerCountFilterValue));
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountFilterUniq,
        { timeout: 120000, ...scope(config) });

    // The per-column ✕ clears the value, re-focuses the input and calls
    // runFilter() immediately — undebounced, unlike typing, so the bracket
    // below is the re-render plus the header-count scan and nothing else.
    const start = Date.now();
    await columnFilterClear(page, colIdx, scope(config)).click();
    await waitForColHeaderUniqCount(page, config.headerCountColumn, config.headerCountTotal,
        { timeout: 120000, ...scope(config) });
    await waitForColHeaderCountsStable(page, { timeout: stableTimeout });
    const ms = Date.now() - start;
    await page.close();
    return ms;
}

/**
 * @param {import('playwright').Browser} browser
 * @param {ReturnType<typeof toArm>} config
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
    const { pageType, label, arm, samples } = parseArgs(process.argv.slice(2));
    SAMPLES = samples;
    if (SAMPLES !== DEFAULT_SAMPLES) {
        console.warn(`  NOTE: --samples=${SAMPLES} — a plumbing check, NOT a publishable arm. `
            + `Every number in tests/MEASUREMENTS.org is a median of ${DEFAULT_SAMPLES}.`);
    }
    // toArm()/applyPicardArm() throw with the supported list rather than
    // returning undefined, and both live in perfDescriptors.js so that adding
    // a pageType is one edit rather than three (see that module's header).
    let config;
    try {
        config = applyPicardArm(toArm(pageType), arm);
    } catch (err) {
        console.error(err.message);
        console.error(`Supported --pageType=: ${pageTypeList().join(', ')}`);
        console.error(`Supported --arm=: ${Object.keys(PICARD_ARMS).join(', ')}`);
        process.exit(1);
    }

    const branch = readCurrentBranch();
    const outName = label || (arm ? `${branch}-picard-${arm}` : branch);
    const startedAt = new Date();
    const capturedAt = startedAt.toISOString().slice(0, 10);
    const scriptVersion = readScriptVersion();
    const browser = await chromium.launch();
    try {
        const interactions = await runAll(browser, config);

        // archiveFileStem(), not a hand-rolled parts array. runMetadata.js's
        // own header says this script "requires them from here", and it did —
        // for the pieces, while still assembling the stem itself, so the two
        // capture scripts could have drifted on the convention at any time
        // without anything failing. They agree; nothing enforced it.
        const stem = archiveFileStem({
            prefix: 'interaction-perf',
            label: outName,
            version: scriptVersion,
            capturedAt,
        });
        const outPath = path.join(SNAPSHOTS_DIR, config.pageType, `${stem}.json`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify({
            pageType: config.pageType,
            url: config.url,
            // Recorded because it decides how the numbers may be read: on a
            // 'multi' arm the columnFilter/sort/uniqDrop* metrics and both
            // headerCounts* BADGE assertions act on sub-table
            // `subTableIndex` alone, while globalFilter and the
            // header-count SETTLE are page-wide, and `sort` additionally
            // takes Step 18's scoped re-render path. See
            // perfDescriptors.js's multi-table contract.
            tableMode: config.tableMode,
            subTableIndex: config.tableMode === 'multi' ? config.subTableIndex : null,
            totalRows: config.totalRows,
            picardArm: arm || null,
            seedGmValues: config.seedGmValues,
            branch: outName,
            gitBranch: branch,
            capturedAt,
            // Full timestamps, not just the date. A run is ~20 minutes of real
            // requests to musicbrainz.org for its page shells, so time of day
            // is a candidate explanation for arm-to-arm differences that the
            // script cannot account for — MusicBrainz is busier at some hours
            // than others. Both ends are recorded because the window matters,
            // not the instant. UTC, so arms from different timezones compare.
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            machine: machineInfo(),
            scriptVersion,
            interactions,
        }, null, 2) + '\n');

        const m = machineInfo();
        console.log(`${config.pageType} [interaction-perf, ${outName}] `
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
