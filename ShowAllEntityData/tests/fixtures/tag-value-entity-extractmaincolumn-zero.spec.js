'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// tag-value-entity (/tag/<value>/<entity>, e.g. /tag/rock/recording) declares
// `features.extractMainColumn: 0` (the page's single native column is always
// index 0) plus, for the 'Recordings' entityFeatures block, a
// syntheticColumnExtractors entry sourcing `eventParts` from the synthetic
// 'Comment' column. cleanupHeaders()'s `_resolvedPrimaryCols` gate used to
// check `extractMainColumn` with a plain truthy test, which is false for the
// legitimate value 0 — dropping the nine Event-* headers and, because every
// row still gets all fifteen <td>s appended, shifting every header after
// "Artist" one-for-one out of alignment with its data. See
// debug/tag-rock-recording-final.html for the real-world capture.
const TAG_URL = 'https://musicbrainz.org/tag/rock/recording';
const FIXTURE_FILE = path.join(__dirname, 'tag-value-entity-extractmaincolumn-zero.html');

const EVENT_PARTS_COLUMNS = [
    'Event-Type', 'Event-Date', 'Event-Detail', 'Event-Venue', 'Event-Venue-Detail',
    'Event-City', 'Event-State', 'Event-Country', 'Event-Additional-Info',
];

async function openTagRecordings(page) {
    await loadUserscriptPage(page, {
        url: TAG_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
    });
    await page.click('button[data-label="Show all Entities tagged"]');
    await page.waitForSelector('#mb-filter-container');
}

/**
 * Reads the header/cell shape of the single rendered table: the ordered
 * `data-col-name` list, and for the first data row, the cell text at the
 * position of each named header (or null if the header doesn't exist / the
 * row has no cell there).
 */
function readHeaderCellAlignment(page) {
    return page.evaluate(() => {
        const table = document.querySelector('table.tbl');
        // thead has two <tr>s (header row + the ✕ column-filter row) — scope
        // to the first, or the filter row's cells double every count below.
        const headers = Array.from(table.querySelectorAll('thead tr:first-child > th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        const row = table.querySelector('tbody tr');
        const cellTextAt = (colName) => {
            const idx = headers.indexOf(colName);
            if (idx === -1 || !row.cells[idx]) return null;
            return row.cells[idx].textContent.replace(/\s+/g, ' ').trim();
        };
        return {
            headerCount: headers.length,
            rowCellCount: row.cells.length,
            headers,
            mbName: cellTextAt('MB-Name'),
            comment: cellTextAt('Comment'),
        };
    });
}

test.describe('tag-value-entity: extractMainColumn=0 header/cell alignment', () => {
    test('the nine eventParts headers are present', async ({ page }) => {
        await openTagRecordings(page);
        const { headers } = await readHeaderCellAlignment(page);
        for (const name of EVENT_PARTS_COLUMNS) {
            expect(headers).toContain(name);
        }
    });

    test('header count matches row cell count (no unlabeled trailing columns)', async ({ page }) => {
        await openTagRecordings(page);
        const { headerCount, rowCellCount, headers } = await readHeaderCellAlignment(page);
        expect(
            rowCellCount,
            `row has ${rowCellCount} cells but only ${headerCount} headers: ${JSON.stringify(headers)}`
        ).toBe(headerCount);
    });

    test('"MB-Name" holds the recording\'s own name, and "Comment" holds its disambiguation', async ({ page }) => {
        await openTagRecordings(page);
        const { mbName, comment } = await readHeaderCellAlignment(page);
        expect(mbName).toBe('Brown Sugar');
        expect(comment).toBe('original single stereo version');
    });
});
