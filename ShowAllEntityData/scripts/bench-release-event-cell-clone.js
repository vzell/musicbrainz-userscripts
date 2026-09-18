/**
 * PERFORMANCE.org's Stage-1 gate for the native-markup "Release events" change.
 *
 * That change replaced a one-node-per-event cell
 *
 *     <li class="flag flag-US" title="United States (US)">US  2005-12-20</li>
 *
 * with MusicBrainz's own four-node shape
 *
 *     <li class="release-event">
 *       <span class="flag flag-US release-country">
 *         <a href="/area/…"><abbr title="United States">US</abbr></a></span>
 *       <span class="release-date">2005-12-20</span></li>
 *
 * so each cell carries roughly 4x the elements. Nothing in this repo's harness
 * can see that: `capture-interaction-perf.js` is hardcoded to artist-events and
 * artist-releases-dylan, and `--perf` to artist-releasegroups — none of which is
 * one of the four pageTypes that inject this column (place-performances and
 * label-relationships, each ±filtered).
 *
 * So measure the quantity that actually moved, rather than an end-to-end A/B
 * whose cross-host noise (1.5-1.85x, per CLAUDE.md) is an order of magnitude
 * larger than the effect. Two operations, both paid per re-render / per filter
 * pass over the whole column:
 *
 *   clone  `cell.cloneNode(true)`  — renderGroupedTable() always clones, and
 *                                    runFilter() re-renders per keystroke
 *   text   a TreeWalker text walk  — the core of getCleanColumnText(), which
 *                                    every filter and sort pass runs per cell
 *
 * Synthetic cells, deliberately, and the same construction for both arms: the
 * subject is the markup shape, and a real page adds artwork, IDB and network
 * noise that has nothing to do with it.
 *
 *     node scripts/bench-release-event-cell-clone.js [cells] [eventsPerCell]
 */

'use strict';

const os = require('os');
const { chromium } = require('playwright');

const SAMPLES = 5;
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

(async () => {
    const cellCount = Number(process.argv[2] || 2000);
    const perCell = Number(process.argv[3] || 1);
    const startedAt = new Date().toISOString();

    const browser = await chromium.launch();
    const page = await browser.newPage();

    const result = await page.evaluate(({ cellCount, perCell, SAMPLES }) => {
        const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

        const buildOld = (td, i) => {
            const ul = document.createElement('ul');
            for (let e = 0; e < perCell; e++) {
                const li = document.createElement('li');
                li.classList.add('flag', 'flag-US');
                li.title = 'United States (US)';
                li.textContent = `US  200${e}-12-2${i % 10}`;
                ul.appendChild(li);
            }
            td.appendChild(ul);
        };

        const buildNew = (td, i) => {
            const ul = document.createElement('ul');
            for (let e = 0; e < perCell; e++) {
                const li = document.createElement('li');
                li.setAttribute('aria-label', 'Release event');
                li.className = 'release-event';
                const span = document.createElement('span');
                span.className = 'flag flag-US release-country';
                const a = document.createElement('a');
                a.href = '/area/489ce91b-6658-3307-9877-795b68554c98';
                const abbr = document.createElement('abbr');
                abbr.title = 'United States';
                abbr.textContent = 'US';
                a.appendChild(abbr);
                span.appendChild(a);
                li.appendChild(span);
                const d = document.createElement('span');
                d.className = 'release-date';
                d.textContent = `200${e}-12-2${i % 10}`;
                li.appendChild(d);
                ul.appendChild(li);
            }
            td.appendChild(ul);
        };

        const makeCells = (build) => {
            const host = document.createElement('table');
            const tbody = document.createElement('tbody');
            const cells = [];
            for (let i = 0; i < cellCount; i++) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                build(td, i);
                tr.appendChild(td);
                tbody.appendChild(tr);
                cells.push(td);
            }
            host.appendChild(tbody);
            document.body.appendChild(host);
            return cells;
        };

        // Mirrors getCleanColumnText()'s core: SHOW_ELEMENT|SHOW_TEXT walk,
        // collecting trimmed text-node values.
        const walkText = (root) => {
            const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            const parts = [];
            let n;
            while ((n = w.nextNode())) {
                if (n.nodeType === Node.TEXT_NODE) {
                    const t = n.nodeValue.trim();
                    if (t) parts.push(t);
                }
            }
            return parts.join(' ');
        };

        const arm = (build) => {
            const cells = makeCells(build);
            const nodes = cells[0].querySelectorAll('*').length;
            const clone = [];
            const text = [];
            for (let s = 0; s < SAMPLES; s++) {
                let t0 = performance.now();
                let sink = 0;
                for (const c of cells) sink += c.cloneNode(true).childNodes.length;
                clone.push(performance.now() - t0);

                t0 = performance.now();
                let len = 0;
                for (const c of cells) len += walkText(c).length;
                text.push(performance.now() - t0);
                if (sink < 0 || len < 0) throw new Error('unreachable');
            }
            return { nodesPerCell: nodes, cloneMs: med(clone), textMs: med(text) };
        };

        return { old: arm(buildOld), neu: arm(buildNew) };
    }, { cellCount, perCell, SAMPLES });

    await browser.close();

    const r2 = (x) => Math.round(x * 100) / 100;
    console.log(JSON.stringify({
        what: 'release-event cell shape: clone + text-walk cost, old vs native markup',
        cells: cellCount,
        eventsPerCell: perCell,
        samples: SAMPLES,
        startedAt,
        finishedAt: new Date().toISOString(),
        machine: {
            hostname: os.hostname(), cpus: os.cpus().length,
            totalMemGb: Math.round(os.totalmem() / 2 ** 30),
            node: process.version, uptimeHours: r2(os.uptime() / 3600),
        },
        old: { ...result.old, cloneMs: r2(result.old.cloneMs), textMs: r2(result.old.textMs) },
        native: { ...result.neu, cloneMs: r2(result.neu.cloneMs), textMs: r2(result.neu.textMs) },
        ratio: {
            nodesPerCell: r2(result.neu.nodesPerCell / result.old.nodesPerCell),
            clone: r2(result.neu.cloneMs / result.old.cloneMs),
            text: r2(result.neu.textMs / result.old.textMs),
        },
        deltaMs: {
            clone: r2(result.neu.cloneMs - result.old.cloneMs),
            text: r2(result.neu.textMs - result.old.textMs),
        },
    }, null, 2));
})();
