'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: the "Tracks info - Total" unique-values dropdown section — the
// SUM of a "Tracks" cell's per-medium counts, i.e. the same number the
// synthetic "Total Tracks" column already shows. Fixture rows are chosen so
// the per-medium list ("Tracks info - Tracks") and the total DISAGREE:
// "15", "5 + 5 + 5" and "9 + 6" all total 15, but only the first one has a
// per-medium count of 15.
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-tracks-total.html');
const SECTION = 'Tracks info - Total';

/** Loads the fixture page and runs "Show all". */
async function loadAndRender(page) {
    await loadUserscriptPage(page, { url: RG_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // The render drops the merge-checkbox column, so Release is cell 0 and
    // Tracks is cell 3 below. Pin that rather than assume it silently.
    const headers = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl thead th')).slice(0, 4).map((th) => th.dataset.colName));
    expect(headers).toEqual(['Release', 'Artist', 'Format', 'Tracks']);
}

/** Clicks one entry of one dropdown section by its dataset label. */
async function clickEntry(page, sectionLabel, entryLabel) {
    await page.evaluate(({ sectionLabel, entryLabel }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === entryLabel).click();
    }, { sectionLabel, entryLabel });
}

/** Names (first cell text) of the rows currently shown, sorted. */
async function visibleRowNames(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .map((r) => r.cells[0].querySelector('bdi').textContent.trim())
            .sort());
}

test.describe('unique-values dropdown: "Tracks info - Total" section', () => {
    test('offers one entry per distinct summed total, ascending, with the right counts', async ({ page }) => {
        await loadAndRender(page);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Tracks'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();

        expect(section.items.map((i) => [i.label, i.count])).toEqual([
            ['» total tracks: 10', 1],
            ['» total tracks: 15', 3],
        ]);

        // The per-medium section is untouched and disagrees on purpose:
        // 15 appears there once (the single-medium row), not three times.
        const perMedium = sections.find((s) => s.label === 'Tracks info - Tracks');
        const perMediumByLabel = Object.fromEntries(perMedium.items.map((i) => [i.label, i.count]));
        expect(perMediumByLabel['» tracks: 15']).toBe(1);
        expect(perMediumByLabel['» tracks: 5']).toBe(1);

        // Quickfilter visibility (skill step 7): every entry needs dataset.mbUniqSynLabel.
        const datasetLabels = await page.evaluate((label) => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === label);
            return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((i) => i.dataset.mbUniqSynLabel);
        }, SECTION);
        expect(datasetLabels).toHaveLength(2);
        expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    });

    test('checking total 15 shows exactly the three rows whose mediums sum to 15, and the count badge agrees', async ({ page }) => {
        await loadAndRender(page);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Tracks'));
        const badge = sections.find((s) => s.label === SECTION).items.find((i) => i.label === '» total tracks: 15').count;

        await clickEntry(page, SECTION, '» total tracks: 15');
        await page.waitForFunction(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < 4,
            null, { timeout: 15000 });

        const names = await visibleRowNames(page);
        expect(names).toEqual(['One Medium 15', 'Three Mediums', 'Two Mediums']);
        // The agreement between the badge and the rows is the guarantee.
        expect(names).toHaveLength(badge);

        // A multi-medium cell has no text equal to its total, so its whole
        // "N + N + N" run is highlighted; a single-medium cell highlights
        // its own number.
        const highlighted = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .map((r) => [r.cells[0].querySelector('bdi').textContent.trim(),
                    Array.from(r.cells[3].querySelectorAll('.mb-column-filter-highlight')).map((s) => s.textContent).join('')])
                .sort());
        expect(highlighted).toEqual([
            ['One Medium 15', '15'],
            ['Three Mediums', '5 + 5 + 5'],
            ['Two Mediums', '9 + 6'],
        ]);
    });

    test('the per-medium entry for 15 still matches only the single-medium row (total and per-medium are not conflated)', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Tracks'));
        await clickEntry(page, 'Tracks info - Tracks', '» tracks: 15');
        await page.waitForFunction(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < 4,
            null, { timeout: 15000 });
        expect(await visibleRowNames(page)).toEqual(['One Medium 15']);
    });

    test('a second filter pass and a dropdown reopen still offer the same total entries (extractor reads through its own highlight)', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Tracks'));
        await clickEntry(page, SECTION, '» total tracks: 15');
        await page.waitForFunction(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < 4,
            null, { timeout: 15000 });

        // Reopen with the highlight spans now inside the cells.
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Tracks'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();
        expect(section.items.some((i) => i.label === '» total tracks: 15')).toBe(true);
    });
});
