'use strict';

// brucespringsteen.it's record page on a touch screen (chromium-mobile:
// Pixel 7, touch, no hover; 2026-11-06, bs-record). A tap on a song link in
// the rendered table opens the window (there is no hover for the card); on
// the initial page the site's own link keeps its behaviour, its onclick
// opening the site's small window, as on every foreign page's native links
// (detail-preview.mobile.spec.js). Desktop: bs-record-preview.spec.js.

const { test, expect } = require('../support/test');
const { loadBsRecordPage, bsRecordUrl } = require('../support/bsFixture');
const { waitForRenderComplete } = require('../support/browser');

const SONG = 'https://www.brucespringsteen.it/DB/sd3.aspx?sid=586';
const ON = { sa_bs_detail_preview: true };

test('rendered table: a tap on a song link opens the window, no new tab, one request', async ({ page }) => {
    const { served, errors } = await loadBsRecordPage(page, 'COLPC2368543', { settingsOverride: ON });
    await page.locator('h1.mb-bs-h1 button[data-label="Show the tracklist"]').tap();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // Two sub-tables start closed: open Record 1.
    await page.locator('h3.mb-toggle-h3', { hasText: 'Record 1' }).tap();
    const link = page.locator(`table.tbl tbody a[href="${SONG}"]`).first();
    await link.scrollIntoViewIfNeeded();
    await expect(link).toHaveAttribute('target', '_blank');
    await link.tap();
    await expect(page.locator('#mb-dp-dialog .mb-dp-xtitle')).toHaveText('The ties that bind');
    expect(page.context().pages()).toHaveLength(1);
    expect(served.filter(u => u === SONG)).toEqual([SONG]);
    expect(errors).toEqual([]);
});

test('initial page: a tap on the site\'s song link runs its own onclick, opens no window and asks nothing', async ({ page }) => {
    const { served } = await loadBsRecordPage(page, 'COLPC2368543', { settingsOverride: ON });
    const link = page.locator(`.mb-bs-record-native a[href="${SONG}"]`).first();
    await link.scrollIntoViewIfNeeded();
    await link.tap();
    await expect.poll(() => page.evaluate(() => window.__bsSiteCalls)).toEqual([['hs', '586']]);
    expect(await page.locator('#mb-dp-dialog').count()).toBe(0);
    await expect(page).toHaveURL(bsRecordUrl('COLPC2368543'));
    expect(served.filter(u => u === SONG)).toEqual([]);
});
