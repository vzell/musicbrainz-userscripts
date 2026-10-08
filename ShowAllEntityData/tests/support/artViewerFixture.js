'use strict';

// The artwork viewer (#mb-art-viewer) on the release-tracks medley fixture,
// with images that have a REAL natural size — shared by art-viewer-pan.spec.js
// and art-viewer-extras(.mobile).spec.js.
//
// Every image the other viewer specs serve is a 1x1 PNG, which can never be
// taller than the stage, so it can show no fit, pan or rotation defect. Here
// every thumbnail and 1200 px image is an SVG with width/height: 4:5 portrait
// (thumbnail 200 x 250, 1200 rendition 1200 x 1500), with a light band along
// its bottom.

const fs = require('fs');
const path = require('path');
const { expect } = require('./test');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');

const URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'release-tracks-medley.html');
const RECORD_TEXT = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'caa-release-d0adda7e.json'), 'utf8');
/** The archive record the medley release is served, parsed. */
const RECORD = JSON.parse(RECORD_TEXT);
const META_RE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})$/;
const BIG_RE = /^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/\d+-1200\.jpg$/;
const THUMB_RE = /^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/\d+-250\.jpg$/;
const CORS = { 'access-control-allow-origin': '*' };
const VIEWER = '#mb-art-viewer';

/** The 1200 rendition: 1200 x 1500. The thumbnail has the same 4:5 ratio. */
const BIG = { w: 1200, h: 1500 };

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

/**
 * Loads the medley fixture, serves every thumbnail and 1200 px image as a
 * 4:5 portrait SVG, presses "Show all" and waits for the Cover art section.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object}} [opts] settings: merged into the override
 *   (IndexedDB off and the zoom not remembered unless a spec says otherwise).
 */
async function openRelease(page, { settings = {} } = {}) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_enable_release_tracks_cover_art: true,
            sa_art_idb_enable: false,
            sa_art_viewer_remember_zoom: false,
            ...settings,
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
        route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: RECORD_TEXT }));
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.locator('.mb-release-art-sec[data-mb-art-state="ok"]').waitFor({ state: 'attached', timeout: 15000 });
}

/**
 * Switches the image's transform transition off, so a measurement right after
 * a move reads the final position, not a frame of the animation.
 *
 * @param {import('@playwright/test').Page} page
 */
const noTransition = (page) =>
    page.addStyleTag({ content: `${VIEWER} .mb-artv-img { transition: none !important; }` });

/**
 * Waits until the 1200 px image is on the stage and fully decoded.
 *
 * @param {import('@playwright/test').Page} page
 */
const waitForBigImage = (page) => expect.poll(() => page.evaluate((sel) => {
    const img = document.querySelector(`${sel} .mb-artv-img`);
    return !!img && img.dataset.artvSize === 'big' && img.complete && img.naturalWidth;
}, VIEWER), { message: 'the 1200 px image replaced the thumbnail' }).toBe(BIG.w);

/**
 * Opens the viewer on tile `i` with a plain click and waits for its 1200 px
 * image, transitions off.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [i=0]
 */
async function openViewerOnBigImage(page, i = 0) {
    await page.click(`figure.mb-release-art-tile[data-mb-art-i="${i}"] > a`);
    await noTransition(page);
    await waitForBigImage(page);
}

/**
 * What the user sees: the stage's rect, the filmstrip's, and the rect the
 * image's PIXELS occupy (not its box) — the layout box without the
 * transform, minus the padding, letterboxed by object-fit: contain
 * (centred), then all four corners mapped through the computed transform
 * about the computed transform-origin (four, so a rotation is measured
 * right). Independent of how the viewer builds the image.
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
    const corners = [map(x0, y0), map(x0 + w, y0), map(x0, y0 + h), map(x0 + w, y0 + h)];
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    return {
        stage: rect(stageEl.getBoundingClientRect()),
        film: rect(v.querySelector('.mb-artv-film').getBoundingClientRect()),
        img: { left, top, right, bottom, width: right - left, height: bottom - top },
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

/**
 * The viewer's bar, info panel and stage state, read in one go.
 *
 * @param {import('@playwright/test').Page} page
 */
const viewerUi = (page) => page.evaluate((sel) => {
    const v = document.querySelector(sel);
    if (!v || v.hidden) return null;
    const q = (s) => v.querySelector(s);
    const text = (s) => (q(s) || {}).textContent || null;
    const img = q('.mb-artv-img');
    return {
        pos: text('.mb-artv-pos'),
        zoomReadout: text('.mb-artv-zoom'),
        facts: text('.mb-artv-facts'),
        factsOrig: text('.mb-artv-facts-orig'),
        note: text('.mb-artv-note'),
        bg: v.dataset.mbArtvBg || null,
        pan: v.dataset.mbArtvPan || null,
        fullscreen: document.fullscreenElement === v,
        fullscreenBtn: (q('[data-artv="fullscreen"]') || { getAttribute: () => null }).getAttribute('aria-pressed'),
        transform: img ? img.style.transform : null,
        natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
        stageBg: q('.mb-artv-stage') ? getComputedStyle(q('.mb-artv-stage')).backgroundImage + ' ' +
            getComputedStyle(q('.mb-artv-stage')).backgroundColor : null,
    };
}, VIEWER);

module.exports = {
    URL, RECORD, BIG, BIG_RE, THUMB_RE, CORS, VIEWER, GUTTER, NARROW_GUTTER, svg,
    openRelease, openViewerOnBigImage, noTransition, waitForBigImage, measure, zoomTo,
    expectInsideGutters, viewerUi,
};
