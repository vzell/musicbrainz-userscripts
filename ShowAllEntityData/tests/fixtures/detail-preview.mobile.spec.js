'use strict';

// The detail-page preview on a touch screen (chromium-mobile: Pixel 7, touch,
// no hover). A tap has no hover to show the card on, so a tap on a detail
// link opens the pinned dialog instead of the page (the dialog's ↗ opens the
// page). Desktop behaviour: detail-preview.spec.js.

const { test, expect } = require('../support/test');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');

test('a tap on a detail link opens the dialog, not the page, and shows no hover card', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadBsRecordsPage(page, { settingsOverride: { sa_bs_detail_preview: true } });
    const { served } = await routeDetailPages(page, 'bs');
    await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const shown = [];
    await page.exposeFunction('__dpPeekShown', () => shown.push(Date.now()));
    await page.evaluate(() => {
        // The card element is created on its first show: watch for it.
        new MutationObserver(() => {
            const p = document.getElementById('mb-dp-peek');
            if (p && p.style.display === 'block') window.__dpPeekShown();
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });

    const link = page.locator('table.tbl tbody a[href*="code=CR1AD1"]');
    await link.scrollIntoViewIfNeeded();
    // The premise: the link would open a new tab.
    await expect(link).toHaveAttribute('target', '_blank');
    await link.tap();

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog.locator('.mb-dp-xtitle')).toHaveText('1001 AMERICAN DREAMS');
    await expect(dialog.locator('.mb-dp-tracks li')).toHaveCount(14);
    expect(page.context().pages()).toHaveLength(1);
    expect(shown).toEqual([]);
    expect(served).toEqual(['https://www.brucespringsteen.it/DB/detrec.aspx?code=CR1AD1']);
    // The dialog's ↗ is the way to the page.
    await expect(dialog.locator('a.mb-dp-tbtn')).toHaveAttribute('href', 'https://www.brucespringsteen.it/DB/detrec.aspx?code=CR1AD1');
    expect(errors).toEqual([]);
});

// On a touch screen the initial page's NATIVE detail links keep their
// navigation (WIP.4): only a rendered table's links open the dialog, as
// sa_pop_mb_page_on_touch keeps MusicBrainz's page-wide scope off on touch.
test('on the initial page a tap on a native detail link opens no dialog', async ({ page }) => {
    const { loadBbSongsPage } = require('../support/bbFixture');
    await loadBbSongsPage(page, { settingsOverride: { sa_bb_detail_preview: true } });
    const { served } = await routeDetailPages(page, 'bb');
    const link = page.locator('#page-content a[href="/song:4th-of-july-asbury-park-sandy"]');
    await link.scrollIntoViewIfNeeded();
    await link.tap();
    // The tap navigates to the song page (the route serves its fixture).
    await expect.poll(() => page.url(), { timeout: 15000 }).toContain('/song:4th-of-july-asbury-park-sandy');
    expect(await page.locator('#mb-dp-dialog').count()).toBe(0);
    expect(served).toEqual(['https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy']);
});
