'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { findingRow } = require('../support/findingsMenu');

// 📊 "Length info - Track vs recording": on release-tracks, the "Length" and
// "Recording length" columns' dropdowns count the cells _applyLengthMismatchFlag()
// marked — ❌ (far over: threshold × multiple) and ⚠️ (over the threshold) —
// and checking an entry filters to exactly those tracks. The entries read the
// same `data-mb-len-flag` attribute the tint, the glyph and the ⚠️/❌ findings
// menus read, so the counts must agree with those menus' length rows.
//
// Fixture: the real "Born to Run" page (see release-tracks-recording-length.spec.js).
// Its track-vs-recording gaps are A1 0.160 s, A2 0.666 s, A3 0.800 s, A4 0,
// B1 0.360 s, B2 0.800 s, B3 3.000 s, B4 0 (see TRACK/REC millis there).
// Seeded here at a 500 ms threshold × 3, which yields both levels on one page:
//   ❌ (> 1.5 s): B3 "Meeting Across the River" (3:19.000 vs 3:16.000, 3 s);
//   ⚠️ (> 0.5 s): A2 (0.666 s), A3 (0.8 s), B2 (0.8 s).
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_DIFFER = path.join(__dirname, 'release-tracks-ms-length.html');
const SECTION = 'Length info - Track vs recording';
const SEVERE = '❌ far apart from the other length';
const WARN = '⚠️ apart beyond the threshold';

const openFixture = async (page) => {
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE_DIFFER,
        testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_release_tracks_length_mismatch_threshold_ms: 500,
            sa_release_tracks_length_mismatch_severe_factor: 3,
        },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await page.waitForSelector('#mb-filter-container');
};

/**
 * Reads the row count the ⚠️ WARNING / ❌ ERROR findings menu shows for one
 * length level (they replaced the "(N) LENGTH …" summary buttons).
 *
 * @param {import('@playwright/test').Page} page
 * @param {'warn'|'error'} level
 * @param {string} id - 'len-warn' | 'len-severe'
 * @returns {Promise<number>}
 */
const menuCount = async (page, level, id) => ((await findingRow(page, level, id)) || {}).count || 0;

/** Visible rows' "#" text, in order. */
const visiblePositions = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead th'));
        const pIdx = ths.findIndex((t) => (t.dataset.colName || '') === '#');
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display !== 'none' && tr.cells[pIdx]) out.push(tr.cells[pIdx].textContent.trim());
        });
    });
    return out;
});

test.describe('unique-values dropdown: "Length info - Track vs recording"', () => {
    for (const col of ['Length', 'Recording length']) {
        test(`"${col}": ❌/⚠️ counts match the findings menus`, async ({ page }) => {
            await openFixture(page);
            const severeBtn = await menuCount(page, 'error', 'len-severe');
            const warnBtn = await menuCount(page, 'warn', 'len-warn');
            expect(severeBtn).toBe(1);
            expect(warnBtn).toBe(3);

            const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), col);
            const sec = sections.find((s) => s.label === SECTION);
            expect(sec, `section "${SECTION}" on ${col}`).toBeTruthy();
            const counts = Object.fromEntries(sec.items.map((i) => [i.label, i.count]));
            expect(counts[SEVERE]).toBe(severeBtn);
            expect(counts[WARN]).toBe(warnBtn);
        });
    }

    test('checking ❌ on "Recording length" leaves only the far-over track', async ({ page }) => {
        await openFixture(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Recording length'));
        await page.evaluate(({ section, label }) => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === section);
            Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === label).click();
        }, { section: SECTION, label: SEVERE });

        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 1, null, { timeout: 15000 });
        expect(await visiblePositions(page)).toEqual(['B3']);
    });

    test('checking ⚠️ on "Length" leaves exactly the three over-threshold tracks', async ({ page }) => {
        await openFixture(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await page.evaluate(({ section, label }) => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === section);
            Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === label).click();
        }, { section: SECTION, label: WARN });

        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 3, null, { timeout: 15000 });
        expect(await visiblePositions(page)).toEqual(['A2', 'A3', 'B2']);
    });

    test('no flagged cell, no section (flagging switched off)', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE_DIFFER,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true, sa_enable_release_tracks_length_mismatch_flag: false },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        expect(sections.map((s) => s.label)).not.toContain(SECTION);
    });
});
