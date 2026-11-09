'use strict';

// The detail window's ⤢ on a desktop (chromium-fixtures). The phone side —
// the fill by the visual viewport, the stored state, the touch grip — is
// dp-window-size.mobile.spec.js. Pinned here:
//
//   • A DESKTOP GETS NO GRIP: the browser's own corner resizes it with a
//     mouse, and a second handle over it would take its presses.
//   • ⤢ AND A DOUBLE-CLICK on the title bar both toggle; a filled window
//     does not move when its title bar is dragged, and gives back exactly
//     the rectangle it had.
//   • OTHER DIALOGS ARE UNCHANGED: Keyboard Shortcuts (also a geoKey dialog
//     of the same shell) has no ⤢ — the two features are opt-ins.

const { test, expect } = require('../support/test');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const DIALOG = '#mb-dp-dialog';

/** @returns {Promise<{left: number, top: number, width: number, height: number}>} */
const rectOf = (page) => page.locator(DIALOG).evaluate((d) => {
    const r = d.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
});

test('the detail window fills the window by ⤢ or a double-click, with no touch grip on a desktop', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadBsRecordsPage(page, { settingsOverride: { sa_bs_detail_preview: true } });
    await routeDetailPages(page, 'bs');
    await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // A desktop opens the window with Space on a link's card; the card is
    // asked for with Ctrl (the fixture profile has sa_dp_hover_without_ctrl
    // off), and Ctrl is up again before Space (Ctrl+Space does not pin) —
    // detail-preview.spec.js's hover().
    const link = page.locator('table.tbl tbody a:not(.mb-fi-cell)[href*="code=CR1AD1"]');
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.locator(`${DIALOG} .mb-dp-xtitle`)).toHaveText('1001 AMERICAN DREAMS');

    await expect(page.locator(`${DIALOG} .mb-info-grip`), 'no grip with a mouse').toHaveCount(0);
    const before = await rectOf(page);
    const vw = await page.evaluate(() => ({ w: window.visualViewport.width, h: window.visualViewport.height }));

    await page.locator(`${DIALOG} .mb-info-max-btn`).click();
    const filled = await rectOf(page);
    expect(Math.abs(filled.width - (vw.w - 12))).toBeLessThanOrEqual(1);
    expect(Math.abs(filled.height - (vw.h - 12))).toBeLessThanOrEqual(1);

    const title = page.locator(`${DIALOG} > div`).first();
    // The middle of the title bar's empty part: on its path's links a press
    // is a press on a link, which neither drags nor toggles.
    const gapOf = () => title.evaluate((bar) => {
        const left = bar.firstElementChild.getBoundingClientRect();
        const right = bar.lastElementChild.getBoundingClientRect();
        const lastLeft = Array.from(bar.children).slice(0, -1)
            .reduce((m, el) => Math.max(m, el.getBoundingClientRect().right), left.right);
        return { x: (lastLeft + right.left) / 2, y: right.top + right.height / 2, w: right.left - lastLeft };
    });
    // A drag on the title bar of a filled window moves nothing. It starts on
    // the bar's empty part: on its path's links no drag starts anyway.
    const g0 = await gapOf();
    expect(g0.w, 'premise: the title bar has an empty part').toBeGreaterThan(10);
    await page.mouse.move(g0.x, g0.y);
    await page.mouse.down();
    await page.mouse.move(g0.x - 100, g0.y + 90, { steps: 4 });
    await page.mouse.up();
    expect(await rectOf(page), 'a filled window stays put').toEqual(filled);

    // A double-click there gives it back.
    const gap = await gapOf();
    await page.mouse.dblclick(gap.x, gap.y);
    await expect(page.locator(`${DIALOG} .mb-info-max-btn`)).toHaveAttribute('aria-pressed', 'false');
    const back = await rectOf(page);
    for (const k of ['left', 'top', 'width', 'height']) {
        expect(Math.abs(back[k] - before[k]), `${k}: ${JSON.stringify({ back, before })}`).toBeLessThanOrEqual(1);
    }
    // Measured again: the restored window is smaller, and the filled one's
    // gap now lies outside it (a click outside closes the window).
    const gap2 = await gapOf();
    await page.mouse.dblclick(gap2.x, gap2.y);
    await expect(page.locator(`${DIALOG} .mb-info-max-btn`)).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
});

test('Keyboard Shortcuts, a dialog of the same shell, has no ⤢', async ({ page }) => {
    await loadBsRecordsPage(page, {});
    await clickToolbarItem(page, '#mb-shortcuts-help-btn');
    await expect(page.locator('#mb-shortcuts-help')).toBeVisible();
    await expect(page.locator('#mb-shortcuts-help .mb-info-max-btn')).toHaveCount(0);
    await expect(page.locator('#mb-shortcuts-help .mb-info-grip')).toHaveCount(0);
});
