'use strict';

// The title-style button in the filter headlines on a touch device
// (chromium-mobile: Pixel 7, hasTouch, no hover). Mockup approved 2026-10-29,
// preset "B + C": https://claude.ai/artifact/HvdfbmeTUdcR34J4TrNycD
//
// Guarantees pinned (no hover-only dead ends):
//   - a tap on an idle button runs the check;
//   - a tap on a checked button opens the panel and it STAYS open (a tap's
//     compatibility mouse events must not start the hover path, whose leave
//     timer would close it again);
//   - a tap outside closes it.
// The desktop behaviour is pinned by findings-title-style.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
const FIXTURE = path.join(__dirname, 'artist-releasegroups-live-titles.html');

/**
 * Loads the artist release-groups fixture and renders it.
 * @param {import('@playwright/test').Page} page
 */
async function open(page) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false } });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.locator('button[data-label="🧮 Artist RGs"]').evaluate((b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const panelOpen = (page) => page.evaluate(() => {
    const el = document.getElementById('mb-title-style-pop');
    return !!el && el.style.display !== 'none';
});

/**
 * Taps near an element's left edge with the touchscreen, after scrolling it
 * to the middle of the screen (`locator.tap()` scrolls it to the top edge,
 * where MusicBrainz's sticky header takes the tap — see
 * sidebar-sections.mobile.spec.js).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} loc
 * @returns {Promise<void>}
 */
async function tapMid(page, loc) {
    const p = await loc.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'start' });
        const b = el.getBoundingClientRect();
        const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };
        return { x: b.left + Math.min(12, b.width / 2) - vv.offsetLeft, y: b.top + b.height / 2 - vv.offsetTop };
    });
    await page.touchscreen.tap(p.x, p.y);
}

test.describe('title-style headline button on touch', () => {
    test('tap checks, tap opens the panel and it stays, a tap outside closes it', async ({ page }) => {
        // A fake clock (time still flows) lets the test jump past the hover
        // delay and the leave grace period instead of sleeping through them.
        await page.clock.install();
        await open(page);
        await tapMid(page, page.locator('h3 .mb-title-style-btn').first());
        await expect.poll(() => page.evaluate(() =>
            !document.querySelector('.mb-title-style-btn[data-mb-ts-state="idle"], .mb-title-style-btn[data-mb-ts-state="running"]'))).toBe(true);
        await tapMid(page, page.locator('h3 .mb-title-style-btn').first());
        expect(await panelOpen(page)).toBe(true);
        // Longer than the hover delay and the leave grace period together.
        await page.clock.fastForward(800);
        expect(await panelOpen(page)).toBe(true);
        await tapMid(page, page.locator('h3.mb-toggle-h3').last());
        expect(await panelOpen(page)).toBe(false);
    });
});
