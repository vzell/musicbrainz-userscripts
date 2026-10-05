'use strict';

/**
 * Loads a springsteenlyrics.com list-page fixture ('sl-collection',
 * 'sl-collection-intro', 'sl-bootlegs') the way the sl-* fixture specs need it.
 *
 * The fixtures are built by scripts/build-sl-fixtures.py from the logged-out
 * snapshots in debug/: two pages of 50 real cards each (sampler and
 * memorabilia: one widget-less page each), scripts and stylesheets stripped. Three routing rules keep a spec network-free while
 * letting the userscript behave as it does live:
 *
 *   1. A catch-all for springsteenlyrics.com, registered FIRST so every more
 *      specific route wins over it, ABORTS whatever reaches it — item
 *      thumbnails (which the Cover column keeps on purpose) and any stray
 *      subresource. Playwright tries routes newest-first.
 *   2. `loadUserscriptPage()` serves page 1 at the list URL itself.
 *   3. A predicate route, registered after the page has loaded, serves every
 *      `fetch()` of the same list by its page-parameter value (`page=`, or
 *      `pg=` on the collection entry page). A predicate rather than a glob,
 *      because the list URL already carries a `?`.
 *
 * @module slFixture
 */

const path = require('path');
const { loadUserscriptPage } = require('./loadPage');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');

/**
 * Per-kind fixture description: the URL the fixture represents, its page
 * files, the label of the pageType's one "Show all" button, the query
 * parameter that selects a page, and which `cmd` values (`null`: absent)
 * the list's own fetches carry.
 * @type {Object<string, {url: string, pathname: string, pages: string[], button: string, pageParam: string, cmds: Array<?string>}>}
 */
const SL_KINDS = {
    collection: {
        url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i',
        pathname: '/collection.php',
        pages: ['sl-collection-page1.html', 'sl-collection-page2.html'].map((f) => path.join(FIXTURE_DIR, f)),
        button: 'Show all items of this collection list',
        pageParam: 'page',
        cmds: ['list'],
    },
    // The collection entry page ("Latest additions"), at its bare URL: the
    // userscript fetches page 2 as `collection.php?pg=2`.
    'collection-intro': {
        url: 'https://springsteenlyrics.com/collection.php',
        pathname: '/collection.php',
        pages: ['sl-collection-intro-page1.html', 'sl-collection-intro-page2.html'].map((f) => path.join(FIXTURE_DIR, f)),
        button: 'Show all latest additions',
        pageParam: 'pg',
        cmds: [null, 'intro'],
    },
    // A 99-item category: one page, no pagination widget.
    sampler: {
        url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=sampler',
        pathname: '/collection.php',
        pages: ['sl-sampler-page1.html'].map((f) => path.join(FIXTURE_DIR, f)),
        button: 'Show all items of this collection list',
        pageParam: 'page',
        cmds: ['list'],
    },
    // A 29-item category whose stray `</div>`s also close the floated
    // `.col-sm-12` around `.project-detail`: one page, no pagination widget.
    memorabilia: {
        url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=memorabilia',
        pathname: '/collection.php',
        pages: ['sl-memorabilia-page1.html'].map((f) => path.join(FIXTURE_DIR, f)),
        button: 'Show all items of this collection list',
        pageParam: 'page',
        cmds: ['list'],
    },
    bootlegs: {
        url: 'https://springsteenlyrics.com/bootlegs.php?cmd=list&category=aud_live1967',
        pathname: '/bootlegs.php',
        pages: ['sl-bootlegs-page1.html', 'sl-bootlegs-page2.html'].map((f) => path.join(FIXTURE_DIR, f)),
        button: 'Show all bootlegs of this list',
        pageParam: 'page',
        cmds: ['list'],
    },
};

/**
 * Loads one SL list fixture with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ kind: ('collection'|'collection-intro'|'sampler'|'memorabilia'|'bootlegs'), enabled?: boolean, settingsOverride?: Object<string, *>, startPage?: number }} opts
 *   `enabled` seeds `sa_enable_springsteenlyrics` (default `true`; the
 *   setting itself defaults to OFF). `startPage` (default 1) opens the list
 *   on that page: its file is the live document, at the list URL with the
 *   kind's page parameter set.
 * @returns {Promise<{ requests: string[], spec: object }>} Every request URL the
 *   page made from the moment of loading (for "no MusicBrainz call" checks),
 *   and the kind's {@link SL_KINDS} entry.
 */
async function loadSlListPage(page, { kind, enabled = true, settingsOverride = {}, startPage = 1 }) {
    const spec = SL_KINDS[kind];
    const startUrl = new URL(spec.url);
    if (startPage !== 1) startUrl.searchParams.set(spec.pageParam, String(startPage));
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.route(/^https?:\/\/(?:www\.)?springsteenlyrics\.com\//, (route) => route.abort('blockedbyclient'));

    await loadUserscriptPage(page, {
        url: startUrl.toString(),
        fixtureFile: spec.pages[startPage - 1],
        testMode: true,
        settingsOverride: { sa_enable_springsteenlyrics: enabled, ...settingsOverride },
    });

    await page.route((url) => url.hostname === 'springsteenlyrics.com' && url.pathname === spec.pathname
        && spec.cmds.includes(url.searchParams.get('cmd')) && !url.searchParams.has('item'), (route) => {
        const pageNum = parseInt(new URL(route.request().url()).searchParams.get(spec.pageParam) || '1', 10);
        const file = spec.pages[pageNum - 1];
        return file
            ? route.fulfill({ path: file, contentType: 'text/html' })
            : route.fulfill({ status: 404, body: 'no such fixture page' });
    });

    return { requests, spec };
}

/**
 * Reads the rendered table as an array of `{ colName: cellText }` objects, plus
 * the item id parsed from each row's Title link, so assertions can address a
 * row by the site's own item number instead of by position.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object<string, string>>>}
 */
function renderedSlRows(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
        const names = ths.map((th) => th.dataset.colName || th.textContent.trim());
        const titleIdx = names.indexOf('Title');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                const href = tr.cells[titleIdx]?.querySelector('a')?.getAttribute('href') || '';
                row._item = (href.match(/[?&]item=(\d+)/) || [])[1] || '';
                row._href = href;
                return row;
            });
    });
}

/**
 * Returns the rendered table's column names, in order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
function renderedSlHeaders(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
}

module.exports = { SL_KINDS, loadSlListPage, renderedSlRows, renderedSlHeaders };
