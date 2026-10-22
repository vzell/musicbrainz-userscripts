'use strict';

// "Live credit without a date" names the date the credit can be deduced to
// be from (2026-10-21; asked on release 3ec14d03-…, Toby Scott's
// "recording engineer" credit on "Born to Run (new live)"). The finding is a
// ROW finding, and row findings had no per-cell detail: the cell's hover
// card said only "⚠️ Live credit without a date". The guarantees pinned:
//   - every cell carrying the finding has a title that names the date,
//     "⚠️ Live credit without a date: probably <date>, …";
//   - that date is the ROW'S OWN recording date — the "Recording date"
//     cell's — not merely some date: each flagged cell is checked against
//     its own row;
//   - it survives a filter re-render (rows are cloned; the date travels as
//     the flag's data-mb-live-date attribute).
// The disk round trip is pinned in live-date-flags-survive-disk-roundtrip.
//
// Fixture: release-tracks-live-date-flags.html (2 flagged rows, medium 2).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

const RELEASE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-live-date-flags.html');
const TITLE_RE = /⚠️ Live credit without a date: probably (\d{4}-\d{2}-\d{2}), the recording's own date/;

/**
 * Every visible cell carrying `live-credit-nodate`: its title, and its row's
 * "Recording date" cell text.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{title: string, rowDate: string}>>}
 */
const flaggedCells = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((table) => {
        const heads = Array.from(table.querySelectorAll('thead tr:first-child th')).map((th) => th.textContent.trim());
        const di = heads.findIndex((h) => h.startsWith('Recording date'));
        table.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none') return;
            Array.from(tr.cells).forEach((td) => {
                if (!(td.dataset.mbFindings || '').split(' ').includes('live-credit-nodate')) return;
                out.push({ title: td.getAttribute('title') || '', rowDate: di >= 0 && tr.cells[di] ? tr.cells[di].textContent.trim() : '' });
            });
        });
    });
    return out;
});

test.describe('"Live credit without a date" names the deduced date', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route('https://musicbrainz.org/release/**',
            (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('each flagged cell names its own row\'s recording date; still after a filter re-render', async ({ page }) => {
        const check = async (when) => {
            const cells = await flaggedCells(page);
            expect(cells.length, `${when}: flagged cells to check`).toBeGreaterThanOrEqual(1);
            cells.forEach((c) => {
                const m = TITLE_RE.exec(c.title);
                expect(m, `${when}: the title names a date: ${JSON.stringify(c.title)}`).not.toBeNull();
                expect(c.rowDate, `${when}: the row has a recording date`).toMatch(/^\d{4}-\d{2}-\d{2}/);
                expect(m[1], `${when}: the date is the row's own`).toBe(c.rowDate.slice(0, 10));
            });
        };
        await check('after the render');
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'with band'));
        await check('after a filter');
    });
});
