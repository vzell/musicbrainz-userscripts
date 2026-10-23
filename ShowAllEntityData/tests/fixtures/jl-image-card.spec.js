'use strict';

// jungleland.it, 2026-10-23 (org/foreign-images.org, phase 2, mockups J1/J3):
// the list gets a lazy Art column — a dashed tile until the entry's page has
// been read, then its front scan and the scan count — with the B1 card and
// the artwork viewer through the shared foreign-image path (`_JL_FI`). The
// file-name labels become MusicBrainz's types (front ★, back, cdN Medium,
// bookletN Booklet). A late paint changes no text a filter reads, and it
// reaches the SOURCE rows; after a reload the rows read before are painted
// from the detail-page database with no request (`_fiAfterRender()`), for
// half a year. See docs/claude/jungleland.md, "The Art column".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadJlListPage, JL_BUTTON } = require('../support/jlFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForSortSettled } = require('../support/filterSortAssertions');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ENTRY = 'https://www.jungleland.it/html/19750205.htm';

/**
 * Loads the list, routes the entry pages and the artwork (a 1 px PNG),
 * presses the button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @returns {Promise<{errors: string[], served: string[], logs: string[]}>}
 */
async function openJl(page, settings = {}) {
    const errors = [];
    const logs = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    page.on('console', (m) => logs.push(m.text()));
    await loadJlListPage(page, { settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'jl');
    await page.route(/^https:\/\/www\.jungleland\.it\/artwork\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.click(`button[data-label="${JL_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served, logs };
}

/**
 * Presses the button again after a reload (memory empty, the database
 * kept), the userscript injected anew, as detail-preview.spec.js does.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function reloadAndRender(page) {
    await page.reload();
    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await page.click(`button[data-label="${JL_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const artOf = (page, href) => page.locator(`table.tbl tbody a.mb-fi-cell[href="${href}"]`).first();
const tip = (page) => page.locator('#mb-stat-tooltip');
const viewer = (page) => page.locator('#mb-art-viewer');
const visibleRows = (page) => page.locator('table.tbl tbody tr:visible');

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
 * Writes one parsed entry page into the detail-page database, as `_dpGet()`
 * would have, `ageDays` old.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} ageDays
 * @returns {Promise<void>}
 */
async function seedEntry(page, ageDays) {
    const html = fs.readFileSync(path.join(__dirname, 'detail-jl-19750205.html'), 'latin1');
    await page.evaluate(([h, url, age]) => new Promise((resolve, reject) => {
        const data = window.__saTest.dpParse('jungleland.it', h, url);
        const req = indexedDB.open('vz-saed-detail-pages', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('pages', { keyPath: 'url' });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const tx = req.result.transaction('pages', 'readwrite');
            tx.objectStore('pages').put({ url, v: window.__saTest.dpParserVersion, at: Date.now() - age * 86400000, data });
            tx.oncomplete = () => { req.result.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        };
    }), [html, ENTRY, ageDays]);
}

test.describe('jungleland.it: the lazy Art column, its card and the viewer (2026-10-23)', () => {
    test('render asks nothing: every Art cell unread, with no text of its own', async ({ page }) => {
        const { errors, served } = await openJl(page);
        expect(served, 'no entry page at render').toEqual([]);
        const states = await page.evaluate(() => {
            const cells = Array.from(document.querySelectorAll('table.tbl tbody a.mb-fi-cell'));
            return { n: cells.length, cold: cells.filter(a => a.dataset.mbFiState === 'cold').length };
        });
        expect(states.n).toBeGreaterThan(100);
        expect(states.cold).toBe(states.n);
        await expect(page.locator('table.tbl thead th').first()).toContainText('Art');
        expect(errors).toEqual([]);
    });

    test('hover: ONE request, every scan typed (Front ★, Back, Medium, Booklet); the cell shows the front and the count', async ({ page }) => {
        const { errors, served } = await openJl(page);
        const art = artOf(page, ENTRY);
        await hover(page, art);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(10);
        await expect(tip(page).locator('.mb-art-card-tile.mb-art-card-main')).toHaveCount(1);
        await expect(tip(page)).toContainText('10 images · ★ primary');
        await expect(tip(page).locator('.mb-tt-pill')).toHaveText(['Front', 'Back', 'Medium ×2', 'Booklet ×6']);
        await expect(tip(page)).toContainText('Click: viewer · Ctrl-click: the entry\'s page');
        expect(served).toEqual([ENTRY]);
        // The cell: the front scan and the count, live and in the source row.
        await expect(art).toHaveAttribute('data-mb-fi-state', 'done');
        await expect(art).toHaveAttribute('data-mb-fi-n', '10');
        await expect(art.locator('img.mb-fi-thumb')).toHaveAttribute('src', /tn_19750205_front\.jpg$/);
        expect(errors).toEqual([]);
    });

    test('the sort key and the count are no text: typing "a-yes" matches no row through the Art cell', async ({ page }) => {
        const { errors } = await openJl(page);
        await hover(page, artOf(page, ENTRY));
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'done');
        await page.mouse.move(0, 0);
        const all = await visibleRows(page).count();
        // The cell's sort key ("a-yes") and the CSS count are no text: typing
        // them matches no row through the Art cell.
        await typeGlobalFilter(page, 'a-yes');
        await expect.poll(() => visibleRows(page).count()).toBe(0);
        await page.locator('#mb-global-filter-input').fill('');
        await expect.poll(() => visibleRows(page).count()).toBe(all);
        expect(errors).toEqual([]);
    });

    test('a cell painted on a filtered (cloned) row reaches its source row: clearing the filter keeps the picture', async ({ page }) => {
        const { errors } = await openJl(page);
        const all = await visibleRows(page).count();
        // After a filter the shown rows are clones of the source rows.
        await typeGlobalFilter(page, 'Main Point');
        await expect.poll(() => visibleRows(page).count()).toBeLessThan(all);
        await hover(page, artOf(page, ENTRY));
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'done');
        await page.mouse.move(0, 0);
        // Clearing re-renders from the source rows.
        await page.locator('#mb-global-filter-input').fill('');
        await expect.poll(() => visibleRows(page).count()).toBe(all);
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'done');
        await expect(artOf(page, ENTRY).locator('img.mb-fi-thumb')).toHaveCount(1);
        expect(errors).toEqual([]);
    });

    test('the Art cell is the image card\'s, not the detail preview\'s (same page, no picture yet)', async ({ page }) => {
        // The card off, so the hover loads nothing and the cell stays COLD:
        // a painted cell holds an <img>, which the preview skips anyway.
        const { errors } = await openJl(page, { sa_jl_detail_preview: true, sa_jl_tip_images: false });
        const peek = page.locator('#mb-dp-peek');
        // Ctrl while the pointer rests on a target opens its preview at once.
        await hover(page, artOf(page, ENTRY));
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'cold');
        await page.keyboard.down('Control');
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        await expect(peek).toBeHidden();
        await page.keyboard.up('Control');
        // The control: the same Ctrl on the row's Title does open it.
        await page.mouse.move(0, 0);
        await page.locator(`table.tbl tbody a:not(.mb-fi-cell)[href="${ENTRY}"]`).first().hover();
        await page.keyboard.down('Control');
        await expect(peek).toBeVisible();
        await page.keyboard.up('Control');
        expect(errors).toEqual([]);
    });

    test('a sort by Art puts the read row first', async ({ page }) => {
        const { errors } = await openJl(page);
        await hover(page, artOf(page, ENTRY));
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'done');
        await page.mouse.move(0, 0);
        const asc = page.locator('table.tbl thead th[data-col-name="Art"] .sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => asc.click());
        await expect(page.locator('table.tbl tbody tr').first().locator('a.mb-fi-cell'), 'the read row first')
            .toHaveAttribute('href', ENTRY);
        expect(errors).toEqual([]);
    });

    test('after a reload the row read before is painted from the database, with no request', async ({ page }) => {
        const { errors, served } = await openJl(page);
        await hover(page, artOf(page, ENTRY));
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'done');
        expect(served).toEqual([ENTRY]);
        await page.mouse.move(0, 0);
        await reloadAndRender(page);
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'done');
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-n', '10');
        expect(served, 'nothing asked again').toEqual([ENTRY]);
        expect(errors).toEqual([]);
    });

    test('the sweep keeps half a year: a record 100 days old is painted, one 200 days old is not', async ({ page }) => {
        const { errors, served } = await openJl(page);
        await seedEntry(page, 100);
        await reloadAndRender(page);
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'done');
        await seedEntry(page, 200);
        await reloadAndRender(page);
        // The sweep has run (its debug line is not on); give it the same
        // chance as above, then check the cell stayed unread.
        await page.waitForFunction(() => document.querySelectorAll('table.tbl tbody a.mb-fi-cell').length > 0);
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
        await expect(artOf(page, ENTRY)).toHaveAttribute('data-mb-fi-state', 'cold');
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a click opens the viewer on every scan; Ctrl-click keeps the link', async ({ page }) => {
        const { errors, served } = await openJl(page, { sa_jl_tip_images: false });
        const art = artOf(page, ENTRY);
        // Card off: pointing asks nothing.
        await hover(page, art);
        await expect(tip(page)).toBeHidden();
        expect(served).toEqual([]);
        const taken = await page.evaluate((href) => {
            const a = document.querySelector(`table.tbl tbody a.mb-fi-cell[href="${href}"]`);
            let prevented = null;
            document.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
            return prevented;
        }, ENTRY);
        expect(taken, 'Ctrl-click not taken').toBe(false);
        await art.click();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 10');
        await expect(viewer(page).locator('.mb-artv-bar a.mb-artv-btn', { hasText: 'Entry page' })).toHaveAttribute('href', ENTRY);
        expect(served).toEqual([ENTRY]);
        expect(errors).toEqual([]);
    });
});
