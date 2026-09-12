'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Regression test for `_msStampFullReleaseRows()` silently SKIPPING a row's
// millisecond-precision backfill when that row's OWN recording currently has
// open/pending edits on musicbrainz.org — the same native
// <span class="mp"> wrapper as release-tracks-recording-of-pending-edits.spec.js,
// here wrapping the Title cell's own recording anchor instead of a "recording
// of:" work anchor. The lookup is deliberately DIRECT-CHILD-scoped (a track's
// `<div class="ars">` can carry further /recording/ links, e.g. a "DJ-mix of"
// relationship, and an unscoped query would key the row to one of those
// instead — see `_titleRecordingAnchor()`'s JSDoc), so a bare `:scope > a`
// there read an `.mp`-wrapped recording as "no recording link on this row at
// all" and left it permanently at seconds precision, even after a
// successful WS2 backfill that DID include that recording's data.
//
// Fixture: release-tracks-ms-length-overflow.html (real "Born to Run",
// embedded payload truncated to A1-A4 — see that fixture's own sibling spec)
// with track B1's Title-cell recording anchor additionally wrapped in
// <span class="mp">, mirroring the exact wrapping shape used elsewhere in
// this suite for the same marker.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const RELEASE_GID = '1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length-overflow-pending-edits.html');

const MILLIS = ['4:50.160', '3:11.666', '3:01.800', '6:30.506',
                '4:30.360', '4:30.800', '3:19.000', '9:33.866'];

const WS2_TRACKS = [
    { number: 'A1', length: 290160, recording: { id: 'bbcedc0f-2fff-42f4-9ca6-6d2263d1a042', length: 290000 } },
    { number: 'A2', length: 191666, recording: { id: '34a6e904-0d0b-4393-9ff0-07ef217c7d3d', length: 191000 } },
    { number: 'A3', length: 181800, recording: { id: '5d2e78bc-c616-484f-b1e4-8e010aa3641e', length: 181000 } },
    { number: 'A4', length: 390506, recording: { id: 'c9fae3aa-03ce-4455-95e2-22fce0caa0c5', length: 390506 } },
    { number: 'B1', length: 270360, recording: { id: '7ada2178-c1db-4a24-9760-810681e95308', length: 270000 } },
    { number: 'B2', length: 270800, recording: { id: 'b4e0497b-e8a6-4af6-8f23-314639309d48', length: 270000 } },
    { number: 'B3', length: 199000, recording: { id: '4fc4a847-8270-433e-b410-394cdf398fa3', length: 196000 } },
    { number: 'B4', length: 573866, recording: { id: 'd7f8e734-6ede-46f5-90cd-983d052ca691', length: 573866 } },
];

/** Reads the rendered "Length" column's cell text for every row, in row order. */
async function lengthValues(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                const td = tr.cells[idx];
                if (td) out.push(td.textContent.replace(/\s+/g, ''));
            });
        });
        return out;
    });
}

const firstToggle = (page) => page.locator('.mb-ms-col-hdr-btn').first();

test.describe('release-tracks: WS2 backfill on a row whose own recording has open edits', () => {
    test('B1 (the mp-wrapped recording) is backfilled to millisecond precision like every other row', async ({ page }) => {
        await page.route(`**/ws/2/release/${RELEASE_GID}?**`, (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ media: [{ position: 1, tracks: WS2_TRACKS }] }),
            });
        });

        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        await firstToggle(page).click();
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'true');

        // Before the fix, B1 (index 4) stayed at "4:30" — `_msStampFullReleaseRows()`
        // never found its `.mp`-wrapped recording anchor, so the WS2 answer
        // for it was silently discarded even though the backfill itself
        // succeeded for every other row.
        expect(await lengthValues(page)).toEqual(MILLIS);

        const stamped = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
            return Array.from(tbl.querySelectorAll('tbody tr')).map((tr) => 'mbMs' in tr.cells[idx].dataset);
        });
        expect(stamped).toEqual([true, true, true, true, true, true, true, true]);
    });
});
