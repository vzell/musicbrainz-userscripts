'use strict';

const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { seedGmValues } = require('../support/gmStubs');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');
const {
    waitForFilterSettled, waitForSortSettled, getPageRowCount,
    waitForActualRowCount, waitForColHeaderUniqCount,
} = require('../support/filterSortAssertions');
const {
    URL: ARTIST_EVENTS_URL, FIXTURE_PATH, SEED_GM_VALUES, TOTAL_ROWS,
    FILTER_COLUMN, FILTER_VALUE, FILTER_VALUE_COUNT, SORT_COLUMN,
    UNIQ_DROP_COLUMN, UNIQ_DROP_COLLAPSABLE_CELL_COUNT,
    UNIQ_COUNT_COLUMN, UNIQ_COUNT_TOTAL,
    UNIQ_COUNT_FILTER_VALUE, UNIQ_COUNT_FILTER_ROWS, UNIQ_COUNT_FILTER_UNIQ,
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

/**
 * Resolves a column's zero-based index from its decoration-stripped header text
 * — the value the column-filter inputs carry in `data-col-idx`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @returns {Promise<number>}
 */
function columnIndex(page, colName) {
    return page.evaluate((name) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((t) => strip(t.textContent) === name);
    }, colName);
}

/**
 * One column's ✕ clear button.
 *
 * Scoped through the enclosing `.mb-col-filter-wrapper` rather than indexed with
 * `.nth(colIdx)`: `addColumnFilterRow()` gives a checkbox column a bare `<th>`
 * with no input and no ✕ at all, so the ✕ list is not index-aligned with the
 * column list.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} colIdx
 * @returns {import('@playwright/test').Locator}
 */
function columnFilterClear(page, colIdx) {
    return page.locator(
        `table.tbl thead .mb-col-filter-wrapper:has(.mb-col-filter-input[data-col-idx="${colIdx}"]) .mb-col-filter-clear`
    ).first();
}

/**
 * The `.mb-col-collapse-count` badge (visible multi-row cells, shown inside the
 * ▶N▤/▼N▤ button) in one column's header.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @returns {import('@playwright/test').Locator}
 */
function collapseBadge(page, colName) {
    return page.locator('table.tbl thead th', { hasText: colName }).first()
        .locator('.mb-col-collapse-count');
}

test('global filter narrows the row count and clearing it restores the full set', { tag: '@perf' }, async ({ page }) => {
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

test('column filter on Country narrows the row count to the same value as the global filter', { tag: '@perf' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    const before = await getPageRowCount(page);

    const colIdx = await columnIndex(page, FILTER_COLUMN);
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

test('sorting a column reorders rows without changing the row count, both directions', { tag: '@perf' }, async ({ page }) => {
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

test('column-header unique-value and multi-row-cell counts cover the whole table at initial render', { tag: '@perf' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    // Exact values, not a `> 0 && <= TOTAL_ROWS` range. The range assertions
    // this replaced were written around a real bug, since fixed: `runFilter()`
    // did not await its own chunked `renderFinalTable()`, so the deferred
    // `_updateAllColHeaderCounts()` scan ran against whatever prefix of the
    // tbody had been appended (a multiple of the 500-row chunk size) and both
    // badges reported a fraction of the table. A disk-fixture load reaches this
    // code through that same `runFilter()` (see `_hydrateAndRenderFromSnapshot
    // Data`'s deliberate "initCollapsableColumns() is NOT called here" note), so
    // "initial render" here is exactly the affected path.
    //
    // waitForColHeaderUniqCount, not a bare read: the scan is scheduled behind
    // the render AND sliced one event-loop turn per column, so it legitimately
    // completes after every other "render done" signal on the page.
    await waitForColHeaderUniqCount(page, UNIQ_COUNT_COLUMN, UNIQ_COUNT_TOTAL);

    // Now cross-checked against UNIQ_DROP_COLLAPSABLE_CELL_COUNT (5), which an
    // earlier revision of this test explicitly refused to do: this badge read 1
    // here, and that was blamed on a `_classifyCollapseCell()` mis-classification
    // of Location's multi-venue cell shape. It was not. `openUniqDrop()` and
    // `_updateAllColHeaderCounts()` call the SAME `_classifyCollapseCell()` over
    // the SAME `tbody.rows` and cannot disagree on identical input — they
    // disagreed on WHEN they ran, the dropdown scanning the finished table and
    // the badge a 500-row prefix of it. The live-fetch baseline
    // (tests/snapshots/artist-events/rendered.html, the one render path that
    // always awaited its render) recorded the correct 5 all along.
    await expect(collapseBadge(page, UNIQ_DROP_COLUMN))
        .toHaveText(String(UNIQ_DROP_COLLAPSABLE_CELL_COUNT));

    expect(pageErrors).toEqual([]);
});

test('column-header counts survive a chunked re-render (column filter applied, then cleared)', { tag: '@perf' }, async ({ page }) => {
    // The originally-reported bug, end to end. Applying a narrow filter drops
    // the table below sa_chunked_render_threshold (1000), so that render takes
    // renderFinalTable()'s fully synchronous fast path and always looked
    // correct; CLEARING it goes back over the threshold and re-enters the
    // chunked path, which is where the counts used to freeze at a multiple of
    // the 500-row chunk size.
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);

    await waitForColHeaderUniqCount(page, UNIQ_COUNT_COLUMN, UNIQ_COUNT_TOTAL);

    const colIdx = await columnIndex(page, UNIQ_COUNT_COLUMN);
    expect(colIdx).toBeGreaterThanOrEqual(0);

    // .click() then .pressSequentially() — column filter inputs are
    // readonly-until-a-genuine-trusted-interaction (anti-autofill hardening),
    // and .fill() is rejected by _isGenuineFilterInputEvent().
    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially(UNIQ_COUNT_FILTER_VALUE));

    const filtered = await getPageRowCount(page);
    expect(filtered.filtered).toBe(UNIQ_COUNT_FILTER_ROWS);
    expect(filtered.total).toBe(TOTAL_ROWS);
    await waitForColHeaderUniqCount(page, UNIQ_COUNT_COLUMN, UNIQ_COUNT_FILTER_UNIQ);

    // The per-column ✕ clears the value, re-focuses the input and calls
    // runFilter() immediately — undebounced, unlike typing.
    await columnFilterClear(page, colIdx).click();

    // Three separate completion signals, in strictly increasing strength:
    // status text settles first, the real row count catches up after it, and
    // the header badges after that.
    await waitForActualRowCount(page, TOTAL_ROWS);
    await waitForColHeaderUniqCount(page, UNIQ_COUNT_COLUMN, UNIQ_COUNT_TOTAL);
    await expect(collapseBadge(page, UNIQ_DROP_COLUMN))
        .toHaveText(String(UNIQ_DROP_COLLAPSABLE_CELL_COUNT));

    const restored = await getPageRowCount(page);
    expect(restored).toEqual({ filtered: TOTAL_ROWS, total: TOTAL_ROWS, absolute: null });

    expect(pageErrors).toEqual([]);
});

test('every row keeps its row-level decoration through a chunked re-render', { tag: '@perf' }, async ({ page }) => {
    // The collateral the header badges alone would not catch. The badges were
    // the visible symptom, but the same un-awaited chunked render starved
    // runFilter()'s ENTIRE post-render hook chain, so after a filter-clear the
    // rows past the first 500-row chunk got none of it.
    //
    // The sticky first column is the sharpest witness, because it is applied to
    // EVERY row (unlike collapse toggles, of which this page has only 33, all of
    // which happen to fall inside the first chunk). Re-capturing
    // tests/snapshots/artist-events/post-sort.html on the fix measured
    // `.mb-sticky-col` going from 502 occurrences to 4176 — i.e. before the fix,
    // scrolling past row ~500 after a sort or filter-clear showed no sticky
    // column at all.
    const pageErrors = collectPageErrors(page);
    await loadArtistEvents(page);
    await waitForColHeaderUniqCount(page, UNIQ_COUNT_COLUMN, UNIQ_COUNT_TOTAL);

    const stickyBefore = await page.locator('table.tbl tbody td.mb-sticky-col').count();
    expect(stickyBefore).toBe(TOTAL_ROWS);
    const togglesBefore = await page.locator('table.tbl tbody .mb-cell-collapse-toggle').count();
    expect(togglesBefore).toBeGreaterThan(0);

    const colIdx = await columnIndex(page, UNIQ_COUNT_COLUMN);
    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially(UNIQ_COUNT_FILTER_VALUE));
    await waitForActualRowCount(page, UNIQ_COUNT_FILTER_ROWS);

    await columnFilterClear(page, colIdx).click();
    await waitForActualRowCount(page, TOTAL_ROWS);
    await waitForColHeaderUniqCount(page, UNIQ_COUNT_COLUMN, UNIQ_COUNT_TOTAL);

    expect(await page.locator('table.tbl tbody td.mb-sticky-col').count()).toBe(TOTAL_ROWS);
    expect(await page.locator('table.tbl tbody .mb-cell-collapse-toggle').count())
        .toBe(togglesBefore);

    expect(pageErrors).toEqual([]);
});

test('uniq-value dropdown cache reflects a cell expand/collapse (does not go stale)', { tag: '@perf' }, async ({ page }) => {
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
