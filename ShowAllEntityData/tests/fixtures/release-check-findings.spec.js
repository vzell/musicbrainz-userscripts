'use strict';

// The release checks of majkinetor's Platform Check and Mission Control as
// findings (org/majkinetor.org, "Findings from the release checks of Mission
// Control / Platform Check / ISRC Scout"; docs/claude/findings.md):
//   barcode-zero (error), barcode-missing, catno-missing, release-event-none.
//
// What each test pins, and the neighbouring bug it must still catch:
//   - WHICH cell carries WHICH finding, row by row, against a fixture whose
//     near misses are the rules' edges: "[none]" is not a missing barcode, a
//     valid barcode is not all zeros, "[no label]" and no label at all need
//     no catalog number, a date-only or country-only event is an event. A detector that
//     flagged too much fails here as surely as one that flagged nothing.
//   - the menu counts ROWS, read from the page, and sits under the right level;
//   - a menu click leaves exactly the flagged rows, and a second click all;
//   - the look: the computed tint and glyph, not only the attribute, and the
//     tint setting turns the paint off but not the finding;
//   - the stamp survives a filter re-render (master rows were stamped).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000009';
const FIXTURE = path.join(__dirname, 'release-check-findings.html');
const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_enable_barcode_highlight: false };
const IDS = ['barcode-zero', 'barcode-missing', 'catno-missing', 'release-event-none'];

const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd
const ERROR_BG = 'rgb(248, 215, 218)';  // #f8d7da

// Release letter → column → the release-check findings its cell carries.
const EXPECTED = {
    A: {},
    B: { Barcode: ['barcode-zero'] },
    C: { Barcode: ['barcode-missing'] },
    D: {},
    E: { 'Catalog#': ['catno-missing'] },
    F: {},
    G: {},
    H: { Date: ['release-event-none'] },
    I: { Barcode: ['barcode-zero'], 'Catalog#': ['catno-missing'] },
    J: {},
};

/**
 * Loads the fixture and presses "Show all Releases for ReleaseGroup".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 */
async function open(page, settingsOverride = {}) {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride } });
    await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Per visible release row: column name → the release-check ids its cell carries.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, Object<string, string[]>>>}
 */
const stamps = (page) => page.evaluate((ids) => {
    const out = {};
    document.querySelectorAll('table.tbl').forEach((t) => {
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || '');
        t.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none') return;
            const a = tr.querySelector('a[href*="/release/"] bdi');
            if (!a) return;
            const letter = a.textContent.trim().replace('Release ', '');
            const cols = {};
            Array.from(tr.cells).forEach((td, i) => {
                const got = (td.dataset.mbFindings || '').split(' ').filter((id) => ids.includes(id));
                if (got.length) cols[names[i]] = got;
            });
            out[letter] = cols;
        });
    });
    return out;
}, IDS);

/**
 * Every live cell carrying one finding: level, computed background and glyph.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
const cellsWith = (page, id) => page.evaluate((fid) =>
    Array.from(document.querySelectorAll(`table.tbl tbody td[data-mb-findings~="${fid}"]`)).map((td) => ({
        level: td.dataset.mbFinding || null,
        bg: getComputedStyle(td).backgroundColor,
        after: getComputedStyle(td, '::after').content,
        title: td.title,
    })), id);

/**
 * How many rows the page has with each id, counted from the cells.
 *
 * @param {Object<string, Object<string, string[]>>} map - From `stamps()`.
 * @param {string} id
 */
const rowsWith = (map, id) => Object.values(map).filter((cols) => Object.values(cols).some((ids) => ids.includes(id))).length;

test.describe('release-check findings', () => {
    test('each cell carries exactly its finding; the near misses carry none', async ({ page }) => {
        await open(page);
        expect(await stamps(page)).toEqual(EXPECTED);
    });

    test('the menus list each finding under its level, counting rows', async ({ page }) => {
        await open(page);
        const map = await stamps(page);
        for (const [id, level] of [['barcode-zero', 'error'], ['barcode-missing', 'warn'],
            ['catno-missing', 'warn'], ['release-event-none', 'warn']]) {
            const row = await findingRow(page, level, id);
            expect(row, `${id} has a ${level} menu row`).toBeTruthy();
            expect(row.count, `${id}: the menu counts the flagged rows`).toBe(rowsWith(map, id));
        }
        expect((await findingRow(page, 'error', 'barcode-zero')).count, 'two all-zero barcodes').toBe(2);
        expect((await findingRow(page, 'warn', 'catno-missing')).count, 'two labels without a number').toBe(2);
    });

    test('a menu click leaves exactly the flagged rows; a second click every row', async ({ page }) => {
        await open(page);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'catno-missing');
        await expect.poll(async () => (await findingRowState(page, 'catno-missing')).visible,
            { timeout: 15000 }).toBe(2);
        expect((await findingRowState(page, 'catno-missing')).withFinding).toBe(2);
        await clickFinding(page, 'catno-missing');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(total);
    });

    test('the look: red ❌ for all zeros, yellow ⚠️ for the rest', async ({ page }) => {
        await open(page);
        const zero = await cellsWith(page, 'barcode-zero');
        expect(zero.length).toBe(2);
        zero.forEach((c) => {
            expect(c.level).toBe('error');
            expect(c.bg).toBe(ERROR_BG);
            expect(c.after).toBe('"❌"');
        });
        for (const id of ['catno-missing', 'release-event-none']) {
            const cells = await cellsWith(page, id);
            expect(cells.length, id).toBeGreaterThan(0);
            cells.forEach((c) => {
                expect(c.bg, id).toBe(WARN_BG);
                expect(c.after, id).toBe('"⚠️"');
                expect(c.title, `${id}: the stamp writes its label as the tooltip`).not.toBe('');
            });
        }
    });

    test('"no barcode entered" is counted but not painted by default; its switch paints it', async ({ page }) => {
        // Off by default (vzell, 2026-11-19): it flagged 42% of a large list.
        await open(page);
        const off = await cellsWith(page, 'barcode-missing');
        expect(off.length, 'still detected').toBe(1);
        expect(off[0].level, 'no tint by default').toBeNull();
        expect(off[0].after, 'no glyph by default').not.toBe('"⚠️"');
        expect((await findingRow(page, 'warn', 'barcode-missing')).count, 'the menu still counts it').toBe(1);

        await open(page, { sa_findings_tint_barcode_missing: true });
        const on = await cellsWith(page, 'barcode-missing');
        expect(on[0].level).toBe('warn');
        expect(on[0].bg).toBe(WARN_BG);
        expect(on[0].after).toBe('"⚠️"');
    });

    test('the tint settings turn the paint off but keep the findings and their menu rows', async ({ page }) => {
        await open(page, {
            sa_findings_tint_barcode_zero: false, sa_findings_tint_barcode_missing: false,
            sa_findings_tint_catno_missing: false, sa_findings_tint_release_event_none: false,
        });
        expect(await stamps(page), 'still detected').toEqual(EXPECTED);
        for (const id of IDS) {
            (await cellsWith(page, id)).forEach((c) => expect(c.level, `${id} not tinted`).toBeNull());
        }
        expect(await findingRow(page, 'error', 'barcode-zero'), 'the menu row stays').toBeTruthy();
    });

    test('the stamps survive a filter re-render', async ({ page }) => {
        await open(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Release'));
        expect(await stamps(page)).toEqual(EXPECTED);
    });
});

// len-unknown: Mission Control's "track without a length", on a release
// tracklist. A real two-track release with track 1's length set to "?:??"
// (tests/fixtures/release-tracks-length-unknown.html); track 2 (11:26) is the
// near miss.
const REL_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const REL_FIXTURE = path.join(__dirname, 'release-tracks-length-unknown.html');

/**
 * Loads the release fixture and presses "Show all Tracks for Release".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 */
async function openRelease(page, settingsOverride = {}) {
    await loadUserscriptPage(page, { url: REL_URL, fixtureFile: REL_FIXTURE, testMode: true,
        settingsOverride: { ...SETTINGS, sa_enable_release_tracks: true, ...settingsOverride } });
    await page.route(`${REL_URL}*`, (r) => r.fulfill({ path: REL_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every visible track row's Length text and whether its Length cell carries
 * len-unknown, with the cell's tint level and glyph.
 *
 * @param {import('@playwright/test').Page} page
 */
const lengthCells = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((t) => {
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || '');
        const li = names.indexOf('Length');
        if (li < 0) return;
        t.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.querySelector('a[href*="/recording/"]')) return;
            const td = tr.cells[li];
            out.push({
                text: td.textContent.trim(),
                flagged: (td.dataset.mbFindings || '').split(' ').includes('len-unknown'),
                level: td.dataset.mbFinding || null,
                after: getComputedStyle(td, '::after').content,
            });
        });
    });
    return out;
});

test.describe('release-check findings: track without a length', () => {
    test('only the "?:??" track is flagged, counted, tinted and filterable', async ({ page }) => {
        await openRelease(page);
        const cells = await lengthCells(page);
        expect(cells.map((c) => [c.text, c.flagged]), 'track 1 unknown, track 2 known').toEqual([['?:??', true], ['11:26', false]]);
        expect(cells[0].level).toBe('warn');
        expect(cells[0].after).toBe('"⚠️"');
        expect((await findingRow(page, 'warn', 'len-unknown')).count).toBe(1);

        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'len-unknown');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(1);
        expect((await findingRowState(page, 'len-unknown')).withFinding).toBe(1);
        await clickFinding(page, 'len-unknown');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(total);
    });

    test('its tint setting turns the paint off but keeps the finding', async ({ page }) => {
        await openRelease(page, { sa_findings_tint_len_unknown: false });
        const cells = await lengthCells(page);
        expect(cells[0].flagged, 'still detected').toBe(true);
        expect(cells[0].level, 'not tinted').toBeNull();
        expect(await findingRow(page, 'warn', 'len-unknown'), 'the menu row stays').toBeTruthy();
    });

    test('a release list never carries it (release tracklists only)', async ({ page }) => {
        await open(page);
        expect(await findingRow(page, 'warn', 'len-unknown')).toBeUndefined();
    });

    test('a recordings list with "?:??" lengths does not carry it either', async ({ page }) => {
        // The TODO scopes the check to release tracklists; an artist's
        // recordings list has a Length column with "?:??" too.
        const url = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
        const fixture = path.join(__dirname, 'artist-recordings-ms-batch.html');
        await loadUserscriptPage(page, { url, fixtureFile: fixture, testMode: true,
            settingsOverride: { ...SETTINGS, sa_enable_ms_track_length: false } });
        await page.route(`${url}?**`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const unknown = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td'))
            .filter((td) => td.textContent.trim() === '?:??').length);
        expect(unknown, 'the page does have unknown lengths').toBeGreaterThan(0);
        expect(await page.locator('td[data-mb-findings~="len-unknown"]').count()).toBe(0);
    });
});
