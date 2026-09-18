'use strict';

// The ⚠️/❌ live-date summary buttons must count the DATA, not the rows that
// happen to be on screen. AUDIT.md §3.6, live twin §10 L10.
//
// `_countLiveDateFlags()` walks `document.querySelectorAll('table.tbl')`, i.e.
// the LIVE rows, and `runFilter()` REMOVES non-matching rows rather than hiding
// them. `_updateLiveDateFlagButtons()` runs after every filter pass (via
// `updateFilterButtonsVisibility()`) and HIDES a button whose count is 0 — so
// any filter that excludes the flagged rows takes the button away, and with it
// the only affordance for getting back to them.
//
// Its sibling got this right: `_countLengthMismatchRows()` walks
// `_msSourceRows()`, precisely because "filtering to ⚠️ made the ❌ button
// vanish" was a shipped bug once (CLAUDE.md, the length-mismatch section).
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

const RELEASE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-live-date-flags.html');

const WARNING_ROWS = 2;      // "Born in the U.S.A. (acoustic)" and "(with band)", both on medium 2
// "with band" isolates ONE of the two flagged tracks. "acoustic" does not:
// both rows credit an acoustic guitar, so it matches them both.
const FLAGGED_NEEDLE = 'with band';
const UNFLAGGED_NEEDLE = 'Rendezvous'; // matches a medium-1 row, no flag

/** The ⚠️ button's rendered state. */
const warningButton = (page) => page.evaluate(() => {
    const b = document.getElementById('mb-live-date-warning-btn');
    if (!b) return null;
    return {
        hidden: b.style.display === 'none',
        text: b.textContent.replace(/\s+/g, ' ').trim(),
        title: b.title,
    };
});

/** Rows currently rendered, and how many of them carry a live-date flag. */
const rowState = (page) => page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none');
    return { visible: rows.length, flagged: rows.filter((r) => r.querySelector('.mb-live-date-flag')).length };
});

test.describe('live-date ⚠️ summary button vs. an unrelated filter', () => {
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

        const btn = await warningButton(page);
        expect(btn, 'the ⚠️ button exists').not.toBeNull();
        expect(btn.hidden, 'and starts visible').toBe(false);
        expect(btn.text, 'showing the page\'s own flag count').toContain(`(${WARNING_ROWS})`);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('control: the button names the column its flags are in', async ({ page }) => {
        // Pins the per-column breakdown, i.e. that a source row's cells are read
        // against its own table's headers. Expected value is computed from the
        // page rather than hard-coded.
        const flagColumns = await page.evaluate(() => {
            const out = new Set();
            document.querySelectorAll('table.tbl').forEach((table) => {
                const headers = Array.from(table.querySelectorAll('thead tr:first-child th'))
                    .map((th) => th.textContent.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim());
                table.querySelectorAll('tbody tr').forEach((row) => Array.from(row.cells)
                    .forEach((cell, i) => {
                        if (cell.querySelector('.mb-live-date-flag')) out.add(headers[i]);
                    }));
            });
            return Array.from(out);
        });
        expect(flagColumns.length, 'the flags sit in at least one named column').toBeGreaterThan(0);
        const btn = await warningButton(page);
        flagColumns.forEach((col) => {
            expect(btn.title, `the tooltip breaks the count down by column ("${col}")`).toContain(col);
        });
    });

    test('control: the button filters to its own rows', async ({ page }) => {
        await page.locator('#mb-live-date-warning-btn').click();
        await expect.poll(async () => (await rowState(page)).visible, {
            timeout: 15000, message: 'control: the ⚠️ button narrows to the flagged rows',
        }).toBe(WARNING_ROWS);
        const btn = await warningButton(page);
        expect(btn.hidden, 'and it stays available').toBe(false);
    });

    test('A: a filter that hides every flagged row must not take the button away', async ({ page }) => {
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', UNFLAGGED_NEEDLE));
        const rows = await rowState(page);
        expect(rows.visible, 'the needle matches something').toBeGreaterThan(0);
        expect(rows.flagged, 'and nothing it matches is flagged').toBe(0);

        const btn = await warningButton(page);
        expect(btn.hidden, 'A: the ⚠️ button survives a filter that hides its rows').toBe(false);
        expect(btn.text, 'A: still counting the page\'s flags, not the visible ones').toContain(`(${WARNING_ROWS})`);
    });

    test('B: the count describes the data, not the current view', async ({ page }) => {
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', FLAGGED_NEEDLE));
        const rows = await rowState(page);
        expect(rows.flagged, 'the needle leaves exactly one flagged row visible').toBe(1);
        expect(rows.visible, 'and hides the other').toBeLessThan(WARNING_ROWS + 1);

        const btn = await warningButton(page);
        expect(btn.hidden).toBe(false);
        expect(btn.text, 'B: the label still reports both flagged tracks').toContain(`(${WARNING_ROWS})`);
    });

    test('C: clearing the filter restores the button either way', async ({ page }) => {
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', UNFLAGGED_NEEDLE));
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', ''));
        const btn = await warningButton(page);
        expect(btn.hidden, 'C: back to the unfiltered table, the button is there').toBe(false);
        expect(btn.text).toContain(`(${WARNING_ROWS})`);
    });
});
