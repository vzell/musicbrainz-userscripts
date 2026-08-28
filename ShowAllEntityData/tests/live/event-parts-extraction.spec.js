'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors, assertGroupedRenderCompleted } = require('../support/liveAssertions');

/**
 * Reproduces debug/event-extraction-bug.org: the `eventParts` synthetic
 * column extractor (ShowAllEntityData.user.js's ColumnDataExtractor.eventParts)
 * used to comma-split a recording's location string BEFORE locating the ';'
 * boundary between Event-Country and Event-Additional-Info. When
 * Additional-Info itself contained a comma (e.g. "...Ireland; YouTube – X,
 * from Y"), that produced extra pseudo-location segments, silently dropping
 * the venue name and shifting City/State/Country by one field.
 *
 * "A Rainy Night in Soho" (this work) has three recordings of the same
 * 2024-05-12 Nowlan Park, Kilkenny, Ireland performance: two whose
 * Additional-Info has no comma (already parsed correctly before the fix —
 * used here as regression controls) and one whose Additional-Info does
 * contain a comma (the actual bug, confirmed via the MusicBrainz API before
 * writing this spec). This also exercises the non-USA/Canada/UK
 * "Right-to-Left fallback" branch, unlike the two USA-based debug/*.html
 * snapshots.
 */
const WORK_URL = 'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Recordings for Work"]';

const EVENT_COLUMNS = ['Event-Venue', 'Event-Venue-Detail', 'Event-City', 'Event-Country', 'Event-Additional-Info'];

/**
 * Reads the Event-* synthetic column values for the row whose title link
 * points at the given recording MBID.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} recordingId
 * @returns {Promise<Record<string, string>>}
 */
async function getEventCells(page, recordingId) {
    const colIndexes = await page.evaluate((colNames) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        const headers = Array.from(document.querySelectorAll('table.tbl thead th'));
        return colNames.map((name) => headers.findIndex((t) => strip(t.textContent) === name));
    }, EVENT_COLUMNS);

    colIndexes.forEach((idx, i) => expect(idx, `column "${EVENT_COLUMNS[i]}" not found`).toBeGreaterThanOrEqual(0));

    const row = page.locator(`tr:has(a[href*="/recording/${recordingId}"])`).first();
    const result = {};
    for (let i = 0; i < EVENT_COLUMNS.length; i++) {
        result[EVENT_COLUMNS[i]] = (await row.locator('td').nth(colIndexes[i]).textContent() || '').trim();
    }
    return result;
}

test('eventParts: Event-Additional-Info containing its own comma no longer corrupts Venue/City/Country', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await loadUserscriptPage(page, { url: WORK_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await assertGroupedRenderCompleted(page, pageErrors, { timeout: 60000 });

    // Buggy row: Additional-Info = "YouTube – Springsteen & Rock Music, video
    // edited with the official audio from the Springsteen archives download"
    // — the comma inside it used to fragment the location parse.
    const buggy = await getEventCells(page, '1cf7e7e1-4807-4793-8bc2-96c950076152');
    expect(buggy['Event-Venue']).toBe('Nowlan Park');
    expect(buggy['Event-Venue-Detail']).toBe('');
    expect(buggy['Event-City']).toBe('Kilkenny');
    expect(buggy['Event-Country']).toBe('Ireland');
    expect(buggy['Event-Additional-Info']).toBe(
        'YouTube – Springsteen & Rock Music, video edited with the official audio from the Springsteen archives download'
    );

    // Regression controls: same venue/date, no comma in their Additional-Info
    // — already parsed correctly before the fix, must stay correct after it.
    const control1 = await getEventCells(page, 'f239a3c0-10bb-4def-a47d-44bac86528f5');
    expect(control1['Event-Venue']).toBe('Nowlan Park');
    expect(control1['Event-City']).toBe('Kilkenny');
    expect(control1['Event-Country']).toBe('Ireland');
    expect(control1['Event-Additional-Info']).toBe('YouTube – Mark Casserly');

    const control2 = await getEventCells(page, 'bac519c0-c048-4f22-b3db-985f1c09175d');
    expect(control2['Event-Venue']).toBe('Nowlan Park');
    expect(control2['Event-City']).toBe('Kilkenny');
    expect(control2['Event-Country']).toBe('Ireland');
    expect(control2['Event-Additional-Info']).toBe('YouTube – Calum Harkness');

    expect(pageErrors).toEqual([]);
});
