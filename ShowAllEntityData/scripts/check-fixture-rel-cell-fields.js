'use strict';

/**
 * Reports whether a committed disk fixture's saved cells carry the per-cell
 * `mbid`/`relDone` fields that `_hydrateAndRenderFromSnapshotData()` needs in
 * order to stamp `td.mb-rel-cell` on restore.
 *
 * This is the other half of the 2026-09-16 Load-from-Disk defect: since
 * 9.99.1086 the disk-load tail gates `initRelationshipsColumn()` on
 * `_relPageHasColumn()` — i.e. on a `td.mb-rel-cell` already existing — while
 * `_ensureRelCell()`, inside that very function, is what creates those cells
 * for a snapshot that never had the column. `_buildDiskCellData()` writes
 * `mbid` only for a cell that was already `.mb-rel-cell` at save time, so a
 * file saved with the column off restores with none, and the guard can never
 * become true.
 *
 *   node scripts/check-fixture-rel-cell-fields.js [name ...]
 *
 * Defaults to every `tests/fixtures/saved-data/*.json.gz`.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'saved-data');
const names = process.argv.slice(2).length
    ? process.argv.slice(2)
    : fs.readdirSync(DIR).filter((f) => f.endsWith('.json.gz') && !f.startsWith('rel-ws2-'));

names.forEach((name) => {
    const file = path.join(DIR, name);
    let payload;
    try {
        payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    } catch (err) {
        console.log(`${name.padEnd(42)} unreadable: ${err.message}`);
        return;
    }
    const rows = payload.rows || (payload.groups || []).flatMap((g) => g.rows || []);
    let cells = 0, withMbid = 0, withRelDone = 0;
    rows.forEach((rowCells) => {
        (rowCells || []).forEach((c) => {
            cells += 1;
            if (c && Object.prototype.hasOwnProperty.call(c, 'mbid')) withMbid += 1;
            if (c && c.relDone) withRelDone += 1;
        });
    });
    console.log(`${name.padEnd(42)} v${payload.version} ${String(payload.pageType).padEnd(24)} `
        + `rows=${String(rows.length).padStart(5)} cells=${String(cells).padStart(6)} `
        + `mbid=${String(withMbid).padStart(5)} relDone=${String(withRelDone).padStart(5)}`);
});
