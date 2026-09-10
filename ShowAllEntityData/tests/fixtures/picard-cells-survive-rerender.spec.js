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
        // sa_picard_tagger_initially_collapsed: false — this block pins that the
        // Picard <td>s and their ♪ buttons SURVIVE a re-render, which needs them
        // built in the first place. Since 9.99.1057 the column ships collapsed,
        // and this setting still selects the "built during the render" behaviour
        // these assertions were written against. The default-state behaviour and
        // the header toggle are the second describe block's subject.
        await loadFromDiskFixture(page, {
            url: RG_URL,
            fixturePath: DISK_FIXTURE,
            pageFixtureFile: PAGE_SHELL,
            testMode: true,
            settingsOverride: { sa_picard_tagger_initially_collapsed: false },
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

// ── Part 2: the per-sub-table ▶♪/▼♪ header toggle ───────────────────────────
//
// Same fixture, and for the same reason it was chosen above: two sub-tables on
// one page, so "per-table" is a claim that can actually fail. What is pinned
// here and nowhere else:
//
//   - the toggle's scope is ONE table. Expanding sub-table 0 must leave
//     sub-table 1 empty and its own header reading collapsed;
//   - that scope SURVIVES a re-render, which is the whole reason the state
//     lives on `<table>.dataset` rather than in a module variable or inferred
//     from cell content. A global-filter keystroke re-renders both groups and a
//     scoped sort re-renders one; either would reset a state stored anywhere
//     that gets rebuilt;
//   - the page-wide companion exists here (it is multi-table only) and one
//     click brings both tables to expanded.
//
// The re-render is also what makes the master-row mirroring testable: the live
// rows are clones, so a toggle that had filled only the live cells would show
// correctly and then lose everything on the next keystroke.
test.describe('Picard column header toggle (per sub-table)', () => {
    test.use({ viewport: { width: 1440, height: 1400 } });

    /** Populated per test by beforeEach; asserted empty at the end of each. */
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        // No settingsOverride for the Picard key: the shipped default is
        // collapsed, and that IS what this test is about.
        await loadFromDiskFixture(page, {
            url: RG_URL,
            fixturePath: DISK_FIXTURE,
            pageFixtureFile: PAGE_SHELL,
            testMode: true,
        });
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('table.tbl')).toHaveCount(2);
    });

    /**
     * Per-table toggle state and button count, in document order.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<Array<{expanded: boolean, buttons: number, cells: number, rows: number}>>}
     */
    const readToggleState = (page) => page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl')).map((table) => {
            const btn = table.querySelector('thead .mb-picard-col-hdr-btn');
            return {
                expanded: !!btn && btn.getAttribute('aria-pressed') === 'true',
                buttons: table.querySelectorAll('td.mb-picard-cell button.mb-picard-btn').length,
                cells: table.querySelectorAll('tbody td.mb-picard-cell').length,
                rows: table.querySelectorAll('tbody tr').length,
            };
        }));

    test('expanding one sub-table leaves the other collapsed, across a filter and a sort', async ({ page }) => {
        // Expanding every sub-section plus a sort settle does not fit the 30s
        // default, and overrunning it reports "Target page has been closed"
        // instead of whatever actually went wrong.
        test.setTimeout(120000);

        // Both tables ship collapsed: the cells exist, the buttons do not.
        const initial = await readToggleState(page);
        expect(initial.map((t) => t.rows)).toEqual([6, 1]);
        expect(initial.map((t) => t.cells)).toEqual([6, 1]);
        expect(initial.map((t) => t.expanded)).toEqual([false, false]);
        expect(initial.map((t) => t.buttons)).toEqual([0, 0]);
        // Nothing was scanned either — an empty cell cannot tell the two apart.
        expect(await page.evaluate(() => window.__saTest.picardEntityScans())).toBe(0);

        // `releasegroup-releases` renders its sub-sections COLLAPSED, so a
        // header span inside a display:none table is a 0x0 element Playwright
        // will never click. The helper asserts that collapsed starting state
        // first, so it cannot silently do the opposite.
        await clickMasterToggleAndExpandAll(page);

        const tables = page.locator('table.tbl');
        const toggle0 = tables.nth(0).locator('thead .mb-picard-col-hdr-btn');
        const toggle1 = tables.nth(1).locator('thead .mb-picard-col-hdr-btn');
        await expect(toggle0).toBeVisible({ timeout: 10000 });
        await expect(toggle1).toBeVisible({ timeout: 10000 });

        await toggle0.click();
        await expect(toggle0).toHaveAttribute('aria-pressed', 'true');

        const oneOpen = await readToggleState(page);
        expect(oneOpen.map((t) => t.expanded), 'only table 0 expanded').toEqual([true, false]);
        // Every row of this fixture links exactly one release, so one button each.
        expect(oneOpen.map((t) => t.buttons), 'buttons are scoped to table 0').toEqual([6, 0]);
        // The cells are all still there in BOTH tables — a collapsed column
        // must never remove a <td>, or every column index after it moves.
        expect(oneOpen.map((t) => t.cells)).toEqual([6, 1]);

        // ── The state has to survive a re-render ────────────────────────────
        // "e" matches every row, so the row set is unchanged and the counts stay
        // directly comparable. waitForActualRowCount is the second, non-optional
        // completion signal — see the first describe block for why.
        const input = page.locator('#mb-global-filter-input');
        const scansBefore = await page.evaluate(() => window.__saTest.picardEntityScans());
        await waitForFilterSettled(page, () => input.pressSequentially('e'));
        await waitForActualRowCount(page, TOTAL_ROWS);

        // The perf claim, and the only place it is observable: a re-render
        // re-derives the entities of the EXPANDED table's 6 rows and of no
        // others. Table 1 is collapsed, so its row is never scanned — which is
        // invisible in the DOM, since its cell looks the same either way.
        // Asserted exactly rather than as an upper bound: an off-by-a-table
        // regression here is precisely the kind that would otherwise pass.
        expect(await page.evaluate(() => window.__saTest.picardEntityScans()) - scansBefore,
            'a re-render scans the expanded sub-table only').toBe(6);

        const afterFilter = await readToggleState(page);
        expect(afterFilter.map((t) => t.expanded), 'after filter: state survived').toEqual([true, false]);
        expect(afterFilter.map((t) => t.buttons), 'after filter: buttons survived').toEqual([6, 0]);
        expect(afterFilter.map((t) => t.cells)).toEqual([6, 1]);

        // ── …and a scoped sort of the expanded table ────────────────────────
        // The "e" filter is deliberately LEFT ACTIVE across the sort rather
        // than cleared first. Clearing it is the one step that has to wait on
        // #mb-filter-status-display changing to a value it has not shown
        // before, and with a query that kept every row there is nothing in that
        // text for the clear to change — measured as a 1-in-3 timeout. Sorting
        // on top of the filter needs no such signal (the sub-table's own
        // .mb-sort-status carries it), keeps the row count at TOTAL_ROWS so
        // waitForActualRowCount still works, and covers strictly more: the
        // toggle state now has to survive a filter re-render AND a scoped sort
        // re-render in sequence.
        const officialTable = tables.nth(0);
        const ascending = officialTable.locator('thead .sort-icon-btn', { hasText: '▲' }).first();
        await expect(ascending).toBeVisible({ timeout: 10000 });

        let heading = await page.evaluate(() => {
            let h3 = document.querySelector('table.tbl').previousElementSibling;
            while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
            return h3 ? (h3.textContent.match(/^[^(]+/) || [''])[0].replace(/^[▶▼▲◀\s]+/, '').trim() : '';
        });
        await waitForSortSettled(page, () => ascending.click(), {
            subTableHeading: heading,
            timeout: 60000,
        });
        await waitForActualRowCount(page, TOTAL_ROWS);

        const afterSort = await readToggleState(page);
        expect(afterSort.map((t) => t.expanded), 'after sort: state survived').toEqual([true, false]);
        expect(afterSort.map((t) => t.buttons), 'after sort: buttons survived').toEqual([6, 0]);
        expect(pageErrors).toEqual([]);
    });

    test('the page-wide button brings every sub-table to expanded in one click', async ({ page }) => {
        test.setTimeout(120000);
        await clickMasterToggleAndExpandAll(page);

        // Multi-table page, so the companion is rendered. A single-table page
        // gets none — its one header toggle already IS the page-wide control
        // (asserted in tests/fixtures/search-recordings-continuation.spec.js).
        const globalBtn = page.locator('#mb-picard-col-hdr-toggle-all-btn');
        await expect(globalBtn).toBeVisible();
        await expect(globalBtn).toHaveAttribute('data-mb-picard-col-all-expanded', 'false');

        // Reading order in the action bar: collapse-all, then any CAA/EAA
        // all-buttons, then this one. Picard injects after the artwork tail, so
        // a naive .after(#mb-col-collapse-all-btn) would wedge it in the middle.
        const orderOk = await page.evaluate(() => {
            const btn = document.getElementById('mb-picard-col-hdr-toggle-all-btn');
            const collapseAll = document.getElementById('mb-col-collapse-all-btn');
            if (!btn || !collapseAll) return false;
            const caa = Array.from(document.querySelectorAll('[data-mb-caa-col-all-ctx]'));
            const prev = caa.length ? caa[caa.length - 1] : collapseAll;
            return prev.nextElementSibling === btn;
        });
        expect(orderOk, 'page-wide Picard button sits after collapse-all / the CAA all-buttons').toBe(true);

        await globalBtn.click();
        await expect(globalBtn).toHaveAttribute('data-mb-picard-col-all-expanded', 'true');

        const expanded = await readToggleState(page);
        expect(expanded.map((t) => t.expanded)).toEqual([true, true]);
        expect(expanded.map((t) => t.buttons)).toEqual([6, 1]);

        // And back again — the aggregate is "expand if any is collapsed",
        // so from all-expanded a click collapses everything.
        await globalBtn.click();
        await expect(globalBtn).toHaveAttribute('data-mb-picard-col-all-expanded', 'false');
        const collapsed = await readToggleState(page);
        expect(collapsed.map((t) => t.expanded)).toEqual([false, false]);
        expect(collapsed.map((t) => t.buttons)).toEqual([0, 0]);
        expect(collapsed.map((t) => t.cells), 'the <td>s never go away').toEqual([6, 1]);
        expect(pageErrors).toEqual([]);
    });
});
