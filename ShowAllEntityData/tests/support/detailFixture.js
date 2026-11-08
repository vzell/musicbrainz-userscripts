'use strict';

/**
 * Serves the foreign hosts' DETAIL pages (built by
 * scripts/build-detail-fixtures.py) to the detail-preview specs.
 *
 * Each list loader (slFixture / jlFixture / bsFixture / bbFixture) registers
 * a catch-all that aborts every other request to its host. Playwright tries
 * routes newest-first, so a route registered here AFTER the loader wins over
 * that catch-all for the URLs it claims.
 *
 * A detail URL with no fixture is answered 404, never aborted: an abort looks
 * like a network failure, and the specs want a definite "no such page".
 *
 * @module detailFixture
 */

const path = require('path');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');

/**
 * Detail fixtures by host, each with the predicate of the detail URLs of that
 * host and the fixture file for a URL (or null for "no fixture").
 *
 * The jungleland.it pages are served as plain `text/html` with no charset, as
 * the real server does, so the bytes must be decoded as windows-1252 by the
 * preview itself. The others send `charset=utf-8`, as theirs do.
 *
 * @type {Object<string, {isDetail: function(URL): boolean, fileFor: function(URL): ?string, contentType: string}>}
 */
const DETAIL_HOSTS = {
    sl: {
        isDetail: (u) => /springsteenlyrics\.com$/.test(u.hostname) &&
            ((/^\/(?:collection|bootlegs|brucelegs)\.php$/.test(u.pathname) && u.searchParams.has('item')) ||
             (u.pathname === '/lyrics.php' && (u.searchParams.has('song') || /^\d+$/.test(u.searchParams.get('item') || '')))),
        fileFor: (u) => {
            // A logged-in song page with its "Private Info" section
            // (scrubbed: scripts/build-sl-item-fixtures.py).
            // lyrics.php?item=2298 is the same page by its number (the
            // lyrics index's logged-in ID cell links it).
            if (u.searchParams.get('song') === 'backstreets' || (u.pathname === '/lyrics.php' && u.searchParams.get('item') === '2298')) {
                return path.join(FIXTURE_DIR, 'detail-sl-song-backstreets-logged-in.html');
            }
            // Two more versions of it (2026-11-07, the song window's
            // compare with the album version: sl-song-window.spec.js).
            const versions = {
                backstreets_unofficial1: 'detail-sl-song-backstreets-unofficial1-logged-in.html',
                'backstreets_1975-11-18': 'detail-sl-song-backstreets-1975-11-18-logged-in.html',
            };
            if (versions[u.searchParams.get('song')]) return path.join(FIXTURE_DIR, versions[u.searchParams.get('song')]);
            const name = u.searchParams.has('song')
                ? `detail-sl-lyrics-${u.searchParams.get('song')}.html`
                : `detail-sl-${u.pathname.slice(1, -4)}-${u.searchParams.get('item')}.html`;
            return ['detail-sl-bootlegs-4554.html', 'detail-sl-bootlegs-6739.html', 'detail-sl-bootlegs-1331.html',
                'detail-sl-collection-8981.html', 'detail-sl-collection-7431.html', 'detail-sl-brucelegs-148.html',
                'detail-sl-lyrics-badlands.html', 'detail-sl-lyrics-babyme.html'].includes(name)
                ? path.join(FIXTURE_DIR, name) : null;
        },
        contentType: 'text/html; charset=UTF-8',
    },
    jl: {
        isDetail: (u) => /jungleland\.it$/.test(u.hostname) && /^\/html\/[^/]+\.htm$/i.test(u.pathname) &&
            !/\/(?:list|images|artwork)\.htm$/i.test(u.pathname),
        fileFor: (u) => {
            const p = decodeURIComponent(u.pathname);
            if (p === '/html/19750205.htm') return path.join(FIXTURE_DIR, 'detail-jl-19750205.html');
            if (p === '/html/Magic In The Köln Night (2007-12-13).htm') return path.join(FIXTURE_DIR, 'detail-jl-koln.html');
            return null;
        },
        contentType: 'text/html',
    },
    // A record; and (2026-11-06, bs-record) a song (`sd3.aspx?sid=`) and a
    // show (`mn.aspx?ex=`), and the five record pages of the record-page
    // spec, which a show's "Found on" opens in the window.
    bs: {
        isDetail: (u) => /brucespringsteen\.it$/.test(u.hostname) && /^\/db\/(?:detrec|sd3|mn)\.aspx$/.test(u.pathname.toLowerCase()),
        fileFor: (u) => {
            const p = u.pathname.toLowerCase();
            if (p === '/db/sd3.aspx') {
                return u.searchParams.get('sid') === '586' ? path.join(FIXTURE_DIR, 'detail-bs-song-586.html') : null;
            }
            if (p === '/db/mn.aspx') {
                const ex = u.searchParams.get('ex');
                return ['199905021', 'S198010101', '197301312'].includes(ex) ? path.join(FIXTURE_DIR, `detail-bs-show-${ex}.html`) : null;
            }
            const code = u.searchParams.get('code');
            if (['LPATY1', 'CDATY1', 'CBS39404', 'COLPC2368543', 'CR3TIM1'].includes(code)) return path.join(FIXTURE_DIR, `bs-record-${code}.html`);
            return ['CR1AD1', 'COL4942001', 'LP1B1'].includes(code) ? path.join(FIXTURE_DIR, `detail-bs-${code}.html`) : null;
        },
        contentType: 'text/html; charset=utf-8',
    },
    // A song, and (org/foreign-images.org phase 3) any entry page of a year
    // table: `/gig:`, `/nogig:`, `/recording:`, … — a wiki page name with a
    // category prefix; and (2026-10-24) the venue pages the Venue column's
    // preview reads through them. The year pages themselves (`/1985`) and
    // the wiki's system pages stay the list loaders'.
    bb: {
        isDetail: (u) => u.hostname === 'brucebase.wikidot.com' &&
            /^\/(?:song|gig|nogig|recording|rehearsal|interview|nobruce|venue):/.test(u.pathname),
        fileFor: (u) => {
            const files = {
                '/song:4th-of-july-asbury-park-sandy': 'detail-bb-4th-of-july.html',
                '/gig:1985-01-04-roads-coliseum-hampton-va': 'detail-bb-gig-1985-01-04.html',
                '/gig:1985-01-07-market-square-arena-indianapolis-in': 'detail-bb-gig-1985-01-07.html',
                '/gig:1985-01-13-carolina-coliseum-columbia-sc': 'detail-bb-gig-1985-01-13.html',
                // org/youtube.org Step 4: a Media tab that is one YouTube
                // playlist (scripts/build-bb-youtube-gig-fixture.py).
                '/gig:2026-10-03-merriweather-post-pavilion-columbia-md': 'detail-bb-gig-2026-10-03.html',
                '/venue:carolina-coliseum-columbia-sc': 'detail-bb-venue-carolina-coliseum.html',
                '/venue:market-square-arena-indianapolis-in': 'detail-bb-venue-market-square-arena.html',
                '/venue:paramount-theatre-asbury-park-nj': 'detail-bb-venue-paramount-theatre.html',
            };
            return files[u.pathname] ? path.join(FIXTURE_DIR, files[u.pathname]) : null;
        },
        contentType: 'text/html; charset=utf-8',
    },
};

/**
 * Routes one host's detail pages to their fixtures. Call it AFTER the host's
 * list loader, so this route wins over the loader's catch-all.
 *
 * @param {import('@playwright/test').Page} page
 * @param {('sl'|'jl'|'bs'|'bb')} host
 * @returns {Promise<{served: string[]}>} Every detail URL requested, in
 *   order (iframe loads included), whether or not it had a fixture.
 */
async function routeDetailPages(page, host) {
    const spec = DETAIL_HOSTS[host];
    const served = [];
    await page.route((url) => spec.isDetail(url), (route) => {
        const url = new URL(route.request().url());
        served.push(url.href);
        const file = spec.fileFor(url);
        return file
            ? route.fulfill({ path: file, contentType: spec.contentType })
            : route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>Not found</body></html>' });
    });
    return { served };
}

module.exports = { DETAIL_HOSTS, FIXTURE_DIR, routeDetailPages };
