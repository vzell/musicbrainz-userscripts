'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');
const { findingRow, clickFinding } = require('../support/findingsMenu');

// Feature (org/events-UVD.org): event names in "Event" columns, classified by
// ONE pure parser, _parseEventName(): the live bootleg form
// "YYYY-MM-DD[, early show]: Venue, City, State, Country" (checked by the
// release/RG parser _parseLiveTitle(), whose verdict rides along), or one of
// the https://musicbrainz.org/doc/Style/Event title forms "[artist] at
// [venue]", "[festival] [N/YYYY]", "[tour]: [city]", a near miss of those, or
// free form. It feeds the 📊 "Event name info - …" sections, the
// data-mb-live-flag tint (shared with release/RG live titles), and four
// FINDINGS entries (event-live-sep, event-style-nearmiss, event-live-invalid,
// event-live-nearmiss).
//
// artist-events-names.html is built by scripts/build-event-names-fixture.py,
// whose docstring lists every row. The expected counts below were derived
// by hand from the grammar, not from running the parser.

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE = path.join(__dirname, 'artist-events-names.html');
const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

const LIVE_ERRORS = [
    '1975‐13‐05: The Main Point, Bryn Mawr, PA, USA',
    '05.02.1975: The Main Point, Bryn Mawr, PA, USA',
    '1975‐02‐05 The Main Point, Bryn Mawr',
];
const LIVE_WARNS = [
    '1975-08-13: The Bottom Line, New York City, NY, USA',
    '1975‐08-15: The Bottom Line, New York City, USA',
];
const STYLE_NEAR_MISSES = [
    'KISS @ Ziggo Dome',
    'KISS AT Tokyo Dome',
    'KISS - Rod Laver Arena',
    'End of the Road World Tour:Montreal',
    "Hellfest '23",
    'Hellfest2024',
];

/**
 * Loads the fixture and runs "Show all Events for Artist".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settingsOverride]
 */
async function open(page, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride },
    });
    await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The "Event name info - …" sections of the Event column's 📊 panel, as
 * `{label: {item: count}}`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, Object<string, number>>>}
 */
async function eventSections(page) {
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Event', null));
    return Object.fromEntries((sections || [])
        .filter((s) => s.label.startsWith('Event name info'))
        .map((s) => [s.label, Object.fromEntries(s.items.map((i) => [i.label, i.count]))]));
}

/**
 * Clicks one entry inside one named section of the open 📊 panel and waits
 * for the re-filter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} section
 * @param {string} itemLabelStart - Start of the entry's tooltip (its value).
 */
async function tick(page, section, itemLabelStart) {
    const ok = await page.evaluate(([sec, item]) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
        const el = sectionEl && Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((e) => (e.title || '').startsWith(item) || (e.textContent || '').includes(item));
        if (!el) return false;
        el.click();
        return true;
    }, [section, itemLabelStart]);
    expect(ok, `entry "${itemLabelStart}" in "${section}"`).toBe(true);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * `{name, flag, finding}` of every visible row's Event cell.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{name: string, flag: ?string, finding: ?string}>>}
 */
const visibleRows = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === 'Event');
        if (idx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.cells[idx]) return;
            const a = Array.from(tr.cells[idx].querySelectorAll('a[href] bdi')).find((b) => !b.closest('.comment'));
            if (!a) return;
            out.push({
                name: a.textContent,
                flag: tr.cells[idx].dataset.mbLiveFlag || null,
                finding: tr.cells[idx].dataset.mbFinding || null,
            });
        });
    });
    return out;
});

/**
 * Names per tint, sorted: the live flag (error/warn) and the generic
 * finding tint.
 *
 * @param {Array<{name: string, flag: ?string, finding: ?string}>} rows
 */
const tints = (rows) => ({
    error: rows.filter((r) => r.flag === 'error').map((r) => r.name).sort(),
    warn: rows.filter((r) => r.flag === 'warn').map((r) => r.name).sort(),
    style: rows.filter((r) => r.finding === 'warn').map((r) => r.name).sort(),
});

const WANT_TINTS = {
    error: [...LIVE_ERRORS].sort(),
    warn: [...LIVE_WARNS].sort(),
    style: [...STYLE_NEAR_MISSES].sort(),
};

test.describe('📊 Event name info', () => {
    test('parser: forms, precedence, near misses', async ({ page }) => {
        await open(page);
        const p = (t) => page.evaluate((x) => window.__saTest.parseEventName(x), t);
        const form = async (t) => (await p(t)).form;

        // The live form wins over everything; its verdict rides along.
        expect(await p('2026‐10‐03: Merriweather Post Pavilion, Columbia, MD, USA')).toMatchObject({
            form: 'live', edition: null, problem: null,
            live: { kind: 'valid', shape: 'YYYY-MM-DD', sep: 'unicode', locParts: 4 },
        });
        expect((await p('05.02.1975: The Main Point, Bryn Mawr, PA, USA')).live.kind).toBe('nearmiss');
        // "2000: A Space Odyssey" is not date-led for the live parser, so it
        // falls through to the tour form, as any "X: Y" does.
        expect(await form('2000: A Space Odyssey')).toBe('tour');

        expect(await form('KISS at Madison Square Garden')).toBe('oneoff');
        // " at " beats a trailing festival year.
        expect(await form('KISS at Lucca Summer Festival 2023')).toBe('oneoff');
        // A festival edition beats the tour form's colon.
        expect(await p('Hellfest 2023, Day 1: Mainstage 01')).toMatchObject({ form: 'festival', edition: 'year (YYYY)' });
        expect(await p('Wacken Open Air 33')).toMatchObject({ form: 'festival', edition: 'number (N)' });
        expect(await form('End of the Road World Tour: Toronto')).toBe('tour');
        // A number that counts a week/day is not an edition.
        expect(await form('The KISS Kruise XI, Week 2')).toBe('other');

        expect(await p('KISS @ Ziggo Dome')).toMatchObject({ form: 'nearmiss', problem: '"@" instead of " at "' });
        expect((await p('KISS At Tokyo Dome')).problem).toBe('" At " or " AT " instead of " at "');
        expect((await p('KISS - Rod Laver Arena')).problem).toBe('" - " instead of " at " or ": "');
        expect((await p('End of the Road World Tour:Montreal')).problem).toBe('colon not followed by exactly one space');
        expect((await p('End of the Road World Tour : Montreal')).problem).toBe('colon not followed by exactly one space');
        expect((await p('End of the Road World Tour:  Montreal')).problem).toBe('colon not followed by exactly one space');
        expect((await p("Hellfest '23")).problem).toBe('abbreviated year ("\'23") instead of YYYY');
        expect((await p('Hellfest2024')).problem).toBe('year glued to the name');

        // Shape only: a typo for "at" is free form.
        expect(await form('Monsters of Rock Tour ar Estadio Nemesio Camacho El Campín')).toBe('other');
        expect(await form('Power to the People')).toBe('other');
        expect(await p('')).toBeNull();
    });

    test('every section and count on the Event column', async ({ page }) => {
        await open(page);
        expect(await eventSections(page)).toEqual({
            'Event name info - Form': {
                '📅 live form "DATE: Venue, City, …"': 10,
                '🎤 "[artist] at [venue]"': 2,
                '🎪 "[festival] [N/YYYY]"': 3,
                '🚌 "[tour]: [city]"': 1,
                '✍️ free form': 3,
            },
            'Event name info - Style guide near miss': {
                '🧭 almost a style guide form': 6,
                '» problem: " - " instead of " at " or ": "': 1,
                '» problem: " At " or " AT " instead of " at "': 1,
                '» problem: "@" instead of " at "': 1,
                '» problem: abbreviated year ("\'23") instead of YYYY': 1,
                '» problem: colon not followed by exactly one space': 1,
                '» problem: year glued to the name': 1,
            },
            'Event name info - Festival edition': { '» edition: number (N)': 1, '» edition: year (YYYY)': 2 },
            'Event name info - Live form validity': {
                '✅ follows the live title convention': 7,
                '❌ impossible date': 1,
            },
            'Event name info - Live form near miss': { '❗ starts with a date, not "DATE: Venue, City, …"': 2 },
            'Event name info - Date completeness': {
                '📅 complete date (YYYY-MM-DD)': 7, '◐ incomplete date': 1,
                '» date: YYYY-MM': 1, '» date: YYYY-MM-DD': 7,
            },
            'Event name info - Additional date info': { '🕗 has additional date information': 1, '» info: early show': 1 },
            'Event name info - Location completeness': {
                '» location: 2 parts (Venue, City)': 1,
                '» location: 3 parts (Venue, City, Country)': 1,
                '» location: 4 parts (Venue, City, State, Country)': 5,
                '» location: 5+ parts': 1,
            },
            'Event name info - Separator ‐ only': {
                '∑ live titles': 6, '✅ valid': 5, '❌ impossible date': 1, '◐ incomplete date': 1, '🕗 additional date information': 1,
            },
            'Event name info - Separator - only': { '∑ live titles': 1, '✅ valid': 1 },
            'Event name info - Separator mixed': { '∑ live titles': 1, '✅ valid': 1 },
        });
    });

    test('ticking an entry filters to exactly its rows', async ({ page }) => {
        await open(page);
        await eventSections(page);
        await tick(page, 'Event name info - Style guide near miss', '🧭');
        expect((await visibleRows(page)).map((r) => r.name).sort()).toEqual([...STYLE_NEAR_MISSES].sort());
    });

    test('ticking an ev-prefixed live entry uses the live matcher', async ({ page }) => {
        await open(page);
        await eventSections(page);
        await tick(page, 'Event name info - Location completeness', '3 parts');
        expect((await visibleRows(page)).map((r) => r.name)).toEqual(['1975‐08-15: The Bottom Line, New York City, USA']);
    });

    test('ticking a form entry: festivals only', async ({ page }) => {
        await open(page);
        await eventSections(page);
        await tick(page, 'Event name info - Form', '🎪');
        expect((await visibleRows(page)).map((r) => r.name).sort()).toEqual([
            'AFL Grand Final 2023', 'Hellfest 2023, Day 1: Mainstage 01', 'Wacken Open Air 33',
        ]);
    });

    test('cells: live-form red/yellow, style near misses tinted yellow', async ({ page }) => {
        await open(page);
        expect(tints(await visibleRows(page))).toEqual(WANT_TINTS);
    });

    test('the tints survive a filter re-render and a sort', async ({ page }) => {
        await open(page);
        await page.fill('#mb-global-filter-input', 'KISS');
        await expect.poll(async () => (await visibleRows(page)).length, { timeout: 15000 }).toBe(6);
        const filtered = tints(await visibleRows(page));
        expect(filtered.style).toEqual(['KISS - Rod Laver Arena', 'KISS @ Ziggo Dome', 'KISS AT Tokyo Dome']);

        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await visibleRows(page)).length, { timeout: 15000 }).toBe(25);
        const sortBtn = page.locator('table.tbl thead .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => sortBtn.click());
        expect(tints(await visibleRows(page))).toEqual(WANT_TINTS);
    });

    test('⚠️ / ❌ menus: the four event findings with their counts', async ({ page }) => {
        await open(page);
        expect(await findingRow(page, 'warn', 'event-live-sep')).toMatchObject({ count: 2 });
        expect(await findingRow(page, 'warn', 'event-style-nearmiss')).toMatchObject({ count: 6 });
        expect(await findingRow(page, 'error', 'event-live-invalid')).toMatchObject({ count: 1 });
        expect(await findingRow(page, 'error', 'event-live-nearmiss')).toMatchObject({ count: 2 });
        // The release/RG rows never count an event.
        expect(await findingRow(page, 'warn', 'live-sep')).toBeUndefined();
        expect(await findingRow(page, 'error', 'live-nearmiss')).toBeUndefined();

        await clickFinding(page, 'event-live-nearmiss');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await visibleRows(page)).map((r) => r.name).sort()).toEqual([
            '05.02.1975: The Main Point, Bryn Mawr, PA, USA',
            '1975‐02‐05 The Main Point, Bryn Mawr',
        ]);
    });

    test('settings off: no sections, no tints', async ({ page }) => {
        await open(page, {
            sa_enable_uvd_event_names: false,
            sa_enable_live_title_error_flag: false,
            sa_enable_live_title_separator_flag: false,
            sa_findings_tint_event_style: false,
        });
        expect(await eventSections(page)).toEqual({});
        expect(tints(await visibleRows(page))).toEqual({ error: [], warn: [], style: [] });
    });

    test('only the Event column gets the sections by default', async ({ page }) => {
        await open(page);
        const roleSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Role', null));
        expect((roleSections || []).filter((s) => s.label.startsWith('Event name info'))).toEqual([]);
    });
});
