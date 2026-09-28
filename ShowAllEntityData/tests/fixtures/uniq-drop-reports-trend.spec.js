'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: "Reports - Trend" unique-values dropdown section for
// reportChangeIndicator()'s own synthetic "Delta" column (reports-index
// pageType). This is entirely dependent on the optional third-party
// "MusicBrainz: Reports Statistics" userscript (by chaban) being installed
// and active on the real page — the .report-change-indicator span shape is
// copied verbatim from that extractor's own JSDoc example. Neither existed
// before this change — see org/column-unique-value-drop-down-menu.org's
// "Analysis results" suggestion #3.
const REPORTS_URL = 'https://musicbrainz.org/reports';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-reports-trend.html');

async function openDrop(page) {
    await loadUserscriptPage(page, { url: REPORTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${REPORTS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Reports"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.evaluate(() => window.__saTest.getUniqDropSections('Delta'));
}

test('unique-values dropdown: "Delta" column gets a "Reports - Trend" section', async ({ page }) => {
    const sections = await openDrop(page);
    expect(sections).toBeTruthy();

    const section = sections.find((s) => s.label === 'Reports - Trend');
    expect(section).toBeTruthy();
    const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i.count]));

    // Rows 1/2 are both ▼ (down); row 3 is ▲ (up); row 4 is ↔ (flat).
    // Row 5 ("New: 42 items", no arrow) and row 6 (no chaban span at all)
    // must contribute to NEITHER flag.
    expect(byLabel['📉 trending down']).toBe(2);
    expect(byLabel['📈 trending up']).toBe(1);
    expect(byLabel['↔️ flat']).toBe(1);
    expect(section.items.length).toBe(3);
});

test('checking "trending down" filters to rows 1/2 and highlights only the leading arrow', async ({ page }) => {
    await openDrop(page);

    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Reports - Trend');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.title?.startsWith('📉 trending down'));
        item.click();
    });

    await page.waitForFunction(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Delta');
        if (idx < 0) return false;
        const visible = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none');
        return visible.length > 0 && visible.every((r) => r.cells[idx]?.querySelector('.mb-column-filter-highlight'));
    }, null, { timeout: 15000 });

    const rows = await page.evaluate(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Delta');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .map((r) => ({
                full: r.cells[idx].textContent.trim(),
                highlighted: Array.from(r.cells[idx].querySelectorAll('.mb-column-filter-highlight')).map((h) => h.textContent),
            }));
    });
    expect(rows.length).toBe(2);
    // Only the leading arrow is marked, never the count/percent text after it.
    rows.forEach((r) => {
        expect(r.full.startsWith('▼')).toBe(true);
        expect(r.highlighted).toEqual(['▼']);
    });
});
