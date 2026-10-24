'use strict';

// brucespringsteen.it, 2026-10-23 (org/foreign-images.org, phase 2, mockup
// K1): the records get a lazy Photo column — a dashed tile until the
// record's page has been read, then its photo or "no photo" — with the card
// (one photo: the single big picture) and the artwork viewer through the
// shared foreign-image path (`_BS_FI`). The page always names
// `blegs/images/<code>.jpg`, but the site hides a missing one: only loading
// it tells (`_bsFiCheckPhoto()`), and a 404 is "no photo", never an error.
// See docs/claude/brucespringsteen.md, "The Photo column".

const { test, expect } = require('../support/test');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const REC = (code) => `https://www.brucespringsteen.it/DB/detrec.aspx?code=${code}`;
const PHOTO = 'https://www.brucespringsteen.it/blegs/images/LP1B1.jpg';

/**
 * Loads the list, routes the record pages and LP1B1's photo (a 1 px PNG,
 * or a 404 with `photo404`), presses Unofficial and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object<string, *>, photo404?: boolean}} [opts]
 * @returns {Promise<{errors: string[], served: string[], photos: string[]}>}
 */
async function openBs(page, { settings = {}, photo404 = false } = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await loadBsRecordsPage(page, { settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'bs');
    const photos = [];
    await page.route(PHOTO, (route) => {
        photos.push(route.request().url());
        return photo404
            ? route.fulfill({ status: 404, contentType: 'text/html', body: 'not found' })
            : route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served, photos };
}

const photoOf = (page, code) => page.locator(`table.tbl tbody a.mb-fi-cell[href="${REC(code)}"]`).first();
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

test.describe('brucespringsteen.it: the lazy Photo column, its card and the viewer (2026-10-23)', () => {
    test('render asks nothing; a record with a photo: one page, one photo load, the big picture, the cell shows it', async ({ page }) => {
        const { errors, served, photos } = await openBs(page);
        expect(served, 'no record page at render').toEqual([]);
        expect(photos, 'no photo at render').toEqual([]);
        await expect(page.locator('table.tbl thead th').first()).toContainText('Photo');
        const cell = photoOf(page, 'LP1B1');
        await expect(cell).toHaveAttribute('data-mb-fi-state', 'cold');
        await hover(page, cell);
        await expect(tip(page).locator('img.mb-fi-card-big')).toHaveAttribute('src', PHOTO);
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(0);
        await expect(tip(page)).toContainText('Click or Space: viewer · Ctrl-click: the record\'s page');
        expect(served).toEqual([REC('LP1B1')]);
        await expect(cell).toHaveAttribute('data-mb-fi-state', 'done');
        await expect(cell.locator('img.mb-fi-thumb')).toHaveAttribute('src', PHOTO);
        await cell.click();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 1');
        await expect(viewer(page).locator('.mb-artv-bar a.mb-artv-btn', { hasText: 'Record page' })).toHaveAttribute('href', REC('LP1B1'));
        expect(served, 'the click asks nothing more').toEqual([REC('LP1B1')]);
        expect(errors).toEqual([]);
    });

    test('a record whose page names no photo: "no photo", no photo load', async ({ page }) => {
        const { errors, served, photos } = await openBs(page);
        const cell = photoOf(page, 'CR1AD1');
        await hover(page, cell);
        await expect(tip(page)).toContainText('The record has no photo.');
        await expect(cell).toHaveAttribute('data-mb-fi-state', 'none');
        expect(served).toEqual([REC('CR1AD1')]);
        expect(photos).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a photo that does not load (the site hides it): "no photo", never an error to retry', async ({ page }) => {
        const { errors, photos } = await openBs(page, { photo404: true });
        const cell = photoOf(page, 'LP1B1');
        await hover(page, cell);
        await expect(cell).toHaveAttribute('data-mb-fi-state', 'none');
        await expect(tip(page)).toContainText('The record has no photo.');
        await expect(tip(page)).not.toContainText('Could not');
        expect(photos).toEqual([PHOTO]);
        expect(errors).toEqual([]);
    });

    test('after a reload a photo checked before is painted at once: no page, no photo load', async ({ page }) => {
        const { errors, served, photos } = await openBs(page);
        await hover(page, photoOf(page, 'LP1B1'));
        await expect(photoOf(page, 'LP1B1')).toHaveAttribute('data-mb-fi-state', 'done');
        await page.mouse.move(0, 0);
        const asked = { pages: served.length, photos: photos.length };
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(photoOf(page, 'LP1B1')).toHaveAttribute('data-mb-fi-state', 'done');
        await expect(photoOf(page, 'LP1B1').locator('img.mb-fi-thumb')).toHaveAttribute('src', PHOTO);
        expect(served.length, 'no record page asked again').toBe(asked.pages);
        // Showing the painted cell loads its picture; nothing else is
        // asked: no second check of whether the photo exists.
        expect(photos.length, 'only the cell\'s own picture').toBeLessThanOrEqual(asked.photos + 1);
        expect(errors).toEqual([]);
    });

    test('"Photo column: the record\'s photo on hover" off: no card, no request', async ({ page }) => {
        const { served } = await openBs(page, { settings: { sa_bs_tip_images: false } });
        await hover(page, photoOf(page, 'LP1B1'));
        await expect(tip(page)).toBeHidden();
        expect(served).toEqual([]);
    });
});
