'use strict';

// The Video column's "video recording on a medium that cannot carry video"
// flag must survive Save to Disk → Load from Disk.
//
// Like the LENGTH flag (len-flag-disk-roundtrip.spec.js, whose helpers and
// reasoning this mirrors), it lives ON the `<td>` as `data-mb-video-flag` —
// attributes only — so a cell record's `html` cannot carry it. It travels as
// the optional `videoFlag`/`videoTip` fields of the cell record
// (`_buildDiskCellData()` writes them, `_restoreVideoMediumFlag()` reads
// them). What each test pins:
//
//   - the round trip restores the SAME marking, per cell, and the 📊
//     "Video info - Medium format" section counts it again;
//   - switching flagging off before the load wins over a saved flag;
//   - the file is user-supplied data: a value outside `mismatch`/`ok` is not
//     written into the DOM.

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

// "Only the Strong Survive: Covers Vol. 1" — one CD, four video recordings
// (tracks 3, 4, 6, 10). See release-tracks-video-medium-flag.spec.js.
const RELEASE_URL = 'https://musicbrainz.org/release/812b0aa0-0550-4235-9c3b-fa97f2572e74';
const FIXTURE = path.join(__dirname, 'release-tracks-video-on-cd.html');
const SETTINGS = { sa_enable_release_tracks: true };
const FLAGGED_CELLS = 4;

// Serving a saved page: MusicBrainz's own supported-browser-check.js throws,
// and a versioned bundle it references answers with an HTML error page.
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

/** Every flagged Video cell's kind and tooltip, sorted, so two renders compare by value. */
const flaggedCells = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-video-flag]'))
        .map((td) => ({ kind: td.dataset.mbVideoFlag, title: td.title, ownTip: td.dataset.mbColTip === '1' }))
        .sort((a, b) => (a.kind + a.title).localeCompare(b.kind + b.title)));

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
    await renderBtn.evaluate((el) => el.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Rewrites a saved .json.gz, passing every cell record through `edit`. */
function rewriteSavedCells(file, out, edit) {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    const rowSets = data.groups ? data.groups.map((g) => g.rows) : [data.rows];
    let seen = 0;
    rowSets.forEach((rows) => rows.forEach((cells) => cells.forEach((cell) => {
        if (edit(cell)) seen++;
    })));
    fs.writeFileSync(out, zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8')));
    return seen;
}

test.describe('Video medium-format flags survive Save to Disk → Load from Disk', () => {
    let pageErrors;
    let tmpDir;
    let saved;
    let before;

    test.beforeEach(async ({ context }) => {
        pageErrors = [];
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-video-flag-'));

        const source = await openRelease(context, pageErrors, SETTINGS);
        await source.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(source, { waitForAutoResize: false });

        before = await flaggedCells(source);
        expect(before, 'the source tracklist carries its flags').toHaveLength(FLAGGED_CELLS);
        expect(before.every((c) => c.kind === 'mismatch' && c.ownTip)).toBe(true);

        saved = await saveToDisk(source, tmpDir, 'only-the-strong-survive.json.gz');
        await source.close();
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened tracklist shows the same flags and the 📊 section counts them', async ({ context }) => {
        const page = await openRelease(context, pageErrors, SETTINGS);
        await loadFromDisk(page, saved);

        expect(await flaggedCells(page), 'every cell comes back with its own kind and tooltip').toEqual(before);

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Video'));
        const sec = sections.find((s) => s.label === 'Video info - Medium format');
        expect(sec).toBeTruthy();
        expect(sec.items.map((i) => [i.label, i.count]))
            .toEqual([['❌ video on a medium that cannot carry video', FLAGGED_CELLS]]);
    });

    test('flagging switched off before the load wins over a saved flag', async ({ context }) => {
        const page = await openRelease(context, pageErrors, {
            ...SETTINGS, sa_enable_release_tracks_video_medium_flag: false,
        });
        await loadFromDisk(page, saved);
        expect(await flaggedCells(page), 'no cell is marked').toEqual([]);
    });

    test('a saved flag value outside mismatch/ok is not written into the DOM', async ({ context }) => {
        const tampered = path.join(tmpDir, 'tampered.json.gz');
        const touched = rewriteSavedCells(saved, tampered, (cell) => {
            if (!cell.videoFlag) return false;
            cell.videoFlag = 'severe" onmouseover="alert(1)';
            return true;
        });
        expect(touched).toBe(FLAGGED_CELLS);

        const page = await openRelease(context, pageErrors, SETTINGS);
        await loadFromDisk(page, tampered);
        expect(await flaggedCells(page)).toEqual([]);
    });
});
