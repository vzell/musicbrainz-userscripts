'use strict';

// The Locality -> Region correction that reacts to the "MusicBrainz: More Flags
// Everywhere" userscript rewrites two cells, on the live row AND on the master
// row, up to ~6 s after the render. AUDIT.md §3.4, live twin §10 L7.
//
// It drops the uniq-dropdown cache for the table, and nothing else — so the
// filter side keeps its pre-correction answers:
//   • _filterResultCache replays the row list built before the move, under a
//     key the move does not change;
//   • _rowTextCache still holds each master row's pre-move column and full text.
// And a filter that is ACTIVE when the move happens is never re-applied, so the
// table goes on showing rows by a value they no longer have.
//
// The third-party script is simulated the way it really behaves: the fixture is
// served undecorated, and the test then inserts the icon span and stamps
// data-flag-processed on the area anchor, which is what
// initAreaFlagRegionObserver() watches for.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');
const { columnFilterInput, columnFilterClear } = require('../support/filterSortAssertions');

const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'area-flag-region-filter.html');

const NEEDLE = 'New York';
const REGION_BEFORE = 3;  // rows whose Region is already "New York" (city+state+country)
const REGION_AFTER = 6;   // once the flagged state-as-locality rows are corrected
const LOCALITY_BEFORE = 3; // rows whose Locality is "New York" until it moves

/** Column index by name, in the single rendered table. */
const colIndex = (page, name) => page.evaluate((n) => Array.from(
    document.querySelector('table.tbl thead tr:first-child').cells)
    .findIndex((c) => (c.dataset.colName || c.textContent.trim()) === n), name);

/** Rendered rows — runFilter() REMOVES non-matching rows. */
const renderedRows = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length);

/** How many rendered rows carry `text` in the named column. */
const rowsWith = (page, name, text) => page.evaluate(({ n, t }) => {
    const table = document.querySelector('table.tbl');
    const idx = Array.from(table.querySelector('thead tr:first-child').cells)
        .findIndex((c) => (c.dataset.colName || c.textContent.trim()) === n);
    return Array.from(table.querySelectorAll('tbody tr'))
        .filter((r) => r.cells[idx] && r.cells[idx].textContent.replace(/\s+/g, ' ').trim() === t).length;
}, { n: name, t: text });

/**
 * Simulates the flag userscript: inserts its icon span before each "New York"
 * area anchor in the Locality column and stamps `data-flag-processed`, which is
 * exactly what the observer reacts to. Only rows currently RENDERED can be
 * decorated — that is also true of the real script.
 *
 * @returns {Promise<number>} how many anchors were decorated
 */
const decorate = (page) => page.evaluate((needle) => {
    const table = document.querySelector('table.tbl');
    const locIdx = Array.from(table.querySelector('thead tr:first-child').cells)
        .findIndex((c) => (c.dataset.colName || c.textContent.trim()) === 'Locality');
    let n = 0;
    table.querySelectorAll('tbody tr').forEach((tr) => {
        const td = tr.cells[locIdx];
        if (!td) return;
        const a = Array.from(td.querySelectorAll('a[href*="/area/"]'))
            .find((x) => x.textContent.trim() === needle && !x.dataset.flagProcessed);
        if (!a) return;
        const icon = document.createElement('span');
        icon.className = 'area-icon';
        icon.dataset.mbFlag = '1';
        icon.innerHTML = `<img class="flag flag-custom-region" alt="${needle}" title="${needle}">`;
        a.parentNode.insertBefore(icon, a);
        a.dataset.flagProcessed = '1';
        n++;
    });
    return n;
}, NEEDLE);

/** Waits until the correction has moved every flagged locality into Region. */
async function waitForCorrections(page) {
    await expect.poll(() => rowsWith(page, 'Region', NEEDLE), {
        timeout: 20000, message: 'the flagged rows move Locality -> Region',
    }).toBe(REGION_AFTER);
}

test.describe('area-flag Locality -> Region correction vs. an active filter', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await renderedRows(page), 'every fixture row renders').toBe(8);
        expect(await rowsWith(page, 'Region', NEEDLE), 'three rows start with that Region').toBe(REGION_BEFORE);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('control: correct first, then filter Region', async ({ page }) => {
        expect(await decorate(page), 'three anchors decorated').toBe(LOCALITY_BEFORE);
        await waitForCorrections(page);

        const idx = await colIndex(page, 'Region');
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'control: the Region filter finds all six rows',
        }).toBe(REGION_AFTER);
    });

    test('B: the same Region filter, retyped after the correction, finds the moved rows', async ({ page }) => {
        const idx = await colIndex(page, 'Region');
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'before the correction only the city+state rows match',
        }).toBe(REGION_BEFORE);

        // Clear first: the rows to be corrected are filtered out right now, and
        // the flag userscript can only decorate what is rendered.
        await columnFilterClear(page, idx).click();
        await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'every row is back' }).toBe(8);
        expect(await decorate(page)).toBe(LOCALITY_BEFORE);
        await waitForCorrections(page);

        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'B: the retyped needle finds all six rows, not the cached three',
        }).toBe(REGION_AFTER);
    });

    test('C isolation: a NEW filter key after the correction reads the moved text', async ({ page }) => {
        // The page-wide Case checkbox changes _buildFilterKey()'s top-level "c",
        // so no cached row list can be replayed. Rows missing here mean the
        // master rows' cached TEXT is stale on its own.
        const idx = await colIndex(page, 'Region');
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'three rows match at first' }).toBe(REGION_BEFORE);

        await columnFilterClear(page, idx).click();
        await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'every row is back' }).toBe(8);
        expect(await decorate(page)).toBe(LOCALITY_BEFORE);
        await waitForCorrections(page);

        await page.locator('#mb-global-filter-case-checkbox').check();
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'C: a fresh key finds all six rows',
        }).toBe(REGION_AFTER);
    });

    test('D: a filter active on the column the value LEAVES stops matching those rows', async ({ page }) => {
        // The mirror image of B: filter on Locality, then let the correction
        // take that value out of Locality. Those rows no longer have it, so the
        // table must stop showing them — instead of going on displaying rows by
        // a value they no longer carry.
        const idx = await colIndex(page, 'Locality');
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'the state-as-locality rows match at first',
        }).toBe(LOCALITY_BEFORE);

        expect(await decorate(page), 'the visible rows are the ones to decorate').toBe(LOCALITY_BEFORE);

        await expect.poll(() => renderedRows(page), {
            timeout: 20000, message: 'D: the corrected rows drop out of a Locality filter they no longer match',
        }).toBe(0);
    });
});
