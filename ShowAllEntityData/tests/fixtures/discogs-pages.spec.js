'use strict';

// discogs.com's own pages as pageTypes (2026-10-18; dg-master, dg-release,
// dg-artist, dg-label; mockup https://claude.ai/artifact/KTtCM7SaYVHZDaQdNqjUAK),
// under sa_enable_discogs. The page is a React app that shows one slice of
// each list, so the rows come from Discogs' API through the link previews'
// readers: `features.pageRequest` with its own `fetchText()` (the
// GM_xmlhttpRequest stub answers from the ext-discogs-*.json captures, as
// in popup-ext.spec.js) and the page count asked first
// (`features.pageCountAsync`). Our section goes between Discogs' header and
// its page (#app). Page fixtures: scripts/build-discogs-fixtures.py
// (debug/discogs-*.html trimmed to the title, the three roots, Discogs' <h1>
// and a few links). See docs/claude/discogs.md.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answers = (...names) => Object.fromEntries(names.map((n) => {
    const f = FX(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const PAGES = {
    master: 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run',
    release: 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run',
    artist: 'https://www.discogs.com/artist/219986-Bruce-Springsteen',
    label: 'https://www.discogs.com/label/1866-Columbia',
};
const API = 'https://api.discogs.com/';
const VERSIONS = [1, 2, 3, 4].map(p => `${API}masters/26725/versions?per_page=100&page=${p}`);
const ALL_ANSWERS = answers('discogs-master', 'discogs-release', 'discogs-artist', 'discogs-label', 'discogs-artist-releases-p1',
    'discogs-artist-small', ...[1, 2, 3, 4, 5, 6].map(p => `discogs-artist-small-p${p}`),
    ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`),
    ...[1, 2, 3, 4, 5, 6].map(p => `discogs-label-releases-desc-p${p}`), ...[1, 2, 3, 4, 5].map(p => `discogs-label-releases-asc-p${p}`));
// Max Weinberg: 528 entries in 6 pages, every kind of role (the Springsteen
// page's fixture serves as the page shell; only the API answers matter).
const WEINBERG = 'https://www.discogs.com/artist/254876-Max-Weinberg';
const WEINBERG_PAGES = [1, 2, 3, 4, 5, 6].map(p => `${API}artists/254876/releases?sort=year&sort_order=asc&per_page=100&page=${p}`);
const LABEL = (order, p) => `${API}labels/1866/releases?sort=year&sort_order=${order}&per_page=100&page=${p}`;

/**
 * Loads a discogs.com page fixture with the userscript, the API answered
 * from the captures, i.discogs.com's images as a pixel and everything else
 * aborted (no network).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} kind - 'master', 'release', 'artist' or 'label'.
 * @param {{enabled?: boolean, settings?: Object, responses?: Object, url?: string, file?: string}} [opts]
 * @returns {Promise<{errors: string[]}>}
 */
async function openDg(page, kind, { enabled = true, settings = {}, responses = {}, url = PAGES[kind], file = `dg-${kind}.html` } = {}) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, { ...ALL_ANSWERS, ...responses });
    await loadUserscriptPage(page, {
        url,
        fixtureFile: path.join(__dirname, file),
        testMode: true,
        settingsOverride: { sa_enable_discogs: enabled, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    return { errors };
}

/**
 * Hovers an element with Ctrl held (down while parked, up after), as the
 * link preview specs do.
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

// The sub-tables' headings, without their counts and toggles.
const h3s = (page) => page.locator('#mb-dg-root h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));
// Rows per sub-table, in order.
const groupRows = (page) => page.locator('#mb-dg-root table.tbl').evaluateAll(ts => ts.filter(t => t.closest('#mb-dg-root') && t.previousElementSibling)
    .map(t => t.querySelectorAll('tbody tr').length));

/**
 * One cell of a rendered table, by row index and column name.
 *
 * @param {import('@playwright/test').Locator} table
 * @param {number} row
 * @param {string} col
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function cell(table, row, col) {
    const i = (await heads(table)).findIndex(h => h.startsWith(col));
    return table.locator('tbody > tr').nth(row).locator(':scope > td').nth(i);
}
const SEARCH = (q, type) => `https://www.discogs.com/search/?q=${encodeURIComponent(q)}&type=${type}`;

// The requests to Discogs' API so far.
const apiLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://api.discogs.com/')));
// The rendered table's header names (first header row).
const heads = (table) => table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));

/**
 * Opens a column's 📊 dropdown (its header may be in a collapsed sub-table:
 * clicked by script).
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

// The open dropdown's section labels.
const sectionLabels = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section-label'))
    .map(s => s.textContent));

// Clicks one synthetic dropdown entry by its section and entry label (as pending-edits-highlight-ring.spec.js).
const clickSynItem = (page, sectionLabel, itemLabel) => page.evaluate(([sec, lbl]) => {
    const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
    const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).find((el) => el.dataset.mbUniqSynLabel === lbl);
    item.click();
}, [sectionLabel, itemLabel]);

test.describe('discogs.com pages (2026-10-18)', () => {
    test('a master: all its versions from the API, the main release marked, an Image column', async ({ page }) => {
        const { errors } = await openDg(page, 'master');
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('Bruce Springsteen – Born To Run');
        // Between Discogs' header and its page.
        expect(await page.evaluate(() => document.getElementById('mb-dg-root').previousElementSibling.id)).toMatch(/^__header_root_/);
        expect(await page.evaluate(() => document.getElementById('mb-dg-root').nextElementSibling.id)).toBe('app');
        expect(await apiLog(page), 'nothing asked before the press').toEqual([]);
        await root.locator('button[data-label="Show all versions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await apiLog(page)).toEqual([`${API}masters/26725`, ...VERSIONS]);
        const table = root.locator('table.tbl').first();
        expect(await heads(table)).toEqual(expect.arrayContaining(['Image', 'Title', 'Format', 'Label', 'Cat#', 'Country', 'Year']));
        await expect(table.locator('tbody tr')).toHaveCount(387);
        await expect(table.locator('tbody tr .mb-dg-main')).toHaveCount(1);
        await expect(table.locator('tbody tr img.mb-dg-thumb').first()).toHaveAttribute('src', /^https:\/\/i\.discogs\.com\//);
        // A version's label: Discogs gives its name only, so it links the search.
        const label = await cell(table, 0, 'Label');
        await expect(label.locator('a')).toHaveAttribute('href', SEARCH(await label.innerText(), 'label'));
        expect(errors).toEqual([]);
    });

    test('a thumbnail opens the artwork viewer on that row, captioned with its title; Shift+→ steps to the next row', async ({ page }) => {
        const { errors } = await openDg(page, 'master');
        await press(page, 'Show all versions');
        const table = page.locator('#mb-dg-root table.tbl').first();
        const thumbs = table.locator('tbody a.mb-dg-thumblink');
        const n = await thumbs.count();
        expect(n, 'nearly every version has a thumbnail').toBeGreaterThan(300);
        await thumbs.nth(2).click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        // Since 2026-10-18 each row is its own group of full-size images
        // (discogs-submissions.spec.js pins those); the rows are the steps.
        await expect(viewer.locator('.mb-artv-rowpos')).toHaveText(`row 3 of ${n}`);
        const title = (await (await cell(table, 2, 'Title')).textContent()).trim();
        await expect(viewer.locator('.mb-artv-info .mb-tt-title')).toHaveText(title);
        await page.keyboard.press('Shift+ArrowRight');
        await expect(viewer.locator('.mb-artv-rowpos')).toHaveText(`row 4 of ${n}`);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        expect(page.url(), 'the page stays').toBe(PAGES.master);
        expect(errors).toEqual([]);
    });

    test('a page wider than the window: our section is the content (not pinned chrome), at the window\'s left edge, Discogs\' header keeps its width', async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 800 });
        const { errors } = await openDg(page, 'artist', { url: WEINBERG });
        await press(page, 'Show the whole discography');
        await page.locator('.mb-master-toggle').click();
        await expect(page.locator('html')).toHaveClass(/\bmb-sph-on\b/);
        const root = page.locator('#mb-dg-root');
        await expect(root, 'the content root is never pinned whole').not.toHaveClass(/mb-sph-target/);
        await expect(page.locator('#mb-dg-root h1.mb-dg-h1')).toHaveClass(/mb-sph-target/);
        const box = await root.boundingBox();
        expect(Math.round(box.x), 'at the window\'s left edge').toBe(0);
        const tableW = await page.locator('#mb-dg-root table.tbl').first().evaluate(t => t.getBoundingClientRect().right);
        expect(box.width, 'as wide as its widest table').toBeGreaterThanOrEqual(tableW - 1);
        expect(errors).toEqual([]);
    });

    test('Cloudflare\'s security check at a Discogs URL (no #app) is left alone', async ({ page }) => {
        const { errors } = await openDg(page, 'master', { file: 'dg-challenge.html' });
        await expect(page.locator('h1')).toHaveText('www.discogs.com');
        expect(await page.locator('#mb-dg-root, h1.mb-dg-h1').count()).toBe(0);
        expect(await apiLog(page)).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('with sa_enable_discogs off, discogs.com is left untouched', async ({ page }) => {
        const { errors } = await openDg(page, 'master', { enabled: false });
        await expect(page.locator('#app h1')).toHaveText('Bruce Springsteen – Born To Run');
        expect(await page.locator('#mb-dg-root, h1.mb-dg-h1, table.tbl').count()).toBe(0);
        expect(await page.evaluate(() => document.body.className)).toBe('');
        expect(await apiLog(page)).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a release: the release, then its master\'s versions — five sub-tables, the release itself not among its other versions', async ({ page }) => {
        const { errors } = await openDg(page, 'release');
        await press(page, 'Show tracklist, credits and other versions');
        expect(await apiLog(page)).toEqual([`${API}releases/1874253`, ...VERSIONS]);
        expect(await h3s(page)).toEqual(['Tracklist', 'Credits', 'Companies, etc.', 'Barcode and Other Identifiers', 'Other versions']);
        expect(await groupRows(page)).toEqual([8, 18, 12, 12, 386]);
        const tl = page.locator('#mb-dg-root table.tbl').nth(0);
        expect(await heads(tl)).toEqual(expect.arrayContaining(['Pos', 'Title', 'Duration', 'Credits']));
        await expect(tl.locator('tbody tr').first()).toContainText('Thunder Road');
        // A track's credits: one row each, the name linked, collapsible like
        // MusicBrainz's Instruments column.
        const cr = await cell(tl, 0, 'Credits');
        await expect(cr.locator('li')).toHaveCount(7);
        await expect(cr.locator('li').first()).toHaveText('Backing Vocals – Mike Appel');
        await expect(cr.locator('li a[href="https://www.discogs.com/artist/219990"]')).toHaveText('Mike Appel');
        await expect(cr.locator('.mb-cell-collapse-toggle')).toHaveCount(1);
        const other = page.locator('#mb-dg-root table.tbl').nth(4);
        expect(await heads(other)).toEqual(expect.arrayContaining(['Image', 'Title', 'Country']));
        await expect(other.locator('a[href="https://www.discogs.com/release/1874253"]')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('an artist: the whole discography, one sub-table per Discogs role, in Discogs\' order', async ({ page }) => {
        const { errors } = await openDg(page, 'artist', { url: WEINBERG });
        // Discogs' own <h1>, not the document title ("… Discography: Vinyl, CDs, & More | Discogs").
        await expect(page.locator('#mb-dg-root h1.mb-dg-h1 bdi')).toHaveText('Bruce Springsteen');
        await press(page, 'Show the whole discography');
        expect(await apiLog(page), 'page 1 once (it gave the count), then the rest in order').toEqual(WEINBERG_PAGES);
        expect(await h3s(page)).toEqual(['Releases', 'Credits: Producer', 'Credits: Mixed by', 'Appearances', 'Track appearances', 'Unofficial']);
        expect(await groupRows(page)).toEqual([2, 7, 2, 424, 7, 86]);
        const rel = page.locator('#mb-dg-root table.tbl').nth(0);
        expect(await heads(rel)).toEqual(expect.arrayContaining(['Image', 'Type', 'Title', 'Artist', 'Format', 'Label', 'Year', 'Have', 'Want']));
        await expect(rel.locator('tbody tr').first()).toContainText('Want To Know');
        await expect((await cell(rel, 1, 'Title')).locator('a')).toHaveAttribute('href', 'https://www.discogs.com/master/1465067');
        // Artist and label are names only in the list: they link Discogs' search,
        // an artist cell as one link, a label cell one link per label.
        await expect((await cell(rel, 0, 'Artist')).locator('a'))
            .toHaveAttribute('href', SEARCH('DownTown Mystic Featuring Garry Tallent & Max Weinberg', 'artist'));
        await expect((await cell(rel, 0, 'Label')).locator('a')).toHaveAttribute('href', SEARCH('Sha-La Music', 'label'));
        const prod = page.locator('#mb-dg-root table.tbl').nth(1);
        const labels = (await cell(prod, 4, 'Label')).locator('a');
        await expect(labels).toHaveText(['Lost American Thrill Show Records', 'Sony Music Special Products']);
        expect(errors).toEqual([]);
    });

    test('Bruce Springsteen: 68 pages meet "High Page Count" first; Cancel asks nothing more', async ({ page }) => {
        const { errors } = await openDg(page, 'artist', { settings: { sa_max_page: 50 } });
        await page.locator('#mb-dg-root button[data-label="Show the whole discography"]').click();
        const dlg = page.getByText(/This list has 68 pages/);
        await expect(dlg).toBeVisible();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dlg).toBeHidden();
        expect(await apiLog(page), 'only the page that told the count').toEqual([`${API}artists/219986/releases?sort=year&sort_order=asc&per_page=100&page=1`]);
        expect(errors).toEqual([]);
    });

    test('a label: Newest / Oldest / Then groups; Newest 500 asks its five pages and no more', async ({ page }) => {
        const { errors } = await openDg(page, 'label');
        const bar = page.locator('#mb-dg-root h1');
        // Group labels are label segments of the SAED button since 2026-10-22
        // (muted caps by CSS, no colon in the text).
        await expect(bar.locator('.mb-seg-label.mb-button-group-label')).toHaveText(['Newest', 'Oldest', 'Then']);
        expect(await bar.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.textContent.trim().split(/\s+/).pop())))
            .toEqual(['500', '1,000', '5,000', '500', '1,000', 'All']);
        await expect(bar.locator('button[data-label="Show the newest 5,000 releases"]')).toHaveAttribute('title', /50 requests, about 50 s with your token/);
        await press(page, 'Show the newest 500 releases');
        expect(await apiLog(page)).toEqual([1, 2, 3, 4, 5].map(p => LABEL('desc', p)));
        const table = page.locator('#mb-dg-root table.tbl').first();
        expect(await heads(table)).toEqual(expect.arrayContaining(['Image', 'Artist', 'Title', 'Format', 'Cat#', 'Year']));
        await expect(table.locator('tbody tr')).toHaveCount(500);
        await expect(table.locator('tbody tr').first()).toContainText('Sweet FA');
        await expect((await cell(table, 0, 'Artist')).locator('a')).toHaveAttribute('href', SEARCH('Peach Pit', 'artist'));
        expect(errors).toEqual([]);
    });

    test('a label\'s "Oldest 500": the oldest first, five pages (a second press reloads the page, as everywhere)', async ({ page }) => {
        const { errors } = await openDg(page, 'label');
        await press(page, 'Show the oldest 500 releases');
        expect(await apiLog(page)).toEqual([1, 2, 3, 4, 5].map(p => LABEL('asc', p)));
        const table = page.locator('#mb-dg-root table.tbl').first();
        await expect(table.locator('tbody tr')).toHaveCount(500);
        await expect(table.locator('tbody tr').first()).toContainText('Young Man With A Horn');
        expect(errors).toEqual([]);
    });

    test('a release\'s Credits column: a "Credit details - Role" 📊 section; ticking a role keeps its tracks and marks the role (vzell 2026-10-18)', async ({ page }) => {
        const { errors } = await openDg(page, 'release');
        await press(page, 'Show tracklist, credits and other versions');
        const tl = page.locator('#mb-dg-root table.tbl').nth(0);
        // The converter's sentinels: each role, each bracket word.
        const roleRows = await tl.evaluate(t => Array.from(t.tBodies[0].rows)
            .filter(r => Array.from(r.querySelectorAll('.mb-credit-role')).some(s => s.textContent.trim() === 'Backing Vocals')).length);
        expect(roleRows).toBeGreaterThan(0);
        await openUniq(page, tl, 'Credits');
        expect(await sectionLabels(page)).toEqual(expect.arrayContaining(['Credit details - Role']));
        await clickSynItem(page, 'Credit details - Role', '» role: Backing Vocals');
        await expect(tl.locator('tbody > tr')).toHaveCount(roleRows);
        await expect(tl.locator('tbody .mb-credit-role .mb-column-filter-highlight').first()).toHaveText('Backing Vocals');
        expect(errors).toEqual([]);
    });

    test('a master\'s Cat#: several numbers one row each, and the "Catalog info" 📊 sections as MusicBrainz\'s Catalog# (vzell 2026-10-18)', async ({ page }) => {
        const { errors } = await openDg(page, 'master');
        await press(page, 'Show all versions');
        const table = page.locator('#mb-dg-root table.tbl').first();
        const i = (await heads(table)).indexOf('Cat#');
        const lists = await table.evaluate((t, idx) => Array.from(t.tBodies[0].rows).map(r => r.cells[idx].querySelectorAll('li').length), i);
        expect(Math.max(...lists), 'Discogs\' "S 69170, 69170" is two rows').toBeGreaterThan(1);
        await openUniq(page, table, 'Cat#');
        expect(await sectionLabels(page)).toEqual(expect.arrayContaining(['Catalog info - Prefix', 'Catalog info - Presence']));
        await clickSynItem(page, 'Catalog info - Prefix', '» prefix: CBS');
        const left = await table.evaluate((t, idx) => Array.from(t.tBodies[0].rows)
            .map(r => Array.from(r.cells[idx].querySelectorAll('li')).some(li => /^CBS\b/.test(li.textContent.trim()))), i);
        expect(left.length).toBeGreaterThan(0);
        expect(left.every(Boolean), 'every row left has a CBS number').toBe(true);
        expect(errors).toEqual([]);
    });

    test('Year on the Discogs pages: the Date column\'s 📊 sections, e.g. "Date info - Decade" (vzell 2026-10-18)', async ({ page }) => {
        const { errors } = await openDg(page, 'master');
        await press(page, 'Show all versions');
        const table = page.locator('#mb-dg-root table.tbl').first();
        await openUniq(page, table, 'Year');
        expect(await sectionLabels(page)).toEqual(expect.arrayContaining(['Date info - Decade', 'Date info - Year']));
        await clickSynItem(page, 'Date info - Decade', '» decade: 1970-1980');
        const i = (await heads(table)).indexOf('Year');
        const years = await table.evaluate((t, idx) => Array.from(t.tBodies[0].rows).map(r => Number(r.cells[idx].textContent.trim())), i);
        expect(years.length).toBeGreaterThan(0);
        expect(years.every(y => y >= 1970 && y < 1980), 'only the 1970s are left').toBe(true);
        expect(errors).toEqual([]);
    });

    test('previews on discogs.com: a Discogs link in the table and in the page\'s content gets the card; the header and footer do not', async ({ page }) => {
        const { errors } = await openDg(page, 'master', { settings: { sa_pop_ext: true } });
        await press(page, 'Show all versions');
        const card = page.locator('#mb-dp-peek');
        const link = page.locator('#mb-dg-root table.tbl a[href="https://www.discogs.com/release/1874253"]').first();
        await ctrlHover(page, link);
        await expect(card.locator('.mb-tt-title')).toHaveText('Born To Run');
        await expect(card).toContainText('Discogs · release');
        await page.keyboard.press('Escape');
        await ctrlHover(page, page.locator('#app a').first());
        await expect(card).toBeVisible();
        await page.keyboard.press('Escape');
        // What the engine would preview, asked directly: a card that has not
        // shown yet proves nothing (it waits for the hover delay).
        const resolves = (sel) => page.evaluate((q) => window.__saTest.popResolve(document.querySelector(q)), sel);
        expect(await resolves('#mb-dg-root table.tbl a[href="https://www.discogs.com/release/1874253"]')).toMatch(/^ext\|/);
        // Discogs writes its own links relative (org/TODO.org "some more BB
        // and MB fixes/enhancements" 5a, 2026-10-24): read against the page.
        await expect(page.locator('#app a').first()).toHaveAttribute('href', /^\/artist\/219986/);
        expect(await resolves('#app a')).toBe('ext|ext:discogs:https://www.discogs.com/artist/219986-Bruce-Springsteen');
        expect(await resolves('.dg-fx-header a'), 'the header is not the page\'s content').toBeNull();
        expect(await resolves('.dg-fx-footer a'), 'nor is the footer').toBeNull();
        expect(errors).toEqual([]);
    });

    // 5a: "all links to BB pages should open as previews when hovered" — a
    // Brucebase link in Discogs' content (a release's notes) is the
    // Springsteen sites' reader's, on the initial page, no render needed.
    test('previews on discogs.com before any render: Discogs\' relative links and a Brucebase link in the content', async ({ page }) => {
        const gig = 'https://brucebase.wikidot.com/gig:1985-01-13-carolina-coliseum-columbia-sc';
        const gigHtml = fs.readFileSync(path.join(__dirname, 'detail-bb-gig-1985-01-13.html'), 'utf8');
        const { errors } = await openDg(page, 'release', {
            settings: { sa_pop_ext: true },
            responses: { [gig]: { status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: gigHtml } },
        });
        await page.evaluate((u) => {
            const p = document.createElement('p');
            p.className = 'dg-fx-notes';
            p.innerHTML = `Recorded live, see <a href="${u}">Brucebase</a>.`;
            document.querySelector('#app main').appendChild(p);
        }, gig);
        const resolves = (sel) => page.evaluate((q) => window.__saTest.popResolve(document.querySelector(q)), sel);
        expect(await page.locator('#mb-dg-root table.tbl').count(), 'nothing rendered yet').toBe(0);
        const rel = page.locator('#app a[href^="/"]').first();
        await expect(rel).toHaveAttribute('href', /^\/(?:artist|release|master|label)\//);
        expect(await resolves('#app a[href^="/"]')).toMatch(/^ext\|ext:discogs:https:\/\/www\.discogs\.com\//);
        expect(await resolves('.dg-fx-notes a')).toMatch(/^ext\|ext:springsteen:/);
        // Brucebase's own card for the show (its parser), not a generic page's.
        const card = page.locator('#mb-dp-peek');
        await ctrlHover(page, page.locator('.dg-fx-notes a'));
        await expect(card).toContainText('1985-01-13');
        await expect(card).toContainText('Carolina Coliseum');
        await page.keyboard.press('Escape');
        // A relative Discogs link: the Discogs card.
        await ctrlHover(page, page.locator('#app a[href^="/release/"], #app a[href^="/master/"], #app a[href^="/artist/"]').first());
        await expect(card).toContainText('Discogs');
        expect(errors).toEqual([]);
    });
});
