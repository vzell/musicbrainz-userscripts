'use strict';

// discogs.com's search page as pageType `dg-search` (2026-10-29; vzell:
// "Other missing Discogs pages should also get a PT"). The page is a Next.js
// app with neither #app nor #page_content (debug/dg-search.html): the gate
// lets /search through by its path and its <main>. The rows come from the
// API's database/search (as the search reader asks it), 100 a page; the API
// serves at most 100 pages, so the button names the first 10,000.
//
// Pins: the gate lets the page in; one button naming what the page counts
// and the cap; nothing asked before the press; page 1 asked once (the page
// count), then the rest; the rows' kind, linked title, format, label, year.
// Mutations: scripts/mutations/dg-search.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FILE = path.join(__dirname, 'dg-search.html');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'ext-discogs-search-springsteen-all-p1.json'), 'utf8'));
const PAGE_URL = (p) => `https://api.discogs.com/database/search?q=bruce%20springsteen&per_page=100&page=${p}`;

/**
 * Loads the search page with the API's page 1 answering pages 1 and 2, its
 * page count cut to 2 (the real one is 100).
 * @param {import('@playwright/test').Page} page
 * @param {string} [url]
 * @returns {Promise<string[]>} Page errors.
 */
async function open(page, url = 'https://www.discogs.com/search?q=bruce+springsteen&type=all') {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const d = JSON.parse(FX.body);
    d.pagination.pages = 2;
    const ans = { status: 200, responseHeaders: `Content-Type: ${FX.contentType}`, responseText: JSON.stringify(d) };
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, { [PAGE_URL(1)]: ans, [PAGE_URL(2)]: ans });
    await loadUserscriptPage(page, { url, fixtureFile: FILE, testMode: true, settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 } });
    return errors;
}

const apiLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://api.discogs.com/')));

test.describe('discogs.com: the search page (dg-search)', () => {
    test('the Next.js page is let in; one button with the count and the API\'s cap; the results from the API, 100 a page', async ({ page }) => {
        const errors = await open(page);
        const root = page.locator('#mb-dg-root');
        const btn = root.locator('button[data-label="Show all results"]');
        expect(await root.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.dataset.label))).toEqual(['Show all results']);
        await expect(btn).toHaveAttribute('data-mbtt', /The first 10,000 of 24,128 results/);
        expect(await apiLog(page), 'nothing before the press').toEqual([]);
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await apiLog(page)).toEqual([PAGE_URL(1), PAGE_URL(2)]);
        const table = root.locator('table.tbl').first();
        const n = JSON.parse(FX.body).results.filter(r => r.uri).length;
        await expect(table.locator('tbody > tr')).toHaveCount(2 * n);
        const hs = await table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(hs.filter(Boolean)).toEqual(expect.arrayContaining(['Type', 'Title', 'Format', 'Label', 'Year']));
        // The first result is the label "Bruce Springsteen": its kind, its page.
        const first = table.locator('tbody > tr').first();
        await expect(first.locator('td').nth(hs.indexOf('Type'))).toHaveText('Label');
        await expect(first.locator('a', { hasText: 'Bruce Springsteen' })).toHaveAttribute('href', 'https://www.discogs.com/label/266838-Bruce-Springsteen');
        expect(errors).toEqual([]);
    });

    // vzell, 2026-10-29 (screenshot): with murdos' importer installed the
    // table's head got the MusicBrainz column, its rows did not (this page
    // never decorates them; the importer does nothing on a search page): every
    // heading after it sat one column off its cells.
    test('with the importer installed: no MusicBrainz column, every heading over its own cells', async ({ page }) => {
        await page.context().addInitScript(() => localStorage.setItem('DISCOGS_MBLINKS_CACHE-v3.1', '{}'));
        await open(page);
        await page.locator('#mb-dg-root button[data-label="Show all results"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const table = page.locator('#mb-dg-root table.tbl').first();
        const shape = await table.evaluate(t => ({
            heads: Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim()),
            cells: Array.from(t.tBodies[0].rows).slice(0, 5).map(r => r.cells.length),
        }));
        expect(shape.heads).not.toContain('MusicBrainz');
        expect(new Set(shape.cells)).toEqual(new Set([shape.heads.length]));
    });

    test('a page without a query has no button', async ({ page }) => {
        await open(page, 'https://www.discogs.com/search?type=all&q=');
        await expect(page.locator('#mb-dg-root h1.mb-dg-h1')).toBeVisible();
        await expect(page.locator('#mb-dg-root button[data-label="Show all results"]')).toHaveCount(0);
    });
});
