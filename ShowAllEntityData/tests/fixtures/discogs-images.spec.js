'use strict';

// discogs.com: a release's Images page and its image editor ("Image
// history") as pageTypes `dg-images` and `dg-image-history` (Phase 4 of
// org/MB-POH-sync-withDiscogs.org, 2026-10-27). Both get ONE table of every
// image (vzell: the Images page the same as the Image history), built from
// the images reader's record (`_extDgImgLoad()`): Discogs' API (through the
// GM stub) and the image editor's data, `/release/<id>/images/data`, read
// same-origin here with the session. The editor's PAGE is served as the
// server sends it, its list empty (Discogs' script draws it): reading the
// page instead of the data finds nothing, which is how the first build
// failed in vzell's browser (DEBUG-NOTES 2026-10-28). The reader's window
// from MusicBrainz is popup-ext.spec.js's.
//
// Pins:
//   - the gate and the definitions: both pages get the one button, not the
//     release's (whose path pattern takes /images too);
//   - one API request and one editor request, nothing else; the rows in
//     Discogs' order with the editor's uploader, date, own size and file
//     size, from the data in Discogs' order;
//   - the size column sorts as a number (KB), the date split in two;
//   - signed out (the editor shows nothing): the API's 17 images remain.
//
// Fixtures: dg-release-images.html, dg-release-images-update.html,
// dg-release-images-data.json (scripts/build-discogs-fixtures.py), ext-discogs-release-1313481.json
// (scripts/probe-dg-release-images.py --fixture). Mutations:
// scripts/mutations/dg-images.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const API_FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'ext-discogs-release-1313481.json'), 'utf8'));
const IMAGES_FILE = path.join(__dirname, 'dg-release-images.html');
const EDITOR_FILE = path.join(__dirname, 'dg-release-images-update.html');
const DATA_FILE = path.join(__dirname, 'dg-release-images-data.json');
const PAGES = {
    images: 'https://www.discogs.com/release/1313481-Born-To-Run/images',
    editor: 'https://www.discogs.com/release/1313481-Born-To-Run/images/update',
};
// What the load asks on discogs.com: the editor's data, same-origin.
const DATA = 'https://www.discogs.com/release/1313481/images/data';

/**
 * Loads one of the two pages on discogs.com with the API answered and the
 * editor's data served by `editor` (the fixture by default).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url?: string, file?: string, editor?: ?function(import('@playwright/test').Route): Promise<void>}} [opts]
 * @returns {Promise<{errors: string[], asked: string[]}>}
 */
async function openImages(page, { url = PAGES.editor, file = EDITOR_FILE, editor = null } = {}) {
    const errors = [];
    const asked = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.route(DATA, (route) => {
        asked.push(route.request().url());
        return editor ? editor(route) : route.fulfill({ path: DATA_FILE, contentType: 'application/json' });
    });
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
        { [API_FX.url]: { status: API_FX.status, responseHeaders: `Content-Type: ${API_FX.contentType}`, responseText: API_FX.body } });
    await loadUserscriptPage(page, {
        url, fixtureFile: file, testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
    });
    return { errors, asked };
}

/**
 * Presses "Show every image" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} The table.
 */
async function showImages(page) {
    await page.locator('#mb-dg-root button[data-label="Show every image"]').click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.locator('#mb-dg-root table.tbl').first();
}

const heads = (table) => table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
const apiLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://api.discogs.com/')));

/**
 * The texts of one row's cells, by column name.
 *
 * @param {import('@playwright/test').Locator} table
 * @param {number} row
 * @returns {Promise<Object<string, string>>}
 */
async function rowOf(table, row) {
    const hs = await heads(table);
    const cells = await table.locator('tbody > tr').nth(row).locator(':scope > td').allTextContents();
    return Object.fromEntries(hs.map((h, i) => [h, (cells[i] || '').trim()]));
}

test.describe('discogs.com: a release\'s Images and Image history (Phase 4)', () => {
    test.use({ timezoneId: 'Europe/Berlin' });
    test('the image editor: one button, two requests, every image with its uploader, date, own size and file size', async ({ page }) => {
        const { errors, asked } = await openImages(page);
        await expect(page.locator('#mb-dg-root button[data-label]')).toHaveCount(1);
        expect(asked, 'nothing before the press').toEqual([]);
        const table = await showImages(page);
        await expect(table.locator('tbody > tr')).toHaveCount(17);
        expect(asked).toEqual([DATA]);
        expect(await apiLog(page)).toEqual(['https://api.discogs.com/releases/1313481']);
        // The live page's own list stays empty: nothing was read from it.
        await expect(page.locator('#image_uploader_app')).toBeEmpty();
        expect(await heads(table)).toEqual(expect.arrayContaining(['#', 'Image', 'Type', 'Uploaded by', 'Uploaded date', 'Uploaded time', 'W × H', 'Size (KB)']));
        expect(await rowOf(table, 0)).toMatchObject({
            '#': '1', Type: 'Primary', 'Uploaded by': 'dsmith', 'Uploaded date': '2008-05-20', 'Uploaded time': '01:46', 'W × H': '500 × 500', 'Size (KB)': '127',
        });
        expect(await rowOf(table, 4)).toMatchObject({ Type: 'Secondary', 'Uploaded by': 'Cl0ver', 'W × H': '2002 × 2000', 'Size (KB)': '1168' });
        // The thumbnail links the API's 600 px image (the card's and the viewer's).
        const first = table.locator('tbody > tr').first().locator('a.mb-dg-thumblink');
        await expect(first).toHaveAttribute('href', /\/w:500\/czM6Ly9kaXNjb2dz\/LWRhdGFiYXNlLWlt\/YWdlcy9SLTEzMTM0\/ODEtMTIxMTI0MDgw\/OC5qcGVn\.jpeg$/);
        await expect(first.locator('img'), 'the editor\'s 300 px thumbnail').toHaveAttribute('src', /\/w:300\//);
        await expect(table.locator('tbody > tr').first().locator('a[href="https://www.discogs.com/user/dsmith"]')).toHaveCount(1);
        expect(errors).toEqual([]);
    });

    test('the Images page: the same table, from the editor', async ({ page }) => {
        const { errors, asked } = await openImages(page, { url: PAGES.images, file: IMAGES_FILE });
        const table = await showImages(page);
        await expect(table.locator('tbody > tr')).toHaveCount(17);
        expect(asked).toEqual([DATA]);
        expect(await rowOf(table, 16)).toMatchObject({ '#': '17', 'Uploaded by': 'heaven83', 'W × H': '1655 × 1427', 'Size (KB)': '502' });
        expect(errors).toEqual([]);
    });

    test('Size (KB) sorts as a number', async ({ page }) => {
        await openImages(page);
        const table = await showImages(page);
        const th = table.locator('thead tr:first-child th[data-col-name="Size (KB)"]');
        await th.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const sizes = async () => (await table.locator('tbody > tr').evaluateAll((trs, i) => trs.map(tr => Number(tr.cells[i].textContent.trim())),
            (await heads(table)).indexOf('Size (KB)')));
        const asc = await sizes();
        expect(asc[0]).toBe(70);
        expect(asc[asc.length - 1]).toBe(3466);
        expect(asc).toEqual([...asc].sort((a, b) => a - b));
    });

    test('signed out (the data answers the login page): the API\'s 17 images, types and order, the editor\'s columns empty', async ({ page }) => {
        const { errors } = await openImages(page, {
            editor: (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><div id="page_content"><form id="login"></form></div></body></html>' }),
        });
        const table = await showImages(page);
        await expect(table.locator('tbody > tr')).toHaveCount(17);
        expect(await rowOf(table, 0)).toMatchObject({ '#': '1', Type: 'Primary', 'Uploaded by': '', 'W × H': '', 'Size (KB)': '' });
        expect(errors).toEqual([]);
    });
});
