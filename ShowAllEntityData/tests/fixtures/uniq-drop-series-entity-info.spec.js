'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Regression: `/series/{mbid}` was absent from `_ENTITY_TYPE_GLYPH`, so
// `_findCellEntityRefs()` silently returned nothing for every series link —
// the "Series subscriptions" table's own "Name" column never surfaced an
// "Entity info - Series name"/"- Comment" section despite carrying real
// disambiguation comments (see debug/user-subscriptions-artist.html, e.g.
// "3CD (Sony Music)").
const URL = 'https://musicbrainz.org/user/vzell/subscriptions/artist';
const FIXTURE_FILE = path.join(__dirname, 'user-subscriptions-series-entity-info.html');

test('unique-values dropdown: "Series subscriptions" Name column gets an "Entity info - Series name"/"- Comment" section', async ({ page }) => {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
    // Clicking "Series subscriptions" fetches a DIFFERENT URL (…/subscriptions/series,
    // via the button's own virtualPath) than the one loadUserscriptPage()
    // already routed above — serve the same fixture there too.
    await page.route('**/subscriptions/series**', (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="🧮 Series subscriptions"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));
    expect(sections).toBeTruthy();

    const nameSection = sections.find((s) => s.label === 'Entity info - Series name');
    expect(nameSection).toBeTruthy();
    const nameByLabel = Object.fromEntries(nameSection.items.map((i) => [i.label, i.count]));
    // Non-bare (carries a disambiguation comment) — surfaced.
    expect(nameByLabel['» series name: 3CD']).toBe(1);
    // Bare (the cell's ENTIRE content is just this name, no comment) —
    // deliberately absent: the plain value list already covers it 1:1 (see
    // _findCellEntityCommentParts()'s own "bare entities are dropped
    // entirely" JSDoc).
    expect(nameByLabel['» series name: Complete Recordings']).toBeUndefined();

    const commentSection = sections.find((s) => s.label === 'Entity info - Comment');
    expect(commentSection).toBeTruthy();
    const commentByLabel = Object.fromEntries(commentSection.items.map((i) => [i.label, i.count]));
    expect(commentByLabel['» comment: Sony Music']).toBe(1);
});
