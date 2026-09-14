'use strict';

// Regression for "Relationships column missing on /user/<name>/ratings"
// (reported after the tag-value/report fix — see DEBUG-NOTES.md's
// Relationships-column entries). user-ratings/user-ratings-type used to
// declare NO `injectedColumns` on any entityFeatures key at all, deliberately
// — the key's own former comment cited three reasons: buildActiveInjectedColumns()
// couldn't resolve entityType from anything but pageType, the render-loop
// per-group thead rebuild never re-derived activeInjectedColumns, and
// _initRelationshipsColumnImpl() used one page-wide entityType for a
// page-wide cell scan. All three are now fixed the same way as tag-value's
// equivalent bug, so the column is re-declared on 'Labels'/'Release groups'/
// 'Works' (the three of this page's seven rating categories that fall inside
// the four entity kinds the column supports).
//
// Reuses the same real capture (`user-ratings-multigroup.html`) the existing
// entityFeatures-staleness regression already relies on — Artist/Event/Label/
// Place/Recording/Release group/Work ratings, one real capture, no fixture
// invented for this file.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings';
const FIXTURE_FILE = path.join(__dirname, 'user-ratings-multigroup.html');

const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/** Reads one sub-table's Relationships-column shape by its h3 category text. */
function readRelShapeForGroup(page, categoryName) {
    return page.evaluate((name) => {
        const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes(name));
        if (!h3) return null;
        let table = h3.nextElementSibling;
        while (table && table.tagName !== 'TABLE') table = table.nextElementSibling;
        if (!table) return null;
        const th = table.querySelector('thead tr:first-child th[data-col-name="Relationships"]');
        const td = table.querySelector('tbody td.mb-rel-cell');
        return { hasColumn: !!th, hasCell: !!td, mbid: td ? td.dataset.mbid || null : null };
    }, categoryName);
}

test.describe('user-ratings: Relationships column present on Label/Release group/Work ratings', () => {
    let ws2Urls;

    test.beforeEach(async ({ page }) => {
        ws2Urls = [];
        await loadUserscriptPage(page, {
            url: RATINGS_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 50 },
        });
        await page.route('**/ws/2/**', (route) => {
            ws2Urls.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
        });
        await page.click('button[data-label="Show Ratings for User"]');
        await page.waitForSelector('#mb-filter-container');
    });

    test('Artist ratings (unsupported entity kind) gets no Relationships column', async ({ page }) => {
        const shape = await readRelShapeForGroup(page, 'Artist ratings');
        expect(shape).not.toBeNull();
        expect(shape.hasColumn).toBe(false);
        expect(shape.hasCell).toBe(false);
    });

    for (const [group, entityType] of [
        ['Label ratings', 'label'],
        ['Release group ratings', 'release-group'],
        ['Work ratings', 'work'],
    ]) {
        test(`${group} gets the Relationships column, with the correct WS2 entity type ("${entityType}")`,
            async ({ page }) => {
                const shape = await readRelShapeForGroup(page, group);
                expect(shape, `${group} table/heading not found`).not.toBeNull();
                expect(shape.hasColumn, `${group}: expected a Relationships <th>`).toBe(true);
                expect(shape.hasCell, `${group}: expected a .mb-rel-cell <td>`).toBe(true);
                expect(shape.mbid, `${group}: expected the cell to carry a resolved MBID`).not.toBeNull();
                await expect.poll(() => ws2Urls.some((u) => u.includes(`/ws/2/${entityType}/`)),
                    { timeout: 10000 }).toBe(true);
            });
    }

    test('no request ever queries entityType "release" for a Label/Release-group/Work ratings row',
        async ({ page }) => {
            for (const group of ['Label ratings', 'Release group ratings', 'Work ratings']) {
                await readRelShapeForGroup(page, group);
            }
            await expect.poll(() => ws2Urls.length, { timeout: 10000 }).toBeGreaterThanOrEqual(3);
            expect(ws2Urls.every((u) => !u.includes('/ws/2/release/'))).toBe(true);
        });
});
