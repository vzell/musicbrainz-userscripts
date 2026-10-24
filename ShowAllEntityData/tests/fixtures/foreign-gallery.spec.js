'use strict';

// The table-wide 🖼 gallery on the foreign tables, 2026-10-23
// (org/foreign-images.org, phase 4; mockup G2/G3,
// https://claude.ai/artifact/SL81qFidC4wQM6Gz2jY47Z): the 🖼 after the
// heading's row count, a Liner-notes window (#mb-fgal) that opens with ZERO
// requests (rows read before come from memory or this browser's saved
// pages), "Load the other N (about …)" one row at a time through the
// provider's rate gate, Stop / closing stops the run, Retry, a question
// before a run over five minutes, type chips, "Compare two", the viewer.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadSlListPage, SL_KINDS } = require('../support/slFixture');
const { loadBbYearPage, loadBbSongsPage, BB_YEAR_BUTTON, BB_BUTTON } = require('../support/bbFixture');
const { routeDetailPages } = require('../support/detailFixture');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter } = require('../support/filterSortAssertions');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const BASE = 'https://springsteenlyrics.com/';
const ITEM_4554 = `${BASE}bootlegs.php?item=4554&category=aud_live1967`;

const gal = (page) => page.locator('#mb-fgal');
const opener = (page) => page.locator('button.mb-fgal-btn').first();
const viewer = (page) => page.locator('#mb-art-viewer');
const fact = (page, label) => gal(page).locator('dl.mb-tt-ajfacts dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

/**
 * Collects page errors.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function errorsOf(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * The springsteenlyrics bootleg list, rendered; item pages and images routed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [settings]
 * @returns {Promise<{errors: string[], served: string[]}>}
 */
async function openSl(page, settings = {}) {
    const errors = errorsOf(page);
    await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_render_threshold: 100000, ...settings } });
    const { served } = await routeDetailPages(page, 'sl');
    await page.route(/^https:\/\/springsteenlyrics\.com\/.*\.jpg$/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.click(`button[data-label="${SL_KINDS.bootlegs.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return { errors, served };
}

/**
 * Writes one parsed page into the detail-page database, as `_dpGet()` would.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} host
 * @param {string} file
 * @param {string} url
 * @returns {Promise<void>}
 */
async function seedPage(page, host, file, url) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    await page.evaluate(([h, hst, u]) => new Promise((resolve, reject) => {
        const data = window.__saTest.dpParse(hst, h, u);
        const req = indexedDB.open('vz-saed-detail-pages', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('pages', { keyPath: 'url' });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const tx = req.result.transaction('pages', 'readwrite');
            tx.objectStore('pages').put({ url: u, v: window.__saTest.dpParserVersion, at: Date.now(), data });
            tx.oncomplete = () => { req.result.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        };
    }), [html, host, url]);
}

test.describe('foreign gallery: springsteenlyrics bootlegs (G2)', () => {
    test('the 🖼 sits right after the row count; opening asks nothing and counts the rows', async ({ page }) => {
        const { errors, served } = await openSl(page);
        await expect(opener(page)).toHaveCount(1);
        const after = await opener(page).evaluate(b => b.previousElementSibling && b.previousElementSibling.className);
        expect(after).toContain('mb-row-count-stat');
        const n = await page.evaluate(() => ({
            all: document.querySelectorAll('table.tbl tbody tr').length,
            art: document.querySelectorAll('table.tbl tbody a[data-mb-fi="sl"]:not([data-mb-sl-art="0"])').length,
        }));
        await opener(page).click();
        await expect(gal(page)).toBeVisible();
        await expect(fact(page, 'Rows')).toHaveText(`all ${n.all} rows, ${n.art} with "artwork available"`);
        await expect(fact(page, 'Shown')).toHaveText('0 rows · 0 images');
        await expect(gal(page).locator('button[data-mb-fgal-act="load"]')).toHaveText(new RegExp(`^Load the other ${n.art} \\(about `));
        await expect(gal(page).locator('.mb-tt-ajpill')).toHaveText('Idle');
        await expect(gal(page)).toContainText(`${n.all - n.art} rows the list marks "cover only" are not here`);
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });
});

// org/TODO.org "Some enhancements" 1 (vzell, 2026-10-24): the window moves
// by its title bar and resizes from its corner "like the other hover Space
// detail popups", and remembers both (`sa_fgal_geometry`,
// `_makeMovableResizable()`). Pinned: the geometry is APPLIED on reopen
// (not merely stored), a window never moved still opens under its 🖼, and a
// stored box larger than the window comes back inside it.
test.describe('foreign gallery: moved and resized, it remembers where (2026-10-24)', () => {
    /**
     * The window's box in viewport pixels, rounded.
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<{x: number, y: number, w: number, h: number, pos: string}>}
     */
    const boxOf = (page) => gal(page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), pos: getComputedStyle(el).position };
    });
    const stored = (page) => page.evaluate(() => window.GM_getValue('sa_fgal_geometry', null));

    test('never moved: it opens under its 🖼 and nothing is stored, also after closing', async ({ page }) => {
        const { errors } = await openSl(page);
        await opener(page).click();
        await expect(gal(page)).toBeVisible();
        const b = await opener(page).boundingBox();
        const g = await boxOf(page);
        expect(g.pos).toBe('absolute');
        expect(Math.abs(g.y - Math.round(b.y + b.height + 6)), 'right under the 🖼').toBeLessThanOrEqual(2);
        await page.keyboard.press('Escape');
        await expect(gal(page)).toHaveCount(0);
        expect(await stored(page), 'opening and closing store nothing').toBeNull();
        expect(errors).toEqual([]);
    });

    test('drag by the title bar, resize from the corner: closed and reopened, it comes back there at that size', async ({ page }) => {
        const { errors } = await openSl(page);
        await opener(page).click();
        await expect(gal(page)).toBeVisible();
        const head = gal(page).locator('.mb-fgal-head b');
        const hb = await head.boundingBox();
        const g0 = await boxOf(page);
        // Up to 20 px from the top and 120 px left: the whole window, its
        // corner too, is then on screen (it opened under the 🖼, low down).
        const dy = 20 - g0.y;
        await page.mouse.move(hb.x + 10, hb.y + 5);
        await page.mouse.down();
        await page.mouse.move(hb.x + 10 - 120, hb.y + 5 + dy, { steps: 6 });
        await page.mouse.up();
        const g1 = await boxOf(page);
        expect(g1.pos, 'a moved window stays put while the page scrolls').toBe('fixed');
        expect(g1.x).toBe(g0.x - 120);
        expect(g1.y).toBe(20);
        await expect.poll(() => stored(page)).toMatchObject({ left: g1.x, top: g1.y });
        // Resize from the lower-right corner, the browser's own handle.
        await page.mouse.move(g1.x + g1.w - 4, g1.y + g1.h - 4);
        await page.mouse.down();
        await page.mouse.move(g1.x + g1.w - 4 - 100, g1.y + g1.h - 4 - 150, { steps: 6 });
        await page.mouse.up();
        await expect.poll(async () => (await boxOf(page)).w).toBe(g1.w - 100);
        const g2 = await boxOf(page);
        expect(g2.h).toBe(g1.h - 150);
        await expect.poll(() => stored(page)).toMatchObject({ width: g2.w, height: g2.h, left: g1.x, top: g1.y });
        // The ✕ and Esc still work in the title bar: a press on ✕ is no drag.
        await gal(page).locator('.mb-fgal-x').click();
        await expect(gal(page)).toHaveCount(0);
        await page.mouse.wheel(0, 400);
        await opener(page).evaluate(b => b.scrollIntoView({ block: 'center' }));
        await opener(page).click();
        await expect(gal(page)).toBeVisible();
        expect(await boxOf(page), 'reopened where it was left, at that size').toEqual({ ...g2, pos: 'fixed' });
        expect(errors).toEqual([]);
    });

    test('a stored geometry larger than the window comes back inside it', async ({ page }) => {
        const { errors } = await openSl(page, { sa_fgal_geometry: { top: 5000, left: 5000, width: 9000, height: 9000 } });
        await opener(page).click();
        await expect(gal(page)).toBeVisible();
        const g = await boxOf(page);
        const vp = page.viewportSize();
        expect(g.pos).toBe('fixed');
        expect(g.x).toBeGreaterThanOrEqual(0);
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.x + g.w).toBeLessThanOrEqual(vp.width);
        expect(g.y).toBeLessThanOrEqual(vp.height - 40);
        await expect(gal(page).locator('.mb-fgal-x')).toBeInViewport();
        expect(errors).toEqual([]);
    });
});

test.describe('foreign gallery: the run, chips, Compare and the viewer', () => {
    /**
     * Narrows the table to the Castiles rows (4554 has an item page fixture,
     * 4553 answers 404) and opens the gallery on them.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<number>} Rows in scope.
     */
    async function castiles(page) {
        await typeGlobalFilter(page, 'Castiles');
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count()).toBeLessThan(10);
        const n = await page.locator('table.tbl tbody a[data-mb-fi="sl"]:not([data-mb-sl-art="0"])').count();
        await opener(page).click();
        await expect(fact(page, 'Rows')).toHaveText(`only the ${n} rows the filters show`);
        return n;
    }

    test('Load reads the rows one by one; a failure offers Retry; the pill says Done with errors', async ({ page }) => {
        const { errors, served } = await openSl(page);
        const n = await castiles(page);
        expect(n).toBeGreaterThanOrEqual(2);
        await gal(page).locator('button[data-mb-fgal-act="load"]').click();
        await expect(gal(page).locator('.mb-tt-ajpill')).toHaveText('Running');
        await expect(gal(page).locator('button[data-mb-fgal-act="stop"]')).toBeVisible();
        await expect(gal(page).locator('.mb-tt-ajpill')).toHaveText('Done with errors', { timeout: 20000 });
        expect(served.length).toBe(n);
        expect(served).toContain(ITEM_4554);
        // 4554 read: the cover and its scans; 4553 failed with its reason and Try again.
        const r4554 = gal(page).locator(`.mb-fgal-rel[data-mb-fgal-key="${ITEM_4554}"]`);
        await expect(r4554).toHaveAttribute('data-mb-fgal-state', 'read');
        expect(await r4554.locator('figure.mb-fgal-tile').count()).toBeGreaterThan(1);
        await expect(gal(page).locator('.mb-fgal-rel[data-mb-fgal-state="failed"]').first()).toContainText('Could not read the item page');
        await expect(gal(page).locator('button[data-mb-fgal-act="retry"]').first()).toHaveText(/^Retry \d+ failed$/);
        await expect(gal(page).locator('ul.mb-tt-ajlog')).toContainText('finished');
        expect(errors).toEqual([]);
    });

    test('closing the window stops the run; reopening says so and offers the rest', async ({ page }) => {
        const { errors, served } = await openSl(page);
        await castiles(page);
        await gal(page).locator('button[data-mb-fgal-act="load"]').click();
        await expect.poll(() => served.length, { timeout: 10000 }).toBe(1);
        await page.keyboard.press('Escape');
        await expect(gal(page)).toHaveCount(0);
        await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
        expect(served.length, 'nothing asked after the window closed').toBe(1);
        await opener(page).click();
        await expect(gal(page)).toContainText('Stopped when the window closed');
        await expect(gal(page).locator('button[data-mb-fgal-act="load"]')).toHaveText(/^Load the other \d+ /);
        expect(errors).toEqual([]);
    });

    test('a row read before is shown at open from the saved pages, with no request', async ({ page }) => {
        const { errors, served } = await openSl(page);
        await seedPage(page, 'springsteenlyrics.com', 'detail-sl-bootlegs-4554.html', ITEM_4554);
        await opener(page).click();
        await expect(fact(page, 'Shown')).toHaveText(/^1 row · \d+ images$/);
        await expect(gal(page).locator(`.mb-fgal-rel[data-mb-fgal-key="${ITEM_4554}"]`)).toContainText('read before');
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('chips filter the tiles; Compare puts two read rows side by side', async ({ page }) => {
        const { errors } = await openSl(page);
        const second = `${BASE}bootlegs.php?item=4553&category=aud_live1967`;
        await seedPage(page, 'springsteenlyrics.com', 'detail-sl-bootlegs-4554.html', ITEM_4554);
        await seedPage(page, 'springsteenlyrics.com', 'detail-sl-bootlegs-4554.html', second);
        await opener(page).click();
        await expect(fact(page, 'Shown')).toHaveText(/^2 rows · /);
        const chips = gal(page).locator('.mb-fgal-chip');
        await expect(chips.first()).toHaveText(/^All\d+$/);
        await gal(page).locator('.mb-fgal-chip[data-mb-fgal-type="Cover"]').click();
        const r = gal(page).locator(`.mb-fgal-rel[data-mb-fgal-key="${ITEM_4554}"] figure.mb-fgal-tile`);
        await expect(r).toHaveCount(1);
        await expect(r.first()).toHaveAttribute('aria-label', /^Cover/);
        await gal(page).locator('.mb-fgal-chip[data-mb-fgal-type=""]').click();
        expect(await r.count()).toBeGreaterThan(1);
        await gal(page).locator('[data-mb-fgal-act="compare"]').click();
        await expect(gal(page).locator('.mb-fgal-cmp-grid select')).toHaveCount(2);
        await expect(gal(page).locator('.mb-fgal-cmp-ty')).toHaveText(['Cover', 'Scan']);
        expect(errors).toEqual([]);
    });

    test('a click on an image opens the viewer over the window; Esc closes the viewer, then the window', async ({ page }) => {
        const { errors } = await openSl(page);
        await seedPage(page, 'springsteenlyrics.com', 'detail-sl-bootlegs-4554.html', ITEM_4554);
        await opener(page).click();
        const tile = gal(page).locator('figure.mb-fgal-tile').nth(1);
        await tile.click();
        await expect(viewer(page)).toBeVisible();
        await expect(viewer(page).locator('.mb-artv-pos')).toHaveText(/^2 \/ \d+$/);
        await page.keyboard.press('Escape');
        await expect(viewer(page)).toBeHidden();
        await expect(gal(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(gal(page)).toHaveCount(0);
        await expect(opener(page)).toHaveAttribute('aria-pressed', 'false');
        expect(errors).toEqual([]);
    });

    test('a filter re-render keeps the 🖼 right after the row count', async ({ page }) => {
        const { errors } = await openSl(page);
        await typeGlobalFilter(page, 'Matrix');
        await expect.poll(() => page.locator('table.tbl tbody tr:visible').count()).toBeLessThan(40);
        const after = await opener(page).evaluate(b => b.previousElementSibling && b.previousElementSibling.className);
        expect(after).toContain('mb-row-count-stat');
        await expect(page.locator('button.mb-fgal-btn')).toHaveCount(1);
        expect(errors).toEqual([]);
    });
});

test.describe('foreign gallery: a long run asks first (Brucebase songs)', () => {
    test('Load over five minutes asks; Esc cancels the question, not the window; Start runs', async ({ page }) => {
        const errors = errorsOf(page);
        await loadBbSongsPage(page, { settingsOverride: { sa_render_threshold: 100000 } });
        const { served } = await routeDetailPages(page, 'bb');
        await page.click(`button[data-label="${BB_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await opener(page).click();
        await gal(page).locator('button[data-mb-fgal-act="load"]').click();
        const ask = gal(page).locator('.mb-fgal-ask');
        await expect(ask).toContainText(/^Read [\d,]+ song pages\? About /);
        expect(served).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(ask).toHaveCount(0);
        await expect(gal(page)).toBeVisible();
        await gal(page).locator('button[data-mb-fgal-act="load"]').click();
        await gal(page).locator('button[data-mb-fgal-act="start"]').click();
        await expect(gal(page).locator('.mb-tt-ajpill')).toHaveText('Running');
        await expect.poll(() => served.length, { timeout: 10000 }).toBeGreaterThan(0);
        await gal(page).locator('button[data-mb-fgal-act="stop"]').click();
        await expect(gal(page)).toContainText('Stopped. The rows read so far stay read.');
        expect(errors).toEqual([]);
    });
});

test.describe('foreign gallery: Brucebase year, images grouped by kind', () => {
    test('the entries with a ringed icon; a read gig shows its kinds; the others are counted as not here', async ({ page }) => {
        const errors = errorsOf(page);
        await loadBbYearPage(page, '1985', { settingsOverride: { sa_render_threshold: 100000 } });
        const { served } = await routeDetailPages(page, 'bb');
        await page.route(/^https:\/\/brucebase\.wdfiles\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const gig = 'https://brucebase.wikidot.com/gig:1985-01-07-market-square-arena-indianapolis-in';
        await seedPage(page, 'brucebase.wikidot.com', 'detail-bb-gig-1985-01-07.html', gig);
        const n = await page.evaluate(() => ({
            all: document.querySelectorAll('table.tbl tbody tr').length,
            ringed: new Set(Array.from(document.querySelectorAll('table.tbl tbody a.mb-fi-media'), a => a.closest('tr'))).size,
        }));
        await opener(page).click();
        await expect(fact(page, 'Rows')).toHaveText(`all ${n.all} entries, ${n.ringed} with a ringed Media icon`);
        const rel = gal(page).locator(`.mb-fgal-rel[data-mb-fgal-key="${gig}"]`);
        await expect(rel.locator('.mb-fgal-kind')).toHaveText(['Ticket', 'Memorabilia', 'News']);
        await expect(gal(page)).toContainText(`${n.all - n.ringed} entries have no ringed icon`);
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test.describe('foreign gallery: discogs.com', () => {
    const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
    const answers = (...names) => Object.fromEntries(names.map((nm) => {
        const f = FX(nm);
        return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
    }));
    const API = 'https://api.discogs.com/';
    const { loadUserscriptPage } = require('../support/loadPage');

    /**
     * A discogs.com page fixture with the API answered from the captures.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} url
     * @param {string} file
     * @param {Object<string, *>} settings
     * @returns {Promise<string[]>} Page errors.
     */
    async function openDg(page, url, file, settings) {
        const errors = errorsOf(page);
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        const all = answers('discogs-master', 'discogs-release', 'discogs-artist', 'discogs-artist-small',
            ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`), ...[1, 2, 3, 4, 5, 6].map(p => `discogs-artist-small-p${p}`));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, all);
        await loadUserscriptPage(page, {
            url, fixtureFile: path.join(__dirname, file), testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000, ...settings },
        });
        return errors;
    }
    const apiLog = (page) => page.evaluate((api) => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith(api)), API);

    test('versions without a token: a row read by a hover is shown; chips primary/secondary; the button names the token\'s pace and asks', async ({ page }) => {
        const errors = await openDg(page, 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run', 'dg-master.html', { sa_pop_ext_discogs_token: '' });
        await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const table = page.locator('#mb-dg-root table.tbl').first();
        const thumb = table.locator('tbody > tr', { has: page.locator('a[href="https://www.discogs.com/release/1874253"]') }).first().locator('a.mb-dg-thumblink');
        await page.mouse.move(0, 0);
        await thumb.scrollIntoViewIfNeeded();
        await thumb.hover();
        await expect(page.locator('#mb-stat-tooltip .mb-art-card-tile')).toHaveCount(5, { timeout: 15000 });
        await page.mouse.move(0, 0);
        const before = (await apiLog(page)).length;
        await opener(page).click();
        await expect(fact(page, 'Shown')).toHaveText('1 row · 5 images');
        await expect(gal(page).locator('.mb-fgal-chip')).toHaveText(['All5', 'primary1', 'secondary4', 'Compare two']);
        await expect(gal(page).locator('button[data-mb-fgal-act="load"]')).toHaveText(/\(about \d+ min; about \d+ min with a Discogs token\)$/);
        await gal(page).locator('button[data-mb-fgal-act="load"]').click();
        await expect(gal(page).locator('.mb-fgal-ask')).toContainText(/^Read [\d,]+ Discogs records\?/);
        expect((await apiLog(page)).length, 'opening and asking request nothing').toBe(before);
        expect(errors).toEqual([]);
    });

    // vzell, 2026-10-24 (screenshots of a master's versions): "after opening
    // the window and trying to click/drag the popup window its size gets so
    // large that the resize handle is not visible anymore", and on a
    // Brucebase year the list "automatically scrolls inside when initially
    // resizing". The first: a drag lifted the height cap (`mb-geo-fixed`)
    // with no height pinned, so the window grew to its whole content. The
    // second: the body's scrollbar ran into the resize corner, so a press on
    // the grip held the scrollbar. Pinned: the size a drag starts with is
    // the size it ends with, the corner stays on screen, and a press held on
    // the corner is the window's (not the list's) and scrolls nothing.
    test('a tall list: a drag keeps the window\'s size and its corner on screen; a press on the corner scrolls nothing', async ({ page }) => {
        const errors = await openDg(page, 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run', 'dg-master.html', { sa_pop_ext_discogs_token: '' });
        await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await opener(page).click();
        await expect(gal(page)).toBeVisible();
        const box = () => gal(page).evaluate((el) => {
            const r = el.getBoundingClientRect();
            const body = el.querySelector('.mb-fgal-body');
            return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: r.bottom,
                bodyBottom: body.getBoundingClientRect().bottom, scrolls: body.scrollHeight > body.clientHeight + 50, scrollTop: body.scrollTop };
        });
        const g0 = await box();
        expect(g0.scrolls, 'the list is taller than the window (the case reported)').toBe(true);
        const hb = await gal(page).locator('.mb-fgal-head b').boundingBox();
        await page.mouse.move(hb.x + 10, hb.y + 5);
        await page.mouse.down();
        await page.mouse.move(hb.x + 30, hb.y + 5 - Math.min(40, g0.y), { steps: 4 });
        await page.mouse.up();
        const g1 = await box();
        expect(g1.h, 'the drag keeps the height').toBe(g0.h);
        expect(g1.w, 'and the width').toBe(g0.w);
        expect(g1.bottom, 'the corner is on screen').toBeLessThanOrEqual(page.viewportSize().height);
        // The corner is the window's own: under it is the window, not the
        // scrolling list, which ends above it.
        expect(g1.bodyBottom, 'the list ends above the resize corner').toBeLessThanOrEqual(g1.bottom - 12);
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y) === document.getElementById('mb-fgal'), [g1.x + g1.w - 5, g1.y + g1.h - 5]);
        expect(hit, 'the window itself is under the corner').toBe(true);
        await page.mouse.move(g1.x + g1.w - 5, g1.y + g1.h - 5);
        await page.mouse.down();
        // Held, not moved: a press on a scrollbar's track or arrow repeats
        // while it is held. The time is the test's subject, not a settle.
        await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
        await page.mouse.up();
        expect((await box()).scrollTop, 'holding the corner scrolls nothing').toBe(0);
        expect(errors).toEqual([]);
    });

    test('a multi-table release page: the sub-table with images (Other versions) has its 🖼 after its count, after a filter too; the others none', async ({ page }) => {
        const errors = await openDg(page, 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run', 'dg-release.html', { sa_pop_ext_discogs_token: 'tok-probe' });
        await page.locator('#mb-dg-root button[data-label="Show tracklist, credits and other versions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const check = () => page.evaluate(() => Array.from(document.querySelectorAll('#mb-dg-root table.tbl')).map(t => {
            const withImages = !!t.querySelector('tbody > tr a.mb-dg-thumblink');
            const btns = Array.from(document.querySelectorAll('button.mb-fgal-btn'));
            const b = btns.find(x => {
                const m = x.id.match(/(\d+)$/);
                return m && document.querySelectorAll('table.tbl')[Number(m[1])] === t;
            });
            return { withImages, has: !!b, afterCount: !!b && !!b.previousElementSibling && b.previousElementSibling.classList.contains('mb-row-count-stat'),
                inH3: !!b && b.parentElement.tagName === 'H3' };
        }));
        let s = await check();
        expect(s.length).toBeGreaterThan(2);
        expect(s.filter(x => x.withImages).length).toBe(1);
        expect(s.filter(x => x.withImages && !(x.has && x.afterCount && x.inH3))).toEqual([]);
        expect(s.filter(x => !x.withImages && x.has), 'no 🖼 on a sub-table without images').toEqual([]);
        await typeGlobalFilter(page, 'US');
        await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
        s = await check();
        expect(s.filter(x => x.withImages && !(x.has && x.afterCount && x.inH3))).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test.describe('foreign gallery: never on MusicBrainz', () => {
    test('a rendered MusicBrainz table has no foreign 🖼 and no gallery style', async ({ page }) => {
        const { open } = require('../support/caaColumnFixture');
        const errors = errorsOf(page);
        await open(page);
        await expect(page.locator('table.tbl tbody tr').first()).toBeVisible();
        await expect(page.locator('button.mb-fgal-btn')).toHaveCount(0);
        await expect(page.locator('#mb-fgal-style')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
});

test.describe('foreign gallery: jungleland, and the 🖼\'s hover card', () => {
    test('a jungleland entry read before: its scans typed as on MusicBrainz in the chips; the hover card counts it', async ({ page }) => {
        const { loadJlListPage, JL_BUTTON } = require('../support/jlFixture');
        const errors = errorsOf(page);
        const entry = 'https://www.jungleland.it/html/19750205.htm';
        await loadJlListPage(page, { settingsOverride: { sa_render_threshold: 100000 } });
        const { served } = await routeDetailPages(page, 'jl');
        await page.route(/^https:\/\/www\.jungleland\.it\/artwork\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.click(`button[data-label="${JL_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const html = fs.readFileSync(path.join(__dirname, 'detail-jl-19750205.html'), 'latin1');
        await page.evaluate(([h, u]) => new Promise((resolve, reject) => {
            const data = window.__saTest.dpParse('jungleland.it', h, u);
            const req = indexedDB.open('vz-saed-detail-pages', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('pages', { keyPath: 'url' });
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const tx = req.result.transaction('pages', 'readwrite');
                tx.objectStore('pages').put({ url: u, v: window.__saTest.dpParserVersion, at: Date.now(), data });
                tx.oncomplete = () => { req.result.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
        }), [html, entry]);
        // The hover card counts from memory only: nothing read yet.
        await page.mouse.move(0, 0);
        await opener(page).hover();
        await expect(page.locator('#mb-stat-tooltip')).toContainText(/Artwork gallery.*0 read, [\d,]+ not yet/s);
        await page.mouse.move(0, 0);
        await opener(page).click();
        await expect(fact(page, 'Shown')).toHaveText('1 row · 10 images');
        await expect(gal(page).locator('.mb-fgal-chip')).toHaveText(['All10', 'Front1', 'Back1', 'Medium2', 'Booklet6', 'Compare two']);
        await expect(fact(page, 'Kept')).toHaveText('half a year in this browser, shared with the preview');
        // Now in memory: the card says so (and none while the window is open).
        await page.keyboard.press('Escape');
        await page.mouse.move(0, 0);
        await opener(page).hover();
        await expect(page.locator('#mb-stat-tooltip')).toContainText(/1 read, /);
        expect(served).toEqual([]);
        expect(errors).toEqual([]);
    });
});
