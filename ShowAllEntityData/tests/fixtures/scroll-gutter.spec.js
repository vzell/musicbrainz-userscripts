'use strict';

// The scrollbar's room is kept once a table of ours shows
// (`_scrollGutterStable()`: `html.mb-sa-gutter { scrollbar-gutter: stable }`,
// from majkinetor's Event Horizon, EH:2711; org/majkinetor.org "Smaller
// adoptions"). Typing in a filter can shrink the page below the window's
// height; without it the vertical scrollbar goes away and the whole page
// moves sideways by its width, under the pointer.
//
// Pinned: not on the initial page (the site's own layout until a button is
// pressed), on after a MusicBrainz render, and on after a render on another
// host too: the jump is the same there, and `_mbuTableShown()` returns early
// on a foreign host for everything else it does.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { JL_BUTTON, loadJlListPage } = require('../support/jlFixture');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

/**
 * The root element's computed scrollbar-gutter and our class on it.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{gutter: string, cls: boolean}>}
 */
function gutter(page) {
    return page.evaluate(() => ({
        gutter: getComputedStyle(document.documentElement).scrollbarGutter,
        cls: document.documentElement.classList.contains('mb-sa-gutter'),
    }));
}

test('MusicBrainz: the initial page keeps its layout; after the render the scrollbar\'s room is kept', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await expect(page.locator('#mb-saed-bar')).toBeAttached();
    expect(await gutter(page)).toEqual({ gutter: 'auto', cls: false });

    await page.route(`${ARTIST_RECORDINGS_URL}?**`,
        (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    expect(await gutter(page)).toEqual({ gutter: 'stable', cls: true });
});

test('another host (jungleland.it): after the render the scrollbar\'s room is kept too', async ({ page }) => {
    await loadJlListPage(page, { enabled: true });
    expect((await gutter(page)).cls, 'not on the initial page').toBe(false);
    await page.click(`button[data-label="${JL_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    expect(await gutter(page)).toEqual({ gutter: 'stable', cls: true });
});
