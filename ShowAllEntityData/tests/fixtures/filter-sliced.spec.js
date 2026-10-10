'use strict';

// The time-sliced, cancellable filter pass for typing (runFilterSliced(),
// PERFORMANCE.org Step 39). On a table over the chunked-render threshold a
// typed filter compares rows in slices of a few ms and hands the page back
// between them, so a key typed meanwhile is handled at once; the next pass
// replaces the running one, which must then write nothing.
//
// No fixture is over the 1000-row threshold, so every test lowers it through
// `__saTest.filterSlicing.set()` to 0 and slices one row at a time: a 56-row
// table becomes a 56-slice pass. `onSlice` is awaited by the pass, which lets
// a test HOLD a pass after a given slice, do something, and release it.
//
// ── The guarantees pinned ───────────────────────────────────────────────────
//
// 1. Same answer: the rows a sliced pass shows, their order, the status line
//    and the highlight marks equal a synchronous pass over the same query
//    (computed independently — the result cache is cleared in between), on a
//    single-table and a multi-table page. Premise: the pass really was sliced.
// 2. A replaced pass writes nothing: held mid-way while a newer key, a ✕
//    clear or a sort runs to the end, then released — after which the tbody,
//    the status line and the result cache do not change at all, and the
//    cache never holds the replaced query's key.
// 3. The ⏳ card shows a pass that runs longer than 500 ms: Running, the
//    query, rows compared; then Done with the comparing time.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForFilterSettled, waitForSortSettled, typeGlobalFilter } = require('../support/filterSortAssertions');
const { setupRecordingOf } = require('../support/recordingOf');

// The BoDeans page: artist-releases, tableMode 'single', 56 rows.
const BODEANS_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const BODEANS_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');

// "Tougher Than the Rest" — 7 releases across 2 groups, tableMode 'multi'.
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_FIXTURE = path.join(__dirname, 'saved-data', 'releasegroup-releases.json.gz');

/**
 * Loads the BoDeans single-table fixture.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openSingle(page) {
    await loadFromDiskFixture(page, {
        url: BODEANS_URL, fixturePath: BODEANS_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_relationships_column: false },
    });
    await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)', { timeout: 30000 });
}

/**
 * Slices every row on its own and counts slices in `window.__slices`.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const sliceFinely = (page) => page.evaluate(() => {
    window.__slices = 0;
    window.__saTest.filterSlicing.set({
        threshold: 0, rowsPerCheck: 1, budgetMs: 0,
        onSlice: () => { window.__slices++; },
    });
});

/**
 * What a filter pass left on screen: every rendered row's source index in
 * order, the highlight marks, and the status line without its timing.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{rows: string[], marks: number, status: string}>}
 */
const shown = (page) => page.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((tr) => tr.style.display !== 'none').map((tr) => tr.dataset.mbRowIdx || tr.textContent.slice(0, 40)),
    marks: document.querySelectorAll('table.tbl .mb-global-filter-highlight, table.tbl .mb-column-filter-highlight').length,
    status: (document.querySelector('#mb-filter-status-display') || {}).textContent.replace(/ in \d+ms/, ''),
}));

/**
 * Holds the NEXT sliced pass after its 5th slice until `window.__release()` is
 * called. Only the first pass that reaches slice 5 is held.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const holdNextPassAtSlice5 = (page) => page.evaluate(() => {
    window.__held = false;
    let n = 0;
    window.__saTest.filterSlicing.set({
        threshold: 0, rowsPerCheck: 1, budgetMs: 0,
        onSlice: () => {
            if (window.__held || ++n !== 5) return undefined;
            window.__held = true;
            return new Promise((r) => { window.__release = r; });
        },
    });
});

/**
 * After the held pass is released: whether it changed anything. Watches the
 * tbody and the status line, and the cache keys, for `ms` after the release.
 * @param {import('@playwright/test').Page} page
 * @param {number} [ms]
 * @returns {Promise<{tbody: number, status: number, keysBefore: string[], keysAfter: string[]}>}
 */
const releaseAndWatch = (page, ms = 400) => page.evaluate(async (wait) => {
    const rec = { tbody: 0, status: 0 };
    const obs = [
        [document.querySelector('table.tbl tbody'), 'tbody'],
        [document.querySelector('#mb-filter-status-display'), 'status'],
    ].map(([el, k]) => {
        const o = new MutationObserver((rs) => { rec[k] += rs.length; });
        if (el) o.observe(el, { childList: true, characterData: true, subtree: true });
        return o;
    });
    const keysBefore = window.__saTest.filterSlicing.cacheKeys();
    window.__release();
    await new Promise((r) => setTimeout(r, wait));
    obs.forEach((o) => o.disconnect());
    return { ...rec, keysBefore, keysAfter: window.__saTest.filterSlicing.cacheKeys() };
}, ms);

test.describe('time-sliced typing filter', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(() => window.__saTest && window.__saTest.filterSlicing.reset()).catch(() => {});
    });

    test('single-table: a sliced pass shows exactly what a synchronous one does', async ({ page }) => {
        test.setTimeout(120000);
        await openSingle(page);
        await sliceFinely(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Home'));
        const sliced = await shown(page);
        const slices = await page.evaluate(() => window.__slices);
        expect(slices, 'premise: the pass was sliced, one slice per row').toBeGreaterThanOrEqual(56);

        // The same query, synchronously and from scratch.
        await page.evaluate(() => { window.__saTest.filterSlicing.reset(); window.__saTest.filterSlicing.clearCache(); });
        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-clear').click());
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Home'));
        const sync = await shown(page);
        expect(sliced, 'the sliced pass shows what the synchronous one does').toEqual(sync);
        // Premise, read off the synchronous answer: the query really narrows.
        expect(sync.rows.length, 'premise: the query narrows the table').toBeLessThan(56);
        expect(sync.rows.length).toBeGreaterThan(0);
    });

    test('typing in a column filter goes through the sliced pass too', async ({ page }) => {
        test.setTimeout(120000);
        await openSingle(page);
        await sliceFinely(page);
        // Any text column will do; the third filter input is past the "#" column.
        const input = page.locator('table.tbl .mb-col-filter-input').nth(2);
        await input.click();
        await waitForFilterSettled(page, () => input.pressSequentially('a'));
        expect(await page.evaluate(() => window.__slices), 'the column filter pass was sliced').toBeGreaterThanOrEqual(56);
    });

    test('multi-table: a sliced pass shows exactly what a synchronous one does', async ({ page }) => {
        test.setTimeout(120000);
        await loadFromDiskFixture(page, {
            url: RG_URL, fixturePath: RG_FIXTURE, pageFixtureFile: RG_SHELL, testMode: true,
        });
        await expect(page.locator('table.tbl')).toHaveCount(2, { timeout: 30000 });
        await sliceFinely(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'CD'));
        const sliced = await shown(page);
        expect(await page.evaluate(() => window.__slices), 'premise: the pass was sliced').toBeGreaterThanOrEqual(7);
        expect(sliced.rows.length, 'premise: the query narrows the tables').toBeLessThan(7);

        await page.evaluate(() => { window.__saTest.filterSlicing.reset(); window.__saTest.filterSlicing.clearCache(); });
        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-clear').click());
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'CD'));
        expect(await shown(page)).toEqual(sliced);
    });

    test('a pass replaced by a newer key writes nothing', async ({ page }) => {
        test.setTimeout(120000);
        await openSingle(page);
        await holdNextPassAtSlice5(page);
        await typeGlobalFilter(page, 'Hom');
        await expect.poll(() => page.evaluate(() => window.__held), { message: 'the "Hom" pass is held mid-way' }).toBe(true);
        // The newer key: its own pass runs to the end while "Hom" is held.
        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-input').press('e'));
        await expect(page.locator('#mb-filter-status-display')).toContainText('GLOBAL:"Home"');
        const incrBefore = await page.evaluate(() => window.__saTest.filterSlicing.incr());
        expect(incrBefore.query, 'premise: the newer pass set the narrowing state').toBe('home');
        const after = await releaseAndWatch(page);
        expect(after.tbody, 'the replaced pass did not touch the table').toBe(0);
        expect(after.status, 'the replaced pass did not touch the status line').toBe(0);
        expect(after.keysAfter, 'the replaced pass stored nothing').toEqual(after.keysBefore);
        expect(after.keysAfter.some((k) => k.includes('"g":"hom"')), 'no cache entry for the replaced query').toBe(false);
        // Nor the narrowing state: the next key would narrow from a half-done set.
        expect(await page.evaluate(() => window.__saTest.filterSlicing.incr())).toEqual(incrBefore);
        await expect(page.locator('#mb-filter-status-display')).toContainText('GLOBAL:"Home"');
    });

    test('a held pass keeps _renderSettled pending until it is drawn', async ({ page }) => {
        test.setTimeout(120000);
        await openSingle(page);
        await holdNextPassAtSlice5(page);
        await typeGlobalFilter(page, 'Home');
        await expect.poll(() => page.evaluate(() => window.__held)).toBe(true);
        // The header-count scan and the ⏳ card wait on _renderSettled; while a
        // pass is still comparing they must not see a "settled" table.
        expect(await page.evaluate(() => window.__saTest.filterSlicing.settledPending())).toBe(true);
        await page.evaluate(() => window.__release());
        await expect(page.locator('#mb-filter-status-display')).toContainText('GLOBAL:"Home"');
        await expect.poll(() => page.evaluate(() => window.__saTest.filterSlicing.settledPending())).toBe(false);
    });

    test('the ⏳ card logs a pass replaced by a newer key', async ({ page }) => {
        test.setTimeout(120000);
        await openSingle(page);
        await page.evaluate(() => {
            let n = 0;
            window.__saTest.filterSlicing.set({
                threshold: 0, rowsPerCheck: 1, budgetMs: 0,
                onSlice: () => {
                    n++;
                    if (n === 5) return new Promise((r) => setTimeout(r, 700)); // opens the card
                    if (n === 8) return new Promise((r) => { window.__release = r; });
                    return undefined;
                },
            });
        });
        await typeGlobalFilter(page, 'Hom');
        const pop = page.locator('#mb-async-pop');
        await expect(pop).toBeVisible({ timeout: 10000 });
        await expect(pop).toContainText('Filtering for “Hom”');
        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-input').press('e'));
        await page.evaluate(() => window.__release());
        await page.locator('#mb-filter-status-display').hover();
        await expect(pop.locator('.mb-tt-ajlog')).toContainText('“Hom” replaced by “Home” after 8 of 56 rows');
        await expect(pop.locator('.mb-tt-ajlog')).toContainText('“Home”:');
    });

    test('a pass replaced by the ✕ clear writes nothing', async ({ page }) => {
        test.setTimeout(120000);
        await openSingle(page);
        await holdNextPassAtSlice5(page);
        await typeGlobalFilter(page, 'Home');
        await expect.poll(() => page.evaluate(() => window.__held)).toBe(true);
        await page.locator('#mb-global-filter-clear').click();
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)');
        const after = await releaseAndWatch(page);
        expect(after.tbody).toBe(0);
        expect(after.status).toBe(0);
        expect(after.keysAfter).toEqual(after.keysBefore);
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)');
    });

    test('a pass replaced by a sort writes nothing', async ({ page }) => {
        test.setTimeout(120000);
        await openSingle(page);
        await holdNextPassAtSlice5(page);
        await typeGlobalFilter(page, 'Home');
        await expect.poll(() => page.evaluate(() => window.__held)).toBe(true);
        const sortBtn = page.locator('table.tbl thead tr:first-child th .sort-icon-btn', { hasText: '▼' }).first();
        // The sort's own runFilter() is synchronous and draws the sorted result.
        await waitForSortSettled(page, () => sortBtn.click());
        const after = await releaseAndWatch(page);
        expect(after.tbody, 'the replaced pass did not redraw over the sort').toBe(0);
        expect(after.status).toBe(0);
        expect(after.keysAfter).toEqual(after.keysBefore);
    });

    test('the ⏳ card shows a pass that runs over 500 ms, then its result', async ({ page }) => {
        test.setTimeout(120000);
        await setupRecordingOf(page, { settings: { sa_async_pop_auto_open: true } });
        // Hold the pass for 700 ms after its 5th slice: the next slice then
        // reports progress past the 500 ms mark and opens the card. Hold it
        // again after slice 8, until released, so the running card can be read.
        await page.evaluate(() => {
            let n = 0;
            window.__saTest.filterSlicing.set({
                threshold: 0, rowsPerCheck: 1, budgetMs: 0,
                onSlice: () => {
                    n++;
                    if (n === 5) return new Promise((r) => setTimeout(r, 700));
                    if (n === 8) return new Promise((r) => { window.__release = r; });
                    return undefined;
                },
            });
        });
        await typeGlobalFilter(page, 'Badlands');
        const pop = page.locator('#mb-async-pop');
        await expect(pop).toBeVisible({ timeout: 10000 });
        await expect(pop.locator('.mb-tt-title')).toContainText('Sorting and filtering');
        await expect(pop.locator('[data-mb-aj-phase]')).toHaveAttribute('data-mb-aj-phase', 'running');
        await expect(pop).toContainText('Filtering for “Badlands”');
        await expect(pop.locator('.mb-tt-ajcount')).toContainText('8 / 16 rows compared');
        await expect(pop.locator('.mb-tt-ajcount')).toContainText('match so far');
        await expect(pop.locator('.mb-tt-foot')).toContainText('the filter keeps running');
        await page.evaluate(() => window.__release());
        // Done: the breakdown names the query and the comparing time.
        await expect(pop.locator('[data-mb-aj-phase]')).toHaveAttribute('data-mb-aj-phase', 'done', { timeout: 15000 });
        await expect(pop.locator('.mb-tt-ajfacts')).toContainText('“Badlands”');
        await expect(pop.locator('.mb-tt-ajfacts')).toContainText('Comparing');
        await expect(pop.locator('.mb-tt-ajfacts')).toContainText('slices');
        await expect(pop.locator('.mb-tt-ajlog')).toContainText('“Badlands”:');
    });
});
