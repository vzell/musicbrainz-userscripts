'use strict';

// discogs.com, 2026-10-26 (org/discogs.org, vzell: "On a Discogs artist,
// master and label IP the image before a … name should get our standard
// image handling"): the thumbnails of Discogs' OWN lists on the initial page
// get the image card of our tables (every image of the row's release or
// master, one request for that row) and the viewer on a click or Space,
// Shift+→ stepping through the list (`_DGP_FI`). The fixtures are cut from
// pages vzell saved (scripts/build-dg-ip-fixtures.py).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const API = 'https://api.discogs.com/';
// The pages, and the first row's record each must ask for.
const PAGES = {
    artist: { url: 'https://www.discogs.com/artist/82730-Bruce-Springsteen', first: `${API}masters/26750` },
    master: { url: 'https://www.discogs.com/master/26750-Bruce-Springsteen-Greetings-From-Asbury-Park-NJ', first: `${API}releases/1302456` },
    label: { url: 'https://www.discogs.com/label/1866-Columbia', first: `${API}releases/33234501` },
};

/**
 * Loads one of the initial-page fixtures with the userscript; every
 * Discogs release is answered with the captured release 1874253 (five
 * images), every master with master 26725.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} kind - 'artist', 'master' or 'label'.
 * @param {{settings?: Object}} [opts]
 * @returns {Promise<{errors: string[]}>}
 */
async function openIp(page, kind, { settings = {} } = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const rel = FX('discogs-release');
    const mas = FX('discogs-master');
    await page.context().addInitScript(([r, m]) => {
        window.__gmXhrResponder = (opts) => {
            const u = String(opts.url);
            const f = /^https:\/\/api\.discogs\.com\/releases\/\d+$/.test(u) ? r : /^https:\/\/api\.discogs\.com\/masters\/\d+$/.test(u) ? m : null;
            return f ? { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body } : undefined;
        };
    }, [rel, mas]);
    await loadUserscriptPage(page, {
        url: PAGES[kind].url, fixtureFile: path.join(__dirname, `dg-ip-${kind}.html`), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', ...settings },
    });
    return { errors };
}

const apiLog = (page) => page.evaluate((api) => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith(api)), API);
const tip = (page) => page.locator('#mb-stat-tooltip');
const thumb = (page, i) => page.locator('#app table > tbody > tr').nth(i).locator('td:first-child > a').first();

/**
 * Hovers a thumbnail from outside, so the card is built for this hover.
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

test.describe('discogs.com: the image card on Discogs\' own lists (2026-10-26)', () => {
    for (const kind of ['artist', 'master', 'label']) {
        test(`${kind} page: a rest on a thumbnail shows the row's images, asking for that row only`, async ({ page }) => {
            const { errors } = await openIp(page, kind);
            await hover(page, thumb(page, 0));
            await expect(thumb(page, 0)).toHaveAttribute('data-mb-fi', 'dgp');
            const withImage = await page.locator('#app table > tbody > tr > td:first-child > a:has(img[src*="i.discogs.com"])').count();
            expect(withImage).toBeGreaterThan(1);
            await expect(page.locator('#app table > tbody > tr > td:first-child > a[data-mb-fi="dgp"]'), 'the whole list stamped').toHaveCount(withImage);
            await expect(tip(page).locator('.mb-art-card-tile')).not.toHaveCount(0);
            expect(await apiLog(page), 'one request: this row\'s release or master').toEqual([PAGES[kind].first]);
            expect(errors).toEqual([]);
        });
    }

    test('a click opens the viewer on the row\'s images, not Discogs\' gallery; Shift+→ steps to the next row', async ({ page }) => {
        const { errors } = await openIp(page, 'label');
        await hover(page, thumb(page, 0));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        const url = page.url();
        await thumb(page, 0).click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 5');
        expect(page.url(), 'the page stays').toBe(url);
        await page.keyboard.press('Shift+ArrowRight');
        await expect.poll(async () => (await apiLog(page)).includes(`${API}releases/15956250`), { message: 'the next row asked when shown' }).toBe(true);
        expect(errors).toEqual([]);
    });

    test('Space on the hovered thumbnail opens the viewer, as a click does', async ({ page }) => {
        const { errors } = await openIp(page, 'master');
        await hover(page, thumb(page, 0));
        await expect(tip(page).locator('.mb-art-card-tile')).toHaveCount(5);
        await page.keyboard.press('Space');
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('1 / 5');
        expect(errors).toEqual([]);
    });

    test('"all images of a row on hover" off: no card, no request', async ({ page }) => {
        await openIp(page, 'artist', { settings: { sa_dg_tip_images: false } });
        await hover(page, thumb(page, 0));
        await expect(tip(page)).toBeHidden();
        expect(await apiLog(page)).toEqual([]);
    });
});

// org/discogs.org 4b (vzell, 2026-10-26, a screenshot of a label page):
// Discogs binds its own artist hover card to the span around the name and
// murdos' importer icons, and builds the enter from a mouseout inside its
// page; neither path may reach React while our previews are on.
test.describe('discogs.com: Discogs\' artist hover card on a label page (2026-10-26)', () => {
    /**
     * Moves the pointer from `from` onto `to` (both inside `#app`) and
     * returns the hover events a listener at React's root saw for the
     * artist name's wrapper.
     *
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} from
     * @param {import('@playwright/test').Locator} to
     * @returns {Promise<string[]>}
     */
    async function seen(page, from, to) {
        await page.evaluate(() => {
            window.__appSaw = [];
            const app = document.getElementById('app');
            ['mouseover', 'mouseout', 'mouseenter', 'pointerover', 'pointerout'].forEach(t => app.addEventListener(t, (e) => {
                const hit = (el) => el instanceof Element && !!el.closest('.mb_wrapper, a[href^="/artist/"]');
                if (hit(e.target) || hit(e.relatedTarget)) window.__appSaw.push(t);
            }, true));
        });
        await from.hover();
        await page.evaluate(() => { window.__appSaw = []; });
        await to.hover();
        return page.evaluate(() => window.__appSaw);
    }

    const name = (page) => page.locator('#app a[href^="/artist/15778380"]').first();
    const cellBeside = (page) => page.locator('#app table > tbody > tr').first().locator('td').last();
    const icon = (page) => page.locator('#app a.mb_search_link[href*="type=artist"]').first();

    test('previews on: from a neighbouring cell or from the importer icon onto the name, nothing reaches #app', async ({ page }) => {
        const { errors } = await openIp(page, 'label', { settings: { sa_pop_ext: true } });
        expect(await seen(page, cellBeside(page), name(page)), 'from the cell beside').toEqual([]);
        expect(await seen(page, cellBeside(page), icon(page)), 'onto the importer icon in the wrapper').toEqual([]);
        expect(errors).toEqual([]);
    });

    test('previews off: Discogs\' page sees the hover as before', async ({ page }) => {
        const { errors } = await openIp(page, 'label', { settings: { sa_pop_ext: false } });
        expect(await seen(page, cellBeside(page), name(page))).toEqual(expect.arrayContaining(['mouseover', 'pointerover']));
        expect(errors).toEqual([]);
    });
});
