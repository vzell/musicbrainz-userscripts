'use strict';

// springsteenlyrics.com CD and vinyl bootlegs ('sl-brucelegs',
// brucelegs.php?cmd=list), opt-in via sa_enable_springsteenlyrics. The same
// div.blog-post cards as the bootleg lists, converted by applySlCardsToTable()
// with the 'brucelegs' column set, then the standard MusicBrainz splits:
// dateParts on First date, splitLocationText on Location.
// Fixtures: scripts/build-sl-fixtures.py (debug/sl-brucelegs.html split into
// two pages of 50 cards). See docs/claude/springsteenlyrics.md.

const { test, expect } = require('../support/test');
const { loadSlListPage, renderedSlRows, renderedSlHeaders } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');

const HEADERS = ['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Date', 'First date', 'Show', 'Location', 'Format',
    'DD', 'MM', 'YYYY', 'Day', 'Month', 'Place', 'Locality', 'Region', 'Country'];

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

test.describe('sl-brucelegs (springsteenlyrics.com CD and vinyl bootlegs)', () => {
    test.beforeEach(async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'brucelegs' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    });

    test('both pages become one table with the expected columns', async ({ page }) => {
        expect(await renderedSlHeaders(page)).toEqual(HEADERS);
        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(100);
        expect(new Set(rows.map((r) => r._item)).size).toBe(100);
        await expect(page.locator('#mb-global-status-display')).toContainText('Loaded 2 pages (100 rows)');
        expect(await page.locator('div.blog-post').count()).toBe(0);
        // Title, not the thumbnail, is the sticky column.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th.mb-sticky-col'))
            .map((th) => th.dataset.colName || th.textContent.trim()))).toEqual(['Title']);
    });

    test('card fields land in their own columns', async ({ page }) => {
        const byItem = Object.fromEntries((await renderedSlRows(page)).map((r) => [r._item, r]));

        expect(byItem['41']).toMatchObject({
            'Title': 'A Journey Thru The USA Part 1', 'Version': 'Limited Edition #200 copies numbered - Picture Disc',
            'Label': 'Rock Records', 'Cat. no.': '–', 'Date': '18 Sep 1984', 'First date': '1984-09-18', 'Show': '',
            'Location': 'The Spectrum, Philadelphia, Pennsylvania, USA', 'Format': 'LP',
        });
        // No sub-title line on this card; Label is a link on the site.
        expect(byItem['281']).toMatchObject({
            'Title': '1995 Radio Hour The Tom Joad Sessions', 'Version': '', 'Label': 'Good Ship Funke',
            'Cat. no.': 'GSG020', 'Date': '1995', 'First date': '1995', 'Location': 'Various Locations', 'Format': 'CD',
        });
        // Page 2 (fetched): a "Mon YYYY / Mon YYYY" span starts at its first month.
        expect(byItem['290']).toMatchObject({ 'Date': 'Jun 1977 / Apr 1978', 'First date': '1977-06', 'Cat. no.': 'BSCD81278' });
        // The site's own "1972 / 1973" span starts at its first year.
        expect(byItem['257']).toMatchObject({ 'Date': '1972 / 1973', 'First date': '1972', 'Label': 'Pony Express Records, Inc.' });
    });

    test('First date is split into DD / MM / YYYY / Day / Month at its own precision', async ({ page }) => {
        const byItem = Object.fromEntries((await renderedSlRows(page)).map((r) => [r._item, r]));
        const parts = (r) => ({ DD: r.DD, MM: r.MM, YYYY: r.YYYY, Day: r.Day, Month: r.Month });

        expect(parts(byItem['41'])).toEqual({ DD: '18', MM: '9', YYYY: '1984', Day: 'Tuesday', Month: 'September' });
        expect(parts(byItem['124'])).toEqual({ DD: '15', MM: '12', YYYY: '1978', Day: 'Friday', Month: 'December' });
        expect(parts(byItem['290'])).toEqual({ DD: '', MM: '6', YYYY: '1977', Day: '', Month: 'June' });
        expect(parts(byItem['281'])).toEqual({ DD: '', MM: '', YYYY: '1995', Day: '', Month: '' });
    });

    test('Location is split; a description stays whole in Place, "USA" reads United States', async ({ page }) => {
        const byItem = Object.fromEntries((await renderedSlRows(page)).map((r) => [r._item, r]));
        const loc = (r) => ({ Place: r.Place, Locality: r.Locality, Region: r.Region, Country: r.Country });

        expect(loc(byItem['41'])).toEqual({ Place: 'The Spectrum', Locality: 'Philadelphia', Region: 'Pennsylvania', Country: 'United States' });
        expect(loc(byItem['257'])).toEqual({ Place: 'Media And Blauvelt Studios', Locality: 'Blauvelt', Region: 'NY', Country: 'United States' });
        expect(loc(byItem['290'])).toEqual({
            Place: 'Atlantic Studios / The Record Plant', Locality: 'New York', Region: 'New York', Country: 'United States',
        });
        expect(loc(byItem['281'])).toEqual({ Place: 'Various Locations', Locality: '', Region: '', Country: '' });

        // Nothing that is not a country reaches Country, and no "USA" is left.
        const countries = [...new Set((await renderedSlRows(page)).map((r) => r.Country))].sort();
        expect(countries.filter((c) => /various|studio|location|live|^usa$/i.test(c))).toEqual([]);
    });

    test('YYYY sorts numerically and a Country filter keeps one country', async ({ page }) => {
        await clickSort(page, 'YYYY', '▲');
        const years = (await renderedSlRows(page)).map((r) => r.YYYY).filter(Boolean).map(Number);
        expect(years.length).toBeGreaterThan(50);
        expect(years).toEqual([...years].sort((a, b) => a - b));

        const input = columnFilterInput(page, HEADERS.indexOf('Country'));
        await input.click();
        await input.pressSequentially('Argentina');
        await expect.poll(async () => {
            const rows = await renderedSlRows(page);
            return rows.length > 0 && rows.length < 100 && rows.every((r) => r.Country === 'Argentina');
        }, { timeout: 15000, message: 'only Argentinian shows remain' }).toBe(true);
    });
});
