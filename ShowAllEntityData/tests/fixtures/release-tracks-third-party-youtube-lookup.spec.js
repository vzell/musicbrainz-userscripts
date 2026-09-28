'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// The "MBz YouTube Music Lookup" userscript
// (github.com/afrocatmusic/userscripts, @match *://*.musicbrainz.org/release/*,
// @run-at document-idle) appends a bare, unlabeled <button> (no id/class) to
// a release page — real captured markup in debug/youtube.html:
//   <button title="Search &quot;Bruce Springsteen The Wild, the Innocent &amp;
//   The E Street Shuffle&quot; on YouTube Music" style="cursor: pointer;">
//   YouTube Music Lookup</button>
// Its own title always ends in the fixed "... on YouTube Music" suffix (the
// release title fills the middle, so nothing before the suffix is a stable
// anchor) — this is release-tracks' own `removeSelectors` entry,
// 'button[title$="on YouTube Music"]'.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

const THIRD_PARTY_TITLE = 'Search "Bruce Springsteen The Wild, the Innocent & The E Street Shuffle" on YouTube Music';

test.describe('release-tracks: third-party "YouTube Music Lookup" button removal', () => {
    test('the userscript\'s bare button is stripped from the final rendered page', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });

        // Simulate the third-party userscript, which runs at document-idle —
        // before our own render, since ours only starts once the "Show all
        // Tracks for Release" button is clicked.
        await page.evaluate((title) => {
            const btn = document.createElement('button');
            btn.title = title;
            btn.textContent = 'YouTube Music Lookup';
            btn.style.cursor = 'pointer';
            document.getElementById('content').appendChild(btn);
        }, THIRD_PARTY_TITLE);

        // Sanity: it's really there before our render runs.
        expect(await page.locator('button[title$="on YouTube Music"]').count()).toBe(1);

        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        // Fails before the fix: the button has no id/class for any prior
        // selector to catch, so it survives our render untouched.
        expect(await page.locator('button[title$="on YouTube Music"]').count()).toBe(0);
    });

    test('a native button whose title happens to start with "Search" is left alone', async ({ page }) => {
        // Guards the selector's own specificity: it must anchor on the SUFFIX
        // only, never swallow an unrelated native/other-script button.
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });

        await page.evaluate(() => {
            const btn = document.createElement('button');
            btn.title = 'Search the MusicBrainz database';
            btn.id = 'unrelated-search-btn';
            document.getElementById('content').appendChild(btn);
        });

        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        expect(await page.locator('#unrelated-search-btn').count()).toBe(1);
    });
});
