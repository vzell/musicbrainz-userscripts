'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Touch twin of sidebar-collapse-handle.spec.js. MusicBrainz's pages carry
// no viewport meta, so a phone lays them out like a desktop page: a fixed
// element lives in a viewport wider than what is shown (964 vs 412 px here),
// and `right: 0` put the handle where it could never be tapped (2026-10-14).
// Pinned: the handle is inside the VISUAL viewport, a real tap on it opens
// the sidebar, and it stays inside after a sideways pan.

const URL = 'https://musicbrainz.org/release-group/d5f992ab-6238-3b28-bf2b-7b16d913c9f6';
const FIXTURE = path.join(__dirname, 'rel-release-group-overview.html');
const MB_LAYOUT = '#page { display: table; width: 100%; padding: 16px; box-sizing: border-box; }'
    + ' #content { display: table-cell; padding-right: 16px; }'
    + ' #sidebar { display: table-cell; vertical-align: top; padding-left: 16px; width: 218px; border-left: 1px solid #ddd; }';

/** The handle's box against the visual viewport, and the sidebar's state. */
const geo = (page) => page.evaluate(() => {
    const h = document.getElementById('sidebar-toggle-handle').getBoundingClientRect();
    const vv = window.visualViewport;
    return {
        collapsed: document.getElementById('sidebar').classList.contains('sidebar-collapsed'),
        inside: h.left >= vv.offsetLeft - 0.5 && h.right <= vv.offsetLeft + vv.width + 0.5
            && h.top >= vv.offsetTop - 0.5 && h.bottom <= vv.offsetTop + vv.height + 0.5,
        fixedWider: window.innerWidth > vv.width + 50,
    };
});

test('the handle is inside what a phone shows, and a tap on it opens the sidebar', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_collabsable_sidebar: true, sa_sidebar_collapsed: true },
    });
    await page.addStyleTag({ content: MB_LAYOUT });
    // Pressed through the DOM: the fixture's unstyled MB header lies over the
    // toolbar on a phone. The handle gets real taps.
    await page.$eval('button[data-label="Show all Releases for ReleaseGroup"]', (btn) => btn.click());
    await waitForRenderComplete(page);
    const before = await geo(page);
    expect(before.fixedWider, 'premise: fixed elements live in a wider viewport than is shown').toBe(true);
    await expect.poll(async () => (await geo(page)).inside, 'collapsed: inside the visible part').toBe(true);

    await page.locator('#sidebar-toggle-handle').tap();
    await expect.poll(async () => (await geo(page)).collapsed).toBe(false);
    await expect.poll(async () => (await geo(page)).inside, 'opened: still inside the visible part').toBe(true);

    // Panned sideways (a window scroll). A pinch-zoom, which moves only the
    // visual viewport, cannot be tested here: headless Chromium ignores a
    // synthesized pinch (Input.synthesizePinchGesture left the scale at 1).
    await page.evaluate(() => window.scrollBy(300, 0));
    await expect.poll(async () => (await geo(page)).inside, 'after a pan: still inside').toBe(true);
    await page.locator('#sidebar-toggle-handle').tap();
    await expect.poll(async () => (await geo(page)).collapsed, 'a second tap closes it').toBe(true);
});
