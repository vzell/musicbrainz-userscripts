'use strict';

// The live-date ⚠️ count must describe the DATA, not the rows that happen to be
// on screen. AUDIT.md §3.6, live twin §10 L10.
//
// History: the filter bar's "(N) WARNING ⚠️" button used to count the LIVE
// rows, and `runFilter()` REMOVES non-matching rows rather than hiding them —
// so any filter that excluded the flagged rows took the button away, and with
// it the only affordance for getting back to them. The ⚠️ WARNING findings
// menu replaced that button (org/generalize-error-warning.org); its
// "Live credit without a date" row inherits the guarantee, and this spec
// keeps pinning it there.
//
// Fixture: a real live album (2 mediums, 27 tracks, 2 ⚠️ rows and no ❌), the
// page the user supplied for L10. Captured with --strip-json: the embedded
// payload is 978 KB of 1.1 MB and feeds only the millisecond-length features,
// which this spec does not exercise.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');
const { findingsMenuState, findingRow, clickFinding } = require('../support/findingsMenu');

const RELEASE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-live-date-flags.html');

const WARNING_ROWS = 2;      // "Born in the U.S.A. (acoustic)" and "(with band)", both on medium 2
// "with band" isolates ONE of the two flagged tracks. "acoustic" does not:
// both rows credit an acoustic guitar, so it matches them both.
const FLAGGED_NEEDLE = 'with band';
const UNFLAGGED_NEEDLE = 'Rendezvous'; // matches a medium-1 row, no flag
const ID = 'live-credit-nodate';

/** The ⚠️ menu row's rendered state. */
const warningRow = async (page) => {
    const menu = await findingsMenuState(page, 'warn');
    const row = await findingRow(page, 'warn', ID);
    return { attached: !!menu && menu.attached, count: row ? row.count : null, label: menu ? menu.label : null };
};

/** Rows currently rendered, and how many of them carry a live-date flag. */
const rowState = (page) => page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none');
    return { visible: rows.length, flagged: rows.filter((r) => r.querySelector('.mb-live-date-flag')).length };
});

test.describe('live-date ⚠️ findings-menu row vs. an unrelated filter', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        // MusicBrainz's own scripts throw on a captured shell; excluded by origin.
        pageErrors = [];
        const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });

        await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route('https://musicbrainz.org/release/**',
            (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const row = await warningRow(page);
        expect(row.attached, 'the ⚠️ WARNING menu is in the bar').toBe(true);
        expect(row.count, 'its live-date row counts the page\'s flags').toBe(WARNING_ROWS);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('control: the row filters to its own rows', async ({ page }) => {
        await clickFinding(page, ID);
        await expect.poll(async () => (await rowState(page)).visible, {
            timeout: 15000, message: 'control: the ⚠️ row narrows to the flagged rows',
        }).toBe(WARNING_ROWS);
        expect((await warningRow(page)).attached, 'and the menu stays available').toBe(true);
    });

    test('A: a filter that hides every flagged row must not take the row away', async ({ page }) => {
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', UNFLAGGED_NEEDLE));
        const rows = await rowState(page);
        expect(rows.visible, 'the needle matches something').toBeGreaterThan(0);
        expect(rows.flagged, 'and nothing it matches is flagged').toBe(0);

        const row = await warningRow(page);
        expect(row.attached, 'A: the ⚠️ menu survives a filter that hides its rows').toBe(true);
        expect(row.count, 'A: still counting the page\'s flags, not the visible ones').toBe(WARNING_ROWS);
    });

    test('B: the count describes the data, not the current view', async ({ page }) => {
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', FLAGGED_NEEDLE));
        const rows = await rowState(page);
        expect(rows.flagged, 'the needle leaves exactly one flagged row visible').toBe(1);
        expect(rows.visible, 'and hides the other').toBeLessThan(WARNING_ROWS + 1);

        expect((await warningRow(page)).count, 'B: the row still reports both flagged tracks').toBe(WARNING_ROWS);
    });

    test('C: clearing the filter restores the row either way', async ({ page }) => {
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', UNFLAGGED_NEEDLE));
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', ''));
        const row = await warningRow(page);
        expect(row.attached, 'C: back to the unfiltered table, the menu is there').toBe(true);
        expect(row.count).toBe(WARNING_ROWS);
    });
});
