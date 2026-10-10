'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { waitForRenderComplete } = require('../support/browser');
const { DATA, PAGE_URL, FIXTURE, setupRecordingOf, headerNames, columnCells } = require('../support/recordingOf');

// "Recording of" through Save to Disk / Load from Disk. Found while building
// the artist-recordings perf fixture (2026-10-10): a disk-loaded table showed
// the two headers TWICE and every later column two places off, and its cells
// had lost their identity (class, data-mbid). Properties:
//   - a saved and reloaded table has each header once, every row as many
//     cells as headers, and the loaded answers still loaded (state + text);
//     a reloaded "not loaded" row can still be loaded with a click;
//   - a file saved BEFORE the columns existed (no cells for them) loads
//     without them, columns aligned.

let tmpDir;
test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recof-disk-')); });
test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

/** Header and row shape: names, duplicates, and whether every row matches the header width. */
const shape = (page) => page.evaluate(() => {
    const tbl = document.querySelector('table.tbl');
    const n = tbl.querySelector('thead tr:first-child').cells.length;
    return { width: n, aligned: Array.from(tbl.querySelectorAll('tbody tr')).every((tr) => tr.cells.length === n) };
});

/**
 * Renders the fixture, loads one row, saves the table, and returns the file.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function saveLoadedTable(page) {
    await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
    const row = DATA.recordings.findIndex((r) => r.title === 'Jungleland');
    await page.locator('table.tbl tbody tr').nth(row).locator('td.mb-recof-cell').click();
    await expect.poll(async () => (await columnCells(page, 'Recording of'))[row].state).toBe('has');
    const download = page.waitForEvent('download', { timeout: 60000 });
    await clickToolbarItem(page, '#mb-save-to-disk-btn');
    await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
    await page.click('#sa-sd-save-confirm');
    const file = path.join(tmpDir, 'recof.json.gz');
    await (await download).saveAs(file);
    return file;
}

test.describe('"Recording of" through Save / Load from Disk', () => {
    test('a reloaded table has each header once, aligned rows, and keeps what was loaded', async ({ page, context }) => {
        const file = await saveLoadedTable(page);
        const page2 = await context.newPage();
        await loadFromDiskFixture(page2, { url: PAGE_URL, fixturePath: file, testMode: true, pageFixtureFile: FIXTURE,
            settingsOverride: { sa_recording_of_suggest_enable: false } });
        await waitForRenderComplete(page2, { waitForAutoResize: false });
        const names = await headerNames(page2);
        expect(names.filter((n) => n === 'Recording of')).toHaveLength(1);
        expect(names.filter((n) => n === 'Performance attributes')).toHaveLength(1);
        expect(await shape(page2)).toMatchObject({ aligned: true });
        expect((await columnCells(page2, 'Artist'))[0].text).toBe(DATA.artistName);
        const rec = await columnCells(page2, 'Recording of');
        const row = DATA.recordings.findIndex((r) => r.title === 'Jungleland');
        expect(rec[row]).toMatchObject({ state: 'has', text: 'Jungleland (instrumental)' });
        // A row that was not loaded is still loadable after the round trip.
        const other = DATA.recordings.findIndex((r) => r.title === 'Hungry Heart');
        expect(rec[other].state).toBeNull();
        await page2.route('**/ws/2/**', (route) => route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify(DATA.recordings[other]) }));
        await page2.locator('table.tbl tbody tr').nth(other).locator('td.mb-recof-cell').click();
        await expect.poll(async () => (await columnCells(page2, 'Recording of'))[other].text).toBe('Hungry Heart');
    });

    test('a file saved before the columns existed loads without them, aligned', async ({ page, context }) => {
        const file = await saveLoadedTable(page);
        // Strip the two columns and their cell fields: the shape of a file
        // written by a version without this feature.
        const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
        const hdr = data.headers[0];
        const drop = new Set(hdr.map((c, i) => [c, i]).filter(([c]) => /Recording of|Performance attributes/.test(c.html)).map(([, i]) => i));
        expect(drop.size).toBe(2);
        data.headers = data.headers.map((r) => r.filter((c, i) => !drop.has(i)));
        data.rows = data.rows.map((r) => r.filter((c, i) => !drop.has(i)));
        const legacy = path.join(tmpDir, 'legacy.json.gz');
        fs.writeFileSync(legacy, zlib.gzipSync(JSON.stringify(data)));

        const page2 = await context.newPage();
        await loadFromDiskFixture(page2, { url: PAGE_URL, fixturePath: legacy, testMode: true, pageFixtureFile: FIXTURE });
        await waitForRenderComplete(page2, { waitForAutoResize: false });
        const names = await headerNames(page2);
        expect(names).not.toContain('Recording of');
        expect(names).not.toContain('Performance attributes');
        expect(await shape(page2)).toMatchObject({ aligned: true });
        expect((await columnCells(page2, 'Artist'))[0].text).toBe(DATA.artistName);
        await expect(page2.locator('.mb-recof-col-hdr-btn')).toHaveCount(0);
    });
});
