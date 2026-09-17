'use strict';

// A plain GLOBAL filter for a CAA image type must find the same rows the same
// query finds with Rx ticked, and the same rows the CAA column filter finds.
// AUDIT.md §3.1 H5, live twin §10 L4b.
//
// Image types and comments are not visible text: _artBuildMultiRowArtCell()
// stores them out of band, and each reader picks them up differently.
//   • getCleanColumnText() reads `ul.mb-caa-art-ul`'s own dataset.mbArtSearch
//     AND, on a source row, the `<td>`'s dataset.mbArtSearchSync — which is the
//     only channel a multi-table source row has (_artSyncSearchTextToSourceRow).
//     The column filter and the regexp global path both go through it.
//   • testRowMatch()'s plain-global fallback reads the `<ul>` alone. On
//     tableMode 'multi' every row runFilter() tests is a source row, which never
//     carries that `<ul>`, so the plain global query matched nothing.
//
// Network-free: coverartarchive metadata is answered by page.route, thumbnails
// by a GM_xmlhttpRequest wrapper.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { columnFilterInput, waitForFilterSettled } = require('../support/filterSortAssertions');

// "Tougher Than the Rest" — 7 releases in 2 sub-tables, tableMode 'multi'.
const RELEASE_GROUP = {
    url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
    shell: path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html'),
    routeGlob: 'https://musicbrainz.org/release-group/**',
    button: 'button[data-label="Show all Releases for ReleaseGroup"]',
};

// The needle: one release gets a "Back" image, every other release "Front".
// "Back" appears nowhere in these rows' visible text, so a plain global query
// for it can only match through the art search index.
const NEEDLE = 'Back';

/** Release MBIDs in document order, from the shell the page is served from. */
function releaseMbids() {
    const html = require('fs').readFileSync(RELEASE_GROUP.shell, 'utf8');
    const seen = [];
    for (const m of html.matchAll(/href="\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g)) {
        if (!seen.includes(m[1])) seen.push(m[1]);
    }
    return seen;
}

/**
 * Loads the release group with artwork on, answering every release's metadata
 * with one image whose type is "Back" for `backMbid` and "Front" otherwise.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} backMbid
 */
async function openWithArtwork(page, backMbid) {
    await loadUserscriptPage(page, {
        url: RELEASE_GROUP.url,
        fixtureFile: RELEASE_GROUP.shell,
        testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true,
            sa_caa_pics_inline: true,
            sa_enable_relationships_column: false,
        },
    });
    await page.route(RELEASE_GROUP.routeGlob,
        (route) => route.fulfill({ path: RELEASE_GROUP.shell, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}$/, (route) => {
        const mbid = route.request().url().split('/').pop();
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                images: [{
                    id: 1, types: [mbid === backMbid ? 'Back' : 'Front'], front: mbid !== backMbid,
                    back: mbid === backMbid, comment: '', approved: true,
                    image: `https://coverartarchive.org/release/${mbid}/1.jpg`,
                    thumbnails: { 250: `https://coverartarchive.org/release/${mbid}/1-250.jpg` },
                }],
            }),
        });
    });
    // Thumbnails go through GM_xmlhttpRequest, which page.route cannot see.
    await page.evaluate(() => {
        const original = window.GM_xmlhttpRequest;
        window.GM_xmlhttpRequest = (opts) => {
            if (!/\/front-/.test((opts && opts.url) || '')) return original(opts);
            setTimeout(() => opts.onload({ status: 404, response: null, responseText: '' }), 0);
            return { abort() {} };
        };
    });

    await page.click(RELEASE_GROUP.button);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
}

/** Rows rendered across every sub-table — runFilter() REMOVES non-matching rows. */
const renderedRows = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length);

/** Rows rendered in one sub-table only. A column filter narrows just its own. */
const renderedRowsIn = (page, tableIndex) => page.evaluate((i) => Array.from(
    document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
    .filter((r) => r.style.display !== 'none').length, tableIndex);

/** Index of the sub-table holding the row whose CAA cell carries `label`. */
const tableIndexOfBadge = (page, label) => page.evaluate((want) => {
    const tables = Array.from(document.querySelectorAll('table.tbl'));
    return tables.findIndex((t) => Array.from(t.querySelectorAll('tbody .mb-caa-type-badge > span'))
        .some((s) => s.textContent.trim() === want));
}, label);

/** How many rendered cells carry a type badge reading `label`. */
const badgeRows = (page, label) => page.evaluate((want) => Array.from(
    document.querySelectorAll('table.tbl tbody tr'))
    .filter((r) => Array.from(r.querySelectorAll('.mb-caa-type-badge > span'))
        .some((s) => s.textContent.trim() === want)).length, label);

/** Waits until every release's metadata has been applied. */
async function waitForArtSettled(page, total) {
    await expect.poll(() => page.evaluate(() => document.querySelectorAll(
        'table.tbl tbody .mb-caa-count-badge').length), {
        timeout: 20000, message: 'every CAA cell settles',
    }).toBe(total);
}

test.describe('global filter vs. CAA image types (multi-table)', () => {
    let pageErrors;
    let mbids;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        mbids = releaseMbids();
        await openWithArtwork(page, mbids[1]);
        await waitForArtSettled(page, mbids.length);
        expect(await badgeRows(page, NEEDLE), 'exactly one row carries a "Back" image').toBe(1);
        expect(await renderedRows(page), 'and it is not the only row').toBeGreaterThan(1);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('control: the CAA column filter finds the "Back" row', async ({ page }) => {
        // Scoped to the sub-table that owns the filter: a column filter narrows
        // its own sub-table only, so a page-wide row count would also count the
        // other sub-table's untouched rows.
        const tableIndex = await tableIndexOfBadge(page, NEEDLE);
        expect(tableIndex, 'the "Back" row was located').toBeGreaterThan(-1);
        const colIdx = await page.evaluate((i) => Array.from(
            document.querySelectorAll('table.tbl')[i].querySelector('thead tr:first-child').cells)
            .findIndex((t) => (t.dataset.colName || '') === 'CAA'), tableIndex);
        expect(colIdx, 'the CAA column exists').toBeGreaterThan(-1);
        const input = columnFilterInput(page, colIdx, { tableIndex });
        await input.click();
        await input.pressSequentially(NEEDLE);
        await expect.poll(() => renderedRowsIn(page, tableIndex), {
            timeout: 15000, message: 'control: the column filter narrows its sub-table to the one "Back" row',
        }).toBe(1);
    });

    test('control: a regexp global filter finds the "Back" row', async ({ page }) => {
        await page.locator('#mb-global-filter-rx-checkbox').check();
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', NEEDLE));
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'control: the regexp global filter narrows to the one "Back" row',
        }).toBe(1);
    });

    test('H5: a plain global filter finds the "Back" row too', async ({ page }) => {
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', NEEDLE));
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'H5: the plain global filter narrows to the one "Back" row',
        }).toBe(1);
    });

    test('a plain global filter for an absent image type matches nothing', async ({ page }) => {
        // The other half of the contract: reading the art index must not make
        // every row match, which is how a too-eager fix would pass the test above.
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'Booklet'));
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'an image type no row carries matches no rows',
        }).toBe(0);
    });
});
