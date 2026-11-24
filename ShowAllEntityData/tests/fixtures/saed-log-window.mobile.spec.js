'use strict';

// The activity log on a phone (chromium-mobile: Pixel 7 emulation, touch, no
// hover): a tap on ☰ SAED → Help → 🧾 Activity log opens the window full
// screen, and a tap on ✕ closes it. The approved mockup's phone layout
// (https://claude.ai/artifact/4gzcR5shSasSuRWYvJ2wMT): a floating window
// would cover part of a small screen and hide its own buttons.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// A device-width page (saed-narrow.mobile.spec.js uses it for the same reason).
const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const FIXTURE_FILE = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const WIN = '#vz-mb-show-all-entity-data-log';

test('a tap on the row opens the log full screen; ✕ closes it', async ({ page }) => {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
    const vw = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }));
    expect(vw.w, 'premise: a phone-width layout').toBeLessThanOrEqual(600);

    await page.locator('#mb-saed-menu-btn').tap();
    await page.locator('#mb-saed-log-btn').tap();
    await expect(page.locator(WIN)).toBeVisible();
    const b = await page.locator(WIN).boundingBox();
    expect(Math.round(b.x)).toBe(0);
    expect(Math.round(b.y)).toBe(0);
    expect(Math.round(b.width)).toBe(vw.w);
    expect(Math.round(b.height)).toBe(vw.h);

    await page.locator(`${WIN} .vz-log-close`).tap();
    await expect(page.locator(WIN)).toHaveCount(0);
});
