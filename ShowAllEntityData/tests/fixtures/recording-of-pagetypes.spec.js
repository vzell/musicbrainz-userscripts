'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { waitForRenderComplete } = require('../support/browser');
const { columnFilterInput } = require('../support/filterSortAssertions');

// The "Recording of" / "Performance attributes" columns on the recording lists
// besides artist-recordings (features.recordingOf as an object: `after`,
// `browseBy`, `setting`; docs/claude/deferred-columns-picard-relationships.md,
// "Recording of column"). artist-recordings itself is pinned by the other
// recording-of-*.spec.js files. Each test names the property it pins:
//   - the pair sits right after the page's OWN recording column ("Name",
//     "Title" or "Recording"), in every table that has it, keyed by the row's
//     recording MBID — the anchor is not hard-coded to "Name";
//   - ▶🎼 loads every row; only a page that declares `browseBy` browses (by
//     its own parent), every other page looks rows up one by one; no page
//     but artist-recordings asks for a work list or shows a suggestion;
//   - each page group's setting, and the master switch, turn the pair off;
//   - Length keeps its integer styling (the inserted pair is counted);
//   - on a multi-table page, loaded cells survive a filter and an h3
//     collapse/expand (the master-row trap);
//   - a cell whose row links no recording shows no 🎼 and loads nothing;
//   - a multi-table page through Save / Load from Disk keeps the pair as
//     their own cells (never taken for Relationships cells), aligned, loaded;
//   - on search results with continuation rows, inserting the pair changes
//     NO other column's items, row by row (the user-reported "releases in
//     the Artist column", 2026-10-20).
//
// Fixtures and the WS/2 answers: scripts/build-recording-of-pagetype-fixtures.py.

const DATA = require('./recording-of-pt-data.json');
const MBID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;

/** One entry per in-scope pageType with a fixture. */
const CASES = [
    { pt: 'search', anchor: 'Name', button: 'Show all Search Results', setting: 'sa_recording_of_on_search',
        route: 'https://musicbrainz.org/search**', settings: { sa_picard_tagger_initially_collapsed: true } },
    { pt: 'isrc', anchor: 'Title', button: 'Show all Recordings', setting: 'sa_recording_of_on_isrc' },
    { pt: 'instrument-recordings', anchor: 'Name', button: 'Show all Recordings for Instrument', setting: 'sa_recording_of_on_instrument' },
    { pt: 'collections-releases', anchor: 'Name', button: 'Show all', setting: 'sa_recording_of_on_collection', browse: 'collection' },
    { pt: 'series-releases', anchor: 'Name', button: 'Show all', setting: 'sa_recording_of_on_series' },
    { pt: 'user-ratings-type', anchor: 'Recording', button: 'Show', setting: 'sa_recording_of_on_ratings' },
    { pt: 'artist-credit-entity', anchor: 'Recording', button: 'Show all Artist-Credit', setting: 'sa_recording_of_on_artist_credit' },
    { pt: 'tag-value-entity', anchor: 'Recording', button: 'Show all Entities tagged', setting: 'sa_recording_of_on_tags' },
    { pt: 'user-tag-value-entity', anchor: 'Recording', button: 'Tag for Entities upvoted', setting: 'sa_recording_of_on_tags' },
    { pt: 'work-recordings', anchor: 'Title', button: 'Show all Recordings for Work', setting: 'sa_recording_of_on_work', browse: 'work', multi: true },
    { pt: 'area-recordings', anchor: 'Title', button: 'Show all Recordings for Area', setting: 'sa_recording_of_on_area_place', multi: true },
].filter((c) => DATA.pages[c.pt]);

/**
 * Loads a case's fixture, renders it, and installs the WS/2 mock.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} c - A CASES entry.
 * @param {Object} [settings]
 * @returns {Promise<{calls: Array<{kind: string, url: string}>}>}
 */
async function setup(page, c, settings = {}) {
    const calls = [];
    const pg = DATA.pages[c.pt];
    const file = path.join(__dirname, pg.fixture);
    await page.route('**/ws/2/**', (route) => {
        const u = new URL(route.request().url());
        let kind = 'other';
        let body = {};
        if (/\/ws\/2\/recording\/[a-f0-9-]{36}/.test(u.pathname)) {
            kind = 'lookup';
            const rec = DATA.recordings[u.pathname.match(MBID_RE)[0]];
            if (!rec) {
                calls.push({ kind, url: u.href });
                route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' });
                return;
            }
            body = rec;
        } else if (u.pathname.endsWith('/ws/2/recording') && !u.searchParams.get('query')) {
            const by = ['artist', 'work', 'collection', 'release'].find((k) => u.searchParams.get(k));
            kind = `browse:${by}`;
            const b = DATA.browse[by];
            body = b ? { 'recording-count': b['recording-count'], 'recording-offset': 0, recordings: b.recordings }
                : { 'recording-count': 0, recordings: [] };
        } else if (u.pathname.endsWith('/ws/2/work')) {
            kind = 'works';
        }
        if (kind !== 'other') calls.push({ kind, url: u.href });
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await loadUserscriptPage(page, { url: pg.url, fixtureFile: file, testMode: true,
        settingsOverride: { ...(c.settings || {}), ...settings } });
    await page.route(c.route || `${pg.url}?**`, (route) => route.fulfill({ path: file, contentType: 'text/html' }));
    await page.locator(`button[data-label^="${c.button}"]`).first().click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.mouse.move(0, 0);
    return { calls };
}

/**
 * Per rendered table that has the anchor column: header positions, and per
 * body row the anchor's recording MBID and the "Recording of" cell's
 * `data-mbid` / `data-recof`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} anchor
 * @returns {Promise<Array<{anchor: number, recof: number, attr: number, rows: Array<object>}>>}
 */
async function layout(page, anchor) {
    return page.evaluate((anchorName) => Array.from(document.querySelectorAll('table.tbl')).map((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const at = (n) => ths.findIndex((th) => (th.dataset.colName || th.textContent.trim()) === n);
        const a = at(anchorName);
        if (a < 0) return null;
        const r = at('Recording of');
        const rows = Array.from(tbl.querySelectorAll('tbody tr')).filter((tr) => tr.cells.length > 1).map((tr) => {
            const link = tr.cells[a] && tr.cells[a].querySelector('a[href*="/recording/"]');
            const m = link && link.getAttribute('href').match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
            const td = r >= 0 ? tr.cells[r] : null;
            return {
                rec: m ? m[0] : null,
                mbid: td ? (td.dataset.mbid || null) : null,
                cls: td ? td.className : null,
                state: td ? (td.dataset.recof || null) : null,
                text: td ? td.textContent.replace(/\s+/g, ' ').trim() : null,
            };
        });
        return { anchor: a, recof: r, attr: at('Performance attributes'), rows };
    }).filter(Boolean), anchor);
}

/** The work titles a recording's real performance relations name. */
const workTitles = (rid) => ((DATA.recordings[rid] || {}).relations || [])
    .filter((r) => r.type === 'performance' && r.work).map((r) => r.work.title);

test.describe('"Recording of" columns on the other recording lists', () => {
    for (const c of CASES) {
        test(`${c.pt}: the pair sits after "${c.anchor}" and is keyed by the row's recording, and render requests nothing`, async ({ page }) => {
            const { calls } = await setup(page, c);
            const tables = await layout(page, c.anchor);
            expect(tables.length).toBeGreaterThan(0);
            let rows = 0;
            for (const t of tables) {
                expect(t.recof).toBe(t.anchor + 1);
                expect(t.attr).toBe(t.anchor + 2);
                for (const r of t.rows) {
                    expect(r.cls).toContain('mb-recof-cell');
                    expect(r.mbid).toBe(r.rec);
                }
                rows += t.rows.filter((r) => r.rec).length;
            }
            expect(rows).toBeGreaterThan(0);
            await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveCount(tables.length);
            expect(calls).toEqual([]);
        });

        test(`${c.pt}: ▶🎼 loads every row — ${c.browse ? `browse by ${c.browse} first` : 'lookups only'}, no work list`, async ({ page }) => {
            const { calls } = await setup(page, c);
            await page.locator('.mb-recof-col-hdr-btn').first().click();
            await expect(page.locator('.mb-recof-col-hdr-btn').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
            const rows = (await layout(page, c.anchor)).flatMap((t) => t.rows).filter((r) => r.rec);
            const ids = new Set(rows.map((r) => r.rec));
            // State and text per row against the real answer: "has" and the
            // first work title shown, or "none" for a recording without one.
            const got = rows.map((r) => ({ rec: r.rec, state: r.state,
                shows: workTitles(r.rec).length ? r.text.includes(workTitles(r.rec)[0]) : null }));
            const want = rows.map((r) => ({ rec: r.rec, state: workTitles(r.rec).length ? 'has' : 'none',
                shows: workTitles(r.rec).length ? true : null }));
            expect(got).toEqual(want);
            const kinds = calls.map((x) => x.kind);
            expect(kinds).not.toContain('works');
            // One browse page (the work's 40 recordings fit in it) where the
            // page declares a parent and more than one row is wanted; no
            // browse anywhere else. Lookups for whatever the browse missed.
            const useBrowse = !!c.browse && ids.size > 1;
            const browsed = new Set(useBrowse ? DATA.browse[c.browse].recordings.map((r) => r.id) : []);
            expect(kinds.filter((k) => k.startsWith('browse:'))).toEqual(useBrowse ? [`browse:${c.browse}`] : []);
            expect(kinds.filter((k) => k === 'lookup').length).toBe([...ids].filter((id) => !browsed.has(id)).length);
            await expect(page.locator('li.mb-recof-suggested')).toHaveCount(0);
        });

        test(`${c.pt}: ${c.setting} off removes the pair`, async ({ page }) => {
            await setup(page, c, { [c.setting]: false });
            await expect(page.locator('table.tbl thead th[data-col-name="Recording of"]')).toHaveCount(0);
            await expect(page.locator('td.mb-recof-cell')).toHaveCount(0);
        });
    }

    test('the master switch off removes the pair on every page group', async ({ page }) => {
        const c = CASES.find((x) => x.pt === 'search') || CASES[0];
        await setup(page, c, { sa_enable_recording_of_column: false });
        await expect(page.locator('table.tbl thead th[data-col-name="Recording of"]')).toHaveCount(0);
        await expect(page.locator('td.mb-recof-cell')).toHaveCount(0);
    });

    // Pages whose Length sits right of the anchor, so the inserted pair
    // shifts it: "Name" (search, instrument) and "Title" (isrc) anchors.
    for (const pt of ['search', 'isrc', 'instrument-recordings']) {
        test(`${pt}: Length keeps its integer-column styling after the pair inserted before it`, async ({ page }) => {
            const c = CASES.find((x) => x.pt === pt);
            test.skip(!c, `no ${pt} fixture`);
            await setup(page, c);
            const styled = await page.evaluate((anchor) => {
                const tbl = document.querySelector('table.tbl');
                const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
                const at = (n) => ths.findIndex((th) => th.dataset.colName === n);
                const row = tbl.querySelector('tbody tr');
                return {
                    order: [at(anchor), at('Recording of'), at('Performance attributes'), at('Length')],
                    length: row.cells[at('Length')].dataset.mbIntColStyled || null,
                    recof: row.cells[at('Recording of')].dataset.mbIntColStyled || null,
                };
            }, c.anchor);
            expect(styled.order[1]).toBe(styled.order[0] + 1);
            expect(styled.order[2]).toBe(styled.order[0] + 2);
            expect(styled.order[3]).toBeGreaterThan(styled.order[2]);
            expect(styled.length).toBe('1');
            expect(styled.recof).toBeNull();
        });
    }

    test('area-recordings (multi): loaded cells survive a filter and an h3 collapse/expand', async ({ page }) => {
        const c = CASES.find((x) => x.pt === 'area-recordings');
        test.skip(!c, 'no area-recordings fixture');
        await setup(page, c);
        await page.locator('.mb-recof-col-hdr-btn').first().click();
        await expect(page.locator('.mb-recof-col-hdr-btn').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
        const states = async () => (await layout(page, c.anchor)).flatMap((t) => t.rows.filter((r) => r.rec).map((r) => `${r.rec}:${r.state}`)).sort();
        const before = await states();
        expect(before.length).toBeGreaterThan(0);
        expect(before.every((s) => /:(has|none)$/.test(s))).toBe(true);

        const gf = page.locator('#mb-global-filter-input');
        await gf.fill('zzzz-no-such-row');
        await expect(page.locator('table.tbl tbody tr:visible')).toHaveCount(0);
        await gf.fill('');
        await expect.poll(states).toEqual(before);

        const h3 = page.locator('.mb-toggle-h3').first();
        await h3.click();
        await h3.click();
        await expect.poll(states).toEqual(before);
    });

    test('a column filter finds a loaded work title (search)', async ({ page }) => {
        const c = CASES.find((x) => x.pt === 'search');
        test.skip(!c, 'no search fixture');
        await setup(page, c);
        await page.locator('.mb-recof-col-hdr-btn').first().click();
        await expect(page.locator('.mb-recof-col-hdr-btn').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
        const withWork = DATA.pages.search.recordings.find((rid) => workTitles(rid).length);
        test.skip(!withWork, 'no fixture recording performs a work');
        const title = workTitles(withWork)[0];
        const idx = (await layout(page, c.anchor))[0].recof;
        const expected = DATA.pages.search.recordings
            .filter((rid) => workTitles(rid).some((w) => w.toLowerCase().includes(title.toLowerCase()))).length;
        // Click first: the inputs are readonly until a genuine interaction.
        const input = columnFilterInput(page, idx);
        await input.click();
        await input.pressSequentially(title);
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count(), { timeout: 15000 }).toBe(expected);
        const shown = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.offsetParent !== null).map((tr) => tr.querySelector('td.mb-recof-cell').textContent));
        for (const t of shown) expect(t).toContain(title);
    });

    test('a cell whose row links no recording shows no 🎼, is not counted in 📊 and loads nothing', async ({ page }) => {
        const c = CASES[0];
        const { calls } = await setup(page, c);
        const n = await page.locator('td.mb-recof-cell[data-mbid]').count();
        const probe = await page.evaluate(() => {
            const td = document.querySelector('td.mb-recof-cell[data-mbid]');
            delete td.dataset.mbid;
            const glyph = getComputedStyle(td, '::before').content;
            const other = getComputedStyle(document.querySelector('td.mb-recof-cell[data-mbid]'), '::before').content;
            td.id = 'mb-test-inert';
            return { glyph, other };
        });
        expect(probe.glyph).toBe('none');
        expect(probe.other).not.toBe('none');
        // 📊 "Recording of - Load state" counts loadable rows only.
        const secs = await page.evaluate(() => window.__saTest.getUniqDropSections('Recording of'));
        const load = (secs || []).find((x) => x.label === 'Recording of - Load state');
        expect(Object.fromEntries(load.items.map((i) => [i.label, i.count]))).toEqual({ '🎼 not loaded yet': n - 1 });
        await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
        await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden({ timeout: 5000 });
        // A loadable cell is marked "loading" synchronously in the click
        // handler (_recOfLoadRow() -> _recOfMark() before its first await),
        // so the attribute is checked right after the click, no wait needed.
        await page.locator('#mb-test-inert').click();
        await expect(page.locator('#mb-test-inert')).not.toHaveAttribute('data-recof', /.+/);
        expect(calls).toEqual([]);
    });

    test('area-recordings (multi): Save / Load from Disk keeps the pair as its own cells, aligned and loaded', async ({ page, context }) => {
        const c = CASES.find((x) => x.pt === 'area-recordings');
        test.skip(!c, 'no area-recordings fixture');
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recof-pt-disk-'));
        try {
            await setup(page, c);
            await page.locator('.mb-recof-col-hdr-btn').first().click();
            await expect(page.locator('.mb-recof-col-hdr-btn').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
            const states = async (p) => (await layout(p, c.anchor)).flatMap((t) => t.rows.filter((r) => r.rec).map((r) => `${r.rec}:${r.state}`)).sort();
            const before = await states(page);
            const download = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const file = path.join(tmpDir, 'area.json.gz');
            await (await download).saveAs(file);

            const page2 = await context.newPage();
            await loadFromDiskFixture(page2, { url: DATA.pages[c.pt].url, fixturePath: file, testMode: true,
                pageFixtureFile: path.join(__dirname, DATA.pages[c.pt].fixture) });
            await waitForRenderComplete(page2, { waitForAutoResize: false });
            // A cell record carries an mbid; the restore must not make it a
            // Relationships cell (the multi-table branch of the hydration).
            await expect(page2.locator('td.mb-recof-cell')).not.toHaveCount(0);
            await expect(page2.locator('td.mb-recof-cell.mb-rel-cell, td.mb-perfattr-cell.mb-rel-cell')).toHaveCount(0);
            const aligned = await page2.evaluate(() => Array.from(document.querySelectorAll('table.tbl')).every((tbl) => {
                const n = tbl.querySelector('thead tr:first-child').cells.length;
                return Array.from(tbl.querySelectorAll('tbody tr')).every((tr) => tr.cells.length === n);
            }));
            expect(aligned).toBe(true);
            expect(await states(page2)).toEqual(before);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('search with continuation rows: the pair changes no other column — releases never land under Artist', async ({ page, context }) => {
        const pg = DATA.pages['search-born-to-run'];
        test.skip(!pg, 'no search-born-to-run fixture');
        const c = { pt: 'search-born-to-run', anchor: 'Name', button: 'Show all Search Results',
            route: 'https://musicbrainz.org/search**', settings: { sa_picard_tagger_initially_collapsed: true } };
        const COLS = ['Artist', 'ISRCs', 'Release', 'Track', 'Medium', 'Type'];
        /** Per row (Name + Length): the item count of each of COLS. */
        const counts = (p) => p.evaluate((cols) => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName);
            const at = (n) => ths.indexOf(n);
            return Array.from(tbl.querySelectorAll('tbody tr')).map((tr) => {
                const key = `${tr.cells[at('Name')].textContent.trim()} | ${tr.cells[at('Length')].textContent.trim()}`;
                const n = Object.fromEntries(cols.map((col) => [col,
                    tr.cells[at(col)].querySelectorAll(':scope > ul > li, :scope > .mb-ic-val > ul > li').length]));
                return { key, ...n };
            }).sort((a, b) => a.key.localeCompare(b.key));
        }, COLS);
        // WITH first: both pages share one context, and a setting seeded on
        // one page is still seeded on the next — the explicit "off" goes last.
        await setup(page, c);
        const withPair = await counts(page);
        // The comparison means something only if the pair IS there.
        await expect(page.locator('table.tbl tbody td.mb-recof-cell')).toHaveCount(withPair.length);
        const page2 = await context.newPage();
        await setup(page2, c, { sa_recording_of_on_search: false });
        const without = await counts(page2);
        await expect(page2.locator('td.mb-recof-cell')).toHaveCount(0);
        expect(withPair).toEqual(without);
        // And the merged release-side columns stay parallel lists: one item
        // per release in each, the 54-release recording included.
        const most = Math.max(...withPair.map((r) => r.Release));
        expect(most).toBeGreaterThan(10);
        expect(withPair.filter((r) => r.Release !== r.Track || r.Release !== r.Medium || r.Release !== r.Type)).toEqual([]);
    });
});
