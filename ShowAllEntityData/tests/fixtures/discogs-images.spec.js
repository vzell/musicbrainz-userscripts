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
 * @param {{url?: string, file?: string, editor?: ?function(import('@playwright/test').Route): Promise<void>, settings?: Object}} [opts]
 * @returns {Promise<{errors: string[], asked: string[]}>}
 */
async function openImages(page, { url = PAGES.editor, file = EDITOR_FILE, editor = null, settings = {} } = {}) {
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
        settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000, ...settings },
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

// vzell, 2026-11-10: "the images in the Image column should get our standard
// hovered image handling + internal view support". The thumbnails were
// `_DG_FI`'s, whose row is the release of a Title link these tables do not
// have: no card at all. A row here IS one image: provider `_DGI_FI`
// (docs/claude/discogs.md, "The Image column's card"). Pins: the card is
// THIS row's image with its caption, and asks nothing; the click opens the
// viewer on this row's 600 px image and Shift+→ steps to the next row SHOWN
// (after a sort: the order, not just that something comes next); the setting
// turns the card off; a table saved before (links stamped `dg`) still gets it.
test.describe('discogs.com: the images table\'s Image column, card and viewer (_DGI_FI, 2026-11-10)', () => {
    test.use({ timezoneId: 'Europe/Berlin' });
    const tip = (page) => page.locator('#mb-stat-tooltip');
    const viewerImg = (page) => page.locator('#mb-art-viewer .mb-artv-stage .mb-artv-img');
    const thumb = (table, row) => table.locator('tbody > tr').nth(row).locator('a.mb-dg-thumblink');

    /**
     * Hovers a thumbnail from outside, so the card is built for this hover.
     *
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} link
     * @returns {Promise<void>}
     */
    async function hover(page, link) {
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await link.hover();
    }

    test('a hover: this row\'s image, big, with its type, uploader, date, size; no request', async ({ page }) => {
        const { errors, asked } = await openImages(page);
        const table = await showImages(page);
        const before = (await apiLog(page)).length;
        const link = thumb(table, 4);
        await hover(page, link);
        await expect(tip(page)).toBeVisible();
        await expect(tip(page).locator('.mb-tt-title')).toHaveText('Secondary · Cl0ver, 2023-06-12 09:01 · 2002 × 2000 · 1.2MB');
        const src = await link.locator('img').getAttribute('src');
        await expect(tip(page).locator('img.mb-fi-card-big')).toHaveAttribute('src', src);
        expect(asked, 'the data once, for the table').toEqual([DATA]);
        expect((await apiLog(page)).length, 'the card asks nothing').toBe(before);
        expect(errors).toEqual([]);
    });

    test('a click: the viewer on this row\'s 600 px image; Shift+→ the next row shown, after a sort', async ({ page }) => {
        const { errors } = await openImages(page);
        const table = await showImages(page);
        await table.locator('thead tr:first-child th[data-col-name="Size (KB)"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const hrefs = await table.locator('tbody > tr a.mb-dg-thumblink').evaluateAll(as => as.map(a => a.href));
        await thumb(table, 0).click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        const path = (u) => new URL(u, 'https://www.discogs.com/').pathname;
        await expect.poll(async () => path(await viewerImg(page).getAttribute('src'))).toBe(path(hrefs[0]));
        await page.keyboard.press('Shift+ArrowRight');
        await expect.poll(async () => path(await viewerImg(page).getAttribute('src'))).toBe(path(hrefs[1]));
        expect(errors).toEqual([]);
    });

    test('"Image column: all images of a row on hover" off: no card', async ({ page }) => {
        await openImages(page, { settings: { sa_dg_tip_images: false } });
        const table = await showImages(page);
        await hover(page, thumb(table, 0));
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        await expect(tip(page)).toBeHidden();
    });

    test('a table saved before (its links stamped "dg", no caption): still the image\'s card, its type from the row', async ({ page }) => {
        await openImages(page);
        const table = await showImages(page);
        await table.locator('a.mb-dg-thumblink').evaluateAll(as => as.forEach((a) => { a.dataset.mbFi = 'dg'; delete a.dataset.mbDgiCap; }));
        await hover(page, thumb(table, 0));
        await expect(tip(page)).toBeVisible();
        await expect(tip(page).locator('.mb-tt-title')).toHaveText('Primary');
        await expect(tip(page).locator('img.mb-fi-card-big')).toHaveCount(1);
    });
});

// dg-image-revisions (2026-11-10; vzell: "look at the revision page itself"):
// `/release/<id>/images/history?rev=N` had no script at all. Its own list is
// drawn by Discogs' script (the fixture has it empty, as the server sends
// it); the rows are `/images/data?history_revision=N`, same-origin with the
// session, the revisions the release history's image changes (here the
// history fixture's two, renumbered to 1313481's revisions 5 and 6, vzell's
// real answers: tests/fixtures/dg-image-rev-{5,6}.json). Pins: one sub-table
// per revision, newest first, the page's own marked; the Change column by
// image id against the revision before; one request a revision (the one
// before is reused by the next page); nothing before the press; the Image
// column's card (`_DGI_FI`).
test.describe('discogs.com: a release\'s image revision page (dg-image-revisions, 2026-11-10)', () => {
    test.use({ timezoneId: 'Europe/Berlin' });
    const PAGE = 'https://www.discogs.com/release/1313481-Born-To-Run/images/history?rev=6';
    const HIST = 'https://www.discogs.com/release/1313481/history';
    const DATA_REV = /\/release\/1313481\/images\/data\?history_revision=(\d+)$/;
    const rev = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, `dg-image-rev-${n}.json`), 'utf8'));
    const history = fs.readFileSync(path.join(__dirname, 'dg-release-history.html'), 'utf8')
        .replace('images/history?rev=7', 'images/history?rev=5').replace('images/history?rev=12', 'images/history?rev=6');

    /**
     * The revision page with the history and the revisions' images served.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object<number, Object[]>} revs - Each revision's data.
     * @returns {Promise<{errors: string[], asked: string[]}>}
     */
    async function openRevPage(page, revs) {
        const errors = [];
        const asked = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.route(HIST, (route) => { asked.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: history }); });
        await page.route(DATA_REV, (route) => {
            asked.push(route.request().url());
            const n = Number(DATA_REV.exec(route.request().url())[1]);
            return revs[n] ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(revs[n]) }) : route.fulfill({ status: 404, body: '' });
        });
        await loadUserscriptPage(page, {
            url: PAGE, fixtureFile: path.join(__dirname, 'dg-release-image-revision.html'), testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
        });
        return { errors, asked };
    }

    /**
     * Presses the button and waits for the render; the sub-tables with rows.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<import('@playwright/test').Locator>}
     */
    async function showRevs(page) {
        await page.locator('#mb-dg-root button[data-label="Show every image revision"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        return page.locator('#mb-dg-root table.tbl:has(tbody > tr)');
    }

    const changes = (table) => table.evaluate((t) => {
        const i = Array.from(t.querySelectorAll('thead tr:first-child th')).findIndex(th => (th.dataset.colName || th.textContent).trim() === 'Change');
        return Array.from(t.querySelectorAll('tbody > tr')).map(tr => tr.cells[i].textContent.trim());
    });

    test('the revision page: one sub-table per image revision, newest first, this page marked; Change by image id; one request a revision', async ({ page }) => {
        const { errors, asked } = await openRevPage(page, { 5: rev(5), 6: rev(6) });
        await expect(page.locator('#mb-dg-root button[data-label]')).toHaveCount(1);
        expect(asked, 'nothing before the press').toEqual([]);
        const tables = await showRevs(page);
        await expect(tables).toHaveCount(2);
        const heads = await page.locator('#mb-dg-root h3').allTextContents();
        // The heading as drawn: the toggle glyph first, "Rev" capitalised.
        const revOf = (h) => { const m = /\brev (\d+)( · this page)? · \d{4}-\d\d-\d\d/i.exec(h); return m ? m[1] + (m[2] || '') : ''; };
        expect(heads.map(revOf).filter(Boolean)).toEqual(['6 · this page', '5']);
        expect(await changes(tables.nth(0)), 'rev 6 adds 1887199').toEqual(['', '', '+ added']);
        expect(await changes(tables.nth(1)), 'rev 5: the history\'s first image change').toEqual(['+ added', '+ added']);
        expect(asked).toEqual([HIST, 'https://www.discogs.com/release/1313481/images/data?history_revision=6', 'https://www.discogs.com/release/1313481/images/data?history_revision=5']);
        await expect(page.locator('#image_uploader_app'), 'the page\'s own list is never read').toBeEmpty();
        // The Image column is the images tables' (`_DGI_FI`): this image's card
        // (the sub-tables render collapsed: open rev 6's first).
        const thumb = tables.nth(0).locator('tbody > tr').nth(2).locator('a.mb-dg-thumblink');
        if (!await thumb.isVisible()) await page.locator('#mb-dg-root h3').filter({ hasText: /\bRev 6 · this page/i }).click({ position: { x: 4, y: 4 } });
        await expect(thumb).toBeVisible();
        await page.mouse.move(0, 0);
        await thumb.hover();
        await expect(page.locator('#mb-stat-tooltip .mb-tt-title')).toHaveText(/^Secondary · dsmith, 2008-05-20 01:48/);
        expect(errors).toEqual([]);
    });

    test('an image the revision removed: its own row, greyed, "− removed"; a retyped one says so', async ({ page }) => {
        const r6 = rev(6);
        const r6b = [Object.assign({}, r6[0], { primary: 'false' }), Object.assign({}, r6[2], { primary: 'true', sortOrder: 1 })];
        await openRevPage(page, { 5: rev(5), 6: r6b });
        const tables = await showRevs(page);
        await expect(tables).toHaveCount(2);
        expect(await changes(tables.nth(0))).toEqual(['→ secondary', '+ added', '− removed']);
        await expect(tables.nth(0).locator('tbody > tr').nth(2)).toHaveClass(/\bmb-dgir-gone\b/);
    });
});

// dg-entity-images (2026-10-29; vzell: "Other missing Discogs pages should
// also get a PT"): a master's, artist's or label's Images page. The page
// lists only the images (debug/dg-<kind>-images.html); the API's
// `<kind>s/<id>` gives every one with its type and served size, without a
// token. One request; never the page's own list, never `/images/data`.
test.describe('discogs.com: a master\'s, artist\'s or label\'s Images page (dg-entity-images)', () => {
    const fx = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
    for (const [kind, url, file, api, n] of [
        ['master', 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run/images', 'dg-master-images.html', 'discogs-master', 7],
        ['artist', 'https://www.discogs.com/artist/219986-Bruce-Springsteen/images', 'dg-artist-images.html', 'discogs-artist', 27],
        ['label', 'https://www.discogs.com/label/264352-DADC/images', 'dg-label-images.html', 'discogs-label-dadc', 10],
    ]) {
        test(`the ${kind}'s Images page: one button, one API request, every image with its type and size`, async ({ page }) => {
            const errors = [];
            page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
            const asked = [];
            await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
            await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
            await page.route(/\/images\/data/, (route) => {
                asked.push(route.request().url());
                return route.fulfill({ status: 404, body: '' });
            });
            const a = fx(api);
            await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
                { [a.url]: { status: a.status, responseHeaders: `Content-Type: ${a.contentType}`, responseText: a.body } });
            await loadUserscriptPage(page, {
                url, fixtureFile: path.join(__dirname, file), testMode: true,
                settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
            });
            const root = page.locator('#mb-dg-root');
            // Its own button only: the entity pageType's path pattern takes /images too.
            expect(await root.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.dataset.label))).toEqual(['Show every image']);
            expect(await apiLog(page), 'nothing before the press').toEqual([]);
            const table = await showImages(page);
            expect(await apiLog(page)).toEqual([a.url]);
            expect(asked, 'no image editor data for these kinds').toEqual([]);
            expect((await heads(table)).filter(Boolean)).toEqual(['#', 'Image', 'Type', 'W × H']);
            await expect(table.locator('tbody > tr')).toHaveCount(n);
            const first = await rowOf(table, 0);
            expect(first['#']).toBe('1');
            expect(first.Type).toBe('Primary');
            expect(first['W × H']).toMatch(/^\d+ × \d+$/);
            await expect(table.locator('tbody > tr').first().locator('a.mb-dg-thumblink img')).toHaveAttribute('src', /^https:\/\/i\.discogs\.com\//);
            expect(errors).toEqual([]);
        });
    }
});
