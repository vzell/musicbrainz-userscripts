'use strict';

// The release-notice card on a touch device (chromium-mobile: Pixel 7,
// hasTouch, no hover). Mockup https://claude.ai/artifact/7X3bbpdfmSuqr4jU85Q4Bn:
// "a tap toggles the card" — touch has no hover, so a card that only hover
// opened would be a dead end there.
//
// Guarantees pinned:
//   - a tap on the flagged line opens the card and it STAYS open (a tap's
//     compatibility mouse events must not start the hover path, whose
//     mouseout grace would close it again);
//   - a second tap on the line closes it; a tap elsewhere closes it too.
// The desktop behaviour is pinned by apollo-findings-4.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/release/65f35399-f638-4295-8c78-0ddea0e36ed8';
const FIXTURE = path.join(__dirname, 'release-notice.html');

/**
 * Loads the flagged fixture, renders the tracklist and opens the Annotation
 * section (it starts collapsed after a render).
 * @param {import('@playwright/test').Page} page
 */
async function open(page) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true } });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.locator('button[data-label="Show all Tracks for Release"]').evaluate((b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.evaluate(() => {
        const h2 = document.querySelector('div.annotation > h2');
        if (h2 && typeof h2._mbToggle === 'function') h2._mbToggle(true);
    });
}

/**
 * Taps an element in the middle of the screen (see
 * findings-title-style.mobile.spec.js: `locator.tap()` scrolls to the top,
 * under MusicBrainz's sticky header).
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 */
async function tapMid(page, sel) {
    const p = await page.locator(sel).evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'start' });
        const b = el.getBoundingClientRect();
        const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };
        return { x: b.left + Math.min(12, b.width / 2) - vv.offsetLeft, y: b.top + b.height / 2 - vv.offsetTop };
    });
    await page.touchscreen.tap(p.x, p.y);
}

const cardUp = (page) => page.evaluate(() => {
    const c = document.getElementById('mb-release-notice-card');
    return !!c && c.style.display === 'block';
});

test('a tap opens the notice card, which stays; a second tap closes it', async ({ page }) => {
    await open(page);
    await tapMid(page, 'span.mb-release-notice[data-mb-finding]');
    expect(await cardUp(page)).toBe(true);
    // The hover grace is 350 ms: wait past it in the page's own time.
    const t0 = await page.evaluate(() => performance.now());
    await page.waitForFunction((t) => performance.now() - t >= 600, t0);
    expect(await cardUp(page), 'still open after the hover grace would have run out').toBe(true);
    await tapMid(page, 'span.mb-release-notice[data-mb-finding]');
    expect(await cardUp(page)).toBe(false);
    await tapMid(page, 'span.mb-release-notice[data-mb-finding]');
    expect(await cardUp(page)).toBe(true);
    await tapMid(page, 'h2.tracklist');
    expect(await cardUp(page), 'a tap elsewhere closes it').toBe(false);
});
