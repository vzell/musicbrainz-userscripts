'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');
const { findingRow } = require('../support/findingsMenu');

// Feature (org/recordings-UVD.org): recording disambiguation comments
// ("live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA") classified by ONE pure
// parser, _parseRecordingComment(), whose date part is judged by the same
// _liveVerdictFromMatch()/_parseLiveTitle() as live titles and event names.
// It feeds the 📊 "Recording comment info - …" sections on recording-link
// columns (Name, Recording, …) and on the release tracklist's plain
// "Disambiguation" column, the data-mb-live-flag tint, and the rec-live-*
// / rec-date-* findings. Part 3 of the request adds eventParts sections
// ("Event info - Country form/Detail/Additional info") and the
// event-state-missing finding.
//
// Both fixtures come from scripts/build-recording-comments-fixture.py, whose
// docstring lists every row. The expected counts below were derived by hand
// from the grammar, not from running the parser.

const ARTIST_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/recordings';
const ARTIST_FIXTURE = path.join(__dirname, 'artist-recordings-comments.html');
const RELEASE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const RELEASE_FIXTURE = path.join(__dirname, 'release-tracks-comment-dates.html');
const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

const NAME_ERRORS = [
    'Rosalita', 'Kitty’s Back', 'Jungleland', 'Badlands', 'Darlington County', 'Lucky Town',
];
const NAME_WARNS = ['Born to Run', 'Spirit in the Night'];

/**
 * Loads the artist-recordings fixture and runs "⊚ All recordings".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 */
async function openArtist(page, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url: ARTIST_URL, fixtureFile: ARTIST_FIXTURE, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride },
    });
    await page.route(`${ARTIST_URL}*`, (r) => r.fulfill({ path: ARTIST_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Loads the release fixture and runs "Show all Tracks for Release",
 * expanding every sub-table.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 */
async function openRelease(page, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
        await master.click();
    }
}

/**
 * One column's 📊 sections whose label starts with `prefix`, summed over
 * every table that has the column, as `{label: {item: count}}`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {string} prefix
 * @returns {Promise<Object<string, Object<string, number>>>}
 */
async function sections(page, col, prefix) {
    const tables = await page.evaluate(() => document.querySelectorAll('table.tbl').length);
    const out = {};
    for (let i = 0; i < tables; i++) {
        const s = await page.evaluate(([c, ti]) => window.__saTest.getUniqDropSections(c, ti), [col, i]);
        (s || []).filter((x) => x.label.startsWith(prefix)).forEach((x) => {
            out[x.label] = out[x.label] || {};
            x.items.forEach((it) => { out[x.label][it.label] = (out[x.label][it.label] || 0) + it.count; });
        });
    }
    return out;
}

/**
 * Clicks one entry inside one named section of the open 📊 panel and waits
 * for the re-filter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} section
 * @param {string} item - Start of the entry's tooltip, or part of its text.
 */
async function tick(page, section, item) {
    const ok = await page.evaluate(([sec, it]) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
        const el = sectionEl && Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((e) => (e.title || '').startsWith(it) || (e.textContent || '').includes(it));
        if (!el) return false;
        el.click();
        return true;
    }, [section, item]);
    expect(ok, `entry "${item}" in "${section}"`).toBe(true);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * `{name, flag, finding}` of every visible row's cell in column `col`
 * (`name` is the recording link's text on a link column, the cell text
 * otherwise).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {string} [nameCol] - Column to take the row's name from.
 */
const visibleRows = (page, col, nameCol = col) => page.evaluate(([c, nc]) => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const idx = ths.findIndex((t) => t.dataset.colName === c);
        const nIdx = ths.findIndex((t) => t.dataset.colName === nc);
        if (idx < 0 || nIdx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.cells[idx]) return;
            const nameEl = tr.cells[nIdx].querySelector('a[href*="/recording/"] bdi') || tr.cells[nIdx];
            out.push({
                name: nameEl.textContent.trim(),
                flag: tr.cells[idx].dataset.mbLiveFlag || null,
                finding: tr.cells[idx].dataset.mbFinding || null,
            });
        });
    });
    return out;
}, [col, nameCol]);

/**
 * Names per live flag, sorted.
 *
 * @param {Array<{name: string, flag: ?string}>} rows
 */
const flags = (rows) => ({
    error: rows.filter((r) => r.flag === 'error').map((r) => r.name).sort(),
    warn: rows.filter((r) => r.flag === 'warn').map((r) => r.name).sort(),
});

test.describe('📊 Recording comment info', () => {
    test('parser: forms, types, near misses, dates', async ({ page }) => {
        await openArtist(page);
        const p = (t) => page.evaluate((x) => window.__saTest.parseRecordingComment(x), t);

        expect(await p('live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA')).toMatchObject({
            type: 'live', form: 'datelocation', date: '2004-10-02', info: null, locParts: 4, multiDay: false,
            live: { kind: 'valid', shape: 'YYYY-MM-DD', sep: 'unicode', locParts: 4 },
        });
        expect(await p('live')).toMatchObject({ type: 'live', form: 'typeonly', live: null, date: null });
        expect(await p('live, 2002')).toMatchObject({ form: 'date', date: '2002', live: { kind: 'valid', shape: 'YYYY', locParts: null } });
        expect(await p('live, 2004‐10‐02, early show')).toMatchObject({ form: 'date', live: { extra: 'early show' } });
        expect(await p('live, Los Angeles, CA, USA')).toMatchObject({ form: 'location', locParts: 3, live: null });
        expect(await p('live, early show')).toMatchObject({ form: 'other' });
        expect(await p('soundcheck, 2016‐08‐30: MetLife Stadium, East Rutherford, NJ, USA; intro'))
            .toMatchObject({ type: 'soundcheck', form: 'datelocation', info: 'intro', locParts: 4 });
        // Longest type first: "live rehearsal" is not "live" + " rehearsal".
        expect((await p('live rehearsal, 1978‐05‐19: Paramount Theatre, Asbury Park, NJ, USA')).type).toBe('live rehearsal');
        expect((await p('rehearsal, 1978‐05‐19: Paramount Theatre, Asbury Park, NJ, USA')).type).toBe('rehearsal');
        expect(await p('live, 2001‐12‐22/23: Convention Hall, Asbury Park, NJ, USA'))
            .toMatchObject({ form: 'datelocation', multiDay: true, date: '2001-12-22', live: { kind: 'valid', complete: true } });
        expect(await p('live, 1975‐13‐05: The Main Point, Bryn Mawr, PA, USA')).toMatchObject({ form: 'datelocation', live: { kind: 'invalid' } });

        const miss = async (t) => (await p(t)).problem;
        expect(await miss('live, 05.02.1975: The Main Point, Bryn Mawr, PA, USA')).toBe('date is not written YYYY-MM-DD');
        expect(await miss('live 2004‐10‐02: Gund Arena, Cleveland, OH, USA')).toBe('no ", " after the event type');
        expect(await miss('Live, 2004‐10‐03: Gund Arena, Cleveland, OH, USA')).toBe('event type not in lower case ("live")');
        expect(await miss('2004‐10‐02: Gund Arena, Cleveland, OH, USA')).toBe('no event type before the date ("live, …")');
        expect(await miss('live, 2004‐10‐02, Gund Arena, Cleveland, OH, USA')).toBe('no ": " between the date and the location');
        expect(await miss('live, 2004‐10‐02 Gund Arena, Cleveland')).toBe('no ": " between the date and the location');

        // Not live comments at all.
        for (const t of ['alternate take', 'version 4', 'studio version', 'liveshow', '']) {
            expect(await p(t), t).toBeNull();
        }
    });

    test('artist-recordings Name column: every section and count', async ({ page }) => {
        await openArtist(page);
        expect(await sections(page, 'Name', 'Recording comment info')).toEqual({
            'Recording comment info - Form': {
                '🎤 event type only ("live")': 1,
                '📅 type and date ("live, 2002")': 1,
                '📍 type and location ("live, City, State, Country")': 1,
                '📅📍 type, date and location ("live, DATE: Venue, City, …")': 11,
                '✍️ other text after the type': 1,
            },
            'Recording comment info - Event type': { '» type: live': 17, '» type: rehearsal': 1, '» type: soundcheck': 1 },
            'Recording comment info - Near miss': {
                '❗ almost "live, DATE: Venue, City, …"': 5,
                '» problem: date is not written YYYY-MM-DD': 1,
                '» problem: event type not in lower case ("live")': 1,
                '» problem: no ", " after the event type': 1,
                '» problem: no ": " between the date and the location': 1,
                '» problem: no event type before the date ("live, …")': 1,
            },
            'Recording comment info - Uncertain day': { '❔ uncertain day ("2001-12-22/23")': 1 },
            'Recording comment info - Additional info': {
                '📝 has "; additional info"': 1, '☐ no additional info': 18, '» info: intro': 1,
            },
            'Recording comment info - Validity': { '✅ follows the live title convention': 11, '❌ impossible date': 1 },
            'Recording comment info - Date completeness': {
                '📅 complete date (YYYY-MM-DD)': 10, '◐ incomplete date': 2,
                '» date: YYYY': 1, '» date: YYYY-MM': 1, '» date: YYYY-MM-DD': 10,
            },
            'Recording comment info - Additional date info': { '🕗 has additional date information': 1, '» info: early show': 1 },
            'Recording comment info - Location completeness': {
                '» location: 3 parts (Venue, City, Country)': 3,
                '» location: 4 parts (Venue, City, State, Country)': 9,
            },
            'Recording comment info - Separator ‐ only': {
                '∑ live titles': 9, '✅ valid': 8, '❌ impossible date': 1, '◐ incomplete date': 1, '🕗 additional date information': 1,
            },
            'Recording comment info - Separator - only': { '∑ live titles': 1, '✅ valid': 1 },
            'Recording comment info - Separator mixed': { '∑ live titles': 1, '✅ valid': 1 },
        });
        // The synthetic "Comment" column is deliberately not a comment column.
        expect(await sections(page, 'Comment', 'Recording comment info')).toEqual({});
    });

    test('ticking entries filters to exactly their rows', async ({ page }) => {
        await openArtist(page);
        await sections(page, 'Name', 'Recording comment info');
        await tick(page, 'Recording comment info - Location completeness', '3 parts');
        expect((await visibleRows(page, 'Name')).map((r) => r.name).sort()).toEqual(['Cover Me', 'Johnny 99', 'Prove It All Night']);
    });

    test('ticking a near-miss reason', async ({ page }) => {
        await openArtist(page);
        await sections(page, 'Name', 'Recording comment info');
        await tick(page, 'Recording comment info - Near miss', 'no event type');
        expect((await visibleRows(page, 'Name')).map((r) => r.name)).toEqual(['Darlington County']);
    });

    test('Name cells: red for impossible dates and near misses, yellow for "-"; survive filter and sort', async ({ page }) => {
        await openArtist(page);
        const want = { error: [...NAME_ERRORS].sort(), warn: [...NAME_WARNS].sort() };
        expect(flags(await visibleRows(page, 'Name'))).toEqual(want);

        await page.fill('#mb-global-filter-input', 'Gund Arena');
        await expect.poll(async () => (await visibleRows(page, 'Name')).length, { timeout: 15000 }).toBe(5);
        expect(flags(await visibleRows(page, 'Name')).error).toEqual(['Badlands', 'Darlington County', 'Jungleland', 'Lucky Town']);

        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await visibleRows(page, 'Name')).length, { timeout: 15000 }).toBe(22);
        const sortBtn = page.locator('table.tbl thead .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => sortBtn.click());
        expect(flags(await visibleRows(page, 'Name'))).toEqual(want);
    });

    test('⚠️ / ❌ menus: recording comment and state findings', async ({ page }) => {
        await openArtist(page);
        expect(await findingRow(page, 'warn', 'rec-live-sep')).toMatchObject({ count: 2 });
        expect(await findingRow(page, 'error', 'rec-live-invalid')).toMatchObject({ count: 1 });
        expect(await findingRow(page, 'error', 'rec-live-nearmiss')).toMatchObject({ count: 5 });
        // "The Roxy, West Hollywood, USA": eventParts puts "West Hollywood" in
        // the state slot, which is not a two-letter code.
        expect(await findingRow(page, 'warn', 'event-state-missing')).toMatchObject({ count: 1 });
        // No Recording date column on this page.
        expect(await findingRow(page, 'error', 'rec-date-mismatch')).toBeUndefined();
    });

    test('eventParts sections: country form, detail, additional info', async ({ page }) => {
        await openArtist(page);
        expect(await sections(page, 'Event-Country', 'Event info - Country form')).toEqual({
            // "live, Los Angeles, CA, USA" (Johnny 99) has a country since the
            // colon-less location form is split (event-parts-location-only.spec.js).
            'Event info - Country form': { '🔤 abbreviation (USA, UK)': 12, '📛 full name': 1 },
        });
        expect(await sections(page, 'Event-Detail', 'Event info - Detail')).toEqual({
            'Event info - Detail': {
                '🕗 has detail': 4, '☐ no detail': 13,
                '» detail: 05.02.1975': 1, '» detail: Gund Arena': 1, '» detail: early show': 2,
            },
        });
        expect(await sections(page, 'Event-Additional-Info', 'Event info - Additional info')).toEqual({
            'Event info - Additional info': { '📝 has additional info': 1, '☐ no additional info': 16, '» info: intro': 1 },
        });
    });

    test('ticking "no detail" filters typed rows only', async ({ page }) => {
        await openArtist(page);
        await sections(page, 'Event-Detail', 'Event info - Detail');
        await tick(page, 'Event info - Detail', '🕗 has detail');
        expect((await visibleRows(page, 'Event-Detail', 'Name')).map((r) => r.name).sort()).toEqual([
            'Kitty’s Back', 'Lucky Town', 'Racing in the Street', 'Thunder Road',
        ].sort());
    });

    test('rehearsal is an event type for eventParts too', async ({ page }) => {
        await openArtist(page);
        const type = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
            const ti = ths.findIndex((t) => t.dataset.colName === 'Event-Type');
            const ni = ths.findIndex((t) => t.dataset.colName === 'Name');
            const row = Array.from(tbl.tBodies[0].rows).find((r) => r.cells[ni].textContent.includes('Something in the Night'));
            return row.cells[ti].textContent.trim();
        });
        expect(type).toBe('rehearsal');
    });

    test('release-tracks Disambiguation: sections, tints, Recording date findings', async ({ page }) => {
        await openRelease(page);
        expect(await sections(page, 'Disambiguation', 'Recording comment info')).toEqual({
            'Recording comment info - Form': {
                '🎤 event type only ("live")': 1,
                '📅📍 type, date and location ("live, DATE: Venue, City, …")': 7,
            },
            'Recording comment info - Event type': { '» type: live': 9 },
            'Recording comment info - Near miss': {
                '❗ almost "live, DATE: Venue, City, …"': 1,
                '» problem: no ", " after the event type': 1,
            },
            'Recording comment info - Additional info': {
                '📝 has "; additional info"': 1, '☐ no additional info': 8, '» info: acoustic': 1,
            },
            'Recording comment info - Validity': { '✅ follows the live title convention': 6, '❌ impossible date': 1 },
            'Recording comment info - Date completeness': {
                '📅 complete date (YYYY-MM-DD)': 6, '◐ incomplete date': 1,
                '» date: YYYY-MM': 1, '» date: YYYY-MM-DD': 6,
            },
            'Recording comment info - Location completeness': {
                '» location: 3 parts (Venue, City, Country)': 1,
                '» location: 4 parts (Venue, City, State, Country)': 6,
            },
            'Recording comment info - Separator ‐ only': {
                '∑ live titles': 6, '✅ valid': 5, '❌ impossible date': 1, '◐ incomplete date': 1,
            },
            'Recording comment info - Separator - only': { '∑ live titles': 1, '✅ valid': 1 },
        });
        expect(flags(await visibleRows(page, 'Disambiguation', 'Title'))).toEqual({
            error: ['The River', 'Youngstown'],
            warn: ['Darkness on the Edge of Town'],
        });
        const dateTint = await visibleRows(page, 'Recording date', 'Title');
        expect(dateTint.filter((r) => r.finding === 'error').map((r) => r.name).sort()).toEqual(['The Promised Land', 'The River']);
        expect(dateTint.filter((r) => r.finding === 'warn').map((r) => r.name).sort()).toEqual(['Badlands', 'Prove It All Night', 'Two Hearts']);
        expect(await findingRow(page, 'error', 'rec-date-mismatch')).toMatchObject({ count: 2 });
        expect(await findingRow(page, 'warn', 'rec-date-imprecise')).toMatchObject({ count: 3 });
        expect(await findingRow(page, 'warn', 'rec-live-sep')).toMatchObject({ count: 1 });
        expect(await findingRow(page, 'error', 'rec-live-invalid')).toMatchObject({ count: 1 });
        expect(await findingRow(page, 'error', 'rec-live-nearmiss')).toMatchObject({ count: 1 });
    });

    test('settings off: no sections, no tints, no date tint', async ({ page }) => {
        await openArtist(page, {
            sa_enable_uvd_recording_comments: false,
            sa_enable_live_title_error_flag: false,
            sa_enable_live_title_separator_flag: false,
        });
        expect(await sections(page, 'Name', 'Recording comment info')).toEqual({});
        expect(flags(await visibleRows(page, 'Name'))).toEqual({ error: [], warn: [] });
    });
});
