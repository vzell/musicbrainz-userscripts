'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Regression test for the leaked-milliseconds bug found via a real live-interop
// investigation (tests/support/run-live-interop.js, jesus2099-supermind) and
// confirmed against real captures: debug/place-perf-final.html,
// debug/place-perf-initial-with-jesus-milliseconds.html,
// debug/place-perf-single-tabbed-final.html.
//
// jesus2099's "mb. SUPER MIND CONTROL Ⅱ X TURBO" userscript
// (RECORDING_LENGTH_COLUMN feature, see tests/fixtures/live-userscripts/
// manifest.json's jesus2099-supermind entry) writes its own "M:SS.mmm"
// (always millisecond-suffixed) Length values directly into the NATIVE table
// on page types MusicBrainz itself renders no Length column for —
// place-performances is one (see _isJesus2099Treleases()'s own JSDoc).
//
// _adoptJesus2099MsLength() (called from _stripJesus2099InTable()) ADOPTS
// that leaked value into ShowAllEntityData's OWN ms-toggle tracking
// (data-mb-ms/data-mb-sec-text) rather than either destroying it (an earlier
// version of this fix) or leaving it as unmarked, un-toggleable text (the
// ORIGINAL behaviour). The cell displays MusicBrainz's own ROUNDED seconds
// form by default (337533ms rounds to "5:38", not a truncated "5:37" — see
// _msFormatSeconds()'s own JSDoc on why rounding, not truncation, is correct)
// so every row starts from the same collapsed state, whether or not
// jesus2099 happened to touch it.
const RECORDING_A = '528327c7-0f7a-46d1-b03f-700ebc39f747'; // jesus2099-touched: "5:37.533" leaked in
const RECORDING_A_MS = 337533;
const RECORDING_B = 'de9ff1d7-dd78-4ed6-a328-c1ab126304e6'; // untouched: plain "5:05" (ShowAllEntityData's own pagination fetch)
const RECORDING_B_MS = 305000;

const PLACE_URL = 'https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463/performances';
const FIXTURE_FILE = path.join(__dirname, 'place-performances-jesus-ms-leak.html');

/**
 * Stubs the WS2 request `_msFetchWs2RecordingLengths()` makes for this page
 * — both recordings resolve, so a toggle press can be asserted to reveal
 * BOTH rows' precision (RECORDING_A's from adoption, needing no request;
 * RECORDING_B's from this stubbed fetch) in a single press.
 */
async function stubWs2(page) {
    await page.route('**/ws/2/place/**', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            relations: [
                { recording: { id: RECORDING_A, length: RECORDING_A_MS } },
                { recording: { id: RECORDING_B, length: RECORDING_B_MS } },
            ],
        }),
    }));
}

async function setup(page) {
    await loadUserscriptPage(page, {
        url: PLACE_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
    });
    await page.click('button[data-label="Show all Performances for Place"]');
    await page.waitForSelector('#mb-filter-container');
    await expect(page.locator('table.tbl tbody tr').first()).toBeVisible();
}

function readLengthColumn(page) {
    return page.evaluate(() => {
        const table = document.querySelector('table.tbl');
        const ths = Array.from(table.querySelectorAll('thead th'));
        const lengthIdx = ths.findIndex((th) => (th.dataset.colName || '') === 'Length');
        const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.cells[lengthIdx]);
        return {
            treleasesCount: table.querySelectorAll('.treleases').length,
            jesus2099Count: table.querySelectorAll('[class*="jesus2099"]').length,
            texts: rows.map((td) => (td ? td.textContent.replace(/\s+/g, '') : null)),
            msAttrs: rows.map((td) => (td ? { ms: td.dataset.mbMs || null, secText: td.dataset.mbSecText || null } : null)),
        };
    });
}

test.describe('place-performances: jesus2099 Length leak (RECORDING_LENGTH_COLUMN)', () => {
    test('no treleases/jesus2099 markers survive into the rendered table', async ({ page }) => {
        await setup(page);
        const { treleasesCount, jesus2099Count } = await readLengthColumn(page);
        expect(treleasesCount).toBe(0);
        expect(jesus2099Count).toBe(0);
    });

    test('a jesus2099-leaked value is ADOPTED (stamped) and displayed rounded, not truncated', async ({ page }) => {
        await setup(page);
        const { texts, msAttrs } = await readLengthColumn(page);
        // 337533ms rounds to 5:38 (_msFormatSeconds rounds to nearest second,
        // never truncates) — a truncating "fix" would wrongly show 5:37.
        expect(texts[0]).toBe('5:38');
        expect(msAttrs[0]).toEqual({ ms: String(RECORDING_A_MS), secText: '5:38' });
    });

    test('a row jesus2099 never touched is left exactly as-is, with no stamp yet', async ({ page }) => {
        await setup(page);
        const { texts, msAttrs } = await readLengthColumn(page);
        expect(texts[1]).toBe('5:05');
        expect(msAttrs[1]).toEqual({ ms: null, secText: null });
    });

    test('the toggle button starts unpressed, honestly matching the collapsed display', async ({ page }) => {
        await setup(page);
        const btn = page.locator('.mb-ms-col-hdr-btn').first();
        await expect(btn).toHaveAttribute('aria-pressed', 'false');
        // The trailing U+FE0E is the text-presentation selector that keeps ⏱
        // rendering as a monochrome outline rather than a colour emoji, which is
        // what makes it legible on the column header. Asserted exactly, so
        // dropping it is a test failure rather than a silent look regression.
        await expect(btn).toHaveText('▶⏱︎');
    });

    test('pressing the toggle ONCE resolves both the adopted row and the untouched row', async ({ page }) => {
        await stubWs2(page);
        await setup(page);
        await page.locator('.mb-ms-col-hdr-btn').first().click();
        // The adopted row needs no request at all; the untouched row needs
        // the stubbed WS2 fetch this test set up — both must resolve from
        // this ONE press (the bug this fixes: the 'ws2' source used to skip
        // fetching entirely once ANYTHING was already stamped, permanently
        // stranding the untouched row).
        await expect(page.locator('.mb-ms-col-hdr-btn').first()).toHaveAttribute('aria-pressed', 'true');
        const { texts } = await readLengthColumn(page);
        expect(texts).toEqual(['5:37.533', '5:05.000']);
    });
});
