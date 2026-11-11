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
 *   (both default `true`; both settings themselves default to ON since 2026-10-26).
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

/**
 * The Brucebase detail-page fixtures (scripts/build-bb-event-fixtures.py):
 * an event, song or On The Tracks page's fixture file by its key, and the
 * page's URL.
 * @type {Object<string, {url: string, file: string}>}
 */
const BB_EVENT_PAGES = {
    'gig-1978-07-07': ['gig:1978-07-07-roxy-theatre-west-hollywood-ca', 'bb-event-gig-1978-07-07.html'],
    'gig-2005-06-20': ['gig:2005-06-20-palais-omnisports-paris-france', 'bb-event-gig-2005-06-20.html'],
    'recording-1979-04-09': ['recording:1979-04-09-power-station-new-york-city-ny', 'bb-event-recording-1979-04-09.html'],
    'rehearsal-2009-01-29a': ['rehearsal:2009-01-29a-raymond-james-stadium-tampa-fl', 'bb-event-rehearsal-2009-01-29a.html'],
    'interview-2021-04-28': ['interview:2021-04-28-siriusxm-studio-new-york-city-ny', 'bb-event-interview-2021-04-28.html'],
    'nogig-2013-04-16': ['nogig:2013-04-16-richard-rodgers-theatre-new-york-city-ny', 'bb-event-nogig-2013-04-16.html'],
    // bb-song / bb-ott (Phase 3): the same builder, lyrics blanked.
    'song-the-promise': ['song:the-promise', 'bb-song-the-promise.html'],
    'song-we-gotta-get-out-of-this-place': ['song:we-gotta-get-out-of-this-place', 'bb-song-we-gotta-get-out-of-this-place.html'],
    'ott-do-you-want-me-to-say-alright': ['ott:do-you-want-me-to-say-alright', 'bb-ott-do-you-want-me-to-say-alright.html'],
    // bb-venue / bb-relation (Phase 4); Patti Scialfa's later pages are
    // served at /p/2 and /p/3.
    'venue-roxy-theatre': ['venue:roxy-theatre-west-hollywood-ca', 'bb-venue-roxy-theatre.html'],
    'relation-patti-scialfa': ['relation:patti-scialfa', 'bb-relation-patti-scialfa-p1.html',
        { 2: 'bb-relation-patti-scialfa-p2.html', 3: 'bb-relation-patti-scialfa-p3.html' }],
    'relation-anders-goman': ['relation:anders-goman', 'bb-relation-anders-goman.html'],
    'relation-malurt': ['relation:malurt', 'bb-relation-malurt.html'],
    // bb-retail / bb-bootleg (Phase 5).
    'retail-born-to-run': ['retail:born-to-run', 'bb-retail-born-to-run.html'],
    'retail-live-1975-85': ['retail:live-1975-85', 'bb-retail-live-1975-85.html'],
    'retail-the-promise-boxset': ['retail:the-promise-boxset', 'bb-retail-the-promise-boxset.html'],
    'playlist-songs-of-love': ['playlist:songs-of-love', 'bb-playlist-songs-of-love.html'],
    'bootleg-river-outtakes-wrr': ['bootleg:river-outtakes-wrr', 'bb-bootleg-river-outtakes-wrr.html'],
    'bootleg-criminals-and-artists': ['bootleg:criminals-and-artists', 'bb-bootleg-criminals-and-artists.html'],
    'bootleg-definitive-remastered-darkness-outtakes-gfr': ['bootleg:definitive-remastered-darkness-outtakes-gfr',
        'bb-bootleg-definitive-remastered-darkness-outtakes-gfr.html'],
    'bootleg-born-to-run-outtakes': ['bootleg:born-to-run-outtakes', 'bb-bootleg-born-to-run-outtakes.html'],
};
Object.keys(BB_EVENT_PAGES).forEach((k) => {
    const [p, f, more] = BB_EVENT_PAGES[k];
    const fx = (name) => path.join(__dirname, '..', 'fixtures', name);
    BB_EVENT_PAGES[k] = {
        url: `https://brucebase.wikidot.com/${p}`, file: fx(f),
        pages: Object.fromEntries(Object.entries(more || {}).map(([n, name]) => [n, fx(name)])),
    };
});
const BB_EVENT_BUTTON = 'Show the event';

/**
 * Loads a Brucebase event page fixture (`bb-event`) with the userscript
 * injected, behind the catch-all abort; every image is answered with one
 * transparent pixel so the head's pictures load.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key A `BB_EVENT_PAGES` key ('gig-1978-07-07', …).
 * @param {{ enabled?: boolean, detail?: boolean, settingsOverride?: Object<string, *> }} [opts]
 * @returns {Promise<{ requests: string[], url: string }>}
 */
async function loadBbEventPage(page, key, { enabled = true, detail = true, settingsOverride = {} } = {}) {
    const { url, file, pages } = BB_EVENT_PAGES[key];
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    // A paged page's later pages (`/p/N`), as the wiki serves them.
    for (const [n, f] of Object.entries(pages || {})) {
        await page.route(`${url}/p/${n}`, (route) => route.fulfill({ path: f, contentType: 'text/html; charset=utf-8' }));
    }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    await page.route(/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await loadUserscriptPage(page, {
        url, fixtureFile: file, testMode: true,
        settingsOverride: { sa_enable_brucebase: enabled, sa_bb_detail_pages: detail, ...settingsOverride },
    });
    return { requests, url };
}

/** The page the history fixtures are of, and its fixture (with its page id). */
const BB_HISTORY_URL = 'https://brucebase.wikidot.com/song:the-promise';
const BB_HISTORY_FIXTURE = path.join(__dirname, '..', 'fixtures', 'bb-history-song-the-promise.html');
const BB_HISTORY_DIR = path.join(__dirname, '..', 'fixtures', 'bb-history');
/** A story page (no pageType; its links preview), its page id and its 8 revisions. */
const BB_HISTORY_STORY_URL = 'https://brucebase.wikidot.com/story:story-1978-09-15-palladium-new-york-city-ny';
const BB_HISTORY_STORY_FIXTURE = path.join(__dirname, '..', 'fixtures', 'bb-history-story-1978-09-15.html');

/**
 * Loads the song page with its page id (bb-history-song-the-promise.html,
 * scripts/build-bb-history-fixtures.py) and answers Wikidot's history
 * modules from tests/fixtures/bb-history/: the revision list's pages
 * (`list-p<N>.json`), the sources (`source-<revision id>.json`) and the
 * comparisons (`compare-<from id>-<to id>.json`); any
 * other page of the wiki is the same fixture (so a link's window has a page
 * id too; a `/story:` page is the story fixture, its list `story-list.json`).
 * Every module POST is recorded.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ settingsOverride?: Object<string, *>, url?: string,
 *   answer?: function({module: string, params: URLSearchParams}): ?{status?: number, json?: object} }} [opts]
 *   `answer` may replace a module's answer (an HTTP status, or Wikidot's
 *   JSON); null keeps the fixture's. `url`: the address the fixture is
 *   served at (default the song's; a page no link previews, such as
 *   system:recent-changes, for the ☰ entry).
 * @returns {Promise<{ posts: Array<{module: string, page: string, revision: string, pair: string}>, requests: string[] }>}
 */
async function loadBbHistoryPage(page, { settingsOverride = {}, answer = null, url = BB_HISTORY_URL } = {}) {
    const posts = [];
    const requests = [];
    page.on('request', (req) => requests.push(`${req.method()} ${req.url()}`));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    await page.route(/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await page.route((u) => u.hostname === 'brucebase.wikidot.com' && u.pathname !== '/ajax-module-connector.php',
        (route) => route.fulfill({
            path: /^\/story:/.test(new URL(route.request().url()).pathname) ? BB_HISTORY_STORY_FIXTURE : BB_HISTORY_FIXTURE,
            contentType: 'text/html; charset=utf-8',
        }));
    const storyId = /WIKIREQUEST\.info\.pageId = (\d+)/.exec(fs.readFileSync(BB_HISTORY_STORY_FIXTURE, 'utf8'))[1];
    await page.route('https://brucebase.wikidot.com/ajax-module-connector.php', (route) => {
        const params = new URLSearchParams(route.request().postData() || '');
        const module = params.get('moduleName') || '';
        posts.push({
            module, page: params.get('page') || '', revision: params.get('revision_id') || '',
            pair: params.get('from_revision_id') ? `${params.get('from_revision_id')}-${params.get('to_revision_id')}` : '',
        });
        const own = answer ? answer({ module, params }) : null;
        if (own) {
            return route.fulfill({ status: own.status || 200, contentType: 'application/json', body: JSON.stringify(own.json || {}) });
        }
        let file = '';
        if (module === 'history/PageRevisionListModule') {
            file = path.join(BB_HISTORY_DIR, params.get('page_id') === storyId ? 'story-list.json' : `list-p${params.get('page')}.json`);
        }
        if (module === 'history/PageSourceModule') file = path.join(BB_HISTORY_DIR, `source-${params.get('revision_id')}.json`);
        if (module === 'history/PageDiffModule') {
            file = path.join(BB_HISTORY_DIR, `compare-${params.get('from_revision_id')}-${params.get('to_revision_id')}.json`);
        }
        if (!file || !fs.existsSync(file)) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'not_ok', message: 'no such fixture' }) });
        }
        return route.fulfill({ path: file, contentType: 'application/json' });
    });
    await loadUserscriptPage(page, {
        url, fixtureFile: BB_HISTORY_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_brucebase: true, ...settingsOverride },
    });
    return { posts, requests };
}

module.exports = {
    BB_HISTORY_URL, BB_HISTORY_DIR, BB_HISTORY_STORY_URL, loadBbHistoryPage,
    BB_EVENT_PAGES, BB_EVENT_BUTTON, loadBbEventPage,
    BB_SONGS_URL, BB_FIXTURE, BB_BUTTON, loadBbSongsPage, renderedBbRows, renderedBbHeaders,
    BB_YEAR_BUTTON, bbYearFixture, loadBbYearPage, renderedBbYearRows, revealPastStickyColumn,
    BB_HOME_URL, BB_HOME_BUTTON, loadBbHomePage,
    BB_RELATIONS_URL, BB_RELATIONS_FIXTURE, BB_RELATIONS_BUTTON, loadBbRelationsPage,
    BB_CHANGES_URL, BB_CHANGES_FIXTURE, BB_CHANGES_AJAX, loadBbChangesPage,
};
