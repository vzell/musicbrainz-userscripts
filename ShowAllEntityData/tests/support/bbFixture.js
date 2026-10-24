'use strict';

/**
 * Loads the Brucebase fixtures — the song list ('bb-songs'), the year
 * pages ('bb-year'), the start page ('bb-home'), Relations ('bb-relations')
 * and Recent changes ('bb-recent-changes', with its AJAX answers) — the way
 * the bb-* fixture specs need them.
 *
 * The fixtures are built by scripts/build-bb-fixtures.py from saved real
 * pages (debug/bb-songs.html; the year pages from debug/bb-2026-initial.html
 * and debug/bb-year-cache/): whole pages, their scripts, iframes and theme
 * imports removed. Routing keeps a spec network-free:
 *
 *   1. A catch-all for every http(s) URL, registered FIRST so every more
 *      specific route wins over it, ABORTS whatever reaches it (the wiki's
 *      images and favicons on wdfiles.com/cloudfront, and a song link a spec
 *      might follow). Playwright tries routes newest-first. Aborted requests
 *      still fire the page's `request` event, so `requests` sees them.
 *   2. `loadUserscriptPage()` serves the fixture at the page's URL itself.
 *
 * Neither page has pagination, so nothing is fetched after the load.
 *
 * @module bbFixture
 */

const fs = require('fs');
const path = require('path');
const { loadUserscriptPage } = require('./loadPage');

const BB_SONGS_URL = 'https://brucebase.wikidot.com/stats:songs';
const BB_FIXTURE = path.join(__dirname, '..', 'fixtures', 'bb-songs.html');
const BB_BUTTON = 'Show all songs';
const BB_YEAR_BUTTON = 'Show all events';
const BB_HOME_URL = 'https://brucebase.wikidot.com/';
const BB_HOME_BUTTON = 'Show all events of all years';

/**
 * The year page's URL and its fixture file.
 *
 * @param {string} year '2026', '1985', … ('1949-64' would be the one exception).
 * @returns {{ url: string, file: string }}
 */
function bbYearFixture(year) {
    return {
        url: `https://brucebase.wikidot.com/${year}`,
        file: path.join(__dirname, '..', 'fixtures', `bb-year-${year}.html`),
    };
}

/**
 * Loads the song-list fixture with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ enabled?: boolean, titles?: boolean, settingsOverride?: Object<string, *> }} [opts]
 *   `enabled` seeds `sa_enable_brucebase` (default `true`; the setting itself
 *   defaults to OFF).
 *   `titles` seeds `sa_foreign_mb_titles` and `sa_foreign_typography`
 *   (default `false` here, although both settings default to ON: these
 *   loaders serve the converter specs, which pin the site's text as
 *   written; tests/fixtures/mb-title-case.spec.js loads with
 *   `titles: true`).
 * @returns {Promise<{ requests: string[] }>} Every request URL the page made
 *   from the moment of loading (for "no MusicBrainz call" checks).
 */
async function loadBbSongsPage(page, { enabled = true, titles = false, settingsOverride = {} } = {}) {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: BB_SONGS_URL,
        fixtureFile: BB_FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_brucebase: enabled, sa_foreign_mb_titles: titles, sa_foreign_typography: titles, ...settingsOverride },
    });
    return { requests };
}

/**
 * Loads a year-page fixture with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} year Which fixture: '2026', '1968', '1985' or '2018'.
 * @param {{ enabled?: boolean, years?: boolean, titles?: boolean, settingsOverride?: Object<string, *> }} [opts]
 *   `enabled` seeds `sa_enable_brucebase`, `years` seeds `sa_bb_year_pages`
 *   (both default `true`; both settings themselves default to OFF).
 *   `titles` seeds `sa_foreign_mb_titles` and `sa_foreign_typography`
 *   (default `false` here, although both settings default to ON: these
 *   loaders serve the converter specs, which pin the site's text as
 *   written; tests/fixtures/mb-title-case.spec.js loads with
 *   `titles: true`).
 * @returns {Promise<{ requests: string[] }>} Every request URL the page made
 *   from the moment of loading.
 */
async function loadBbYearPage(page, year, { enabled = true, years = true, titles = false, settingsOverride = {} } = {}) {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const fx = bbYearFixture(year);
    await loadUserscriptPage(page, {
        url: fx.url,
        fixtureFile: fx.file,
        testMode: true,
        settingsOverride: { sa_enable_brucebase: enabled, sa_bb_year_pages: years, sa_foreign_mb_titles: titles, sa_foreign_typography: titles, ...settingsOverride },
    });
    return { requests };
}

/**
 * Loads the start-page fixture ('bb-home') with the userscript injected, and
 * serves the year pages its button fetches: each year in the fixture's side
 * bar (1968, 1985, 2018, 2026; scripts/build-bb-fixtures.py trims the rest)
 * from its year fixture, any other year path as a 404. The year route is
 * registered after the loader's own, so it wins over the catch-all.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ years?: boolean, titles?: boolean, settingsOverride?: Object<string, *> }} [opts]
 *   `years` seeds `sa_bb_year_pages` (default `true`); `sa_enable_brucebase`
 *   is always on.
 *   `titles` seeds `sa_foreign_mb_titles` and `sa_foreign_typography`
 *   (default `false` here, although both settings default to ON: these
 *   loaders serve the converter specs, which pin the site's text as
 *   written; tests/fixtures/mb-title-case.spec.js loads with
 *   `titles: true`).
 * @returns {Promise<{ requests: string[], served: string[] }>} Every request
 *   URL, and the year URLs the route answered, in order.
 */
async function loadBbHomePage(page, { years = true, titles = false, settingsOverride = {} } = {}) {
    const requests = [];
    const served = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: BB_HOME_URL,
        fixtureFile: path.join(__dirname, '..', 'fixtures', 'bb-home.html'),
        testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: years, sa_foreign_mb_titles: titles, sa_foreign_typography: titles, ...settingsOverride },
    });
    await page.route((url) => url.hostname === 'brucebase.wikidot.com' && /^\/(\d{4}|1949-64)\/?$/.test(url.pathname), (route) => {
        const url = new URL(route.request().url());
        served.push(url.href);
        const file = bbYearFixture(url.pathname.replace(/\//g, '')).file;
        return fs.existsSync(file)
            ? route.fulfill({ path: file, contentType: 'text/html; charset=utf-8' })
            : route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>Not found</body></html>' });
    });
    return { requests, served };
}

/**
 * Reads the rendered year table's visible rows: every column's text, plus
 * the list items of Soundcheck / Setlist / Media, the set labels, the
 * Venue link and the Notes cell's links.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object<string, *>>>}
 */
function renderedBbYearRows(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'));
        const names = ths.map((th) => th.dataset.colName || th.textContent.trim());
        const at = (tr, n) => tr.cells[names.indexOf(n)];
        const items = (td) => Array.from(td?.querySelectorAll(':scope > ul > li') || [])
            .map((li) => li.textContent.replace(/\s+/g, ' ').trim());
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                row._soundcheck = items(at(tr, 'Soundcheck'));
                row._setlist = items(at(tr, 'Setlist'));
                row._labels = Array.from(at(tr, 'Setlist')?.querySelectorAll('.mb-bb-set-label') || []).map((s) => s.textContent);
                row._bold = Array.from(at(tr, 'Setlist')?.querySelectorAll('li strong') || []).map((s) => s.textContent.trim());
                row._media = Array.from(at(tr, 'Media')?.querySelectorAll('.mb-bb-media-label') || []).map((s) => s.textContent);
                row._mediaImgs = at(tr, 'Media')?.querySelectorAll('img').length || 0;
                const venue = at(tr, 'Venue')?.querySelector('a');
                row._venueHref = venue ? venue.href : '';
                row._notesLinks = Array.from(at(tr, 'Notes')?.querySelectorAll('a[href]') || []).map((a) => a.href);
                row._notesParas = at(tr, 'Notes')?.querySelectorAll('p').length || 0;
                return row;
            });
    });
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

const BB_RELATIONS_URL = 'https://brucebase.wikidot.com/stats:relations';
const BB_RELATIONS_FIXTURE = path.join(__dirname, '..', 'fixtures', 'bb-relations.html');
const BB_RELATIONS_BUTTON = 'Show all relations';
const BB_CHANGES_URL = 'https://brucebase.wikidot.com/system:recent-changes';
const BB_CHANGES_FIXTURE = path.join(__dirname, '..', 'fixtures', 'bb-recent-changes.html');
const BB_CHANGES_AJAX = [1, 2].map((n) => path.join(__dirname, '..', 'fixtures', `bb-recent-changes-p${n}.json`));
const BB_AJAX_URL = 'https://brucebase.wikidot.com/ajax-module-connector.php';

/**
 * Loads the Relations fixture (`bb-relations`) with the userscript injected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ enabled?: boolean, settingsOverride?: Object<string, *> }} [opts]
 *   `enabled` seeds `sa_enable_brucebase` (default `true`).
 * @returns {Promise<{ requests: string[] }>}
 */
async function loadBbRelationsPage(page, { enabled = true, settingsOverride = {} } = {}) {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: BB_RELATIONS_URL,
        fixtureFile: BB_RELATIONS_FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_brucebase: enabled, ...settingsOverride },
    });
    return { requests };
}

/**
 * Loads the Recent changes fixture (`bb-recent-changes`) with the userscript
 * injected, and answers its AJAX requests: every POST to
 * /ajax-module-connector.php gets one of the two saved answers (200 changes
 * each, `page` 1 → p1, 2 → p2, 3 → p1 again, …), or — with `ajaxStatus` —
 * a Wikidot error answer ("wrong_token7"), or — with `failPage` — an HTTP 500
 * for that page. Each request's form fields are recorded, in order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ enabled?: boolean, ajaxStatus?: string, failPage?: number, settingsOverride?: Object<string, *> }} [opts]
 * @returns {Promise<{ requests: string[], posts: Array<Object<string, string>> }>}
 */
async function loadBbChangesPage(page, { enabled = true, ajaxStatus = 'ok', failPage = 0, settingsOverride = {} } = {}) {
    const requests = [];
    const posts = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: BB_CHANGES_URL,
        fixtureFile: BB_CHANGES_FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_brucebase: enabled, ...settingsOverride },
    });
    await page.route(BB_AJAX_URL, (route) => {
        const req = route.request();
        const fields = Object.fromEntries(new URLSearchParams(req.postData() || ''));
        fields._method = req.method();
        fields._contentType = req.headers()['content-type'] || '';
        posts.push(fields);
        const n = parseInt(fields.page || '1', 10);
        if (failPage && n === failPage) {
            return route.fulfill({ status: 500, contentType: 'text/html', body: 'error' });
        }
        if (ajaxStatus !== 'ok') {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ status: ajaxStatus, message: 'Wikidot says no.' }),
            });
        }
        return route.fulfill({ path: BB_CHANGES_AJAX[(n - 1) % 2], contentType: 'application/json; charset=utf-8' });
    });
    return { requests, posts };
}

/**
 * Scrolls the page sideways until `locator` starts just right of the year
 * table's sticky first column (in either direction), then waits two frames.
 * The Event column is the whole entry name on one line (org/TODO.org "Some
 * enhancements" 3a, kept so by vzell on a wide screen): on the 2026 fixture
 * it is 807 px wide, so Playwright's own "scroll into view if needed" leaves
 * a column further right UNDER it, or at the window's right edge under the
 * sticky headers' right mask (`#mb-sph-rmask`). Docked, it leaves -25 px of
 * a 1280 px window and 615 px of a 1920 px one (measured 2026-10-24), so a
 * spec that clicks or hovers past it sets a 1920 px window.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<void>}
 */
async function revealPastStickyColumn(page, locator) {
    await locator.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const table = el.closest('table');
        const sticky = table && table.querySelector('thead th.mb-sticky-col');
        const stickyRight = sticky ? sticky.getBoundingClientRect().right : 0;
        const left = el.getBoundingClientRect().left;
        window.scrollBy(left - stickyRight - 8, 0);
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

module.exports = {
    BB_SONGS_URL, BB_FIXTURE, BB_BUTTON, loadBbSongsPage, renderedBbRows, renderedBbHeaders,
    BB_YEAR_BUTTON, bbYearFixture, loadBbYearPage, renderedBbYearRows, revealPastStickyColumn,
    BB_HOME_URL, BB_HOME_BUTTON, loadBbHomePage,
    BB_RELATIONS_URL, BB_RELATIONS_FIXTURE, BB_RELATIONS_BUTTON, loadBbRelationsPage,
    BB_CHANGES_URL, BB_CHANGES_FIXTURE, BB_CHANGES_AJAX, loadBbChangesPage,
};
