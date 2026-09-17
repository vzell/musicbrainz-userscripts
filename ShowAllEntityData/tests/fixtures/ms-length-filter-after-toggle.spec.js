'use strict';

// ⏱ millisecond Length toggle vs. an active Length column filter.
// AUDIT.md §3.2, live twin §10 L5.
//
// _msApplyLengthPrecision() rewrites the Length text of the SOURCE rows and
// calls runFilter(). The text really changes (3:12 <-> 3:11.666), so which rows
// a Length filter matches can change — but every filter INPUT is identical, and
// two caches sit in front of the matcher:
//
//   • _filterResultCache, keyed on inputs: an identical key replays the row
//     list computed before the toggle;
//   • _rowTextCache, per source row: _cachedColText() hands back the text read
//     before the toggle, even on a cache miss.
//
// The trigger tests type a filter whose match set the toggle changes, then
// toggle. The control does the same in the other order, which proves the spec
// drives the page correctly. The isolation test flips the page-wide Case
// checkbox after the toggle — a new key, so no replay is possible — to tell
// the row-text cache apart from the result cache.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');
const { columnFilterInput } = require('../support/filterSortAssertions');

// "Born to Run" — 8 tracks, release-tracks (tableMode 'multi', one medium).
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');
const TRACKS = 8;

/** Rendered Length cells' text, visible rows only — runFilter() REMOVES the rest. */
const lengthTexts = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th'))
            .findIndex((t) => (t.dataset.colName || '') === 'Length');
        if (idx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display !== 'none' && tr.cells[idx]) out.push(tr.cells[idx].textContent.replace(/\s+/g, ''));
        });
    });
    return out;
});

const renderedRows = async (page) => (await lengthTexts(page)).length;

const lengthColIdx = (page) => page.evaluate(() => Array.from(
    document.querySelector('table.tbl thead tr:first-child').cells)
    .findIndex((t) => (t.dataset.colName || '') === 'Length'));

/** Types into the Length column filter the way a user does (the input is readonly until a trusted click). */
async function typeLengthFilter(page, text) {
    const input = columnFilterInput(page, await lengthColIdx(page));
    await input.click();
    await input.pressSequentially(text);
}

/**
 * Presses the first ⏱ toggle and waits until the Length text shows the
 * requested precision.
 *
 * @param {import('@playwright/test').Page} page
 * @param {boolean} wantMs
 */
async function toggleMs(page, wantMs) {
    const btn = page.locator('.mb-ms-col-hdr-btn').first();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', wantMs ? 'true' : 'false');
}

test.describe('⏱ toggle with an active Length column filter', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');
        expect(await renderedRows(page), 'all tracks render').toBe(TRACKS);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('control: toggle first, then filter "." — every millisecond row matches', async ({ page }) => {
        await toggleMs(page, true);
        await typeLengthFilter(page, '.');
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'control: "." matches every millisecond Length',
        }).toBe(TRACKS);
    });

    test('A: filter "." then toggle to milliseconds — the rows that now match render', async ({ page }) => {
        await typeLengthFilter(page, '.');
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'seconds text has no "."',
        }).toBe(0);

        await toggleMs(page, true);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'A: after the toggle, "." matches every millisecond Length',
        }).toBe(TRACKS);
    });

    test('A isolation: after the toggle, a NEW filter key still reads stale text', async ({ page }) => {
        // Flipping the page-wide Case checkbox changes _buildFilterKey()'s
        // top-level "c", so the result cache cannot replay. With no global query
        // it affects no match, and the column filter's own case flag comes from
        // the sub-table checkbox, which stays untouched. If rows are still
        // missing here, the row-text cache is stale on its own.
        await typeLengthFilter(page, '.');
        await expect.poll(() => renderedRows(page), { timeout: 15000, message: 'seconds text has no "."' }).toBe(0);
        await toggleMs(page, true);

        await page.locator('#mb-global-filter-case-checkbox').check();
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'A isolation: a fresh key after the toggle matches every millisecond Length',
        }).toBe(TRACKS);
    });

    test('B: filter ".666" in milliseconds, then toggle back — the row no longer matches', async ({ page }) => {
        await toggleMs(page, true);
        await typeLengthFilter(page, '.666');
        await expect.poll(() => lengthTexts(page), {
            timeout: 15000, message: 'only A2 (3:11.666) matches ".666"',
        }).toEqual(['3:11.666']);

        await toggleMs(page, false);
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'B: after toggling back to seconds, ".666" matches nothing',
        }).toBe(0);
    });

    test('C: a GLOBAL filter for a millisecond value finds its row after the toggle', async ({ page }) => {
        // The plain global filter reads each source row's cached FULL text
        // (_cachedFullText), not its column text, so this pins the other half
        // of the row-text cache drop.
        await page.fill('#mb-global-filter-input', '11.666');
        await expect.poll(() => renderedRows(page), {
            timeout: 15000, message: 'seconds text has no "11.666"',
        }).toBe(0);

        await toggleMs(page, true);
        await expect.poll(() => lengthTexts(page), {
            timeout: 15000, message: 'C: after the toggle, the global filter "11.666" finds A2',
        }).toEqual(['3:11.666']);
    });
});
