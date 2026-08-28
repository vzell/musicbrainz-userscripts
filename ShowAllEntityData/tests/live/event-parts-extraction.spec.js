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
