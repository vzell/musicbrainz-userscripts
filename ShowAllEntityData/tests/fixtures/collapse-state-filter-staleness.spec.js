'use strict';

// Expanding or collapsing ONE cell changes which rows the 📊 "Structure"
// entries match — "▶ collapsed multi-row cells" and "◀ expanded multi-row
// cells" are read from `expandedCells`, keyed "rowIdx:colIdx". AUDIT.md §3.8,
// live twin §10 L8 (confirmed live by the user on 9.99.1098 before this spec
// was written).
//
// `_buildFilterKey()` hashes filter INPUTS, and a collapse toggle changes none
// of them, so picking the same entry again replays the row list from before the
// toggle. The dropdown's own counts are correct meanwhile — `_applyCollapseState()`
// and `ensureCollapseDelegate()` already drop the uniq-dropdown cache — which is
// what makes "count says 45, table shows 46" the shape of this bug.
//
// Unlike §3.2/§3.3/§3.4 there is no stale TEXT here: the structure modes read
// the map, not the row's text. So the isolation test (a fresh cache key) is
// expected to PASS on main, and that is precisely what pins the defect to a
// replayed result rather than to anything else.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
// collectPageErrors() is deliberately NOT used: MusicBrainz's own
// static/scripts/supported-browser-check.js throws on this captured shell, and
// a versioned bundle it references now answers with an HTML error page. Neither
// involves the userscript; both are artifacts of serving a saved page, so they
// are excluded by ORIGIN rather than by message text.

// "Greetings From Asbury Park, N.J." — the page the user verified as having the
// Structure section (its Catalog# column has 46 multi-row cells in the first
// sub-table here, Label 14).
const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE_FILE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const COLUMN = 'Catalog#';
const SECTION = 'Structure';
const COLLAPSED = '▶ collapsed multi-row cells';
const EXPANDED = '◀ expanded multi-row cells';

/** The table that owns the 📊 the helpers below drive (the first with COLUMN). */
const artTable = (page, col) => page.evaluate((c) => {
    const th = Array.from(document.querySelectorAll('table.tbl thead th'))
        .find((t) => t.dataset.colName === c);
    return Array.from(document.querySelectorAll('table.tbl')).indexOf(th.closest('table'));
}, col);

/** Rendered rows of one sub-table — runFilter() REMOVES non-matching rows. */
const rowsIn = (page, tableIndex) => page.evaluate((i) => Array.from(
    document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
    .filter((r) => r.style.display !== 'none').length, tableIndex);

/** One Structure entry's advertised count, or null when it is not offered. */
async function entryCount(page, label) {
    const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), COLUMN);
    const section = (sections || []).find((s) => s.label === SECTION);
    const entry = section && section.items.find((i) => i.label === label);
    return entry ? entry.count : null;
}

/** Clicks a Structure entry in the open dropdown (toggles it). */
const clickEntry = (page, label) => page.evaluate(({ sectionLabel, entryLabel }) => {
    const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
    Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
        .find((el) => el.dataset.mbUniqSynLabel === entryLabel).click();
}, { sectionLabel: SECTION, entryLabel: label });

/** Closes the dropdown through its own outside-mousedown handler. */
async function closeDropdown(page) {
    await page.evaluate(() => document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
}

/** Opens the dropdown, reads the entry's count, clicks it, closes the dropdown. */
async function pick(page, label) {
    const count = await entryCount(page, label);
    expect(count, `the "${label}" entry is offered`).not.toBeNull();
    await clickEntry(page, label);
    await closeDropdown(page);
    return count;
}

/**
 * Clicks one multi-row cell's own ▶N▤ toggle in the target column, flipping
 * that single cell's collapse state — the user action the whole section is
 * about.
 *
 * @returns {Promise<string>} the row index whose cell was flipped
 */
const flipOneCell = (page, tableIndex) => page.evaluate(({ i, c }) => {
    const table = document.querySelectorAll('table.tbl')[i];
    const colIdx = Array.from(table.querySelector('thead tr:first-child').cells)
        .findIndex((t) => t.dataset.colName === c);
    const row = Array.from(table.querySelectorAll('tbody tr'))
        .find((r) => r.style.display !== 'none' && r.cells[colIdx]
            && r.cells[colIdx].querySelector('.mb-cell-collapse-toggle'));
    if (!row) return null;
    row.cells[colIdx].querySelector('.mb-cell-collapse-toggle').click();
    return row.dataset.mbRowIdx;
}, { i: tableIndex, c: COLUMN });

test.describe('📊 Structure entries after a cell is expanded', () => {
    let pageErrors;
    let tableIndex;
    let collapsedAtStart;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        await loadUserscriptPage(page, { url: RG_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route('https://musicbrainz.org/release-group/**',
            (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
            await master.click();
        }
        tableIndex = await artTable(page, COLUMN);
        collapsedAtStart = await entryCount(page, COLLAPSED);
        await closeDropdown(page);
        expect(collapsedAtStart, 'the column starts with several collapsed multi-row cells').toBeGreaterThan(5);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('control: the entry filters to exactly the cells it counts', async ({ page }) => {
        expect(await pick(page, COLLAPSED)).toBe(collapsedAtStart);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'control: the collapsed-cells entry renders as many rows as it counts',
        }).toBe(collapsedAtStart);
    });

    test('B: picking it again after expanding one cell drops that row', async ({ page }) => {
        expect(await pick(page, COLLAPSED)).toBe(collapsedAtStart);
        await expect.poll(() => rowsIn(page, tableIndex), { timeout: 15000, message: 'first pick' }).toBe(collapsedAtStart);

        await pick(page, COLLAPSED); // uncheck
        expect(await flipOneCell(page, tableIndex), 'a cell was expanded').not.toBeNull();

        // The dropdown itself keeps up — the collapse sites already drop its
        // cache — which is what makes the row count the interesting half.
        expect(await entryCount(page, COLLAPSED), 'the count drops by one').toBe(collapsedAtStart - 1);
        expect(await entryCount(page, EXPANDED), 'and the expanded entry appears').toBe(1);
        await closeDropdown(page);

        expect(await pick(page, COLLAPSED)).toBe(collapsedAtStart - 1);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000,
            message: 'B: the second pick renders one row fewer, not the first pick\'s row list',
        }).toBe(collapsedAtStart - 1);
    });

    test('C isolation: a NEW filter key sees the expanded cell immediately', async ({ page }) => {
        // No cached row list can be replayed under a key that has never been
        // used, and the structure modes read `expandedCells` rather than any
        // cached text — so this is expected to pass even on a tree without the
        // fix. It is the control that pins B to a replay.
        expect(await pick(page, COLLAPSED)).toBe(collapsedAtStart);
        await pick(page, COLLAPSED); // uncheck
        expect(await flipOneCell(page, tableIndex)).not.toBeNull();
        await closeDropdown(page);

        await page.locator('#mb-global-filter-case-checkbox').check();
        expect(await pick(page, COLLAPSED)).toBe(collapsedAtStart - 1);
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 15000, message: 'C: a fresh key renders one row fewer',
        }).toBe(collapsedAtStart - 1);
    });

    test('D: expanding a cell while the filter is active drops its row', async ({ page }) => {
        // The filter says "collapsed multi-row cells". Expanding one of them
        // makes that row stop qualifying, so the table must stop showing it —
        // rather than leaving it listed under a state it no longer has.
        expect(await pick(page, COLLAPSED)).toBe(collapsedAtStart);
        await expect.poll(() => rowsIn(page, tableIndex), { timeout: 15000, message: 'first pick' }).toBe(collapsedAtStart);

        expect(await flipOneCell(page, tableIndex), 'a visible cell was expanded').not.toBeNull();
        await expect.poll(() => rowsIn(page, tableIndex), {
            timeout: 20000, message: 'D: the expanded row leaves a collapsed-cells filter it no longer matches',
        }).toBe(collapsedAtStart - 1);
    });
});
