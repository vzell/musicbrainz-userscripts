'use strict';

// The artwork viewer's flip: H mirrors the image left-right, V upside-down —
// for a scan of a CD's mould/matrix area taken through the disc, whose
// numbers read backwards.
//
// A flip leaves the image's rect where it was, so these tests follow the
// image's OWN top-left pixel (measure().origin, through cornerOf()): "TL"
// upright, "TR" mirrored left-right, "BL" upside-down, "BR" both — and a
// clockwise turn moves it TL → TR → BR → BL. Set-up as in the other viewer
// specs (tests/support/artViewerFixture.js).
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. H AND V MIRROR IN PLACE (the corner moves, the rect does not); the
//     Flip button shows the left-right state; a step starts unflipped.
//  2. ON A TURNED IMAGE, H STILL MIRRORS LEFT-RIGHT AS SEEN (a flip applied
//     before the turn would mirror it top-bottom), and R STILL TURNS
//     CLOCKWISE AS SEEN on a mirrored image (a mirror reverses the turn
//     applied underneath it).
//  3. FLIPPED AND ZOOMED, THE PAN IS ON SCREEN: a pointer near the bottom
//     shows the bottom edge of what is on screen (a translate inside the
//     flip would pan the other way).

const { test, expect } = require('../support/test');
const {
    GUTTER, openRelease, openViewerOnBigImage, waitForBigImage, measure, cornerOf, zoomTo, viewerUi,
} = require('../support/artViewerFixture');

test.use({ viewport: { width: 1280, height: 720 } });

/**
 * Presses a key and returns the corner the image's own top-left pixel is at.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @returns {Promise<string>}
 */
async function pressCorner(page, key) {
    await page.keyboard.press(key);
    return cornerOf(await measure(page));
}

test.describe('artwork viewer: flip (H left-right, V upside-down)', () => {
    test('H and V mirror in place; the Flip button shows H; a step starts unflipped', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        const up = await measure(page);
        expect(cornerOf(up), 'premise: upright').toBe('TL');
        expect((await viewerUi(page)).flipBtn).toBe('false');

        expect(await pressCorner(page, 'h'), 'H: left-right').toBe('TR');
        const g = await measure(page);
        for (const k of ['left', 'top', 'right', 'bottom']) {
            expect(Math.abs(g.img[k] - up.img[k]), `${k} unchanged: mirrored in place`).toBeLessThan(1);
        }
        expect((await viewerUi(page)).flipBtn).toBe('true');
        expect(await pressCorner(page, 'v'), 'H and V: half a turn').toBe('BR');
        expect(await pressCorner(page, 'h'), 'V alone: upside-down').toBe('BL');
        expect((await viewerUi(page)).flipBtn).toBe('false');

        await page.click('#mb-art-viewer [data-artv="flip"]');
        expect(cornerOf(await measure(page)), 'the button flips left-right too').toBe('BR');
        await page.keyboard.press('ArrowRight');
        await waitForBigImage(page);
        const ui = await viewerUi(page);
        expect(ui.pos).toBe('2 / 16');
        expect(ui.transform, 'a step starts unflipped').toBe('');
        expect(ui.flipBtn).toBe('false');
    });

    test('on a turned image H still mirrors left-right as seen, and R still turns clockwise as seen', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        expect(await pressCorner(page, 'r'), 'R: a clockwise turn').toBe('TR');
        expect(await pressCorner(page, 'h'), 'H on the turned image: its left-right mirror').toBe('TL');
        // Mirrored now: each R must still go TL → TR → BR → BL, clockwise.
        expect(await pressCorner(page, 'r')).toBe('TR');
        expect(await pressCorner(page, 'r')).toBe('BR');
        expect(await pressCorner(page, 'r')).toBe('BL');
        expect(await pressCorner(page, 'Shift+R'), 'Shift+R: anticlockwise').toBe('BR');
    });

    test('flipped upside-down and zoomed, a pointer near the bottom shows the bottom edge of what is on screen', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await page.keyboard.press('v');
        await zoomTo(page, 3);
        const s = (await measure(page)).stage;
        const cx = (s.left + s.right) / 2;
        await page.mouse.move(cx, (s.top + s.bottom) / 2, { steps: 4 });
        await page.mouse.move(cx, s.bottom - 0.08 * s.height / 2, { steps: 12 });
        const { img, stage } = await measure(page);
        expect(stage.bottom - img.bottom, 'bottom edge on screen').toBeGreaterThanOrEqual(-0.5);
        expect(stage.bottom - img.bottom, 'bottom edge in the gutter').toBeLessThanOrEqual(GUTTER.y + 1);
        expect(img.top, 'still covers the top').toBeLessThan(stage.top);
    });
});
