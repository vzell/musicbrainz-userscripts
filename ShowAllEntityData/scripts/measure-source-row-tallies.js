/**
 * Measures what PERFORMANCE.org Step 26 removes: the per-pass source-row
 * tallies behind the ⏳ pending-edits and LENGTH ⚠️/❌ summary buttons.
 *
 * `runFilter()` ends every pass with `updateFilterButtonsVisibility()`, and
 * before Step 26 that function walked every captured source row once per
 * counter — 2N `querySelector` calls a pass on a single-table page, 3N on a
 * multi-table one, however narrow the filter. This times THAT FUNCTION
 * directly (`window.updateFilterButtonsVisibility`, callable from the page),
 * on the base branch's userscript and on the working tree's, in ONE session,
 * on the same disk fixtures — a within-session A/B of exactly the code that
 * changed, which is the only comparison CLAUDE.md lets a number be quoted as.
 *
 * Not an end-to-end filter-latency arm, for the reason Step 25's measurement
 * recorded: host-to-host noise on a full pass (1.5-2x) is far larger than the
 * few milliseconds in question. Each call is also probed for how many
 * `querySelector` calls it makes with the two tally selectors, which is the
 * count the step's own text predicted (~8 300 on `artist-events`).
 *
 * The base arm swaps the injected userscript by shimming `page.addScriptTag`
 * locally, so `tests/support/loadPage.js` needs no option for it.
 *
 * Writes machine + UTC timing metadata, as every measurement in this repo must
 * (CLAUDE.md, "Record the machine and the wall-clock time"). Log the result in
 * tests/MEASUREMENTS.org.
 *
 *     node scripts/measure-source-row-tallies.js [--base=main] [--samples=21]
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');
const { loadFromDiskFixture } = require('../tests/support/diskFixture');
const { waitForRenderComplete } = require('../tests/support/browser');
const { waitForFilterSettled, typeGlobalFilter } = require('../tests/support/filterSortAssertions');
const { USERSCRIPT_PATH } = require('../tests/support/loadPage');
const { machineInfo, readScriptVersion, readCurrentBranch } = require('../tests/support/runMetadata');
const events = require('../tests/support/artistEventsFixture');
const rgs = require('../tests/support/springsteenArtistReleaseGroupsFixture');

const ARGS = Object.fromEntries(process.argv.slice(2)
    .map((a) => /^--([^=]+)=(.*)$/.exec(a)).filter(Boolean).map((m) => [m[1], m[2]]));
const BASE = ARGS.base || 'main';
const SAMPLES = Number(ARGS.samples || 21);

// A narrow filter per page: Step 26's claim is that these tallies stay at the
// full row count while everything else in a pass shrinks with the query.
const PAGES = [
    { name: 'artist-events', tableMode: 'single', title: 'Bruce Springsteen — Events',
      url: events.URL, fixturePath: events.FIXTURE_PATH, seed: events.SEED_GM_VALUES,
      rows: events.TOTAL_ROWS, narrow: 'Stockholm' },
    { name: 'artist-releasegroups', tableMode: 'multi', title: 'Bruce Springsteen — Release groups',
      url: rgs.URL, fixturePath: rgs.FIXTURE_PATH, seed: rgs.SEED_GM_VALUES,
      rows: rgs.TOTAL_ROWS, narrow: 'Stockholm' },
];

/**
 * Writes the base branch's userscript to a temp file.
 *
 * @param {string} ref - git ref, e.g. 'main'
 * @returns {string} path of the extracted copy
 */
function extractBaseUserscript(ref) {
    const repoRel = path.relative(
        execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
        USERSCRIPT_PATH,
    ).split(path.sep).join('/');
    const body = execFileSync('git', ['show', `${ref}:${repoRel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = path.join(os.tmpdir(), `sa-step26-base-${process.pid}.user.js`);
    fs.writeFileSync(out, body);
    return out;
}

/**
 * In the page: times `updateFilterButtonsVisibility()` over `samples` calls
 * and counts the tally-selector queries one call makes.
 *
 * @param {number} samples
 * @returns {{medianMs: number, minMs: number, tallyQueriesPerCall: number}}
 */
function timeRefreshInPage(samples) {
    const WATCHED = new Set(['td span.mp', 'td[data-mb-len-flag]']);
    const orig = Element.prototype.querySelector;
    let queries = 0;
    Element.prototype.querySelector = function (sel) {
        if (WATCHED.has(sel)) queries++;
        return orig.call(this, sel);
    };
    try {
        window.updateFilterButtonsVisibility();
    } finally {
        Element.prototype.querySelector = orig;
    }

    const times = [];
    for (let i = 0; i < samples; i++) {
        const t = performance.now();
        window.updateFilterButtonsVisibility();
        times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    return { medianMs: times[Math.floor(times.length / 2)], minMs: times[0], tallyQueriesPerCall: queries };
}

/**
 * One arm: a fresh context, one userscript, one page, unfiltered then narrow.
 *
 * @returns {Promise<Object>}
 */
async function runArm(browser, pageDef, scriptPath, label) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    if (scriptPath !== USERSCRIPT_PATH) {
        const orig = page.addScriptTag.bind(page);
        page.addScriptTag = (opts) => orig(opts && opts.path === USERSCRIPT_PATH ? { ...opts, path: scriptPath } : opts);
    }
    await loadFromDiskFixture(page, {
        url: pageDef.url, fixturePath: pageDef.fixturePath, testMode: true, settingsOverride: pageDef.seed,
    });
    await waitForRenderComplete(page, { waitForAutoResize: false });

    // Warm: the first call after a render is the one that walks, on both arms.
    await page.evaluate(() => window.updateFilterButtonsVisibility());
    const unfiltered = await page.evaluate(timeRefreshInPage, SAMPLES);

    await waitForFilterSettled(page, () => typeGlobalFilter(page, pageDef.narrow));
    const visible = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length);
    const narrow = await page.evaluate(timeRefreshInPage, SAMPLES);

    await context.close();
    return { arm: label, page: pageDef.name, narrowQuery: pageDef.narrow, narrowVisibleRows: visible, unfiltered, narrow };
}

(async () => {
    const startedAt = new Date().toISOString();
    const basePath = extractBaseUserscript(BASE);
    const browser = await chromium.launch();
    const arms = [];
    try {
        for (const pageDef of PAGES) {
            // Base first, then branch, per page — so each pair runs back to back.
            arms.push(await runArm(browser, pageDef, basePath, BASE));
            arms.push(await runArm(browser, pageDef, USERSCRIPT_PATH, 'branch'));
        }
    } finally {
        await browser.close();
        fs.rmSync(basePath, { force: true });
    }
    const finishedAt = new Date().toISOString();

    const out = {
        what: 'updateFilterButtonsVisibility() per call, PERFORMANCE.org Step 26',
        base: BASE,
        branch: readCurrentBranch(),
        version: readScriptVersion(),
        samples: SAMPLES,
        pages: PAGES.map(({ name, tableMode, title, url, rows }) => ({ name, tableMode, title, url, rows })),
        machine: machineInfo(),
        startedAt,
        finishedAt,
        arms,
    };
    console.log(JSON.stringify(out, null, 2));
    console.log('');
    for (const pageDef of PAGES) {
        const [b, n] = [BASE, 'branch'].map((a) => arms.find((x) => x.page === pageDef.name && x.arm === a));
        for (const phase of ['unfiltered', 'narrow']) {
            console.log(`${pageDef.name} (${pageDef.tableMode}, ${pageDef.rows} rows) ${phase.padEnd(10)}: `
                + `${b[phase].medianMs.toFixed(2)} ms -> ${n[phase].medianMs.toFixed(2)} ms per call, `
                + `${b[phase].tallyQueriesPerCall} -> ${n[phase].tallyQueriesPerCall} tally queries`
                + (phase === 'narrow' ? `  [${b.narrowVisibleRows} rows visible]` : ''));
        }
    }
})();
