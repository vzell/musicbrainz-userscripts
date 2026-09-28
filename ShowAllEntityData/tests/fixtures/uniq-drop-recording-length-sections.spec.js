'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// "Recording length" (release-tracks' own bespoke second duration column —
// docs/claude/release-tracks-and-length.md) must get the same "Length info -
// Duration/Deviation/Milliseconds/Live status" 📊 dropdown sections "Length"
// gets (docs/claude/uniq-dropdown.md), each computed from ITS OWN cell
// values — not always from "Length"'s. Reuses the real "Born to Run" fixture
// release-tracks-recording-length.spec.js already established (8 tracks,
// Length and Recording length genuinely disagree on 6 of them), since the
// two columns' averages must actually differ for this to test "computed
// independently" rather than just "same UI machinery".
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_DIFFER = path.join(__dirname, 'release-tracks-ms-length.html');

const openFixture = async (page) => {
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE_DIFFER,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await page.waitForSelector('#mb-filter-container');
};

test.describe('unique-values dropdown: "Recording length" shares "Length"\'s sections', () => {
    test('the same "Length info" sections populate for "Recording length" too', async ({ page }) => {
        await openFixture(page);

        const lengthSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const recSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Recording length'));

        // Same section SET — the whole point of "same sections as Length".
        // Fails before the fix: today "Recording length" renders none of these.
        expect(recSections.map((s) => s.label).sort()).toEqual(lengthSections.map((s) => s.label).sort());
        expect(recSections.map((s) => s.label)).toEqual(expect.arrayContaining([
            'Length info - Duration', 'Length info - Deviation', 'Length info - Milliseconds',
        ]));

        const recDeviation = recSections.find((s) => s.label === 'Length info - Deviation');
        expect(recDeviation.items.length).toBeGreaterThan(0);
        const recDuration = recSections.find((s) => s.label === 'Length info - Duration');
        expect(recDuration.items.length).toBeGreaterThan(0);
    });

    test('the reference average is computed independently per column, not shared', async ({ page }) => {
        await openFixture(page);

        const lengthAvg = await page.evaluate(() => window.__saTest.getLengthColumnAverages('table.tbl', 'Length'));
        const recAvg = await page.evaluate(() => window.__saTest.getLengthColumnAverages('table.tbl', 'Recording length'));

        expect(lengthAvg.ready).toBe(true);
        expect(recAvg.ready).toBe(true);
        // The two columns' own known values genuinely differ (6 of 8 tracks),
        // so their averages must differ too — a regression to "reuses
        // Length's average" would make these equal.
        expect(recAvg.referenceAvgSeconds).not.toBe(lengthAvg.referenceAvgSeconds);
        expect(lengthAvg.referenceAvgSeconds).toBeCloseTo(296.125, 3);
        expect(recAvg.referenceAvgSeconds).toBeCloseTo(295.375, 3);
    });

    test('checking a deviation entry under "Recording length" highlights ONLY that column\'s cell, never "Length"\'s', async ({ page }) => {
        await openFixture(page);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Recording length'));
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Length info - Deviation');
            // Track B1 (6:31) is the sole "25-50% longer than average" row for
            // BOTH columns in this fixture (its Recording length never
            // disagrees with its Length), so this proves column-scoping
            // without also needing the bucket MEMBERSHIP itself to diverge.
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '⏫ 25–50% longer than average');
            item.click();
        });

        await page.waitForFunction(() => {
            const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
            return rows.length === 1;
        }, { timeout: 15000 });

        const result = await page.evaluate(() => {
            const row = Array.from(document.querySelectorAll('table.tbl tbody tr')).find((r) => r.style.display !== 'none');
            const ths = Array.from(row.closest('table').querySelectorAll('thead th'));
            const lengthIdx = ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
            const recIdx = ths.findIndex((t) => (t.dataset.colName || '') === 'Recording length');
            return {
                recText: row.cells[recIdx].textContent.trim(),
                recHighlighted: !!row.cells[recIdx].querySelector('.mb-column-filter-highlight'),
                lengthHighlighted: !!row.cells[lengthIdx].querySelector('.mb-column-filter-highlight'),
            };
        });

        expect(result.recText).toBe('6:31');
        expect(result.recHighlighted).toBe(true);
        expect(result.lengthHighlighted).toBe(false);
    });

    test('opening then re-opening the other column\'s dropdown on the same table does not replay the wrong cached average', async ({ page }) => {
        await openFixture(page);

        // Open "Length" first (memoizes its own average), THEN "Recording
        // length" — a per-table (not per-column) cache would replay
        // "Length"'s average here.
        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const recAvg = await page.evaluate(() => window.__saTest.getLengthColumnAverages('table.tbl', 'Recording length'));
        expect(recAvg.referenceAvgSeconds).toBeCloseTo(295.375, 3);

        // And the reverse order.
        await page.evaluate(() => window.__saTest.getUniqDropSections('Recording length'));
        const lengthAvg = await page.evaluate(() => window.__saTest.getLengthColumnAverages('table.tbl', 'Length'));
        expect(lengthAvg.referenceAvgSeconds).toBeCloseTo(296.125, 3);
    });
});
