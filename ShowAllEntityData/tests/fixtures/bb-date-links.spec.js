'use strict';

// Brucebase show links (`/<yyyy>#<ddmmyy>`: a show on its year page) preview
// on Brucebase's own pages too (vzell, 2026-11-11, org/brucebase.org Phase 8).
// The `bbdate` reader (_extBbDateTest(), _extBbYear()) served them on every
// other site and, since G3 of NON-MB-COVERAGE.org (2026-11-03), inside a
// window on Brucebase; on the page itself they were the site's own. They sit
// in an event's "Info & Setlist", a release's "recorded July 6, 1981", a
// song's text, and our tables' copies of them. The click stays the site's.
// docs/claude/detail-pages.md, "The Brucebase date anchor".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage, BB_EVENT_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const HTML_HEADERS = 'Content-Type: text/html; charset=utf-8';
const YEAR = 'https://brucebase.wikidot.com/1985';
const fixture = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
/**
 * The icon titles of one show of the 1985 fixture, read with a plain regex
 * (independent of the parser): from its anchor to the next anchor or <hr>,
 * every img title but "Help Us…", first of each.
 *
 * @param {string} anchor - "130185".
 * @returns {string[]}
 */
function fixtureIconTitles(anchor) {
    const html = fixture('bb-year-1985.html');
    const from = html.indexOf(`<a name="${anchor}"`);
    const rest = html.slice(from + 10);
    const end = Math.min(...[rest.search(/<a name="\d{6}"/), rest.search(/<hr\b/)].filter(i => i >= 0));
    const titles = [...rest.slice(0, end).matchAll(/<img[^>]*\btitle="([^"]*)"/g)].map(m => m[1])
        .filter(t => t && !/^Help/i.test(t));
    return [...new Set(titles)];
}
const yearAsks = (page) => page.evaluate((y) => (window.__gmXhrLog || []).filter(r => r.url === y).length, YEAR);

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

/**
 * Loads the 1978-07-07 gig with link previews on and the 1985 year page as
 * the GM answer, then writes two 1985 show links into the wiki's text, as
 * a release's or song's text carries them (relative, no target).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<{a: import('@playwright/test').Locator, b: import('@playwright/test').Locator}>}
 */
async function loadWithShowLinks(page, settings = {}) {
    await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
        { [YEAR]: { status: 200, responseHeaders: HTML_HEADERS, responseText: fixture('bb-year-1985.html') } });
    await loadBbEventPage(page, 'gig-1978-07-07', {
        settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.evaluate(() => {
        const p = document.createElement('p');
        p.innerHTML = 'recorded <a class="p8-a" href="/1985#130185">January 13, 1985</a> and ' +
            '<a class="p8-b" href="/1985#050185">January 5, 1985</a>';
        document.querySelector('#page-content').prepend(p);
    });
    return { a: page.locator('a.p8-a'), b: page.locator('a.p8-b') };
}

test.describe('Brucebase show links on Brucebase pages (Phase 8)', () => {
    test('the gig\'s own "Info & Setlist" link is a show link the previews take', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: { sa_pop_ext: true } });
        const nav = page.locator('#page-content a[href="/1978#070778"]');
        await expect(nav).toHaveText('Info & Setlist');
        const r = await nav.evaluate(a => window.__saTest.popResolve(a));
        expect(r).toContain('ext');
        expect(r).toContain('bbdate');
        // Another of the site's own links is still not "another site".
        const other = await page.evaluate(() => {
            const a = document.createElement('a');
            a.setAttribute('href', '/1978');
            document.querySelector('#page-content').appendChild(a);
            return window.__saTest.popResolve(a);
        });
        expect(other).toBeNull();
    });

    test('rendered: every show link in our head and tables is taken too', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: { sa_pop_ext: true } });
        await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const found = await page.evaluate(() => [...document.querySelectorAll('.mb-fd-head a[href], .mb-fd-sub a[href], table.tbl > tbody a[href]')]
            .filter(a => /^(?:https?:\/\/brucebase\.wikidot\.com)?\/\d{4}#\d{6}$/.test(a.getAttribute('href')))
            .map(a => ({ href: a.getAttribute('href'), r: window.__saTest.popResolve(a) })));
        expect(found.length, 'the rendered page carries show links').toBeGreaterThan(0);
        expect(found.filter(f => !(f.r && f.r.includes('bbdate')))).toEqual([]);
    });

    test('card on hover, the show in the window on Space, one year-page request for two shows', async ({ page }) => {
        const { a, b } = await loadWithShowLinks(page);
        await ctrlHover(page, a);
        await expect(card(page)).toBeVisible();
        await page.keyboard.press('Space');
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title).toHaveText('Brucebase show');
        await expect(dialog(page).locator('.mb-dp-area')).toContainText('1985-01-13');
        expect(await yearAsks(page)).toBe(1);
        // The year page's icons (vzell, 2026-11-12, Image #21/#22): each the
        // site's own image with its word, in place of the line in the Fields.
        const titles = fixtureIconTitles('130185');
        expect(titles.length, 'the fixture\'s show has icons').toBeGreaterThan(2);
        const icons = dialog(page).locator('ul.mb-dp-icons > li');
        await expect(icons).toHaveText(titles);
        const srcs = await icons.locator('img').evaluateAll(imgs => imgs.map(i => i.getAttribute('src')));
        expect(srcs.every(u => /^https:\/\/brucebase\.wdfiles\.com\/local--files\/content:files\/00\w+-32\.png$/.test(u)), srcs.join(' ')).toBe(true);
        await expect(dialog(page).locator('dl.mb-dp-kv dt', { hasText: 'The gig page has' })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        // A second show of the same year costs nothing.
        await ctrlHover(page, b);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-area')).toContainText('1985-01-05');
        expect(await yearAsks(page)).toBe(1);
    });

    test('the show\'s window opens a Wikipedia link in place, with Back (a Brucebase window)', async ({ page }) => {
        const WIKI = 'https://en.wikipedia.org/wiki/Colonial_Life_Arena';
        const { a } = await loadWithShowLinks(page);
        await ctrlHover(page, a);
        await page.keyboard.press('Space');
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title).toHaveText('Brucebase show');
        await page.evaluate((h) => {
            const x = document.createElement('a');
            x.className = 'p8-wiki';
            x.href = h;
            x.target = '_blank';
            x.textContent = 'Colonial Life Arena';
            document.querySelector('#mb-dp-dialog .mb-dp-area').appendChild(x);
        }, WIKI);
        const pages = [];
        page.on('popup', (pp) => pages.push(pp.url()));
        await dialog(page).locator('a.p8-wiki').click();
        await expect(title, 'one step deeper in the same window').toContainText('›');
        expect(pages, 'no new tab').toEqual([]);
        await page.keyboard.press('Backspace');
        await expect(title).toHaveText('Brucebase show');
    });

    test('a click on the page is still the site\'s: not taken, no window', async ({ page }) => {
        const { a } = await loadWithShowLinks(page);
        await page.evaluate(() => {
            window.__p8 = null;
            document.addEventListener('click', (e) => {
                if (e.target.closest('a.p8-a')) { window.__p8 = e.defaultPrevented; e.preventDefault(); }
            });
        });
        await a.click();
        expect(await page.evaluate(() => window.__p8)).toBe(false);
        await expect(dialog(page)).toBeHidden();
    });

    test('with link previews off (sa_pop_ext) nothing happens', async ({ page }) => {
        const { a } = await loadWithShowLinks(page, { sa_pop_ext: false });
        await ctrlHover(page, a);
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeHidden();
        expect(await yearAsks(page)).toBe(0);
    });
});
