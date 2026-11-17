'use strict';

// Touch (Pixel 7 emulation): springsteenlyrics.com's collection entry page,
// before any press, scrolled with a finger's worth of distance.
//
// Reported 2026-11-16 from a Galaxy A34 (debug/SL-sticky-area-bug.*,
// debug/Screenshot_20261115_0941*.jpg): a white band stayed near the top of
// the window and the page scrolled behind it. Two guarantees, both pinned
// here at the phone's own width (sl-sticky-headers.spec.js has them at
// desktop sizes):
//   - the site does not fix its navbar up to 992 px, so no navbar height is
//     reserved above the docked toolbar h1 (_slNavbarOffset());
//   - the backdrop behind that h1 (#mb-vsb-mask) is on only while the h1 sits
//     AT its dock, and off once its parent's end has pushed it out of the
//     window (_vsbUpdateMask());
//   - and (reported the same day, debug/SL-sticky-area-sticky-then-moved-IP.mp4)
//     that parent is no longer .project-detail, which the site closes right
//     after the category walls on this page: the h1 and the status line sit
//     in div.mb-sl-header beside the list, and stay docked over all of it
//     (_slPlaceHead()).

const { test, expect } = require('../support/test');
const { loadSlListPage } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');

/** The site's navbar rules that matter here (css/style-red.css, read 2026-11-16). */
const NAVBAR_CSS = [
    '*, *::before, *::after { box-sizing: border-box; }',
    '.navbar { min-height: 80px; height: 80px; overflow: hidden; background: #fff; width: 100%; }',
    '@media (max-width: 992px) { .navbar-default, .navbar-inverse { position: relative !important; } }',
].join('\n');

/**
 * Two animation frames: the bars' refresh and the backdrop's scroll update
 * are each scheduled for the next frame.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * Scrolls to `y`, then reads the header block (the h1, or the
 * div.mb-sl-header around it) and the backdrop.
 * @param {import('@playwright/test').Page} page
 * @param {number} y
 * @returns {Promise<{h1Top: number, h1Bottom: number, maskOn: boolean, bandIsMask: boolean}>}
 */
async function scrollAndRead(page, y) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await frames(page);
    return page.evaluate(() => {
        const h1 = document.querySelector('h1.mb-sl-h1');
        const r = (h1.closest('.mb-vsb-head') || h1).getBoundingClientRect();
        const mask = document.getElementById('mb-vsb-mask');
        return { h1Top: r.top, h1Bottom: r.bottom, maskOn: mask.classList.contains('mb-vsb-mask-on'),
            bandIsMask: document.elementFromPoint(window.innerWidth - 5, 10) === mask };
    });
}

test('phone: the toolbar h1 docks at the very top, stays there through the list, and no white band stays once it has left', async ({ page }) => {
    await loadSlListPage(page, { kind: 'collection-intro' });
    await page.addStyleTag({ content: NAVBAR_CSS });
    await page.evaluate(() => {
        // jquery.sticky, once scrolled: inline, at any width.
        const nav = document.querySelector('.navbar.sticky');
        nav.style.position = 'fixed';
        nav.style.top = '0px';
        const spacer = document.createElement('div');
        spacer.style.height = '4000px';
        document.body.appendChild(spacer);
        window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => document.querySelector('h1.mb-sl-h1')?.closest('.mb-vsb-head') && document.getElementById('mb-vsb-mask'),
        null, { timeout: 10000 });
    await frames(page);
    const l = await page.evaluate(() => {
        window.scrollTo(0, 0);
        const h1 = document.querySelector('h1.mb-sl-h1');
        const head = h1.closest('.mb-vsb-head') || h1;
        return { h1Y: head.getBoundingClientRect().top, parentEndY: head.parentElement.getBoundingClientRect().bottom,
            pdEndY: document.querySelector('.project-detail').getBoundingClientRect().bottom,
            // The list's own end, whatever the header block's parent is: the
            // container of its heading ("Latest Additions"), outside the menu.
            listEndY: Array.from(document.querySelectorAll('h3.heading, h2.heading'))
                .filter((h) => !h.closest('.navbar')).pop().parentElement.getBoundingClientRect().bottom,
            dock: parseFloat(getComputedStyle(head).top), navVar: document.documentElement.style.getPropertyValue('--mb-sl-navbar-h'),
            navH: document.querySelector('.navbar.sticky').offsetHeight, width: window.innerWidth };
    });
    expect(l.width, 'premise: a narrow window').toBeLessThan(992);
    expect(l.navH, 'premise: the navbar has its height').toBe(80);
    expect(l.navVar, 'no navbar height is reserved').toBe('0px');
    expect(l.dock, 'the h1\'s dock').toBe(0);

    const stuck = await scrollAndRead(page, l.h1Y + 3);
    expect(Math.abs(stuck.h1Top), 'the h1 sits at the top of the window').toBeLessThanOrEqual(1);
    expect(stuck.maskOn, 'docked: the backdrop is on').toBe(true);

    // Past the end of .project-detail, deep in the list: still docked.
    expect(l.listEndY - l.pdEndY, 'premise: the list goes on after .project-detail').toBeGreaterThan(1500);
    const deep = await scrollAndRead(page, l.pdEndY + 600);
    expect(Math.abs(deep.h1Top), 'past .project-detail: the header block is still at the top').toBeLessThanOrEqual(1);
    expect(deep.maskOn, 'past .project-detail: the backdrop is still behind it').toBe(true);

    const gone = await scrollAndRead(page, l.parentEndY + 300);
    expect(gone.h1Bottom, 'premise: the h1 has left the window with its parent').toBeLessThan(0);
    expect(gone.maskOn, 'left: the backdrop is off').toBe(false);
    expect(gone.bandIsMask, 'left: the page, not a white band, is painted at the top').toBe(false);

    const back = await scrollAndRead(page, l.h1Y + 3);
    expect(back.maskOn, 'docked again: the backdrop is back').toBe(true);
});

// ---------------------------------------------------------------------------
// The layout viewport after the press (reported 2026-11-16/17, vzell's
// Firefox in responsive mode and on a phone, debug/SL-firefox-FRP-non-sticky.*):
// the site's `width=device-width, initial-scale=1` lets a mobile browser
// widen the layout viewport to a table wider than the screen; Firefox then
// keeps the zoom at 1 and pans the visible window INSIDE that box, so
// nothing sticky ever reached the visible top (innerWidth 2601, clientWidth
// 908, scrollY 0 with the window 1,938 px down). _slViewportFit() adds
// `minimum-scale=1` while the page is wider than the screen. Chromium's
// emulation zooms out instead of panning, but it widens the layout
// viewport the same way, which is the property pinned here: innerWidth
// equals clientWidth after the press.
// ---------------------------------------------------------------------------

test('phone, after the press: the layout viewport stays the screen\'s width, so the bars stick', async ({ page }) => {
    const { spec } = await loadSlListPage(page, { kind: 'sampler', settingsOverride: { sa_render_threshold: 100000 } });
    const meta = () => page.evaluate(() => document.querySelector('meta[name="viewport"]').getAttribute('content'));
    const original = await meta();
    expect(original, 'premise: the site\'s own tag').toBe('width=device-width, initial-scale=1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        'premise: the initial page fits the screen').toBe(true);
    expect(await meta(), 'initial page: the tag is the site\'s').toBe(original);

    await page.$eval(`button[data-label="${spec.button}"]`, (b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await frames(page);
    const g = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth, scale: window.visualViewport ? window.visualViewport.scale : 1,
    }));
    expect(g.scrollWidth, 'premise: the table is wider than the screen').toBeGreaterThan(g.clientWidth * 2);
    expect(g.innerWidth, 'the layout viewport is the screen\'s width, not the table\'s').toBe(g.clientWidth);
    expect(g.scale, 'not zoomed out').toBeGreaterThanOrEqual(0.99);
    expect(await meta(), 'after the press: no zooming out below 100 %').toBe(`${original}, minimum-scale=1`);

    // Deep in the table: the data h2 and the thead are at their docks.
    await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.6)));
    await frames(page);
    const b = await page.evaluate(() => {
        const h2 = document.getElementById('mb-global-filter-input').closest('h2');
        const th = document.querySelector('table.tbl > thead');
        return { h2: h2.getBoundingClientRect().top, h2Dock: parseFloat(getComputedStyle(h2).top),
            th: th.getBoundingClientRect().top, thDock: parseFloat(getComputedStyle(th).top) };
    });
    expect(Math.abs(b.h2 - b.h2Dock), 'the h2 is at its dock').toBeLessThanOrEqual(1);
    expect(Math.abs(b.th - b.thDock), 'the thead is at its dock').toBeLessThanOrEqual(1);

    // A window wider than the table (a rotation, a tablet): the site's own tag again.
    await page.setViewportSize({ width: g.scrollWidth + 400, height: 900 });
    await frames(page);
    await page.waitForFunction((o) => document.querySelector('meta[name="viewport"]').getAttribute('content') === o,
        original, { timeout: 5000 }).catch(() => {});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        'premise: the table fits the wider window').toBe(true);
    expect(await meta(), 'the table fits: the site\'s own tag is back').toBe(original);
});
