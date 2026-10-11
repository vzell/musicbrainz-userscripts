'use strict';

/**
 * Times the 💾 cache Export and Import on a synthetic cache of realistic size
 * (PERFORMANCE: not on any hot path; this calibrates the Export pane's
 * "Takes about N s" and records what a user waits for).
 *
 * Seeds the art cache with 20,000 JSON entries across four parts (8,000
 * Relationships answers of about 1 kB, 6,000 cover art lists, 4,000
 * "Recording of" entries, 2,000 millisecond lengths) and 300 cover art images
 * of 150 kB random bytes (incompressible, like JPEGs). Then, inside the page
 * (`__saTest.idbOverview.perfRoundTrip`): export, clear the parts, check the
 * file, merge it. Twice: without images, then images alone.
 *
 * Run: node tests/support/probe-idb-export-import.js [--runs=3]
 * Prints one JSON object: machine block, UTC start/finish, per-run timings.
 */

const path = require('path');
const { chromium } = require('playwright');
const { loadUserscriptPage } = require('./loadPage');
const { machineInfo } = require('./runMetadata');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'artist-recordings.html');

/**
 * Reads `--runs=N` (default 3).
 * @param {string[]} argv
 * @returns {{runs: number}}
 */
function parseArgs(argv) {
    const a = argv.find((x) => x.startsWith('--runs='));
    return { runs: a ? Math.max(1, Number(a.split('=')[1]) || 3) : 3 };
}

/**
 * Seeds the synthetic cache before the userscript opens the database.
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
async function seed(page) {
    await page.addInitScript(() => {
        window.__seedDone = false;
        const now = Date.now();
        const req = indexedDB.open('vz-mb-saed-art-cache', 4);
        req.onupgradeneeded = () => {
            const db = req.result;
            [['images', 'url'], ['metadata', 'entityPath'], ['rel-ws2', 'ckey'], ['ms-rec-len', 'gid'],
                ['recof-ws2', 'ckey'], ['artist-works', 'artist']].forEach(([n, k]) => {
                if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: k });
            });
        };
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['images', 'metadata', 'rel-ws2', 'ms-rec-len', 'recof-ws2'], 'readwrite');
            const hex = (i, n) => i.toString(16).padStart(n, '0');
            const mbid = (i) => `${hex(i, 8)}-0000-4000-8000-${hex(i, 12)}`;
            const rel = { relations: Array.from({ length: 4 }, (_, k) => ({ type: 'producer', direction: 'backward', 'target-type': 'artist',
                artist: { id: mbid(k), name: `Producer ${k}`, 'sort-name': `Producer ${k}` }, attributes: [], begin: null, end: null })) };
            for (let i = 0; i < 8000; i++) tx.objectStore('rel-ws2').put({ ckey: `release:${mbid(i)}`, data: rel, ts: now - (i % 20) * 86400000 });
            for (let i = 0; i < 6000; i++) {
                tx.objectStore('metadata').put({ entityPath: `/release/${mbid(i)}`, count: 2,
                    images: [{ id: i, front: true, types: ['Front'], thumbnails: { 250: `https://coverartarchive.org/release/${mbid(i)}/${i}-250.jpg` } }], storedAt: now });
            }
            for (let i = 0; i < 4000; i++) tx.objectStore('recof-ws2').put({ ckey: `recording:${mbid(i)}|work-rels`, mbid: mbid(i), rels: [{ work: mbid(i + 1), title: `Song ${i}` }], ts: now });
            for (let i = 0; i < 2000; i++) tx.objectStore('ms-rec-len').put({ gid: mbid(i), ms: 180000 + i, ts: now });
            for (let i = 0; i < 300; i++) {
                const bytes = new Uint8Array(150000);
                crypto.getRandomValues(bytes.subarray(0, 65536));
                crypto.getRandomValues(bytes.subarray(65536, 131072));
                crypto.getRandomValues(bytes.subarray(131072));
                tx.objectStore('images').put({ url: `https://coverartarchive.org/release/${mbid(i)}/front-250`, blob: new Blob([bytes], { type: 'image/jpeg' }), storedAt: now });
            }
            tx.oncomplete = () => { db.close(); window.__seedDone = true; };
        };
    });
}

(async () => {
    const { runs } = parseArgs(process.argv.slice(2));
    const started = new Date().toISOString();
    const browser = await chromium.launch();
    const results = [];
    try {
        for (let r = 0; r < runs; r++) {
            const page = await browser.newPage();
            await seed(page);
            await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
            await page.waitForFunction(() => window.__seedDone === true, null, { timeout: 120000 });
            const json = await page.evaluate(() => window.__saTest.idbOverview.perfRoundTrip(['metadata', 'rel-ws2', 'ms-rec-len', 'recof-ws2']));
            const images = await page.evaluate(() => window.__saTest.idbOverview.perfRoundTrip(['images']));
            results.push({ run: r + 1, json, images });
            await page.close();
        }
    } finally {
        await browser.close();
    }
    console.log(JSON.stringify({ started, finished: new Date().toISOString(), machine: machineInfo(),
                                 chromium: chromium.name(), results }, null, 2));
})();
