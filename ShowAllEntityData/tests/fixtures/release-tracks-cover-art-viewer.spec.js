'use strict';

// release-tracks Cover art section: the viewer (R5) and the tab click (R4) —
// org/CAA-release-tracks-handling.org, phase P3.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. KEYS STEP IN LIST ORDER AND WRAP; Esc CLOSES AND FOCUS RETURNS to the
//     tile that opened it. "The viewer closed" alone passes on code that
//     leaves focus on <body>, which strands a keyboard user at the page top.
//  2. KEYS NEVER REACH THE PAGE while it is open. A document-capture listener
//     (where every page shortcut lives — Ctrl+M, initKeyboardShortcuts, the
//     navigation guard's Tab trap) must see nothing. Asserting only that the
//     viewer reacts would pass while the page reacted too.
//  3. TAB STAYS INSIDE the overlay (initNavigationGuard()'s own Tab trap would
//     otherwise walk focus into the page behind it).
//  4. G / Esc: grid entered with G returns to the image on Esc; a viewer
//     OPENED in grid (by the tab) closes on Esc.
//  5. A PLAIN TAB CLICK OPENS THE GRID WITH NO "leave this page?" CONFIRM and
//     no navigation; a Ctrl-click is NOT intercepted (the guard's confirm is
//     what proves the click went its normal way).
//  6. THE CHIP FILTER SCOPES THE VIEWER: opened from a filtered sheet, it
//     steps through the shown tiles only.
//  7. THE LARGE IMAGE REPLACES THE THUMBNAIL once loaded, and the viewer
//     makes no JSON request of its own.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const RECORD = fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8');
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const BIG_RE = /^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/\d+-1200\.jpg$/;
const CORS = { 'access-control-allow-origin': '*' };
const VIEWER = '#mb-art-viewer';
const TAB = 'ul.tabs a[href$="/cover-art"]';
// 1x1 transparent PNG: real image bytes, so the large image actually "loads".
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

/**
 * Loads the medley fixture with the archive routed, presses "Show all" and
 * waits for the section's sheet.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{bigImages?: boolean}} [opts] bigImages: serve the 1200 px images as a PNG
 * @returns {Promise<{hits: function(): number}>}
 */
async function openRelease(page, { bigImages = false } = {}) {
    let hits = 0;
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_enable_release_tracks_cover_art: true,
            sa_art_idb_enable: false,
        },
    });
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
    if (bigImages) {
        await page.route(BIG_RE,
            (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: ONE_PX_PNG }));
    }
    await page.route(META_RE, (route) => {
        hits += 1;
        return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD });
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.locator('.mb-release-art-sec[data-mb-art-state="ok"]').waitFor({ state: 'attached', timeout: 15000 });
    return { hits: () => hits };
}

/**
 * The viewer as the user sees it.
 *
 * @param {import('@playwright/test').Page} page
 */
const viewer = (page) => page.evaluate((sel) => {
    const v = document.querySelector(sel);
    if (!v || v.hidden) return { open: false, overflow: document.documentElement.style.overflow };
    return {
        open: true,
        pos: (v.querySelector('.mb-artv-pos') || {}).textContent || null,
        grid: !!v.querySelector('.mb-artv-grid'),
        gridHdrs: Array.from(v.querySelectorAll('.mb-artv-grid-hdr')).map((h) => h.textContent),
        info: (v.querySelector('.mb-artv-info') || {}).textContent || '',
        focusInside: v.contains(document.activeElement),
        overflow: document.documentElement.style.overflow,
        imgSrc: (v.querySelector('.mb-artv-img') || {}).src || null,
        imgSize: (v.querySelector('.mb-artv-img') || { dataset: {} }).dataset.artvSize || null,
    };
}, VIEWER);

/**
 * Clicks tile `i`'s thumbnail with a plain left click.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} i
 */
const clickTile = (page, i) => page.click(`figure.mb-release-art-tile[data-mb-art-i="${i}"] > a`);

test.describe('release-tracks Cover art viewer (P3)', () => {
    test('a tile opens the viewer at that image; keys step and wrap; Esc closes and refocuses the tile', async ({ page }) => {
        await openRelease(page);
        await clickTile(page, 3);
        let v = await viewer(page);
        expect(v.open).toBe(true);
        expect(v.pos).toBe('4 / 16');
        expect(v.info).toContain('opened gatefold cover, inside left');
        expect(v.info).toContain('Other 2 of 3');
        expect(v.focusInside).toBe(true);
        expect(v.overflow, 'page scrolling is locked').toBe('hidden');

        await page.keyboard.press('ArrowRight');
        expect((await viewer(page)).pos).toBe('5 / 16');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        expect((await viewer(page)).pos).toBe('3 / 16');
        await page.keyboard.press('End');
        expect((await viewer(page)).pos).toBe('16 / 16');
        await page.keyboard.press('ArrowRight');
        expect((await viewer(page)).pos, 'wraps to the first').toBe('1 / 16');
        await page.keyboard.press('ArrowLeft');
        expect((await viewer(page)).pos, 'wraps to the last').toBe('16 / 16');
        await page.keyboard.press('Home');
        expect((await viewer(page)).pos).toBe('1 / 16');

        await page.keyboard.press('Escape');
        v = await viewer(page);
        expect(v.open).toBe(false);
        expect(v.overflow, 'scrolling restored').toBe('');
        await expect(page.locator('figure.mb-release-art-tile[data-mb-art-i="3"] > a')).toBeFocused();
    });

    test('while open, no key reaches the page; after close they do again', async ({ page }) => {
        await openRelease(page);
        await page.evaluate(() => {
            window.__pageKeys = [];
            document.addEventListener('keydown', (e) => window.__pageKeys.push(e.key), true);
        });
        await clickTile(page, 0);
        for (const k of ['ArrowRight', '?', '/', 'Control+m', 'Control+g', 'Tab']) await page.keyboard.press(k);
        expect(await page.evaluate(() => window.__pageKeys)).toEqual([]);
        expect((await viewer(page)).open, 'still open: ? / Ctrl+M did not act on it').toBe(true);

        // Shift+Esc closes the viewer like Esc — and the page, whose Shift+Esc
        // clears every column filter, must not see it either.
        await page.keyboard.press('Shift+Escape');
        expect((await viewer(page)).open).toBe(false);
        expect(await page.evaluate(() => window.__pageKeys)).toEqual([]);
        await page.keyboard.press('ArrowDown');
        expect(await page.evaluate(() => window.__pageKeys)).toEqual(['ArrowDown']);
    });

    test('Tab and Shift+Tab keep focus inside the viewer', async ({ page }) => {
        await openRelease(page);
        await clickTile(page, 5);
        // More presses than the overlay has focusable elements (about 11), in
        // each direction, so the browser's own order would leave it.
        for (const key of ['Tab', 'Shift+Tab']) {
            for (let n = 0; n < 25; n++) {
                await page.keyboard.press(key);
                expect((await viewer(page)).focusInside, `${key} #${n + 1}`).toBe(true);
            }
        }
    });

    test('G opens the grid grouped by first type; Esc returns to the image, then closes', async ({ page }) => {
        await openRelease(page);
        await clickTile(page, 7);
        await page.keyboard.press('g');
        let v = await viewer(page);
        expect(v.grid).toBe(true);
        expect(v.gridHdrs).toEqual(
            ['Front × 1', 'Back × 1', 'Other × 3', 'Liner × 4', 'Medium × 4', 'Poster × 2', 'Sticker × 1']);
        await page.click(`${VIEWER} .mb-artv-grid img[data-artv-go="13"]`);
        v = await viewer(page);
        expect(v.grid).toBe(false);
        expect(v.pos).toBe('14 / 16');

        await page.keyboard.press('g');
        await page.keyboard.press('Escape');
        v = await viewer(page);
        expect(v.open).toBe(true);
        expect(v.grid, 'Esc from a G grid goes back to the image').toBe(false);
        await page.keyboard.press('Escape');
        expect((await viewer(page)).open).toBe(false);
    });

    test('a plain click on the "Cover art" tab opens the grid — no leave-page confirm, no navigation', async ({ page }) => {
        await openRelease(page);
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
        await page.click(TAB);
        const v = await viewer(page);
        expect(v.open).toBe(true);
        expect(v.grid).toBe(true);
        expect(v.pos).toBe('16 images');
        expect(dialogs).toEqual([]);
        expect(page.url()).toBe(URL);

        await page.keyboard.press('Escape');
        expect((await viewer(page)).open, 'a viewer opened in grid closes on Esc').toBe(false);
        await expect(page.locator(TAB)).toBeFocused();
    });

    test('a Ctrl-click on the tab is not intercepted', async ({ page }) => {
        await openRelease(page);
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
        await page.click(TAB, { modifiers: ['Control'] });
        await expect.poll(() => dialogs.length, 'the navigation guard saw the click').toBe(1);
        expect((await viewer(page)).open).toBe(false);
    });

    test('opened from a chip-filtered sheet, the viewer steps through the shown tiles only', async ({ page }) => {
        await openRelease(page);
        await page.click('.mb-release-art-chip[data-mb-art-filter="Medium"]');
        await clickTile(page, 8);
        expect((await viewer(page)).pos).toBe('2 / 4');
        await page.keyboard.press('ArrowRight');
        const v = await viewer(page);
        expect(v.pos).toBe('3 / 4');
        expect(v.info).toContain('12 of 16');
    });

    test('the large image replaces the thumbnail; the viewer makes no JSON request', async ({ page }) => {
        const { hits } = await openRelease(page, { bigImages: true });
        await clickTile(page, 0);
        await expect.poll(async () => (await viewer(page)).imgSize).toBe('big');
        expect((await viewer(page)).imgSrc).toMatch(/34698678836-1200\.jpg$/);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('g');
        await page.keyboard.press('Escape');
        expect(hits(), 'only the section\'s own record request').toBe(1);
    });
});
