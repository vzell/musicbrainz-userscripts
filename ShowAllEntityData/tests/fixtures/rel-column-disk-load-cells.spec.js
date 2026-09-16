'use strict';

// Load-from-Disk: a snapshot saved WITHOUT a populated Relationships column
// must still get the column built — cells included — not just its <th>.
//
// ── The defect this pins (DEBUG-NOTES.md 2026-09-16) ────────────────────────
//
// 9.99.1086 (442dd8c) gated both `initRelationshipsColumn()` call sites, and
// the impl's own entry, on `_relPageHasColumn()` — i.e. on a `td.mb-rel-cell`
// already existing in the DOM. On the LIVE path that is correct and deliberate
// (see that function's JSDoc: a rel `<td>` is appended during the row-build
// pass, so its presence is the right page-wide answer even when the shared
// `activeInjectedColumns` reflects only the last-rendered group).
//
// On the Load-from-Disk path the premise is false. Rows are rebuilt from the
// snapshot, and `_hydrateAndRenderFromSnapshotData()` stamps `mb-rel-cell` only
// on cells whose SAVED payload carried an `mbid` — which `_buildDiskCellData()`
// writes only for a cell that already was a rel cell at save time. The cells
// for a file saved without the column are created by `_ensureRelCell()`, which
// lives INSIDE `initRelationshipsColumn()`. So the guard asked for the cells
// that the function it guarded is the thing that creates.
//
// ── Why the <th>-vs-<td> assertion is the important one ─────────────────────
//
// The header is injected from `activeInjectedColumns` regardless, so the
// failure is not "no icons" — it is a table MISALIGNED BY ONE COLUMN, with the
// Picard `<td>` sitting under the Relationships `<th>`. Measured on the Dylan
// fixture: 22 `<th>` against 21 `<td>`. An assertion that only counted rel
// cells would pass the day someone "fixes" this by dropping the header instead,
// which would be a different bug wearing the same green tick — so alignment and
// cell presence are asserted separately.
//
// The fixture is chosen for the property that triggers it:
// `releasegroup-releases.json.gz` is a v1.0 snapshot with **mbid=0** on all 147
// of its saved cells (`scripts/check-fixture-rel-cell-fields.js`), on a pageType
// that declares `injectedColumns: ['Relationships']`. The one committed
// snapshot that DOES carry rel fields (`artist-releases-bodeans.json.gz`, 56 of
// 56) is why `tests/live/artist-releases-filter-sort.spec.js` never saw this.
//
// Network-free: the column starts COLLAPSED (`sa_rel_collapse_threshold: 1`),
// and every `**/ws/2/**` request is intercepted and counted, so "the fix does
// not start a fetch on load" is pinned too rather than assumed.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { collectPageErrors } = require('../support/liveAssertions');

// "Tougher Than the Rest" — 7 releases across 2 groups (Official 6, Promotion 1).
// Shell and snapshot must describe the same entity: the shell drives pageType
// detection, the .json.gz supplies the rows.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const PAGE_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const DISK_FIXTURE = path.join(__dirname, 'saved-data', 'releasegroup-releases.json.gz');

const SUB_TABLE_ROWS = [6, 1];
const TOTAL_ROWS = 7;

/**
 * Per-table header/cell shape, read straight from the rendered DOM.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{headerCells: number, rowCellCounts: number[],
 *   relTh: boolean, relToggle: boolean, relCells: number, relCellsWithMbid: number,
 *   expanded: boolean, mbids: string[]}>>}
 */
const readShape = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl')).map((table) => {
        const headRow = table.querySelector('thead tr:first-child');
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        const relTh = Array.from(table.querySelectorAll('thead tr:first-child th'))
            .find((th) => th.dataset.colName === 'Relationships') || null;
        return {
            headerCells: headRow ? headRow.cells.length : 0,
            rowCellCounts: bodyRows.map((tr) => tr.cells.length),
            relTh: !!relTh,
            relToggle: !!(relTh && relTh.querySelector('.mb-rel-col-hdr-btn')),
            relCells: table.querySelectorAll('tbody td.mb-rel-cell').length,
            relCellsWithMbid: table.querySelectorAll('tbody td.mb-rel-cell[data-mbid]').length,
            expanded: table.dataset.mbRelExpanded === '1',
            mbids: Array.from(table.querySelectorAll('tbody td.mb-rel-cell[data-mbid]'))
                .map((td) => td.dataset.mbid),
        };
    }));

// A TALLER VIEWPORT THAN THE PROJECT'S 1280x720, and it is not cosmetic.
// `rel-column-collapse-toggle.spec.js` records the fragility at length: the
// Load-from-Disk dialog is `position: fixed` with `max-height: calc(100vh -
// 40px)` and no `top`, so at 720px its `#sa-render-no-filter-confirm` can land
// below the fold (measured at y≈1051) and Playwright refuses to click an
// element outside the viewport. It flakes `picard-cells-survive-rerender.spec.js`
// roughly one run in three on `main`.
//
// Both sibling rel specs avoid the dialog entirely by loading through "Show
// all" instead. This one cannot: the Load-from-Disk path IS its subject — the
// defect does not exist on the live render path, where the row-build pass
// appends the rel cells before any gate runs. So the dialog has to be clicked,
// and the cheapest reliable way is to give it room. Spec-local on purpose:
// making `diskFixture.js` click through the DOM would retire that flake for
// every disk spec, but that is shared-harness surgery, not this fix's business.
test.use({ viewport: { width: 1280, height: 1600 } });

test.describe('Load-from-Disk: the Relationships column is built for a snapshot that never had it', () => {
    let pageErrors;
    let ws2;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        ws2 = [];
        await page.route('**/ws/2/**', (route) => {
            ws2.push(route.request().url());
            return route.fulfill({
                status: 200, contentType: 'application/json', body: JSON.stringify({ relations: [] }),
            });
        });
        await loadFromDiskFixture(page, {
            url: RG_URL,
            fixturePath: DISK_FIXTURE,
            pageFixtureFile: PAGE_SHELL,
            testMode: true,
            // The column ON (loadPage.js's FIXTURE_SETTINGS_OVERRIDE forces it
            // off for every routed-shell load) and COLLAPSED, which is what the
            // shipped threshold would do on a large table anyway and keeps the
            // run network-free.
            settingsOverride: {
                sa_enable_relationships_column: true,
                sa_rel_collapse_threshold: 1,
            },
        });
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('table.tbl')).toHaveCount(2);
        await expect(page.locator('table.tbl tbody tr')).toHaveCount(TOTAL_ROWS);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('every row has as many cells as the header has columns', async ({ page }) => {
        const shape = await readShape(page);
        expect(shape.map((t) => t.rowCellCounts.length)).toEqual(SUB_TABLE_ROWS);
        shape.forEach((t, i) => {
            expect(t.relTh, `sub-table ${i} has a Relationships header`).toBe(true);
            t.rowCellCounts.forEach((n, row) => {
                expect(n, `sub-table ${i} row ${row}: cells vs header columns`).toBe(t.headerCells);
            });
        });
    });

    test('every row gets a Relationships cell carrying its own mbid', async ({ page }) => {
        const shape = await readShape(page);
        shape.forEach((t, i) => {
            expect(t.relCells, `sub-table ${i} rel cells`).toBe(t.rowCellCounts.length);
            expect(t.relCellsWithMbid, `sub-table ${i} rel cells with data-mbid`)
                .toBe(t.rowCellCounts.length);
        });
    });

    test('the toggle is built, and only the sub-table under the threshold fetches', async ({ page }) => {
        const shape = await readShape(page);
        shape.forEach((t, i) => {
            expect(t.relToggle, `sub-table ${i} has a ▶🔗 toggle`).toBe(true);
        });

        // The threshold is decided PER TABLE, and this fixture's two sub-tables
        // straddle it — which is why it is the right one to assert against.
        // `_relTableExpanded()`: expanded when `uniqueMbidCount <= threshold`
        // (or the threshold is 0, meaning never collapse). At 1, the 6-entity
        // Official table collapses and the 1-entity Promotion table does not.
        expect(shape.map((t) => t.expanded), 'Official collapsed, Promotion expanded')
            .toEqual([false, true]);

        // So exactly one request is CORRECT here, and asserting zero would be
        // asserting a bug. What must hold is that it belongs to the expanded
        // table: the collapsed one's six entities are what the threshold is for,
        // and restoring the column must not have cost them a single request.
        expect(ws2, `WS/2 requests: ${JSON.stringify(ws2)}`).toHaveLength(1);
        expect(ws2[0]).toContain(shape[1].mbids[0]);
        shape[0].mbids.forEach((mbid) => {
            expect(ws2[0], `collapsed sub-table entity ${mbid} was not fetched`).not.toContain(mbid);
        });
    });
});
