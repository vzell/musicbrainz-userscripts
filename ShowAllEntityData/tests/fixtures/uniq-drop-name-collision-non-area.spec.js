'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Same page type/header shape area-name-collision.spec.js uses
// (artist-recordings) so pageType detection + headerContainer resolve.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-name-collision-non-area.html');

test('unique-values dropdown: two DIFFERENT recordings sharing a title stay ONE merged "Entity info - Recording name" entry, not split per href', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    // "⊚ All recordings" carries overrideParams (all=1), so
    // startFetchingProcess always re-fetches page 1 over the network rather
    // than reusing the live document — the same real render path
    // uniq-drop-event-cancelled.spec.js exercises for its own page type.
    await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));
    const recordingNameSection = sections.find((s) => s.label === 'Entity info - Recording name');

    expect(recordingNameSection).toBeTruthy();

    // Before the fix (ea666ff's href-split applied unconditionally to every
    // entity type): TWO entries, "Same Recording Title (1)" and
    // "Same Recording Title (2)", each count 1 — exactly the reported
    // work-recordings/"Title" column bug (93 entries for one shared title).
    // After the fix (split scoped to `area` only): ONE flat entry, no
    // "(n)" suffix, matching both recordings.
    expect(recordingNameSection.items).toHaveLength(1);
    expect(recordingNameSection.items[0].label).toContain('Same Recording Title');
    expect(recordingNameSection.items[0].label).not.toMatch(/Same Recording Title \(\d+\)/);
    expect(recordingNameSection.items[0].count).toBe(2);
});
