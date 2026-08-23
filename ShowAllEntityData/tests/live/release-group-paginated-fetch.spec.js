'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, assertGroupedRenderCompleted, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');

// A release-group whose release list spans 2 of MusicBrainz's own native
// pages — exercises startFetchingProcess()'s pagination loop (multiple
// sequential page fetches consolidated into one render), unlike
// release-group-fetch.spec.js's single-page case.
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';

// See release-group-fetch.spec.js for why this asserts self-consistency
// invariants (via assertGroupedRenderCompleted) instead of a fixed expected
// row count — this release-group's real data can change over time.
test('clicks "Show all" and consolidates a 2-page paginated release list', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_GROUP_URL });

    const showAllBtn = page.locator('button[data-label="Show all Releases for ReleaseGroup"]');
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();

    await assertGroupedRenderCompleted(page, pageErrors);

    // Sub-tables render collapsed by default (renderGroupedTable starts every
    // group in the "Show all sub-sections" state). Uncollapse all of them at
    // once via the page's single .mb-master-toggle button, the same way a
    // user would — see clickMasterToggleAndExpandAll()'s JSDoc.
    await clickMasterToggleAndExpandAll(page);
});
