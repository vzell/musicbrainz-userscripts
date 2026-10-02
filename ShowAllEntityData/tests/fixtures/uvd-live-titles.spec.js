'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// Feature (org/RG-R-live-UVD.org): release and release group titles checked
// against MusicBrainz's live bootleg convention
// "YYYY-MM-DD[, info]: Venue, City, State, Country"
// (https://musicbrainz.org/doc/Style/Specific_types_of_releases/Live_bootlegs)
// by ONE pure parser, _parseLiveTitle(). It feeds the 📊 "Live title info - …"
// sections on every Title-info column and the data-mb-live-flag cell tint
// (red ❌ = impossible date or near miss, yellow ⚠️ = plain "-" in the date),
// stamped once per fetch by stampLiveTitleFlags().
//
// releasegroup-releases-live-titles.html: an "Official" sub-table (a studio
// album, "1984 Revisited", one valid live title) and a "Bootleg" one (every
// parser case, plus a live-shaped title on a RECORDING link that must never
// count). artist-releasegroups-live-titles.html: real MusicBrainz markup with
// eleven well-formed "‐" live titles (scripts/build-live-titles-fixture.py).

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
const ARTIST_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const ARTIST_FIXTURE = path.join(__dirname, 'artist-releasegroups-live-titles.html');

const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

const ERRORS = [
    '1975‐13‐05: The Main Point, Bryn Mawr, PA, USA',
    '1975‐02‐42: The Main Point, Bryn Mawr, PA, USA',
    '05.02.1975: The Main Point, Bryn Mawr, PA, USA',
    '1975‐02‐05 The Main Point, Bryn Mawr',
    '1999‐02‐29: Leap Arena, Utrecht, Netherlands',
    '1975-13-05: The Main Point, Bryn Mawr, PA, USA', // red wins over the "-" yellow
];
const WARNS = [
    '1975-02-05: The Main Point, Bryn Mawr, PA, USA',
    '1975-02‐05: The Main Point, Bryn Mawr, PA, USA',
    '2000-02-29: Leap Arena, Utrecht, Netherlands',
];

/**
 * Loads a fixture page and runs its "Show all" button, expanding every
 * sub-table afterwards.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @param {string} button - The button's data-label.
 * @param {Object} [settingsOverride]
 */
async function open(page, url, fixture, button, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url, fixtureFile: fixture, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride },
    });
    await page.route(`${url}*`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.click(`button[data-label="${button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
        await master.click();
    }
}

const openRg = (page, settingsOverride) => open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup', settingsOverride);

/**
 * Index (document order among `table.tbl`) of the sub-table whose h3 names
 * `name`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<number>}
 */
const tableIndexOf = (page, name) => page.evaluate((n) => {
    const tables = Array.from(document.querySelectorAll('table.tbl'));
    return tables.findIndex((t) => {
        let prev = t.previousElementSibling;
        for (let i = 0; prev && i < 5; i++, prev = prev.previousElementSibling) {
            if (prev.tagName === 'H3') {
                const s = prev.querySelector('.mb-filter-status[data-table-name]');
                return !!s && s.dataset.tableName === n;
            }
        }
        return false;
    });
}, name);

/**
 * Opens a column's 📊 panel on one table and returns its sections as
 * `{label: {item: count}}`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {?number} tableIndex
 * @returns {Promise<Object<string, Object<string, number>>>}
 */
async function sectionsOf(page, col, tableIndex = null) {
    const sections = await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), [col, tableIndex]);
    return Object.fromEntries((sections || []).map((s) => [s.label, Object.fromEntries(s.items.map((i) => [i.label, i.count]))]));
}

/**
 * Only the "Live title info - …" sections of `sectionsOf()`.
 *
 * @param {Object<string, Object<string, number>>} s
 * @returns {Object<string, Object<string, number>>}
 */
const liveOnly = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('Live title info')));

/**
 * Clicks one entry inside one named section of the open 📊 panel and waits
 * for the re-filter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} section
 * @param {string} itemLabelStart
 */
async function tick(page, section, itemLabelStart) {
    const ok = await page.evaluate(([sec, item]) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
        const el = sectionEl && Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((e) => (e.title || '').startsWith(item));
        if (!el) return false;
        el.click();
        return true;
    }, [section, itemLabelStart]);
    expect(ok, `entry "${itemLabelStart}" in "${section}"`).toBe(true);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * `{title, flag}` of every visible row of one table's "Release"/"Title"
 * column.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 * @param {?number} [tableIndex] - All tables when omitted.
 * @returns {Promise<Array<{title: string, flag: ?string, tip: ?string}>>}
 */
const visibleRows = (page, col, tableIndex = null) => page.evaluate(([c, ti]) => {
    const out = [];
    Array.from(document.querySelectorAll('table.tbl')).forEach((tbl, i) => {
        if (ti !== null && i !== ti) return;
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === c);
        if (idx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.cells[idx]) return;
            const bdi = tr.cells[idx].querySelector('a[href] bdi');
            if (!bdi) return;
            out.push({ title: bdi.textContent, flag: tr.cells[idx].dataset.mbLiveFlag || null, tip: tr.cells[idx].title || null });
        });
    });
    return out;
}, [col, tableIndex]);

/**
 * Titles carrying each flag value, sorted, from `visibleRows()`.
 *
 * @param {Array<{title: string, flag: ?string}>} rows
 * @returns {{error: string[], warn: string[]}}
 */
const flagged = (rows) => ({
    error: rows.filter((r) => r.flag === 'error').map((r) => r.title).sort(),
    warn: rows.filter((r) => r.flag === 'warn').map((r) => r.title).sort(),
});

test.describe('📊 Live title info', () => {
    test('parser: shapes, separators, validity and near misses', async ({ page }) => {
        await openRg(page);
        const p = (t) => page.evaluate((x) => window.__saTest.parseLiveTitle(x), t);

        expect(await p('2008-12-07: Rose Garden, Portland, OR, USA')).toEqual({
            kind: 'valid', shape: 'YYYY-MM-DD', complete: true, sep: 'ascii', extra: null, locParts: 4, problems: [],
        });
        expect(await p('2008‐12‐17, early show: Mellon Arena, Pittsburgh, PA, USA')).toMatchObject({
            kind: 'valid', sep: 'unicode', extra: 'early show',
        });
        expect((await p('1975‐02-05: The Main Point, Bryn Mawr, PA, USA')).sep).toBe('mixed');
        expect((await p('2008‐12: Rose Garden, Portland, OR, USA')).shape).toBe('YYYY-MM');
        expect(await p('2008: Rose Garden, Portland, OR, USA')).toMatchObject({ kind: 'valid', shape: 'YYYY', complete: false, sep: null });
        expect((await p('12‐07: Rose Garden, Portland, OR, USA')).shape).toBe('MM-DD');
        expect((await p('1975‐??‐??: The Main Point, Bryn Mawr, PA, USA')).shape).toBe('YYYY-??-??');

        expect(await p('1975‐13‐05: The Main Point, Bryn Mawr, PA, USA')).toMatchObject({ kind: 'invalid', problems: ['month 13'] });
        expect(await p('1975‐02‐42: The Main Point, Bryn Mawr, PA, USA')).toMatchObject({ kind: 'invalid', problems: ['day 42'] });
        expect((await p('1975‐04‐31: The Main Point, Bryn Mawr, PA, USA')).kind).toBe('invalid');
        // 29 February: only in a leap year; 1900 is not one, 2000 is.
        expect((await p('2000‐02‐29: A, B, C')).kind).toBe('valid');
        expect((await p('1900‐02‐29: A, B, C')).kind).toBe('invalid');
        expect((await p('02‐29: A, B, C')).kind).toBe('valid');

        expect(await p('05.02.1975: The Main Point, Bryn Mawr, PA, USA')).toMatchObject({ kind: 'nearmiss', problems: ['date is not written YYYY-MM-DD'] });
        expect(await p('1975-2-5: The Main Point, Bryn Mawr, PA, USA')).toMatchObject({ kind: 'nearmiss', problems: ['date is not written YYYY-MM-DD'] });
        expect(await p('1975‐02‐05 The Main Point, Bryn Mawr')).toMatchObject({ kind: 'nearmiss', problems: ['no ": " between the date and the location'] });
        expect(await p('1975‐02‐05: The Main Point')).toMatchObject({ kind: 'nearmiss', problems: ['location is not "Venue, City, …"'] });

        // Not live titles at all.
        for (const t of ['Studio Album', '1984 Revisited', '2000: A Space Odyssey', '18 Tracks', '1999', '']) {
            expect(await p(t), t).toBeNull();
        }
    });

    test('Bootleg sub-table: every section and count, with the status named', async ({ page }) => {
        await openRg(page);
        const s = liveOnly(await sectionsOf(page, 'Release', await tableIndexOf(page, 'Bootleg release')));
        expect(s).toEqual({
            'Live title info - Validity': {
                '✅ follows the live title convention (Bootleg)': 8,
                '❌ impossible date (Bootleg)': 4,
            },
            'Live title info - Near miss': { '❗ starts with a date, not "DATE: Venue, City, …"': 2 },
            'Live title info - Date completeness': {
                '📅 complete date (YYYY-MM-DD)': 9, '◐ incomplete date': 3,
                '» date: MM-DD': 1, '» date: YYYY': 1, '» date: YYYY-MM': 1, '» date: YYYY-MM-DD': 9,
            },
            'Live title info - Additional date info': { '🕗 has additional date information': 1, '» info: early show': 1 },
            // The two "Leap Arena, Utrecht, Netherlands" titles have no state.
            'Live title info - Location completeness': {
                '» location: 3 parts (Venue, City, Country)': 2,
                '» location: 4 parts (Venue, City, State, Country)': 10,
            },
            // "2008: …" has no separator, so it is in none of the three.
            'Live title info - Separator ‐ only': {
                '∑ live titles': 7, '✅ valid': 4, '❌ impossible date': 3, '◐ incomplete date': 2, '🕗 additional date information': 1,
            },
            'Live title info - Separator - only': { '∑ live titles': 3, '✅ valid': 2, '❌ impossible date': 1 },
            'Live title info - Separator mixed': { '∑ live titles': 1, '✅ valid': 1 },
        });
    });

    test('Official sub-table: its own counts and status; non-live titles never count', async ({ page }) => {
        await openRg(page);
        const s = liveOnly(await sectionsOf(page, 'Release', await tableIndexOf(page, 'Official release')));
        expect(s).toEqual({
            'Live title info - Validity': { '✅ follows the live title convention (Official)': 1 },
            'Live title info - Date completeness': { '📅 complete date (YYYY-MM-DD)': 1, '» date: YYYY-MM-DD': 1 },
            'Live title info - Location completeness': { '» location: 4 parts (Venue, City, State, Country)': 1 },
            'Live title info - Separator ‐ only': { '∑ live titles': 1, '✅ valid': 1 },
        });
    });

    test('ticking an entry filters to exactly its rows', async ({ page }) => {
        await openRg(page);
        const bootleg = await tableIndexOf(page, 'Bootleg release');
        await sectionsOf(page, 'Release', bootleg);
        await tick(page, 'Live title info - Near miss', '❗');
        expect((await visibleRows(page, 'Release', bootleg)).map((r) => r.title).sort()).toEqual([
            '05.02.1975: The Main Point, Bryn Mawr, PA, USA',
            '1975‐02‐05 The Main Point, Bryn Mawr',
        ]);
    });

    test('ticking a location-completeness entry filters to exactly its rows', async ({ page }) => {
        await openRg(page);
        const bootleg = await tableIndexOf(page, 'Bootleg release');
        await sectionsOf(page, 'Release', bootleg);
        await tick(page, 'Live title info - Location completeness', '3 parts');
        expect((await visibleRows(page, 'Release', bootleg)).map((r) => r.title).sort()).toEqual([
            '1999‐02‐29: Leap Arena, Utrecht, Netherlands',
            '2000-02-29: Leap Arena, Utrecht, Netherlands',
        ]);
    });

    test('ticking a per-separator facet matches that separator only', async ({ page }) => {
        await openRg(page);
        const bootleg = await tableIndexOf(page, 'Bootleg release');
        await sectionsOf(page, 'Release', bootleg);
        await tick(page, 'Live title info - Separator - only', '✅ valid');
        expect((await visibleRows(page, 'Release', bootleg)).map((r) => r.title).sort()).toEqual([
            '1975-02-05: The Main Point, Bryn Mawr, PA, USA',
            '2000-02-29: Leap Arena, Utrecht, Netherlands',
        ]);
    });

    test('cells: red for impossible dates and near misses, yellow for "-", none on a recording link', async ({ page }) => {
        await openRg(page);
        const rows = await visibleRows(page, 'Release');
        expect(flagged(rows)).toEqual({ error: [...ERRORS].sort(), warn: [...WARNS].sort() });
        const leap = rows.find((r) => r.title.startsWith('1999'));
        expect(leap.tip).toBe('Live title date is impossible: day 29.');
        // A live-shaped title on a /recording/ link: no flag, no count.
        expect(rows.find((r) => r.title.startsWith('1981')).flag).toBeNull();
    });

    test('the flags survive a filter re-render and a sort (multi-table clones the master rows)', async ({ page }) => {
        await openRg(page);
        const want = { error: [...ERRORS].sort(), warn: [...WARNS].sort() };

        // A global filter re-renders every sub-table from groupedRows clones.
        // It is debounced, so settle on the row count: 8 rows name the Main Point.
        await page.fill('#mb-global-filter-input', 'Main Point');
        await expect.poll(async () => (await visibleRows(page, 'Release')).length, { timeout: 15000 }).toBe(8);
        const filtered = flagged(await visibleRows(page, 'Release'));
        expect(filtered.error).toEqual(want.error.filter((t) => t.includes('Main Point')));
        expect(filtered.warn).toEqual(want.warn.filter((t) => t.includes('Main Point')));

        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await visibleRows(page, 'Release')).length, { timeout: 15000 }).toBe(18);
        // A multi-table sort re-renders the sorted sub-table from clones too.
        const bootleg = await tableIndexOf(page, 'Bootleg release');
        const sortBtn = page.locator('table.tbl').nth(bootleg).locator('thead .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => sortBtn.click(), { subTableHeading: 'Bootleg release' });
        expect(flagged(await visibleRows(page, 'Release'))).toEqual(want);
    });

    test('settings off: no sections, no red, no yellow', async ({ page }) => {
        await openRg(page, {
            sa_enable_uvd_live_titles: false,
            sa_enable_live_title_error_flag: false,
            sa_enable_live_title_separator_flag: false,
        });
        expect(liveOnly(await sectionsOf(page, 'Release', await tableIndexOf(page, 'Bootleg release')))).toEqual({});
        expect(flagged(await visibleRows(page, 'Release'))).toEqual({ error: [], warn: [] });
    });

    test('separator flag off alone keeps the red cells', async ({ page }) => {
        await openRg(page, { sa_enable_live_title_separator_flag: false });
        expect(flagged(await visibleRows(page, 'Release'))).toEqual({ error: [...ERRORS].sort(), warn: [] });
    });

    test('real artist-releasegroups markup: eleven valid "‐" live titles, nothing flagged', async ({ page }) => {
        await open(page, ARTIST_URL, ARTIST_FIXTURE, '🧮 Artist RGs');
        const tables = await page.evaluate(() => document.querySelectorAll('table.tbl').length);
        let valid = 0;
        let unicode = 0;
        for (let i = 0; i < tables; i++) {
            const s = await sectionsOf(page, 'Title', i);
            const v = s['Live title info - Validity'] || {};
            valid += v['✅ follows the live title convention'] || 0;
            expect(v['❌ impossible date'], `table ${i}`).toBeUndefined();
            expect(s['Live title info - Near miss'], `table ${i}`).toBeUndefined();
            unicode += (s['Live title info - Separator ‐ only'] || {})['∑ live titles'] || 0;
        }
        expect(valid).toBe(11);
        expect(unicode).toBe(11);
        expect(flagged(await visibleRows(page, 'Title'))).toEqual({ error: [], warn: [] });
    });
});
