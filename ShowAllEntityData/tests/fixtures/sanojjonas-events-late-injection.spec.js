'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Reuses the same minimal fixture uniq-drop-event-cancelled.spec.js uses —
// it already exercises the real startFetchingProcess() path with no
// GM_xmlhttpRequest mocking needed (its lone button carries no `params`, so
// startFetchingProcess reuses the live document instead of re-fetching).
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'artist-events-cancelled.html');

test('a sanojjonasRoot container injected AFTER render still gets purged on an artist-events page', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    await page.click('button[data-label="Show all Events for Artist"]');
    // By the time render is complete, performClutterCleanup()'s and
    // finalCleanup()'s own one-shot sanojjonas checks have already run and
    // found nothing — this simulates sanojjonas' own asynchronous script
    // finishing LATE, the exact race _watchForLateSanojjonasInjections()
    // exists to catch. Only its MutationObserver (armed by
    // _shouldCleanupSanojjonas(), gated on the real pageType — see
    // DEBUG-NOTES.md's 2026-09-09 entry) can catch this.
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
