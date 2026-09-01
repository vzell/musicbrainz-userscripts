'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { waitForFilterSettled, getPageRowCount } = require('../support/filterSortAssertions');

// Same release-tracks pilot page used by every other release-tracks live
// spec (third-party-title-mismatch.spec.js, release-tracks-streaming-ars-
// leak.spec.js, column-visibility-survives-refilter.spec.js,
// release-tracks-part-of-series-multirow.spec.js) — "Born to Run" has
// several tracks whose "part of:" AR credits multiple series, each with its
// own series name, an optional disambiguation-comment (e.g. "2022-1-15"),
// and an optional numeric series position (e.g. "27" from "(number: 27)") —
// see debug/r-final.html.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Tracks for Release"]';
const COLUMN = 'Part of series';

/**
 * Reads the current table's header row and returns { name -> columnIndex }.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, number>>}
 */
async function getHeaderIndex(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const map = {};
        ths.forEach((th, i) => {
            const name = th.textContent.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹​]/g, '').trim();
            if (!(name in map)) map[name] = i;
        });
        return map;
    });
}

// Regression test for the split-ar-peer-column skill's own precedent fix
// (release-tracks-part-of-series-multirow.spec.js): once "Part of series"
// started splitting a multi-series credit into one <li> per series, its
// unique-values dropdown gained three new per-facet sections — "Part of
// series - Name"/"- Date"/"- Number" (see _findCellPartOfSeriesParts() and
// SYN_SECTION_META). This verifies those sections render with the expected
// entries, carry the quickfilter dataset wiring, and that checking a
// "Number" entry actually narrows the table and highlights the match.
test('unique-values dropdown gets "Part of series - Name/Date/Number" sections that filter and highlight', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const headerIndex = await getHeaderIndex(page);
    expect(headerIndex[COLUMN]).toBeGreaterThanOrEqual(0);

    const sections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLUMN
    );
    expect(sections).toBeTruthy();

    const byLabel = Object.fromEntries(sections.map((s) => [s.label, s]));
    const nameSection   = byLabel['Part of series - Name'];
    const dateSection   = byLabel['Part of series - Date'];
    const numberSection = byLabel['Part of series - Number'];

    // Name and Number facets are present on essentially every real series
    // membership on this release (see debug/r-final.html); Date is present
    // on most but not guaranteed for every entry, so it's asserted present
    // but not required non-empty as strictly as the other two.
    expect(nameSection, 'expected a "Part of series - Name" section').toBeTruthy();
    expect(numberSection, 'expected a "Part of series - Number" section').toBeTruthy();
    expect(nameSection.items.length).toBeGreaterThan(0);
    expect(numberSection.items.length).toBeGreaterThan(0);
    if (dateSection) expect(dateSection.items.length).toBeGreaterThan(0);

    // Label prefix + quickfilter dataset wiring (the uniq-dropdown-section
    // skill's step 7 — a missing dataset.mbUniqSynLabel is invisible until
    // someone types into the quickfilter bar).
    nameSection.items.forEach((i) => expect(i.label).toMatch(/^» series name: .+/));
    numberSection.items.forEach((i) => expect(i.label).toMatch(/^» number: \d+/));
    if (dateSection) dateSection.items.forEach((i) => expect(i.label).toMatch(/^» date: .+/));

    // getUniqDropSections() above already opened (and left open) the
    // "Part of series" dropdown panel — read/interact with it directly
    // rather than re-deriving/re-clicking th.mb-col-uniq-wrap, which would
    // just TOGGLE IT CLOSED again (openUniqDrop() closes its own already-
    // open owner on a second click).
    const datasetLabels = await page.evaluate(() => {
        const sectionEls = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .filter((s) => (s.querySelector('.mb-uniq-section-label')?.textContent || '').startsWith('Part of series'));
        return sectionEls.flatMap((s) => Array.from(s.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel));
    });
    expect(datasetLabels.length).toBeGreaterThan(0);
    expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);

    // Checking the FIRST "Number" entry (deterministic regardless of which
    // exact series/number this release currently has — real MB data can be
    // edited) must narrow the page-wide row count and highlight the exact
    // matched number inside the surviving row's "Part of series" cell.
    const before = await getPageRowCount(page);
    expect(before.filtered).toBe(before.total);

    await waitForFilterSettled(page, () => page.evaluate(() => {
        const numberSectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Part of series - Number');
        const firstItem = numberSectionEl.querySelector('.mb-col-uniq-item');
        firstItem.click();
    }));

    const after = await getPageRowCount(page);
    expect(after.filtered).toBeLessThan(before.total);
    expect(after.filtered).toBeGreaterThan(0);

    const highlightFound = await page.evaluate((colIdx) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        return rows.some((row) => {
            if (row.style.display === 'none') return false;
            const td = row.cells[colIdx];
            return !!(td && td.querySelector('.mb-column-filter-highlight'));
        });
    }, headerIndex[COLUMN]);
    expect(highlightFound).toBe(true);

    // Reopening the panel must reproduce the checked entry and the same
    // section contents — guards the "self-corrupting on second filter
    // pass" failure mode the uniq-dropdown-section skill documents (also
    // exercises the dropdown data cache's warm/HIT path, since nothing
    // changed the visible row set between this reopen and the check above).
    await page.evaluate(() => window.__saTest.closeUniqDrop());
    const reopenedSections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLUMN
    );
    const reopenedNumberSection = reopenedSections.find((s) => s.label === 'Part of series - Number');
    expect(reopenedNumberSection.items[0].checked).toBe(true);

    expect(pageErrors).toEqual([]);
});
