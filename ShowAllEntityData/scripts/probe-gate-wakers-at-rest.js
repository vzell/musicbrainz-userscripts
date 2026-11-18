#!/usr/bin/env node
/**
 * Probe: are the shared request gate's wakers (`_mbGateSleep()`: the rAF
 * loop, the MutationObserver, the worker's tick) at rest on a page where no
 * MusicBrainz request waits? Loads the artist-events disk fixture (the
 * interaction-perf page) exactly as `capture-interaction-perf.js` does,
 * reads `__saTest.mbGate.wakers()` and `stats()` after the render, then opens
 * the Event column's 📊 dropdown twice (the uniqDropWarm metric) and reads
 * them again. Prints one JSON line per point.
 *
 * Written 2026-11-18 for feat/mb-gate-upstream-align: the branch's
 * uniqDropWarm sat about 8% above main's in every arm, wait or no wait.
 *
 * Usage: node scripts/probe-gate-wakers-at-rest.js
 *        (SA_USERSCRIPT_PATH=<file> to load another copy of the userscript)
 */
'use strict';
const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('../tests/support/diskFixture');
const { seedGmValues } = require('../tests/support/gmStubs');
const { waitForRenderComplete } = require('../tests/support/browser');
const { toArm } = require('../tests/support/perfDescriptors');

const PREVIEWS_OFF = {
    sa_pop_mb: false,
    sa_pop_mb_page: false,
    sa_pop_ext: false,
    sa_dp_hover_without_ctrl: false,
    sa_event_rg_tooltip_without_ctrl: false,
};

/**
 * Reads the gate's waker state and counters from the page.
 * @param {import('playwright').Page} page
 * @param {string} at A label for the printed line.
 * @returns {Promise<void>}
 */
async function report(page, at) {
    const r = await page.evaluate(() => {
        const g = window.__saTest && window.__saTest.mbGate;
        if (!g) return { error: 'no __saTest.mbGate' };
        return {
            active: g.active(),
            wakers: typeof g.wakers === 'function' ? g.wakers() : 'n/a (no wakers hook: main)',
            stats: g.stats(),
        };
    });
    console.log(JSON.stringify({ at, ...r }));
}

/**
 * Runs the probe.
 * @returns {Promise<void>}
 */
async function main() {
    const config = toArm('artist-events');
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await seedGmValues(page, { ...PREVIEWS_OFF, ...config.seedGmValues });
        await loadFromDiskFixture(page, { url: config.url, fixturePath: config.fixturePath, testMode: true });
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
        await report(page, 'after render');
        await page.waitForTimeout(3000);
        await report(page, 'render + 3 s');
        const wrap = page.locator('table.tbl').nth(config.subTableIndex)
            .locator('thead th', { hasText: config.uniqDropColumn }).first()
            .locator('.mb-col-uniq-wrap');
        const dropdown = page.locator('#mb-col-uniq-dropdown');
        for (const pass of ['cold', 'warm']) {
            const t = Date.now();
            await wrap.evaluate((el) => el.click());
            await dropdown.waitFor({ state: 'visible', timeout: 10000 });
            console.log(JSON.stringify({ at: `uniq ${pass}`, ms: Date.now() - t }));
            await report(page, `after uniq ${pass}`);
            await page.evaluate(() => window.__saTest.closeUniqDrop());
        }
    } finally {
        await browser.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
