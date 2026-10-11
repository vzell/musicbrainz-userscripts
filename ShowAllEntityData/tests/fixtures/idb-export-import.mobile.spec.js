'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { seedCacheOverview } = require('../support/idbFixture');

// 💾 Export and Import on a phone (chromium-mobile, Pixel 7: touch, no
// hover). Both panes open by tap and stay inside the dialog, which stays
// inside the screen (their wide tables scroll in their own boxes); an import
// goes from choosing the file to the merge by taps alone.

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');

/**
 * Whether the dialog and the open pane fit the screen width.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{dlg: boolean, pane: boolean}>}
 */
const fits = (page) => page.evaluate(() => {
    const vw = window.innerWidth;
    const d = document.querySelector('#mb-idb-overview .mb-idbo-dlg').getBoundingClientRect();
    const p = document.querySelector('#mb-idb-overview [data-idbx-pane]').getBoundingClientRect();
    return { dlg: d.left >= 0 && d.right <= vw, pane: p.left >= d.left && p.right <= d.right };
});

test('Export and Import by tap; both panes fit the screen', async ({ page }, info) => {
    await seedCacheOverview(page);
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.waitForFunction(() => window.__seedDone === 2);
    await page.evaluate(() => window.__saTest.idbOverview.open());
    await expect(page.locator('#mb-idb-overview tr[data-part="images"]')).toBeVisible();

    await page.locator('[data-idbx="open-export"]').tap();
    await expect(page.locator('[data-idbx-pane="ex"]')).toBeVisible();
    expect(await fits(page)).toEqual({ dlg: true, pane: true });
    await page.locator('[data-idbx-ex="images"]').tap();
    await expect(page.locator('[data-idbx-notice]')).toBeVisible();

    const file = info.outputPath('tap.jsonl.gz');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lines = [
        { kind: 'sa-cache-export', format: 1, script: 'ShowAllEntityData', version: '9.99.9999', origin: 'https://musicbrainz.org',
          written: Date.now(), browser: 'Firefox 131', layouts: { 'vz-mb-saed-art-cache': 4, 'vz-saed-detail-pages': 1 }, parts: [{ id: 'rel-ws2', count: 1 }] },
        { p: 'rel-ws2', v: { ckey: 'release:tap', data: {}, ts: Date.now() } },
        { kind: 'end', count: 1 },
    ];
    fs.writeFileSync(file, zlib.gzipSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join('\n') + '\n')));

    await page.locator('[data-idbx="open-import"]').tap();
    await expect(page.locator('[data-idbx-pane="ex"]')).toHaveCount(0);
    await page.locator('#mb-idbx-file').setInputFiles(file);
    await expect(page.locator('[data-idbx-plan]')).toContainText('adds 1');
    expect(await fits(page)).toEqual({ dlg: true, pane: true });
    await page.locator('[data-idbx="im-go"]').tap();
    await page.locator('[data-idbx="im-yes"]').tap();
    await expect(page.locator('[data-idbx-done]')).toContainText('Added 1, updated 0, skipped 0');
});
