'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// annotations: "Editor" is moved to the FIRST column (features.moveColumnFirst,
// applyMoveColumnFirst()). Natively it is third, behind the Old/New radios, and
// as the sticky column it then had both dock underneath it while it slid
// over them (user request, 2026-10-16). The fixture copies the native shape
// of debug/annotations-old-new.initial.html.
//
// Guarantees pinned here, each named so a neighbouring bug still fails it:
//   - ORDER: the header AND every row lead with Editor, then Old, New, Date,
//     Version history (not merely "Editor is somewhere");
//   - ROW INTEGRITY: each row's moved cells stay in THAT row — the Old/New
//     radio values next to an editor are the ones the fixture gave that editor;
//   - Editor is the sticky column, and with nothing before it no column
//     docks under it (no data-mb-sph-col-pre);
//   - name-keyed features still read the right column (MB-Name from Editor,
//     Revision date from Date), and the radios stay selectable.
const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/annotations';
const FIXTURE_FILE = path.join(__dirname, 'annotations-editor-first.html');

// Fixture order: editor → [Old value, New value, Date].
const EXPECTED = [
    ['vzell', '1076180', '2022-12-24 12:08 GMT+1'],
    ['reosarevok', '801281', '2020-02-14 15:46 GMT+1'],
    ['zas', '801280', '2020-02-14 15:45 GMT+1'],
    ['jesus2099', '801279', '2020-02-14 15:44 GMT+1'],
];

/**
 * Loads the fixture at a viewport narrower than the rendered table (so the
 * sticky page headers engage) and renders the annotation history.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function render(page) {
    await page.setViewportSize({ width: 900, height: 800 });
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.$eval('button[data-label="Show Annotation History for Artist"]', (b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('annotations: Editor is the first (sticky) column', () => {
    test('header and every row lead with Editor, Old, New, Date, Version history', async ({ page }) => {
        await render(page);
        const heads = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl#annotation-history > thead > tr:first-child > th'))
            .map((th) => th.dataset.colName));
        expect(heads.slice(0, 5)).toEqual(['Editor', 'Old', 'New', 'Date', 'Version history']);

        // The filter row under the header has to line up as well.
        const counts = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl#annotation-history > thead > tr'))
            .map((tr) => tr.cells.length));
        expect(new Set(counts).size, 'every header row has the same cell count').toBe(1);

        const rows = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl#annotation-history > tbody > tr'))
            .map((tr) => ({
                editor: tr.cells[0].querySelector('a[href^="/user/"]')?.textContent.trim() || null,
                old: tr.cells[1].querySelector('input.old')?.value || null,
                nw: tr.cells[2].querySelector('input.new')?.value || null,
                date: tr.cells[3].textContent.trim(),
            })));
        expect(rows).toHaveLength(EXPECTED.length);
        const byEditor = new Map(rows.map((r) => [r.editor, r]));
        for (const [editor, value, date] of EXPECTED) {
            const r = byEditor.get(editor);
            expect(r, `row of ${editor}`).toBeTruthy();
            expect(r.old, `${editor}: Old radio stays in its own row`).toBe(value);
            expect(r.nw, `${editor}: New radio stays in its own row`).toBe(value);
            expect(r.date, `${editor}: Date stays in its own row`).toBe(date);
        }
    });

    test('Editor is the sticky column and nothing docks under it', async ({ page }) => {
        await render(page);
        const sticky = await page.evaluate(() => {
            const t = document.querySelector('table.tbl#annotation-history');
            return {
                thIdx: t.querySelector(':scope > thead > tr:first-child > th.mb-sticky-col')?.cellIndex,
                tdIdx: Array.from(t.querySelectorAll(':scope > tbody > tr'))
                    .map((tr) => tr.querySelector(':scope > td.mb-sticky-col')?.cellIndex),
            };
        });
        expect(sticky.thIdx).toBe(0);
        expect(sticky.tdIdx).toEqual([0, 0, 0, 0]);

        await page.waitForFunction(
            () => document.documentElement.classList.contains('mb-sph-on'), null, { timeout: 10000 });
        await expect.poll(() => page.evaluate(() =>
            document.querySelector('table.tbl#annotation-history').dataset.mbSphColLeft),
        { message: 'premise: the sticky column is aligned by the sticky page headers' }).toBeTruthy();
        const pre = await page.evaluate(() =>
            document.querySelector('table.tbl#annotation-history').dataset.mbSphColPre || null);
        expect(pre, 'no column precedes Editor, so none docks under it').toBeNull();
    });

    test('name-keyed columns still read the right source, radios stay selectable', async ({ page }) => {
        await render(page);
        const cols = await page.evaluate(() => {
            const t = document.querySelector('table.tbl#annotation-history');
            const names = Array.from(t.querySelectorAll(':scope > thead > tr:first-child > th'))
                .map((th) => th.dataset.colName);
            const col = (n) => Array.from(t.querySelectorAll(':scope > tbody > tr'))
                .map((tr) => tr.cells[names.indexOf(n)].textContent.trim());
            return { name: col('MB-Name'), editor: col('Editor'), revDate: col('Revision date'), date: col('Date') };
        });
        expect(cols.name, 'MB-Name is extracted from Editor').toEqual(cols.editor);
        expect(cols.revDate, 'Revision date is extracted from Date')
            .toEqual(cols.date.map((d) => d.slice(0, 10)));

        // The fixture's static `disabled` on New (all but the newest row) is
        // lifted by initAnnotationCompareRadios(); the moved cells keep that.
        const newRadio = page.locator('table.tbl#annotation-history input.new[value="801280"]');
        await expect(newRadio).toBeEnabled();
        await newRadio.check();
        await expect(newRadio).toBeChecked();
        await expect(page.locator('table.tbl#annotation-history input.new[value="1076180"]')).not.toBeChecked();
    });
});
