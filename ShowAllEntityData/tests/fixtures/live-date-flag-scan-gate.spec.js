'use strict';

// `_countLiveDateFlags()` runs on EVERY filter pass, from
// `updateFilterButtonsVisibility()`. The flags it looks for are built only by
// `applyExtractTrackTitleData()`, i.e. only on `release-tracks` — so on every
// other pageType each keystroke walked every row of every table to be told
// "none". PERFORMANCE.org Step 25, the cost half (its correctness half shipped
// as 9.99.1100, AUDIT.md §3.6).
//
// The gate cannot be a DOM query. `runFilter()` REMOVES non-matching rows, so
// `document.querySelector('.mb-live-date-flag')` answers "no" the moment a
// filter excludes the flagged rows — which is §3.6's vanishing-button bug
// re-entered through the back door. It is keyed instead on whether a flag was
// ever BUILT, plus a tally over the captured source rows coming back empty.
//
// That makes this spec two halves, and both are load-bearing:
//
//   - the GATE: on a page with no flags, the scan counter stops moving;
//   - the GUARANTEE: on a page WITH flags, the ⚠️ button still counts the data
//     and survives a filter that excludes every flagged row.
//
// Without the second half, `return result` at the top of the function passes
// the first half perfectly.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled, typeGlobalFilter } = require('../support/filterSortAssertions');

// No flags: a release-group's releases (multi-table, 5 sub-tables). Any
// pageType but release-tracks would do; this one is already captured and is
// big enough that the walk is worth removing.
const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');

// With flags: the live album from §3.6 — 27 tracks, 2 ⚠️ rows, no ❌.
const RELEASE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const RELEASE_FIXTURE = path.join(__dirname, 'release-tracks-live-date-flags.html');
const WARNING_ROWS = 2;
const UNFLAGGED_NEEDLE = 'Rendezvous';   // a medium-1 row, carries no flag

// Serving a saved page: MusicBrainz's own supported-browser-check.js throws,
// and a versioned bundle it references answers with an HTML error page.
// Excluded by origin, not by message text — neither involves the userscript.
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

const rowScans = (page) => page.evaluate(() => window.__saTest.liveDateFlagRowScans());

/** The ⚠️ button's rendered state, or null when it is not in the DOM. */
const warningButton = (page) => page.evaluate(() => {
    const b = document.getElementById('mb-live-date-warning-btn');
    if (!b) return null;
    return { text: b.textContent, hidden: b.style.display === 'none' };
});

test.describe('the live-date flag scan is gated on the page having one', () => {
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

    test('a page with no flags stops scanning after the first pass', async ({ page }) => {
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
        expect(afterRender, 'the first tally walked the rows, and found nothing')
            .toBeGreaterThan(0);

        // And the flags genuinely are absent, so "stopped scanning" is the
        // gate working rather than the fixture being mis-chosen.
        const flags = await page.evaluate(() =>
            document.querySelectorAll('.mb-live-date-flag').length);
        expect(flags, 'this pageType carries no live-date flags').toBe(0);

        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'a'));
        const afterOne = await rowScans(page);

        // Appends, so the query becomes "ab" — a second pass with a DIFFERENT
        // row count, which is what makes the status text settle to a new value.
        await waitForFilterSettled(page, () =>
            page.locator('#mb-global-filter-input').pressSequentially('b'));
        const afterTwo = await rowScans(page);

        expect(afterOne, 'the first keystroke re-walked every row')
            .toBe(afterRender);
        expect(afterTwo, 'and so did the second')
            .toBe(afterRender);
    });

    test('guarantee: a page WITH flags still counts them, and keeps counting under a filter',
        async ({ page }) => {
            await loadUserscriptPage(page, {
                url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
            });
            await page.click('button[data-label="Show all Tracks for Release"]');
            await waitForRenderComplete(page, { waitForAutoResize: false });

            const atRender = await warningButton(page);
            expect(atRender, 'the ⚠️ button exists').not.toBeNull();
            expect(atRender.hidden, 'and is visible, the page having 2 flagged tracks').toBe(false);
            expect(atRender.text, 'and counts both').toContain(`(${WARNING_ROWS})`);

            // The §3.6 guarantee: filter to rows that carry NO flag. A tally
            // taken from the live DOM reports 0 here and hides the button,
            // removing the only way back to the flagged rows.
            await waitForFilterSettled(page, () => typeGlobalFilter(page, UNFLAGGED_NEEDLE));

            const visibleFlags = await page.evaluate(() =>
                document.querySelectorAll('tbody tr .mb-live-date-flag').length);
            expect(visibleFlags, 'the filter really did exclude every flagged row').toBe(0);

            const underFilter = await warningButton(page);
            expect(underFilter.hidden, 'the button is still shown').toBe(false);
            expect(underFilter.text, 'and still counts the DATA, not the view')
                .toContain(`(${WARNING_ROWS})`);
        });

    test('guarantee: the per-column breakdown still names the right column', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // The tooltip is built from `byColumn`, which is the part that changes
        // when the walk stops visiting cells one at a time: the column index
        // now comes from the flag's own `<td>` rather than from the loop.
        // The header text keeps a zero-width space that `headersOf()`'s strip
        // does not remove ("Instruments ​"), so match the name and the
        // count separately rather than demanding one space between them.
        const tip = await page.evaluate(() =>
            document.getElementById('mb-live-date-warning-btn').title);
        expect(tip, 'names the column the flags are in').toContain('Instruments');
        expect(tip, 'with its count').toMatch(/\(\d+\)/);
        expect(tip, 'and does not fall back to a positional label').not.toContain('Col ');
    });
});
