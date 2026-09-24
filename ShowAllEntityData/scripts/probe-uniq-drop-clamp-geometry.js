'use strict';

/**
 * Probe: where does `openUniqDrop()`'s viewport clamp actually land, and why?
 *
 * Written for the action-button redesign, which moved ↔️ Resize and 👁️ Visible
 * out of the h1 bar and into the table's h2 beside the filter container. That
 * made `uniq-drop-viewport-clip.spec.js` fail by ~9px, and the interesting
 * question was whether the CLAMP had broken or whether the spec's own
 * `crampedHeight` — derived from a measurement taken at a different viewport
 * WIDTH, before its own resize — had simply stopped describing the layout.
 *
 * Prints every number the clamp is computed from, before and after the resize:
 *
 *   node scripts/probe-uniq-drop-clamp-geometry.js
 */

const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');
const { waitForRenderComplete } = require('../tests/support/browser');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'uniq-drop-viewport-clip.html');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.route(`${URL}?**`, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));

    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const wrap = page.locator('table.tbl thead th[data-col-name="Name"] .mb-col-uniq-wrap').first();
    const before = await wrap.boundingBox();
    console.log('viewport 1280x720');
    console.log('  button y=%s h=%s bottom=%s', before.y.toFixed(1), before.height.toFixed(1),
        (before.y + before.height).toFixed(1));

    const crampedHeight = Math.ceil(before.y + before.height) + 30;
    await page.setViewportSize({ width: 1024, height: crampedHeight });

    const after = await wrap.boundingBox();
    console.log('viewport 1024x%d  (the spec\'s crampedHeight)', crampedHeight);
    console.log('  button y=%s h=%s bottom=%s   (moved %s px)',
        after.y.toFixed(1), after.height.toFixed(1), (after.y + after.height).toFixed(1),
        (after.y - before.y).toFixed(1));

    const geom = await page.evaluate(() => {
        const btn = document.querySelector('table.tbl thead th[data-col-name="Name"] .mb-col-uniq-wrap');
        const r = btn.getBoundingClientRect();
        return {
            vh: window.innerHeight,
            top: r.top, bottom: r.bottom,
            spaceBelow: window.innerHeight - r.bottom - 6,
            spaceAbove: r.top - 6,
            h2Height: (document.querySelector('h2') || {}).offsetHeight,
            h2Children: Array.from((document.querySelector('h2') || { children: [] }).children)
                .map((c) => c.id || c.className || c.tagName),
        };
    });
    console.log('  vh=%d spaceBelow=%s spaceAbove=%s   (clamp floor is 120)',
        geom.vh, geom.spaceBelow.toFixed(1), geom.spaceAbove.toFixed(1));
    console.log('  h2 height=%s', geom.h2Height);
    console.log('  h2 children=%s', JSON.stringify(geom.h2Children));

    await wrap.locator('.mb-col-uniq-btn').click();
    const drop = await page.locator('#mb-col-uniq-dropdown').boundingBox();
    console.log('  panel y=%s h=%s bottom=%s  overshoot=%s',
        drop.y.toFixed(1), drop.height.toFixed(1), (drop.y + drop.height).toFixed(1),
        (drop.y + drop.height - geom.vh).toFixed(1));

    await browser.close();
})();
