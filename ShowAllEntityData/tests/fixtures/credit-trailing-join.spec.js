'use strict';

// credit-trailing-join: an artist credit that ENDS with a join phrase
// (org/majkinetor.org, Apollo findings batch 1; MusicBrainz's report "Artist
// credits with dubious trailing join phrases"; docs/claude/findings.md).
//
// What each test pins, and the neighbouring bug it must still catch:
//   - WHICH Artist cells carry it, row by row: four real report credits
//     (", " / "feat." glued on / through span.name-variation / CJK) against
//     near misses: a join BETWEEN two artists, text after the credit but
//     outside its <bdi> ("(see uses)"), a single artist. A reader that took
//     the cell's whole text, or the text after the FIRST link, fails here.
//   - the tooltip names the phrase (the detail);
//   - the menu counts rows, a click filters to them, a second click restores;
//   - the look, and the tint switch keeping the finding;
//   - survival after a filter re-render.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-00000000000a';
const FIXTURE = path.join(__dirname, 'credit-trailing-join.html');
const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_enable_barcode_highlight: false };
const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd

// Release letter → whether its Artist cell carries credit-trailing-join.
const EXPECTED = { A: true, B: true, C: false, D: false, E: true, F: false, G: true, H: false };

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
 * Per visible release row: its Artist cell's flag, tint, glyph and tooltip.
 *
 * @param {import('@playwright/test').Page} page
 */
const artistCells = (page) => page.evaluate(() => {
    const out = {};
    document.querySelectorAll('table.tbl').forEach((t) => {
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || '');
        const ai = names.indexOf('Artist');
        t.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none') return;
            const rel = tr.querySelector('a[href*="/release/"] bdi');
            if (!rel || ai < 0) return;
            const td = tr.cells[ai];
            out[rel.textContent.trim().replace('Release ', '')] = {
                flagged: (td.dataset.mbFindings || '').split(' ').includes('credit-trailing-join'),
                level: td.dataset.mbFinding || null,
                bg: getComputedStyle(td).backgroundColor,
                after: getComputedStyle(td, '::after').content,
                title: td.getAttribute('title') || '',
            };
        });
    });
    return out;
});

const flags = (cells) => Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.flagged]));

test.describe('credit-trailing-join', () => {
    test('only the credits that end with a join phrase are flagged', async ({ page }) => {
        await open(page);
        expect(flags(await artistCells(page))).toEqual(EXPECTED);
    });

    test('the tooltip names the trailing phrase', async ({ page }) => {
        await open(page);
        const cells = await artistCells(page);
        expect(cells.A.title).toContain('ends with ","');
        expect(cells.B.title).toContain('ends with "feat."');
        expect(cells.E.title).toContain('ends with "feat."');
    });

    test('the menu counts the rows; a click filters to them, a second click restores', async ({ page }) => {
        await open(page);
        const n = Object.values(EXPECTED).filter(Boolean).length;
        expect((await findingRow(page, 'warn', 'credit-trailing-join')).count).toBe(n);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'credit-trailing-join');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(n);
        expect((await findingRowState(page, 'credit-trailing-join')).withFinding).toBe(n);
        await clickFinding(page, 'credit-trailing-join');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(total);
    });

    test('the look: yellow ⚠️; the tint switch keeps the finding but not the paint', async ({ page }) => {
        await open(page);
        for (const [k, c] of Object.entries(await artistCells(page))) {
            if (!EXPECTED[k]) continue;
            expect(c.level, k).toBe('warn');
            expect(c.bg, k).toBe(WARN_BG);
            expect(c.after, k).toBe('"⚠️"');
        }
        await open(page, { sa_findings_tint_credit_trailing_join: false });
        const off = await artistCells(page);
        expect(flags(off), 'still detected').toEqual(EXPECTED);
        Object.values(off).forEach((c) => expect(c.level).toBeNull());
        expect(await findingRow(page, 'warn', 'credit-trailing-join'), 'the menu row stays').toBeTruthy();
    });

    test('the stamps survive a filter re-render', async ({ page }) => {
        await open(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Release'));
        expect(flags(await artistCells(page))).toEqual(EXPECTED);
    });
});
