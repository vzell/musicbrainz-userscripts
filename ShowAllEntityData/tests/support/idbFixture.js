'use strict';

const fs = require('fs');

// Must match ShowAllEntityData.user.js's `_ART_IDB_NAME`/`_ART_IDB_VERSION`
// exactly (currently 'vz-mb-saed-art-cache' / 2) — re-grep if either drifts.
const ART_IDB_NAME = 'vz-mb-saed-art-cache';
const ART_IDB_VERSION = 2;

/**
 * Seeds the art-cache IndexedDB database's `images` store with real
 * `Blob` records reconstructed from a fixture file captured by
 * `capture-idb-fixture.js` (`[{url, base64, contentType}, ...]`), via a
 * `page.addInitScript()` that runs — and completes — before the userscript
 * itself ever opens the database.
 *
 * Must be called BEFORE `loadUserscriptPage()` (init scripts apply to the
 * navigation `page.goto()` triggers, and only scripts registered before
 * that call are included). Opens the database itself (creating all three
 * object stores if this is a fresh context, matching the userscript's own
 * `onupgradeneeded` schema) so the DB already exists at the target version
 * by the time the userscript's own `indexedDB.open()` runs — it just gets a
 * handle to the pre-populated store, no second upgrade fires.
 *
 * Sets `window.__idbSeedDone = true` once the write transaction completes;
 * callers should `page.waitForFunction(() => window.__idbSeedDone === true)`
 * after `loadUserscriptPage()` and before triggering a fetch, so there's no
 * race between this seed (async IDB write) and the userscript's own first
 * `_artFetchCachedImage()` read.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} fixturePath  Path to a capture-idb-fixture.js output file.
 * @returns {Promise<void>}
 */
async function seedArtIdbFixture(page, fixturePath) {
    const records = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    await page.addInitScript({
        content: `
            (function () {
                window.__idbSeedDone = false;
                var records = ${JSON.stringify(records)};
                var req = indexedDB.open(${JSON.stringify(ART_IDB_NAME)}, ${ART_IDB_VERSION});
                req.onupgradeneeded = function () {
                    var db = req.result;
                    if (!db.objectStoreNames.contains('images'))   db.createObjectStore('images',   { keyPath: 'url' });
                    if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'entityPath' });
                    if (!db.objectStoreNames.contains('rel-ws2'))  db.createObjectStore('rel-ws2',  { keyPath: 'ckey' });
                };
                req.onsuccess = function () {
                    var db = req.result;
                    var tx = db.transaction('images', 'readwrite');
                    var store = tx.objectStore('images');
                    records.forEach(function (r) {
                        var binStr = atob(r.base64);
                        var bytes = new Uint8Array(binStr.length);
                        for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                        var blob = new Blob([bytes], { type: r.contentType });
                        store.put({ url: r.url, blob: blob, storedAt: Date.now() });
                    });
                    tx.oncomplete = function () { window.__idbSeedDone = true; };
                };
            })();
        `,
    });
}

module.exports = { seedArtIdbFixture, ART_IDB_NAME, ART_IDB_VERSION };
