'use strict';

// Regression: on release listings the Relationships column looked every row up
// as a LABEL — `/ws/2/label/<release mbid>` — so on the live site each lookup
// 404ed and every cell showed "no relationships".
//
// ── Root cause ───────────────────────────────────────────────────────────────
//
// `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` gained a work/label
// sniff in 442dd8c, for artist-relationships' work- and label-targeted
// sub-tables, whose only entity link is the row's own title. It ran BEFORE the
// release/release-group scan. A release listing's own "Label" column carries a
// /label/<mbid> link on nearly every row, so the sniff stamped the whole table
// `mbRelEntityType = 'label'` and returned. series-releases escaped only because
// pageTypes with an entityFeatures map skip the sniff altogether.
//
// ── What is pinned, and the adjacent property it must not be confused with ──
//
// The REQUEST's entity type, not the presence of icons. The test route answers
// any URL with a relationship, which is exactly how every existing spec kept
// passing while the column was broken live: a label lookup "found" icons too.
//
// The case the sniff exists for — a work-targeted sub-table with no release
// link at all — stays covered by artist-relationships-work-column.spec.js.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll, collectPageErrors } = require('../support/liveAssertions');

// "Tougher Than the Rest" — 7 releases across 2 sub-tables (Official 6,
// Promotion 1), `tableMode: 'multi'`. Every row has a "Label" column link.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_ROWS = 7;

const WS2_BODY = JSON.stringify({
    relations: [{
        'target-type': 'url',
        type: 'discogs',
        url: { resource: 'https://www.discogs.com/release/1' },
    }],
});

test.describe('Relationships column on a release listing looks up RELEASES', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('releasegroup-releases: every lookup is /ws/2/release/<the row\'s own release>, never /ws/2/label/',
        async ({ page }) => {
            const ws2 = [];
            await loadUserscriptPage(page, {
                url: RG_URL,
                fixtureFile: RG_SHELL,
                testMode: true,
                // loadPage.js forces the column off for fixture specs. Threshold
                // above the 6 + 1 rows, so both sub-tables fetch at render.
                // The browse bulk source is switched off: this spec counts and
                // classifies per-row LOOKUPS, and on this shell one browse page
                // would answer the 6-row sub-table. The browse request's own
                // entity is pinned by rel-column-browse-batch.spec.js.
                settingsOverride: {
                    sa_enable_relationships_column: true,
                    sa_rel_collapse_threshold: 50,
                    sa_rel_browse_batch_enable: false,
                },
            });
            await page.route('**/ws/2/**', (route) => {
                ws2.push(route.request().url());
                return route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY });
            });
            await page.route('https://musicbrainz.org/release-group/**',
                (route) => route.fulfill({ path: RG_SHELL, contentType: 'text/html' }));
            await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });
            // releasegroup-releases renders its sub-sections COLLAPSED.
            await clickMasterToggleAndExpandAll(page);
            await expect.poll(() => ws2.length, { timeout: 30000 }).toBe(RG_ROWS);

            const shape = await page.evaluate(() => ({
                stamps: Array.from(document.querySelectorAll('table.tbl'))
                    .filter((t) => t.querySelector('tbody td.mb-rel-cell'))
                    .map((t) => t.dataset.mbRelEntityType || null),
                cellMbids: Array.from(document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]'))
                    .map((td) => td.dataset.mbid),
                releaseMbids: Array.from(document.querySelectorAll('table.tbl tbody a[href^="/release/"]'))
                    .map((a) => (a.getAttribute('href').match(/^\/release\/([0-9a-f-]{36})/) || [])[1])
                    .filter(Boolean),
            }));

            expect(shape.stamps, 'each sub-table is stamped as a RELEASE table').toEqual(['release', 'release']);

            const paths = ws2.map((u) => new URL(u).pathname);
            expect(paths.filter((p) => p.startsWith('/ws/2/label/')), 'no row is looked up as a label').toEqual([]);
            for (const p of paths) expect(p, 'a release lookup').toMatch(/^\/ws\/2\/release\/[0-9a-f-]{36}$/);

            // …and each looked-up MBID is a release that is actually on the page,
            // so the right entity type is paired with the right id.
            const releases = new Set(shape.releaseMbids);
            expect(shape.cellMbids).toHaveLength(RG_ROWS);
            for (const m of shape.cellMbids) {
                expect(releases.has(m), `cell MBID ${m} is one of the page's releases`).toBe(true);
            }
        });
});
