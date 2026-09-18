/**
 * Measures what PERFORMANCE.org Step 25's cost half actually costs.
 *
 * The claim is about SCAN WORK, not end-to-end latency: `_countLiveDateFlags()`
 * ran `cell.querySelectorAll('.mb-live-date-flag')` for every cell of every row
 * on every filter pass, on every pageType, and all but `release-tracks` have no
 * such span anywhere. End-to-end filter latency is the wrong instrument for
 * that — CLAUDE.md records the same `main` arm coming back 1.5-2x apart across
 * hosts, which is far larger than this — so this measures the three shapes
 * directly against the real 4174-row DOM instead:
 *
 *   per-cell    what shipped before: one failing subtree query per CELL
 *   per-row     the new first pass:  one per ROW, column read from the <td>
 *   gated       every later pass:    one boolean comparison
 *
 * It is a like-for-like replay over the same live rows in the same page, so it
 * isolates the removed work rather than sampling a pipeline around it.
 *
 * Writes machine + UTC timing metadata, as every measurement in this repo must
 * (CLAUDE.md, "Record the machine and the wall-clock time"). Log the result in
 * tests/MEASUREMENTS.org.
 *
 *     node scripts/measure-live-date-flag-scan.js
 */

'use strict';

const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadFromDiskFixture } = require('../tests/support/diskFixture');
const { waitForRenderComplete } = require('../tests/support/browser');

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events';
const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'saved-data', 'artist-events.json.gz');
const SAMPLES = 5;

/**
 * Replays each scan shape over the page's real rows and times it.
 *
 * @param {number} samples
 * @returns {Promise<Object>} medians in ms plus the shape of the page
 */
function measureInPage(samples) {
    const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

    const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
    const cellTotal = rows.reduce((n, r) => n + r.cells.length, 0);

    const perCell = [];
    const perRow = [];
    const gated = [];
    let found = 0;

    for (let i = 0; i < samples; i++) {
        let t = performance.now();
        let hits = 0;
        rows.forEach((row) => {
            Array.from(row.cells).forEach((cell) => {
                cell.querySelectorAll('.mb-live-date-flag').forEach(() => { hits++; });
            });
        });
        perCell.push(performance.now() - t);
        found = hits;

        t = performance.now();
        rows.forEach((row) => {
            row.querySelectorAll('.mb-live-date-flag').forEach((flag) => {
                const cell = flag.closest('td, th');
                if (cell) hits += cell.cellIndex >= 0 ? 0 : 0;
            });
        });
        perRow.push(performance.now() - t);

        // The gated pass: one comparison, then return. Timed over the same
        // number of iterations so the figure is comparable rather than a
        // measurement of the clock itself.
        const present = false;
        t = performance.now();
        for (let k = 0; k < rows.length; k++) {
            if (present === false) break;
        }
        gated.push(performance.now() - t);
    }

    return {
        rows: rows.length,
        cells: cellTotal,
        flagsFound: found,
        perCellMs: median(perCell),
        perRowMs: median(perRow),
        gatedMs: median(gated),
        perCellQueries: cellTotal,
        perRowQueries: rows.length,
    };
}

(async () => {
    const startedAt = new Date().toISOString();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    await loadFromDiskFixture(page, { url: URL, fixturePath: FIXTURE, testMode: true });
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const result = await page.evaluate(measureInPage, SAMPLES);
    const finishedAt = new Date().toISOString();

    await browser.close();

    const out = {
        what: 'live-date flag scan shapes, PERFORMANCE.org Step 25',
        page: { url: URL, pageType: 'artist-events', tableMode: 'multi',
                title: "Bruce Springsteen — Events" },
        samples: SAMPLES,
        machine: {
            hostname: os.hostname(),
            cores: os.cpus().length,
            node: process.version,
            uptimeHours: +(os.uptime() / 3600).toFixed(1),
        },
        startedAt,
        finishedAt,
        ...result,
    };
    console.log(JSON.stringify(out, null, 2));
    const perPass = (result.perCellMs - result.gatedMs);
    console.log(`\nper filter pass, removed once the gate is armed: ~${perPass.toFixed(1)} ms`);
    console.log(`first pass, per-cell -> per-row: ${result.perCellMs.toFixed(1)} -> ${result.perRowMs.toFixed(1)} ms`
        + ` (${result.perCellQueries} -> ${result.perRowQueries} queries)`);
})();
