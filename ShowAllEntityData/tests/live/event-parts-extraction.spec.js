'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, assertGroupedRenderCompleted } = require('../support/liveAssertions');

/**
 * Two independent `eventParts` bugs, both reproduced on the same work page
 * ("A Rainy Night in Soho") so both tests share one pilot URL:
 *
 *  - Test 1 (debug/event-extraction-bug.org): the location string used to be
 *    comma-split BEFORE locating the ';' boundary between Event-Country and
 *    Event-Additional-Info. When Additional-Info itself contained a comma
 *    (e.g. "...Ireland; YouTube – X, from Y"), that produced extra
 *    pseudo-location segments, silently dropping the venue name and shifting
 *    City/State/Country by one field. Exercises the non-USA/Canada/UK
 *    ("Right-to-Left fallback") branch, unlike the two USA-based
 *    debug/*.html snapshots for this bug.
 *  - Test 2 (debug/multiple-dates.html): a full date followed by one or more
 *    '/DD' segments (MusicBrainz's own "recorded on one of these days, exact
 *    day unclear" convention, e.g. "2001-12-22/23") wasn't recognized as a
 *    date at all, so the whole string fell through to Event-Detail instead
 *    of Event-Date.
 */
const WORK_URL = 'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Recordings for Work"]';

/**
 * Reads the named Event-* synthetic column values for the row whose title
 * link points at the given recording MBID.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} recordingId
 * @param {string[]} columnNames
 * @returns {Promise<Record<string, string>>}
 */
async function getEventCells(page, recordingId, columnNames) {
    const colIndexes = await page.evaluate((colNames) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        const headers = Array.from(document.querySelectorAll('table.tbl thead th'));
        return colNames.map((name) => headers.findIndex((t) => strip(t.textContent) === name));
    }, columnNames);

    colIndexes.forEach((idx, i) => expect(idx, `column "${columnNames[i]}" not found`).toBeGreaterThanOrEqual(0));

    const row = page.locator(`tr:has(a[href*="/recording/${recordingId}"])`).first();
    const result = {};
    for (let i = 0; i < columnNames.length; i++) {
        result[columnNames[i]] = (await row.locator('td').nth(colIndexes[i]).textContent() || '').trim();
    }
    return result;
}

/**
 * Navigates to the work page and clicks "Show all Recordings for Work",
 * waiting for the consolidated multi-table render to complete.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} pageErrors
 */
async function loadAndShowAll(page, pageErrors) {
    await loadUserscriptPage(page, { url: WORK_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await assertGroupedRenderCompleted(page, pageErrors, { timeout: 60000 });
}

/**
 * Opens (if not already open) the 📊 unique-values dropdown for `columnName`
 * and clicks the synthetic entry matching `itemLabel` inside the section
 * labeled `sectionLabel` — the same `.mb-uniq-section`/`.mb-col-uniq-item`
 * shape `window.__saTest.getUniqDropSections()` reads (see its own JSDoc).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} columnName
 * @param {string} sectionLabel
 * @param {string} itemLabel
 */
async function clickUniqDropItem(page, columnName, sectionLabel, itemLabel) {
    await page.evaluate(({ columnName, sectionLabel, itemLabel }) => {
        window.__saTest.getUniqDropSections(columnName); // ensures the dropdown is open for this column
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === itemLabel);
        item.click();
    }, { columnName, sectionLabel, itemLabel });
}

/**
 * Waits until the row whose title link points at `recordingId` is present
 * or absent in the DOM, matching `expectedPresent`. `work-recordings` is a
 * `tableMode: 'multi'` page, so `runFilter()` REMOVES a non-matching row
 * from the DOM entirely rather than hiding it — polling for the link's
 * presence, not a `display:none`/visibility check, is what actually reads
 * the filtered-out state (see `ShowAllEntityData/CLAUDE.md`'s "Common
 * pitfalls" on the two table modes).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} recordingId
 * @param {boolean} expectedPresent
 */
async function waitForRecordingRowPresence(page, recordingId, expectedPresent) {
    await page.waitForFunction(({ recordingId, expectedPresent }) => {
        const present = !!document.querySelector(`a[href*="/recording/${recordingId}"]`);
        return present === expectedPresent;
    }, { recordingId, expectedPresent }, { timeout: 15000 });
}

test('eventParts: Event-Additional-Info containing its own comma no longer corrupts Venue/City/Country', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadAndShowAll(page, pageErrors);

    const EVENT_COLUMNS = ['Event-Venue', 'Event-Venue-Detail', 'Event-City', 'Event-Country', 'Event-Additional-Info'];

    // Buggy row: Additional-Info = "YouTube – Springsteen & Rock Music, video
    // edited with the official audio from the Springsteen archives download"
    // — the comma inside it used to fragment the location parse.
    const buggy = await getEventCells(page, '1cf7e7e1-4807-4793-8bc2-96c950076152', EVENT_COLUMNS);
    expect(buggy['Event-Venue']).toBe('Nowlan Park');
    expect(buggy['Event-Venue-Detail']).toBe('');
    expect(buggy['Event-City']).toBe('Kilkenny');
    expect(buggy['Event-Country']).toBe('Ireland');
    expect(buggy['Event-Additional-Info']).toBe(
        'YouTube – Springsteen & Rock Music, video edited with the official audio from the Springsteen archives download'
    );

    // Regression controls: same venue/date, no comma in their Additional-Info
    // — already parsed correctly before the fix, must stay correct after it.
    const control1 = await getEventCells(page, 'f239a3c0-10bb-4def-a47d-44bac86528f5', EVENT_COLUMNS);
    expect(control1['Event-Venue']).toBe('Nowlan Park');
    expect(control1['Event-City']).toBe('Kilkenny');
    expect(control1['Event-Country']).toBe('Ireland');
    expect(control1['Event-Additional-Info']).toBe('YouTube – Mark Casserly');

    const control2 = await getEventCells(page, 'bac519c0-c048-4f22-b3db-985f1c09175d', EVENT_COLUMNS);
    expect(control2['Event-Venue']).toBe('Nowlan Park');
    expect(control2['Event-City']).toBe('Kilkenny');
    expect(control2['Event-Country']).toBe('Ireland');
    expect(control2['Event-Additional-Info']).toBe('YouTube – Calum Harkness');

    expect(pageErrors).toEqual([]);
});

test('eventParts: an uncertain-day date ("YYYY-MM-DD/DD") is recognized as Event-Date, not Event-Detail', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadAndShowAll(page, pageErrors);

    const EVENT_COLUMNS = ['Event-Date', 'Event-Detail'];

    // Comment: "(live, 2001-12-22/23)" — recorded on the 22nd or 23rd of
    // December 2001, exact day unclear (debug/multiple-dates.html).
    const cells = await getEventCells(page, 'de9ff1d7-dd78-4ed6-a328-c1ab126304e6', EVENT_COLUMNS);
    expect(cells['Event-Date']).toBe('2001-12-22/23');
    expect(cells['Event-Detail']).toBe('');

    expect(pageErrors).toEqual([]);
});

test('eventParts: "Event-Date" gets the "Date info" dropdown sections, and a plain date is correctly bucketed', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadAndShowAll(page, pageErrors);

    // Before the fix, _dateExprColumnNames() never collected an `eventParts`
    // entry's "Event-Date" output column at all (only `dateParts`/
    // `dateTimeParts` were recognized), so isDateExprCol was always false and
    // NONE of these sections existed for "Event-Date" on any pageType.
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Event-Date'));
    const labels = sections.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining([
        'Date info - Precision',
        'Date info - Decade',
        'Date info - Month',
        'Date info - Year',
        'Date info - Weekday',
    ]));

    // "Nowlan Park"/2024-05-12 (already used as control2 above) — a Sunday.
    // Row-scoped rather than an aggregate count: this work's recording
    // catalog can grow over time, but this one row's own date never changes.
    const PLAIN_DATE_RECORDING = 'bac519c0-c048-4f22-b3db-985f1c09175d';
    await clickUniqDropItem(page, 'Event-Date', 'Date info - Year', '» year: 2001');
    // A completely different year excludes it...
    await waitForRecordingRowPresence(page, PLAIN_DATE_RECORDING, false);
    await clickUniqDropItem(page, 'Event-Date', 'Date info - Year', '» year: 2001'); // toggle back off
    await waitForRecordingRowPresence(page, PLAIN_DATE_RECORDING, true);
    // ...while its own actual weekday includes it.
    await clickUniqDropItem(page, 'Event-Date', 'Date info - Weekday', '» weekday: Sunday');
    await waitForRecordingRowPresence(page, PLAIN_DATE_RECORDING, true);

    expect(pageErrors).toEqual([]);
});

test('eventParts: an uncertain-day "Event-Date" reaches Year/Month/Decade but never a specific Weekday', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadAndShowAll(page, pageErrors);

    // "2001-12-22/23" (same recording as the extraction test above) — the
    // exact day is ambiguous (the 22nd or the 23rd), so the weekday is too:
    // Dec 22 2001 was a Saturday, Dec 23 2001 a Sunday. The row must reach
    // Year/Month/Decade (those don't depend on which day it was) but must
    // NOT be matched by EITHER candidate weekday — the concrete regression
    // guard for _dateAtomWeekday()'s end-anchored regex correctly refusing a
    // slash-suffixed atom, rather than guessing one of the two candidate
    // days.
    const UNCERTAIN_DAY_RECORDING = 'de9ff1d7-dd78-4ed6-a328-c1ab126304e6';

    await clickUniqDropItem(page, 'Event-Date', 'Date info - Year', '» year: 2001');
    await waitForRecordingRowPresence(page, UNCERTAIN_DAY_RECORDING, true);
    await clickUniqDropItem(page, 'Event-Date', 'Date info - Year', '» year: 2001'); // toggle back off
    await waitForRecordingRowPresence(page, UNCERTAIN_DAY_RECORDING, true);

    await clickUniqDropItem(page, 'Event-Date', 'Date info - Weekday', '» weekday: Saturday');
    await waitForRecordingRowPresence(page, UNCERTAIN_DAY_RECORDING, false);
    await clickUniqDropItem(page, 'Event-Date', 'Date info - Weekday', '» weekday: Saturday'); // toggle back off
    await waitForRecordingRowPresence(page, UNCERTAIN_DAY_RECORDING, true);

    await clickUniqDropItem(page, 'Event-Date', 'Date info - Weekday', '» weekday: Sunday');
    await waitForRecordingRowPresence(page, UNCERTAIN_DAY_RECORDING, false);

    expect(pageErrors).toEqual([]);
});



