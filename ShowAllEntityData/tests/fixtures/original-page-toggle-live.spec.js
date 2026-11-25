'use strict';

// The switch between our tables and the original page on the sites whose own
// page stays LIVE below our section (vzell, 2026-11-25; org/majkinetor.org,
// "Switch between SAED's view and the original page (EH's V)", phase 3):
// discogs.com, archive.org, setlist.fm. Properties pinned:
//   - before a press the site's page is untouched (nothing hidden);
//   - after a render only the table view shows: the site's page and footer
//     hide; the site's header stays ONLY where it sits above our section
//     (a Discogs master page); where our section is first in <body>
//     (archive.org, setlist.fm) the header hides with the page (vzell's two
//     answers, 2026-11-25);
//   - the switch (☰ row, Ctrl+M P) shows the site's page, live, with the
//     "Live" note, and hides our section; "Back to the tables" brings our
//     section back with its rows;
//   - no copy is taken there (the page is still live).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
/** Captures as GM stub answers, by URL. */
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const ROW = '#mb-orig-view-btn';
const BACK = '#mb-orig-back-btn';
const NOTE = '#mb-orig-live-note';

/**
 * Whether each selector's first match is laid out (visible).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, string>} sels - Name → selector.
 * @returns {Promise<Object<string, boolean>>}
 */
const shown = (page, sels) => page.evaluate((s) => Object.fromEntries(Object.entries(s).map(([k, sel]) => {
    const el = document.querySelector(sel);
    return [k, !!el && el.getClientRects().length > 0];
})), sels);

/**
 * Ctrl+M, then P, with no field focused.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function switchByKey(page) {
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.keyboard.press('Control+M');
    await page.keyboard.press('p');
}

test.describe('the original page on discogs.com', () => {
    const PARTS = { ours: '#mb-dg-root', header: '[id^="__header_root_"]', app: '#app', footer: '#esi-footer-root', note: NOTE, back: BACK };

    test('a master page: the header above our section stays, Discogs\' page and footer hide, and the switch shows them live', async ({ page }) => {
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, answers('discogs-master', ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`)));
        await loadUserscriptPage(page, {
            url: 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run', fixtureFile: path.join(__dirname, 'dg-master.html'), testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000 },
        });
        // Pins: the initial page is left alone.
        expect(await shown(page, PARTS)).toEqual({ ours: true, header: true, app: true, footer: true, note: false, back: false });
        expect(await page.locator(ROW).count()).toBe(0);

        await page.locator('#mb-dg-root button[data-label="Show all tracks"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, PARTS)).toEqual({ ours: true, header: true, app: false, footer: false, note: false, back: false });

        await clickToolbarItem(page, ROW);
        expect(await shown(page, PARTS)).toEqual({ ours: false, header: true, app: true, footer: true, note: true, back: true });
        await expect(page.locator(NOTE)).toContainText('Discogs’ own page, as the site drew it');
        // No copy on a live site.
        expect(await page.locator('[data-mb-orig-copy]').count()).toBe(0);

        await page.locator(BACK).click();
        expect(await shown(page, PARTS)).toEqual({ ours: true, header: true, app: false, footer: false, note: false, back: false });
        expect(await page.locator('#mb-dg-root table.tbl tbody tr').count()).toBeGreaterThan(0);
    });

    test('a search page: our section comes first, so Discogs\' header after it hides with <main>', async ({ page }) => {
        const f = FX('discogs-search-springsteen-all-p1');
        const d = JSON.parse(f.body);
        d.pagination.pages = 1;
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, {
            'https://api.discogs.com/database/search?q=bruce%20springsteen&per_page=100&page=1':
                { status: 200, responseHeaders: `Content-Type: ${f.contentType}`, responseText: JSON.stringify(d) },
        });
        await loadUserscriptPage(page, {
            url: 'https://www.discogs.com/search?q=bruce+springsteen&type=all', fixtureFile: path.join(__dirname, 'dg-search.html'), testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
        });
        const SEARCH = { ours: '#mb-dg-root', header: '[id^="__header_root_"]', main: 'body > main', footer: '#esi-footer-root' };
        // Pins the layout this rule rests on: our section before the header.
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        expect(await shown(page, SEARCH)).toEqual({ ours: true, header: true, main: true, footer: true });
        await page.locator('#mb-dg-root button[data-label="Show all results"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, SEARCH)).toEqual({ ours: true, header: false, main: false, footer: false });
        await switchByKey(page);
        expect(await shown(page, SEARCH)).toEqual({ ours: false, header: true, main: true, footer: true });
    });

    // vzell, 2026-11-25 (debug/d-search-ctrlmp-bug.html): the LIVE search
    // page wraps header and <main> in a div.flex and adds an iframe, Next's
    // route announcer and the cookie banner root; rules naming <main> hid
    // nothing there. Fixture: scripts/make-live-shape-fixtures.py.
    test('the live search page\'s shape: whatever follows our section hides, whatever its names', async ({ page }) => {
        const f = FX('discogs-search-springsteen-all-p1');
        const d = JSON.parse(f.body);
        d.pagination.pages = 1;
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, {
            'https://api.discogs.com/database/search?q=bruce%20springsteen&per_page=100&page=1':
                { status: 200, responseHeaders: `Content-Type: ${f.contentType}`, responseText: JSON.stringify(d) },
        });
        await loadUserscriptPage(page, {
            url: 'https://www.discogs.com/search?q=bruce+springsteen&type=all', fixtureFile: path.join(__dirname, 'dg-search-next.html'), testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
        });
        const NEXT = { ours: '#mb-dg-root', wrap: 'body > div.flex', header: '[id^="__header_root_"]', banner: '#onetrust-consent-sdk' };
        await page.evaluate(() => { document.getElementById('onetrust-consent-sdk').style.minHeight = '10px'; });
        expect(await shown(page, NEXT)).toEqual({ ours: true, wrap: true, header: true, banner: true });
        await page.locator('#mb-dg-root button[data-label="Show all results"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, NEXT)).toEqual({ ours: true, wrap: false, header: false, banner: false });
        // Pins: our own floating hosts are never the site's.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('body > [data-mb-site]'))
            .filter((el) => /^mbu?-/.test(el.id)).length)).toBe(0);
        await switchByKey(page);
        expect(await shown(page, NEXT)).toEqual({ ours: false, wrap: true, header: true, banner: true });
    });

    test('an older page (#main_wrapper: header and page together) hides whole, and comes back whole', async ({ page }) => {
        const file = path.join(__dirname, 'dg-submissions-flat.html');
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route(/^https:\/\/www\.discogs\.com\/submissions\?.*view=flat/, (route) => route.fulfill({ path: file, contentType: 'text/html' }));
        await loadUserscriptPage(page, {
            url: 'https://www.discogs.com/submissions?mode=list&id=599283&view=flat', fixtureFile: file, testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
        });
        const OLD = { ours: '#mb-dg-root', wrapper: '#main_wrapper', footer: '#esi-footer-root' };
        expect(await shown(page, OLD)).toMatchObject({ ours: true, wrapper: true });
        await page.locator('#mb-dg-root button[data-label="Show all submissions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, OLD)).toEqual({ ours: true, wrapper: false, footer: false });
        await clickToolbarItem(page, ROW);
        expect(await shown(page, OLD)).toMatchObject({ ours: false, wrapper: true });
    });
});

test.describe('the original page on archive.org', () => {
    test('a search page: the whole app shell hides after the render; Ctrl+M P shows it, live', async ({ page }) => {
        const search = FX('ia-search-1975-p1');
        const titles = FX('ia-colltitles-1975-p1');
        const resp = Object.fromEntries([search, titles].map((f) => [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }]));
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, resp);
        await loadUserscriptPage(page, {
            url: 'https://archive.org/search?query=subject%3A%22Bruce+Springsteen%22&sort=title&and%5B%5D=year%3A%221975%22',
            fixtureFile: path.join(__dirname, 'ia-search.html'), testMode: true,
            settingsOverride: { sa_enable_internetarchive: true, sa_render_threshold: 100000 },
        });
        const PARTS = { ours: '#mb-ia-root', app: 'app-root', note: NOTE, back: BACK };
        // app-root draws into shadow DOM; in the fixture it has no size of its own.
        await page.evaluate(() => { document.querySelector('app-root').style.cssText = 'display:block;min-height:40px'; });
        expect(await shown(page, PARTS)).toEqual({ ours: true, app: true, note: false, back: false });
        await page.locator('#mb-ia-root button[data-label="Show all items"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, PARTS)).toEqual({ ours: true, app: false, note: false, back: false });

        await switchByKey(page);
        expect(await shown(page, PARTS)).toEqual({ ours: false, app: true, note: true, back: true });
        await expect(page.locator(NOTE)).toContainText('archive.org’s own page');
        await switchByKey(page);
        expect(await shown(page, PARTS)).toEqual({ ours: true, app: false, note: false, back: false });
    });

    test('an item page: its top bar and content hide after the render, and come back with the switch', async ({ page }) => {
        const id = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16';
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, answers(`ia-metadata-${id}`));
        await loadUserscriptPage(page, {
            url: `https://archive.org/details/${id}`, fixtureFile: path.join(__dirname, 'ia-details.html'), testMode: true,
            settingsOverride: { sa_enable_internetarchive: true, sa_render_threshold: 100000 },
        });
        await page.route('https://archive.org/download/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        const PARTS = { ours: '#mb-ia-root', topnav: '#topnav', main: 'main#maincontent' };
        await page.evaluate(() => { const t = document.getElementById('topnav'); if (t && !t.getClientRects().length) t.style.minHeight = '20px'; });
        expect(await shown(page, PARTS)).toEqual({ ours: true, topnav: true, main: true });
        await page.locator('#mb-ia-root button[data-label="Show all tracks"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, PARTS)).toEqual({ ours: true, topnav: false, main: false });
        await clickToolbarItem(page, ROW);
        expect(await shown(page, PARTS)).toEqual({ ours: false, topnav: true, main: true });
    });
});

// vzell, 2026-11-25 (debug/ia-release-ctrlmp-bug.html): the LIVE item page
// holds top bar and content in div#wrap, beside overlays; rules naming
// #topnav/main hid nothing there. Fixture: scripts/make-live-shape-fixtures.py.
test.describe('the original page on archive.org, as the live item page is built', () => {
    test('div#wrap and its neighbours hide after the render, and come back with the switch', async ({ page }) => {
        const id = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16';
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, answers(`ia-metadata-${id}`));
        await loadUserscriptPage(page, {
            url: `https://archive.org/details/${id}`, fixtureFile: path.join(__dirname, 'ia-details-wrap.html'), testMode: true,
            settingsOverride: { sa_enable_internetarchive: true, sa_render_threshold: 100000 },
        });
        await page.route('https://archive.org/download/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        const WRAP = { ours: '#mb-ia-root', wrap: 'body > div#wrap', skip: 'body > a.hidden-for-screen-readers', root: '#fc-root' };
        await page.evaluate(() => { document.getElementById('fc-root').style.minHeight = '10px'; });
        expect(await shown(page, WRAP)).toEqual({ ours: true, wrap: true, skip: true, root: true });
        await page.locator('#mb-ia-root button[data-label="Show all tracks"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, WRAP)).toEqual({ ours: true, wrap: false, skip: false, root: false });
        await switchByKey(page);
        expect(await shown(page, WRAP)).toEqual({ ours: false, wrap: true, skip: true, root: true });
    });
});

test.describe('the original page on setlist.fm', () => {
    test('a venue page: setlist.fm\'s page (its header with it) hides after the render, and the switch shows it', async ({ page }) => {
        const file = path.join(__dirname, 'sfm-page-venue-53d30b75.html');
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route((u) => u.hostname === 'www.setlist.fm' && u.pathname === '/venue/private-venue-colts-neck-nj-usa-53d30b75.html',
            (route) => route.fulfill({ path: file, contentType: 'text/html; charset=utf-8' }));
        await loadUserscriptPage(page, {
            url: 'https://www.setlist.fm/venue/private-venue-colts-neck-nj-usa-53d30b75.html?page=1', fixtureFile: file, testMode: true,
            settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_setlistfm: true, sa_render_threshold: 100000 },
        });
        const PARTS = { ours: '#mb-sfm-root', site: 'body > div.body', header: 'div.body > div.header', note: NOTE, back: BACK };
        expect(await shown(page, PARTS)).toMatchObject({ ours: true, site: true, note: false, back: false });
        await page.click('#mb-sfm-root button[data-label="Show all setlists of this venue"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await shown(page, PARTS)).toEqual({ ours: true, site: false, header: false, note: false, back: false });

        await clickToolbarItem(page, ROW);
        expect(await shown(page, PARTS)).toMatchObject({ ours: false, site: true, note: true, back: true });
        await expect(page.locator(NOTE)).toContainText('setlist.fm’s own page');
        await page.locator(BACK).click();
        expect(await shown(page, PARTS)).toMatchObject({ ours: true, site: false, back: false });
        expect(await page.locator('#mb-sfm-root table.tbl tbody tr').count()).toBeGreaterThan(0);
    });
});
