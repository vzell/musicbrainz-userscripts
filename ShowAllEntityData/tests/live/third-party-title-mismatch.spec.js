'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { seedGmValues } = require('../support/gmStubs');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');
const { collectPageErrors } = require('../support/liveAssertions');

// "Born to Run" — the same release-tracks pilot page used elsewhere in this
// repo. Its Title column (data-col-name="Title") is exactly what
// ShowAllEntityData.user.js's _titleHasRecNameMismatch() gates on
// (isTitleCol checks the column name is literally "Title").
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Tracks for Release"]';

test('detects a jesus2099-style title/recording-name mismatch marker on the Title column', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await seedGmValues(page, { sa_enable_release_tracks: true });
    await loadUserscriptPage(page, { url: RELEASE_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    // Simulate jesus2099's marker landing on exactly one track's Title
    // cell AFTER our own render has already completed — matches how this
    // actually happens with a real third-party script running later (its
    // own @run-at timing, or its own async comparison logic).
    await injectThirdPartyScript(page, 'jesus2099-title-mismatch', {
        config: { columnName: 'Title', rowIndices: [0] },
    });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Title'));
    // NOT the "Structure" section — 'title-mismatch' gets its own dedicated
    // section via MB_UNIQ_MODE_TO_SECTION, confirmed live rather than
    // assumed (see debug/NOTES-equivalent investigation for this task).
    const flagsSection = sections.find((s) => s.label === 'Flags - Title mismatch');
    expect(flagsSection).toBeTruthy();

    const mismatchEntry = flagsSection.items.find((i) => i.label === '≠ track/recording name');
    expect(mismatchEntry).toBeTruthy();
    expect(mismatchEntry.count).toBe(1);

    expect(pageErrors).toEqual([]);
});
