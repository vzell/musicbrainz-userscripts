'use strict';

// The artwork viewer (#mb-art-viewer): a zoomed image can be panned to every
// edge — org/viewer.org item 1 ("NOT possible to look at the very bottom of
// the image").
//
// The images served here have a REAL natural size (an SVG with width/height),
// portrait and larger than the stage. The other viewer specs serve a 1x1 PNG,
// which can never be taller than the stage and so can never show this.
//
// Every assertion is about the image the user SEES: its content rect, worked
// out from the layout box, the padding, object-fit: contain and the computed
// transform. That is independent of how the viewer builds it, so the same
// spec measures the code before and after the fix.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. FIT STAYS INSIDE THE STAGE. Unzoomed, the whole image is inside the
//     stage on all four sides. "The large image loaded" alone passes while
//     its box grows past the stage and overflow: hidden crops it — which is
//     what the code before the fix did (measured 2026-10-08: the fitted
//     image's bottom about 500 px below the stage's). It is also fitted to the
//     FRAME: clear of the gutters (the ‹ › buttons sit in the side ones) and
//     touching them on one axis.
//  2. EVERY EDGE IS REACHABLE WHEN ZOOMED, with the pointer NEAR the edge
//     (inside the outer zone, not on the last pixel): the image's edge lands
//     in the stage's gutter on that side. And it is not over-panned: the
//     opposite edge is still beyond the stage, so the image keeps covering it.
//  3. A FAST EXIT STILL REACHES THE EDGE: one mousemove from the centre
//     straight onto the filmstrip, below the stage, shows the bottom edge —
//     and no further than the edge.
//  4. THE THUMBNAIL IS SHOWN AT THE LARGE IMAGE'S SIZE: scaled up to the
//     frame, and the large image takes exactly its rect — no jump. (For a
//     large image alone, the CSS max-width/max-height fallback fits it too,
//     so only the small thumbnail shows whether the viewer sizes the box.)
//  5. A WINDOW RESIZE RE-FITS, and the pan works from the new geometry.
//  6. THE NARROW LAYOUT (below 760 px: info panel under the stage, smaller
//     gutters) fits inside ITS gutters, read from the stage's CSS custom
//     properties, and pans to the bottom edge too.

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
const THUMB_RE = /^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/\d+-250\.jpg$/;
const CORS = { 'access-control-allow-origin': '*' };
const VIEWER = '#mb-art-viewer';

/**
 * A portrait SVG of the given natural size, with a distinct bottom band.
 *
 * @param {number} w
 * @param {number} h
 * @returns {string}
 */
const svg = (w, h) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#6a4a8a"/>` +
    `<rect y="${h * 0.9}" width="${w}" height="${h * 0.1}" fill="#f0f0f0"/></svg>`;

/** The 1200 rendition: 1200 x 1500. The thumbnail has the same 4:5 ratio. */
const BIG = { w: 1200, h: 1500 };

test.use({ viewport: { width: 1280, height: 720 } });

/**
 * Loads the medley fixture, serves every thumbnail and 1200 px image as a
 * 4:5 portrait SVG, presses "Show all" and waits for the Cover art section.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openRelease(page) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_enable_release_tracks_cover_art: true,
            sa_art_idb_enable: false,
            sa_art_viewer_remember_zoom: false,
        },
    });
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
    await page.route(BIG_RE, (route) => route.fulfill({
        status: 200, headers: CORS, contentType: 'image/svg+xml', body: svg(BIG.w, BIG.h),
    }));
    await page.route(THUMB_RE, (route) => route.fulfill({
        status: 200, headers: CORS, contentType: 'image/svg+xml', body: svg(200, 250),
    }));
    await page.route(META_RE, (route) =>
        route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.locator('.mb-release-art-sec[data-mb-art-state="ok"]').waitFor({ state: 'attached', timeout: 15000 });
}

/**
 * Opens the viewer on tile 0, waits until the 1200 px image is in and fully
 * decoded, and switches the transform transition off so a measurement right
 * after a move reads the final position, not a frame of the animation.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openViewerOnBigImage(page) {
    await page.click('figure.mb-release-art-tile[data-mb-art-i="0"] > a');
    await page.addStyleTag({ content: `${VIEWER} .mb-artv-img { transition: none !important; }` });
    await expect.poll(() => page.evaluate((sel) => {
        const img = document.querySelector(`${sel} .mb-artv-img`);
        return !!img && img.dataset.artvSize === 'big' && img.complete && img.naturalWidth;
    }, VIEWER), { message: 'the 1200 px image replaced the thumbnail' }).toBe(BIG.w);
}

/**
 * What the user sees: the stage's rect, the filmstrip's, and the rect the
 * image's PIXELS occupy (not its box) — the layout box without the transform,
 * minus the padding, letterboxed by object-fit: contain (centred), then
 * mapped through the computed transform about the computed transform-origin.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{stage: Object, film: Object, img: Object, natural: Object}>}
 */
const measure = (page) => page.evaluate((sel) => {
    const v = document.querySelector(sel);
    const stageEl = v.querySelector('.mb-artv-stage');
    const img = v.querySelector('.mb-artv-img');
    const rect = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const cs = getComputedStyle(img);
    const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
    // The untransformed layout box (transitions are off, so this is exact).
    const saved = img.style.transform;
    img.style.transform = 'none';
    const box = img.getBoundingClientRect();
    img.style.transform = saved;
    void img.offsetWidth;
    const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
    const pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
    const cw = box.width - pl - pr, ch = box.height - pt - pb;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    let w = cw, h = ch;
    if (cs.objectFit === 'contain' && nw && nh) {
        const k = Math.min(cw / nw, ch / nh);
        w = nw * k;
        h = nh * k;
    }
    // Content rect relative to the box's top-left, untransformed.
    const x0 = pl + (cw - w) / 2, y0 = pt + (ch - h) / 2;
    const map = (x, y) => {
        const p = m.transformPoint(new DOMPoint(x - ox, y - oy));
        return { x: box.left + ox + p.x, y: box.top + oy + p.y };
    };
    const a = map(x0, y0), b = map(x0 + w, y0 + h);
    return {
        stage: rect(stageEl.getBoundingClientRect()),
        film: rect(v.querySelector('.mb-artv-film').getBoundingClientRect()),
        img: { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y },
        natural: { w: nw, h: nh },
    };
}, VIEWER);

/**
 * Zooms with ↑ until the image is `times` its fitted size (0.5 per press).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} times
 */
async function zoomTo(page, times) {
    for (let z = 1; z < times; z += 0.5) await page.keyboard.press('ArrowUp');
}

// The image's edge, once panned to it, sits in the stage's gutter on that
// side: never off the stage, and never further in than the gutter (the
// viewer keeps the image 12 px off the top/bottom and 56 px off the sides, the
// width of the ‹ › buttons) — so 1 px of slack past each.
const GUTTER = { y: 12, x: 56 };
// Below 760 px the viewer's gutters shrink to 8 / 44 px.
const NARROW_GUTTER = { y: 8, x: 44 };

/**
 * The fitted image keeps clear of the gutters on every side (the ‹ ›
 * buttons sit in the side ones), and touches them on at least one axis — so
 * it is fitted to the FRAME, not to the whole stage or to something smaller.
 *
 * @param {{stage: Object, img: Object}} g  From measure().
 * @param {{x: number, y: number}}       gut
 */
function expectInsideGutters(g, gut) {
    expect(g.img.top, 'clear of the top gutter').toBeGreaterThanOrEqual(g.stage.top + gut.y - 1);
    expect(g.img.bottom, 'clear of the bottom gutter').toBeLessThanOrEqual(g.stage.bottom - gut.y + 1);
    expect(g.img.left, 'clear of the left gutter').toBeGreaterThanOrEqual(g.stage.left + gut.x - 1);
    expect(g.img.right, 'clear of the right gutter').toBeLessThanOrEqual(g.stage.right - gut.x + 1);
    const touchesY = Math.abs(g.img.top - (g.stage.top + gut.y)) < 1.5;
    const touchesX = Math.abs(g.img.left - (g.stage.left + gut.x)) < 1.5;
    expect(touchesX || touchesY, 'fitted to the frame on one axis').toBe(true);
}

test.describe('artwork viewer: panning reaches every edge (org/viewer.org #1)', () => {
    test('fitted, the whole image is inside the stage', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        const g = await measure(page);
        expect(g.natural).toEqual(BIG);
        expect(g.stage.height, 'premise: the image is taller than the stage').toBeLessThan(BIG.h);
        expect(g.img.top, 'top inside the stage').toBeGreaterThanOrEqual(g.stage.top - 0.5);
        expect(g.img.bottom, 'bottom inside the stage').toBeLessThanOrEqual(g.stage.bottom + 0.5);
        expect(g.img.left, 'left inside the stage').toBeGreaterThanOrEqual(g.stage.left - 0.5);
        expect(g.img.right, 'right inside the stage').toBeLessThanOrEqual(g.stage.right + 0.5);
        expect(g.img.height, 'and it is fitted, not shown tiny').toBeGreaterThan(g.stage.height * 0.8);
        expectInsideGutters(g, GUTTER);
    });

    test('zoomed 3x, a pointer near each edge brings that edge into view, and no further', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await zoomTo(page, 3);
        const s = (await measure(page)).stage;
        const cx = (s.left + s.right) / 2, cy = (s.top + s.bottom) / 2;
        // Inside the outer zone of each side, NOT on its last pixel: 8 % of
        // the half-size in from the edge.
        const inX = 0.08 * s.width / 2, inY = 0.08 * s.height / 2;
        // Per edge: where to point, that side's gutter, how far the image's
        // edge sits INSIDE the stage's (inset), and how far its opposite edge
        // still reaches PAST the stage's opposite edge (over).
        const cases = [
            { edge: 'bottom', x: cx, y: s.bottom - inY, gut: GUTTER.y,
              inset: (i, t) => t.bottom - i.bottom, over: (i, t) => t.top - i.top },
            { edge: 'top', x: cx, y: s.top + inY, gut: GUTTER.y,
              inset: (i, t) => i.top - t.top, over: (i, t) => i.bottom - t.bottom },
            { edge: 'right', x: s.right - inX, y: cy, gut: GUTTER.x,
              inset: (i, t) => t.right - i.right, over: (i, t) => t.left - i.left },
            { edge: 'left', x: s.left + inX, y: cy, gut: GUTTER.x,
              inset: (i, t) => i.left - t.left, over: (i, t) => i.right - t.right },
        ];
        for (const c of cases) {
            await page.mouse.move(cx, cy, { steps: 4 });
            await page.mouse.move(c.x, c.y, { steps: 12 });
            const { img, stage } = await measure(page);
            expect(c.inset(img, stage), `${c.edge} edge on screen`).toBeGreaterThanOrEqual(-0.5);
            expect(c.inset(img, stage), `${c.edge} edge in the gutter`).toBeLessThanOrEqual(c.gut + 1);
            expect(c.over(img, stage), `not over-panned: still covers the side opposite ${c.edge}`).toBeGreaterThan(0);
        }
    });

    test('zoomed 3x, one fast move from the centre onto the filmstrip shows the bottom edge', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await zoomTo(page, 3);
        const { stage: s, film } = await measure(page);
        const cx = (s.left + s.right) / 2;
        await page.mouse.move(cx, (s.top + s.bottom) / 2, { steps: 4 });
        expect(film.top, 'premise: the filmstrip is right below the stage').toBeGreaterThanOrEqual(s.bottom - 0.5);
        // One event, and it lands outside the stage.
        await page.mouse.move(cx, (film.top + film.bottom) / 2, { steps: 1 });
        const { img, stage } = await measure(page);
        expect(img.bottom, 'bottom edge on screen').toBeLessThanOrEqual(stage.bottom + 0.5);
        expect(img.bottom, 'bottom edge in the gutter, not short of it and not past it')
            .toBeGreaterThanOrEqual(stage.bottom - GUTTER.y - 1);
    });
});

test.describe('artwork viewer: the fit follows the image and the window', () => {
    test('the thumbnail is shown at the size the large image takes, so the swap does not jump', async ({ page }) => {
        await openRelease(page);
        // Hold the 1200 px image back until the thumbnail has been measured.
        let release;
        const held = new Promise((r) => { release = r; });
        await page.unroute(BIG_RE);
        await page.route(BIG_RE, async (route) => {
            await held;
            await route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: svg(BIG.w, BIG.h) });
        });
        await page.click('figure.mb-release-art-tile[data-mb-art-i="0"] > a');
        await page.addStyleTag({ content: `${VIEWER} .mb-artv-img { transition: none !important; }` });
        await expect.poll(() => page.evaluate((sel) => {
            const img = document.querySelector(`${sel} .mb-artv-img`);
            return !!img && img.dataset.artvSize === 'thumb' && img.complete && img.naturalWidth;
        }, VIEWER), { message: 'the 200 x 250 thumbnail is in' }).toBe(200);
        const thumb = await measure(page);
        expectInsideGutters(thumb, GUTTER);
        expect(thumb.img.height, 'scaled up from its natural 250 px').toBeGreaterThan(250 * 1.5);

        release();
        await expect.poll(() => page.evaluate((sel) =>
            document.querySelector(`${sel} .mb-artv-img`).naturalWidth, VIEWER)).toBe(BIG.w);
        const big = await measure(page);
        for (const k of ['left', 'top', 'right', 'bottom']) {
            expect(Math.abs(big.img[k] - thumb.img[k]), `${k} unchanged by the swap`).toBeLessThan(1);
        }
    });

    test('after a window resize the image is re-fitted, and still pans to the bottom edge', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await page.setViewportSize({ width: 1100, height: 640 });
        let g = await measure(page);
        expectInsideGutters(g, GUTTER);

        await zoomTo(page, 3);
        const s = g.stage;
        const cx = (s.left + s.right) / 2;
        await page.mouse.move(cx, (s.top + s.bottom) / 2, { steps: 4 });
        await page.mouse.move(cx, s.bottom - 0.08 * s.height / 2, { steps: 12 });
        g = await measure(page);
        expect(g.img.bottom, 'bottom edge on screen').toBeLessThanOrEqual(g.stage.bottom + 0.5);
        expect(g.img.bottom, 'bottom edge in the gutter').toBeGreaterThanOrEqual(g.stage.bottom - GUTTER.y - 1);
    });
});

test.describe('artwork viewer, narrow window (info panel below the stage)', () => {
    test.use({ viewport: { width: 700, height: 900 } });

    test('fitted inside the smaller gutters; zoomed, a pointer near the bottom shows the bottom edge', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        let g = await measure(page);
        expect(g.stage.width, 'premise: the stage spans the window (narrow layout)').toBeGreaterThan(650);
        expect(g.stage.height, 'premise: the image is taller than the stage').toBeLessThan(BIG.h);
        expectInsideGutters(g, NARROW_GUTTER);

        await zoomTo(page, 3);
        const s = g.stage;
        const cx = (s.left + s.right) / 2;
        await page.mouse.move(cx, (s.top + s.bottom) / 2, { steps: 4 });
        await page.mouse.move(cx, s.bottom - 0.08 * s.height / 2, { steps: 12 });
        g = await measure(page);
        expect(g.img.bottom, 'bottom edge on screen').toBeLessThanOrEqual(g.stage.bottom + 0.5);
        expect(g.img.bottom, 'bottom edge in the gutter').toBeGreaterThanOrEqual(g.stage.bottom - NARROW_GUTTER.y - 1);
    });
});
