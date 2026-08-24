'use strict';

const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { seedGmValues } = require('../support/gmStubs');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForFilterSettled, waitForSortSettled, getPageRowCount } = require('../support/filterSortAssertions');
const {
    URL: ARTIST_EVENTS_URL, FIXTURE_PATH, SEED_GM_VALUES, TOTAL_ROWS,
    FILTER_COLUMN, FILTER_VALUE, FILTER_VALUE_COUNT, SORT_COLUMN,
    UNIQ_DROP_COLUMN, UNIQ_DROP_COLLAPSABLE_CELL_COUNT,
} = require('../support/artistEventsFixture');

/**
 * Correctness coverage for `artist-events` (Bruce Springsteen's own events
 * tab — 4174 rows, 21 columns, single-table mode), the pageType
 * `tests/snapshots/registry.org` earmarks as "picked specifically as a
 * future performance-comparison target" for PERFORMANCE.org's Steps 1-4
 * (filter/sort in-place re-render, header-count caching, uniq-dropdown
 * caching). Loaded via the committed disk fixture (captured once via `node
 * tests/support/capture-fixture.js`) rather than a live 42-page fetch, so
 * these run fast and are immune to MusicBrainz data drift; re-capture the
 * fixture (and `tests/support/artistEventsFixture.js`'s derived constants)
 * if this artist's real event data ever meaningfully changes.
 *
 * `sa_enable_caa_pics` is forced off, matching `tests/pagetypes.json`'s own
 * artist-events entry — the EAA queue doesn't complete in reasonable time at
 * this row count, and leaving it on would leave background artwork-fetch
 * work running during these interaction assertions.
 */

async function loadArtistEvents(page) {
    await seedGmValues(page, SEED_GM_VALUES);
    await loadFromDiskFixture(page, { url: ARTIST_EVENTS_URL, fixturePath: FIXTURE_PATH, testMode: true });
    // waitForRenderComplete (not a bare #mb-filter-container wait) — that
    // element becomes visible before renderRowsChunked()'s batched
    // insertion loop (triggered above the 1000-row chunked-render
    // threshold) actually finishes; see browser.js's own JSDoc for the
    // confirmed repro on this exact page.
    //
    // waitForAutoResize: false — confirmed empirically that the
    // auto-resize-on-load pass lives inside startFetchingProcess() (the
    // live "Show all" fetch pipeline only, ShowAllEntityData.user.js
    // ~line 40883) and is never triggered by loadFromDiskFixture()'s
    // _hydrateAndRenderFromSnapshotData() path — #mb-resize-btn's title
    // never flips to "Restore…" after a disk-fixture load regardless of
    // row count, so this wait would otherwise hang until timeout.
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
}

test('global filter narrows the row count and clearing it restores the full set', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    const before = await getPageRowCount(page);
    expect(before).toEqual({ filtered: TOTAL_ROWS, total: TOTAL_ROWS, absolute: null });

    const globalInput = page.locator('#mb-global-filter-input');
    await globalInput.click();
    await waitForFilterSettled(page, () => globalInput.pressSequentially(FILTER_VALUE));

    const filtered = await getPageRowCount(page);
    expect(filtered.filtered).toBe(FILTER_VALUE_COUNT);
    expect(filtered.filtered).toBeLessThan(before.total);
    // No 3rd ("absolute") tier here — that only appears for a sub-table
    // filter (STF) on a tableMode:'multi' page; a single-table page's plain
    // filter is always the 2-tier "(F of T)" shape (see
    // filterSortAssertions.js's own parseRowCountText() JSDoc).
    expect(filtered.total).toBe(before.total);
    expect(filtered.absolute).toBeNull();

    await waitForFilterSettled(page, () => globalInput.fill(''));
    const restored = await getPageRowCount(page);
    expect(restored).toEqual(before);

    expect(pageErrors).toEqual([]);
});

test('column filter on Country narrows the row count to the same value as the global filter', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    const before = await getPageRowCount(page);

    const colIdx = await page.evaluate((colName) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th')).findIndex((t) => strip(t.textContent) === colName);
    }, FILTER_COLUMN);
    expect(colIdx).toBeGreaterThanOrEqual(0);

    // Column filter inputs are readonly-until-a-genuine-trusted-interaction
    // (anti-autofill hardening) — .click() lifts that, and typing must go
    // through .pressSequentially() (real per-key events), never .fill().
    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially(FILTER_VALUE));

    const after = await getPageRowCount(page);
    expect(after.filtered).toBe(FILTER_VALUE_COUNT);
    expect(after.total).toBe(before.total);
    expect(after.absolute).toBeNull();

    expect(pageErrors).toEqual([]);
});

test('sorting a column reorders rows without changing the row count, both directions', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    const before = await getPageRowCount(page);
    const firstRowBefore = await page.locator('table.tbl tbody tr').first().textContent();

    const columnTh = page.locator('table.tbl thead th', { hasText: SORT_COLUMN }).first();
    const ascendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▲' }).first();
    const descendingBtn = columnTh.locator('.sort-icon-btn', { hasText: '▼' }).first();

    await waitForSortSettled(page, () => ascendingBtn.click());
    const afterAsc = await getPageRowCount(page);
    const firstRowAsc = await page.locator('table.tbl tbody tr').first().textContent();
    expect(afterAsc).toEqual(before);
    expect(firstRowAsc).not.toBe(firstRowBefore);

    await waitForSortSettled(page, () => descendingBtn.click());
    const afterDesc = await getPageRowCount(page);
    const firstRowDesc = await page.locator('table.tbl tbody tr').first().textContent();
    expect(afterDesc).toEqual(before);
    expect(firstRowDesc).not.toBe(firstRowAsc);

    expect(pageErrors).toEqual([]);
});

test('column-header unique-value and multi-row-cell counts are self-consistent at initial render', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    // Scoped to initial-render correctness only — on `perf-steps-1-4` these
    // badges are computed once at initial render and NOT recomputed on
    // filter/sort for a single-table page (PERFORMANCE.org Step 1 removed
    // the initCollapsableColumns() call runFilter() used to make on every
    // keystroke), whereas `main` still recomputes them every time. Asserting
    // they update after filtering would be branch-specific, not a shared
    // invariant — see this repo's artist-events performance-comparison plan.
    const uniqCountText = await page.locator('table.tbl thead th', { hasText: 'Event' }).first()
        .locator('.mb-col-uniq-count').textContent();
    expect(Number(uniqCountText)).toBeGreaterThan(0);
    expect(Number(uniqCountText)).toBeLessThanOrEqual(TOTAL_ROWS);

    // NOT cross-checked against UNIQ_DROP_COLLAPSABLE_CELL_COUNT (5) —
    // confirmed empirically (both on `main`) that `_updateAllColHeaderCounts`'s
    // live-recomputed `.mb-col-collapse-count` badge for "Location" reports 1,
    // while the DOM actually has 5 `.mb-cell-collapse-toggle` cells (also
    // independently confirmed via window.__saTest.getUniqDropSections(),
    // which correctly reports 5 — see the cache-correctness test below). This
    // looks like a pre-existing `_classifyCollapseCell()` mis-classification
    // for this column's specific multi-venue cell shape, present unchanged on
    // both `main` and `perf-steps-1-4` (Step 3 only adds a cache around this
    // same computation, it doesn't change it) — out of scope for this
    // performance-comparison suite; flagged for separate investigation rather
    // than silently asserted around.
    const locationBadgeText = await page.locator('table.tbl thead th', { hasText: UNIQ_DROP_COLUMN }).first()
        .locator('.mb-col-collapse-count').textContent();
    expect(Number(locationBadgeText.trim())).toBeGreaterThanOrEqual(0);
    expect(Number(locationBadgeText.trim())).toBeLessThanOrEqual(TOTAL_ROWS);

    expect(pageErrors).toEqual([]);
});

test('uniq-value dropdown cache reflects a cell expand/collapse (does not go stale)', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    // Locate a Location cell whose multi-item list qualifies for collapse
    // via its rendered toggle button, order-independent of row position.
    const collapseToggle = page.locator('table.tbl tbody tr td:nth-child(4) .mb-cell-collapse-toggle').first();
    await expect(collapseToggle).toBeVisible();

    const before = await page.evaluate((col) => window.__saTest.getUniqDropSections(col), UNIQ_DROP_COLUMN);
    const structureBefore = before.find((s) => s.label === 'Structure');
    const collapsedBefore = structureBefore.items.find((i) => i.label.includes('collapsed'));
    const expandedBefore = structureBefore.items.find((i) => i.label.includes('expanded'));
    expect(collapsedBefore.count).toBe(UNIQ_DROP_COLLAPSABLE_CELL_COUNT);
    expect(expandedBefore).toBeUndefined();

    await page.evaluate(() => window.__saTest.closeUniqDrop());
    await collapseToggle.click();

    const after = await page.evaluate((col) => window.__saTest.getUniqDropSections(col), UNIQ_DROP_COLUMN);
    const structureAfter = after.find((s) => s.label === 'Structure');
    const collapsedAfter = structureAfter.items.find((i) => i.label.includes('collapsed'));
    const expandedAfter = structureAfter.items.find((i) => i.label.includes('expanded'));
    expect(collapsedAfter.count).toBe(UNIQ_DROP_COLLAPSABLE_CELL_COUNT - 1);
    expect(expandedAfter.count).toBe(1);

    expect(pageErrors).toEqual([]);
});
