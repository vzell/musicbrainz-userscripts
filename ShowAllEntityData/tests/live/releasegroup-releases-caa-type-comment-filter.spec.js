'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPageWithRealNetwork } = require('../support/realNetworkGmXhr');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForCaaEaaComplete } = require('../support/asyncCompletion');
const { getSubTableRowCounts } = require('../support/filterSortAssertions');

/**
 * Reproduces a real, confirmed-live bug on `releasegroup-releases`
 * (tableMode: 'multi'): typing a free-text substring into the CAA column's
 * own filter input that only matches a cover-art image's TYPE/COMMENT text
 * (as opposed to the "yes"/"no" presence sentinel every other CAA-column
 * test on this pageType uses) narrows to ZERO rows — even when a row
 * genuinely has a matching image. `releasegroup-releases-filter-sort.spec.js`
 * already documented this as a known gap (see its own CAA_HIGHLIGHT_FILTER
 * comment: "a typed substring search against it produces ZERO matches and
 * ZERO .mb-column-filter-highlight spans, regardless of column") without a
 * dedicated regression test or root-cause fix — this spec is that.
 *
 * Ground truth (confirmed live via the Cover Art Archive JSON API,
 * 2026-08-31): of this page's 6 "Official release" rows, exactly one —
 * the cassette single (MBID 001af5ba-d4a5-4677-a3ec-601250031fb6) — has CAA
 * images typed "Front"/"Back"/"Spine" with comment "cassette case". The
 * userscript's own `_artBuildSearchText()` renders each image's search text
 * as "{types} {comment}" (space-joined), so this image's search text is
 * literally "Front cassette case" — the filter string "ont cass" below is a
 * substring spanning the type/comment boundary ("Fr[ont cass]ette case"),
 * chosen so a match can only come from that combined per-image text, not
 * from either half alone.
 *
 * Needs REAL CAA network access (this page's cover art actually has to be
 * fetched for the bug to manifest at all) — same `realNetworkGmXhr.js` path
 * as `subtable-filter-sort-caa-interaction.spec.js`, whose "Tougher Than the
 * Rest" pilot page (7 rows: 6 Official + 1 Promotion) this spec reuses.
 */

const RELEASE_GROUP_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';
const OFFICIAL_GROUP_LABEL = 'Official release';
const OFFICIAL_TOTAL = 6;
const CAA_TYPE_COMMENT_FILTER = 'ont cass'; // substring of "Front cassette case"

/**
 * Locates the CAA column's own `data-col-idx` within one specific table
 * (by zero-based `table.tbl` position), rather than the flat
 * cross-table search `filter-column.spec.js` uses — this page has 2
 * sub-tables, so an unscoped search could resolve to the wrong table's
 * own column numbering if their header layouts ever diverged.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} tableIndex
 * @returns {Promise<number>}
 */
async function findCaaColIndex(page, tableIndex) {
    return page.evaluate((idx) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        const table = document.querySelectorAll('table.tbl')[idx];
        if (!table) return -1;
        return Array.from(table.querySelectorAll('thead th')).findIndex((t) => strip(t.textContent) === 'CAA');
    }, tableIndex);
}

test('CAA column filter matches on cover-art image type/comment text (live fetch)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(180000);
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPageWithRealNetwork(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    // Real CAA images must actually finish loading from the network before
    // this bug (or its fix) can be observed at all.
    await waitForCaaEaaComplete(page, { timeout: 60000 });

    await clickMasterToggleAndExpandAll(page);

    const tableIndex = 0; // "Official release" is consistently the first group/table on this page.
    const officialBefore = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === OFFICIAL_GROUP_LABEL);
    expect(officialBefore.total).toBe(OFFICIAL_TOTAL);
    expect(officialBefore.filtered).toBe(OFFICIAL_TOTAL);

    // Uncollapse the CAA column specifically in the "Official release"
    // sub-table (per-table `.mb-caa-col-hdr-btn`, not the global toggle) —
    // matches the task's own repro steps.
    const officialTable = page.locator('table.tbl').nth(tableIndex);
    const caaColHdrBtn = officialTable.locator('thead .mb-caa-col-hdr-btn');
    await expect(caaColHdrBtn).toBeVisible({ timeout: 15000 });
    await caaColHdrBtn.click();
    await expect(caaColHdrBtn).toHaveAttribute('data-caa-col-hdr-state', 'expanded');

    const caaColIdx = await findCaaColIndex(page, tableIndex);
    expect(caaColIdx).toBeGreaterThanOrEqual(0);

    const caaFilterInput = officialTable.locator(`.mb-col-filter-input[data-col-idx="${caaColIdx}"]`);
    await caaFilterInput.click();
    await caaFilterInput.pressSequentially(CAA_TYPE_COMMENT_FILTER);

    // Poll the "Official release" h3's own row-count-stat badge — no
    // precomputed prior value to diff against (this is the very first
    // filter applied), so wait for it to settle on the ground-truth count
    // rather than a fixed delay.
    await page.waitForFunction(({ label, expected }) => {
        const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
        const h3 = h3s.find((h) => h.textContent.includes(label));
        const stat = h3 && h3.querySelector('.mb-row-count-stat');
        if (!stat) return false;
        const m = (stat.textContent || '').trim().match(/^\((\d+)/);
        return m !== null && Number(m[1]) === expected;
    }, { label: OFFICIAL_GROUP_LABEL, expected: 1 }, { timeout: 15000 }).catch(() => {
        // Swallow the timeout here — the assertion below reports the actual
        // (possibly bugged) count with a proper diff instead of a bare
        // waitForFunction timeout.
    });

    const officialAfter = (await getSubTableRowCounts(page)).find((g) => g.groupLabel === OFFICIAL_GROUP_LABEL);
    expect(officialAfter.total).toBe(OFFICIAL_TOTAL);
    expect(officialAfter.filtered, `exactly the one cassette release should match "${CAA_TYPE_COMMENT_FILTER}"`).toBe(1);

    // The one surviving row must genuinely be the cassette release (its CAA
    // cell contains "cassette case" as real, if collapsed-by-CSS, DOM text) —
    // not some unrelated row that happens to survive for the wrong reason.
    const survivingCaaText = await officialTable.locator(`tbody tr td:nth-child(${caaColIdx + 1})`).first().textContent();
    expect(survivingCaaText).toContain('cassette case');

    expect(pageErrors).toEqual([]);
});

/**
 * Regression test for a second, related bug reported alongside the first
 * one (above): on `tableMode: 'multi'` pages, when the CAA column has been
 * EXPLICITLY uncollapsed (every cell showing its full image list) and the
 * user then types into the CAA column's own filter field, every cell
 * silently re-collapses — even the surviving match — discarding the user's
 * explicit choice. Confirmed live this does NOT happen on single-table
 * pages: an already-expanded CAA cell stays expanded through a filter
 * keystroke there.
 *
 * Root cause: on `tableMode: 'multi'` pages EVERY filter/sort re-render
 * clones the source row fresh (see `_artSyncSearchTextToSourceRow()`'s own
 * JSDoc — the clone never carries a real `ul.mb-caa-art-ul`), forcing
 * `_artBuildMultiRowArtCell()`'s FIRST-BUILD branch on every single
 * keystroke. That branch used to hardcode the new cell to collapsed,
 * ignoring `expandedCells` (the same rowIdx:colIdx map the regular
 * multi-row-cell wiring already consults, and that CAA's own click handler
 * in `ensureCollapseDelegate()` already populates on every expand/collapse
 * — including the ones fired by "uncollapse all" clicking through every
 * `[data-caa-expand-btn]`). Single-table pages never hit this: their clone
 * already carries the fully-built `<ul>` (from the always-connected,
 * already-enriched source row), so it takes the REBUILD branch instead,
 * which already restored `wasExpanded` from the clone's own live DOM state.
 * Fixed by making the FIRST-BUILD branch consult `expandedCells` too.
 */
test('an explicitly-expanded CAA cell stays expanded after typing a matching filter (live fetch)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(180000);
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPageWithRealNetwork(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });
    await waitForCaaEaaComplete(page, { timeout: 60000 });
    await clickMasterToggleAndExpandAll(page);

    const tableIndex = 0;
    const officialTable = page.locator('table.tbl').nth(tableIndex);

    // Explicitly uncollapse EVERY CAA cell in this sub-table — matches the
    // reported repro exactly (this is the state the user says must survive
    // typing into the filter).
    const caaColHdrBtn = officialTable.locator('thead .mb-caa-col-hdr-btn');
    await expect(caaColHdrBtn).toBeVisible({ timeout: 15000 });
    await caaColHdrBtn.click();
    await expect(caaColHdrBtn).toHaveAttribute('data-caa-col-hdr-state', 'expanded');

    const caaColIdx = await findCaaColIndex(page, tableIndex);
    expect(caaColIdx).toBeGreaterThanOrEqual(0);

    // Every row's own toggle must genuinely be 'expanded' before we type —
    // otherwise the assertion below would trivially pass for the wrong
    // reason (nothing to preserve).
    const allExpandBtnsBefore = officialTable.locator(`tbody tr td:nth-child(${caaColIdx + 1}) [data-caa-expand-btn]`);
    await expect(allExpandBtnsBefore).toHaveCount(OFFICIAL_TOTAL);
    for (let i = 0; i < OFFICIAL_TOTAL; i++) {
        await expect(allExpandBtnsBefore.nth(i)).toHaveAttribute('data-caa-expand-btn', 'expanded');
    }

    const caaFilterInput = officialTable.locator(`.mb-col-filter-input[data-col-idx="${caaColIdx}"]`);
    await caaFilterInput.click();
    await caaFilterInput.pressSequentially(CAA_TYPE_COMMENT_FILTER);

    await page.waitForFunction(({ label, expected }) => {
        const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
        const h3 = h3s.find((h) => h.textContent.includes(label));
        const stat = h3 && h3.querySelector('.mb-row-count-stat');
        if (!stat) return false;
        const m = (stat.textContent || '').trim().match(/^\((\d+)/);
        return m !== null && Number(m[1]) === expected;
    }, { label: OFFICIAL_GROUP_LABEL, expected: 1 }, { timeout: 15000 });

    // The surviving row's CAA cell rebuild is asynchronous — wait for it to
    // settle before reading its expand state / highlight.
    await waitForCaaEaaComplete(page, { timeout: 60000 });

    const survivingRow = officialTable.locator('tbody tr').first();
    const expandBtn = survivingRow.locator(`td:nth-child(${caaColIdx + 1}) [data-caa-expand-btn]`);
    await expect(expandBtn).toBeVisible();

    // This is the reported bug: the cell must stay expanded — the user
    // never collapsed it — not silently reset to collapsed.
    await expect(expandBtn).toHaveAttribute('data-caa-expand-btn', 'expanded');

    // Since the cell never collapsed, the highlighted match must already be
    // visible without any further click.
    const highlightSpans = survivingRow.locator(`td:nth-child(${caaColIdx + 1}) .mb-column-filter-highlight`);
    await expect(highlightSpans.first()).toBeVisible();

    expect(pageErrors).toEqual([]);
});

/**
 * Companion coverage for the DEFAULT (never explicitly expanded) case: a
 * CAA cell that starts collapsed and stays collapsed through a matching
 * type/comment filter must still get the `[data-caa-expand-btn]` toggle
 * stamped with `.mb-collapse-toggle-has-match` (the yellow "there's a match
 * hidden in here" cue), so expanding it reveals the highlighted text —
 * exactly like the single-table case already does.
 *
 * This mechanism (`_artHighlightArtCell()` → `_syncCollapseHasMatchInTable()`
 * in ShowAllEntityData.user.js) already existed and needed no production
 * fix of its own — it simply never got a chance to run before the sibling
 * spec's row-matching bug was fixed (the cassette row never matched at all,
 * so there was no rendered row/cell for it to act on). This test is
 * permanent regression coverage for that now-reachable behavior.
 */
test('collapsed CAA cell shows the "has hidden match" indicator after a type/comment filter (live fetch)', { tag: '@extended' }, async ({ page }) => {
    test.setTimeout(180000);
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPageWithRealNetwork(page, { url: RELEASE_GROUP_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });
    await waitForCaaEaaComplete(page, { timeout: 60000 });
    await clickMasterToggleAndExpandAll(page);

    const tableIndex = 0;
    const officialTable = page.locator('table.tbl').nth(tableIndex);

    // Deliberately do NOT uncollapse the CAA column here — every cell
    // starts in its natural default-collapsed state.
    const caaColIdx = await findCaaColIndex(page, tableIndex);
    expect(caaColIdx).toBeGreaterThanOrEqual(0);

    const caaFilterInput = officialTable.locator(`.mb-col-filter-input[data-col-idx="${caaColIdx}"]`);
    await caaFilterInput.click();
    await caaFilterInput.pressSequentially(CAA_TYPE_COMMENT_FILTER);

    await page.waitForFunction(({ label, expected }) => {
        const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
        const h3 = h3s.find((h) => h.textContent.includes(label));
        const stat = h3 && h3.querySelector('.mb-row-count-stat');
        if (!stat) return false;
        const m = (stat.textContent || '').trim().match(/^\((\d+)/);
        return m !== null && Number(m[1]) === expected;
    }, { label: OFFICIAL_GROUP_LABEL, expected: 1 }, { timeout: 15000 });

    // The surviving row's CAA cell rebuild — which applies both the
    // highlight and the has-match indicator — is asynchronous; wait for it
    // to settle before reading either.
    await waitForCaaEaaComplete(page, { timeout: 60000 });

    const survivingRow = officialTable.locator('tbody tr').first();
    const expandBtn = survivingRow.locator(`td:nth-child(${caaColIdx + 1}) [data-caa-expand-btn]`);
    await expect(expandBtn).toBeVisible();
    await expect(expandBtn).toHaveAttribute('data-caa-expand-btn', 'collapsed');
    await expect(expandBtn).toHaveClass(/mb-collapse-toggle-has-match/);

    // Expanding reveals the actual highlighted match — mirrors the
    // single-table case's own working behavior.
    await expandBtn.click();
    await expect(expandBtn).toHaveAttribute('data-caa-expand-btn', 'expanded');
    const highlightSpans = survivingRow.locator(`td:nth-child(${caaColIdx + 1}) .mb-column-filter-highlight`);
    await expect(highlightSpans.first()).toBeVisible();

    expect(pageErrors).toEqual([]);
});
