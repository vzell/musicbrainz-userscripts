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
