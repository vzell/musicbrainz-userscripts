#!/usr/bin/env node
/**
 * Times a disk-fixture load end to end — the part capture-interaction-perf.js
 * deliberately leaves outside its brackets — for a change that costs render
 * time, not interaction time (the rec-dup finding's grouping inside
 * stampFindings(), 2026-11-20).
 *
 * Per sample: a fresh page, loadFromDiskFixture() of the arm's fixture, then
 * the render tail (waitForRenderComplete()); reports the wall clock of that
 * and every performance.measure() the page recorded whose name starts with
 * "sa-" (on the branch: sa-findings-stamp, sa-findings-recdup). Run one
 * process per arm; SA_USERSCRIPT_PATH selects another copy of the userscript
 * (`git show main:ShowAllEntityData.user.js > …`), as loadPage.js documents.
 *
 * usage: [SA_USERSCRIPT_PATH=…] node tests/support/measure-disk-load.js --label=main [--samples=7] [--out=FILE]
 * The arm is Petty's artist-recordings fixture (tests/support/pettyArtistRecordingsFixture.js).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const { chromium } = require('@playwright/test');
const { loadFromDiskFixture } = require('./diskFixture');
const { waitForRenderComplete } = require('./browser');
const { USERSCRIPT_PATH } = require('./loadPage');
const PETTY = require('./pettyArtistRecordingsFixture');

/**
 * The value of one `--name=value` argument.
 * @param {string} name
 * @param {string} [def]
 * @returns {string|undefined}
 */
function arg(name, def) {
    const a = process.argv.find(x => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : def;
}

/**
 * The median of a list of numbers.
 * @param {number[]} xs
 * @returns {?number}
 */
function median(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Runs the samples and prints/writes the result. */
async function main() {
    const label = arg('label', 'arm');
    const samples = Number(arg('samples', '7'));
    const browser = await chromium.launch();
    const runs = [];
    for (let i = 0; i < samples; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const t0 = Date.now();
        await loadFromDiskFixture(page, {
            url: PETTY.URL, fixturePath: PETTY.FIXTURE_PATH, testMode: true,
            settingsOverride: PETTY.SEED_GM_VALUES,
        });
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const wallMs = Date.now() - t0;
        const measures = await page.evaluate(() => {
            const out = {};
            performance.getEntriesByType('measure').filter(m => m.name.startsWith('sa-')).forEach(m => {
                out[m.name] = (out[m.name] || 0) + m.duration;
            });
            return out;
        });
        runs.push({ wallMs, measures });
        process.stderr.write(`[${label}] sample ${i + 1}/${samples}: ${wallMs} ms ${JSON.stringify(measures)}\n`);
        await context.close();
    }
    await browser.close();
    const names = [...new Set(runs.flatMap(r => Object.keys(r.measures)))];
    const result = {
        label, script: USERSCRIPT_PATH, fixture: PETTY.FIXTURE_PATH, rows: PETTY.TOTAL_ROWS, samples,
        machine: { host: os.hostname(), platform: `${os.platform()} ${os.release()}`, chromium: chromium.name() },
        when: new Date().toISOString(),
        median: { wallMs: median(runs.map(r => r.wallMs)), ...Object.fromEntries(names.map(n => [n, median(runs.map(r => r.measures[n] || 0))])) },
        runs,
    };
    const out = arg('out');
    if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ label, median: result.median }));
}

main().catch(e => { console.error(e); process.exit(1); });
