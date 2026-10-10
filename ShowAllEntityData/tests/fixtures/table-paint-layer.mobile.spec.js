'use strict';

// The table paint layer on a touch device (chromium-mobile: Pixel 7, hasTouch,
// no hover). The rule is plain CSS with no media query, so the property is the
// same as on desktop; this pins that nothing in the mobile path (the zoomed-out
// viewport, touch-only styles) overrides it. Desktop: table-paint-layer.spec.js.
//
// Rendered through the series page's own "Show all" button, the way the other
// mobile specs render a table (the disk-fixture loader clicks the 📦 Data menu,
// which the wrapped toolbar covers at this width). Sticky page headers are off:
// they pin a narrow table whole with `position: sticky !important`, which is a
// stacking context of its own and a different property.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

test('table paint layer on mobile: the table is relative with z-index 0', async ({ page }) => {
    test.setTimeout(120000);
    await loadUserscriptPage(page, {
        url: SERIES_URL, fixtureFile: SERIES_SHELL, testMode: true,
        settingsOverride: { sa_enable_sticky_page_headers: false },
    });
    await page.locator('button[data-label="Show all Releases for Series"]').evaluate((b) => b.click());
    await waitForRenderComplete(page);
    const layers = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
        .map((t) => ({ position: getComputedStyle(t).position, zIndex: getComputedStyle(t).zIndex })));
    expect(layers.length, 'the data table is rendered').toBeGreaterThanOrEqual(1);
    for (const l of layers) expect(l).toEqual({ position: 'relative', zIndex: '0' });
});
