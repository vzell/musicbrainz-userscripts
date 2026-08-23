'use strict';

/**
 * One-time (re-run-when-needed) capture of the CAA "bigbox" / big-picture
 * image stripe feature's (`_artInitBigPics()` in ShowAllEntityData.user.js)
 * real IndexedDB `images`-store records — url + raw image bytes (base64) +
 * content type — so a live test can seed a fresh page's IndexedDB with real
 * artwork before the userscript loads and assert its `idb` cache tier gets
 * hit, without depending on network access or coverartarchive.org
 * availability during the test itself.
 *
 * Standalone Node script (not a Playwright test) — run directly:
 *   node tests/support/capture-idb-fixture.js
 *
 * **Why this writes a plain `{url, base64, contentType}[]` JSON file rather
 * than a Playwright `storageState({indexedDB: true})` snapshot** (the
 * originally-planned approach): confirmed empirically (and in Playwright's
 * own source, `coreBundle.js`'s `IndexedDBDatabase` scheme) that
 * `storageState`'s IndexedDB capture cannot round-trip `Blob`-valued
 * records — its generic value serializer has no `Blob` case, so a captured
 * `images`-store record decodes on restore to a plain placeholder object
 * (`{o: [], id: N}`, not `instanceof Blob`), which makes the userscript's
 * own `URL.createObjectURL(rec.blob)` throw and silently fall through to
 * a (stubbed, always-404) network fetch — reproduced directly by an earlier
 * version of this fixture. The sibling `metadata` IDB store (plain JSON,
 * no Blobs) round-trips through `storageState` correctly; only `images`
 * (Blob-valued) needs this workaround. `tests/support/idbFixture.js`'s
 * `seedArtIdbFixture()` reconstructs real `Blob`s from this file's base64
 * bytes directly inside the page via `indexedDB.open()`/`put()`, in a
 * `page.addInitScript()` that runs before the userscript's own DB open —
 * sidestepping `storageState`'s serializer entirely.
 *
 * Why this can't reuse `loadUserscriptPage()` as-is for the CAPTURE step:
 * bigbox images are fetched via `GM_xmlhttpRequest` (see
 * `_artGmFetchBlob()`), which `gmStubs.js` always stubs to a fake 404 —
 * correct for routine network-free tests, but useless here, which needs
 * genuine image bytes to land in IndexedDB. Real coverartarchive.org image
 * bytes can't be read via a plain in-page `fetch()` either — the whole
 * reason this script uses `GM_xmlhttpRequest` for images in the first place
 * is to bypass coverartarchive.org's lack of permissive CORS headers.
 * `page.context().request` (Playwright's own APIRequestContext) has no
 * browser same-origin restriction, so it can fetch the real bytes; this
 * script exposes that fetch to the page via `page.exposeFunction()` and
 * installs a custom `GM_xmlhttpRequest` that calls it, INSTEAD of
 * `gmStubs.js`'s always-404 version — this is why `loadUserscriptPage()`
 * isn't called directly and its init-script sequence is replicated by hand.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { buildGmStubsScript } = require('./gmStubs');
const { USERSCRIPT_PATH, MB_LIBRARY_PATH } = require('./loadPage');
const { waitForCaaEaaComplete } = require('./asyncCompletion');
const { ART_IDB_NAME, ART_IDB_VERSION } = require('./idbFixture');

const IRO_URL = 'https://cdn.jsdelivr.net/npm/@jaames/iro@5';
const PAKO_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js';

const OUTPUT_PATH = path.join(
    __dirname, '..', 'fixtures', 'idb-state', 'releasegroup-releases-caa-bigbox-images.json'
);

// "Tougher Than the Rest" — same small, stable, two-group Bruce Springsteen
// pilot release-group used by capture-fixture.js's disk-fixture capture.
const URL_ = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Releases for ReleaseGroup"]';

/**
 * Real, network-passthrough replacement for `gmStubs.js`'s always-404
 * `GM_xmlhttpRequest` stub. Delegates the actual HTTP fetch to
 * `window.__realGmFetch` (a Node-side function wired in by
 * `page.exposeFunction()` below), then reconstructs
 * a `Blob` from the base64 bytes it returns for `responseType: 'blob'`
 * callers (that's what `_artGmFetchBlob()` always requests).
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

(async () => {
    const browser = await chromium.launch();
    let context;
    try {
        context = await browser.newContext();
        const page = await context.newPage();

        await page.exposeFunction('__realGmFetch', async (url) => {
            const resp = await context.request.get(url);
            const buf = await resp.body();
            return {
                status: resp.status(),
                base64: buf.toString('base64'),
                contentType: resp.headers()['content-type'] || 'application/octet-stream',
            };
        });

        // Mirrors loadPage.js's loadUserscriptPage() init-script order, with
        // the passthrough GM_xmlhttpRequest registered LAST so it overrides
        // the always-404 one buildGmStubsScript() installs.
        await page.addInitScript({ content: 'window.__SA_TEST_MODE__ = true;' });
        await page.addInitScript({ content: buildGmStubsScript({}) });
        await page.addInitScript({ content: buildPassthroughGmXhrScript() });

        await page.goto(URL_);
        await page.addScriptTag({ url: IRO_URL });
        await page.addScriptTag({ url: PAKO_URL });
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });

        const showAllBtn = page.locator(SHOW_ALL_BUTTON);
        await showAllBtn.waitFor({ state: 'visible', timeout: 15000 });
        await showAllBtn.click();
        await page.locator('#mb-filter-container').waitFor({ state: 'visible', timeout: 90000 });

        // Waits for the CAA queue to drain — bigbox image loads are enqueued
        // through the same _caaQueue as small-icon loads, so this covers both.
        await waitForCaaEaaComplete(page, { timeout: 60000 });

        // Sanity: fail loudly if the bigbox strip ended up empty (e.g. a real
        // coverartarchive.org 404/outage during capture) rather than silently
        // writing a useless fixture.
        const bigboxImgCount = await page.locator('.mb-caa-bigbox img').count();
        if (bigboxImgCount === 0) {
            throw new Error('CAA bigbox strip has no <img> elements after capture — refusing to write an empty IDB fixture.');
        }
        console.log(`Bigbox strip populated with ${bigboxImgCount} image(s).`);

        // Read the real Blob records straight out of the 'images' store and
        // base64-encode their bytes — see this file's own JSDoc for why a
        // plain JSON dump is used instead of `context.storageState({indexedDB: true})`.
        const records = await page.evaluate(({ dbName, dbVersion }) => {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(dbName, dbVersion);
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                    const db = req.result;
                    const store = db.transaction('images', 'readonly').objectStore('images');
                    const allReq = store.getAll();
                    allReq.onerror = () => reject(allReq.error);
                    allReq.onsuccess = async () => {
                        const out = [];
                        for (const rec of allReq.result) {
                            const buf = new Uint8Array(await rec.blob.arrayBuffer());
                            let binStr = '';
                            for (let i = 0; i < buf.length; i++) binStr += String.fromCharCode(buf[i]);
                            out.push({ url: rec.url, base64: btoa(binStr), contentType: rec.blob.type });
                        }
                        resolve(out);
                    };
                };
            });
        }, { dbName: ART_IDB_NAME, dbVersion: ART_IDB_VERSION });

        if (records.length === 0) {
            throw new Error('IndexedDB "images" store is empty after capture — refusing to write an empty fixture.');
        }

        fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(records, null, 2));
        console.log(`Captured ${records.length} real image record(s) -> ${OUTPUT_PATH}`);
    } finally {
        if (context) await context.close();
        await browser.close();
    }
})().catch((err) => {
    console.error('IDB fixture capture failed:', err);
    process.exit(1);
});
