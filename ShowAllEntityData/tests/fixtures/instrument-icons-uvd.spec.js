'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

// 📊 dropdown × "MusicBrainz: Instrument Icons Everywhere" (@Lotheric), on
// the instrument search page (debug/instrument-search.html is the user's FRP
// of the same query, with the real script installed):
//   - the "Instrument info - Icon" section counts rows whose instrument
//     link(s) have / lack the script's <img class="mb-ii-icon">, and its two
//     entries filter to exactly those rows;
//   - a value entry whose cell shows an icon shows that icon after its label.
// Fixture: the raw search page (scripts/capture-page-fixture.js, --strip-json).
// A search page is always re-fetched on "Show all", so the rows come from the
// network copy, undecorated, and the simulator decorates SA's own cells.
const SEARCH_URL = 'https://musicbrainz.org/search?query=guit&type=instrument&method=indexed';
const FIXTURE = path.join(__dirname, 'search-instrument-icons.html');

// The icon set: three instruments the real script painted on this query in
// the FRP snapshot (tenor, baroque, bass guitar); every other has none.
const ICONS = {
    'a1baa57d-6ab4-461e-89df-448d6fd2c597': 'tenor_guitar',
    '08450be5-f6d2-46d6-8be0-67087c02162c': 'baroque_guitar',
    '17f9f065-2312-4a24-8309-6f6dd63e2e33': 'bass_guitar',
};
const SECTION = 'Instrument info - Icon';
const WITH = '🎻 with instrument icon';
const WITHOUT = '○ without instrument icon';

/**
 * Loads the search fixture (with or without the simulator) and renders it.
 * @param {import('@playwright/test').Page} page
 * @param {boolean} withScript
 */
async function render(page, withScript) {
    if (withScript) await injectThirdPartyScript(page, 'ii-instrument-icons', { when: 'init', config: { icons: ICONS } });
    await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: FIXTURE, testMode: true });
    await page.route('https://musicbrainz.org/search**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label^="Show all Search Results"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // The simulator decorates SA's cells after its 120 ms debounce; without
    // the script there is no pass to wait for (`__iiSimIdle` is undefined).
    await expect.poll(() => page.evaluate(() => window.__iiSimIdle !== false)).toBe(true);
}

/**
 * Counts, from the table itself, the rows whose `colName` cell has at least
 * one instrument link with / without an icon — the independent oracle the
 * section's counts are checked against.
 * @param {import('@playwright/test').Page} page
 * @param {string} colName
 */
async function domIconCounts(page, colName) {
    return page.evaluate((c) => {
        const tbl = document.querySelector('table.tbl');
        const idx = Array.from(tbl.querySelectorAll('thead tr:first-child th')).findIndex((t) => t.dataset.colName === c);
        let withIcon = 0, without = 0, rows = 0;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            rows++;
            const links = Array.from(tr.cells[idx].querySelectorAll('a[href*="/instrument/"]')).filter((a) => a.textContent.trim());
            const has = (a) => !!(a.previousSibling && a.previousSibling.nodeType === 1 && a.previousSibling.matches('img.mb-ii-icon'));
            if (links.some(has)) withIcon++;
            if (links.some((a) => !has(a))) without++;
        });
        return { withIcon, without, rows };
    }, colName);
}

/**
 * Clicks one entry of the open 📊 panel by its label.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function clickEntry(page, label) {
    await page.evaluate((l) => {
        const item = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === l);
        item.click();
    }, label);
}

/** Rows left in the table. */
const rowCount = (page) => page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);

test.describe('📊 dropdown with "Instrument Icons Everywhere": search type=instrument', () => {
    test('"Instrument info - Icon" counts equal the rows that have / lack an icon', async ({ page }) => {
        await render(page, true);
        const dom = await domIconCounts(page, 'Name');
        expect(dom.withIcon).toBeGreaterThan(0);
        expect(dom.without).toBeGreaterThan(0);
        expect(dom.withIcon + dom.without).toBe(dom.rows); // one link per Name cell

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();
        expect(section.items.find((i) => i.label === WITH).count).toBe(dom.withIcon);
        expect(section.items.find((i) => i.label === WITHOUT).count).toBe(dom.without);
    });

    test('ticking an entry leaves exactly those rows', async ({ page }) => {
        await render(page, true);
        const dom = await domIconCounts(page, 'Name');
        await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));

        await waitForFilterSettled(page, () => clickEntry(page, WITHOUT));
        expect(await rowCount(page)).toBe(dom.without);
        expect((await domIconCounts(page, 'Name')).withIcon).toBe(0);

        // Both ticked: OR'd, every row again.
        await waitForFilterSettled(page, () => clickEntry(page, WITH));
        expect(await rowCount(page)).toBe(dom.rows);

        await waitForFilterSettled(page, () => clickEntry(page, WITHOUT));
        expect(await rowCount(page)).toBe(dom.withIcon);
        expect((await domIconCounts(page, 'Name')).without).toBe(0);
        // The matched link names are highlighted.
        expect(await page.evaluate(() => document.querySelectorAll('table.tbl tbody a[href*="/instrument/"] .mb-column-filter-highlight').length)).toBeGreaterThan(0);
    });

    for (const order of ['typed filter first', 'tick first']) {
        test(`a tick AND's with a typed global filter (${order})`, async ({ page }) => {
            await render(page, true);
            await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));
            const tick = () => waitForFilterSettled(page, () => clickEntry(page, WITH));
            const type = () => waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'bass'));
            if (order === 'tick first') { await tick(); await type(); } else { await type(); await tick(); }
            // "bass guitar" is the only decorated instrument whose row says
            // "bass"; each fixture row is there twice (two fetched pages).
            const names = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .map((tr) => tr.cells[0].textContent.replace(/\s+/g, ' ').trim()));
            expect(names.length).toBeGreaterThan(0);
            for (const n of names) expect(n).toMatch(/^bass guitar/);
        });
    }

    test('a value entry shows its cell\'s icon after the label; others show none', async ({ page }) => {
        await render(page, true);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));
        const entries = await page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .filter((el) => !el.dataset.mbUniqSynLabel)
            .map((el) => ({
                text: el.textContent.replace(/\s+/g, ' ').trim(),
                icon: el.querySelector('.mb-uniq-ii-icon img.mb-ii-icon')?.getAttribute('title') || null,
                // The icon trails the label (flag rule): nothing after it.
                last: !!el.lastElementChild && el.lastElementChild.classList.contains('mb-uniq-ii-icon'),
            })));
        const decorated = entries.filter((e) => e.icon);
        expect(decorated.map((e) => e.icon).sort()).toEqual(['baroque guitar', 'bass guitar', 'tenor guitar']);
        for (const e of decorated) expect(e.last, e.text).toBe(true);
        expect(entries.length).toBeGreaterThan(decorated.length);
    });

    test('a 📊 opened before the script stamped the fetched rows is refreshed once it has', async ({ page }) => {
        // A search page's rows come from a fresh fetch, unstamped; the script
        // stamps SA's cells only after its debounce (stretched here to 1 s).
        // A panel opened in between caches a scan with no instrument icons
        // at all — the late install of the reconciler must drop that cache.
        await injectThirdPartyScript(page, 'ii-instrument-icons', { when: 'init', config: { icons: ICONS, debounceMs: 1000 } });
        await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: FIXTURE, testMode: true });
        await page.route('https://musicbrainz.org/search**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
        await page.click('button[data-label^="Show all Search Results"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const section = async () => {
            await page.evaluate(() => window.__saTest.closeUniqDrop());
            const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));
            const sec = (sections || []).find((s) => s.label === SECTION);
            return sec ? Object.fromEntries(sec.items.map((i) => [i.label, i.count])) : null;
        };
        // Premise: opened before the script got to SA's rows.
        expect(await page.evaluate(() => document.querySelectorAll('table.tbl [data-ii-processed]').length)).toBe(0);
        expect(await section()).toBeNull();

        await expect.poll(() => page.evaluate(() => window.__iiSimIdle === true
            && document.querySelectorAll('table.tbl [data-ii-processed]').length > 0), { timeout: 10000 }).toBe(true);
        const dom = await domIconCounts(page, 'Name');
        await expect.poll(section, { timeout: 10000 }).toEqual({ [WITH]: dom.withIcon, [WITHOUT]: dom.without });
    });

    test('without the script: no section, no icons', async ({ page }) => {
        await render(page, false);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Name'));
        expect(sections.some((s) => s.label === SECTION)).toBe(false);
        expect(await page.evaluate(() => document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-ii-icon').length)).toBe(0);
    });
});
