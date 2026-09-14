'use strict';

// Regression for "Relationships column missing on artist-relationships'
// work-related sub-tables" (reported against
// /artist/70248960-cb53-4ea4-943a-edb18f7d336f/relationships).
//
// artist-relationships has NO entityFeatures map — one flat `features`
// block, injectedColumns declared page-wide — and groups its sub-tables by
// RELATIONSHIP TYPE (h3 = "wrote work", "producer", …), not by entity kind —
// confirmed against a real capture (debug/artist-relationships.html, the
// "wrote work" sub-section uncollapsed): the Title column is not even the
// first cell there (native order is Date, Title, Credited as, Attributes,
// Artist), and its only content is a bare /work/<mbid> link with no
// secondary reference anywhere else in the row.
// _suppressRelationshipsIfNoReleaseOrReleaseGroupLinks() used to check ONLY
// for a /release//release-group/ link and exempt entityType 'work'/'label'
// ONLY when the page-wide default (activeInjectedColumns[0]) already equalled
// one of those — which artist-relationships' page-wide default never does
// (it falls through buildActiveInjectedColumns()'s generic 'release' branch).
// The scan always found nothing for a work-targeted group and stripped the
// column outright.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/relationships';
const FIXTURE_FILE = path.join(__dirname, 'artist-relationships-work-column.html');

const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

test('"wrote work" (work-targeted) sub-table keeps its Relationships column and queries entityType "work"',
    async ({ page }) => {
        const ws2 = [];
        await loadUserscriptPage(page, {
            url: URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_relationships_column: true, sa_rel_collapse_threshold: 50 },
        });
        await page.route('**/ws/2/**', (route) => {
            ws2.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
        });
        await page.click('button[data-label="Show all Relationships for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const shape = await page.evaluate(() => {
            const table = document.querySelector('table.tbl');
            const th = table.querySelector('thead tr:first-child th[data-col-name="Relationships"]');
            const td = table.querySelector('tbody td.mb-rel-cell');
            return {
                hasColumn: !!th,
                hasCell: !!td,
                mbid: td ? td.dataset.mbid || null : null,
                tableEntityType: table.dataset.mbRelEntityType || null,
            };
        });

        expect(shape.hasColumn, 'expected a Relationships <th> to survive').toBe(true);
        expect(shape.hasCell).toBe(true);
        expect(shape.mbid).toBe('745c079d-374e-4436-9448-da92dedef3ce');
        expect(shape.tableEntityType).toBe('work');

        await expect.poll(() => ws2.some((u) => u.includes('/ws/2/work/')), { timeout: 10000 }).toBe(true);
        expect(ws2.some((u) => u.includes('/ws/2/release/'))).toBe(false);
    });
