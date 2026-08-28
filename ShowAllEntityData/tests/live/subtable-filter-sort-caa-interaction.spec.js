'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const {
    waitForSubTableFilterSettled,
    waitForSortSettled,
    getSubTableRowCounts,
} = require('../support/filterSortAssertions');

/**
 * Reproduces (and, once the corresponding production fix lands, guards
 * against a regression of) the three bugs described in
 * debug/multi-table-sort-filter-bug.org: on a `tableMode: 'multi'` page, a
 * per-sub-table filter (STF — the 🔍 box in each `<h3>` sub-section)
 * interacts badly with sorting and with its own clear button.
 *
 * Needs REAL CAA network access (per the .org file's explicit "fetch real
 * images from the CAA network" requirement) — the standard
 * `loadUserscriptPage()` + `gmStubs.js` path always fakes GM_xmlhttpRequest
 * as a 404, which would make the CAA bigbox/badge assertions below
 * meaningless (an always-empty strip narrows "correctly" for the wrong
 * reason). This is the only live spec using
 * `realNetworkGmXhr.js`'s real-network passthrough instead of the standard
 * always-404 stub — see that module's JSDoc.
 */

// Same pilot page as filter-subtable.spec.js/sort-column.spec.js/
// idb-cache-hit-bigbox.spec.js: "Tougher Than the Rest" — 7 releases across
// 2 groups. "Official release" (6 releases: Cassette/CD/8cm-CD/Vinyl
// variants) is consistently the first group on this page (relied on by
// sort-column.spec.js's own `subBefore[0]` assumption too), giving a
// deterministic STF narrowing target ("cd" -> 3 of 6, matching the .org
// file's own repro exactly).
const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';
const SORT_COLUMN = 'Label';

/**
 * Reads a table's CAA bigbox/badge state directly by its zero-based
 * position among `table.tbl` elements (matches `ctx.btnPrefix`/`boxPrefix`
 * + '-' + tableIndex — see CAA_CTX in ShowAllEntityData.user.js).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} tableIndex
 * @returns {Promise<{badge: number|null, totalWrappers: number, visibleWrappers: number}>}
 */
async function getCaaTableStats(page, tableIndex) {
    return page.evaluate((idx) => {
        const badge = document.querySelector(`#mb-caa-toggle-btn-${idx} .mb-caa-toggle-count`);
        const box = document.getElementById(`mb-caa-bigbox-${idx}`);
        const wrappers = box ? Array.from(box.querySelectorAll('a[data-caa-href]')) : [];
        const visibleWrappers = wrappers.filter((w) => w.style.display !== 'none').length;
        return {
            badge: badge ? Number(badge.textContent) : null,
            totalWrappers: wrappers.length,
            visibleWrappers,
        };
    }, tableIndex);
}

/**
 * Reads the global CAA badge count (`#mb-caa-toggle-btn-global`) — by
 * design a page-wide, filter-agnostic total (confirmed by the .org file's
 * own step-3 description) that must NOT change as a sub-table's STF
 * narrows/widens or gets sorted.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number|null>}
 */
async function getGlobalCaaBadge(page) {
    return page.evaluate(() => {
        const badge = document.querySelector('#mb-caa-toggle-btn-global .mb-caa-toggle-count');
        return badge ? Number(badge.textContent) : null;
    });
}

/**
 * Polls `getGlobalCaaBadge()` until it reads the same value on two
 * consecutive checks. `waitForCaaEaaComplete()`'s "queue idle" signal can
 * fire a hair before the very last image's `load` handler has finished
 * incrementing the badge (a real, independent async race against a live
 * network — not something under test here), so a single read right after it
 * resolves is not a safe baseline.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeoutMs?: number, pollMs?: number }} [opts]
 * @returns {Promise<number|null>}
 */
async function waitForStableGlobalCaaBadge(page, { timeoutMs = 15000, pollMs = 300 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last = await getGlobalCaaBadge(page);
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const current = await getGlobalCaaBadge(page);
        if (current === last) return current;
        last = current;
    }
    return last;
}

/**
 * Counts `.mb-subtable-filter-highlight` spans and `[data-mb-stf-hidden]`
 * rows inside the table at `tableIndex` — the two DOM markers STF filtering
 * leaves behind (see `applySubFilter()`/`clearSubFilter()` in
 * ShowAllEntityData.user.js).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} tableIndex
 * @returns {Promise<{highlightSpans: number, hiddenRows: number}>}
 */
async function getStfDomMarkers(page, tableIndex) {
    return page.evaluate((idx) => {
        const table = document.querySelectorAll('table.tbl')[idx];
        if (!table) return { highlightSpans: 0, hiddenRows: 0 };
        return {
            highlightSpans: table.querySelectorAll('.mb-subtable-filter-highlight').length,
            hiddenRows: table.querySelectorAll('tbody tr[data-mb-stf-hidden]').length,
        };
    }, tableIndex);
}

/**
 * Shared setup: loads the page with real CAA network access, clicks "Show
 * all", expands every sub-section, uncollapses all CAA bigbox strips (via
 * the global toggle button, matching the .org file's own repro step 2), and
 * waits for the initial CAA fetch to settle.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{targetGroupLabel: string}>} the "Official release" group's label
 */
async function setupExpandedPageWithCaaVisible(page) {
    await loadUserscriptPageWithRealNetwork(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    await waitForCaaEaaComplete(page, { timeout: 60000 });

    await clickMasterToggleAndExpandAll(page);

    const subBefore = await getSubTableRowCounts(page);
    expect(subBefore.length).toBeGreaterThanOrEqual(2);
    const targetGroupLabel = subBefore[0].groupLabel;

    // Uncollapse every CAA bigbox strip (sa_caa_pics_initially_collapsed
    // defaults to true) — matches the .org repro's "toggle #mb-caa-toggle-btn-global
    // to show all CAA images on all sections" step.
    const globalCaaBtn = page.locator('#mb-caa-toggle-btn-global');
    await expect(globalCaaBtn).toBeVisible({ timeout: 15000 });
    await globalCaaBtn.click();

    return { targetGroupLabel };
}

test.describe('multi-table sub-table-filter / sort / CAA interaction (debug/multi-table-sort-filter-bug.org)', { tag: '@extended' }, () => {
    test('CAA stripe/badge stay narrowed to the STF-filtered subset after a sort', async ({ page }) => {
        const pageErrors = collectPageErrors(page);

        const { targetGroupLabel } = await setupExpandedPageWithCaaVisible(page);
        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: targetGroupLabel }).first();
        const tableIndex = 0; // "Official release" is consistently the first group/table on this page.

        const globalBadgeBaseline = await waitForStableGlobalCaaBadge(page);

        // ── Apply the STF filter ────────────────────────────────────────────
        await targetH3.locator('.mb-subtable-filter-toggle-icon').click();
        const stfInput = targetH3.locator('.mb-subtable-filter-container input[type="search"]');
        await stfInput.click();
        await waitForSubTableFilterSettled(page, () => stfInput.pressSequentially('cd'), { subTableHeading: targetGroupLabel });

        const subAfterFilter = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === targetGroupLabel);
        expect(subAfterFilter.filtered).toBe(3);
        expect(subAfterFilter.total).toBe(6);

        const markersAfterFilter = await getStfDomMarkers(page, tableIndex);
        expect(markersAfterFilter.highlightSpans).toBeGreaterThan(0);
        expect(markersAfterFilter.hiddenRows).toBe(3);

        const caaAfterFilter = await getCaaTableStats(page, tableIndex);
        expect(caaAfterFilter.visibleWrappers).toBe(3);
        expect(caaAfterFilter.badge).toBe(3);
        expect(await waitForStableGlobalCaaBadge(page)).toBe(globalBadgeBaseline);

        // ── Sort a column while the STF filter is still active ─────────────
        const columnTh = page.locator('table.tbl thead th', { hasText: SORT_COLUMN }).first();
        const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => ascendingBtn.click(), { subTableHeading: targetGroupLabel });

        // A sort re-triggers the CAA/EAA rebuild pass — wait for its queue to
        // settle again before reading badge/stripe state, so the assertions
        // below reflect the fix's/bug's actual settled end-state rather than
        // an in-flight image-load race.
        await waitForCaaEaaComplete(page, { timeout: 60000 });

        // Row count and highlighting must stay correct across a sort — this
        // is the .org file's own explicit invariant, and was NOT part of the
        // reported bug.
        const subAfterSort = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === targetGroupLabel);
        expect(subAfterSort.filtered).toBe(3);
        expect(subAfterSort.total).toBe(6);
        const markersAfterSort = await getStfDomMarkers(page, tableIndex);
        expect(markersAfterSort.highlightSpans).toBeGreaterThan(0);

        // This is the reported bug: the CAA bigbox/badge should stay
        // narrowed to the 3 STF-filtered rows, not revert to all 6.
        const caaAfterSort = await getCaaTableStats(page, tableIndex);
        expect(caaAfterSort.visibleWrappers).toBe(3);
        expect(caaAfterSort.badge).toBe(3);

        // The global badge is a page-wide, filter-agnostic total — must
        // never move, before or after the sort.
        expect(await waitForStableGlobalCaaBadge(page)).toBe(globalBadgeBaseline);

        expect(pageErrors).toEqual([]);
    });

    test('clearing the STF filter after a sort actually restores every row', async ({ page }) => {
        const pageErrors = collectPageErrors(page);

        const { targetGroupLabel } = await setupExpandedPageWithCaaVisible(page);
        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: targetGroupLabel }).first();
        const tableIndex = 0;

        const globalBadgeBaseline = await waitForStableGlobalCaaBadge(page);

        await targetH3.locator('.mb-subtable-filter-toggle-icon').click();
        const stfInput = targetH3.locator('.mb-subtable-filter-container input[type="search"]');
        await stfInput.click();
        await waitForSubTableFilterSettled(page, () => stfInput.pressSequentially('cd'), { subTableHeading: targetGroupLabel });

        const columnTh = page.locator('table.tbl thead th', { hasText: SORT_COLUMN }).first();
        const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => ascendingBtn.click(), { subTableHeading: targetGroupLabel });
        await waitForCaaEaaComplete(page, { timeout: 60000 });

        // ── Clear the STF filter ────────────────────────────────────────────
        const clearStfBtn = targetH3.locator('button[id^="mb-stf-"][id$="-clear"]');
        await expect(clearStfBtn).toBeVisible();
        await waitForSubTableFilterSettled(page, () => clearStfBtn.click(), { subTableHeading: targetGroupLabel });
        await waitForCaaEaaComplete(page, { timeout: 60000 });

        // This is the reported bug: all of this should be back to the full,
        // unfiltered state, with no way today to get there once a sort has
        // happened in between filtering and clearing.
        await expect(stfInput).toHaveValue('');

        const subAfterClear = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === targetGroupLabel);
        expect(subAfterClear.filtered).toBe(6);
        expect(subAfterClear.total).toBe(6);

        const markersAfterClear = await getStfDomMarkers(page, tableIndex);
        expect(markersAfterClear.highlightSpans).toBe(0);
        expect(markersAfterClear.hiddenRows).toBe(0);

        const caaAfterClear = await getCaaTableStats(page, tableIndex);
        expect(caaAfterClear.visibleWrappers).toBe(6);
        expect(caaAfterClear.badge).toBe(6);

        expect(await waitForStableGlobalCaaBadge(page)).toBe(globalBadgeBaseline);

        expect(pageErrors).toEqual([]);
    });

    test('h3 "Clear all filters" button appears while only the STF filter is active', async ({ page }) => {
        const pageErrors = collectPageErrors(page);

        const { targetGroupLabel } = await setupExpandedPageWithCaaVisible(page);
        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: targetGroupLabel }).first();
        const clearAllBtn = targetH3.locator('.mb-subtable-clear-btn');

        // No filter active yet — the button should be hidden.
        await expect(clearAllBtn).toBeHidden();

        await targetH3.locator('.mb-subtable-filter-toggle-icon').click();
        const stfInput = targetH3.locator('.mb-subtable-filter-container input[type="search"]');
        await stfInput.click();
        await waitForSubTableFilterSettled(page, () => stfInput.pressSequentially('cd'), { subTableHeading: targetGroupLabel });

        // This is the reported bug: with only the STF filter active (no
        // column filter), this button never appears — its visibility check
        // looks up the STF input via a selector that can never match it
        // (`input[type="text"]` vs. the real input's `type="search"`).
        await expect(clearAllBtn).toBeVisible();

        expect(pageErrors).toEqual([]);
    });
});
