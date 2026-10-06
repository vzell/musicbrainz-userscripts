'use strict';

// The artwork gallery (D2) on a phone — Pixel 7 emulation, touch, no hover:
// the window fits the screen width, and a tap on an image opens the viewer
// (a tap fires no hover, so nothing may depend on one).

const { test, expect } = require('../support/test');
const { R, open, viewer } = require('../support/caaColumnFixture');

test.describe('CAA/EAA artwork gallery (D2) — touch', () => {
    test('the window fits the phone, and a tap on an image opens the viewer', async ({ page }) => {
        test.setTimeout(120000);
        await open(page, {}, { domToggle: true });
        // MusicBrainz's header can overlay the h3 run on this emulation (see
        // caaColumnFixture's domToggle), so the opener is pressed through the DOM.
        await page.locator('#mb-caa-toggle-btn-gallery-0').evaluate((b) => b.click());
        const gallery = page.locator('#mb-art-gallery');
        await expect(gallery).toBeVisible();
        const fit = await gallery.evaluate((g) => ({ right: g.getBoundingClientRect().right, win: window.innerWidth }));
        expect(fit.right, 'no sideways scrolling to reach the window').toBeLessThanOrEqual(fit.win + 1);
        const tile = page.locator(`#mb-art-gallery .mb-art-gal-rel[data-mb-art-path="/release/${R.sixteen}"] figure.mb-art-gal-tile`).nth(2);
        await tile.scrollIntoViewIfNeeded();
        const box = await tile.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await expect.poll(() => viewer(page)).toMatchObject({ pos: '3 / 16' });
    });
});
