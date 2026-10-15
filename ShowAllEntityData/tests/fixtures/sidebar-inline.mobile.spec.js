'use strict';

// The read-only "Sidebar" cards (9.99.1352) on a phone (chromium-mobile:
// Pixel 7 emulation, zoomed-out viewport).
//
// Found by the full suite on 2026-10-15 (release-tracks-cover-art.mobile.spec.js):
// on a release with a wide tracklist the section sits in the tracklist's
// wrapper, measured 8416 px wide, and on the phone the first facts card took
// all of it (desktop sizes it to its content). The guarantee pinned: every
// card ends inside the window, as the Cover art section below it does
// (`.mb-release-art-sec`'s cap, release-tracks-cover-art.mobile.spec.js).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

test('on a release whose container is far wider than the window, every card ends inside the window', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e',
        fixtureFile: path.join(__dirname, 'release-tracks-medley.html'), testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_enable_release_tracks_cover_art: false, sa_enable_caa_pics: false },
    });
    await page.locator('button[data-label="Show all Tracks for Release"]').evaluate((b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const fit = await page.evaluate(() => {
        const wrap = document.querySelector('.mb-sb-inline-wrap');
        const cards = Array.from(wrap.querySelectorAll('.mb-sb-card')).map((c) => c.getBoundingClientRect().right);
        return { parent: wrap.parentElement.getBoundingClientRect().width, win: window.innerWidth, n: cards.length, right: Math.max(...cards) };
    });
    expect(fit.n, 'premise: there are cards').toBeGreaterThan(0);
    expect(fit.parent, 'premise: the container is wider than the window').toBeGreaterThan(fit.win);
    expect(fit.right, 'every card ends inside the window').toBeLessThanOrEqual(fit.win);
});
