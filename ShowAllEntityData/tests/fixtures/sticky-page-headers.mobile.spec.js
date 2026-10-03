'use strict';

// Sticky Page Headers on a touch device (org/mobile.org, bug 2). Runs in the
// chromium-mobile project (Pixel 7: touch, no hover, isMobile viewport).
//
// ── The bug ─────────────────────────────────────────────────────────────────
//
// MusicBrainz has no viewport meta, so a phone shows a wide consolidated table
// ZOOMED OUT: the visible area is far wider than documentElement.clientWidth
// (measured on a live release page, 2026-10-03: clientWidth 412, innerWidth
// 1648; tests/support/probe-mobile-sph.js). _sphRefresh() clamped every pinned
// bar to clientWidth, so the h1 block, the tabs and every h2/h3 bar were
// squeezed into a narrow column (Image #11 in org/mobile.org).
//
// ── What this spec pins ─────────────────────────────────────────────────────
//
//  1. The feature does not start on a touch-primary device by default
//     (sa_sticky_page_headers_on_touch: false). Pinned by the refresh-pass
//     counter staying at 0: "never initialised", which a slow pass cannot
//     fake. The positive control is test 2, which flips only that setting.
//  2. Opted in, it engages, and no bar is clamped to the narrow clientWidth
//     any more: each bar's max-width is sized against innerWidth.
//
// The fixture carries no MusicBrainz stylesheet (see sticky-page-headers.spec.js),
// which is why the measurements above came from the live page. The zoom-out
// itself does happen here: it depends only on the content width.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');

// Refresh passes are debounced (60 ms) behind a ResizeObserver round-trip and
// an animation frame. Generous, so "0 passes" cannot mean "not yet".
const REFRESH_SETTLE_MS = 1500;

/**
 * Opens the series fixture under the project's mobile emulation and renders
 * the consolidated table.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} settingsOverride - extra GM settings
 * @returns {Promise<void>}
 */
async function openSeries(page, settingsOverride) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: { sa_enable_sticky_page_headers: true, ...settingsOverride },
    });
    await page.locator('button[data-label="Show all Releases for Series"]').evaluate((b) => b.click());
    await waitForRenderComplete(page);
}

/**
 * Viewport widths plus every pinned target's clamped max-width.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{clientWidth: number, innerWidth: number, scrollWidth: number,
 *   on: boolean, passes: number, targets: Array<{key: string, maxw: number}>}>}
 */
const state = (page) => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    on: document.documentElement.classList.contains('mb-sph-on'),
    passes: window.__saTest.sphRefreshPasses(),
    targets: Array.from(document.querySelectorAll('.mb-sph-target')).map((el) => ({
        key: el.tagName + (el.id ? '#' + el.id : '') + '.' + String(el.className).trim().split(/\s+/)[0],
        maxw: parseFloat(el.style.getPropertyValue('--mb-sph-maxw')),
    })),
}));

test.describe('sticky page headers on a touch device', () => {
    test('stays off by default: never initialised, nothing pinned', async ({ page }) => {
        await openSeries(page, {});
        await page.waitForTimeout(REFRESH_SETTLE_MS);
        const s = await state(page);
        expect(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches),
            'premise: the project emulates a touch-primary device').toBe(true);
        expect(s.scrollWidth, 'premise: the table overflows the layout viewport').toBeGreaterThan(s.clientWidth + 1000);
        expect(s.passes, 'refresh passes run (0 = feature never initialised)').toBe(0);
        expect(s.on).toBe(false);
        expect(s.targets).toEqual([]);
    });

    test('opted in, it engages and sizes the bars to the zoomed-out viewport, not clientWidth', async ({ page }) => {
        await openSeries(page, { sa_sticky_page_headers_on_touch: true });
        await page.waitForFunction(() => document.documentElement.classList.contains('mb-sph-on'),
            null, { timeout: 10000 });
        await page.waitForTimeout(REFRESH_SETTLE_MS);
        const s = await state(page);
        expect(s.passes).toBeGreaterThan(0);
        expect(s.innerWidth, 'premise: the page is shown zoomed out').toBeGreaterThan(s.clientWidth * 1.5);
        expect(s.targets.length, 'premise: bars were pinned').toBeGreaterThan(3);
        // Before the fix every bar was capped at clientWidth minus its insets.
        const squeezed = s.targets.filter((t) => !(t.maxw > s.clientWidth));
        expect(squeezed, `bars clamped to clientWidth (${s.clientWidth}px) instead of `
            + `innerWidth (${s.innerWidth}px)`).toEqual([]);
        const overhang = s.targets.filter((t) => t.maxw > s.innerWidth);
        expect(overhang, 'bars wider than the visible area').toEqual([]);
    });
});
