'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, assertGroupedRenderCompleted } = require('../support/liveAssertions');
const { waitForSortSettled, getSubTableRowCounts } = require('../support/filterSortAssertions');

/**
 * Reproduces three bugs found while manually verifying the discography-view
 * feature (artist-releasegroups' "Complete/Official/Non-Official/Complete
 * (merged) Discography" buttons) on a real page:
 *
 *  - Test A: sorting a column, then switching views, should keep every
 *    visual sort indicator (header tint, glyph highlight, body zebra
 *    striping, sort-status text) exactly as persistent as the row order
 *    already correctly is.
 *  - Test B: switching to a view where nothing auto-expands (this pilot
 *    artist's "Non-Official Discography" has no "Album" category) must
 *    keep the master toggle button's label in sync with reality, and
 *    clicking it must never unhide sub-tables that belong to a
 *    currently-filtered-out view.
 *  - Test C: a genuinely view-specific state (an active sub-table filter)
 *    must still correctly reset on a view switch — a regression guard
 *    proving Test A's fix doesn't overshoot into preserving things that
 *    should reset.
 */

// Simon & Garfunkel — user-provided pilot artist for this feature: only 123
// rows (85 with inline CAA thumbnails) across all sub-tables/views combined,
// small enough for a routine live spec (unlike stop-button-pagination.spec.js's
// 2142-row Bruce Springsteen pilot, picked there specifically for its size).
// Crucially, this artist's "Non-Official Discography" view has no "Album"
// category — the condition that exposes Test B's bug.
const ARTIST_URL = 'https://musicbrainz.org/artist/5d02f264-e225-41ff-83f7-d9b1f0b1874a?all=1&va=0';
const SHOW_ALL_BUTTON = 'button[data-label="🧮 Artist RGs"]';

/**
 * Loads the page, clicks "🧮 Artist RGs", waits for the consolidated
 * multi-table render, then normalizes every sub-table to a known,
 * fully-expanded state by clicking the master toggle twice (hide, then
 * show) — needed because `sa_auto_expand` may have already auto-expanded
 * the "Album"/official category on the very first render, so a single
 * click's direction isn't predictable up front.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} pageErrors
 * @returns {Promise<{ masterToggle: import('@playwright/test').Locator, h3Count: number }>}
 */
async function loadAndExpandAll(page, pageErrors) {
    await loadUserscriptPage(page, { url: ARTIST_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await assertGroupedRenderCompleted(page, pageErrors, { timeout: 90000 });

    const masterToggle = page.locator('.mb-master-toggle');
    await expect(masterToggle).toBeVisible();
    await masterToggle.click();
    await masterToggle.click();
    await expect(masterToggle).toHaveAttribute('data-state', 'expanded');

    const h3Count = await page.locator('h3.mb-toggle-h3').count();
    expect(h3Count).toBeGreaterThanOrEqual(2);

    return { masterToggle, h3Count };
}

/**
 * Computes what the master toggle's `data-state` SHOULD be, purely from
 * live DOM visibility — the same computation `renderGroupedTable()`'s own
 * (currently first-render-only) resync block does, generalized to run at
 * any point. A `table.tbl` whose owning h3 is currently filtered out by the
 * discography view (`data-mb-disc-hidden="true"`) doesn't count.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<'expanded'|'collapsed'>}
 */
async function getActualMasterToggleState(page) {
    return page.evaluate(() => {
        const findOwningH3 = (table) => {
            let prev = table.previousElementSibling;
            while (prev && (prev.classList.contains('mb-caa-bigbox') || prev.classList.contains('mb-eaa-bigbox'))) {
                prev = prev.previousElementSibling;
            }
            return prev && prev.classList.contains('mb-toggle-h3') ? prev : null;
        };
        const anyVisible = Array.from(document.querySelectorAll('table.tbl')).some((t) => {
            const h3 = findOwningH3(t);
            if (h3 && h3.dataset.mbDiscHidden === 'true') return false;
            return t.style.display !== 'none';
        });
        return anyVisible ? 'expanded' : 'collapsed';
    });
}

/**
 * Counts how many currently-view-hidden sub-tables (`h3[data-mb-disc-hidden="true"]`)
 * have had their OWN table's `display:none` incorrectly stripped — the
 * master-toggle leak bug. Should always be 0.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function getHiddenViewTableLeakCount(page) {
    return page.evaluate(() => {
        const hiddenH3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3[data-mb-disc-hidden="true"]'));
        return hiddenH3s.filter((h3) => {
            let w = h3.nextElementSibling;
            while (w && (w.classList.contains('mb-caa-bigbox') || w.classList.contains('mb-eaa-bigbox'))) {
                w = w.nextElementSibling;
            }
            return w && w.classList.contains('tbl') && w.style.display !== 'none';
        }).length;
    });
}

test.describe('discography view (artist-releasegroups): sort persistence, master-toggle sync/leak', { tag: '@extended' }, () => {
    test('sort visuals (header tint, glyph highlight, zebra striping, status text) persist across a view switch', async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        await loadAndExpandAll(page, pageErrors);

        // Sort the first sub-table's "Title" column ascending — every
        // release-group sub-table on this pageType shares this column, and
        // it's the one carrying inline CAA thumbnails (addCAA: 'Title'),
        // so this also sanity-checks nothing about inline art breaks with a
        // persisted sort.
        const subBefore = await getSubTableRowCounts(page);
        const targetLabel = subBefore[0].groupLabel;
        const table = page.locator('table.tbl').nth(0);
        const th = table.locator('thead tr:first-child th', { hasText: 'Title' }).first();
        const ascBtn = th.locator('.sort-icon-btn', { hasText: '▲' }).first();
        const colIndex = await th.evaluate((el) => Array.from(el.parentElement.children).indexOf(el));

        await waitForSortSettled(page, () => ascBtn.click(), { subTableHeading: targetLabel });

        // ── Baseline: confirm the sort actually applied all four visuals ──
        await expect(th).toHaveClass(/mb-mscol-hdr-\d/);
        await expect(ascBtn).toHaveClass(/sort-icon-active/);
        // Identity via the row's own title link href (an MBID URL) rather than
        // full textContent — the row also carries async CAA/relationship-icon
        // content that can still be settling in the background, independent of
        // the sort/view-switch, and would otherwise make this comparison flaky.
        const firstRowIdBefore = await table.locator('tbody tr').first().locator('a').first().getAttribute('href');
        const bodyCellBefore = table.locator('tbody tr').first().locator('td').nth(colIndex);
        await expect(bodyCellBefore).toHaveClass(/mb-mscol-\d/);
        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: targetLabel }).first();
        const statusTextBefore = (await targetH3.locator('.mb-sort-status').textContent() || '').trim();
        expect(statusTextBefore.length).toBeGreaterThan(0);

        // ── Switch view ──────────────────────────────────────────────────
        const officialBtn = page.locator('#mb-disc-official-btn');
        await expect(officialBtn).toBeVisible({ timeout: 30000 });
        await officialBtn.click();

        // ── All five must persist unchanged ────────────────────────────
        await expect(th).toHaveClass(/mb-mscol-hdr-\d/);
        await expect(ascBtn).toHaveClass(/sort-icon-active/);
        const firstRowIdAfter = await table.locator('tbody tr').first().locator('a').first().getAttribute('href');
        expect(firstRowIdAfter).toBe(firstRowIdBefore);
        const bodyCellAfter = table.locator('tbody tr').first().locator('td').nth(colIndex);
        await expect(bodyCellAfter).toHaveClass(/mb-mscol-\d/);
        const statusTextAfter = (await targetH3.locator('.mb-sort-status').textContent() || '').trim();
        expect(statusTextAfter).toBe(statusTextBefore);

        expect(pageErrors).toEqual([]);
    });

    test('master toggle stays synced and never leaks hidden-view sections after a view switch', async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        const { masterToggle } = await loadAndExpandAll(page, pageErrors);

        // Mirror the user's own repro: visit Official Discography first
        // (which auto-expands its "Album" category) before Non-Official
        // (which this pilot artist has none of) — this is what leaves the
        // master toggle in a stale "expanded" state.
        const officialBtn = page.locator('#mb-disc-official-btn');
        await expect(officialBtn).toBeVisible({ timeout: 30000 });
        await officialBtn.click();
        await masterToggle.click();
        await masterToggle.click();
        await expect(masterToggle).toHaveAttribute('data-state', 'expanded');

        const nonOfficialBtn = page.locator('#mb-disc-nonofficial-btn');
        await expect(nonOfficialBtn).toBeVisible({ timeout: 30000 });
        await nonOfficialBtn.click();

        // ── Bug (a): button state must match actual DOM visibility ──────
        const reportedState = await masterToggle.getAttribute('data-state');
        const actualState = await getActualMasterToggleState(page);
        expect(reportedState).toBe(actualState);

        // Sanity: no hidden-view leak yet, before any click.
        expect(await getHiddenViewTableLeakCount(page)).toBe(0);

        // ── Bug (b): clicking it must never unhide the other view's tables ──
        await masterToggle.click();
        expect(await getHiddenViewTableLeakCount(page)).toBe(0);

        // Regression guard: the non-official section's own reported total
        // must not have inflated from leaked official rows.
        const nonOfficialH2Count = await page.locator('h2 .mb-row-count-stat').first().textContent();
        const parsed = (nonOfficialH2Count || '').match(/\((\d+)/);
        expect(parsed).not.toBeNull();
        expect(Number(parsed[1])).toBeLessThan(50);

        expect(pageErrors).toEqual([]);
    });

    test('an active sub-table filter still correctly resets on a view switch', async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        await loadAndExpandAll(page, pageErrors);

        const subBefore = await getSubTableRowCounts(page);
        const targetLabel = subBefore[0].groupLabel;
        const targetH3 = page.locator('h3.mb-toggle-h3', { hasText: targetLabel }).first();

        await targetH3.locator('.mb-subtable-filter-toggle-icon').click();
        const stfInput = targetH3.locator('.mb-subtable-filter-container input[type="search"]');
        await stfInput.click();
        // Not using waitForSubTableFilterSettled here: it requires the row-count
        // text to visibly change, but the target sub-table may have only 1 row
        // that still matches "a" (count stays the same). Highlighting appearing
        // is a reliable, count-independent signal that the debounced apply ran.
        await stfInput.pressSequentially('a');
        await expect(page.locator('.mb-subtable-filter-highlight').first()).toBeVisible({ timeout: 15000 });

        const officialBtn = page.locator('#mb-disc-official-btn');
        await expect(officialBtn).toBeVisible({ timeout: 30000 });
        await officialBtn.click();

        // Genuinely view-specific state must still reset.
        await expect(stfInput).toHaveValue('');
        const highlightCount = await page.locator('.mb-subtable-filter-highlight').count();
        expect(highlightCount).toBe(0);

        expect(pageErrors).toEqual([]);
    });

    test('body zebra striping (not just header tint) survives switching through the merged view', async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        await loadAndExpandAll(page, pageErrors);

        // Positional index is stable across every discography view — view
        // switches only toggle h3/table `display`, never reorder DOM elements
        // — so `.nth(albumIdx)` keeps pointing at the same "Album" table
        // throughout this whole test regardless of which view is active.
        const subCounts = await getSubTableRowCounts(page);
        const albumIdx = subCounts.findIndex((g) => g.groupLabel === 'Album');
        expect(albumIdx).toBeGreaterThanOrEqual(0);
        const albumLabel = subCounts[albumIdx].groupLabel;
        const albumTable = page.locator('table.tbl').nth(albumIdx);

        const th = albumTable.locator('thead tr:first-child th', { hasText: 'Artist' }).first();
        const ascBtn = th.locator('.sort-icon-btn', { hasText: '▲' }).first();
        const colIndex = await th.evaluate((el) => Array.from(el.parentElement.children).indexOf(el));
        const bodyCell = () => albumTable.locator('tbody tr').first().locator('td').nth(colIndex);

        await waitForSortSettled(page, () => ascBtn.click(), { subTableHeading: albumLabel });
        await expect(bodyCell()).toHaveClass(/mb-mscol-\d/);

        const completeBtn = page.locator('#mb-disc-complete-btn');
        const officialBtn = page.locator('#mb-disc-official-btn');
        const mergedBtn   = page.locator('#mb-disc-merged-btn');
        await expect(officialBtn).toBeVisible({ timeout: 30000 });
        await expect(mergedBtn).toBeVisible({ timeout: 30000 });

        // b) Official Discography
        await officialBtn.click();
        await expect(bodyCell()).toHaveClass(/mb-mscol-\d/);

        // c) back to Complete Discography
        await completeBtn.click();
        await expect(bodyCell()).toHaveClass(/mb-mscol-\d/);

        // d) Complete Discography (merged) — the merged-combining row insertion
        // is a separate code path from renderGroupedTable()'s own reuse-branch
        // tint-reapply, so this is where zebra striping was lost before the fix.
        await mergedBtn.click();
        await expect(bodyCell()).toHaveClass(/mb-mscol-\d/);

        // e) back to Complete Discography — the "restore from merged" pre-pass
        // is a third, separate insertion code path; before the fix this stayed
        // un-tinted even though (c) (the same view, reached differently) worked.
        await completeBtn.click();
        await expect(bodyCell()).toHaveClass(/mb-mscol-\d/);

        // f) Official Discography again — already worked before the fix (by
        // this point the "restore from merged" flag is already cleared, so
        // the standard, already-correct render path is what's visible) —
        // asserted here as a regression guard.
        await officialBtn.click();
        await expect(bodyCell()).toHaveClass(/mb-mscol-\d/);

        expect(pageErrors).toEqual([]);
    });
});
