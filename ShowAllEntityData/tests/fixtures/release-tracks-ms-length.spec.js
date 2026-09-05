'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForFilterSettled, waitForSortSettled, getPageRowCount } = require('../support/filterSortAssertions');

// Millisecond track lengths on release-tracks, read from MusicBrainz's own
// embedded page payload — no network request at all.
//
// The fixture is the real native "Born to Run" page (release
// 1d404e1d-fcb6-3a52-b478-e706e893c897) with its tracklist JSON blob
// re-injected; see scripts/build-ms-length-fixture.py for why that
// reassembly is needed (the snapshot capture strips every <script>).
//
// Four of this release's eight tracks have a track length that differs from
// their recording's length — A2, A3, B2 and B3 — so those rows are what catch
// the single most damaging mistake this feature could make: sourcing
// `tracks[].recording.length` instead of `tracks[].length`, which would
// silently change the number MusicBrainz already displays instead of
// refining it. MusicBrainz renders the TRACK value, rounded to the nearest
// second: A2 shows "3:12", which only 3:11.666 rounds to, never 3:11.000.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');

const SECONDS = ['4:50', '3:12', '3:02', '6:31', '4:30', '4:31', '3:19', '9:34'];
const MILLIS = ['4:50.160', '3:11.666', '3:01.800', '6:30.506',
                '4:30.360', '4:30.800', '3:19.000', '9:33.866'];

/** Reads the rendered "Length" column's cell text for every row, in row order. */
async function lengthValues(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none') return;
                const td = tr.cells[idx];
                if (td) out.push(td.textContent.replace(/\s+/g, ''));
            });
        });
        return out;
    });
}

/** Reads every millisecond toggle button's rendered state. */
async function toggleState(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('.mb-ms-col-hdr-btn')).map((b) => ({
        glyph: b.textContent.trim(),
        pressed: b.getAttribute('aria-pressed'),
        title: b.title,
    })));
}

const firstToggle = (page) => page.locator('.mb-ms-col-hdr-btn').first();

test.describe('release-tracks: millisecond Length precision', () => {
    test.beforeEach(async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');
    });

    test('the ⏱ toggle is injected into the Length header and starts on seconds', async ({ page }) => {
        const states = await toggleState(page);
        expect(states.length).toBeGreaterThan(0);
        states.forEach((s) => {
            expect(s.glyph).toBe('▶⏱');
            expect(s.pressed).toBe('false');
            expect(s.title).toContain('Show millisecond precision');
        });

        // Seconds-by-default, everywhere: nothing moves until it is asked for.
        expect(await lengthValues(page)).toEqual(SECONDS);

        // The button sits before the column name, in .mb-col-hdr-flex's first slot.
        const isFirstChild = await page.evaluate(() => {
            const btn = document.querySelector('.mb-ms-col-hdr-btn');
            return btn ? btn.parentElement.firstElementChild === btn : null;
        });
        expect(isFirstChild).toBe(true);
    });

    test('clicking it reveals true millisecond precision from the page payload', async ({ page }) => {
        await firstToggle(page).click();
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'true');

        // A2/A3/B2/B3 are the discriminating rows — recording.length would give
        // 3:11.000 / 3:01.000 / 4:30.000 / 3:16.000 here instead.
        expect(await lengthValues(page)).toEqual(MILLIS);

        (await toggleState(page)).forEach((s) => {
            expect(s.glyph).toBe('▼⏱');
            expect(s.pressed).toBe('true');
            expect(s.title).toContain('Hide millisecond precision');
        });
    });

    test('the minute:second part never changes — precision is refined, not replaced', async ({ page }) => {
        await firstToggle(page).click();
        const millis = await lengthValues(page);
        millis.forEach((ms, i) => {
            const [wholeMs] = ms.split('.');
            const seconds = SECONDS[i];
            // MusicBrainz rounds, so the whole-second part may tick up by one,
            // but the value must never drop or jump.
            const toSec = (t) => {
                const [m, s] = t.split(':').map(Number);
                return m * 60 + s;
            };
            expect(toSec(seconds) - toSec(wholeMs)).toBeGreaterThanOrEqual(0);
            expect(toSec(seconds) - toSec(wholeMs)).toBeLessThanOrEqual(1);
        });
    });

    test('clicking again restores exactly what MusicBrainz rendered', async ({ page }) => {
        await firstToggle(page).click();
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'true');
        await firstToggle(page).click();
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'false');

        // Restored verbatim from data-mb-sec-text, not recomputed — MusicBrainz
        // ROUNDS, so recomputing would render 3:11 where the page said 3:12.
        expect(await lengthValues(page)).toEqual(SECONDS);
    });

    test('filtering follows the displayed precision', async ({ page }) => {
        const colIdx = await page.evaluate(() => {
            const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
            return ths.findIndex((t) => (t.dataset.colName || '') === 'Length');
        });
        expect(colIdx).toBeGreaterThanOrEqual(0);

        const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();

        // ".666" exists only once the millisecond part is on screen.
        await firstToggle(page).click();
        await colInput.click();
        await waitForFilterSettled(page, () => colInput.pressSequentially('.666'));
        expect((await getPageRowCount(page)).filtered).toBe(1);
        expect(await lengthValues(page)).toEqual(['3:11.666']);
    });

    test('sorting follows the displayed precision', async ({ page }) => {
        await firstToggle(page).click();

        // release-tracks is a multi-table page (one table per medium), and each
        // column's sort status goes to that sub-table's own .mb-sort-status —
        // the page-wide #mb-sort-status-display is never written, so
        // waitForSortSettled() must be told which sub-table to watch.
        const th = page.locator('table.tbl thead th[data-col-name="Length"]').first();
        await waitForSortSettled(
            page,
            () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click(),
            { subTableHeading: '12" Vinyl' },
        );

        // Ordered on real milliseconds, and 4:30.360 before 4:30.800 shows the
        // sub-second part is what breaks their tie.
        expect(await lengthValues(page)).toEqual([
            '3:01.800', '3:11.666', '3:19.000', '4:30.360',
            '4:30.800', '4:50.160', '6:30.506', '9:33.866',
        ]);
    });

    test('the 📊 "Length info - Duration" buckets still compute with milliseconds shown', async ({ page }) => {
        await firstToggle(page).click();

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const duration = sections.find((s) => s.label === 'Length info - Duration');
        expect(duration).toBeTruthy();

        // Bucketing is minute-level, so the same four ranges as at seconds
        // precision — the point is that a ".mmm" cell is still parsed at all
        // (_findCellLengthBucket reads a leading M:SS and tolerates the
        // fractional part) rather than dropping out of the section entirely.
        expect(duration.items.map((i) => i.label)).toEqual([
            '» duration: 3 to 4 minutes',
            '» duration: 4 to 5 minutes',
            '» duration: 6 to 7 minutes',
            '» duration: 9 to 10 minutes',
        ]);
        expect(duration.items.map((i) => i.count)).toEqual([3, 3, 1, 1]);
    });

    test('the toggle is absent when the feature is switched off', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true, sa_enable_ms_track_length: false },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        expect(await page.locator('.mb-ms-col-hdr-btn').count()).toBe(0);
        // And the column renders exactly as MusicBrainz does, unstamped.
        expect(await lengthValues(page)).toEqual(SECONDS);
        expect(await page.locator('table.tbl tbody td[data-mb-ms]').count()).toBe(0);
    });
});
