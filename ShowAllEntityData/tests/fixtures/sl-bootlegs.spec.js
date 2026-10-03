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

const HEADERS = ['Cover', 'Title', 'Label', 'Date', 'First date', 'Location', 'Format', 'Duration', 'Lossy', 'Artwork', 'Info file'];

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
