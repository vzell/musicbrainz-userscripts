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
//     window (_vsbUpdateMask()).

const { test, expect } = require('../support/test');
const { loadSlListPage } = require('../support/slFixture');

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
 * Scrolls to `y`, then reads the h1 and the backdrop.
 * @param {import('@playwright/test').Page} page
 * @param {number} y
 * @returns {Promise<{h1Top: number, h1Bottom: number, maskOn: boolean, bandIsMask: boolean}>}
 */
async function scrollAndRead(page, y) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await frames(page);
    return page.evaluate(() => {
        const r = document.querySelector('h1.mb-sl-h1').getBoundingClientRect();
        const mask = document.getElementById('mb-vsb-mask');
        return { h1Top: r.top, h1Bottom: r.bottom, maskOn: mask.classList.contains('mb-vsb-mask-on'),
            bandIsMask: document.elementFromPoint(window.innerWidth - 5, 10) === mask };
    });
}

test('phone: the toolbar h1 docks at the very top, and no white band stays once it has left', async ({ page }) => {
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
    await page.waitForFunction(() => document.querySelector('h1.mb-sl-h1.mb-vsb-head') && document.getElementById('mb-vsb-mask'),
        null, { timeout: 10000 });
    await frames(page);
    const l = await page.evaluate(() => {
        window.scrollTo(0, 0);
        const h1 = document.querySelector('h1.mb-sl-h1');
        return { h1Y: h1.getBoundingClientRect().top, parentEndY: h1.parentElement.getBoundingClientRect().bottom,
            dock: parseFloat(getComputedStyle(h1).top), navVar: document.documentElement.style.getPropertyValue('--mb-sl-navbar-h'),
            navH: document.querySelector('.navbar.sticky').offsetHeight, width: window.innerWidth };
    });
    expect(l.width, 'premise: a narrow window').toBeLessThan(992);
    expect(l.navH, 'premise: the navbar has its height').toBe(80);
    expect(l.navVar, 'no navbar height is reserved').toBe('0px');
    expect(l.dock, 'the h1\'s dock').toBe(0);

    const stuck = await scrollAndRead(page, l.h1Y + 3);
    expect(Math.abs(stuck.h1Top), 'the h1 sits at the top of the window').toBeLessThanOrEqual(1);
    expect(stuck.maskOn, 'docked: the backdrop is on').toBe(true);

    const gone = await scrollAndRead(page, l.parentEndY + 300);
    expect(gone.h1Bottom, 'premise: the h1 has left the window with its parent').toBeLessThan(0);
    expect(gone.maskOn, 'left: the backdrop is off').toBe(false);
    expect(gone.bandIsMask, 'left: the page, not a white band, is painted at the top').toBe(false);

    const back = await scrollAndRead(page, l.h1Y + 3);
    expect(back.maskOn, 'docked again: the backdrop is back').toBe(true);
});
