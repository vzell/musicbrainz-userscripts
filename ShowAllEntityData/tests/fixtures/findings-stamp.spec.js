'use strict';

// stampFindings(): the generic ⚠️/❌ cell tint and the data-mb-findings
// attributes the findings menus, the 📊 "Findings - …" sections and the row
// filter read (org/generalize-error-warning.org, docs/claude/findings.md).
//
// Guarantees pinned, each against its neighbour:
//   - a newly tinted finding paints the cell (attribute AND computed colour,
//     not just the attribute);
//   - a finding that shows its own glyph gets the tint WITHOUT a second glyph;
//   - its tint setting turns the paint off but keeps the finding (the menu
//     row stays) — the setting is about the look, not about detection;
//   - a cell a per-family rule already paints (live-title error) keeps that
//     paint alone — the generic glyph would out-rank the family's;
//   - the stamp reaches the SOURCE rows: a filter re-render (which renders
//     clones of them) still carries it;
//   - the 📊 "Findings - Warning" entry counts the cells that carry it.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { findingRow } = require('../support/findingsMenu');

const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

// Release group with 10 releases whose barcode is invalid (an 11-digit code,
// failed check digits) across three status sub-tables.
const BARCODE_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const BARCODE_FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const PENDING_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const PENDING_FIXTURE = path.join(__dirname, 'pending-edits-multi.html');
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');

const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd, the default warn tint

/**
 * Loads a fixture and presses its "Show all" button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @param {string} button
 * @param {Object} [settingsOverride]
 */
async function open(page, url, fixture, button, settingsOverride = {}) {
    await loadUserscriptPage(page, { url, fixtureFile: fixture, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride } });
    await page.route(`${url}*`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.click(`button[data-label="${button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const openBarcode = (page, s) => open(page, BARCODE_URL, BARCODE_FIXTURE, 'Show all Releases for ReleaseGroup', s);

/**
 * Every live cell carrying one finding: its attributes, computed background
 * and ::after glyph.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
const cellsWith = (page, id) => page.evaluate((fid) =>
    Array.from(document.querySelectorAll(`table.tbl tbody td[data-mb-findings~="${fid}"]`)).map((td) => ({
        level: td.dataset.mbFinding || null,
        inline: td.dataset.mbFindingInline || null,
        bg: getComputedStyle(td).backgroundColor,
        after: getComputedStyle(td, '::after').content,
        afterPos: getComputedStyle(td, '::after').position,
        liveFlag: td.dataset.mbLiveFlag || null,
        title: td.title,
    })), id);

test.describe('findings stamp — tint', () => {
    test('an invalid barcode is tinted yellow, with no second glyph', async ({ page }) => {
        await openBarcode(page);
        const cells = await cellsWith(page, 'barcode-invalid');
        expect(cells.length).toBe(10);
        cells.forEach((c) => {
            expect(c.level).toBe('warn');
            expect(c.inline, 'its own inline ⚠️ is the glyph').toBe('1');
            expect(c.bg).toBe(WARN_BG);
            // The barcode's own glyph IS this cell's ::after (an inline " ⚠️").
            // The generic rule would replace it with an absolutely positioned
            // "⚠️" at the right edge, which is the one glyph too many.
            expect(c.after, 'the barcode\'s own inline glyph').toBe('" ⚠️"');
            expect(c.afterPos, 'not the generic right-edge glyph').not.toBe('absolute');
            // initBarcodeValidation()'s own, more specific tooltip stays: the
            // stamp writes a tooltip only on a cell that has none.
            expect(c.title).toMatch(/known barcode format|Check digit does not match/);
        });
    });

    test('the tint setting turns the paint off but keeps the finding and its menu row', async ({ page }) => {
        await openBarcode(page, { sa_findings_tint_barcode: false });
        const cells = await cellsWith(page, 'barcode-invalid');
        expect(cells.length, 'still detected').toBe(10);
        cells.forEach((c) => {
            expect(c.level, 'not tinted').toBeNull();
            expect(c.bg).not.toBe(WARN_BG);
        });
        expect((await findingRow(page, 'warn', 'barcode-invalid'))?.count, 'the menu still offers it').toBe(10);
    });

    test('a pending-edits cell gets the tint and a ⚠️', async ({ page }) => {
        await open(page, PENDING_URL, PENDING_FIXTURE, '🧮 Artist RGs');
        const cells = await cellsWith(page, 'pending');
        expect(cells.length).toBeGreaterThan(0);
        cells.forEach((c) => {
            expect(c.level).toBe('warn');
            expect(c.inline).toBeNull();
            expect(c.bg).toBe(WARN_BG);
            expect(c.after).toBe('"⚠️"');
        });
    });

    test('a cell its family rule paints keeps that paint alone', async ({ page }) => {
        await open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup');
        const cells = await cellsWith(page, 'live-invalid');
        expect(cells.length).toBeGreaterThan(0);
        cells.forEach((c) => {
            expect(c.liveFlag, 'the live-title family flag is there').toBe('error');
            expect(c.level, 'so no generic level is written').toBeNull();
            expect(c.after, 'and the family ❌ shows').toBe('"❌"');
        });
    });
});

test.describe('findings stamp — reach and 📊', () => {
    test('the stamp survives a filter re-render (it is on the source rows)', async ({ page }) => {
        await openBarcode(page);
        const ids = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl tbody td[data-mb-findings~="barcode-invalid"]'))
            .map((td) => td.textContent.trim()));
        const needle = ids.find((t) => t === '07464319032') || ids[0];
        const expected = ids.filter((t) => t.includes(needle)).length;
        // Polled for the KNOWN value rather than waitForFilterSettled(): on a
        // grouped render the status it waits on stops changing after the
        // first filter (docs/claude/filter-and-cache-invariants.md).
        await page.fill('#mb-global-filter-input', needle);
        await expect.poll(async () => (await cellsWith(page, 'barcode-invalid')).length,
            { timeout: 15000, message: 'the re-rendered clones carry the stamp' }).toBe(expected);
        expect((await cellsWith(page, 'barcode-invalid')).every((c) => c.level === 'warn')).toBe(true);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await cellsWith(page, 'barcode-invalid')).length,
            { timeout: 15000, message: 'all of them, back' }).toBe(10);
    });

    test('the 📊 "Findings - Warning" section counts the cells of its table', async ({ page }) => {
        await openBarcode(page);
        const perTable = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .map((t) => t.querySelectorAll('tbody td[data-mb-findings~="barcode-invalid"]').length));
        const ti = perTable.findIndex((n) => n > 0);
        expect(ti).toBeGreaterThanOrEqual(0);
        const sections = await page.evaluate((i) => window.__saTest.getUniqDropSections('Barcode', i), ti);
        const sec = (sections || []).find((s) => s.label === 'Findings - Warning');
        expect(sec, 'the section exists on the Barcode column').toBeTruthy();
        const item = sec.items.find((i) => i.label.includes('Invalid barcode format'));
        expect(item.count).toBe(perTable[ti]);
    });
});
