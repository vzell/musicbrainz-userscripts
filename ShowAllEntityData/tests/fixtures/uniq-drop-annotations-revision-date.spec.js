'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// annotations (/label/<mbid>/annotations) — no listToTable/insertH2 needed,
// its history table is already tbl-shaped. `labelFromPathEntity: true` means
// the button's actual data-label carries the derived entity type ("Label").
const ANNOTATIONS_URL = 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e/annotations';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-annotations-revision-date.html');

function findSectionItem(section, label) {
    return section.items.find((i) => i.label === label);
}

test.describe('annotations: "Revision date" (dateTimeParts output) gains the "Date info" family', () => {
    test('"Revision date" now shows "Date info - Precision"/"- Year"/"- Weekday" — must fail before the isDateExprCol/_dateExprColumnNames() broadening', async ({ page }) => {
        await loadUserscriptPage(page, { url: ANNOTATIONS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.click('button[data-label="Show Annotation History for Label"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const headers = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl thead th')).map((th) => th.dataset.colName));
        expect(headers).toEqual(expect.arrayContaining(['Editor', 'Date', 'Revision date', 'Revision time']));

        // The raw combined "Date" column must stay excluded (still carries
        // " HH:MM GMT+N" noise _findCellDateExpressionParts() can't parse).
        const rawDateSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
        expect((rawDateSections || []).some((s) => s.label.startsWith('Date info'))).toBe(false);

        const revisionSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Revision date'));
        expect(revisionSections).toBeTruthy();

        const precision = revisionSections.find((s) => s.label === 'Date info - Precision');
        expect(precision).toBeTruthy();
        expect(findSectionItem(precision, '📅 complete dates').count).toBe(3);

        // 2024-03-19 (rows 1+3) and 2023-11-02 (row 2).
        const year = revisionSections.find((s) => s.label === 'Date info - Year');
        expect(year).toBeTruthy();
        expect(year.items.map((i) => i.label)).toEqual(['» year: 2023', '» year: 2024']);
        expect(findSectionItem(year, '» year: 2023').count).toBe(1);
        expect(findSectionItem(year, '» year: 2024').count).toBe(2);

        // 2024-03-19 -> Tuesday (rows 1+3), 2023-11-02 -> Thursday (row 2).
        const weekday = revisionSections.find((s) => s.label === 'Date info - Weekday');
        expect(weekday).toBeTruthy();
        expect(weekday.items.map((i) => i.label)).toEqual(['» weekday: Tuesday', '» weekday: Thursday']);
        expect(findSectionItem(weekday, '» weekday: Tuesday').count).toBe(2);
        expect(findSectionItem(weekday, '» weekday: Thursday').count).toBe(1);
    });
});
