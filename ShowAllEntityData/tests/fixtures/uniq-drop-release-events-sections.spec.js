'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// The INJECTED "Release events" column, and the "Release country"/"Release
// date" columns derived from it, used to be built in a bespoke shape:
//
//     <li class="flag flag-US" title="United States (US)">US  2005-12-20</li>
//
// It rendered correctly and was invisible to every consumer that reads
// structure rather than pixels, because all of them scope on MusicBrainz's own
// native classes:
//
//   * `_findCellReleaseEventParts()` -> `.release-event`   (absent)
//   * `_findCellCountryNameParts()`  -> `.release-country` (absent)
//   * `openUniqDrop()`'s `iconSel`   -> `span.flag`        (the flag class was
//     on the <li>, which is also the walk ROOT and so unmatchable by
//     `querySelectorAll()` even if the selector had allowed an <li>)
//
// So on place-performances(-filtered) and label-relationships(-filtered) the 📊
// dropdown silently offered NO "Release events - Country/Date/Weekday" and NO
// "Country details - Name/Code" sections, and no flags — while the same columns
// on every native-markup pageType offered all of them. `release-country`,
// `release-date` and `release-event` each appear ZERO times in
// debug/right-flags-release-events.html, a real rendered page.
//
// These columns now go through `_buildReleaseEventLi()`, which emits
// MusicBrainz's own shape. NOTE the guarantee being pinned is the SECTIONS, not
// "the column renders" — the column always rendered, which is exactly why this
// went unnoticed.

const PLACE_MBID = '6a59a67c-fcc5-491f-949c-bfc45bc97463';
const PLACE_URL = `https://musicbrainz.org/place/${PLACE_MBID}`
    + '/performances?direction=1&link_type_id=693&page=1';
const FIXTURE_FILE = path.join(__dirname, 'place-performances-release-events.html');

const area = (id, name, code) => ({
    id,
    name,
    'sort-name': name,
    ...(code ? { 'iso-3166-1-codes': [code] } : {}),
});

// One relation per fixture row, keyed by the /release/<mbid> its Title links to.
const RELATIONS = [
    {   // 1. country + date
        release: {
            id: '11111111-1111-1111-1111-111111111111',
            'release-events': [
                { date: '2005-12-20', area: area('a1', 'United States', 'US') },
            ],
        },
    },
    {   // 2. country, NO date
        release: {
            id: '22222222-2222-2222-2222-222222222222',
            'release-events': [
                { date: '', area: area('a2', 'Italy', 'IT') },
            ],
        },
    },
    {   // 3. date, NO country
        release: {
            id: '33333333-3333-3333-3333-333333333333',
            'release-events': [
                { date: '2008-06-25', area: null },
            ],
        },
    },
    {   // 4. two events on one row
        release: {
            id: '44444444-4444-4444-4444-444444444444',
            'release-events': [
                { date: '2025-10-17', area: area('a3', 'Europe', 'XE') },
                { date: '2025-10-17', area: area('a4', 'United Kingdom', 'GB') },
            ],
        },
    },
];

async function setup(page) {
    await page.route('**/ws/2/**', (route) => {
        const url = route.request().url();
        // Only the release-rels lookup carries data; anything else (the
        // Relationships column's own calls) answers empty so nothing hangs.
        const body = url.includes('inc=release-rels')
            ? { relations: RELATIONS }
            : { relations: [] };
        return route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(body),
        });
    });

    await loadUserscriptPage(page, {
        url: PLACE_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: {
            sa_enable_release_events_column: true,
            sa_enable_caa_pics: false,
            sa_enable_relationships_column: false,
            sa_enable_dropdown_flag_icons: true,
        },
    });

    await page.click('button[data-label="Show all Performances for Place (complete)"]');
    await page.waitForSelector('#mb-filter-container');
    // The column is populated by an async WS/2 call AFTER the render, so wait
    // for the content rather than for the render.
    await expect.poll(
        () => page.locator('td.mb-re-cell li.release-event').count(),
        { timeout: 15000, message: 'release-event <li>s are built' },
    ).toBeGreaterThan(0);
}

const labels = (sections) => sections.map((s) => s.label);
const itemLabels = (sections, label) =>
    (sections.find((s) => s.label === label)?.items || []).map((i) => i.label);

test('Release events: the 📊 dropdown offers its Country and Date sections', async ({ page }) => {
    await setup(page);
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Release events'));

    expect(labels(sections)).toEqual(expect.arrayContaining([
        'Release events - Country', 'Release events - Date',
    ]));

    // Country: one entry per distinct code, including both halves of the
    // two-event row. The country-less row contributes none.
    expect(itemLabels(sections, 'Release events - Country').sort()).toEqual([
        '» country: GB', '» country: IT', '» country: US', '» country: XE',
    ]);

    // Date: the country-less row DOES contribute its date, which is the half of
    // the alignment padding that is easy to lose.
    expect(itemLabels(sections, 'Release events - Date').sort()).toEqual([
        '» date: 2005-12-20', '» date: 2008-06-25', '» date: 2025-10-17',
    ]);
});

test('Release country: the 📊 dropdown offers its Country details sections', async ({ page }) => {
    await setup(page);
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Release country'));

    expect(labels(sections)).toEqual(expect.arrayContaining([
        'Country details - Name', 'Country details - Code',
    ]));
    expect(itemLabels(sections, 'Country details - Name').sort()).toEqual([
        '» country name: Europe', '» country name: Italy',
        '» country name: United Kingdom', '» country name: United States',
    ]);
    expect(itemLabels(sections, 'Country details - Code').sort()).toEqual([
        '» country code: GB', '» country code: IT',
        '» country code: US', '» country code: XE',
    ]);
});

test('the country-less event keeps its row aligned and gains no "-" placeholder', async ({ page }) => {
    await setup(page);

    // Row 3's event has a date and no country. Both derived columns must still
    // receive one <li> for it, or a multi-event cell's Release country and
    // Release date lists drift apart. And the value must stay the bare date:
    // MusicBrainz's own no-country span carries a visible "-", which would
    // change this column's extracted text — and every typed filter and 📊 entry
    // built from it — to "- 2008-06-25".
    const row = await page.evaluate(() => {
        const td = document.querySelector('td.mb-re-cell[data-mbid="33333333-3333-3333-3333-333333333333"]');
        const tr = td.closest('tr');
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const idx = (name) => ths.findIndex((th) => th.dataset.colName === name);
        const cellOf = (name) => tr.cells[idx(name)];
        const liCount = (name) => cellOf(name).querySelectorAll('ul > li').length;
        return {
            eventsText: td.textContent.trim(),
            noCountrySpans: td.querySelectorAll('span.release-country.no-country').length,
            countryLis: liCount('Release country'),
            dateLis: liCount('Release date'),
            dateText: cellOf('Release date').textContent.trim(),
        };
    });

    expect(row.noCountrySpans).toBe(1);
    expect(row.eventsText).toBe('2008-06-25');
    expect(row.eventsText).not.toContain('-  ');
    expect(row.countryLis).toBe(1);
    expect(row.dateLis).toBe(1);
    expect(row.dateText).toBe('2008-06-25');
});

test('the dateless event keeps its row aligned too', async ({ page }) => {
    await setup(page);

    // The MIRROR of the previous test, and a separate guard: row 2's event has
    // a country and NO date. `ColumnDataExtractor.splitCountryDate()` fills its
    // two outputs independently — one <li> per `.release-country`, one per
    // `.release-date` — so this row needs an empty `.release-date` for the same
    // reason the countryless row needs an empty `.release-country`. Asserted
    // separately because the countryless row cannot see it: mutation-testing the
    // date-side padding away leaves that test green.
    const row = await page.evaluate(() => {
        const td = document.querySelector('td.mb-re-cell[data-mbid="22222222-2222-2222-2222-222222222222"]');
        const tr = td.closest('tr');
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const idx = (name) => ths.findIndex((th) => th.dataset.colName === name);
        const cellOf = (name) => tr.cells[idx(name)];
        const liCount = (name) => cellOf(name).querySelectorAll('ul > li').length;
        return {
            eventsText: td.textContent.trim(),
            emptyDateSpans: td.querySelectorAll('span.release-date:empty').length,
            countryLis: liCount('Release country'),
            dateLis: liCount('Release date'),
            countryText: cellOf('Release country').textContent.trim(),
        };
    });

    expect(row.eventsText).toBe('IT');
    expect(row.emptyDateSpans).toBe(1);
    expect(row.countryLis).toBe(1);
    expect(row.dateLis).toBe(1);
    expect(row.countryText).toBe('Italy (IT)');
});

test('Release events: its dropdown entries carry flag icons', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th'))
            .find((t) => t.dataset.colName === 'Release events');
        th.querySelector('.mb-col-uniq-wrap').click();
    });
    await page.waitForSelector('#mb-col-uniq-dropdown');

    // `hasFlagIcons` is a column-NAME whitelist, and 'Release events' was
    // explicitly excluded from it — with a JSDoc note giving a real reason: the
    // column's flag class used to sit on the <li>, which `iconSel`'s
    // `span.flag` cannot match and which, being the walk ROOT, `querySelectorAll`
    // never returns either. Both halves had to change together; the name alone
    // would have decorated nothing, and the shape alone would never be consulted.
    const icons = await page.evaluate(() => {
        const drop = document.getElementById('mb-col-uniq-dropdown');
        return Array.from(drop.querySelectorAll('.mb-col-uniq-item'))
            .filter((item) => !item.querySelector('.mb-uniq-syn-label-text'))
            .map((item) => ({
                text: (item.textContent || '').replace(/\s+/g, ' ').trim(),
                flags: item.querySelectorAll('[class*="flag-"]').length,
            }))
            // WHOLE-CELL entries only. The `\u25a4`-marked ones are per-<li> item
            // values from `itemValueCounts`, and `flagIconMap` is keyed by the
            // whole-cell value — so item entries carry no flag segments, here
            // or on any other flag-bearing column. That is pre-existing and
            // unrelated; including them would assert a guarantee this change
            // never made.
            .filter((e) => !e.text.includes('\u25a4'))
            .filter((e) => /\b(US|IT|XE|GB)\b/.test(e.text));
    });

    expect(icons.length, 'the column has plain value entries').toBeGreaterThan(0);
    for (const e of icons) {
        expect(e.flags, `"${e.text}" carries a flag icon`).toBeGreaterThan(0);
    }
});
