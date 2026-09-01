'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// This user's Event ratings list (see debug/user-ratings-event.html) mixes
// cancelled and non-cancelled events, enough to exercise the "Event info -
// Event cancelled" section. This page is publicly viewable logged-out (no
// auth needed). Real counts can drift as ratings are added/removed, hence
// the >0 assertions below rather than hardcoded exact numbers.
const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings/event/';
const SHOW_ALL_BUTTON = 'button[data-label="Show Ratings for Events"]';
const COLUMN = 'Event';

test('unique-values dropdown gets an "Event info - Event cancelled" section on the Event column', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RATINGS_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const sections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLUMN
    );
    expect(sections).toBeTruthy();

    const section = sections.find((s) => s.label === 'Event info - Event cancelled');
    expect(section, 'expected an "Event info - Event cancelled" section').toBeTruthy();

    const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i]));
    expect(byLabel['» event cancelled: cancelled']).toBeTruthy();
    expect(byLabel['» event cancelled: cancelled'].count).toBeGreaterThan(0);

    // Every entry must carry dataset.mbUniqSynLabel — the quickfilter-
    // visibility wiring the uniq-dropdown-section skill documents.
    const datasetLabels = await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Event info - Event cancelled');
        return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel);
    });
    expect(datasetLabels).toHaveLength(section.items.length);
    expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);

    // Checking the entry must narrow the table to only rows whose own
    // "Event" cell carries the native `<span class="cancelled">` marker,
    // and highlight its "cancelled" text.
    const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);

    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Event info - Event cancelled');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '» event cancelled: cancelled');
        item.click();
    });
    await page.waitForFunction((expected) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
        return rows.length > 0 && rows.length < expected;
    }, totalBefore, { timeout: 15000 });

    const afterCheck = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const idx = Array.from(th.parentElement.children).indexOf(th);
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
        return rows.every((r) => {
            const cell = r.cells[idx];
            const cancelledSpan = cell?.querySelector('span.cancelled');
            const highlight = cell?.querySelector('.mb-column-filter-highlight');
            return !!cancelledSpan && !!highlight;
        });
    }, COLUMN);
    expect(afterCheck).toBe(true);

    expect(pageErrors).toEqual([]);
});
