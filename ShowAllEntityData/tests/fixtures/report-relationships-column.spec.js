'use strict';

// Regression for "Relationships column missing on report-multiple-linked/
// report-detail pages" (reported against /report/ASINsWithMultipleReleases
// and /report/DiscogsLinksWithMultipleReleaseGroups), extended broadly to
// the whole report family per the approved plan.
//
// Both pageTypes share ONE definition across ~117 differently-shaped
// reports, so buildActiveInjectedColumns() can't resolve the WS2 entityType
// from pageType alone — it now resolves it dynamically, per report, from
// whichever column name actually matched as the report's main column
// (headerNames[mainColIdx] in startFetchingProcess's fetch loop). A report
// whose main column isn't Release/Release group/Label/Work (e.g. Place)
// must get NO column at all, rather than silently defaulting to 'release'.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/**
 * Loads a report fixture, routes WS2 + the report's own re-fetch, clicks
 * "Show all (unfiltered)", and waits for render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url: string, fixtureFile: string, ws2Urls: string[]}} opts
 */
async function loadReportPage(page, { url, fixtureFile, ws2Urls }) {
    await loadUserscriptPage(page, {
        url,
        fixtureFile,
        testMode: true,
        settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 50 },
    });
    await page.route('**/ws/2/**', (route) => {
        ws2Urls.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
    });
    await page.route(`${url}?**`, (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));

    await page.click('button[data-label="Show all (unfiltered)"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const readRelShape = (page) => page.evaluate(() => {
    const table = document.querySelector('table.tbl');
    const th = table.querySelector('thead tr:first-child th[data-col-name="Relationships"]');
    const td = table.querySelector('tbody td.mb-rel-cell');
    return { hasColumn: !!th, hasCell: !!td, mbid: td ? td.dataset.mbid || null : null };
});

test.describe('report-multiple-linked/report-detail: Relationships column resolved per report', () => {
    test('ASINsWithMultipleReleases: gets the column, WS2 request targets entityType "release"',
        async ({ page }) => {
            const ws2 = [];
            await loadReportPage(page, {
                url: 'https://musicbrainz.org/report/ASINsWithMultipleReleases',
                fixtureFile: path.join(__dirname, 'asins-with-multiple-releases.html'),
                ws2Urls: ws2,
            });
            const shape = await readRelShape(page);
            expect(shape.hasColumn).toBe(true);
            expect(shape.hasCell).toBe(true);
            expect(shape.mbid).not.toBeNull();
            await expect.poll(() => ws2.some((u) => u.includes('/ws/2/release/')), { timeout: 10000 }).toBe(true);
            expect(ws2.some((u) => u.includes('/ws/2/release-group/'))).toBe(false);
        });

    test('DiscogsLinksWithMultipleReleaseGroups: gets the column, WS2 request targets entityType "release-group"',
        async ({ page }) => {
            const ws2 = [];
            await loadReportPage(page, {
                url: 'https://musicbrainz.org/report/DiscogsLinksWithMultipleReleaseGroups',
                fixtureFile: path.join(__dirname, 'discogs-links-with-multiple-releasegroups.html'),
                ws2Urls: ws2,
            });
            const shape = await readRelShape(page);
            expect(shape.hasColumn).toBe(true);
            expect(shape.hasCell).toBe(true);
            expect(shape.mbid).not.toBeNull();
            await expect.poll(() => ws2.some((u) => u.includes('/ws/2/release-group/')), { timeout: 10000 }).toBe(true);
            // The old pageType-string default ('release' for anything not
            // artist-releasegroups/artist-works) is the specific regression this
            // guards: a Release-group report must never be queried as 'release'.
            expect(ws2.some((u) => u.includes('/ws/2/release/'))).toBe(false);
        });

    test('PlacesWithoutCoordinates (report-detail, main column "Place"): gets NO Relationships column',
        async ({ page }) => {
            const ws2 = [];
            await loadReportPage(page, {
                url: 'https://musicbrainz.org/report/PlacesWithoutCoordinates',
                fixtureFile: path.join(__dirname, 'places-without-coordinates.html'),
                ws2Urls: ws2,
            });
            const shape = await readRelShape(page);
            expect(shape.hasColumn).toBe(false);
            expect(shape.hasCell).toBe(false);
            // No column ⇒ no distinct-entity lookup to perform at all.
            await page.waitForTimeout(500);
            expect(ws2).toHaveLength(0);
        });
});
