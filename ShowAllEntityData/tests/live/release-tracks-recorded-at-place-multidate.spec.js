'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// Same release-tracks pilot page used by every other release-tracks live
// spec — "Thunder Road" (and several other tracks on this release, per
// debug/r-initial.html) has a "recorded at:" AR crediting TWO places under
// one shared <dt>, each individually bounded by its own "(from … until …)"
// date range: "914 Sound Studios … (from 1974-10 until 1975-03)" and
// "The Record Plant … (from 1975-04-18 until 1975-07-16)".
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Tracks for Release"]';
const COLUMN = 'Recorded at place';

/**
 * Reads the current table's header row and returns { name -> columnIndex }.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, number>>}
 */
async function getHeaderIndex(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const map = {};
        ths.forEach((th, i) => {
            const name = th.textContent.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹​]/g, '').trim();
            if (!(name in map)) map[name] = i;
        });
        return map;
    });
}

// Regression test for a real, confirmed-live bug: when a single "recorded
// at:" AR credits more than one place, each individually bounded by its own
// "(from … until …)" date range (rather than one date shared by the whole
// relationship), _buildRecordedAtPlaceTd() extracted only the LAST place's
// date from the end of the whole <dd> and re-appended that SAME shared date
// onto every place's own <li> — so an earlier place's <li> ended up showing
// its own correct date PLUS a spurious duplicate copy of the last place's
// date tacked on after it.
test('a "recorded at:" AR crediting two individually-dated places keeps each place\'s own date, not the other place\'s', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: RELEASE_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const headerIndex = await getHeaderIndex(page);
    expect(headerIndex[COLUMN]).toBeGreaterThanOrEqual(0);

    const colIdx = headerIndex[COLUMN];
    const cells = await page.evaluate((idx) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        return rows.map((row) => {
            const td = row.cells[idx];
            if (!td) return null;
            const lis = Array.from(td.querySelectorAll(':scope > ul > li'));
            return {
                liCount: lis.length,
                liTexts: lis.map((li) => li.textContent.trim()),
                liDateSpanTexts: lis.map((li) => Array.from(li.querySelectorAll('.mb-credit-date')).map((s) => s.textContent.trim())),
            };
        }).filter(Boolean);
    }, colIdx);

    // At least one track on this release credits 2+ individually-dated
    // places under one "recorded at:" AR — this is the multi-place,
    // multi-date shape under test.
    const multiDateRow = cells.find((c) => c.liCount >= 2 &&
        c.liDateSpanTexts.every((dates) => dates.length === 1) &&
        new Set(c.liDateSpanTexts.map((dates) => dates[0])).size === c.liDateSpanTexts.length);
    expect(multiDateRow, 'expected a "Recorded at place" cell with 2+ places, each with its own distinct date').toBeTruthy();

    // The bug: every place's <li> must carry EXACTLY ONE date annotation —
    // its own — never a second, duplicated copy of a SIBLING place's date.
    multiDateRow.liDateSpanTexts.forEach((dates, i) => {
        expect(dates.length, `li[${i}] ("${multiDateRow.liTexts[i]}") date-span count`).toBe(1);
    });

    // Every place's own date text appears in its own <li> exactly once —
    // and does NOT additionally appear inside any OTHER place's <li> text
    // (the exact duplication shape reported live: an earlier place's <li>
    // ending in ITS OWN date immediately followed by a copy of the LAST
    // place's date).
    multiDateRow.liTexts.forEach((text, i) => {
        const ownDate = multiDateRow.liDateSpanTexts[i][0];
        const occurrences = text.split(ownDate).length - 1;
        expect(occurrences, `li[${i}] text should contain its own date "${ownDate}" exactly once`).toBe(1);
        multiDateRow.liDateSpanTexts.forEach((otherDates, j) => {
            if (i === j) return;
            expect(text, `li[${i}] must not contain sibling li[${j}]'s date "${otherDates[0]}"`).not.toContain(otherDates[0]);
        });
    });

    expect(pageErrors).toEqual([]);
});
