'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Reuses the already-committed "Born to Run" release-tracks fixture (real
// native MusicBrainz markup) instead of hand-authoring a new one: both of
// its tracks already carry a "live recording of:" AR ending in "recording
// of:" (matched by _findRecOfDt's /recording of:$/i) with the SAME
// "(on 1999-04-11)" date, which is exactly the "Recording date" column
// shape this regression covers. 1999-04-11 is a Sunday.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-recording-of-pending-edits.html');

async function openRecordingDateDrop(page) {
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await page.waitForSelector('#mb-filter-container');
    return page.evaluate(() => window.__saTest.getUniqDropSections('Recording date'));
}

test.describe('unique-values dropdown: "Date info" sections on release-tracks\' "Recording date" column', () => {
    test('gets the full Date-info section family, not just the raw value list', async ({ page }) => {
        const sections = await openRecordingDateDrop(page);

        // Before the fix, _dateExprColumnNames() never returned "Recording
        // date" (it isn't in any declarative columnExtractors/
        // syntheticColumnExtractors entry — it's built by
        // applyExtractTrackTitleData()'s bespoke AR pipeline), so
        // isDateExprCol was always false and NONE of these sections existed
        // at all for this column.
        const labels = sections.map((s) => s.label);
        expect(labels).toEqual(expect.arrayContaining([
            'Date info - Precision',
            'Date info - Decade',
            'Date info - Month',
            'Date info - Year',
            'Date info - Weekday',
        ]));

        // Both tracks share the identical date "1999-04-11" -> every bucket
        // this single value belongs to gets exactly 2.
        const find = (label, item) => sections.find((s) => s.label === label).items.find((i) => i.label === item);
        expect(find('Date info - Precision', '📅 complete dates').count).toBe(2);
        expect(find('Date info - Decade', '» decade: 1990-2000').count).toBe(2);
        expect(find('Date info - Month', '» month: April').count).toBe(2);
        expect(find('Date info - Year', '» year: 1999').count).toBe(2);
        expect(find('Date info - Weekday', '» weekday: Sunday').count).toBe(2);
    });

    test('checking "Sunday" highlights the recording date in both rows', async ({ page }) => {
        await openRecordingDateDrop(page);

        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Date info - Weekday');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '» weekday: Sunday');
            item.click();
        });

        await page.waitForFunction(() => {
            const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
                .findIndex((th) => (th.dataset.colName || '') === 'Recording date');
            if (idx < 0) return false;
            return Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .every((r) => r.cells[idx]?.querySelector('.mb-column-filter-highlight'));
        }, null, { timeout: 15000 });

        const highlights = await page.evaluate(() => {
            const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
                .findIndex((th) => (th.dataset.colName || '') === 'Recording date');
            return Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .map((r) => r.cells[idx].textContent.trim());
        });
        expect(highlights).toEqual(['1999-04-11', '1999-04-11']);
    });
});
