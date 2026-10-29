'use strict';

// window.__saTest.getUniqDropSections() opens a column's 📊 panel the way a
// user would, so a spec can tick its entries afterwards. The panel is
// position:fixed and placed from the 📊 button's rect at open time; when the
// header sat below the fold, the hook opened it there anyway and the panel
// landed off-screen, where Playwright cannot scroll to an entry ("element is
// outside of the viewport" for 90 s). Seen in a full suite run as a flake of
// uniq-drop-title-anatomy.spec.js, whose header sits at y=731 in a 720 px
// viewport: whether an entry fell off-screen depended on how far late layout
// had pushed the table (DEBUG-NOTES 2026-10-29). Here a spacer pushes it far
// enough every time. A first fix scrolled the page instead and broke the
// medley specs' second tick (uniq-drop-title-anatomy.spec.js): the panel
// closes on a page scroll that moves its button, and a tick that shortens the
// table makes the browser clamp a scrolled page.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const REMIX_URL = 'https://musicbrainz.org/release/f6215982-62e1-4b81-b88f-754dca0da149';
const REMIX_FIXTURE = path.join(__dirname, 'release-tracks-remix-eti.html');

test('a header below the fold: the hook opens the panel on screen and its entries can be ticked', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: REMIX_URL, fixtureFile: REMIX_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_uvd_autocollapse_threshold: 0 },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.evaluate(() => {
        window.scrollTo(0, 0);
        const spacer = document.createElement('div');
        spacer.style.height = '600px';
        document.querySelector('table.tbl').before(spacer);
    });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Title'));
    expect(sections.length).toBeGreaterThan(0);
    // The page is not scrolled: a page scroll that moves the 📊 button closes
    // the panel, so the hook moves the panel, never the page.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = await page.evaluate(() => {
        const r = document.getElementById('mb-col-uniq-dropdown').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
    });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.vh);

    await page.locator('.mb-col-uniq-item').filter({ hasText: '» ETI: Moonitor remix' }).first().click({ timeout: 10000 });
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const titles = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((tr) => tr.style.display !== 'none').length);
    expect(titles).toBe(1);
});
