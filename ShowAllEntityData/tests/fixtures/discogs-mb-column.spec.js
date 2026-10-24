'use strict';

// discogs.com's MusicBrainz column (2026-10-19; mockup
// https://claude.ai/artifact/6CmnUoNf4LHd44yxvp3rvu): with murdos' "Import
// Discogs releases to MusicBrainz" installed, every Discogs table whose rows
// are entities gets a "MusicBrainz" column right after Title/Name — the
// importer's cache first (read only), then our own IndexedDB store, then
// /ws/2/url?resource=… in the background (100 a request, one inc for every
// type). The importer is simulated by its localStorage cache key
// (DISCOGS_MBLINKS_CACHE-v3.1, the shape of mblinks.js@755843cf); MusicBrainz
// answers through `window.__gmXhrResponder` from a small relation table
// shaped like the probe's answers (scripts/probe-mb-url-batch-by-discogs.py,
// tests/fixtures/mb-url-discogs-*.json). See docs/claude/discogs.md, "The
// MusicBrainz column".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const PAGES = {
    master: 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run',
    release: 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run',
};
const ALL_ANSWERS = answers('discogs-master', 'discogs-release', ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`));

// MusicBrainz ids (from the probe and its answers).
const MB = {
    bruce: '70248960-cb53-4ea4-943a-edb18f7d336f',
    appel: '2c048a96-2b43-453d-82d2-b2dfe8f542ed',
    columbiaRecords: '7b94f338-4985-445c-b65b-1dcf41b80c16',
    recordPlant: '17a358af-0983-472a-a351-b10effbe1c54',
    rel1: 'dd145ca9-034b-4c1f-b743-507267b1b85e',
    rel2: '86a7ac30-d876-4e1d-8eb9-cbe7687a718d',
    rel3: '998bcde9-e209-482f-bc26-2a45c03039c7',
};
const IMPORTER_KEY = 'DISCOGS_MBLINKS_CACHE-v3.1';
const NOW = Date.now();
// What the importer has looked up already (its own keys and entry shape).
const IMPORTER_CACHE = {
    'artist/219986/artist': { timestamp: NOW, urls: [{ url: `https://musicbrainz.org/artist/${MB.bruce}`, ended: false }] },
    'label/93330/label': { timestamp: NOW, urls: [`https://musicbrainz.org/label/${MB.columbiaRecords}`] },
    'release/29668336/release': {
        timestamp: NOW,
        urls: [{ url: `https://musicbrainz.org/release/${MB.rel1}`, ended: false }, { url: `https://musicbrainz.org/release/${MB.rel2}`, ended: true }],
    },
    // Empty (the importer's "nothing found") and too old: neither is trusted.
    'label/211334/label': { timestamp: NOW, urls: [] },
    'artist/219989/artist': { timestamp: NOW - 100 * 86400000, urls: [`https://musicbrainz.org/artist/${MB.appel}`] },
};
// What MusicBrainz knows (resource → relations, the Web Service's shape).
const MB_RELATIONS = {
    'https://www.discogs.com/label/265540': [{ 'target-type': 'place', type: 'discogs', ended: false, place: { id: MB.recordPlant } }],
    'https://www.discogs.com/artist/219990': [{ 'target-type': 'artist', type: 'discogs', ended: false, artist: { id: MB.appel } }],
    'https://www.discogs.com/release/5063678': [{ 'target-type': 'release', type: 'discogs', ended: false, release: { id: MB.rel3 } }],
};

/**
 * Loads a discogs.com page fixture with the userscript, the Discogs API
 * answered from the captures, MusicBrainz's /ws/2/url from `MB_RELATIONS`
 * (or a network error while `window.__mbFail` is set), and everything else
 * aborted.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} kind - 'master' or 'release'.
 * @param {{importer?: boolean, settings?: Object, fail?: boolean}} [opts]
 * @returns {Promise<{errors: string[]}>}
 */
async function openDg(page, kind, { importer = true, settings = {}, fail = false } = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.context().addInitScript(([r, rels, key, cache, failing]) => {
        window.__gmXhrResponses = r;
        if (failing && window.__mbFail === undefined) window.__mbFail = true;
        if (cache && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(cache));
        window.__gmXhrResponder = (opts) => {
            const u = new URL(opts.url);
            if (u.origin !== 'https://musicbrainz.org' || u.pathname !== '/ws/2/url') return undefined;
            if (window.__mbFail) return { error: 'network down' };
            const urls = u.searchParams.getAll('resource').filter(x => rels[x]).map(x => ({ id: 'u', resource: x, relations: rels[x] }));
            const body = urls.length === 1 && u.searchParams.getAll('resource').length === 1 ? urls[0]
                : { 'url-count': urls.length, 'url-offset': 0, urls };
            if (u.searchParams.getAll('resource').length === 1 && !urls.length) return { status: 404, responseText: '{"error":"Not Found"}' };
            return { status: 200, responseHeaders: 'Content-Type: application/json', responseText: JSON.stringify(body) };
        };
    }, [ALL_ANSWERS, MB_RELATIONS, IMPORTER_KEY, importer ? IMPORTER_CACHE : null, fail]);
    await loadUserscriptPage(page, {
        url: PAGES[kind],
        fixtureFile: path.join(__dirname, `dg-${kind}.html`),
        testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    return { errors };
}

/**
 * Presses a toolbar button by its label and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.locator(`#mb-dg-root button[data-label="${label}"]`).click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

// The requests to MusicBrainz's Web Service so far.
const mbLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).filter(r => r.url.startsWith('https://musicbrainz.org/ws/2/')));
// A rendered table's header names (first header row).
const heads = (table) => table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
// The sub-table of a heading.
const sub = (page, heading) => page.locator('#mb-dg-root h3').filter({ hasText: heading }).first().locator('xpath=following-sibling::table[1]');

/**
 * The MusicBrainz cell of the first row whose identifying column links `href`.
 *
 * @param {import('@playwright/test').Locator} table
 * @param {string} key - The cell's Discogs entity ("label/265540").
 * @returns {import('@playwright/test').Locator}
 */
const mbCell = (table, key) => table.locator(`td.mb-dg-mb-cell[data-mb-dg-key="${key}"]`).first();

/**
 * Waits until no MusicBrainz cell is pending any more.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function settled(page) {
    await expect.poll(() => page.locator('#mb-dg-root td.mb-dg-mb-cell[data-mb-dg-state="pending"]').count(), { timeout: 15000 }).toBe(0);
}

/**
 * Expands every collapsed sub-table (they start collapsed on a multi-table
 * pageType) and asserts it worked.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function expandAll(page) {
    const btn = page.locator('.mb-master-toggle').first();
    if (await btn.count() && /Show/i.test(await btn.textContent())) await btn.click();
    await expect.poll(() => page.locator('#mb-dg-root table.tbl:visible').count()).toBeGreaterThan(1);
}

/**
 * Opens a column's 📊 dropdown (clicked by script: the header may sit in a
 * collapsed sub-table).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} table
 * @param {string} col
 * @returns {Promise<void>}
 */
async function openUniq(page, table, col) {
    await table.evaluate((t, name) => {
        const th = Array.from(t.querySelectorAll('thead tr:first-child th')).find(x => (x.dataset.colName || '') === name);
        th.querySelector('.mb-col-uniq-wrap').click();
    }, col);
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
}

// The entries of one 📊 section, as [label, count] pairs.
const sectionItems = (page, sec) => page.evaluate((name) => {
    const el = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((x) => x.querySelector('.mb-uniq-section-label')?.textContent === name);
    return el ? Array.from(el.querySelectorAll('.mb-col-uniq-item')).map(i => i.dataset.mbUniqSynLabel) : null;
}, sec);

// Clicks one synthetic dropdown entry by its section and entry label.
const clickSynItem = (page, sectionLabel, itemLabel) => page.evaluate(([sec, lbl]) => {
    const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((x) => x.querySelector('.mb-uniq-section-label')?.textContent === sec);
    Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).find((el) => el.dataset.mbUniqSynLabel === lbl).click();
}, [sectionLabel, itemLabel]);

test.describe('discogs.com: the MusicBrainz column (2026-10-19)', () => {
    test('without the importer there is no MusicBrainz column, and MusicBrainz is never asked', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { importer: false });
        await press(page, 'Show tracklist, credits and other versions');
        const all = await page.locator('#mb-dg-root table.tbl').evaluateAll(ts => ts.map(t => Array.from(t.querySelectorAll('thead tr:first-child th'))
            .map(th => th.dataset.colName || th.textContent.trim())));
        expect(all.length).toBeGreaterThan(4);
        all.forEach(cols => expect(cols).not.toContain('MusicBrainz'));
        await expect(page.locator('td.mb-dg-mb-cell')).toHaveCount(0);
        expect(await mbLog(page)).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a release: the column right after Name/Title on Credits, Companies and Other versions; never on Tracklist or Identifiers', async ({ page }) => {
        const { errors } = await openDg(page, 'release');
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        const cols = (h) => heads(sub(page, h));
        expect((await cols('Credits')).slice(0, 4)).toEqual(['Role', 'Name', 'MusicBrainz', 'Tracks']);
        expect((await cols('Companies, etc.')).slice(0, 4)).toEqual(['Role', 'Name', 'MusicBrainz', 'Cat#']);
        const ov = await cols('Other versions');
        expect(ov[ov.indexOf('Title') + 1]).toBe('MusicBrainz');
        expect(await cols('Tracklist')).not.toContain('MusicBrainz');
        expect(await cols('Barcode and Other Identifiers')).not.toContain('MusicBrainz');
        expect(errors).toEqual([]);
    });

    test('cells: the importer\'s cache at once, MusicBrainz for the rest in ONE request (one inc for every type), a place before a label, all on one line', async ({ page }) => {
        const { errors } = await openDg(page, 'release');
        const before = await page.evaluate(k => localStorage.getItem(k), IMPORTER_KEY);
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        await expandAll(page);
        const credits = sub(page, 'Credits');
        const companies = sub(page, 'Companies, etc.');
        // From the importer's cache: Bruce Springsteen.
        await expect(mbCell(credits, 'artist/219986').locator('a.mb-dg-mb-link')).toHaveAttribute('href', `https://musicbrainz.org/artist/${MB.bruce}`);
        // From MusicBrainz: Mike Appel; an expired importer entry (Jon Landau) asked again, nothing found → a search box.
        await expect(mbCell(credits, 'artist/219990').locator('a.mb-dg-mb-link')).toHaveAttribute('href', `https://musicbrainz.org/artist/${MB.appel}`);
        const landau = mbCell(credits, 'artist/219989');
        await expect(landau.locator('a.mb-dg-mb-link')).toHaveCount(0);
        await expect(landau.locator('.mb-dg-mb-search a')).toHaveAttribute('href', 'https://musicbrainz.org/search?query=Jon%20Landau&type=artist&indexed=1');
        // A credit without a Discogs id: an empty cell.
        await expect(credits.locator('td.mb-dg-mb-cell:not([data-mb-dg-key])')).toHaveCount(1);
        // Companies: Record Plant is a MusicBrainz PLACE (the label not shown);
        // Columbia Records a label from the cache with a "P?" box; CBS Inc. neither.
        const plant = mbCell(companies, 'label/265540');
        await expect(plant.locator('a.mb-dg-mb-link')).toHaveAttribute('href', `https://musicbrainz.org/place/${MB.recordPlant}`);
        await expect(plant.locator('.mb-dg-mb-search')).toHaveCount(0);
        const colRec = mbCell(companies, 'label/93330');
        expect(await colRec.locator('.mb-dg-mb-search').evaluateAll(b => b.map(x => x.dataset.type))).toEqual(['place']);
        await expect(colRec.locator('a.mb-dg-mb-link')).toHaveAttribute('href', `https://musicbrainz.org/label/${MB.columbiaRecords}`);
        expect(await mbCell(companies, 'label/211334').locator('.mb-dg-mb-search').evaluateAll(b => b.map(x => x.dataset.type))).toEqual(['place', 'label']);
        // Up to 100 entities a request (the 101st would be dropped silently),
        // none asked twice, none the importer knew; every request anonymous,
        // exact resource URLs; the first (Credits and Companies come first)
        // asks every type it needs in ONE inc.
        const log = await mbLog(page);
        const asked = log.map(r => new URL(r.url).searchParams.getAll('resource'));
        const keys = await page.locator('#mb-dg-root td.mb-dg-mb-cell[data-mb-dg-key]').evaluateAll(tds => new Set(tds.map(td => td.dataset.mbDgKey)).size);
        expect(asked.every(a => a.length <= 100 && a.length > 0)).toBe(true);
        const flat = asked.flat();
        expect(new Set(flat).size).toBe(flat.length);
        expect(log).toHaveLength(Math.ceil(flat.length / 100));
        expect(flat.length).toBe(keys - 2);
        expect(flat).not.toContain('https://www.discogs.com/artist/219986');
        expect(flat).toContain('https://www.discogs.com/artist/219989');
        expect(flat.every(r => /^https:\/\/www\.discogs\.com\/(release|artist|label|master)\/\d+$/.test(r))).toBe(true);
        expect(log.every(r => r.anonymous)).toBe(true);
        const first = new URL(log[0].url);
        expect(first.searchParams.getAll('resource')).toContain('https://www.discogs.com/label/265540');
        expect(first.searchParams.get('inc').split(' ').sort()).toEqual(['artist-rels', 'label-rels', 'place-rels', 'release-rels']);
        // One line: a box and a link side by side, never wrapped.
        const h = await colRec.locator('.mb-dg-mb-row').evaluate(el => el.getBoundingClientRect().height);
        expect(h).toBeLessThanOrEqual(20);
        // The importer's data is read, never written.
        expect(await page.evaluate(k => localStorage.getItem(k), IMPORTER_KEY)).toBe(before);
        expect(errors).toEqual([]);
    });

    test('our own store: a second visit asks MusicBrainz nothing (a "nothing found" is remembered too)', async ({ page }) => {
        await openDg(page, 'release');
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        expect((await mbLog(page)).length).toBeGreaterThan(0);
        // The same browser profile loads the page again (the userscript is
        // injected by the loader, so a plain reload would run without it).
        await openDg(page, 'release');
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        expect(await mbLog(page)).toEqual([]);
        await expandAll(page);
        await expect(mbCell(sub(page, 'Companies, etc.'), 'label/265540').locator('a.mb-dg-mb-link'))
            .toHaveAttribute('href', `https://musicbrainz.org/place/${MB.recordPlant}`);
        await expect(mbCell(sub(page, 'Credits'), 'artist/219989').locator('.mb-dg-mb-search')).toHaveCount(1);
    });

    test('a master: an ended release greyed, a count from two links up; the cell\'s text is its MusicBrainz ids, never the box letters', async ({ page }) => {
        const { errors } = await openDg(page, 'master');
        await press(page, 'Show all versions');
        await settled(page);
        const table = page.locator('#mb-dg-root table.tbl').first();
        const cols = await heads(table);
        expect(cols[cols.indexOf('Title') + 1]).toBe('MusicBrainz');
        const two = mbCell(table, 'release/29668336');
        await expect(two.locator('a.mb-dg-mb-link')).toHaveCount(2);
        await expect(two.locator('a.mb-dg-mb-link.mb-dg-mb-ended')).toHaveCount(1);
        await expect(two.locator('.mb-dg-mb-n')).toHaveText('2');
        await expect(mbCell(table, 'release/5063678').locator('.mb-dg-mb-n')).toHaveCount(0);
        // The text filters, sorting and 📊 read: the MBIDs only — never a
        // box's "R?" or the count badge (_CLEAN_STRIP_SEL).
        const clean = (key) => mbCell(table, key).evaluate(td => window.__saTest.cleanColumnText(td).replace(/\s+/g, ' ').trim());
        expect(await clean('release/29668336')).toBe(`release ${MB.rel1} release ${MB.rel2}`);
        expect(await clean('release/22770998')).toBe('');
        // Filtering the column by an MBID finds the row; "R?" (a box) finds nothing.
        const i = cols.indexOf('MusicBrainz');
        const input = table.locator('thead .mb-col-filter-input').nth(i);
        await input.click();
        await input.fill(MB.rel2.slice(0, 8));
        await expect(table.locator('tbody > tr')).toHaveCount(1);
        await input.fill('R?');
        await expect(table.locator('tbody > tr')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('📊 "MusicBrainz - Links": links per row, counts in order; ticking "2" keeps that row and rings its icons', async ({ page }) => {
        const { errors } = await openDg(page, 'master');
        await press(page, 'Show all versions');
        await settled(page);
        const table = page.locator('#mb-dg-root table.tbl').first();
        const counts = await table.locator('td.mb-dg-mb-cell').evaluateAll(tds => {
            const m = {};
            tds.forEach(td => { m[td.dataset.mbDgN] = (m[td.dataset.mbDgN] || 0) + 1; });
            return m;
        });
        expect(counts['2']).toBe(1);
        await openUniq(page, table, 'MusicBrainz');
        expect(await sectionItems(page, 'MusicBrainz - Links')).toEqual(Object.keys(counts).sort((a, b) => a - b).map(n => `» MB links: ${n}`));
        await clickSynItem(page, 'MusicBrainz - Links', '» MB links: 2');
        await expect(table.locator('tbody > tr')).toHaveCount(1);
        await expect(table.locator('td.mb-dg-mb-cell a.mb-dg-mb-link.mb-rel-icon-match')).toHaveCount(2);
        expect(errors).toEqual([]);
    });

    test('📊 while a lookup is open: "» MB links: pending"; ticked, it lets rows go as their answers arrive (the filter runs again after a late fill)', async ({ page }) => {
        await openDg(page, 'master', { settings: { sa_dg_mb_auto_lookup: false } });
        await press(page, 'Show all versions');
        const table = page.locator('#mb-dg-root table.tbl').first();
        await openUniq(page, table, 'MusicBrainz');
        expect(await sectionItems(page, 'MusicBrainz - Links')).toEqual(['» MB links: 2', '» MB links: pending']);
        await clickSynItem(page, 'MusicBrainz - Links', '» MB links: pending');
        const pending = await table.locator('td.mb-dg-mb-cell[data-mb-dg-state="pending"]').count();
        expect(pending).toBeGreaterThan(100);
        await expect(table.locator('tbody > tr')).toHaveCount(pending);
        await page.keyboard.press('Escape');
        await page.locator('.mb-dgmb-col-hdr-btn').first().click();
        await expect.poll(() => table.locator('tbody > tr').count(), { timeout: 20000 }).toBe(0);
    });

    test('a late answer reaches the source rows: a multi-table re-render (a sort) keeps it', async ({ page }) => {
        await openDg(page, 'release');
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        await expandAll(page);
        const companies = sub(page, 'Companies, etc.');
        await expect(mbCell(companies, 'label/265540').locator('a.mb-dg-mb-link')).toHaveCount(1);
        // A sort re-clones every sub-table's rows from groupedRows (multi-table
        // renders always clone), so the cell can only survive on the source row.
        const nameTh = companies.locator('thead tr:first-child th[data-col-name="Name"]');
        await waitForSortSettled(page, () => nameTh.locator('.sort-icon-btn', { hasText: '▼' }).first().click(), { subTableHeading: 'Companies, etc.' });
        await expect(mbCell(sub(page, 'Companies, etc.'), 'label/265540').locator('a.mb-dg-mb-link'))
            .toHaveAttribute('href', `https://musicbrainz.org/place/${MB.recordPlant}`);
        await expect(sub(page, 'Companies, etc.').locator('td.mb-dg-mb-cell[data-mb-dg-state="pending"]')).toHaveCount(0);
    });

    test('a failed lookup shows ⚠; clicking it asks again and fills the cell', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { fail: true });
        await press(page, 'Show tracklist, credits and other versions');
        await expect.poll(() => page.locator('#mb-dg-root td.mb-dg-mb-cell[data-mb-dg-state="error"]').count(), { timeout: 15000 }).toBeGreaterThan(0);
        await expandAll(page);
        const plant = mbCell(sub(page, 'Companies, etc.'), 'label/265540');
        await expect(plant.locator('.mb-dg-mb-search[data-state="error"]')).toHaveCount(2);
        await expect(page.locator('.mb-dgmb-col-hdr-btn').first()).toHaveAttribute('data-dgmb-state', 'error');
        await page.evaluate(() => { window.__mbFail = false; });
        await plant.locator('.mb-dg-mb-search[data-state="error"]').first().click();
        await settled(page);
        await expect(page.locator('#mb-dg-root td.mb-dg-mb-cell[data-mb-dg-state="error"]')).toHaveCount(0);
        await expect(mbCell(sub(page, 'Companies, etc.'), 'label/265540').locator('a.mb-dg-mb-link'))
            .toHaveAttribute('href', `https://musicbrainz.org/place/${MB.recordPlant}`);
        expect(errors).toEqual([]);
    });

    test('automatic lookups off: nothing is asked until ▶ MB is pressed', async ({ page }) => {
        await openDg(page, 'master', { settings: { sa_dg_mb_auto_lookup: false } });
        await press(page, 'Show all versions');
        // Give an automatic start every chance: a full 📊 round trip on the
        // column (its own render and our store's read finish long before).
        const table = page.locator('#mb-dg-root table.tbl').first();
        await openUniq(page, table, 'MusicBrainz');
        await page.keyboard.press('Escape');
        await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden();
        await expect(table.locator('td.mb-dg-mb-cell[data-mb-dg-state="pending"]').first()).toBeAttached();
        expect(await mbLog(page)).toEqual([]);
        const btn = page.locator('.mb-dgmb-col-hdr-btn').first();
        await expect(btn).toHaveAttribute('aria-pressed', 'false');
        await btn.click();
        await settled(page);
        expect((await mbLog(page)).length).toBeGreaterThan(0);
        await expect(btn).toHaveAttribute('aria-pressed', 'true');
    });
});

/**
 * Answers the MusicBrainz cards' artist lookups (`/ws/2/artist/<id>`) with
 * Bruce Springsteen's card answer, before the spec's own responder; every
 * such request is logged in `window.__mbCardAsked`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function answerArtistCards(page) {
    const body = fs.readFileSync(path.join(__dirname, 'ws2-pop-artist-bruce.json'), 'utf8');
    await page.evaluate((b) => {
        const prev = window.__gmXhrResponder;
        window.__mbCardAsked = [];
        window.__gmXhrResponder = (opts) => {
            const u = new URL(opts.url);
            if (u.origin === 'https://musicbrainz.org' && /^\/ws\/2\/artist\/[0-9a-f-]{36}$/.test(u.pathname)) {
                window.__mbCardAsked.push(opts.url);
                return { status: 200, responseHeaders: 'Content-Type: application/json', responseText: b };
            }
            return prev(opts);
        };
    }, body);
}

/**
 * Hovers an element with Ctrl held, as the link preview specs do.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 * @returns {Promise<void>}
 */
async function ctrlHover(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
}

// org/TODO.org "some more BB and MB fixes/enhancements" 5b/5c (vzell,
// 2026-10-24): the MusicBrainz icons on discogs.com — ours and murdos'
// importer's — show MusicBrainz's own card, asked from musicbrainz.org
// through GM, with its links pointing at musicbrainz.org.
test.describe('discogs.com: MusicBrainz cards for the MusicBrainz icons (2026-10-24)', () => {
    test('our MusicBrainz column: an icon shows the artist\'s MusicBrainz card; Space opens its window', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { settings: { sa_pop_mb: true } });
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        await expandAll(page);
        await answerArtistCards(page);
        const icon = mbCell(sub(page, 'Credits'), 'artist/219986').locator('a.mb-dg-mb-link');
        await expect(icon).toHaveAttribute('href', `https://musicbrainz.org/artist/${MB.bruce}`);
        expect(await icon.evaluate((a) => window.__saTest.popResolve(a))).toBe(`dg-mb|artist:${MB.bruce}`);
        const card = page.locator('#mb-dp-peek');
        await ctrlHover(page, icon);
        await expect(card).toContainText('Bruce Springsteen');
        await expect(card).toContainText('fetched now');
        const asked = await page.evaluate(() => window.__mbCardAsked);
        expect(asked, 'one lookup, from musicbrainz.org').toHaveLength(1);
        expect(asked[0]).toMatch(new RegExp(`^https://musicbrainz\\.org/ws/2/artist/${MB.bruce}\\?`));
        expect(await card.locator('a[href^="/"]').count(), 'no link names discogs.com').toBe(0);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.mb-dp-area')).toContainText('Bruce Springsteen');
        expect(await dialog.locator('.mb-dp-area a[href^="/"]').count(), 'nor in the window').toBe(0);
        expect(errors).toEqual([]);
    });

    test('murdos\' importer\'s icon in Discogs\' content: the same card, on the initial page', async ({ page }) => {
        // sa_pop_ext too: the Discogs name beside the icon is its preview's.
        const { errors } = await openDg(page, 'release', { settings: { sa_pop_mb: true, sa_pop_ext: true } });
        await answerArtistCards(page);
        // The importer's markup (debug/bb-release-born-to-run-with-MB-links-initial.html).
        await page.evaluate((id) => {
            const w = document.createElement('span');
            w.className = 'mb_wrapper';
            w.innerHTML = `<span class="mb_valign"><a href="https://musicbrainz.org/artist/${id}" title="See this artist on MusicBrainz">` +
                '<img src="https://musicbrainz.org/static/images/entity/artist.svg" height="16" width="16"></a> </span>' +
                '<span class="mb_valign"><a href="/artist/219986-Bruce-Springsteen" mlink="artist/219986" mlink_done="artist">Bruce Springsteen</a></span>';
            document.querySelector('#app h1').appendChild(w);
        }, MB.bruce);
        const icon = page.locator('#app .mb_wrapper a[href^="https://musicbrainz.org/"]');
        expect(await icon.evaluate((a) => window.__saTest.popResolve(a))).toBe(`dg-mb|artist:${MB.bruce}`);
        // The Discogs name beside it stays Discogs' (WIP.3).
        expect(await page.locator('#app .mb_wrapper a[mlink]').evaluate((a) => window.__saTest.popResolve(a))).toMatch(/^ext\|ext:discogs:/);
        const card = page.locator('#mb-dp-peek');
        await ctrlHover(page, icon);
        await expect(card).toContainText('Bruce Springsteen');
        await expect(card.locator('.mb-pop-kind-head')).toContainText('Artist');
        expect(await page.evaluate(() => window.__mbCardAsked)).toHaveLength(1);
        // A search box is no entity: nothing.
        await page.evaluate(() => {
            const s = document.createElement('a');
            s.className = 'mb_search_link';
            s.href = 'https://musicbrainz.org/search?query=Columbia&type=series&indexed=1';
            s.textContent = 'S?';
            document.querySelector('#app h1').appendChild(s);
        });
        expect(await page.locator('#app a.mb_search_link').evaluate((a) => window.__saTest.popResolve(a))).toBeNull();
        expect(errors).toEqual([]);
    });
});
