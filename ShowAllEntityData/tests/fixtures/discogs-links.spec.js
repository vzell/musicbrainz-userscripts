'use strict';

// discogs.com, round 2 (2026-10-18; mockup https://claude.ai/artifact/XRTM8v1aLNj3voVt6RxVJz):
//   - a plain click on a link in OUR tables opens the preview window (the
//     links open a new tab otherwise), never leaving the page (tab A);
//   - every link in a Discogs window opens in that window, with Back: a
//     user (new reader `dguser`: the API profile + the Recent activity of
//     their page), a support.discogs.com article (`dgsupport`: Zendesk's
//     Help Center API, scrolled to and marking the section), a search
//     (`dgsearch`: the API, 25 a request, "Load 25 more") (tab B);
//   - "View changes" in the history window: that revision's diff, from
//     Discogs' ?diff= page (tab C);
//   - pageType dg-user: a user's submissions, contributions, collection and
//     wantlist from the API, a button only for a list the page counts (tab D).
// Fixtures: scripts/build-discogs-fixtures.py (dg-user-vzell.html, the
// synthetic dg-user-collection.html, dg-release-history-diff.html) and
// scripts/capture-ext-fixtures.py (ext-discogs-user-*, -search-*, -support-*).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answer = (f, url = f.url) => ({ [url]: { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body } });
const API = 'https://api.discogs.com/';
const SUBS_PAGE = (p) => `${API}users/vzell/submissions?per_page=100&page=${p}`;
const COLL_PAGE = (p) => `${API}users/GuiBeal/collection/folders/0/releases?sort=added&sort_order=desc&per_page=100&page=${p}`;
const ANSWERS = Object.assign({},
    ...['discogs-master', 'discogs-release', 'discogs-label', 'discogs-artist', 'discogs-user-vzell', 'discogs-user-guibeal',
        'discogs-user-vzell-contributions-p1', 'discogs-user-guibeal-collection-p1', 'discogs-search-columbia-label-p1',
        'discogs-search-columbia-label-p2', 'discogs-support-360005006654', 'discogs-user-vzell-submissions-p7',
        ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`)].map(n => answer(FX(n))),
    // Pages 2-6 of vzell's 642 submissions: page 1's answer again (the
    // captures keep pages 1 and 7 only, ~600 KB a page) — but page 3 is page
    // 7's (releases AND a label), so the kinds mix across pages as live
    // (vzell's screenshot: "Releases, Labels, Releases, Artists, …").
    ...[1, 2, 4, 5, 6].map(p => answer(FX('discogs-user-vzell-submissions-p1'), SUBS_PAGE(p))),
    answer(FX('discogs-user-vzell-submissions-p7'), SUBS_PAGE(3)),
    // GuiBeal's 197: page 2 is page 1's answer again.
    answer(FX('discogs-user-guibeal-collection-p1'), COLL_PAGE(2)),
    // Pleasure_to_Kill (a history's first user): GuiBeal's capture with that
    // name and a large picture, for the avatar's card and viewer.
    (() => {
        const f = FX('discogs-user-guibeal');
        const d = JSON.parse(f.body);
        Object.assign(d, { username: 'Pleasure_to_Kill', avatar_url: 'https://i.discogs.com/fixture-avatar-500-pleasure.jpeg' });
        return answer(Object.assign({}, f, { body: JSON.stringify(d) }), `${API}users/Pleasure_to_Kill`);
    })(),
    // An Artist search; its first result WITH a thumbnail, as Discogs sends
    // it with a token (without one, `thumb` is empty).
    (() => {
        const f = FX('discogs-search-springsteen-artist-p1');
        const d = JSON.parse(f.body);
        d.results[0].thumb = 'https://i.discogs.com/fixture-thumb-219986.jpeg';
        return answer(Object.assign({}, f, { body: JSON.stringify(d) }));
    })());
const MASTER = 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run';
const SUBMISSIONS = 'https://www.discogs.com/submissions?mode=list&id=599283&view=flat';

/**
 * Loads a discogs.com page fixture with the userscript and previews on:
 * the network aborted but i.discogs.com's images, the flat submissions
 * pages, a release's history page (its `?diff=` form: the saved revision
 * 10 page) and a user's page (the saved vzell page), each same-origin
 * request logged; the APIs answered from the captures.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url?: string, file?: string, settings?: Object}} [opts]
 * @returns {Promise<{errors: string[], asked: string[]}>}
 */
async function openDg(page, { url = SUBMISSIONS, file = 'dg-submissions-flat.html', settings = {} } = {}) {
    const errors = [];
    const asked = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const serve = (name) => (route) => {
        asked.push(route.request().url());
        return route.fulfill({ path: path.join(__dirname, name), contentType: 'text/html' });
    };
    await page.route(/^https:\/\/www\.discogs\.com\/submissions\?.*view=flat&/, serve('dg-submissions-flat.html'));
    await page.route(/^https:\/\/www\.discogs\.com\/release\/\d+[^/]*\/history\?(?:.*&)?diff=/, serve('dg-release-history-diff.html'));
    await page.route(/^https:\/\/www\.discogs\.com\/release\/\d+[^/]*\/history$/, serve('dg-release-history.html'));
    await page.route(/^https:\/\/www\.discogs\.com\/user\/[^/?#]+$/, serve('dg-user-vzell.html'));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, ANSWERS);
    await loadUserscriptPage(page, {
        url, fixtureFile: path.join(__dirname, file), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext: true, sa_render_threshold: 100000, ...settings },
    });
    return { errors, asked };
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

const dialog = (page) => page.locator('#mb-dp-dialog');
const kind = (page) => dialog(page).locator(':scope > div > span').first();
const back = (page) => dialog(page).locator('button', { hasText: 'Back' });
const gmLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => !u.startsWith('https://raw.githubusercontent.com/')));

/**
 * Opens the history window of the first submission (its "history" link,
 * Ctrl-hover then Space) after the list is shown.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openHistory(page) {
    await press(page, 'Show all submissions');
    await ctrlHover(page, page.locator('#mb-dg-root table.tbl td a[href$="/history"]').first());
    await expect(page.locator('#mb-dp-peek')).toContainText('Not read yet');
    await page.keyboard.press('Space');
    await expect(dialog(page).locator('[data-mb-dg-sec="dgh-hist"] .mb-dg-c')).toHaveText('14');
}

test.describe('discogs.com: links that stay, every link in the window, View changes, dg-user (2026-10-18)', () => {
    test('a plain click on a table link opens the window instead of leaving; every table link would open a new tab', async ({ page }) => {
        const { errors } = await openDg(page, { url: MASTER, file: 'dg-master.html' });
        await press(page, 'Show all versions');
        const table = page.locator('#mb-dg-root table.tbl').first();
        expect(await table.locator('tbody a[href]').evaluateAll(as => as.filter(a => a.target !== '_blank').length), 'every link: a new tab').toBe(0);
        const navigations = [];
        page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
        await table.locator('a[href="https://www.discogs.com/search/?q=Columbia&type=label"]').first().click();
        await expect(kind(page)).toHaveText('Discogs search');
        await expect(dialog(page).locator('.mb-dgq-row')).toHaveCount(25);
        expect(navigations, 'the page stays').toEqual([]);
        expect(page.url()).toBe(MASTER);
        expect(errors).toEqual([]);
    });

    test('a search: 25 results, "Load 25 more" asks page 2, a result opens in the window and Back returns', async ({ page }) => {
        const { errors } = await openDg(page, { url: MASTER, file: 'dg-master.html' });
        await press(page, 'Show all versions');
        await page.locator('#mb-dg-root table.tbl a[href="https://www.discogs.com/search/?q=Columbia&type=label"]').first().click();
        const d = dialog(page);
        await expect(d.locator('[data-mb-dg-sec="dgq-results"] .mb-dg-c')).toHaveText('25 of 2,576');
        await d.locator('[data-mb-dgq-act="more"]').click();
        // Discogs' requests are 2.5 s apart without a token.
        await expect(d.locator('.mb-dgq-row')).toHaveCount(50, { timeout: 10000 });
        const searches = (await gmLog(page)).filter(u => u.includes('/database/search'));
        expect(searches).toEqual([1, 2].map(p => `${API}database/search?q=Columbia&type=label&per_page=25&page=${p}`));
        await d.locator('.mb-dgq-row', { hasText: /^Columbia\s*label$/ }).first().click();
        // The title is the path: "Discogs search › Discogs label".
        await expect(kind(page)).toHaveText(/Discogs search › Discogs label$/);
        await back(page).click();
        await expect(kind(page)).toHaveText('Discogs search');
        await expect(d.locator('.mb-dgq-row')).toHaveCount(50);
        expect(errors).toEqual([]);
    });

    test('a search result with a thumbnail opens in the window too, and Back returns (vzell 2026-10-18)', async ({ page }) => {
        const { errors } = await openDg(page);
        await press(page, 'Show all submissions');
        await page.locator('#mb-dg-root table.tbl a[href="https://www.discogs.com/search/?q=Bruce%20Springsteen&type=artist"]').first().click();
        const d = dialog(page);
        await expect(kind(page)).toHaveText('Discogs search');
        const first = d.locator('.mb-dgq-row').first();
        await expect(first.locator('img')).toHaveCount(1);
        expect(await first.locator('a img').count(), 'the picture is not inside the link').toBe(0);
        await first.click();
        await expect(kind(page)).toHaveText(/Discogs search › Discogs artist$/);
        await expect(d).toContainText('Bruce Springsteen');
        await back(page).click();
        await expect(kind(page)).toHaveText('Discogs search');
        expect(errors).toEqual([]);
    });

    test('in the history window: a user opens with the profile and the Recent activity; a support link with its section; Back each time', async ({ page }) => {
        const { errors, asked } = await openDg(page);
        await openHistory(page);
        const d = dialog(page);
        await d.locator('.mb-dgh-u a', { hasText: 'GuiBeal' }).first().click();
        await expect(kind(page)).toHaveText(/› Discogs user$/);
        await expect(d).toContainText('Rio Grande do Sul, Brasil');
        await expect(d.locator('[data-mb-dg-sec="dgu-activity"] .mb-dg-c')).toHaveText('7');
        await expect(d.locator('.mb-dgu-e').first()).toContainText('submitted');
        expect(asked).toContain('https://www.discogs.com/user/GuiBeal');
        await back(page).click();
        await expect(kind(page)).toHaveText('Discogs release history');
        // The Merge Pending note links RSG §6.12.2: open the note, follow it.
        const merge = d.locator('.mb-dgh-e', { has: page.locator('.mb-dgh-pill', { hasText: 'Merge Pending' }) });
        await merge.locator('.mb-dgh-more').click();
        await merge.locator('a', { hasText: 'RSG §6.12.2' }).click();
        await expect(kind(page)).toHaveText(/› Discogs help$/);
        await expect(d).toContainText('Database Guidelines 6. Format');
        const mark = d.locator('.mb-dgs-mark');
        await expect(mark).toHaveCount(1);
        await expect(mark).toContainText('6.12.2');
        await expect(mark).toBeInViewport();
        expect((await gmLog(page)).filter(u => u.includes('support.discogs.com'))).toEqual(['https://support.discogs.com/api/v2/help_center/articles/360005006654.json']);
        await back(page).click();
        await expect(kind(page)).toHaveText('Discogs release history');
        expect(errors).toEqual([]);
    });

    test('View changes: one button per revision; revision 10 is Discogs\' 8 → 10, only the Notes; Back to the latest change', async ({ page }) => {
        const { errors, asked } = await openDg(page);
        await openHistory(page);
        const d = dialog(page);
        await expect(d.locator('.mb-dgh-lk a', { hasText: /^(?:View|Changes)$/ }), 'no separate View / Changes links').toHaveCount(0);
        // Revisions 2, 4, 8, 10, 13, 14 have changes; the image changes (7, 12) their Images link.
        await expect(d.locator('[data-mb-dgh-act="diff"]')).toHaveCount(6);
        await expect(d.locator('.mb-dgh-lk a', { hasText: 'Images' })).toHaveCount(2);
        await d.locator('[data-mb-dgh-act="diff"][data-mb-dgh-v="10"]').click();
        const diff = d.locator('[data-mb-dg-sec="dgh-diff"]');
        await expect(diff.locator('h4')).toContainText('Change · revision 8 → 10');
        expect([...new Set(await diff.locator('.mb-dgh-diff > div > b').allTextContents())]).toEqual(['Notes']);
        await expect(diff.locator('.mb-dgh-add').first()).toContainText('C');
        await expect(d.locator('.mb-dgh-latest')).toContainText('From scan');
        expect(asked.filter(u => /diff=10/.test(u))).toHaveLength(1);
        await diff.locator('[data-mb-dgh-act="diff"][data-mb-dgh-v="0"]').click();
        await expect(diff.locator('h4')).toContainText('Latest change · revision 13 → 14');
        // Asked once: the second time from memory.
        await d.locator('[data-mb-dgh-act="diff"][data-mb-dgh-v="10"]').click();
        await expect(diff.locator('h4')).toContainText('revision 8 → 10');
        expect(asked.filter(u => /diff=10/.test(u))).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('dg-user: Submissions and Contributions only (no collection or wantlist on the page); 642 submissions in 7 requests', async ({ page }) => {
        const { errors } = await openDg(page, { url: 'https://www.discogs.com/user/vzell', file: 'dg-user-vzell.html' });
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('vzell');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        expect(await root.locator('button[data-label^="Show the "]').evaluateAll(bs => bs.map(b => b.dataset.label)))
            .toEqual(['Show the submissions', 'Show the contributions']);
        await expect(root.locator('button[data-label="Show the submissions"]')).toHaveAttribute('title', /642 submissions.*7 requests/);
        expect(await gmLog(page), 'nothing asked before the press').toEqual([]);
        await press(page, 'Show the submissions');
        expect((await gmLog(page)).filter(u => u.includes('/submissions'))).toEqual([1, 2, 3, 4, 5, 6, 7].map(SUBS_PAGE));
        const h3s = await root.locator('h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes).filter(n => n.nodeType === 3)
            .map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));
        // One group per kind, whatever page a row came from, in first-seen order.
        expect(h3s).toEqual(['Releases', 'Labels']);
        const rows = await root.locator('table.tbl').evaluateAll(ts => ts.filter(t => t.previousElementSibling).map(t => t.querySelectorAll('tbody tr').length));
        expect(rows).toEqual([5 * 100 + 2 * 41, 2]);
        // The Labels table keeps its own columns: the releases' date/time
        // splits (Added, Last changed) must not run on it.
        const labels = root.locator('table.tbl').nth(1);
        const shape = await labels.evaluate(t => ({ heads: t.querySelectorAll('thead tr:first-child th').length,
            cells: Array.from(t.tBodies[0].rows).map(r => r.cells.length) }));
        expect(new Set(shape.cells)).toEqual(new Set([shape.heads]));
        const rel = root.locator('table.tbl').nth(0);
        const heads = await rel.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(heads).toEqual(expect.arrayContaining(['Image', 'Artist', 'Title', 'Format', 'Label', 'Cat#', 'Country', 'Year', 'Status',
            'Added', 'Last changed']));
        await expect(rel.locator('tbody tr').first()).toContainText('Orpheus Descending');
        await expect(rel.locator('tbody tr').first()).toContainText('Accepted');
        // The release's dates from the API (vzell: "when an edit had been done";
        // the user's own edit date is only in the history).
        const cellOf = async (name) => rel.locator('tbody tr').first().locator(':scope > td').nth(heads.indexOf(name));
        await expect(await cellOf('Added')).toHaveText('2023-07-19 16:19');
        await expect(await cellOf('Last changed')).toHaveText('2026-09-10 14:07');
        // Date and time also apart, as on MusicBrainz's pageTypes (dateTimeParts).
        const all = await rel.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        const at = (name) => rel.locator('tbody tr').first().locator(':scope > td').nth(all.indexOf(name));
        expect(all).toEqual(expect.arrayContaining(['Added date', 'Added time', 'Last changed date', 'Last changed time']));
        await expect(at('Added date')).toHaveText('2023-07-19');
        await expect(at('Added time')).toHaveText('16:19');
        await expect(at('Last changed date')).toHaveText('2026-09-10');
        await expect(at('Last changed time')).toHaveText('14:07');
        expect(errors).toEqual([]);
    });

    test('dg-history: a release\'s history page (?diff=10) as Changes and Diff sub-tables; "View changes" opens the window on that diff (vzell 2026-10-18)', async ({ page }) => {
        const HIST = 'https://www.discogs.com/release/8164856-Human-Touch/history?diff=10&page=1';
        const { errors } = await openDg(page, { url: HIST, file: 'dg-release-history-diff.html' });
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('Bruce Springsteen - Human Touch History');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        // Its own pageType only: dg-release's path pattern takes /history too.
        expect(await root.locator('button[data-label^="Show "]').evaluateAll(bs => bs.map(b => b.dataset.label)))
            .toEqual(['Show the changes and the diff']);
        await press(page, 'Show the changes and the diff');
        // Sub-tables start collapsed, as on every multi-table pageType.
        await page.locator('.mb-master-toggle').click();
        const h3s = await root.locator('h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes).filter(n => n.nodeType === 3)
            .map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));
        expect(h3s).toEqual(['Changes', 'Diff · revision 8 → 10']);
        const changes = root.locator('table.tbl').nth(0);
        await expect(changes.locator('tbody > tr')).toHaveCount(14);
        const heads = await changes.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(heads).toEqual(expect.arrayContaining(['Changed', 'Changed date', 'Changed time', 'User', 'Action', 'Notes', 'Revision', 'View']));
        // Each user's own picture, from the page (no request).
        await expect(changes.locator('tbody > tr').first().locator('img.mb-dg-avatar')).toHaveAttribute('src', /gravatar\.com/);
        const row10 = changes.locator('tbody > tr', { has: page.locator('a[href*="diff=10"]') });
        await expect(row10).toHaveCount(1);
        await expect(row10).toContainText('From scan');
        const diffT = root.locator('table.tbl').nth(1);
        const marked = await diffT.evaluate((t) => {
            const hs = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
            return Array.from(t.tBodies[0].rows).filter(r => r.cells[hs.indexOf('Marked')].textContent.trim() === 'changed')
                .map(r => r.cells[hs.indexOf('Section')].textContent.trim());
        });
        expect(marked).toEqual(['Notes']);
        // Its own four columns only: the Changes table's date/time split must
        // not run here (vzell's debug/2columns-missing.html: "Companies, etc."
        // split into "Companies," and "etc." under no header).
        const shape = await diffT.evaluate(t => ({ heads: t.querySelectorAll('thead tr:first-child th').length,
            cells: Array.from(t.tBodies[0].rows).map(r => r.cells.length) }));
        expect(new Set(shape.cells)).toEqual(new Set([shape.heads]));
        await expect(diffT.locator('tbody td', { hasText: /^Companies,$/ })).toHaveCount(0);
        await expect(diffT.locator('.mb-dgh-add').first()).toBeVisible();
        // A plain click: the preview window, on revision 10's changes.
        await row10.locator('a[href*="diff=10"]').click();
        const diff = dialog(page).locator('[data-mb-dg-sec="dgh-diff"]');
        await expect(diff.locator('h4')).toContainText('Change · revision 8 → 10');
        expect(page.url()).toBe(HIST);
        expect(errors).toEqual([]);
    });

    test('a user\'s picture: hover shows a card with the largest picture, a click opens the viewer on it (vzell 2026-10-18)', async ({ page }) => {
        const HIST = 'https://www.discogs.com/release/8164856-Human-Touch/history?diff=10&page=1';
        const BIG = 'https://i.discogs.com/fixture-avatar-500-pleasure.jpeg';
        const { errors } = await openDg(page, { url: HIST, file: 'dg-release-history-diff.html' });
        await press(page, 'Show the changes and the diff');
        await page.locator('.mb-master-toggle').click();
        const avatar = page.locator('#mb-dg-root table.tbl').nth(0).locator('tbody > tr').first().locator('img.mb-dg-avatar');
        await avatar.hover();
        const card = page.locator('#mb-dg-avatar-card');
        await expect(card).toContainText('Pleasure_to_Kill');
        await expect(card.locator('img.mb-dgav-big')).toHaveAttribute('src', BIG);
        await avatar.click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(card).toHaveCount(0);
        await expect(viewer.locator('.mb-artv-bar a.mb-artv-btn', { hasText: 'Original' })).toHaveAttribute('href', BIG);
        await expect(viewer.locator('.mb-artv-info')).toContainText('profile');
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        expect(page.url()).toBe(HIST);
        expect(errors).toEqual([]);
    });

    test('dg-user: Contributions, and a page that counts a collection shows Collection (a SYNTHETIC page: GuiBeal\'s public collection)', async ({ page }) => {
        const { errors } = await openDg(page, { url: 'https://www.discogs.com/user/vzell', file: 'dg-user-vzell.html' });
        await press(page, 'Show the contributions');
        const t = page.locator('#mb-dg-root table.tbl').first();
        await expect(t.locator('tbody tr')).toHaveCount(3);
        expect(errors).toEqual([]);
    });

    test('dg-user: a page with a collection count gets the Collection button; it lists the collection with Added', async ({ page }) => {
        const { errors } = await openDg(page, { url: 'https://www.discogs.com/user/GuiBeal', file: 'dg-user-collection.html' });
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('button[data-label="Show the collection"]')).toHaveCount(1);
        await expect(root.locator('button[data-label="Show the wantlist"]')).toHaveCount(0);
        await press(page, 'Show the collection');
        expect((await gmLog(page)).filter(u => u.includes('/collection/'))).toEqual([COLL_PAGE(1), COLL_PAGE(2)]);
        const t = root.locator('table.tbl').first();
        await expect(t.locator('tbody tr')).toHaveCount(200);
        const heads = await t.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        expect(heads).toEqual(expect.arrayContaining(['Image', 'Artist', 'Title', 'Added']));
        expect(errors).toEqual([]);
    });

    // The MusicBrainz column (docs/claude/discogs.md, "The MusicBrainz
    // column"; its own spec is discogs-mb-column.spec.js): on these pages
    // too, keyed by the row's own Discogs entity. The importer is simulated
    // by its cache key; automatic lookups off (nothing to answer them here).
    test('MusicBrainz column: submissions (a release from its /history link), dg-user releases and names; never on a history page', async ({ page }) => {
        await page.context().addInitScript(() => localStorage.setItem('DISCOGS_MBLINKS_CACHE-v3.1', '{}'));
        const off = { sa_dg_mb_auto_lookup: false };
        const cols = (t) => t.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        const { errors } = await openDg(page, { settings: off });
        await press(page, 'Show all submissions');
        let t = page.locator('#mb-dg-root table.tbl').first();
        expect((await cols(t)).slice(0, 3)).toEqual(['Artist', 'Title', 'MusicBrainz']);
        const keys = await t.locator('td.mb-dg-mb-cell').evaluateAll(tds => tds.slice(0, 5).map(td => td.dataset.mbDgKey));
        keys.forEach(k => expect(k).toMatch(/^release\/\d+$/));
        await openDg(page, { url: 'https://www.discogs.com/user/vzell', file: 'dg-user-vzell.html', settings: off });
        await press(page, 'Show the contributions');
        t = page.locator('#mb-dg-root table.tbl').first();
        const c = await cols(t);
        expect(c[c.indexOf('Title') + 1]).toBe('MusicBrainz');
        // The submissions' Labels table: a name row, keyed by its label.
        await openDg(page, { url: 'https://www.discogs.com/user/vzell', file: 'dg-user-vzell.html', settings: off });
        await press(page, 'Show the submissions');
        const labels = page.locator('#mb-dg-root h3').filter({ hasText: 'Labels' }).first().locator('xpath=following-sibling::table[1]');
        expect((await cols(labels)).slice(0, 2)).toEqual(['Name', 'MusicBrainz']);
        expect(await labels.locator('td.mb-dg-mb-cell').first().getAttribute('data-mb-dg-key')).toMatch(/^label\/\d+$/);
        await openDg(page, { url: 'https://www.discogs.com/release/8164856-Human-Touch/history?diff=10&page=1', file: 'dg-release-history-diff.html', settings: off });
        await press(page, 'Show the changes and the diff');
        const all = await page.locator('#mb-dg-root table.tbl').evaluateAll(ts => ts.map(x => Array.from(x.querySelectorAll('thead tr:first-child th'))
            .map(th => th.dataset.colName || th.textContent.trim())));
        all.forEach(x => expect(x).not.toContain('MusicBrainz'));
        expect(errors).toEqual([]);
    });
});
