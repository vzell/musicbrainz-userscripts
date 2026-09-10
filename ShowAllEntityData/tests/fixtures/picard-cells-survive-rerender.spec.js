'use strict';

// Regression: the Picard column's <td>s must SURVIVE a multi-table re-render.
//
// The guarantee pinned here is deliberately narrow and is NOT "a Picard button
// works" (tests/fixtures/search-recordings-continuation.spec.js already covers
// that, on a single-table page, at initial render). It is:
//
//   after any multi-table re-render, every rendered row still owns a
//   td.mb-picard-cell, that cell is still the row's LAST cell, and the row's
//   cell count still equals its own table's header count.
//
// Before the fix, `initPicardTaggerColumn()`'s full-mode pass appended the cell
// only to the LIVE rows. `renderGroupedTable()` inserts `r.cloneNode(true)` on
// every render including the first, so `groupedRows[i].rows` never received it;
// every re-render then re-cloned blank rows and the rewire-only call correctly
// declined to append. Result: the whole ♪ column disappeared from every
// re-rendered sub-table while its <th> stayed, leaving the body one column
// short of the header.
//
// Two triggers are covered because they fail differently:
//   - a global-filter keystroke re-renders EVERY group (the cheapest repro, and
//     the one that shows the bug is page-wide rather than sort-specific);
//   - a sub-table sort re-renders only that group (`_renderDirtyGroupIdxs`),
//     which is why the original debug/picard-missing.html snapshot showed one
//     empty sub-table beside two intact ones.
//
// Counts are always derived from the DOM and asserted PER SUB-TABLE against
// that sub-table's own pre-action numbers — never a page-wide tally. A scoped
// render leaves other groups untouched, so a page-wide count can stay "right"
// while the sorted group is broken.
//
// Network-free: the page shell is served from the committed raw snapshot and
// the rows come from the committed Save-to-disk fixture, both for the same
// release group. Note `loadUserscriptPage`'s FIXTURE_SETTINGS_OVERRIDE forces
// `sa_enable_relationships_column` off for fixture specs, so the
// "Picard is appended after the Relationships cell" ordering is NOT exercised
// here — `tests/live/disk-fixture-load.spec.js` is where that combination runs.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForFilterSettled, waitForSortSettled, waitForActualRowCount } =
    require('../support/filterSortAssertions');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');

// "Tougher Than the Rest" — 7 releases across 2 groups (Official 6, Promotion 1).
// Same entity for both artefacts, which is required: the shell drives pageType
// detection, the .json.gz supplies the rows.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const PAGE_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const DISK_FIXTURE = path.join(__dirname, 'saved-data', 'releasegroup-releases.json.gz');

// Rows across both sub-tables (6 + 1). Every action in this spec is chosen to
// keep all of them, so this doubles as the "the render has actually finished"
// signal — see waitForActualRowCount()'s own JSDoc for why one is needed.
const TOTAL_ROWS = 7;

/**
 * Per-table Picard structure, read straight from the rendered DOM.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{rows: number, picardCells: number, buttons: number,
 *                          headerCells: number, rowsWithBadCellCount: number,
 *                          rowsWherePicardNotLast: number, heading: string}>>}
 */
const readPicardShape = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl')).map((table) => {
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        const headerCells = table.querySelectorAll('thead tr:first-child th').length;
        let h3 = table.previousElementSibling;
        while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
        return {
            heading: h3 ? (h3.textContent.match(/^[^(]+/) || [''])[0]
                .replace(/^[▶▼▲◀\s]+/, '').trim() : '(no h3)',
            rows: bodyRows.length,
            headerCells,
            picardCells: bodyRows.filter((r) => r.querySelector('td.mb-picard-cell')).length,
            buttons: table.querySelectorAll('td.mb-picard-cell button.mb-picard-btn').length,
            rowsWithBadCellCount: bodyRows.filter((r) => r.cells.length !== headerCells).length,
            rowsWherePicardNotLast: bodyRows.filter((r) => {
                const cell = r.querySelector('td.mb-picard-cell');
                return cell && cell !== r.cells[r.cells.length - 1];
            }).length,
        };
    }));

/**
 * Asserts the invariant for every table: one Picard cell per row, one button per
 * cell, the cell is rightmost, and body/header cell counts agree.
 *
 * @param {Array<Object>} shape
 * @param {string} phase  Named in the failure message so a red run says WHEN.
 */
const expectPicardIntact = (shape, phase) => {
    expect(shape.length, `${phase}: sub-table count`).toBe(2);
    for (const t of shape) {
        expect(t.picardCells, `${phase}: "${t.heading}" picard cells`).toBe(t.rows);
        // Every row of this fixture links exactly one release, so one button
        // each. This is what actually fails before the fix (0 cells, 0 buttons).
        expect(t.buttons, `${phase}: "${t.heading}" ♪ buttons`).toBe(t.rows);
        expect(t.rowsWithBadCellCount, `${phase}: "${t.heading}" rows whose cell count != header count`).toBe(0);
        expect(t.rowsWherePicardNotLast, `${phase}: "${t.heading}" rows where Picard is not rightmost`).toBe(0);
    }
};

test.describe('Picard column survives multi-table re-renders', () => {
    // The Load-from-disk dialog is a position:fixed overlay, so when it is
    // taller than the viewport its confirm button sits at a coordinate no
    // amount of page scrolling can reach and Playwright retries "element is
    // outside of the viewport" until the hook times out. The default Desktop
    // Chrome 720px is not enough here — the shell this spec serves has none of
    // musicbrainz.org's own CSS, so everything above the dialog is taller than
    // on the live page tests/live/disk-fixture-load.spec.js uses.
    test.use({ viewport: { width: 1440, height: 1400 } });

    /** Populated per test by beforeEach; asserted empty at the end of each. */
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        // Any uncaught error during a load / filter / sort flow fails the test.
        // Cheap, and it covers a whole class this spec cannot otherwise see —
        // e.g. a source-row pass that throws only on a row the current filter
        // left UNRENDERED, which a fully-rendered assertion never reaches.
        pageErrors = collectPageErrors(page);
        await loadFromDiskFixture(page, {
            url: RG_URL,
            fixturePath: DISK_FIXTURE,
            pageFixtureFile: PAGE_SHELL,
            testMode: true,
        });
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('table.tbl')).toHaveCount(2);
    });

    test('a global-filter keystroke does not empty the Picard column', async ({ page }) => {
        const before = await readPicardShape(page);
        expectPicardIntact(before, 'initial render');
        expect(before.map((t) => t.rows)).toEqual([6, 1]);

        // "e" matches every row, so the row set is unchanged and the counts
        // stay directly comparable — the re-render is the thing under test,
        // not the filtering.
        const input = page.locator('#mb-global-filter-input');
        await waitForFilterSettled(page, () => input.pressSequentially('e'));
        // Second completion signal, and it is not optional: filterSortAssertions.js
        // documents that #mb-filter-status-display reaches its final text BEFORE
        // the tbody insertion loop has caught up, so a single snapshot read here
        // intermittently sees a partly-repopulated table. Observed as exactly that
        // flake — green in isolation, one failure under full-suite parallel load.
        await waitForActualRowCount(page, TOTAL_ROWS);

        const filtered = await readPicardShape(page);
        expect(filtered.map((t) => t.rows), 'filter kept every row').toEqual([6, 1]);
        expectPicardIntact(filtered, 'after global filter');

        await waitForFilterSettled(page, () => input.fill(''));
        await waitForActualRowCount(page, TOTAL_ROWS);
        expectPicardIntact(await readPicardShape(page), 'after clearing the filter');
        expect(pageErrors).toEqual([]);
    });

    test('sorting one sub-table does not empty its Picard column, or the other one', async ({ page }) => {
        // Expanding every sub-section plus a sort settle does not fit the 30s
        // default, and overrunning it reports "Target page has been closed"
        // instead of whatever actually went wrong.
        test.setTimeout(120000);

        const before = await readPicardShape(page);
        expectPicardIntact(before, 'initial render');

        // `releasegroup-releases` renders its sub-sections COLLAPSED, and a
        // sort icon inside a display:none table is a 0x0 element Playwright
        // will never click. The helper asserts the collapsed starting state
        // first, so it cannot silently do the opposite on a pageType that
        // renders expanded.
        await clickMasterToggleAndExpandAll(page);

        const officialH3 = page.locator('h3.mb-toggle-h3', { hasText: before[0].heading }).first();
        const officialTable = officialH3.locator('xpath=following-sibling::table[1]');
        const ascending = officialTable.locator('thead .sort-icon-btn', { hasText: '▲' }).first();
        // Assert reachability explicitly: a click that merely hangs reports
        // "Target page has been closed" after the whole test budget, which
        // names neither the element nor the reason.
        await expect(officialTable).toBeVisible({ timeout: 10000 });
        await expect(ascending).toBeVisible({ timeout: 10000 });

        await waitForSortSettled(page, () => ascending.click(), {
            subTableHeading: before[0].heading,
            timeout: 60000,
        });

        await waitForActualRowCount(page, TOTAL_ROWS);

        const after = await readPicardShape(page);
        // Compared against each sub-table's OWN pre-sort numbers: the scoped
        // render only re-clones the sorted group, so the untouched one proves
        // nothing on its own and must not be allowed to mask the sorted one.
        expect(after.map((t) => t.rows)).toEqual(before.map((t) => t.rows));
        expectPicardIntact(after, 'after sorting the first sub-table');
        expect(pageErrors).toEqual([]);
    });
});
