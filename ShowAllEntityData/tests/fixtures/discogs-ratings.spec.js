'use strict';

// discogs.com, 2026-10-19: pageType dg-ratings — a user's rated releases
// (`/users/ratings/<name>`), plain HTML without #app and not in the API, the
// rows read from these pages on discogs.com itself (same-origin fetch(), the
// browser's session), 250 a page in the "Text With Covers" layout.
// Fixtures: scripts/build-discogs-fixtures.py (dg-user-ratings.html from
// debug/discogs-user-ratings.html; dg-user-ratings-300.html, the same page
// saying "of 300": SYNTHETIC, for the page count). See docs/claude/discogs.md.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const RATINGS = 'https://www.discogs.com/users/ratings/vzell?limit=250&page=1';
const PAGE = (p, base = RATINGS) => {
    const u = new URL(base);
    u.searchParams.set('limit', '250');
    u.searchParams.set('page', String(p));
    u.searchParams.set('layout', 'med');
    return u.href;
};

/**
 * Loads a ratings page fixture with the userscript: the network aborted but
 * i.discogs.com's images (a pixel) and the ratings pages the button asks
 * for (`layout=med`: never the live page's own URL), each served the saved
 * page and logged.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url?: string, file?: string, served?: function(string): string}} [opts] - `served`: a page URL → the fixture to answer with.
 * @returns {Promise<{errors: string[], asked: string[]}>}
 */
async function openRatings(page, { url = RATINGS, file = 'dg-user-ratings.html', served = () => 'dg-user-ratings.html', importer = false, settings = {} } = {}) {
    const errors = [];
    const asked = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.route(/^https:\/\/www\.discogs\.com\/users\/ratings\/[^/?#]+\?.*layout=med/, (route) => {
        asked.push(route.request().url());
        return route.fulfill({ path: path.join(__dirname, served(route.request().url())), contentType: 'text/html' });
    });
    if (importer) {
        // murdos' importer, simulated by its cache key (nothing cached for
        // these releases), and MusicBrainz's /ws/2/url from MB_RELATIONS, as
        // discogs-mb-column.spec.js does.
        await page.context().addInitScript(([rels, key]) => {
            if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({}));
            window.__gmXhrResponder = (opts) => {
                const u = new URL(opts.url);
                if (u.origin !== 'https://musicbrainz.org' || u.pathname !== '/ws/2/url') return undefined;
                const all = u.searchParams.getAll('resource');
                const urls = all.filter(x => rels[x]).map(x => ({ id: 'u', resource: x, relations: rels[x] }));
                if (all.length === 1 && !urls.length) return { status: 404, responseText: '{"error":"Not Found"}' };
                const body = all.length === 1 ? urls[0] : { 'url-count': urls.length, 'url-offset': 0, urls };
                return { status: 200, responseHeaders: 'Content-Type: application/json', responseText: JSON.stringify(body) };
            };
        }, [MB_RELATIONS, 'DISCOGS_MBLINKS_CACHE-v3.1']);
    }
    await loadUserscriptPage(page, {
        url, fixtureFile: path.join(__dirname, file), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000, ...settings },
    });
    return { errors, asked };
}

// MusicBrainz knows the second rated release only (Rocks vol.1).
const MB_REL = '4c7e5f1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
const MB_RELATIONS = {
    'https://www.discogs.com/release/9953802': [{ 'target-type': 'release', type: 'discogs', ended: false, release: { id: MB_REL } }],
};

/**
 * Presses "Show all ratings" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} The table.
 */
async function showAll(page) {
    await page.locator('#mb-dg-root button[data-label="Show all ratings"]').click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.locator('#mb-dg-root table.tbl').first();
}

const heads = (table) => table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));

/**
 * The text of one column, every row in order.
 *
 * @param {import('@playwright/test').Locator} table
 * @param {string} col
 * @returns {Promise<string[]>}
 */
async function column(table, col) {
    const i = (await heads(table)).indexOf(col);
    return table.locator('tbody > tr').evaluateAll((trs, k) => trs.map(tr => tr.cells[k].textContent.replace(/\s+/g, ' ').trim()), i);
}

test.describe('discogs.com: a user\'s ratings (dg-ratings, 2026-10-19)', () => {
    test('the page: our section first, the user\'s name, one button that asks nothing before the press', async ({ page }) => {
        const { errors, asked } = await openRatings(page);
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('vzell');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        await expect(root.locator('button[data-label="Show all ratings"]')).toHaveAttribute('title', /All 2 rated releases.*1 request/);
        expect(asked, 'nothing asked before the press').toEqual([]);
        expect(errors).toEqual([]);
    });

    test('the rows: every column read from Discogs\' row — links absolute, Cat# "none" dropped, the rating a number', async ({ page }) => {
        const { errors, asked } = await openRatings(page);
        const table = await showAll(page);
        expect(asked).toEqual([PAGE(1)]);
        await expect(page.locator('#mb-dg-root h2.mb-dg-list-heading')).toContainText('Ratings');
        expect(await heads(table)).toEqual(expect.arrayContaining(['Image', 'Artist', 'Title', 'Format', 'Label', 'Cat#', 'Year', 'Rating', 'Data quality']));
        await expect(table.locator('tbody > tr')).toHaveCount(2);
        expect(await column(table, 'Artist')).toEqual(['MGV Drabenderhöhe', 'Bruce Springsteen']);
        expect(await column(table, 'Title')).toEqual(['120 Jahre Männergesangverein Drabenderhöhe', 'Rocks vol.1 (1973-1982)']);
        expect(await column(table, 'Label')).toEqual(['Not On Label (MGV Drabenderhöhe Self-released)', 'Sony Records Int\'l']);
        expect(await column(table, 'Cat#'), 'Discogs\' "none" is no number').toEqual(['', '']);
        expect(await column(table, 'Format')).toEqual(['CD', 'CDr, Comp, Promo, Smplr']);
        expect(await column(table, 'Year')).toEqual(['2007', '2005']);
        expect(await column(table, 'Rating')).toEqual(['5', '4']);
        expect(await column(table, 'Data quality')).toEqual(['New Submission', 'New Submission']);
        // Links absolute (a link preview target), the thumbnail Discogs' own.
        const row = table.locator('tbody > tr').nth(1);
        await expect(row.locator('a[href="https://www.discogs.com/artist/219986-Bruce-Springsteen"]')).toHaveCount(1);
        await expect(row.locator('a[href="https://www.discogs.com/release/9953802-Bruce-Springsteen-Rocks-vol1-1973-1982"]')).toHaveCount(1);
        await expect(row.locator('a[href="https://www.discogs.com/label/262232-Sony-Records-Intl"]')).toHaveCount(1);
        await expect(row.locator('img.mb-dg-thumb')).toHaveAttribute('src', /^https:\/\/i\.discogs\.com\/zGsh-/);
        expect(errors).toEqual([]);
    });

    test('Rating sorts as a number, both ways', async ({ page }) => {
        await openRatings(page);
        const table = await showAll(page);
        const sort = async (glyph) => {
            const btn = table.locator('thead th[data-col-name="Rating"] .sort-icon-btn', { hasText: glyph }).first();
            await waitForSortSettled(page, () => btn.click());
        };
        await sort('▲');
        expect(await column(table, 'Rating')).toEqual(['4', '5']);
        await sort('▼');
        expect(await column(table, 'Rating')).toEqual(['5', '4']);
    });

    test('300 ratings: two pages of 250, in order, with the page\'s own sort kept', async ({ page }) => {
        const url = 'https://www.discogs.com/users/ratings/vzell?sort=rating&sort_order=desc';
        const { errors, asked } = await openRatings(page, { url, file: 'dg-user-ratings-300.html' });
        await expect(page.locator('#mb-dg-root button[data-label="Show all ratings"]')).toHaveAttribute('title', /All 300 rated releases.*2 requests/);
        const table = await showAll(page);
        expect(asked).toEqual([PAGE(1, url), PAGE(2, url)]);
        expect(asked.every(u => /[?&]sort=rating&sort_order=desc&/.test(u))).toBe(true);
        await expect(table.locator('tbody > tr')).toHaveCount(4);
        expect(errors).toEqual([]);
    });

    test('a page that is not the list (a sign-in page): that page FAILS, said out loud, not taken as no rows; page 1 renders', async ({ page }) => {
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        const url = 'https://www.discogs.com/users/ratings/vzell';
        const { asked } = await openRatings(page, {
            url, file: 'dg-user-ratings-300.html',
            served: (u) => (/[?&]page=2&/.test(u) ? 'dg-challenge.html' : 'dg-user-ratings.html'),
        });
        const table = await showAll(page);
        expect(asked).toHaveLength(2);
        await expect(table.locator('tbody > tr')).toHaveCount(2);
        expect(logs.some((t) => /not with a list of ratings/.test(t)), 'the failure is logged with its reason').toBe(true);
    });

    test('Picard: the column is there before any MusicBrainz answer; opened, a row gets its ♪ when the answer arrives (vzell 2026-10-19)', async ({ page }) => {
        // Pins: the column EXISTS from the render on (master and release
        // pages had it only from the importer's cache), and an OPEN column
        // takes a late answer without another render. Automatic lookups off,
        // so the answer comes exactly when ▶ MB is pressed.
        const { errors } = await openRatings(page, { importer: true, settings: { sa_dg_mb_auto_lookup: false } });
        const table = await showAll(page);
        await expect(table.locator('thead th.mb-picard-th').first()).toBeAttached();
        await expect(table.locator('tbody td.mb-picard-cell')).toHaveCount(2);
        await table.locator('thead .mb-picard-col-hdr-btn').click();
        await expect(table.locator('button.mb-picard-btn'), 'nothing known yet').toHaveCount(0);
        await page.locator('.mb-dgmb-col-hdr-btn').first().click();
        await expect(table.locator('td.mb-dg-mb-cell a.mb-dg-mb-link')).toHaveCount(1);
        const rows = table.locator('tbody > tr');
        await expect(rows.nth(1).locator('td.mb-picard-cell button.mb-picard-btn')).toHaveCount(1);
        await expect(rows.nth(0).locator('td.mb-picard-cell button.mb-picard-btn'), 'no MusicBrainz release, no ♪').toHaveCount(0);
        // The button names the release by its Discogs title (the link is an icon).
        await expect(rows.nth(1).locator('button.mb-picard-btn')).toHaveAttribute('title', /Rocks vol\.1 \(1973-1982\) — release/);
        expect(errors).toEqual([]);
    });

    test('Picard on discogs.com sends MusicBrainz\'s release page as the resource, never Discogs\'', async ({ page }) => {
        await openRatings(page);
        const url = await page.evaluate((g) => window.__saTest.picardTaggerUrl('release', g), MB_REL);
        expect(new URL(url).searchParams.get('resource')).toBe(`https://musicbrainz.org/release/${MB_REL}`);
        expect(new URL(url).searchParams.get('id')).toBe(MB_REL);
    });

    test('a thumbnail opens the artwork viewer on that row', async ({ page }) => {
        await openRatings(page);
        const table = await showAll(page);
        await table.locator('tbody > tr').first().locator('a.mb-dg-thumblink').click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
    });
});
