'use strict';

// The async job popup on a touch device (chromium-mobile: Pixel 7, hasTouch,
// no hover). Two properties:
//   - a TAP on an anchor never shows the card through its compatibility
//     mouseover (there would be no mouseleave to close it again) — premise
//     checked: the mouseover really reached the anchor;
//   - a tap OUTSIDE the card closes a card a started job opened.
// The desktop behaviour is pinned by async-pop.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');
const pop = (page) => page.locator('#mb-async-pop');

/**
 * Loads the fixture, adds an anchor and a stand-in provider.
 * @param {import('@playwright/test').Page} page
 */
async function setup(page) {
    // A fake clock (time still flows) lets a test jump past the hover
    // delay and the leave grace period instead of sleeping through them.
    await page.clock.install();
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_async_pop_auto_open: true },
    });
    await page.evaluate(() => {
        const th = document.querySelector('table.tbl thead th');
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'aj-anchor';
        b.textContent = '▶🧪';
        b.dataset.mbAj = 'test';
        b.style.cssText = 'font-size:24px;padding:10px';
        th.prepend(b);
        window.__seenOver = 0;
        b.addEventListener('mouseover', () => { window.__seenOver++; });
        window.__saTest.asyncPop.register('test', {
            glyph: '🧪', label: 'Test job',
            snapshot: (scope, job) => ({ phase: job ? job.phase : 'idle', summary: 'stand-in' }),
        });
    });
}

test.describe('async job popup on touch', () => {
    test('a tap on the anchor never shows the card through hover', async ({ page }) => {
        await setup(page);
        await page.locator('#aj-anchor').tap();
        await page.clock.fastForward(600);       // past the 250 ms hover delay
        expect(await page.evaluate(() => window.__seenOver)).toBeGreaterThan(0); // premise
        await expect(pop(page)).toHaveCount(0);
    });

    test('a tap outside closes a card a started job opened', async ({ page }) => {
        await setup(page);
        await page.evaluate(() => {
            window.__saTest.asyncPop.start('test', document.querySelector('table.tbl'),
                { user: true, anchor: document.getElementById('aj-anchor') });
        });
        await expect(pop(page)).toBeVisible();
        await page.locator('h1').tap();
        await expect(pop(page)).toBeHidden();
    });
});
