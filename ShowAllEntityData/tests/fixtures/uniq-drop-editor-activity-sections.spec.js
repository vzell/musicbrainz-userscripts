'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: "Editor info - Active for"/"- Active since" unique-values
// dropdown sections for editorActivity()'s own synthetic "Active for"/
// "Active since" columns (annotations pageType), plus "Active start date"/
// "Active end date" gaining the full "Date info" family via
// _dateExprColumnNames(). None of this existed before — see
// org/column-unique-value-drop-down-menu.org's "Analysis results"
// suggestion #2. Tooltip/comment markup is real, copied verbatim from
// debug/label-annotations.html and debug/label-annotations-final.html.
const ANNOTATIONS_URL = 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e/annotations';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-editor-activity-sections.html');

async function openDrop(page, colName) {
    await loadUserscriptPage(page, { url: ANNOTATIONS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show Annotation History for Label"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.evaluate((c) => window.__saTest.getUniqDropSections(c), colName);
}

test('unique-values dropdown: "Active for" column gets an "Editor info - Active for" section', async ({ page }) => {
    const sections = await openDrop(page, 'Active for');
    expect(sections).toBeTruthy();

    const section = sections.find((s) => s.label === 'Editor info - Active for');
    expect(section).toBeTruthy();
    const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i.count]));

    // Rows 1/2 share "10 years" (artysmokes); row 3 is "8 years" (brianfreud);
    // row 4's plain editor (no tooltip) contributes nothing.
    expect(byLabel['» active for: 10 years']).toBe(2);
    expect(byLabel['» active for: 8 years']).toBe(1);
    expect(section.items.length).toBe(2);
});

test('unique-values dropdown: "Active since" column gets an "Editor info - Active since" section', async ({ page }) => {
    const sections = await openDrop(page, 'Active since');
    expect(sections).toBeTruthy();

    const section = sections.find((s) => s.label === 'Editor info - Active since');
    expect(section).toBeTruthy();
    const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i.count]));

    expect(byLabel['» active since: 2015']).toBe(2);
    expect(byLabel['» active since: 2012']).toBe(1);
    expect(section.items.length).toBe(2);
});

test('unique-values dropdown: "Active start date"/"Active end date" gain the full "Date info" family', async ({ page }) => {
    const startSections = await openDrop(page, 'Active start date');
    expect(startSections).toBeTruthy();
    const startLabels = startSections.map((s) => s.label);
    expect(startLabels).toEqual(expect.arrayContaining([
        'Date info - Precision', 'Date info - Decade', 'Date info - Month', 'Date info - Year', 'Date info - Weekday',
    ]));
    const startYear = startSections.find((s) => s.label === 'Date info - Year');
    const startByLabel = Object.fromEntries(startYear.items.map((i) => [i.label, i.count]));
    // Rows 1/2 both start 2005-07-28; row 3 starts 2005-02-18 — same year.
    expect(startByLabel['» year: 2005']).toBe(3);

    const endSections = await openDrop(page, 'Active end date');
    expect(endSections).toBeTruthy();
    const endYear = endSections.find((s) => s.label === 'Date info - Year');
    const endByLabel = Object.fromEntries(endYear.items.map((i) => [i.label, i.count]));
    expect(endByLabel['» year: 2015']).toBe(2);
    expect(endByLabel['» year: 2012']).toBe(1);
});

test('checking "10 years" filters to rows 1/2 and highlights only the Active-for cell\'s own text', async ({ page }) => {
    await openDrop(page, 'Active for');

    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Editor info - Active for');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '» active for: 10 years');
        item.click();
    });

    await page.waitForFunction(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Active for');
        if (idx < 0) return false;
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .every((r) => r.cells[idx]?.querySelector('.mb-column-filter-highlight'));
    }, null, { timeout: 15000 });

    const highlighted = await page.evaluate(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Active for');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .map((r) => r.cells[idx].textContent.trim());
    });
    expect(highlighted).toEqual(['10 years', '10 years']);
});
