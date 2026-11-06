'use strict';

// The image section's P4a/P4b additions and the ⟳ retry on a touch screen
// (chromium-mobile: Pixel 7 emulation, touch, no hover) — org/image-handling.org,
// "Housekeeping" (vzell, 2026-11-06: "add the mobile tests").
//
// What is touch-only, and so not already pinned by the desktop specs
// (release-tracks-cover-art-p4a/art-viewer-tools/art-image-retry):
//
//  1. TABLE VIEW: it scrolls inside its own box, never the section; a tap on a
//     row's picture opens the viewer at THAT picture and shows no hover card.
//  2. TILES at the largest size still wrap inside the section on a phone.
//  3. RETRY: a tap on a failed tile's ⟳ asks again without opening the
//     viewer; a tap on the tile itself still opens it.
//  4. ADJUST: a finger dragging a slider is not a swipe — the picture does
//     not step (which would also have reset the adjustment). The panel lies
//     ON the stage, whose pointer handlers read a 50 px move as a swipe.
//  5. COMPARE: a swipe changes the RIGHT picture, as ← → do; the left one
//     stays (a plain step moved the left one).
//  6. LOUPE: one finger moves the lens over the picture (it followed the
//     mouse only, so on a phone the button did nothing), and does not swipe.
//
// How a touch is made here:
//  - The section's controls and its tiles are tapped for real
//    (page.touchscreen at the box centre, after scrolling it into view), and
//    the pointerdown target is asserted rather than assumed (see
//    release-tracks-cover-art.mobile.spec.js on locator.tap()'s hit-check on
//    this zoomed-out layout).
//  - The viewer's bar buttons are pressed with a DOM click: MusicBrainz pages
//    carry no viewport meta, so this page's layout viewport is 1648 px wide
//    (its tracklist 8458 px) against a 412 px visual one, the full-screen
//    viewer is 1648 px wide, and Adjust/Compare/Loupe sit beyond x = 1000 —
//    outside what page.touchscreen can reach in this emulation. A button
//    press is no different on a phone; what is touch-specific is the
//    gesture on the stage, and that is dispatched as the touch
//    PointerEvents the viewer reads (one pointerId per finger), as the
//    other viewer mobile specs do.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { openRelease, noTransition, waitForBigImage, VIEWER, RECORD } = require('../support/artViewerFixture');

const N = RECORD.images.length;
const SEC = '.mb-release-art-sec';
const pos = (page) => page.locator(`${VIEWER} .mb-artv-pos`);
const stageImg = (page) => page.locator(`${VIEWER} .mb-artv-stage .mb-artv-img`);
// The read-only Sidebar cards push the section ~400 px down; off, as in
// release-tracks-cover-art.mobile.spec.js.
const SETTINGS = { sa_sidebar_inline_main: false };

/**
 * Taps the element with a real touch at its box centre and asserts that the
 * touch landed on it or inside it (pointerdown's target).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} loc
 * @param {string} what  Named in the failure message.
 */
async function tapAt(page, loc, what) {
    await loc.scrollIntoViewIfNeeded();
    await loc.evaluate((el) => {
        document.querySelectorAll('[data-tap-goal]').forEach((g) => g.removeAttribute('data-tap-goal'));
        el.setAttribute('data-tap-goal', '');
        window.__tapLanded = null;
        document.addEventListener('pointerdown', (e) => {
            window.__tapLanded = !!(e.target instanceof Element && e.target.closest('[data-tap-goal]'));
        }, { capture: true, once: true });
    });
    const box = await loc.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect(await page.evaluate(() => window.__tapLanded), `the touch landed on ${what}`).toBe(true);
}

/**
 * Presses a viewer bar button (a DOM click: see the header on why not a touch).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} action  Its data-artv.
 */
const press = (page, action) => page.locator(`${VIEWER} button[data-artv="${action}"]`).evaluate((b) => b.click());

/**
 * Dispatches one touch PointerEvent per finger on `sel` (bubbling to the viewer).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @param {string} type  pointerdown / pointermove / pointerup
 * @param {Array<{id: number, x: number, y: number}>} fingers  Viewport coordinates.
 */
const touch = (page, sel, type, fingers) => page.evaluate(([s, t, fs]) => {
    const el = document.querySelector(s);
    fs.forEach((f) => el.dispatchEvent(new PointerEvent(t, {
        bubbles: true, pointerType: 'touch', pointerId: f.id, isPrimary: f.id === 1, clientX: f.x, clientY: f.y,
    })));
}, [sel, type, fingers]);

/**
 * A one-finger horizontal swipe across the stage's middle, from `a` to `b`
 * (px from the stage's left edge).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} a
 * @param {number} b
 */
async function swipe(page, a, b) {
    const r = await page.locator(`${VIEWER} .mb-artv-stage`).boundingBox();
    const y = r.y + r.height / 2;
    await touch(page, `${VIEWER} .mb-artv-stage`, 'pointerdown', [{ id: 1, x: r.x + a, y }]);
    await touch(page, `${VIEWER} .mb-artv-stage`, 'pointermove', [{ id: 1, x: r.x + (a + b) / 2, y }]);
    await touch(page, `${VIEWER} .mb-artv-stage`, 'pointerup', [{ id: 1, x: r.x + b, y }]);
}

/**
 * Opens the viewer on tile `i` with a real tap and waits for its 1200 px image.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [i=0]
 */
async function tapOpenViewer(page, i = 0) {
    await tapAt(page, page.locator(`${SEC} figure.mb-release-art-tile[data-mb-art-i="${i}"] > a`), 'the tile');
    await noTransition(page);
    await waitForBigImage(page);
}

test.describe('image section on a touch screen (P4a, P4b, retry)', () => {
    test('Table view: scrolls in its own box; a tap on a row\'s picture opens the viewer there, with no hover card', async ({ page }) => {
        await openRelease(page, { settings: SETTINGS });
        await tapAt(page, page.locator(`${SEC} [data-mb-art-layout="table"]`), 'the Table button');
        const table = page.locator(`${SEC} table.mb-release-art-table`);
        await expect(table).toBeVisible();
        const fit = await page.evaluate((sel) => {
            const sec = document.querySelector(sel);
            const wrap = sec.querySelector('.mb-release-art-tablewrap');
            return {
                overflow: getComputedStyle(wrap).overflowX,
                wrapRight: wrap.getBoundingClientRect().right,
                secRight: sec.getBoundingClientRect().right,
            };
        }, SEC);
        expect(fit.overflow, 'the table scrolls inside its box').toBe('auto');
        expect(fit.wrapRight, 'the box stays inside the section').toBeLessThanOrEqual(fit.secRight + 0.5);

        await page.evaluate(() => {
            window.__tipShown = false;
            const tip = () => document.getElementById('mb-stat-tooltip');
            new MutationObserver(() => {
                const t = tip();
                if (t && t.style.display && t.style.display !== 'none') window.__tipShown = true;
            }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
        });
        // The third row, whatever the table's sort put there.
        const row = table.locator('tbody tr[data-mb-art-i]').nth(2);
        const i = Number(await row.getAttribute('data-mb-art-i'));
        await tapAt(page, row.locator('a.mb-release-art-row-link'), 'the row\'s picture');
        await expect(pos(page)).toHaveText(`${i + 1} / ${N}`);
        expect(await page.evaluate(() => window.__tipShown), 'a tap shows no hover card').toBe(false);
    });

    test('Tiles at the largest size still wrap inside the section', async ({ page }) => {
        await openRelease(page, { settings: SETTINGS });
        await page.locator(`${SEC} .mb-release-art-size input[type="range"]`).evaluate((r) => {
            r.value = r.max;
            r.dispatchEvent(new Event('input', { bubbles: true }));
            r.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const fit = await page.evaluate((sel) => {
            const sec = document.querySelector(sel);
            const right = sec.getBoundingClientRect().right;
            const tiles = Array.from(sec.querySelectorAll('figure.mb-release-art-tile')).map((f) => f.getBoundingClientRect());
            return { right, width: tiles[0].width, over: tiles.filter((r) => r.right > right + 0.5).length, n: tiles.length };
        }, SEC);
        expect(fit.width, 'premise: the tiles grew').toBeGreaterThan(200);
        expect(fit.over, 'no tile past the section\'s right edge').toBe(0);
        // ↺ is there to tap, and takes them back.
        const reset = page.locator(`${SEC} .mb-release-art-size-reset`);
        await expect(reset).toBeVisible();
        await tapAt(page, reset, 'the ↺');
        await expect(reset).toBeHidden();
        expect(await page.locator(`${SEC} figure.mb-release-art-tile`).first().evaluate((f) => f.getBoundingClientRect().width)).toBeLessThan(200);
    });

    test('a tap on a failed tile\'s ⟳ asks again without opening the viewer; a tap on the tile opens it', async ({ page }) => {
        const files = { thumbs: 'fail' };
        const CORS = { 'access-control-allow-origin': '*' };
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e',
            fixtureFile: path.join(__dirname, 'release-tracks-medley.html'), testMode: true,
            settingsOverride: { sa_enable_release_tracks: true, sa_enable_release_tracks_cover_art: true, sa_art_idb_enable: false, ...SETTINGS },
        });
        await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
        await page.route(/^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/\d+-250\.jpg$/, (route) => (files.thumbs === 'fail'
            ? route.abort('timedout')
            : route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PNG })));
        await page.route(/^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/, (route) => route.fulfill({
            status: 200, headers: CORS, contentType: 'application/json',
            body: fs.readFileSync(path.join(__dirname, 'caa-release-d0adda7e.json'), 'utf8'),
        }));
        await page.locator('button[data-label="Show all Tracks for Release"]').evaluate((b) => b.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.locator(`${SEC}[data-mb-art-state="ok"]`).waitFor({ state: 'attached', timeout: 15000 });

        const tile = page.locator(`${SEC} figure.mb-release-art-tile`).first();
        await expect(tile.locator('a')).toHaveClass(/\bmb-img-failed\b/);
        files.thumbs = 'ok';
        await tapAt(page, tile.locator('.mb-img-retry'), 'the ⟳');
        await expect(tile.locator('a')).not.toHaveClass(/\bmb-img-failed\b/);
        await expect.poll(() => tile.locator('img').evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
        await expect(page.locator(VIEWER), 'the ⟳ does not open the viewer').toBeHidden();
        await tapAt(page, tile.locator('a'), 'the tile');
        await expect(page.locator(VIEWER)).toBeVisible();
    });

    test('Adjust: a finger dragging a slider does not step the picture or reset it', async ({ page }) => {
        await openRelease(page, { settings: SETTINGS });
        await tapOpenViewer(page);
        await press(page, 'adjust');
        const slider = `${VIEWER} .mb-artv-adjust input[data-artv-adj="b"]`;
        await expect(page.locator(slider)).toBeVisible();
        // The finger goes down on the slider and lifts 120 px to the right; the
        // slider's own value follows it (set here, as a real drag would).
        const r = await page.locator(slider).boundingBox();
        const y = r.y + r.height / 2;
        await touch(page, slider, 'pointerdown', [{ id: 1, x: r.x + 4, y }]);
        await page.locator(slider).evaluate((el) => { el.value = '160'; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await touch(page, slider, 'pointermove', [{ id: 1, x: r.x + 64, y }]);
        await touch(page, slider, 'pointerup', [{ id: 1, x: r.x + 124, y }]);
        await page.locator(slider).evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
        await expect(pos(page), 'not a swipe: still the first picture').toHaveText(`1 / ${N}`);
        await expect.poll(() => stageImg(page).evaluate((i) => i.style.filter)).toBe('brightness(160%)');
        // Control: the same move on the picture itself is a swipe.
        await swipe(page, 250, 100);
        await expect(pos(page)).toHaveText(`2 / ${N}`);
    });

    test('Compare: a swipe changes the right picture, the left one stays', async ({ page }) => {
        await openRelease(page, { settings: SETTINGS });
        await tapOpenViewer(page);
        await press(page, 'compare');
        const caps = page.locator(`${VIEWER} .mb-artv-compare .mb-artv-cmp figcaption`);
        await expect(caps.nth(0)).toContainText(`Left: 1 / ${N}`);
        await expect(caps.nth(1)).toContainText(`Right: 2 / ${N}`);
        await swipe(page, 250, 100);
        await expect(caps.nth(1)).toContainText(`Right: 3 / ${N}`);
        await expect(caps.nth(0), 'the left one stays').toContainText(`Left: 1 / ${N}`);
        await swipe(page, 100, 250);
        await expect(caps.nth(1)).toContainText(`Right: 2 / ${N}`);
        await expect(page.locator(`${VIEWER} .mb-artv-compare .mb-artv-cmp-img`), 'still Compare').toHaveCount(2);
    });

    test('Loupe: one finger moves the lens over the picture and does not swipe', async ({ page }) => {
        await openRelease(page, { settings: SETTINGS });
        await tapOpenViewer(page);
        await press(page, 'loupe');
        const lens = page.locator(`${VIEWER} .mb-artv-loupe`);
        await expect(lens).toBeHidden();
        // The page's own rect, not locator.boundingBox(): a dispatched event's
        // clientX is compared with getBoundingClientRect(), and boundingBox()
        // adds the visual viewport's scroll on this zoomed-out phone layout.
        const box = await stageImg(page).evaluate((i) => {
            const r = i.getBoundingClientRect();
            return { x: r.left, y: r.top };
        });
        const stage = `${VIEWER} .mb-artv-stage`;
        // Down near the picture's top-left corner: the lens shows its own top-left.
        await touch(page, stage, 'pointerdown', [{ id: 1, x: box.x + 2, y: box.y + 2 }]);
        await expect(lens).toBeVisible();
        const read = () => lens.evaluate((el) => el.style.backgroundPosition.split(' ').map(parseFloat));
        let [bx, by] = await read();
        expect(bx, 'the lens shows the picture\'s left edge (75 px half-lens − 2 px × 2.5)').toBeGreaterThan(60);
        expect(by, 'and its top edge').toBeGreaterThan(60);
        // The finger slides 150 px right: the lens follows it.
        await touch(page, stage, 'pointermove', [{ id: 1, x: box.x + 152, y: box.y + 2 }]);
        [bx] = await read();
        expect(bx, 'the lens moved right over the picture').toBeLessThan(0);
        await touch(page, stage, 'pointerup', [{ id: 1, x: box.x + 152, y: box.y + 2 }]);
        await expect(pos(page), 'a lens move is not a swipe').toHaveText(`1 / ${N}`);
        // Off again: the same move swipes.
        await press(page, 'loupe');
        await swipe(page, 250, 100);
        await expect(pos(page)).toHaveText(`2 / ${N}`);
    });
});
