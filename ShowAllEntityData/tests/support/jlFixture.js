'use strict';

/**
 * Loads the jungleland.it list fixture ('jl-list') the way the jl-* fixture
 * specs need it.
 *
 * The fixture is built by scripts/build-jl-fixtures.py from
 * debug/jungleland.it.html: the real page, cut down to four sections, its
 * script removed. Routing keeps a spec network-free:
 *
 *   1. A catch-all for jungleland.it, registered FIRST so every more specific
 *      route wins over it, ABORTS whatever reaches it (the arrow images, and
 *      an entry link a spec might follow). Playwright tries routes
 *      newest-first.
 *   2. `loadUserscriptPage()` serves the fixture at the list URL itself.
 *
 * The list has no pagination, so nothing is fetched after the load.
 *
 * `loadJlFramesetPage()` opens the site's two-frame view instead, with the
 * fixture as its left frame, and injects the userscript into THAT frame —
 * what Tampermonkey does there, since the header has no `@noframes`.
 *
 * @module jlFixture
 */

const path = require('path');
const { buildGmStubsScript } = require('./gmStubs');
const {
    loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH,
    FIXTURE_SETTINGS_OVERRIDE, SETTINGS_MIGRATION_PRE_APPLIED,
} = require('./loadPage');

const JL_LIST_URL = 'https://www.jungleland.it/html/list.htm';
const JL_FRAMESET_URL = 'https://www.jungleland.it/html/artwork.htm';
const JL_FIXTURE = path.join(__dirname, '..', 'fixtures', 'jl-list-page1.html');
const JL_BUTTON = 'Show all bootlegs of this list';
const JL_HOST_RE = /^https?:\/\/(?:www\.)?jungleland\.it\//;

/**
 * Loads the list fixture with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ enabled?: boolean, settingsOverride?: Object<string, *> }} [opts]
 *   `enabled` seeds `sa_enable_jungleland` (default `true`; the setting
 *   itself defaults to OFF).
 * @returns {Promise<{ requests: string[] }>} Every request URL the page made
 *   from the moment of loading (for "no MusicBrainz call" checks).
 */
async function loadJlListPage(page, { enabled = true, settingsOverride = {} } = {}) {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(JL_HOST_RE, (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: JL_LIST_URL,
        fixtureFile: JL_FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_jungleland: enabled, ...settingsOverride },
    });
    return { requests };
}

/**
 * Opens the site's frameset (artwork.htm: list.htm on the left, the artwork
 * frame `inferioredx1` on the right) and injects the userscript into the
 * left frame.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ enabled?: boolean }} [opts] `enabled` seeds `sa_enable_jungleland` (default `true`).
 * @returns {Promise<import('@playwright/test').Frame>} The list frame.
 */
async function loadJlFramesetPage(page, { enabled = true } = {}) {
    await page.context().addInitScript({ content: 'window.__SA_TEST_MODE__ = true;' });
    await page.context().addInitScript({
        content: buildGmStubsScript({
            ...SETTINGS_MIGRATION_PRE_APPLIED,
            ...FIXTURE_SETTINGS_OVERRIDE,
            sa_enable_jungleland: enabled,
        }),
    });
    await page.route(JL_HOST_RE, (route) => route.abort('blockedbyclient'));
    await page.route(JL_LIST_URL, (route) => route.fulfill({ path: JL_FIXTURE, contentType: 'text/html' }));
    // The site's own frameset, as artwork.htm serves it (checked 2026-10-05).
    await page.route(JL_FRAMESET_URL, (route) => route.fulfill({
        contentType: 'text/html',
        body: '<html><head><title>Welcome To Jungleland</title></head>'
            + '<frameset cols="25%,75%">'
            + '<frame name="inferioredx" src="list.htm" scrolling="auto" target="_self">'
            + '<frame name="inferioredx1" src="about:blank" target="_self" scrolling="auto">'
            + '</frameset></html>',
    }));
    await page.goto(JL_FRAMESET_URL);
    const frame = page.frame({ name: 'inferioredx' });
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
function renderedJlRows(page) {
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
function renderedJlHeaders(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
}

module.exports = {
    JL_LIST_URL, JL_FIXTURE, JL_BUTTON, loadJlListPage, loadJlFramesetPage, renderedJlRows, renderedJlHeaders,
};
