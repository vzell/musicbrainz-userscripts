'use strict';

// Touch (Pixel 7 emulation): a tap on a Brucebase Media icon or a song's
// Title glyph opens the artwork viewer, never the page (org/foreign-images.org,
// phase 3). There is no hover on a touch screen, so the tap is the only way
// in: it must not be a dead end.

const { test, expect } = require('../support/test');
const { loadBbYearPage, loadBbSongsPage, BB_YEAR_BUTTON, BB_BUTTON } = require('../support/bbFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const GIG4 = 'https://brucebase.wikidot.com/gig:1985-01-04-roads-coliseum-hampton-va';

/**
 * Serves every wikidot image as a 1 px PNG.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function routeWdImages(page) {
    await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

test('a tap on a Media icon opens the viewer on its kind, and the page stays', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadBbYearPage(page, '1985', { settingsOverride: { sa_render_threshold: 100000 } });
    const { served } = await routeDetailPages(page, 'bb');
    await routeWdImages(page);
    await page.locator(`button[data-label="${BB_YEAR_BUTTON}"]`).tap();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const url = page.url();
    const ticket = page.locator(`table.tbl tbody a.mb-fi-media[href="${GIG4}"][data-mb-fi-kind="Ticket"]`).first();
    await ticket.scrollIntoViewIfNeeded();
    await ticket.tap();
    await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('3 / 4');
    expect(page.url()).toBe(url);
    expect(served).toEqual([GIG4]);
    expect(errors).toEqual([]);
});

test('a tap on a song\'s glyph opens the viewer', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadBbSongsPage(page, { settingsOverride: { sa_render_threshold: 100000 } });
    const { served } = await routeDetailPages(page, 'bb');
    await routeWdImages(page);
    await page.locator(`button[data-label="${BB_BUTTON}"]`).tap();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const g = page.locator('table.tbl tbody a.mb-fi-glyph[href$="/song:4th-of-july-asbury-park-sandy"]').first();
    await g.scrollIntoViewIfNeeded();
    await g.tap();
    await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('1 / 2');
    expect(served).toEqual(['https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy']);
    expect(errors).toEqual([]);
});
