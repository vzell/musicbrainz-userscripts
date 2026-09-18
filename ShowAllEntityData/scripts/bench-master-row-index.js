/**
 * Sibling of `bench-master-row-lookup.js`: what does resolving EVERY row cost,
 * per-row linear scan versus one shared index?
 *
 * `bench-master-row-lookup.js` measured a single `_findMasterRowByIdx()`-shaped
 * scan (0.69 ms at 4174 rows, 1.89 ms at 10 000 — `tests/MEASUREMENTS.org`) and
 * settled a design question about ONE lookup per settle. This one answers the
 * other question: `_artInitInlinePics()`'s Case C1 mirrors every already-painted
 * placeholder on every multi-table re-render, so it pays that scan once per row,
 * which is O(N²).
 *
 * Two shapes, over identical rows in the same page:
 *
 *   scan   N × `rows.find(r => r.dataset.mbRowIdx === idx)`   — today
 *   index  1 × Map build over N rows, then N × `Map.get()`    — proposed
 *
 * Synthetic rows, deliberately: the quantity is the lookup strategy, and a real
 * page adds artwork, IDB and network noise that has nothing to do with it. Same
 * construction as the sibling bench so the two numbers are comparable.
 *
 *     node scripts/bench-master-row-index.js [rows] [cellsPerRow]
 */

'use strict';

const os = require('os');
const { chromium } = require('playwright');

(async () => {
    const rowCount = Number(process.argv[2] || 4174);
    const cells = Number(process.argv[3] || 20);
    const startedAt = new Date().toISOString();
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const result = await page.evaluate(({ n, c }) => {
        const rows = [];
        for (let i = 0; i < n; i++) {
            const tr = document.createElement('tr');
            tr.dataset.mbRowIdx = String(i);
            for (let j = 0; j < c; j++) tr.appendChild(document.createElement('td'));
            rows.push(tr);
        }
        // Shuffled, like a rendered table whose rows were sorted or filtered:
        // a scan that happened to walk in insertion order would flatter itself.
        const order = rows.map((_, i) => String(i)).sort(() => Math.random() - 0.5);

        // --- today: one linear scan per row -----------------------------
        let t = performance.now();
        let hits = 0;
        for (const idx of order) {
            if (rows.find((r) => r.dataset.mbRowIdx === idx)) hits++;
        }
        const scanMs = performance.now() - t;

        // --- proposed: build once, then look up -------------------------
        t = performance.now();
        const idxMap = new Map();
        for (const r of rows) idxMap.set(r.dataset.mbRowIdx, { row: r, owner: rows });
        const buildMs = performance.now() - t;

        t = performance.now();
        let indexHits = 0;
        for (const idx of order) {
            if (idxMap.get(idx)) indexHits++;
        }
        const lookupMs = performance.now() - t;

        return {
            hits,
            indexHits,
            scanTotalMs: +scanMs.toFixed(1),
            scanPerRowMs: +(scanMs / n).toFixed(4),
            indexBuildMs: +buildMs.toFixed(2),
            indexLookupTotalMs: +lookupMs.toFixed(2),
            indexTotalMs: +(buildMs + lookupMs).toFixed(2),
            speedup: +(scanMs / (buildMs + lookupMs)).toFixed(1),
        };
    }, { n: rowCount, c: cells });

    await browser.close();

    if (result.hits !== result.indexHits || result.hits !== rowCount) {
        console.error(`WARNING: the two shapes disagree (${result.hits} vs ${result.indexHits} of ${rowCount})`);
    }

    console.log(JSON.stringify({
        what: 'resolving every master row: per-row scan vs one shared index',
        machine: {
            hostname: os.hostname(), cores: os.cpus().length, node: process.version,
            uptimeHours: +(os.uptime() / 3600).toFixed(1),
        },
        startedAt, finishedAt: new Date().toISOString(),
        rowCount, cellsPerRow: cells, ...result,
    }, null, 2));
})();
