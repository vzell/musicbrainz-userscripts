'use strict';

// The CAA column viewer and image card on a phone (org/redesign-CAA-EAA-column.org,
// D1/B2): Pixel 7 emulation — touch, no hover. Pins that a TAP on a tile opens
// the viewer (a tap fires no hover, so the viewer must not depend on one), that
// a horizontal swipe steps and carries on into the next row like →, and that a
// tap leaves no image card behind (the delegated engine skips taps, and a card
// shown by a tap would never be hidden again).

const { test, expect } = require('../support/test');
const { R, open, cell, expandCell, viewer } = require('../support/caaColumnFixture');

/**
 * Dispatches the touch pointer pair the viewer's swipe handler reads
 * (pointerType 'touch', clientX), as release-tracks-cover-art.mobile.spec.js
 * does: right-to-left = next.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fromX
 * @param {number} toX
 */
const swipe = (page, fromX, toX) => page.evaluate(([a, b]) => {
    const stage = document.querySelector('#mb-art-viewer .mb-artv-stage');
    const r = stage.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const opts = (x) => ({ bubbles: true, pointerType: 'touch', clientX: r.left + x, clientY: y, isPrimary: true });
    stage.dispatchEvent(new PointerEvent('pointerdown', opts(a)));
    stage.dispatchEvent(new PointerEvent('pointerup', opts(b)));
}, [fromX, toX]);

test.describe('CAA column redesign — touch', () => {
    test('a tap on a tile opens the viewer and leaves no card; a swipe steps on into the next row', async ({ page }) => {
        test.setTimeout(120000);
        await open(page, {}, { domToggle: true });
        await expandCell(page, R.sixteen);
        const tile = cell(page, R.sixteen).locator('li.mb-caa-art-li-image[data-mb-art-i="14"]');
        await tile.scrollIntoViewIfNeeded();
        // A raw touch at the box centre, for the reason the release-tracks
        // mobile spec gives: locator.tap()'s hit-check is unreliable on this
        // zoomed-out layout once the visual viewport is scrolled.
        const box = await tile.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '15 / 16', rowPos: 'row 1 of 5' });
        expect(await page.locator('#mb-stat-tooltip').evaluate((t) => t.style.display),
            'a tap shows no image card').not.toBe('block');

        await swipe(page, 250, 100);
        expect((await viewer(page)).pos).toBe('16 / 16');
        await swipe(page, 250, 100);
        const next = await viewer(page);
        expect(next.rowPos, 'past the last image, a swipe goes on like →').toBe('row 2 of 5');
        expect(next.src).toContain(R.noFront);
        await swipe(page, 100, 250);
        expect(await viewer(page)).toMatchObject({ pos: '16 / 16', rowPos: 'row 1 of 5' });
    });
});
