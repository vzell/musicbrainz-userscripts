'use strict';

// discogs.com, 2026-10-18 (mockup https://claude.ai/artifact/Y69bUJTvYSksKTFRMcYJvZ):
//   - dg-submissions: a list's recent submissions, plain HTML (no #app), the
//     rows read from the FLAT view's pages on discogs.com itself (same-origin
//     fetch(), the browser's session), on the browser view too;
//   - the edit-history reader (`dghistory`): a release's /history page as a
//     card and a window, read on Space only; on a submissions list a
//     release's window opens with it ("History, then the release");
//   - full-size images in the artwork viewer: a row's record asked for when
//     the viewer shows it, every image of it, Shift+← → through the rows.
// Fixtures: scripts/build-discogs-fixtures.py (dg-submissions-flat.html,
// dg-submissions-browser.html, dg-release-history.html from debug/). See
// docs/claude/discogs.md and docs/claude/detail-pages.md.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answer = (f, url = f.url) => ({ [url]: { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body } });
// Without page=: page 1's flat URL must not be the fixture's own (served by the harness, not logged here).
const FLAT = 'https://www.discogs.com/submissions?mode=list&id=599283&view=flat';
const BROWSER = 'https://www.discogs.com/submissions?mode=list&id=599283&page=1';
const FLAT_FILE = path.join(__dirname, 'dg-submissions-flat.html');
const HISTORY_FILE = path.join(__dirname, 'dg-release-history.html');
const HISTORY_HTML = fs.readFileSync(HISTORY_FILE, 'utf8');
const API = 'https://api.discogs.com/';
const MASTER = 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run';
const VERSIONS = [1, 2, 3, 4].map(p => FX(`discogs-master-versions-p${p}`));
const SUB_PAGE = (p) => `https://www.discogs.com/submissions?mode=list&id=599283&page=${p}&view=flat`;
const FLAT_PAGE = (p) => `https://www.discogs.com/submissions?mode=list&id=599283&view=flat&page=${p}`;

/**
 * Loads a discogs.com page fixture with the userscript: everything off the
 * network aborted but i.discogs.com's images (a pixel), the flat view's
 * pages (the saved page 1 for every page, logged) and a release's history
 * page (the saved Human Touch history, logged); the API answered from the
 * captures through the GM_xmlhttpRequest stub.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{url?: string, file?: string, settings?: Object, responses?: Object, history?: function(import('@playwright/test').Route): Promise<void>}} [opts]
 * @returns {Promise<{errors: string[], fetched: string[], asked: string[]}>} `fetched`: the list's pages; `asked`: history pages.
 */
async function openDg(page, { url = FLAT, file = FLAT_FILE, settings = {}, responses = {}, history = null } = {}) {
    const errors = [];
    const fetched = [];
    const asked = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.route(/^https:\/\/www\.discogs\.com\/submissions\?.*view=flat/, (route) => {
        fetched.push(route.request().url());
        return route.fulfill({ path: FLAT_FILE, contentType: 'text/html' });
    });
    await page.route(/^https:\/\/www\.discogs\.com\/release\/\d+[^/]*\/history/, (route) => {
        asked.push(route.request().url());
        return history ? history(route) : route.fulfill({ path: HISTORY_FILE, contentType: 'text/html' });
    });
    const all = { ...answer(FX('discogs-master')), ...VERSIONS.reduce((m, f) => Object.assign(m, answer(f)), {}), ...answer(FX('discogs-release')), ...responses };
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, all);
    await loadUserscriptPage(page, {
        url, fixtureFile: file, testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: 'tok-probe', sa_render_threshold: 100000, ...settings },
    });
    // The page itself is not a fetch of ours.
    fetched.length = 0;
    return { errors, fetched, asked };
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

const apiLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://api.discogs.com/')));
const heads = (table) => table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');

/**
 * One cell of a rendered table, by row index and column name.
 *
 * @param {import('@playwright/test').Locator} table
 * @param {number} row
 * @param {string} col
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function cell(table, row, col) {
    const hs = await heads(table);
    // Exact first: "Changed" is also the start of "Changed by".
    const i = hs.includes(col) ? hs.indexOf(col) : hs.findIndex(h => h.startsWith(col));
    return table.locator('tbody > tr').nth(row).locator(':scope > td').nth(i);
}

/**
 * Presses "Show all submissions" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} The table.
 */
async function showAll(page) {
    await page.locator('#mb-dg-root button[data-label="Show all submissions"]').click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.locator('#mb-dg-root table.tbl').first();
}

test.describe('discogs.com submissions, edit history, full-size images (2026-10-18)', () => {
    test('the flat view: our section first in <body>, the list\'s 12 flat pages same-origin, in order; Artist and Title split', async ({ page }) => {
        // Previews on: the Matched artist link must be one a reader takes.
        const { errors, fetched } = await openDg(page, { settings: { sa_pop_ext: true } });
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('Submissions from List (past 90 days): Springsteen-related');
        // Discogs' header and page share #main_wrapper here: never inside it.
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        const btn = root.locator('button[data-label="Show all submissions"]');
        await expect(btn).toHaveAttribute('title', /All 1,140 submissions of this list.*12 requests/);
        expect(fetched, 'nothing asked before the press').toEqual([]);
        const table = await showAll(page);
        expect(fetched).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(FLAT_PAGE));
        // The rows are not the API's; only the users' pictures are (dg avatars).
        expect((await apiLog(page)).filter(u => !/\/users\//.test(u)), 'not the API').toEqual([]);
        expect(await heads(table)).toEqual(expect.arrayContaining(['Artist', 'Title', 'Changed by', 'Changed', 'Matched artist', 'History']));
        // Every page is the saved page 1 here: 12 × 100.
        await expect(table.locator('tbody > tr')).toHaveCount(1200);
        await expect((await cell(table, 0, 'Artist')).locator('a'))
            .toHaveAttribute('href', 'https://www.discogs.com/search/?q=Bruce%20Springsteen&type=artist');
        const title = (await cell(table, 0, 'Title')).locator('a');
        await expect(title).toHaveText('Live In Dublin');
        await expect(title).toHaveAttribute('href', 'https://www.discogs.com/release/13191294-Bruce-Springsteen-Live-In-Dublin');
        await expect((await cell(table, 0, 'Changed by')).locator('a')).toHaveAttribute('href', 'https://www.discogs.com/user/Woodies1999');
        const when = await cell(table, 0, 'Changed');
        await expect(when).toHaveText('2026-10-17 18:37');
        await expect(when).toHaveAttribute('title', '6 minutes ago');
        // Date and time also apart, as on MusicBrainz's pageTypes (dateTimeParts).
        await expect(await cell(table, 0, 'Changed date')).toHaveText('2026-10-17');
        await expect(await cell(table, 0, 'Changed time')).toHaveText('18:37');
        // Discogs links it by name (no id): a search link instead, which the
        // search reader previews (vzell 2026-10-18: "not hyperlinked").
        const matched = (await cell(table, 0, 'Matched artist')).locator('a');
        await expect(matched).toHaveAttribute('href', 'https://www.discogs.com/search/?q=Bruce%20Springsteen&type=artist');
        expect(await matched.evaluate(a => window.__saTest.popResolve(a))).toMatch(/^ext\|ext:dgsearch:/);
        await expect((await cell(table, 0, 'History')).locator('a'))
            .toHaveAttribute('href', 'https://www.discogs.com/release/13191294-Live-In-Dublin/history');
        // At the first " - ": the artist keeps Discogs' "*", the title its own " - " (none here) and commas.
        await expect(await cell(table, 1, 'Artist')).toHaveText('Southside Johnny And The Asbury Jukes*');
        await expect(await cell(table, 2, 'Artist')).toHaveText('10,000 Maniacs');
        await expect(await cell(table, 2, 'Title')).toHaveText('MTV Unplugged');
        expect(errors).toEqual([]);
    });

    test('every column filter stays inside its own column, with Discogs\' own input[type=search] rule on the page (vzell 2026-10-18)', async ({ page }) => {
        const { errors } = await openDg(page);
        // Discogs' older pages (the submissions list, a user's page) load
        // st.discogs.com's discogs.css, whose `input[type=search]` (more
        // specific than `.mb-col-filter-input`) makes our inputs content-box:
        // width 100% plus 78 px padding ran ~86 px past each column
        // (debug/stretch.html served with that stylesheet). Its exact rule:
        await page.addStyleTag({ content: 'input[type=search]{-webkit-appearance:textfield;box-sizing:content-box}' });
        const table = await showAll(page);
        const boxes = await table.evaluate((t) => {
            const ths = Array.from(t.querySelectorAll('thead tr:first-child > th'));
            return ths.map((th, i) => {
                const input = t.querySelector(`thead tr.mb-col-filter-row > :nth-child(${i + 1}) input`);
                return { col: th.dataset.colName, thRight: Math.round(th.getBoundingClientRect().right),
                    inputRight: input ? Math.round(input.getBoundingClientRect().right) : null };
            });
        });
        boxes.filter(b => b.inputRight !== null).forEach((b) => {
            expect(b.inputRight, `${b.col}: its filter ends inside its column`).toBeLessThanOrEqual(b.thRight + 1);
        });
        expect(errors).toEqual([]);
    });

    test('"Changed by": each user\'s own picture, asked one at a time and only for rows on screen (vzell 2026-10-18)', async ({ page }) => {
        // Woodies1999 (row 1) answered as GuiBeal's capture with its name and picture.
        const g = FX('discogs-user-guibeal');
        const d = JSON.parse(g.body);
        const AVATAR = 'https://i.discogs.com/fixture-avatar-woodies1999.jpeg';
        Object.assign(d, { username: 'Woodies1999', avatar_url: AVATAR });
        const { errors } = await openDg(page, { responses: answer(Object.assign({}, g, { body: JSON.stringify(d) }), `${API}users/Woodies1999`) });
        const table = await showAll(page);
        const first = (await cell(table, 0, 'Changed by')).locator('img.mb-dg-avatar');
        await expect(first).toHaveAttribute('src', AVATAR, { timeout: 15000 });
        // Never inside the name's link (its preview would be lost).
        await expect((await cell(table, 0, 'Changed by')).locator('a img')).toHaveCount(0);
        const users = await page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => /api\.discogs\.com\/users\//.test(u)));
        expect(users.length, 'one at a time: a few by now, not the whole list').toBeLessThanOrEqual(3);
        const onTop = await table.evaluate((t) => {
            const hs = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
            return Array.from(t.tBodies[0].rows).slice(0, 40).map(r => r.cells[hs.indexOf('Changed by')].textContent.trim());
        });
        users.forEach(u => expect(onTop, `${u}: a user of a row on screen`).toContain(decodeURIComponent(u.split('/users/')[1])));
        expect(errors).toEqual([]);
    });

    test('Changed split into date and time with MusicBrainz\'s 📊 sections: Date info on the date, Time of day on the time (vzell 2026-10-18)', async ({ page }) => {
        const { errors } = await openDg(page);
        const table = await showAll(page);
        const open = async (col) => {
            await table.evaluate((t, name) => {
                Array.from(t.querySelectorAll('thead tr:first-child th')).find(x => (x.dataset.colName || '') === name)
                    .querySelector('.mb-col-uniq-wrap').click();
            }, col);
            await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
            return page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section-label')).map(s => s.textContent));
        };
        expect(await open('Changed date')).toEqual(expect.arrayContaining(['Date info - Decade', 'Date info - Year', 'Date info - Month', 'Date info - Weekday']));
        await page.keyboard.press('Escape');
        expect(await open('Changed time')).toEqual(expect.arrayContaining(['Time info - Time of day']));
        const afternoon = 'Afternoon (after lunch / festival start, 13:00-17:59)';
        await page.evaluate((lbl) => {
            const sec = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find(s => s.querySelector('.mb-uniq-section-label')?.textContent === 'Time info - Time of day');
            Array.from(sec.querySelectorAll('.mb-col-uniq-item')).find(el => el.dataset.mbUniqSynLabel === `» time of day: ${lbl}`).click();
        }, afternoon);
        const times = async () => table.evaluate((t) => {
            const i = Array.from(t.querySelectorAll('thead tr:first-child th')).findIndex(x => x.dataset.colName === 'Changed time');
            return Array.from(t.tBodies[0].rows).map(r => r.cells[i].textContent.trim());
        });
        await expect.poll(async () => (await times()).every(x => x >= '13:00' && x <= '17:59')).toBe(true);
        expect((await times()).length).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('the browser view: its list has no release ids, so the button reads the flat pages; named from the document title', async ({ page }) => {
        const { errors, fetched } = await openDg(page, { url: BROWSER, file: path.join(__dirname, 'dg-submissions-browser.html') });
        await expect(page.locator('#mb-dg-root h1.mb-dg-h1 bdi')).toHaveText('Submissions from List (past 90 days): Springsteen-related');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        const table = await showAll(page);
        expect(fetched, 'the page count from "1-100 of 1,140"').toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(SUB_PAGE));
        await expect(table.locator('tbody > tr')).toHaveCount(1200);
        expect(errors).toEqual([]);
    });

    test('the browser view: subbrowser.css\'s body rule no longer locks the window — the table scrolls down and to the right (vzell 2026-10-19)', async ({ page }) => {
        // Pins: the WINDOW scrolls both ways after the render. Discogs' own
        // rule (body overflow hidden, height 100%) is in the fixture's head,
        // so without the unlock the window stays at 0,0 however tall or
        // wide the table is (debug/discogs-scroll-bug.html).
        await page.setViewportSize({ width: 900, height: 600 });
        const { errors } = await openDg(page, { url: BROWSER, file: path.join(__dirname, 'dg-submissions-browser.html') });
        expect(await page.evaluate(() => Array.from(document.styleSheets).some(s => Array.from(s.cssRules)
            .some(r => r.selectorText === 'body' && r.style.overflow === 'hidden'))), 'the page\'s own lock is there').toBe(true);
        const table = await showAll(page);
        await expect(table.locator('tbody > tr')).toHaveCount(1200);
        // The mouse wheel, not window.scrollTo(): overflow hidden still lets
        // a script scroll the window, only the user cannot.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.mouse.move(450, 300);
        await page.mouse.wheel(0, 2000);
        await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'the wheel scrolls the window down' }).toBeGreaterThan(0);
        await page.mouse.wheel(600, 0);
        await expect.poll(() => page.evaluate(() => window.scrollX), { message: 'the wheel scrolls the window right' }).toBeGreaterThan(0);
        const ov = await page.evaluate(() => [document.documentElement, document.body].map(el => getComputedStyle(el).overflowY));
        expect(ov, 'no scrollbar is suppressed (html, body)').not.toContain('hidden');
        // Discogs' split pane is still there, below our section.
        await expect(page.locator('#hpane_wrap #historyData')).toHaveCount(1);
        expect(errors).toEqual([]);
    });

    test('the flat view (no split pane) is not tagged: nothing of Discogs\' own layout is overridden there', async ({ page }) => {
        await openDg(page);
        expect(await page.evaluate(() => document.body.classList.contains('mb-dg-unlock-scroll'))).toBe(false);
    });

    test('Cloudflare\'s check at a submissions URL (no #app, no #page_content) is left alone', async ({ page }) => {
        const { errors } = await openDg(page, { file: path.join(__dirname, 'dg-challenge.html') });
        expect(await page.locator('#mb-dg-root, h1.mb-dg-h1').count()).toBe(0);
        expect(errors).toEqual([]);
    });

    test('a history link: the card asks nothing; Space reads the history once — every change, its kinds, the latest change\'s diff', async ({ page }) => {
        const { errors, asked } = await openDg(page, { settings: { sa_pop_ext: true } });
        const table = await showAll(page);
        const link = (await cell(table, 0, 'History')).locator('a');
        expect(await page.evaluate(() => window.__saTest.popResolve(document.querySelector('#mb-dg-root table.tbl td a[href$="/history"]'))))
            .toBe('ext|ext:dghistory:https://www.discogs.com/release/13191294/history');
        await ctrlHover(page, link);
        // The card is drawn: a hover's load would have started by now.
        await expect(card(page)).toContainText('Not read yet');
        expect(asked, 'a hover never reads the history').toEqual([]);
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator('[data-mb-dg-sec="dgh-hist"] .mb-dg-c')).toHaveText('14');
        expect(asked).toEqual(['https://www.discogs.com/release/13191294-Live-In-Dublin/history']);
        const rows = d.locator('.mb-dgh-e');
        await expect(rows).toHaveCount(14);
        // Newest first: the latest marked, its date in ISO form, Discogs' "4 months ago" on hover.
        await expect(rows.first()).toHaveClass(/mb-dgh-latest/);
        await expect(rows.first().locator('.mb-dgh-d')).toHaveText('2026-06-05 17:29');
        await expect(rows.first().locator('.mb-dgh-d')).toHaveAttribute('title', '4 months ago');
        await expect(rows.first().locator('.mb-dgh-pill')).toHaveText('Edit Release');
        // The user's own picture, from the history page itself.
        await expect(rows.first().locator('.mb-dgh-u img.mb-dg-avatar')).toHaveAttribute('src', /^https:\/\/i\.discogs\.com\//);
        // Discogs' View and Changes as one button since round 2 (discogs-links.spec.js).
        await expect(rows.first().locator('.mb-dgh-lk [data-mb-dgh-act="diff"]')).toHaveText('View changes');
        await expect(d).toContainText('Needs Vote');
        // The kinds as a filter, the order as a switch.
        await d.locator('[data-mb-dgh-act="group"][data-mb-dgh-v="images"]').click();
        await expect(rows).toHaveCount(2);
        await expect(rows.locator('.mb-dgh-lk a')).toHaveText(['Images', 'Images']);
        await d.locator('[data-mb-dgh-act="group"][data-mb-dgh-v="all"]').click();
        await d.locator('[data-mb-dgh-act="order"][data-mb-dgh-v="old"]').click();
        await expect(rows.first().locator('.mb-dgh-pill')).toHaveText('Copy to Draft');
        await expect(rows.first().locator('.mb-dgh-d')).toHaveText('2016-02-24 13:24');
        // The latest change: only the blocks Discogs marked, unless the whole release is asked for.
        const diff = d.locator('[data-mb-dg-sec="dgh-diff"]');
        await expect(diff.locator('h4')).toContainText('revision 13 → 14');
        const names = () => diff.locator('.mb-dgh-diff > div > b').allTextContents();
        expect([...new Set(await names())]).toEqual(['Barcode and Other Identifiers']);
        await expect(diff.locator('.mb-dgh-add').first()).toBeVisible();
        await diff.locator('[data-mb-dgh-act="diffall"]').click();
        expect(new Set(await names())).toEqual(new Set(['Title', 'Label', 'Format', 'Country', 'Released', 'Genre', 'Style',
            'Tracklist', 'Companies, etc.', 'Notes', 'Barcode and Other Identifiers']));
        // Read once: the card now shows it from memory, no request more.
        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();
        await ctrlHover(page, link);
        await expect(card(page)).toContainText('Last change');
        await expect(card(page)).toContainText('2026-06-05 17:29 by GuiBeal (Edit Release)');
        expect(asked).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    test('a release title on the list: "History, then the release" — the history above the release\'s own window, one request each', async ({ page }) => {
        const rel = FX('discogs-release');
        const { errors, asked } = await openDg(page, { settings: { sa_pop_ext: true }, responses: answer(rel, `${API}releases/13191294`) });
        const table = await showAll(page);
        const title = (await cell(table, 0, 'Title')).locator('a');
        await ctrlHover(page, title);
        await expect(card(page)).toContainText('Edit history: Space reads it');
        expect(asked, 'the card never reads the history').toEqual([]);
        await page.keyboard.press('Space');
        const d = dialog(page);
        const top = d.locator('.mb-dg-top');
        await expect(top.locator('[data-mb-dg-sec="dgh-hist"] .mb-dg-c')).toHaveText('14');
        // Above the release's own columns, which follow as on every Discogs page.
        expect(await d.evaluate(el => {
            const t = el.querySelector('.mb-dg-top');
            const x = el.querySelector('.mb-dp-x');
            return !!(t && x && (t.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
        })).toBe(true);
        await expect(d.locator('[data-mb-dg-sec="tracklist"]')).toBeVisible();
        expect(asked).toEqual(['https://www.discogs.com/release/13191294/history']);
        expect((await apiLog(page)).filter(u => u === `${API}releases/13191294`)).toHaveLength(1);
        // A history control redraws the window, the release stays.
        await top.locator('[data-mb-dgh-act="group"][data-mb-dgh-v="merges"]').click();
        await expect(top.locator('.mb-dgh-e')).toHaveCount(2);
        await page.keyboard.press('Escape');
        await ctrlHover(page, title);
        await expect(card(page)).toContainText('Last change 2026-06-05 17:29 by GuiBeal (Edit Release)');
        expect(errors).toEqual([]);
    });

    test('the history page answers with something else (a sign-in page): the window says so and links the page', async ({ page }) => {
        const { errors } = await openDg(page, {
            settings: { sa_pop_ext: true },
            history: (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html><body><form id="login"></form></body></html>' }),
        });
        const table = await showAll(page);
        await ctrlHover(page, (await cell(table, 0, 'History')).locator('a'));
        await expect(card(page)).toContainText('Not read yet');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toContainText('not with the edit history');
        expect(errors).toEqual([]);
    });

    test('a thumbnail: the row\'s full images from its record, asked when shown; Shift+← → step through rows; back from the cache', async ({ page }) => {
        // The viewer's own request: without the image card, whose hover
        // (the click's pointer passes over the thumbnail first) would ask
        // for the record before the click (discogs-image-card.spec.js).
        const { errors } = await openDg(page, { url: MASTER, file: path.join(__dirname, 'dg-master.html'), settings: { sa_dg_tip_images: false } });
        await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const table = page.locator('#mb-dg-root table.tbl').first();
        const row = table.locator('tbody > tr', { has: page.locator('a[href="https://www.discogs.com/release/1874253"]') }).first();
        const before = (await apiLog(page)).length;
        await row.locator('a.mb-dg-thumblink').click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        // The record has five images (a primary, four secondary): all of them, full size.
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 5');
        await expect(viewer.locator('.mb-artv-info')).toContainText('primary');
        await expect(viewer.locator('.mb-artv-info')).toContainText('one request');
        const rel = JSON.parse(FX('discogs-release').body);
        await expect(viewer.locator('.mb-artv-bar a.mb-artv-btn', { hasText: 'Original' })).toHaveAttribute('href', rel.images[0].uri);
        expect((await apiLog(page)).slice(before), 'one request: the row shown').toEqual([`${API}releases/1874253`]);
        await page.keyboard.press('ArrowRight');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('2 / 5');
        await expect(viewer.locator('.mb-artv-info')).toContainText('secondary');
        // The next row: its own record (not captured here: Discogs' 404, said in the note).
        const rowPos = await viewer.locator('.mb-artv-rowpos').textContent();
        await page.keyboard.press('Shift+ArrowRight');
        await expect(viewer.locator('.mb-artv-rowpos')).not.toHaveText(rowPos);
        await expect(viewer.locator('.mb-artv-note')).toContainText(/no release|no other image/);
        expect((await apiLog(page)).slice(before)).toHaveLength(2);
        // Back: from memory, no request more.
        await page.keyboard.press('Shift+ArrowLeft');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 5');
        await expect(viewer.locator('.mb-artv-info')).toContainText('the cache');
        expect((await apiLog(page)).slice(before)).toHaveLength(2);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('a thumbnail whose record does not come: the thumbnail, why, and "Try again" asks once more', async ({ page }) => {
        const { errors } = await openDg(page, {
            url: MASTER, file: path.join(__dirname, 'dg-master.html'),
            responses: { [`${API}releases/1874253`]: { error: 'net::ERR_CONNECTION_RESET' } },
        });
        await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const row = page.locator('#mb-dg-root table.tbl tbody > tr', { has: page.locator('a[href="https://www.discogs.com/release/1874253"]') }).first();
        await row.locator('a.mb-dg-thumblink').click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer.locator('.mb-artv-note')).toContainText('Discogs did not answer');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 1');
        const asked = async () => (await apiLog(page)).filter(u => u === `${API}releases/1874253`).length;
        expect(await asked()).toBe(1);
        await viewer.locator('button[data-artv="retry"]').click();
        await expect.poll(asked).toBe(2);
        expect(errors).toEqual([]);
    });
});

test.describe('the edit-history reader on MusicBrainz (2026-10-18)', () => {
    test('a Discogs history link on a MusicBrainz page: its own reader, an anonymous request on Space, the window', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
        const HIST = 'https://www.discogs.com/release/8164856-Human-Touch/history';
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
            { [HIST]: { status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: HISTORY_HTML } });
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8',
            fixtureFile: path.join(__dirname, 'event-overview.html'), testMode: true,
            settingsOverride: { sa_pop_ext: true, sa_pop_ext_hosts: ['www.discogs.com'] },
        });
        // A link where MusicBrainz shows other sites' links (a details table).
        await page.evaluate((u) => {
            const td = document.querySelector('table.details td');
            const a = document.createElement('a');
            a.href = u;
            a.id = 'dgh-probe';
            a.textContent = 'Human Touch history';
            td.prepend(a, ' ');
        }, HIST);
        expect(await page.evaluate(() => window.__saTest.popResolve(document.getElementById('dgh-probe'))))
            .toBe('ext|ext:dghistory:https://www.discogs.com/release/8164856/history');
        await ctrlHover(page, page.locator('#dgh-probe'));
        await expect(card(page)).toContainText('Not read yet');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('[data-mb-dg-sec="dgh-hist"] .mb-dg-c')).toHaveText('14');
        const log = await page.evaluate(() => (window.__gmXhrLog || []).filter(r => r.url.includes('discogs')).map(r => ({ url: r.url, anonymous: r.anonymous })));
        expect(log).toEqual([{ url: 'https://www.discogs.com/release/8164856-Human-Touch/history', anonymous: true }]);
        expect(errors).toEqual([]);
    });
});
