'use strict';

// Relationship tables (org/relationship-tables-pt.org, WIP.6): a recording
// page's "Relationships" button.
//
// Fixture: tests/fixtures/rel-recording-overview.html, a raw capture of
// https://musicbrainz.org/recording/6719f5e8-9b80-4956-8e11-ee1614a6693a
// ("Badlands", 2026-10-12T18:28Z, vzell-lap, tests/support/capture-raw-page.js):
// 5 table.details with 25 targets under "Relationships", and one related
// work (Badlands) with 3 targets under "Related works".
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. ONE GROUP PER KIND OF TARGET, THEN "Via <work>", EACH WITH ITS OWN
//     COLUMNS — and every row has exactly as many cells as its header. "Six
//     tables appear" passes on code that clones the first group's header for
//     all of them; the per-table cell/header comparison is what sees it.
//  2. THE DATE ATTRIBUTES LEAVE THE LINE: "(from 1977-06-27 until
//     1978-05-05)" is Begin/End, "(in 1978)" and "(on 1978-04-11)" are a
//     one-day/one-year Begin = End, and none of them is left in Credits or
//     Details. A converter that only ADDED the columns (keeping the text too)
//     passes a "Begin column exists" check.
//  3. BEGIN/END GO THROUGH dateParts: B-YYYY/E-MM/… columns with the parts of
//     the same row's dates. Pins the synthetic columns per group, which only
//     work when the group's extractors are re-resolved against its own header.
//  4. THE MAIN SECTION IS GONE for this render (either/or, user decision
//     2026-10-12), and the page's own "Releases" button is still there.
//  5. THE RELEASE COLUMNS DO NOT LEAK IN: no CAA, no injected Relationships
//     column, no MB-Name — the button runs with its own features only.
//  6. "Releases" STILL RENDERS AS BEFORE, with the native Relationships
//     lists left in place below it (collapsible, not converted).
//  7. Related works OFF: the native section stays with the work's name.
//  8. The setting OFF: no Relationships button.
//  9. SAVE → LOAD on a fresh page keeps every group's columns. The file
//     records the button's own pageType ('recording-relationship-tables'),
//     not the page's: the load must run as that button (its converter, its
//     features), not as 'recording-releases' — and must not stop at a
//     "page type mismatch" dialog.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled, typeGlobalFilter } = require('../support/filterSortAssertions');

const URL = 'https://musicbrainz.org/recording/6719f5e8-9b80-4956-8e11-ee1614a6693a';
const FIXTURE = path.join(__dirname, 'rel-recording-overview.html');
const REL_BUTTON = 'button[data-label="Show all Relationships for Recording"]';
const MAIN_BUTTON = 'button[data-label="Show all Releases for Recording"]';

/**
 * Loads the recording fixture (MusicBrainz's own bundles blocked) and, unless
 * `press` is null, presses that button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, press?: ?string}} [opts]
 */
async function openRecording(page, { settings = {}, press = REL_BUTTON } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_relationship_tables: true, sa_sidebar_in_rel_tables: false, ...settings },
    });
    await page.route('https://musicbrainz.org/recording/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (!press) return;
    await page.click(press);
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

test.describe('relationship tables: recording (WIP.6)', () => {
    test('one table per kind of target, then "Via Badlands", each with its own aligned columns', async ({ page }) => {
        await openRecording(page);
        const g = await groups(page);
        expect(g.map((x) => [x.name, x.rows.length])).toEqual([
            ['Artists', 16], ['Labels', 1], ['Places', 3], ['URLs', 4], ['Works', 1], ['Via Badlands', 3],
        ]);
        const heads = Object.fromEntries(g.map((x) => [x.name, x.heads]));
        expect(heads.Artists.slice(0, 5)).toEqual(['#', 'Artist', 'Relationship', 'Begin', 'End']);
        expect(heads.Places.slice(0, 6)).toEqual(['#', 'Place', 'Relationship', 'Area', 'Begin', 'End']);
        expect(heads.URLs.slice(0, 4)).toEqual(['#', 'Site', 'URL', 'Relationship']);
        expect(heads['Via Badlands'].slice(0, 6)).toEqual(['#', 'Target', 'Type', 'Relationship', 'Begin', 'End']);
        g.forEach((x) => x.rows.forEach((r, k) => {
            expect(r.length, `${x.name} row ${k + 1}: cells = header cells`).toBe(x.heads.length);
        }));
    });

    test('date attributes become Begin/End and leave Credits/Details', async ({ page }) => {
        await openRecording(page);
        const g = Object.fromEntries((await groups(page)).map((x) => [x.name, x]));
        const col = (name, header) => g[name].heads.indexOf(header);
        const row = (name, header, text, nth = 0) => g[name].rows.filter((r) => r[col(name, header)] === text)[nth];

        const tallent = row('Artists', 'Artist', 'Garry Tallent');
        expect([tallent[col('Artists', 'Begin')], tallent[col('Artists', 'End')]]).toEqual(['1977-06-27', '1978-05-05']);
        const plotkin = row('Artists', 'Artist', 'Chuck Plotkin');
        expect([plotkin[col('Artists', 'Begin')], plotkin[col('Artists', 'End')]], '"on 1978-04-11"').toEqual(['1978-04-11', '1978-04-11']);
        const cbs = row('Labels', 'Label', 'CBS Inc.');
        expect([cbs[col('Labels', 'Begin')], cbs[col('Labels', 'End')]], '"in 1978"').toEqual(['1978', '1978']);
        expect(cbs[col('Labels', 'Disambiguation')]).toBe('US broadcasting company; file no releases here!');
        const plant = row('Places', 'Relationship', 'recorded at', 1);
        expect(plant[col('Places', 'Place')]).toBe('The Record Plant');
        expect(plant[col('Places', 'Disambiguation')]).toBe('New York');
        expect(plant[col('Places', 'Area')]).toBe('Midtown Manhattan, New York, New York, United States');
        expect([plant[col('Places', 'Begin')], plant[col('Places', 'End')]]).toEqual(['1977-08-24', '1978-05-05']);
        // Nothing of the dates is left behind in a text column.
        ['Credits', 'Details'].forEach((h) => Object.values(g).forEach((x) => {
            const i = x.heads.indexOf(h);
            if (i < 0) return;
            x.rows.forEach((r) => expect(r[i], `${x.name}/${h}`).not.toMatch(/\b(from|until|in) \d{4}/));
        }));
        expect(Object.values(g).every((x) => !x.heads.includes('Credits')), 'performers carry no credits once the dates are gone').toBe(true);
    });

    test('Begin/End go through dateParts: B-/E- parts per group', async ({ page }) => {
        await openRecording(page);
        const g = Object.fromEntries((await groups(page)).map((x) => [x.name, x]));
        const a = g.Artists;
        ['B-DD', 'B-MM', 'B-YYYY', 'B-Day', 'B-Month', 'E-DD', 'E-MM', 'E-YYYY', 'E-Day', 'E-Month']
            .forEach((h) => expect(a.heads, h).toContain(h));
        const tallent = a.rows.find((r) => r[1] === 'Garry Tallent');
        const at = (h) => tallent[a.heads.indexOf(h)];
        expect([at('B-DD'), at('B-MM'), at('B-YYYY'), at('B-Month')]).toEqual(['27', '6', '1977', 'June']);
        expect([at('E-DD'), at('E-MM'), at('E-YYYY'), at('E-Day')]).toEqual(['5', '5', '1978', 'Friday']);
        const via = g['Via Badlands'];
        const pub = via.rows.find((r) => r[via.heads.indexOf('Relationship')] === 'publisher');
        expect(pub[via.heads.indexOf('B-YYYY')], 'a year alone fills only YYYY').toBe('1978');
        expect(pub[via.heads.indexOf('B-MM')]).toBe('');
        expect(g.URLs.heads, 'a group without dates gets no date parts').not.toContain('B-YYYY');
    });

    test('the main section is gone for this render; the release columns do not leak in', async ({ page }) => {
        await openRecording(page);
        const st = await page.evaluate(() => ({
            appears: !!document.querySelector('h2.appears-on-releases'),
            relH2: !!document.querySelector('h2.relationships'),
            relatedWorks: !!document.querySelector('h2.related-works'),
            details: document.querySelectorAll('#content table.details').length,
            heads: Array.from(document.querySelectorAll('table.tbl thead th')).map((th) => (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊]/gu, '').trim()),
            mainButton: !!document.querySelector('button[data-label="Show all Releases for Recording"]'),
        }));
        expect(st.appears, '"Appears on releases" removed').toBe(false);
        expect(st.relH2).toBe(true);
        expect(st.relatedWorks, 'converted into "Via Badlands"').toBe(false);
        expect(st.details, 'no native list left').toBe(0);
        ['CAA', 'Relationships', 'MB-Name', 'Release title', 'Country/Date'].forEach((h) => expect(st.heads, h).not.toContain(h));
        expect(st.mainButton).toBe(true);
    });

    test('filter works across the relationship tables', async ({ page }) => {
        await openRecording(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Clemons'));
        const g = Object.fromEntries((await groups(page)).map((x) => [x.name, x]));
        expect(g.Artists.rows.map((r) => r[1])).toEqual(['Clarence Clemons']);
    });

    test('"Releases" renders as before: native Relationships lists stay below, unconverted', async ({ page }) => {
        await openRecording(page, { press: MAIN_BUTTON });
        const st = await page.evaluate(() => ({
            details: document.querySelectorAll('#content table.details').length,
            relH2: !!document.querySelector('h2.relationships'),
            relTables: document.querySelectorAll('table.tbl[data-mb-event-table]').length,
            marked: !!document.getElementById('content').dataset.mbRelTables,
        }));
        expect(st.relH2).toBe(true);
        expect(st.details, 'all 7 native lists (5 own + 2 related work)').toBe(7);
        expect(st.relTables).toBe(0);
        expect(st.marked).toBe(false);
    });

    test('"Include related works" off: the native section stays with the work\'s name', async ({ page }) => {
        await openRecording(page, { settings: { sa_relationship_tables_related: false } });
        const g = await groups(page);
        expect(g.map((x) => x.name)).not.toContain('Via Badlands');
        const native = await page.evaluate(() => {
            const h2 = document.querySelector('h2.related-works');
            let n = h2 && h2.nextElementSibling;
            const out = [];
            while (n && n.tagName !== 'H2') { out.push(n.tagName + ':' + n.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)); n = n.nextElementSibling; }
            return { h2: !!h2, out };
        });
        expect(native.h2).toBe(true);
        expect(native.out[0], 'the work name survives the render (as an h4)').toBe('H4:Badlands');
    });

    test('"One table": every row, with Type and From', async ({ page }) => {
        await openRecording(page, { settings: { sa_relationship_tables_one_table: true } });
        const g = await groups(page);
        expect(g.map((x) => x.name)).toEqual(['Relationships']);
        const t = g[0];
        expect(t.rows).toHaveLength(28);
        const from = t.heads.indexOf('From');
        expect(t.rows.filter((r) => r[from] === 'Recording')).toHaveLength(25);
        expect(t.rows.filter((r) => r[from] === 'Badlands')).toHaveLength(3);
        t.rows.forEach((r, k) => expect(r.length, `row ${k + 1}`).toBe(t.heads.length));
    });

    test('a Save to Disk → Load from Disk round trip runs as the Relationships button', async ({ page, context }) => {
        await openRecording(page);
        const before = await groups(page);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-rel-roundtrip-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const reopened = await context.newPage();
            await openRecording(reopened, { press: null });
            await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
            await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(reopened, { waitForAutoResize: false });

            const after = await groups(reopened);
            expect(after.map((x) => [x.name, x.heads, x.rows.length]))
                .toEqual(before.map((x) => [x.name, x.heads, x.rows.length]));
            const st = await reopened.evaluate(() => ({
                details: document.querySelectorAll('#content table.details').length,
                appears: !!document.querySelector('h2.appears-on-releases'),
            }));
            expect(st, 'no native list and no releases table beside the loaded tables').toEqual({ details: 0, appears: false });
            await reopened.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('the setting off: no Relationships button', async ({ page }) => {
        await openRecording(page, { settings: { sa_enable_relationship_tables: false }, press: null });
        await expect(page.locator(MAIN_BUTTON)).toHaveCount(1);
        await expect(page.locator(REL_BUTTON)).toHaveCount(0);
    });
});
