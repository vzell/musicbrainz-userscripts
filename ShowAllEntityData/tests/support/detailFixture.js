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
            /^\/(?:collection|bootlegs|brucelegs)\.php$/.test(u.pathname) && u.searchParams.has('item'),
        fileFor: (u) => {
            const name = `detail-sl-${u.pathname.slice(1, -4)}-${u.searchParams.get('item')}.html`;
            return ['detail-sl-bootlegs-4554.html', 'detail-sl-bootlegs-6739.html', 'detail-sl-bootlegs-1331.html',
                'detail-sl-collection-8981.html', 'detail-sl-collection-7431.html'].includes(name)
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
    bs: {
        isDetail: (u) => /brucespringsteen\.it$/.test(u.hostname) && u.pathname.toLowerCase() === '/db/detrec.aspx',
        fileFor: (u) => {
            const code = u.searchParams.get('code');
            return ['CR1AD1', 'COL4942001', 'LP1B1'].includes(code) ? path.join(FIXTURE_DIR, `detail-bs-${code}.html`) : null;
        },
        contentType: 'text/html; charset=utf-8',
    },
    bb: {
        isDetail: (u) => u.hostname === 'brucebase.wikidot.com' && /^\/song:/.test(u.pathname),
        fileFor: (u) => (u.pathname === '/song:4th-of-july-asbury-park-sandy'
            ? path.join(FIXTURE_DIR, 'detail-bb-4th-of-july.html') : null),
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
