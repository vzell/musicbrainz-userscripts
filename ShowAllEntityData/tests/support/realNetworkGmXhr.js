'use strict';

const { buildGmStubsScript } = require('./gmStubs');
const { USERSCRIPT_PATH, MB_LIBRARY_PATH } = require('./loadPage');

const IRO_URL = 'https://cdn.jsdelivr.net/npm/@jaames/iro@5';
const PAKO_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js';

/**
 * Real, network-passthrough replacement for `gmStubs.js`'s always-404
 * `GM_xmlhttpRequest` stub. Delegates the actual HTTP fetch to
 * `window.__realGmFetch` (a Node-side function wired in by
 * `loadUserscriptPageWithRealNetwork()`'s `page.exposeFunction()` call
 * below), then reconstructs a `Blob` from the base64 bytes it returns for
 * `responseType: 'blob'` callers (that's what `_artGmFetchBlob()` always
 * requests).
 *
 * @returns {string} JS source for `page.addInitScript()`.
 */
function buildPassthroughGmXhrScript() {
    return `
        (function () {
            window.GM_xmlhttpRequest = function (opts) {
                window.__realGmFetch(opts.url).then(function (result) {
                    if (typeof opts.onload !== 'function') return;
                    if (result.status < 200 || result.status >= 300) {
                        opts.onload({ status: result.status, response: null, responseText: '' });
                        return;
                    }
                    if (opts.responseType === 'blob') {
                        var binStr = atob(result.base64);
                        var bytes = new Uint8Array(binStr.length);
                        for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                        var blob = new Blob([bytes], { type: result.contentType });
                        opts.onload({ status: result.status, response: blob, responseText: '' });
                    } else {
                        var text = atob(result.base64);
                        opts.onload({ status: result.status, response: text, responseText: text });
                    }
                }).catch(function (err) {
                    if (typeof opts.onerror === 'function') opts.onerror(err);
                });
                return { abort: function () {} };
            };
        })();
    `;
}

/**
 * Loads ShowAllEntityData.user.js onto `page`, identically to
 * `loadPage.js`'s `loadUserscriptPage()`, except `GM_xmlhttpRequest` is a
 * real, network-passthrough implementation instead of `gmStubs.js`'s
 * always-404 stub — real coverartarchive.org/eventartarchive.org bytes flow
 * through `GM_xmlhttpRequest`'s callers (`_artGmFetchBlob()`) instead of
 * failing closed.
 *
 * This can't be expressed as a `fixtureFile`-style option on
 * `loadUserscriptPage()` itself: `page.exposeFunction()` must be registered,
 * and the passthrough init script layered AFTER `buildGmStubsScript()`'s
 * (so it overrides the always-404 `GM_xmlhttpRequest` that installs), all
 * BEFORE `page.goto()` — so the whole init-script/goto/addScriptTag
 * sequence is replicated here rather than reused.
 *
 * Real bytes can't be read via a plain in-page `fetch()` either — the whole
 * reason this script uses `GM_xmlhttpRequest` for images in the first place
 * is to bypass coverartarchive.org/eventartarchive.org's lack of permissive
 * CORS headers. `page.context().request` (Playwright's own
 * APIRequestContext) has no browser same-origin restriction, so it can
 * fetch the real bytes; this function exposes that fetch to the page via
 * `page.exposeFunction()`.
 *
 * Originally written inline inside `capture-idb-fixture.js`'s one-time IDB
 * capture script; promoted here once a live spec (see
 * `debug/multi-table-sort-filter-bug.org`'s explicit "fetch real images from
 * the CAA network" requirement) needed the identical pattern.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ url: string, testMode?: boolean }} opts
 * @returns {Promise<void>}
 */
async function loadUserscriptPageWithRealNetwork(page, { url, testMode }) {
    const context = page.context();

    await page.exposeFunction('__realGmFetch', async (fetchUrl) => {
        const resp = await context.request.get(fetchUrl);
        const buf = await resp.body();
        return {
            status: resp.status(),
            base64: buf.toString('base64'),
            contentType: resp.headers()['content-type'] || 'application/octet-stream',
        };
    });

    if (testMode) {
        await page.addInitScript({ content: 'window.__SA_TEST_MODE__ = true;' });
    }
    await page.addInitScript({ content: buildGmStubsScript({}) });
    await page.addInitScript({ content: buildPassthroughGmXhrScript() });

    await page.goto(url);
    await page.addScriptTag({ url: IRO_URL });
    await page.addScriptTag({ url: PAKO_URL });
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
}

module.exports = { buildPassthroughGmXhrScript, loadUserscriptPageWithRealNetwork };
