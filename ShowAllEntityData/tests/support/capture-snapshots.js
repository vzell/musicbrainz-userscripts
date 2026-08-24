'use strict';

/**
 * HTML snapshot capture runner — standalone Node script (not a Playwright
 * test), run directly:
 *
 *   node tests/support/capture-snapshots.js                    # all registered pageTypes
 *   node tests/support/capture-snapshots.js --only=release-tracks
 *   node tests/support/capture-snapshots.js --headed            # debugging
 *   node tests/support/capture-snapshots.js --perf              # perf timing instead (artist-releasegroups only — see runPerf())
 *
 * For each pageType in `tests/pagetypes.json` (a data file, not hardcoded
 * here, so adding a pageType later is a data change): captures MB's own raw
 * HTML, then triggers the script's "Show all" fetch/render and captures the
 * fully-rendered HTML, scrubbing known-volatile content (`snapshot.js`)
 * from both before writing to `tests/snapshots/<pageType>/{raw,rendered}
 * .html`. Diffs against whatever was already on disk *before* this run
 * overwrites it, and prints a one-line status per pageType. Committing the
 * resulting files as a new baseline (once a diff is confirmed intentional)
 * is a plain `git add`/`git diff` — no separate tooling needed for that
 * part.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadUserscriptPage } = require('./loadPage');
const { loadFromDiskFixture } = require('./diskFixture');
const { waitForRenderComplete } = require('./browser');
const { captureRaw, captureRendered, scrub, diffSummary } = require('./snapshot');
const { seedGmValues } = require('./gmStubs');
const { waitForFilterSettled, waitForSortSettled, waitForActualRowCount } = require('./filterSortAssertions');
const {
    URL: ARTIST_EVENTS_URL, FIXTURE_PATH: ARTIST_EVENTS_FIXTURE_PATH, SEED_GM_VALUES: ARTIST_EVENTS_SEED_GM_VALUES,
    FILTER_COLUMN: ARTIST_EVENTS_FILTER_COLUMN, FILTER_VALUE: ARTIST_EVENTS_FILTER_VALUE, SORT_COLUMN: ARTIST_EVENTS_SORT_COLUMN,
    TOTAL_ROWS: ARTIST_EVENTS_TOTAL_ROWS,
} = require('./artistEventsFixture');

const REPO_ROOT = path.join(__dirname, '..', '..');
const AUTH_FILE = path.join(REPO_ROOT, 'playwright', '.auth', 'vzell.json');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');
const PAGETYPES_PATH = path.join(__dirname, '..', 'pagetypes.json');
const USERSCRIPT_PATH = path.join(REPO_ROOT, 'ShowAllEntityData.user.js');

/**
 * @param {string[]} argv - `process.argv.slice(2)`
 * @returns {{ only: string|null, headed: boolean, perf: boolean }}
 */
function parseArgs(argv) {
    const onlyArg = argv.find((a) => a.startsWith('--only='));
    return {
        only: onlyArg ? onlyArg.slice('--only='.length) : null,
        headed: argv.includes('--headed'),
        perf: argv.includes('--perf'),
    };
}

/**
 * Reads the current `// @version` from the userscript header, for stamping
 * into a perf baseline JSON file.
 *
 * @returns {string}
 */
function readScriptVersion() {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').slice(0, 2000);
    const m = header.match(/\/\/ @version\s+(\S+)/);
    return m ? m[1] : 'unknown';
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param {string} filePath @returns {string|null} */
function readPrevious(filePath) {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

/** @param {string} filePath @param {string} content @returns {void} */
function writeSnapshot(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

/**
 * Captures both raw and rendered snapshots for one pageType config from
 * `tests/pagetypes.json`.
 *
 * @param {import('playwright').Browser} browser
 * @param {{ pageType: string, url: string, showAllButtonSelector: string, seedGmValues?: Object, hasCaaOrEaa?: boolean, hasRelationships?: boolean, waitForAutoResize?: boolean }} config
 * @returns {Promise<{ pageType: string, status: string }>}
 */
async function captureOne(browser, config) {
    const {
        pageType, url, showAllButtonSelector, seedGmValues: seedValues,
        hasCaaOrEaa, hasRelationships, waitForAutoResize = true, renderTimeout = 90000,
    } = config;
    const context = await browser.newContext(fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {});
    const page = await context.newPage();

    const dir = path.join(SNAPSHOTS_DIR, pageType);
    const rawPath = path.join(dir, 'raw.html');
    const renderedPath = path.join(dir, 'rendered.html');
    const prevRaw = readPrevious(rawPath);
    const prevRendered = readPrevious(renderedPath);

    const rawHtml = scrub(await captureRaw(page, url), pageType);
    writeSnapshot(rawPath, rawHtml);

    await seedGmValues(page, seedValues);
    await loadUserscriptPage(page, { url, testMode: true });
    const showAllBtn = page.locator(showAllButtonSelector);
    await showAllBtn.waitFor({ state: 'visible', timeout: 15000 });
    await showAllBtn.click();
    await waitForRenderComplete(page, { hasCaaOrEaa, hasRelationships, waitForAutoResize, timeout: renderTimeout });

    const renderedHtml = scrub(await captureRendered(page), pageType);
    writeSnapshot(renderedPath, renderedHtml);

    await context.close();

    // Tracked per-file, not as a single all-or-nothing flag — a prior run
    // can fail partway through (e.g. after raw.html was written but before
    // rendered.html was reached) and leave the two files' "first capture"
    // status genuinely different; lumping them together silently misreports
    // a first-ever rendered.html write as "unchanged".
    const parts = [];
    if (prevRaw === null) {
        parts.push('raw.html: first capture');
    } else if (!diffSummary(prevRaw, rawHtml).identical) {
        parts.push('raw.html changed — check if MB updated the page');
    }
    if (prevRendered === null) {
        parts.push('rendered.html: first capture');
    } else if (!diffSummary(prevRendered, renderedHtml).identical) {
        parts.push('rendered.html changed — check if this was an intended script change');
    }

    // artist-events only for now (gated the same way --perf below is scoped
    // to artist-releasegroups only): two additional post-interaction DOM
    // snapshots, catching a regression PERFORMANCE.org's Steps 1/2
    // (in-place DOM mutation replacing cloneNode+rebuild for filter/sort)
    // could introduce that no single correctness assertion would catch — a
    // stray leftover element, a class not removed, an attribute order
    // change — by diffing the FULL rendered DOM the same way rendered.html
    // already does for the initial render. See
    // captureArtistEventsInteractionSnapshots()'s own JSDoc.
    if (pageType === 'artist-events') {
        parts.push(...await captureArtistEventsInteractionSnapshots(browser, dir));
    }

    return { pageType, status: parts.length ? parts.join('; ') : 'unchanged' };
}

/**
 * Waits for a large-table rebuild (clearing a filter back to the full row
 * count, or sorting) to fully settle on `main`'s current cloneNode+rebuild
 * implementation: both the real `tbody tr` count reaching
 * `ARTIST_EVENTS_TOTAL_ROWS` AND the `#mb-render-heading` chunked-render
 * overlay being removed. Neither alone is sufficient — confirmed empirically
 * that clearing a filter leaves the overlay's removal lagging behind the row
 * count reaching its final value, AND that a full-table SORT retriggers the
 * same overlay again independently of the filter-clear step (an earlier
 * capture that only waited after the filter-clear still had the overlay
 * baked into `post-sort.html`, from the sort's own rebuild). See
 * `waitForActualRowCount()`'s own JSDoc for the general race this covers.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function _waitForFullRebuildSettled(page) {
    await waitForActualRowCount(page, ARTIST_EVENTS_TOTAL_ROWS);
    await page.waitForFunction(() => !document.getElementById('mb-render-heading'), null, { timeout: 30000 });
}

/**
 * Captures `post-filter.html`/`post-sort.html` for `artist-events`, applying
 * the same canonical column-filter/sort `tests/live/artist-events-
 * interactions.spec.js` exercises (shared via `tests/support/
 * artistEventsFixture.js`, so the two never drift apart). Loads via the
 * committed disk fixture rather than a live "Show all" click — deterministic,
 * and critically avoids live MB data drifting between a capture taken today
 * on one branch and one taken tomorrow on another, which would show up as a
 * spurious diff unrelated to any code change.
 *
 * Diffs against whatever was already on disk before overwriting it, exactly
 * like `captureOne()`'s own `raw.html`/`rendered.html` handling — commit
 * one branch's capture as the baseline, then re-run on another branch
 * without touching the files in between to see exactly what (if anything)
 * differs.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} dir - tests/snapshots/artist-events
 * @returns {Promise<string[]>} status parts, same shape as captureOne()'s own `parts`
 */
async function captureArtistEventsInteractionSnapshots(browser, dir) {
    const postFilterPath = path.join(dir, 'post-filter.html');
    const postSortPath = path.join(dir, 'post-sort.html');
    const prevPostFilter = readPrevious(postFilterPath);
    const prevPostSort = readPrevious(postSortPath);

    const context = await browser.newContext();
    const page = await context.newPage();
    await seedGmValues(page, ARTIST_EVENTS_SEED_GM_VALUES);
    await loadFromDiskFixture(page, { url: ARTIST_EVENTS_URL, fixturePath: ARTIST_EVENTS_FIXTURE_PATH, testMode: true });
    // waitForRenderComplete (not a bare #mb-filter-container wait) — see
    // browser.js's own JSDoc for the confirmed chunked-render race on this
    // exact page.
    //
    // waitForAutoResize: false — the auto-resize-on-load pass lives inside
    // startFetchingProcess() (the live "Show all" fetch pipeline only) and
    // is never triggered by loadFromDiskFixture()'s hydration path; see
    // artist-events-interactions.spec.js's identical note.
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });

    const colIdx = await page.evaluate((colName) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th')).findIndex((t) => strip(t.textContent) === colName);
    }, ARTIST_EVENTS_FILTER_COLUMN);
    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially(ARTIST_EVENTS_FILTER_VALUE));

    const postFilterHtml = scrub(await captureRendered(page), 'artist-events');
    writeSnapshot(postFilterPath, postFilterHtml);

    await waitForFilterSettled(page, () => colInput.fill(''));
    await _waitForFullRebuildSettled(page);

    const columnTh = page.locator('table.tbl thead th', { hasText: ARTIST_EVENTS_SORT_COLUMN }).first();
    const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
    await waitForSortSettled(page, () => ascendingBtn.click());
    await _waitForFullRebuildSettled(page);

    const postSortHtml = scrub(await captureRendered(page), 'artist-events');
    writeSnapshot(postSortPath, postSortHtml);

    await context.close();

    const parts = [];
    if (prevPostFilter === null) {
        parts.push('post-filter.html: first capture');
    } else if (!diffSummary(prevPostFilter, postFilterHtml).identical) {
        parts.push('post-filter.html changed — check if this was an intended script change');
    }
    if (prevPostSort === null) {
        parts.push('post-sort.html: first capture');
    } else if (!diffSummary(prevPostSort, postSortHtml).identical) {
        parts.push('post-sort.html changed — check if this was an intended script change');
    }
    return parts;
}

/**
 * One perf sample: fetches+renders `config` fresh (no HTML capture/scrub —
 * that's `captureOne()`'s job) and reads back the wall-clock time plus the
 * in-page `performance.mark()`/`measure()` stage timings added around
 * `startFetchingProcess()`'s pipeline (see this doc's Part 5 implementation
 * notes for exactly where, and why there's no "sort" stage: sorting never
 * happens during the initial fetch/render — it's a separate, user-triggered
 * action wired up later by `makeTableSortableUnified()`, confirmed by
 * grepping for `sortLargeArray(` calls inside `startFetchingProcess()` and
 * finding none — the task doc's original assumption that a sort stage
 * exists here was wrong).
 *
 * @param {import('playwright').Browser} browser
 * @param {{ url: string, showAllButtonSelector: string, seedGmValues?: Object, hasCaaOrEaa?: boolean, hasRelationships?: boolean, waitForAutoResize?: boolean, renderTimeout?: number }} config
 * @returns {Promise<{ wallMs: number, fetchMs: number|null, renderMs: number|null, itemCount: number|null }>}
 */
async function measureOnce(browser, config) {
    const {
        url, showAllButtonSelector, seedGmValues: seedValues,
        hasCaaOrEaa, hasRelationships, waitForAutoResize = true, renderTimeout = 90000,
    } = config;
    const context = await browser.newContext(fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {});
    const page = await context.newPage();

    await seedGmValues(page, seedValues);
    await loadUserscriptPage(page, { url, testMode: true });
    const showAllBtn = page.locator(showAllButtonSelector);
    await showAllBtn.waitFor({ state: 'visible', timeout: 15000 });

    const wallStart = Date.now();
    await showAllBtn.click();
    await waitForRenderComplete(page, { hasCaaOrEaa, hasRelationships, waitForAutoResize, timeout: renderTimeout });
    const wallMs = Date.now() - wallStart;

    const { measures, itemCount } = await page.evaluate(() => {
        const el = document.querySelector('h2 .mb-row-count-stat');
        const m = el ? el.textContent.match(/\((\d+)/) : null;
        return {
            measures: performance.getEntriesByType('measure').map((entry) => ({ name: entry.name, duration: entry.duration })),
            itemCount: m ? Number(m[1]) : null,
        };
    });

    await context.close();

    const byName = Object.fromEntries(measures.map((m) => [m.name, m.duration]));
    return {
        wallMs,
        fetchMs: byName['sa-fetch-phase'] ?? null,
        renderMs: byName['sa-render-phase'] ?? null,
        itemCount,
    };
}

/**
 * Runs `measureOnce()` 5 times for `config`, takes the median of each
 * metric (live MB response times vary run to run — a single sample isn't
 * trustworthy), compares against the committed baseline at
 * `tests/snapshots/<pageType>/perf-baseline.json`, and writes a fresh one.
 *
 * Thresholds (>25% slower → warning, >3x slower → failure/non-zero exit)
 * are a starting point, not tuned — expect to revisit once there are a few
 * real baseline runs to look at, per this doc's own Part 5 spec.
 *
 * @param {import('playwright').Browser} browser
 * @param {{ pageType: string } & Object} config
 * @returns {Promise<boolean>} true if this pageType's perf run FAILED (>3x baseline)
 */
async function runPerf(browser, config) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
        samples.push(await measureOnce(browser, config));
    }

    const medianWallMs = median(samples.map((s) => s.wallMs));
    const medianFetchMs = median(samples.map((s) => s.fetchMs ?? 0));
    const medianRenderMs = median(samples.map((s) => s.renderMs ?? 0));
    const itemCount = samples[0].itemCount;

    const baselinePath = path.join(SNAPSHOTS_DIR, config.pageType, 'perf-baseline.json');
    const prevBaseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;

    let verdict = 'ok';
    if (prevBaseline && prevBaseline.medianWallMs > 0) {
        const ratio = medianWallMs / prevBaseline.medianWallMs;
        if (ratio > 3) verdict = 'FAIL (>3x baseline)';
        else if (ratio > 1.25) verdict = 'WARN (>25% slower than baseline)';
    }

    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify({
        pageType: config.pageType,
        url: config.url,
        capturedAt: new Date().toISOString().slice(0, 10),
        scriptVersion: readScriptVersion(),
        itemCount,
        medianWallMs,
        // No "sort" stage — see measureOnce()'s own JSDoc for why. Kept as
        // an explicit 0 (not omitted) so this baseline's shape stays
        // consistent with the task doc's originally-specified format.
        stages: { fetch: medianFetchMs, sort: 0, render: medianRenderMs },
        samples: samples.length,
    }, null, 2) + '\n');

    console.log(
        `${config.pageType} [perf]: median wall ${medianWallMs}ms `
        + `(fetch ${medianFetchMs.toFixed(1)}ms, render ${medianRenderMs.toFixed(1)}ms), `
        + `${itemCount} items — ${verdict}`
    );

    return verdict.startsWith('FAIL');
}

(async () => {
    const { only, headed, perf } = parseArgs(process.argv.slice(2));
    const allConfigs = JSON.parse(fs.readFileSync(PAGETYPES_PATH, 'utf8'));
    // Part 5 is scoped to artist-releasegroups only for this pilot —
    // release-tracks is non-paginated and a poor first target for a
    // pagination-scaling signal (per the task doc's own Part 5 scope note).
    const perfDefault = perf && !only ? allConfigs.filter((c) => c.pageType === 'artist-releasegroups') : allConfigs;
    const configs = only ? perfDefault.filter((c) => c.pageType === only) : perfDefault;

    if (configs.length === 0) {
        console.error(`No pageType matching --only=${only} in ${PAGETYPES_PATH}`);
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: !headed });
    try {
        if (perf) {
            let anyFailed = false;
            for (const config of configs) {
                anyFailed = (await runPerf(browser, config)) || anyFailed;
            }
            if (anyFailed) process.exitCode = 1;
            return;
        }
        for (const config of configs) {
            const result = await captureOne(browser, config);
            console.log(`${result.pageType}: ${result.status}`);
        }
    } finally {
        await browser.close();
    }
})().catch((err) => {
    console.error('capture-snapshots failed:', err);
    process.exit(1);
});
