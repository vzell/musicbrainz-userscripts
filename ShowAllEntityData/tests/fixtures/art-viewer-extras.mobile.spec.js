'use strict';

// The artwork viewer on a touch screen (Pixel 7 emulation): two fingers pinch
// to zoom, one finger drags the zoomed image — org/viewer.org item 2. The
// unzoomed one-finger swipe is release-tracks-cover-art.mobile.spec.js's.
//
// Touches are dispatched as the touch PointerEvents the viewer reads (as that
// spec's swipe does): one pointerId per finger. Same images and measuring as
// art-viewer-pan.spec.js (tests/support/artViewerFixture.js).
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. A PINCH ZOOMS BY THE FINGERS' SPREAD and keeps the image spot under
//     their midpoint in place — the midpoint is off-centre, so a pinch that
//     zoomed about the centre would fail. Then ONE FINGER DRAGS the zoomed
//     image (it does not swipe to the next one), and the pinch's zoom stays.

const { test, expect } = require('../support/test');
const { openRelease, noTransition, waitForBigImage, measure, viewerUi } = require('../support/artViewerFixture');

/**
 * Dispatches one touch PointerEvent per finger on the stage.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} type  pointerdown / pointermove / pointerup
 * @param {Array<{id: number, x: number, y: number}>} fingers
 */
const touch = (page, type, fingers) => page.evaluate(([t, fs]) => {
    const stage = document.querySelector('#mb-art-viewer .mb-artv-stage');
    fs.forEach((f) => stage.dispatchEvent(new PointerEvent(t, {
        bubbles: true, pointerType: 'touch', pointerId: f.id, isPrimary: f.id === 1, clientX: f.x, clientY: f.y,
    })));
}, [type, fingers]);

/**
 * The scale in a transform string, 1 when there is none.
 *
 * @param {?string} t
 * @returns {number}
 */
const scaleOf = (t) => Number(((t || '').match(/scale\(([^)]+)\)/) || [0, 1])[1]);

test.describe('artwork viewer on a touch screen: pinch and drag', () => {
    test('two fingers zoom about their midpoint; one finger then drags the zoomed image, without stepping', async ({ page }) => {
        await openRelease(page);
        const thumb = page.locator('figure.mb-release-art-tile[data-mb-art-i="0"] > a');
        await thumb.scrollIntoViewIfNeeded();
        await thumb.tap();
        await noTransition(page);
        await waitForBigImage(page);
        const fit = await measure(page);
        const s = fit.stage;
        // The midpoint: off the centre, inside the fitted image.
        const m = { x: (s.left + s.right) / 2 + fit.img.width * 0.2, y: (s.top + s.bottom) / 2 + fit.img.height * 0.2 };
        const spot = { x: (m.x - fit.img.left) / fit.img.width, y: (m.y - fit.img.top) / fit.img.height };

        const fingers = (d) => [{ id: 1, x: m.x - d, y: m.y }, { id: 2, x: m.x + d, y: m.y }];
        await touch(page, 'pointerdown', fingers(30));
        for (const d of [40, 50, 60]) await touch(page, 'pointermove', fingers(d));
        await touch(page, 'pointerup', fingers(60));
        let g = await measure(page);
        expect(scaleOf((await viewerUi(page)).transform), 'twice the spread: twice the size').toBeCloseTo(2, 2);
        expect(g.img.height / fit.img.height).toBeCloseTo(2, 2);
        expect((m.y - g.img.top) / g.img.height, 'the spot under the midpoint stays (down)').toBeCloseTo(spot.y, 2);

        const before = g.img;
        await touch(page, 'pointerdown', [{ id: 3, x: m.x, y: m.y }]);
        await touch(page, 'pointermove', [{ id: 3, x: m.x, y: m.y - 30 }]);
        await touch(page, 'pointermove', [{ id: 3, x: m.x, y: m.y - 60 }]);
        await touch(page, 'pointerup', [{ id: 3, x: m.x, y: m.y - 60 }]);
        g = await measure(page);
        expect(g.img.top - before.top, 'moved up with the finger').toBeCloseTo(-60, 0);
        const ui = await viewerUi(page);
        expect(ui.pos, 'a drag of a zoomed image is not a swipe').toBe('1 / 16');
        expect(scaleOf(ui.transform), 'the pinch zoom stays').toBeCloseTo(2, 2);
    });
});
