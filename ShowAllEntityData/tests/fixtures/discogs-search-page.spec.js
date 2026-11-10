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
async function open(page, url = 'https://www.discogs.com/search?q=bruce+springsteen&type=all', settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const d = JSON.parse(FX.body);
    d.pagination.pages = 2;
    const ans = { status: 200, responseHeaders: `Content-Type: ${FX.contentType}`, responseText: JSON.stringify(d) };
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, { [PAGE_URL(1)]: ans, [PAGE_URL(2)]: ans });
    await loadUserscriptPage(page, { url, fixtureFile: FILE, testMode: true, settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000, ...settings } });
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

    test('G4: before any button, a result in the page\'s <main> previews (relative, as Discogs writes it); Discogs\' header does not', async ({ page }) => {
        // Pins G4 of NON-MB-COVERAGE.org (2026-11-03): the search page
        // (Next.js) has neither #app nor #page_content, its results are in
        // <main>, which `_DP_SITES['www.discogs.com'].extRoot` did not name.
        await open(page, undefined, { sa_pop_ext: true });
        const r = await page.evaluate(() => {
            const add = (sel, href) => {
                const a = document.createElement('a');
                a.setAttribute('href', href);
                a.textContent = 'Born To Run';
                document.querySelector(sel).appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return { main: add('main', '/release/1874253-Bruce-Springsteen-Born-To-Run'), header: add('header', '/release/1874253-Bruce-Springsteen-Born-To-Run') };
        });
        expect(r.main).toBe('ext|ext:discogs:https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run');
        expect(r.header, 'Discogs\' header').toBeNull();
    });
});

// A search by the page's filters, no `q` (2026-11-10, feature/dg-user-seller-search;
// debug/d-search.html; mockup https://claude.ai/artifact/2gnX1gagFEHTCC2LsFEn6n,
// tab C). The probe (scripts/probe-dg-user-seller-search.py) mapped each
// filter: style_exact → style, decade → a year range, sort=title,asc → sort
// and sort_order; a filter the API cannot ask is left out and named (vzell).
const FACETS_FILE = path.join(__dirname, 'dg-search-facets.html');
const FACETS_FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'ext-discogs-search-rocknroll-title-p1.json'), 'utf8'));
const STYLE = 'q=&style=Rock%20%26%20Roll';
const FACETS_URL = (sub, p) => `https://api.discogs.com/database/search?${sub}&per_page=100&page=${p}`;

/**
 * Loads the filter search page at `url`, the API's page 1 answering pages 1
 * and 2 of each query in `subs`, its page count cut to 2.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string[]} subs
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function openFacets(page, url, subs, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const d = JSON.parse(FACETS_FX.body);
    d.pagination.pages = 2;
    const ans = { status: 200, responseHeaders: `Content-Type: ${FACETS_FX.contentType}`, responseText: JSON.stringify(d) };
    const answers = Object.fromEntries(subs.flatMap(sub => [1, 2].map(p => [FACETS_URL(sub, p), ans])));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, answers);
    await loadUserscriptPage(page, { url, fixtureFile: FACETS_FILE, testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000, ...settings } });
    return errors;
}

test.describe('discogs.com: a search by the page\'s filters (dg-search)', () => {
    test('style and title sort, no q: the button, the API asked with style, sort and sort_order; no note', async ({ page }) => {
        const sub = `${STYLE}&sort=title&sort_order=asc`;
        const errors = await openFacets(page, 'https://www.discogs.com/search?style_exact=Rock+%26+Roll&sort=title%2Casc&page=1&limit=250&layout=med', [sub]);
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('Rock & Roll');
        const btn = root.locator('button[data-label="Show all results"]');
        await expect(btn).toHaveAttribute('data-mbtt', /The first 10,000 of 381,026 results/);
        await expect(btn).not.toHaveAttribute('data-mbtt', /Not applied/);
        expect(await apiLog(page), 'nothing before the press').toEqual([]);
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await apiLog(page)).toEqual([FACETS_URL(sub, 1), FACETS_URL(sub, 2)]);
        const n = JSON.parse(FACETS_FX.body).results.filter(r => r.uri).length;
        await expect(root.locator('table.tbl').first().locator('tbody > tr')).toHaveCount(2 * n);
        await expect(root.locator('p.mb-dg-note')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('a sort the API cannot ask (want): left out, named in the hover text and above the table', async ({ page }) => {
        const errors = await openFacets(page, 'https://www.discogs.com/search?style_exact=Rock+%26+Roll&sort=want%2Cdesc', [STYLE]);
        const root = page.locator('#mb-dg-root');
        const btn = root.locator('button[data-label="Show all results"]');
        // The hover card's HTML escapes the quotes.
        await expect(btn).toHaveAttribute('data-mbtt', /Not applied \(Discogs' API cannot ask it\): sort (?:"|&quot;)want,desc(?:"|&quot;)\./);
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await apiLog(page)).toEqual([FACETS_URL(STYLE, 1), FACETS_URL(STYLE, 2)]);
        const note = root.locator('p.mb-dg-note');
        await expect(note).toHaveText('Not applied (Discogs\' API cannot ask it): sort "want,desc".');
        expect(await note.evaluate(p => p.previousElementSibling.matches('h2.mb-dg-list-heading') && p.nextElementSibling.matches('table.tbl'))).toBe(true);
        expect(errors).toEqual([]);
    });

    test('a decade alone is asked as its years; with a year the year wins; a second style is left out', async ({ page }) => {
        const decade = `${STYLE}&year=1970-1979`;
        const year = `${STYLE}&year=1975`;
        await openFacets(page, 'https://www.discogs.com/search?style_exact=Rock+%26+Roll&decade=1970', [decade, year], { sa_pop_ext: true });
        const r = await page.evaluate(() => {
            const at = (href) => {
                const a = document.createElement('a');
                a.setAttribute('href', href);
                a.textContent = 'search';
                document.querySelector('main').appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return {
                decade: at('/search?style_exact=Rock+%26+Roll&decade=1970'),
                year: at('/search?style_exact=Rock+%26+Roll&decade=1970&year=1975'),
                twice: at('/search?style_exact=Rock+%26+Roll&style_exact=Rockabilly'),
                q: at('/search/?q=Columbia&type=label'),
                none: at('/search?type=all&layout=med'),
            };
        });
        expect(r.decade).toMatch(/\|ext:dgsearch:https:\/\/www\.discogs\.com\/search\/\?q=&style=Rock%20%26%20Roll&year=1970-1979$/);
        expect(r.year).toMatch(/\|ext:dgsearch:https:\/\/www\.discogs\.com\/search\/\?q=&style=Rock%20%26%20Roll&year=1975$/);
        expect(r.twice).toMatch(/\|ext:dgsearch:https:\/\/www\.discogs\.com\/search\/\?q=&style=Rock%20%26%20Roll$/);
        // A q search keeps the key it always had (its cached records stay).
        expect(r.q).toMatch(/\|ext:dgsearch:https:\/\/www\.discogs\.com\/search\/\?q=Columbia&type=label$/);
        expect(r.none, 'no query, no filter: not a search the reader takes').toBeNull();
        const btn = page.locator('#mb-dg-root button[data-label="Show all results"]');
        await btn.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await apiLog(page))[0]).toBe(FACETS_URL(decade, 1));
    });
});
