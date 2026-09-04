'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// artist-events (path.includes('/events')) declares a primary "Date" column
// with extractor: 'dateParts' — the simplest pageType this
// _findCellDateExpressionParts() code path is reachable from (no
// listToTable/entityFeatures machinery, no link_type_id gating). Its lone
// button carries no `params`, so startFetchingProcess reuses the live
// `document` instead of re-fetching — no GM_xmlhttpRequest mocking needed.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-date-expression.html');

test.describe('unique-values dropdown: "Date info - Complete"/"- Partial"/"- Range" sections', () => {
    test('classifies each row\'s "Date" text into the correct shape section, with correct counts', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));

        const complete = sections.find((s) => s.label === 'Date info - Complete');
        const partial  = sections.find((s) => s.label === 'Date info - Partial');
        const range    = sections.find((s) => s.label === 'Date info - Range');
        expect(complete).toBeTruthy();
        expect(partial).toBeTruthy();
        expect(range).toBeTruthy();

        // "2020-04-08" is the only full YYYY-MM-DD date.
        expect(complete.items.map((i) => i.label)).toEqual(['» complete date: 2020-04-08']);
        expect(complete.items[0].count).toBe(1);

        // "1974-08" (year-month) and "1974" (year-only) are both "partial",
        // sorted chronologically (1974 before 1974-08).
        expect(partial.items.map((i) => i.label)).toEqual([
            '» partial date: 1974',
            '» partial date: 1974-08',
        ]);
        expect(partial.items.every((i) => i.count === 1)).toBe(true);

        // "1973-08-09 – 1973-09-23" is a range of two complete dates —
        // never assumed complete-only, but classified here since both
        // sides happen to be full dates.
        expect(range.items.map((i) => i.label)).toEqual(['» date range: 1973-08-09 – 1973-09-23']);
        expect(range.items[0].count).toBe(1);

        // Every entry must carry dataset.mbUniqSynLabel — the quickfilter-
        // visibility wiring the uniq-dropdown-section skill documents
        // (step 7's "invisible to search" failure mode).
        const datasetLabels = await page.evaluate(() => {
            const sectionEls = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .filter((s) => ['Date info - Complete', 'Date info - Partial', 'Date info - Range']
                    .includes(s.querySelector('.mb-uniq-section-label')?.textContent));
            return sectionEls.flatMap((s) => Array.from(s.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel));
        });
        expect(datasetLabels).toHaveLength(4);
        expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    });

    test('checking the range entry narrows the table to its 1 matching row, and highlights the Date cell text', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);
        expect(totalBefore).toBe(5);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Date info - Range');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '» date range: 1973-08-09 – 1973-09-23');
            item.click();
        });

        await page.waitForFunction((expected) => {
            const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
            return rows.length > 0 && rows.length < expected;
        }, totalBefore, { timeout: 15000 });

        const visibleRows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .map((r) => r.cells[0].textContent.trim())
        );
        expect(visibleRows).toEqual(['Event D']);

        const highlighted = await page.evaluate(() =>
            !!document.querySelector('table.tbl tbody tr td:nth-child(2) .mb-column-filter-highlight'));
        expect(highlighted).toBe(true);
    });
});
