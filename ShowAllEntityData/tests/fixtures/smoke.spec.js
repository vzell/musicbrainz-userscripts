'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// The URL a real musicbrainz.org "artist recordings" page would have —
// must match the `artist-recordings` pageDefinitions entry's regex
// (`/artist/[a-f0-9-]{36}/recordings/?$`) so page-type detection fires
// exactly as it would live, even though the response is served locally.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'artist-recordings.html');

test('injects the action-button toolbar on a matched entity page', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE });

    // artist-recordings declares 3 buttons: All recordings / Standalone / Video.
    const buttons = page.locator('button[data-label]');
    await expect(buttons).toHaveCount(3);
    await expect(buttons.first()).toBeVisible();
});
