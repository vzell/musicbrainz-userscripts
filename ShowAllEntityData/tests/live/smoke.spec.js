'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// Bruce Springsteen — stable, long-lived MBID; used only as a canary that the
// script still initializes against musicbrainz.org's real current markup.
// Run explicitly via `npm run test:live`; not part of the default `npm test`.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/recordings';

// This test deliberately stops at "the toolbar rendered" — it never clicks a
// button. Springsteen's /recordings listing is ~476 native pages; clicking
// "Show all" here would fetch all of them on every `test:live` run. Init-only
// coverage is enough to catch page-type-detection/header-location breakage
// against MusicBrainz's real, current markup. See release-group-fetch.spec.js
// for a live test that actually clicks a button and fetches data, using a
// release-group instead (bounded release count).
test('injects the action-button toolbar on a live musicbrainz.org page', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL });

    const buttons = page.locator('button[data-label]');
    await expect(buttons.first()).toBeVisible({ timeout: 15000 });
});
