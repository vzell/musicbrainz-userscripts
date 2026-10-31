'use strict';

// archive.org's search page (pageType `ia-search`, 2026-10-31) on a phone
// (Pixel 7 emulation: touch, no hover): a tap on the toolbar button loads
// the table from the search API, and a tap on an item's title opens its
// window (the `iadetails` reader) instead of leaving the page. Fixtures and
// answers as in ia-search.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const SHOW = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16';
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

test('a tap loads the search\'s items; a tap on a title opens its window, not the page', async ({ page }) => {
    const errors = [];
    const navigations = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://archive.org/services/img/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, answers('ia-search-1975-p1', `ia-metadata-${SHOW}`));
    await loadUserscriptPage(page, {
        url: 'https://archive.org/search?query=subject%3A%22Bruce+Springsteen%22&sort=title&and%5B%5D=year%3A%221975%22',
        fixtureFile: path.join(__dirname, 'ia-search.html'),
        testMode: true,
        settingsOverride: { sa_enable_internetarchive: true, sa_pop_ext_on_touch: true },
    });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
    await tap(page, page.locator('#mb-ia-root button[data-label="Show all items"]'));
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const table = page.locator('#mb-ia-root table.tbl').first();
    await expect(table.locator('tbody tr')).toHaveCount(73);
    await tap(page, table.locator(`a[href="https://archive.org/details/${SHOW}"]`));
    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Internet Archive');
    await expect(dialog.locator('[data-mb-tbl="ia-setlist"] tbody tr')).toHaveCount(19);
    expect(navigations, 'the page stays').toEqual([]);
    expect(errors).toEqual([]);
});
