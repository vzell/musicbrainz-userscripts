'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, assertGroupedRenderCompleted, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');

// A real release-group — chosen because a release-group's own release list is
// bounded (its editions), unlike an artist's full recordings/releases catalog,
// so actually clicking "Show all" and fetching here is cheap enough to run on
// every `test:live` invocation. Its release list fits on MusicBrainz's own
// single native page (no pagination) — see release-group-paginated-fetch.spec.js
// for the multi-page case.
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/6a118838-5cef-447f-aee4-84dda2eba8ad';

// Unlike the fixture-based tests (tests/fixtures/), this test hits real,
// mutable MusicBrainz data — an editor could add/remove/merge an edition of
// this release-group at any time. Asserting a fixed expected row count or
// exact cell values here would make the test fail on totally unrelated data
// changes, not code regressions. Fixed expected-value assertions belong in
// the fixture-based suite, where the input HTML is fully under our control.
//
// Instead, assertGroupedRenderCompleted() checks invariants that must hold
// regardless of the exact current data — see its own JSDoc for the list.
test('clicks "Show all" and consolidates the release-group\'s release list', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_GROUP_URL });

    const showAllBtn = page.locator('button[data-label="Show all Releases for ReleaseGroup"]');
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();

    await assertGroupedRenderCompleted(page, pageErrors);

    // Sub-tables render collapsed by default — uncollapse all of them via
    // the page's single .mb-master-toggle button, the same way a user would.
    await clickMasterToggleAndExpandAll(page);
});
