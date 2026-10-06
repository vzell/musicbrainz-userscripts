'use strict';

// release-tracks Cover art section: the "Spreads" layout (mockup R6) —
// org/CAA-release-tracks-handling.org, phase P4.
//
// The record is the real 16-image one of d0adda7e: images 3 + 4 are "opened
// gatefold cover, inside left/right" (type Other), image 2 is "… inside"
// (Other, no side), images 5, 6, 9, 10 are Liner pages without comments.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. ONLY A TRUE LEFT/RIGHT PAIR BECOMES A SPREAD; "… inside" stays single.
//     "A spread is shown" alone passes on code that pairs any two Other
//     images, or that swallows the unpaired "inside" image.
//  2. THE PAGER STEPS TWO PAGES AT A TIME AND STOPS AT BOTH ENDS. Showing the
//     first two pages passes on code with no pager at all.
//  3. NO IMAGE IS LOST OR DOUBLED across spreads, pager and singles.
//  4. AMBIGUITY PAIRS NOTHING: two lefts for one key, or a left and a right
//     of different types, stay single. The happy path cannot see either.
//  5. THE CHIP FILTER APPLIES to the spreads layout too.
//  6. THE VIEWER STEPS THROUGH THE SPREADS ORDER, INCLUDING THE LINER PAGES
//     THE PAGER HIDES. Collecting the visible tiles (what Grid does) loses
//     pages 3–4 of the liner, which no on-screen assertion notices.
//  7. GRID STAYS THE DEFAULT, and the choice is remembered.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const RECORD_TEXT = fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8');
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const CORS = { 'access-control-allow-origin': '*' };
const LAYOUT_KEY = 'mb_sa_release_art_layout';

/**
 * A fresh copy of the real record, optionally edited.
 *
 * @param {function(Object): void} [edit] Mutates the parsed record.
 * @returns {string}
 */
function record(edit) {
    const r = JSON.parse(RECORD_TEXT);
    if (edit) edit(r);
    return JSON.stringify(r);
}

/**
 * Loads the medley fixture with the archive routed, presses "Show all" and
 * waits for the section's sheet.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{body?: string}} [opts]
 * @returns {Promise<{hits: function(): number}>}
 */
async function openRelease(page, { body = record() } = {}) {
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
    await page.route(META_RE, (route) => {
        hits += 1;
        return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body });
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.locator('.mb-release-art-sec[data-mb-art-state="ok"]').waitFor({ state: 'attached', timeout: 15000 });
    return { hits: () => hits };
}

/**
 * The section's sheet as the user sees it: one entry per Spreads block.
 *
 * @param {import('@playwright/test').Page} page
 */
const sheet = (page) => page.evaluate(() => {
    const sec = document.querySelector('.mb-release-art-sec');
    const idx = (root) => Array.from(root.querySelectorAll('figure.mb-release-art-tile')).map((f) => Number(f.dataset.mbArtI));
    return {
        pressed: (sec.querySelector('[data-mb-art-layout][aria-pressed="true"]') || {}).dataset?.mbArtLayout || null,
        blocks: Array.from(sec.querySelectorAll('.mb-release-art-spread')).map((b) => ({
            hdr: b.querySelector('.mb-release-art-group-hdr').textContent,
            spread: 'mbArtSpread' in b.dataset,
            book: 'mbArtBook' in b.dataset,
            tiles: idx(b),
            foot: (b.querySelector('.mb-release-art-spread-foot') || {}).textContent || '',
            prev: (b.querySelector('[data-mb-art-book-step="-1"]') || {}).disabled,
            next: (b.querySelector('[data-mb-art-book-step="1"]') || {}).disabled,
        })),
        allTiles: idx(sec),
    };
});

/**
 * Switches the section's layout with its own button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
const setLayout = (page, key) => page.click(`.mb-release-art-sec [data-mb-art-layout="${key}"]`);

test.describe('release-tracks Cover art: Spreads layout (P4, R6)', () => {
    test('Grid stays the default; Spreads is offered and remembered', async ({ page }) => {
        await openRelease(page);
        let s = await sheet(page);
        expect(s.pressed).toBe('grid');
        expect(s.blocks).toHaveLength(0);
        await setLayout(page, 'spreads');
        s = await sheet(page);
        expect(s.pressed).toBe('spreads');
        expect(await page.evaluate((k) => window.GM_getValue(k, null), LAYOUT_KEY)).toBe('spreads');
    });

    test('only the left/right pair becomes a spread; the pager and singles hold the rest, once each', async ({ page }) => {
        await openRelease(page);
        await setLayout(page, 'spreads');
        const s = await sheet(page);
        const spreads = s.blocks.filter((b) => b.spread);
        expect(spreads).toHaveLength(1);
        expect(spreads[0].tiles).toEqual([3, 4]);
        expect(spreads[0].hdr).toBe('Other: opened gatefold cover, inside');
        expect(spreads[0].foot).toContain('inside left');
        expect(spreads[0].foot).toContain('inside right');

        const book = s.blocks.find((b) => b.book);
        expect(book.hdr).toBe('Liner, 4 pages');
        expect(book.tiles).toEqual([5, 6]);

        const singles = s.blocks.find((b) => !b.spread && !b.book);
        expect(singles.hdr).toBe('Single pages, 10');
        expect(singles.tiles).toEqual([0, 1, 2, 7, 8, 11, 12, 13, 14, 15]);

        // Every image once: 14 on screen, the other two liner pages behind ▶.
        expect(new Set(s.allTiles).size).toBe(s.allTiles.length);
        expect(s.allTiles.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15]);
    });

    test('the liner pager steps two pages at a time and stops at both ends', async ({ page }) => {
        await openRelease(page);
        await setLayout(page, 'spreads');
        const book = async () => (await sheet(page)).blocks.find((b) => b.book);
        let b = await book();
        expect(b.foot).toContain('pages 1–2 of 4');
        expect(b.prev).toBe(true);
        expect(b.next).toBe(false);

        await page.click('.mb-release-art-sec [data-mb-art-book-step="1"]');
        b = await book();
        expect(b.tiles).toEqual([9, 10]);
        expect(b.foot).toContain('pages 3–4 of 4');
        expect(b.prev).toBe(false);
        expect(b.next).toBe(true);

        // A page index past the end (a forced extra ▶) shows the last page and
        // is stored clamped, so ONE ◀ then goes back to the first.
        await page.evaluate(() => {
            const sec = document.querySelector('.mb-release-art-sec');
            sec.dataset.mbArtBookPage = '7';
            const next = sec.querySelector('[data-mb-art-book-step="1"]');
            next.disabled = false;
            next.click();
        });
        b = await book();
        expect(b.tiles, 'past the end: the last page').toEqual([9, 10]);
        await page.click('.mb-release-art-sec [data-mb-art-book-step="-1"]');
        b = await book();
        expect(b.tiles, 'one step back from the clamped last page').toEqual([5, 6]);

        await page.click('.mb-release-art-sec [data-mb-art-book-step="1"]');
        expect((await book()).tiles, 'premise: on page 2 before the switch').toEqual([9, 10]);
        await page.click('.mb-release-art-sec [data-mb-art-layout="grid"]');
        await setLayout(page, 'spreads');
        expect((await book()).tiles, 'a layout switch starts on page 1').toEqual([5, 6]);
    });

    test('ambiguity pairs nothing: two lefts for one key stay single pages', async ({ page }) => {
        await openRelease(page, {
            body: record((r) => {
                // Image 15 becomes a second "inside left" of type Other.
                r.images[15].types = ['Other'];
                r.images[15].comment = 'opened gatefold cover, inside left';
            }),
        });
        await setLayout(page, 'spreads');
        const s = await sheet(page);
        expect(s.blocks.filter((b) => b.spread), 'two lefts: no spread').toHaveLength(0);
        expect(s.blocks.find((b) => !b.spread && !b.book).tiles).toEqual(expect.arrayContaining([2, 3, 4, 15]));
    });

    test('ambiguity pairs nothing: a left and a right of different types stay apart', async ({ page }) => {
        await openRelease(page, {
            body: record((r) => {
                // The right page is typed Sticker: same comment prefix, different type.
                r.images[4].types = ['Sticker'];
            }),
        });
        await setLayout(page, 'spreads');
        const s = await sheet(page);
        expect(s.blocks.filter((b) => b.spread), 'different types: no spread').toHaveLength(0);
    });

    test('the chip filter applies: "Liner" leaves only the pager', async ({ page }) => {
        await openRelease(page);
        await setLayout(page, 'spreads');
        await page.click('.mb-release-art-sec [data-mb-art-filter="Liner"]');
        const s = await sheet(page);
        expect(s.blocks).toHaveLength(1);
        expect(s.blocks[0].book).toBe(true);
        expect(s.blocks[0].tiles).toEqual([5, 6]);
    });

    test('a tile opens the viewer over the spreads order, liner pages behind the pager included', async ({ page }) => {
        const { hits } = await openRelease(page);
        await setLayout(page, 'spreads');
        await page.click('figure.mb-release-art-tile[data-mb-art-i="3"] > a');
        const film = () => page.evaluate(() => ({
            pos: document.querySelector('#mb-art-viewer .mb-artv-pos').textContent,
            order: Array.from(document.querySelectorAll('#mb-art-viewer .mb-artv-film [data-artv-go]'))
                .map((n) => Number(n.dataset.artvGo)),
        }));
        let v = await film();
        expect(v.order).toEqual([3, 4, 5, 6, 9, 10, 0, 1, 2, 7, 8, 11, 12, 13, 14, 15]);
        expect(v.pos).toBe('1 / 16');
        await page.keyboard.press('Escape');

        await page.click('figure.mb-release-art-tile[data-mb-art-i="2"] > a');
        v = await film();
        expect(v.pos).toBe('9 / 16');
        expect(hits(), 'the layout makes no request of its own').toBe(1);
    });
});
