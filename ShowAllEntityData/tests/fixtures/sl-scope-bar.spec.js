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
 * @returns {Promise<Array<{text: string, n: ?string, href: string, cur: boolean}>>}
 *   `text` is the entry's label, `n` its recorded item count (or null).
 */
async function openMenu(page, facet) {
    await page.click(`.mb-sl-scope-btn[data-mb-sl-facet="${facet}"]`);
    await expect(page.locator('.mb-sl-scope-pop')).toBeVisible();
    return page.$$eval('.mb-sl-scope-pop .mb-sl-scope-opt', (as) => as.map((a) => {
        const n = a.querySelector('.mb-sl-scope-n');
        return {
            text: (a.textContent.slice(0, a.textContent.length - (n ? n.textContent.length : 0)))
                .replace(/\s+/g, ' ').trim(),
            n: n ? n.textContent : null,
            href: a.href,
            cur: a.classList.contains('mb-sl-cur'),
        };
    }));
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

// The bootleg lists, and the exact item counts both kinds of list record.
//
// Counts are recorded per whole category from the site's own "Showing items
// … of N" line and kept in GM storage under COUNTS_KEY; the Category menus
// show them, and on the bootleg lists the era timeline is sized by them
// (recordings PER YEAR, so a long era with many recordings is not taller
// than a one-year tour with more per year). An era never visited is drawn
// as unknown, never estimated. Seeds go through the GM store like a setting.

const COUNTS_KEY = 'mb_sa_sl_list_counts';

/**
 * The stored list counts, as the page's GM store holds them.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {n: number, at: string}>>}
 */
function storedCounts(page) {
    return page.evaluate((k) => (window.__gmValues || {})[k] || {}, COUNTS_KEY);
}

/**
 * A counts seed: `{ category: n }` → the stored shape for one list script.
 * @param {string} path
 * @param {Object<string, number>} byCat
 * @returns {Object<string, Object<string, {n: number, at: string}>>}
 */
const seedCounts = (path, byCat) => ({
    [COUNTS_KEY]: Object.fromEntries(Object.entries(byCat)
        .map(([cat, n]) => [`${path}?category=${cat}`, { n, at: '2026-10-01' }])),
});

/**
 * Every era bar of the open Category menu, in page order.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{cat: string, n: string, unknown: boolean, cur: boolean, left: number, right: number, height: number}>>}
 */
function eraBars(page) {
    return page.$$eval('.mb-sl-scope-pop .mb-sl-era', (as) => as.map((a) => {
        const r = a.getBoundingClientRect();
        return {
            cat: new URL(a.href).searchParams.get('category'),
            n: a.querySelector('.mb-sl-era-n').textContent,
            unknown: a.classList.contains('mb-sl-era-unknown'),
            cur: a.classList.contains('mb-sl-cur'),
            left: r.left, right: r.right, height: r.height,
        };
    }));
}

test.describe('sl compact bar: bootleg lists and recorded counts', () => {
    test('bootlegs: a Category menu, the search box and Recent; buttons and forms hidden', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: ON });
        expect(await barButtons(page)).toEqual([
            { facet: 'category', key: 'Category:', value: 'Live 1967-1974', set: false },
            { facet: 'recent', key: 'Recent:', value: '0', set: false },
        ]);
        expect(await page.$$eval('.element-buttons.mb-sl-nav-hidden a.btn', (as) => as.length)).toBe(21);
        // The four search forms are folded into the box: hidden, not removed.
        expect(await page.$$eval('form[id^="filter_bootlegs_"]', (fs) => fs.map((f) => f.getClientRects().length)))
            .toEqual([0, 0, 0, 0]);
        expect(await page.$$eval('.mb-sl-seg-btn', (bs) => bs.map((b) => b.textContent)))
            .toEqual(['Auto', 'Date', 'Title', 'Version', 'Public info']);
    });

    test('a whole list records its exact count; the menu shows it', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: ON });
        const counts = await storedCounts(page);
        expect(counts['/bootlegs.php?category=aud_live1967'].n, 'the page says "of 100"').toBe(100);
        expect(counts['/bootlegs.php?category=aud_live1967'].at).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        const entries = await openMenu(page, 'category');
        expect(entries.find((e) => e.cur)).toMatchObject({ text: 'Live 1967-1974', n: '100' });
        const groups = await page.$$eval('.mb-sl-scope-pop .mb-sl-scope-group', (gs) => gs.map((g) => g.textContent));
        expect(groups).toEqual(['Live shows', 'Other audio', 'Video']);
        expect(entries.map((e) => e.text), 'no "All categories" on the bootleg lists')
            .not.toContain('All categories');
    });

    test('the era timeline: one bar per era, on one axis, sized per year, unknown never estimated', async ({ page }) => {
        // Raw counts order 1984 > 2014 > 2005; per year 1984 (178) > 2005 (159) > 2014 (17).
        await loadSlListPage(page, {
            kind: 'bootlegs',
            settingsOverride: { ...ON, ...seedCounts('/bootlegs.php', { aud_live1984: 713, aud_live2005: 159, aud_live2014: 222 }) },
        });
        await openMenu(page, 'category');
        const bars = await eraBars(page);
        expect(bars).toHaveLength(16);
        expect(bars.filter((b) => b.cur).map((b) => b.cat)).toEqual(['aud_live1967']);
        // Chronological, side by side, none overlapping.
        for (let i = 1; i < bars.length; i++) {
            expect(bars[i].left, `${bars[i].cat} after ${bars[i - 1].cat}`).toBeGreaterThanOrEqual(bars[i - 1].right - 0.5);
        }
        // 1967-1974 is 8 years wide, 2005 one year.
        const w = (cat) => { const b = bars.find((x) => x.cat === cat); return b.right - b.left + 2; };
        expect(w('aud_live1967') / w('aud_live2005')).toBeCloseTo(8, 0);

        const by = Object.fromEntries(bars.map((b) => [b.cat, b]));
        expect(by.aud_live1984.n).toBe('713');
        expect(by.aud_live1984.height).toBeGreaterThan(by.aud_live2005.height);
        expect(by.aud_live2005.height, 'per year, not raw: 159 in one year beats 222 in thirteen')
            .toBeGreaterThan(by.aud_live2014.height);
        // Recorded on this visit, so known too.
        expect(by.aud_live1967.unknown).toBe(false);
        expect(bars.filter((b) => b.unknown).map((b) => b.n)).toEqual(Array(12).fill('?'));
    });

    test('a bootleg search page: its heading is the label, a category drops the search', async ({ page }) => {
        await loadSlListPage(page, {
            kind: 'bootlegs', settingsOverride: ON,
            url: 'https://springsteenlyrics.com/bootlegs.php?cmd=list&category=f_date&f_date=1975-08-15',
        });
        const heading = await page.$eval('.blog-post', (c) => c.parentElement
            .querySelector(':scope > h3.heading, :scope > h2.heading').textContent.trim());
        expect((await barButtons(page))[0].value).toBe(heading);
        const entries = await openMenu(page, 'category');
        expect(entries.filter((e) => e.cur), 'no category is current on a search').toEqual([]);
        const era = entries.find((e) => e.text.startsWith('Live 1975-1977'));
        expect(query(era.href), 'the server ignores f_date beside a list category').toEqual({ cmd: 'list', category: 'aud_live1975' });
        // A search's total is not a category's.
        expect(Object.keys(await storedCounts(page))).toEqual([]);
    });

    test('collection: a whole category records its count, a filtered list does not', async ({ page }) => {
        await loadSlListPage(page, { kind: 'sampler', settingsOverride: ON });
        expect((await storedCounts(page))['/collection.php?category=sampler'].n).toBe(99);
        const entries = await openMenu(page, 'category');
        expect(entries.find((e) => e.cur)).toMatchObject({ text: 'Samplers and Unique Releases', n: '99' });

        await loadSlListPage(page, { kind: 'collection', settingsOverride: ON });
        expect((await storedCounts(page))['/collection.php?category=album'], 'album with f_format=12i is not the album total')
            .toBeUndefined();
    });
});

// The bootleg search box: one box for the site's four forms.
//
// The server takes ONE search field at a time and the field is the category
// (`?cmd=list&category=f_date&f_date=…`); f_date matches full dates only
// (probed live 2026-10-05: 1975-08-15 → 21, 1975-08 and 1975 → 0), and the
// site's own date check never runs. What is pinned here is what the box does
// with what a person types: which URL Search leads to, when Search is
// disabled, and what the message line says. The URL is asserted on Search's
// `href`, and one test follows it end to end.

const RECENT_KEY = 'mb_sa_sl_recent_searches';

/**
 * Types into the search box (after picking a field, if given) and reads the
 * result: Search's target query (null when disabled) and the message line.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {string} [field]  The field button's label, e.g. 'Date'.
 * @returns {Promise<{q: ?Object<string, string>, disabled: boolean, msg: string, links: Array<{text: string, q: Object<string, string>}>}>}
 */
async function typeSearch(page, text, field) {
    if (field) await page.click(`.mb-sl-seg-btn:text-is("${field}")`);
    await page.fill('#mb-sl-search-input', text);
    return page.evaluate(() => {
        const go = document.querySelector('.mb-sl-search-go');
        const msg = document.querySelector('.mb-sl-search-msg');
        const q = (href) => Object.fromEntries(new URL(href).searchParams);
        return {
            q: go.hasAttribute('href') ? q(go.href) : null,
            disabled: go.getAttribute('aria-disabled') === 'true',
            msg: msg.hidden ? '' : msg.textContent,
            links: Array.from(msg.querySelectorAll('a')).map((a) => ({ text: a.textContent, q: q(a.href) })),
        };
    });
}

test.describe('sl compact bar: the bootleg search box', () => {
    test('Auto: a date in any common form searches that date; anything else, titles', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: ON });
        const date = { cmd: 'list', category: 'f_date', f_date: '1975-08-15' };
        expect(await typeSearch(page, '1975-08-15')).toMatchObject({ q: date, msg: '' });
        for (const typed of ['15 Aug 1975', '15 August 1975', 'Aug 15, 1975', '15.08.1975', '  15 aug 1975 ']) {
            const r = await typeSearch(page, typed);
            expect(r.q, typed).toEqual(date);
            expect(r.msg, typed).toBe('Searching the date 1975-08-15.');
        }
        expect(await typeSearch(page, 'Born To Run')).toMatchObject({
            q: { cmd: 'list', category: 'f_title', f_title: 'Born To Run' }, msg: '',
        });
        // A slash date reads differently in the US and Europe: not a date.
        expect((await typeSearch(page, '08/09/1975')).q).toEqual({ cmd: 'list', category: 'f_title', f_title: '08/09/1975' });
    });

    test('a day that does not exist, or a non-date as a Date, disables Search and says why', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: ON });
        for (const typed of ['1975-02-30', '31 Feb 1975', '31.04.1980']) {
            expect(await typeSearch(page, typed), typed)
                .toMatchObject({ q: null, disabled: true, msg: 'That day does not exist.' });
        }
        expect(await typeSearch(page, 'Born', 'Date')).toMatchObject({
            q: null, disabled: true, msg: 'Type a full date such as 1975-08-15 or 15 Aug 1975.',
        });
        expect((await typeSearch(page, '')).disabled, 'empty: nothing to search').toBe(true);
    });

    test('a partial date points to its era list and offers a title search', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: ON });
        for (const [typed, when] of [['1975-08', '1975-08'], ['Aug 1975', '1975-08'], ['August 1975', '1975-08'], ['1975', '1975']]) {
            const r = await typeSearch(page, typed);
            expect(r.q, `${typed}: the site would answer with nothing`).toBeNull();
            expect(r.msg, typed).toBe(`The site finds full dates only. Open Live 1975-1977 and filter its First date column for ${when}, or search titles for “${typed}”.`);
            expect(r.links, typed).toEqual([
                { text: 'Live 1975-1977', q: { cmd: 'list', category: 'aud_live1975' } },
                { text: `search titles for “${typed}”`, q: { cmd: 'list', category: 'f_title', f_title: typed } },
            ]);
        }
    });

    test('a field picked by hand searches that field', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: ON });
        expect((await typeSearch(page, 'soundboard', 'Version')).q)
            .toEqual({ cmd: 'list', category: 'f_version', f_version: 'soundboard' });
        expect((await typeSearch(page, '1975-08-15', 'Public info')).q, 'a date typed into another field stays text')
            .toEqual({ cmd: 'list', category: 'f_publicinfo', f_publicinfo: '1975-08-15' });
        expect(await page.$$eval('.mb-sl-seg-btn[aria-pressed="true"]', (bs) => bs.map((b) => b.textContent)))
            .toEqual(['Public info']);
    });

    test('Enter follows Search', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: ON });
        await page.fill('#mb-sl-search-input', '15 Aug 1975');
        await Promise.all([
            page.waitForURL((u) => u.searchParams.get('category') === 'f_date'),
            page.press('#mb-sl-search-input', 'Enter'),
        ]);
        expect(query(page.url())).toEqual({ cmd: 'list', category: 'f_date', f_date: '1975-08-15' });
    });

    test('a search result page: the box holds that search, and Recent records it once', async ({ page }) => {
        const older = [{ field: 'f_date', q: '1978-07-07' }, { field: 'f_title', q: 'born' }, { field: 'f_version', q: 'sbd' }];
        await loadSlListPage(page, {
            kind: 'bootlegs',
            url: 'https://springsteenlyrics.com/bootlegs.php?f_title=born&cmd=list&category=f_title',
            settingsOverride: { ...ON, [RECENT_KEY]: older },
        });
        await expect(page.locator('#mb-sl-search-input')).toHaveValue('born');
        expect(await page.$$eval('.mb-sl-seg-btn[aria-pressed="true"]', (bs) => bs.map((b) => b.textContent))).toEqual(['Title']);
        // Moved to the front, not repeated.
        const stored = await page.evaluate((k) => window.__gmValues[k], RECENT_KEY);
        expect(stored).toEqual([older[1], older[0], older[2]]);
        expect((await barButtons(page)).find((b) => b.facet === 'recent').value).toBe('3');

        const entries = await openMenu(page, 'recent');
        expect(entries.map((e) => [e.text, e.cur])).toEqual([['Title: born', true], ['Date: 1978-07-07', false], ['Version: sbd', false]]);
        expect(query(entries[1].href)).toEqual({ cmd: 'list', category: 'f_date', f_date: '1978-07-07' });

        await page.click('.mb-sl-scope-forget');
        await expect(page.locator('.mb-sl-scope-pop')).toHaveCount(0);
        expect(await page.evaluate((k) => window.__gmValues[k], RECENT_KEY)).toEqual([]);
    });

    test('Recent keeps the newest eight', async ({ page }) => {
        const eight = Array.from({ length: 8 }, (_, i) => ({ field: 'f_title', q: `t${i}` }));
        await loadSlListPage(page, {
            kind: 'bootlegs',
            url: 'https://springsteenlyrics.com/bootlegs.php?f_date=1975-08-15&cmd=list&category=f_date',
            settingsOverride: { ...ON, [RECENT_KEY]: eight },
        });
        const stored = await page.evaluate((k) => window.__gmValues[k], RECENT_KEY);
        expect(stored).toEqual([{ field: 'f_date', q: '1975-08-15' }, ...eight.slice(0, 7)]);
    });

    test('collection pages have no search forms, so no search box', async ({ page }) => {
        await loadSlListPage(page, { kind: 'collection', settingsOverride: ON });
        await expect(page.locator('.mb-sl-scope')).toHaveCount(1);
        await expect(page.locator('.mb-sl-search, .mb-sl-scope-btn[data-mb-sl-facet="recent"]')).toHaveCount(0);
    });
});

// After the fetch: Country, the year range and Copies filter the LOADED table
// (decided 2026-10-05); Format, Album and Category keep navigating, and each
// menu says which it does. The filter goes through applyUniqValueSet(), the
// 📊 dropdown's exact-value path. What is pinned: the rows the table shows
// (computed from the loaded rows, never a literal), that the URL does not
// change, and that the bar's buttons and chips follow the column filter both
// ways — set from the bar, and cleared from the column's own ✕.

const { renderedSlRows } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');

/**
 * Loads an SL list with the bar on and renders its table.
 * @param {import('@playwright/test').Page} page
 * @param {string} kind
 * @param {object} [opts]  Extra loadSlListPage options (e.g. `url`).
 * @returns {Promise<Array<Object<string, string>>>} Every row of the full table.
 */
async function loadAndRender(page, kind, opts = {}) {
    const { spec } = await loadSlListPage(page, { kind, settingsOverride: ON, ...opts });
    await page.$eval(`button[data-label="${spec.button}"]`, (b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return renderedSlRows(page);
}

/**
 * Clicks the open menu's entry whose label is exactly `text`.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @returns {Promise<void>}
 */
async function pick(page, text) {
    const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.locator('.mb-sl-scope-pop .mb-sl-scope-opt', { hasText: new RegExp(`^\\s*${esc}\\s*$`) }).click();
}

/**
 * Polls until the table shows exactly `n` rows, then returns them.
 * @param {import('@playwright/test').Page} page
 * @param {number} n
 * @returns {Promise<Array<Object<string, string>>>}
 */
async function rowsSettleAt(page, n) {
    await expect.poll(async () => (await renderedSlRows(page)).length, { timeout: 10000 }).toBe(n);
    return renderedSlRows(page);
}

test.describe('sl compact bar: after the fetch, filtering the loaded table', () => {
    test('Country filters the table in place; the bar shows it as a 📊 chip', async ({ page }) => {
        const all = await loadAndRender(page, 'sampler');
        const url = page.url();
        const entries = await openMenu(page, 'f_country');
        await expect(page.locator('.mb-sl-scope-pop .mb-sl-scope-note-table')).toContainText('Filters the loaded table');
        // Buttons, not links: nothing navigates.
        expect(await page.$$eval('.mb-sl-scope-pop a.mb-sl-scope-opt', (as) => as.length)).toBe(0);
        const inTable = new Set(all.map((r) => r.Country));
        const country = entries.map((e) => e.text).find((t) => t !== 'Any' && inTable.has(t));
        expect(country, 'premise: a country offered by the wall is in the table').toBeTruthy();
        const expected = all.filter((r) => r.Country === country).length;
        expect(expected, 'premise: it narrows').toBeLessThan(all.length);

        await pick(page, country);
        const shown = await rowsSettleAt(page, expected);
        expect(shown.every((r) => r.Country === country)).toBe(true);
        expect(page.url(), 'no reload').toBe(url);
        expect((await barButtons(page)).find((b) => b.facet === 'f_country')).toMatchObject({ value: country, set: true });
        const chips = await page.$$eval('.mb-sl-scope-chip-table', (cs) => cs.map((c) => c.firstChild.textContent));
        expect(chips).toEqual([`Country: ${country}`]);
        // The menu now marks the choice.
        const again = await openMenu(page, 'f_country');
        expect(again.filter((e) => e.cur).map((e) => e.text)).toEqual([country]);
        await page.keyboard.press('Escape');

        // The chip's × clears the column, in place.
        await page.click('.mb-sl-scope-chip-table > button');
        await rowsSettleAt(page, all.length);
        expect((await barButtons(page)).find((b) => b.facet === 'f_country')).toMatchObject({ value: 'Any', set: false });
        await expect(page.locator('.mb-sl-scope-chip')).toHaveCount(0);
    });

    test('clearing the column with its own ✕ updates the bar', async ({ page }) => {
        const all = await loadAndRender(page, 'sampler');
        const entries = await openMenu(page, 'f_country');
        const inTable = new Set(all.map((r) => r.Country));
        const country = entries.map((e) => e.text).find((t) => t !== 'Any' && inTable.has(t));
        await pick(page, country);
        await rowsSettleAt(page, all.filter((r) => r.Country === country).length);

        await page.evaluate(() => {
            const idx = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
                .findIndex((th) => (th.dataset.colName || th.textContent).trim().startsWith('Country'));
            document.querySelector(`.mb-col-filter-input[data-col-idx="${idx}"]`)
                .parentElement.querySelector('.mb-col-filter-clear').click();
        });
        await rowsSettleAt(page, all.length);
        await expect.poll(async () => (await barButtons(page)).find((b) => b.facet === 'f_country').value).toBe('Any');
        await expect(page.locator('.mb-sl-scope-chip')).toHaveCount(0);
    });

    test('Year and Copies filter the table; two table chips get an in-place Clear all', async ({ page }) => {
        const all = await loadAndRender(page, 'sampler');
        const years = all.map((r) => Number(r['Original year'])).filter((n) => n > 0).sort((a, b) => a - b);
        const [a, b] = [years[Math.floor(years.length / 4)], years[Math.floor(years.length / 2)]];
        const expectedYears = all.filter((r) => Number(r['Original year']) >= a && Number(r['Original year']) <= b).length;
        expect(expectedYears, 'premise: the range narrows').toBeLessThan(all.length);

        await page.click('.mb-sl-scope-btn[data-mb-sl-facet="f_range"]');
        await expect(page.locator('.mb-sl-scope-pop .mb-sl-scope-note-table')).toBeVisible();
        await page.selectOption('#mb-sl-year-from', String(a));
        await page.selectOption('#mb-sl-year-to', String(b));
        expect(await page.$eval('.mb-sl-scope-apply', (el) => el.tagName)).toBe('BUTTON');
        await page.click('.mb-sl-scope-apply');
        const shown = await rowsSettleAt(page, expectedYears);
        expect(shown.every((r) => Number(r['Original year']) >= a && Number(r['Original year']) <= b)).toBe(true);
        expect((await barButtons(page)).find((x) => x.facet === 'f_range').value).toBe(`${a}–${b}`);

        // Copies "= 1" on top: the two column filters AND.
        await openMenu(page, 'f_multi+f_nbcopies');
        await pick(page, 'Nb. of copies = 1');
        const both = all.filter((r) => Number(r['Original year']) >= a && Number(r['Original year']) <= b && r.Copies === '1').length;
        await rowsSettleAt(page, both);

        expect(await page.$eval('.mb-sl-scope-clear', (el) => el.tagName), 'table filters clear in place').toBe('BUTTON');
        await page.click('.mb-sl-scope-clear');
        await rowsSettleAt(page, all.length);
        await expect(page.locator('.mb-sl-scope-chip')).toHaveCount(0);
    });

    test('Format and Category still navigate after the fetch, and say they reload', async ({ page }) => {
        await loadAndRender(page, 'sampler');
        for (const [facet, note] of [
            ['f_format', 'Reloads the page and replaces the loaded table.'],
            ['category', 'Opens another list and replaces the loaded table.'],
        ]) {
            await openMenu(page, facet);
            await expect(page.locator('.mb-sl-scope-pop .mb-sl-scope-note')).toHaveText(note);
            expect(await page.$$eval('.mb-sl-scope-pop button.mb-sl-scope-opt', (bs) => bs.length), facet).toBe(0);
            await page.keyboard.press('Escape');
        }
    });

    test('a filter the list was fetched with still reloads: the table holds only that value', async ({ page }) => {
        await loadAndRender(page, 'collection', {
            url: 'https://springsteenlyrics.com/collection.php?cmd=list&category=album&f_format=12i&f_country=USA',
        });
        const entries = await openMenu(page, 'f_country');
        await expect(page.locator('.mb-sl-scope-pop .mb-sl-scope-note')).toHaveText(
            'This list was fetched with this filter, so changing it reloads the page and replaces the loaded table.');
        expect(entries.every((e) => e.href), 'links').toBe(true);
    });

    test('before the fetch the menus navigate and carry no note', async ({ page }) => {
        await loadSlListPage(page, { kind: 'sampler', settingsOverride: ON });
        const entries = await openMenu(page, 'f_country');
        await expect(page.locator('.mb-sl-scope-pop .mb-sl-scope-note')).toHaveCount(0);
        expect(entries.every((e) => e.href)).toBe(true);
    });

    test('a choice nothing in the table matches shows an empty table, not an unfiltered one', async ({ page }) => {
        const all = await loadAndRender(page, 'sampler');
        const have = new Set(all.map((r) => Number(r['Original year'])));
        let gap = 1974;
        while (have.has(gap)) gap++;
        await page.click('.mb-sl-scope-btn[data-mb-sl-facet="f_range"]');
        await page.selectOption('#mb-sl-year-from', String(gap));
        await page.selectOption('#mb-sl-year-to', String(gap));
        await page.click('.mb-sl-scope-apply');
        await rowsSettleAt(page, 0);
        expect((await barButtons(page)).find((b) => b.facet === 'f_range').value).toBe(`${gap}–${gap}`);
    });
});

// A pull-down is `position: fixed`, so the page cannot scroll it into view:
// it has to fit in the window wherever the bar sits. Found by the hand-off
// specs: after a render the bar sat low, and the Country list ran past the
// window's bottom with its lower entries out of reach.
test('a pull-down opened low on the screen fits in the window', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 420 });
    await loadSlListPage(page, { kind: 'collection-intro', settingsOverride: ON });
    await page.evaluate(() => {
        const btn = document.querySelector('.mb-sl-scope-btn[data-mb-sl-facet="f_country"]');
        window.scrollBy(0, btn.getBoundingClientRect().bottom - (window.innerHeight - 30));
    });
    const before = await page.$eval('.mb-sl-scope-btn[data-mb-sl-facet="f_country"]', (b) => b.getBoundingClientRect().bottom);
    expect(before, 'premise: the button sits near the bottom').toBeGreaterThan(330);
    await page.$eval('.mb-sl-scope-btn[data-mb-sl-facet="f_country"]', (b) => b.click());
    const r = await page.$eval('.mb-sl-scope-pop', (p) => {
        const b = p.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, h: window.innerHeight };
    });
    expect(r.top, 'inside the window').toBeGreaterThanOrEqual(0);
    expect(r.bottom, 'inside the window').toBeLessThanOrEqual(r.h);
    // And its last entry is reachable by scrolling the panel itself.
    await page.locator('.mb-sl-scope-pop .mb-sl-scope-opt').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.mb-sl-scope-pop .mb-sl-scope-opt').last()).toBeInViewport();
});

// The bootleg landing page (bootlegs.php): no item cards, so no fetch button;
// it is supported for the compact bar alone. With the bar off the script must
// stop before touching the page — the springsteenlyrics.com support being on
// is not enough. Its "Statistics" counts are deliberately not read (they drift
// from the lists' own totals), so nothing is recorded here.

/**
 * Collects console errors from the moment it is called.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]} Filled as errors arrive.
 */
function consoleErrors(page) {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    return errors;
}

test.describe('sl compact bar: the bootleg landing page', () => {
    test('with the bar off, the page is left alone', async ({ page }) => {
        const errors = consoleErrors(page);
        await loadSlListPage(page, { kind: 'bootlegs-intro' });
        await expect(page.locator('#filter_bootlegs_date')).toBeVisible();
        await expect(page.locator('h1.mb-sl-h1, .mb-sl-scope, #mb-show-all-controls-container, .mb-sl-nav-hidden')).toHaveCount(0);
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-sl'))).toBe(false);
        expect(errors.filter((e) => /VZ-|ShowAllEntityData|Uncaught/.test(e))).toEqual([]);
    });

    test('with the bar on: Category, the search box and Recent; no fetch button', async ({ page }) => {
        const errors = consoleErrors(page);
        await loadSlListPage(page, { kind: 'bootlegs-intro', settingsOverride: ON });
        await expect(page.locator('h1.mb-sl-h1 > bdi')).toHaveText('Bootlegs');
        expect(await barButtons(page)).toEqual([
            { facet: 'category', key: 'Category:', value: 'Choose a list', set: false },
            { facet: 'recent', key: 'Recent:', value: '0', set: false },
        ]);
        await expect(page.locator('#mb-sl-search-input')).toBeVisible();
        expect(await page.$$eval('form[id^="filter_bootlegs_"]', (fs) => fs.map((f) => f.getClientRects().length)))
            .toEqual([0, 0, 0, 0]);
        expect(await page.$$eval('.element-buttons.mb-sl-nav-hidden a.btn', (as) => as.length)).toBe(21);
        await expect(page.locator('#mb-show-all-controls-container button[data-label]'), 'nothing to fetch').toHaveCount(0);
        // No table, so no Data/View menus and no divider; ⚙️ and ❓ stay.
        for (const sel of ['#mb-button-divider-initial', '#mb-data-menu-btn', '#mb-view-menu-btn']) {
            await expect(page.locator(sel), sel).toBeHidden();
        }
        await expect(page.locator('#mb-settings-btn')).toBeVisible();
        await expect(page.locator('#mb-app-help-btn')).toBeVisible();
        // The page's own content below stays.
        await expect(page.locator('h3.heading', { hasText: 'Statistics' })).toBeVisible();
        expect(errors.filter((e) => /VZ-|ShowAllEntityData|Uncaught/.test(e))).toEqual([]);
        expect(Object.keys(await storedCounts(page)), 'the drifting Statistics are not recorded').toEqual([]);
    });

    test('the Category menu: the era timeline and lists, none current', async ({ page }) => {
        await loadSlListPage(page, {
            kind: 'bootlegs-intro',
            settingsOverride: { ...ON, ...seedCounts('/bootlegs.php', { aud_live1984: 713 }) },
        });
        const entries = await openMenu(page, 'category');
        expect(entries.filter((e) => e.cur)).toEqual([]);
        expect(entries).toHaveLength(21);
        expect(query(entries.find((e) => e.text === 'Live 1992-1994').href)).toEqual({ cmd: 'list', category: 'aud_live1992' });
        const bars = await eraBars(page);
        expect(bars).toHaveLength(16);
        expect(bars.filter((b) => b.cur)).toEqual([]);
        expect(bars.filter((b) => !b.unknown).map((b) => [b.cat, b.n])).toEqual([['aud_live1984', '713']]);
    });

    test('the search box searches from here', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs-intro', settingsOverride: ON });
        expect((await typeSearch(page, '15 Aug 1975')).q).toEqual({ cmd: 'list', category: 'f_date', f_date: '1975-08-15' });
        expect((await typeSearch(page, 'Born')).q).toEqual({ cmd: 'list', category: 'f_title', f_title: 'Born' });
    });
});
