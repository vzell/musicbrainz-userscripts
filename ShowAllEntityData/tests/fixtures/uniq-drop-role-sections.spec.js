'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// place-events' "Artists" column (a `.artist-roles-container` /
// `ul.artist-roles` list — shape 1 of _findCellArtistRoles(), the exact
// shape the original bug report screenshot showed on a place's own /events
// page) feeds BOTH the 'role' kind ("Entity info - Role (combined)" section,
// exact combined-credit string) and the 'roletoken' kind ("Entity info -
// Role" section, comma-decomposed atomic words, OR-matching). This fixture
// exercises both from the SAME two rows to pin their distinct semantics: one
// artist credited "(composer, lyricist)" (a single combined string, no "/"
// to split on) and another credited just "(composer)" — so the decomposed
// "composer" token appears on BOTH rows while the combined string does not.
const PLACE_EVENTS_URL = 'https://musicbrainz.org/place/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'place-events-roles.html');

test('unique-values dropdown: "Artists" column gets separate "Entity info - Role (combined)" and "Entity info - Role" sections', async ({ page }) => {
    await loadUserscriptPage(page, { url: PLACE_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    await page.click('button[data-label="Show all Events for Place"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Artists'));
    expect(sections).toBeTruthy();

    // "Entity info - Role (combined)" (the 'role' kind, SYN_SECTION_META's
    // `roles` entry) — one entry PER distinct whole credited-role string;
    // "composer, lyricist" stays one combined entry (no "/" to split on).
    const combinedSection = sections.find((s) => s.label === 'Entity info - Role (combined)');
    expect(combinedSection).toBeTruthy();
    const combinedByLabel = Object.fromEntries(combinedSection.items.map((i) => [i.label, i.count]));
    expect(combinedByLabel['» role: composer, lyricist']).toBe(1);
    expect(combinedByLabel['» role: composer']).toBe(1);
    expect(combinedByLabel['» role: lyricist']).toBeUndefined();

    // "Entity info - Role" (the 'roletoken' kind, SYN_SECTION_META's
    // `entityRole` entry) — one entry per ATOMIC role word, OR-matching: the
    // decomposed "composer" token counts BOTH rows (it appears in the
    // combined "composer, lyricist" row AND the standalone "composer" row).
    const decomposedSection = sections.find((s) => s.label === 'Entity info - Role');
    expect(decomposedSection).toBeTruthy();
    const decomposedByLabel = Object.fromEntries(decomposedSection.items.map((i) => [i.label, i.count]));
    expect(decomposedByLabel['» role: composer']).toBe(2);
    expect(decomposedByLabel['» role: lyricist']).toBe(1);
    expect(decomposedByLabel['» role: composer, lyricist']).toBeUndefined();

    // No stray "Roles" section (the pre-fix label) should remain.
    expect(sections.some((s) => s.label === 'Roles')).toBe(false);
});
