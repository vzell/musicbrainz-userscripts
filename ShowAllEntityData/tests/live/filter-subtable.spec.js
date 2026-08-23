'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForSubTableFilterSettled, getPageRowCount, getSubTableRowCounts } = require('../support/filterSortAssertions');

// Same pilot page as the other filter/sort specs: "Tougher Than the Rest"
// — 7 releases across 2 groups. The "Official release" group (6 releases,
// all "Tougher Than the Rest" format variants) contains 2 Vinyl releases
// among its Cassette/CD/8cm-CD siblings, giving a deterministic
// Sub-Table-Filter (STF) narrowing target scoped to that one group only.
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';

test('sub-table filter narrows only its own group, leaving sibling groups untouched', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const subBefore = await getSubTableRowCounts(page);
    expect(subBefore.length).toBeGreaterThanOrEqual(2);
    const targetGroupLabel = subBefore[0].groupLabel;
    const siblingGroupLabel = subBefore[1].groupLabel;

    // The STF row lives in the h3 header (not inside the collapsed
    // <table>), so no expand-all is needed here — only the 🔍 toggle to
    // reveal it. The REAL row-filter input is the type="search" one
    // (id="mb-stf-<Category with spaces replaced by underscores>-input");
    // `.mb-subtable-filter-container input[type="text"]` — the selector an
    // earlier draft of this test used — instead matches a DIFFERENT,
    // nested input: a "quick filter both lists" search box inside the
    // group's own filter-HISTORY dropdown panel (hidden until its own
    // "History" button is clicked), confirmed by dumping the container's
    // outerHTML live. Scoping by type="search" avoids needing to replicate
    // the id's own space-to-underscore sanitization rule.
    const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: targetGroupLabel }).first();
    await targetH3.locator('.mb-subtable-filter-toggle-icon').click();
    const stfInput = targetH3.locator('.mb-subtable-filter-container input[type="search"]');
    await stfInput.click();

    // STF has no dedicated status-message element (unlike the global/column
    // filters' #mb-filter-status-display or sort's .mb-sort-status) —
    // confirmed empirically, there's nothing there to poll. Its own group's
    // h3 .mb-row-count-stat text is the only visible completion signal.
    await waitForSubTableFilterSettled(page, () => stfInput.pressSequentially('Vinyl'), { subTableHeading: targetGroupLabel });

    const subAfter = await getSubTableRowCounts(page);
    const targetAfter = subAfter.find((g) => g.groupLabel === targetGroupLabel);
    const siblingAfter = subAfter.find((g) => g.groupLabel === siblingGroupLabel);
    const siblingBefore = subBefore.find((g) => g.groupLabel === siblingGroupLabel);

    expect(targetAfter.filtered).toBeLessThan(subBefore[0].total);
    expect(targetAfter.filtered).toBeGreaterThan(0);
    expect(targetAfter.total).toBe(subBefore[0].total);

    // Sibling group is completely unaffected by a filter scoped to a
    // different group.
    expect(siblingAfter).toEqual(siblingBefore);

    // Page-level total reflects the sum of every group's own filtered count.
    const pageAfter = await getPageRowCount(page);
    const subSum = subAfter.reduce((sum, g) => sum + g.filtered, 0);
    expect(pageAfter.filtered).toBe(subSum);

    expect(pageErrors).toEqual([]);
});
