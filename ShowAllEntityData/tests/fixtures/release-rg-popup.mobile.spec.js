'use strict';

// The release-group popup on a touch screen (chromium-mobile: Pixel 7, touch,
// no hover). A tap has no hover to show a card on and no Ctrl to hold, so a
// tap on a live track's "#" cell opens the release group window at once (the
// popup engine's tap rule, as on the Springsteen sites:
// detail-preview.mobile.spec.js). Desktop: release-rg-popup.spec.js.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/e384f062-85a3-4141-9122-0814d987cda3';
const FIXTURE = path.join(__dirname, 'release-tracks-brixton-night.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('a tap on a "#" cell opens the release group window, and shows no hover card', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await page.context().route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.context().route('**/ws/2/release?release-group=**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: json('ws2-rg-release-browse.json'),
    }));
    await page.context().route(/\/ws\/2\/release-group\/[0-9a-f-]{36}\?/, (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: json('ws2-rg-lookup.json'),
    }));
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: { sa_rich_tooltip_delay_ms: 0 } });
    await page.route('https://musicbrainz.org/release/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    // The first medium's table is open after the render; no other is needed.
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const shown = [];
    await page.exposeFunction('__rgPeekShown', () => shown.push(Date.now()));
    await page.evaluate(() => {
        // The card element is created on its first show: watch for it.
        new MutationObserver(() => {
            const p = document.getElementById('mb-dp-peek');
            if (p && p.style.display === 'block') window.__rgPeekShown();
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });

    const cell = page.locator('table.tbl').nth(0).locator('tbody tr').nth(0).locator('td').first();
    await cell.scrollIntoViewIfNeeded();
    // Locator.tap() fails here: on this zoomed-out Pixel 7 page the visual
    // viewport sits hundreds of pixels below the layout viewport
    // (visualViewport.offsetTop), and its hit test lands on the page's
    // unstyled header instead (static.metabrainz.org is blocked). Tap the
    // cell where it is, once the premise holds: a finger at its centre
    // touches the cell itself. The box is in visual-viewport coordinates,
    // elementFromPoint() takes layout ones.
    const box = await cell.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    expect(await cell.evaluate((td, [px, py]) => td.contains(document.elementFromPoint(
        px + visualViewport.offsetLeft, py + visualViewport.offsetTop)), [x, y])).toBe(true);
    await page.touchscreen.tap(x, y);

    const dialog = page.locator('#mb-dp-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':scope > div > span').first()).toHaveText('Release group');
    await expect(dialog.locator('.mb-rg-wtable tbody tr')).toHaveCount(5, { timeout: 20000 });
    await expect(dialog).toContainText('main event');
    expect(page.context().pages()).toHaveLength(1);
    expect(shown).toEqual([]);
    expect(errors).toEqual([]);
});
