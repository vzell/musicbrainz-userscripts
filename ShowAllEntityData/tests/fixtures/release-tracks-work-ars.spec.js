'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Work-level AR columns on release-tracks: the relationships belonging to the
// WORK a track is a "recording of:", which MusicBrainz nests one level below
// everything `_findAllArDts()` can see —
//
//   div.ars > dl.ars > dt "recording of:"
//                      dd  > a[/work/…]
//                            dl.ars > dt "publisher:"   ← these
//
// — and which therefore reached no column at all until `_findWorkArDts()`
// existed. See org/release-tracks-ARs.org and debug/work-ARs.html.
//
// The fixture is the real native "Born to Run" page (release
// 1d404e1d-fcb6-3a52-b478-e706e893c897), already committed for the millisecond
// Length specs and reused verbatim here — it happens to carry every shape this
// feature has to get right, so no second copy of the same release is committed:
//
//   track 0 Thunder Road      "is based on:" ×3 (three sibling <dt>s)
//   track 4 Born to Run       "sub-publisher:", and NO "arranger:"
//   track 5 She’s the One     standalone "lyricist:" + "composer:"
//   tracks 1,2,3,6,7          "lyricist and composer:" as one <dt>
//   every track               "publisher:" crediting an artist on one <dl>
//                             and label(s) on a sibling <dl>
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

// Map-insertion (first-encountered-in-page) order, which is what the header
// block turns into left-to-right column order. "Work publisher" splits by
// entity kind because the release credits both an artist and a label under
// that one phrase; "Work lyricist"/"Work composer" exist as two columns only
// because `_workRoleComponentKeys()` splits "lyricist and composer:".
const WORK_COLUMNS = [
    'Work publisher artist',
    'Work publisher label',
    'Work lyricist',
    'Work composer',
    'Work arranger',
    'Work is based on',
    'Work sub-publisher',
];

const openFixture = async (page, settingsOverride = {}) => {
    await loadUserscriptPage(page, {
        url: RELEASE_URL,
        fixtureFile: FIXTURE,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, ...settingsOverride },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await page.waitForSelector('#mb-filter-container');
};

/** Rendered header names, in column order, for the first rendered table. */
async function headerNames(page) {
    return page.evaluate(() => Array.from(
        document.querySelectorAll('table.tbl'),
    ).slice(0, 1).flatMap((tbl) => Array.from(tbl.querySelectorAll('thead th'))
        .map((th) => th.dataset.colName || '')));
}

/** One column's cell text for every row, in row order. */
async function columnValues(page, colName) {
    return page.evaluate((name) => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === name);
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                const td = tr.cells[idx];
                if (td) out.push(td.textContent.replace(/\s+/g, ' ').trim());
            });
        });
        return out;
    }, colName);
}

/** Per-row `<li>` counts for one column, in row order. */
async function columnRowCounts(page, colName) {
    return page.evaluate((name) => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === name);
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                const td = tr.cells[idx];
                if (td) out.push(td.querySelectorAll('ul > li').length);
            });
        });
        return out;
    }, colName);
}

test.describe('release-tracks: work-level AR columns', () => {
    test('adds one column per work relationship, between "Recorded in area" and "Performer"', async ({ page }) => {
        await openFixture(page);
        const names = await headerNames(page);

        // The exact set AND order — a set-only assertion would pass with the
        // columns scattered, and column order is half of what was asked for.
        expect(names.filter((n) => n.startsWith('Work '))).toEqual(WORK_COLUMNS);

        // Placement. This release has no "Recorded in area"/"Performer" of its
        // own, so the binding neighbours are the last recording-entity column
        // before the block and the first people-credit column after it.
        const firstWork = names.indexOf(WORK_COLUMNS[0]);
        const lastWork = names.indexOf(WORK_COLUMNS[WORK_COLUMNS.length - 1]);
        expect(names.indexOf('Recorded at place')).toBeLessThan(firstWork);
        expect(lastWork).toBeLessThan(names.indexOf('Vocals'));
        // Contiguous: nothing foreign wedged into the run.
        expect(lastWork - firstWork).toBe(WORK_COLUMNS.length - 1);
    });

    test('splits "lyricist and composer:" so it lines up with tracks crediting them separately', async ({ page }) => {
        await openFixture(page);

        // The whole point of the split. Track 5 ("She’s the One") is the only
        // one with standalone "lyricist:"/"composer:" <dt>s; every other track
        // states both roles in ONE "lyricist and composer:" <dt>. Unsplit, this
        // release would carry three columns, each mostly empty.
        const lyricist = await columnValues(page, 'Work lyricist');
        const composer = await columnValues(page, 'Work composer');
        expect(lyricist).toHaveLength(8);
        expect(composer).toHaveLength(8);

        // Populated on BOTH shapes — asserting one track would pass without the
        // split, since the standalone track needs no splitting to work.
        expect(lyricist.every((v) => v.includes('Bruce Springsteen'))).toBe(true);
        expect(composer.every((v) => v.includes('Bruce Springsteen'))).toBe(true);

        // The two columns carry the SAME <dd> on a combined <dt> (track 0) and
        // DIFFERENT ones where MusicBrainz stated the roles apart (track 5),
        // which is what proves the split reads each <dt>'s own credit rather
        // than copying one column into the other.
        expect(lyricist[0]).toBe(composer[0]);
        expect(lyricist[5]).not.toBe(composer[5]);
        expect(lyricist[5]).toContain('1975-07');
        expect(composer[5]).toContain('1975-05');

        // A track whose roles were never combined must not gain a phantom
        // "Work lyricist and composer" column.
        expect(await headerNames(page)).not.toContain('Work lyricist and composer');
    });

    test('splits "publisher:" by entity kind, artist and label unmixed', async ({ page }) => {
        await openFixture(page);

        const artists = await columnValues(page, 'Work publisher artist');
        const labels = await columnValues(page, 'Work publisher label');

        // One phrase, two sibling <dl>s, two columns — the
        // "Phonographic copyright (℗) by artist"/"…by label" shape.
        expect(artists[0]).toContain('Bruce Springsteen');
        expect(artists[0]).not.toContain('Intersong');
        expect(labels[0]).toContain('Intersong Music Ltd.');
        expect(labels[0]).toContain('Laurel Canyon Music Ltd.');
        expect(labels[0]).not.toContain('Bruce Springsteen');

        // Two labels joined by " and " in ONE <dd> become two rows.
        expect((await columnRowCounts(page, 'Work publisher label'))[0]).toBe(2);
    });

    test('renders every "is based on:" sibling <dt>, not just the first', async ({ page }) => {
        await openFixture(page);

        // Track 0 carries THREE separate "is based on:" <dt>s. A `.find()`-style
        // finder shows one work and looks perfectly healthy — the bug already
        // fixed twice for _findPhonographicCopyrightDts/_findRecordedAtDt.
        expect((await columnRowCounts(page, 'Work is based on'))[0]).toBe(3);

        const cell = (await columnValues(page, 'Work is based on'))[0];
        expect(cell).toContain('Chrissie’s Song');
        expect(cell).toContain('Walking in the Street');
        expect(cell).toContain('Wings for Wheels');

        // Only that one track has the relationship; the rest stay empty rather
        // than inheriting the column's content.
        expect((await columnValues(page, 'Work is based on')).slice(1).join('')).toBe('');
    });

    test('carries the source relationship\'s own entity glyph into the header', async ({ page }) => {
        await openFixture(page);

        const glyphs = await page.evaluate((cols) => Object.fromEntries(cols.map((name) => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => (t.dataset.colName || '') === name);
            const span = th && th.querySelector('span[class$="link"]');
            return [name, span ? span.className.trim() : null];
        })), WORK_COLUMNS);

        // Whatever kind the relationship actually credits — not a fixed icon.
        expect(glyphs['Work publisher artist']).toBe('artistlink');
        expect(glyphs['Work publisher label']).toBe('labellink');
        expect(glyphs['Work sub-publisher']).toBe('labellink');
        expect(glyphs['Work is based on']).toBe('worklink');
        expect(glyphs['Work lyricist']).toBe('artistlink');
    });

    test('registers the columns as collapsable and as extracted-AR columns', async ({ page }) => {
        await openFixture(page);

        // Multi-row work cells need the per-cell ▶N▤ toggle, which
        // initCollapsableColumns() only grants a column named in
        // `features.collapsableColumns` — registered at runtime, since these
        // names aren't known at authoring time.
        const togglesOnIsBasedOn = await page.evaluate(() => {
            const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Work is based on');
            if (idx < 0) return -1;
            return Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((tr) => tr.cells[idx] && tr.cells[idx].querySelector('.mb-cell-collapse-toggle'))
                .length;
        });
        expect(togglesOnIsBasedOn).toBe(1);

        // …and the "extracted column" header tint, which is what tells the
        // reader these came out of the ARs data rather than MusicBrainz's own
        // table.
        const tinted = await page.evaluate((cols) => cols.filter((name) => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => (t.dataset.colName || '') === name);
            return th && th.classList.contains('mb-extracted-column');
        }), WORK_COLUMNS);
        expect(tinted).toEqual(WORK_COLUMNS);
    });

    test('leaves the recording-level columns alone — work <dt>s do not leak into them', async ({ page }) => {
        await openFixture(page);
        const names = await headerNames(page);

        // `_findAllArDts()` must stay scoped to the bare div.ars' DIRECT-child
        // <dl>s. If a work <dt> ever reached it, the dynamic fallback would
        // mint an UNPREFIXED column of the same name beside the prefixed one —
        // and two relationship levels would share it.
        for (const bare of ['Publisher', 'Lyricist', 'Composer', 'Arranger', 'Is based on', 'Sub-publisher']) {
            expect(names).not.toContain(bare);
        }

        // The recording's own dynamic columns are untouched, including the two
        // whose phrases merely CONTAIN a work-level role word.
        expect(names).toContain('Part of series');
        expect(names).toContain('Horn arranger');
        expect(names).toContain('Strings arranger');
        // And the fixed "recording of:" column still resolves the WORK anchor,
        // not one of the works nested under "is based on:".
        expect((await columnValues(page, 'Recording of work'))[0]).toBe('Thunder Road');
    });

    test('adds nothing at all when the setting is off', async ({ page }) => {
        await openFixture(page, { sa_enable_release_tracks_work_ar_columns: false });
        const names = await headerNames(page);

        expect(names.filter((n) => n.startsWith('Work '))).toEqual([]);
        // Every other column survives — the gate withholds its own columns, it
        // does not disturb the rest of the pipeline.
        expect(names).toContain('Recording of work');
        expect(names).toContain('Part of series');
        expect(names).toContain('Vocals');
        // The relationships themselves are still in the raw "ARs" column, which
        // this feature never consumes from.
        expect((await columnValues(page, 'ARs'))[0]).toContain('is based on');
    });
});
