'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Same page type/header shape smoke.spec.js/area-name-collision.spec.js use
// (artist-recordings) so pageType detection + headerContainer resolve.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'artist-recordings.html');

test.describe('ColumnDataExtractor.video() centers the synthetic "Video" column cell', () => {
    test('a cell with the video-indicator icon gets text-align:center and keeps the icon + "video" sort key', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const result = await page.evaluate(() => window.__saTest.extractVideo('#video-src-cell'));

        // Regression: before the fix, tdVideo had no text-align at all, so
        // the icon rendered left-aligned/pinned to the column's left edge
        // instead of centered — see the reported bug on
        // https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201.
        expect(result.textAlign).toBe('center');
        expect(result.hasVideoIcon).toBe(true);
        expect(result.sortKey).toBe('video');
    });

    test('a cell with no video-indicator icon still gets text-align:center and the "audio" sort key', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const result = await page.evaluate(() => window.__saTest.extractVideo('#audio-src-cell'));

        expect(result.textAlign).toBe('center');
        expect(result.hasVideoIcon).toBe(false);
        expect(result.sortKey).toBe('audio');
    });
});
