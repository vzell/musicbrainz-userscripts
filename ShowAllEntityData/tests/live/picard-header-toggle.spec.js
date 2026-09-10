'use strict';

// The Picard column's ▶♪/▼♪ header toggle, against real musicbrainz.org pages
// in both table modes:
//
//   multi  — release-group/c497fc44-… , the page org/picard.org names for
//            manual verification (Part 1's bug was found on it)
//   single — series/aa3694d3-… (`series-releases`), one table, real releases
//
// tests/fixtures/picard-cells-survive-rerender.spec.js and
// tests/fixtures/search-recordings-continuation.spec.js already pin the whole
// mechanism offline, and they are the regression gate. This spec exists for the
// one thing a fixture cannot answer: whether the toggle behaves on pages neither
// captured nor curated for it — real column counts, real sub-table shapes, real
// third-party-free MusicBrainz markup.
//
// *The single-table page is NOT release/3ec14d03-… , which org/picard.org
// named.* That is a release TRACKLIST, and it has no Picard column at all: the
// column's guard is data-driven ("does this tbody link a /release/<mbid>") and a
// tracklist's rows link RECORDINGS. Verified against the live page — 0 Picard
// columns — so the plan's suggestion was about the ⏱ Length toggle's precedent
// rather than about Picard being present there. `series-releases` is the
// single-table page that does have the column, and its committed baseline
// (tests/snapshots/series-releases/rendered.html) is the reason we know.
//
// Deliberately narrow: presence, per-table scope, and that a press builds and a
// second press empties. Nothing here asserts a button COUNT against MusicBrainz
// data, which drifts — the counts are always compared to that page's own rows.
//
// @extended rather than @core: this is a pageType-specific feature, not a
// shared mechanism.

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RG_MULTI = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const SERIES_SINGLE = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';

/**
 * Per-table Picard state, read straight from the rendered DOM.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{expanded: boolean, buttons: number, cells: number,
 *                          rows: number, headerOwnText: string,
 *                          rowsWithBadCellCount: number}>>}
 */
const readPicard = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl'))
        .filter((t) => t.querySelector('thead th.mb-picard-th'))
        .map((table) => {
            const btn = table.querySelector('thead .mb-picard-col-hdr-btn');
            const th = table.querySelector('thead tr:first-child th.mb-picard-th');
            const headerCells = table.querySelectorAll('thead tr:first-child th').length;
            const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
            return {
                expanded: !!btn && btn.getAttribute('aria-pressed') === 'true',
                buttons: table.querySelectorAll('td.mb-picard-cell button.mb-picard-btn').length,
                cells: table.querySelectorAll('tbody td.mb-picard-cell').length,
                rows: bodyRows.length,
                headerOwnText: Array.from(th.childNodes)
                    .filter((n) => n.nodeType === Node.TEXT_NODE)
                    .map((n) => n.textContent).join(''),
                rowsWithBadCellCount: bodyRows.filter((r) => r.cells.length !== headerCells).length,
            };
        }));

test('@extended release-group (multi): the Picard toggle is per sub-table on a real page', async ({ page }) => {
    test.setTimeout(180000);
    await loadUserscriptPage(page, { url: RG_MULTI, testMode: true });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const before = await readPicard(page);
    // The page has to actually have the column, or the rest proves nothing.
    expect(before.length, 'sub-tables carrying a Picard column').toBeGreaterThan(1);
    for (const t of before) {
        expect(t.rows, 'rows in a Picard sub-table').toBeGreaterThan(0);
        expect(t.cells, 'one Picard cell per row').toBe(t.rows);
        expect(t.buttons, 'ships collapsed — no ♪ buttons').toBe(0);
        expect(t.expanded).toBe(false);
        // The invariant the CSS-only glyph protects, on real markup.
        expect(t.headerOwnText).toBe('Picard');
        expect(t.rowsWithBadCellCount, 'a collapsed column moves no column index').toBe(0);
    }

    // Sub-sections may render collapsed; a header span inside a display:none
    // table is a 0×0 element Playwright will never click. Drive the master
    // toggle only if something is actually hidden — a blind click on a page
    // that renders EXPANDED would collapse everything and the run would then
    // report clean zeros for the wrong reason.
    if (await page.locator('table.tbl').first().isHidden()) {
        await page.locator('.mb-master-toggle').first().click();
    }

    const toggles = page.locator('table.tbl thead .mb-picard-col-hdr-btn');
    await expect(toggles.first()).toBeVisible({ timeout: 30000 });

    await toggles.first().click();
    await expect(toggles.first()).toHaveAttribute('aria-pressed', 'true');

    const oneOpen = await readPicard(page);
    // Every row of a release listing links its own release, so one ♪ per row.
    expect(oneOpen[0].buttons, 'the pressed sub-table built its buttons').toBe(oneOpen[0].rows);
    expect(oneOpen.slice(1).map((t) => t.buttons), 'every other sub-table untouched')
        .toEqual(oneOpen.slice(1).map(() => 0));
    expect(oneOpen.slice(1).map((t) => t.expanded)).toEqual(oneOpen.slice(1).map(() => false));

    // The page-wide companion: multi-table only, and one click finishes the job.
    const globalBtn = page.locator('#mb-picard-col-hdr-toggle-all-btn');
    await expect(globalBtn).toBeVisible();
    await globalBtn.click();
    await expect(globalBtn).toHaveAttribute('data-mb-picard-col-all-expanded', 'true');

    const allOpen = await readPicard(page);
    expect(allOpen.map((t) => t.expanded)).toEqual(allOpen.map(() => true));
    expect(allOpen.map((t) => t.buttons)).toEqual(allOpen.map((t) => t.rows));

    // …and back to empty, with the cells still in place.
    await globalBtn.click();
    await expect(globalBtn).toHaveAttribute('data-mb-picard-col-all-expanded', 'false');
    const allClosed = await readPicard(page);
    expect(allClosed.map((t) => t.buttons)).toEqual(allClosed.map(() => 0));
    expect(allClosed.map((t) => t.cells)).toEqual(allClosed.map((t) => t.rows));
    expect(allClosed.map((t) => t.rowsWithBadCellCount)).toEqual(allClosed.map(() => 0));
});

test('@extended series releases (single): one Picard column, no page-wide button', async ({ page }) => {
    test.setTimeout(180000);
    await loadUserscriptPage(page, { url: SERIES_SINGLE, testMode: true });
    await page.click('button[data-label="Show all Releases for Series"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const before = await readPicard(page);
    expect(before.length, 'exactly one Picard column on a single-table page').toBe(1);
    expect(before[0].rows, 'the page actually has rows').toBeGreaterThan(0);
    expect(before[0].cells, 'one Picard cell per row').toBe(before[0].rows);
    expect(before[0].buttons, 'ships collapsed — no ♪ buttons').toBe(0);
    expect(before[0].expanded).toBe(false);
    expect(before[0].headerOwnText).toBe('Picard');
    expect(before[0].rowsWithBadCellCount, 'a collapsed column moves no column index').toBe(0);

    // A single-table page gets NO page-wide button: its one column header
    // already IS the page-wide control. This is the half of that rule the
    // fixture suite can only check on a curated fixture.
    await expect(page.locator('#mb-picard-col-hdr-toggle-all-btn')).toHaveCount(0);

    const toggle = page.locator('thead th.mb-picard-th .mb-picard-col-hdr-btn');
    await expect(toggle).toHaveCount(1);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const open = await readPicard(page);
    // Every row of a release listing links its own release, so one ♪ per row.
    expect(open[0].buttons, 'a ♪ per row after pressing').toBe(open[0].rows);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const closed = await readPicard(page);
    expect(closed[0].buttons).toBe(0);
    expect(closed[0].cells).toBe(closed[0].rows);
    expect(closed[0].headerOwnText).toBe('Picard');
    expect(closed[0].rowsWithBadCellCount).toBe(0);
});
