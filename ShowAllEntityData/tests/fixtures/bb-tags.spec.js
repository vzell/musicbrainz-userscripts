'use strict';

// Brucebase tag pages (org/brucebase.org Phase 11; mockup
// https://claude.ai/artifact/CRpe5M7DbHfou2rFR9bYCT, vzell's answers 1–8):
// the tag cloud as a table (`bb-tags`), one tag's pages from the page or
// over ListPages (`bb-tag`), Pages & Tags this page / the whole list / the
// whole wiki (`bb-pages-and-tags`), and a tag link's card and window
// (reader `bbtag`). Fixtures: scripts/build-bb-tag-fixtures.py (pages),
// scripts/capture-bb-tag-answers.py (the AJAX answers, tests/fixtures/bb-tags/).
// docs/claude/brucebase.md, "Tag pages".

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbTagPage, BB_TAG_PAGES, BB_TAG_ANSWERS } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const fixture = (which) => fs.readFileSync(BB_TAG_PAGES[which].file, 'utf8');
const answerItems = (name) => (JSON.parse(fs.readFileSync(path.join(BB_TAG_ANSWERS, `${name}.json`), 'utf8')).body.match(/␃/g) || []).length;

/**
 * The rendered table: its column names and each visible row as
 * `{column: text}`, plus `_tags` (the Tags cell's items) and `_href` (the
 * first link of the first cell).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{names: string[], rows: Array<Object>}>}
 */
function rendered(page) {
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
        const rows = Array.from(t.querySelectorAll('tbody tr')).filter(tr => tr.style.display !== 'none').map((tr) => {
            const row = {};
            names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
            const tags = tr.cells[names.indexOf('Tags')];
            row._tags = tags ? Array.from(tags.querySelectorAll('li')).map(li => li.textContent.trim()) : [];
            row._tagHrefs = tags ? Array.from(tags.querySelectorAll('li a')).map(a => a.href) : [];
            const a = tr.cells[0]?.querySelector('a[href]');
            row._href = a ? a.href : '';
            return row;
        });
        return { names, rows };
    });
}

/**
 * Presses a button of the h1 and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Hovers an element with Ctrl held, as the other popup specs do.
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

const lpPosts = (posts) => posts.filter(p => p.moduleName === 'list/ListPagesModule');
const PAGE_COLS = ['Page', 'Kind', 'Date', 'Venue', 'City', 'State', 'Country'];
/** The date splitter's columns, which the engine puts last. */
const DATE_PARTS = ['DD', 'MM', 'YYYY', 'Day', 'Month'];

test.describe('Brucebase tag pages (Phase 11)', () => {
    test('the cloud as a table: every tag, its family from the song list and Relations, weight, pages estimated', async ({ page }) => {
        const { gets, posts } = await loadBbTagPage(page, 'cloud');
        await press(page, 'Show all tags');
        const { names, rows } = await rendered(page);
        expect(names).toEqual(['Tag', 'Family', 'Weight', 'Pages']);
        const inFixture = (fixture('cloud').match(/<a class="tag" href="\/system:page-tags\/tag\//g) || []).length;
        expect(rows.length).toBe(inFixture);
        const by = Object.fromEntries(rows.map(r => [r.Tag, r]));
        // The biggest tag is the scale: its count asked once, 24,695 pages.
        expect(by.content).toMatchObject({ Family: 'Category', Weight: '300', Pages: '≈ 24,695' });
        expect(by.storyteller).toMatchObject({ Family: 'On the page', Weight: '124', Pages: '≈ 2,963' });
        // Songs and people only the two lists can tell (answer 1).
        expect(by.badlands.Family).toBe('Songs');
        expect(by.thepromise.Family).toBe('Songs');
        expect(by.garrytallent.Family).toBe('People');
        expect(by['patti.scialfa'].Family).toBe('People');
        expect(by['1978'].Family).toBe('Date');
        expect(by.blauvelt).toMatchObject({ Family: 'Other', Weight: '100', Pages: '< 62' });
        expect(by.storyteller._href).toBe('https://brucebase.wikidot.com/system:page-tags/tag/storyteller');
        expect(by['&']._href).toBe('https://brucebase.wikidot.com/system:page-tags/tag/%26');
        // Three requests: the two lists, the biggest tag's count.
        expect(gets).toEqual(['/stats:songs', '/stats:relations']);
        expect(lpPosts(posts).map(p => [p.tags, p.module_body, p.perPage])).toEqual([['content', '%%total%%', '1']]);
        // The wiki's page stays, folded, under its own heading.
        await expect(page.locator('h2.mb-bb-native-h2')).toHaveText(/Brucebase page/);
        await expect(page.locator('h2.mb-bb-tags-heading')).toContainText('Tags');
    });

    test('the cloud: a list that cannot be read leaves its tags in Other, the table still comes', async ({ page }) => {
        await loadBbTagPage(page, 'cloud', { fail: ['/stats:songs'] });
        await press(page, 'Show all tags');
        const by = Object.fromEntries((await rendered(page)).rows.map(r => [r.Tag, r]));
        expect(by.badlands.Family).toBe('Other');
        expect(by.garrytallent.Family).toBe('People');
    });

    test('a tag\'s pages from the page: no request; kind, and date, venue, city, state, country of a show', async ({ page }) => {
        const { gets, posts } = await loadBbTagPage(page, 'tag');
        await press(page, 'Show the tagged pages');
        const { names, rows } = await rendered(page);
        expect(names).toEqual([...PAGE_COLS, ...DATE_PARTS]);
        expect(rows.length).toBe((fixture('tag').match(/class="pages-list-item"/g) || []).length);
        expect(rows[0]).toMatchObject({
            Page: '1971-05-15 Newark State College, Union, NJ', Kind: 'gig', Date: '1971-05-15', YYYY: '1971',
            Venue: 'Newark State College', City: 'Union', State: 'NJ', Country: 'USA',
        });
        expect(rows[0]._href).toBe('https://brucebase.wikidot.com/gig:1971-05-15-newark-state-college-union-nj');
        const story = rows.find(r => r.Kind === 'story');
        expect(story).toMatchObject({ Date: '', Venue: '', City: '' });
        // A page in no category (the Storyteller page itself): no kind.
        expect(rows.find(r => r.Page === 'Storyteller')).toMatchObject({ Kind: '' });
        // A 00 day is dropped, as on the year pages.
        expect(rows.find(r => r.Kind === 'interview').Date).toBe('2008-12');
        expect(gets).toEqual([]);
        expect(posts).toEqual([]);
        await expect(page.locator('h2.mb-bb-tags-heading')).toContainText('Pages tagged "storyteller"');
    });

    test('a tag\'s pages over ListPages: dates, size, comments, tags one row each', async ({ page }) => {
        const { posts } = await loadBbTagPage(page, 'tag');
        await press(page, 'Show the tagged pages with dates and sizes');
        const { names, rows } = await rendered(page);
        expect(names).toEqual([...PAGE_COLS, 'Created', 'Updated', 'Size', 'Comments', 'Tag count', 'Tags', ...DATE_PARTS]);
        expect(rows.length).toBe(answerItems('lp-storyteller-p1'));
        // One call: the fixture's 34 entries are one page of 250.
        expect(lpPosts(posts).map(p => [p.tags, p.perPage, p.order, p.p])).toEqual([['storyteller', '250', 'titleAsc', '1']]);
        expect(lpPosts(posts)[0].module_body).toContain('@@%%title%%@@');
        const first = rows[0];
        expect(first).toMatchObject({ Page: '1971-05-15 Newark State College, Union, NJ', Kind: 'gig', Size: '2751', Comments: '0' });
        expect(first.Created).toMatch(/^2018-02-(?:20|21)$/);
        expect(first.Updated).toMatch(/^2024-08-(?:21|22)$/);
        expect(first._tags.length).toBe(Number(first['Tag count']));
        expect(first._tags).toContain('storyteller');
        expect(first._tags).toEqual([...first._tags].sort());
        expect(first._tagHrefs).toContain('https://brucebase.wikidot.com/system:page-tags/tag/newjersey(nj)');
    });

    test('Pages & Tags, this page: no request, the tags one row each', async ({ page }) => {
        const { gets, posts } = await loadBbTagPage(page, 'pat');
        await press(page, 'Show this page');
        const { names, rows } = await rendered(page);
        expect(names).toEqual([...PAGE_COLS, 'Tag count', 'Tags', ...DATE_PARTS]);
        expect(rows.length).toBe(100);
        expect(rows[0]).toMatchObject({ Page: '1965-00-00 Caprioni Residence, Freehold, NJ', Kind: 'onstage', Date: '1965', City: 'Freehold', State: 'NJ' });
        expect(rows[0]._tags).toEqual(['craigcaprioni', 'donniepowell', 'jaygibson', 'jimmymcguire', 'onstage', 'private', 'rehearsal', 'rogues']);
        expect(rows.every(r => r._tags.length === Number(r['Tag count']))).toBe(true);
        expect(gets).toEqual([]);
        expect(posts).toEqual([]);
    });

    test('Pages & Tags, all pages of the list: the one shown from the page, every other a GET of /p/N', async ({ page }) => {
        // The fixture's pager cut to "page 1 of 3", so the run is three pages.
        const tmp = path.join(os.tmpdir(), `bb-pat-of-3-${process.pid}.html`);
        fs.writeFileSync(tmp, fixture('pat').replace(/page 1 of 35/g, 'page 1 of 3'));
        const dir = path.dirname(BB_TAG_PAGES.pat.file);
        const { gets } = await loadBbTagPage(page, 'pat', {
            fixtureFile: tmp,
            patPages: { 2: path.join(dir, 'bb-pages-and-tags-p2.html'), 3: path.join(dir, 'bb-pages-and-tags-p35.html') },
        });
        await press(page, 'Show all pages of the list');
        const { rows } = await rendered(page);
        const count = (f) => (fs.readFileSync(path.join(dir, f), 'utf8').match(/<td><a href="\/onstage:/g) || []).length;
        expect(rows.length).toBe(100 + count('bb-pages-and-tags-p2.html') + count('bb-pages-and-tags-p35.html'));
        expect(gets).toEqual(['/manage:pages-and-tags/p/2', '/manage:pages-and-tags/p/3']);
        fs.unlinkSync(tmp);
    });

    test('every page of the wiki: one count, then ListPages by name, as many calls as the count says', async ({ page }) => {
        const { posts } = await loadBbTagPage(page, 'pat', { totals: { '': 300 } });
        await press(page, 'Show every page of the wiki with its tags');
        const { names, rows } = await rendered(page);
        expect(names).toEqual([...PAGE_COLS, 'Created', 'Updated', 'Size', 'Comments', 'Tag count', 'Tags', ...DATE_PARTS]);
        expect(lpPosts(posts).map(p => [p.tags || '', p.module_body === '%%total%%' ? 'total' : 'rows', p.order, p.p])).toEqual([
            ['', 'total', 'fullname', '1'], ['', 'rows', 'fullname', '1'], ['', 'rows', 'fullname', '2'],
        ]);
        expect(rows.length).toBe(answerItems('lp-wiki-p1') + answerItems('lp-wiki-p2'));
        // Pages of no category ("1949-64", the year pages) have no kind.
        expect(rows[0]).toMatchObject({ Page: '1949-1964', Kind: '' });
    });

    test('a tag link\'s card: the count and the newest six, one call; on the cloud and on the tags line', async ({ page }) => {
        const { posts } = await loadBbTagPage(page, 'tag', { settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 } });
        const link = page.locator('div.pages-tag-cloud-box a.tag', { hasText: /^storyteller$/ });
        expect(await link.evaluate(a => window.__saTest.popResolve(a))).toContain('bbtag');
        await ctrlHover(page, link);
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('storyteller');
        await expect(card(page)).toContainText('3,008');
        await expect(card(page).locator('ul.mb-bbt-newest > li')).toHaveCount(answerItems('lp-storyteller-card'));
        expect(lpPosts(posts).map(p => [p.tags, p.perPage, p.order])).toEqual([['storyteller', '6', 'created_at desc']]);
        // The page's own tags line (outside #page-content) is the reader's too.
        const line = page.locator('div.page-tags a').first();
        expect(await line.evaluate(a => window.__saTest.popResolve(a))).toContain('bbtag');
        // Any other link of the site is still not "another site".
        expect(await page.evaluate(() => {
            const a = document.createElement('a');
            a.setAttribute('href', '/system:page-tags');
            document.querySelector('#page-content').appendChild(a);
            return window.__saTest.popResolve(a);
        })).toBeNull();
    });

    test('a tag link\'s window: the first 250 by title, "Load all" for the rest', async ({ page }) => {
        const { posts } = await loadBbTagPage(page, 'tag', { total: 300, settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 } });
        const link = page.locator('div.pages-tag-cloud-box a.tag', { hasText: /^storyteller$/ });
        await ctrlHover(page, link);
        await expect(card(page)).toBeVisible();
        await page.keyboard.press('Space');
        const sec = dialog(page).locator('section.mb-bbt-sec');
        const per = answerItems('lp-storyteller-p1');
        await expect(sec.locator('h4')).toContainText(`${per} of 300`);
        const btn = sec.locator('button[data-mb-bbt-act="all"]');
        await expect(btn).toHaveText('Load all 300');
        await btn.click();
        await expect(sec.locator('h4')).toContainText(`${per + answerItems('lp-storyteller-p2')} of 300`);
        await expect(btn).toHaveCount(0);
        expect(lpPosts(posts).map(p => [p.perPage, p.order, p.p])).toEqual([['6', 'created_at desc', '1'], ['250', 'titleAsc', '1'], ['250', 'titleAsc', '2']]);
        // A page of the list opens in the window (a Brucebase window).
        const opens = await sec.locator('table a[href*="/gig:"]').first().evaluate(a => !!a.closest('.mb-dp-area'));
        expect(opens).toBe(true);
    });

    test('with Brucebase off: no button on the tag pages', async ({ page }) => {
        await loadBbTagPage(page, 'cloud', { settingsOverride: { sa_enable_brucebase: false } });
        await expect(page.locator('button[data-label="Show all tags"]')).toHaveCount(0);
    });
});
