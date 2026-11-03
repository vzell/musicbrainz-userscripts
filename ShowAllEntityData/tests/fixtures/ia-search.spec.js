'use strict';

// archive.org's search page as pageType `ia-search` (2026-10-31,
// org/internet.archive.org, mockup https://claude.ai/artifact/4aXkdPxudwhuzACj4Wg81C
// view 1; docs/claude/internet-archive.md). The page is a web-component
// shell (<app-root>, no rows in its HTML): our section goes before it, and
// the rows come from the Internet Archive's search API, 100 a request,
// first by date. The answers are real captures (scripts/build-ia-fixtures.py
// → tests/fixtures/ext-ia-search-*.json), keyed by the exact URL the
// script builds.
//
// Pins: the switch; one button, none for a full-text search; nothing asked
// before the press; page 1 asked once (it is the page count); a second page
// when there is one; the columns and a known row's cells (venue, source,
// favorites from `num_favorites`, size in MB, collections without users'
// favorites); the rows first by date; a title's card and window on
// archive.org itself (the `iadetails` reader); the Art column's hover
// card and viewer (`_IA_FI`, vzell 2026-11-01: "looks good, except image
// hovering"): the item's own pictures, a cover first, or a video's stills,
// from ONE metadata request shared with the title's card.
// Mutations: scripts/mutations/internet-archive.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FILE = path.join(__dirname, 'ia-search.html');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const S1975 = 'https://archive.org/search?query=subject%3A%22Bruce+Springsteen%22&sort=title&and%5B%5D=year%3A%221975%22';
const S2016 = 'https://archive.org/search?query=subject%3A%22Bruce+Springsteen%22&sort=title&and%5B%5D=year%3A%222016%22';
const SHOW = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * One fixture as the GM stub's answer.
 * @param {Object} f - `{url, status, contentType, body}`.
 * @param {function(Object): Object} [edit] - Changes the parsed body.
 * @returns {[string, Object]}
 */
const answer = (f, edit = null) => [f.url, {
    status: f.status, responseHeaders: `Content-Type: ${f.contentType}`,
    responseText: edit ? JSON.stringify(edit(JSON.parse(f.body))) : f.body,
}];

/**
 * Loads a search page with `responses` as the GM answers; archive.org's own
 * pictures are served locally, nothing else reaches the network.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {Object} responses
 * @param {Object} [settings]
 * @returns {Promise<string[]>} Page errors.
 */
async function open(page, url, responses, settings = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, responses);
    await loadUserscriptPage(page, {
        url, fixtureFile: FILE, testMode: true,
        settingsOverride: { sa_enable_internetarchive: true, sa_render_threshold: 100000, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    // After the load: loadUserscriptPage() aborts every archive.org image
    // with a route of its own, and the newest route wins.
    const png = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    await page.route('https://archive.org/services/img/**', png);
    await page.route('https://archive.org/download/**', png);
    return errors;
}

const apiLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://archive.org/')));

/**
 * The table's column names and every row's cells, by column name.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{heads: string[], rows: Array<Object<string, string>>}>}
 */
const tableData = (page) => page.locator('#mb-ia-root table.tbl').first().evaluate((t) => {
    const heads = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
    const rows = Array.from(t.tBodies[0].rows).map(r => Object.fromEntries(heads.map((h, i) => [h, r.cells[i] ? r.cells[i].textContent.trim() : ''])));
    return { heads, rows };
});

/**
 * The Collection cell of the row whose Title links item `id`: one entry
 * per `ul > li` (the multi-row cell), its link's text, href and target.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<Array<{text: string, href: string, target: string}>>}
 */
const collCell = (page, id) => page.locator('#mb-ia-root table.tbl').first().evaluate((t, ident) => {
    const heads = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
    const ci = heads.indexOf('Collection');
    const tr = Array.from(t.tBodies[0].rows).find(r => r.querySelector(`a[href="https://archive.org/details/${ident}"]`));
    return Array.from(tr.cells[ci].querySelectorAll('ul > li')).map((li) => {
        const a = li.querySelector('a');
        return { text: li.textContent.trim(), href: a ? a.href : '', target: a ? a.target : '' };
    });
}, id);

test.describe('archive.org: a search page (ia-search)', () => {
    test('the shell gets our section and one button; the rows from the search API, 100 a request, first by date', async ({ page }) => {
        const f = FX('ia-search-1975-p1');
        const titles = FX('ia-colltitles-1975-p1');
        const errors = await open(page, S1975, Object.fromEntries([answer(f), answer(titles)]));
        const root = page.locator('#mb-ia-root');
        await expect(root.locator('h1.mb-ia-h1 bdi')).toHaveText('Internet Archive: subject:"Bruce Springsteen" · year:"1975"');
        // Our section is first in <body>, before the site's own shell.
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-ia-root');
        expect(await page.evaluate(() => document.getElementById('mb-ia-root').nextElementSibling.tagName)).toBe('APP-ROOT');
        expect(await root.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.dataset.label))).toEqual(['Show all items']);
        expect(await apiLog(page), 'nothing before the press').toEqual([]);
        await root.locator('button[data-label="Show all items"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // Page 1 once (it is the page count), then ONE request for the
        // titles of its collections (_iaCollTitlesFor()).
        expect(await apiLog(page), 'page 1 once, then its collections\' titles').toEqual([f.url, titles.url]);
        // The request: the page's query and filter, first by date, 100 a page.
        const u = new URL(f.url);
        expect(u.searchParams.get('q')).toBe('(subject:"Bruce Springsteen") AND year:"1975"');
        expect(u.searchParams.getAll('sort[]')).toEqual(['date asc', 'titleSorter asc']);
        expect(u.searchParams.get('rows')).toBe('100');
        const docs = JSON.parse(f.body).response.docs;
        const { heads, rows } = await tableData(page);
        expect(heads.filter(Boolean)).toEqual(['Art', 'Date', 'Title', 'Venue', 'Source', 'Type', 'Views', 'Favorites', 'Reviews', 'Added', 'Size', 'Collection']);
        expect(rows).toHaveLength(docs.length);
        // First by date: no row older than the one above it. An item with
        // two dates shows the earlier, the one the API orders it by.
        const dates = rows.map(r => r.Date);
        expect(rows.find(x => /New York City, NY \(1975-08-15\)/.test(x.Title)).Date).toBe('1974-01-01');
        expect(dates.filter((d, i) => i && d && dates[i - 1] && d < dates[i - 1]), 'dates ascending').toEqual([]);
        // A known row: its venue, source, type, favorites (`num_favorites`),
        // size in whole MB, collections without users' favorites.
        const d = docs.find(x => x.identifier === SHOW);
        const r = rows.find(x => x.Title === d.title);
        expect(r.Venue).toBe(d.venue);
        expect(r.Source).toBe(d.source);
        expect(r.Type).toBe('Audio');
        expect(r.Favorites).toBe(String(d.num_favorites));
        expect(r.Size).toBe(`${Math.round(d.item_size / 1e6).toLocaleString('en-US')} MB`);
        expect(r.Collection).not.toMatch(/fav-/);
        await expect(root.locator(`table.tbl a[href="https://archive.org/details/${SHOW}"]`)).toHaveAttribute('target', '_blank');
        // Its collections (vzell, 2026-11-02, "as on the IP"): one a line
        // (renderMultiRowCell), each a link to its page in a new tab, named
        // by archive.org's own title, as the item page names it — not the
        // id, and "Folksoundomy", not our old "Community Audio".
        const coll = await collCell(page, SHOW);
        expect(coll).toEqual([
            { text: 'Radio Nowhere', href: 'https://archive.org/details/radionowhere', target: '_blank' },
            { text: 'Recordings of Independent Origin', href: 'https://archive.org/details/roiocollection', target: '_blank' },
            { text: 'Folksoundomy: A Library of Sound', href: 'https://archive.org/details/folksoundomy', target: '_blank' },
        ]);
        // The videos are there too, as Video.
        expect(rows.filter(x => x.Type === 'Video').length).toBe(docs.filter(x => x.mediatype === 'movies').length);
        expect(errors).toEqual([]);
    });

    test('more than a page: page 1 counts them, then page 2 — each asked once', async ({ page }) => {
        const p1 = FX('ia-search-2016-p1');
        const p2 = FX('ia-search-2016-p2');
        // 1,064 items in fact: cut to 200, two pages.
        const cut = (b) => Object.assign(b, { response: Object.assign(b.response, { numFound: 200 }) });
        const t1 = FX('ia-colltitles-2016-p1');
        const t2 = FX('ia-colltitles-2016-p2');
        await open(page, S2016, Object.fromEntries([answer(p1, cut), answer(p2, cut), answer(t1), answer(t2)]));
        await page.locator('#mb-ia-root button[data-label="Show all items"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // Each page's titles request asks only for collections no earlier
        // page named: page 2's has none of page 1's.
        expect(await apiLog(page)).toEqual([p1.url, t1.url, p2.url, t2.url]);
        const ids = (f) => new URL(f.url).searchParams.get('q').match(/"[^"]+"/g);
        expect(ids(t2).filter(x => ids(t1).includes(x)), 'page 2 asks no title page 1 asked').toEqual([]);
        const { rows } = await tableData(page);
        expect(rows).toHaveLength(JSON.parse(p1.body).response.docs.length + JSON.parse(p2.body).response.docs.length);
    });

    test('the titles request failing never fails the page: ids or our fixed names, still links', async ({ page }) => {
        const f = FX('ia-search-1975-p1');
        const titles = FX('ia-colltitles-1975-p1');
        const errors = await open(page, S1975, Object.fromEntries([
            answer(f), [titles.url, { status: 503, responseHeaders: 'Content-Type: text/html', responseText: 'Service Unavailable' }],
        ]));
        await page.locator('#mb-ia-root button[data-label="Show all items"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // Page 1, then the titles request (a 503 is asked again by
        // _extGet()'s own retry): nothing else.
        const log = await apiLog(page);
        expect(log[0]).toBe(f.url);
        expect(log.slice(1).length).toBeGreaterThan(0);
        expect(log.slice(1).filter(u => u !== titles.url)).toEqual([]);
        const { rows } = await tableData(page);
        expect(rows).toHaveLength(JSON.parse(f.body).response.docs.length);
        expect(await collCell(page, SHOW)).toEqual([
            { text: 'radionowhere', href: 'https://archive.org/details/radionowhere', target: '_blank' },
            { text: 'roiocollection', href: 'https://archive.org/details/roiocollection', target: '_blank' },
            { text: 'Folksoundomy: A Library of Sound', href: 'https://archive.org/details/folksoundomy', target: '_blank' },
        ]);
        expect(errors).toEqual([]);
    });

    test('a collection link in our table: the iadetails card and window of the collection', async ({ page }) => {
        const meta = 'https://archive.org/metadata/radionowhere';
        const coll = { metadata: { identifier: 'radionowhere', title: 'Radio Nowhere', mediatype: 'collection',
            description: 'Bruce Springsteen recordings.' }, files: [], item_size: 0 };
        const errors = await open(page, S1975, Object.fromEntries([
            answer(FX('ia-search-1975-p1')), answer(FX('ia-colltitles-1975-p1')),
            [meta, { status: 200, responseHeaders: 'Content-Type: application/json', responseText: JSON.stringify(coll) }],
        ]), { sa_pop_ext: true });
        await page.locator('#mb-ia-root button[data-label="Show all items"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator('#mb-ia-root table.tbl a[href="https://archive.org/details/radionowhere"]').first();
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        const card = page.locator('#mb-dp-peek');
        await expect(card.locator('.mb-tt-title')).toHaveText('Radio Nowhere');
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        await expect(d).toContainText('Internet Archive · Collection');
        // A collection has no pictures of its own: no Images section.
        await expect(d.locator('.mb-ia-pics')).toHaveCount(0);
        expect((await apiLog(page)).filter(u => u.includes('/metadata/'))).toEqual([meta]);
        expect(errors).toEqual([]);
    });

    test('a full-text search (sin=TXT) gets no button: the search API does not index texts', async ({ page }) => {
        await open(page, `${S1975}&sin=TXT`, {});
        await expect(page.locator('#mb-ia-root h1.mb-ia-h1')).toBeVisible();
        await expect(page.locator('#mb-ia-root button[data-label="Show all items"]')).toHaveCount(0);
    });

    test('switched off: nothing on the page, nothing asked', async ({ page }) => {
        await open(page, S1975, {}, { sa_enable_internetarchive: false });
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('app-root')).toHaveCount(1);
        await expect(page.locator('#mb-ia-root, #mb-show-all-controls-container')).toHaveCount(0);
        expect(await apiLog(page)).toEqual([]);
    });

    test('a title in our table: its card and window, from the item\'s metadata (the iadetails reader)', async ({ page }) => {
        const m = FX(`ia-metadata-${SHOW}`);
        await open(page, S1975, Object.fromEntries([answer(FX('ia-search-1975-p1')), answer(m)]), { sa_pop_ext: true });
        await page.locator('#mb-ia-root button[data-label="Show all items"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const link = page.locator(`#mb-ia-root table.tbl a[href="https://archive.org/details/${SHOW}"]`);
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await page.keyboard.down('Control');
        await link.hover();
        await page.keyboard.up('Control');
        const card = page.locator('#mb-dp-peek');
        await expect(card.locator('.mb-tt-title')).toHaveText('Bruce Springsteen - 1975-12-27, Tower Theater, Philadelphia');
        await expect(card.locator('.mb-dp-tracks li')).toHaveCount(6);
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        // The capture's 19 songs (its original FLAC files with a title).
        await expect(d.locator('[data-mb-tbl="ia-setlist"] tbody tr')).toHaveCount(19);
        expect((await apiLog(page)).filter(u => u.includes('/metadata/'))).toEqual([m.url]);
    });
});

// G4 of NON-MB-COVERAGE.org (2026-11-03): archive.org's own result list is
// written into shadow DOM by its web components after load, which a saved
// page loses, so the spec builds it: open shadow roots under <app-root>, a
// result's title link (relative, as the site writes it) inside one and a
// navigation link inside <ia-topnav>. Before any button, a hover on the
// result's link shows the item's card (the element under the pointer read
// through `_dpEventTarget()`: the document's listener sees only <app-root>),
// the navigation's shows nothing, and leaving the link hides the card.
test.describe('archive.org: the site\'s own result list, in shadow DOM (G4)', () => {
    /**
     * Builds the shadow DOM a real search page has: <app-root> → <ia-topnav>
     * (a navigation link) and <search-page> (a result's title link).
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<void>}
     */
    async function buildShadowList(page) {
        await page.evaluate((id) => {
            const host = document.querySelector('app-root') || document.body.appendChild(document.createElement('app-root'));
            const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
            root.innerHTML = '<ia-topnav></ia-topnav><search-page style="display:block;padding:40px"></search-page>';
            // No <nav> around it: `_extTarget()`'s own skip list already
            // drops a link in a <nav>, so this pins `_IA_SHADOW_SKIP`'s
            // <ia-topnav> itself.
            root.querySelector('ia-topnav').attachShadow({ mode: 'open' }).innerHTML =
                '<div class="topnav"><a id="ia-nav" href="/details/etree" style="display:inline-block;padding:8px">Live Music Archive</a></div>';
            const sp = root.querySelector('search-page').attachShadow({ mode: 'open' });
            // As in archive.org's list views (probe of 2026-11-04): a
            // result's picture link, its content in a further shadow root
            // (no text of its own), then its title link.
            sp.innerHTML = `<div class="tile"><a id="ia-pic" href="/details/${id}" style="display:inline-block;width:40px;height:40px"><item-image></item-image></a>` +
                `<a id="ia-tile" href="/details/${id}" style="display:inline-block;padding:8px">Tower Theater 1975-12-27</a></div>`;
            sp.querySelector('item-image').attachShadow({ mode: 'open' }).innerHTML = '<img alt="" style="width:40px;height:40px">';
        }, SHOW);
    }

    const deep = (page, id) => page.locator('app-root').locator(`#${id}`);

    test('a result\'s title link: the item\'s card from its metadata, Space opens the window; the navigation has none; leaving hides the card', async ({ page }) => {
        const m = FX(`ia-metadata-${SHOW}`);
        await open(page, S1975, Object.fromEntries([answer(FX('ia-search-1975-p1')), answer(m)]), { sa_pop_ext: true });
        await buildShadowList(page);
        const r = await page.evaluate(() => {
            const sr = document.querySelector('app-root').shadowRoot;
            const tile = sr.querySelector('search-page').shadowRoot.querySelector('#ia-tile');
            const nav = sr.querySelector('ia-topnav').shadowRoot.querySelector('#ia-nav');
            const pic = sr.querySelector('search-page').shadowRoot.querySelector('#ia-pic');
            return { tile: window.__saTest.popResolve(tile), nav: window.__saTest.popResolve(nav), pic: window.__saTest.popResolve(pic) };
        });
        expect(r.tile).toBe(`ext|ext:iadetails:https://archive.org/details/${SHOW}`);
        expect(r.nav, 'archive.org\'s navigation').toBeNull();
        // vzell, 2026-11-04: our card came on top of archive.org's own over a
        // result's picture (and a tile view's whole tile, one text-less link).
        expect(r.pic, 'a link without text of its own (a picture, a tile)').toBeNull();

        const card = page.locator('#mb-dp-peek');
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await deep(page, 'ia-tile').hover();
        await page.keyboard.up('Control');
        await expect(card.locator('.mb-tt-title')).toHaveText('Bruce Springsteen - 1975-12-27, Tower Theater, Philadelphia');
        // Leaving the link to empty space of the same shadow root (left of
        // it: the card opens to its right, and the pointer on the card keeps
        // the card) hides it.
        const box = await deep(page, 'ia-tile').boundingBox();
        await page.mouse.move(box.x - 25, box.y + box.height / 2);
        await expect(card).toBeHidden();
        // Back on it, Space pins the window.
        await page.keyboard.down('Control');
        await deep(page, 'ia-tile').hover();
        await page.keyboard.up('Control');
        await expect(card.locator('.mb-tt-title')).toBeVisible();
        await page.keyboard.press('Space');
        await expect(page.locator('#mb-dp-dialog [data-mb-tbl="ia-setlist"] tbody tr')).toHaveCount(19);
        expect((await apiLog(page)).filter(u => u.includes('/metadata/')), 'one request').toEqual([m.url]);
    });

    test('a hover on the navigation\'s link shows no card and asks nothing; the result\'s link, hovered the same way, does', async ({ page }) => {
        const m = FX(`ia-metadata-${SHOW}`);
        await open(page, S1975, Object.fromEntries([answer(FX('ia-search-1975-p1')), answer(m)]), { sa_pop_ext: true });
        await buildShadowList(page);
        const card = page.locator('#mb-dp-peek');
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await deep(page, 'ia-nav').hover();
        await page.keyboard.up('Control');
        // The control: the same hover on the result's link shows its card,
        // so the hover works here. The card's delay is 0 (open()), so once
        // this card is up the navigation's hover has long been handled, and
        // the only metadata asked is the result's — the navigation's
        // collection (etree) got no card and no request.
        await page.keyboard.down('Control');
        await deep(page, 'ia-tile').hover();
        await page.keyboard.up('Control');
        await expect(card.locator('.mb-tt-title')).toHaveText('Bruce Springsteen - 1975-12-27, Tower Theater, Philadelphia');
        expect((await apiLog(page)).filter(u => u.includes('/metadata/')), 'nothing asked for the navigation').toEqual([m.url]);
    });
});

test.describe('archive.org: the Art column\'s hover card and viewer (_IA_FI)', () => {
    const VIDEO = '1975-bruce-springsteen-widener-college-audience-cam';
    const DL = (id, name) => `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(name)}`;
    const tip = (page) => page.locator('#mb-stat-tooltip');

    /**
     * Loads the 1975 table with the two items' metadata as GM answers.
     * @param {import('@playwright/test').Page} page
     * @param {Object} [settings]
     * @returns {Promise<string[]>} Page errors.
     */
    async function openTable(page, settings = {}) {
        const errors = await open(page, S1975, Object.fromEntries([
            answer(FX('ia-search-1975-p1')), answer(FX(`ia-metadata-${SHOW}`)), answer(FX(`ia-metadata-${VIDEO}`)),
        ]), settings);
        await page.locator('#mb-ia-root button[data-label="Show all items"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        return errors;
    }

    /**
     * The Art link of the row whose Title links the item, hovered from outside.
     * @param {import('@playwright/test').Page} page
     * @param {string} id
     * @returns {Promise<import('@playwright/test').Locator>}
     */
    async function hoverArt(page, id) {
        const link = page.locator('#mb-ia-root table.tbl tbody > tr', { has: page.locator(`a[href="https://archive.org/details/${id}"]`) })
            .first().locator('a.mb-ia-thumblink');
        await page.mouse.move(0, 0);
        await link.scrollIntoViewIfNeeded();
        await link.hover();
        return link;
    }

    const metaLog = async (page) => (await apiLog(page)).filter(u => u.includes('/metadata/'));

    test('resting on a picture: the item\'s own pictures, a cover first, from ONE request the title\'s card shares', async ({ page }) => {
        const errors = await openTable(page);
        expect(await metaLog(page), 'nothing before the hover').toEqual([]);
        const link = await hoverArt(page, SHOW);
        await expect(tip(page)).toBeVisible();
        await expect(tip(page)).toContainText('Bruce Springsteen - 1975-12-27, Tower Theater, Philadelphia');
        // The capture's seven scans (Cover, Front, Back, two booklet pages,
        // two discs); not its 19 spectrogram PNGs, not the item tile.
        const tiles = tip(page).locator('.mb-art-card-tile img');
        await expect(tiles).toHaveCount(7);
        // A cover first, each drawn from its "JPEG Thumb".
        await expect(tiles.first()).toHaveAttribute('src', DL(SHOW, 'Cover_thumb.jpg'));
        await expect(tiles.nth(1)).toHaveAttribute('src', DL(SHOW, 'Front_thumb.jpg'));
        expect(await metaLog(page), 'one request, this row only').toEqual([FX(`ia-metadata-${SHOW}`).url]);
        // A click: the viewer at full size, from the record in memory.
        await link.click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 7');
        const stage = viewer.locator('.mb-artv-stage .mb-artv-img');
        await expect(stage).toHaveAttribute('data-artv-size', 'big');
        await expect(stage).toHaveAttribute('data-artv-url', DL(SHOW, 'Cover.jpg'));
        await expect(viewer.locator('.mb-artv-info')).toContainText('the cache');
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        expect(await metaLog(page), 'the viewer asked nothing more').toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('a video item without pictures of its own: its stills', async ({ page }) => {
        const errors = await openTable(page);
        const link = await hoverArt(page, VIDEO);
        const tiles = tip(page).locator('.mb-art-card-tile img');
        await expect(tiles.first()).toHaveAttribute('src', /\.thumbs\//);
        await link.click();
        // The record keeps the first 12 of its 62 stills.
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText('1 / 12');
        expect(await metaLog(page)).toEqual([FX(`ia-metadata-${VIDEO}`).url]);
        expect(errors).toEqual([]);
    });

    test('"Art column: the item\'s pictures on hover" off: no card, no request', async ({ page }) => {
        await openTable(page, { sa_ia_tip_images: false });
        await hoverArt(page, SHOW);
        // The title's own card still works: the setting is the picture's only.
        await page.waitForFunction(() => document.readyState === 'complete');
        await expect(tip(page)).toBeHidden();
        expect(await metaLog(page)).toEqual([]);
    });
});
