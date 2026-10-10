'use strict';

const { test, expect } = require('../support/test');
const { DATA, FIXTURE_BPR, setupRecordingOf, headerNames, columnCells } = require('../support/recordingOf');

// The page as the batch-add "performance of" userscript (Michael Wiencek)
// leaves it — its markup copied from debug/A-R-3rd-works.html into the
// generated fixture. Until now nothing pinned how ShowAllEntityData treats
// that markup. Properties:
//   - its "Performance Attributes" header and td.bpr_attrs cells are dropped
//     (cleanupHeaders()' removalMapAlways), and its div.work /
//     div.suggested-work lines are erased from Name (the 'wiencek' eraser);
//   - our own "Performance attributes" column (lower-case a) survives that
//     removal, and both of our columns load normally next to it.

test.describe('"Recording of" next to the batch-add userscript\'s markup', () => {
    test('its column and Name lines are removed; ours survive and load', async ({ page }) => {
        await setupRecordingOf(page, { fixture: FIXTURE_BPR, settings: { sa_recording_of_suggest_enable: false } });
        const names = await headerNames(page);
        expect(names).not.toContain('Performance Attributes');
        expect(names.filter((n) => n === 'Performance attributes')).toHaveLength(1);
        expect(await page.locator('table.tbl td.bpr_attrs').count()).toBe(0);
        expect(await page.locator('table.tbl div.work, table.tbl div.suggested-work').count()).toBe(0);
        // Name reads as the title (plus comment) only.
        const nameCells = await columnCells(page, 'Name');
        expect(nameCells[0].text).toBe('Born to Run');
        expect(nameCells[0].html).not.toContain('recording of');

        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
        const rec = await columnCells(page, 'Recording of');
        const att = await columnCells(page, 'Performance attributes');
        const i = DATA.recordings.findIndex((r) => r.title === 'Can’t Help Falling in Love');
        expect(rec[i].text).toBe('Can’t Help Falling in Love (cover/live)');
        expect(att[i].text).toContain('cover');
        // Every row still has exactly as many cells as headers.
        const aligned = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const n = tbl.querySelector('thead tr:first-child').cells.length;
            return Array.from(tbl.querySelectorAll('tbody tr')).every((tr) => tr.cells.length === n);
        });
        expect(aligned).toBe(true);
    });
});
