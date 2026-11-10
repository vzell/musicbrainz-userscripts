'use strict';

// discogs.com: a user's contributions page (`/contributions?user=vzell`) and
// submissions page (`/user/vzell/submissions`) as pageType `dg-user-list`
// (2026-11-10, feature/dg-user-seller-search; mockup
// https://claude.ai/artifact/2gnX1gagFEHTCC2LsFEn6n, tab A). Both read the
// same list from Discogs' API as dg-user's button for it.
//
// Fixtures: scripts/build-discogs-fixtures.py (dg-contributions.html from
// debug/d-contributions-user.html: the list sorted by Label without saying
// so in the URL; dg-user-submissions.html from debug/d-user-submissions.html:
// the browser view, "1-100 of 638"); the API answers are
// scripts/capture-ext-fixtures.py's.
//
// Pins: one button each, its cost from the page's own count; nothing asked
// before the press; the contributions asked in the page's sort (the marked
// column, or the URL's); the submissions' 7 pages; the page's `q` named as
// not applied, in the hover text and under the heading.
// Mutations: scripts/mutations/dg-user-seller-search.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const answer = (f, url = f.url) => ({ [url]: { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body } });
const API = 'https://api.discogs.com/';
const SUBS_PAGE = (p) => `${API}users/vzell/submissions?per_page=100&page=${p}`;
const CONTRIB_LABEL_ASC = `${API}users/vzell/contributions?sort=label&sort_order=asc&per_page=100&page=1`;
const ANSWERS = Object.assign({},
    answer(FX('discogs-user-vzell-contributions-label-asc-p1')),
    // Pages 1-6: page 1's answer; page 7 its own (releases and a label).
    ...[1, 2, 3, 4, 5, 6].map(p => answer(FX('discogs-user-vzell-submissions-p1'), SUBS_PAGE(p))),
    answer(FX('discogs-user-vzell-submissions-p7'), SUBS_PAGE(7)));

/**
 * Loads a list page fixture at `url`, the API answered from the captures.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} file
 * @returns {Promise<string[]>} Page errors.
 */
async function open(page, url, file) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, ANSWERS);
    await loadUserscriptPage(page, {
        url, fixtureFile: path.join(__dirname, file), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
    });
    return errors;
}

const apiLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://api.discogs.com/')));
const labels = (root) => root.locator('button[data-label^="Show the "]').evaluateAll(bs => bs.map(b => b.dataset.label));

/**
 * Presses a toolbar button by its label and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.locator(`#mb-dg-root button[data-label="${label}"]`).click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('discogs.com: a user\'s contributions and submissions pages (dg-user-list)', () => {
    test('contributions: one button with the page\'s count; asked in the sort the page marks (Label ▲); the three rows', async ({ page }) => {
        const errors = await open(page, 'https://www.discogs.com/contributions?user=vzell', 'dg-contributions.html');
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('vzell');
        expect(await labels(root)).toEqual(['Show the contributions']);
        await expect(root.locator('button[data-label="Show the contributions"]')).toHaveAttribute('title', /3 contributions.*1 request/);
        expect(await apiLog(page), 'nothing asked before the press').toEqual([]);
        await press(page, 'Show the contributions');
        expect(await apiLog(page)).toEqual([CONTRIB_LABEL_ASC]);
        const want = JSON.parse(FX('discogs-user-vzell-contributions-label-asc-p1').body).contributions.map(r => r.title);
        const table = root.locator('table.tbl').filter({ has: page.locator('tbody tr') }).first();
        const heads = await table.locator('thead tr:first-child th').evaluateAll(ths => ths.map(th => th.dataset.colName || th.textContent.trim()));
        const titles = await table.locator('tbody tr').evaluateAll((trs, i) => trs.map(tr => tr.cells[i].textContent.trim()), heads.indexOf('Title'));
        expect(titles).toEqual(want);
        await expect(root.locator('p.mb-dg-note')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('contributions: the URL\'s own sort wins over the marked column', async ({ page }) => {
        await open(page, 'https://www.discogs.com/contributions?user=vzell&sort=year&sort_order=desc', 'dg-contributions.html');
        await page.locator('#mb-dg-root button[data-label="Show the contributions"]').click();
        await expect.poll(() => apiLog(page)).toEqual([`${API}users/vzell/contributions?sort=year&sort_order=desc&per_page=100&page=1`]);
    });

    test('submissions: one button with the browser view\'s count (638, 7 requests); the window\'s scrolling unlocked; 7 pages', async ({ page }) => {
        const errors = await open(page, 'https://www.discogs.com/user/vzell/submissions', 'dg-user-submissions.html');
        const root = page.locator('#mb-dg-root');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-dg-root');
        await expect(page.locator('body')).toHaveClass(/\bmb-dg-unlock-scroll\b/);
        await expect(root.locator('h1.mb-dg-h1 bdi')).toHaveText('My Submissions');
        expect(await labels(root)).toEqual(['Show the submissions']);
        const btn = root.locator('button[data-label="Show the submissions"]');
        await expect(btn).toHaveAttribute('title', /638 submissions.*7 requests/);
        await expect(btn).not.toHaveAttribute('title', /not applied/);
        expect(await apiLog(page)).toEqual([]);
        await press(page, 'Show the submissions');
        expect(await apiLog(page)).toEqual([1, 2, 3, 4, 5, 6, 7].map(SUBS_PAGE));
        const h3s = await root.locator('h3').evaluateAll(hs => hs.map(h => Array.from(h.childNodes).filter(n => n.nodeType === 3)
            .map(n => n.textContent).join('').replace(/\s+/g, ' ').trim()));
        expect(h3s).toEqual(['Releases', 'Labels']);
        await expect(root.locator('p.mb-dg-note')).toHaveCount(0);
        expect(errors).toEqual([]);
    });

    test('submissions with the page\'s search (?q=): every submission asked, "not applied" in the hover text and under the heading', async ({ page }) => {
        const errors = await open(page, 'https://www.discogs.com/user/vzell/submissions?q=Nebraska', 'dg-user-submissions.html');
        const root = page.locator('#mb-dg-root');
        await expect(root.locator('button[data-label="Show the submissions"]')).toHaveAttribute('title', /search "Nebraska" is not applied/);
        await press(page, 'Show the submissions');
        expect(await apiLog(page)).toEqual([1, 2, 3, 4, 5, 6, 7].map(SUBS_PAGE));
        const note = root.locator('p.mb-dg-note');
        await expect(note).toHaveCount(1);
        await expect(note).toHaveText(/The page's search "Nebraska" is not applied: Discogs' API lists every submission\./);
        // Right under the list's heading, above the sub-tables.
        expect(await note.evaluate(p => p.previousElementSibling && p.previousElementSibling.matches('h2.mb-dg-list-heading'))).toBe(true);
        expect(await note.evaluate(p => !!(p.compareDocumentPosition(document.querySelector('#mb-dg-root h3')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        expect(errors).toEqual([]);
    });
});
