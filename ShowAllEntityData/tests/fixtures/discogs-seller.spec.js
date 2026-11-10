'use strict';

// discogs.com: a seller's shop (`/seller/<name>/profile`) as pageType
// `dg-seller` (2026-11-10, feature/dg-user-seller-search; mockup
// https://claude.ai/artifact/2gnX1gagFEHTCC2LsFEn6n, tab B). vzell's
// answers: the rows from the shop's own pages, 250 a page, its filters and
// sort kept; Discogs' item text split into Artist, Title and Format AND kept
// whole as Item.
//
// Fixtures: scripts/build-discogs-fixtures.py (dg-seller-profile.html from
// debug/d-seller-profile.html: disc-kid's shop, "1 – 25 of 4,677", its first
// six listings; dg-seller-profile-empty.html: vzell's, "No items for sale
// found"). Every fetched page is served the first fixture.
//
// Pins: one button naming the count and the requests; nothing asked before
// the press; every page asked at limit=250 with the page's filter kept; the
// row's split (a title with its own parentheses too), labels, Cat#, the
// community's numbers, the listing's columns and Item; the thumbnail is the
// Image card's; no button on an empty shop; no MusicBrainz column; dg-sell's
// rows unchanged by the shared row parser (discogs-sell.spec.js).
// Mutations: scripts/mutations/dg-user-seller-search.json.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FILE = path.join(__dirname, 'dg-seller-profile.html');
const EMPTY = path.join(__dirname, 'dg-seller-profile-empty.html');
const PAGE = 'https://www.discogs.com/seller/disc-kid/profile';

/**
 * Loads a shop page at `url` (no `page=`, so the fixture route never answers
 * the fetch), serving every fetched page from the fixture and logging it.
 * @param {import('@playwright/test').Page} page
 * @param {string} [url]
 * @param {string} [file]
 * @returns {Promise<{errors: string[], asked: string[]}>}
 */
async function open(page, url = PAGE, file = FILE) {
    const errors = [];
    const asked = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route(/^https:\/\/www\.discogs\.com\/seller\/[^/]+\/profile\?.*\bpage=/, (route) => {
        asked.push(route.request().url());
        return route.fulfill({ path: FILE, contentType: 'text/html' });
    });
    await loadUserscriptPage(page, { url, fixtureFile: file, testMode: true, settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 } });
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

test.describe('discogs.com: a seller\'s shop (dg-seller)', () => {
    test('one button with the count; 19 pages at 250; the release split out of the item text, the item kept whole; every column', async ({ page }) => {
        const { errors, asked } = await open(page);
        const root = page.locator('#mb-dg-root');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('disc-kid');
        const btn = root.locator('button[data-label="Show everything for sale"]');
        expect(await root.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.dataset.label))).toEqual(['Show everything for sale']);
        await expect(btn).toHaveAttribute('title', /All 4,677 listings of this shop, .*250 a page\): 19 requests/);
        await expect(btn).not.toHaveAttribute('title', /as the page filters/);
        expect(asked, 'nothing before the press').toEqual([]);
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(asked.map(u => new URL(u).searchParams.get('page'))).toEqual(Array.from({ length: 19 }, (_, i) => String(i + 1)));
        expect(new Set(asked.map(u => new URL(u).searchParams.get('limit')))).toEqual(new Set(['250']));
        const table = root.locator('table.tbl').first();
        await expect(table.locator('tbody > tr')).toHaveCount(19 * 6);
        expect(await rowOf(table, 0)).toEqual(expect.objectContaining({
            Artist: 'Bananarama', Title: 'Venus', Format: '7", Single', Label: 'Metronome, London Records', 'Cat#': '886 056-7',
            Media: 'Very Good Plus (VG+)', Sleeve: 'Very Good Plus (VG+)', Rated: '4.01', Have: '2234', Want: '106',
            'Ships from': 'Netherlands', Price: '€1.99', Shipping: '+€11.00', About: '€12.99', Item: 'Bananarama - Venus (7", Single)',
        }));
        // A title with parentheses of its own: only the LAST ones are the format.
        expect(await rowOf(table, 2)).toEqual(expect.objectContaining({
            Artist: 'Jackie DeShannon', Title: 'Love Forever (Demo Recordings 1966-68)', Format: 'LP, RSD, Comp, Mono, Ltd, Red',
        }));
        expect((await rowOf(table, 1)).Comments).toBe('Sealed');
        const first = table.locator('tbody > tr').first();
        await expect(first.locator('a', { hasText: /^Venus$/ })).toHaveAttribute('href', 'https://www.discogs.com/release/218200-Bananarama-Venus');
        await expect(first.locator('a', { hasText: 'Bananarama - Venus' })).toHaveAttribute('href', 'https://www.discogs.com/sell/item/4474302203');
        await expect(first.locator('a', { hasText: 'London Records' })).toHaveAttribute('href', 'https://www.discogs.com/label/1060-London-Records');
        await expect(first.locator('a', { hasText: /^Bananarama$/ })).toHaveAttribute('href', /\/search\/\?q=Bananarama&type=artist$/);
        // The thumbnail: the release's picture, the Image card's (_DG_FI).
        const thumb = first.locator('td.mb-dg-imgcell a.mb-dg-thumblink');
        await expect(thumb).toHaveAttribute('data-mb-fi', 'dg');
        await expect(thumb).toHaveAttribute('href', /^https:\/\/i\.discogs\.com\/JEBcYTsYd1o/);
        expect(errors).toEqual([]);
    });

    test('a filtered shop: the page\'s filter kept in every page asked, and the hover text says so', async ({ page }) => {
        const { asked } = await open(page, `${PAGE}?format=Vinyl&sort=price%2Casc`);
        const btn = page.locator('#mb-dg-root button[data-label="Show everything for sale"]');
        await expect(btn).toHaveAttribute('title', /as the page filters them/);
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(asked.length).toBeGreaterThan(0);
        for (const u of asked) {
            const q = new URL(u).searchParams;
            expect([q.get('format'), q.get('sort'), q.get('limit')]).toEqual(['Vinyl', 'price,asc', '250']);
        }
    });

    test('an empty shop has no button', async ({ page }) => {
        const { errors } = await open(page, 'https://www.discogs.com/seller/vzell/profile', EMPTY);
        await expect(page.locator('#mb-dg-root h1.mb-dg-h1')).toBeVisible();
        await expect(page.locator('#mb-dg-root button[data-label="Show everything for sale"]')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('with the importer installed: no MusicBrainz column, every heading over its own cells', async ({ page }) => {
        await page.context().addInitScript(() => localStorage.setItem('DISCOGS_MBLINKS_CACHE-v3.1', '{}'));
        await open(page);
        await page.locator('#mb-dg-root button[data-label="Show everything for sale"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const shape = await page.locator('#mb-dg-root table.tbl').first().evaluate(t => ({
            heads: Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim()),
            cells: Array.from(t.tBodies[0].rows).map(r => r.cells.length),
        }));
        expect(shape.heads).not.toContain('MusicBrainz');
        expect(new Set(shape.cells)).toEqual(new Set([shape.heads.length]));
    });
});
