'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Same page type/header shape uniq-drop-name-collision-non-area.spec.js uses
// (artist-recordings) so pageType detection + headerContainer resolve, and
// so "Length" is a real, integerColumns-styled column.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-length-bucket.html');

test.describe('unique-values dropdown: "Length info - Duration" bucket section', () => {
    test('buckets five rows into 3 duration ranges + "Unknown length", with correct counts', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        // "⊚ All recordings" carries overrideParams (all=1), so
        // startFetchingProcess always re-fetches page 1 over the network
        // rather than reusing the live document — same reasoning as
        // uniq-drop-name-collision-non-area.spec.js.
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const section = sections.find((s) => s.label === 'Length info - Duration');
        expect(section).toBeTruthy();

        const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i]));
        // "5:05.146"/"5:50" (both 5-6 minutes) collapse into one bucket
        // entry with count 2; "0:45"/"1:30" each get their own single-count
        // bucket; "?:??" maps to "Unknown length" — this is the exact
        // bucketing scheme requested (0-1, 1-2, 5-6 minutes, Unknown).
        expect(byLabel['» duration: 0 to 1 minutes'].count).toBe(1);
        expect(byLabel['» duration: 1 to 2 minutes'].count).toBe(1);
        expect(byLabel['» duration: 5 to 6 minutes'].count).toBe(2);
        expect(byLabel['» duration: Unknown length'].count).toBe(1);
        expect(section.items).toHaveLength(4);

        // Sort order: ascending by bucket minute, "Unknown length" last.
        expect(section.items.map((i) => i.label)).toEqual([
            '» duration: 0 to 1 minutes',
            '» duration: 1 to 2 minutes',
            '» duration: 5 to 6 minutes',
            '» duration: Unknown length',
        ]);

        // Every entry must carry dataset.mbUniqSynLabel — the quickfilter-
        // visibility wiring the uniq-dropdown-section skill documents
        // (step 7's "invisible to search" failure mode).
        const datasetLabels = await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Length info - Duration');
            return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel);
        });
        expect(datasetLabels).toHaveLength(4);
        expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    });

    test('checking "5 to 6 minutes" narrows the table to only its 2 matching rows, and highlights their Length cell text', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);
        expect(totalBefore).toBe(5);

        // Open the "Length" column's dropdown (getUniqDropSections toggles
        // it open) then click the "5 to 6 minutes" entry.
        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Length info - Duration');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '» duration: 5 to 6 minutes');
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
        expect(visibleRows.sort()).toEqual(['Track C', 'Track D']);

        // The matched Length cell's own duration text gets highlighted —
        // _highlightLengthBucketMatch()'s job. highlightCrossTag() wraps
        // each underlying text node segment it crosses in its own span
        // (here: the "5"/":"/"05.146" or "5"/":"/"50" trio each get their
        // own), so this counts distinct ROWS carrying at least one
        // highlight span, not the raw span count.
        const highlightedRowCount = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none' && r.querySelector('.mb-column-filter-highlight'))
                .length
        );
        expect(highlightedRowCount).toBe(2);
    });
});
