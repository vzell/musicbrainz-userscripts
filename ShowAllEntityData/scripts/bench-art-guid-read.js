'use strict';
/**
 * Micro-benchmark: the per-row cost `_cellArtEntityGuid()` adds to every
 * re-render of a page with inline artwork (it runs once per settled cell in
 * `_artSetInlineSortKey()`, which Case C1 calls for every row on every render).
 * Cells mimic a Release cell: inline placeholder, release link, artist link,
 * cover-art link. Mirrors the function body exactly.
 *
 * usage: node scripts/bench-art-guid-read.js [rowCount=4174] [passes=20]
 */
const os = require('os');
const { chromium } = require('playwright');

(async () => {
    const rowCount = Number(process.argv[2] || 4174);
    const passes = Number(process.argv[3] || 20);
    const startedAt = new Date().toISOString();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const result = await page.evaluate(({ n, p }) => {
        const guid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => (Math.random() * 16 | 0).toString(16));
        const table = document.createElement('table');
        const tbody = table.appendChild(document.createElement('tbody'));
        const cells = [];
        for (let i = 0; i < n; i++) {
            const tr = tbody.appendChild(document.createElement('tr'));
            const td = tr.appendChild(document.createElement('td'));
            const g = guid();
            td.innerHTML = `<span class="mb-caa-inline-ph"><img alt=""></span><a href="/release/${g}"><bdi>Title ${i}</bdi></a>` +
                ` by <a href="/artist/${guid()}"><bdi>Artist</bdi></a> <a href="/release/${g}/cover-art"><span class="caa-icon"></span></a>`;
            cells.push(td);
        }
        document.body.appendChild(table);
        const read = (cell) => {
            for (const a of cell.querySelectorAll('a[href]')) {
                const m = /\/(?:release-group|release|event)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
                    .exec(a.getAttribute('href') || '');
                if (m) return m[1];
            }
            return null;
        };
        const times = [];
        for (let k = 0; k < p; k++) {
            const t0 = performance.now();
            for (const c of cells) read(c);
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return { perPassMedianMs: +times[Math.floor(p / 2)].toFixed(2), perCellUs: +(times[Math.floor(p / 2)] / n * 1000).toFixed(2) };
    }, { n: rowCount, p: passes });
    await browser.close();
    console.log(JSON.stringify({
        machine: { hostname: os.hostname(), cores: os.cpus().length, node: process.version },
        startedAt, finishedAt: new Date().toISOString(), rowCount, passes, ...result,
    }, null, 2));
})();
