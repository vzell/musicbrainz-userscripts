'use strict';

// The list reader (`dgulist`, 2026-11-10, feature/dg-user-seller-search;
// mockup https://claude.ai/artifact/2gnX1gagFEHTCC2LsFEn6n, tab D): a link
// to a user's submissions, contributions, collection or wantlist, or to a
// seller's shop. The card is ONE anonymous request to Discogs' API (page 1,
// 25 rows); the window shows the rows in the shared Compact table and
// "Load 25 more"; the user window's "On Discogs" links open in the same
// window.
//
// Fixtures: dg-contributions.html (a discogs.com page to put links in),
// dg-user-vzell.html (the user's page), event-overview.html (MusicBrainz);
// the API answers are scripts/capture-ext-fixtures.py's (disc-kid's shop
// pages 1-2 and vzell's contributions, 25 a page).
//
// Pins: which links the reader takes and their cache keys; the card's facts
// from one request; the window's rows, Load 25 more = page 2; a drill from
// the user window and Back; on MusicBrainz an anonymous request.
// Mutations: scripts/mutations/dg-user-seller-search.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answer = (f, url = f.url) => ({ [url]: { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body } });
const API = 'https://api.discogs.com/';
const INV = (p) => `${API}users/disc-kid/inventory?sort=listed&sort_order=desc&per_page=25&page=${p}`;
const CONTRIB = `${API}users/vzell/contributions?sort=added&sort_order=desc&per_page=25&page=1`;
const ANSWERS = Object.assign({},
    answer(FX('discogs-user-disckid-inventory-25-p1')), answer(FX('discogs-user-disckid-inventory-25-p2')),
    answer(FX('discogs-user-vzell-contributions-25-p1')), answer(FX('discogs-user-vzell')));

const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const kind = (page) => dialog(page).locator(':scope > div > span').first();
const back = (page) => dialog(page).locator('button', { hasText: 'Back' });
// The API's own requests; the site icon (`_extIconEnsure()`, after an answer) is not one.
const gmLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).filter(r => r.url.startsWith('https://api.discogs.com/') && !r.url.endsWith('/favicon.ico'))
    .map(r => ({ url: r.url, anonymous: r.anonymous })));

/**
 * Loads a page fixture with previews on, the network aborted, the APIs
 * answered from the captures and discogs.com's user page served.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} file
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function open(page, url, file, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route(/^https:\/\/www\.discogs\.com\/user\/vzell$/, (route) => route.fulfill({ path: path.join(__dirname, 'dg-user-vzell.html'), contentType: 'text/html' }));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, ANSWERS);
    await loadUserscriptPage(page, {
        url, fixtureFile: path.join(__dirname, file), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext: true, sa_pop_ext_hosts: ['api.discogs.com', 'www.discogs.com'], ...settings },
    });
    return errors;
}

/**
 * Adds links to `#page_content` (relative, as Discogs writes them) and
 * returns what the previews make of each (`<source>|<key>`, or null).
 * @param {import('@playwright/test').Page} page
 * @param {string[]} hrefs
 * @returns {Promise<Array<?string>>}
 */
function addLinks(page, hrefs) {
    return page.evaluate((hs) => hs.map((h, i) => {
        const a = document.createElement('a');
        a.setAttribute('href', h);
        a.id = `dgl-probe-${i}`;
        a.textContent = ` link ${i} `;
        document.getElementById('page_content').prepend(a);
        return window.__saTest.popResolve(a);
    }), hrefs);
}

/**
 * Hovers an element with Ctrl held.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function ctrlHover(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
}

test.describe('the Discogs list reader (dgulist)', () => {
    test('which links it takes, one key each: submissions, contributions, collection, wantlist, a shop; not the user page itself', async ({ page }) => {
        await open(page, 'https://www.discogs.com/contributions?user=vzell', 'dg-contributions.html');
        const keys = await addLinks(page, ['/user/vzell/submissions', '/de/contributions?user=vzell&sort=label&sort_order=asc', '/user/vzell/collection',
            '/wantlist?user=disc-kid', '/user/disc-kid/wantlist', '/seller/disc-kid/profile?format=Vinyl', '/user/vzell', '/mywantlist']);
        const D = 'ext|ext:dgulist:https://www.discogs.com';
        expect(keys).toEqual([`${D}/user/vzell/submissions`, `${D}/contributions?user=vzell`, `${D}/user/vzell/collection`,
            `${D}/user/disc-kid/wantlist`, `${D}/user/disc-kid/wantlist`, `${D}/seller/disc-kid/profile`,
            'ext|ext:dguser:https://www.discogs.com/user/vzell', null]);
    });

    test('a shop: the card from one request (count, rating, ships from, newest); Space: 25 rows, Load 25 more = page 2', async ({ page }) => {
        const errors = await open(page, 'https://www.discogs.com/contributions?user=vzell', 'dg-contributions.html');
        await addLinks(page, ['/seller/disc-kid/profile']);
        expect(await gmLog(page), 'nothing before the hover').toEqual([]);
        await ctrlHover(page, page.locator('#dgl-probe-0'));
        const c = card(page);
        await expect(c).toContainText('disc-kid · for sale');
        await expect(c).toContainText('4,677');
        await expect(c).toContainText('98.7 % of 2,625');
        await expect(c).toContainText('Netherlands');
        const first = JSON.parse(FX('discogs-user-disckid-inventory-25-p1').body).listings[0].release.title;
        await expect(c).toContainText(first);
        expect(await gmLog(page)).toEqual([{ url: INV(1), anonymous: true }]);
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(kind(page)).toHaveText('Discogs list');
        await expect(d.locator('[data-mb-dg-sec="dgl-rows"] .mb-dg-c')).toHaveText('25 of 4,677');
        await expect(d.locator('[data-mb-tbl="dg-ulist"] tbody tr')).toHaveCount(25);
        await d.locator('[data-mb-dgl-act="more"]').click();
        // Discogs' requests are 2.5 s apart without a token.
        await expect(d.locator('[data-mb-dg-sec="dgl-rows"] .mb-dg-c')).toHaveText('50 of 4,677', { timeout: 10000 });
        expect((await gmLog(page)).map(r => r.url)).toEqual([INV(1), INV(2)]);
        // The current list is marked among the user's lists on the left.
        await expect(d.locator('[data-mb-dg-sec="dgl-links"] a.mb-dg-btn-here')).toHaveText('For sale');
        expect(errors).toEqual([]);
    });

    test('from the user window: Contributions opens in the same window, its rows; Back to the user', async ({ page }) => {
        const errors = await open(page, 'https://www.discogs.com/contributions?user=vzell', 'dg-contributions.html');
        await addLinks(page, ['/user/vzell']);
        await ctrlHover(page, page.locator('#dgl-probe-0'));
        await expect(card(page)).toBeVisible();
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(kind(page)).toHaveText('Discogs user');
        const links = d.locator('[data-mb-dg-sec="dgu-links"] a');
        await expect(links).toHaveText(['Profile ↗', 'Contributions ↗', 'Submissions ↗', 'Collection ↗', 'Wantlist ↗', 'For sale ↗']);
        await links.filter({ hasText: 'Contributions' }).click();
        await expect(kind(page)).toHaveText(/Discogs user › Discogs list$/);
        // Discogs' requests are 2.5 s apart without a token.
        await expect(d.locator('[data-mb-dg-sec="dgl-rows"] .mb-dg-c'), JSON.stringify(await gmLog(page))).toHaveText('3 of 3', { timeout: 10000 });
        const titles = JSON.parse(FX('discogs-user-vzell-contributions-25-p1').body).contributions.map(r => r.title);
        for (const t of titles) await expect(d.locator('[data-mb-tbl="dg-ulist"]')).toContainText(t);
        expect((await gmLog(page)).map(r => r.url)).toContain(CONTRIB);
        await back(page).click();
        await expect(kind(page)).toHaveText('Discogs user');
        expect(errors).toEqual([]);
    });

    test('on MusicBrainz: a shop link takes the reader; the card\'s request is anonymous', async ({ page }) => {
        const errors = await open(page, 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8', 'event-overview.html');
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.href = 'https://www.discogs.com/seller/disc-kid/profile';
            a.id = 'dgl-mb';
            a.textContent = 'disc-kid';
            document.querySelector('table.details td').prepend(a, ' ');
        });
        expect(await page.evaluate(() => window.__saTest.popResolve(document.getElementById('dgl-mb'))))
            .toBe('ext|ext:dgulist:https://www.discogs.com/seller/disc-kid/profile');
        await ctrlHover(page, page.locator('#dgl-mb'));
        await expect(card(page)).toContainText('4,677');
        expect(await gmLog(page)).toEqual([{ url: INV(1), anonymous: true }]);
        expect(errors).toEqual([]);
    });
});
