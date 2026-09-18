'use strict';

/**
 * Reports which entity links the committed `artist-releases-dylan` disk
 * fixture carries per column, and how many rows carry a `/release-group/`
 * link in a cell that is NEITHER the sticky first column NOR the rel cell.
 *
 * Why: the seeded `--rel-arm=expanded` perf arm started rendering 0 icons on
 * BOTH `main` (9.99.1092) and the feature branch, where it rendered 2090 at
 * 9.99.1073. The seed is keyed `release:<mbid>`, and since 9.99.1086
 * `_suppressRelationshipsIfNoReleaseOrReleaseGroupLinks()` stamps
 * `table.dataset.mbRelEntityType = _rgLink ? 'release-group' : 'release'`
 * from exactly that selector — so a release-group link anywhere outside the
 * sticky/rel cells would key every lookup `release-group:<release mbid>` and
 * miss every seeded record.
 *
 *   node scripts/inspect-dylan-fixture-links.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FIXTURE = path.join(
    __dirname, '..', 'tests', 'fixtures', 'saved-data', 'artist-releases-dylan.json.gz');

const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString('utf8'));

console.log('fixture      :', path.relative(process.cwd(), FIXTURE));
console.log('top-level keys:', Object.keys(payload).join(', '));
console.log('version      :', payload.version, ' pageType:', payload.pageType);

const headers = payload.headers || (payload.data && payload.data.headers) || null;
console.log('headers      :', JSON.stringify(headers));

/** Every row array, whichever shape the snapshot used. */
const rows = payload.rows
    || (payload.data && payload.data.rows)
    || (payload.groups || []).flatMap((g) => g.rows || []);
console.log('rows         :', Array.isArray(rows) ? rows.length : '(not an array)');

if (!Array.isArray(rows) || !rows.length) {
    console.log('row shape    :', JSON.stringify(payload).slice(0, 600));
    process.exit(0);
}
console.log('first row shape:', JSON.stringify(rows[0]).slice(0, 400));

/** @param {*} row @returns {string[]} the row's per-cell HTML strings. */
function cellsOf(row) {
    if (Array.isArray(row)) return row.map((c) => (typeof c === 'string' ? c : JSON.stringify(c)));
    if (row && Array.isArray(row.cells)) {
        return row.cells.map((c) => (typeof c === 'string' ? c : (c && c.html) || JSON.stringify(c)));
    }
    return [];
}

const perColumn = [];
let rowsWithRgOutsideFirst = 0;
rows.forEach((row) => {
    const cells = cellsOf(row);
    let rgOutsideFirst = false;
    cells.forEach((html, i) => {
        perColumn[i] = perColumn[i] || { release: 0, releaseGroup: 0, work: 0, label: 0 };
        if (html.includes('/release-group/')) {
            perColumn[i].releaseGroup += 1;
            if (i > 0) rgOutsideFirst = true;
        }
        if (/\/release\/[0-9a-f]{8}/.test(html)) perColumn[i].release += 1;
        if (html.includes('/work/')) perColumn[i].work += 1;
        if (html.includes('/label/')) perColumn[i].label += 1;
    });
    if (rgOutsideFirst) rowsWithRgOutsideFirst += 1;
});

console.log('\nper-column link counts (index: release / release-group / work / label)');
perColumn.forEach((c, i) => {
    const name = (headers && headers[i]) || `col${i}`;
    console.log(`  ${String(i).padStart(2)} ${String(name).slice(0, 28).padEnd(30)} `
        + `${String(c.release).padStart(5)} ${String(c.releaseGroup).padStart(6)} `
        + `${String(c.work).padStart(5)} ${String(c.label).padStart(5)}`);
});
console.log('\nrows with a /release-group/ link outside column 0:', rowsWithRgOutsideFirst);
