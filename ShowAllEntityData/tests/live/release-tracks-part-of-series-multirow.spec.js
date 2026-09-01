'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// Same release-tracks pilot page used by third-party-title-mismatch.spec.js,
// third-party-rogue-filter-write.spec.js, release-tracks-streaming-ars-leak.spec.js,
// and column-visibility-survives-refilter.spec.js — "Born to Run" has several
// tracks whose "part of:" AR credits 2-3 distinct series, comma/"and"-joined
// in one native <dd> (e.g. "Thunder Road": Helsingin Sanomat: 100 maailman
// parasta laulua (number: 27), Rolling Stone: 500 Greatest Songs of All Time
// (number: 86) and Rolling Stone: 500 Greatest Songs of All Time: 2021
// edition (number: 111) — see debug/r-final.html).
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Tracks for Release"]';

/**
 * Reads the current table's header row and returns { name -> columnIndex }.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, number>>}
 */
async function getHeaderIndex(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const map = {};
        ths.forEach((th, i) => {
            const name = th.textContent.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹​]/g, '').trim();
            if (!(name in map)) map[name] = i;
        });
        return map;
    });
}

// Regression test: before this fix, a track crediting more than one series
// (comma/"and"-joined `<span class="serieslink">` markers within a single
// native `<dd>`) rendered "Part of series" as ONE unsplit <li> — the whole
// blob, separators and all, glued into a single row. `PEER_SPLIT_KINDS` now
// includes `series` (alongside artist/label/recording), so
// `_buildKindSplitListTd()` segments each `<dd>` on its own `serieslink`
// markers, the same way it already did for multi-artist/multi-label credits.
test('a "part of:" AR crediting multiple series splits into one <li> per series, not one unsplit blob', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const headerIndex = await getHeaderIndex(page);
    expect(headerIndex['Part of series']).toBeGreaterThanOrEqual(0);

    const colIdx = headerIndex['Part of series'];
    const cells = await page.evaluate((idx) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        return rows.map((row) => {
            const td = row.cells[idx];
            if (!td) return null;
            const lis = Array.from(td.querySelectorAll(':scope > ul > li'));
            return {
                liCount: lis.length,
                liTexts: lis.map((li) => li.textContent.trim()),
                liSeriesLinkCounts: lis.map((li) => li.querySelectorAll('a[href^="/series/"]').length),
                toggleText: td.querySelector('.mb-cell-collapse-toggle')?.textContent.trim() || null,
            };
        }).filter(Boolean);
    }, colIdx);

    // At least one track on this release credits more than one series in a
    // single "part of:" AR — this is the multi-row shape under test.
    const multiRow = cells.find((c) => c.liCount >= 2);
    expect(multiRow, 'expected at least one "Part of series" cell with 2+ split series').toBeTruthy();

    // Each split <li> is exactly ONE series: the shared marker-based
    // segmentation must never leave two serieslink markers (i.e. two
    // distinct series) fused into a single row, and never leave a
    // leftover ", "/" and " separator glued to the front/back of a row's
    // text (the exact bug this fix addresses).
    multiRow.liSeriesLinkCounts.forEach((n) => expect(n).toBe(1));
    multiRow.liTexts.forEach((text) => {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/^(,|and)\b/i);
        expect(text).not.toMatch(/(,|and)\s*$/i);
    });

    // A 2+ item list cell is a "multi-row" cell — initCollapsableColumns()
    // auto-detects it via _findCellListItems() and attaches a
    // ".mb-cell-collapse-toggle" showing the item count (see
    // collapsableColumns' "List cells" behavior in CLAUDE.md).
    expect(multiRow.toggleText).toContain(String(multiRow.liCount));

    expect(pageErrors).toEqual([]);
});
