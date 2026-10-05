'use strict';

// springsteenlyrics.com collection pages that render the "Filter by original
// year of release" block: the entry page `collection.php` ('sl-collection-intro',
// "Latest additions", paginated with `pg=`) and every category but "Official
// Albums" (here: sampler, 'sl-collection', one widget-less page of 99).
//
// That block ends in a stray `</div>`, so the parser closes `.project-detail`
// BEFORE the list heading and the cards. The card and heading lookups used to
// be scoped to `.project-detail` and found nothing on these pages: the button
// pressed into a no-op and the <h1> read just "Collection". The first test of
// each block asserts the fixture really has that shape, so the rest cannot
// pass on a page that never had the problem. See _slFindCards() and
// docs/claude/springsteenlyrics.md. Fixtures: scripts/build-sl-fixtures.py.

const { test, expect } = require('../support/test');
const { loadSlListPage, renderedSlRows, renderedSlHeaders } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');

const HEADERS = ['Cover', 'Title', 'Version', 'Label', 'Cat. no.', 'Format', 'Country', 'Release date', 'Original year', 'Copies'];

/**
 * True when no item card sits inside `.project-detail` although the page has
 * cards — the shape the stray `</div>` produces.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
function cardsOutsideProjectDetail(page) {
    return page.evaluate(() => document.querySelectorAll('div.blog-post').length > 0
        && document.querySelectorAll('.project-detail div.blog-post').length === 0);
}

test.describe('sl-collection-intro (springsteenlyrics.com collection entry page)', () => {
    test('the fixture has the cards outside .project-detail', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection-intro' });
        expect(await cardsOutsideProjectDetail(page)).toBe(true);
        // The heading is found from the cards, not from .project-detail.
        await expect(page.locator('h1.mb-sl-h1 > bdi')).toHaveText('Collection — Latest additions');
    });

    test('both pg= pages become one table', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'collection-intro' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect(await renderedSlHeaders(page)).toEqual(HEADERS);
        const rows = await renderedSlRows(page);
        // 50 live + 50 fetched with `pg=2`. With `page=2` the site (and the
        // fixture route) answers page 1 again: 100 rows but only 50 items.
        expect(rows).toHaveLength(100);
        expect(new Set(rows.map((r) => r._item)).size).toBe(100);
        await expect(page.locator('#mb-global-status-display')).toContainText('Loaded 2 pages (100 rows)');

        // A card from the FETCHED page.
        const byItem = Object.fromEntries(rows.map((r) => [r._item, r]));
        expect(byItem['10215']).toMatchObject({
            'Title': 'A Very Special Christmas', 'Label': 'A&M Records', 'Cat. no.': '393 911-4',
            'Format': 'Cassette Tape', 'Country': 'Italy', 'Release date': '1987', 'Original year': '1987',
        });

        expect(await page.locator('div.blog-post').count()).toBe(0);
        await expect(page.locator('h2.mb-sl-list-heading')).toHaveCount(1);
    });

    test('opened on ?pg=2, page 1 is fetched rather than taken from the live page', async ({ page }) => {
        // The loop reuses the live document for "the current page". Read
        // from `page=`, `?pg=2` would count as page 1: the live page-2 cards
        // would stand in for page 1, and page 2 would be fetched again.
        const { spec } = await loadSlListPage(page, { kind: 'collection-intro', startPage: 2 });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(100);
        expect(new Set(rows.map((r) => r._item)).size).toBe(100);
    });
});

test.describe('sl-collection: a page with no cards says so', () => {
    // The converter used to return silently when it found no cards, so the
    // button rendered "0 rows" with nothing in the console to say why — which
    // is how "only Official Albums works" went unnoticed.
    const NO_CARDS = 'applySlCardsToTable: no item cards found on the live page';

    /**
     * Collects the text of every console message the page logs. `Lib.warn()`
     * is never gated by the debug-logging setting, but it writes through a
     * styled `console.log`, not `console.warn` — so the type is not filtered.
     * @param {import('@playwright/test').Page} page
     * @returns {string[]}
     */
    function collectWarnings(page) {
        const warnings = [];
        page.on('console', (m) => warnings.push(m.text()));
        return warnings;
    }

    test('no cards on the live page: a console warning', async ({ page }) => {
        const warnings = collectWarnings(page);
        const { spec } = await loadSlListPage(page, { kind: 'sampler' });
        await page.evaluate(() => document.querySelectorAll('div.blog-post').forEach((c) => c.remove()));
        await page.click(`button[data-label="${spec.button}"]`);
        // No render to wait for: with no cards there is no table. The
        // warning is logged at click time, before the fetch starts.
        await expect.poll(() => warnings.some((w) => w.includes(NO_CARDS)), { timeout: 15000 }).toBe(true);
    });

    test('a normal conversion stays quiet', async ({ page }) => {
        const warnings = collectWarnings(page);
        const { spec } = await loadSlListPage(page, { kind: 'sampler' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await renderedSlRows(page)).toHaveLength(99);
        expect(warnings.filter((w) => w.includes('applySlCardsToTable'))).toEqual([]);
    });
});

test.describe('sl-collection on a category with the year filter (sampler)', () => {
    test('the fixture has the cards outside .project-detail', async ({ page }) => {
        await loadSlListPage(page, { kind: 'sampler' });
        expect(await cardsOutsideProjectDetail(page)).toBe(true);
        await expect(page.locator('h1.mb-sl-h1 > bdi')).toHaveText('Collection — SAMPLERS AND UNIQUE RELEASES');
    });

    test('the single widget-less page becomes a table of all 99 items', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'sampler' });
        await page.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect(await renderedSlHeaders(page)).toEqual(HEADERS);
        const rows = await renderedSlRows(page);
        expect(rows).toHaveLength(99);
        expect(new Set(rows.map((r) => r._item)).size).toBe(99);
        const byItem = Object.fromEntries(rows.map((r) => [r._item, r]));
        expect(byItem['8990']).toMatchObject({
            'Title': 'Bruce Springsteen', 'Label': 'World Super Hits', 'Cat. no.': 'SH-1747',
            'Format': 'CD', 'Country': 'Japan', 'Release date': '–', 'Original year': '–',
        });

        // No card is left behind, and the list heading became the <h2> that
        // anchors the count/filter bar.
        expect(await page.locator('div.blog-post').count()).toBe(0);
        await expect(page.locator('h2.mb-sl-list-heading')).toHaveText(/^.?SAMPLERS AND UNIQUE RELEASES/);
        await expect(page.locator('h2.mb-sl-list-heading #mb-filter-container')).toHaveCount(1);
    });
});
