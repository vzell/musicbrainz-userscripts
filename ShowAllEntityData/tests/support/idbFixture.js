'use strict';

const fs = require('fs');

// Must match ShowAllEntityData.user.js's `_ART_IDB_NAME`/`_ART_IDB_VERSION`
// exactly (currently 'vz-mb-saed-art-cache' / 4) — re-grep if either drifts.
// The seed below must also create every store that version's
// `onupgradeneeded` creates; seeding at the right version but with a store
// missing leaves the userscript holding a handle to a database it thinks is
// current and finding no store to read.
const ART_IDB_NAME = 'vz-mb-saed-art-cache';
const ART_IDB_VERSION = 4;

/**
 * Seeds the art-cache IndexedDB database's `images` store with real
 * `Blob` records reconstructed from a fixture file captured by
 * `capture-idb-fixture.js` (`[{url, base64, contentType}, ...]`), via a
 * `page.addInitScript()` that runs — and completes — before the userscript
 * itself ever opens the database.
 *
 * Must be called BEFORE `loadUserscriptPage()` (init scripts apply to the
 * navigation `page.goto()` triggers, and only scripts registered before
 * that call are included). Opens the database itself (creating all six
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
                    if (!db.objectStoreNames.contains('ms-rec-len')) db.createObjectStore('ms-rec-len', { keyPath: 'gid' });
                    if (!db.objectStoreNames.contains('recof-ws2')) db.createObjectStore('recof-ws2', { keyPath: 'ckey' });
                    if (!db.objectStoreNames.contains('artist-works')) db.createObjectStore('artist-works', { keyPath: 'artist' });
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

/**
 * Mirrors `_artOpenIdb()`'s `onupgradeneeded`, store for store. Creating the
 * database with a store missing leaves the userscript holding a handle to a
 * database it believes is current and finding no store to read, so every
 * opener here must create all four.
 */
const ART_IDB_STORES = [
    ['images', 'url'],
    ['metadata', 'entityPath'],
    ['rel-ws2', 'ckey'],
    ['ms-rec-len', 'gid'],
];

/**
 * Reads every record in the art cache's `metadata` store.
 *
 * This is the only way to observe what `_artEnrichIcon()` decided to PERSIST.
 * The rendered DOM cannot tell you: a release with no artwork looks identical
 * whether the archive answered 404 (a fact, correctly stored) or 503 (a
 * transport failure, which must not be stored) — which is exactly the bug
 * `caa-metadata-transient-503.spec.js` pins.
 *
 * Must be called AFTER navigation: IndexedDB is origin-scoped, so there is no
 * database to read before the page exists.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{entityPath: string, count: number, images: Array,
 *   storedAt: number}>>}
 */
async function readArtIdbMetadata(page) {
    return page.evaluate(async ({ dbName, dbVersion, stores }) => {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, dbVersion);
            req.onupgradeneeded = (ev) => {
                const d = ev.target.result;
                stores.forEach(([name, keyPath]) => {
                    if (!d.objectStoreNames.contains(name)) {
                        d.createObjectStore(name, { keyPath });
                    }
                });
            };
            req.onsuccess = (ev) => resolve(ev.target.result);
            req.onerror = (ev) => reject(ev.target.error);
        });
        const all = await new Promise((resolve) => {
            const tx = db.transaction('metadata', 'readonly');
            const req = tx.objectStore('metadata').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
        db.close();
        return all;
    }, { dbName: ART_IDB_NAME, dbVersion: ART_IDB_VERSION, stores: ART_IDB_STORES });
}

/**
 * Writes `records` into the `metadata` store and returns the store's resulting
 * size.
 *
 * Used to plant a record of a chosen AGE, which is how the metadata TTL is
 * testable at all — `sa_art_idb_metadata_ttl_days` is read only inside
 * `_artIdbGetMetadata()`/`_artIdbSweepExpired()` and is never reflected in the
 * DOM. A record stamped 10 days old is served under the 30-day default and
 * expired under the old 7-day one.
 *
 * Like `writeRelWs2Records()`, this reads the count back rather than trusting
 * `tx.oncomplete`: a quota failure can abort silently in some engines, and an
 * empty store here would look exactly like "the userscript went to the network
 * as expected" rather than like a broken seed.
 *
 * Must be called AFTER navigation and BEFORE the click that starts the fetch.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<{entityPath: string, count: number, images: Array,
 *   storedAt: number}>} records
 * @returns {Promise<number>} the store's record count after the write
 */
async function writeArtIdbMetadata(page, records) {
    return page.evaluate(async ({ dbName, dbVersion, stores, recs }) => {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, dbVersion);
            req.onupgradeneeded = (ev) => {
                const d = ev.target.result;
                stores.forEach(([name, keyPath]) => {
                    if (!d.objectStoreNames.contains(name)) {
                        d.createObjectStore(name, { keyPath });
                    }
                });
            };
            req.onsuccess = (ev) => resolve(ev.target.result);
            req.onerror = (ev) => reject(ev.target.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction('metadata', 'readwrite');
            const store = tx.objectStore('metadata');
            recs.forEach((r) => store.put(r));
            tx.oncomplete = resolve;
            tx.onerror = (ev) => reject(ev.target.error);
            tx.onabort = (ev) => reject(ev.target.error);
        });
        const probe = await new Promise((resolve) => {
            const tx = db.transaction('metadata', 'readonly');
            const req = tx.objectStore('metadata').count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(-1);
        });
        db.close();
        return probe;
    }, { dbName: ART_IDB_NAME, dbVersion: ART_IDB_VERSION, stores: ART_IDB_STORES, recs: records });
}

/**
 * Seeds BOTH databases the 💾 cache overview lists (art cache v4, link
 * previews v1) before any script runs, with fresh and expired records in
 * several parts and `ms-rec-len` left empty. Shared by the overview spec and
 * the export/import spec, so both reason about one known cache:
 *
 *   images      a (fresh, 5000-byte PNG), b (40 days, expired)
 *   metadata    /release/a (fresh), /release/b (2 days), /release/c (expired)
 *   rel-ws2     release:aaa, release:bbb (fresh)
 *   recof-ws2   r1 (fresh), r2 (10 days), r3 (expired)
 *   artist-works x (fresh)
 *   pages       Wikipedia (fresh), Discogs (expired)
 *
 * Sets `window.__seedDone` to 2 when both are written; the stamp every fresh
 * record carries is `window.__seedNow`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function seedCacheOverview(page) {
    await page.addInitScript(({ DAY }) => {
        const now = Date.now();
        const old = now - 40 * DAY;
        window.__seedDone = 0;
        window.__seedNow = now;
        const art = indexedDB.open('vz-mb-saed-art-cache', 4);
        art.onupgradeneeded = () => {
            const db = art.result;
            [['images', 'url'], ['metadata', 'entityPath'], ['rel-ws2', 'ckey'], ['ms-rec-len', 'gid'],
                ['recof-ws2', 'ckey'], ['artist-works', 'artist']].forEach(([n, k]) => {
                if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: k });
            });
        };
        art.onsuccess = () => {
            const db = art.result;
            const tx = db.transaction(['images', 'metadata', 'rel-ws2', 'recof-ws2', 'artist-works'], 'readwrite');
            const blob = (n) => new Blob([new Uint8Array(n).map((_, i) => i % 251)], { type: 'image/png' });
            tx.objectStore('images').put({ url: 'https://coverartarchive.org/release/a/front-250', blob: blob(5000), storedAt: now });
            tx.objectStore('images').put({ url: 'https://coverartarchive.org/release/b/front-250', blob: blob(3000), storedAt: old });
            tx.objectStore('metadata').put({ entityPath: '/release/a', count: 1, images: [], storedAt: now });
            tx.objectStore('metadata').put({ entityPath: '/release/b', count: 1, images: [], storedAt: now - 2 * DAY });
            tx.objectStore('metadata').put({ entityPath: '/release/c', count: 0, images: [], storedAt: old });
            tx.objectStore('rel-ws2').put({ ckey: 'release:aaa', data: { relations: [] }, ts: now });
            tx.objectStore('rel-ws2').put({ ckey: 'release:bbb', data: { relations: [] }, ts: now });
            tx.objectStore('recof-ws2').put({ ckey: 'recording:r1|work-rels', rels: [], ts: now });
            tx.objectStore('recof-ws2').put({ ckey: 'recording:r2|work-rels', rels: [], ts: now - 10 * DAY });
            tx.objectStore('recof-ws2').put({ ckey: 'recording:r3|work-rels', rels: [], ts: old });
            tx.objectStore('artist-works').put({ artist: 'x', works: [{ id: 'w', title: 'Badlands', comment: '' }], ts: now, source: 'MusicBrainz' });
            tx.oncomplete = () => { db.close(); window.__seedDone++; };
        };
        const dp = indexedDB.open('vz-saed-detail-pages', 1);
        dp.onupgradeneeded = () => { dp.result.createObjectStore('pages', { keyPath: 'url' }); };
        dp.onsuccess = () => {
            const db = dp.result;
            const tx = db.transaction('pages', 'readwrite');
            tx.objectStore('pages').put({ url: 'https://en.wikipedia.org/wiki/Born_to_Run', at: now, v: 1, data: { title: 'Born to Run' } });
            tx.objectStore('pages').put({ url: 'https://www.discogs.com/release/1', at: old, v: 1, data: { title: 'Nebraska' } });
            tx.oncomplete = () => { db.close(); window.__seedDone++; };
        };
    }, { DAY: 86400000 });
}

module.exports = {
    seedArtIdbFixture, readArtIdbMetadata, writeArtIdbMetadata, seedCacheOverview,
    ART_IDB_NAME, ART_IDB_VERSION, ART_IDB_STORES,
};
