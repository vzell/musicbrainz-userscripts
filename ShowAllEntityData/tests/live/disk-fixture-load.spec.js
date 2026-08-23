'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { collectPageErrors } = require('../support/liveAssertions');
const { getPageRowCount, getSubTableRowCounts } = require('../support/filterSortAssertions');

// Same pilot page as the Part 5 filter/sort specs: "Tougher Than the Rest"
// — 7 releases across 2 groups (Official release: 6, Promotion release: 1).
// The fixture below was captured once via `node
// tests/support/capture-fixture.js` (see that script) and is committed to
// git; re-run it if this page's real data ever meaningfully changes.
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'saved-data', 'releasegroup-releases.json.gz');

test('loading a Save-to-disk fixture renders the same data as a live fetch, without re-fetching core rows', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadFromDiskFixture(page, { url: RELEASE_GROUP_URL, fixturePath: FIXTURE_PATH, testMode: true });

    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 30000 });

    const pageCount = await getPageRowCount(page);
    expect(pageCount).toEqual({ filtered: 7, total: 7, absolute: null });

    const subCounts = await getSubTableRowCounts(page);
    expect(subCounts).toEqual([
        { groupLabel: 'Official release', filtered: 6, total: 6 },
        { groupLabel: 'Promotion release', filtered: 1, total: 1 },
    ]);

    expect(await page.locator('table.tbl tbody tr').count()).toBe(7);
    expect(pageErrors).toEqual([]);
});
