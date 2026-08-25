'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForFilterSettled, getPageRowCount, getSubTableRowCounts } = require('../support/filterSortAssertions');

// "Tougher Than the Rest" (Bruce Springsteen release-group) — a small,
// stable, two-group multi-table page: 7 releases total, 1 "Tunnel of Love
// Express..." release and 6 "Tougher Than the Rest" format variants (7"/12"
// Vinyl, Cassette, CD x2, 8cm CD). "Tunnel" appears in exactly one release's
// title, giving a clean, deterministic narrowing target unrelated to live
// MusicBrainz data drift (title text, unlike row counts, doesn't change).
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';

test('global filter narrows the page-wide row count and every sub-table sums to it', { tag: '@core' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const before = await getPageRowCount(page);
    expect(before.filtered).toBe(before.total);
    expect(before.total).toBeGreaterThan(1);

    const globalInput = page.locator('#mb-global-filter-input');
    await globalInput.click();
    await waitForFilterSettled(page, () => globalInput.pressSequentially('Tunnel'));

    const after = await getPageRowCount(page);
    expect(after.filtered).toBeLessThan(before.total);
    expect(after.filtered).toBeGreaterThan(0);
    // The absolute (pre-filter) total is preserved in the 3rd tier once a
    // filter narrows the count below the page's own unfiltered total.
    expect(after.absolute).toBe(before.total);

    const subAfter = await getSubTableRowCounts(page);
    const subSum = subAfter.reduce((sum, g) => sum + g.filtered, 0);
    expect(subSum).toBe(after.filtered);

    expect(pageErrors).toEqual([]);
});
