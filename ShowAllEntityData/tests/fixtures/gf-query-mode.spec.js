'use strict';

// The global filter's query mode (the Q box): Event Horizon's filter language
// (majkinetor's tqParse, ported as _gfqParse()). Mockup approved 2026-11-20:
// https://claude.ai/artifact/Y7tjYtaS82RTaZ5Admz2wk — design in
// docs/claude/filter-and-cache-invariants.md, "The global filter's query mode
// (Event Horizon's language)".
//
// What each block pins, and the neighbouring property it keeps apart:
//
//  1. THE GRAMMAR, straight on the shipping parser (__saTest.gfq.parse): one
//     case per rule of EH's language, plus our two changes (an exact key
//     beats an earlier prefix; values keep their accents).
//  2. EVERY TERM MEANS WHAT THE SHIPPED FILTERS MEAN. Oracles are the other
//     filters of the same page, never a second implementation: a column term
//     keeps exactly the rows that column's own filter keeps, a word exactly
//     the rows the plain global filter keeps; OR is their union, - the
//     complement. A query that matched "anywhere" would pass a test that only
//     counted rows; the equality with the COLUMN filter is what sees it.
//  3. RANGES on a Date column, against the years the cells show.
//  4. HALF-TYPED input never fails, and the card says what is missing.
//  5. Ex, Cc and Rx with Q: Ex turns the query round, Cc applies to every
//     term, Q and Rx exclude each other.
//  6. HIGHLIGHTS only on the leaves that are not negated, in their column.
//  7. THE CACHES: switching Q changes the answer for the same text (cache
//     key), and extending a query may WIDEN it ("a" → "a OR b": no narrowing).
//  8. THE SLICED PASS shows what a synchronous one does.
//  9. HISTORY: a pinned query keeps its Q and brings it back.
// 10. MULTI-TABLE: keys are each sub-table's own columns.
//
// Network-free. Single-table: the BoDeans artist-releases disk fixture
// (56 rows). Multi-table: the event-overview fixture (seven tables, each with
// its own columns; only "Place" has an Area column).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors, clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { typeGlobalFilter, columnIndex, columnFilterInput, columnFilterClear } = require('../support/filterSortAssertions');

const AR = {
    url: 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases',
    fixture: path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz'),
    total: 56,
};
const EV = {
    url: 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8',
    fixture: path.join(__dirname, 'event-overview.html'),
    button: 'button[data-label="Show all Relationships for Event"]',
};

/** How long a filter pass may take to land: the debounce plus a render. */
const SETTLE = { timeout: 10000 };

/**
 * The source-row indices of the rows shown in every table, sorted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [tableIndex] - One table only.
 * @returns {Promise<string[]>}
 */
const shownRows = (page, tableIndex) => page.evaluate((ti) => {
    const tables = Array.from(document.querySelectorAll('table.tbl'));
    const pick = ti === undefined ? tables : [tables[ti]];
    return pick.flatMap(t => Array.from(t.querySelectorAll('tbody tr'))
        .filter(tr => tr.style.display !== 'none' && !t.classList.contains('mb-empty-subtable-hidden'))
        .map(tr => tr.dataset.mbRowIdx || ''))
        .sort((a, b) => Number(a) - Number(b));
}, tableIndex);

/**
 * The text of `#mb-filter-status-display`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
const status = (page) => page.evaluate(() =>
    (document.getElementById('mb-filter-status-display') || {}).textContent || '');

/**
 * Sets the Q (or another global) box to `on`, clicking its label only when
 * it differs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'query'|'rx'|'exclude'|'case'} kind
 * @param {boolean} on
 */
async function setBox(page, kind, on) {
    const box = page.locator(`#mb-global-filter-${kind}-checkbox`);
    if (await box.isChecked() !== on) await page.locator(`#mb-global-filter-${kind}-label`).click();
    await expect(box).toBeChecked({ checked: on });
}

/**
 * Replaces the global filter's text and waits until the pass for it landed
 * (the status line names the new text, or the table is back to every row).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function setGlobal(page, text) {
    const clr = page.locator('#mb-global-filter-clear');
    if (await clr.isVisible()) await clr.click();
    if (text) await typeGlobalFilter(page, text);
    await expect.poll(async () => {
        const s = await status(page);
        return text ? s.includes(`"${text}"`) : !s.includes('GLOBAL');
    }, { ...SETTLE, message: `the pass for "${text}" lands` }).toBe(true);
}

/**
 * The rows one column filter keeps (the oracle for a column term), with the
 * global filter empty; the column is cleared again afterwards.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 * @param {string} text
 * @returns {Promise<string[]>}
 */
async function columnRows(page, colName, text) {
    await setGlobal(page, '');
    const idx = await columnIndex(page, colName);
    expect(idx, `column "${colName}" exists`).toBeGreaterThanOrEqual(0);
    const input = columnFilterInput(page, idx);
    await input.click();
    await input.pressSequentially(text);
    await expect.poll(() => status(page), SETTLE).toContain(text);
    const rows = await shownRows(page);
    await columnFilterClear(page, idx).click();
    await expect.poll(async () => (await shownRows(page)).length, SETTLE).toBe(AR.total);
    return rows;
}

/**
 * The rows a global filter keeps with Q set to `query`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {boolean} [query=true]
 * @returns {Promise<string[]>}
 */
async function globalRows(page, text, query = true) {
    await setBox(page, 'query', query);
    await setGlobal(page, text);
    return shownRows(page);
}

const union = (...xs) => [...new Set(xs.flat())].sort((a, b) => Number(a) - Number(b));
const minus = (all, xs) => all.filter(x => !xs.includes(x));
const inter = (a, b) => a.filter(x => b.includes(x));

/**
 * Loads the BoDeans single-table fixture (cover art and relationships off:
 * nothing rewrites a cell after the render).
 *
 * @param {import('@playwright/test').Page} page
 */
async function openSingle(page) {
    await loadFromDiskFixture(page, {
        url: AR.url, fixturePath: AR.fixture, testMode: true,
        settingsOverride: { sa_enable_relationships_column: false, sa_enable_caa_pics: false },
    });
    await expect.poll(async () => (await shownRows(page)).length, { timeout: 30000 }).toBe(AR.total);
}

test.describe('query mode: the grammar (_gfqParse)', () => {
    test('every rule of the language, and our two changes', async ({ page }) => {
        await openSingle(page);
        const r = await page.evaluate(() => {
            const P = (q, keys, cc) => window.__saTest.gfq.parse(q, keys || [], cc);
            const K = [['release'], ['artist'], ['format'], ['date'], ['countrydate'], ['country'], ['catalog#']];
            return {
                key: window.__saTest.gfq.key('Catálog # No.'),
                phrase: P('born to run', K).tree,
                lowerAnd: P('rock and roll', K).tree,
                and: P('rock AND roll', K).tree,
                quotes: P('"best of" bodeans', K).tree,
                col: P('format:CD', K).tree,
                quotedVal: P('catalog#:"9 25"', K).tree,
                prefix: P('form:cd', K).tree,
                exact: P('country:au', K).tree,
                not: P('-live', K).tree,
                notGroup: P('-(live OR demo)', K).tree,
                orBindsLast: P('a b OR c', K).tree,
                rangeBoth: P('date:1990-1995', K).tree,
                rangeFrom: P('date:2016-', K).tree,
                rangeTo: P('date:-1987', K).tree,
                rangeHalf: P('date:1990-19', K).tree,
                dateText: P('date:2022-06', K).tree,
                openBracket: P('(format:cd', K).tree,
                strayClose: P('format:cd)', K).tree,
                blank: P('format:', K),
                unknown: P('foo:bar', K),
                accents: P('Zoë', K).tree,
                cc: P('format:CD', K, true).tree,
            };
        });
        expect(r.key, 'a key: accents, case and every non-key character dropped').toBe('catalog#no');
        expect(r.phrase, 'neighbouring words are one phrase').toEqual({ v: 'born to run' });
        expect(r.lowerAnd, 'a lower-case "and" is part of the phrase').toEqual({ v: 'rock and roll' });
        expect(r.and, 'AND in capitals splits it').toEqual({ and: [{ v: 'rock' }, { v: 'roll' }] });
        expect(r.quotes, 'quotes keep a phrase apart').toEqual({ and: [{ v: 'best of' }, { v: 'bodeans' }] });
        expect(r.col, 'column:value, lower-cased').toEqual({ c: 2, v: 'cd', r: null });
        expect(r.quotedVal, 'a quoted value keeps its space').toEqual({ c: 6, v: '9 25', r: null });
        expect(r.prefix, 'the start of a column name will do').toEqual({ c: 2, v: 'cd', r: null });
        expect(r.exact, 'an exact key beats an earlier prefix (EH would take Country/Date)').toEqual({ c: 5, v: 'au', r: null });
        expect(r.not).toEqual({ not: { v: 'live' } });
        expect(r.notGroup).toEqual({ not: { or: [{ v: 'live' }, { v: 'demo' }] } });
        expect(r.orBindsLast, 'OR binds last').toEqual({ or: [{ v: 'a b' }, { v: 'c' }] });
        expect(r.rangeBoth).toEqual({ c: 3, v: '1990-1995', r: ['1990', '1995'] });
        expect(r.rangeFrom).toEqual({ c: 3, v: '2016-', r: ['2016', ''] });
        expect(r.rangeTo).toEqual({ c: 3, v: '-1987', r: ['', '1987'] });
        expect(r.rangeHalf, 'a date column: a half-typed end is text, not a range').toEqual({ c: 3, v: '1990-19', r: null });
        expect(r.dateText, 'a date column keeps 2022-06 as text').toEqual({ c: 3, v: '2022-06', r: null });
        expect(r.openBracket, 'an open bracket shuts at the end').toEqual({ c: 2, v: 'cd', r: null });
        expect(r.strayClose, 'a bracket that opens nothing goes').toEqual({ c: 2, v: 'cd', r: null });
        expect(r.blank.tree, 'a column with no value counts for nothing').toBe(null);
        expect(r.blank.blank).toEqual([2]);
        expect(r.unknown.tree, 'an unknown key is text').toEqual({ v: 'foo:bar' });
        expect(r.unknown.unknown).toEqual(['foo']);
        expect(r.accents, 'values keep their accents (the plain filter does)').toEqual({ v: 'zoë' });
        expect(r.cc, 'Cc keeps the case').toEqual({ c: 2, v: 'CD', r: null });
        // A year column takes a half-typed end as an open one.
        const yr = await page.evaluate(() => window.__saTest.gfq.parse('year:1990-19', [['year']], false).tree);
        expect(yr).toEqual({ c: 0, v: '1990-19', r: ['1990', ''] });
    });
});

test.describe('query mode on a single table (BoDeans artist-releases)', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await openSingle(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('a column term keeps exactly what that column filter keeps, nothing from other columns', async ({ page }) => {
        test.setTimeout(90000);
        const cassette = await columnRows(page, 'Format', 'cassette');
        expect(cassette.length, 'premise: some cassettes').toBeGreaterThan(0);
        expect(await globalRows(page, 'format:cassette')).toEqual(cassette);
        expect(await globalRows(page, 'form:cassette'), 'a prefix key').toEqual(cassette);
        // "home" is in Release; no format holds it.
        expect((await globalRows(page, 'home')).length, 'premise: a word anywhere finds Home').toBeGreaterThan(0);
        expect(await globalRows(page, 'format:home'), 'a column term never looks at another column').toEqual([]);
    });

    test('OR is the union, - the complement, words the plain filter', async ({ page }) => {
        test.setTimeout(120000);
        const all = await shownRows(page);
        const cassette = await columnRows(page, 'Format', 'cassette');
        const vinyl = await columnRows(page, 'Format', 'vinyl');
        const cd = await columnRows(page, 'Format', 'cd');
        const digital = await columnRows(page, 'Format', 'digital');
        expect(await globalRows(page, 'format:cassette OR format:vinyl')).toEqual(union(cassette, vinyl));
        expect(union(cassette, vinyl).length, 'premise: OR widens').toBeGreaterThan(Math.max(cassette.length, vinyl.length));
        expect(await globalRows(page, '-format:cd')).toEqual(minus(all, cd));
        expect(await globalRows(page, '-(format:cd OR format:digital)')).toEqual(minus(all, union(cd, digital)));

        const plainPhrase = await globalRows(page, 'slash and burn', false);
        const plainSlash = await globalRows(page, 'slash', false);
        const plainBurn = await globalRows(page, 'burn', false);
        expect(await globalRows(page, 'slash and burn'), 'a lower-case "and" stays a phrase').toEqual(plainPhrase);
        expect(await globalRows(page, 'slash AND burn'), 'AND: both words, anywhere').toEqual(inter(plainSlash, plainBurn));
        expect(inter(plainSlash, plainBurn).length, 'premise: AND is wider than the phrase').toBeGreaterThan(plainPhrase.length);
    });

    test('a range on the Date column keeps the rows whose Date shows a year in it', async ({ page }) => {
        test.setTimeout(90000);
        const dateIdx = await columnIndex(page, 'Date');
        const years = await page.evaluate((i) => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .map(tr => [tr.dataset.mbRowIdx, (tr.cells[i].textContent.match(/\b\d{4}\b/g) || [])]), dateIdx);
        const want = (lo, hi) => years.filter(([, ys]) => ys.some(y => (!lo || y >= lo) && (!hi || y <= hi)))
            .map(([i]) => i).sort((a, b) => Number(a) - Number(b));
        for (const [q, lo, hi] of [['date:1990-1995', '1990', '1995'], ['date:2016-', '2016', ''], ['date:-1987', '', '1987']]) {
            const w = want(lo, hi);
            expect(w.length, `premise: ${q} keeps some rows and not all`).toBeGreaterThan(0);
            expect(w.length).toBeLessThan(AR.total);
            expect(await globalRows(page, q), q).toEqual(w);
        }
        // The in-range years are what is marked, in the Date column only.
        await globalRows(page, 'date:1990-1995');
        const marks = await page.evaluate((i) => Array.from(document.querySelectorAll('table.tbl tbody td .mb-global-filter-highlight'))
            .map(s => [s.closest('td').cellIndex === i, s.textContent]), dateIdx);
        expect(marks.length, 'the years are highlighted').toBeGreaterThan(0);
        for (const [inDate, t] of marks) {
            expect(inDate, `"${t}" is marked in the Date column`).toBe(true);
            expect(Number(t) >= 1990 && Number(t) <= 1995, `"${t}" is in the range`).toBe(true);
        }
        // A date column keeps 2022-06 as text: the same as the column filter.
        const juneText = await columnRows(page, 'Date', '2022-06');
        expect(await globalRows(page, 'date:2022-06')).toEqual(juneText);
    });

    test('half-typed input filters by what is complete, and the card says what is missing', async ({ page }) => {
        test.setTimeout(90000);
        const cassette = await columnRows(page, 'Format', 'cassette');
        expect(await globalRows(page, '(format:cassette'), 'an open bracket').toEqual(cassette);
        expect(await globalRows(page, 'format:cassette)'), 'a stray bracket').toEqual(cassette);
        expect((await globalRows(page, 'format:')).length, 'a key with no value filters nothing yet').toBe(AR.total);
        const card = page.locator('#mb-gfq-card');
        await expect(card, 'the card shows while the field has focus').toBeVisible();
        await expect(card).toContainText('Format: type a value');
        expect(await globalRows(page, 'foo:bar'), 'an unknown key is text no row holds').toEqual([]);
        await expect(card).toContainText('No column ‘foo’: matched as text');
        await setGlobal(page, 'format:cd date:1990-1995 -live');
        await expect(card.locator('.mb-gfq-what')).toHaveText('Format contains cd · Date 1990–1995 · not any column contains live');
    });

    test('Ex turns the whole query round; Cc applies to every term', async ({ page }) => {
        test.setTimeout(90000);
        const notCd = await globalRows(page, '-format:cd');
        await setBox(page, 'exclude', true);
        expect(await globalRows(page, 'format:cd'), 'Q + Ex = -( … )').toEqual(notCd);
        await setBox(page, 'exclude', false);
        await setBox(page, 'case', true);
        expect(await globalRows(page, 'format:cd'), 'Cc: "cd" is not "CD"').toEqual([]);
        expect((await globalRows(page, 'format:CD')).length).toBeGreaterThan(0);
    });

    test('Q and Rx exclude each other, and the card says so', async ({ page }) => {
        await setBox(page, 'rx', true);
        await page.locator('#mb-global-filter-query-label').click();
        await expect(page.locator('#mb-global-filter-query-checkbox')).toBeChecked();
        await expect(page.locator('#mb-global-filter-rx-checkbox')).not.toBeChecked();
        await expect(page.locator('#mb-gfq-card')).toContainText('Regular expressions are off: Rx and Q cannot be combined.');
        await page.locator('#mb-global-filter-rx-label').click();
        await expect(page.locator('#mb-global-filter-query-checkbox')).not.toBeChecked();
        await expect(page.locator('#mb-gfq-card')).toContainText('Query mode is off: Rx and Q cannot be combined.');
    });

    test('highlights mark the leaves that are not negated, in their column', async ({ page }) => {
        const fmt = await columnIndex(page, 'Format');
        await globalRows(page, 'format:cassette');
        const cells = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td .mb-global-filter-highlight'))
            .map(s => [s.closest('td').cellIndex, s.textContent.toLowerCase()]));
        expect(cells.length, 'the term is marked').toBeGreaterThan(0);
        expect(cells.every(([c, t]) => c === fmt && t === 'cassette'), JSON.stringify(cells)).toBe(true);

        await globalRows(page, 'home -cassette');
        const words = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td .mb-global-filter-highlight'))
            .map(s => s.textContent.toLowerCase()));
        expect(words.length).toBeGreaterThan(0);
        expect(words.every(t => t === 'home'), `only "home" is marked: ${JSON.stringify(words)}`).toBe(true);
        await expect.poll(() => status(page)).toContain('GLOBAL:(q) "home -cassette"');
    });

    test('the same text is another filter with Q off, and extending a query may widen it', async ({ page }) => {
        test.setTimeout(90000);
        const cd = await globalRows(page, 'format:cd');
        expect(cd.length).toBeGreaterThan(0);
        expect(await globalRows(page, 'format:cd', false), 'plain text "format:cd" is in no cell').toEqual([]);
        await setBox(page, 'query', true);
        await expect.poll(() => shownRows(page), { ...SETTLE, message: 'ticking Q again brings the query back' }).toEqual(cd);

        const cassette = await globalRows(page, 'format:cassette');
        const vinyl = await globalRows(page, 'format:vinyl');
        // From an empty cache: a cache hit for 'format:cassette' would leave
        // the narrowing state at an earlier query, and the extension below
        // would then never be offered the cassette rows to narrow from (the
        // mutation "a query narrows like plain text" survived exactly so).
        await page.evaluate(() => window.__saTest.filterSlicing.clearCache());
        await setGlobal(page, 'format:cassette');
        // Typed on: each key extends the previous text, as the narrowing expects.
        await typeGlobalFilter(page, ' OR format:vinyl');
        await expect.poll(() => shownRows(page), { ...SETTLE, message: 'the OR widens the rows' }).toEqual(union(cassette, vinyl));
    });

    test('a sliced pass shows what a synchronous one does', async ({ page }) => {
        test.setTimeout(90000);
        const q = 'format:cd -live';
        await page.evaluate(() => {
            window.__slices = 0;
            window.__saTest.filterSlicing.set({ threshold: 0, rowsPerCheck: 1, budgetMs: 0, onSlice: () => { window.__slices++; } });
        });
        const sliced = await globalRows(page, q);
        expect(await page.evaluate(() => window.__slices), 'premise: the pass was sliced').toBeGreaterThanOrEqual(AR.total);
        await page.evaluate(() => { window.__saTest.filterSlicing.reset(); window.__saTest.filterSlicing.clearCache(); });
        await setGlobal(page, '');
        const sync = await globalRows(page, q);
        expect(sliced).toEqual(sync);
        expect(sync.length).toBeGreaterThan(0);
        expect(sync.length).toBeLessThan(AR.total);
    });

    test('a pinned query keeps its Q and brings it back', async ({ page }) => {
        const cassette = await globalRows(page, 'format:cassette');
        await page.locator('#mb-filter-container button', { hasText: /^\+$/ }).first().click();
        const pinned = await page.evaluate(() => (window.__gmValues['persistent-sa-hist-list'] || [])[0]);
        expect(pinned).toMatchObject({ query: 'format:cassette', useQuery: true });
        await setBox(page, 'query', false);
        await setGlobal(page, '');
        // The History button may be folded out of the bar; Alt+H in the field is the same toggle.
        await page.locator('#mb-global-filter-input').click();
        await page.keyboard.press('Alt+h');
        const row = page.locator('.mb-fhw-hist-row[data-list="pin"]').first();
        await expect(row.locator('.mb-fhw-badge-q')).toHaveText('Q');
        await row.click();
        await expect(page.locator('#mb-global-filter-query-checkbox')).toBeChecked();
        await expect.poll(() => shownRows(page), SETTLE).toEqual(cassette);
    });

    test('the card: Esc hides it first, Syntax opens the list', async ({ page }) => {
        await globalRows(page, 'format:cd');
        const card = page.locator('#mb-gfq-card');
        await expect(card).toBeVisible();
        await card.locator('.mb-gfq-syn-btn').click();
        await expect(card.locator('dl.mb-gfq-syn')).toBeVisible();
        await expect(page.locator('#mb-global-filter-input'), 'the caret stays in the field').toBeFocused();
        await page.keyboard.press('Escape');
        await expect(card.locator('dl.mb-gfq-syn'), 'Esc shuts the syntax first').toBeHidden();
        await expect(card).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(card, 'then the card').toBeHidden();
        expect(await status(page), 'the query is still in force').toContain('"format:cd"');
    });
});

test.describe('query mode on a multi-table page (event overview)', () => {
    test('keys are each sub-table\'s own columns', async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: EV.url, fixtureFile: EV.fixture, testMode: true,
            settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: false },
        });
        await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: EV.fixture, contentType: 'text/html' }));
        await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
        await page.click(EV.button);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await clickMasterToggleAndExpandAll(page);
        const place = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .findIndex(t => Array.from(t.querySelectorAll('thead tr:first-child th')).some(th => th.dataset.colName === 'Area')));
        expect(place, 'premise: one sub-table has an Area column').toBeGreaterThanOrEqual(0);

        await setBox(page, 'query', false);
        await setGlobal(page, 'manchester');
        const plain = await shownRows(page);
        expect(plain.length, 'premise: "manchester" is in more tables than the Place one').toBeGreaterThan(1);

        await setBox(page, 'query', true);
        await setGlobal(page, 'area:manchester');
        await expect.poll(() => shownRows(page), SETTLE).toHaveLength(1);
        expect((await shownRows(page, place)).length, 'the row is the place').toBe(1);
        expect(pageErrors).toEqual([]);
    });
});
