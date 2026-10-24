'use strict';

// discogs.com, 2026-10-19 (vzell: "when hovering the Image column in Discogs
// PTs make all images shown in a popup like what we do in the CAA/EAA column
// on MB PTs"): a thumbnail's hover card shows every image of the row's
// release or master — the B1 artwork card (`_artCardCoreHtml()`) of the
// record the viewer and the link previews use (`_extLoad()`), asked on that
// hover for that row only, wanted only while the card shows; off with
// `sa_dg_tip_images`. See docs/claude/discogs.md, "The Image column's hover
// card".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answer = (f) => ({ [f.url]: { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body } });
const MASTER = 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run';
const API = 'https://api.discogs.com/';
const RELEASE = 'https://www.discogs.com/release/1874253';

/**
 * Loads the master page fixture with the userscript and the Discogs API
 * answered from the captures (the master, its versions, release 1874253),
 * presses "Show all versions" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object}} [opts]
 * @returns {Promise<{errors: string[], table: import('@playwright/test').Locator}>}
 */
async function openVersions(page, { settings = {} } = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const all = Object.assign({}, answer(FX('discogs-master')), answer(FX('discogs-release')),
        ...[1, 2, 3, 4].map(p => answer(FX(`discogs-master-versions-p${p}`))));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, all);
    await loadUserscriptPage(page, {
        url: MASTER, fixtureFile: path.join(__dirname, 'dg-master.html'), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, table: page.locator('#mb-dg-root table.tbl').first() };
}

const apiLog = (page) => page.evaluate((api) => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith(api)), API);
const tip = (page) => page.locator('#mb-stat-tooltip');

/**
 * The thumbnail link of the version row whose Title links `href`.
 *
 * @param {import('@playwright/test').Locator} table
 * @param {string} href
 * @returns {import('@playwright/test').Locator}
 */
const thumbOf = (table, href) => table.locator('tbody > tr', { has: table.page().locator(`a[href="${href}"]`) }).first().locator('a.mb-dg-thumblink');

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

test.describe('discogs.com: the Image column\'s hover card (2026-10-19)', () => {
    test('hover: Loading with the thumbnail, ONE request for this row, then every image — ★ primary, primary/secondary tally', async ({ page }) => {
        const { errors, table } = await openVersions(page);
        const before = (await apiLog(page)).length;
        const link = thumbOf(table, RELEASE);
        await hover(page, link);
        await expect(tip(page)).toBeVisible();
        await expect(tip(page)).toContainText('Born To Run');
        // The record has five images (one primary, four secondary).
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        await expect(tip(page).locator('.mb-art-card-tile.mb-art-card-main')).toHaveCount(1);
        await expect(tip(page)).toContainText('5 images · ★ primary');
        await expect(tip(page)).not.toContainText('main front');
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['primary', 'secondary ×4']);
        await expect(tip(page)).toContainText('Click: viewer');
        expect((await apiLog(page)).slice(before), 'one request, this row only').toEqual([`${API}releases/1874253`]);
        const rel = JSON.parse(FX('discogs-release').body);
        await expect(tip(page).locator('.mb-art-card-tile img').first()).toHaveAttribute('src', rel.images[0].uri150);
        expect(errors).toEqual([]);
    });

    // The card keys (2026-10-20) are shared by every card _artCardCoreHtml()
    // builds. Five images are never cut off, so Space is the page's here;
    // Shift must still draw the tiles bigger — measured, not a class.
    test('card keys: Shift draws the tiles bigger while held; Space with nothing cut off opens the viewer, as a click does', async ({ page }) => {
        const { errors, table } = await openVersions(page);
        await hover(page, thumbOf(table, RELEASE));
        const tiles = tip(page).locator('.mb-art-card-tile');
        await expect(tiles).toHaveCount(5);
        const width = async () => Math.round((await tiles.first().boundingBox()).width);
        expect(await width()).toBe(56);
        await page.keyboard.down('Shift');
        await expect.poll(width).toBe(150);
        await page.keyboard.up('Shift');
        await expect.poll(width).toBe(56);
        // 2026-10-24 (org/TODO.org "Some enhancements" 2): Space used to be
        // left to the page here, which scrolled it down under the card.
        const scrollY = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('Space');
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 5');
        await expect(tip(page)).toBeHidden();
        expect(await page.evaluate(() => window.scrollY), 'the page did not scroll').toBe(scrollY);
        expect(errors).toEqual([]);
    });

    test('a second hover and a click on the same row ask nothing more: the viewer shows the record from the cache', async ({ page }) => {
        const { errors, table } = await openVersions(page);
        const link = thumbOf(table, RELEASE);
        await hover(page, link);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        const asked = (await apiLog(page)).length;
        await hover(page, link);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        await link.click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 5');
        await expect(viewer.locator('.mb-artv-info')).toContainText('the cache');
        expect((await apiLog(page)).length, 'nothing more asked').toBe(asked);
        expect(errors).toEqual([]);
    });

    test('moved on before its turn: that row is never asked', async ({ page }) => {
        const logs = [];
        page.on('console', (m) => logs.push(m.text()));
        // The debug channel says when a request is dropped as unwanted.
        const { table } = await openVersions(page, { settings: { sa_enable_debug_logging: true } });
        // The first hover takes the slot (1 s apart with a token) …
        await hover(page, thumbOf(table, RELEASE));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        // … so a second row's card waits for the next one; leave before it.
        const other = table.locator('tbody > tr a.mb-dg-thumblink').nth(3);
        const otherRelease = await table.locator('tbody > tr').nth(3).locator('a[href*="/release/"]').first().getAttribute('href');
        const id = /\/release\/(\d+)/.exec(otherRelease)[1];
        await hover(page, other);
        await expect(tip(page)).toContainText('Loading every image');
        await page.mouse.move(0, 0);
        await expect.poll(() => logs.some(t => t.includes(`no longer wanted, not asked: ${API}releases/${id}`)),
            { message: 'dropped at its slot', timeout: 5000 }).toBe(true);
        expect((await apiLog(page)).filter(u => u === `${API}releases/${id}`)).toEqual([]);
    });

    test('"Image column: all images of a row on hover" off: no card, no request', async ({ page }) => {
        const { table } = await openVersions(page, { settings: { sa_dg_tip_images: false } });
        const before = (await apiLog(page)).length;
        await hover(page, thumbOf(table, RELEASE));
        // A resolver card shows on the mouseover itself, no delay to wait out.
        await expect(tip(page)).toBeHidden();
        expect((await apiLog(page)).length).toBe(before);
    });
});
