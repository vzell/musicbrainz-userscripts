'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// iswc (/iswc/<code>) — no listToTable/insertH2 needed, its "Associated with
// N work(s)" table is already tbl-shaped. Its button carries no `params`, so
// startFetchingProcess reuses the live document instead of re-fetching
// (mirrors 'auto-editor-election', see uniq-drop-election-date.spec.js).
const ISWC_URL = 'https://musicbrainz.org/iswc/T-070.127.339-3';
const FIXTURE_FILE = path.join(__dirname, 'iswc.html');

// The real snapshot's one row: MusicBrainz truncates its "Recording artists"
// work-artists-container list to 4 <li>s + a li.show-all link, whose embedded
// JSON carries 118 entries total (see debug/ISWC.html / DEBUG-NOTES.md).
const TOTAL_RECORDING_ARTISTS = 118;

async function loadIswcPage(page) {
    await loadUserscriptPage(page, { url: ISWC_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Works"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Reads one column's cell text for every rendered row, by header name.
 * Strips any embedded `<script type="application/json">` first — those stay
 * in the DOM (expandShowAllCells() only reads them, it doesn't remove them)
 * and a raw `.textContent` read would otherwise include the whole JSON blob.
 */
const columnValues = (page, colName) => page.evaluate((name) => {
    const table = document.querySelector('table.tbl');
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.dataset.colName || th.textContent.trim());
    const idx = headers.indexOf(name);
    return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
        const cell = tr.cells[idx];
        if (!cell) return null;
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('script').forEach((s) => s.remove());
        return clone.textContent.trim();
    });
}, colName);

test.describe('iswc (/iswc/<code>)', () => {
    test('consolidates the merge-table and drops the native checkbox column', async ({ page }) => {
        await loadIswcPage(page);

        const headers = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl thead th')).map((th) => th.dataset.colName || th.textContent.trim()));

        // The native leading checkbox <th> carries no CSS class at all
        // (same defect as /isrc/), so without the pageType==='iswc' stamp in
        // startFetchingProcess it would survive sa_remove_checkbox_cell as a
        // blank, unlabeled column instead of being dropped like every other
        // merge-table's checkbox column.
        expect(headers).not.toContain('');
        expect(headers).toEqual(expect.arrayContaining(
            ['Title', 'Authors', 'Recording artists', 'Other artists', 'Type', 'Language']));

        expect(await columnValues(page, 'Title')).toEqual(['(Get Your Kicks on) Route 66']);
        expect(await columnValues(page, 'Type')).toEqual(['Song']);
        expect(await columnValues(page, 'Language')).toEqual(['English']);
    });

    test('Authors and Other artists render from their native artist-roles-container markup', async ({ page }) => {
        await loadIswcPage(page);

        expect(await columnValues(page, 'Authors')).toEqual(['Bobby Troup (composer, lyricist)']);
        // No other-artists credits on this work — the native
        // artist-roles-container div is present but empty.
        expect(await columnValues(page, 'Other artists')).toEqual(['']);
    });

    test('the native "(show N more)" Recording artists truncation is fully expanded', async ({ page }) => {
        await loadIswcPage(page);

        // expandShowAllCells() reconstructs the truncated work-artists-container
        // list from its embedded JSON before row extraction runs (the same
        // generic mechanism 'artist-works'' own "Recording artists" column
        // relies on) — so the rendered cell should carry the full count, not
        // just the 4 <li>s MusicBrainz's own HTML shows before the
        // "(show 114 more)" link.
        const liCount = await page.evaluate(() => {
            const table = document.querySelector('table.tbl');
            const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.dataset.colName || th.textContent.trim());
            const idx = headers.indexOf('Recording artists');
            const cell = table.querySelector('tbody tr').cells[idx];
            return cell.querySelectorAll('li').length;
        });
        expect(liCount).toBe(TOTAL_RECORDING_ARTISTS);

        // The truncation placeholder itself must not survive as a row.
        const showAllText = await page.evaluate(() => document.body.textContent.includes('show 114 more'));
        expect(showAllText).toBe(false);
    });
});
