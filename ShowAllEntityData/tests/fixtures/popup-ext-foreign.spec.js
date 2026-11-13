'use strict';

// External link previews ON the Springsteen sites (org/iframe.org, "*
// generalize to URLs", U5): `_extSource()` there serves every link to
// ANOTHER site in the table and in the site's content area
// (`_DP_SITES[host].extRoot`: springsteenlyrics.com's `.project-detail`,
// Brucebase's `#page-content`), never its chrome (share bar, menus, footer:
// `_EXT_SKIP_SEL`). The census of the fixtures that chose these: on
// springsteenlyrics.com the intro text of a list links Brucebase, the top bar
// and footer Facebook/X/Reddit; on Brucebase the song list's tabs link
// estreetshuffle.com, wikidot's top bar, header and footer its own pages;
// jungleland.it and brucespringsteen.it lists link no other site.
//
// Pins:
//   1. off when switched off there too: no card, no request;
//   2. what is previewed: content links yes, chrome no, the site's own links
//      stay its own (the detail-page source), a link outside the content
//      area no;
//   3. a link to another Springsteen site gets that site's card (U4's
//      readers work from any host), anonymously, with NO MusicBrainz part:
//      no context line, no "MusicBrainz knows this URL", no Web Service call;
//   4. Brucebase: its wiki text's link previewed, wikidot's chrome not.
//
// Every external answer comes from the GM_xmlhttpRequest stub
// (window.__gmXhrResponses), logged in window.__gmXhrLog.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadSlListPage } = require('../support/slFixture');
const { loadBbSongsPage } = require('../support/bbFixture');

const HTML_HEADERS = 'Content-Type: text/html; charset=utf-8';
const BB_SONG = 'https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy';
const SHUFFLE = 'https://estreetshuffle.com/index.php/roll-of-the-dice-album-by-album/';
const fixture = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
// Every logged GM request but the script's own changelog check.
const xhrLog = (page) => page.evaluate(() => (window.__gmXhrLog || [])
    .filter(r => !/^https:\/\/raw\.githubusercontent\.com\//.test(r.url))
    .map(r => ({ url: r.url, anonymous: r.anonymous })));

/**
 * Hovers an element with Ctrl held (down while parked, up after), as the
 * other popup specs do.
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
 * Sets the GM_xmlhttpRequest answers before the page loads.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} responses
 * @returns {Promise<void>}
 */
const answer = (page, responses) => page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, responses);

/**
 * Adds a link to a container, as the site's text would carry it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} container - A selector.
 * @param {string} href
 * @param {string} text
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function addLink(page, container, href, text) {
    await page.evaluate(([c, h, x]) => {
        const a = document.createElement('a');
        a.setAttribute('href', h);
        a.className = 'u5-probe';
        a.textContent = x;
        const host = document.querySelector(c);
        host.insertBefore(a, host.firstChild);
    }, [container, href, text]);
    return page.locator(`a.u5-probe[href="${href}"]`).first();
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e)));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('external link previews on the Springsteen sites (U5)', () => {
    test('off when switched off there too: no card, no request', async ({ page }) => {
        await page.clock.install();
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_ext_hosts: ['brucebase.wikidot.com'] } });
        const bb = await addLink(page, '.project-detail', BB_SONG, '4th Of July');
        await ctrlHover(page, bb);
        await page.clock.fastForward(1000);
        await expect(card(page)).toHaveCount(0);
        expect(await xhrLog(page)).toEqual([]);
    });

    // A list page (the engine runs only where the script has a pageType: the
    // intro page the census found Brucebase links on has none), its text
    // given the intro page's Brucebase link.
    test('what is previewed on springsteenlyrics.com: its text\'s links to other sites, never its chrome or its own links', async ({ page }) => {
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_pop_ext: true } });
        await addLink(page, '.project-detail', 'http://brucebase.wikidot.com/', 'Brucebase');
        const r = await page.evaluate(() => {
            const R = (el) => window.__saTest.popResolve(el);
            const outside = document.createElement('a');
            outside.setAttribute('href', 'https://example.org/outside');
            document.body.appendChild(outside);
            const own = document.createElement('a');
            own.setAttribute('href', 'https://www.springsteenlyrics.com/bootlegs.php?item=6739');
            document.querySelector('.project-detail').appendChild(own);
            return {
                text: R(document.querySelector('.project-detail a[href="http://brucebase.wikidot.com/"]')),
                topBar: R(document.querySelector('.top-bar a[href*="facebook"]')),
                footer: R(document.querySelector('.footer-col a[href*="reddit"]')),
                own: R(own),
                outside: R(outside),
            };
        });
        expect(r.text, 'the intro text links Brucebase').toBe('ext|ext:generic:http://brucebase.wikidot.com/');
        expect(r.topBar, 'the share bar is chrome').toBeNull();
        expect(r.footer, 'the footer is chrome').toBeNull();
        expect(r.own, 'the site\'s own link is not another site\'s').toBeNull();
        expect(r.outside, 'outside the content area').toBeNull();
    });

    test('a link to Brucebase from springsteenlyrics.com: Brucebase\'s own card, anonymous, nothing from MusicBrainz', async ({ page }) => {
        const ws2 = [];
        page.on('request', (q) => { if (/\/ws\/2\//.test(q.url())) ws2.push(q.url()); });
        await answer(page, { [BB_SONG]: { status: 200, responseHeaders: HTML_HEADERS, responseText: fixture('detail-bb-4th-of-july.html') } });
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 } });
        const link = await addLink(page, '.project-detail', BB_SONG, '4th Of July');
        await ctrlHover(page, link);
        const c = card(page);
        await expect(c.locator('.mb-tt-title').first()).toHaveText('4th Of July, Asbury Park (Sandy)');
        await expect(c).toContainText('280');
        await expect(c.locator('.mb-ext-host')).toHaveText('brucebase.wikidot.com');
        await expect(c, 'no MusicBrainz context on another site').not.toContainText('MusicBrainz:');
        expect(await xhrLog(page)).toEqual([{ url: BB_SONG, anonymous: true }]);

        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Detail page');
        await expect(d).toContainText('Credits');
        await expect(d, 'no Web Service lookup from another site').not.toContainText('MusicBrainz knows this URL');
        expect(ws2).toEqual([]);
    });

    // vzell, 2026-11-12: a Brucebase window opens every link with a reader in
    // place, as a MusicBrainz entity's does (`_dpWinIsBb()`) — here the
    // `springsteen` reader's window of a Brucebase page on another site.
    test('a Brucebase page\'s window on springsteenlyrics.com opens a Wikipedia link in place, with Back', async ({ page }) => {
        const WIKI = 'https://en.wikipedia.org/wiki/Asbury_Park,_New_Jersey';
        await answer(page, { [BB_SONG]: { status: 200, responseHeaders: HTML_HEADERS, responseText: fixture('detail-bb-4th-of-july.html') } });
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 } });
        const link = await addLink(page, '.project-detail', BB_SONG, '4th Of July');
        await ctrlHover(page, link);
        await expect(card(page).locator('.mb-tt-title').first()).toHaveText('4th Of July, Asbury Park (Sandy)');
        await page.keyboard.press('Space');
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title).toHaveText('Detail page');
        await page.evaluate((h) => {
            const a = document.createElement('a');
            a.className = 'g-probe';
            a.href = h;
            a.target = '_blank';
            a.textContent = 'Asbury Park';
            document.querySelector('#mb-dp-dialog .mb-dp-area').appendChild(a);
        }, WIKI);
        const pages = [];
        page.on('popup', (pp) => pages.push(pp.url()));
        await dialog(page).locator('a.g-probe').click();
        await expect(title, 'one step deeper in the same window').toContainText('›');
        expect(pages, 'no new tab').toEqual([]);
        await page.keyboard.press('Backspace');
        await expect(title).toHaveText('Detail page');
    });

    test('Brucebase: the wiki text\'s link to another site, never wikidot\'s menus, header or footer', async ({ page }) => {
        await answer(page, {
            [SHUFFLE]: {
                status: 200, responseHeaders: HTML_HEADERS,
                responseText: '<!doctype html><html><head><title>Roll of the Dice – E Street Shuffle</title>' +
                    '<meta property="og:site_name" content="E Street Shuffle"></head><body></body></html>',
            },
        });
        await loadBbSongsPage(page, { settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0, sa_pop_ext_hosts: ['estreetshuffle.com'] } });
        const r = await page.evaluate((u) => {
            const R = (el) => window.__saTest.popResolve(el);
            return {
                text: R(document.querySelector(`#page-content a[href="${u}"]`)),
                topBar: R(document.querySelector('#top-bar a[href*="wikidot.com"]')),
                header: R(document.querySelector('#login-status a[href*="wikidot.com"]')),
                footer: R(document.querySelector('#footer a[href*="wikidot.com"]')),
            };
        }, SHUFFLE);
        expect(r.text).toBe(`ext|ext:generic:${SHUFFLE}`);
        expect(r.topBar, 'wikidot\'s top bar').toBeNull();
        expect(r.header, 'the login status').toBeNull();
        expect(r.footer, 'the footer').toBeNull();

        const link = await addLink(page, '#page-content', SHUFFLE, 'Roll of the Dice');
        await ctrlHover(page, link);
        await expect(card(page).locator('.mb-tt-title').first()).toHaveText('Roll of the Dice – E Street Shuffle');
        await expect(card(page)).toContainText('E Street Shuffle');
        expect(await xhrLog(page)).toEqual([{ url: SHUFFLE, anonymous: true }]);
    });
});

// G2 and G3 of NON-MB-COVERAGE.org (2026-11-03): inside a window on a
// Springsteen site, a musicbrainz.org link opens MusicBrainz's own window
// (`_MB_FOREIGN_POP_HOST`, vzell's consent of that day; its Web Service
// request stays anonymous), and on Brucebase a show on its year page
// (`/<yyyy>#<ddmmyy>`, the page's own host) opens the Brucebase show reader.
// Both kept their new tab before. The window is the wiki text's outside
// link's (a generic page); the probe link is written as a window writes its
// links (absolute, target=_blank).
test.describe('links inside a window on Brucebase (G2, G3)', () => {
    const BRUCE = '70248960-cb53-4ea4-943a-edb18f7d336f';
    const YEAR = 'https://brucebase.wikidot.com/1985';

    /**
     * Loads stats:songs and opens the generic window of an outside link of
     * its wiki text, with the GM answers the drill-downs need.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object} settings
     * @returns {Promise<import('@playwright/test').Locator>} The window's title path.
     */
    async function openShuffleWindow(page, settings = {}) {
        await answer(page, {
            [SHUFFLE]: {
                status: 200, responseHeaders: HTML_HEADERS,
                responseText: '<!doctype html><html><head><title>Roll of the Dice – E Street Shuffle</title></head><body></body></html>',
            },
            [YEAR]: { status: 200, responseHeaders: HTML_HEADERS, responseText: fixture('bb-year-1985.html') },
        });
        const artist = fixture('ws2-pop-artist-bruce.json');
        await page.context().addInitScript(([b, id]) => {
            window.__gmXhrResponder = (opts) => {
                const u = new URL(opts.url);
                if (u.origin === 'https://musicbrainz.org' && u.pathname === `/ws/2/artist/${id}`) {
                    return { status: 200, responseHeaders: 'Content-Type: application/json', responseText: b };
                }
                return undefined;
            };
        }, [artist, BRUCE]);
        await loadBbSongsPage(page, {
            settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0, sa_pop_ext_hosts: ['estreetshuffle.com'], ...settings },
        });
        const link = await addLink(page, '#page-content', SHUFFLE, 'Roll of the Dice');
        await ctrlHover(page, link);
        await expect(card(page).locator('.mb-tt-title').first()).toHaveText('Roll of the Dice – E Street Shuffle');
        await page.keyboard.press('Space');
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title).toHaveText('Web page');
        return title;
    }

    /**
     * Writes a link into the open window, as the window writes its own.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} href
     * @param {string} text
     * @returns {Promise<import('@playwright/test').Locator>}
     */
    async function linkInWindow(page, href, text) {
        await page.evaluate(([h, x]) => {
            const a = document.createElement('a');
            a.className = 'g-probe';
            a.href = h;
            a.target = '_blank';
            a.textContent = x;
            document.querySelector('#mb-dp-dialog .mb-dp-area').appendChild(a);
        }, [href, text]);
        return dialog(page).locator('a.g-probe');
    }

    test('G2: a MusicBrainz link opens MusicBrainz\'s window in place; its Web Service request is anonymous; Back returns', async ({ page }) => {
        const title = await openShuffleWindow(page, { sa_pop_mb: true });
        const pages = [];
        page.on('popup', (pp) => pages.push(pp.url()));
        await (await linkInWindow(page, `https://musicbrainz.org/artist/${BRUCE}`, 'Bruce Springsteen')).click();
        await expect(title, 'one step deeper in the same window').toContainText('›');
        await expect(dialog(page).locator('.mb-dp-area')).toContainText('Bruce Springsteen');
        const ws = (await xhrLog(page)).filter(r => r.url.startsWith(`https://musicbrainz.org/ws/2/artist/${BRUCE}`));
        expect(ws.length, 'MusicBrainz\'s Web Service asked').toBeGreaterThan(0);
        expect(ws.every(r => r.anonymous), 'the Web Service request carries no cookies').toBe(true);
        expect(pages, 'no new tab').toEqual([]);
        await page.keyboard.press('Backspace');
        await expect(title).toHaveText('Web page');
    });

    test('G2: with MusicBrainz previews off (sa_pop_mb), the MusicBrainz link keeps its new tab', async ({ page }) => {
        await openShuffleWindow(page, { sa_pop_mb: false });
        const popup = page.waitForEvent('popup');
        await page.context().route(`https://musicbrainz.org/artist/${BRUCE}`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>mb</p>' }));
        await (await linkInWindow(page, `https://musicbrainz.org/artist/${BRUCE}`, 'Bruce Springsteen')).click();
        expect((await popup).url()).toBe(`https://musicbrainz.org/artist/${BRUCE}`);
    });

    test('G3: a show on its Brucebase year page opens the show reader in the window, though it is this site\'s own link', async ({ page }) => {
        const title = await openShuffleWindow(page);
        const pages = [];
        page.on('popup', (pp) => pages.push(pp.url()));
        await (await linkInWindow(page, `${YEAR}#130185`, '1985-01-13 Carolina Coliseum')).click();
        await expect(title, 'the Brucebase show, one step deeper').toHaveText('Web page › Brucebase show');
        await expect.poll(async () => (await xhrLog(page)).map(r => r.url)).toContain(YEAR);
        expect(pages, 'no new tab').toEqual([]);
        // On the page itself the show reader takes it too since 2026-11-11
        // (org/brucebase.org Phase 8; bb-date-links.spec.js has the rest).
        const onPage = await page.evaluate((h) => {
            const a = document.createElement('a');
            a.setAttribute('href', h);
            document.querySelector('#page-content').appendChild(a);
            return window.__saTest.popResolve(a);
        }, `${YEAR}#130185`);
        expect(onPage).toContain('bbdate');
    });

    // A generic page's window is no all-links window (`_DP_WIN_ALL_LINKS_*`):
    // only `_DP_WIN_EXT_READERS`' readers open in it. Since 2026-10-29 every
    // MusicBrainz and setlist.fm window opens everything, so the guard had no
    // spec left that could see it (mutation list win-ext-bb.json, 2026-11-06).
    test('G4: a link whose reader is not an in-window one (Wikipedia) keeps its new tab here', async ({ page }) => {
        const WIKI = 'https://en.wikipedia.org/wiki/Bruce_Springsteen';
        const title = await openShuffleWindow(page);
        await page.context().route(WIKI, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>wiki</p>' }));
        const popup = page.waitForEvent('popup');
        await (await linkInWindow(page, WIKI, 'Bruce Springsteen')).click();
        expect((await popup).url()).toBe(WIKI);
        await expect(title, 'the window did not step').toHaveText('Web page');
    });
});
