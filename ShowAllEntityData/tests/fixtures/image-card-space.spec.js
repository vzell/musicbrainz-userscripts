'use strict';

// org/TODO.org "Some enhancements" 2 (vzell, 2026-10-24): "when hovering an
// image … only Shift and Click are recognized. Space should do the same as
// Click when hovering an image. Currently the page scrolls downward."
// `_artSpaceOpen()` runs the trigger's own click handler with a stand-in
// event, from `_initStatTooltip()`'s `_onImageSpace`, registered after the
// card's own keys (`_onCardKey`: Space = every image of a cut-off card).
//
// The property pinned here is "Space OPENS what a click opens and the page
// does not scroll" — not merely "Space is swallowed": a handler that
// prevented the default without opening the viewer would still fail every
// test below. Also pinned: where a click would do nothing (no trigger under
// the pointer, typing in a field, Shift held), Space stays the page's.
//
// The Discogs Image column and the MusicBrainz CAA cell are covered where
// their cards are (discogs-image-card.spec.js, caa-column-redesign.spec.js).

const { test, expect } = require('../support/test');
const { loadBbYearPage, BB_YEAR_BUTTON } = require('../support/bbFixture');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const GIG4 = 'https://brucebase.wikidot.com/gig:1985-01-04-roads-coliseum-hampton-va';
const REC = (code) => `https://www.brucespringsteen.it/DB/detrec.aspx?code=${code}`;
const PHOTO = 'https://www.brucespringsteen.it/blegs/images/LP1B1.jpg';

const tip = (page) => page.locator('#mb-stat-tooltip');
const viewer = (page) => page.locator('#mb-art-viewer');
const icon = (page, href, kind) => page.locator(`table.tbl tbody a.mb-fi-media[href="${href}"][data-mb-fi-kind="${kind}"]`).first();

/**
 * Collects page errors; returns the list.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function errorsOf(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * The Brucebase 1985 year page, rendered, its entry pages and images routed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @returns {Promise<{errors: string[], served: string[]}>}
 */
async function openYear(page, settings = {}) {
    const errors = errorsOf(page);
    await loadBbYearPage(page, '1985', { settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'bb');
    await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served };
}

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

/**
 * Presses Space (or `key`, e.g. "Shift+Space") at the focused element (the
 * body unless a test focused a field) and says, once the key has settled,
 * whether it was spent, whether the page scrolled and whether the viewer is
 * open. Settled = the page has not scrolled for ten animation frames (at
 * most 2 s): an unspent Space scrolls SMOOTHLY, and a scroll still running
 * moves the rows under the pointer of the next step (a later hover then
 * lands on another row). Settling also keeps the negative case honest: an
 * assertion that the viewer stays hidden passes before a wrongly opened
 * viewer has appeared.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [key]
 * @returns {Promise<{spent: boolean, scrolled: boolean, viewer: boolean}>}
 */
async function pressSpace(page, key = 'Space') {
    await page.evaluate(() => {
        window.__spaceY = window.scrollY;
        window.__spaceEv = null;
        // The first listener of all (window, capture) keeps the event; its
        // `defaultPrevented` is read once every listener has run. A bubble
        // listener would never see a key a capture handler stopped.
        // Not `once`: a Shift held for "Shift+Space" is a keydown first.
        const keep = (e) => {
            if (e.code !== 'Space') return;
            window.__spaceEv = e;
            window.removeEventListener('keydown', keep, true);
        };
        window.addEventListener('keydown', keep, true);
    });
    await page.keyboard.press(key);
    await page.evaluate(() => new Promise((resolve) => {
        const end = performance.now() + 2000;
        let last = window.scrollY, still = 0;
        const tick = () => {
            still = window.scrollY === last ? still + 1 : 0;
            last = window.scrollY;
            if (still >= 10 || performance.now() > end) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }));
    return page.evaluate(() => ({
        spent: !!(window.__spaceEv && window.__spaceEv.defaultPrevented),
        scrolled: window.scrollY !== window.__spaceY,
        viewer: !!document.querySelector('#mb-art-viewer:not([hidden])'),
    }));
}

test.describe('Space on a hovered image does what a click does (2026-10-24)', () => {
    test('Brucebase Media icon: Space opens the viewer on the icon\'s kind, the card goes, the page stays', async ({ page }) => {
        const { errors, served } = await openYear(page);
        await hover(page, icon(page, GIG4, 'Ticket'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(1);
        const r = await pressSpace(page);
        expect(r).toEqual({ spent: true, scrolled: false, viewer: true });
        // Grouped by kind: Photo, Photo, Ticket, News — the Ticket is 3 of 4,
        // exactly where a click opens (bb-image-card.spec.js).
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('3 / 4');
        await expect(tip(page)).toBeHidden();
        expect(served).toEqual([GIG4]);
        // The viewer owns Space while it is open: no second viewer, no scroll.
        await page.keyboard.press('Space');
        await expect(viewer(page)).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(viewer(page)).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('no card at all (the card switched off): Space still opens the viewer, as the click does', async ({ page }) => {
        const { errors, served } = await openYear(page, { sa_bb_tip_images: false });
        await hover(page, icon(page, GIG4, 'Photo'));
        await expect(tip(page)).toBeHidden();
        expect(served).toEqual([]);
        const r = await pressSpace(page);
        expect(r).toEqual({ spent: true, scrolled: false, viewer: true });
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 4');
        expect(errors).toEqual([]);
    });

    test('Space stays the page\'s with the pointer on no image, with Shift held, and while typing into a field', async ({ page }) => {
        const { errors } = await openYear(page);
        // Shift held: a Shift-click keeps the link, so Shift+Space opens nothing.
        await hover(page, icon(page, GIG4, 'Ticket'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(1);
        expect(await pressSpace(page, 'Shift+Space'), 'Shift held').toMatchObject({ spent: false, viewer: false });

        // Typing: a field away from the pointer, a letter typed, then Space.
        await page.evaluate(() => {
            const f = document.createElement('input');
            f.id = 't-field';
            f.type = 'text';
            f.style.cssText = 'position:fixed;top:0;left:0;width:80px;z-index:1;';
            document.body.appendChild(f);
            f.focus({ preventScroll: true });
        });
        await hover(page, icon(page, GIG4, 'Ticket'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(1);
        await page.keyboard.type('x');
        expect(await pressSpace(page), 'typing').toMatchObject({ spent: false, viewer: false });
        await expect(page.locator('#t-field'), 'the typed Space was the field\'s').toHaveValue('x ');
        await page.evaluate(() => { document.getElementById('t-field').remove(); document.body.focus(); });

        // Off an image, last (the unspent Space scrolls): from the icon onto
        // its row's Type cell, so a trigger the pointer has LEFT is what must
        // not open.
        await hover(page, icon(page, GIG4, 'Ticket'));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(1);
        const row = page.locator('table.tbl tbody tr', { has: page.locator(`a.mb-fi-media[href="${GIG4}"]`) }).first();
        await row.locator('td').nth(1).hover();
        await expect(tip(page)).toBeHidden();
        expect(await pressSpace(page), 'no image under the pointer').toMatchObject({ spent: false, viewer: false });
        expect(errors).toEqual([]);
    });

    test('brucespringsteen.it: the single-picture card (no tiles) opens the viewer on Space', async ({ page }) => {
        const errors = errorsOf(page);
        await loadBsRecordsPage(page, { settingsOverride: { sa_render_threshold: 100000 } });
        const { served } = await routeDetailPages(page, 'bs');
        await page.route(PHOTO, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.click('h1.mb-bs-h1 button[data-label="Unofficial"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const cell = page.locator(`table.tbl tbody a.mb-fi-cell[href="${REC('LP1B1')}"]`).first();
        await hover(page, cell);
        await expect(tip(page).locator('img.mb-fi-card-big')).toHaveAttribute('src', PHOTO);
        const r = await pressSpace(page);
        expect(r).toEqual({ spent: true, scrolled: false, viewer: true });
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText('1 / 1');
        expect(served).toEqual([REC('LP1B1')]);
        expect(errors).toEqual([]);
    });
});
