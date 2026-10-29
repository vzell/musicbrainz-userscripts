'use strict';

// discogs.com: a release's Marketplace page as pageType `dg-sell`
// (2026-10-29; vzell: "Other missing Discogs pages should also get a PT").
// The listings are not in the API as a list: the rows come from the page's
// own pages, same-origin, 250 a page, the page's sort kept. The fixture is
// debug/dg-sell-release.html cut by scripts/build-discogs-fixtures.py: three
// listings (BRL, EUR, USD), "1 – 3 of 3".
//
// Pins: one button naming the count; nothing asked before the press; page 1
// asked with limit=250 and the page's own sort; every listing's item,
// conditions, seller, rating and its count, ships-from, price, shipping and
// the converted price; the item links absolute.
// Mutations: scripts/mutations/dg-sell.json.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FILE = path.join(__dirname, 'dg-sell-release.html');
const PAGE = 'https://www.discogs.com/sell/release/8164856';

/**
 * Loads the Marketplace page at `url` (no `page=`, so the fixture route
 * never answers the fetch), serving every fetched page from the fixture and
 * logging it.
 * @param {import('@playwright/test').Page} page
 * @param {string} [url]
 * @returns {Promise<{errors: string[], asked: string[]}>}
 */
async function open(page, url = PAGE) {
    const errors = [];
    const asked = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route(/^https:\/\/www\.discogs\.com\/sell\/release\/8164856\?.*\bpage=/, (route) => {
        asked.push(route.request().url());
        return route.fulfill({ path: FILE, contentType: 'text/html' });
    });
    await loadUserscriptPage(page, { url, fixtureFile: FILE, testMode: true, settingsOverride: { sa_enable_discogs: true } });
    return { errors, asked };
}

/**
 * The texts of one row's cells, by column name.
 * @param {import('@playwright/test').Locator} table
 * @param {number} row
 * @returns {Promise<Object<string, string>>}
 */
async function rowOf(table, row) {
    const hs = await table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
    const cells = await table.locator('tbody > tr').nth(row).locator(':scope > td').allTextContents();
    return Object.fromEntries(hs.map((h, i) => [h, (cells[i] || '').trim()]));
}

test.describe('discogs.com: a release\'s Marketplace page (dg-sell)', () => {
    test('one button with the count; page 1 at 250 a page; every listing with its conditions, seller, price, shipping and converted price', async ({ page }) => {
        const { errors, asked } = await open(page);
        const root = page.locator('#mb-dg-root');
        const btn = root.locator('button[data-label="Show every listing"]');
        expect(await root.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.dataset.label))).toEqual(['Show every listing']);
        await expect(btn).toHaveAttribute('data-mbtt', /All 3 listings/);
        expect(asked, 'nothing before the press').toEqual([]);
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(asked).toHaveLength(1);
        const u = new URL(asked[0]);
        expect([u.searchParams.get('limit'), u.searchParams.get('page')]).toEqual(['250', '1']);
        const table = root.locator('table.tbl').first();
        await expect(table.locator('tbody > tr')).toHaveCount(3);
        expect(await rowOf(table, 0)).toMatchObject({
            Item: 'Bruce Springsteen - Human Touch (CD, Album)', Media: 'Near Mint (NM or M-)', Sleeve: 'Very Good Plus (VG+)',
            Seller: 'discosdevinil.com.br', Rating: '97.2%', Ratings: '36', 'Ships from': 'Brazil',
            Price: 'R$69.99', Shipping: '+R$250.00', About: '€53.93',
        });
        await expect(table.locator('tbody > tr').first().locator('a', { hasText: 'Human Touch' })).toHaveAttribute('href', 'https://www.discogs.com/sell/item/4033083994');
        await expect(table.locator('tbody > tr').first().locator('a', { hasText: 'discosdevinil.com.br' }))
            .toHaveAttribute('href', 'https://www.discogs.com/seller/discosdevinil.com.br/profile');
        expect(errors).toEqual([]);
    });

    test('the page\'s own sort is kept in what is asked', async ({ page }) => {
        const { asked } = await open(page, `${PAGE}?sort=seller%2Casc`);
        await page.locator('#mb-dg-root button[data-label="Show every listing"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(new URL(asked[0]).searchParams.get('sort')).toBe('seller,asc');
    });
});
