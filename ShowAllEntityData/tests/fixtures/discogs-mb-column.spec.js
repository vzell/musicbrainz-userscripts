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
 * MusicBrainz PAGES as musicbrainz.org answers a script from discogs.com
 * (org/POH-headerline.org item 3, probe P1): the browser check for an
 * anonymous request; with the cookies a documentation page (`/doc/…`), a
 * tag page (`/tag/…`) or, for anything else, an artist's editing history.
 * Every page request is logged in `window.__mbPageAsked` (path, anonymous).
 * MusicBrainz's entity glyphs are served too (a card drops an image that
 * does not load).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function answerMbPages(page) {
    const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
    await page.route('https://musicbrainz.org/static/images/entity/**', (route) => route.fulfill({
        status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
    }));
    await page.evaluate(([edits, doc, tag]) => {
        const prev = window.__gmXhrResponder;
        window.__mbPageAsked = [];
        window.__gmXhrResponder = (opts) => {
            const u = new URL(opts.url);
            if (u.origin === 'https://musicbrainz.org' && !/^\/(?:ws\/2|static)\//.test(u.pathname)) {
                window.__mbPageAsked.push({ path: u.pathname, anonymous: opts.anonymous === true });
                const body = opts.anonymous
                    ? '<html><head><title>Verifying your browser</title></head><body><form action="/__meb_verify"></form></body></html>'
                    : (u.pathname.startsWith('/doc/') ? doc : u.pathname.startsWith('/tag/') ? tag : edits);
                return { status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: body };
            }
            return prev(opts);
        };
    }, [read('edits-page-artist.html'), read('doc-style-titles.html'), read('tag-page-alternative-rock.html')]);
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
        // MusicBrainz's entity glyphs load (the card drops an image that does
        // not); registered after openDg()'s abort-all, so this one wins.
        await page.route('https://musicbrainz.org/static/images/entity/**', (route) => route.fulfill({
            status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
        }));
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
        // MusicBrainz's glyph, from musicbrainz.org: on discogs.com this
        // origin's /static/… is Discogs' (org/POH-headerline.org item 3).
        const GLYPH = 'https://musicbrainz.org/static/images/entity/artist.svg';
        await expect(card.locator(':scope > .mb-pop-kind-head > img.mb-pop-kind-icon')).toHaveAttribute('src', GLYPH);
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.mb-dp-area')).toContainText('Bruce Springsteen');
        expect(await dialog.locator('.mb-dp-area a[href^="/"]').count(), 'nor in the window').toBe(0);
        const glyph = dialog.locator(':scope > div > span').first().locator('.mb-dp-crumb > a.mb-dp-crumb-g');
        await expect(glyph.locator('img.mb-dp-kind-icon')).toHaveAttribute('src', GLYPH);
        // MusicBrainz's documentation is read here too (since Step 3, with the
        // browser's cookies): no "opens in a new tab" tip on the glyph.
        await expect(glyph).toHaveAttribute('href', 'https://musicbrainz.org/doc/Artist');
        expect(await glyph.getAttribute('data-mb-tip'), 'a card reads it').toBeNull();
        expect(errors).toEqual([]);
    });

    // org/POH-headerline.org item 3 (vzell, 2026-10-28): the window has its
    // editing history and its Live page here too. Both are MusicBrainz PAGES,
    // which answer an anonymous request with the browser check: they are read
    // with the browser's cookies (`_mbPageGetForeign()`, probed from
    // discogs.com: scripts/probe-dg-poh-headerline.user.js P1). The stub
    // answers an anonymous page request with the check, as MusicBrainz does.
    test('a MusicBrainz window: ✎ Editing history ▾ and Live page, its pages read with the browser\'s cookies', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { settings: { sa_pop_mb: true } });
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        await expandAll(page);
        await answerArtistCards(page);
        await answerMbPages(page);
        await ctrlHover(page, mbCell(sub(page, 'Credits'), 'artist/219986').locator('a.mb-dg-mb-link'));
        await expect(page.locator('#mb-dp-peek')).toContainText('fetched now');
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        const title = dialog.locator(':scope > div > span').first();
        await expect(title).toHaveText('Artist');
        const hist = dialog.locator('button.mb-meh-hist-btn');
        await expect(hist).toBeVisible();
        await expect(dialog.locator('button.mb-meh-hist-more'), 'the presets too: an entity\'s').toBeVisible();
        const live = dialog.locator('button.mb-dp-tbtn', { hasText: 'Live page' });
        await expect(live).toBeVisible();
        await hist.click();
        await expect(title).toHaveText('Artist › Editing history');
        // Behind the one MusicBrainz gate, which the column's lookups and the
        // artist window's own lists keep busy here.
        await expect(dialog.locator('.mb-meh-e').first()).toBeVisible({ timeout: 30000 });
        await expect(dialog.locator('.mb-dp-area')).not.toContainText('verify itself');
        await dialog.getByRole('button', { name: /Back/ }).click();
        await expect(title).toHaveText('Artist');
        // The path's glyph: MusicBrainz's documentation, its card on a rest
        // and the page in the window on a click (vzell, 2026-10-28: it
        // opened a new tab here).
        const glyph = title.locator('.mb-dp-crumb > a.mb-dp-crumb-g');
        await ctrlHover(page, glyph);
        await expect(page.locator('#mb-dp-peek > .mb-pop-kind-head')).toHaveText('Documentation', { timeout: 30000 });
        await page.mouse.move(0, 0);
        await glyph.click();
        await expect(title).toHaveText('Artist › Documentation');
        await expect(dialog.locator('.mb-dp-area .mb-dp-xtitle')).toHaveText('Style / Titles', { timeout: 30000 });
        await dialog.getByRole('button', { name: /Back/ }).click();
        await expect(title).toHaveText('Artist');
        await live.click();
        await expect(dialog.locator('.mb-dp-live iframe')).toHaveCount(1);
        await expect.poll(() => page.evaluate(() => window.__mbPageAsked.map(x => x.path)), { timeout: 30000 }).toEqual([
            `/artist/${MB.bruce}/edits`, '/doc/Artist', `/artist/${MB.bruce}`,
        ]);
        expect(await page.evaluate(() => window.__mbPageAsked.every(x => !x.anonymous)), 'with the browser\'s cookies').toBe(true);
        expect(errors).toEqual([]);
    });

    // vzell, 2026-10-28: "Genres -> tags link do not open inside the same
    // window and do not have a hover window". A genre's link is /tag/<name>,
    // not an entity by MBID: `_dgMbWinTarget()` now reads every link a
    // MusicBrainz card knows, its page with the browser's cookies.
    test('in a MusicBrainz window, a genre\'s tag link opens here and has its card', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { settings: { sa_pop_mb: true } });
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        await expandAll(page);
        await answerArtistCards(page);
        await answerMbPages(page);
        await ctrlHover(page, mbCell(sub(page, 'Credits'), 'artist/219986').locator('a.mb-dg-mb-link'));
        await expect(page.locator('#mb-dp-peek')).toContainText('fetched now');
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        const title = dialog.locator(':scope > div > span').first();
        const genre = dialog.locator('.mb-dp-area a[href="https://musicbrainz.org/tag/americana"]');
        await expect(genre).toBeVisible();
        // Marked as opening here, not as leaving the page (↗).
        await expect(genre).toHaveClass(/\bmb-dp-l-here\b/);
        await expect(genre).not.toHaveClass(/\bmb-dp-l-out\b/);
        await ctrlHover(page, genre);
        await expect(page.locator('#mb-dp-peek > .mb-pop-kind-head')).toHaveText('Tag', { timeout: 30000 });
        await expect(page.locator('#mb-dp-peek')).toContainText('fetched now', { timeout: 30000 });
        await page.mouse.move(0, 0);
        await genre.click();
        await expect(title).toHaveText('Artist › Tag');
        expect(await page.evaluate(() => window.__mbPageAsked), 'the tag page, with the browser\'s cookies, once')
            .toEqual([{ path: '/tag/americana', anonymous: false }]);
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

// org/discogs.org 1b/4b (vzell, 2026-10-26): a musicbrainz.org link INSIDE
// the window on discogs.com (a Discogs label's Sites, a release's Notes, a
// MusicBrainz window's own links) shows MusicBrainz's card on a hover and
// opens in the window on a click, instead of a new tab.
test.describe('discogs.com: MusicBrainz links inside the window (2026-10-26)', () => {
    test('a MusicBrainz link in the window: its card on a hover, the window on a click, Back returns', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { settings: { sa_pop_mb: true } });
        await press(page, 'Show tracklist, credits and other versions');
        await settled(page);
        await expandAll(page);
        await answerArtistCards(page);
        await ctrlHover(page, mbCell(sub(page, 'Credits'), 'artist/219986').locator('a.mb-dg-mb-link'));
        await expect(page.locator('#mb-dp-peek')).toContainText('Bruce Springsteen');
        await page.keyboard.press('Space');
        const dialog = page.locator('#mb-dp-dialog');
        await expect(dialog.locator('.mb-dp-area')).toContainText('Bruce Springsteen');
        // The window's own requests answered (a repaint would drop the probe link).
        await expect.poll(() => dialog.locator('.mb-dp-area .mb-dp-spin').count(), { timeout: 15000 }).toBe(0);
        // A link as a Discogs window carries it (target=_blank, absolute).
        await page.evaluate((id) => {
            const a = document.createElement('a');
            a.id = 'probe-mb-link';
            a.href = `https://musicbrainz.org/artist/${id}`;
            a.target = '_blank';
            a.textContent = 'Mike Appel';
            document.querySelector('#mb-dp-dialog .mb-dp-area .mb-dp-col').appendChild(a);
        }, MB.appel);
        const link = dialog.locator('#probe-mb-link');
        let opened = 0;
        page.context().on('page', () => { opened++; });
        await page.evaluate(() => { window.__mbCardAsked = []; });
        await ctrlHover(page, link);
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__mbCardAsked.length), { message: 'the card asks MusicBrainz' }).toBeGreaterThan(0);
        expect((await page.evaluate(() => window.__mbCardAsked))[0]).toMatch(new RegExp(`^https://musicbrainz\\.org/ws/2/artist/${MB.appel}\\?`));
        await page.keyboard.press('Escape');
        await link.click();
        await expect(dialog.locator('#probe-mb-link'), 'the window shows the link\'s entity').toHaveCount(0);
        await expect(dialog.locator('.mb-dp-area')).toContainText('Bruce Springsteen');
        expect(opened, 'no new tab').toBe(0);
        // Back: the entity it came from (its markup again, without the probe).
        await page.keyboard.press('Backspace');
        await expect(dialog.locator('.mb-dp-area')).toContainText('Bruce Springsteen');
        expect(errors).toEqual([]);
    });
});

// org/discogs.org item 0 (vzell, 2026-10-26): Discogs' own artist hover
// card stays off an artist link of its page while our preview covers it.
test.describe('discogs.com: Discogs\' own artist hover card (2026-10-26)', () => {
    /**
     * Records the hover events a listener inside `#app` (where Discogs'
     * React root listens) sees on an artist link of the page.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<string[]>} The events seen after a hover.
     */
    async function hoverSeen(page) {
        await page.evaluate(() => {
            window.__appSaw = [];
            const app = document.getElementById('app');
            ['mouseover', 'mouseenter', 'pointerover'].forEach(t => app.addEventListener(t, (e) => {
                if (e.target.closest && e.target.closest('a[href^="/artist/"]')) window.__appSaw.push(t);
            }, true));
        });
        await page.mouse.move(0, 0);
        const a = page.locator('#app a[href^="/artist/219990"]').first();
        await a.scrollIntoViewIfNeeded();
        await a.hover();
        return page.evaluate(() => window.__appSaw);
    }

    test('with the link previews on, no hover event reaches #app; with them off, Discogs gets its hover', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { settings: { sa_pop_ext: true } });
        expect(await hoverSeen(page), 'Discogs never sees the hover').toEqual([]);
        expect(errors).toEqual([]);
    });

    test('with the link previews off, Discogs\' page sees the hover as before', async ({ page }) => {
        const { errors } = await openDg(page, 'release', { settings: { sa_pop_ext: false } });
        expect(await hoverSeen(page)).toEqual(expect.arrayContaining(['mouseover', 'pointerover']));
        expect(errors).toEqual([]);
    });
});
