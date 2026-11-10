'use strict';

// discogs.com: one Marketplace listing (`/shop/item/<id>`, where a
// `/sell/item/<id>` link lands) as pageType `dg-listing`, and the listing
// reader (`dglisting`) for links to it (vzell, 2026-11-10, after his live
// test of feature/dg-user-seller-search; his answers: the listed release's
// Tracks view with a "For sale" card in the head; the window shows the
// listing and the release).
//
// Fixtures: scripts/build-discogs-fixtures.py (dg-listing.html from
// debug/d-sell-release-expanded.html: Next.js, the content in <main>);
// API answers scripts/capture-ext-fixtures.py's (the listing 4466508653 and
// its release 11011057).
//
// Pins: the gate lets the page in; one button; nothing asked before the
// press; the listing then the release; the release's sub-tables; the head's
// "For sale" card (conditions, price as listed, the page's shipping and
// total, the seller's shop); the reader's key for both URL forms; its card
// from one anonymous request; its window with the release's tracklist (one
// request more) and the shop opening in the window.
// Mutations: scripts/mutations/dg-user-seller-search.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answer = (f, url = f.url) => ({ [url]: { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body } });
const LISTING = 'https://api.discogs.com/marketplace/listings/4466508653';
const RELEASE = 'https://api.discogs.com/releases/11011057';
const ANSWERS = Object.assign({}, answer(FX('discogs-listing-4466508653')), answer(FX('discogs-release-11011057')),
    answer(FX('discogs-user-disckid-inventory-25-p1')));
const FILE = path.join(__dirname, 'dg-listing.html');

const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const kind = (page) => dialog(page).locator(':scope > div > span').first();
const back = (page) => dialog(page).locator('button', { hasText: 'Back' });
const gmLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).filter(r => r.url.startsWith('https://api.discogs.com/') && !r.url.endsWith('/favicon.ico'))
    .map(r => ({ url: r.url, anonymous: r.anonymous })));

/**
 * Loads the listing page fixture, the API answered from the captures.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function open(page, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, ANSWERS);
    await loadUserscriptPage(page, {
        url: 'https://www.discogs.com/shop/item/4466508653', fixtureFile: FILE, testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000, ...settings },
    });
    return errors;
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

test.describe('discogs.com: a Marketplace listing (dg-listing, dglisting)', () => {
    test('the page: one button; the listing then its release; the release\'s tracks; the head\'s "For sale" card', async ({ page }) => {
        const errors = await open(page);
        const root = page.locator('#mb-dg-root');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        expect(await root.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.dataset.label))).toEqual(['Show all tracks']);
        expect(await gmLog(page), 'nothing before the press').toEqual([]);
        await root.locator('button[data-label="Show all tracks"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await gmLog(page)).map(r => r.url)).toEqual([LISTING, RELEASE]);
        const rel = JSON.parse(FX('discogs-release-11011057').body);
        const n = rel.tracklist.filter(t => t.type_ === 'track').length;
        const rows = await root.locator('table.tbl').evaluateAll(ts => ts.filter(t => t.closest('#mb-dg-root') && t.previousElementSibling &&
            t.previousElementSibling.tagName === 'H3').reduce((k, t) => k + t.querySelectorAll('tbody tr').length, 0));
        expect(rows).toBeGreaterThanOrEqual(n);
        const head = root.locator('.mb-fd-head');
        await expect(head).toContainText('For sale');
        await expect(head).toContainText('Mint (M)');
        await expect(head).toContainText('Near Mint (NM or M-)');
        await expect(head).toContainText('€16.99');
        // The page's own shipping and total (the API has none for an anonymous request).
        await expect(head).toContainText('€11.00');
        await expect(head).toContainText('€27.99');
        await expect(head).toContainText('Sealed');
        await expect(head.locator('a', { hasText: /^disc-kid$/ })).toHaveAttribute('href', 'https://www.discogs.com/seller/disc-kid/profile');
        expect(errors).toEqual([]);
    });

    test('the reader: both URL forms one key; the card from one anonymous request; Space: the release\'s tracklist; the shop opens in the window', async ({ page }) => {
        const errors = await open(page, { sa_pop_ext: true, sa_pop_ext_hosts: ['api.discogs.com'] });
        const keys = await page.evaluate(() => ['/sell/item/4466508653', 'https://www.discogs.com/shop/item/4466508653?ev=bp_img', '/de/sell/item/4466508653']
            .map((h, i) => {
                const a = document.createElement('a');
                a.setAttribute('href', h);
                a.id = `dgli-${i}`;
                a.textContent = ` item ${i} `;
                document.querySelector('main').prepend(a);
                return window.__saTest.popResolve(a);
            }));
        expect(new Set(keys)).toEqual(new Set(['ext|ext:dglisting:https://www.discogs.com/sell/item/4466508653']));
        await ctrlHover(page, page.locator('#dgli-0'));
        const c = card(page);
        await expect(c).toContainText('Bob Dylan - Bob Dylan (LP, Album, Mono, RE, 180)');
        await expect(c).toContainText('€16.99');
        await expect(c).toContainText('Mint (M)');
        await expect(c).toContainText('disc-kid · 98.7 % of 2,625');
        expect(await gmLog(page)).toEqual([{ url: LISTING, anonymous: true }]);
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(kind(page)).toHaveText('Discogs listing');
        // The release, read by the window (Discogs' spacing: 2.5 s).
        await expect(d.locator('[data-mb-dg-sec="tracklist"]')).toHaveCount(1, { timeout: 10000 });
        await expect(d.locator('[data-mb-dg-sec="tracklist"]')).toContainText("You're No Good");
        expect((await gmLog(page)).map(r => r.url)).toEqual([LISTING, RELEASE]);
        await d.locator('[data-mb-dg-sec="dgli-links"] a', { hasText: "disc-kid's shop" }).click();
        await expect(kind(page)).toHaveText(/Discogs listing › Discogs list$/);
        await expect(d.locator('[data-mb-dg-sec="dgl-rows"] .mb-dg-c')).toHaveText('25 of 4,677', { timeout: 10000 });
        await back(page).click();
        await expect(kind(page)).toHaveText('Discogs listing');
        await expect(d.locator('[data-mb-dg-sec="tracklist"]')).toContainText("You're No Good");
        expect(errors).toEqual([]);
    });
});
