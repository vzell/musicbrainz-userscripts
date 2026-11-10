'use strict';

// A seller's shop on a phone (Pixel 7 emulation: touch, no hover;
// feature/dg-user-seller-search, 2026-11-10): a tap on the toolbar button
// loads the shop's pages, a tap on a row's Item (a listing) opens the listing
// reader's window instead of leaving the page. Fixtures as in
// discogs-seller.spec.js and discogs-listing.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FILE = path.join(__dirname, 'dg-seller-profile.html');
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${n}.json`), 'utf8'));
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));

/**
 * Taps the middle of an element after checking it is what is there.
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

test('a shop on a phone: a tap loads its pages; a tap on a listing opens its window, not the page', async ({ page }) => {
    const errors = [];
    const navigations = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route(/^https:\/\/www\.discogs\.com\/seller\/[^/]+\/profile\?.*\bpage=/, (route) => route.fulfill({ path: FILE, contentType: 'text/html' }));
    // The first row's listing is 4474302203; the capture is 4466508653's, served for it.
    const a = answers('discogs-listing-4466508653');
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
        { 'https://api.discogs.com/marketplace/listings/4474302203': Object.values(a)[0] });
    await loadUserscriptPage(page, {
        url: 'https://www.discogs.com/seller/disc-kid/profile', fixtureFile: FILE, testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_on_touch: true, sa_render_threshold: 100000 },
    });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
    await tap(page, page.locator('#mb-dg-root button[data-label="Show everything for sale"]'));
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const table = page.locator('#mb-dg-root table.tbl').first();
    await expect(table.locator('tbody tr')).toHaveCount(19 * 6);
    await tap(page, table.locator('a[href="https://www.discogs.com/sell/item/4474302203"]').first());
    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Discogs listing');
    await expect(dialog).toContainText('€16.99', { timeout: 10000 });
    expect(navigations, 'the page stays').toEqual([]);
    expect(errors).toEqual([]);
});
