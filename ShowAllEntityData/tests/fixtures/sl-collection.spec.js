'use strict';

// springsteenlyrics.com collection list ('sl-collection'), opt-in via
// sa_enable_springsteenlyrics. The page renders `div.blog-post` cards, not a
// table; applySlCardsToTable() converts them on the live page (page 1) and on
// every fetched page (page 2 here), and the row values below come from parsing
// each card's `<em>Label:</em> value` lines. Fixtures:
// scripts/build-sl-fixtures.py (debug/sl-collections-initial.html split into
// two pages of 50 cards). See docs/claude/springsteenlyrics.md.

const { test, expect } = require('../support/test');
const { loadSlListPage, renderedSlRows, renderedSlHeaders } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

const HEADERS = ['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Format', 'Country', 'Release date', 'Original year', 'Copies'];

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

test.describe('sl-collection (springsteenlyrics.com collection list)', () => {
    test.beforeEach(async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'collection' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
    });

    test('both pages become one table with the expected columns', async ({ page }) => {
        // The toolbar needs an <h1>, which these pages do not have; the
        // script injects one reading "<section> — <list heading>".
        await expect(page.locator('h1.mb-sl-h1 > bdi')).toHaveText('Collection — OFFICIAL ALBUMS');
        await expect(page.locator('h1.mb-sl-h1 button[data-label="Show all items of this collection list"]')).toHaveCount(1);

        expect(await renderedSlHeaders(page)).toEqual(HEADERS);
        const rows = await renderedSlRows(page);
        // 50 cards on the live page 1 + 50 on fetched page 2. Missing page-2
        // rows would mean the fetched document was never converted.
        expect(rows).toHaveLength(100);
        expect(new Set(rows.map((r) => r._item)).size).toBe(100);
        await expect(page.locator('#mb-global-status-display')).toContainText('Loaded 2 pages (100 rows)');

        // No card is left behind, and the list heading now anchors the
        // count/filter bar as an <h2>.
        expect(await page.locator('div.blog-post').count()).toBe(0);
        await expect(page.locator('.project-detail h2.heading')).toHaveCount(1);
        await expect(page.locator('.project-detail h3.heading')).toHaveCount(0);
    });

    test('card fields are parsed into their own columns', async ({ page }) => {
        const byItem = Object.fromEntries((await renderedSlRows(page)).map((r) => [r._item, r]));

        // Page 1, first card: "CBS (SBP 234758)", "– (1973)", no copies line.
        expect(byItem['8981']).toMatchObject({
            'Title': 'Greetings From Asbury Park, N.J.', 'Version': 'Version 1',
            'Label': 'CBS', 'Cat. no.': 'SBP 234758', 'Format': 'LP', 'Country': 'Australia',
            'Release date': '–', 'Original year': '1973', 'Copies': '1',
        });
        // A card with no version line at all, and a real release year.
        expect(byItem['9748']).toMatchObject({
            'Version': '', 'Label': 'CBS / Direkt Records', 'Cat. no.': '32210 / DT 0017-1311',
            'Country': 'Czechoslovakia', 'Release date': '1991', 'Original year': '1973', 'Copies': '1',
        });
        // "I have 3 copies" on page 1, and on the FETCHED page 2.
        expect(byItem['9770']).toMatchObject({ 'Label': 'CBS / Sony', 'Cat. no.': 'SOPO-124', 'Country': 'Japan', 'Copies': '3' });
        expect(byItem['4909']).toMatchObject({
            'Version': 'Version 6', 'Label': 'CBS', 'Cat. no.': '32363',
            'Country': 'The Netherlands', 'Release date': '–', 'Copies': '3',
        });
        expect(byItem['9973']).toMatchObject({ 'Cat. no.': '32432 / JC 32432 / C 32432 / PC 32432', 'Copies': '2' });
    });

    test('Title and Cover keep the item link, and the thumbnail loads lazily', async ({ page }) => {
        const cell = await page.evaluate(() => {
            const tr = Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .find((r) => r.querySelector('a[href*="item=4909"]'));
            const img = tr.cells[0].querySelector('img');
            return {
                titleHref: tr.cells[1].querySelector('a').getAttribute('href'),
                coverHref: tr.cells[0].querySelector('a').getAttribute('href'),
                src: img.getAttribute('src'),
                loading: img.getAttribute('loading'),
            };
        });
        expect(cell.titleHref).toBe('collection.php?item=4909&category=album&f_format=12i');
        expect(cell.coverHref).toBe(cell.titleHref);
        expect(cell.src).toMatch(/^collection\/[^/]+\/4909\.jpg$/);
        expect(cell.loading).toBe('lazy');
    });

    test('Cat. no. sorts as text, Copies and Original year as numbers', async ({ page }) => {
        // The site calls the column "Cat #"; a "#" in a column name makes
        // _sortColumnKind()'s legacy heuristic sort it numerically, which
        // orders catalogue numbers by their digits alone.
        const kinds = await page.evaluate(() => ({
            catNo: window.__saTest.sortColumnKind('Cat. no.'),
            copies: window.__saTest.sortColumnKind('Copies'),
            year: window.__saTest.sortColumnKind('Original year'),
        }));
        expect(kinds).toEqual({ catNo: 'text', copies: 'numeric', year: 'numeric' });

        await clickSort(page, 'Cat. no.', '▲');
        const sorted = (await renderedSlRows(page)).map((r) => r['Cat. no.']);
        const textOrder = [...sorted].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        const digitsOf = (s) => parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
        const numericOrder = [...sorted].sort((a, b) => digitsOf(a) - digitsOf(b));
        // Precondition: the data really tells the two orders apart.
        expect(numericOrder).not.toEqual(textOrder);
        expect(sorted).toEqual(textOrder);

        await clickSort(page, 'Copies', '▼');
        const copies = (await renderedSlRows(page)).map((r) => Number(r['Copies']));
        expect(copies.slice(0, 2)).toEqual([3, 3]);
        expect(copies).toEqual([...copies].sort((a, b) => b - a));
    });

    test('a column filter narrows the rows', async ({ page }) => {
        const { columnFilterInput } = require('../support/filterSortAssertions');
        const idx = HEADERS.indexOf('Country');
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially('Japan');
        await expect.poll(async () => [...new Set((await renderedSlRows(page)).map((r) => r['Country']))], {
            timeout: 15000, message: 'only the Japanese pressings remain',
        }).toEqual(['Japan']);
        const rows = await renderedSlRows(page);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThan(100);
    });

});

test('sl-collection: nothing is requested from MusicBrainz or the Cover Art Archive', async ({ page }) => {
    // Every MusicBrainz-only feature (WS/2 lookups, Relationships, CAA/EAA,
    // Picard) is opt-in per page definition or keyed on MBID links, so none
    // may fire here. CAA and Relationships are seeded back ON, because the
    // fixture profile forces both off and would hide exactly this.
    const { requests, spec } = await loadSlListPage(page, {
        kind: 'collection',
        settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: true },
    });
    await page.click(`button[data-label="${spec.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    expect(requests.some((u) => /collection\.php\?.*page=2/.test(u))).toBe(true);
    expect(requests.filter((u) => /\/ws\/2\/|musicbrainz\.(org|eu)|coverartarchive\.org|eventartarchive\.org/.test(u))).toEqual([]);
});
