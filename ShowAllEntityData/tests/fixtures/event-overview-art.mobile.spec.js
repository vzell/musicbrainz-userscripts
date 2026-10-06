'use strict';

// pageType 'event-overview' on a touch device (chromium-mobile: Pixel 7
// emulation) — the Event art section's viewer opens on a tap and steps on a
// swipe, as the release page's does (release-tracks-cover-art.mobile.spec.js).
//
// The tap is a raw page.touchscreen.tap() at the tile's box centre, with the
// pointerdown target asserted: locator.tap()'s actionability check misreads a
// scrolled visual viewport on this zoomed-out layout and can report a false
// "intercepts pointer events" (docs/claude/testing-playwright.md).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const RECORD = fs.readFileSync(path.join(__dirname, 'eaa-event-3f2ca30a.json'), 'utf8');
const META_RE = /^https:\/\/eventartarchive\.org\/event\/([0-9a-f-]{36})$/;
const CORS = { 'access-control-allow-origin': '*' };

test.describe('event-overview Event art on a touch device', () => {
    test('tapping a thumbnail opens the viewer; a horizontal swipe steps', async ({ page }) => {
        await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: URL, fixtureFile: FIXTURE, testMode: true,
            settingsOverride: { sa_enable_event_overview: true, sa_event_overview_event_art: true, sa_art_idb_enable: false },
        });
        await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
        await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
        await page.route(META_RE, (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD }));
        await page.locator('button[data-label="Show all Relationships for Event"]').evaluate((b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.locator('.mb-release-art-sec[data-mb-art-state="ok"]').waitFor({ state: 'attached', timeout: 15000 });

        const thumb = page.locator('figure.mb-release-art-tile[data-mb-art-i="4"] > a');
        await thumb.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
            window.__tapTarget = null;
            document.addEventListener('pointerdown', (e) => {
                window.__tapTarget = e.target.closest('figure.mb-release-art-tile') ? 'tile' : e.target.className;
            }, { capture: true, once: true });
        });
        const box = await thumb.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        expect(await page.evaluate(() => window.__tapTarget), 'the touch landed on the tile').toBe('tile');
        const pos = page.locator('#mb-art-viewer .mb-artv-pos');
        await expect(pos).toHaveText('5 / 15');

        const swipe = (fromX, toX) => page.evaluate(([a, b]) => {
            const stage = document.querySelector('#mb-art-viewer .mb-artv-stage');
            const r = stage.getBoundingClientRect();
            const y = r.top + r.height / 2;
            const opts = (x) => ({ bubbles: true, pointerType: 'touch', clientX: r.left + x, clientY: y, isPrimary: true });
            stage.dispatchEvent(new PointerEvent('pointerdown', opts(a)));
            stage.dispatchEvent(new PointerEvent('pointerup', opts(b)));
        }, [fromX, toX]);
        await swipe(250, 100);
        await expect(pos).toHaveText('6 / 15');
        await swipe(100, 250);
        await expect(pos).toHaveText('5 / 15');
    });
});
