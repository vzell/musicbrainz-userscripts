'use strict';

// The findings tally behind the ⚠️/❌ menus must not walk every row on every
// filter pass. PERFORMANCE.org Step 25 gated the walk of the live-date
// "(N) WARNING ⚠️" button it descends from; the ⚠️ WARNING / ❌ ERROR menus
// replaced that button (org/generalize-error-warning.org), and their tally
// (`_findingRowTally()`) is memoized per source-row array instead, invalidated
// only by a new `stampFindings()` pass.
//
// Two halves, and both are load-bearing:
//
//   - the GATE: a filter keystroke does not move the scan counter, on a page
//     with findings and on the big page Step 25 measured;
//   - the GUARANTEE: the counts stay the counts of the DATA under a filter
//     that excludes every flagged row (AUDIT.md §3.6).
//
// Without the second half, a tally that always returned an empty Map would
// pass the first half perfectly.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled, typeGlobalFilter } = require('../support/filterSortAssertions');
const { findingRow } = require('../support/findingsMenu');

// A release-group's releases (multi-table, 5 sub-tables), big enough for the
// walk to matter.
const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');

// The live album from §3.6 — 27 tracks, 2 ⚠️ live-credit rows, no ❌.
const RELEASE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const RELEASE_FIXTURE = path.join(__dirname, 'release-tracks-live-date-flags.html');
const WARNING_ROWS = 2;
const UNFLAGGED_NEEDLE = 'Rendezvous';   // a medium-1 row, carries no flag

// Serving a saved page: MusicBrainz's own supported-browser-check.js throws,
// and a versioned bundle it references answers with an HTML error page.
// Excluded by origin, not by message text — neither involves the userscript.
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

const rowScans = (page) => page.evaluate(() => window.__saTest.findingTallyRowScans());

test.describe('the findings tally is walked once, not per filter pass', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a big multi-table page stops scanning after the first pass', async ({ page }) => {
        await loadUserscriptPage(page, { url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true });
        await page.route('https://musicbrainz.org/release-group/**',
            (route) => route.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
            await master.click();
        }

        // The page really is big enough for the walk to matter, and the walk
        // really did happen at least once — otherwise "it stopped" would be
        // true of a function that never ran and this test would prove nothing.
        const rows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr')).length);
        expect(rows, 'the fixture has enough rows for the scan to be worth gating')
            .toBeGreaterThan(50);
        const afterRender = await rowScans(page);
        expect(afterRender, 'the first tally walked the rows').toBeGreaterThan(0);

        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'a'));
        const afterOne = await rowScans(page);

        // Appends, so the query becomes "ab" — a second pass with a DIFFERENT
        // row count, which is what makes the status text settle to a new value.
        await waitForFilterSettled(page, () =>
            page.locator('#mb-global-filter-input').pressSequentially('b'));
        const afterTwo = await rowScans(page);

        expect(afterOne, 'the first keystroke did not re-walk the rows').toBe(afterRender);
        expect(afterTwo, 'nor did the second').toBe(afterRender);
    });

    test('guarantee: a page WITH flags still counts them, and keeps counting under a filter',
        async ({ page }) => {
            await loadUserscriptPage(page, {
                url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
            });
            await page.click('button[data-label="Show all Tracks for Release"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });

            const atRender = await findingRow(page, 'warn', 'live-credit-nodate');
            expect(atRender, 'the ⚠️ menu has a live-date row').toBeTruthy();
            expect(atRender.count, 'counting both flagged tracks').toBe(WARNING_ROWS);

            // The §3.6 guarantee: filter to rows that carry NO flag. A tally
            // taken from the live DOM reports 0 here and drops the row,
            // removing the only way back to the flagged rows.
            await waitForFilterSettled(page, () => typeGlobalFilter(page, UNFLAGGED_NEEDLE));

            const visibleFlags = await page.evaluate(() =>
                document.querySelectorAll('tbody tr .mb-live-date-flag').length);
            expect(visibleFlags, 'the filter really did exclude every flagged row').toBe(0);

            const underFilter = await findingRow(page, 'warn', 'live-credit-nodate');
            expect(underFilter, 'the row is still offered').toBeTruthy();
            expect(underFilter.count, 'and still counts the DATA, not the view').toBe(WARNING_ROWS);
        });
});
