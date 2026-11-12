'use strict';

// Brucebase stats pages (`bb-stats`, org/brucebase.org Phase 13, batch 1): a
// button per shape the page has — "Show the list" (its links in one table
// with a Tab column; a show's or a venue's title split into Date, Venue,
// City, State, Country; sort forms turned round) and "Show the tables" (the
// wiki's own tables, a sub-table per tab or heading, the first open). Both
// read a copy of the page: no request. A page with neither shape, and a
// fragment another stats page includes, stay bb-page's. Fixtures:
// scripts/build-bb-stats-fixtures.py (one page per shape
// scripts/check-bb-stats-reader.js found over the copy of the mirror).
// docs/claude/brucebase.md, "Stats pages".

const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadBbStatsPage, bbStatsFixture } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const LIST = 'Show the list';
const TABLES = 'Show the tables';

/**
 * Presses a button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The fixture's list items read with a plain DOM: every `li` inside a tab
 * panel whose first link goes to one of `prefixes`, as [href, text, tab
 * label].
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {string[]} prefixes - Page categories ("venue", "gig").
 * @returns {Promise<Array<[string, string, string]>>}
 */
function fixtureItems(page, name, prefixes) {
    const html = fs.readFileSync(bbStatsFixture(name).file, 'utf8');
    return page.evaluate(({ h, prefixes }) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const re = new RegExp(`^/(?:${prefixes.join('|')}):`);
        const out = [];
        d.querySelectorAll('#page-content .yui-content > div').forEach((panel, i) => {
            const nav = panel.parentElement.parentElement.querySelector(':scope > ul.yui-nav');
            const label = nav ? nav.children[Array.from(panel.parentElement.children).indexOf(panel)].textContent.trim() : '';
            panel.querySelectorAll('li').forEach((li) => {
                const a = li.querySelector('a[href]');
                if (a && re.test(a.getAttribute('href')) && li.textContent.trim().startsWith(a.textContent.trim())) {
                    out.push([a.getAttribute('href'), a.textContent.replace(/\s+/g, ' ').trim(), label]);
                }
            });
        });
        return out;
    }, { h: html, prefixes });
}

/**
 * The single table's columns and rows as cell texts, with the first
 * cell's link and hover text.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{headers: string[], rows: Array<Object<string, string>>}>}
 */
function listTable(page) {
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const headers = Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim());
        const rows = Array.from(t.tBodies[0].rows, (tr) => {
            const r = {};
            headers.forEach((h, i) => { r[h] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
            const a = tr.cells[0]?.querySelector('a');
            const tip = tr.cells[0]?.querySelector('[data-mb-tip]');
            r._href = a ? a.getAttribute('href') : '';
            r._target = a ? a.getAttribute('target') || '' : '';
            r._tip = tip ? tip.getAttribute('title') || tip.getAttribute('data-mb-tip-text') || '' : '';
            return r;
        });
        return { headers, rows };
    });
}

/**
 * The rendered sub-tables in page order: name (h3 without its count),
 * columns, row count, whether the table shows, the first row's cells.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{name: string, headers: string[], rows: number, open: boolean, first: string[]}>>}
 */
function subTables(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('table.tbl')).map((t) => {
        let h3 = t.previousElementSibling;
        while (h3 && h3.tagName !== 'H3') h3 = h3.previousElementSibling;
        // The engine's row count is the LAST "(N)"; a name may hold its own ("Born To Run Tour (1975)").
        const name = h3 ? h3.textContent.replace(/[▲▼]/g, '').replace(/\s*\(\d[\d,]*\)(?!.*\(\d[\d,]*\)).*$/, '').trim() : '';
        const body = t.tBodies[0];
        return {
            name,
            headers: Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim()),
            rows: body ? body.rows.length : 0,
            open: getComputedStyle(t).display !== 'none',
            first: body && body.rows[0] ? Array.from(body.rows[0].cells, c => c.textContent.replace(/\s+/g, ' ').trim()) : [],
        };
    }));
}

/** Requests to the wiki itself (pages, AJAX): the views make none. */
const wikiRequests = reqs => reqs.filter(u => /^https?:\/\/brucebase\.wikidot\.com\//.test(u));

test.describe('Brucebase stats pages (Phase 13, batch 1)', () => {
    test('a list of venues and shows in tabs: one table, Kind, the place split, venues turned round, Tab; no request', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, 'venues-in-kentucky');
        const fx = await fixtureItems(page, 'venues-in-kentucky', ['venue', 'gig', 'nogig', 'interview', 'rehearsal', 'recording']);
        await expect(page.locator(`button[data-label="${LIST}"]`)).toBeVisible();
        await expect(page.locator(`button[data-label="${TABLES}"]`), 'the page has no table of its own').toHaveCount(0);
        await press(page, LIST);
        const { headers, rows } = await listTable(page);
        expect(headers.slice(0, 8)).toEqual(['Page', 'Kind', 'Date', 'Venue', 'City', 'State', 'Country', 'Tab']);
        expect(headers, 'the date split into its parts').toEqual(expect.arrayContaining(['DD', 'MM', 'YYYY']));
        expect(rows.length).toBe(fx.length);
        expect(rows.map(r => r._href)).toEqual(fx.map(f => `https://brucebase.wikidot.com${f[0]}`));
        expect(rows.every(r => r._target === '_blank')).toBe(true);
        expect(new Set(rows.map(r => r.Kind))).toEqual(new Set(['Venue', 'Gig', 'No gig']));
        expect(new Set(rows.map(r => r.Tab))).toEqual(new Set(fx.map(f => f[2])));
        // A show: its date and place from its title.
        const gig = rows.find(r => r.Kind === 'Gig');
        const gigText = fx.find(f => `https://brucebase.wikidot.com${f[0]}` === gig._href)[1];
        expect(gig.Date).toBe(gigText.slice(0, 10));
        expect(gig.State).toBe('KY');
        expect(gig.Country).toBe('USA');
        // A venue in the wiki's sort form, turned round in Venue.
        const sorted = fx.find(f => / \((?:The|A|An)\),/.test(f[1]));
        const row = rows.find(r => r._href === `https://brucebase.wikidot.com${sorted[0]}`);
        const m = /^(.*) \((The|A|An)\),/.exec(sorted[1]);
        expect(row.Venue).toBe(`${m[2]} ${m[1]}`);
        expect(wikiRequests(requests), 'the list is read from the page itself').toEqual([]);
        await expect(page.locator('h2.mb-bb-native-h2')).toHaveText(/Brucebase page/);
    });

    test('a show in the list previews (Ctrl+hover: the card, one request for its page)', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, 'venues-in-kentucky', {
            settingsOverride: { sa_bb_event_preview: true, sa_bb_detail_preview: true, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 },
        });
        await press(page, LIST);
        const a = page.locator('table.tbl tbody a[href*="/gig:"]').first();
        const href = await a.getAttribute('href');
        await a.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await a.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect.poll(() => requests).toContain(href);
    });

    test('a list of songs in letter tabs: Song and the letter; MusicBrainz case with the wiki\'s text as the hover', async ({ page }) => {
        await loadBbStatsPage(page, 'songs-official-video', { settingsOverride: { sa_foreign_mb_titles: true } });
        const fx = await fixtureItems(page, 'songs-official-video', ['song']);
        await press(page, LIST);
        const { headers, rows } = await listTable(page);
        expect(headers).toEqual(['Song', 'Tab']);
        expect(rows.length).toBe(fx.length);
        expect(rows[0].Tab).toBe('0-9');
        expect(new Set(rows.map(r => r.Tab))).toContain('A');
        const july = rows.find(r => /4th of july/i.test(r.Song));
        expect(july.Song).toBe('4th of July, Asbury Park (Sandy)');
        expect(july._tip).toContain('4th Of July, Asbury Park (Sandy)');
    });

    test('a list of names in sort form: turned round ("Band, The" → "The Band")', async ({ page }) => {
        await loadBbStatsPage(page, 'relations-bands');
        const fx = await fixtureItems(page, 'relations-bands', ['relation']);
        await press(page, LIST);
        const { headers, rows } = await listTable(page);
        expect(headers).toEqual(['Name', 'Tab']);
        expect(rows.length).toBe(fx.length);
        const sorted = fx.find(f => /^[^,]+, The$/.test(f[1]));
        const row = rows.find(r => r._href === `https://brucebase.wikidot.com${sorted[0]}`);
        expect(row.Name).toBe(`The ${sorted[1].replace(/, The$/, '')}`);
        expect(row._tip).toContain(sorted[1]);
    });

    test('tables in tabs: a sub-table per tab, the first open; a bold heading row; ceremony rows as a Section column', async ({ page }) => {
        const { requests } = await loadBbStatsPage(page, 'awards');
        await expect(page.locator(`button[data-label="${LIST}"]`), 'no list on the page').toHaveCount(0);
        await press(page, TABLES);
        const t = await subTables(page);
        const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#page-content ul.yui-nav > li'), li => li.textContent.trim()));
        expect(t.length).toBeGreaterThan(5);
        // A tab's second table repeats its name with " (2)" (Grammy).
        expect(t.map(x => x.name.replace(/ \(\d+\)$/, '')).every(n => labels.includes(n)), 'each sub-table named by its tab').toBe(true);
        expect(t.map(x => x.name)).toContain('Grammy (2)');
        expect(t[0].headers).toEqual(['Section', 'Nominated', 'For', 'Award']);
        expect(t[0].first[0], 'the ceremony carried down').toMatch(/American Music Awards|AMA/i);
        expect(t[0].open).toBe(true);
        expect(t.slice(1).every(x => !x.open), 'the others closed').toBe(true);
        expect(wikiRequests(requests)).toEqual([]);
    });

    test('a heading-only table gives its columns to the tables after it; each named by its caption row', async ({ page }) => {
        await loadBbStatsPage(page, 'set-openers-and-closers');
        await press(page, TABLES);
        const t = await subTables(page);
        expect(t[0].name).toBe('Born To Run Tour (1975)');
        expect(t[0].headers).toEqual(['Openers', '#', 'Closers', '# (2)']);
        expect(t.every(x => x.headers.join() === t[0].headers.join())).toBe(true);
        expect(t[0].first[1]).toMatch(/^\d+$/);
    });

    test('a page with both shapes offers both buttons', async ({ page }) => {
        await loadBbStatsPage(page, 'songs-by-album');
        await expect(page.locator(`button[data-label="${LIST}"]`)).toBeVisible();
        await expect(page.locator(`button[data-label="${TABLES}"]`)).toBeVisible();
        await press(page, LIST);
        const { headers, rows } = await listTable(page);
        expect(headers).toEqual(['Song', 'Tab']);
        expect(rows.length).toBeGreaterThan(500);
    });

    test('a song never played on a tour, a fragment of stats:awards and a hub of stats links stay bb-page: no button', async ({ page }) => {
        // Only the box of other shows: nothing for bb-song-tours (batch 2) either.
        await loadBbStatsPage(page, 'ain-t-that-a-shame-tour');
        await expect(page.locator('button[data-label="Show the tours"]')).toHaveCount(0);
        await expect(page.locator('h1.mb-bb-preview-only'), 'bb-page\'s hidden header').toHaveCount(1);
        await expect(page.locator(`button[data-label="${LIST}"], button[data-label="${TABLES}"]`)).toHaveCount(0);
        await page.goto('about:blank');
        await loadBbStatsPage(page, 'awards-ama');
        await expect(page.locator('h1.mb-bb-preview-only')).toHaveCount(1);
        await expect(page.locator(`button[data-label="${TABLES}"]`)).toHaveCount(0);
        // A hub: its items link other stats pages, the wiki's navigation, not a list.
        await page.goto('about:blank');
        await loadBbStatsPage(page, 'for-collectors');
        await expect(page.locator('h1.mb-bb-preview-only')).toHaveCount(1);
        await expect(page.locator(`button[data-label="${LIST}"]`)).toHaveCount(0);
    });
});
