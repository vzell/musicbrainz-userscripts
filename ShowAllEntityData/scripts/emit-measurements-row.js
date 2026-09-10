'use strict';

/**
 * Emit ready-to-paste `tests/MEASUREMENTS.org` result rows from
 * interaction-perf JSON files.
 *
 * `MEASUREMENTS.org`'s own "Rules for adding a row" says to record the host and
 * the time "from the run itself and not from memory", and to copy them from the
 * JSON's `machine` block and `startedAt`/`finishedAt`. This does that
 * mechanically, because hand-transcribing seven medians plus a host and a UTC
 * time across three arms is exactly where a digit goes missing — and a wrong
 * number in that file is worse than none, since later work quotes it.
 *
 *   node scripts/emit-measurements-row.js tests/snapshots/<pageType>/interaction-perf-*.json
 */

const fs = require('fs');

/** @param {number|undefined} n @returns {string} */
const ms = (n) => (typeof n === 'number' ? String(Math.round(n)) : '—');

const rows = [];
for (const file of process.argv.slice(2)) {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const i = d.interactions || {};
    const m = d.machine || {};
    const started = d.startedAt ? new Date(d.startedAt) : null;
    rows.push({
        date: d.capturedAt || (started ? started.toISOString().slice(0, 10) : '—'),
        time: started ? started.toISOString().slice(11, 16) : '(unknown)',
        host: m.hostname ? `=${m.hostname}=` : '(unknown)',
        script: d.scriptVersion || '—',
        arm: d.branch || '—',
        picardArm: d.picardArm || '',
        vals: [
            ms(i.globalFilter && i.globalFilter.medianMs),
            ms(i.columnFilter && i.columnFilter.medianMs),
            ms(i.sort && i.sort.medianMs),
            ms(i.uniqDropCold && i.uniqDropCold.medianMs),
            ms(i.uniqDropWarm && i.uniqDropWarm.medianMs),
            ms(i.headerCountsInitial && i.headerCountsInitial.medianMs),
            ms(i.headerCountsRestore && i.headerCountsRestore.medianMs),
        ],
        uptime: m.uptimeHours,
        claude: m.claudeResident,
        finishedAt: d.finishedAt,
    });
}

const HDR = ['Date', 'Time (UTC)', 'Host', 'Script', 'Arm',
    'global', 'column', 'sort', 'uniq cold', 'uniq warm', 'hdr init', 'hdr restore'];
const table = [HDR, ...rows.map((r) => [r.date, r.time, r.host, r.script, r.arm, ...r.vals])];
const w = HDR.map((_, c) => Math.max(...table.map((row) => String(row[c]).length)));
const line = (row) => '| ' + row.map((v, c) => (c < 5 ? String(v).padEnd(w[c]) : String(v).padStart(w[c]))).join(' | ') + ' |';

console.log(line(HDR));
console.log('|' + w.map((n) => '-'.repeat(n + 2)).join('+') + '|');
for (const r of rows) console.log(line([r.date, r.time, r.host, r.script, r.arm, ...r.vals]));

console.log('\nRun context (for the prose, not the table):');
for (const r of rows) {
    // claudeResident is an OBJECT in the JSON, not a boolean — template
    // interpolation renders it "[object Object]", which is exactly the kind of
    // useless artifact that then gets pasted into MEASUREMENTS.org. CLAUDE.md
    // requires the host CONDITIONS on the record, so print the real value.
    console.log(`  ${r.arm}: uptimeHours=${r.uptime}, `
        + `claudeResident=${JSON.stringify(r.claude)}, finishedAt=${r.finishedAt}`);
}

// Ratios between arms, which is the only form CLAUDE.md permits quoting across
// anything — absolutes are environment-bound, so a table of them says little
// without the within-session comparison spelled out.
if (rows.length > 1) {
    console.log('\nWithin-session ratios vs the FIRST arm listed:');
    const base = rows[0];
    for (const r of rows.slice(1)) {
        const parts = r.vals.map((v, k) => {
            const b = Number(base.vals[k]);
            const n = Number(v);
            return Number.isFinite(b) && Number.isFinite(n) && b > 0
                ? `${HDR[k + 5]} ${(n / b).toFixed(2)}x` : `${HDR[k + 5]} —`;
        });
        console.log(`  ${r.arm} / ${base.arm}: ${parts.join(', ')}`);
    }
}
