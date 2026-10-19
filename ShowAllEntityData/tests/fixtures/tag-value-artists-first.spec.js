'use strict';

// Regression for the column shift on /tag/arena%20rock (debug/tag-arena-rock.html),
// plus the artist-comment misread found in the same rows. The four pageTypes
// whose main cell reads "Title by Artist (artist comment)" are covered:
// tag-value and user-tag-value (multi-table) and tag-value-entity and
// user-tag-value-entity (single table).
//
// Bug 1 (multi-table only): renderGroupedTable() clones the FIRST native
// table's head for every group and renamed its first <th> to the group's own
// column name only AFTER cleanupHeaders(). When the first section is Artists,
// cleanupHeaders() saw a stale "Artist" header and skipped artistCredit's
// synthetic "Artist" header while the cell was still appended, so every header
// after the first sat one column left of its cell. The CAA big-image card
// resolves tooltipColumns ('MB-Name', 'Artist') by header name, so it showed
// the artist as the title and no artist line. The "cell under header"
// assertions below pin exactly what that lookup reads.
//
// Bug 2 (all four): _extractMainColumnParts() read the cell's FIRST .comment,
// which for a release group without its own comment is the artist credit's
// disambiguation ("Australian hard rock band").
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const MULTI_FIXTURE = path.join(__dirname, 'tag-value-artists-first.html');
const SINGLE_FIXTURE = path.join(__dirname, 'tag-value-entity-artist-comment.html');
// Same rows; the heading names the user ("Release groups vzell tagged as …"),
// which is how the user-tag page's column name is derived.
const USER_SINGLE_FIXTURE = path.join(__dirname, 'user-tag-value-entity-artist-comment.html');

/**
 * Loads a fixture under a musicbrainz.org URL and presses the page's first
 * "Show all" button. The user-tag pages fetch with `?show_downvoted=0`, which
 * the loader's exact-URL route does not cover, so every query variant of the
 * URL is served the same fixture.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixtureFile
 * @param {string} buttonLabel
 */
async function openAndRender(page, url, fixtureFile, buttonLabel) {
    await loadUserscriptPage(page, { url, fixtureFile, testMode: true });
    await page.route(`${url}?*`, (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
    await page.click(`button[data-label="${buttonLabel}"]`);
    await page.locator('#mb-filter-container').waitFor();
}

/**
 * Reads one table's header names and, for its first data row, the text of
 * the cell standing under each named header.
 *
 * @param {import('@playwright/test').Page} page
 * @param {?string} categoryName  h3 text of the sub-table; null = the only table
 * @param {number} [rowIdx=0]
 * @returns {Promise<?{headers: string[], rowCellCount: number, cell: Object<string, ?string>}>}
 */
function readShape(page, categoryName, rowIdx = 0) {
    return page.evaluate(([name, ri]) => {
        let table;
        if (name) {
            const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes(name));
            if (!h3) return null;
            table = h3.nextElementSibling;
            while (table && table.tagName !== 'TABLE') table = table.nextElementSibling;
        } else {
            table = document.querySelector('table.tbl');
        }
        if (!table) return null;
        const headers = Array.from(table.querySelectorAll('thead tr:first-child > th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        const row = table.querySelectorAll('tbody tr')[ri];
        const cell = {};
        headers.forEach((h, i) => {
            cell[h] = row && row.cells[i] ? row.cells[i].textContent.replace(/\s+/g, ' ').trim() : null;
        });
        return { headers, rowCellCount: row ? row.cells.length : -1, cell };
    }, [categoryName, rowIdx]);
}

for (const variant of [
    { pt: 'tag-value', url: 'https://musicbrainz.org/tag/arena%20rock', button: 'Show all Entities tagged' },
    { pt: 'user-tag-value', url: 'https://musicbrainz.org/user/vzell/tag/arena%20rock', button: 'Tag for Entities upvoted' },
]) {
    test.describe(`${variant.pt}: Artists as the first section`, () => {
        test.beforeEach(async ({ page }) => {
            await openAndRender(page, variant.url, MULTI_FIXTURE, variant.button);
        });

        for (const [group, mainCol, title, artist] of [
            ['Release groups', 'Release group', 'Back in Black', 'AC/DC'],
            ['Releases', 'Release', 'Singularity', 'Sunspot'],
            ['Recordings', 'Recording', 'It’s a Long Way to the Top', 'AC/DC'],
        ]) {
            test(`${group}: an "Artist" header stands over the artist cell, MB-Name over the title`, async ({ page }) => {
                const s = await readShape(page, group);
                expect(s, `${group} table not found`).not.toBeNull();
                expect(s.headers[0]).toBe(mainCol);
                expect(s.headers, `${group}: artistCredit's header is missing`).toContain('Artist');
                expect(s.headers.indexOf('Artist')).toBeLessThan(s.headers.indexOf('MB-Name'));
                expect(s.rowCellCount, `${group}: header count != cell count`).toBe(s.headers.length);
                expect(s.cell.Artist).toContain(artist);
                expect(s.cell['MB-Name']).toContain(title);
                expect(s.cell['MB-Name']).not.toContain(artist);
            });
        }

        test('Artists keeps its own disambiguation as Comment', async ({ page }) => {
            const s = await readShape(page, 'Artists');
            expect(s.headers[0]).toBe('Artist');
            expect(s.rowCellCount).toBe(s.headers.length);
            expect(s.cell.Comment).toContain('Australian hard rock band');
        });

        test('an artist credit\'s comment is never the entity\'s Comment', async ({ page }) => {
            const rg = await readShape(page, 'Release groups');
            expect(rg.cell.Comment).toBe('');
            expect(rg.cell['Primary alias']).toBe('');
            const rel = await readShape(page, 'Releases');
            expect(rel.cell.Comment).toBe('');
            const rec = await readShape(page, 'Recordings');
            expect(rec.cell.Comment).toContain('original Australian mix');
            expect(rec.cell.Comment).not.toContain('Australian hard rock band');
        });
    });
}

for (const variant of [
    { pt: 'tag-value-entity', url: 'https://musicbrainz.org/tag/arena%20rock/release-group', fixture: SINGLE_FIXTURE, button: 'Show all Entities tagged' },
    { pt: 'user-tag-value-entity', url: 'https://musicbrainz.org/user/vzell/tag/arena%20rock/release-group', fixture: USER_SINGLE_FIXTURE, button: 'Tag for Entities upvoted' },
]) {
    test.describe(`${variant.pt}: "Title by Artist (comment)" rows`, () => {
        test.beforeEach(async ({ page }) => {
            await openAndRender(page, variant.url, variant.fixture, variant.button);
        });

        test('Comment is the release group\'s own, never the artist\'s', async ({ page }) => {
            const s = await readShape(page, null, 0);
            expect(s).not.toBeNull();
            expect(s.rowCellCount).toBe(s.headers.length);
            expect(s.cell.Artist).toContain('AC/DC');
            expect(s.cell['MB-Name']).toContain('Back in Black');
            expect(s.cell.Comment).toBe('');

            const both = await readShape(page, null, 1);
            expect(both.cell['MB-Name']).toContain('Corporate America');
            expect(both.cell.Comment).toContain('remaster');
            expect(both.cell.Comment).not.toContain('US rock band');
        });
    });
}
