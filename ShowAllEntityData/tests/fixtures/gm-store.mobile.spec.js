'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// The 🗄️ Script storage dialog on a phone (chromium-mobile, Pixel 7): the
// dialog fits the screen width and height, and a tap on a key's row opens
// its value.

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');

test('the dialog fits the screen and a tap opens a key', async ({ page }) => {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
                                     settingsOverride: { sa_caa_tip_summary_tiles: 20 } });
    await page.evaluate(() => window.__saTest.gmStore.open());
    const row = page.locator('#mb-gm-store tr.mb-gms-row[data-key="sa_caa_tip_summary_tiles"]');
    await expect(row).toBeVisible();
    const fit = await page.evaluate(() => {
        const d = document.querySelector('#mb-gm-store .mb-idbo-dlg').getBoundingClientRect();
        return { left: d.left, right: d.right, bottom: d.bottom, vw: window.innerWidth, vh: window.innerHeight };
    });
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.vw);
    expect(fit.bottom).toBeLessThanOrEqual(fit.vh);
    await row.tap();
    await expect(page.locator('#mb-gms-edit')).toHaveValue('20');
});
