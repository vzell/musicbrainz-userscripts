'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: "Event info - Type"/"Event info - Country" unique-values dropdown
// sections for eventParts()'s own synthetic "Event-Type"/"Event-Country"
// columns (recording-listing pageTypes, split from the recording's Comment
// cell via extractMainColumn). Before this change, neither of eventParts'
// nine Event-* synthetic columns fed any dropdown section at all — see
// org/column-unique-value-drop-down-menu.org's "Analysis results" suggestion
// #1. Comment text shapes are real-world, copied verbatim from
// debug/BoDeans-Recordings-initial.html (a live musicbrainz.org capture).
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-event-parts-sections.html');

async function openDrop(page, colName) {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    // The "Show all recordings" button re-fetches with query params
    // (?all=1&page=1&...), which loadUserscriptPage's own route (exact `url`
    // match only) does not cover — see length-column-filter-colon-gap.spec.js
    // for the same pattern. Serving the identical fixture again is fine: its
    // own empty `<ul class="pagination">` tells the fetch loop there is no
    // next page.
    await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.evaluate((c) => window.__saTest.getUniqDropSections(c), colName);
}

test('unique-values dropdown: "Event-Type" column gets an "Event info - Type" section', async ({ page }) => {
    const sections = await openDrop(page, 'Event-Type');
    expect(sections).toBeTruthy();

    const typeSection = sections.find((s) => s.label === 'Event info - Type');
    expect(typeSection).toBeTruthy();
    const byLabel = Object.fromEntries(typeSection.items.map((i) => [i.label, i.count]));

    // Rows A/B are both "live"; row C is "studio"; row D's comment doesn't
    // start with a recognized EVENT_TYPE_KEYWORDS word, so it must contribute
    // no Event-Type value at all (no stray "" or undefined entry).
    expect(byLabel['» type: live']).toBe(2);
    expect(byLabel['» type: studio']).toBe(1);
    expect(typeSection.items.length).toBe(2);
});

test('unique-values dropdown: "Event-Country" column gets an "Event info - Country" section', async ({ page }) => {
    const sections = await openDrop(page, 'Event-Country');
    expect(sections).toBeTruthy();

    const countrySection = sections.find((s) => s.label === 'Event info - Country');
    expect(countrySection).toBeTruthy();
    const byLabel = Object.fromEntries(countrySection.items.map((i) => [i.label, i.count]));

    // Rows A/B ("Chicago, IL, USA" / "Los Angeles, CA, USA") both resolve to
    // country "USA" via the extractor's USA/Canada/UK branch. Row C
    // ("Abbey Road Studios, London, England") resolves to "England" via the
    // Right-to-Left fallback branch — a different code path, so this also
    // regression-guards that branch reaching the dropdown correctly.
    expect(byLabel['» country: USA']).toBe(2);
    expect(byLabel['» country: England']).toBe(1);
    expect(countrySection.items.length).toBe(2);
});

test('checking "live" filters to rows A/B and highlights only the Event-Type cell\'s own text', async ({ page }) => {
    await openDrop(page, 'Event-Type');

    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Event info - Type');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '» type: live');
        item.click();
    });

    await page.waitForFunction(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Event-Type');
        if (idx < 0) return false;
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .every((r) => r.cells[idx]?.querySelector('.mb-column-filter-highlight'));
    }, null, { timeout: 15000 });

    const visibleTitles = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0]?.textContent.trim())
    );
    expect(visibleTitles.length).toBe(2);
    expect(visibleTitles.join(' | ')).toContain("Don't Be Lonely");
    expect(visibleTitles.join(' | ')).toContain('Fadeaway');

    const highlighted = await page.evaluate(() => {
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((th) => (th.dataset.colName || '') === 'Event-Type');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none')
            .map((r) => r.cells[idx].textContent.trim());
    });
    expect(highlighted).toEqual(['live', 'live']);
});
