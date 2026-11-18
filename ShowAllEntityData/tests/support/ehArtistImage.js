'use strict';

// A stand-in for Event Horizon's shared artist-image object (convention C8,
// majkinetor/musicbrainz-userscripts #938, 2026-11-17): Event Horizon
// publishes `unsafeWindow.MBU.artistImage` with `findAll(mbid, urls)`
// (asks its providers, in the user's order), `cached(mbid)` (its first known
// picture, no request), `find` and `distinct`. Each answer is
// `{src, from, key, url}`. The fixture harness defines no `unsafeWindow`, so
// the stub goes on `window`, which is where SAED looks without it.
//
// Every call is logged in `window.__ehLog` ({fn, mbid, urls}), so a spec can
// tell that a hover or a page load never called `findAll`.

/** Image hosts the stub's pictures live on; `routeEhImages()` serves them. */
const EH_IMAGE_HOSTS = /^https:\/\/(?:i\.discogs\.com|cdn-images\.dzcdn\.net|resources\.tidal\.com)\//;

/** A 1×1 PNG, the picture every stub host answers with. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** Event Horizon's answers for Bruce Springsteen, in its default provider order. */
const EH_BRUCE = [
    { src: 'https://i.discogs.com/eh-bruce-springsteen.jpg', from: 'Discogs', key: 'discogs', url: 'https://www.discogs.com/artist/57103' },
    { src: 'https://cdn-images.dzcdn.net/images/artist/eh-bruce/500x500.jpg', from: 'Deezer', key: 'deezer', url: 'https://www.deezer.com/artist/1166' },
    { src: 'https://upload.wikimedia.org/wikipedia/commons/eh-bruce-wiki.jpg', from: 'Wikipedia', key: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Bruce_Springsteen' },
];

/**
 * Installs the stub on every page of the context, before the userscript
 * runs (a context init script).
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{images?: Object[], cached?: ?Object, mode?: ('ok'|'reject'|'throw'|'hang')}} [opts]
 *   `images`: what `findAll` answers; `cached`: what `cached` answers;
 *   `mode`: how `findAll` behaves (resolve, reject, throw at once, never answer).
 * @returns {Promise<void>}
 */
async function installEhArtistImage(context, { images = EH_BRUCE, cached = null, mode = 'ok' } = {}) {
    await context.addInitScript((cfg) => {
        window.__ehLog = [];
        const copy = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
        window.MBU = window.MBU || {};
        window.MBU.artistImage = {
            findAll(mbid, urls) {
                window.__ehLog.push({ fn: 'findAll', mbid, urls: Array.from(urls || []) });
                if (cfg.mode === 'throw') throw new Error('planted: findAll threw');
                if (cfg.mode === 'reject') return Promise.reject(new Error('planted: findAll rejected'));
                if (cfg.mode === 'hang') return new Promise(() => {});
                return Promise.resolve(copy(cfg.images));
            },
            find(mbid, urls) {
                window.__ehLog.push({ fn: 'find', mbid, urls: Array.from(urls || []) });
                return Promise.resolve(copy((cfg.images || [])[0] || null));
            },
            distinct(mbid, urls) {
                window.__ehLog.push({ fn: 'distinct', mbid, urls: Array.from(urls || []) });
                return Promise.resolve(copy(cfg.images));
            },
            cached(mbid) {
                window.__ehLog.push({ fn: 'cached', mbid, urls: [] });
                return copy(cfg.cached);
            },
        };
    }, { images, cached, mode });
}

/**
 * Serves the stub's picture hosts with a PNG, so SAED's load probes say
 * "loads".
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<void>}
 */
async function routeEhImages(context) {
    await context.route(EH_IMAGE_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

/**
 * The stub's calls so far, optionally of one member only.
 * @param {import('@playwright/test').Page} page
 * @param {string} [fn]
 * @returns {Promise<Array<{fn: string, mbid: string, urls: string[]}>>}
 */
function ehCalls(page, fn) {
    return page.evaluate((f) => (window.__ehLog || []).filter(c => !f || c.fn === f), fn || null);
}

module.exports = { installEhArtistImage, routeEhImages, ehCalls, EH_BRUCE, EH_IMAGE_HOSTS };
