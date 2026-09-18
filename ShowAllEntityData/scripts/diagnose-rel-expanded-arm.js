'use strict';

/**
 * One-load diagnostic for the seeded `--rel-arm=expanded` perf arm.
 *
 * The arm started failing its own icon floor with *0* icons rendered, on BOTH
 * `main` (9.99.1092) and the `rel-column-batch-and-cell-states` branch, where
 * it rendered 2090 at 9.99.1073. `capture-interaction-perf.js` throws at that
 * floor and exits, which says the arm is broken but not WHERE, so this loads
 * the same page once and reports every link in the chain:
 *
 *   1. does the Relationships column exist on the load-from-disk path at all
 *      (`td.mb-rel-cell`, and how many carry `data-mbid`)?
 *   2. what entity type is the table stamped with
 *      (`table.dataset.mbRelEntityType`) — the seed is keyed `release:<mbid>`?
 *   3. is the table expanded or collapsed (`data-mb-rel-expanded`)?
 *   4. did the seed write reach IndexedDB, and does a cell's own ckey hit it?
 *   5. did anything go to the network, and for which entity?
 *
 * It deliberately reuses the harness's own loaders rather than re-deriving
 * them, so what it reports is what the arm sees.
 *
 *   node scripts/diagnose-rel-expanded-arm.js
 */

const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('../tests/support/diskFixture');
const { seedGmValues } = require('../tests/support/gmStubs');
const { waitForRenderComplete } = require('../tests/support/browser');
const { toArm, applyRelArm } = require('../tests/support/perfDescriptors');
const { seedRelWs2Store, seedPathFor, DB_NAME } = require('../tests/support/relWs2Seed');

const ARM = process.argv.includes('--arm=collapsed') ? 'collapsed' : 'expanded';

(async () => {
    const config = applyRelArm(toArm('artist-releases-dylan'), ARM);
    const seedPath = seedPathFor('artist-releases-dylan');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const ws2 = [];
    page.on('request', (req) => { if (req.url().includes('/ws/2/')) ws2.push(req.url()); });
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err.message || err)));

    await seedGmValues(page, config.seedGmValues);
    let seedInfo = null;
    await loadFromDiskFixture(page, {
        url: config.url,
        fixturePath: config.fixturePath,
        testMode: true,
        beforeRender: ARM === 'expanded'
            ? async (p) => { seedInfo = await seedRelWs2Store(p, seedPath); }
            : undefined,
    });
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });
    console.log('seedInfo      :', JSON.stringify(seedInfo));

    // Same settle shape as the harness: poll the icon count to stability.
    let last = -1, stable = 0;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && stable < 4) {
        /* eslint-disable no-await-in-loop */
        const n = await page.locator('table.tbl tbody td.mb-rel-cell a').count();
        stable = (n === last && n > 0) ? stable + 1 : 0;
        last = n;
        await page.waitForTimeout(250);
        /* eslint-enable no-await-in-loop */
    }
    console.log('icons rendered:', last);

    const dom = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table.tbl'));
        const cells = Array.from(document.querySelectorAll('td.mb-rel-cell'));
        const withMbid = cells.filter((td) => td.dataset.mbid);
        const done = cells.filter((td) => td.dataset.relDone === '1');
        const th = document.querySelector('th.mb-injected-column[data-col-name="Relationships"]')
            || Array.from(document.querySelectorAll('thead th'))
                .find((t) => (t.dataset.colName || '') === 'Relationships');
        const firstRow = document.querySelector('table.tbl tbody tr');
        return {
            tables: tables.length,
            relTh: !!th,
            // A <th> with no matching <td> misaligns every column after it, so
            // these two counts are what separate "column absent" from "table
            // corrupted".
            theadThCount: document.querySelectorAll('table.tbl thead tr:first-child th').length,
            firstRowTdCount: firstRow ? firstRow.cells.length : null,
            relThIndex: th ? Array.from(th.parentNode.children).indexOf(th) : null,
            relCells: cells.length,
            cellsWithMbid: withMbid.length,
            cellsDone: done.length,
            sampleMbids: withMbid.slice(0, 3).map((td) => td.dataset.mbid),
            tableStamps: tables.map((t) => ({
                entityType: t.dataset.mbRelEntityType || null,
                expanded: t.dataset.mbRelExpanded || null,
                rows: t.querySelectorAll('tbody tr').length,
            })),
            relTableStates: (window.__saTest && window.__saTest.relTableStates)
                ? window.__saTest.relTableStates() : null,
            relInitRuns: (window.__saTest && window.__saTest.relInitRuns)
                ? window.__saTest.relInitRuns() : null,
        };
    });
    console.log('DOM           :', JSON.stringify(dom, null, 2));

    const idb = await page.evaluate(async ({ dbName, mbids }) => {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName);
            req.onsuccess = (ev) => resolve(ev.target.result);
            req.onerror = (ev) => reject(ev.target.error);
        });
        const store = () => db.transaction('rel-ws2', 'readonly').objectStore('rel-ws2');
        const count = await new Promise((r) => { const q = store().count(); q.onsuccess = () => r(q.result); });
        const someKeys = await new Promise((r) => {
            const q = store().getAllKeys(null, 3); q.onsuccess = () => r(q.result);
        });
        const hits = [];
        for (const m of mbids) {
            /* eslint-disable no-await-in-loop */
            for (const et of ['release', 'release-group', 'label', 'work']) {
                const rec = await new Promise((r) => {
                    const q = store().get(`${et}:${m}`); q.onsuccess = () => r(q.result);
                });
                if (rec) hits.push(`${et}:${m}`);
            }
            /* eslint-enable no-await-in-loop */
        }
        db.close();
        return { version: db.version, count, someKeys, hits };
    }, { dbName: DB_NAME, mbids: dom.sampleMbids });
    console.log('IndexedDB     :', JSON.stringify(idb));

    console.log('ws2 requests  :', ws2.length, ws2.slice(0, 5));
    console.log('page errors   :', consoleErrors.slice(0, 5));
    await browser.close();
})();
