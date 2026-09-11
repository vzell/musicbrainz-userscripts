'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// auto-elections (/elections) — a single native table.tbl, no listToTable/
// insertH2 machinery for the table itself. Its button carries no `params`,
// so startFetchingProcess reuses the live document instead of re-fetching.
const ELECTIONS_URL = 'https://musicbrainz.org/elections';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-elections-list.html');

async function loadElectionsPage(page) {
    await loadUserscriptPage(page, { url: ELECTIONS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Elections"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

function findSectionItem(section, label) {
    return section.items.find((i) => i.label === label);
}

test.describe('auto-elections: "Start date"/"End date" -> dateTimeParts wiring and editor-link columns\' editor-info gate', () => {
    test('"Start date"/"End date" each split into their own synthetic date/time pair', async ({ page }) => {
        await loadElectionsPage(page);

        const headers = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl thead th')).map((th) => th.dataset.colName));
        expect(headers).toEqual(expect.arrayContaining([
            'Candidate', 'Start date', 'End date',
            'Election start date', 'Election start time',
            'Election end date', 'Election end time',
        ]));

        const firstRow = await page.evaluate(() => {
            const idx = (name) => Array.from(document.querySelectorAll('table.tbl thead th'))
                .findIndex((th) => th.dataset.colName === name);
            const r = document.querySelector('table.tbl tbody tr');
            return {
                startDate: r.cells[idx('Election start date')].textContent.trim(),
                startTime: r.cells[idx('Election start time')].textContent.trim(),
                endDate: r.cells[idx('Election end date')].textContent.trim(),
                endTime: r.cells[idx('Election end time')].textContent.trim(),
            };
        });
        expect(firstRow).toEqual({
            startDate: '2026-08-27', startTime: '13:14 GMT+2',
            endDate: '2026-09-01', endTime: '10:29 GMT+2',
        });
    });

    test('"Date info" family appears on both synthetic date columns independently, not on the raw "Start date"/"End date"', async ({ page }) => {
        await loadElectionsPage(page);

        const rawStart = await page.evaluate(() => window.__saTest.getUniqDropSections('Start date'));
        const rawEnd = await page.evaluate(() => window.__saTest.getUniqDropSections('End date'));
        expect((rawStart || []).some((s) => s.label.startsWith('Date info'))).toBe(false);
        expect((rawEnd || []).some((s) => s.label.startsWith('Date info'))).toBe(false);

        const startSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Election start date'));
        const startYear = startSections.find((s) => s.label === 'Date info - Year');
        expect(startYear.items.map((i) => i.label)).toEqual(['» year: 2004', '» year: 2026']);
        expect(findSectionItem(startYear, '» year: 2004').count).toBe(2);
        expect(findSectionItem(startYear, '» year: 2026').count).toBe(2);
        // 2026-08-27 -> Thursday, 2004-07-24 -> Saturday.
        const startWeekday = startSections.find((s) => s.label === 'Date info - Weekday');
        expect(startWeekday.items.map((i) => i.label)).toEqual(['» weekday: Thursday', '» weekday: Saturday']);
        expect(findSectionItem(startWeekday, '» weekday: Thursday').count).toBe(2);
        expect(findSectionItem(startWeekday, '» weekday: Saturday').count).toBe(2);

        const endSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Election end date'));
        const endYear = endSections.find((s) => s.label === 'Date info - Year');
        expect(endYear.items.map((i) => i.label)).toEqual(['» year: 2004', '» year: 2026']);
        // 2026-09-01 -> Tuesday, 2004-07-31 -> Saturday.
        const endWeekday = endSections.find((s) => s.label === 'Date info - Weekday');
        expect(endWeekday.items.map((i) => i.label)).toEqual(['» weekday: Tuesday', '» weekday: Saturday']);
        expect(findSectionItem(endWeekday, '» weekday: Tuesday').count).toBe(2);
        expect(findSectionItem(endWeekday, '» weekday: Saturday').count).toBe(2);
    });

    test('"Editor info" family appears independently on Candidate/Proposer/1st seconder/2nd seconder', async ({ page }) => {
        await loadElectionsPage(page);

        const cases = [
            ['Candidate', 'Deleted Editor #11111'],
            ['Proposer', 'Deleted Editor #22222'],
            ['1st seconder', 'Deleted Editor #33333'],
            ['2nd seconder', 'Deleted Editor #44444'],
        ];
        for (const [colName, deletedName] of cases) {
            const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), colName);
            const deleted = sections.find((s) => s.label === 'Editor info - Deleted');
            expect(deleted, `column "${colName}" should have "Editor info - Deleted"`).toBeTruthy();
            expect(findSectionItem(deleted, `» deleted editor: ${deletedName}`).count).toBe(1);
            expect(findSectionItem(deleted, '🗑️ any deleted editor').count).toBe(1);
        }
    });
});
