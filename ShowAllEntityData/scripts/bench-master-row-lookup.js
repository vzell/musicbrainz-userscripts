'use strict';
/**
 * Micro-benchmark: what `_findMasterRowByIdx()`'s linear scan costs when it runs
 * once per row (e.g. once per artwork settle), on a page-sized set of detached
 * source rows. Mirrors its exact loop: `rows.find(r => r.dataset.mbRowIdx === idx)`.
 *
 * usage: node scripts/bench-master-row-lookup.js [rowCount=4174] [cellsPerRow=20]
 */
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
        const order = rows.map((_, i) => String(i)).sort(() => Math.random() - 0.5);
        const t0 = performance.now();
        let hits = 0;
        for (const idx of order) if (rows.find(r => r.dataset.mbRowIdx === idx)) hits++;
        const total = performance.now() - t0;
        return { hits, totalMs: +total.toFixed(1), perLookupMs: +(total / n).toFixed(4) };
    }, { n: rowCount, c: cells });
    await browser.close();
    console.log(JSON.stringify({
        machine: { hostname: os.hostname(), cores: os.cpus().length, node: process.version },
        startedAt, finishedAt: new Date().toISOString(), rowCount, cellsPerRow: cells, ...result,
    }, null, 2));
})();
