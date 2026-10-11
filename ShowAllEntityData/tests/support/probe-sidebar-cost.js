'use strict';

/**
 * What the sidebar sections (`_sbEnhance()`) add to a render: renders Bruce
 * Springsteen's artist page (tests/fixtures/artist-releasegroups-live-titles.html,
 * 57 external links) N times and reads `__saTest.sidebar.timing()`, i.e.
 * the last `makeH2sCollapsible()` pass and its sidebar part, in ms. Both
 * numbers come from the same pass, so their ratio is comparable across machines.
 *
 * Run: node tests/support/probe-sidebar-cost.js [--runs=5]
 */

const path = require('path');
const { chromium } = require('playwright');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');
const { machineInfo } = require('./runMetadata');

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'artist-releasegroups-live-titles.html');

(async () => {
    const a = process.argv.find((x) => x.startsWith('--runs='));
    const runs = a ? Math.max(1, Number(a.split('=')[1]) || 5) : 5;
    const started = new Date().toISOString();
    const browser = await chromium.launch();
    const out = [];
    try {
        for (let i = 0; i < runs; i++) {
            const page = await browser.newPage();
            await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
                                             settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false } });
            await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
            await page.click('button[data-label="🧮 Artist RGs"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });
            out.push(await page.evaluate(() => window.__saTest.sidebar.timing()));
            await page.close();
        }
    } finally {
        await browser.close();
    }
    const med = (k) => { const v = out.map((x) => x[k]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    console.log(JSON.stringify({ started, finished: new Date().toISOString(), machine: machineInfo(), runs: out,
                                 median: { passMs: med('passMs'), enhanceMs: med('enhanceMs'), share: med('enhanceMs') / med('passMs') } }, null, 1));
})();
