'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { waitForRenderComplete } = require('../support/browser');
const { PAGE_URL, FIXTURE, setupRecordingOf, headerNames } = require('../support/recordingOf');

// Column display labels (`_colLabel()`, `sa_short_column_labels`): a header
// PAINTS a short label ("Work" for "Recording of", "Perf." for "Performance
// attributes") while the column keeps its NAME everywhere else. Properties:
//   - the painted text is the label, `data-col-name` is the name, and the
//     header's tooltip starts with the name — once, however often the
//     header is decorated again;
//   - with the setting off, the header paints its name;
//   - everything keyed by name still finds the column: the 👁️ menu, a
//     default-hidden column, the collapse buttons' visibility check;
//   - a saved and reloaded table has the pair once, still labelled: the
//     saved header keeps its name on the flex (`data-mb-col-key`), and a
//     header is never reversed from its label text ("Work" is also a real
//     column, on artist-works);
//   - `features.columnLabels` merges over the built-in labels.

const LABELS = { 'Recording of': 'Work', 'Performance attributes': 'Perf.' };

let tmpDir;
test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'col-labels-')); });
test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

/**
 * The two headers: painted text (the flex's first text node), name, tooltip
 * and the name carried on the flex.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{name: string, painted: string, tip: string, flexKey: ?string}>>}
 */
const labelledHeaders = (page) => page.evaluate((names) => names.map((name) => {
    const th = document.querySelector(`table.tbl thead tr:first-child th[data-col-name="${name}"]`);
    if (!th) return { name, painted: null, tip: null, flexKey: null };
    const flex = th.querySelector('.mb-col-hdr-flex');
    const node = flex && Array.from(flex.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
    return {
        name,
        painted: node ? node.textContent.trim() : null,
        tip: th.getAttribute('title') || th.dataset.mbTipSaved || '',
        flexKey: flex ? flex.getAttribute('data-mb-col-key') : null,
    };
}), Object.keys(LABELS));

test.describe('column display labels', () => {
    test('the recording-of pair paints "Work" / "Perf." and keeps its names', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        const hdrs = await labelledHeaders(page);
        for (const h of hdrs) {
            expect(h.painted, `${h.name} paints its label`).toBe(LABELS[h.name]);
            expect(h.flexKey, `${h.name}'s flex carries the name`).toBe(h.name);
            expect(h.tip.split('\n')[0], `${h.name}'s tooltip starts with the name`).toBe(h.name);
        }
        const names = await headerNames(page);
        expect(names).toContain('Recording of');
        expect(names).toContain('Performance attributes');
        expect(names).not.toContain('Work');
        // A column without a label paints its name and carries no flex key.
        const plain = await page.evaluate(() => {
            const th = document.querySelector('table.tbl thead tr:first-child th[data-col-name="Name"]');
            const flex = th.querySelector('.mb-col-hdr-flex');
            return { text: flex.firstChild.textContent.trim(), key: flex.hasAttribute('data-mb-col-key') };
        });
        expect(plain).toEqual({ text: 'Name', key: false });
    });

    test('the tooltip names the column once after the header is decorated again', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        // Sort twice by "Recording of" (its own ▲ / ▼), then re-decorate
        // the header row the way "↻ Load remaining pages" does.
        const th = page.locator('table.tbl thead tr:first-child th[data-col-name="Recording of"]');
        await th.locator('.sort-icon-btn', { hasText: '▲' }).click();
        await th.locator('.sort-icon-btn', { hasText: '▼' }).click();
        await page.evaluate(() => window.__saTest.makeTableSortableUnified(document.querySelector('table.tbl')));
        const hdrs = await labelledHeaders(page);
        for (const h of hdrs) {
            expect(h.painted).toBe(LABELS[h.name]);
            const lines = h.tip.split('\n');
            expect(lines.filter((l) => l === h.name), `${h.name} appears once in ${JSON.stringify(h.tip)}`).toHaveLength(1);
        }
    });

    test('with sa_short_column_labels off, the headers paint their names', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false, sa_short_column_labels: false } });
        const hdrs = await labelledHeaders(page);
        for (const h of hdrs) {
            expect(h.painted).toBe(h.name);
            expect(h.flexKey).toBeNull();
        }
    });

    test('the 👁️ menu and sa_default_hidden_columns find a labelled column by its name', async ({ page }) => {
        await setupRecordingOf(page, { settings: {
            sa_recording_of_suggest_enable: false,
            sa_enable_column_visibility: true,
            sa_default_hidden_columns: [['artist-recordings', '"Performance attributes"']],
        } });
        await expect.poll(() => page.locator('label[for^="mb-col-vis-"]').count(),
            { timeout: 30000, message: 'the column-visibility menu is built' }).toBeGreaterThan(0);
        const labels = await page.locator('label[for^="mb-col-vis-"]').allTextContents();
        expect(labels).toContain('Recording of');
        expect(labels).toContain('Performance attributes');
        expect(labels).not.toContain('Work');
        await expect.poll(() => page.evaluate(() => document.querySelector(
            'table.tbl thead tr:first-child th[data-col-name="Performance attributes"]').style.display),
        { message: 'the configured default hides "Performance attributes"' }).toBe('none');
    });

    test('hiding the other collapsable columns leaves the collapse button for the labelled pair', async ({ page }) => {
        // artist-recordings' collapsableColumns: Release groups, CAA, ISRCs,
        // Recording of, Performance attributes. Once the pair is loaded it is
        // the one with multi-row cells; hiding ISRCs and Release groups from
        // the 👁️ menu must not count it as hidden because its header paints
        // "Work" (syncCollapseButtonsWithColumnVisibility()'s isColVisible).
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false, sa_enable_column_visibility: true } });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
        const btn = page.locator('#mb-col-collapse-all-btn');
        await expect.poll(() => btn.evaluate((b) => b.style.display), { timeout: 15000 }).not.toBe('none');
        for (const name of ['ISRCs', 'Release groups']) {
            await page.locator('label[for^="mb-col-vis-"]', { hasText: new RegExp(`^${name}$`) }).evaluate((l) => l.click());
            await expect.poll(() => page.evaluate((n) => document.querySelector(
                `table.tbl thead tr:first-child th[data-col-name="${n}"]`).style.display, name),
            { message: `${name} is hidden` }).toBe('none');
        }
        expect(await btn.evaluate((b) => b.style.display), 'the collapse-all button stays').not.toBe('none');
    });

    test('the 📊 Statistics panel and a filter error name the column, not its label', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        // An invalid regexp in the "Recording of" filter: Rx switched on
        // where its chip keeps it (data-mb-mode-rx), then "(" typed.
        const idx = (await headerNames(page)).indexOf('Recording of');
        const inp = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${idx}"]`);
        await inp.evaluate((el) => { el.dataset.mbModeRx = '1'; });
        // Read-only until focused (password-manager guard): click, then type.
        await inp.click({ position: { x: 6, y: 6 } });
        await inp.pressSequentially('(');
        await expect(page.locator('#mb-filter-status-display')).toContainText('Column "Recording of": invalid regexp');
        await inp.press('Backspace');

        await page.evaluate(() => document.getElementById('mb-stats-btn').click());
        const panel = page.locator('#mb-stats-panel');
        await expect(panel).toBeVisible();
        const text = await panel.textContent();
        expect(text).toContain('Recording of');
        expect(text).toContain('Performance attributes');
    });

    test('a saved and reloaded table has the pair once, still labelled', async ({ page, context }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        const download = page.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(page, '#mb-save-to-disk-btn');
        await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await page.click('#sa-sd-save-confirm');
        const file = path.join(tmpDir, 'labels.json.gz');
        await (await download).saveAs(file);

        const page2 = await context.newPage();
        await loadFromDiskFixture(page2, { url: PAGE_URL, fixturePath: file, testMode: true, pageFixtureFile: FIXTURE,
            settingsOverride: { sa_recording_of_suggest_enable: false } });
        await waitForRenderComplete(page2, { waitForAutoResize: false });
        const names = await headerNames(page2);
        expect(names.filter((n) => n === 'Recording of')).toHaveLength(1);
        expect(names.filter((n) => n === 'Performance attributes')).toHaveLength(1);
        expect(names).not.toContain('Work');
        expect(names).not.toContain('Perf.');
        for (const h of await labelledHeaders(page2)) {
            expect(h.painted).toBe(LABELS[h.name]);
            expect(h.tip.split('\n')[0]).toBe(h.name);
        }
    });

    test('features.columnLabels merges over the built-in labels', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        const merged = await page.evaluate(() => window.__saTest.columnLabelsFor({
            features: { columnLabels: { 'Performance attributes': 'Attrs', 'Release groups': 'RGs' } },
        }));
        expect(merged).toEqual({ 'Recording of': 'Work', 'Performance attributes': 'Attrs', 'Release groups': 'RGs' });
        expect(await page.evaluate(() => window.__saTest.columnLabelsFor({ features: {} }))).toEqual(LABELS);
    });
});
