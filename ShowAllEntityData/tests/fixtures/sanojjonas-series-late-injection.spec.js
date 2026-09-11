'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Regression for org/sanojjonas.org: `#sanojjonasRoot` survived on a
// fully-rendered `/series/<mbid>` page (debug/event-series-final.html)
// because the old `_shouldCleanupSanojjonas()` pageType whitelist never
// included `'series-releases'` — every series page gets that one constant
// pageType regardless of which H2 sub-view (Releases/Events/Works/…) it
// resolves to, so the late-injection watcher never armed there. See
// DEBUG-NOTES.md for the fix: the whitelist was removed entirely and
// sanojjonas cleanup now runs unconditionally on every page.
//
// Reuses the committed `series-releases` raw snapshot — its lone button
// carries no `params` (`labelFromH2: true` only), so startFetchingProcess
// reuses the live document instead of re-fetching, exactly like the sibling
// `sanojjonas-events-late-injection.spec.js`.
const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const FIXTURE_FILE = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

test('a sanojjonasRoot container injected AFTER render still gets purged on a series-releases page', async ({ page }) => {
    await loadUserscriptPage(page, { url: SERIES_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    await page.click('button[data-label="Show all Releases for Series"]');
    // By the time render is complete, performClutterCleanup()'s and
    // finalCleanup()'s own one-shot sanojjonas checks have already run and
    // found nothing — this simulates sanojjonas' own asynchronous script
    // finishing LATE, the exact race _watchForLateSanojjonasInjections()
    // exists to catch. Only its MutationObserver (armed unconditionally now,
    // see DEBUG-NOTES.md) can catch this on a series page.
    await waitForRenderComplete(page, { waitForAutoResize: false });

    await page.evaluate(() => {
        const root = document.createElement('div');
        root.id = 'sanojjonasRoot';
        root.textContent = 'late sanojjonas payload';
        document.body.appendChild(root);
    });

    await page.waitForFunction(() => !document.getElementById('sanojjonasRoot'), { timeout: 3000 });
    expect(await page.evaluate(() => !!document.getElementById('sanojjonasRoot'))).toBe(false);
});
