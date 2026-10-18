'use strict';

// discogs.com's own pages (2026-10-18) on a phone (Pixel 7 emulation: touch,
// no hover): a tap on a toolbar button loads the table, and a tap on a
// Discogs link in it opens the link preview's window instead of leaving
// the page. Fixtures and answers as in discogs-pages.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${n}.json`), 'utf8'));
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));

/**
 * Taps the middle of an element after checking it is what is there.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function tap(page, el) {
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await el.evaluate((n, [px, py]) => n.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);
}

test('a tap loads a Discogs master\'s versions; a tap on a version opens its window, not the page', async ({ page }) => {
    const errors = [];
    const navigations = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
        answers('discogs-master', 'discogs-release', ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`)));
    await loadUserscriptPage(page, {
        url: 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run',
        fixtureFile: path.join(__dirname, 'dg-master.html'),
        testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_on_touch: true, sa_pop_ext_discogs_token: 'tok-probe' },
    });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
    await tap(page, page.locator('#mb-dg-root button[data-label="Show all versions"]'));
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const table = page.locator('#mb-dg-root table.tbl').first();
    await expect(table.locator('tbody tr')).toHaveCount(387);

    await tap(page, table.locator('a[href="https://www.discogs.com/release/1874253"]').first());
    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Discogs release');
    await expect(dialog.locator('.mb-dg-xh', { hasText: 'Tracklist' })).toBeVisible({ timeout: 10000 });
    expect(navigations, 'the page stays').toEqual([]);
    expect(errors).toEqual([]);
});
