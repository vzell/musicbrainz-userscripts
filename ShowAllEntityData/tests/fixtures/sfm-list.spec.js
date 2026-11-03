'use strict';

// setlist.fm's list of a venue's or an artist's setlists as pageTypes
// `sfm-venue` / `sfm-artist` (2026-11-02, org/setlistfm.org item 2 and Q9;
// mockup https://claude.ai/artifact/71itNE6a2ekiAtQxcTi1hq view 4;
// docs/claude/setlistfm.md). Every page, page 1 too, is fetched same-origin
// and its `.setlistPreview` cards become rows; the live page gets our own
// section, first in <body>, with an empty table.
//
// Fixtures: scripts/build-setlistfm-fixtures.py from vzell's snapshots
// (State Farm Arena pages 1 and 2, its pager cut from 93 pages to 2; the
// one-page Colts Neck venue; Bruce Springsteen's page 1).
//
// Pins: the switch; the section's place and name; nothing fetched before the
// press; the page count from the live pager; each page fetched once, page 1
// included; the columns and known rows' cells (date linked to the setlist,
// artist or venue linked, event only when the heading names one, the tour
// as setlist.fm's own link, Doors / Start / End on a 24-hour clock, "12+"
// songs); Upcoming Shows kept out. Mutations: scripts/mutations/setlistfm-list.json.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const SFM = 'https://www.setlist.fm';
const FX = name => path.join(__dirname, name);
const PAGES = {
    '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html': ['sfm-page-venue-73d20e81-p1.html', 'sfm-page-venue-73d20e81-p2.html'],
    '/venue/private-venue-colts-neck-nj-usa-53d30b75.html': ['sfm-page-venue-53d30b75.html'],
    '/setlists/bruce-springsteen-2bd6dcce.html': ['sfm-page-artist-2bd6dcce-p1.html'],
    // A search for an artist's tour (2026-11-03): one page in the fixture.
    '/search': ['sfm-page-search-2bd6dcce-3daa95b.html'],
};

/**
 * Loads a setlist.fm list page (at `?page=1`, so the fetch of page 1, which
 * drops `page=`, is a URL of its own the log sees) with every page of the
 * list served from the fixtures and everything else blocked.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} pathName - The path, with a search's query.
 * @param {Object} [settings]
 * @returns {Promise<{served: string[], errors: string[]}>}
 */
async function open(page, pathName, settings = {}) {
    const served = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    await page.route((u) => u.hostname === 'www.setlist.fm' && Object.prototype.hasOwnProperty.call(PAGES, u.pathname), (route) => {
        const u = new URL(route.request().url());
        served.push(u.pathname + u.search);
        const file = PAGES[u.pathname][Number(u.searchParams.get('page') || 1) - 1];
        return file ? route.fulfill({ path: FX(file), contentType: 'text/html; charset=utf-8' }) : route.fulfill({ status: 404, body: '' });
    });
    await loadUserscriptPage(page, {
        url: `${SFM}${pathName}${pathName.includes('?') ? '&' : '?'}page=1`, fixtureFile: FX(PAGES[pathName.split('?')[0]][0]), testMode: true,
        settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_setlistfm: true, sa_render_threshold: 100000, ...settings },
    });
    return { served, errors };
}

/**
 * Presses the list's button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function show(page, label) {
    await page.click(`#mb-sfm-root button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The rendered rows as {column: text} objects, and each cell's first link.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object>>}
 */
function rows(page) {
    return page.evaluate(() => {
        const table = document.querySelector('#mb-sfm-root table.tbl');
        const names = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || th.textContent.trim());
        return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
            const row = {};
            names.forEach((n, i) => {
                const td = tr.cells[i];
                row[n] = (td?.textContent || '').replace(/\s+/g, ' ').trim();
                const a = td?.querySelector('a[href]');
                if (a) row[`${n}@`] = a.href;
            });
            return row;
        });
    });
}

test.describe('setlist.fm list pages (sfm-venue, sfm-artist)', () => {
    test('a venue: our section first in <body>, named by the page; nothing fetched before the press; both pages fetched once each, page 1 too; the cards as rows', async ({ page }) => {
        const { served, errors } = await open(page, '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html');
        await expect(page.locator('#mb-sfm-root h1.mb-sfm-h1 bdi')).toHaveText('State Farm Arena Atlanta Concert Setlists');
        expect(await page.evaluate(() => document.body.firstElementChild.id)).toBe('mb-sfm-root');
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-sfm'))).toBe(true);
        expect(served, 'nothing before the press').toEqual([]);
        await show(page, 'Show all setlists of this venue');
        expect(served).toEqual(['/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html', '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html?page=2']);
        const r = await rows(page);
        expect(r).toHaveLength(20);
        expect(Object.keys(r[0]).filter(k => !k.endsWith('@'))).toEqual(['Date', 'Artist', 'Event', 'Tour', 'Doors', 'Start', 'End', 'Songs', 'Setlist']);
        expect(r[0]).toMatchObject({
            Date: '2026-11-04', 'Date@': `${SFM}/setlist/dave-chappelle/2026/state-farm-arena-atlanta-ga-5b7f03d8.html`,
            Artist: 'Dave Chappelle', 'Artist@': `${SFM}/setlists/dave-chappelle-73d60a59.html`, Event: '',
            Tour: 'Karmageddon', 'Tour@': `${SFM}/search?artist=73d60a59&tour=73da5add`, Doors: '', Start: '', End: '', Songs: '', Setlist: '',
        });
        const sturgill = r.find(x => x.Artist === 'Sturgill Simpson');
        expect(sturgill).toMatchObject({ Doors: '19:00', Start: '20:00', End: '23:05', Songs: '12+' });
        // (The column is collapsable: its cells end in the toggle's "▶more".)
        expect(sturgill.Setlist).toMatch(/^SpottieOttieDopaliscious · Make America Fuk Again · .* A Good Look …/);
        expect(r.find(x => x.Artist === 'Big Boi')).toMatchObject({ Songs: '4', Setlist: 'The Way You Move · So Fresh, So Clean · Ms. Jackson · Kryptonite (I\'m on It)' });
        expect(r.find(x => x.Artist === 'Johnny Blue Skies & The Dark Clouds'), 'Show only').toMatchObject({ Doors: '', Start: '20:00', End: '23:05' });
        // Page 2's: Doors only.
        expect(r.find(x => x.Artist === 'Phoebe Bridgers')).toMatchObject({ Date: '2026-10-13', Doors: '18:00', Start: '', End: '' });
        // Upcoming Shows (Olivia Rodrigo, Nov 11 and 12) stays out.
        expect(r.filter(x => /Olivia Rodrigo/.test(x.Artist))).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a venue with one page: no pager, one fetch; an event the heading names ("Jersey 4 Jersey") is its own column', async ({ page }) => {
        const { served, errors } = await open(page, '/venue/private-venue-colts-neck-nj-usa-53d30b75.html');
        await show(page, 'Show all setlists of this venue');
        expect(served).toEqual(['/venue/private-venue-colts-neck-nj-usa-53d30b75.html']);
        const r = await rows(page);
        expect(r).toHaveLength(9);
        expect(r.find(x => x.Date === '2020-04-22')).toMatchObject({ Artist: 'Bruce Springsteen', Event: 'Jersey 4 Jersey', Songs: '2' });
        expect(r.filter(x => x.Event).map(x => x.Event)).toEqual(['Jersey 4 Jersey']);
        expect(r.find(x => x.Date === '2026-08-01')).toMatchObject({ Songs: '1', Setlist: 'Born to Run' });
        expect(errors).toEqual([]);
    });

    test('an artist: Venue instead of Artist; a festival is the event; set times on a 24-hour clock', async ({ page }) => {
        const { served, errors } = await open(page, '/setlists/bruce-springsteen-2bd6dcce.html');
        await expect(page.locator('#mb-sfm-root h1.mb-sfm-h1 bdi')).toHaveText('Bruce Springsteen Concert Setlists & Tour Dates');
        await show(page, 'Show all setlists of this artist');
        expect(served).toEqual(['/setlists/bruce-springsteen-2bd6dcce.html']);
        const r = await rows(page);
        expect(r).toHaveLength(10);
        expect(Object.keys(r[0]).filter(k => !k.endsWith('@'))).toEqual(['Date', 'Venue', 'Event', 'Tour', 'Doors', 'Start', 'End', 'Songs', 'Setlist']);
        expect(r.find(x => x.Date === '2026-10-03')).toMatchObject({
            Event: 'Power to the People Festival 2026', Doors: '12:00', Start: '22:00', End: '22:50',
        });
        expect(r.find(x => x.Date === '2026-05-30')).toMatchObject({ Doors: '18:00', Start: '19:30', End: '22:20' });
        // A stage at a venue: both, each linked, as setlist.fm shows them.
        const mw = r.find(x => x.Date === '2026-10-03');
        expect(mw.Venue).toBe('Pavilion Stage at Merriweather Post Pavilion, Columbia, MD, USA');
        expect(mw['Venue@']).toBe(`${SFM}/venue/merriweather-post-pavilion-columbia-md-usa-53d61ff5.html?venue=3bdf28a0`);
        expect(await page.locator('#mb-sfm-root table.tbl tbody tr', { hasText: '2026-10-03' }).locator('td').nth(1).locator('a').count()).toBe(2);
        expect(errors).toEqual([]);
    });

    test('on setlist.fm, a setlist.fm link of the table is previewed by the setlist.fm reader while it has its key; without one it is a link of this site, not previewed', async ({ page }) => {
        const resolve = () => page.evaluate(() => {
            const a = document.querySelector('#mb-sfm-root table.tbl tbody tr td a[href*="/setlist/"]');
            return (window.__saTest.popResolve(a) || '').split(':').slice(0, 2).join(':');
        });
        await open(page, '/venue/private-venue-colts-neck-nj-usa-53d30b75.html', { sa_pop_ext: true, sa_pop_ext_setlistfm_key: 'sfm-probe-key' });
        await show(page, 'Show all setlists of this venue');
        expect(await resolve()).toBe('ext|ext:setlistfm');
    });

    test('on setlist.fm without a key: the table\'s setlist.fm links are this site\'s own, not previewed', async ({ page }) => {
        await open(page, '/venue/private-venue-colts-neck-nj-usa-53d30b75.html', { sa_pop_ext: true, sa_pop_ext_setlistfm_key: '' });
        await show(page, 'Show all setlists of this venue');
        expect(await page.evaluate(() => {
            const a = document.querySelector('#mb-sfm-root table.tbl tbody tr td a[href*="/setlist/"]');
            return window.__saTest.popResolve(a) || null;
        })).toBe(null);
    });

    test('on setlist.fm, a Tour cell (setlist.fm\'s own search link) has its card and window, key or not (vzell, 2026-11-03: "does not have the hover POH")', async ({ page }) => {
        await open(page, '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html', { sa_pop_ext: true, sa_pop_ext_setlistfm_key: '' });
        await show(page, 'Show all setlists of this venue');
        expect(await page.evaluate(() => {
            const a = document.querySelector('#mb-sfm-root table.tbl tbody tr td a[href*="/search?artist="]');
            return (window.__saTest.popResolve(a) || '').split(':').slice(0, 2).join(':');
        })).toBe('ext|ext:setlistfm');
    });

    test('setlist.fm\'s own body { overflow-x: hidden } does not cut the table off: the window scrolls sideways (vzell, 2026-11-03)', async ({ page }) => {
        await page.setViewportSize({ width: 700, height: 800 });
        await open(page, '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html');
        // The site's own rule (setlist-5.9.163-…css, read 2026-11-03), after ours.
        await page.addStyleTag({ content: 'body{background-color:#fff;overflow-x:hidden}' });
        await show(page, 'Show all setlists of this venue');
        const m = await page.evaluate(() => ({
            sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
            body: getComputedStyle(document.body).overflowX,
        }));
        expect(m.sw, 'the table is wider than the window').toBeGreaterThan(m.cw);
        expect(m.body, 'the site\'s hidden is undone, so the viewport is not hidden').toBe('visible');
        // As a user scrolls: the wheel (a script's scrollTo() moves even an
        // overflow: hidden viewport, so it proves nothing).
        await page.mouse.move(350, 600);
        await page.mouse.wheel(1500, 0);
        await expect.poll(() => page.evaluate(() => window.scrollX), { message: 'the wheel scrolls the window sideways' }).toBeGreaterThan(0);
    });

    test('a heading that names the venue of a stage is no event ("NAC Opera Hall at National Arts Centre", vzell 2026-11-03)', async ({ page }) => {
        const p = '/setlists/bruce-springsteen-2bd6dcce.html';
        await open(page, p);
        // The Merriweather card as the 1975-12-20 NAC card is: its heading
        // names the stage's venue, not a festival.
        const html = require('fs').readFileSync(FX('sfm-page-artist-2bd6dcce-p1.html'), 'utf8')
            .replace('Bruce Springsteen at Power to the People Festival 2026', 'Bruce Springsteen at Merriweather Post Pavilion, Columbia, MD, USA');
        await page.route((u) => u.hostname === 'www.setlist.fm' && u.pathname === p && !u.search, (route) => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
        await show(page, 'Show all setlists of this artist');
        const r = await rows(page);
        expect(r.find(x => x.Date === '2026-10-03')).toMatchObject({ Venue: 'Pavilion Stage at Merriweather Post Pavilion, Columbia, MD, USA', Event: '' });
    });

    test('a search for an artist\'s tour (sfm-search, vzell 2026-11-03): named by its filter\'s choices; the cards as an artist\'s rows; its query kept for the fetch', async ({ page }) => {
        const { served, errors } = await open(page, '/search?artist=2bd6dcce&tour=3daa95b');
        await expect(page.locator('#mb-sfm-root h1.mb-sfm-h1 bdi')).toHaveText('setlist.fm search: Bruce Springsteen · Land of Hope & Dreams American Tour');
        await show(page, 'Show all setlists of this search');
        expect(served).toEqual(['/search?artist=2bd6dcce&tour=3daa95b']);
        const r = await rows(page);
        expect(r).toHaveLength(10);
        expect(Object.keys(r[0]).filter(k => !k.endsWith('@'))).toEqual(['Date', 'Venue', 'Event', 'Tour', 'Doors', 'Start', 'End', 'Songs', 'Setlist']);
        expect(r.every(x => x.Tour === 'Land of Hope & Dreams American Tour')).toBe(true);
        expect(r.find(x => x.Date === '2026-05-30')).toMatchObject({ Doors: '18:00', Start: '19:30', End: '22:20' });
        expect(errors).toEqual([]);
    });

    // org/setlistfm.org "bugs and new additions" item 1 (2026-11-03): the
    // card of a Tour cell said "checked by AWS WAF". setlist.fm's /search
    // answers a request without the browser's WAF cookie with a 202
    // challenge (scripts/probe-setlistfm-session.user.js v0.2); the
    // anonymous GM request got it, the table's same-origin reads did not.
    // Here the GM stub answers the challenge and only the page's own
    // origin answers the page.
    test('on setlist.fm, a Tour cell\'s card reads the search page same-origin, past AWS WAF\'s challenge to an anonymous request (vzell, 2026-11-03)', async ({ page }) => {
        await page.addInitScript(() => {
            window.__gmXhrResponder = (o) => (/^https:\/\/www\.setlist\.fm\/search\?/.test(o.url)
                ? { status: 202, responseHeaders: 'x-amzn-waf-action: challenge\r\nContent-Type: text/html', responseText: '' } : undefined);
        });
        const { served } = await open(page, '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html', { sa_pop_ext: true, sa_pop_ext_setlistfm_key: '', sa_rich_tooltip_delay_ms: 0 });
        await show(page, 'Show all setlists of this venue');
        const a = page.locator('#mb-sfm-root table.tbl tbody tr td a[href*="/search?artist="]').first();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await a.hover();
        await page.keyboard.up('Control');
        const c = page.locator('#mb-dp-peek');
        await expect(c.locator('.mb-tt-title')).toHaveText('Bruce Springsteen · Land of Hope & Dreams American Tour');
        await expect(c).not.toContainText('AWS WAF');
        expect(served.filter(u => u.startsWith('/search')), 'read by the page\'s own origin').toHaveLength(1);
        expect(await page.evaluate(() => (window.__gmXhrLog || []).filter(r => /setlist\.fm\/search/.test(r.url)).length), 'never by GM').toBe(0);
    });

    // Items 2a/3b (2026-11-03): on setlist.fm a MusicBrainz link in the
    // window left it (↗): MusicBrainz's source in the window was discogs.com's
    // only (`dg-mb`). Now the glyph opens MusicBrainz's artist here, with Back.
    test('on setlist.fm, the MusicBrainz glyph of a setlist window\'s artist opens MusicBrainz\'s window in place, not a tab', async ({ page }) => {
        const fs = require('fs');
        const setlist = 'https://www.setlist.fm/setlist/bruce-springsteen/2016/los-angeles-sports-arena-los-angeles-ca-4bf0375a.html';
        await page.addInitScript((body) => {
            window.__gmXhrResponses = { 'https://api.setlist.fm/rest/1.0/setlist/4bf0375a': { status: 200, responseHeaders: 'Content-Type: application/json', responseText: body } };
        }, fs.readFileSync(FX('ext-sfm-setlist.json'), 'utf8'));
        await page.route((u) => u.href === setlist, (route) => route.fulfill({ path: FX('sfm-site-setlist-4bf0375a.html'), contentType: 'text/html; charset=utf-8' }));
        await open(page, '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html', { sa_pop_ext: true, sa_pop_mb: true, sa_pop_ext_setlistfm_key: 'sfm-probe-key', sa_rich_tooltip_delay_ms: 0 });
        // MusicBrainz's glyph (a blocked image collapses to nothing; after open()'s block-all, which a later route overrides).
        await page.route('https://musicbrainz.org/static/images/entity/*.svg', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>' }));
        await page.evaluate((href) => {
            const p = document.createElement('p');
            p.className = 'sfm-probe';
            p.innerHTML = `<a href="${href}">a setlist</a>`;
            document.getElementById('mb-sfm-root').append(p);
        }, setlist);
        await page.keyboard.down('Control');
        await page.locator('.sfm-probe a').hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek .mb-tt-title')).toHaveText('Bruce Springsteen at Los Angeles Sports Arena');
        await page.keyboard.press('Space');
        const d = page.locator('#mb-dp-dialog');
        const glyph = d.locator('dt:text-is("Artist") + dd a.mb-sfm-mb');
        await expect(glyph).toHaveAttribute('href', 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f');
        await page.mouse.move(0, 0);
        await glyph.locator('img').hover();
        await expect(d.locator('.mb-dp-wfoot')).toContainText('Opens here: ');
        const tabs = [];
        page.on('popup', (pp) => tabs.push(pp.url()));
        await glyph.click();
        await expect(d.locator('button.mb-dp-tbtn', { hasText: '← Back' })).toBeVisible();
        expect(tabs, 'no new tab').toEqual([]);
        expect(await page.evaluate(() => (window.__gmXhrLog || []).some(r => /^https:\/\/musicbrainz\.org\/ws\/2\/artist\/70248960/.test(r.url))),
            'MusicBrainz\'s Web Service asked for the artist').toBe(true);
    });

    test('switched off: nothing on the page changes', async ({ page }) => {
        const { served } = await open(page, '/venue/state-farm-arena-atlanta-ga-usa-73d20e81.html', { sa_enable_setlistfm: false });
        await expect(page.locator('.mainColumn h1')).toBeVisible();
        expect(await page.evaluate(() => [!!document.getElementById('mb-sfm-root'), document.body.className])).toEqual([false, '']);
        expect(served).toEqual([]);
    });
});
