'use strict';

// A Discogs master's Tracks view (dg-master's first button, 2026-11-04;
// org/discogs.org, "the discogs master release PT"): the master as a
// release's Tracks view shows a release — a sub-table per disc or record, the
// credits as role columns, its videos under the tracks — and above them
// Notes, Details (Master release with the number of versions, External
// links, Genres and styles, Community in two columns; Credits by person on
// the right) and Images. vzell's answers the same day: Credits by person,
// the count in the head (by setting, `sa_dg_master_versions_count`),
// Community grouped, the videos under the tracks. The shapes come from
// scripts/probe-dg-master-shapes.py (24 masters); the fixtures beyond Born
// To Run (26725) were saved by it and wrapped by
// scripts/wrap-dg-release-fixtures.py.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const API = 'https://api.discogs.com/';
const ALL = answers('discogs-master', 'discogs-master-1123030', 'discogs-master-203805', 'discogs-master-27194',
    'discogs-master-1123030-versions-p1', ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`));
const BTR = 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run';
const master = id => `https://www.discogs.com/master/${id}-x`;
const VERSIONS_P1 = id => `${API}masters/${id}/versions?per_page=100&page=1`;

/**
 * Loads a master page fixture (Discogs' page shell, under the URL of the
 * master asked for) with the API answered from the fixtures, images as a
 * pixel, everything else aborted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [url]
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function openMaster(page, url = BTR, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, ALL);
    await loadUserscriptPage(page, {
        url, fixtureFile: path.join(__dirname, 'dg-master.html'), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    return errors;
}

/**
 * Discogs' own Statistics and For Sale boxes of the master's page, as its
 * page renders them (debug/discogs-master.html, saved 2026-10-17): the
 * master's API answer has neither.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function addPageBoxes(page) {
    await page.evaluate(() => {
        const li = (name, val) => `<li><span class="name_npjJD">${name}<!-- -->:</span>${val}</li>`;
        document.querySelector('#app main').insertAdjacentHTML('beforeend',
            '<aside><div data-testid="shopping-box-slot"><div id="shopping-box-host"><h2>For Sale<a href="https://www.discogs.com/sell">Sell a copy</a></h2>' +
            '<div class="shopping-box-top-formats"><p class="shopping-box-copy"><a href="https://www.discogs.com/sell/list?master_id=26725&amp;format=Vinyl">Vinyl</a> • ' +
            '<a href="https://www.discogs.com/sell/list?master_id=26725&amp;format=CD">CD</a> • <a href="https://www.discogs.com/sell/list?master_id=26725&amp;format=DVD">DVD</a></p></div>' +
            '<div class="shopping-box-price" data-testid="shopping-box-price"><p class="shopping-box-copy">From €1 to €4,000</p></div>' +
            '<a href="https://www.discogs.com/sell/list?master_id=26725" class="shopping-box-green-cta">Shop 3,064 Listings</a></div></div></aside>' +
            '<aside><section id="master-statistics"><header><h2>Statistics</h2></header><div class="content_ETGfR"><div class="items_gohjf"><ul>' +
            li('Have', '<a href="/master/stats/26725#collection">160081</a>') + li('Want', '<a href="/master/stats/26725#wantlist">84131</a>') +
            '</ul></div><div class="items_gohjf"><ul>' + li('Avg Rating', '<span>4.42<!-- --> / 5</span>') +
            li('Ratings', '<a href="/master/stats/26725#total">11245</a>') + '</ul></div></div></section></aside>');
    });
}

/**
 * Presses a toolbar button of our section and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.locator(`#mb-dg-root button[data-label="${label}"]`).click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('#mb-dg-root h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));
// The requests to Discogs' API so far.
const apiLog = (page) => page.evaluate(api => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith(api)), API);
// A table's header names.
const heads = (table) => table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
// The data tables of our section, in order.
const tables = (page) => page.locator('#mb-dg-root table.tbl');

/**
 * The `<li>` texts of one cell (row by its # value, column by name).
 *
 * @param {import('@playwright/test').Locator} table
 * @param {string} pos
 * @param {string} col
 * @returns {Promise<string[]>}
 */
async function items(table, pos, col) {
    const i = (await heads(table)).indexOf(col);
    if (i < 0) return [];
    return table.locator('tbody > tr').filter({ has: table.page().locator(`td:first-child:text-is("${pos}")`) })
        .locator(':scope > td').nth(i).locator('li').evaluateAll(lis => lis.map(li => li.textContent.replace(/\s+/g, ' ').trim()));
}

test.describe('Discogs master: the Tracks view, as a release\'s (2026-11-04)', () => {
    test('Born To Run: the master and its versions page 1; one record; the credits as columns; the videos under the tracks', async ({ page }) => {
        const errors = await openMaster(page);
        await expect(page.locator('#mb-dg-root button[data-label]')).toHaveText([/Tracks|Show all tracks/, /Versions|Show all versions/]);
        await press(page, 'Show all tracks');
        expect(await apiLog(page), 'the master, then versions page 1 for the count').toEqual([`${API}masters/26725`, VERSIONS_P1(26725)]);
        await expect(page.locator('#mb-dg-root h2.mb-dg-list-heading')).toContainText('Tracklist');
        // A1…B4 is one record of two sides (no format on a master: named by
        // its positions); then the videos.
        expect(await h3s(page)).toEqual(['Record 1 · 39:20', 'Videos']);
        const t = tables(page).first();
        // A master has no release-wide credits: no Producer, no Release credits.
        expect(await heads(t)).toEqual(['#', 'Title', 'Length', 'Instruments', 'Vocals', 'Engineer', 'Arranged by', 'Other credits']);
        await expect(t.locator('tbody > tr')).toHaveCount(8);
        expect(await items(t, 'A1', 'Vocals')).toEqual(['Backing Vocals – Mike Appel', 'Backing Vocals – Steve Van Zandt',
            'Backing Vocals – Roy Bittan', 'Vocals – Bruce Springsteen']);
        expect(await items(t, 'B1', 'Engineer')).toEqual(['Louis Lahav']);
        // Credited as "Charles Calello" there (the name variation, as the
        // release view shows it).
        expect(await items(t, 'B4', 'Arranged by')).toEqual(['Charles Calello (Strings)']);
        const videos = tables(page).nth(1);
        await expect(videos.locator('tbody > tr')).toHaveCount(3);
        await expect(videos).toContainText('Born to Run');
        expect(errors).toEqual([]);
    });

    test('Born To Run: the head — subheader, Notes (closed), Details (Master release with versions, Community in two columns, Credits by person), Images', async ({ page }) => {
        const errors = await openMaster(page);
        await addPageBoxes(page);
        await press(page, 'Show all tracks');
        await expect(page.locator('#mb-dg-root > h1 + p.mb-fd-sub')).toHaveText('~ Master release by Bruce Springsteen (1975)');
        const head = page.locator('#mb-dg-root .mb-fd-head');
        await expect(head.locator(':scope > h2.mb-fd-h2')).toHaveText([/Notes$/, /Details \(\d+\)$/, /Images \(7\)$/]);
        await expect(head.locator('.mb-fd-text')).toBeHidden();
        const card = name => head.locator('.mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) });
        const names = col => head.locator(`.mb-sb-${col} .mb-sb-card-head > span:first-child`).allTextContents();
        expect(await names('rail')).toEqual(['Master release', 'External links', 'Genres and styles', 'Community']);
        expect(await names('main')).toEqual(['Credits']);

        // Master release: the year, the main release ★, the newest, the count
        // of versions page 1 gave (387).
        const mr = card('Master release');
        await expect(mr.locator('dt')).toHaveText(['Year', 'Main release', 'Newest release', 'Versions']);
        await expect(mr.locator('dd a', { hasText: 'release 13896528' })).toHaveAttribute('href', 'https://www.discogs.com/release/13896528');
        await expect(mr.locator('.mb-dg-main')).toHaveText(/★/);
        await expect(mr).toContainText('Versions387');
        await expect(card('External links').locator('a')).toHaveText(['Master', 'History', 'Main release', 'Newest release']);
        await expect(card('Genres and styles').locator('.mb-sb-pill')).toHaveText(['Rock', 'Pop Rock', 'Rock & Roll']);

        // Community: Discogs' Statistics and For Sale boxes, read from the page
        // (the API has neither), in two columns, grouped.
        const comm = card('Community');
        const dls = comm.locator('.mb-fd-2col > dl.mb-fd-kv');
        await expect(dls).toHaveCount(2);
        await expect(dls.first().locator('dt')).toHaveText(['Have', 'Want', 'Avg rating', 'Ratings', 'Data quality']);
        await expect(dls.nth(1).locator('dt')).toHaveText(['For sale', 'Prices', 'Formats']);
        await expect(comm.locator('dd a', { hasText: '160,081' })).toHaveAttribute('href', /\/master\/stats\/26725#collection$/);
        await expect(comm.locator('dd a', { hasText: '11,245' })).toHaveAttribute('href', /\/master\/stats\/26725#total$/);
        await expect(comm).toContainText('Avg rating4.42 / 5');
        await expect(comm).toContainText('Data qualityCorrect');
        await expect(comm.locator('dd a', { hasText: '3,064' })).toHaveAttribute('href', 'https://www.discogs.com/sell/list?master_id=26725');
        await expect(comm).toContainText('Prices€1 – €4,000');
        await expect(dls.nth(1).locator('dd').last().locator('a')).toHaveText(['Vinyl', 'CD', 'DVD']);

        // Credits by person: the most tracks first; a person's roles on the
        // same tracks joined, each with its tracks as runs.
        const cr = card('Credits');
        await expect(cr.locator('.mb-sb-card-count')).toHaveText('17');
        await expect(cr.locator('dt').first()).toHaveText('Bruce Springsteen');
        await expect(cr.locator('dt a').first()).toHaveAttribute('href', 'https://www.discogs.com/artist/219986');
        await expect(cr.locator('dd').first()).toHaveText('Guitar A1–B2, B4 · Vocals A1–B4 · Harmonica A1');
        await expect(cr.locator('dt', { hasText: 'Charles Calello' }).locator('xpath=following-sibling::dd[1]'))
            .toHaveText('Arranged By [Strings], Conductor [Strings] B4');

        const tiles = head.locator('.mb-fd-art figure.mb-release-art-tile');
        await expect(tiles).toHaveCount(7);
        await tiles.first().locator('a').click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('the number of versions off (sa_dg_master_versions_count): one request, no Versions row', async ({ page }) => {
        await openMaster(page, BTR, { sa_dg_master_versions_count: false });
        await press(page, 'Show all tracks');
        expect(await apiLog(page)).toEqual([`${API}masters/26725`]);
        const head = page.locator('#mb-dg-root .mb-fd-head');
        const mr = head.locator('.mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Master release/ }) });
        await expect(mr.locator('dt')).toHaveText(['Year', 'Main release', 'Newest release']);
        // Without the page's boxes, Community holds what the answer has.
        const comm = head.locator('.mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: /^Community/ }) });
        await expect(comm.locator('dt')).toHaveText(['Data quality', 'For sale']);
    });

    test('a two-disc master named by its headings; a medley\'s parts stay one table; a double album is two records', async ({ page }) => {
        await openMaster(page, master(1123030));
        await press(page, 'Show all tracks');
        // Human Touch & Lucky Town: "1-1".."2-10", each disc under its heading.
        expect((await h3s(page)).map(h => h.replace(/ · \d+:\d\d(:\d\d)?$/, ''))).toEqual(['Disc 1 · Human Touch', 'Disc 2 · Lucky Town']);
        await expect(tables(page).nth(0).locator('tbody > tr')).toHaveCount(14);
        await expect(tables(page).nth(1).locator('tbody > tr')).toHaveCount(10);
        await expect(page.locator('#mb-dg-root .mb-fd-head .mb-sb-card', { hasText: /^Master release/ })).toContainText('Versions5');

        // The Very Best Of Stars On 45: "1a".."13x", 159 parts of 13 medleys
        // (147 tables before the fix), one table with a Section per heading.
        await openMaster(page, master(203805), { sa_dg_master_versions_count: false });
        await press(page, 'Show all tracks');
        expect((await h3s(page)).filter(h => h !== 'Videos')).toHaveLength(1);
        const t = tables(page).first();
        expect(await heads(t)).toContain('Section');
        await expect(t.locator('tbody > tr')).toHaveCount(159);

        // The River: four sides, two records.
        await openMaster(page, master(27194), { sa_dg_master_versions_count: false });
        await press(page, 'Show all tracks');
        expect((await h3s(page)).filter(h => h.startsWith('Record'))).toHaveLength(2);
    });

    test('Versions, the second button: today\'s rows under one "Versions" sub-table; no head', async ({ page }) => {
        await openMaster(page);
        await press(page, 'Show all versions');
        expect(await h3s(page)).toEqual(['Versions']);
        await expect(tables(page).first().locator('tbody > tr')).toHaveCount(387);
        await expect(page.locator('#mb-dg-root .mb-fd-head')).toHaveCount(0);
        await expect(page.locator('#mb-dg-root p.mb-fd-sub')).toHaveCount(0);
    });
});
