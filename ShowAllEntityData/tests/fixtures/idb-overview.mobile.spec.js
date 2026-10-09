'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// The 💾 browser cache overview on a phone (chromium-mobile, Pixel 7): the
// dialog fits the screen width — the wide parts table scrolls inside its own
// box — and a tap on a part row picks it.

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');

test('the dialog fits the screen and a tap picks a part', async ({ page }) => {
    await page.addInitScript(() => {
        const req = indexedDB.open('vz-mb-saed-art-cache', 4);
        req.onupgradeneeded = () => {
            const db = req.result;
            [['images', 'url'], ['metadata', 'entityPath'], ['rel-ws2', 'ckey'], ['ms-rec-len', 'gid'],
                ['recof-ws2', 'ckey'], ['artist-works', 'artist']].forEach(([n, k]) => db.createObjectStore(n, { keyPath: k }));
        };
        req.onsuccess = () => {
            const tx = req.result.transaction('rel-ws2', 'readwrite');
            tx.objectStore('rel-ws2').put({ ckey: 'release:aaa', data: {}, ts: Date.now() });
            tx.oncomplete = () => { req.result.close(); window.__seedDone = true; };
        };
    });
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.waitForFunction(() => window.__seedDone === true);
    await page.evaluate(() => window.__saTest.idbOverview.open());
    const row = page.locator('#mb-idb-overview tr[data-part="rel-ws2"]');
    await expect(row).toBeVisible();
    const fit = await page.evaluate(() => {
        const d = document.querySelector('#mb-idb-overview .mb-idbo-dlg').getBoundingClientRect();
        return { left: d.left, right: d.right, vw: window.innerWidth };
    });
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.vw);
    await row.tap();
    await expect(page.locator('#mb-idb-overview [data-idbo-key-row]')).toHaveCount(1);
});
