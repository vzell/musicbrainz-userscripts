'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: the native "Attributes" column (work-recordings,
// artist-relationships, place-performances, area-recordings, …) renders
// MusicBrainz's own recording-attribute words joined in natural language
// (e.g. "cover and live", "live and partial" — see debug/work-rec.html).
// The unique-values dropdown had no section decomposing that into its
// atomic words ("live", "cover", "partial", …), unlike every other
// multi-value cell family in this file (Format, Credit details, …).
const WORK_URL = 'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201';
const FIXTURE_FILE = path.join(__dirname, 'work-recordings-attributes.html');

test('unique-values dropdown: "Attributes" column gets an atomic-word section', async ({ page }) => {
    await loadUserscriptPage(page, { url: WORK_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Recordings for Work"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Attributes'));
    expect(sections).toBeTruthy();

    const attrSection = sections.find((s) => s.label === 'Attributes');
    expect(attrSection).toBeTruthy();
    const byLabel = Object.fromEntries(attrSection.items.map((i) => [i.label, i.count]));

    // "live" appears on all three non-empty rows ("live", "cover and live",
    // "live and partial"); "cover" and "partial" on one row each.
    expect(byLabel['» live']).toBe(3);
    expect(byLabel['» cover']).toBe(1);
    expect(byLabel['» partial']).toBe(1);
    // No stray combined-string entry ("cover and live" itself) — only the
    // decomposed atomic words.
    expect(byLabel['» cover and live']).toBeUndefined();

    // Checking "live" narrows to exactly the 3 rows carrying it, via a
    // column-wide highlight of the matched word.
    const liveCheckbox = page.locator('.mb-col-uniq-item', { hasText: '» live' }).first();
    await liveCheckbox.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const visibleAttrs = await page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Attributes');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none' && !tr.classList.contains('subh'))
            .map((tr) => tr.cells[idx]?.textContent.trim());
    });
    expect(visibleAttrs.sort()).toEqual(['cover and live', 'live', 'live and partial']);
});
