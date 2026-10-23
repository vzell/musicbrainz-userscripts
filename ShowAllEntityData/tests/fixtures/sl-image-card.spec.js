'use strict';

// springsteenlyrics.com, 2026-10-23 (org/foreign-images.org, phase 1, mockups
// S1/V1): the Cover column of a collection, bootleg or CD and vinyl bootleg
// list gets MusicBrainz's B1 image card and the artwork viewer, through the
// shared foreign-image path (`_fiCardHtml()`, `_fiClick()`, provider
// `_SL_FI`). The cover is in the row; the scans are on the item page, read
// through the detail preview's `_dpGet()` (one request for the hovered row,
// wanted only while its card or viewer shows). A bootleg row the list marks
// as having no artwork never asks. See docs/claude/springsteenlyrics.md,
// "The Cover column's image card and viewer".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadSlListPage, SL_KINDS } = require('../support/slFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter } = require('../support/filterSortAssertions');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const BASE = 'https://springsteenlyrics.com/';
const ITEM_4554 = `${BASE}bootlegs.php?item=4554&category=aud_live1967`;

/**
 * Loads a list fixture, routes the item pages (`routeDetailPages()`) and
 * the site's images (a 1 px PNG), presses the list's button and waits for
 * the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} kind - An `SL_KINDS` key.
 * @param {Object<string, *>} [settings]
 * @returns {Promise<{errors: string[], served: string[], logs: string[]}>}
 */
async function openSl(page, kind, settings = {}) {
    const errors = [];
    const logs = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    page.on('console', (m) => logs.push(m.text()));
    await loadSlListPage(page, { kind, settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'sl');
    await page.route(/^https:\/\/springsteenlyrics\.com\/.*\.jpg$/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.click(`button[data-label="${SL_KINDS[kind].button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served, logs };
}

/**
 * The Cover link of the row of item `id`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {import('@playwright/test').Locator}
 */
const coverOf = (page, id) => page.locator(`table.tbl tbody a[data-mb-fi="sl"][href*="item=${id}&"]`).first();
const tip = (page) => page.locator('#mb-stat-tooltip');
const viewer = (page) => page.locator('#mb-art-viewer');

/**
 * Hovers a link from outside, so the card is built for this hover.
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

/**
 * The scans `_dpParseSl()` reads from an item page fixture.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} file
 * @param {string} url
 * @returns {Promise<number>}
 */
async function scanCount(page, file, url) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    return page.evaluate(([h, u]) => window.__saTest.dpParse('springsteenlyrics.com', h, u).images.length, [html, url]);
}

test.describe('springsteenlyrics.com: the Cover column\'s image card and viewer (2026-10-23)', () => {
    test('render asks nothing; hover: ONE request for this row, then the cover ★ and every scan', async ({ page }) => {
        const { errors, served } = await openSl(page, 'bootlegs');
        expect(served, 'no item page at render').toEqual([]);
        await hover(page, coverOf(page, '4554'));
        await expect(tip(page)).toBeVisible();
        await expect(tip(page)).toContainText('The Bruce Springsteen Story Vol. 2');
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        await expect(tip(page).locator('.mb-art-card-tile.mb-art-card-main')).toHaveCount(1);
        await expect(tip(page)).toContainText('5 images · ★ primary');
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['Cover', 'Scan ×4']);
        await expect(tip(page)).toContainText('Click: viewer · Ctrl-click: the item page');
        // The cover comes first, the scans' thumbnails after it.
        await expect(tip(page).locator('.mb-art-card-tile img').first()).toHaveAttribute('src', `${BASE}bootlegs/aud_live1967/4554.jpg`);
        await expect(tip(page).locator('.mb-art-card-tile img').nth(1)).toHaveAttribute('src', /4554_artwork_01_tn\.jpg$/);
        await expect(tip(page).locator('.mb-art-card-tile img').first()).toHaveAttribute('referrerpolicy', 'no-referrer');
        expect(served, 'one request, this row only').toEqual([ITEM_4554]);
        expect(errors).toEqual([]);
    });

    test('a bootleg the list marks as having no artwork: "Cover only", no request', async ({ page }) => {
        const { errors, served } = await openSl(page, 'bootlegs');
        const link = coverOf(page, '2616');
        await expect(link).toHaveAttribute('data-mb-sl-art', '0');
        await expect(coverOf(page, '4554')).toHaveAttribute('data-mb-sl-art', '1');
        await hover(page, link);
        await expect(tip(page)).toContainText('Cover only');
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(1);
        await link.click();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 1');
        await expect(viewer(page).locator('.mb-artv-note')).toContainText('Cover only');
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a second hover and a click ask nothing more: the viewer from the cache, with the item page\'s link', async ({ page }) => {
        const { errors, served } = await openSl(page, 'bootlegs');
        const link = coverOf(page, '4554');
        await hover(page, link);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        await hover(page, link);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        await link.click();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 5');
        await expect(viewer(page).locator('.mb-artv-info')).toContainText('the cache');
        await expect(viewer(page).locator('.mb-artv-bar a.mb-artv-btn', { hasText: 'Item page' })).toHaveAttribute('href', ITEM_4554);
        await page.keyboard.press('ArrowRight');
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('2 / 5');
        expect(served, 'nothing more asked').toEqual([ITEM_4554]);
        await page.keyboard.press('Escape');
        await expect(viewer(page)).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('Shift+→ steps to the next VISIBLE row, asked only when the viewer shows it; a failure says why', async ({ page }) => {
        // The viewer's own requests: without the card, whose hover (the
        // click's pointer passes over the cover first) would ask too.
        const { errors, served } = await openSl(page, 'bootlegs', { sa_sl_tip_images: false });
        // "Records" keeps 4554, 4553 (E. St. Records) and 6544 (On Stage
        // Records), and hides 8694, 4553's neighbour, between them.
        await typeGlobalFilter(page, 'Records');
        await expect(coverOf(page, '8694')).toBeHidden();
        await expect(coverOf(page, '6544')).toBeVisible();
        await coverOf(page, '4553').click();
        // 4553 has no fixture: the route answers 404.
        await expect(viewer(page).locator('.mb-artv-note')).toContainText('Could not read the item page');
        const rowPos = await viewer(page).locator('.mb-artv-rowpos').textContent();
        await page.keyboard.press('Shift+ArrowRight');
        await expect(viewer(page).locator('.mb-artv-rowpos')).not.toHaveText(rowPos);
        await expect.poll(() => served.length, { message: 'the next row asked once shown' }).toBe(2);
        expect(served[0]).toMatch(/item=4553&/);
        expect(served[1], 'the next visible row, not the hidden neighbour').toMatch(/item=6544&/);
        expect(errors).toEqual([]);
    });

    test('Ctrl-click keeps the link: no viewer, the click not taken', async ({ page }) => {
        const { errors } = await openSl(page, 'bootlegs', { sa_sl_tip_images: false });
        const taken = await page.evaluate(() => {
            const a = document.querySelector('table.tbl tbody a[data-mb-fi="sl"]');
            let prevented = null;
            // Last in line: reads what _fiClick() left, then stops the navigation.
            document.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
            return prevented;
        });
        expect(taken).toBe(false);
        await expect(viewer(page)).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('a collection row (no artwork flag) asks on hover: the cover and the item page\'s scans', async ({ page }) => {
        const { errors, served } = await openSl(page, 'collection');
        const url = `${BASE}collection.php?item=8981&category=album&f_format=12i`;
        const scans = await scanCount(page, 'detail-sl-collection-8981.html', url);
        expect(scans).toBeGreaterThan(0);
        await hover(page, coverOf(page, '8981'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(scans + 1);
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['Cover', `Scan ×${scans}`]);
        expect(served).toEqual([url]);
        expect(errors).toEqual([]);
    });

    test('brucelegs 148: the card stops at the tile cap, Space shows all 32; no related item\'s cover', async ({ page }) => {
        const { errors, served } = await openSl(page, 'brucelegs');
        const url = `${BASE}brucelegs.php?item=148&f_format=vinyl`;
        expect(await scanCount(page, 'detail-sl-brucelegs-148.html', url)).toBe(31);
        await hover(page, coverOf(page, '148'));
        const tiles = tip(page).locator('.mb-art-card-tile');
        await expect(tiles).toHaveCount(12);
        await expect(tip(page).locator('.mb-art-card-more')).toHaveText('+20');
        await expect(tip(page)).toContainText('32 images');
        await page.keyboard.press('Space');
        await expect(tiles).toHaveCount(32);
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['Cover', 'Scan ×31']);
        expect(served).toEqual([url]);
        expect(errors).toEqual([]);
    });

    test('the record is the detail preview\'s: after the cover\'s card, the Title\'s preview asks nothing', async ({ page }) => {
        const { errors, served } = await openSl(page, 'bootlegs', { sa_sl_detail_preview: true });
        await hover(page, coverOf(page, '4554'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        const title = page.locator('table.tbl tbody td a[href*="item=4554&"]').filter({ hasNot: page.locator('img') });
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await title.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toContainText(/\d+ tracks?/);
        expect(served, 'one request for both').toEqual([ITEM_4554]);
        expect(errors).toEqual([]);
    });

    test('"Cover column: every image of an item on hover" off: no card, no request; a click still opens the viewer', async ({ page }) => {
        const { errors, served } = await openSl(page, 'bootlegs', { sa_sl_tip_images: false });
        const link = coverOf(page, '4554');
        await hover(page, link);
        // A resolver card shows on the mouseover itself, no delay to wait out.
        await expect(tip(page)).toBeHidden();
        expect(served).toEqual([]);
        await link.click();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 5');
        await expect(viewer(page).locator('.mb-artv-info')).toContainText('one request');
        expect(served).toEqual([ITEM_4554]);
        expect(errors).toEqual([]);
    });

    test('moved on before its turn: that row is never asked', async ({ page }) => {
        const { served, logs } = await openSl(page, 'bootlegs', { sa_enable_debug_logging: true });
        // The first hover takes the slot (1 s apart) …
        await hover(page, coverOf(page, '4554'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        // … so a second row's card waits for the next one; leave before it.
        await hover(page, coverOf(page, '8694'));
        await expect(tip(page)).toContainText('Loading the scans');
        await page.mouse.move(0, 0);
        await expect.poll(() => logs.some(t => t.includes('no longer wanted, not asked: ') && t.includes('item=8694&')),
            { message: 'dropped at its slot', timeout: 5000 }).toBe(true);
        expect(served).toEqual([ITEM_4554]);
    });
});
