'use strict';

// The detail window's size on a phone (chromium-mobile: Pixel 7, touch, no
// hover). The browser's own resize corner (`resize: both`) answers a mouse
// only, so on a phone the window could not be made bigger (vzell,
// 2026-11-10). `createInfoDialog()`'s two opt-ins, both passed by
// `_dpOpenDialog()` alone:
//
//   • ⤢ FILLS WHAT SHOWS: the window takes the visual viewport less a 6 px
//     margin (not the layout viewport, which a zoomed-out phone page makes
//     far larger — a fill by it would put most of the window off screen),
//     follows a pan of it, and ⤡ gives back the exact rectangle it had. The
//     zoomed-in visual viewport is a stand-in (headless Chromium ignores a
//     synthesized pinch): half the layout size, offset 210/340 px. The state is stored, so
//     the next window opens filled; the size it goes back to is what is
//     stored beside `max: true`, never the filled one.
//   • THE GRIP RESIZES BY TOUCH: a real touch drag (CDP touch events, so
//     pointerType "touch", not a mouse) on `.mb-info-grip` makes the window
//     wider and taller by the distance moved, saves it, and is no tap
//     outside (the window stays open). Hidden while the window is filled.
//
// Desktop (no grip; ⤢ and the title bar's double-click): dp-window-size.spec.js.

const { test, expect } = require('../support/test');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');

const DIALOG = '#mb-dp-dialog';
const LINK = 'table.tbl tbody a:not(.mb-fi-cell)[href*="code=CR1AD1"]';

/**
 * Renders brucespringsteen.it's records and opens the detail window on one
 * record by a tap.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openWindow(page) {
    const link = page.locator(LINK);
    await link.scrollIntoViewIfNeeded();
    await link.tap();
    await expect(page.locator(`${DIALOG} .mb-dp-xtitle`)).toHaveText('1001 AMERICAN DREAMS');
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function renderRecords(page) {
    await loadBsRecordsPage(page, { settingsOverride: { sa_bs_detail_preview: true } });
    await routeDetailPages(page, 'bs');
    await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** @returns {Promise<{left: number, top: number, width: number, height: number}>} */
const rectOf = (page) => page.locator(DIALOG).evaluate((d) => {
    const r = d.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
});

/** @returns {Promise<{left: number, top: number, width: number, height: number}>} The visual viewport. */
const viewBox = (page) => page.evaluate(() => {
    const vv = window.visualViewport;
    return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
});

test.describe('the detail window on a phone can be made bigger', () => {
    test('⤢ fills what the screen shows, ⤡ gives back its size, and the next window opens filled', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        await renderRecords(page);
        await openWindow(page);

        const before = await rectOf(page);
        const max = page.locator(`${DIALOG} .mb-info-max-btn`);
        await expect(max).toBeVisible();
        const mb = await max.boundingBox();
        const db = await page.locator(DIALOG).boundingBox();
        expect(mb.x + mb.width, '⤢ is inside the window, not pushed off its title bar').toBeLessThanOrEqual(db.x + db.width + 0.5);

        // Zoomed in, what SHOWS is smaller than the layout viewport and
        // offset in it; that is what tells a fill by the visual viewport from
        // one by window.innerWidth/innerHeight. Headless Chromium ignores a
        // synthesized pinch (sidebar-collapse-handle.mobile.spec.js), so a
        // stand-in visual viewport of a page zoomed in 2× takes its place: an
        // EventTarget, so the window can follow its resize and scroll.
        await page.evaluate(() => {
            const vv = new EventTarget();
            Object.assign(vv, { offsetLeft: 210, offsetTop: 340, width: Math.round(window.innerWidth / 2), height: Math.round(window.innerHeight / 2), scale: 2 });
            Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
        });
        const vb = await viewBox(page);
        const layout = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
        expect(vb.width, `premise: the visual viewport is narrower than the layout one: ${JSON.stringify({ vb, layout })}`)
            .toBeLessThan(layout.w * 0.75);
        expect(before.height, 'premise: the window is shorter than what shows').toBeLessThan(vb.height - 40);
        await max.tap();

        await expect(max).toHaveAttribute('aria-pressed', 'true');
        await expect(max).toHaveText('⤡');
        const filled = await rectOf(page);
        expect(Math.abs(filled.left - (vb.left + 6)), `left: ${JSON.stringify({ filled, vb })}`).toBeLessThanOrEqual(1);
        expect(Math.abs(filled.top - (vb.top + 6)), 'top').toBeLessThanOrEqual(1);
        expect(Math.abs(filled.width - (vb.width - 12)), 'width: the visual viewport, not the layout one').toBeLessThanOrEqual(1);
        expect(Math.abs(filled.height - (vb.height - 12)), 'height').toBeLessThanOrEqual(1);
        await expect(page.locator(`${DIALOG} .mb-info-grip`), 'no grip on a filled window').toBeHidden();

        // A scroll of what shows (a pan of the zoomed page): the window follows.
        await page.evaluate(() => {
            window.visualViewport.offsetTop += 150;
            window.visualViewport.dispatchEvent(new Event('scroll'));
        });
        const followed = await rectOf(page);
        expect(followed.top, 'it follows the visual viewport').toBe(filled.top + 150);
        await page.evaluate(() => {
            window.visualViewport.offsetTop -= 150;
            window.visualViewport.dispatchEvent(new Event('scroll'));
        });

        const stored = await page.evaluate(() => window.GM_getValue('sa_dp_dialog_geometry', null));
        expect(stored, 'stored: filled, with the size it goes back to').toMatchObject({ max: true, width: before.width, height: before.height });

        // Closed and opened again: filled.
        await page.locator(`${DIALOG} button:text-is("✕")`).tap();
        await expect(page.locator(DIALOG)).toHaveCount(0);
        await openWindow(page);
        await expect(page.locator(`${DIALOG} .mb-info-max-btn`)).toHaveAttribute('aria-pressed', 'true');
        const again = await rectOf(page);
        expect(Math.abs(again.height - filled.height), 'opens filled').toBeLessThanOrEqual(1);

        await page.locator(`${DIALOG} .mb-info-max-btn`).tap();
        await expect(page.locator(`${DIALOG} .mb-info-max-btn`)).toHaveAttribute('aria-pressed', 'false');
        const back = await rectOf(page);
        for (const k of ['left', 'top', 'width', 'height']) {
            expect(Math.abs(back[k] - before[k]), `${k} back as it was: ${JSON.stringify({ back, before })}`).toBeLessThanOrEqual(1);
        }
        const unmax = await page.evaluate(() => window.GM_getValue('sa_dp_dialog_geometry', null));
        expect(unmax.max, 'restored is stored too').toBeFalsy();
        expect(errors).toEqual([]);
    });

    test('a touch drag on the corner grip resizes the window and saves its size', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        await renderRecords(page);
        await openWindow(page);

        const grip = page.locator(`${DIALOG} .mb-info-grip`);
        await expect(grip, 'a touch screen gets the grip').toBeVisible();
        const before = await rectOf(page);
        const gb = await grip.boundingBox();
        const at = { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 };
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
        await touch('touchStart', at.x, at.y);
        for (let k = 1; k <= 8; k++) await touch('touchMove', at.x - 2 * k, at.y + 15 * k);
        await touch('touchEnd');

        const after = await rectOf(page);
        // CDP touch points are CSS pixels of the page (as boundingBox() is):
        // 120 down and 16 left.
        expect(Math.abs(after.height - (before.height + 120)), `taller by the drag: ${JSON.stringify({ before, after })}`)
            .toBeLessThanOrEqual(2);
        expect(Math.abs(after.width - Math.max(320, before.width - 16)), 'and narrower by it').toBeLessThanOrEqual(2);
        expect(after.top, 'the top edge stays').toBe(before.top);
        await expect(page.locator(DIALOG), 'a drag on the grip is no tap outside').toBeVisible();
        await expect.poll(() => page.evaluate(() => window.GM_getValue('sa_dp_dialog_geometry', null)))
            .toMatchObject({ height: after.height, width: after.width });
        expect(errors).toEqual([]);
    });
});
