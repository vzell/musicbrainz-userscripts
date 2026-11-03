'use strict';

// setlist.fm's list of a venue's setlists (pageType `sfm-venue`, 2026-11-02)
// on a phone (Pixel 7 emulation: touch, no hover): a tap on the toolbar
// button fetches the list's pages and renders the table. Fixtures as in
// sfm-list.spec.js (scripts/build-setlistfm-fixtures.py).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PATH = '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html';
const PAGES = ['sfm-page-venue-73d20e81-p1.html', 'sfm-page-venue-73d20e81-p2.html'];

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

test('a tap loads every setlist of the venue as one table', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route((u) => u.hostname === 'www.setlist.fm' && u.pathname === PATH, (route) => {
        const n = Number(new URL(route.request().url()).searchParams.get('page') || 1);
        return route.fulfill({ path: path.join(__dirname, PAGES[n - 1]), contentType: 'text/html; charset=utf-8' });
    });
    await loadUserscriptPage(page, {
        url: `https://www.setlist.fm${PATH}?page=1`, fixtureFile: path.join(__dirname, PAGES[0]), testMode: true,
        settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_setlistfm: true, sa_render_threshold: 100000 },
    });
    await tap(page, page.locator('#mb-sfm-root button[data-label="Show all setlists of this venue"]'));
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await expect(page.locator('#mb-sfm-root table.tbl tbody tr')).toHaveCount(20);
    expect(errors).toEqual([]);
});
