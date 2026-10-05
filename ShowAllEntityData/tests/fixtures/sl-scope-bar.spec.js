'use strict';

// springsteenlyrics.com: the compact category/filter bar (sa_sl_compact_nav).
//
// What is promised:
//   - OFF (the default) changes nothing: no bar, every wall of links shown.
//   - ON, every wall of category/filter links becomes one pull-down whose
//     entries are exactly that wall's links (read from the page, so a
//     category's own set of formats/countries is what its menu offers), the
//     walls stay in the DOM but are hidden, and the pinned area above the
//     list shrinks.
//   - A choice KEEPS the other filters (the site's own links each carry one
//     filter only; the server combines them, probed live 2026-10-05), drops
//     the page parameter, and a category change drops the album filter.
//   - Each active filter is a chip whose × removes only that filter.
//   - The year slider becomes a two-picker range whose Apply link follows
//     the pickers.
//   - The menus are keyboard- and search-usable and close on Escape/outside.
//
// Every assertion on a target is an assertion on an `href`: the choices are
// plain links (so initNavigationGuard() covers them), and one test follows a
// link end to end to show the href is what navigation uses.

const { test, expect } = require('../support/test');
const { loadSlListPage } = require('../support/slFixture');

const ON = { sa_sl_compact_nav: true };

/**
 * The bar's buttons as `{ facet, key, value, set }`, in order.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{facet: string, key: string, value: string, set: boolean}>>}
 */
function barButtons(page) {
    return page.$$eval('.mb-sl-scope > .mb-sl-scope-btn', (btns) => btns.map((b) => ({
        facet: b.dataset.mbSlFacet,
        key: b.querySelector('.mb-sl-scope-k').textContent,
        value: b.querySelector('.mb-sl-scope-v').textContent,
        set: b.classList.contains('mb-sl-set'),
    })));
}

/**
 * Opens the pull-down of one facet and returns its entries.
 * @param {import('@playwright/test').Page} page
 * @param {string} facet  The button's `data-mb-sl-facet`, e.g. 'f_country'.
 * @returns {Promise<Array<{text: string, href: string, cur: boolean}>>}
 */
async function openMenu(page, facet) {
    await page.click(`.mb-sl-scope-btn[data-mb-sl-facet="${facet}"]`);
    await expect(page.locator('.mb-sl-scope-pop')).toBeVisible();
    return page.$$eval('.mb-sl-scope-pop .mb-sl-scope-opt', (as) => as.map((a) => ({
        text: a.textContent.replace(/\s+/g, ' ').trim(),
        href: a.href,
        cur: a.classList.contains('mb-sl-cur'),
    })));
}

/**
 * The link texts of the hidden wall that sets `param`.
 * @param {import('@playwright/test').Page} page
 * @param {string} param
 * @returns {Promise<string[]>}
 */
function wallTexts(page, param) {
    return page.$$eval(`.element-buttons a[href*="${param}="]`,
        (as) => as.map((a) => a.textContent.replace(/\s+/g, ' ').trim()));
}

/**
 * The query of an absolute URL as a plain object.
 * @param {string} href
 * @returns {Object<string, string>}
 */
const query = (href) => Object.fromEntries(new URL(href).searchParams);

test.describe('sl compact category/filter bar', () => {
    test('off by default: no bar, every wall shown', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection' });
        await expect(page.locator('h1.mb-sl-h1')).toBeVisible();
        await expect(page.locator('.mb-sl-scope')).toHaveCount(0);
        await expect(page.locator('.mb-sl-nav-hidden')).toHaveCount(0);
        const shown = await page.$$eval('.project-detail > .element-buttons',
            (bs) => bs.filter((b) => b.getClientRects().length > 0).length);
        expect(shown).toBeGreaterThanOrEqual(4);
    });

    test('Official Albums: one pull-down per wall, the walls hidden but kept', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection', settingsOverride: ON });
        expect(await barButtons(page)).toEqual([
            { facet: 'category', key: 'Category:', value: 'Official Albums', set: false },
            { facet: 'f_format', key: 'Format:', value: '12" vinyl', set: true },
            { facet: 'f_country', key: 'Country:', value: 'Any', set: false },
            { facet: 'f_date_main', key: 'Album:', value: 'Any', set: false },
            { facet: 'f_multi+f_nbcopies', key: 'Copies:', value: 'Any', set: false },
        ]);
        // Hidden, not removed: turning the setting off must bring them back.
        const walls = await page.$$eval('.element-buttons.mb-sl-nav-hidden',
            (bs) => bs.map((b) => b.getClientRects().length));
        expect(walls).toEqual([0, 0, 0, 0, 0]);

        // The Country menu offers exactly this page's country links, after "Any".
        const countries = await wallTexts(page, 'f_country');
        expect(countries.length, 'premise: the page has a country wall').toBeGreaterThan(5);
        const entries = await openMenu(page, 'f_country');
        expect(entries.map((e) => e.text)).toEqual(['Any', ...countries]);
        expect(entries[0].cur, '"Any" is current: no country chosen').toBe(true);
    });

    test('the pinned area above the list shrinks', async ({ page }) => {
        /**
         * Height from the bottom of the toolbar <h1> to the "Formats guide"
         * panel, the first block the bar leaves alone. (The fixtures carry no
         * Bootstrap CSS, so that panel's closed `.collapse` body shows in full
         * and would swamp a measurement taken down to the list.)
         * @returns {Promise<number>}
         */
        const span = () => page.evaluate(() =>
            document.querySelector('#accordion').getBoundingClientRect().top -
            document.querySelector('h1.mb-sl-h1').getBoundingClientRect().bottom);
        await loadSlListPage(page, { kind: 'collection-intro' });
        const off = await span();
        await loadSlListPage(page, { kind: 'collection-intro', settingsOverride: ON });
        const on = await span();
        expect(off, 'premise: the walls take room').toBeGreaterThan(300);
        expect(on, `with the bar: ${on}px instead of ${off}px`).toBeLessThan(off / 4);
    });

    test('a choice keeps the other filters and starts at page 1', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection', settingsOverride: ON, startPage: 2 });
        const usa = (await openMenu(page, 'f_country')).find((e) => e.text === 'USA');
        expect(usa, 'premise: the page offers USA').toBeTruthy();
        expect(query(usa.href)).toEqual({ cmd: 'list', category: 'album', f_format: '12i', f_country: 'USA' });

        // Another format REPLACES 12" vinyl (one value per filter); "Any" drops it.
        await page.keyboard.press('Escape');
        const formats = await openMenu(page, 'f_format');
        expect(formats.filter((e) => e.cur).map((e) => e.text)).toEqual(['12" vinyl']);
        const cd = formats.find((e) => e.text.includes('CD5'));
        expect(query(cd.href)).toEqual({ cmd: 'list', category: 'album', f_format: 'cd5' });
        const any = formats.find((e) => e.text === 'Any');
        expect(query(any.href)).toEqual({ cmd: 'list', category: 'album' });
    });

    test('Category: grouped, current marked, and a change keeps filters but drops the album', async ({ page }) => {
        await loadSlListPage(page, {
            kind: 'collection', settingsOverride: ON,
            url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i&f_date_main=1975-08-25',
        });
        expect((await barButtons(page)).find((b) => b.facet === 'f_date_main').value).toBe('Born To Run');
        const entries = await openMenu(page, 'category');
        const groups = await page.$$eval('.mb-sl-scope-pop .mb-sl-scope-group', (gs) => gs.map((g) => g.textContent));
        expect(groups).toEqual(['Audio', 'Video', 'Print & memorabilia']);
        expect(entries.filter((e) => e.cur).map((e) => e.text)).toEqual(['Official Albums']);
        const categoryWall = await page.$$eval('.element-buttons a.btn', (as) => as.length);
        expect(categoryWall, 'premise: the category wall').toBe(26);
        expect(entries, '"All categories" + one per category button').toHaveLength(1 + categoryWall);

        const singles = entries.find((e) => e.text === 'Singles and Maxi Singles');
        expect(query(singles.href)).toEqual({ cmd: 'list', category: 'single', f_format: '12i' });
        const all = entries.find((e) => e.text === 'All categories');
        expect(query(all.href)).toEqual({ cmd: 'list', category: 'all', f_format: '12i' });
    });

    test('active filters are chips; × removes only its own', async ({ page }) => {
        await loadSlListPage(page, {
            kind: 'collection', settingsOverride: ON,
            url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i&f_country=USA',
        });
        const chips = await page.$$eval('.mb-sl-scope-chip', (cs) => cs.map((c) => ({
            text: c.firstChild.textContent, href: c.querySelector('a').href,
        })));
        expect(chips.map((c) => c.text)).toEqual(['Format: 12" vinyl', 'Country: USA']);
        expect(query(chips[0].href)).toEqual({ cmd: 'list', category: 'album', f_country: 'USA' });
        expect(query(chips[1].href)).toEqual({ cmd: 'list', category: 'album', f_format: '12i' });
        const clear = await page.getAttribute('.mb-sl-scope-clear', 'href');
        expect(query(new URL(clear, page.url()).href)).toEqual({ cmd: 'list', category: 'album' });
    });

    test('entry page: Year from the rendered slider, Apply follows the pickers', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection-intro', settingsOverride: ON });
        const facets = (await barButtons(page)).map((b) => b.facet);
        expect(facets).toEqual(['category', 'f_format', 'f_country', 'f_range', 'f_multi+f_nbcopies']);
        // The slider container is hidden along with its caption.
        expect(await page.$eval('#filter_collection_year', (f) => f.getClientRects().length)).toBe(0);

        await page.click('.mb-sl-scope-btn[data-mb-sl-facet="f_range"]');
        const years = await page.$$eval('#mb-sl-year-from option', (os) => os.map((o) => Number(o.value)));
        expect([years[0], years[years.length - 1]]).toEqual([1973, 2026]);
        await page.selectOption('#mb-sl-year-to', '1985');
        await page.selectOption('#mb-sl-year-from', '1980');
        const href = await page.$eval('.mb-sl-scope-apply', (a) => a.href);
        // The entry page has neither cmd=list nor a category; its own filter
        // links say category=all, and so does the bar.
        expect(query(href)).toEqual({ cmd: 'list', category: 'all', f_range: '1980,1985' });
        // Reversed pickers are put in order.
        await page.selectOption('#mb-sl-year-from', '1990');
        expect(query(await page.$eval('.mb-sl-scope-apply', (a) => a.href)).f_range).toBe('1985,1990');
    });

    test('sampler: Year span falls back when the slider was never rendered', async ({ page }) => {
        await loadSlListPage(page, { kind: 'sampler', settingsOverride: ON });
        expect(await page.locator('.rs-scale').count(), 'premise: no rendered slider, no script').toBe(0);
        await page.click('.mb-sl-scope-btn[data-mb-sl-facet="f_range"]');
        const years = await page.$$eval('#mb-sl-year-from option', (os) => os.map((o) => Number(o.value)));
        expect(years[0]).toBe(1973);
        expect(years[years.length - 1]).toBe(await page.evaluate(() => new Date().getFullYear()));
    });

    test('search, keyboard and closing', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection', settingsOverride: ON });
        await page.click('.mb-sl-scope-btn[data-mb-sl-facet="category"]');
        const search = page.locator('.mb-sl-scope-pop .mb-sl-scope-search');
        await expect(search).toBeFocused();
        await search.fill('video');
        const visible = await page.$$eval('.mb-sl-scope-pop .mb-sl-scope-opt:not([hidden]), .mb-sl-scope-pop .mb-sl-scope-group:not([hidden])',
            (els) => els.map((e) => e.textContent.trim()));
        expect(visible[0]).toBe('Video');
        expect(visible.slice(1).every((t) => /video/i.test(t)), visible.join(' | ')).toBe(true);

        // ArrowDown walks the visible entries.
        await page.keyboard.press('ArrowDown');
        expect(await page.evaluate(() => document.activeElement.textContent.trim())).toBe(visible[1]);

        // Escape closes and returns focus to the button.
        await page.keyboard.press('Escape');
        await expect(page.locator('.mb-sl-scope-pop')).toHaveCount(0);
        await expect(page.locator('.mb-sl-scope-btn[data-mb-sl-facet="category"]')).toBeFocused();

        // A press outside closes it too.
        await page.click('.mb-sl-scope-btn[data-mb-sl-facet="f_country"]');
        await expect(page.locator('.mb-sl-scope-pop')).toBeVisible();
        await page.click('h1.mb-sl-h1 > bdi');
        await expect(page.locator('.mb-sl-scope-pop')).toHaveCount(0);
    });

    test('Enter in the search follows the first match', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection', settingsOverride: ON });
        await page.click('.mb-sl-scope-btn[data-mb-sl-facet="category"]');
        await page.locator('.mb-sl-scope-pop .mb-sl-scope-search').fill('memorab');
        await Promise.all([
            page.waitForURL((u) => u.searchParams.get('category') === 'memorabilia'),
            page.keyboard.press('Enter'),
        ]);
        expect(query(page.url())).toEqual({ cmd: 'list', category: 'memorabilia', f_format: '12i' });
    });
});
