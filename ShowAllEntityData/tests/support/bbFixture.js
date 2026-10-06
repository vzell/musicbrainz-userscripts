'use strict';

/**
 * Loads the Brucebase song-list fixture ('bb-songs') the way the bb-* fixture
 * specs need it.
 *
 * The fixture is built by scripts/build-bb-fixtures.py from
 * debug/bb-songs.html: the whole real page, its scripts, iframes and theme
 * imports removed. Routing keeps a spec network-free:
 *
 *   1. A catch-all for every http(s) URL, registered FIRST so every more
 *      specific route wins over it, ABORTS whatever reaches it (the wiki's
 *      images and favicons on wdfiles.com/cloudfront, and a song link a spec
 *      might follow). Playwright tries routes newest-first. Aborted requests
 *      still fire the page's `request` event, so `requests` sees them.
 *   2. `loadUserscriptPage()` serves the fixture at the list URL itself.
 *
 * The list has no pagination, so nothing is fetched after the load.
 *
 * @module bbFixture
 */

const path = require('path');
const { loadUserscriptPage } = require('./loadPage');

const BB_SONGS_URL = 'https://brucebase.wikidot.com/stats:songs';
const BB_FIXTURE = path.join(__dirname, '..', 'fixtures', 'bb-songs.html');
const BB_BUTTON = 'Show all songs';

/**
 * Loads the song-list fixture with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ enabled?: boolean, settingsOverride?: Object<string, *> }} [opts]
 *   `enabled` seeds `sa_enable_brucebase` (default `true`; the setting itself
 *   defaults to OFF).
 * @returns {Promise<{ requests: string[] }>} Every request URL the page made
 *   from the moment of loading (for "no MusicBrainz call" checks).
 */
async function loadBbSongsPage(page, { enabled = true, settingsOverride = {} } = {}) {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: BB_SONGS_URL,
        fixtureFile: BB_FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_brucebase: enabled, ...settingsOverride },
    });
    return { requests };
}

/**
 * Reads the rendered table's visible rows as `{ colName: cellText }` objects,
 * plus the Title link's resolved href and target.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object<string, string>>>}
 */
function renderedBbRows(page) {
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
function renderedBbHeaders(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
        .map((th) => th.dataset.colName || th.textContent.trim()));
}

module.exports = {
    BB_SONGS_URL, BB_FIXTURE, BB_BUTTON, loadBbSongsPage, renderedBbRows, renderedBbHeaders,
};
