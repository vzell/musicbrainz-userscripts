'use strict';

/**
 * Loads the brucespringsteen.it record-list fixtures ('bs-records') the way
 * the bs-* fixture spec needs them.
 *
 * The fixtures are built by scripts/build-bs-fixtures.py from raw curl
 * captures of DB/records.aspx in debug/: the whole unofficial and official
 * all-formats lists (what the two buttons fetch) and the frameset's default
 * list, `tipe=-1,4` (Vinyl LP only), which is the page the user has open.
 *
 * Routing:
 *
 *   1. A catch-all for the host, registered FIRST so every more specific
 *      route wins over it, ABORTS whatever reaches it (the background image,
 *      a followed record link). Playwright tries routes newest-first.
 *   2. One predicate route serves every records.aspx request by its `tipe=`:
 *      the full unofficial / official lists for the buttons' fetches, the LP
 *      list for anything else (the live page itself). Every URL it serves is
 *      recorded. It sends `charset=utf-8`, as the real server does — the
 *      page's own meta tag says windows-1252, and without the header that is
 *      what the browser would decode the UTF-8 bytes as.
 *
 * `loadUserscriptPage()` is called WITHOUT `fixtureFile` (its own route
 * would serve plain `text/html`), so the fixture profile's two forced-off
 * settings are applied here instead.
 *
 * @module bsFixture
 */

const path = require('path');
const { buildGmStubsScript } = require('./gmStubs');
const {
    loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH,
    FIXTURE_SETTINGS_OVERRIDE, SETTINGS_MIGRATION_PRE_APPLIED,
} = require('./loadPage');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');
const BS_ORIGIN = 'https://www.brucespringsteen.it';
const BS_LIST_URL = `${BS_ORIGIN}/DB/records.aspx?tipe=-1,4&sort=0`;
const BS_FRAMESET_URL = `${BS_ORIGIN}/Blegsdx.htm`;
const ALL_FORMATS = '0,1,2,3,4,5,6,7,8,9,10,11';
const BS_FIXTURES = {
    unofficial: path.join(FIXTURE_DIR, 'bs-records-unofficial.html'),
    official: path.join(FIXTURE_DIR, 'bs-records-official.html'),
    lp: path.join(FIXTURE_DIR, 'bs-records-lp.html'),
};
const BS_HOST_RE = /^https?:\/\/(?:www\.)?brucespringsteen\.it\//;

/**
 * Registers the catch-all and the records.aspx route on a page.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} The records.aspx URLs served, in order.
 */
async function routeBsRecords(page) {
    const served = [];
    await page.route(BS_HOST_RE, (route) => route.abort('blockedbyclient'));
    await page.route((url) => /brucespringsteen\.it$/.test(url.hostname)
        && url.pathname.toLowerCase() === '/db/records.aspx', (route) => {
        const url = new URL(route.request().url());
        served.push(url.href);
        const tipe = url.searchParams.get('tipe') || '';
        const file = tipe === `-1,${ALL_FORMATS}` ? BS_FIXTURES.unofficial
            : tipe === `-2,${ALL_FORMATS}` ? BS_FIXTURES.official
                : BS_FIXTURES.lp;
        return route.fulfill({ path: file, contentType: 'text/html; charset=utf-8' });
    });
    return served;
}

/**
 * Loads the frameset's default list (`tipe=-1,4`) with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ enabled?: boolean, titles?: boolean, settingsOverride?: Object<string, *> }} [opts]
 *   `enabled` seeds `sa_enable_brucespringsteen` (default `true`; the
 *   setting itself defaults to OFF).
 *   `titles` seeds `sa_foreign_mb_titles` and `sa_foreign_typography`
 *   (default `false` here, although both settings default to ON: these
 *   loaders serve the converter specs, which pin the site's text as
 *   written; tests/fixtures/mb-title-case.spec.js loads with
 *   `titles: true`).
 * @returns {Promise<{ requests: string[], served: string[] }>} Every request
 *   URL the page made, and every records.aspx URL the route served.
 */
async function loadBsRecordsPage(page, { enabled = true, titles = false, settingsOverride = {} } = {}) {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    const served = await routeBsRecords(page);
    await loadUserscriptPage(page, {
        url: BS_LIST_URL,
        testMode: true,
        settingsOverride: {
            ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_brucespringsteen: enabled, sa_foreign_mb_titles: titles, sa_foreign_typography: titles, ...settingsOverride,
        },
    });
    return { requests, served };
}

/**
 * Opens the site's frameset (Blegsdx.htm: records.aspx on the left as
 * "sommario", "principale" on the right) and injects the userscript into the
 * list frame.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Frame>} The list frame.
 */
async function loadBsFramesetPage(page) {
    await page.context().addInitScript({ content: 'window.__SA_TEST_MODE__ = true;' });
    await page.context().addInitScript({
        content: buildGmStubsScript({
            ...SETTINGS_MIGRATION_PRE_APPLIED,
            ...FIXTURE_SETTINGS_OVERRIDE,
            sa_enable_brucespringsteen: true,
        }),
    });
    await routeBsRecords(page);
    // The site's own frameset, as Blegsdx.htm serves it (checked 2026-10-06).
    await page.route(BS_FRAMESET_URL, (route) => route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<html><head><title>Bootleg Bruce Springsteen discography</title></head>'
            + '<frameset cols="222,*">'
            + '<frame name="sommario" target="principale" src="DB/records.aspx?tipe=-1,4&amp;sort=0" scrolling="auto">'
            + '<frame name="principale" src="about:blank" target="_self">'
            + '</frameset></html>',
    }));
    await page.goto(BS_FRAMESET_URL);
    const frame = page.frame({ name: 'sommario' });
    await frame.waitForLoadState('load');
    await addRequiredLibs(frame);
    await frame.addScriptTag({ path: MB_LIBRARY_PATH });
    await frame.addScriptTag({ path: USERSCRIPT_PATH });
    return frame;
}

/** A 1 px PNG: the record photo when a spec serves one. */
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/**
 * A stand-in for the site's `DB/libmnx.js` (its three window openers): each
 * call is recorded in `window.__bsSiteCalls` and returns false, as the real
 * ones do after `window.open()`. So a spec can tell that a plain click still
 * runs the page's own `onclick`.
 */
const LIBMNX_STUB = 'window.__bsSiteCalls = [];'
    + ['hs', 'helps', 'showdisc'].map(f => `function ${f}(x) { window.__bsSiteCalls.push(['${f}', x]); return false; }`).join('');

/**
 * The URL of a record page.
 *
 * @param {string} code
 * @returns {string}
 */
const bsRecordUrl = code => `${BS_ORIGIN}/DB/detrec.aspx?code=${code}`;

/**
 * Routes a record page (`bs-record`, 2026-11-06): the catch-all (aborts),
 * the site's `libmnx.js` (a stub, `LIBMNX_STUB`), the record photos
 * (`photo`: 'ok' a 1 px PNG, '404' not found), and the record, song and
 * show pages through `routeDetailPages(page, 'bs')`, all with
 * `charset=utf-8` as the real server sends.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{photo?: ('ok'|'404')}} [opts]
 * @returns {Promise<{served: string[], photos: string[]}>} Detail pages and
 *   photos requested, in order.
 */
async function routeBsRecordPage(page, { photo = 'ok' } = {}) {
    const { routeDetailPages } = require('./detailFixture');
    await page.route(BS_HOST_RE, (route) => route.abort('blockedbyclient'));
    await page.route((url) => /brucespringsteen\.it$/.test(url.hostname) && /\/libmnx\.js$/i.test(url.pathname),
        (route) => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: LIBMNX_STUB }));
    const photos = [];
    await page.route((url) => /brucespringsteen\.it$/.test(url.hostname) && /\/blegs\/images\//i.test(url.pathname), (route) => {
        photos.push(route.request().url());
        return photo === 'ok'
            ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX })
            : route.fulfill({ status: 404, contentType: 'text/html', body: 'not found' });
    });
    const { served } = await routeDetailPages(page, 'bs');
    return { served, photos };
}

/**
 * Loads a record page (`detrec.aspx?code=<code>`, a `bs-record-<code>.html`
 * fixture) with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 * @param {{ enabled?: boolean, titles?: boolean, photo?: ('ok'|'404'), settingsOverride?: Object<string, *> }} [opts]
 *   As `loadBsRecordsPage()`; `photo` as `routeBsRecordPage()`.
 * @returns {Promise<{ requests: string[], served: string[], photos: string[], errors: string[] }>}
 */
async function loadBsRecordPage(page, code, { enabled = true, titles = false, photo = 'ok', settingsOverride = {} } = {}) {
    const requests = [];
    const errors = [];
    page.on('request', (req) => requests.push(req.url()));
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    const { served, photos } = await routeBsRecordPage(page, { photo });
    await loadUserscriptPage(page, {
        url: bsRecordUrl(code),
        testMode: true,
        settingsOverride: {
            ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_brucespringsteen: enabled, sa_foreign_mb_titles: titles, sa_foreign_typography: titles,
            sa_render_threshold: 100000, ...settingsOverride,
        },
    });
    return { requests, served, photos, errors };
}

/**
 * Opens the site's frameset with a record page in its right frame
 * (`principale`, or another name with `frameName`) and injects the
 * userscript into that frame.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 * @param {{frameName?: string}} [opts]
 * @returns {Promise<import('@playwright/test').Frame>} The record's frame.
 */
async function loadBsRecordInFrameset(page, code, { frameName = 'principale' } = {}) {
    await page.context().addInitScript({ content: 'window.__SA_TEST_MODE__ = true;' });
    await page.context().addInitScript({
        content: buildGmStubsScript({
            ...SETTINGS_MIGRATION_PRE_APPLIED,
            ...FIXTURE_SETTINGS_OVERRIDE,
            sa_enable_brucespringsteen: true,
        }),
    });
    await routeBsRecords(page);
    await routeBsRecordPage(page);
    await page.route(BS_FRAMESET_URL, (route) => route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<html><head><title>Bootleg Bruce Springsteen discography</title></head>'
            + '<frameset cols="222,*">'
            + '<frame name="sommario" target="principale" src="DB/records.aspx?tipe=-1,4&amp;sort=0" scrolling="auto">'
            + `<frame name="${frameName}" src="DB/detrec.aspx?code=${code}" target="_self">`
            + '</frameset></html>',
    }));
    await page.goto(BS_FRAMESET_URL);
    const frame = page.frame({ name: frameName });
    await frame.waitForLoadState('load');
    await addRequiredLibs(frame);
    await frame.addScriptTag({ path: MB_LIBRARY_PATH });
    await frame.addScriptTag({ path: USERSCRIPT_PATH });
    return frame;
}

/**
 * Reads the rendered table's visible rows as `{ colName: cellText }` objects,
 * plus the Title link's resolved href and target.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object<string, string>>>}
 */
function renderedBsRows(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
        const names = ths.map((th) => th.dataset.colName || th.textContent.trim());
        const titleIdx = names.indexOf('Title');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                const a = tr.cells[titleIdx]?.querySelector('a');
                row._href = a ? a.href : '';
                row._target = a ? a.getAttribute('target') || '' : '';
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
function renderedBsHeaders(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
}

module.exports = {
    BS_FIXTURES, BS_LIST_URL, ALL_FORMATS, loadBsRecordsPage, loadBsFramesetPage, renderedBsRows, renderedBsHeaders,
    bsRecordUrl, routeBsRecordPage, loadBsRecordPage, loadBsRecordInFrameset,
};
