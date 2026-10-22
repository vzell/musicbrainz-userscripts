/**
 * Org tables from scripts/measure-script-load-cost.js JSON output, for
 * tests/MEASUREMENTS.org and org/userscript-size.org.
 *
 * Prints, per JSON file and throttle rate: a timing table (median and
 * p10–p90 of sync, settled and ScriptDuration) and, when the run had
 * `--memory`, a memory table (private footprint and its allocators, as
 * medians, plus each arm's footprint delta against the `none` arm). Ratios
 * against `real` are printed because absolutes are not comparable across
 * sessions (CLAUDE.md, "Performance is a priority").
 *
 *     node scripts/summarize-load-cost.js <load-cost.json> [more.json …]
 */

'use strict';

const fs = require('fs');

/**
 * Format a number with a fixed number of decimals, or `–` for NaN.
 *
 * @param {number} x - Value.
 * @param {number} [d=1] - Decimals.
 * @returns {string}
 */
function fmt(x, d = 1) {
    return Number.isFinite(x) ? x.toFixed(d) : '–';
}

/**
 * Print one org table with aligned columns.
 *
 * @param {string[]} head - Header cells.
 * @param {string[][]} rows - Body rows.
 * @returns {void}
 */
function printTable(head, rows) {
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
    const line = (cells) => '| ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
    console.log(line(head));
    console.log('|' + widths.map(w => '-'.repeat(w + 2)).join('+') + '|');
    rows.forEach(r => console.log(line(r)));
}

/**
 * Summarise one JSON result file.
 *
 * @param {string} file - Path of a measure-script-load-cost.js output.
 * @returns {void}
 */
function summarize(file) {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    const names = Object.keys(r.arms);
    console.log(`* ${r.what}`);
    console.log(`  ${r.scriptVersion} · ${r.branch} · ${r.machine.hostname} · ${r.browser} · ${r.tampermonkey}`);
    console.log(`  ${r.startedAt} – ${r.finishedAt} · page: ${r.page ? (r.page.file || r.page.url) : 'gate page'}`);
    console.log(`  runs ${r.options.runs} + warmup ${r.options.warmup} per arm and rate\n`);
    for (const rate of r.options.throttle) {
        const real = r.arms.real && r.arms.real.byThrottle[rate];
        const rows = names.map((n) => {
            const b = r.arms[n].byThrottle[rate];
            const ratio = real && n !== 'real' ? fmt(b.syncMs.median / real.syncMs.median, 2) : '';
            return [
                n, r.arms[n].size.bytes.toLocaleString('en-US'),
                fmt(b.syncMs.median), `${fmt(b.syncMs.p10)}–${fmt(b.syncMs.p90)}`, ratio,
                fmt(b.settledMs.median), fmt(b.scriptDurationMs.median), `${b.syncMs.n}/${b.invalid}`,
            ];
        });
        console.log(`CPU ×${rate}`);
        printTable(['Arm', 'Bytes', 'sync ms', 'p10–p90', '÷ real', 'settled ms', 'ScriptDuration ms', 'n/invalid'], rows);
        console.log('');
        const none = r.arms.none && r.arms.none.byThrottle[rate].memory;
        if (!r.arms[names[0]].byThrottle[rate].memory) continue;
        const memRows = names.map((n) => {
            const m = r.arms[n].byThrottle[rate].memory;
            const delta = none ? fmt(m.privateFootprintMB.median - none.privateFootprintMB.median) : '';
            return [
                n, fmt(m.privateFootprintMB.median), delta, fmt(m.parkableStringsMB.median), fmt(m.v8MB.median),
                fmt(m.partitionAllocMB.median), fmt(m.mallocMB.median), fmt(m.blinkGcMB.median), fmt(m.pssMB.median),
            ];
        });
        console.log(`Memory, CPU ×${rate} (MB, medians)`);
        printTable(['Arm', 'footprint', 'Δ none', 'parkable strings', 'v8', 'partition_alloc', 'malloc', 'blink_gc', 'PSS'], memRows);
        console.log('');
    }
}

process.argv.slice(2).forEach(summarize);
