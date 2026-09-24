'use strict';

// The LENGTH ⚠️/❌ track-vs-recording mismatch marking must survive Save to
// Disk → Load from Disk.
//
// It is marked by `data-mb-len-flag` ON the duration `<td>`s themselves —
// attributes only, by design (`_applyLengthMismatchFlag()`'s JSDoc: a child
// element would be deleted by the colon-alignment rebuild, and cell text would
// reach the duration sort). But `_buildDiskCellData()` serialized a cell as its
// `innerHTML` plus colSpan/rowSpan and nothing else, so a reopened tracklist
// came back with every flag gone: no tint, no glyph, and — since both summary
// buttons hide at a count of 0 — no LENGTH buttons either. Measured before the
// fix (DEBUG-NOTES.md, the Step 26 entry): 8 flagged cells before the save, 0
// after the load.
//
// The fix carries the flag, and the tooltip explaining it, as two optional
// fields of the cell record. What each test pins:
//
//   - the round trip restores the SAME marking — kind and tooltip, per cell —
//     and the buttons count and filter it;
//   - a restored page saved again keeps it (so the reader re-marks the tooltip
//     as the script's own, which is what lets the writer take it again);
//   - switching flagging off before the load wins over a saved flag;
//   - the file is user-supplied data: a flag value outside the two kinds is
//     not written into the DOM, and a file with no flag fields — every file
//     saved before this — loads exactly as it always did.
//
// The sub-table handoff (`captureSubtableSnapshot()`) shares the writer, but a
// release tracklist does not offer it (`release-tracks` is not in
// `SA_SNAPSHOT_SUPPORTED_PAGETYPES`), and no other pageType has LENGTH flags,
// so that path is not reachable to test.

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

// "Born to Run", 8 tracks, one medium. At a 500 ms threshold and the default
// ×3 "far over" factor, A2/A3/B2 are ⚠️ and B3 (3 s) is ❌ — four flagged
// tracks, two cells each. release-tracks-recording-length.spec.js owns those
// numbers.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');
const SETTINGS = {
    sa_enable_release_tracks: true,
    sa_release_tracks_length_mismatch_threshold_ms: 500,
};
const FLAGGED_CELLS = 8;
const WARN_LABEL = '(3) LENGTH ⚠️';
const SEVERE_LABEL = '(1) LENGTH ❌';

// Serving a saved page: MusicBrainz's own supported-browser-check.js throws,
// and a versioned bundle it references answers with an HTML error page.
// Excluded by origin, not by message text — neither involves the userscript.
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

/** Every flagged cell's kind and tooltip, sorted, so two renders compare by value. */
const flaggedCells = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-len-flag]'))
        .map((td) => ({ kind: td.dataset.mbLenFlag, title: td.title, ownTip: td.dataset.mbColTip === '1' }))
        .sort((a, b) => (a.kind + a.title).localeCompare(b.kind + b.title)));

/** A button's label and visibility, or null when it is not in the DOM. */
const button = (page, id) => page.evaluate((i) => {
    const b = document.getElementById(i);
    return b ? { label: b.textContent, visible: b.style.display !== 'none' } : null;
}, id);

/** Rows currently rendered, excluding the column-filter row. */
const visibleRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length);

/** Opens a page on the release with the userscript and the given settings. */
async function openRelease(context, pageErrors, settings) {
    const page = await context.newPage();
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || '');
        if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
    });
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: settings });
    return page;
}

/** Saves the page through the real Save-to-Disk path; returns the file. */
async function saveToDisk(page, dir, name) {
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await clickToolbarItem(page, '#mb-save-to-disk-btn');
    await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
    await page.click('#sa-sd-save-confirm');
    const download = await downloadPromise;
    const saved = path.join(dir, name);
    await download.saveAs(saved);
    return saved;
}

/** Load from Disk → "Render All Rows", on the page as it stands. */
async function loadFromDisk(page, file) {
    await clickToolbarItem(page, '#mb-load-from-disk-btn');
    await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
    const renderBtn = page.locator('#sa-render-no-filter-confirm');
    await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
    // The dialog is position:fixed and its button can sit below the fold at
    // the project viewport — see diskFixture.js.
    await renderBtn.evaluate((el) => el.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Rewrites a saved .json.gz, passing every cell record through `edit`.
 * Handles both saved shapes (multi `groups[].rows`, single `rows`).
 */
function rewriteSavedCells(file, out, edit) {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    const rowSets = data.groups ? data.groups.map((g) => g.rows) : [data.rows];
    let seen = 0;
    rowSets.forEach((rows) => rows.forEach((cells) => cells.forEach((cell) => {
        if (edit(cell, seen)) seen++;
    })));
    fs.writeFileSync(out, zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8')));
    return seen;
}

test.describe('LENGTH mismatch flags survive Save to Disk → Load from Disk', () => {
    let pageErrors;
    let tmpDir;
    let saved;
    let before;

    test.beforeEach(async ({ context }) => {
        pageErrors = [];
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-len-flag-'));

        const source = await openRelease(context, pageErrors, SETTINGS);
        await source.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(source, { waitForAutoResize: false });

        before = await flaggedCells(source);
        // The fixture really is flagged the way the assertions below assume,
        // so a restored page with nothing on it cannot pass by agreeing with
        // an empty source.
        expect(before, 'the source tracklist carries its flags').toHaveLength(FLAGGED_CELLS);
        expect((await button(source, 'mb-len-mismatch-warn-btn')).label).toBe(WARN_LABEL);
        expect((await button(source, 'mb-len-mismatch-severe-btn')).label).toBe(SEVERE_LABEL);

        saved = await saveToDisk(source, tmpDir, 'born-to-run.json.gz');
        await source.close();
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened tracklist shows the same flags, counts them, and filters to them', async ({ context }) => {
        const page = await openRelease(context, pageErrors, SETTINGS);
        await loadFromDisk(page, saved);

        expect(await flaggedCells(page), 'every cell comes back with its own kind and tooltip').toEqual(before);

        const warn = await button(page, 'mb-len-mismatch-warn-btn');
        const severe = await button(page, 'mb-len-mismatch-severe-btn');
        expect(warn.visible && severe.visible, 'both summary buttons are offered again').toBe(true);
        expect(warn.label).toBe(WARN_LABEL);
        expect(severe.label).toBe(SEVERE_LABEL);

        // The structural filter reads the same attribute off the source rows,
        // so restoring the tint without the data would pass the lines above
        // and still leave this button filtering to nothing.
        await page.click('#mb-len-mismatch-warn-btn');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row'))
            .length === 3, null, { timeout: 15000 });
        expect(await visibleRows(page)).toBe(3);
    });

    test('a restored tracklist saved again keeps its flags', async ({ context }) => {
        const first = await openRelease(context, pageErrors, SETTINGS);
        await loadFromDisk(first, saved);
        const resaved = await saveToDisk(first, tmpDir, 'born-to-run-again.json.gz');

        const second = await openRelease(context, pageErrors, SETTINGS);
        await loadFromDisk(second, resaved);
        expect(await flaggedCells(second), 'the second round trip loses nothing either').toEqual(before);
    });

    test('flagging switched off before the load wins over a saved flag', async ({ context }) => {
        const page = await openRelease(context, pageErrors, {
            ...SETTINGS, sa_enable_release_tracks_length_mismatch_flag: false,
        });
        await loadFromDisk(page, saved);

        expect(await flaggedCells(page), 'no cell is marked').toEqual([]);
        const warn = await button(page, 'mb-len-mismatch-warn-btn');
        expect(warn === null || !warn.visible, 'and no LENGTH button is offered').toBe(true);
    });

    test('only a known flag and a string tooltip are applied; a file without flags loads as before',
        async ({ context }) => {
            // The first flagged cell gets a kind outside the two, the second a
            // valid kind with a tooltip that is not a string, and every other
            // flag is dropped — which is also exactly what a file saved before
            // this fix looks like.
            const tampered = path.join(tmpDir, 'tampered.json.gz');
            const flagged = rewriteSavedCells(saved, tampered, (cell, seen) => {
                if (!('lenFlag' in cell)) return false;
                if (seen === 0) {
                    cell.lenFlag = 'bogus';
                } else if (seen === 1) {
                    cell.lenFlag = 'warn';
                    cell.lenTip = { not: 'a string' };
                } else {
                    delete cell.lenFlag;
                    delete cell.lenTip;
                }
                return true;
            });
            expect(flagged, 'the saved file carries one flag field per flagged cell').toBe(FLAGGED_CELLS);

            const page = await openRelease(context, pageErrors, SETTINGS);
            await loadFromDisk(page, tampered);

            expect(await visibleRows(page), 'the tracklist itself loads in full').toBe(8);
            expect(await flaggedCells(page),
                'only the valid kind is applied, and without the non-string tooltip')
                .toEqual([{ kind: 'warn', title: '', ownTip: false }]);
            expect((await button(page, 'mb-len-mismatch-warn-btn')).label,
                'the button counts what was restored and nothing else').toBe('(1) LENGTH ⚠️');
            const severe = await button(page, 'mb-len-mismatch-severe-btn');
            expect(severe === null || !severe.visible, 'no ❌ was restored').toBe(true);
        });
});
