'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Bug: eventParts() only split a location AFTER a ": ", so the recording style
// guide's colon-less form "live, Los Angeles, CA, USA"
// (https://musicbrainz.org/doc/Style/Recording#Live_recordings) put
// "Los Angeles" into Event-Detail and left City/State/Country empty. Now the
// text after the type is a location when it has 2+ ", " parts and does not
// start with a date — the rule _parseRecordingComment()'s `location` form
// already used. Without a colon a "; …" tail is split off first, or it would
// stay glued to the country.

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings-comments.html');

/**
 * Loads the artist-recordings fixture and runs "⊚ All recordings".
 *
 * @param {import('@playwright/test').Page} page
 */
async function open(page) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
    });
    await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const EMPTY = {
    'Event-Type': '', 'Event-Date': '', 'Event-Detail': '', 'Event-Venue': '', 'Event-Venue-Detail': '',
    'Event-City': '', 'Event-State': '', 'Event-Country': '', 'Event-Additional-Info': '',
};

test.describe('eventParts: the colon-less location form', () => {
    test('shapes', async ({ page }) => {
        await open(page);
        const ep = (t) => page.evaluate((x) => window.__saTest.eventPartsOf(x), t);

        expect(await ep('live, Los Angeles, CA, USA')).toEqual({
            ...EMPTY, 'Event-Type': 'live', 'Event-City': 'Los Angeles', 'Event-State': 'CA', 'Event-Country': 'USA',
        });
        expect(await ep('live, The Roxy, West Hollywood, CA, USA')).toEqual({
            ...EMPTY, 'Event-Type': 'live', 'Event-Venue': 'The Roxy', 'Event-City': 'West Hollywood',
            'Event-State': 'CA', 'Event-Country': 'USA',
        });
        // Right-to-left fallback for other countries, as after a colon.
        expect(await ep('live, Roskilde, Denmark')).toEqual({
            ...EMPTY, 'Event-Type': 'live', 'Event-City': 'Roskilde', 'Event-Country': 'Denmark',
        });
        // "; …" comes off before the comma split.
        expect(await ep('soundcheck, Los Angeles, CA, USA; intro, take 2')).toEqual({
            ...EMPTY, 'Event-Type': 'soundcheck', 'Event-City': 'Los Angeles', 'Event-State': 'CA',
            'Event-Country': 'USA', 'Event-Additional-Info': 'intro, take 2',
        });
        expect(await ep('live; intro')).toEqual({ ...EMPTY, 'Event-Type': 'live', 'Event-Additional-Info': 'intro' });

        // Unchanged: one part is a detail, a date is a date, a colon form is
        // split as before, and a comment without a type is all additional info.
        expect(await ep('live, early show')).toEqual({ ...EMPTY, 'Event-Type': 'live', 'Event-Detail': 'early show' });
        expect(await ep('live, 2002')).toEqual({ ...EMPTY, 'Event-Type': 'live', 'Event-Date': '2002' });
        expect(await ep('live, 2004‐10‐02, Gund Arena, Cleveland, OH, USA')).toEqual({
            ...EMPTY, 'Event-Type': 'live', 'Event-Date': '2004-10-02', 'Event-Detail': 'Gund Arena',
        });
        expect(await ep('live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA; intro')).toEqual({
            ...EMPTY, 'Event-Type': 'live', 'Event-Date': '2004-10-02', 'Event-Venue': 'Gund Arena',
            'Event-City': 'Cleveland', 'Event-State': 'OH', 'Event-Country': 'USA', 'Event-Additional-Info': 'intro',
        });
        expect(await ep('alternate take')).toEqual({ ...EMPTY, 'Event-Additional-Info': 'alternate take' });
    });

    test('the rendered row: City/State/Country filled, Detail empty', async ({ page }) => {
        await open(page);
        const cells = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th')).map((t) => t.dataset.colName);
            const row = Array.from(tbl.tBodies[0].rows).find((r) => r.cells[ths.indexOf('Name')].textContent.includes('Johnny 99'));
            return Object.fromEntries(['Event-Detail', 'Event-City', 'Event-State', 'Event-Country']
                .map((c) => [c, row.cells[ths.indexOf(c)].textContent.trim()]));
        });
        expect(cells).toEqual({ 'Event-Detail': '', 'Event-City': 'Los Angeles', 'Event-State': 'CA', 'Event-Country': 'USA' });
    });
});
