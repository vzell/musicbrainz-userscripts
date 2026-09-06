'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForSortSettled, waitForFilterSettled } = require('../support/filterSortAssertions');

// The "Recording length" column on release-tracks: the length MusicBrainz
// stores on the RECORDING each track links to, read from the release payload
// already embedded in the page (tracks[].recording.length) — no network at all.
//
// It exists precisely because that value is NOT the same field as the "Length"
// column beside it. "Length" is tracks[].length, this release's own tracklist
// value; a recording's length belongs to the recording entity every release
// using it shares. Both fixtures are the real native "Born to Run" page
// (release 1d404e1d-fcb6-3a52-b478-e706e893c897) with a payload reassembled by
// scripts/build-ms-length-fixture.py — see that script for why the reassembly
// is needed (the snapshot capture strips every <script>).
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';

// Real MusicBrainz values: six of the eight tracks disagree, so the column is
// added. Four of them disagree by a whole second or more and so are visible
// without touching the ⏱ toggle at all (A2 3:12/3:11, A3 3:02/3:01,
// B2 4:31/4:30, B3 3:19/3:16 — that last one by three full seconds).
const FIXTURE_DIFFER = path.join(__dirname, 'release-tracks-ms-length.html');

// Same DOM, same track lengths, every recording length forced equal to its
// track length — the other side of _releaseHasDifferingRecordingLength().
const FIXTURE_MATCH = path.join(__dirname, 'release-tracks-recording-length-match.html');

const TRACK_SECONDS = ['4:50', '3:12', '3:02', '6:31', '4:30', '4:31', '3:19', '9:34'];
const REC_SECONDS   = ['4:50', '3:11', '3:01', '6:31', '4:30', '4:30', '3:16', '9:34'];
const REC_MILLIS    = ['4:50.000', '3:11.000', '3:01.000', '6:30.506',
                       '4:30.000', '4:30.000', '3:16.000', '9:33.866'];

/** Reads one column's cell text for every visible row, in row order. */
async function columnValues(page, colName) {
    return page.evaluate((name) => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === name);
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none') return;
                const td = tr.cells[idx];
                if (td) out.push(td.textContent.replace(/\s+/g, ''));
            });
        });
        return out;
    }, colName);
}

/** Rendered header names, in column order, for the first rendered table. */
async function headerNames(page) {
    return page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl'),
    ).slice(0, 1).flatMap((tbl) => Array.from(tbl.querySelectorAll('thead th'))
        .map((th) => th.dataset.colName || '')));
}

const firstToggle = (page) => page.locator('.mb-ms-col-hdr-btn').first();

const openDifferingFixture = async (page, settingsOverride = {}) => {
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE_DIFFER,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, ...settingsOverride },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await page.waitForSelector('#mb-filter-container');
};

test.describe('release-tracks: Recording length column', () => {
    test('is added directly after "Length", from the embedded payload', async ({ page }) => {
        await openDifferingFixture(page);

        const names = await headerNames(page);
        const lengthIdx = names.indexOf('Length');
        expect(lengthIdx).toBeGreaterThanOrEqual(0);
        // Immediately after, not merely somewhere to the right: reading the two
        // durations side by side is the entire point of the column.
        expect(names[lengthIdx + 1]).toBe('Recording length');

        // The recording's own values, NOT a copy of the track's.
        expect(await columnValues(page, 'Recording length')).toEqual(REC_SECONDS);
        expect(await columnValues(page, 'Length')).toEqual(TRACK_SECONDS);
        expect(REC_SECONDS).not.toEqual(TRACK_SECONDS);
    });

    test('is NOT added when every recording length matches its track length', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE_MATCH,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        // An exact duplicate of "Length" is worse than no column, so the gate
        // withholds it entirely rather than rendering it empty-handed.
        expect(await headerNames(page)).not.toContain('Recording length');
        // …and the page it would have sat on is otherwise unaffected.
        expect(await columnValues(page, 'Length')).toEqual(TRACK_SECONDS);
    });

    test('the single ⏱ toggle switches BOTH duration columns together', async ({ page }) => {
        await openDifferingFixture(page);

        // One button, on the Length header — not one per duration column.
        expect(await page.locator('.mb-ms-col-hdr-btn').count()).toBe(1);
        const ownerCol = await page.evaluate(() => document.querySelector('.mb-ms-col-hdr-btn')
            .closest('th').dataset.colName);
        expect(ownerCol).toBe('Length');

        await firstToggle(page).click();
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'true');

        // Comparing the two at different precisions would be meaningless, so
        // both move at once.
        expect(await columnValues(page, 'Recording length')).toEqual(REC_MILLIS);
        expect(await columnValues(page, 'Length'))
            .toEqual(['4:50.160', '3:11.666', '3:01.800', '6:30.506',
                      '4:30.360', '4:30.800', '3:19.000', '9:33.866']);

        await firstToggle(page).click();
        await expect(firstToggle(page)).toHaveAttribute('aria-pressed', 'false');
        expect(await columnValues(page, 'Recording length')).toEqual(REC_SECONDS);
        expect(await columnValues(page, 'Length')).toEqual(TRACK_SECONDS);
    });

    test('sorts as a duration, not as text', async ({ page }) => {
        await openDifferingFixture(page);

        const th = page.locator('table.tbl thead th[data-col-name="Recording length"]').first();
        await waitForSortSettled(
            page,
            () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click(),
            { subTableHeading: '12" Vinyl' },
        );

        // A text sort would put "3:01" … "9:34" in the same order here by luck,
        // so the discriminating pair is 4:30/4:30 vs 4:50 — and, more to the
        // point, 6:31 before 9:34 rather than "6:31" < "9:34" by string luck.
        // The real assertion is that the values are ascending as DURATIONS.
        const sorted = await columnValues(page, 'Recording length');
        const toSecs = (t) => {
            const [m, s] = t.split(':').map(Number);
            return m * 60 + s;
        };
        expect(sorted).toEqual([...sorted].sort((a, b) => toSecs(a) - toSecs(b)));
        expect(sorted[0]).toBe('3:01');
        expect(sorted[sorted.length - 1]).toBe('9:34');
    });

    test('both duration column headers carry an explanatory tooltip', async ({ page }) => {
        await openDifferingFixture(page);

        const titles = await page.evaluate(() => {
            const out = {};
            document.querySelectorAll('table.tbl thead th').forEach((th) => {
                const name = th.dataset.colName || '';
                if (name === 'Length' || name === 'Recording length') out[name] = th.title || '';
            });
            return out;
        });

        // Each tooltip has to say WHICH entity owns the value — that is the
        // distinction the two columns exist to draw.
        expect(titles.Length).toContain('Track length');
        expect(titles.Length).toContain('belongs to the release');
        expect(titles['Recording length']).toContain('Recording length');
        expect(titles['Recording length']).toContain('recording entity');
        // …and where it came from, which for this column is "already in the page".
        expect(titles['Recording length']).toContain('no extra request');
        // Both mention the shared ⏱ toggle, which is on by default.
        expect(titles.Length).toContain('⏱');
        expect(titles['Recording length']).toContain('⏱');
    });

    test('the Length tooltip does not cost MusicBrainz its native "treleases" class', async ({ page }) => {
        await openDifferingFixture(page);

        // `treleases` is MusicBrainz's OWN class on a release tracklist's
        // Length column, and _isJesus2099Treleases() decides whether a
        // treleases cell is jesus2099's by asking "does it have a title?" —
        // because nothing else ever put one there. Adding the tooltip above
        // made that predicate misfire on the native header, so
        // purgeJesus2099Artifacts() stripped MusicBrainz's class off it and
        // removed the tooltip again on every render. Our tooltips are marked
        // `data-mb-col-tip` so the predicate can tell them apart.
        const lengthTh = await page.evaluate(() => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => (t.dataset.colName || '') === 'Length');
            return th && {
                classes: Array.from(th.classList),
                marked: th.dataset.mbColTip || '',
                hasTitle: !!th.title,
            };
        });
        expect(lengthTh.classes).toContain('treleases');
        expect(lengthTh.marked).toBe('1');
        expect(lengthTh.hasTitle).toBe(true);

        // Still true after a re-render, which is when the purge runs again.
        const th = page.locator('table.tbl thead th[data-col-name="Length"]').first();
        await waitForSortSettled(
            page,
            () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click(),
            { subTableHeading: '12" Vinyl' },
        );
        const after = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((x) => (x.dataset.colName || '') === 'Length');
            return { classes: Array.from(t.classList), hasTitle: !!t.title };
        });
        expect(after.classes).toContain('treleases');
        expect(after.hasTitle).toBe(true);
    });

    test('the tooltips drop the ⏱ hint when that feature is off', async ({ page }) => {
        await openDifferingFixture(page, { sa_enable_ms_track_length: false });

        // The column itself is independent of the millisecond feature — only
        // the toggle goes away.
        expect(await headerNames(page)).toContain('Recording length');
        expect(await columnValues(page, 'Recording length')).toEqual(REC_SECONDS);
        expect(await page.locator('.mb-ms-col-hdr-btn').count()).toBe(0);
        // Nothing is stamped either, so no cell claims data nothing will ask for.
        expect(await page.locator('table.tbl tbody td[data-mb-ms]').count()).toBe(0);

        const titles = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl thead th'),
        ).filter((th) => ['Length', 'Recording length'].includes(th.dataset.colName || ''))
            .map((th) => th.title || ''));
        expect(titles).toHaveLength(2);
        // Pointing at a button that isn't there would be worse than saying nothing.
        titles.forEach((t) => expect(t).not.toContain('⏱'));
    });
});

// ── Track-vs-recording length mismatch flagging ───────────────────────────────
//
// Born to Run's eight tracks, |recording − track| in ms:
//   A1 160   A2 666   A3 800   A4 0   B1 360   B2 800   B3 3000   B4 0
// so the threshold alone decides how many rows are flagged, and B3 (three whole
// seconds) is the only one visible at the column's default seconds precision.

/** Reads every flagged cell as {col, kind, hasTooltip}, in column order per row. */
async function flaggedCells(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                Array.from(tr.cells).forEach((td, i) => {
                    if (!td.dataset.mbLenFlag) return;
                    out.push({
                        col: (ths[i] && ths[i].dataset.colName) || `#${i}`,
                        kind: td.dataset.mbLenFlag,
                        marked: td.dataset.mbColTip || '',
                        title: td.title || '',
                        text: td.textContent.replace(/\s+/g, ''),
                    });
                });
            });
        });
        return out;
    });
}

/** Distinct rows carrying at least one flagged cell. */
const flaggedRowCount = (page) => page.evaluate(() => new Set(
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((tr) => tr.querySelector('td[data-mb-len-flag]')),
).size);

test.describe('release-tracks: length-mismatch flagging', () => {
    test('at the default 1000 ms threshold only the 3-second outlier is flagged', async ({ page }) => {
        await openDifferingFixture(page);

        expect(await flaggedRowCount(page)).toBe(1);

        const cells = await flaggedCells(page);
        // BOTH duration cells on that one row, never just one of them.
        expect(cells).toHaveLength(2);
        expect(cells.map((c) => c.col)).toEqual(['Length', 'Recording length']);
        expect(cells.map((c) => c.text)).toEqual(['3:19', '3:16']);
        // 3000 ms is not MORE than the severe level (1000 × 3 = 3000), so it
        // stays at the first level — the boundary is exclusive in both tests.
        expect(cells.map((c) => c.kind)).toEqual(['warn', 'warn']);
    });

    test('the threshold decides how many rows are flagged', async ({ page }) => {
        // 0 = flag every difference at all, matching the rule that decides
        // whether the column appears in the first place: 6 of 8 tracks.
        await openDifferingFixture(page, { sa_release_tracks_length_mismatch_threshold_ms: 0 });
        expect(await flaggedRowCount(page)).toBe(6);
        // No multiple of zero is stricter than zero, so the second level is
        // disabled rather than promoting everything to ❌.
        expect((await flaggedCells(page)).every((c) => c.kind === 'warn')).toBe(true);

        // 2000 leaves only B3 again; 5000 leaves nothing at all.
        await openDifferingFixture(page, { sa_release_tracks_length_mismatch_threshold_ms: 2000 });
        expect(await flaggedRowCount(page)).toBe(1);

        await openDifferingFixture(page, { sa_release_tracks_length_mismatch_threshold_ms: 5000 });
        expect(await flaggedRowCount(page)).toBe(0);
    });

    test('the "far over" multiple promotes ⚠️ to ❌', async ({ page }) => {
        // threshold 500, factor 2 → warn above 500 ms, severe above 1000 ms.
        // 666/800/800 warn, 3000 severe, 160/360 not flagged at all.
        await openDifferingFixture(page, {
            sa_release_tracks_length_mismatch_threshold_ms: 500,
            sa_release_tracks_length_mismatch_severe_factor: 2,
        });

        expect(await flaggedRowCount(page)).toBe(4);
        const kinds = (await flaggedCells(page)).map((c) => c.kind);
        expect(kinds.filter((k) => k === 'severe')).toHaveLength(2);   // both cells of B3
        expect(kinds.filter((k) => k === 'warn')).toHaveLength(6);     // both cells of 3 rows

        // A factor of 1 disables the second level entirely.
        await openDifferingFixture(page, {
            sa_release_tracks_length_mismatch_threshold_ms: 500,
            sa_release_tracks_length_mismatch_severe_factor: 1,
        });
        expect((await flaggedCells(page)).every((c) => c.kind === 'warn')).toBe(true);
    });

    test('each cell explains the gap from its OWN point of view', async ({ page }) => {
        await openDifferingFixture(page);
        const [lengthCell, recCell] = await flaggedCells(page);

        // Same gap, opposite directions — the two columns are easy to mix up,
        // so neither tooltip may leave the reader to work out which is which.
        expect(lengthCell.title).toContain('Track length 3:19.000 is 3 s LONGER');
        expect(lengthCell.title).toContain("the recording's own length, 3:16.000");
        expect(recCell.title).toContain('Recording length 3:16.000 is 3 s SHORTER');
        expect(recCell.title).toContain("this release's track length, 3:19.000");

        // …why they can differ at all, and why THIS row tripped.
        [lengthCell, recCell].forEach((c) => {
            expect(c.title).toContain('two different MusicBrainz fields');
            expect(c.title).toContain('Flagged ⚠️ because they differ by more than the 1 s threshold');
        });

        // Marked as our own tooltip, or purgeJesus2099Artifacts() strips the
        // native `treleases` class off the Length cell and deletes the title.
        expect(lengthCell.marked).toBe('1');
        expect(recCell.marked).toBe('1');
    });

    test('flagging adds nothing to the cell text, so duration sorting is unaffected', async ({ page }) => {
        await openDifferingFixture(page, { sa_release_tracks_length_mismatch_threshold_ms: 0 });

        // Every cell is flagged at threshold 0 — if the marker were a glyph in
        // the cell's text it would reach _compareDurations(), which parses this
        // column's rendered text, and the whole column would sort as unknown.
        expect(await flaggedRowCount(page)).toBe(6);
        const values = await columnValues(page, 'Recording length');
        expect(values.every((v) => /^\d+:\d{2}$/.test(v))).toBe(true);

        const th = page.locator('table.tbl thead th[data-col-name="Recording length"]').first();
        await waitForSortSettled(
            page,
            () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click(),
            { subTableHeading: '12" Vinyl' },
        );
        const sorted = await columnValues(page, 'Recording length');
        const toSecs = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
        expect(sorted).toEqual([...sorted].sort((a, b) => toSecs(a) - toSecs(b)));
    });

    test('no flagging when the feature is switched off', async ({ page }) => {
        await openDifferingFixture(page, {
            sa_enable_release_tracks_length_mismatch_flag: false,
            sa_release_tracks_length_mismatch_threshold_ms: 0,
        });
        // The column itself is independent of the flag feature and stays.
        expect(await headerNames(page)).toContain('Recording length');
        expect(await columnValues(page, 'Recording length')).toEqual(REC_SECONDS);
        expect(await flaggedRowCount(page)).toBe(0);
    });
});

// ── Length-mismatch summary buttons ──────────────────────────────────────────

const warnBtn = (page) => page.locator('#mb-len-mismatch-warn-btn');
const severeBtn = (page) => page.locator('#mb-len-mismatch-severe-btn');
const visibleRows = (page) => page.locator('table.tbl tbody tr:visible').count();

test.describe('release-tracks: length-mismatch summary buttons', () => {
    test('count ROWS (not cells) and filter to them, toggling off again', async ({ page }) => {
        await openDifferingFixture(page);

        // One flagged row, whose TWO duration cells are both marked — a
        // per-cell tally would say "(2)" and read as twice the problem.
        await expect(warnBtn(page)).toBeVisible();
        await expect(warnBtn(page)).toHaveText('(1) LENGTH ⚠️');
        await expect(severeBtn(page)).toBeHidden();

        expect(await visibleRows(page)).toBe(8);
        await warnBtn(page).click();
        expect(await visibleRows(page)).toBe(1);
        expect(await columnValues(page, 'Recording length')).toEqual(['3:16']);
        await expect(warnBtn(page)).toHaveAttribute('aria-pressed', 'true');

        // Pressing again is the only way back — nothing typed can clear it.
        await warnBtn(page).click();
        expect(await visibleRows(page)).toBe(8);
        await expect(warnBtn(page)).toHaveAttribute('aria-pressed', 'false');
    });

    test('the two severities filter independently', async ({ page }) => {
        // threshold 500, factor 2 → 3 warn rows, 1 severe row.
        await openDifferingFixture(page, {
            sa_release_tracks_length_mismatch_threshold_ms: 500,
            sa_release_tracks_length_mismatch_severe_factor: 2,
        });

        await expect(warnBtn(page)).toHaveText('(3) LENGTH ⚠️');
        await expect(severeBtn(page)).toHaveText('(1) LENGTH ❌');

        // ⚠️ shows only the warn rows — the severe row is NOT included, so the
        // two buttons partition the flagged set rather than nesting.
        await warnBtn(page).click();
        expect(await visibleRows(page)).toBe(3);
        expect(await columnValues(page, 'Recording length')).toEqual(['3:11', '3:01', '4:30']);

        // Picking the other severity switches rather than accumulating.
        await severeBtn(page).click();
        expect(await visibleRows(page)).toBe(1);
        expect(await columnValues(page, 'Recording length')).toEqual(['3:16']);
        await expect(warnBtn(page)).toHaveAttribute('aria-pressed', 'false');
        await expect(severeBtn(page)).toHaveAttribute('aria-pressed', 'true');
    });

    test('the structural filter composes with a typed query', async ({ page }) => {
        await openDifferingFixture(page, { sa_release_tracks_length_mismatch_threshold_ms: 500 });

        // Default factor 3 → severe above 1500 ms, so B3's 3000 ms is ❌ and
        // only the three sub-1500 ms rows are ⚠️.
        await warnBtn(page).click();
        expect(await visibleRows(page)).toBe(3);

        // Narrowing further by typing keeps the flag filter engaged, and the
        // pressed button is what makes that combination legible.
        const globalInput = page.locator('#mb-global-filter-input');
        await globalInput.click();
        await waitForFilterSettled(page, () => globalInput.pressSequentially('Night'));
        expect(await visibleRows(page)).toBe(1);
        await expect(warnBtn(page)).toHaveAttribute('aria-pressed', 'true');
    });

    test('"Clear all filters" releases it — it is not a query, so nothing else would', async ({ page }) => {
        await openDifferingFixture(page);

        await warnBtn(page).click();
        expect(await visibleRows(page)).toBe(1);

        await page.locator('#mb-clear-all-filters-btn').click();
        expect(await visibleRows(page)).toBe(8);
        await expect(warnBtn(page)).toHaveAttribute('aria-pressed', 'false');
    });

    test('both buttons stay hidden when nothing is flagged', async ({ page }) => {
        await openDifferingFixture(page, { sa_release_tracks_length_mismatch_threshold_ms: 5000 });
        await expect(warnBtn(page)).toBeHidden();
        await expect(severeBtn(page)).toBeHidden();
    });
});
