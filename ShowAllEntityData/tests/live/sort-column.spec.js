'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForSortSettled, getPageRowCount, getSubTableRowCounts } = require('../support/filterSortAssertions');

// Same pilot page as filter-global.spec.js/filter-column.spec.js: "Tougher
// Than the Rest" — 7 releases across 2 groups (Official release: 6,
// Promotion release: 1).
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';
const SORT_COLUMN = 'Format';

test('sorting a column reorders rows without changing any row count', { tag: '@core' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const before = await getPageRowCount(page);
    const subBefore = await getSubTableRowCounts(page);

    await clickMasterToggleAndExpandAll(page);

    const firstRowBefore = await page.locator('table.tbl tbody tr:visible').first().textContent();

    // Sorting on a multi-table page is scoped to the specific sub-table
    // whose column header was clicked — see makeTableSortableUnified()'s
    // isMultiTable branch. This sorts the FIRST group (subBefore[0]);
    // waitForSortSettled needs that same group's label to poll the right
    // status element (its h3 .mb-sort-status — the page-wide
    // #mb-sort-status-display is never touched for a per-sub-table sort,
    // confirmed empirically: it stayed empty and a wait without
    // subTableHeading timed out).
    const columnTh = page.locator('table.tbl thead th', { hasText: SORT_COLUMN }).first();
    const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
    await waitForSortSettled(page, () => ascendingBtn.click(), { subTableHeading: subBefore[0].groupLabel });

    const after = await getPageRowCount(page);
    const subAfter = await getSubTableRowCounts(page);
    const firstRowAfter = await page.locator('table.tbl tbody tr:visible').first().textContent();

    expect(after).toEqual(before);
    expect(subAfter).toEqual(subBefore);
    expect(firstRowAfter).not.toBe(firstRowBefore);

    expect(pageErrors).toEqual([]);
});
