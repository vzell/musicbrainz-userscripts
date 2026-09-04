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

async function openDateDrop(page) {
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
}

function findSectionItem(section, label) {
    return section.items.find((i) => i.label === label);
}

test.describe('unique-values dropdown: "Date info - Precision"/"- Decade"/"- Month" sections', () => {
    test('"Date info - Precision" is a fixed 3-flag count, NOT one entry per date value', async ({ page }) => {
        const sections = await openDateDrop(page);
        const precision = sections.find((s) => s.label === 'Date info - Precision');
        expect(precision).toBeTruthy();

        // A=complete, F=complete; B,C=partial; D=range. Exactly 3 fixed
        // entries — never one per distinct raw date string (that's what the
        // user reported as unwanted duplication of the plain value list).
        expect(precision.items).toHaveLength(3);
        expect(findSectionItem(precision, '📅 complete dates').count).toBe(2);
        expect(findSectionItem(precision, '🌓 partial dates').count).toBe(2);
        expect(findSectionItem(precision, '↔️ date ranges').count).toBe(1);
    });

    test('"Date info - Decade" buckets by year, accumulating across multiple rows/atoms, sorted numerically', async ({ page }) => {
        const sections = await openDateDrop(page);
        const decade = sections.find((s) => s.label === 'Date info - Decade');
        expect(decade).toBeTruthy();

        // 1970-1980: B(1974), C(1974), D(1973 start AND 1973 end, deduped
        // to ONE count since both atoms share the same decade) = 3 rows.
        // 1980-1990: F(1983) = 1. 2020-2030: A(2020) = 1.
        expect(decade.items.map((i) => i.label)).toEqual([
            '» decade: 1970-1980',
            '» decade: 1980-1990',
            '» decade: 2020-2030',
        ]);
        expect(findSectionItem(decade, '» decade: 1970-1980').count).toBe(3);
        expect(findSectionItem(decade, '» decade: 1980-1990').count).toBe(1);
        expect(findSectionItem(decade, '» decade: 2020-2030').count).toBe(1);
    });

    test('"Date info - Month" buckets by calendar month NAME, sorted calendar order (not alphabetical)', async ({ page }) => {
        const sections = await openDateDrop(page);
        const month = sections.find((s) => s.label === 'Date info - Month');
        expect(month).toBeTruthy();

        // August (B, D's start, F) before September (D's end) even though
        // alphabetically "August" < "September" already — the real proof
        // is April (month 4) sorting before August (month 8) despite
        // "April" < "August" alphabetically too; a lexicographic sort
        // would happen to agree here, so the meaningful check is that
        // C (year-only, no month) contributes NOTHING.
        expect(month.items.map((i) => i.label)).toEqual([
            '» month: April',
            '» month: August',
            '» month: September',
        ]);
        expect(findSectionItem(month, '» month: April').count).toBe(1);
        // B, D (start atom "1973-08-09"), F — three DIFFERENT rows.
        expect(findSectionItem(month, '» month: August').count).toBe(3);
        expect(findSectionItem(month, '» month: September').count).toBe(1);

        // Every entry must carry dataset.mbUniqSynLabel — the quickfilter-
        // visibility wiring the uniq-dropdown-section skill documents
        // (step 7's "invisible to search" failure mode).
        const datasetLabels = await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Date info - Month');
            return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel);
        });
        expect(datasetLabels).toHaveLength(3);
        expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    });

    test('checking "date-range" narrows to Event D only, highlighting its whole Date cell', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);
        expect(totalBefore).toBe(6);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Date info - Precision');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '↔️ date ranges');
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

        const highlightedText = await page.evaluate(() =>
            document.querySelector('table.tbl tbody tr td:nth-child(2) .mb-column-filter-highlight')?.textContent);
        expect(highlightedText).toBe('1973-08-09 – 1973-09-23');
    });

    test('checking "August" narrows to B/D/F, highlighting ONLY the matching atom in D\'s range (not "1973-09-23")', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Date info - Month');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '» month: August');
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
        expect(visibleRows.sort()).toEqual(['Event B', 'Event D', 'Event F']);

        const dRowHighlights = await page.evaluate(() => {
            const row = Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .find((r) => r.cells[0].textContent.trim() === 'Event D');
            return Array.from(row.cells[1].querySelectorAll('.mb-column-filter-highlight')).map((el) => el.textContent);
        });
        expect(dRowHighlights).toEqual(['1973-08-09']);
    });
});
