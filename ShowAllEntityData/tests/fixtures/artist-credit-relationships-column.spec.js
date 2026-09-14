'use strict';

// Regression for two bugs on /artist-credit/<id> (reported against
// debug/artist-credit.html): (1) the Relationships column missing on
// Release groups/Releases (same architecture bug as tag-value — see
// DEBUG-NOTES.md's 2026-09-14 entry), and (2) 'Recordings' missing its own
// Video/Relationships headers entirely, because 'artist-credit' was absent
// from renderGroupedTable()'s per-group <thead> rebuild branch — every
// sub-table just cloned the single shared templateHead, built once from
// whichever group's extractors the fetch loop (which DID already rebuild
// per group) left active last.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const URL = 'https://musicbrainz.org/artist-credit/1488075';
const FIXTURE_FILE = path.join(__dirname, 'artist-credit-relationships-column.html');

const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/** Reads one sub-table's header names + Relationships-column shape by h3 text. */
function readGroupShape(page, categoryName) {
    return page.evaluate((name) => {
        const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes(name));
        if (!h3) return null;
        let table = h3.nextElementSibling;
        while (table && table.tagName !== 'TABLE') table = table.nextElementSibling;
        if (!table) return null;
        const headers = Array.from(table.querySelectorAll('thead tr:first-child > th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        const relTh = table.querySelector('thead tr:first-child th[data-col-name="Relationships"]');
        const relTd = table.querySelector('tbody td.mb-rel-cell');
        return {
            headers,
            hasRelColumn: !!relTh,
            hasRelCell: !!relTd,
            mbid: relTd ? relTd.dataset.mbid || null : null,
        };
    }, categoryName);
}

test.describe('artist-credit: per-group headers and Relationships column', () => {
    let ws2Urls;

    test.beforeEach(async ({ page }) => {
        ws2Urls = [];
        await loadUserscriptPage(page, {
            url: URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 50 },
        });
        await page.route('**/ws/2/**', (route) => {
            ws2Urls.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
        });
        await page.click('button[data-label="Show all Artist-Credit Uses"]');
        await page.waitForSelector('#mb-filter-container');
    });

    test('Recordings gets its OWN Video header, not a cloned Release-groups/Releases header', async ({ page }) => {
        const shape = await readGroupShape(page, 'Recordings');
        expect(shape).not.toBeNull();
        expect(shape.headers).toEqual(expect.arrayContaining(['Video']));
        // Recordings declares no injectedColumns — must NOT inherit one from
        // whichever of Release groups/Releases the fetch loop processed last.
        expect(shape.hasRelColumn).toBe(false);
    });

    for (const [group, entityType] of [
        ['Release groups', 'release-group'],
        ['Releases', 'release'],
    ]) {
        test(`${group} gets the Relationships column, with the correct WS2 entity type ("${entityType}")`,
            async ({ page }) => {
                const shape = await readGroupShape(page, group);
                expect(shape, `${group} table/heading not found`).not.toBeNull();
                expect(shape.hasRelColumn, `${group}: expected a Relationships <th>`).toBe(true);
                expect(shape.hasRelCell, `${group}: expected a .mb-rel-cell <td>`).toBe(true);
                expect(shape.mbid).not.toBeNull();
                await expect.poll(() => ws2Urls.some((u) => u.includes(`/ws/2/${entityType}/`)),
                    { timeout: 10000 }).toBe(true);
            });
    }
});
