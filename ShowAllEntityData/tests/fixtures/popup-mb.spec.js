'use strict';

// The popup engine on MusicBrainz table links (org/iframe.org, Phase 2):
// every entity link in a `table.tbl` body gets a card (Ctrl gate, as the
// foreign hosts' previews) and a pinned window (Space), from the Web
// Service, behind ONE setting, `sa_pop_mb` (on touch its twin, `sa_pop_mb_on_touch`).
//
// Pins, in order:
//   1. off when switched off: no stylesheet, no card, no request; the
//      schema defaults (on, plain hover, page-wide); the touch twin
//      `sa_pop_mb_on_touch` does nothing on a desktop;
//   2. the Ctrl gate (`sa_dp_hover_without_ctrl`, "every preview"): a plain
//      hover shows nothing and asks nothing, Ctrl shows the card;
//   3. what is previewed: the bare entity page only — not `/cover-art`, not a
//      link wrapping an image, not the Relationships column;
//   4. one request, then memory; IndexedDB after a reload ("saved today");
//      `sa_pop_mb_ttl_hours` ages it; ⟳ asks again; a failure is shown and
//      not kept;
//   5. a hover that moved on before its rate slot asks nothing; the gate is
//      the one the Relationships column uses;
//   6. ← → step down the SAME column, from one sub-table into the next;
//   7. the release window (tracklist, links, the Cover Art Archive strip) and
//      its Live page; a release-group link reuses Phase 1's card and window;
//   8. one box at a time: on a link with its own "Liner notes" text the card
//      rules that card out (with a control that it shows when previews are
//      off).
//
// Mutation list: scripts/mutations/popup-mb.json.
//
// Host page: "Greetings From Asbury Park, N.J." (release group), whose
// releases split into sub-tables by status after "Show all". The Web Service
// answer is a real capture (scripts/capture-ws2-fixtures.py
// release-greetings); every release lookup is answered with it, so a step is
// told apart by the URL it asks for, not by the title.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const RELEASE_PAGE = path.join(__dirname, 'release-tracks-brixton-night.html');
const REL_ID = '3ce46b79-5e8c-470a-bcdc-45f301d09f60';
const INC = 'inc=artist-credits+labels+recordings+release-groups+media';
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const REC_ID = 'bbcedc0f-2fff-42f4-9ca6-6d2263d1a042';   // the studio "Thunder Road"
const WORK_ID = '9893a23c-f282-3b07-a2db-b4f2f3b9f4b2';  // "Born to Run", the song
// The area chains above the areas the event, place, artist and recording
// fixtures name (org/event-GPE.org): one `area/<id>?inc=area-rels` answer per
// level, real captures (scripts/probe-mb-entity-lookups.py --only
// event-details / --only area-chains, 2026-10-08). No country is here: the
// walk never looks one up.
const AREA_CHAIN_FIXTURES = {
    '4c21ce68-e33e-4772-ac5f-0f52d9195d96': 'ws2-pop-area-wlb.json',      // West Long Branch (City)
    '10fa66f7-aa08-4823-8af8-52108f350a5a': 'ws2-pop-area-10fa66f7.json', // Asbury Park (City)
    'bb0af2e9-6ae0-4c4f-b729-c8d6444d6380': 'ws2-pop-area-bb0af2e9.json', // Long Branch (City)
    '604b7841-36b7-4bea-9bdc-7eeb52520e35': 'ws2-pop-area-monmouth.json', // Monmouth County (County)
    'a36544c1-cb40-4f44-9e0e-7a5a69e403a8': 'ws2-pop-area-nj.json',       // New Jersey (Subdivision)
    'edd27a39-ff8a-4af4-8bbf-f369b0fb1899': 'ws2-pop-area-edd27a39.json', // Midtown Manhattan (City)
    '261962ea-d8c2-4eaf-a80c-f14376ffadb0': 'ws2-pop-area-261962ea.json', // Manhattan (District)
    '74e50e58-5deb-4b99-93a2-decbb365c07f': 'ws2-pop-area-74e50e58.json', // New York (City)
    '75e398a3-5f3f-4224-9cd8-0fe44715bc95': 'ws2-pop-area-75e398a3.json', // New York (Subdivision)
};
const areaLookups = (log) => log.ws2.filter(u => u.includes('/ws/2/area/')).map(u => u.match(/area\/([0-9a-f-]{36})/)[1]);
// Real captures (scripts/capture-ws2-fixtures.py), by the request each answers.
// Phase 3's pages, captured with scripts/fetch-mb-page-fixture.js: the user's
// own applied edit logged in (--auth: editor and notes shown), an open edit
// logged out (editor hidden), the user's own profile logged out with its
// age, gender and location rows removed.
const PAGE_FIXTURES = [
    [/\/edit\/126930910\/?$/, 'edit-page-applied.html'],
    [/\/edit\/154299713\/?$/, 'edit-page-open.html'],
    [/\/user\/vzell\/?$/, 'user-page-vzell.html'],
];
const WS2_FIXTURES = [
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-credits\+isrcs/, 'ws2-pop-recording-thunder.json'],
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-rels/, 'ws2-pop-recording-thunder-pin.json'],
    [/\/ws\/2\/release\?recording=/, 'ws2-pop-recording-thunder-count.json'],
    [/\/ws\/2\/work\/[0-9a-f-]{36}\?/, 'ws2-pop-work-btr.json'],
    [/\/ws\/2\/recording\?work=/, 'ws2-pop-work-btr-recordings.json'],
    [/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=genres/, 'ws2-pop-artist-bruce.json'],
    [/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=url-rels/, 'ws2-pop-artist-bruce-pin.json'],
    ...['album', 'single', 'ep', 'broadcast', 'other'].map(t => [
        new RegExp(`/ws/2/release-group\\?artist=[0-9a-f-]{36}&type=${t}&`), `ws2-pop-artist-bruce-rg-${t}.json`]),
    [/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=genres/, 'ws2-pop-label-columbia.json'],
    [/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=url-rels/, 'ws2-pop-label-columbia-pin.json'],
    [/\/ws\/2\/release\?label=/, 'ws2-pop-label-columbia-count.json'],
    ...Object.entries(AREA_CHAIN_FIXTURES).map(([id, f]) => [new RegExp(`/ws/2/area/${id}\\?inc=area-rels&`), f]),
    [/\/ws\/2\/area\/[0-9a-f-]{36}\?/, 'ws2-pop-area-nj.json'],
    [/\/ws\/2\/instrument\/[0-9a-f-]{36}\?/, 'ws2-pop-instrument-guitar.json'],
    [/\/ws\/2\/event\/[0-9a-f-]{36}\?inc=artist-rels/, 'ws2-pop-event-manchester.json'],
    [/\/ws\/2\/event\/[0-9a-f-]{36}\?inc=recording-rels/, 'ws2-pop-event-manchester-pin.json'],
    [/\/ws\/2\/place\/[0-9a-f-]{36}\?/, 'ws2-pop-place-sp.json'],
    [/\/ws\/2\/event\?place=/, 'ws2-pop-place-sp-events.json'],
    [/\/ws\/2\/series\/[0-9a-f-]{36}\?/, 'ws2-pop-series-st.json'],
    [/\/ws\/2\/isrc\//, 'ws2-pop-isrc-thunder.json'],
    [/\/ws\/2\/iswc\//, 'ws2-pop-iswc-btr.json'],
    [/\/ws\/2\/discid\//, 'ws2-pop-discid-dark.json'],
    [/\/ws\/2\/collection\//, 'ws2-pop-collection-attending.json'],
    [/\/ws\/2\/release\?query=barcode:/, 'ws2-pop-barcode-074643190329.json'],
];
// A 1×1 PNG, so a cover the card asks for loads instead of being dropped.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
// The page's first release link, or the one of row r of sub-table t.
const relLink = (page, t = null, r = 0) => (t === null
    ? page.locator('table.tbl tbody td:first-child a[href^="/release/"]:not([href$="/cover-art"])').first()
    : page.locator('table.tbl').nth(t).locator('tbody > tr').nth(r).locator('td:first-child a[href^="/release/"]:not([href$="/cover-art"])').first());
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');

/**
 * Loads the release-group page with the routes every test needs, presses
 * "Show all" and expands every sub-table. Requests are logged by kind.
 *
 * @param {import('@playwright/test').Page} page
 * The other kinds' requests (recording, work, …) are answered from
 * `WS2_FIXTURES` unless `ws2` returns an answer of its own, and logged in
 * `log.ws2` in order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, lookup?: function(string): {status: number, body: string}, showAll?: boolean,
 *   ws2?: function(string): ?{status: number, body: string}}} [opts]
 * @returns {Promise<{lookups: Array<{url: string, at: number}>, browses: string[], rgLookups: string[], caa: string[],
 *   pages: string[], ws2: string[]}>}
 */
async function open(page, { settings = {}, lookup = null, showAll = true, ws2 = null, pageFixture = null } = {}) {
    const log = { lookups: [], browses: [], rgLookups: [], caa: [], pages: [], ws2: [], eaa: [], html: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://coverartarchive.org/**', (route) => {
        const u = new URL(route.request().url());
        if (/^\/release\/[0-9a-f-]{36}\/?$/.test(u.pathname)) {
            log.caa.push(u.pathname);
            return route.fulfill({ status: 200, contentType: 'application/json', body: json('caa-release-d0adda7e.json') });
        }
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    await ctx.route(/\/ws\/2\/release\/[0-9a-f-]{36}\?/, (route) => {
        const url = route.request().url();
        log.lookups.push({ url, at: Date.now() });
        const r = lookup ? lookup(url) : { status: 200, body: json('ws2-pop-release-greetings.json') };
        return route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
    });
    await ctx.route('**/ws/2/release?release-group=**', (route) => {
        log.browses.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-rg-release-browse.json') });
    });
    await ctx.route(/\/ws\/2\/release-group\/[0-9a-f-]{36}\?/, (route) => {
        log.rgLookups.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: json('ws2-rg-lookup.json') });
    });
    const other = (route) => {
        const url = route.request().url();
        log.ws2.push(url);
        const own = ws2 ? ws2(url) : null;
        const hit = own ? null : WS2_FIXTURES.find(([re]) => re.test(url));
        const r = own || (hit ? { status: 200, body: json(hit[1]) } : { status: 404, body: '{"error":"no fixture"}' });
        return route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
    };
    await ctx.route(/\/ws\/2\/(recording|work|artist|label|area|instrument|event|place|series|isrc|iswc|discid|collection)[/?]/, other);
    await ctx.route('https://eventartarchive.org/**', (route) => {
        const u = new URL(route.request().url());
        if (/^\/event\/[0-9a-f-]{36}\/?$/.test(u.pathname)) {
            log.eaa.push(u.pathname);
            return route.fulfill({ status: 200, contentType: 'application/json', body: json('eaa-event-3f2ca30a.json') });
        }
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    await ctx.route('**/ws/2/release?recording=**', other);
    await ctx.route('**/ws/2/release?label=**', other);
    await ctx.route('**/ws/2/release?query=**', other);
    await ctx.route('**/ws/2/release-group?artist=**', other);
    // Phase 3: edit and editor pages, by URL (`pageFixture` may answer instead).
    await ctx.route(/^https:\/\/musicbrainz\.org\/(edit|user)\//, (route) => {
        const url = route.request().url();
        log.html.push(url);
        const own = pageFixture ? pageFixture(url) : null;
        const file = own || PAGE_FIXTURES.find(([re]) => re.test(url));
        if (!file) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>no fixture</body></html>' });
        if (typeof file === 'object' && !Array.isArray(file)) return route.fulfill(file);
        return route.fulfill({ path: path.join(__dirname, Array.isArray(file) ? file[1] : file), contentType: 'text/html' });
    });
    await ctx.route('https://musicbrainz.org/release/**', (route) => {
        log.pages.push(route.request().url());
        return route.fulfill({ path: RELEASE_PAGE, contentType: 'text/html' });
    });
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.route('https://musicbrainz.org/release-group/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    if (showAll) {
        await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
    }
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Adds a link to the first cell of the first table's first row, as a table
 * of that kind would carry it, so one host page serves every kind.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} href
 * @param {string} text
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function addLink(page, href, text) {
    await page.evaluate(([h, x]) => {
        const td = document.querySelector('table.tbl tbody tr td:first-child');
        const a = document.createElement('a');
        a.href = h;
        a.className = 'pop-probe';
        a.textContent = x;
        td.append(' ', a);
    }, [href, text]);
    return page.locator(`a.pop-probe[href="${href}"]`);
}

/**
 * Hovers an element with Ctrl held (down while parked, up after, so a later
 * Space is not Ctrl+Space), as `detail-preview.spec.js` does.
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
 * Re-runs the userscript on a reload (the routes live on the context).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function reloadScript(page) {
    await page.reload();
    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await expect(page.locator('#mb-show-all-controls-container')).toBeVisible({ timeout: 30000 });
    await page.mouse.move(0, 0);
}

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    // MusicBrainz's own supported-browser-check.js and a versioned bundle
    // answering with an HTML page throw on a saved shell; not ours.
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || '');
        if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
    });
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('MusicBrainz link previews (sa_pop_mb)', () => {
    test('off when switched off: no stylesheet, no card, no request', async ({ page }) => {
        // Off is loadPage.js's FIXTURE_SETTINGS_OVERRIDE, not the schema
        // default (on since org/non-MB-sites.org); the defaults have their
        // own test below. A fake clock (time still flows) lets the test jump
        // past the card's show timer before asserting there is none, as
        // detail-preview.spec.js does.
        await page.clock.install();
        const log = await open(page);
        await ctrlHover(page, relLink(page));
        await page.clock.fastForward(1000);
        expect(await page.locator('#mb-dp-style, #mb-dp-peek, #mb-dp-dialog').count()).toBe(0);
        expect(log.lookups).toEqual([]);
    });

    test('the schema defaults: on, on a plain hover, and outside the tables too', async ({ page }) => {
        // `undefined` seeds nothing (JSON.stringify drops it), so these three
        // keys fall back to configSchema instead of the fixture override.
        // Pins the defaults themselves: a reverted `default: true` on any of
        // the three fails one of the assertions below.
        await page.clock.install();
        const log = await open(page, {
            settings: { sa_pop_mb: undefined, sa_pop_mb_page: undefined, sa_dp_hover_without_ctrl: undefined },
        });
        await relLink(page).scrollIntoViewIfNeeded();
        await relLink(page).hover();
        await page.clock.fastForward(1000);
        await expect(card(page), 'a plain hover on a table link shows the card').toBeVisible();
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        expect(log.lookups.length).toBe(1);

        // The page-wide scope (sa_pop_mb_page): the subheader's artist link.
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        const artist = page.locator('p.subheader a[href^="/artist/"]').first();
        await artist.scrollIntoViewIfNeeded();
        await artist.hover();
        await page.clock.fastForward(1000);
        await expect(card(page), 'a link outside the tables has a card too').toBeVisible();
        await expect(card(page)).toContainText('Bruce Springsteen');
    });

    test('the touch twin does nothing on a desktop', async ({ page }) => {
        // `sa_pop_mb_on_touch` replaces `sa_pop_mb` only on a touch-primary
        // device (`_popSettingOn()`); here the plain key, off, is the one.
        await page.clock.install();
        const log = await open(page, { settings: { sa_pop_mb_on_touch: true, sa_dp_hover_without_ctrl: true } });
        await relLink(page).scrollIntoViewIfNeeded();
        await ctrlHover(page, relLink(page));
        await page.clock.fastForward(1000);
        expect(await page.locator('#mb-dp-style, #mb-dp-peek, #mb-dp-dialog').count()).toBe(0);
        expect(log.lookups).toEqual([]);
    });

    test('the Ctrl gate: a plain hover asks nothing, Ctrl shows the release card', async ({ page }) => {
        await page.clock.install();
        const log = await open(page, { settings: { sa_pop_mb: true } });
        await relLink(page).scrollIntoViewIfNeeded();
        await relLink(page).hover();
        await page.clock.fastForward(1000);
        await expect(card(page)).toBeHidden();
        expect(log.lookups, 'a plain hover makes no request').toEqual([]);

        await ctrlHover(page, relLink(page));
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        await expect(card(page)).toContainText('Pitman pressing');
        await expect(card(page)).toContainText('Official');
        await expect(card(page)).toContainText('Cardboard/Paper Sleeve');
        await expect(card(page)).toContainText('1973-01-05 US');
        await expect(card(page)).toContainText('Columbia');
        await expect(card(page).locator('.mb-pop-tracks li').first()).toContainText('Blinded by the Light');
        await expect(card(page).locator('.mb-pop-tracks li').first().locator('.mb-pop-len')).toHaveText('5:02');
        await expect(card(page)).toContainText('fetched now');
        expect(log.lookups).toHaveLength(1);
        expect(log.lookups[0].url).toContain(`/ws/2/release/${REL_ID}?${INC}&fmt=json`);

        // Again: memory, no second request.
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now');
        expect(log.lookups).toHaveLength(1);
    });

    test('sa_dp_hover_without_ctrl on: a plain hover is enough', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true, sa_dp_hover_without_ctrl: true } });
        await relLink(page).scrollIntoViewIfNeeded();
        await relLink(page).hover();
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        expect(log.lookups).toHaveLength(1);
    });

    test('what is previewed: the bare entity page, not cover art, an image link or the Relationships column', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true } });
        const r = await page.evaluate((id) => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const add = (html, cls) => {
                const host = document.createElement('span');
                if (cls) host.className = cls;
                host.innerHTML = html;
                td.appendChild(host);
                return host.querySelector('a');
            };
            const rel = document.createElement('td');
            rel.className = 'mb-rel-cell';
            rel.innerHTML = `<a href="/release/${id}">rel</a>`;
            td.parentElement.appendChild(rel);
            const res = (a) => window.__saTest.popResolve(a);
            return {
                bare: res(td.querySelector('a[href^="/release/"]')),
                slash: res(add(`<a href="/release/${id}/">x</a>`)),
                coverArt: res(add(`<a href="/release/${id}/cover-art">x</a>`)),
                edit: res(add(`<a href="/release/${id}/edit">x</a>`)),
                image: res(add(`<a href="/release/${id}"><img alt=""></a>`)),
                relCell: res(rel.querySelector('a')),
                artist: res(td.parentElement.querySelector('a[href^="/artist/"]')),
                header: res(document.querySelector('.releaseheader a[href^="/artist/"], h1 a')),
            };
        }, REL_ID);
        expect(r.bare).toBe(`mb-entity|release:${REL_ID}`);
        expect(r.slash).toBe(`mb-entity|release:${REL_ID}`);
        expect(r.coverArt, '/cover-art is the artwork column').toBeNull();
        expect(r.edit).toBeNull();
        expect(r.image, 'a link wrapping an image keeps its artwork preview').toBeNull();
        expect(r.relCell, 'the Relationships column has its own tooltip').toBeNull();
        expect(r.header, 'outside a table body').toBeNull();
        // An artist link is previewed once its kind exists (WIP.3).
        expect(r.artist === null || r.artist.startsWith('mb-entity|artist:')).toBe(true);
    });

    test('IndexedDB after a reload, aged by sa_pop_mb_ttl_hours', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now');
        expect(log.lookups).toHaveLength(1);

        // Two hours old: reused under the 24 h default, asked again under 1 h.
        await page.evaluate(async (key) => {
            const db = await new Promise((res, rej) => {
                const r = indexedDB.open('vz-saed-detail-pages');
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
            await new Promise((res, rej) => {
                const tx = db.transaction('pages', 'readwrite');
                const st = tx.objectStore('pages');
                const g = st.get(key);
                g.onsuccess = () => {
                    const rec = g.result;
                    rec.at -= 2 * 3600 * 1000;
                    st.put(rec);
                };
                tx.oncomplete = res;
                tx.onerror = () => rej(tx.error);
            });
            db.close();
        }, `mb:pop:release:${REL_ID}:${INC.slice(4)}`);
        await reloadScript(page);
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('saved today');
        expect(log.lookups, 'answered from IndexedDB under the 24 h default').toHaveLength(1);

        // Registered after the GM stubs' own init script, so it wins.
        await page.context().addInitScript(() => { window.__gmValues.sa_pop_mb_ttl_hours = 1; });
        await reloadScript(page);
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now');
        expect(log.lookups, 'too old for a one-hour TTL: asked again').toHaveLength(2);
    });

    test('a failure is shown, not kept, and the next hover asks again', async ({ page }) => {
        let fail = true;
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            lookup: () => (fail ? { status: 500, body: '{"error":"boom"}' } : { status: 200, body: json('ws2-pop-release-greetings.json') }),
        });
        await ctrlHover(page, relLink(page));
        await expect(card(page).locator('.mb-tt-alert')).toContainText('Could not load');
        expect(log.lookups).toHaveLength(1);
        fail = false;
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now');
        expect(log.lookups).toHaveLength(2);
    });

    test('a hover that moved on before its rate slot asks nothing; the gate is shared', async ({ page }) => {
        await page.clock.install();
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate(() => window.__saTest.reserveMbRateSlots(2));
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        // Past both reserved slots and its own: it comes up, finds nobody
        // wanting the answer, and asks nothing.
        await page.clock.fastForward(3500);
        await expect.poll(() => page.evaluate(() => window.__saTest.mbRateSlotWaitMs())).toBe(0);
        expect(log.lookups, 'nobody wanted it when its slot came up').toEqual([]);

        // Timed by the test's own clock: the route logs it, not the page's fake one.
        await page.evaluate(() => window.__saTest.reserveMbRateSlots(2));
        const t0 = Date.now();
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now', { timeout: 10000 });
        expect(log.lookups).toHaveLength(1);
        expect(log.lookups[0].at - t0, 'waited behind two slots of the shared gate').toBeGreaterThanOrEqual(2000);
    });

    test('the release window: tracklist, links, cover strip; ⟳ asks again', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true } });
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Release');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('.mb-pop-tracks li')).toHaveCount(9);
        await expect(area.locator('.mb-pop-tracks li').first().locator('a')).toHaveAttribute('href', /^\/recording\/[0-9a-f-]{36}$/);
        await expect(area.locator('a[href="/label/011d1192-6f65-45bd-85c4-0400dd45693e"]')).toHaveText('Columbia');
        await expect(area.locator('a[href^="/release-group/"]')).toHaveText('Greetings From Asbury Park, N.J.');
        await expect(area.locator('.mb-dp-gallery img')).toHaveCount(16);
        expect(log.caa, 'one Cover Art Archive index, on pin').toEqual([`/release/${REL_ID}`]);
        expect(log.lookups).toHaveLength(1);

        // A plain click on a strip image opens the artwork viewer on THAT
        // image of the archive record the strip came from, over the window,
        // asking the archive for nothing more; Esc closes only the viewer.
        const viewer = page.locator('#mb-art-viewer');
        await area.locator('.mb-dp-gallery a').nth(2).click();
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('3 / 16');
        await expect(viewer.locator('.mb-artv-title')).toHaveText('Greetings From Asbury Park, N.J.');
        // The archive's own rows, unlike another site's image.
        await expect(viewer.locator('.mb-artv-info')).toContainText('Status');
        expect(log.caa, 'the viewer reads the record already loaded').toHaveLength(1);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dialog(page)).toBeVisible();
        // The front cover opens it on the main front.
        await area.locator('a:has(> img.mb-dp-xcover)').click();
        await expect(viewer.locator('.mb-artv-info .mb-tt-title')).toHaveText('★ Main front');
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dialog(page)).toBeVisible();

        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '⟳' }).click();
        await expect.poll(() => log.lookups.length).toBe(2);
        await expect(area.locator('.mb-pop-tracks li')).toHaveCount(9);
    });

    test('← → step down the same column, into the next sub-table', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true } });
        const plan = await page.evaluate(() => {
            const tables = Array.from(document.querySelectorAll('table.tbl')).filter(t => t.getClientRects().length);
            const ids = tables.map(t => Array.from(t.tBodies[0].rows)
                .filter(tr => tr.getClientRects().length)
                .map(tr => { const a = tr.cells[0] && tr.cells[0].querySelector('a[href^="/release/"]'); return a ? a.pathname.split('/')[2] : null; })
                .filter(Boolean));
            return { counts: ids.map(x => x.length), firstOfSecond: ids[1] && ids[1][0], last: ids[0][ids[0].length - 1] };
        });
        expect(plan.counts.length, 'the releases split into sub-tables').toBeGreaterThan(1);
        const total = plan.counts.reduce((a, b) => a + b, 0);
        const lastRow = plan.counts[0] - 1;

        await ctrlHover(page, relLink(page, 0, lastRow));
        await expect(card(page)).toBeVisible();
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText(`${plan.counts[0]} / ${total}`);
        await expect(page.locator('tr.mb-dp-current')).toHaveCount(1);

        await page.keyboard.press('ArrowRight');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText(`${plan.counts[0] + 1} / ${total}`);
        await expect.poll(() => log.lookups.length, { timeout: 10000 }).toBe(2);
        expect(log.lookups[1].url).toContain(`/ws/2/release/${plan.firstOfSecond}?`);
        const cur = await page.evaluate(() => {
            const tr = document.querySelector('tr.mb-dp-current');
            return tr.cells[0].querySelector('a[href^="/release/"]').pathname.split('/')[2];
        });
        expect(cur, 'the row mark follows').toBe(plan.firstOfSecond);

        await page.keyboard.press('ArrowLeft');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText(`${plan.counts[0]} / ${total}`);
        expect(log.lookups, 'back to a release already loaded: memory').toHaveLength(2);
    });

    test('the Live page is the release\'s own page, without its scripts', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        await page.keyboard.press('Space');
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: 'Live page' }).click();
        const frame = dialog(page).locator('iframe');
        await expect.poll(() => frame.getAttribute('srcdoc'), { timeout: 15000 }).toMatch(/id="page"/);
        expect(await frame.getAttribute('srcdoc')).not.toContain('<script');
        expect(log.pages).toEqual([`https://musicbrainz.org/release/${REL_ID}`]);
        const inner = page.frameLocator('#mb-dp-dialog iframe');
        await expect(inner.locator('#content')).toBeVisible();
        await expect(inner.locator('.header')).toBeHidden();
    });

    /**
     * Gives the release page's first release link a hover text of the
     * script's own (`_setTip()`'s marker), as the expanded release group
     * rows' artist links have, and Ctrl-hovers it past both cards' timers.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<void>}
     */
    async function hoverOwnTipLink(page) {
        await page.evaluate(() => {
            const a = document.querySelector('table.tbl tbody td:first-child a[href^="/release/"]:not([href$="/cover-art"])');
            a.setAttribute('title', 'A note of the script');
            a.setAttribute('data-mb-tip', '');
        });
        await ctrlHover(page, relLink(page));
        await page.clock.fastForward(1000);
    }

    test('one box at a time, control: with previews off the link\'s "Liner notes" card shows', async ({ page }) => {
        await page.clock.install();
        await open(page, { showAll: false });
        await hoverOwnTipLink(page);
        await expect(page.locator('#mb-stat-tooltip')).toBeVisible();
        await expect(page.locator('#mb-stat-tooltip')).toContainText('A note of the script');
    });

    test('one box at a time: the card rules out a "Liner notes" card of the same link', async ({ page }) => {
        await page.clock.install();
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await hoverOwnTipLink(page);
        await expect(card(page)).toBeVisible();
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();
    });

    test('a release-group link whose hover moved on before its rate slot asks nothing', async ({ page }) => {
        await page.clock.install();
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const a = document.createElement('a');
            a.href = '/release-group/499a96d4-0b7c-49d2-9a8d-bd4f7e2e8b2b';
            a.id = 'rg-probe';
            a.textContent = 'Berlin probe';
            td.appendChild(a);
            window.__saTest.reserveMbRateSlots(2);
        });
        await ctrlHover(page, page.locator('#rg-probe'));
        await expect(card(page)).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        await page.clock.fastForward(3500);
        await expect.poll(() => page.evaluate(() => window.__saTest.mbRateSlotWaitMs())).toBe(0);
        expect(log.browses, 'nobody wanted it when its slot came up').toEqual([]);
        await ctrlHover(page, page.locator('#rg-probe'));
        await expect(card(page).locator('.mb-rg-table')).toBeVisible({ timeout: 10000 });
        expect(log.browses).toHaveLength(1);
    });

    test('a release-group link: Phase 1\'s card and window', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const a = document.createElement('a');
            a.href = '/release-group/499a96d4-0b7c-49d2-9a8d-bd4f7e2e8b2b';
            a.id = 'rg-probe';
            a.textContent = 'Berlin probe';
            td.appendChild(document.createTextNode(' '));
            td.appendChild(a);
        });
        await ctrlHover(page, page.locator('#rg-probe'));
        await expect(card(page)).toContainText('Berlin probe');
        await expect(card(page).locator('.mb-rg-table')).toBeVisible();
        expect(log.browses).toHaveLength(1);
        expect(log.browses[0]).toContain('release-group=499a96d4-0b7c-49d2-9a8d-bd4f7e2e8b2b');
        expect(log.rgLookups, 'facts only on pin').toEqual([]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Release group');
        await expect(dialog(page).locator('.mb-rg-wtable tbody tr').first()).toBeVisible();
        await expect.poll(() => log.rgLookups.length).toBe(1);
    });
});

test.describe('MusicBrainz link previews: recording and work (WIP.2)', () => {
    const recLookups = (log) => log.ws2.filter(u => /\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-credits\+isrcs/.test(u));
    const recCredits = (log) => log.ws2.filter(u => /\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-rels/.test(u));
    const recCounts = (log) => log.ws2.filter(u => /\/ws\/2\/release\?recording=/.test(u));

    test('the recording card: length, "25+" releases, ISRCs, the work — one request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page)).toContainText('version 7');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['4:50', 'on 25+ releases']);
        await expect(card(page)).toContainText('USSM17500803, USSM19904335');
        await expect(card(page)).toContainText('1975-08-25');
        await expect(card(page).locator('.mb-dp-kv')).toContainText('Thunder Road');
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2/recording/${REC_ID}?inc=artist-credits+isrcs+releases+work-rels&fmt=json`)]);
    });

    test('a track named differently from its recording: the note above the card, no native box, the badge in the window', async ({ page }) => {
        // Pins: jesus2099's "mb. INLINE STUFF" title on a recording link
        // ("track name: …\n≠rec. name: …") is shown as #mb-dp-origin, a box
        // stacked ABOVE the card (its bottom at the card's top, same left);
        // the link's native title is parked while the card shows (else the
        // browser draws its own box over the card) and comes back when it
        // closes; the 📊 flag still reads it while parked; Space puts the same
        // note in the window's title bar, after the title.
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const NOTE = 'track name: Thunder Road (version 7)\n≠rec. name: Thunder Road';
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road (version 7)');
        await a.evaluate((el, t) => el.setAttribute('title', t), NOTE);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        const origin = page.locator('#mb-dp-origin');
        await expect(origin).toBeVisible();
        await expect(origin.locator('dt')).toHaveText(['Track name', '≠ Recording']);
        await expect(origin.locator('dd')).toHaveText(['Thunder Road (version 7)', 'Thunder Road']);
        const box = await origin.boundingBox();
        const cbox = await card(page).boundingBox();
        expect(Math.abs((box.y + box.height + 4) - cbox.y)).toBeLessThan(1.5);
        expect(Math.abs(box.x - cbox.x)).toBeLessThan(1);
        // No native box while the card shows; the flag is still readable.
        await expect(a).not.toHaveAttribute('title', /./);
        await expect(a).toHaveAttribute('data-mb-dp-saved-title', NOTE);
        expect(await a.evaluate((el) => window.__saTest.titleHasRecNameMismatch(el.closest('td')))).toBe(true);

        await page.keyboard.press('Escape');
        await expect(card(page)).toBeHidden();
        await expect(origin).toBeHidden();
        await expect(a).toHaveAttribute('title', NOTE);
        await expect(a).not.toHaveAttribute('data-mb-dp-saved-title', /.*/);

        await ctrlHover(page, a);
        await expect(origin).toBeVisible();
        await page.keyboard.press('Space');
        const badge = dialog(page).locator(':scope > div > .mb-dp-origin');
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText('from track “Thunder Road (version 7)” ≠ recording “Thunder Road”');
        // Right after the title, before the controls.
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Recording');
        expect(await badge.evaluate((b) => b.previousElementSibling === b.parentElement.querySelector(':scope > span'))).toBe(true);
        await expect(origin).toBeHidden();
        await expect(a).toHaveAttribute('title', NOTE);
    });

    test('control: a recording link without a note shows no box and no badge, and keeps its own title', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await a.evaluate((el) => el.setAttribute('title', 'Springsteen, Bruce'));
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(page.locator('#mb-dp-origin')).toBeHidden();
        await expect(a).toHaveAttribute('title', 'Springsteen, Bruce');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).locator(':scope > div > .mb-dp-origin')).toBeHidden();
    });

    test('the recording window: credits and the real release count, each asked once; ⟳ asks all again', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Recording');
        // Credits come from a second lookup of the same recording with another
        // inc set: a cache key without the inc would answer it from the card's.
        const credits = area.locator('h4:text-is("Credits") + .mb-dp-kv');
        await expect(credits).toContainText('Roy Bittan');
        await expect(credits).toContainText('glockenspiel, Rhodes piano');
        await expect(credits).toContainText('914 Sound Studios');
        await expect(area.locator('h4', { hasText: 'Releases' })).toHaveText('Releases · 271');
        await expect(area).toContainText('The first 25 of 271');
        await expect(area.locator('.mb-rg-wtable tbody tr')).toHaveCount(25);
        expect(recLookups(log)).toHaveLength(1);
        expect(recCredits(log)).toEqual([expect.stringContaining('inc=artist-rels+place-rels+event-rels')]);
        expect(recCounts(log)).toEqual([expect.stringContaining(`release?recording=${REC_ID}&limit=1`)]);

        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '⟳' }).click();
        await expect.poll(() => [recLookups(log).length, recCredits(log).length, recCounts(log).length], { timeout: 15000 })
            .toEqual([2, 2, 2]);
        await expect(area.locator('h4', { hasText: 'Releases' })).toHaveText('Releases · 271');
    });

    test('the recording window names each studio in its area chain, each step asked once (org/event-GPE.org)', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        expect(areaLookups(log), 'the card asks for no area').toEqual([]);
        await page.keyboard.press('Space');
        const credits = dialog(page).locator('.mb-dp-area h4:text-is("Credits") + .mb-dp-kv');
        const recordedAt = credits.locator('dt:text-is("Recorded at") + dd');
        // Midtown Manhattan (City) → Manhattan (District, passed over) →
        // New York (City) → New York (Subdivision) → United States.
        await expect(recordedAt).toContainText(`914 Sound Studios in New York, United States`);
        // The Record Plant, with or without its "(New York)" disambiguation.
        await expect(recordedAt).toContainText(/The Record Plant( \(New York\))? in Midtown Manhattan, New York, New York, United States/);
        await expect(credits.locator('dt:text-is("Mixed at") + dd'))
            .toContainText(/The Record Plant( \(New York\))? in Midtown Manhattan, New York, New York, United States/);
        await expect(credits).not.toContainText(', Manhattan,');
        await expect(credits.locator('.mb-dp-spin')).toHaveCount(0);
        await expect(recordedAt.locator('a[href="/area/edd27a39-ff8a-4af4-8bbf-f369b0fb1899"]').first()).toHaveText('Midtown Manhattan');
        // Two chains meet in the state of New York: each step once, no country.
        const ids = areaLookups(log);
        expect(ids.slice().sort()).toEqual(['edd27a39-ff8a-4af4-8bbf-f369b0fb1899', '261962ea-d8c2-4eaf-a80c-f14376ffadb0',
            '74e50e58-5deb-4b99-93a2-decbb365c07f', '75e398a3-5f3f-4224-9cd8-0fe44715bc95'].sort());
    });

    test('a recording on fewer releases than a lookup lists asks for no count', async ({ page }) => {
        const short = JSON.parse(json('ws2-pop-recording-thunder.json'));
        short.releases = short.releases.slice(0, 3);
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (/\?inc=artist-credits\+isrcs/.test(url) ? { status: 200, body: JSON.stringify(short) } : null),
        });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['on 3 releases']);
        // Listening from before the pin: a count would come one rate slot
        // after the credits lookup, so "none yet" right after the credits
        // show proves nothing.
        const countAsked = page.waitForRequest(/\/ws\/2\/release\?recording=/, { timeout: 4000 }).then(() => true, () => false);
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('h4', { hasText: 'Releases' })).toHaveText('Releases · 3');
        await expect(area.locator('h4:text-is("Credits") + .mb-dp-kv')).toContainText('Roy Bittan');
        expect(await countAsked, 'every release is in the lookup: no count is asked').toBe(false);
        expect(recCounts(log)).toEqual([]);
    });

    test('a failed extra request shows "Try again" and is not asked again by a repaint', async ({ page }) => {
        await page.clock.install();
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (/\?inc=artist-rels/.test(url) ? { status: 500, body: '{"error":"boom"}' } : null),
        });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('h4', { hasText: 'Credits' })).toBeVisible();
        await expect(area.locator('.mb-dp-warn')).toContainText('Could not load');
        // The count still answers and repaints the window: past a few slots,
        // the failed credits lookup has not been asked again.
        await expect(area.locator('h4', { hasText: 'Releases' })).toHaveText('Releases · 271');
        await page.clock.fastForward(5000);
        await expect.poll(() => page.evaluate(() => window.__saTest.mbRateSlotWaitMs())).toBe(0);
        expect(recCredits(log)).toHaveLength(1);
        await area.locator('button.mb-dp-retry').click();
        await expect.poll(() => recCredits(log).length, { timeout: 15000 }).toBe(2);
    });

    test('the work card: type, language, ISWC, writers, publishers — one request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/work/${WORK_ID}`, 'Born to Run');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Song', 'eng', 'T-070.014.903-6']);
        await expect(card(page).locator('.mb-dp-kv')).toContainText('Bruce Springsteen');
        await expect(card(page).locator('.mb-dp-kv dt')).toContainText(['Composer', 'Lyricist', 'Publisher', 'Related works']);
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2/work/${WORK_ID}?inc=artist-rels+label-rels+work-rels&fmt=json`)]);
    });

    test('the work window: its first 100 recordings of 2,226, from one browse', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/work/${WORK_ID}`, 'Born to Run');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Work');
        await expect(area).toContainText('2226 recordings; the first 100 here');
        await expect(area.locator('.mb-rg-wtable tbody tr')).toHaveCount(100);
        await expect(area.locator('.mb-rg-wtable tbody tr').first().locator('a')).toHaveAttribute('href', /^\/recording\/[0-9a-f-]{36}$/);
        await expect(area.locator('h4', { hasText: 'Codes' })).toBeVisible();
        expect(log.ws2.filter(u => u.includes('/ws/2/recording?work='))).toEqual([
            expect.stringContaining(`recording?work=${WORK_ID}&limit=100&inc=artist-credits`),
        ]);
    });
});

test.describe('MusicBrainz link previews: artist, label, area, instrument (WIP.3)', () => {
    const artistLink = (page) => page.locator('table.tbl tbody a[href="/artist/70248960-cb53-4ea4-943a-edb18f7d336f"]').first();
    const labelLink = (page) => page.locator('table.tbl tbody a[href="/label/011d1192-6f65-45bd-85c4-0400dd45693e"]').first();

    test('the artist card: type, area, life span, rating, IPI, ISNI — one request, no links yet', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, artistLink(page));
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Person', 'Male', 'United States', '1949-09-23 –']);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv).toContainText('Long Branch');
        await expect(kv).toContainText('4.4 of 5 · 15 votes');
        await expect(kv).toContainText('00076333277');
        await expect(kv).toContainText('0000000121418834');
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/artist/70248960-cb53-4ea4-943a-edb18f7d336f?inc=genres+ratings+aliases&fmt=json')]);
    });

    test('the artist window: its links and release groups per type, as they arrive', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, artistLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Artist');
        const counts = area.locator('.mb-rg-wtable tbody tr');
        await expect(counts).toHaveCount(5);
        await expect(counts.locator('td:last-child')).toHaveText(['1,924', '177', '28', '6', '10'], { timeout: 15000 });
        await expect(area.locator('.mb-rg-links > div')).toHaveCount(75);
        expect(log.ws2.filter(u => u.includes('inc=url-rels'))).toHaveLength(1);
        expect(log.ws2.filter(u => u.includes('/ws/2/release-group?artist='))).toHaveLength(5);
    });

    test('the artist window: area and birthplace in their area chains; a country is never looked up (org/event-GPE.org)', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, artistLink(page));
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-dp-kv dt:text-is("Born in") + dd')).toHaveText('Long Branch');
        await page.keyboard.press('Space');
        const facts = dialog(page).locator('.mb-dp-area h4:text-is("Facts") + .mb-dp-kv');
        // Its links and five release-group counts take their rate slots first.
        await expect(facts.locator('dt:text-is("Born") + dd')).toHaveText('1949-09-23 · Long Branch, New Jersey, United States', { timeout: 20000 });
        await expect(facts.locator('dt:text-is("Born") + dd a')).toHaveCount(3);
        // The artist's own area has no type: the ISO code says "country".
        await expect(facts.locator('dt:text-is("Area") + dd')).toHaveText('United States');
        expect(areaLookups(log)).toEqual(['bb0af2e9-6ae0-4c4f-b729-c8d6444d6380', '604b7841-36b7-4bea-9bdc-7eeb52520e35',
            'a36544c1-cb40-4f44-9e0e-7a5a69e403a8']);
        // The card again: the chain from memory, no request.
        const before = log.ws2.length;
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await ctrlHover(page, artistLink(page));
        await expect(card(page).locator('.mb-dp-kv dt:text-is("Born in") + dd')).toHaveText('Long Branch, New Jersey, United States');
        expect(log.ws2).toHaveLength(before);
    });

    test('the label window: a label in a country asks for no area (org/event-GPE.org)', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, labelLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('.mb-dp-kv').first()).toContainText('43,171');
        await expect(area.locator('h4:text-is("Facts") + .mb-dp-kv dt:text-is("Area") + dd')).toHaveText('United States');
        expect(areaLookups(log)).toEqual([]);
    });

    test('the label window: an area below a country in its area chain (org/event-GPE.org)', async ({ page }) => {
        const label = JSON.parse(json('ws2-pop-label-columbia.json'));
        label.area = { id: '10fa66f7-aa08-4823-8af8-52108f350a5a', name: 'Asbury Park', 'sort-name': 'Asbury Park', type: null, 'type-id': null };
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=genres/.test(url) ? { status: 200, body: JSON.stringify(label) } : null),
        });
        await ctrlHover(page, labelLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-area h4:text-is("Facts") + .mb-dp-kv dt:text-is("Area") + dd'))
            .toHaveText('Asbury Park, New Jersey, United States', { timeout: 15000 });
        expect(areaLookups(log)).toEqual(['10fa66f7-aa08-4823-8af8-52108f350a5a', '604b7841-36b7-4bea-9bdc-7eeb52520e35',
            'a36544c1-cb40-4f44-9e0e-7a5a69e403a8']);
    });

    test('the arrows stay in the Artist column', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true } });
        const n = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .filter(t => t.getClientRects().length)
            .reduce((s, t) => s + Array.from(t.tBodies[0].rows).filter(tr => tr.getClientRects().length &&
                Array.from(tr.cells).some(td => td.querySelector('a[href^="/artist/"]'))).length, 0));
        await ctrlHover(page, artistLink(page));
        await expect(card(page)).toBeVisible();
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText(`1 / ${n}`);
        await page.keyboard.press('ArrowRight');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText(`2 / ${n}`);
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Artist');
    });

    test('the label card and window: label code, related labels by direction, the release count', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, labelLink(page));
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Imprint', 'LC 00162', 'United States', '1887 –']);
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/label/011d1192-6f65-45bd-85c4-0400dd45693e?inc=genres+aliases&fmt=json')]);
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const related = area.locator('h4:text-is("Related labels") + .mb-dp-kv');
        await expect(related).toContainText('Vocalion');
        for (const name of ['Owns', 'Owned by', 'Imprint of']) {
            await expect(related.locator('dt').getByText(name, { exact: true })).toHaveCount(1);
        }
        await expect(related).toContainText('Vocalion');
        await expect(related).toContainText('Columbia/Epic Label Group');
        await expect(area.locator('.mb-dp-kv').first()).toContainText('43,171');
        expect(log.ws2.filter(u => u.includes('inc=url-rels+label-rels'))).toHaveLength(1);
        expect(log.ws2.filter(u => u.includes('/ws/2/release?label='))).toHaveLength(1);
    });

    test('the area card and window: the parent and the parts, one request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/area/a36544c1-cb40-4f44-9e0e-7a5a69e403a8', 'New Jersey');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Subdivision', 'US-NJ']);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv).toContainText('United States');
        await expect(kv.locator('dt')).toContainText(['Part of', 'Parts']);
        await page.keyboard.press('Space');
        const related = dialog(page).locator('h4:text-is("Related areas") + .mb-dp-kv');
        await expect(related.locator('dd').first().locator('a')).toHaveCount(21);
        await expect(related).toContainText('Essex County');
        expect(log.ws2).toHaveLength(1);
    });

    test('the instrument card and window: subtypes, hybrids, aliases; the description is left to the Live page', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/instrument/63021302-86cd-4aee-80df-2270d54f4978', 'guitar');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['String instrument']);
        await expect(card(page).locator('.mb-dp-kv')).toContainText('slide guitar, steel guitar, Vietnamese guitar +5');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area).toContainText('The description is on the instrument\'s page (Live page).');
        const groups = area.locator('h4:text-is("Related instruments") + .mb-dp-kv dt');
        await expect(groups).toHaveCount(3);
        for (const name of ['Hybrids', 'Part of', 'Subtypes']) {
            await expect(groups.getByText(name, { exact: true })).toHaveCount(1);
        }
        await expect(area.locator('h4', { hasText: 'Aliases' })).toHaveText('Aliases · 27');
        expect(log.ws2).toHaveLength(1);
    });
});

test.describe('MusicBrainz link previews: event, place, series (WIP.4)', () => {
    const EVENT = '/event/3f2ca30a-7de4-4964-ad30-48376535fec8';

    test('the event card: date and time, place, line-up and the first songs of its setlist — one request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, EVENT, 'Manchester');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Concert', '2025-05-20 19:30']);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv).toContainText('Co‐op Live, Manchester');
        // The setlist's line-up, joined by its own words ("&", "with").
        await expect(kv).toContainText('Bruce Springsteen & The E Street Band with Roy Bittan, Nils Lofgren');
        await expect(card(page).locator('.mb-pop-tracks li')).toHaveCount(5);
        await expect(card(page).locator('.mb-tt-dim')).toContainText('more');
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2${EVENT}?inc=artist-rels+place-rels+event-rels+series-rels+url-rels&fmt=json`)]);
        expect(log.eaa, 'the poster only on pin').toEqual([]);
    });

    test('the event window: the whole setlist, what was recorded there, the event art', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, EVENT, 'Manchester');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Event');
        const songs = area.locator('h4:text-matches("^Setlist") ~ ol.mb-pop-tracks li');
        await expect(songs.last()).toContainText('Chimes of Freedom');
        await expect(songs.filter({ hasText: /\[|\]/ })).toHaveCount(0);
        const recorded = area.locator('h4:text-is("Recorded here") + .mb-dp-kv');
        await expect(recorded.locator('dt')).toContainText(['Recorded at (releases)', 'Recorded at (recordings)']);
        await expect(recorded.locator('dd').nth(1).locator('a')).toHaveCount(26);
        await expect(area.locator('.mb-dp-gallery img')).not.toHaveCount(0);
        expect(log.eaa).toEqual([EVENT]);
        // A click on the event art opens the viewer on it, from the record already here.
        await area.locator('.mb-dp-gallery a').first().click();
        await expect(page.locator('#mb-art-viewer')).toBeVisible();
        await expect(page.locator('#mb-art-viewer .mb-artv-pos')).toHaveText(/^1 \/ \d+$/);
        await expect(page.locator('#mb-art-viewer')).toHaveAttribute('aria-label', 'EAA artwork viewer');
        expect(log.eaa).toEqual([EVENT]);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeVisible();
        expect(log.ws2.filter(u => u.includes('inc=recording-rels+release-rels'))).toHaveLength(1);
    });

    // org/event-GPE.org. Real captures (scripts/probe-mb-entity-lookups.py
    // --only event-details, 2026-10-08): the Stone Pony show, whose setlist
    // has mixed-case MBIDs and "(with …)" guests; the OceanFirst show, part
    // of a two-day event, with three URLs, held in West Long Branch → Monmouth
    // County → New Jersey → United States.
    const PONY = '/event/26cead1c-a5fa-4677-873a-312412c6dc91';
    const OCEAN = '/event/cd595883-d26a-4e76-a033-eb588e0f9c55';
    // West Long Branch → Monmouth County → New Jersey (→ United States, never asked).
    const OCEAN_CHAIN = ['4c21ce68-e33e-4772-ac5f-0f52d9195d96', '604b7841-36b7-4bea-9bdc-7eeb52520e35',
        'a36544c1-cb40-4f44-9e0e-7a5a69e403a8'];
    const eventWs2 = (url) => {
        if (url.includes(`/ws/2${PONY}?inc=artist-rels`)) return { status: 200, body: json('ws2-pop-event-stonepony.json') };
        if (url.includes(`/ws/2${OCEAN}?inc=artist-rels`)) return { status: 200, body: json('ws2-pop-event-oceanfirst.json') };
        if (/\/ws\/2\/event\/[0-9a-f-]{36}\?inc=recording-rels/.test(url)) return { status: 200, body: '{"relations":[]}' };
        return null;
    };

    test('the event window links its setlist: works, the line-up and the "(with …)" guests as artists, mixed-case MBIDs too', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false, ws2: eventWs2 });
        const a = await addLink(page, PONY, 'Stone Pony');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        // The card: names only, never a raw token.
        await expect(card(page).locator('.mb-pop-tracks li').first()).toContainText('Cadillac Jack');
        await expect(card(page).locator('.mb-pop-tracks a')).toHaveCount(0);
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const songs = area.locator('h4:text-matches("^Setlist") ~ ol.mb-pop-tracks li');
        await expect(songs).toHaveCount(20);
        await expect(songs.filter({ hasText: /\[|\]/ }), 'no raw [mbid|name] token').toHaveCount(0);
        // A mixed-case token: the work linked by its lowercased MBID, the
        // guest in "(with …)" as an artist.
        const fever = songs.nth(13);
        await expect(fever).toContainText('The Fever (with Bruce Springsteen)');
        await expect(fever.locator('a[href="/work/e497263c-4f15-36c0-b27c-dca99482962c"]')).toHaveText('The Fever');
        await expect(fever.locator('a[href="/artist/70248960-cb53-4ea4-943a-edb18f7d336f"]')).toHaveText('Bruce Springsteen');
        const hard = songs.nth(15);
        await expect(hard.locator('a[href^="/work/"]')).toHaveCount(1);
        await expect(hard.locator('a[href^="/artist/"]')).toHaveText(['Bruce Springsteen', 'Graham Parker']);
        // Two works before the guests: both works.
        await expect(songs.nth(18).locator('a[href^="/work/"]')).toHaveText(['Chain of Fools', 'Born on the Bayou']);
        // A song without a token stays text.
        await expect(songs.nth(10)).toHaveText(/You Don’t Know/);
        await expect(songs.nth(10).locator('a')).toHaveCount(0);
        // MusicBrainz's own page links the guests as works: not here.
        await expect(area.locator('a[href^="/work/70248960"], a[href^="/work/f9227504"]')).toHaveCount(0);
        // The line-up: every artist linked.
        const lineup = area.locator('h4:text-matches("^Setlist") + .mb-dp-xsub');
        await expect(lineup.locator('a[href="/artist/d7bc97fb-4bd3-453b-98a1-9081f89c52f0"]')).toHaveText('Southside Johnny & The Asbury Jukes');
        await expect(lineup.locator('a[href^="/artist/"]')).toHaveCount(12);
        await expect(lineup).toContainText('Southside Johnny & The Asbury Jukes with Southside Johnny, Chris Anderson');
        // org/event-GPE.org item 4: an instrument attribute links its
        // instrument (its id is the instrument's MBID); a vocal does not
        // (its id is not an instrument's). The artist's disambiguation is
        // shown, as MusicBrainz shows it.
        const main = area.locator('h4:text-is("Facts") + .mb-dp-kv dt:text-is("Main performer") + dd');
        await expect(main).toContainText('Chris Anderson (trumpet player) (trumpet)');
        await expect(main.locator('a[href="/instrument/1c8f9780-2f16-4891-b66d-bb7aa0820dbd"]')).toHaveText('trumpet');
        await expect(main.locator('a[href="/instrument/12092505-6ee1-46af-a15a-b5b468b6b155"]')).toHaveText('drums (drum set)');
        await expect(main).toContainText('lead vocals');
        await expect(main.locator('a[href^="/instrument/"]', { hasText: /vocals/ })).toHaveCount(0);
        // A linked work previews and drills down like any other link.
        await fever.locator('a[href^="/work/"]').click();
        await expect(dialog(page).locator(':scope > div > span').first()).toContainText('Work');
    });

    test('the event window: held at with the whole area chain, part of with its dates, URLs with [info]', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false, ws2: eventWs2 });
        const a = await addLink(page, OCEAN, 'OceanFirst');
        // Listening from before the hover: an area lookup started by the card
        // would come one rate slot after its own, so "none yet" right after
        // the card shows proves nothing.
        const areaAsked = page.waitForRequest(/\/ws\/2\/area\//, { timeout: 3000 }).then(() => true, () => false);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        // The card: one request, no area lookup; the place with its own area.
        expect(await areaAsked, 'the card asks for no area').toBe(false);
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2${OCEAN}?inc=artist-rels+place-rels+event-rels+series-rels+url-rels&fmt=json`)]);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv.locator('dt:text-is("Place") + dd')).toHaveText('OceanFirst Bank Center, West Long Branch');
        await expect(kv.locator('dt:text-is("Part of") + dd')).toHaveText('Music America: The Songs That Shaped Us');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const facts = area.locator('h4:text-is("Facts") + .mb-dp-kv');
        // As MusicBrainz writes it: the county is passed over.
        const heldAt = facts.locator('dt:text-is("Held at") + dd');
        await expect(heldAt).toHaveText('OceanFirst Bank Center in West Long Branch, New Jersey, United States');
        await expect(heldAt.locator('a')).toHaveCount(4);
        await expect(heldAt.locator('a[href="/area/a36544c1-cb40-4f44-9e0e-7a5a69e403a8"]')).toHaveText('New Jersey');
        await expect(heldAt).not.toContainText('Monmouth');
        // One lookup per level, each once; none for the country.
        expect(areaLookups(log)).toEqual(OCEAN_CHAIN);
        const partOf = facts.locator('dt:text-is("Part of") + dd');
        await expect(partOf).toHaveText('Music America: The Songs That Shaped Us (2026-06-04 – 2026-06-05)');
        await expect(partOf.locator('a[href^="/event/"]')).toHaveCount(1);
        // URLs: one row per relationship type, the address in full, [info].
        const urls = area.locator('h4:text-is("URLs · 3") + .mb-dp-kv');
        await expect(urls.locator('dt')).toHaveText(['Official homepage', 'Review', 'Setlistfm']);
        const home = urls.locator('dt:text-is("Official homepage") + dd');
        await expect(home.locator('a').first())
            .toHaveAttribute('href', 'https://springsteencenter.org/event/music-america-the-songs-that-shaped-us-night-one/');
        await expect(home.locator('a[href="/url/1119cef1-1f6b-479a-8265-617e39eb8749"]')).toHaveText('info');
        await expect(urls.locator('a[href^="/url/"]')).toHaveCount(3);
        await expect(urls.locator('dt:text-is("Review") + dd')).toHaveText('http://brucebase.wikidot.com/2026#040626 [info]');

        // Closed and hovered again: the card shows the chain from memory,
        // and asks nothing.
        const before = log.ws2.length;
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-dp-kv dt:text-is("Place") + dd'))
            .toHaveText('OceanFirst Bank Center in West Long Branch, New Jersey, United States');
        expect(log.ws2).toHaveLength(before);
    });

    test('a failed step of the area chain shows what is known, is not retried by repaints, and ⟳ asks again', async ({ page }) => {
        await page.clock.install();
        let failNj = true;
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (failNj && url.includes('/ws/2/area/a36544c1-') ? { status: 500, body: '{}' } : eventWs2(url)),
        });
        const a = await addLink(page, OCEAN, 'OceanFirst');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const heldAt = dialog(page).locator('.mb-dp-area h4:text-is("Facts") + .mb-dp-kv dt:text-is("Held at") + dd');
        // West Long Branch and Monmouth County answered (the county's parent
        // names New Jersey), New Jersey's own lookup did not, so its parent
        // is unknown: the chain so far, and no spinner — the step has failed.
        await expect(heldAt).toHaveText('OceanFirst Bank Center in West Long Branch, New Jersey');
        const nj = () => areaLookups(log).filter(id => id.startsWith('a36544c1-')).length;
        const tries = nj();
        expect(tries, 'the failed step was asked').toBeGreaterThan(0);
        // The window's other answers (recorded here, the poster) still repaint
        // it: past a few rate slots, the failed step has not been asked again.
        await page.clock.fastForward(5000);
        await expect.poll(() => page.evaluate(() => window.__saTest.mbRateSlotWaitMs())).toBe(0);
        expect(nj(), 'no repaint asks a failed step again').toBe(tries);
        failNj = false;
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '⟳' }).click();
        await expect(heldAt).toHaveText('OceanFirst Bank Center in West Long Branch, New Jersey, United States');
    });

    test('the place card and window: address, coordinates with a map, its events by date', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/place/6a59a67c-fcc5-491f-949c-bfc45bc97463', 'The Stone Pony');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Venue', 'Asbury Park', '1973 –']);
        await expect(card(page).locator('.mb-dp-kv')).toContainText('913 Ocean Avenue, Asbury Park, NJ 07712, USA');
        await expect(card(page).locator('.mb-dp-kv')).toContainText('40.21995, -74.00058');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('a[href^="https://www.openstreetmap.org/"]')).toHaveAttribute('href', /mlat=40\.21995&mlon=-74\.00058/);
        await expect(area.locator('.mb-rg-links > div')).toHaveCount(5);
        await expect(area).toContainText('110 events; 100 of them here, by date');
        const dates = area.locator('.mb-rg-wtable tbody tr td:first-child');
        await expect(dates).toHaveCount(100);
        // The browse answers in no date order (1982, 1987, 2008, 1982, …).
        await expect.poll(async () => {
            const d = await dates.allTextContents();
            return d.join('|') === [...d].sort().join('|');
        }, { message: 'the events are sorted by date' }).toBe(true);
        expect(log.ws2.filter(u => u.includes('/ws/2/event?place='))).toHaveLength(1);
    });

    test('the place window: its area in the area chain; the card shows it once known (org/event-GPE.org)', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/place/6a59a67c-fcc5-491f-949c-bfc45bc97463', 'The Stone Pony');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        expect(areaLookups(log), 'the card asks for no area').toEqual([]);
        await page.keyboard.press('Space');
        const areaRow = dialog(page).locator('.mb-dp-area h4:text-is("Facts") + .mb-dp-kv dt:text-is("Area") + dd');
        // Asbury Park (City) → Monmouth County (County, passed over) → New Jersey → United States.
        await expect(areaRow).toHaveText('Asbury Park, New Jersey, United States');
        await expect(areaRow.locator('a')).toHaveCount(3);
        expect(areaLookups(log)).toEqual(['10fa66f7-aa08-4823-8af8-52108f350a5a', '604b7841-36b7-4bea-9bdc-7eeb52520e35',
            'a36544c1-cb40-4f44-9e0e-7a5a69e403a8']);
        const before = log.ws2.length;
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Venue', 'Asbury Park, New Jersey, United States']);
        expect(log.ws2).toHaveLength(before);
    });

    test('the series card and window: its items in order, with their numbers', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/series/aa3694d3-a3d0-48ed-8f07-5b576de87908', 'Studio Collection');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Release series', '12 items']);
        await expect(card(page).locator('.mb-pop-tracks li').first()).toContainText('1');
        await expect(card(page).locator('.mb-pop-tracks li').first()).toContainText('Born in the U.S.A.');
        await page.keyboard.press('Space');
        const rows = dialog(page).locator('.mb-rg-wtable tbody tr');
        await expect(rows).toHaveCount(12);
        // The lookup lists them by ordering key 1, 2, 10, 7, …: shown in order.
        await expect(rows.locator('td:first-child')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
        await expect(rows.first().locator('a')).toHaveAttribute('href', /^\/release\/[0-9a-f-]{36}$/);
        expect(log.ws2).toEqual([expect.stringContaining('inc=release-rels+release-group-rels+recording-rels+work-rels+event-rels+artist-rels')]);
    });
});

test.describe('MusicBrainz link previews: ISRC, ISWC, disc ID, collection (WIP.5)', () => {
    const DISCID = 'coDDysS5IdmG1aPONqJSQd6TJws-';
    const COLLECTION = '/collection/60df131d-bdb7-3c83-840d-e31e566baabe';

    test('an ISRC: the recordings carrying it', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/isrc/USSM17500803', 'USSM17500803');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['1 recording']);
        await expect(card(page).locator('.mb-pop-tracks li')).toContainText(['Thunder Road']);
        await expect(card(page).locator('.mb-pop-len')).toHaveText(['4:50']);
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/isrc/USSM17500803?inc=artist-credits&fmt=json')]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('ISRC');
        await expect(dialog(page).locator('.mb-rg-wtable tbody tr a').first()).toHaveAttribute('href', /^\/recording\/[0-9a-f-]{36}$/);
    });

    test('an ISWC: the works carrying it', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/iswc/T-070.014.903-6', 'T-070.014.903-6');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['1 work']);
        await expect(card(page).locator('.mb-pop-tracks li')).toContainText(['Born to Run · Song']);
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/iswc/T-070.014.903-6?fmt=json')]);
    });

    test('a disc ID: its table of contents and releases; its page is /cdtoc/, its lookup /ws/2/discid/', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/cdtoc/${DISCID}`, DISCID);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        // 193,680 sectors at 75 a second.
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['10 tracks', '43:02']);
        await expect(card(page).locator('.mb-dp-kv')).toContainText('Darkness on the Edge of Town');
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2/discid/${DISCID}?fmt=json`)]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Disc ID');
        await expect(dialog(page).locator('h4', { hasText: 'Table of contents' })).toHaveText('Table of contents · 10');
        await expect(dialog(page).locator('a.mb-dp-tbtn')).toHaveAttribute('href', `https://musicbrainz.org/cdtoc/${DISCID}`);
    });

    test('a public collection: its type, size and editor', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, COLLECTION, 'Attending');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Attending', '0 events']);
        await expect(card(page).locator('.mb-dp-kv a')).toHaveAttribute('href', '/user/vzell');
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2${COLLECTION}?fmt=json`)]);
    });

    test('a private collection answers 401: the card says so, and nothing is kept', async ({ page }) => {
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (url.includes('/ws/2/collection/') ? { status: 401, body: '{"error":"Authentication required"}' } : null),
        });
        const a = await addLink(page, COLLECTION, 'Attending');
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-alert')).toContainText('It is probably private.');
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-alert')).toContainText('It is probably private.');
        await expect.poll(() => log.ws2.length, { message: 'a failure is asked again on the next hover' }).toBe(2);
    });
});

test.describe('MusicBrainz link previews: edit and editor, read from the page (Phase 3)', () => {
    const APPLIED = '/edit/126930910';
    const OPEN = '/edit/154299713';

    test('what is previewed: an edit and a profile, not their tabs', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const r = await page.evaluate(() => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const res = (href) => {
                const a = document.createElement('a');
                a.href = href;
                a.textContent = 'x';
                td.appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return {
                edit: res('/edit/126930910'), data: res('/edit/126930910/data'), notNumber: res('/edit/open'),
                user: res('/user/vzell'), userEdits: res('/user/vzell/edits'), encoded: res('/user/Some%20One'),
                // MusicBrainz's own editor link, its avatar inside.
                avatar: (() => {
                    const a = document.createElement('a');
                    a.href = '/user/vzell';
                    a.innerHTML = '<img class="avatar no-avatar" alt="" width="15" height="15"><bdi>vzell</bdi>';
                    td.appendChild(a);
                    return window.__saTest.popResolve(a);
                })(),
            };
        });
        expect(r.edit).toBe('mb-entity|edit:126930910');
        expect(r.data).toBeNull();
        expect(r.notNumber).toBeNull();
        expect(r.user).toBe('mb-entity|user:vzell');
        expect(r.userEdits).toBeNull();
        expect(r.encoded).toBe('mb-entity|user:Some%20One');
        expect(r.avatar, 'an editor link\'s avatar is not artwork').toBe('mb-entity|user:vzell');
    });

    test('an applied edit: type, status, editor, changes and notes from one page request, which the Live page reuses', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, APPLIED, 'Edit #126930910');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Edit #126930910');
        await expect(card(page)).toContainText('Add event art');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Applied', 'automatically applied', 'by vzell']);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv).toContainText('2025‐05‐20: Co‐op Live, Manchester, England, UK');
        await expect(kv.locator('dt')).toContainText(['Opened', 'Closed', 'Event']);
        expect(log.html).toEqual([`https://musicbrainz.org${APPLIED}`]);
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Edit');
        await expect(area.locator('h4', { hasText: 'Notes' })).toHaveText('Notes · 1');
        await expect(area.locator('.mb-dp-gname')).toContainText('vzell');
        await expect(area.locator('a[href="/event/3f2ca30a-7de4-4964-ad30-48376535fec8"]')).toBeVisible();
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: 'Live page' }).click();
        const frame = page.frameLocator('#mb-dp-dialog iframe');
        await expect(frame.locator('.edit-header h1')).toHaveText('Edit #126930910 - Add event art', { timeout: 15000 });
        expect(log.html, 'the Live page reuses the hover\'s page').toHaveLength(1);
    });

    test('an open edit: its tally and closing, the editor hidden to a logged-out reader; kept in memory only', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, OPEN, 'Edit #154299713');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Open', '0 yes : 2 no', 'editor hidden']);
        await expect(card(page).locator('.mb-dp-kv')).toContainText('About to close');
        await expect(card(page).locator('.mb-dp-kv')).toContainText('log in to see them');
        expect(log.html).toHaveLength(1);
        // Its votes change: after a reload it is asked again, not read back.
        await reloadScript(page);
        const again = await addLink(page, OPEN, 'Edit #154299713');
        await ctrlHover(page, again);
        await expect(card(page)).toContainText('fetched now');
        expect(log.html).toHaveLength(2);
    });

    test('a closed edit is kept: after a reload it comes from IndexedDB', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, await addLink(page, APPLIED, 'Edit #126930910'));
        await expect(card(page)).toContainText('fetched now');
        await reloadScript(page);
        await ctrlHover(page, await addLink(page, APPLIED, 'Edit #126930910'));
        await expect(card(page)).toContainText('saved today');
        expect(log.html).toHaveLength(1);
    });

    test('an editor: user type, member since and edit counts — nothing personal', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/user/vzell', 'vzell');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Auto-editor', 'since 2013-11-28']);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv.locator('dt')).toHaveText(['Edits', 'Accepted', 'Auto-edits', 'Voted down', 'Open', 'Subscribers']);
        await expect(kv.locator('dd').first()).toHaveText('1,006,542');
        await expect(card(page)).not.toContainText('Email');
        await expect(card(page)).not.toContainText('Bio');
        expect(log.html).toEqual(['https://musicbrainz.org/user/vzell']);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Editor');
        await expect(dialog(page).locator('.mb-rg-wtable tbody tr').first()).toContainText('Total');
        await expect(dialog(page).locator('.mb-dp-area')).not.toContainText('Languages');
    });

    test('a page that is not the edit (a login page) fails and is not kept', async ({ page }) => {
        let login = true;
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: () => (login ? { status: 200, contentType: 'text/html', body: '<html><body><div id="page"><h1>Log in</h1></div></body></html>' } : null),
        });
        const a = await addLink(page, APPLIED, 'Edit #126930910');
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-alert')).toContainText('not the page expected');
        login = false;
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        expect(log.html).toHaveLength(2);
    });
});

test.describe('MusicBrainz link previews: beyond table links (Phase 4)', () => {
    /**
     * What `__saTest.popResolve()` says for elements the page builds:
     * stamped elements in a cell, the page's own header and tab links.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<Object<string, ?string>>}
     */
    async function resolveAll(page) {
        return page.evaluate((id) => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const stamp = (value, name) => {
                const el = document.createElement('span');
                el.setAttribute('data-mb-pop', value);
                if (name) el.setAttribute('data-mb-pop-name', name);
                el.textContent = name || value;
                td.appendChild(el);
                return window.__saTest.popResolve(el);
            };
            const res = (el) => (el ? window.__saTest.popResolve(el) : 'missing');
            return {
                stamped: stamp(`release:${id}`, 'Greetings'),
                discid: stamp('discid:coDDysS5IdmG1aPONqJSQd6TJws-'),
                unknownKind: stamp('nope:1'),
                inherited: stamp('constructor:1'),
                noId: stamp('release:'),
                header: res(document.querySelector('#content .subheader a[href^="/artist/"]')),
                tab: res(document.querySelector('#content .tabs a[href^="/release-group/"]')),
            };
        }, REL_ID);
    }

    test('a stamped element is previewed as its kind, anywhere; a bad stamp is not', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const r = await resolveAll(page);
        expect(r.stamped).toBe(`mb-entity|release:${REL_ID}`);
        expect(r.discid).toBe('mb-entity|discid:coDDysS5IdmG1aPONqJSQd6TJws-');
        expect(r.unknownKind).toBeNull();
        expect(r.inherited, 'only the registry\'s own kinds').toBeNull();
        expect(r.noId).toBeNull();
        expect(r.header, 'outside a table: not with sa_pop_mb_page off').toBeNull();
    });

    test('a stamped element\'s card and page: its name while loading, its kind\'s own path', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate((id) => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const el = document.createElement('span');
            el.id = 'stamped';
            el.setAttribute('data-mb-pop', `release:${id}`);
            el.setAttribute('data-mb-pop-name', 'Stamped release');
            el.textContent = 'cell text';
            td.appendChild(el);
            const d = document.createElement('span');
            d.id = 'stamped-disc';
            d.setAttribute('data-mb-pop', 'discid:coDDysS5IdmG1aPONqJSQd6TJws-');
            d.textContent = 'disc';
            td.appendChild(d);
        }, REL_ID);
        await ctrlHover(page, page.locator('#stamped'));
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        expect(log.lookups).toHaveLength(1);
        await ctrlHover(page, page.locator('#stamped-disc'));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('a.mb-dp-tbtn')).toHaveAttribute('href', 'https://musicbrainz.org/cdtoc/coDDysS5IdmG1aPONqJSQd6TJws-');
    });

    test('page-wide scope (sa_pop_mb_page): a header link has a card; the tabs still do not', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true, sa_pop_mb_page: true }, showAll: false });
        const r = await resolveAll(page);
        expect(r.header).toMatch(/^mb-entity\|artist:[0-9a-f-]{36}$/);
        expect(r.tab, 'the entity\'s own tabs').toBeNull();
        const header = page.locator('#content .subheader a[href^="/artist/"]').first();
        await ctrlHover(page, header);
        await expect(card(page)).toContainText('fetched now');
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/artist/')]);
    });

    test('the arrows step over stamped cells of the same kind in the same column', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter(tr => tr.cells.length > 7).slice(0, 3);
            rows.forEach((tr, i) => {
                const el = document.createElement('span');
                el.className = 'stamped-step';
                el.setAttribute('data-mb-pop', 'discid:coDDysS5IdmG1aPONqJSQd6TJws-');
                el.setAttribute('data-mb-pop-name', `disc ${i + 1}`);
                el.textContent = `disc ${i + 1}`;
                tr.cells[7].appendChild(el);
            });
        });
        await ctrlHover(page, page.locator('.stamped-step').first());
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText('1 / 3');
        await page.keyboard.press('ArrowRight');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText('2 / 3');
    });
});

test.describe('MusicBrainz link previews: barcode cells (Phase 4)', () => {
    const BARCODE = '074643190329';
    const bcCell = (page) => page.locator('table.tbl tbody td.barcode-cell', { hasText: BARCODE }).first();

    test('a barcode cell is a target; "[none]" and an empty cell are not', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const r = await page.evaluate((code) => {
            const cells = Array.from(document.querySelectorAll('table.tbl tbody td.barcode-cell'));
            const res = (td) => (td ? window.__saTest.popResolve(td) : 'missing');
            const none = document.createElement('td');
            none.className = 'barcode-cell';
            none.textContent = '[none]';
            const empty = document.createElement('td');
            empty.className = 'barcode-cell';
            cells[0].parentElement.append(none, empty);
            return { code: res(cells.find(td => td.textContent.trim() === code)), none: res(none), empty: res(empty) };
        }, BARCODE);
        expect(r.code).toBe(`mb-entity|barcode:${BARCODE}`);
        expect(r.none).toBeNull();
        expect(r.empty).toBeNull();
    });

    test('its card: the releases carrying it, from one search', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, bcCell(page));
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText(BARCODE);
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['6 releases']);
        await expect(card(page).locator('.mb-dp-kv')).toContainText('Greetings From Asbury Park, N.J.');
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2/release?query=barcode:${BARCODE}&limit=25&fmt=json`)]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Barcode');
        await expect(dialog(page).locator('.mb-rg-wtable tbody tr')).toHaveCount(6);
        await expect(dialog(page).locator('a.mb-dp-tbtn')).toHaveAttribute('href',
            `https://musicbrainz.org/search?query=barcode%3A${BARCODE}&type=release&method=advanced`);
    });

    test('the arrows step down the Barcode column, over cells that hold a barcode', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true } });
        const n = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td.barcode-cell'))
            .filter(td => td.getClientRects().length && /\d/.test(td.textContent) && td.textContent.trim() !== '[none]').length);
        expect(n).toBeGreaterThan(2);
        await ctrlHover(page, bcCell(page));
        await expect(card(page)).toBeVisible();
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-pos-label')).toHaveText(new RegExp(`^\\d+ / ${n}$`));
        const before = await dialog(page).locator('.mb-dp-pos-label').textContent();
        await page.keyboard.press('ArrowRight');
        await expect(dialog(page).locator('.mb-dp-pos-label')).not.toHaveText(before);
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Barcode');
    });
});

test.describe('MusicBrainz link previews: 📊 dropdown entries (Phase 4)', () => {
    const ARTIST_POP = 'artist:70248960-cb53-4ea4-943a-edb18f7d336f';

    /**
     * Opens the first visible table's 📊 dropdown on a column.
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} col
     * @returns {Promise<void>}
     */
    async function openDrop(page, col) {
        await page.evaluate((name) => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => t.dataset.colName === name && t.getClientRects().length);
            // The dropdown is fixed-position beside its button: clicked off
            // screen, it opens off screen (2 of 10 runs did).
            th.scrollIntoView({ block: 'center' });
            th.querySelector('.mb-col-uniq-wrap').click();
        }, col);
        await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
    }

    test('an entry naming one entity is stamped and has that entity\'s card; an entry naming none is not', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true } });
        await openDrop(page, 'Artist');
        const drop = page.locator('#mb-col-uniq-dropdown');
        const plain = drop.locator(`.mb-col-uniq-item:not(.mb-col-uniq-multirow-item)[data-mb-pop="${ARTIST_POP}"]`);
        await expect(plain).toHaveCount(1);
        await expect(plain).toHaveAttribute('data-mb-pop-name', 'Bruce Springsteen');
        await ctrlHover(page, plain);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Person']);
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/artist/70248960-cb53-4ea4-943a-edb18f7d336f?')]);
        // The Label column's "Entity info - Label name" entries are stamped too.
        await page.keyboard.press('Escape');
        await page.mouse.click(5, 5);
        await openDrop(page, 'Label');
        await expect(page.locator('#mb-col-uniq-dropdown .mb-col-uniq-multirow-item[data-mb-pop="label:011d1192-6f65-45bd-85c4-0400dd45693e"]'))
            .toHaveCount(1);
        // A Format value names no entity: no stamp.
        await page.keyboard.press('Escape');
        await page.mouse.click(5, 5);
        await openDrop(page, 'Format');
        await expect(page.locator('#mb-col-uniq-dropdown .mb-col-uniq-item[data-mb-pop]')).toHaveCount(0);
    });

    test('pinning an entry\'s card puts the window in front: the dropdown closes', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true } });
        await openDrop(page, 'Artist');
        const entry = page.locator(`#mb-col-uniq-dropdown .mb-col-uniq-item[data-mb-pop="${ARTIST_POP}"]`).first();
        await ctrlHover(page, entry);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Artist');
        await expect(page.locator('#mb-col-uniq-dropdown')).toBeHidden();
        const inFront = await page.evaluate(() => {
            const d = document.getElementById('mb-dp-dialog').getBoundingClientRect();
            const el = document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2);
            return !!(el && el.closest('#mb-dp-dialog'));
        });
        expect(inFront, 'nothing covers the window').toBe(true);
    });
});

test.describe('MusicBrainz link previews: Catalog# → its label (Phase 4)', () => {
    const catSpan = (page) => page.locator('table.tbl tbody span.catalog-number', { hasText: /^KC 31903$/ }).first();

    test('a catalog number resolves to its row\'s release and the number', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const r = await page.evaluate(() => {
            const span = Array.from(document.querySelectorAll('table.tbl tbody span.catalog-number')).find(s => s.textContent.trim() === 'KC 31903');
            const loose = document.createElement('span');
            loose.className = 'catalog-number';
            loose.textContent = 'XYZ 1';
            document.querySelector('#content').appendChild(loose);
            return { span: window.__saTest.popResolve(span), outside: window.__saTest.popResolve(loose) };
        });
        expect(r.span).toBe(`mb-entity|catno:${REL_ID}~KC 31903`);
        expect(r.outside, 'not in a table row that links a release').toBeNull();
    });

    test('its card is the label the release names for that number: the release lookup, then the label\'s', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, catSpan(page));
        await expect(card(page)).toContainText('fetched now', { timeout: 15000 });
        await expect(card(page).locator('.mb-tt-dim').first()).toHaveText('KC 31903 — catalog number of');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Columbia');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['LC 00162']);
        expect(log.lookups.map(l => l.url)).toEqual([expect.stringContaining(`/ws/2/release/${REL_ID}?${INC}`)]);
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/label/011d1192-6f65-45bd-85c4-0400dd45693e?inc=genres+aliases')]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Catalog number');
        await expect(dialog(page).locator('h4:text-is("Related labels") + .mb-dp-kv')).toContainText('Vocalion');
        await expect(dialog(page).locator('a.mb-dp-tbtn')).toHaveAttribute('href', 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e');
    });

    test('a number the release does not list for any label says so, and asks for no label', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate(() => {
            const span = Array.from(document.querySelectorAll('table.tbl tbody span.catalog-number')).find(s => s.textContent.trim() === 'KC 31903');
            span.textContent = 'NOT 1';
            span.id = 'other-cat';
        });
        await ctrlHover(page, page.locator('#other-cat'));
        await expect(card(page)).toContainText('The release lists no label with this catalog number.', { timeout: 15000 });
        expect(log.ws2).toEqual([]);
    });

    test('the number is compared as MusicBrainz compares catalog numbers', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate(() => {
            const span = Array.from(document.querySelectorAll('table.tbl tbody span.catalog-number')).find(s => s.textContent.trim() === 'KC 31903');
            span.textContent = 'kc-31903';
            span.id = 'loose-cat';
        });
        await ctrlHover(page, page.locator('#loose-cat'));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Columbia', { timeout: 15000 });
    });
});

test.describe('MusicBrainz link previews: drill-down inside the window (Phase 5)', () => {
    const title = (page) => dialog(page).locator(':scope > div > span').first();
    const backBtn = (page) => dialog(page).locator('button.mb-dp-tbtn', { hasText: '← Back' });

    /**
     * Opens the window on the page's first release.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object} [opts] - For `open()`.
     * @returns {Promise<Object>} `open()`'s request log.
     */
    async function releaseWindow(page, opts = {}) {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false, ...opts });
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-pop-tracks li').first()).toBeVisible();
        return log;
    }

    test('a click on the release group shows it in the window; Back returns, from memory', async ({ page }) => {
        const log = await releaseWindow(page);
        await expect(title(page)).toHaveText('Release');
        await expect(backBtn(page)).toBeHidden();
        await dialog(page).locator('.mb-dp-area a[href^="/release-group/"]').first().click();
        await expect(title(page)).toHaveText('Release › Release group');
        await expect(dialog(page).locator('.mb-rg-wtable tbody tr').first()).toBeVisible();
        await expect(backBtn(page)).toBeVisible();
        expect(log.browses, 'the release group\'s releases').toHaveLength(1);
        // The page's row keeps its mark; nothing in the window is marked.
        await expect(page.locator('tr.mb-dp-current')).toHaveCount(1);
        await expect(page.locator('table.tbl tbody tr.mb-dp-current')).toHaveCount(1);
        await backBtn(page).click();
        await expect(title(page)).toHaveText('Release');
        await expect(dialog(page).locator('.mb-pop-tracks li')).toHaveCount(9);
        await expect(backBtn(page)).toBeHidden();
        expect(log.lookups, 'the release again: from memory').toHaveLength(1);
    });

    test('Backspace and Alt+← go back; the title shows the path', async ({ page }) => {
        await releaseWindow(page);
        await dialog(page).locator('.mb-dp-area a[href^="/release-group/"]').first().click();
        await expect(title(page)).toHaveText('Release › Release group');
        await dialog(page).locator('.mb-rg-wtable tbody a[href^="/release/"]').first().click();
        await expect(title(page)).toHaveText('Release › Release group › Release');
        await page.keyboard.press('Backspace');
        await expect(title(page)).toHaveText('Release › Release group');
        await page.keyboard.press('Alt+ArrowLeft');
        await expect(title(page)).toHaveText('Release');
        // Nothing left to go back to: Backspace is not taken.
        await page.keyboard.press('Backspace');
        await expect(title(page)).toHaveText('Release');
    });

    test('Ctrl+click keeps the link\'s own new tab, and the window stays', async ({ page }) => {
        // Pinned by the new tab's NAVIGATION REQUEST, not by the context's
        // 'page' event. Playwright 1.62.1 sometimes never delivers that event
        // for a Ctrl+click background tab although the tab opens and loads:
        // a failing run's trace has the second page fetching this URL, answered
        // by the route below, and no 'page' event for it (DEBUG-NOTES
        // 2026-10-08, "The Ctrl+click new-tab flake"). This page's own
        // navigations go through open()'s page-level route, which wins over
        // this context route, and recording starts at the click, so a hit
        // here is another tab's.
        const opened = [];
        let armed = false;
        await page.context().route('https://musicbrainz.org/release-group/**', (route) => {
            if (armed && route.request().isNavigationRequest()) opened.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
        });
        await releaseWindow(page);
        const link = dialog(page).locator('.mb-dp-area a[href^="/release-group/"]').first();
        const href = await link.evaluate((a) => a.href);
        armed = true;
        await link.click({ modifiers: ['Control'] });
        await expect.poll(() => opened, { message: 'the link opened in a new tab' }).toContain(href);
        expect(page.url(), 'this page stayed').toBe(RG_URL);
        await expect(title(page)).toHaveText('Release');
    });

    test('the arrows go on from the page target the drill-down started from', async ({ page }) => {
        const log = await releaseWindow(page);
        await dialog(page).locator('.mb-dp-area a[href^="/release-group/"]').first().click();
        await expect(title(page)).toHaveText('Release › Release group');
        await page.keyboard.press('ArrowRight');
        await expect(title(page)).toHaveText('Release');
        await expect(backBtn(page)).toBeHidden();
        await expect.poll(() => log.lookups.length, { timeout: 10000 }).toBe(2);
        expect(log.lookups[1].url).not.toContain(REL_ID);
    });
});
