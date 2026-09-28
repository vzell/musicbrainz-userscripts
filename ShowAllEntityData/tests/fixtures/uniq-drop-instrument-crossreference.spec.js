'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: "Instrument info - Cross-reference" unique-values dropdown
// section — a more specific facet of the existing "Instrument info -
// Description" flag: whether the description contains a REAL link to
// another instrument, not just free text. Did not exist before this — see
// org/column-unique-value-drop-down-menu.org's "Analysis results"
// suggestion #5. Markup is real, copied verbatim from debug/instruments.html.
const INSTRUMENTS_URL = 'https://musicbrainz.org/instruments';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-instrument-crossreference.html');

async function openDrop(page) {
    await loadUserscriptPage(page, { url: INSTRUMENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${INSTRUMENTS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Instruments"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.evaluate(() => window.__saTest.getUniqDropSections('Family'));
}

test('unique-values dropdown: "Family" column gets an "Instrument info - Cross-reference" section', async ({ page }) => {
    const sections = await openDrop(page);
    expect(sections).toBeTruthy();

    const section = sections.find((s) => s.label === 'Instrument info - Cross-reference');
    expect(section).toBeTruthy();
    const item = section.items.find((i) => i.label === '↗️ has cross-reference');
    expect(item).toBeTruthy();
    // Rows 1 (Cembalet, 1 link) and 2 (chalumeau, 2 links) both count;
    // row 3 (bagpipe, no links) and row 4 (bazooka, literal escaped
    // "<a>" TEXT, not a real link) must NOT count.
    expect(item.count).toBe(2);

    // The existing, unrelated "Instrument info - Description" flag still
    // counts all four rows (every row has description text) — confirms
    // the new flag is a genuinely narrower facet, not a duplicate of it.
    const descSection = sections.find((s) => s.label === 'Instrument info - Description');
    const descItem = descSection.items.find((i) => i.label === '📝 has description');
    expect(descItem.count).toBe(4);
});

test('checking "has cross-reference" filters to rows 1/2 and highlights only the linked instrument names', async ({ page }) => {
    await openDrop(page);

    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Instrument info - Cross-reference');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.title?.startsWith('↗️ has cross-reference'));
        item.click();
    });

    await page.waitForFunction(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Family');
        if (idx < 0) return false;
        const visible = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none');
        return visible.length > 0 && visible.every((r) => r.cells[idx]?.querySelector('.mb-column-filter-highlight'));
    }, null, { timeout: 15000 });

    const rows = await page.evaluate(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Family');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .map((r) => Array.from(r.cells[idx].querySelectorAll('.mb-column-filter-highlight')).map((h) => h.textContent));
    });
    expect(rows.length).toBe(2);
    expect(rows).toEqual(expect.arrayContaining([
        ['Harpsichord'],
        ['charumera', 'shawm'],
    ]));
});
