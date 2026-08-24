'use strict';

/**
 * One-time (re-run-when-needed) capture of a Save-to-disk fixture for a
 * given pageType, consumed by `diskFixture.js`'s `loadFromDiskFixture()`
 * to test against a fixed, committed dataset instead of live
 * musicbrainz.org — immune to other editors' data changes between runs.
 *
 * Standalone Node script (not a Playwright test) — run directly:
 *   node tests/support/capture-fixture.js
 *
 * Captures every entry in the FIXTURES list below by loading the page
 * live, clicking its "Show all" button, waiting for render completion,
 * then driving the real Save-to-disk dialog (`#mb-save-to-disk-btn` →
 * `#sa-sd-save-confirm`) and capturing the resulting browser download via
 * Playwright's `page.on('download')`. Add more pageTypes by extending the
 * list — each entry is a data change, not a code change.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');
const { seedGmValues } = require('./gmStubs');

const OUTPUT_DIR = path.join(__dirname, '..', 'fixtures', 'saved-data');

const FIXTURES = [
    {
        // "Tougher Than the Rest" (Bruce Springsteen release-group) — the
        // same small, stable, two-group pilot page used by
        // filter-global/filter-column/filter-subtable/sort-column.spec.js.
        pageType: 'releasegroup-releases',
        url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
        showAllButtonSelector: 'button[data-label="Show all Releases for ReleaseGroup"]',
    },
    {
        // Bruce Springsteen's own events tab — deliberately large/paginated
        // (42 native MB pages, 4174 rows) single-table pageType, used as the
        // interaction-perf and post-filter/post-sort regression-snapshot
        // fixture (see tests/live/artist-events-interactions.spec.js and
        // tests/support/capture-interaction-perf.js). Config matches
        // tests/pagetypes.json's artist-events entry exactly.
        pageType: 'artist-events',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
        showAllButtonSelector: 'button[data-label="Show all Events for Artist"]',
        seedGmValues: { sa_enable_caa_pics: false },
        renderTimeout: 300000,
    },
];

/**
 * Captures one fixture: fetches `url` live, saves the rendered table data
 * to disk via the script's own Save-to-disk flow, and writes the resulting
 * `.json.gz` download to `tests/fixtures/saved-data/<pageType>.json.gz`.
 *
 * @param {import('playwright').Browser} browser
 * @param {{ pageType: string, url: string, showAllButtonSelector: string, seedGmValues?: Object, renderTimeout?: number }} fixture
 * @returns {Promise<void>}
 */
async function captureOne(browser, { pageType, url, showAllButtonSelector, seedGmValues: seedValues, renderTimeout = 90000 }) {
    const page = await browser.newPage();
    await seedGmValues(page, seedValues);
    await loadUserscriptPage(page, { url, testMode: true });

    const showAllBtn = page.locator(showAllButtonSelector);
    await showAllBtn.waitFor({ state: 'visible', timeout: 15000 });
    await showAllBtn.click();
    // waitForRenderComplete (not a bare #mb-filter-container wait) — needed
    // for large single-table pages like artist-events, where that element
    // becomes visible before renderRowsChunked()'s batched insertion loop
    // has actually finished (see browser.js's own JSDoc for the confirmed
    // repro on this exact page).
    await waitForRenderComplete(page, { waitForAutoResize: true, timeout: renderTimeout });

    await page.click('#mb-save-to-disk-btn');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#sa-sd-save-confirm');
    const download = await downloadPromise;

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outPath = path.join(OUTPUT_DIR, `${pageType}.json.gz`);
    await download.saveAs(outPath);
    console.log(`Captured "${pageType}" -> ${outPath}`);

    await page.close();
}

(async () => {
    const browser = await chromium.launch();
    try {
        for (const fixture of FIXTURES) {
            await captureOne(browser, fixture);
        }
    } finally {
        await browser.close();
    }
})().catch((err) => {
    console.error('Fixture capture failed:', err);
    process.exit(1);
});
