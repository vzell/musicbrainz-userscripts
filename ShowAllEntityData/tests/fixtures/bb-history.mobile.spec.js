'use strict';

// Touch (Pixel 7 emulation): the ☰ menu's "✎ Page history" on a Brucebase
// page (org/brucebase.org, Phase 6). The entry asks `_dpSiteForUrl()`, not
// the source's `resolve()`, which on a touch screen refuses a link outside a
// table (`_dpSiteForLink()`): with `resolve()` the entry would never exist
// on a phone. A tap opens the window on the page, the section open and read.

const { test, expect } = require('../support/test');
const { loadBbHistoryPage } = require('../support/bbFixture');
const { openToolbarMenu, clickToolbarItem } = require('../support/toolbarMenu');

test('a tap on ✎ Page history opens the window on the page with its history', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    const { posts } = await loadBbHistoryPage(page, { settingsOverride: { sa_bb_detail_preview: true } });
    expect(await openToolbarMenu(page, 'saed')).toBe(true);
    await expect(page.locator('#mb-saed-bbhist-btn')).toHaveText('✎ Page history');
    await clickToolbarItem(page, '#mb-saed-bbhist-btn');
    const sec = page.locator('#mb-dp-dialog details.mb-dp-sec[data-mb-dp-sec="History"]');
    await expect(sec).toHaveAttribute('open', '');
    await expect(sec.locator('.mb-bbh-e')).toHaveCount(20);
    await expect(sec.locator('.mb-bbh-l.mb-bbh-chg')).toHaveCount(2);
    expect(posts.map(p => p.module)).toContain('history/PageRevisionListModule');
    expect(errors).toEqual([]);
});
