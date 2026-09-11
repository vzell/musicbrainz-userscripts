'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Pre-seeds the `rel-ws2` IndexedDB store so the Relationships column can be
 * measured without putting live requests inside a timing bracket.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `perfDescriptors.js`'s `applyPicardArm()` states the rule this works around:
 * an arm's seeds must never re-enable the Relationships column, because "that
 * would put thousands of live requests inside a measurement bracket". The rule
 * is right — `_initRelationshipsColumnImpl()` issues one WS/2 request per
 * distinct MBID with a hard-coded 1100 ms gap, so the Dylan arm's 2301 rows
 * cost ~42 minutes — and it is also why PERFORMANCE.org Step 35 shipped
 * explicitly NOT claiming an interaction-latency number.
 *
 * Seeding the cache removes the reason for the rule rather than breaking it.
 * With every MBID already in IDB, the column's Phase 1 hits on all of them,
 * `_missMbids` is empty, and the Phase-2 network queue never issues a request.
 * The arm then measures exactly what it should: the DOM cost of a populated
 * Relationships column versus a collapsed one.
 *
 * ── The data is REAL ────────────────────────────────────────────────────────
 *
 * `scripts/capture-rel-ws2-seed.py` captures it from MusicBrainz's own WS/2
 * BROWSE endpoint (24 requests instead of 2301) and verifies that every MBID
 * the fixture renders is covered before it will write a file. Synthesizing a
 * plausible-looking distribution instead would have made the measurement
 * meaningless: the DOM cost being measured is driven by how many
 * `<a><img>` + `.mb-rel-filter-key` triples land in each cell, so inventing
 * that number would be inventing the answer.
 *
 * ── Two things about the timing of the write ────────────────────────────────
 *
 * It must happen AFTER navigation (IndexedDB is origin-scoped, so there is no
 * database to write to before the page exists) and BEFORE the render that
 * triggers `initRelationshipsColumn()` — which on the disk-fixture path is the
 * `#sa-render-no-filter-confirm` click. `loadFromDiskFixture()` takes a
 * `beforeRender` hook for exactly this window.
 *
 * And the schema written here must match `_artOpenIdb()`'s `onupgradeneeded`
 * EXACTLY, all four stores, not just `rel-ws2`. If this creates the database
 * first with only one store, the userscript's own `open()` at the same version
 * will not fire an upgrade, and the next `_artIdbGet('images', …)` throws
 * `NotFoundError` on a store that should have existed.
 */

/** Must track `_ART_IDB_NAME` / `_ART_IDB_VERSION` in the userscript. */
const DB_NAME = 'vz-mb-saed-art-cache';
const DB_VERSION = 3;

/** Mirrors `_artOpenIdb()`'s `onupgradeneeded`, store for store. */
const STORES = [
    ['images', 'url'],
    ['metadata', 'entityPath'],
    ['rel-ws2', 'ckey'],
    ['ms-rec-len', 'gid'],
];

/** Where `capture-rel-ws2-seed.py` writes, keyed by `--pageType=`. */
const SEED_PATHS = {
    'artist-releases-dylan': path.join(
        __dirname, '..', 'fixtures', 'saved-data', 'rel-ws2-artist-releases-dylan.json.gz'),
};

/**
 * @param {string} pageType
 * @returns {string|null} the seed file for this pageType, or null if none.
 */
function seedPathFor(pageType) {
    return SEED_PATHS[pageType] || null;
}

/**
 * Reads a captured seed off disk.
 *
 * @param {string} seedPath
 * @returns {{entityType: string, capturedAt: string, entityCount: number,
 *   iconTotal: number, data: Object<string, {relations: Array}>}}
 */
function readSeed(seedPath) {
    const raw = zlib.gunzipSync(fs.readFileSync(seedPath)).toString('utf8');
    return JSON.parse(raw);
}

/**
 * Writes every captured entity into the page's `rel-ws2` store.
 *
 * `ts` is stamped at seed time rather than carried from the capture, because
 * `_relIdbGet()` evicts anything older than `sa_rel_idb_ttl_days` (default 30)
 * — a seed captured more than a month before the run would otherwise be
 * silently dropped on read, and the arm would quietly go back to making 2301
 * live requests. That failure would look like a slow run, not an error, which
 * is precisely the kind of "passes while measuring nothing" result this
 * harness's CAA notes warn about.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} seedPath
 * `urlRelTotal` is the number of url-rels in the seed, which is an UPPER BOUND
 * on how many icons the page will render -- never an expectation.
 * `_populateCells()` de-dupes by target URL within an entity and renders only
 * relation types it has an icon class for, and those maps are user-overridable
 * settings (`sa_rel_url_icon_classes` and friends). Measured once on the Dylan
 * seed: 2329 url-rels, of which 131 are duplicate URLs and 108 carry a type
 * with no icon class, leaving 2090 icons. Replicating that rule here would
 * duplicate three settings-backed maps, which is exactly the drift CLAUDE.md
 * warns about for `_findCellListItems()`.
 *
 * @returns {Promise<{written: number, urlRelTotal: number, entityType: string}>}
 */
async function seedRelWs2Store(page, seedPath) {
    const seed = readSeed(seedPath);
    const records = Object.entries(seed.data).map(([mbid, data]) => ({
        ckey: `${seed.entityType}:${mbid}`,
        data,
        ts: Date.now(),
    }));
    const written = await writeRelWs2Records(page, records);
    if (written < records.length) {
        throw new Error(
            `rel-ws2 seed incomplete: wrote ${written} of ${records.length} records. `
            + 'Every missing record is a live WS/2 request inside a measurement '
            + 'bracket, so the run would be both slow and meaningless.');
    }
    return { written, urlRelTotal: seed.urlRelTotal, entityType: seed.entityType };
}

/**
 * Writes `records` into the page's `rel-ws2` store and returns the store's
 * resulting size.
 *
 * Separate from `seedRelWs2Store()` so the mechanism can be tested without the
 * 2301-entity capture: `tests/fixtures/rel-ws2-seed-warm-cache.spec.js` builds
 * a handful of records by hand. The realism requirement stated above applies to
 * the MEASUREMENT, not to a plumbing test — what that spec pins is "a warm
 * cache means zero requests", which is true of any record shape.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<{ckey: string, data: Object, ts: number}>} records
 * @returns {Promise<number>} the store's record count after the write
 */
async function writeRelWs2Records(page, records) {
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
            const tx = db.transaction('rel-ws2', 'readwrite');
            const store = tx.objectStore('rel-ws2');
            recs.forEach((r) => store.put(r));
            tx.oncomplete = resolve;
            tx.onerror = (ev) => reject(ev.target.error);
            tx.onabort = (ev) => reject(ev.target.error);
        });
        // Read one back rather than trusting `oncomplete`: a quota failure can
        // abort silently in some engines, and an empty store here would send
        // the arm back to the network without any visible error.
        const probe = await new Promise((resolve) => {
            const tx = db.transaction('rel-ws2', 'readonly');
            const req = tx.objectStore('rel-ws2').count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(-1);
        });
        db.close();
        return probe;
    }, { dbName: DB_NAME, dbVersion: DB_VERSION, stores: STORES, recs: records });
}

module.exports = {
    seedRelWs2Store, writeRelWs2Records, seedPathFor, readSeed,
    DB_NAME, DB_VERSION, STORES,
};
