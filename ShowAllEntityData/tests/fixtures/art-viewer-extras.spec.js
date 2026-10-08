'use strict';

// The artwork viewer's extras (org/viewer.org item 2, ideas from Art Station's
// full-screen viewer): drag to pan, the zoom readout and 1:1, rotation,
// browser fullscreen, the background, the image facts and the download. The
// touch pinch is in art-viewer-extras.mobile.spec.js.
//
// Same set-up as art-viewer-pan.spec.js (tests/support/artViewerFixture.js):
// images with a REAL natural size, and assertions on the rect the image's
// pixels occupy on screen, not on how the viewer builds it.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. DRAG MODE: a hover does NOT move the zoomed image (in follow mode it
//     would — so "a drag moves it" alone passes on code that ignores the
//     setting); a drag moves it, and only as far as the frame; the click a
//     drag ends with does not toggle the zoom, while a click without a move,
//     right after it, still does (only the drag's OWN click is swallowed —
//     a time window, as the swipe uses, lost the next real click).
//  2. DRAG MODE'S WHEEL keeps the image spot under the pointer in place
//     (follow mode re-derives the pan from the pointer instead).
//  3. THE READOUT is screen px per IMAGE px, not the fit-relative level; 1
//     shows actual pixels, and is worked out again when the large image
//     replaces the thumbnail ("1:1 once" would leave the large image at the
//     thumbnail's scale).
//  4. R TURNS AND RE-FITS (the turned image fits the frame, not the upright
//     box); Shift+R turns back; a step starts upright.
//  5. TURNED AND ZOOMED, THE PAN USES THE TURNED SIZE: the bottom edge is
//     reachable and not over-panned.
//  6. F: fullscreen and back; Esc leaves fullscreen BEFORE it closes the
//     viewer; closing the viewer leaves fullscreen too.
//  7. B cycles the three backgrounds and is remembered for the next opening;
//  8. … and gives way once the setting is changed.
//  9. FACTS: rendition and pixel size; the original "not loaded"; none of it
//     with the setting off.
// 10. FACTS FROM THE IMAGE CACHE: file size and type too (read from the
//     blob: URL).
// 11. D saves the ORIGINAL under Art Station's name, one request per press
//     even when pressed twice, and the facts learn its size, type and pixels.
// 12. A FAILED DOWNLOAD says so.

const { test, expect } = require('../support/test');
const {
    BIG, BIG_RE, CORS, VIEWER, GUTTER, svg,
    openRelease, openViewerOnBigImage, noTransition, waitForBigImage, measure, zoomTo,
    expectInsideGutters, viewerUi,
} = require('../support/artViewerFixture');

test.use({ viewport: { width: 1280, height: 720 } });

// 1x1 PNG: the "original" a download receives.
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);
const NNBSP = ' ';
const ORIGINAL_3 = 'https://coverartarchive.org/release/d0adda7e-86de-4aef-af95-ee7da122d175/34698680898.jpg';
const NAME_3 = '04 Other opened gatefold cover, inside left.jpg';

/**
 * The scale in a transform string, 1 when there is none.
 *
 * @param {?string} t
 * @returns {number}
 */
const scaleOf = (t) => Number(((t || '').match(/scale\(([^)]+)\)/) || [0, 1])[1]);

/**
 * A rect's centre.
 *
 * @param {{left: number, top: number, right: number, bottom: number}} r
 * @returns {{x: number, y: number}}
 */
const centre = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

/**
 * Replaces the page's GM_xmlhttpRequest for archive ORIGINALS (`/<id>.jpg`,
 * no size suffix): records each URL in `window.__gmOrig` and answers after
 * `delayMs` with `status` and, on 200, the 1x1 PNG. Everything else goes to
 * the harness's stub.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{status?: number, delayMs?: number}} [opts]
 */
const stubOriginals = (page, { status = 200, delayMs = 300 } = {}) => page.evaluate(([b64, st, ms]) => {
    const original = window.GM_xmlhttpRequest;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.__gmOrig = [];
    window.GM_xmlhttpRequest = (opts) => {
        if (!/\/\d+\.jpg$/.test((opts && opts.url) || '')) return original(opts);
        window.__gmOrig.push(opts.url);
        setTimeout(() => opts.onload({
            status: st, response: st === 200 ? new Blob([bytes], { type: 'image/png' }) : null,
        }), ms);
        return { abort() {} };
    };
}, [ONE_PX_PNG.toString('base64'), status, delayMs]);

test.describe('artwork viewer: drag to pan (sa_art_viewer_pan: drag)', () => {
    test('a hover leaves the zoomed image alone; a drag moves it, only as far as the frame; a drag is not a click', async ({ page }) => {
        await openRelease(page, { settings: { sa_art_viewer_pan: 'drag' } });
        await openViewerOnBigImage(page);
        expect((await viewerUi(page)).pan).toBe('drag');
        const s = (await measure(page)).stage;
        const c = centre(s);
        await page.mouse.move(c.x, c.y);
        await zoomTo(page, 3);
        const before = (await measure(page)).img;
        await page.mouse.move(c.x, s.bottom - 5, { steps: 8 });
        expect(Math.abs((await measure(page)).img.top - before.top), 'a hover does not pan in drag mode').toBeLessThan(0.5);

        // Two drags from the bottom to the top: more than the overhang, so
        // the bottom edge must stop in the gutter.
        for (let n = 0; n < 2; n++) {
            await page.mouse.move(c.x, s.bottom - 5, { steps: 2 });
            await page.mouse.down();
            await page.mouse.move(c.x, s.top + 5, { steps: 10 });
            await page.mouse.up();
        }
        const { img, stage } = await measure(page);
        expect(stage.bottom - img.bottom, 'bottom edge on screen').toBeGreaterThanOrEqual(-0.5);
        expect(stage.bottom - img.bottom, 'and in the gutter, not past it').toBeLessThanOrEqual(GUTTER.y + 1);
        expect(scaleOf((await viewerUi(page)).transform), 'the drags ended without their clicks toggling the zoom').toBe(3);

        await page.mouse.click(c.x, c.y);
        expect((await viewerUi(page)).transform, 'a click without a move still toggles').toBe('');
    });

    test('the wheel zooms keeping the image spot under the pointer in place', async ({ page }) => {
        await openRelease(page, { settings: { sa_art_viewer_pan: 'drag' } });
        await openViewerOnBigImage(page);
        const c = centre((await measure(page)).stage);
        await page.mouse.move(c.x, c.y);
        // Z: 2x, centred (a key keeps the pan in drag mode).
        await page.keyboard.press('z');
        const p = { x: c.x + 100, y: c.y + 80 };
        await page.mouse.move(p.x, p.y);
        const a = (await measure(page)).img;
        await page.mouse.wheel(0, -100);
        await expect.poll(async () => scaleOf((await viewerUi(page)).transform)).toBe(2.5);
        const b = (await measure(page)).img;
        expect((p.x - b.left) / b.width, 'same spot across').toBeCloseTo((p.x - a.left) / a.width, 2);
        expect((p.y - b.top) / b.height, 'same spot down').toBeCloseTo((p.y - a.top) / a.height, 2);
    });
});

test.describe('artwork viewer: zoom readout and 1:1', () => {
    test('the readout is screen px per image px; 1 shows actual pixels, also of the large image that replaces the thumbnail', async ({ page }) => {
        await openRelease(page);
        let release;
        const held = new Promise((r) => { release = r; });
        await page.unroute(BIG_RE);
        await page.route(BIG_RE, async (route) => {
            await held;
            await route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: svg(BIG.w, BIG.h) });
        });
        await page.click('figure.mb-release-art-tile[data-mb-art-i="0"] > a');
        await noTransition(page);
        await expect.poll(async () => ((await viewerUi(page)).natural || {}).w, { message: 'the thumbnail is in' }).toBe(200);
        let g = await measure(page);
        expect((await viewerUi(page)).zoomReadout, 'fitted thumbnail').toBe(`${Math.round(g.img.height / 250 * 100)}${NNBSP}%`);

        await page.keyboard.press('1');
        g = await measure(page);
        expect(g.img.width, 'the thumbnail at its own 200 px').toBeCloseTo(200, 0);
        expect((await viewerUi(page)).zoomReadout).toBe(`100${NNBSP}%`);

        release();
        await waitForBigImage(page);
        g = await measure(page);
        expect(g.img.width, 'the large image at its own 1200 px').toBeCloseTo(BIG.w, 0);
        expect((await viewerUi(page)).zoomReadout).toBe(`100${NNBSP}%`);

        await page.keyboard.press('0');
        g = await measure(page);
        expect((await viewerUi(page)).zoomReadout, 'fitted again').toBe(`${Math.round(g.img.height / BIG.h * 100)}${NNBSP}%`);
    });
});

test.describe('artwork viewer: rotation', () => {
    test('R turns a quarter turn and re-fits; Shift+R turns back; a step starts upright', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        const up = await measure(page);
        await page.keyboard.press('r');
        let g = await measure(page);
        expect((await viewerUi(page)).transform).toContain('rotate(90deg)');
        expect(g.img.width / g.img.height, 'turned: 5:4 landscape').toBeCloseTo(BIG.h / BIG.w, 2);
        expectInsideGutters(g, GUTTER);

        await page.keyboard.press('Shift+R');
        g = await measure(page);
        expect((await viewerUi(page)).transform, 'upright again').toBe('');
        for (const k of ['left', 'top', 'right', 'bottom']) {
            expect(Math.abs(g.img[k] - up.img[k]), `${k} as before`).toBeLessThan(1);
        }

        await page.keyboard.press('r');
        await page.keyboard.press('ArrowRight');
        await waitForBigImage(page);
        expect((await viewerUi(page)).pos).toBe('2 / 16');
        expect((await viewerUi(page)).transform, 'a step starts upright').toBe('');
    });

    test('turned and zoomed, a pointer near the bottom brings the bottom edge into view, and no further', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await page.keyboard.press('r');
        await zoomTo(page, 3);
        const s = (await measure(page)).stage;
        const c = centre(s);
        await page.mouse.move(c.x, c.y, { steps: 4 });
        await page.mouse.move(c.x, s.bottom - 0.08 * s.height / 2, { steps: 12 });
        const { img, stage } = await measure(page);
        expect(stage.bottom - img.bottom, 'bottom edge on screen').toBeGreaterThanOrEqual(-0.5);
        expect(stage.bottom - img.bottom, 'bottom edge in the gutter').toBeLessThanOrEqual(GUTTER.y + 1);
        expect(img.top, 'not over-panned: still covers the top').toBeLessThan(stage.top);
    });
});

test.describe('artwork viewer: fullscreen and background', () => {
    test('F enters the browser\'s fullscreen and leaves it; Esc leaves fullscreen before it closes; closing leaves it too', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), 'no Fullscreen API in this browser build');
        const fs = async () => (await viewerUi(page)).fullscreen;

        await page.keyboard.press('f');
        await expect.poll(fs).toBe(true);
        expect((await viewerUi(page)).fullscreenBtn).toBe('true');
        await page.keyboard.press('f');
        await expect.poll(fs).toBe(false);
        expect((await viewerUi(page)).fullscreenBtn).toBe('false');

        await page.keyboard.press('f');
        await expect.poll(fs).toBe(true);
        await page.keyboard.press('Escape');
        expect(await viewerUi(page), 'the first Esc only leaves fullscreen: the viewer stays open').not.toBeNull();
        await expect.poll(fs).toBe(false);

        await page.keyboard.press('f');
        await expect.poll(fs).toBe(true);
        await page.click(`${VIEWER} [data-artv="close"]`);
        await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
        expect(await viewerUi(page), 'closed').toBeNull();
    });

    test('B cycles dark, light and checker, and the pick is remembered for the next opening', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        expect((await viewerUi(page)).bg).toBe('dark');
        await page.keyboard.press('b');
        let ui = await viewerUi(page);
        expect(ui.bg).toBe('light');
        expect(ui.stageBg).toContain('rgb(232, 229, 222)');
        await page.keyboard.press('b');
        ui = await viewerUi(page);
        expect(ui.bg).toBe('checker');
        expect(ui.stageBg).toContain('conic-gradient');
        await page.keyboard.press('b');
        expect((await viewerUi(page)).bg).toBe('dark');

        await page.keyboard.press('b');
        await page.keyboard.press('Escape');
        await page.click('figure.mb-release-art-tile[data-mb-art-i="1"] > a');
        expect((await viewerUi(page)).bg, 'remembered').toBe('light');
    });

    test('a background picked with B gives way once the setting is changed', async ({ page }) => {
        // Picked "light" while the setting said "dark"; the setting now says "checker".
        await openRelease(page, {
            settings: { sa_art_viewer_background: 'checker', mb_sa_art_viewer_bg: { v: 'light', from: 'dark' } },
        });
        await page.click('figure.mb-release-art-tile[data-mb-art-i="0"] > a');
        expect((await viewerUi(page)).bg).toBe('checker');
    });
});

test.describe('artwork viewer: image facts and download', () => {
    test('facts: the rendition and pixel size shown; the original "not loaded"; nothing with the setting off', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await expect.poll(async () => (await viewerUi(page)).facts)
            .toBe(`1200${NNBSP}px rendition · 1200${NNBSP}×${NNBSP}1500${NNBSP}px`);
        expect((await viewerUi(page)).factsOrig).toBe('not loaded · D downloads it');
    });

    test('with sa_art_viewer_facts off there is no Shown or Original line', async ({ page }) => {
        await openRelease(page, { settings: { sa_art_viewer_facts: false } });
        await openViewerOnBigImage(page);
        const ui = await viewerUi(page);
        expect(ui.facts).toBeNull();
        expect(ui.factsOrig).toBeNull();
    });

    test('facts from the image cache: the file size and type too, read from the blob: URL', async ({ page }) => {
        await openRelease(page, { settings: { sa_art_idb_enable: true } });
        const body = svg(BIG.w, BIG.h);
        await page.evaluate((text) => {
            const original = window.GM_xmlhttpRequest;
            window.GM_xmlhttpRequest = (opts) => {
                if (!/-1200\.jpg$/.test((opts && opts.url) || '')) return original(opts);
                setTimeout(() => opts.onload({ status: 200, response: new Blob([text], { type: 'image/svg+xml' }) }), 0);
                return { abort() {} };
            };
        }, body);
        await openViewerOnBigImage(page);
        expect(await page.evaluate((sel) => document.querySelector(`${sel} .mb-artv-img`).src, VIEWER),
            'premise: shown from the image cache').toMatch(/^blob:/);
        await expect.poll(async () => (await viewerUi(page)).facts)
            .toBe(`1200${NNBSP}px rendition · 1200${NNBSP}×${NNBSP}1500${NNBSP}px · ${body.length}${NNBSP}B SVG`);
    });

    test('D saves the original as "<NN> <types> <comment>.<ext>", one request for two presses, and the facts learn it', async ({ page }) => {
        await openRelease(page);
        await stubOriginals(page);
        await openViewerOnBigImage(page, 3);
        const download = page.waitForEvent('download');
        await page.keyboard.press('d');
        await page.keyboard.press('d');
        const d = await download;
        expect(d.suggestedFilename()).toBe(NAME_3);
        expect(await page.evaluate(() => window.__gmOrig), 'one request, for the original').toEqual([ORIGINAL_3]);
        await expect.poll(async () => (await viewerUi(page)).factsOrig)
            .toBe(`1${NNBSP}×${NNBSP}1${NNBSP}px · ${ONE_PX_PNG.length}${NNBSP}B PNG`);
        expect((await viewerUi(page)).note).toBe(`Saved “${NAME_3}” (${ONE_PX_PNG.length}${NNBSP}B).`);
    });

    test('a failed download says so', async ({ page }) => {
        await openRelease(page);
        await stubOriginals(page, { status: 404, delayMs: 0 });
        await openViewerOnBigImage(page, 3);
        await page.keyboard.press('d');
        await expect.poll(async () => (await viewerUi(page)).note).toBe('Download failed (HTTP 404).');
        expect((await viewerUi(page)).factsOrig).toBe('not loaded · D downloads it');
    });
});
