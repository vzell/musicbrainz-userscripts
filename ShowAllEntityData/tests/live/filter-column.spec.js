'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForFilterSettled, getPageRowCount, getSubTableRowCounts } = require('../support/filterSortAssertions');

// Same pilot page as filter-global.spec.js (see its own comment for why):
// "Tougher Than the Rest" — 7 releases, formats include 7"/12" Vinyl (3
// releases total) among Cassette/CD/8cm CD variants, giving a clean,
// deterministic column-filter narrowing target.
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';
const FILTER_COLUMN = 'Format';

test('column filter narrows the page-wide row count and every sub-table sums to it', { tag: '@core' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const before = await getPageRowCount(page);
    expect(before.filtered).toBe(before.total);

    // Sub-tables start collapsed (renderGroupedTable's initial state) — their
    // <thead> (and so the column-filter input) isn't in the layout at all
    // until expanded. Column filter inputs are also readonly-until-a-
    // genuine-trusted-interaction (anti-autofill hardening, see
    // ShowAllEntityData.user.js's _hardenFilterInputAgainstAutofill()) —
    // .click() before typing lifts that, and typing must go through
    // .pressSequentially() (real, trusted per-key events), never .fill()
    // (dispatches an untrusted synthetic 'input' event the script's
    // _isGenuineFilterInputEvent() guard silently discards).
    await clickMasterToggleAndExpandAll(page);

    const colIdx = await page.evaluate((colName) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th')).findIndex((t) => strip(t.textContent) === colName);
    }, FILTER_COLUMN);
    expect(colIdx).toBeGreaterThanOrEqual(0);

    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially('Vinyl'));

    const after = await getPageRowCount(page);
    expect(after.filtered).toBeLessThan(before.total);
    expect(after.filtered).toBeGreaterThan(0);
    expect(after.absolute).toBe(before.total);

    const subAfter = await getSubTableRowCounts(page);
    const subSum = subAfter.reduce((sum, g) => sum + g.filtered, 0);
    expect(subSum).toBe(after.filtered);

    expect(pageErrors).toEqual([]);
});
