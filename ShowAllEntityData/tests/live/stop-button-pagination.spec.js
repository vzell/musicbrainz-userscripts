'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, assertGroupedRenderCompleted } = require('../support/liveAssertions');
const { stopAfterPages } = require('../support/stopButton');

// Bruce Springsteen — the same pilot artist used elsewhere in this repo's
// tests/tasks. artist-releasegroups spans 22 native MusicBrainz pages
// (2142 rows when fully fetched, confirmed empirically while writing this
// test) — comfortably more than the n=2 default this test stops at, unlike
// release-group-paginated-fetch.spec.js's own URL, which spans only 2 pages
// (not useful here, since stopping "after 2" wouldn't truncate anything).
const ARTIST_RELEASEGROUPS_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const SHOW_ALL_BUTTON = 'button[data-label="🧮 Artist RGs"]';

// Full unstopped total, for reference/sanity only — real MusicBrainz data
// can grow over time as new release groups are added, so the assertion
// below checks for meaningful truncation (well under this), not an exact
// row or page count (the exact page/row count at stop time is itself
// inherently a race between the click and the in-flight page fetch — see
// stopButton.js's own JSDoc).
const FULL_CATALOGUE_ROW_COUNT_APPROX = 2142;

test('Stop button truncates a paginated fetch after ~2 pages and still renders the partial data', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: ARTIST_RELEASEGROUPS_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();

    await stopAfterPages(page, { n: 2 });

    // assertGroupedRenderCompleted already asserts rowCount > 0 and no
    // page/console errors — a stopped fetch still completes its normal
    // render path with whatever partial data was accumulated (see
    // #mb-stop-btn's style.display = 'none' in every completion branch,
    // asserted separately below).
    const rowCount = await assertGroupedRenderCompleted(page, pageErrors);

    // Real truncation happened — nowhere near the full ~2142-row catalogue.
    expect(rowCount).toBeLessThan(FULL_CATALOGUE_ROW_COUNT_APPROX / 2);

    // The click handler only sets a flag (no in-flight fetch abort — see
    // stopButton.js's own JSDoc), so the script's normal post-loop cleanup
    // still runs, ending with the button hidden again, same as a completed
    // (non-stopped) fetch.
    await expect(page.locator('#mb-stop-btn')).toBeHidden();
});
