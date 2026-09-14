'use strict';

// Regression for "Relationships column missing on release-group/release/
// label/work tables" (reported against /tag/rock and
// /user/vzell/tag/back%20scan%20missing).
//
// Root cause 1: `activeInjectedColumns` used to be resolved exactly ONCE,
// page-wide, from whichever entityFeatures key resolveEntityFeaturesFromH2()
// happened to pick at the top of startFetchingProcess(). tag-value's real
// <h2> ("Entities tagged as X") never matches any entityFeatures key, so
// that resolution always fell back to the FIRST declared key ('Areas',
// which declares no injectedColumns) — hiding the column for the WHOLE
// page, including 'Release groups'/'Releases' groups that DO declare it.
// The per-group extractor-rebuild block (already used to fix column
// extractors — see tag-value-entity-column-leak.spec.js) now also rebuilds
// activeInjectedColumns per group.
//
// Root cause 2: buildActiveInjectedColumns() picked the WS2 entityType by a
// pageType-string switch alone, which can't distinguish 'Release groups'
// from 'Labels' from 'Works' when they all share pageType 'tag-value'. It
// now also accepts an entityKindHint (here: the group's own category name),
// which is why the assertions below check not just "the column exists" but
// "the WS2 request used the RIGHT entity-type path segment" — a column that
// exists but queries the wrong entity type is just as broken as no column
// at all, and each bug could mask the other.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const TAG_URL = 'https://musicbrainz.org/tag/rock';
const FIXTURE_FILE = path.join(__dirname, 'tag-value-relationships-column.html');

// One url-rel, so a populated cell can be told apart from an empty one.
const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

/**
 * Reads one sub-table's Relationships-column shape by its h3 category text.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} categoryName
 * @returns {Promise<{hasColumn: boolean, hasCell: boolean, mbid: string|null}|null>}
 */
function readRelShapeForGroup(page, categoryName) {
    return page.evaluate((name) => {
        const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes(name));
        if (!h3) return null;
        let table = h3.nextElementSibling;
        while (table && table.tagName !== 'TABLE') table = table.nextElementSibling;
        if (!table) return null;
        const th = table.querySelector('thead tr:first-child th[data-col-name="Relationships"]');
        const td = table.querySelector('tbody td.mb-rel-cell');
        return {
            hasColumn: !!th,
            hasCell: !!td,
            mbid: td ? td.dataset.mbid || null : null,
        };
    }, categoryName);
}

test.describe('tag-value: Relationships column present on Labels/Release groups/Releases/Works', () => {
    let ws2Urls;

    test.beforeEach(async ({ page }) => {
        ws2Urls = [];
        await loadUserscriptPage(page, {
            url: TAG_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            // loadPage.js's FIXTURE_SETTINGS_OVERRIDE forces this off for every
            // fixture spec — without it the whole subject of this file is absent.
            // Threshold well above the fixture's 1-row groups so the column
            // renders expanded and fires the WS2 request the assertions inspect.
            settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 50 },
        });
        await page.route('**/ws/2/**', (route) => {
            ws2Urls.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
        });
        await page.click('button[data-label="Show all Entities tagged"]');
        await page.waitForSelector('#mb-filter-container');
    });

    test('Areas (control group, no injectedColumns declared) gets no Relationships column', async ({ page }) => {
        const shape = await readRelShapeForGroup(page, 'Areas');
        expect(shape).not.toBeNull();
        expect(shape.hasColumn).toBe(false);
        expect(shape.hasCell).toBe(false);
    });

    for (const [group, entityType] of [
        ['Labels', 'label'],
        ['Release groups', 'release-group'],
        ['Releases', 'release'],
        ['Works', 'work'],
    ]) {
        test(`${group} gets the Relationships column, with the correct WS2 entity type ("${entityType}")`,
            async ({ page }) => {
                const shape = await readRelShapeForGroup(page, group);
                expect(shape, `${group} table/heading not found`).not.toBeNull();
                expect(shape.hasColumn, `${group}: expected a Relationships <th>`).toBe(true);
                expect(shape.hasCell, `${group}: expected a .mb-rel-cell <td>`).toBe(true);
                expect(shape.mbid, `${group}: expected the cell to carry a resolved MBID`).not.toBeNull();

                // The column exists AND targets the right entity — the WS2 path
                // segment is `entityType` from buildActiveInjectedColumns(), so a
                // wrong hint resolution (e.g. defaulting to 'release' for a
                // 'Release groups'/'Labels'/'Works' group) shows up here even
                // though the column itself rendered.
                await expect.poll(() => ws2Urls.some((u) => u.includes(`/ws/2/${entityType}/`)),
                    { timeout: 10000 }).toBe(true);
            });
    }

    test('no request ever queries entityType "release" for a Labels/Release-groups/Works row',
        async ({ page }) => {
            // Mutation guard for the specific old bug: buildActiveInjectedColumns()
            // defaulted every pageType other than artist-releasegroups/artist-works
            // to 'release', so before the entityKindHint fix every one of these
            // groups' WS2 requests (if the column had existed at all) would have
            // hit /ws/2/release/<mbid> instead of their own real entity type.
            for (const group of ['Labels', 'Release groups', 'Releases', 'Works']) {
                await readRelShapeForGroup(page, group);
            }
            await expect.poll(() => ws2Urls.length, { timeout: 10000 }).toBeGreaterThanOrEqual(4);

            const releaseGroupMbid = '/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
            const labelMbid = '/c595c289-47ce-4fba-b999-b87503a8db19';
            const workMbid = '/745c079d-374e-4436-9448-da92dedef3ce';

            expect(ws2Urls.some((u) => u.includes(`/ws/2/release${releaseGroupMbid}`))).toBe(false);
            expect(ws2Urls.some((u) => u.includes(`/ws/2/release${labelMbid}`))).toBe(false);
            expect(ws2Urls.some((u) => u.includes(`/ws/2/release${workMbid}`))).toBe(false);
        });
});
