'use strict';

// pageType 'event-overview' (org/event-overview-pt.org, WIP.1): the event
// page's relationship lists as tables.
//
// Fixture: tests/fixtures/event-overview.html, a raw capture of
// https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8
// (2026-10-06, tests/support/capture-raw-page.js): 9 table.details — 21
// performers, the place, 26 recordings + 1 release, the tour series, 3 URLs —
// and a "Related series" section whose series lists 5 relationships of its own.
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. ONE GROUP PER KIND OF TARGET, IN NATIVE ORDER, WITH ITS OWN COLUMNS —
//     and every row has exactly as many cells as its header. "Seven tables
//     appear" passes on code that clones the first group's header for all of
//     them (the default for multi-table pages), which misaligns every column
//     after the target; the per-table cell/header comparison is what sees it.
//  2. THE LINE'S PARTS LAND IN THEIR COLUMNS: credits (with their instrument
//     links), disambiguation, a recording's artist credit, a place's area.
//     A converter that dumped the rest of the line into one cell passes 1.
//  3. ONE TABLE when that setting is on: every row, a Type and a From column.
//  4. THE RELATED SERIES' OWN RELATIONSHIPS are a "Via …" table, or — setting
//     off — left native with the series name still on it (the render's h3
//     sweep would otherwise take the name away).
//  5. FILTER AND SORT WORK on the new tables ('#' sorts as a number).
//  6. THE MASTER SETTING OFF: no button at all.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled, waitForSortSettled, typeGlobalFilter, ensureSubTableVisible } = require('../support/filterSortAssertions');

const URL = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const BUTTON = 'button[data-label="Show all Relationships for Event"]';

/**
 * Loads the event fixture (MusicBrainz's own bundles blocked) and, unless
 * `press` is false, presses the button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, press?: boolean}} [opts]
 */
async function openEvent(page, { settings = {}, press = true } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        // The setlist tables have their own spec (event-overview-setlist.spec.js);
        // here they are off so the group list is the relationships' alone.
        settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: false, ...settings },
    });
    await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (!press) return;
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every rendered group: its name, header cells, and each row's cell texts.
 *
 * @param {import('@playwright/test').Page} page
 */
const groups = (page) => page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
    let t = h3.nextElementSibling;
    while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
    const icon = h3.querySelector('.mb-toggle-icon');
    const name = icon && icon.nextSibling ? icon.nextSibling.textContent.trim() : h3.textContent.trim();
    const heads = t ? Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊]/gu, '').trim()) : [];
    const rows = t ? Array.from(t.querySelectorAll('tbody tr')).filter((tr) => tr.style.display !== 'none')
        .map((tr) => Array.from(tr.cells).map((td) => td.textContent.replace(/\s+/g, ' ').trim())) : [];
    return { name, heads, rows };
}));

test.describe('pageType event-overview: relationships as tables (WIP.1)', () => {
    test('one table per kind of target, in native order, each with its own aligned columns', async ({ page }) => {
        await openEvent(page);
        const g = await groups(page);
        expect(g.map((x) => [x.name, x.rows.length])).toEqual([
            ['Artists', 21], ['Places', 1], ['Recordings', 26], ['Releases', 1], ['Series', 1], ['URLs', 3],
            ['Via 2023–25 International Tour', 5],
        ]);
        const heads = Object.fromEntries(g.map((x) => [x.name, x.heads]));
        expect(heads.Artists.slice(0, 6)).toEqual(['#', 'Artist', 'Relationship', 'Credits', 'Time', 'Disambiguation']);
        expect(heads.Places.slice(0, 4)).toEqual(['#', 'Place', 'Relationship', 'Area']);
        expect(heads.Recordings.slice(0, 5)).toEqual(['#', 'Recording', 'Relationship', 'Artist', 'Disambiguation']);
        expect(heads.URLs.slice(0, 4)).toEqual(['#', 'Site', 'URL', 'Relationship']);
        expect(heads['Via 2023–25 International Tour'].slice(0, 4)).toEqual(['#', 'Target', 'Type', 'Relationship']);
        g.forEach((x) => x.rows.forEach((r, k) => {
            expect(r.length, `${x.name} row ${k + 1}: cells = header cells`).toBe(x.heads.length);
        }));
    });

    test('each part of a target line lands in its own column, native links kept', async ({ page }) => {
        await openEvent(page);
        const g = Object.fromEntries((await groups(page)).map((x) => [x.name, x]));
        const col = (name, header) => g[name].heads.indexOf(header);
        const row = (name, header, text) => g[name].rows.find((r) => r[col(name, header)] === text);

        const bruce = row('Artists', 'Artist', 'Bruce Springsteen');
        // "time: …" has its own column; the other attributes are one credit per row.
        expect(bruce[col('Artists', 'Time')]).toBe('19:40 - 22-29');
        expect(bruce[col('Artists', 'Disambiguation')]).toBe('');
        expect(row('Artists', 'Artist', 'The E Street Band')[col('Artists', 'Time')]).toBe('19:40 - 22-29');
        const credits = await page.evaluate((idx) => {
            const t = document.querySelectorAll('table.tbl')[0];
            const tr = Array.from(t.querySelectorAll('tbody tr')).find((r) => r.cells[1].textContent.includes('Bruce Springsteen'));
            return Array.from(tr.cells[idx].querySelectorAll('li')).map((li) => li.textContent.trim());
        }, col('Artists', 'Credits'));
        expect(credits).toEqual(['lead vocals', 'spoken vocals', 'harmonica', 'electric guitar']);
        // Disambiguation without its wrapping parentheses — in every table.
        expect(row('Artists', 'Artist', 'Jake Clemons')[col('Artists', 'Disambiguation')])
            .toBe('singer‐songwriter, saxophonist and nephew of Clarence Clemons');
        expect(row('Recordings', 'Recording', 'Badlands')[col('Recordings', 'Disambiguation')])
            .toBe('live, 2025‐05‐20: Co‐op Live, Manchester, England, UK');
        expect(row('Places', 'Place', 'Co‐op Live')[col('Places', 'Area')]).toBe('Manchester, Greater Manchester, England, United Kingdom');
        const badlands = row('Recordings', 'Recording', 'Badlands');
        expect(badlands[col('Recordings', 'Artist')]).toBe('Bruce Springsteen & The E Street Band');
        expect(badlands[col('Recordings', 'Relationship')]).toBe('recording location for');
        expect(row('Series', 'Series', '2023–25 International Tour')[col('Series', 'Details')]).toBe('order: 150');
        expect(row('URLs', 'Site', 'setlist.fm')[col('URLs', 'Relationship')]).toBe('setlist.fm');

        // The links are the native anchors: instrument links inside Credits, entity links in the target cell.
        const links = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('table.tbl')).find((x) => x.querySelector('a[href^="/instrument/"]'));
            return {
                instruments: t ? Array.from(t.querySelectorAll('a[href^="/instrument/"]')).map((a) => a.textContent) : [],
                info: document.querySelectorAll('table.tbl a[href^="/url/"]').length,
            };
        });
        expect(links.instruments).toEqual(['harmonica', 'electric guitar']);
        expect(links.info, 'every URL keeps its [info] link').toBe(5);
    });

    test('"One table for all relationships": every row in one table, with Type and From', async ({ page }) => {
        await openEvent(page, { settings: { sa_event_overview_relationships_one_table: true } });
        const g = await groups(page);
        expect(g.map((x) => x.name)).toEqual(['Relationships']);
        const t = g[0];
        expect(t.rows).toHaveLength(58);
        expect(t.heads.slice(0, 4)).toEqual(['#', 'Target', 'Type', 'Relationship']);
        expect(t.heads).toContain('From');
        const from = t.heads.indexOf('From');
        expect(t.rows.filter((r) => r[from] === 'Event')).toHaveLength(53);
        expect(t.rows.filter((r) => r[from] === '2023–25 International Tour')).toHaveLength(5);
        t.rows.forEach((r, k) => expect(r.length, `row ${k + 1}`).toBe(t.heads.length));
    });

    test('the related series\' own relationships: a "Via" table, or left native with the series name', async ({ page }) => {
        await openEvent(page, { settings: { sa_event_overview_related_series: false } });
        const g = await groups(page);
        expect(g.map((x) => x.name)).not.toContain('Via 2023–25 International Tour');
        const native = await page.evaluate(() => {
            const h2 = document.querySelector('h2.related-series');
            let n = h2 && h2.nextElementSibling;
            const out = [];
            while (n && n.tagName !== 'H2') { out.push(n.tagName + ':' + n.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)); n = n.nextElementSibling; }
            return { h2: !!h2, out };
        });
        expect(native.h2, 'the native section stays').toBe(true);
        expect(native.out[0], 'the series name survives the render (as an h4)').toBe('H4:2023–25 International Tour');
        expect(native.out.filter((s) => s.startsWith('TABLE:'))).toHaveLength(3);
    });

    test('filter and sort work on the new tables; "#" sorts as a number', async ({ page }) => {
        await openEvent(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Clemons'));
        let g = Object.fromEntries((await groups(page)).map((x) => [x.name, x]));
        expect(g.Artists.rows.map((r) => r[1])).toEqual(['Jake Clemons']);
        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-input').fill(''));

        await ensureSubTableVisible(page, 2);
        const recordings = page.locator('table.tbl').nth(2);
        const desc = recordings.locator('thead .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => desc.click(), { subTableHeading: 'Recordings' });
        g = Object.fromEntries((await groups(page)).map((x) => [x.name, x]));
        expect(g.Recordings.rows.slice(0, 3).map((r) => r[0]), 'numeric, not "9" before "26"').toEqual(['26', '25', '24']);
        // '#' is a declared integer column: right-aligned, tabular figures.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr:first-child td:first-child'))
            .every((td) => td.dataset.mbIntColStyled === '1'))).toBe(true);
    });

    test('a Save to Disk → Load from Disk round trip keeps every group\'s own columns', async ({ page, context }) => {
        await openEvent(page);
        const before = await groups(page);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-event-roundtrip-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const reopened = await context.newPage();
            await openEvent(reopened, { press: false });
            await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
            await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(reopened, { waitForAutoResize: false });

            const after = await groups(reopened);
            expect(after.map((x) => [x.name, x.heads, x.rows.length]))
                .toEqual(before.map((x) => [x.name, x.heads, x.rows.length]));
            expect(await reopened.locator('#content table.details').count(), 'no native list left beside the tables').toBe(0);
            await reopened.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('settings off: no button (the page itself, or every table part)', async ({ page }) => {
        await openEvent(page, { settings: { sa_enable_event_overview: false }, press: false });
        expect(await page.locator(BUTTON).count()).toBe(0);
        await openEvent(page, { settings: { sa_event_overview_relationships: false }, press: false });
        expect(await page.locator(BUTTON).count(), 'relationships off, setlist off').toBe(0);
        await openEvent(page, { settings: { sa_event_overview_relationships: false, sa_event_overview_setlist: true }, press: false });
        expect(await page.locator(BUTTON).count(), 'the setlist alone still has a use').toBe(1);
    });
});
