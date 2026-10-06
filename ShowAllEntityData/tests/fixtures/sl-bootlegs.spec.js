'use strict';

// springsteenlyrics.com bootleg list ('sl-bootlegs'), opt-in via
// sa_enable_springsteenlyrics. Same card → table conversion as sl-collection
// (applySlCardsToTable), with the bootleg column set: the bootleg label, the
// site's own Date text plus an ISO "First date" so a date sort is
// chronological, Duration sorted as a duration, and the three per-card flags.
// Fixtures: scripts/build-sl-fixtures.py (debug/sl-bootlegs-initial.html split
// into two pages of 50 cards). See docs/claude/springsteenlyrics.md.

const { test, expect } = require('../support/test');
const { loadSlListPage, renderedSlRows, renderedSlHeaders } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');

// The converter's twelve columns, then what the standard MusicBrainz
// extractors append: dateParts on First date, splitLocationText on Location.
const HEADERS = ['Cover', 'Title', 'Label', 'Date', 'First date', 'Show', 'Location', 'Format', 'Duration', 'Lossy', 'Artwork', 'Info file',
    'DD', 'MM', 'YYYY', 'Day', 'Month', 'Place', 'Locality', 'Region', 'Country'];

/**
 * Reads one rendered row's cells as their `<li>` texts (a multi-row cell) or
 * plain text, by item number — `renderedSlRows()` flattens a list into one
 * string, which cannot show that two locations stayed apart.
 * @param {import('@playwright/test').Page} page
 * @param {string} item
 * @param {string[]} cols
 * @returns {Promise<Object<string, string|string[]>>}
 */
function rowCellsByItem(page, item, cols) {
    return page.evaluate(([item, cols]) => {
        const names = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        const tr = Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .find((r) => r.querySelector(`a[href*="item=${item}&"]`));
        if (!tr) return null;
        return Object.fromEntries(cols.map((c) => {
            const td = tr.cells[names.indexOf(c)];
            const lis = td ? td.querySelectorAll('li') : [];
            return [c, lis.length ? Array.from(lis, (li) => li.textContent) : (td ? td.textContent.trim() : null)];
        }));
    }, [item, cols]);
}

/**
 * Clicks a column header's ▲ (ascending) or ▼ (descending) sort icon.
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @param {string} glyph
 */
async function clickSort(page, colName, glyph) {
    const btn = page.locator(`table.tbl thead th[data-col-name="${colName}"] .sort-icon-btn`, { hasText: glyph }).first();
    await waitForSortSettled(page, () => btn.click());
}

/**
 * The spec's own duration parser, independent of the userscript's, for
 * checking the rendered order. The fixture holds every shape the site writes:
 * "31:09.55", "129:33.23" (minutes above 59), "45:12", "1:13:36" (hours) and
 * "–" for an unknown duration, which the script renders as MusicBrainz's own
 * "?:??" placeholder.
 * @param {string} text
 * @returns {?number} Hundredths of a second; `null` for "?:??".
 */
function durationKey(text) {
    if (text === '?:??') return null;
    const m = text.match(/^(?:(\d+):)?(\d+):(\d{2})(?:\.(\d{1,2}))?$/);
    if (!m) throw new Error(`unparseable duration in fixture: ${text}`);
    const hours = m[1] ? parseInt(m[1], 10) : 0;
    return ((hours * 60 + parseInt(m[2], 10)) * 60 + parseInt(m[3], 10)) * 100 + parseInt((m[4] || '0').padEnd(2, '0'), 10);
}

test.describe('sl-bootlegs (springsteenlyrics.com bootleg list)', () => {
    test.beforeEach(async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'bootlegs' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    });

    test('both pages become one table with the expected columns', async ({ page }) => {
        await expect(page.locator('h1.mb-sl-h1 > bdi')).toHaveText('Bootlegs — LIVE SHOWS: 1967-1974');
        expect(await renderedSlHeaders(page)).toEqual(HEADERS);
        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(100);
        expect(new Set(rows.map((r) => r._item)).size).toBe(100);
        await expect(page.locator('#mb-global-status-display')).toContainText('Loaded 2 pages (100 rows)');
        expect(await page.locator('div.blog-post').count()).toBe(0);
    });

    test('Title is the sticky column, not the first column (Cover)', async ({ page }) => {
        // Without `features.stickyColumn` applyStickyColumn() falls back to
        // column 0, the thumbnail. Geometry: sl-sticky-headers.spec.js.
        const sticky = await page.evaluate(() => {
            const table = document.querySelector('table.tbl');
            const names = Array.from(table.querySelectorAll('thead tr:first-child th'))
                .map((th) => th.dataset.colName || th.textContent.trim());
            const idx = (n) => names.indexOf(n);
            const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
            return {
                th: Array.from(table.querySelectorAll('thead tr:first-child th.mb-sticky-col'))
                    .map((th) => th.dataset.colName || th.textContent.trim()),
                titleCells: bodyRows.filter((tr) => tr.cells[idx('Title')].classList.contains('mb-sticky-col')).length,
                coverCells: bodyRows.filter((tr) => tr.cells[idx('Cover')].classList.contains('mb-sticky-col')).length,
                rows: bodyRows.length,
            };
        });
        expect(sticky.th).toEqual(['Title']);
        expect(sticky.titleCells).toBe(sticky.rows);
        expect(sticky.coverCells).toBe(0);
    });

    test('card fields and flags are parsed into their own columns', async ({ page }) => {
        const byItem = Object.fromEntries((await renderedSlRows(page)).map((r) => [r._item, r]));

        expect(byItem['4554']).toMatchObject({
            'Title': 'The Bruce Springsteen Story Vol. 2: The Castiles', 'Label': 'E. St. Records',
            'Date': '16 Sep 1967', 'First date': '1967-09-16', 'Location': 'The Left Foot, Freehold, NJ',
            'Format': 'FLAC', 'Duration': '31:09.55', 'Lossy': '', 'Artwork': 'yes', 'Info file': 'yes',
        });
        // A range keeps its own text; First date is where it starts.
        expect(byItem['4553']).toMatchObject({ 'Date': '16 Sep 1967 - 30 Sep 1967', 'First date': '1967-09-16' });
        // No label line on this card, and no artwork note.
        expect(byItem['2615']).toMatchObject({
            'Label': '', 'Date': '20 Sep 1969', 'First date': '1969-09-20',
            'Duration': '61:58.22', 'Lossy': '', 'Artwork': '', 'Info file': 'yes',
        });
        // The one card marked "Lossy".
        expect(byItem['2628']).toMatchObject({ 'Label': 'Palace Records', 'Duration': '129:33.23', 'Lossy': 'yes' });
        // Page 2 (fetched): a comma list of dates, and a day range "04-27 Feb".
        expect(byItem['6461']).toMatchObject({
            'Label': 'Vintage Masters', 'Date': '18 Jan 1971, 23 Jan 1971, 13 Nov 1971',
            'First date': '1971-01-18', 'Duration': '203:03.72',
        });
        expect(byItem['8113']).toMatchObject({ 'Title': '[no title]', 'Label': 'hrubesh transfer', 'First date': '1972-02-04' });
        // The site writes "–" for an unknown duration; rendered as
        // MusicBrainz's "?:??" so the ':'-aligned column does not show ":–".
        expect(byItem['2630']).toMatchObject({ 'Title': 'Say Goodbye To Steel Mill', 'Duration': '?:??' });
    });

    test('Duration sorts as a duration, First date chronologically', async ({ page }) => {
        expect(await page.evaluate(() => window.__saTest.sortColumnKind('Duration'))).toBe('duration');

        // Both directions: known durations in time order (a text sort puts the
        // 73-minute "1:13:36" before "31:09.55"), and the unknown "–" LAST
        // either way rather than first in one of them.
        for (const [glyph, cmp] of [['▼', (a, b) => b - a], ['▲', (a, b) => a - b]]) {
            await clickSort(page, 'Duration', glyph);
            const keys = (await renderedSlRows(page)).map((r) => durationKey(r['Duration']));
            const known = keys.filter((k) => k !== null);
            const unknown = keys.length - known.length;
            expect(unknown, 'the fixture has unknown durations').toBeGreaterThan(0);
            expect(known.some((k) => k >= 3600 * 100), 'the fixture has an H:MM:SS duration').toBe(true);
            expect(keys.slice(known.length)).toEqual(Array(unknown).fill(null));
            expect(known).toEqual([...known].sort(cmp));
        }

        await clickSort(page, 'First date', '▲');
        const dates = (await renderedSlRows(page)).map((r) => r['First date']);
        expect(dates.every((d) => /^\d{4}(-\d{2}){0,2}$/.test(d))).toBe(true);
        expect(dates).toEqual([...dates].sort());
        expect(dates[0]).toBe('1967-09-16');
    });

    test('First date is split into DD / MM / YYYY / Day / Month, the show note into Show', async ({ page }) => {
        const rows = await renderedSlRows(page);
        const byItem = Object.fromEntries(rows.map((r) => [r._item, r]));

        expect(byItem['4554']).toMatchObject({
            'Show': '', 'DD': '16', 'MM': '9', 'YYYY': '1967', 'Day': 'Saturday', 'Month': 'September',
        });
        expect(byItem['6527']).toMatchObject({
            'Date': '27 Nov 1970 (early show)', 'First date': '1970-11-27', 'Show': 'early show',
            'DD': '27', 'MM': '11', 'YYYY': '1970', 'Day': 'Friday', 'Month': 'November',
        });

        // On every row the parts agree with First date, whatever its precision,
        // and the weekday is there exactly when the date is complete.
        const bad = rows.filter((r) => {
            const [y, m, d] = (r['First date'] || '').split('-');
            return (r.YYYY || '') !== (y || '') ||
                (r.MM || '') !== (m ? String(Number(m)) : '') ||
                (r.DD || '') !== (d ? String(Number(d)) : '') ||
                !!r.Day !== !!d;
        });
        expect(bad.map((r) => `${r._item} ${r['First date']}`)).toEqual([]);
    });

    test('Location is split into Place / Locality / Region / Country', async ({ page }) => {
        const cols = ['Location', 'Place', 'Locality', 'Region', 'Country'];
        expect(await rowCellsByItem(page, '4554', cols)).toEqual({
            Location: 'The Left Foot, Freehold, NJ',
            Place: 'The Left Foot', Locality: 'Freehold', Region: 'NJ', Country: 'United States',
        });
        // Two shows' locations stay apart: one <li> per location, aligned.
        expect(await rowCellsByItem(page, '6867', cols)).toEqual({
            Location: 'The Matrix, San Francisco, CA - Newark State College, Union, NJ',
            Place: ['The Matrix', 'Newark State College'], Locality: ['San Francisco', 'Union'],
            Region: ['CA', 'NJ'], Country: ['United States', 'United States'],
        });

        // Every single-location row's parts, put back together, are its Location.
        const rows = await renderedSlRows(page);
        const bad = rows.filter((r) => !r.Location.includes(' - ') && r.Location !== '–' && r.Location !== '' &&
            [r.Place, r.Locality, r.Region, r.Country === 'United States' || r.Country === 'Canada' ? '' : r.Country]
                .filter(Boolean).join(', ') !== r.Location);
        expect(bad.map((r) => `${r._item} ${r.Location}`)).toEqual([]);
    });

    test('a Country column filter keeps only that country', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.indexOf('Country'));
        await input.click();
        await input.pressSequentially('United States');
        await expect.poll(async () => {
            const rows = await renderedSlRows(page);
            return rows.length > 0 && rows.every((r) => r.Country.includes('United States'));
        }, { timeout: 15000, message: 'only US shows remain' }).toBe(true);
    });

    test('a column filter narrows the rows', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.indexOf('Location'));
        await input.click();
        await input.pressSequentially('Richmond');
        await expect.poll(async () => {
            const rows = await renderedSlRows(page);
            return rows.length > 0 && rows.length < 100 && rows.every((r) => r['Location'].includes('Richmond'));
        }, { timeout: 15000, message: 'only Richmond shows remain' }).toBe(true);
    });
});

test.describe('sl-bootlegs parsers', () => {
    test.beforeEach(async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs' });
    });

    test('_slFirstIsoDate handles every date shape the site writes', async ({ page }) => {
        const out = await page.evaluate(() => {
            const f = window.__saTest.slFirstIsoDate;
            return {
                plain: f('16 Sep 1967'),
                dayRange: f('16-17 Sep 1967'),
                list: f('16 Sep 1967, 30 Sep 1967'),
                range: f('16 Sep 1967 - 30 Sep 1967'),
                crossMonth: f('30 Sep - 1 Oct 1967'),
                monthOnly: f('Sep 1967'),
                trailingNote: f('20 Sep 1969 (early show)'),
                longMonth: f('3 September 1975'),
                yearOnly: f('Summer 1975'),
                nothing: f(''),
                notAMonth: f('Marseille'),
            };
        });
        expect(out).toEqual({
            plain: '1967-09-16', dayRange: '1967-09-16', list: '1967-09-16', range: '1967-09-16',
            crossMonth: '1967-09-30', monthOnly: '1967-09', trailingNote: '1969-09-20',
            longMonth: '1975-09-03', yearOnly: '1975', nothing: '', notAMonth: '',
        });
    });

    test('_slShowQualifier reads every show note the site writes', async ({ page }) => {
        const out = await page.evaluate(() => {
            const f = window.__saTest.slShowQualifier;
            return [
                f('27 Nov 1970 (early show)'),
                f('30 Jul 2002 (Today Show soundcheck)'),
                f('15 Aug 1975 (early show), 17 Oct 1975 (early show)'),
                f('13 Aug 1975 (late show), 14 Aug 1975 (early show)'),
                f('Live 18 Oct 1975 (early show) version'),
                f('16 Sep 1967'),
                f(''),
            ];
        });
        expect(out).toEqual(['early show', 'Today Show soundcheck', 'early show', 'late show, early show', 'early show', '', '']);
    });

    test('splitLocationText reads every location shape the site writes', async ({ page }) => {
        const out = await page.evaluate(() => {
            const f = window.__saTest.splitLocationText;
            return {
                usVenue: f('Paramount Theatre, Asbury Park, NJ'),
                abroad: f('Bellville Velodrome, Cape Town, South Africa'),
                cityState: f('Holmdel, NJ'),
                stateWritten: f('Holmdel, New Jersey'),
                cityCountry: f('Montreal, Canada'),
                province: f('Northlands Coliseum, Edmonton, Alberta'),
                provinceAndCountry: f('Maple Leaf Gardens, Toronto, ON, Canada'),
                dc: f('Capital Centre, Landover, MD'),
                ampersand: f('Thomas & Mack Center, Las Vegas, NV'),
                commaInVenue: f('Studio A, The Power Station, New York City, NY'),
                // springsteenlyrics.com's CD and vinyl bootlegs (brucelegs.php).
                usaWritten: f('The Spectrum, Philadelphia, Pennsylvania, USA'),
                showNote: f('Brendan Byrne Arena, East Rutherford, New Jersey, USA (Early Show)'),
                cityStateUsa: f('New York, New York, USA'),
                description: f('Various Location'),
                descriptionSlash: f('Studio / Live'),
                unknown: f('–'),
                empty: f(''),
                three: f("D'Scene, South Amboy, NJ - The Upstage, Asbury Park, NJ - Palalottomatica, Rome, Italy"),
            };
        });
        expect(out).toEqual({
            usVenue: ['Paramount Theatre', 'Asbury Park', 'NJ', 'United States'],
            abroad: ['Bellville Velodrome', 'Cape Town', '', 'South Africa'],
            cityState: ['', 'Holmdel', 'NJ', 'United States'],
            stateWritten: ['', 'Holmdel', 'New Jersey', 'United States'],
            cityCountry: ['', 'Montreal', '', 'Canada'],
            province: ['Northlands Coliseum', 'Edmonton', 'Alberta', 'Canada'],
            provinceAndCountry: ['Maple Leaf Gardens', 'Toronto', 'ON', 'Canada'],
            dc: ['Capital Centre', 'Landover', 'MD', 'United States'],
            ampersand: ['Thomas & Mack Center', 'Las Vegas', 'NV', 'United States'],
            commaInVenue: ['Studio A, The Power Station', 'New York City', 'NY', 'United States'],
            usaWritten: ['The Spectrum', 'Philadelphia', 'Pennsylvania', 'United States'],
            showNote: ['Brendan Byrne Arena', 'East Rutherford', 'New Jersey', 'United States'],
            cityStateUsa: ['', 'New York', 'New York', 'United States'],
            // One part is a description, never a country.
            description: ['Various Location', '', '', ''],
            descriptionSlash: ['Studio / Live', '', '', ''],
            unknown: ['', '', '', ''],
            empty: ['', '', '', ''],
            three: [
                ["D'Scene", 'The Upstage', 'Palalottomatica'],
                ['South Amboy', 'Asbury Park', 'Rome'],
                // A column with something in any location keeps an <li> per
                // location, empty where that one has nothing.
                ['NJ', 'NJ', ''],
                ['United States', 'United States', 'Italy'],
            ],
        });
    });

    test('_slSplitTrailingParen takes the LAST parenthesised group', async ({ page }) => {
        const out = await page.evaluate(() => {
            const f = window.__saTest.slSplitTrailingParen;
            return {
                label: f('CBS (SBP 234758)'),
                twoGroups: f('Columbia (Holland) (CBS 32432)'),
                dash: f('– (1973)'),
                none: f('Columbia'),
                empty: f(''),
            };
        });
        expect(out).toEqual({
            label: ['CBS', 'SBP 234758'],
            twoGroups: ['Columbia (Holland)', 'CBS 32432'],
            dash: ['–', '1973'],
            none: ['Columbia', ''],
            empty: ['', ''],
        });
    });
});
