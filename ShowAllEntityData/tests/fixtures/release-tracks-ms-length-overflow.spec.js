'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// The embedded-payload BACKFILL path: a release whose overflowing medium's
// "Load all tracks..." AJAX call fills the live DOM with every row, but whose
// server-rendered <script type="application/json"> hydration payload never
// gets updated to match (confirmed live on a real 1209-track release — see
// _msFetchFullReleaseTrackLengths()'s JSDoc). Fixture is the real "Born to
// Run" release (1d404e1d-fcb6-3a52-b478-e706e893c897), same DOM as
// release-tracks-ms-length.html, but its embedded payload is truncated to
// tracks A1-A4 only (scripts/build-ms-length-overflow-fixture.py) — A1-A4's
// native cells are stamped from the embedded payload as always, B1-B4 need
// the one-shot /ws/2/release/<gid>?inc=recordings backfill this spec covers.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const RELEASE_GID = '1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length-overflow.html');

const SECONDS = ['4:50', '3:12', '3:02', '6:31', '4:30', '4:31', '3:19', '9:34'];
const MILLIS = ['4:50.160', '3:11.666', '3:01.800', '6:30.506',
                '4:30.360', '4:30.800', '3:19.000', '9:33.866'];
// B1-B4's recording length was UNRESOLVED at extraction time (the truncated
// embedded payload had no entry for them at all — `undefined`, not `null`),
// so they render MusicBrainz's own "no data" placeholder until the WS2
// backfill fills them in — same as a genuinely unknown recording length.
const REC_SECONDS_BEFORE = ['4:50', '3:11', '3:01', '6:31', '?:??', '?:??', '?:??', '?:??'];
const REC_SECONDS_AFTER = ['4:50', '3:11', '3:01', '6:31', '4:30', '4:30', '3:16', '9:34'];

// The full 8-track WS2 answer — B1-B4 are what the embedded payload above
// could not cover; A1-A4 are included too (a real full-release response would
// naturally repeat them) to prove the backfill leaves already-stamped cells
// alone rather than re-requesting or overwriting them.
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

/** Reads the rendered "Recording length" column's cell text for every row, in row order. */
async function recLengthValues(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Recording length');
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

/**
 * @param {{tracks?: Array, status?: number}} [opts]
 * @returns {Promise<Array<string>>} every requested URL, in call order.
 */
async function setup(page, { tracks = WS2_TRACKS, status = 200 } = {}) {
    const calls = [];
    await page.route(`**/ws/2/release/${RELEASE_GID}?**`, (route) => {
        calls.push(route.request().url());
        if (status !== 200) {
            route.fulfill({ status, contentType: 'application/json', body: '{"error":"busy"}' });
            return;
        }
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ media: [{ position: 1, tracks }] }),
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
    return calls;
}

test.describe('release-tracks: embedded-payload backfill via WS2', () => {
    test('A1-A4 are already stamped from the (truncated) embedded payload; B1-B4 are not, until the toggle backfills them', async ({ page }) => {
        const calls = await setup(page);

        // Before any press: no network request yet (deferred to first press,
        // same contract as the 'ws2'/'batch' sources), and every cell reads
        // MusicBrainz's own rendered seconds regardless of payload coverage —
        // the native DOM was never incomplete, only the JSON was.
        expect(calls).toHaveLength(0);
        expect(await lengthValues(page)).toEqual(SECONDS);
        expect(await recLengthValues(page)).toEqual(REC_SECONDS_BEFORE);

        const stampedBefore = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
            return Array.from(tbl.querySelectorAll('tbody tr')).map((tr) => 'mbMs' in tr.cells[idx].dataset);
        });
        expect(stampedBefore).toEqual([true, true, true, true, false, false, false, false]);

        await firstToggle(page).click();
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'true');

        // Exactly one backfill request, to the release endpoint.
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('inc=recordings');

        expect(await lengthValues(page)).toEqual(MILLIS);
        expect(await recLengthValues(page)).toEqual([
            '4:50.000', '3:11.000', '3:01.000', '6:30.506',
            '4:30.000', '4:30.000', '3:16.000', '9:33.866',
        ]);

        // Toggling off must not re-request — cached for the page's lifetime —
        // and the backfilled rows now show their real seconds value rather
        // than reverting to the "?:??" they started at.
        await firstToggle(page).click();
        expect(calls).toHaveLength(1);
        expect(await lengthValues(page)).toEqual(SECONDS);
        expect(await recLengthValues(page)).toEqual(REC_SECONDS_AFTER);

        await firstToggle(page).click();
        expect(calls).toHaveLength(1);
        expect(await lengthValues(page)).toEqual(MILLIS);
    });

    test('a transport failure leaves the button retryable, not stuck — A1-A4 still show their own precision', async ({ page }) => {
        await setup(page, { status: 503 });

        await firstToggle(page).click();
        // Something IS stamped (A1-A4, from the embedded payload), so the
        // column still switches to milliseconds rather than being reported
        // wholesale "unavailable" — only B1-B4 stay at seconds precision.
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'true');
        expect(await lengthValues(page)).toEqual([
            '4:50.160', '3:11.666', '3:01.800', '6:30.506', '4:30', '4:31', '3:19', '9:34',
        ]);

        const title = await firstToggle(page).getAttribute('title');
        expect(title).toContain('HTTP 503');
    });

    test('a row already stamped by the embedded payload is never re-sent to the network', async ({ page }) => {
        const calls = await setup(page);
        await firstToggle(page).click();
        expect(calls).toHaveLength(1);
        // The mocked response includes A1-A4 too (a real one naturally would),
        // proving the backfill's own idempotency guard — not this test's
        // request log — is what keeps their already-stamped values untouched.
        expect(await lengthValues(page)).toEqual(MILLIS);
    });
});
