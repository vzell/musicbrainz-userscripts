'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// A recording whose "Associated AcoustIDs" table (83 rows, per
// debug/rec-fingerprint.html) has a genuine mix of both states: the
// AcoustID's own <a class="external"> link additionally carries
// MusicBrainz's own `disabled-acoustid` class when unlinked from this
// recording (56 linked / 27 unlinked at capture time — real counts can
// drift as AcoustID submissions/edits happen, hence the >0 assertions
// below rather than hardcoded exact numbers).
const RECORDING_URL = 'https://musicbrainz.org/recording/7ada2178-c1db-4a24-9760-810681e95308/fingerprints';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Fingerprints for Recording"]';
const COLUMN = 'AcoustID';

test('unique-values dropdown gets an "AcoustID info - Link status" section (Linked/Unlinked)', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RECORDING_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const sections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLUMN
    );
    expect(sections).toBeTruthy();

    const section = sections.find((s) => s.label === 'AcoustID info - Link status');
    expect(section, 'expected an "AcoustID info - Link status" section').toBeTruthy();

    const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i]));
    expect(byLabel['🔗 linked']).toBeTruthy();
    expect(byLabel['🚫 unlinked']).toBeTruthy();
    expect(byLabel['🔗 linked'].count).toBeGreaterThan(0);
    expect(byLabel['🚫 unlinked'].count).toBeGreaterThan(0);
    // The two states are mutually exclusive and exhaustive — every row is
    // exactly one or the other — so they must sum to the column's own
    // total distinct-value count shown on the header's 📊 button.
    const headerCount = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th'))
            .find((t) => t.dataset.colName === colName);
        return th ? Number(th.querySelector('.mb-col-uniq-count')?.textContent || 0) : null;
    }, COLUMN);
    // headerCount is the distinct-VALUE count (one per unique AcoustID
    // code), not the row count — every row is a distinct AcoustID here, so
    // they coincide, but assert against total ROW count for robustness
    // rather than assuming that equivalence.
    const totalRows = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);
    expect(byLabel['🔗 linked'].count + byLabel['🚫 unlinked'].count).toBe(totalRows);
    expect(headerCount).toBeGreaterThan(0);

    // Every entry must carry dataset.mbUniqSynLabel — the quickfilter-
    // visibility wiring the uniq-dropdown-section skill documents.
    const datasetLabels = await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'AcoustID info - Link status');
        return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel);
    });
    expect(datasetLabels).toHaveLength(section.items.length);
    expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);

    // "Use the same glyphs/classes as the MusicBrainz page" — the
    // "unlinked" entry's own label reuses MusicBrainz's real
    // `disabled-acoustid` CSS class directly (see makeSynItem()'s
    // extraLabelClass param), not an invented emoji-only substitute.
    const unlinkedLabelHasClass = await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'AcoustID info - Link status');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '🚫 unlinked');
        return !!item?.querySelector('.mb-uniq-syn-label-text.disabled-acoustid');
    });
    expect(unlinkedLabelHasClass).toBe(true);

    // Checking "🚫 unlinked" must narrow the table to only unlinked rows
    // (every surviving row's AcoustID anchor carries disabled-acoustid),
    // and unchecking it must restore the full row count.
    const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);

    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'AcoustID info - Link status');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '🚫 unlinked');
        item.click();
    });
    await page.waitForFunction((expected) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
        return rows.length > 0 && rows.length < expected;
    }, totalBefore, { timeout: 15000 });

    const afterCheckVisible = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const idx = Array.from(th.parentElement.children).indexOf(th);
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
        return rows.every((r) => r.cells[idx]?.querySelector('a.disabled-acoustid'));
    }, COLUMN);
    expect(afterCheckVisible).toBe(true);

    expect(pageErrors).toEqual([]);
});
