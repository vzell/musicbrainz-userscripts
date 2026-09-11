'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// auto-editor-election (/election/<n>) — no listToTable/insertH2 needed, its
// "Votes cast" table is already tbl-shaped. Its button carries no `params`,
// so startFetchingProcess reuses the live document instead of re-fetching.
const ELECTION_URL = 'https://musicbrainz.org/election/473';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-election-date.html');

async function loadElectionPage(page) {
    await loadUserscriptPage(page, { url: ELECTION_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Votes cast"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

function findSectionItem(section, label) {
    return section.items.find((i) => i.label === label);
}

test.describe('auto-editor-election: "Date" -> dateTimeParts wiring and "Voter" editor-info gate', () => {
    test('"Date" splits into "Vote date"/"Vote time", both distinct from the raw combined column', async ({ page }) => {
        await loadElectionPage(page);

        const headers = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl thead th')).map((th) => th.dataset.colName));
        expect(headers).toEqual(expect.arrayContaining(['Voter', 'Vote', 'Date', 'Vote date', 'Vote time']));

        const rows = await page.evaluate(() => {
            const idx = (name) => Array.from(document.querySelectorAll('table.tbl thead th'))
                .findIndex((th) => th.dataset.colName === name);
            const dateIdx = idx('Vote date'), timeIdx = idx('Vote time');
            return Array.from(document.querySelectorAll('table.tbl tbody tr')).map((r) => ({
                date: r.cells[dateIdx].textContent.trim(),
                time: r.cells[timeIdx].textContent.trim(),
            }));
        });
        expect(rows).toEqual([
            { date: '2025-01-31', time: '08:37 GMT+1' },
            { date: '2024-06-15', time: '10:00 GMT+2' },
            { date: '2024-06-15', time: '09:12 GMT+2' },
            { date: '2023-03-10', time: '09:15 GMT+1' },
        ]);
    });

    test('"Date info" family appears on the synthetic "Vote date" column, NOT on the raw combined "Date" column', async ({ page }) => {
        await loadElectionPage(page);

        const dateSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
        expect((dateSections || []).some((s) => s.label.startsWith('Date info'))).toBe(false);

        const voteDateSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Vote date'));
        const precision = voteDateSections.find((s) => s.label === 'Date info - Precision');
        expect(precision).toBeTruthy();
        expect(findSectionItem(precision, '📅 complete dates').count).toBe(4);

        // 2023(1), 2024(2 — the two rows sharing "2024-06-15"), 2025(1).
        const year = voteDateSections.find((s) => s.label === 'Date info - Year');
        expect(year.items.map((i) => i.label)).toEqual(['» year: 2023', '» year: 2024', '» year: 2025']);
        expect(findSectionItem(year, '» year: 2023').count).toBe(1);
        expect(findSectionItem(year, '» year: 2024').count).toBe(2);
        expect(findSectionItem(year, '» year: 2025').count).toBe(1);

        // 2025-01-31 and 2023-03-10 are both COMPUTED Fridays; the two
        // 2024-06-15 rows are both COMPUTED Saturdays — sorted Sun..Sat.
        const weekday = voteDateSections.find((s) => s.label === 'Date info - Weekday');
        expect(weekday.items.map((i) => i.label)).toEqual(['» weekday: Friday', '» weekday: Saturday']);
        expect(findSectionItem(weekday, '» weekday: Friday').count).toBe(2);
        expect(findSectionItem(weekday, '» weekday: Saturday').count).toBe(2);
    });

    test('"Editor info" family appears on "Voter" (widened EDITOR_INFO_COLUMN_NAMES gate, not just annotations\' "Editor")', async ({ page }) => {
        await loadElectionPage(page);

        const voterSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Voter'));
        const deleted = voterSections.find((s) => s.label === 'Editor info - Deleted');
        expect(deleted).toBeTruthy();
        expect(deleted.items.map((i) => i.label)).toEqual([
            '🗑️ any deleted editor',
            '» deleted editor: Deleted Editor #12345',
        ]);
        expect(findSectionItem(deleted, '🗑️ any deleted editor').count).toBe(1);
        expect(findSectionItem(deleted, '» deleted editor: Deleted Editor #12345').count).toBe(1);

        // No recorded-name/membership/comment facets in this fixture's plain
        // /user/<name> links (no `title` tooltip, no sibling `.comment`).
        expect(voterSections.some((s) => s.label === 'Editor info - Recorded name')).toBe(false);
        expect(voterSections.some((s) => s.label === 'Editor info - Membership')).toBe(false);
        expect(voterSections.some((s) => s.label === 'Editor info - Comment')).toBe(false);
    });
});
