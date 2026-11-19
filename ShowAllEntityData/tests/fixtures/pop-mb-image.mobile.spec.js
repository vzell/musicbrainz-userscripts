'use strict';

// The entity's picture in the MusicBrainz link previews on a touch screen
// (chromium-mobile: Pixel 7, touch, no hover). A tap opens the window (with
// `sa_pop_mb_on_touch`), which is the phone's Space: the picture shows there
// and a tap on it opens the artwork viewer. Desktop: pop-mb-image.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f';
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * Taps the middle of `el` with a finger at visual-viewport coordinates, after
 * checking that a finger there really touches it (on this zoomed-out page
 * Locator.tap() misses: release-rg-popup.mobile.spec.js).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 */
async function tap(page, el) {
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await el.evaluate((a, [px, py]) => a.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);
}

/**
 * Waits until the window has not repainted for `ms`. A fresh window repaints
 * its area on each answer of its follow-up requests in its first seconds,
 * replacing the picture: under a full suite's load the tap's element was
 * detached mid-scroll (NB-3641, 2026-11-19, "Element is not attached") or no
 * longer under the finger (an earlier run). The same wait as
 * discogs-mb-column.spec.js's windowQuiet().
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [ms]
 */
async function windowQuiet(page, ms = 1500) {
    await page.evaluate(() => {
        const area = document.querySelector('#mb-dp-dialog .mb-dp-area');
        window.__mbAreaChangedAt = performance.now();
        new MutationObserver(() => { window.__mbAreaChangedAt = performance.now(); }).observe(area, { childList: true, subtree: true });
    });
    await page.waitForFunction((q) => performance.now() - window.__mbAreaChangedAt >= q, ms, { timeout: 30000 });
}

test('a tap opens the window with the artist\'s picture; a tap on it opens the viewer', async ({ page }) => {
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.route(/^https:\/\/(?:commons|upload)\.wikimedia\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route(/\/ws\/2\//, (route) => {
        const url = route.request().url();
        let body = null;
        if (/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=genres/.test(url)) body = json('ws2-pop-artist-bruce.json');
        else if (/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=url-rels/.test(url)) body = json('ws2-pop-artist-bruce-pin.json');
        return route.fulfill(body ? { status: 200, contentType: 'application/json', body }
            : { status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' });
    });
    await ctx.route(/^https:\/\/musicbrainz\.org\/artist\//, (route) => route.fulfill({
        status: 200, contentType: 'text/html', body: '<html><body>opened</body></html>',
    }));
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_pop_mb_on_touch: true, sa_rich_tooltip_delay_ms: 0 },
    });

    await tap(page, page.locator(`table.tbl tbody a[href="/artist/${ARTIST}"]`).first());
    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    const pic = dialog.locator('.mb-pop-xpic a[data-mb-artv-ext]');
    await expect(pic.locator('img')).toHaveAttribute('src', /Special:FilePath\/Bruce_Springsteen_-_Roskilde_Festival_2012\.jpg\?width=330$/, { timeout: 15000 });
    expect(page.url(), 'the tap stayed on the page').toBe(RG_URL);

    await windowQuiet(page);
    await tap(page, pic.locator('img'));
    await expect(page.locator('#mb-art-viewer')).toBeVisible();
    await expect(page.locator('#mb-art-viewer [data-mb-artv-page]')).toHaveAttribute('href', /File:Bruce_Springsteen_-_Roskilde_Festival_2012\.jpg$/);
});
