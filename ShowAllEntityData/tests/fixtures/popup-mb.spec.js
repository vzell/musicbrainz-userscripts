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
    // A tag's page as the server sends it (scripts/fetch-mb-page-fixture.js,
    // 2026-10-19): a genre, 212,773 entities, eleven kinds.
    [/\/tag\/alternative%20rock\/?$/, 'tag-page-alternative-rock.html'],
    // Its kind pages (Phase 3c, the window's lists): 100 a page, most votes
    // first (scripts/probe-mb-tag-kind-pages.py, 2026-10-27).
    [/\/tag\/alternative%20rock\/recording$/, 'tag-kind-alternative-rock-recording-p1.html'],
    [/\/tag\/alternative%20rock\/artist$/, 'tag-kind-alternative-rock-artist-p1.html'],
    // Collections (2026-10-20, read from the page): chaban's public "Cover
    // art: Video" (release groups, 196 on two pages, four collaborators, a
    // description) and the user's own empty "Attending".
    [/\/collection\/3d73c67c-76c6-459d-ac8b-3145cb49d672\/?$/, 'collection-page-coverart-video.html'],
    [/\/collection\/3d73c67c-76c6-459d-ac8b-3145cb49d672\?page=2$/, 'collection-page-coverart-video-p2.html'],
    [/\/collection\/60df131d-bdb7-3c83-840d-e31e566baabe\/?$/, 'collection-page-attending.html'],
    // A genre's page (2026-10-26, read from the page): roots rock, as
    // MusicBrainz sends it (debug/genre-initial.html, wrapped by
    // scripts/build-genre-overview-fixture.py).
    [/\/genre\/883d75d5-1365-46ee-8cbe-d3ae2facdd93\/?$/, 'rel-genre-overview.html'],
    // Phase 3f (scripts/probe-mb-docs-cdstub.py --fixtures, 2026-10-27): a
    // CD stub (11 tracks) and a documentation page (Style / Titles).
    [/\/cdstub\/\.0bu2pqNY67hHTrw09eWyhBPhsA-\/?$/, 'cdstub-blues-in-orbit.html'],
    [/\/doc\/Style\/Titles\/?$/, 'doc-style-titles.html'],
];
const WS2_FIXTURES = [
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-credits\+isrcs/, 'ws2-pop-recording-thunder.json'],
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-rels/, 'ws2-pop-recording-thunder-pin.json'],
    // The recording window's releases (Phase 3b): page 1 of the paged
    // browse, 100 of the studio "Thunder Road"'s 271 (probe 2026-10-27,
    // scripts/probe-mb-window-browses.py).
    [/\/ws\/2\/release\?recording=/, 'ws2-pop-recording-thunder-releases.json'],
    [/\/ws\/2\/work\/[0-9a-f-]{36}\?/, 'ws2-pop-work-btr.json'],
    [/\/ws\/2\/recording\?work=/, 'ws2-pop-work-btr-recordings.json'],
    [/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=genres/, 'ws2-pop-artist-bruce.json'],
    [/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=url-rels/, 'ws2-pop-artist-bruce-pin.json'],
    // The artist window's release groups of one type, paged (Phase 3b),
    // before the per-type counts (`limit=1`), whose pattern they also match.
    ...['album', 'single'].map(t => [
        new RegExp(`/ws/2/release-group\\?artist=[0-9a-f-]{36}&type=${t}&inc=artist-credits&limit=100&`), `ws2-pop-artist-bruce-rgs-${t}-p1.json`]),
    ...['album', 'single', 'ep', 'broadcast', 'other'].map(t => [
        new RegExp(`/ws/2/release-group\\?artist=[0-9a-f-]{36}&type=${t}&`), `ws2-pop-artist-bruce-rg-${t}.json`]),
    [/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=genres/, 'ws2-pop-label-columbia.json'],
    [/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=url-rels/, 'ws2-pop-label-columbia-pin.json'],
    [/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=artist-rels/, 'ws2-pop-label-columbia-more.json'],
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
    // An artist's, label's or place's window shows its Commons picture
    // (pop-mb-image.spec.js): served locally, so nothing reaches Wikimedia.
    await ctx.route(/^https:\/\/(?:commons|upload)\.wikimedia\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route('https://coverartarchive.org/**', (route) => {
        const u = new URL(route.request().url());
        // A release group's index too (a window table's cover, 2026-10-24):
        // the same record serves, it is only counted.
        if (/^\/(?:release|release-group)\/[0-9a-f-]{36}\/?$/.test(u.pathname)) {
            log.caa.push(u.pathname);
            return route.fulfill({ status: 200, contentType: 'application/json', body: json('caa-release-d0adda7e.json') });
        }
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    });
    await ctx.route(/\/ws\/2\/release\/[0-9a-f-]{36}\?/, (route) => {
        const url = route.request().url();
        log.lookups.push({ url, at: performance.now() });
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
    // Phase 3: edit, editor, tag, collection, genre, CD stub and
    // documentation pages, by URL (`pageFixture` may answer instead).
    await ctx.route(/^https:\/\/musicbrainz\.org\/(edit|user|tag|collection|genre|cdstub|doc)\//, (route) => {
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

    test('what is previewed: the bare entity page and a Relationships icon, not cover art or an image link', async ({ page }) => {
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
            // As `_relAppendIcon()` builds it: an image link, fully qualified.
            rel.innerHTML = `<a href="https://musicbrainz.org/release/${id}"><img alt=""><span class="mb-rel-filter-key">/release/${id}</span></a>`;
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
        // Since 2026-10-26 a Relationships icon to MusicBrainz is previewed,
        // as the column's links to other sites are (its image IS the link).
        expect(r.relCell, 'a Relationships icon is previewed').toBe(`mb-entity|release:${REL_ID}`);
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
        const t0 = performance.now();
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
        await expect(area.locator('[data-mb-tbl="tracks"] tbody tr')).toHaveCount(9);
        await expect(area.locator('[data-mb-tbl="tracks"] tbody tr').first().locator('a')).toHaveAttribute('href', /^\/recording\/[0-9a-f-]{36}$/);
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
        await expect(area.locator('[data-mb-tbl="tracks"] tbody tr')).toHaveCount(9);
    });

    // org/MB-POH-sync-withDiscogs.org Phase 3e (decided 2026-10-26): a table
    // per medium under a header that folds it, one filter for all mediums.
    test('the release window: a table per medium under a header "CD 2 · Bonus · 3 tracks · <length>", one filter, a medium folds', async ({ page }) => {
        const rel = JSON.parse(json('ws2-pop-release-greetings.json'));
        const second = JSON.parse(JSON.stringify(rel.media[0]));
        Object.assign(second, { position: 2, format: 'CD', title: 'Bonus', 'track-count': 3, tracks: second.tracks.slice(0, 3) });
        // One track by another credit: only this medium gets an Artist column.
        second.tracks[1]['artist-credit'] = [{ name: 'Bruce Springsteen', joinphrase: ' & ', artist: rel['artist-credit'][0].artist },
            { name: 'The E Street Band', joinphrase: '', artist: { id: 'd6652e7b-33fe-49ef-8336-4c863b4f996f', name: 'The E Street Band' } }];
        rel.media.push(second);
        const ms = (tr) => tr.length ?? tr.recording.length;
        const len = (t) => `${Math.floor(t / 60000)}:${String(Math.round(t / 1000) % 60).padStart(2, '0')}`;
        const sum2 = second.tracks.reduce((x, tr) => x + ms(tr), 0);
        await open(page, { settings: { sa_pop_mb: true }, lookup: () => ({ status: 200, body: JSON.stringify(rel) }) });
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        await page.keyboard.press('Space');
        const box = dialog(page).locator('[data-mb-tbl="tracks"]');
        const heads = box.locator('button.mb-pop-medhead');
        await expect(heads).toHaveText(['▾12" Vinyl 1 · 9 tracks · 36:59', `▾CD 2 · Bonus · 3 tracks · ${len(sum2)}`]);
        const tables = box.locator('table.mb-pop-medtable');
        await expect(tables.nth(0).locator('thead th')).toHaveText(['#', 'Title', 'Length']);
        await expect(tables.nth(1).locator('thead th')).toHaveText(['#', 'Title', 'Artist', 'Length']);
        await expect(tables.nth(1).locator('tbody tr').nth(1).locator('td').nth(2)).toHaveText('Bruce Springsteen & The E Street Band');
        await expect(tables.nth(1).locator('tbody tr').nth(0).locator('td').nth(2)).toHaveText('');
        // One filter for every medium; each header counts its matches.
        await box.locator('input.mb-tbl-q').fill('blinded');
        await expect(heads.nth(0)).toContainText('1 match');
        await expect(heads.nth(1)).toContainText('1 match');
        await expect(box.locator('tbody tr')).toHaveCount(2);
        await expect(box.locator('tbody mark.mb-dg-hl')).toHaveText(['Blinded', 'Blinded']);
        // A medium folds; the other stays.
        await box.locator('input.mb-tbl-q').fill('');
        await heads.nth(1).click();
        await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'false');
        await expect(tables).toHaveCount(1);
        await expect(box.locator('tbody tr')).toHaveCount(9);
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
        await expect(dialog(page).locator('[data-mb-tbl="rg-releases"] tbody tr').first()).toBeVisible();
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
        // The two names one under the other, only what differs marked
        // (the diff view, mockup https://claude.ai/artifact/7Nbqih988jfzpGxbiQTX75):
        // " (version 7)" in the track row, its spaces shown as "·", nothing
        // in the recording row.
        await expect(origin.locator('.mb-tt-cmp-lbl')).toHaveText(['Track name', '≠ Recording']);
        await expect(origin.locator('.mb-tt-cmp-val')).toHaveText(['Thunder Road·(version·7)', 'Thunder Road']);
        await expect(origin.locator('.mb-tt-cmp-val').first().locator('mark.mb-tt-cmp-d')).toHaveText(['·(version·7)']);
        await expect(origin.locator('.mb-tt-cmp-val').nth(1).locator('mark')).toHaveCount(0);
        await expect(origin.locator('.mb-tt-cmp-sum')).toHaveText('Only in the track name: (version·7)');
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
        // Its own tip keeps the sentence as the native text; the rich card
        // compares the two names.
        await expect(badge).toHaveAttribute('title', 'Opened from a track named “Thunder Road (version 7)”; its recording is named “Thunder Road”.');
        const badgeCard = await badge.evaluate((b) => window.__saTest.tipTextToHtml(b.title, b));
        expect(badgeCard).toContain('<div class="mb-tt-title">Opened from a track whose name differs from its recording</div>');
        expect(badgeCard).toContain('<mark class="mb-tt-cmp-d">');
        // Right after the title, before the controls.
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Recording');
        expect(await badge.evaluate((b) => b.previousElementSibling === b.parentElement.querySelector(':scope > span'))).toBe(true);
        await expect(origin).toBeHidden();
        await expect(a).toHaveAttribute('title', NOTE);
    });

    test('control: a recording link whose title only repeats its name: no box, no badge, the title parked and given back', async ({ page }) => {
        // Pins (org/TODO.org "stacking multiple rich tooltips", WIP.1):
        // MusicBrainz titles a recording link that has a disambiguation with
        // its bare name. While the card shows the title is parked (else the
        // browser draws "Thunder Road" over the card), and since it says
        // nothing the card does not, it gets no box of its own.
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await a.evaluate((el) => el.setAttribute('title', 'Thunder Road'));
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(page.locator('#mb-dp-origin')).toHaveCount(0);
        await expect(page.locator('#mb-dp-notes')).toBeHidden();
        await expect(a).not.toHaveAttribute('title', /./);
        await expect(a).toHaveAttribute('data-mb-dp-saved-title', 'Thunder Road');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).locator(':scope > div > .mb-dp-origin')).toBeHidden();
        await expect(a).toHaveAttribute('title', 'Thunder Road');
        await expect(a).not.toHaveAttribute('data-mb-dp-saved-title', /.*/);
    });

    test('the recording window: credits and its releases as a paged list, each asked once; ⟳ asks all again', async ({ page }) => {
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
        // Every release, a paged browse (Phase 3b): page 1 when the window
        // opens, no longer the lookup's first 25 and a count.
        await expect(area.locator('h4', { hasText: 'Releases' })).toHaveText('Releases · 271');
        await expect(area.locator('.mb-dg-counts').first()).toHaveText('100 of 271 loaded · one segment = 100 releases');
        await expect(area.locator('[data-mb-tbl="recording-releases"] tbody tr')).toHaveCount(100);
        await expect(area.getByRole('button', { name: 'Load 2 more pages (171 releases, about 2 s)' })).toBeVisible();
        expect(recLookups(log)).toHaveLength(1);
        expect(recCredits(log)).toEqual([expect.stringContaining('inc=artist-rels+place-rels+event-rels')]);
        expect(recCounts(log)).toEqual([expect.stringContaining(`release?recording=${REC_ID}&inc=media+labels&limit=100&offset=0&fmt=json`)]);

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

    test('the recording window\'s releases: covers only where the archive has a front, status chips, by date at first', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const tbl = dialog(page).locator('[data-mb-tbl="recording-releases"]');
        const rows = tbl.locator('tbody tr');
        await expect(rows).toHaveCount(100, { timeout: 15000 });
        // 97 of the 100 carry cover-art-archive.front (probe 2026-10-27): the
        // other three get the empty box and no request.
        await expect(tbl.locator('tbody img.mb-dg-vthumb')).toHaveCount(97);
        await expect(tbl.locator('tbody .mb-dg-nothumb')).toHaveCount(3);
        // The browse's order is by no date: the table starts sorted by Date.
        const date = tbl.locator('th[data-mb-tbl-sort="date"]');
        await expect(date).toHaveAttribute('aria-sort', 'ascending');
        const dates = (await rows.locator('td:nth-child(4)').allTextContents()).filter(d => d !== '—');
        expect(dates).toEqual([...dates].sort());
        // Status chips: one keeps only its rows.
        const chips = tbl.locator('.mb-dg-fc[data-mb-tbl-chip]');
        await expect(chips).toHaveCount(3);
        const boot = tbl.locator('.mb-dg-fc[data-mb-tbl-chip="Bootleg"]');
        const n = Number(await boot.locator('.mb-dg-n').textContent());
        await boot.click();
        await expect(rows).toHaveCount(n);
        expect(new Set(await rows.locator('td:nth-child(6)').allTextContents())).toEqual(new Set(['Bootleg']));
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

    // The work's recordings as the shared List table with the MusicBrainz
    // paged loader (org/MB-POH-sync-withDiscogs.org, Phase 2). Pages past
    // the first are the fixture's 100 rows with ids and titles of their
    // own, so the offsets can be told apart. With `short`, the page at
    // offset 100 holds 60 rows (as a release browse past its 500-track
    // cap would), so the next offset must be 160, not 200.
    const recPage = (offset, short = false) => {
        const d = JSON.parse(json('ws2-pop-work-btr-recordings.json'));
        d['recording-offset'] = offset;
        if (offset) {
            d.recordings = d.recordings.map((r, i) => Object.assign({}, r, {
                id: `00000000-0000-4000-8000-${String(offset + i).padStart(12, '0')}`, title: `${r.title} #${offset + i}`,
            }));
        }
        if (short && offset === 100) d.recordings = d.recordings.slice(0, 60);
        return d;
    };
    const recOffsets = log => log.ws2.filter(u => u.includes('/ws/2/recording?work=')).map(u => Number(/[?&]offset=(\d+)/.exec(u)[1]));

    /**
     * Opens the work's window, its recording browse answered by `recPage()`
     * unless `failAt()` names the offset (HTTP 400, not retried).
     *
     * @param {import('@playwright/test').Page} page
     * @param {function(): number} [failAt]
     * @param {boolean} [short] - As `recPage()`.
     * @returns {Promise<{log: Object, area: import('@playwright/test').Locator}>}
     */
    async function openWorkWindow(page, failAt = () => -1, short = false) {
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => {
                const m = /\/ws\/2\/recording\?work=.*[?&]offset=(\d+)/.exec(url);
                if (!m) return null;
                const off = Number(m[1]);
                return off === failAt() ? { status: 400, body: '{"error":"planted"}' } : { status: 200, body: JSON.stringify(recPage(off, short)) };
            },
        });
        const a = await addLink(page, `/work/${WORK_ID}`, 'Born to Run');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        return { log, area: dialog(page).locator('.mb-dp-area') };
    }

    test('the work window: page 1 of its recordings on Space, then 5 pages a click, offset by the rows returned; Show all', async ({ page }) => {
        const { log, area } = await openWorkWindow(page, () => -1, true);
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Work');
        const rows = area.locator('[data-mb-tbl="work-recordings"] tbody tr');
        await expect(area.locator('h4', { hasText: 'Recordings' })).toHaveText('Recordings · 2,226');
        await expect(area.locator('.mb-dg-counts').first()).toHaveText('100 of 2,226 loaded · one segment = 100 recordings');
        await expect(rows).toHaveCount(100);
        await expect(rows.first().locator('a')).toHaveAttribute('href', /^\/recording\/[0-9a-f-]{36}$/);
        await expect(area.locator('h4', { hasText: 'Codes' })).toBeVisible();
        expect(log.ws2.filter(u => u.includes('/ws/2/recording?work=')), 'page 1 only, from the window').toEqual([
            expect.stringContaining(`recording?work=${WORK_ID}&inc=artist-credits&limit=100&offset=0&fmt=json`),
        ]);

        const more = area.getByRole('button', { name: 'Load 5 more pages (500 recordings, about 6 s)' });
        await more.click();
        // Page 2 held 60 rows: the next offset is 160, and nothing is skipped.
        await expect(area.locator('.mb-dg-counts').first()).toHaveText('560 of 2,226 loaded · one segment = 100 recordings', { timeout: 20000 });
        expect(recOffsets(log), 'the batch, offset by the rows returned, and no page more').toEqual([0, 100, 160, 260, 360, 460]);
        await expect(area.locator('.mb-dg-pill').first()).toHaveText('Idle');
        await expect(area.getByRole('button', { name: 'Load 5 more pages (500 recordings, about 6 s)' })).toBeVisible();
        // 200 rows, then all of them.
        await expect(rows).toHaveCount(200);
        await area.getByRole('button', { name: 'Show all 560' }).click();
        await expect(rows).toHaveCount(560);
        await expect(rows.nth(559)).toContainText('#559');
    });

    test('the work window: Stop ends a run with the page under way; a failed page keeps what loaded and "Try again" asks it; IndexedDB after a reload', async ({ page }) => {
        let fail = -1;
        const { log, area } = await openWorkWindow(page, () => fail);
        await expect(area.locator('.mb-dg-counts').first()).toHaveText(/^100 of 2,226 loaded/);
        await area.getByRole('button', { name: /^Load 5 more pages/ }).click();
        await area.getByRole('button', { name: 'Stop' }).click();
        await expect(area.locator('.mb-dg-pill').first()).toHaveText('Idle', { timeout: 10000 });
        const asked = recOffsets(log).length;
        expect(asked, 'at most the page under way after Stop').toBeLessThanOrEqual(2);
        const grew = await expect.poll(() => recOffsets(log).length, { timeout: 2500, intervals: [250] })
            .toBeGreaterThan(asked).then(() => true, () => false);
        expect(grew, 'no page after Stop').toBe(false);
        const loaded = asked * 100;

        // A page that fails: the rows stay, the run ends, the button asks that page.
        fail = loaded;
        await area.getByRole('button', { name: /^Load 5 more pages/ }).click();
        await expect(area.locator('.mb-dg-pill').first()).toHaveText('Done with errors', { timeout: 10000 });
        await expect(area.locator('.mb-dg-counts').first()).toContainText(`${loaded} of 2,226 loaded`);
        await expect(area.locator('.mb-dg-bar i.mb-dg-seg-failed')).toHaveCount(1);
        fail = -1;
        await area.getByRole('button', { name: `Try page ${asked + 1} again (1 request, about 1 s)` }).click();
        await expect(area.locator('.mb-dg-counts').first()).toHaveText(`${loaded + 100} of 2,226 loaded · one segment = 100 recordings`, { timeout: 10000 });
        expect(recOffsets(log).slice(asked), 'the failed offset, then the same offset again').toEqual([loaded, loaded]);

        await reloadScript(page);
        const before = log.ws2.length;
        const a = await addLink(page, `/work/${WORK_ID}`, 'Born to Run');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('Born to Run');
        await page.keyboard.press('Space');
        await expect(area.locator('.mb-dg-counts').first())
            .toHaveText(`${loaded + 100} of 2,226 loaded · ${loaded + 100} from cache · one segment = 100 recordings`);
        await expect(area.locator('.mb-dg-bar i.mb-dg-seg-cache')).toHaveCount(asked + 1);
        expect(recOffsets({ ws2: log.ws2.slice(before) }), 'nothing asked again').toEqual([]);
    });

    test('the work window: the filter keeps its focus, a chip per artist (Ctrl adds one), three sort states with ⇅', async ({ page }) => {
        const { area } = await openWorkWindow(page);
        const tbl = area.locator('[data-mb-tbl="work-recordings"]');
        const rows = tbl.locator('tbody tr');
        await expect(rows).toHaveCount(100);
        const initial = await rows.locator('td:first-child').allTextContents();
        // The filter: every row it keeps marks what it matched.
        const q = tbl.locator('input.mb-tbl-q');
        await q.fill('live');
        await expect(q).toBeFocused();
        const n = await rows.count();
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(100);
        await expect(rows.filter({ has: page.locator('mark.mb-dg-hl') })).toHaveCount(n);
        await tbl.getByRole('button', { name: 'Clear filters' }).click();
        await expect(rows).toHaveCount(100);
        // Chips: the most frequent credit first; one keeps only its rows,
        // Ctrl adds the second.
        const chips = tbl.locator('.mb-dg-fc[data-mb-tbl-chip]');
        const [a1, a2] = [await chips.nth(0).getAttribute('data-mb-tbl-chip'), await chips.nth(1).getAttribute('data-mb-tbl-chip')];
        const n1 = Number((await chips.nth(0).locator('.mb-dg-n').textContent()).replace(/,/g, ''));
        const n2 = Number((await chips.nth(1).locator('.mb-dg-n').textContent()).replace(/,/g, ''));
        await chips.nth(0).click();
        await expect(rows).toHaveCount(n1);
        expect(new Set(await rows.locator('td:nth-child(2)').allTextContents())).toEqual(new Set([a1]));
        await tbl.locator(`.mb-dg-fc[data-mb-tbl-chip="${a2}"]`).click({ modifiers: ['Control'] });
        await expect(rows).toHaveCount(n1 + n2);
        await expect(tbl.locator('.mb-dg-fc[aria-pressed="true"]')).toHaveCount(2);
        await tbl.getByRole('button', { name: 'Clear filters' }).click();
        await expect(rows).toHaveCount(100);
        // 30 credits: the first 10, then "+20 more" shows them all.
        await expect(chips).toHaveCount(10);
        await tbl.getByRole('button', { name: '+20 more' }).click();
        await expect(chips).toHaveCount(30);
        await tbl.getByRole('button', { name: 'Fewer' }).click();
        await expect(chips).toHaveCount(10);
        // Length: ascending, descending, then the Web Service's order again.
        const th = tbl.locator('th[data-mb-tbl-sort="length"]');
        await expect(th).toHaveAttribute('aria-sort', 'none');
        const ms = async () => (await rows.locator('td:nth-child(3)').allTextContents()).filter(s => s !== '—')
            .map(s => s.split(':').reduce((acc, x) => acc * 60 + Number(x), 0));
        await th.click();
        await expect(th).toHaveAttribute('aria-sort', 'ascending');
        const up = await ms();
        expect(up).toEqual([...up].sort((x, y) => x - y));
        await th.click();
        await expect(th).toHaveAttribute('aria-sort', 'descending');
        const down = await ms();
        expect(down).toEqual([...down].sort((x, y) => y - x));
        await th.click();
        await expect(th).toHaveAttribute('aria-sort', 'none');
        await expect(rows.locator('td:first-child'), 'the Web Service\'s own order').toHaveText(initial);
        expect(await th.evaluate(el => getComputedStyle(el, '::after').content)).toBe('" ⇅"');
    });
});

test.describe('MusicBrainz link previews: the note stack and the entity glyphs (WIP.1)', () => {
    // org/TODO.org "stacking multiple rich tooltips". Pins:
    //   - a cell's own tip (a finding, "no work": `data-mb-tip` on the
    //     `<td>`) is a box ABOVE the card, never `#mb-stat-tooltip` beside or
    //     under it — whichever of the two shows first — and comes back as its
    //     card once the preview card is gone and the pointer is still there;
    //   - every box of the stack sits above the card, none overlaps another,
    //     all share the card's left edge; the cell's tip on top, the link's
    //     note under it;
    //   - an artist link's MusicBrainz title (its sort name) is parked and
    //     comes back when the card closes; since 2026-10-28 it is no box: the
    //     card's first row is the sort name (a label's title, its
    //     disambiguation, is no box either); any other link title still is;
    //   - MusicBrainz's entity glyph sits in front of the card's title and of
    //     the window's kind, and a kind without a glyph (ISRC) has none.
    // Mutation list: scripts/mutations/gpe-art-viewer.json.
    const ARTIST = '/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
    const TIP = '⚠️ Pending edits';
    const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>';
    const stack = (page) => page.locator('#mb-dp-notes');
    const statTip = (page) => page.locator('#mb-stat-tooltip');
    /** A stacked box's text without its kind line. */
    const boxBody = (box) => box.evaluate((el) => Array.from(el.childNodes)
        .filter((n) => !(n.classList && n.classList.contains('mb-pop-kind-head'))).map((n) => n.textContent).join(''));
    /** A stacked box's kind line: its text and its hairline. */
    const boxHead = (box) => box.locator(':scope > .mb-pop-kind-head').evaluate((el) => {
        const cs = getComputedStyle(el);
        return [el.textContent, `${cs.borderBottomWidth} ${cs.borderBottomStyle}`];
    });

    /**
     * Gives the cell holding `a` its own tip, as `_setTip()` writes one.
     *
     * @param {import('@playwright/test').Locator} a
     * @param {string} text
     * @returns {Promise<void>}
     */
    async function tipCell(a, text) {
        await a.evaluate((el, t) => {
            const td = el.closest('td');
            td.setAttribute('data-mb-tip', '');
            td.setAttribute('title', t);
        }, text);
    }

    test.beforeEach(async ({ page }) => {
        await page.context().route('**/static/images/entity/*.svg', (route) =>
            route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }));
    });

    test('the cell\'s tip, shown first: Ctrl moves it into the stack above the card; Esc gives the cell its card back', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await tipCell(a, TIP);
        // A plain hover: the Ctrl gate holds the preview back, the cell's
        // own card shows.
        await page.mouse.move(0, 0);
        await a.hover();
        await expect(statTip(page)).toBeVisible();
        await expect(statTip(page)).toContainText('Pending edits');
        await page.keyboard.down('Control');
        await page.keyboard.up('Control');
        await expect(card(page)).toContainText('fetched now');
        await expect(statTip(page)).toBeHidden();
        await expect(stack(page).locator('.mb-dp-note')).toHaveCount(1);
        await expect(stack(page).locator('.mb-dp-note-tip')).toContainText('Pending edits');
        const sb = await stack(page).boundingBox();
        const cb = await card(page).boundingBox();
        expect(Math.abs((sb.y + sb.height + 4) - cb.y)).toBeLessThan(1.5);
        expect(Math.abs(sb.x - cb.x)).toBeLessThan(1);
        await page.keyboard.press('Escape');
        await expect(card(page)).toBeHidden();
        await expect(stack(page)).toBeHidden();
        await expect(statTip(page)).toBeVisible();
        await expect(statTip(page)).toContainText('Pending edits');
    });

    test('the cell\'s tip, card first: no "Liner notes" card at all, the tip parked and given back', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await tipCell(a, TIP);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(stack(page).locator('.mb-dp-note-tip')).toContainText('Pending edits');
        await expect(statTip(page)).toBeHidden();
        // No native box either: the cell's title is held while the card shows.
        expect(await a.evaluate((el) => el.closest('td').getAttribute('title') || '')).toBe('');
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        expect(await a.evaluate((el) => el.closest('td').getAttribute('title'))).toBe(TIP);
    });

    test('the Title cell\'s track/recording finding gives its label alone above the note box, which compares the names', async ({ page }) => {
        // Pins `_dpCollectNotes()`'s `noOrigin`: the finding's comparison is
        // the note box's, so the stack shows it once (the diff view, mockup
        // https://claude.ai/artifact/7Nbqih988jfzpGxbiQTX75). The cell's own
        // card, which does compare them, is tooltip-diff.spec.js's.
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road (version 7)');
        await a.evaluate((el) => el.setAttribute('title', 'track name: Thunder Road (version 7)\n≠rec. name: Thunder Road'));
        const tipText = '⚠️ Track name differs from recording name: track "Thunder Road (version 7)", recording "Thunder Road"';
        await a.evaluate((el, t) => {
            const td = el.closest('td');
            td.setAttribute('data-mb-tip', '');
            td.setAttribute('title', t);
            td.setAttribute('data-mb-tip-cmp', JSON.stringify({ t, c: [{
                at: 0, head: '⚠️ Track name differs from recording name', origin: true,
                la: 'Track name', lb: 'Recording', sb: 'recording name', a: 'Thunder Road (version 7)', b: 'Thunder Road',
            }] }));
        }, tipText);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(stack(page).locator('.mb-dp-note-tip > .mb-pop-kind-head')).toHaveText('Note');
        expect(await boxBody(stack(page).locator('.mb-dp-note-tip'))).toBe('⚠️ Track name differs from recording name');
        await expect(stack(page).locator('.mb-dp-note-tip .mb-tt-cmp')).toHaveCount(0);
        await expect(stack(page).locator('#mb-dp-origin mark.mb-tt-cmp-d')).toHaveText(['·(version·7)']);
    });

    test('a cell tip and the track/recording note: two boxes above the card, cell first, apart, aligned', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road (version 7)');
        await a.evaluate((el) => el.setAttribute('title', 'track name: Thunder Road (version 7)\n≠rec. name: Thunder Road'));
        await tipCell(a, '⚠️ Track name differs from recording name');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        const notes = stack(page).locator('.mb-dp-note');
        await expect(notes).toHaveCount(2);
        await expect(notes.nth(0)).toHaveClass(/mb-dp-note-tip/);
        await expect(notes.nth(1)).toHaveAttribute('id', 'mb-dp-origin');
        // Each box opens with its kind line and its hairline, as the card.
        expect(await boxHead(notes.nth(0))).toEqual(['Note', '1px solid']);
        expect(await boxHead(notes.nth(1))).toEqual(['Track ≠ recording', '1px solid']);
        await expect(statTip(page)).toBeHidden();
        const b0 = await notes.nth(0).boundingBox();
        const b1 = await notes.nth(1).boundingBox();
        const cb = await card(page).boundingBox();
        expect(b0.y + b0.height).toBeLessThanOrEqual(b1.y + 0.5);
        expect(b1.y + b1.height).toBeLessThanOrEqual(cb.y + 0.5);
        expect(Math.abs(b0.x - cb.x)).toBeLessThan(1);
        expect(Math.abs(b1.x - cb.x)).toBeLessThan(1);
    });

    // vzell 2026-10-28 (mockup variant B): the sort name is the card's
    // first row, and the link's MusicBrainz title — which said it — is no
    // box of its own any more. Until then it was a "Link title" box headed
    // "Sort name", for a label too, whose title is its disambiguation.
    const kvRows = (page) => card(page).locator('dl.mb-dp-kv > dt').allTextContents();

    test('an artist link\'s sort name: the card\'s first row, no Link-title box; its title parked, given back on Esc', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, ARTIST, 'Bruce Springsteen');
        await a.evaluate((el) => el.setAttribute('title', 'Springsteen, Bruce'));
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        expect((await kvRows(page))[0]).toBe('Sort name');
        await expect(card(page).locator('dl.mb-dp-kv > dd').first()).toHaveText('Springsteen, Bruce');
        await expect(stack(page).locator('.mb-dp-note-title'), 'the card says it: no box').toHaveCount(0);
        await expect(a).not.toHaveAttribute('title', /./);
        await page.keyboard.press('Escape');
        await expect(card(page)).toBeHidden();
        await expect(a).toHaveAttribute('title', 'Springsteen, Bruce');
    });

    test('a sort name that is the name has no row', async ({ page }) => {
        const same = JSON.parse(json('ws2-pop-artist-bruce.json'));
        same['sort-name'] = same.name;
        await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=genres/.test(url) ? { status: 200, body: JSON.stringify(same) } : null),
        });
        const a = await addLink(page, ARTIST, 'Bruce Springsteen');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        expect(await kvRows(page)).not.toContain('Sort name');
    });

    test('a label link\'s title (its disambiguation) is no "Sort name" box; the card shows the disambiguation', async ({ page }) => {
        const COMMENT = 'owned by Sony Music Entertainment, worldwide except JP; formerly owned by CBS between 1938–1990 within US/CA/MX';
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, '/label/011d1192-6f65-45bd-85c4-0400dd45693e', 'Columbia');
        await a.evaluate((el, c) => el.setAttribute('title', c), COMMENT);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(stack(page).locator('.mb-dp-note-title')).toHaveCount(0);
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText(COMMENT);
        expect(await kvRows(page), 'a label\'s sort name is its name').not.toContain('Sort name');
    });

    test('another link\'s own title is still a "Link title" box', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await a.evaluate((el) => el.setAttribute('title', 'live, 1975-10-18'));
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        const box = stack(page).locator('.mb-dp-note-title');
        await expect(box).toBeVisible();
        await expect(box).toContainText('live, 1975-10-18');
        expect(await boxHead(box)).toEqual(['Link title', '1px solid']);
        await expect(box.locator('dt')).toHaveCount(0);
    });

    test('the kind line: glyph and kind on top of the card (loaded and failed), the window\'s kind; no glyph for an ISRC', async ({ page }) => {
        let fail = false;
        await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (fail && url.includes('/ws/2/work/') ? { status: 500, body: '{}' } : null),
        });
        const head = () => card(page).locator(':scope > .mb-pop-kind-head');
        const a = await addLink(page, `/recording/${REC_ID}`, 'Thunder Road');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        // The card's FIRST child, once, after the loading paint was repainted.
        await expect(head()).toHaveCount(1);
        await expect(card(page).locator(':scope > :first-child')).toHaveClass('mb-pop-kind-head');
        await expect(head()).toHaveText('Recording');
        const icon = head().locator(':scope > img.mb-pop-kind-icon:first-child');
        await expect(icon).toHaveAttribute('src', /\/static\/images\/entity\/recording\.svg$/);
        await expect(card(page).locator('.mb-tt-title img'), 'the glyph moved out of the title').toHaveCount(0);
        // A hairline under the line, as under the window's title bar.
        const rule = await head().evaluate((el) => {
            const cs = getComputedStyle(el);
            return `${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor} ${cs.paddingBottom}`;
        });
        expect(rule, 'the kind line\'s hairline').toBe('1px solid rgb(217, 207, 189) 5px');
        await page.keyboard.press('Space');
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title, 'the card and the window name the same kind').toHaveText('Recording');
        // Since the path (org/POH-headerline.org): the glyph is the step's,
        // a link to the kind's documentation before its button.
        await expect(title.locator(':scope > .mb-dp-crumb > a.mb-dp-crumb-g:first-child > img.mb-dp-kind-icon')).toHaveAttribute('src', /\/recording\.svg$/);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();

        // A failed card has the line too (the shell, not the kind's HTML),
        // and the shell no longer repeats the kind below the title.
        fail = true;
        const w = await addLink(page, `/work/${WORK_ID}`, 'Born to Run');
        await ctrlHover(page, w);
        await expect(card(page)).toContainText('Could not load it');
        await expect(head()).toHaveText('Work');
        await expect(head().locator('img.mb-pop-kind-icon')).toHaveAttribute('src', /\/work\.svg$/);
        await expect(card(page).locator('.mb-tt-comment', { hasText: /^Work$/ })).toHaveCount(0);

        const i = await addLink(page, '/isrc/USSM17500803', 'USSM17500803');
        await ctrlHover(page, i);
        await expect(card(page)).toContainText('fetched now');
        await expect(head(), 'a kind without a glyph still names itself').toHaveText('ISRC');
        await expect(card(page).locator('img.mb-pop-kind-icon')).toHaveCount(0);
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
        // A segment per primary type with its real total (the five counts),
        // the first one's release groups as a paged List table (Phase 3b,
        // vzell 2026-10-27: type segments, lazy covers).
        const tbl = area.locator('[data-mb-tbl="artist-release-groups"]');
        const segs = tbl.locator('[data-mb-tbl-act="seg"]');
        await expect(segs).toHaveText(['Album 1,924', 'Single 177', 'EP 28', 'Broadcast 6', 'Other 10'], { timeout: 15000 });
        await expect(segs.first()).toHaveAttribute('aria-pressed', 'true');
        await expect(tbl.locator('tbody tr')).toHaveCount(100);
        await expect(area.locator('.mb-dg-counts').first()).toHaveText('100 of 1,924 loaded · one segment = 100 release groups');
        // A Compact table since Phase 3d: all 75, 25 a page.
        await expect(area.locator('[data-mb-tbl="links"] .mb-dg-pager span')).toHaveText('1–25 of 75');
        await expect(area.locator('[data-mb-tbl="links"] tbody tr')).toHaveCount(25);
        expect(log.ws2.filter(u => u.includes('inc=url-rels'))).toHaveLength(1);
        const rgAsked = () => log.ws2.filter(u => u.includes('/ws/2/release-group?artist='));
        expect(rgAsked().filter(u => u.includes('&limit=1&')), 'the five counts').toHaveLength(5);
        expect(rgAsked().filter(u => u.includes('&limit=100&')), 'page 1 of the albums only')
            .toEqual([expect.stringContaining('&type=album&inc=artist-credits&limit=100&offset=0')]);
        // Chips: the secondary types of what is loaded.
        await expect(tbl.locator('.mb-dg-fc[data-mb-tbl-chip="Live"]')).toBeVisible();
        // Another segment: its own list, its page 1 asked on the click.
        await segs.nth(1).click();
        await expect(segs.nth(1)).toHaveAttribute('aria-pressed', 'true');
        await expect(area.locator('.mb-dg-counts').first()).toHaveText('100 of 178 loaded · one segment = 100 release groups', { timeout: 15000 });
        expect(rgAsked().filter(u => u.includes('&limit=100&'))).toEqual([
            expect.stringContaining('&type=album&inc=artist-credits&limit=100&offset=0'),
            expect.stringContaining('&type=single&inc=artist-credits&limit=100&offset=0'),
        ]);
        // Back to Album: from memory, nothing asked.
        await segs.first().click();
        await expect(area.locator('.mb-dg-counts').first()).toHaveText(/^100 of 1,924 loaded/);
        expect(rgAsked().filter(u => u.includes('&limit=100&'))).toHaveLength(2);
    });

    test('the artist window\'s release groups: covers asked lazily, a missing one gives way to the empty box', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        // No archive has these: every release-group cover answers 404.
        await page.route(/^https:\/\/coverartarchive\.org\/release-group\/[0-9a-f-]{36}\/front-250$/, (route) => route.fulfill({ status: 404, body: '' }));
        await ctrlHover(page, artistLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const tbl = dialog(page).locator('.mb-dp-area [data-mb-tbl="artist-release-groups"]');
        await expect(tbl.locator('tbody tr')).toHaveCount(100, { timeout: 15000 });
        // The first rows are in view: their covers were asked, failed, and
        // left the 42 px box, the row as high as before.
        const first = tbl.locator('tbody tr').first();
        await expect(first.locator('td:first-child .mb-dg-nothumb')).toHaveCount(1);
        await expect(first.locator('td:first-child a.mb-pop-cover-thumb')).toHaveCount(0);
        const box = await first.locator('td:first-child .mb-dg-nothumb').boundingBox();
        expect([box.width, box.height]).toEqual([42, 42]);
    });

    // vzell 2026-10-27: the artist window's genres and aliases one per line
    // (genres as their tags, most votes first; an alias's type and locale dimmed).
    test('the artist window: genres one per line as tag links, aliases one per line', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, artistLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const facts = dialog(page).locator('.mb-dp-area h4:text-is("Facts") + .mb-dp-kv');
        const genres = facts.locator('dt:text-is("Genres") + dd a');
        await expect(genres).toHaveCount(13);
        // Most votes first: rock (more than americana's 8).
        await expect(genres.first()).toHaveText('rock');
        await expect(genres.first()).toHaveAttribute('href', '/tag/rock');
        expect(await facts.locator('dt:text-is("Genres") + dd br').count()).toBe(12);
        const aliases = facts.locator('dt:text-is("Aliases") + dd');
        expect(await aliases.locator('br').count(), 'five aliases, one per line').toBe(4);
        await expect(aliases).toContainText('The Boss (Artist name, en)');
        await expect(aliases.locator('.mb-rg-dim').first()).toHaveText('(Legal name)');
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

    // org/MB-POH-sync-withDiscogs.org Phase 3c (decision of 2026-10-26):
    // Ctrl/⌘-click on a tag link in the window opens the reader's OWN tag
    // there; logged out it keeps the link's new tab.
    test('the label window: genres one per line as tag links; Ctrl-click opens your own tag, logged in only', async ({ page }) => {
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: (u) => (/\/user\/vzell\/tag\//.test(u) ? 'user-tag-page-vzell-live.html' : null),
        });
        // No new tab in the test: the link's own Ctrl-click is cancelled
        // ahead of everything (the window's drill does not look at it).
        await page.evaluate(() => document.addEventListener('click', (e) => { if (e.ctrlKey) e.preventDefault(); }, true));
        await ctrlHover(page, labelLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title).toHaveText('Label');
        const genres = dialog(page).locator('.mb-dp-area .mb-dp-kv dt:text-is("Genres") + dd a');
        // All seven, most votes first (ties in the Web Service's order).
        await expect(genres).toHaveText(['alternative rock', 'indie rock', 'psychedelic rock', 'rock', 'folk rock', 'heartland rock', 'hip hop']);
        await expect(genres.first()).toHaveAttribute('href', '/tag/alternative%20rock');
        const first = (await genres.first().getAttribute('href')).split('/')[2];
        // Logged out: no drill, nothing asked.
        await genres.first().click({ modifiers: ['Control'] });
        const asked = () => log.html.filter(u => u.includes('/user/'));
        const any = await expect.poll(() => asked().length, { timeout: 1500, intervals: [250] }).toBeGreaterThan(0).then(() => true, () => false);
        expect(any, 'logged out, Ctrl-click asks for no editor\'s tag').toBe(false);
        await expect(title).toHaveText('Label');
        const foot = dialog(page).locator('.mb-dp-wfoot');
        await page.mouse.move(0, 0);
        await expect(foot, 'logged out: no such key').not.toContainText('your own tag');
        // Logged in (MusicBrainz's header names the editor): the own tag here.
        await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin',
            '<div class="header" id="test-header"><ul class="menu"><li class="account"><ul><li><a href="/user/vzell">Profile</a></li></ul></li></ul></div>'));
        await genres.first().hover();
        await expect(foot).toContainText('Ctrl-click: your own tag');
        // At rest the line says the key exists (vzell 2026-10-27).
        await page.mouse.move(0, 0);
        await expect(foot).toContainText('Ctrl-click a tag or genre: your own tag');
        await genres.first().click({ modifiers: ['Control'] });
        await expect(title).toHaveText('Label › Editor\'s tag');
        // Its page after a rate slot (then its own list's kind page).
        await expect.poll(() => asked()[0]).toBe(`https://musicbrainz.org/user/vzell/tag/${first}`);
    });

    test('the window\'s foot line at rest names Ctrl-click on a tag once the window holds one, without a hover', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin',
            '<div class="header" id="test-header"><ul class="menu"><li class="account"><ul><li><a href="/user/vzell">Profile</a></li></ul></li></ul></div>'));
        await ctrlHover(page, labelLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await page.mouse.move(0, 0);
        await expect(dialog(page).locator('.mb-dp-area .mb-dp-kv dt:text-is("Genres") + dd a').first()).toBeVisible();
        await expect(dialog(page).locator('.mb-dp-wfoot')).toContainText('Ctrl-click a tag or genre: your own tag');
    });

    test('the label card and window: label code, related labels by direction, the release count', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, labelLink(page));
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toContainText(['Imprint', 'LC 00162', 'United States', '1887 –']);
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/label/011d1192-6f65-45bd-85c4-0400dd45693e?inc=genres+ratings+aliases&fmt=json')]);
        // The card's fields since 2026-10-26 (org/discogs.org 4b): Founded and
        // the label code as rows too (Columbia has no IPI, ISNI or rating).
        await expect(card(page).locator('.mb-dp-kv dt')).toContainText(['Founded', 'Label code', 'Genres', 'Also known as']);
        await expect(card(page).locator('.mb-dp-kv')).toContainText('LC 00162');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        // The window's facts, and its people, places and series (one more
        // lookup; 14 recording contracts capped at 12, "+2 more").
        await expect(area.locator('.mb-dp-kv').first().locator('dt')).toContainText(['Area', 'Founded', 'Label code', 'Releases']);
        const more = area.locator('h4:text-is("People, places and series") + .mb-dp-kv');
        await expect(more).toContainText('Artist 12');
        await expect(more).not.toContainText('Artist 13');
        await expect(more).toContainText('+2 more');
        await expect(more).toContainText('Founder 01');
        await expect(more).toContainText('Studio 01');
        await expect(more).toContainText('Series 01');
        expect(log.ws2.filter(u => u.includes('inc=artist-rels+place-rels+series-rels'))).toHaveLength(1);
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
        // A Compact table since Phase 3d: one row per relation.
        const related = dialog(page).locator('[data-mb-tbl="areas"]');
        const rels = await related.locator('tbody td:first-child').allTextContents();
        expect(rels.filter(x => x === 'Parts'), 'its 21 counties').toHaveLength(21);
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
        // Compact tables since Phase 3d: one row per relation; the aliases
        // with locale, type and primary.
        const groups = await area.locator('[data-mb-tbl="instruments"] tbody td:first-child').allTextContents();
        expect([...new Set(groups)].sort()).toEqual(['Hybrids', 'Part of', 'Subtypes']);
        await expect(area.locator('h4', { hasText: 'Aliases' })).toHaveText('Aliases · 27');
        await expect(area.locator('[data-mb-tbl="aliases"] thead th')).toHaveText([/^Alias/, /^Locale/, /^Type/, /^Primary/]);
        await expect(area.locator('[data-mb-tbl="aliases"] .mb-dg-pager span')).toHaveText('1–25 of 27');
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
        // A List table since Phase 3e: # · Song · Notes.
        const songs = area.locator('[data-mb-tbl="setlist"] tbody tr');
        await expect(songs.last()).toContainText('Chimes of Freedom');
        await expect(songs.filter({ hasText: /\[|\]/ })).toHaveCount(0);
        // Two Compact tables since Phase 3d: its releases, its recordings.
        await expect(area.locator('[data-mb-tbl="recorded-releases"] tbody td:first-child').first()).toHaveText('Recorded at');
        await expect(area.locator('[data-mb-tbl="recorded-recordings"] .mb-dg-pager span')).toHaveText('1–25 of 26');
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

    // vzell, 2026-10-29 (debug/mb-event-soundcheck-concert-POH.html): a
    // setlist with a soundcheck numbered 1–26 in one run, "Soundcheck" and
    // "Concert" as loose notes under the table. Mockup A1. The Manchester
    // capture has the same shape: "# Soundcheck" (3 songs), "# Concert" (26)
    // with its "# Scheduled: …" note, three songs in both.
    test('the event window: a setlist in parts, a heading row each, numbered within the part (mockup A1)', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, EVENT, 'Manchester');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        // The card previews the longest part, says so, and names the other.
        await expect(card(page).locator('.mb-pop-partline')).toHaveText('Concert · 26 songs, the first 5');
        await expect(card(page).locator('.mb-pop-tracks li .mb-pop-ttl')).toHaveText(['No Surrender', 'Land of Hope and Dreams / People Get Ready',
            'Death to My Hometown', 'Seeds', 'Something in the Night']);
        await expect(card(page).locator('.mb-tt-dim').last()).toHaveText('+ 21 more · also Soundcheck (3)');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const box = area.locator('[data-mb-tbl="setlist"]');
        await expect(area.locator('h4', { hasText: /^Setlist/ })).toHaveText('Setlist · 29 in 2 parts');
        const heads = box.locator('tbody tr.mb-dp-tsec');
        await expect(heads).toHaveCount(2);
        await expect(heads.locator('.mb-dp-tsec-n')).toHaveText(['Soundcheck', 'Concert']);
        await expect(heads.locator('.mb-dp-tsec-c')).toHaveText(['3 songs', '26 songs']);
        // A comment right under a heading is that part's note.
        await expect(heads.nth(1).locator('.mb-dp-tsec-note')).toContainText('Scheduled: 19:30');
        // Numbered within the part, in the order played.
        await expect(box.locator('tbody tr:not(.mb-dp-tsec) td:first-child'))
            .toHaveText([...['1', '2', '3'], ...Array.from({ length: 26 }, (_, i) => String(i + 1))]);
        // The part names are no longer loose notes under the table.
        await expect(area.locator('.mb-dp-note', { hasText: /^(Soundcheck|Concert)$/ })).toHaveCount(0);
        // A song played in both parts says so, by work.
        const noSurrender = box.locator('tbody tr:not(.mb-dp-tsec)', { hasText: 'No Surrender' });
        await expect(noSurrender.locator('.mb-dp-also')).toHaveText(['↺ also in Concert', '↺ also in Soundcheck']);
        await expect(box.locator('.mb-dp-also')).toHaveCount(6);
        // The Part chips keep one part.
        await expect(box.locator('[data-mb-tbl-chip]')).toHaveText(['Soundcheck3', 'Concert26']);
        await box.locator('[data-mb-tbl-chip="Soundcheck"]').click();
        await expect(box.locator('tbody tr.mb-dp-tsec')).toHaveCount(1);
        await expect(box.locator('tbody tr:not(.mb-dp-tsec)')).toHaveCount(3);
        await box.locator('[data-mb-tbl-chip="Soundcheck"]').click();
        // Filtering: each heading counts what is left of its part.
        await box.locator('input.mb-tbl-q').fill('reason');
        await expect(box.locator('tbody tr.mb-dp-tsec .mb-dp-tsec-c')).toHaveText(['1 of 3 songs', '1 of 26 songs']);
        await box.locator('input.mb-tbl-q').fill('');
        // Sorted by Song the parts mix: no heading rows, a part tag on each song.
        await box.locator('th[data-mb-tbl-sort="song"]').click();
        await expect(box.locator('tbody tr.mb-dp-tsec')).toHaveCount(0);
        await expect(box.locator('tbody tr .mb-dp-tpart')).toHaveCount(29);
        await expect(box.locator('tbody tr').first().locator('td').nth(1)).toContainText('Badlands');
    });

    // vzell, 2026-10-29: on event be07d2a9's window the "Review" link to
    // http://brucebase.wikidot.com/2002#100802 opened a new tab; it should
    // open in the same window. The Stone Pony capture with its review link
    // pointed at a show of the saved 2025 year page (ext-bb-year-2025.html,
    // the Stone Pony 26 Oct 2025, #261025).
    test('the event window: a Brucebase review link opens in the window, and Back returns to the event', async ({ page }) => {
        const PONY_EV = '/event/26cead1c-a5fa-4677-873a-312412c6dc91';
        const REVIEW = 'http://brucebase.wikidot.com/2025#261025';
        const SETLISTFM = 'https://www.setlist.fm/setlist/bruce-springsteen/2001/stone-pony-asbury-park-nj-3bd6b0d8.html';
        const year = fs.readFileSync(path.join(__dirname, 'ext-bb-year-2025.html'), 'utf8');
        const answer = { status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: year };
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; },
            { 'https://brucebase.wikidot.com/2025': answer, 'http://brucebase.wikidot.com/2025': answer, [REVIEW]: answer });
        await open(page, {
            settings: { sa_pop_mb: true, sa_pop_ext: true, sa_pop_ext_favicons: false }, showAll: false,
            ws2: (url) => {
                if (url.includes(`/ws/2${PONY_EV}?inc=artist-rels`)) {
                    const d = JSON.parse(json('ws2-pop-event-stonepony.json'));
                    d.relations.forEach((r) => { if (r.url && /brucebase/.test(r.url.resource)) r.url.resource = REVIEW; });
                    // Another site's link beside it, which keeps its new tab.
                    const bb = d.relations.find(r => r.url && r.url.resource === REVIEW);
                    d.relations.push(Object.assign({}, bb, { type: 'setlistfm',
                        url: { id: '00000000-0000-4000-8000-000000000001', resource: SETLISTFM } }));
                    return { status: 200, body: JSON.stringify(d) };
                }
                if (/\/ws\/2\/event\/[0-9a-f-]{36}\?inc=recording-rels/.test(url)) return { status: 200, body: '{"relations":[]}' };
                return null;
            },
        });
        const a = await addLink(page, PONY_EV, 'Stone Pony');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const review = area.locator(`a[href="${REVIEW}"]`);
        await expect(review).toHaveCount(1);
        // Marked as a link that opens here, not one that leaves (↗).
        await expect(review).toHaveClass(/\bmb-dp-l-here\b/);
        await expect(review).not.toHaveClass(/\bmb-dp-l-out\b/);
        // Only the Springsteen sites: another site's link still leaves (↗).
        await expect(area.locator(`a[href="${SETLISTFM}"]`)).toHaveClass(/\bmb-dp-l-out\b/);
        const pages = [];
        page.on('popup', (p) => pages.push(p.url()));
        await review.click();
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title).toContainText('Brucebase show');
        await expect(area).toContainText(/STONE PONY/i);
        expect(pages, 'no new tab').toEqual([]);
        // Back: the event again.
        await dialog(page).locator('button', { hasText: 'Back' }).click();
        await expect(title).toContainText('Event');
        await expect(area.locator(`a[href="${REVIEW}"]`)).toHaveCount(1);
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
        // A List table since Phase 3e: # · Song · Notes.
        const songs = area.locator('[data-mb-tbl="setlist"] tbody tr');
        await expect(songs).toHaveCount(20);
        await expect(songs.filter({ hasText: /\[|\]/ }), 'no raw [mbid|name] token').toHaveCount(0);
        // A mixed-case token: the work linked by its lowercased MBID, the
        // guest in "(with …)" as an artist.
        const fever = songs.nth(13);
        // The song and the rest of its line in cells of their own (Phase 3e).
        await expect(fever.locator('td').nth(1)).toHaveText('The Fever');
        await expect(fever.locator('td').nth(2)).toHaveText('(with Bruce Springsteen)');
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
        // The setlist's filter (Phase 3e): one song, its match marked.
        await area.locator('[data-mb-tbl="setlist"] input.mb-tbl-q').fill('fever');
        await expect(songs).toHaveCount(1);
        await expect(songs.locator('mark.mb-dg-hl')).toHaveText(['Fever']);
        await area.locator('[data-mb-tbl="setlist"] input.mb-tbl-q').fill('');
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
        // Three area lookups behind the 1 req/s gate: 3.3–3.9 s on NB-3641
        // with nothing else running, so the default 5 s left ~1 s for load —
        // a loaded full run was still at "… New Jersey ◌" (2026-10-19). Same
        // cause and allowance as the label window's Area row below.
        await expect(heldAt).toHaveText('OceanFirst Bank Center in West Long Branch, New Jersey, United States', { timeout: 15000 });
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
        // The same three rate slots as the event window's test above, so the
        // same allowance.
        await expect(heldAt).toHaveText('OceanFirst Bank Center in West Long Branch, New Jersey', { timeout: 15000 });
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
        await expect(area.locator('[data-mb-tbl="links"] tbody tr')).toHaveCount(5);
        // Its events as a paged List table (Phase 3b), sorted by date at first.
        await expect(area.locator('h4', { hasText: 'Events' })).toHaveText('Events · 110');
        await expect(area.locator('.mb-dg-counts').first()).toHaveText('100 of 110 loaded · one segment = 100 events');
        await expect(area.getByRole('button', { name: 'Load 1 more page (10 events, about 1 s)' })).toBeVisible();
        const dates = area.locator('[data-mb-tbl="place-events"] tbody tr td:first-child');
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
        // Three area lookups behind the 1 req/s gate: under a loaded full run
        // the chain was still at "◌" after the default 5 s (2026-10-14).
        await expect(areaRow).toHaveText('Asbury Park, New Jersey, United States', { timeout: 15000 });
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

    // org/MB-POH-sync-withDiscogs.org Phase 3a: a release-group series' items
    // come as target-type `release_group` under the key `release_group`
    // (probe 2026-10-27, scripts/probe-mb-window-browses.py); their links
    // were `/release_group/<id>`, which no preview knows, so a click left
    // for a broken new tab.
    test('a release-group series: its items link /release-group/ and open in the window', async ({ page }) => {
        const SERIES = '/series/ff0e5033-4452-43c6-8bc1-c48d95831839';
        await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (url.includes(`/ws/2${SERIES}?`) ? { status: 200, body: json('ws2-pop-series-rg.json') } : null),
        });
        const a = await addLink(page, SERIES, 'A State of Trance');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const links = dialog(page).locator('.mb-dp-area .mb-rg-wtable tbody tr a');
        await expect(links).toHaveCount(23);
        const hrefs = await links.evaluateAll(as => as.map(x => x.getAttribute('href')));
        expect(hrefs.every(h => /^\/release-group\/[0-9a-f-]{36}$/.test(h)), `every item a release group page: ${hrefs[0]}`).toBe(true);
        // Each item with its kind's own glyph before it (Phase 3e).
        await expect(dialog(page).locator('.mb-dp-area .mb-rg-wtable tbody img.mb-pop-ent-icon')).toHaveCount(23);
        await expect(dialog(page).locator('.mb-dp-area img.mb-pop-ent-icon').first()).toHaveAttribute('src', /\/static\/images\/entity\/release_group\.svg$/);
        await links.first().click();
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Series › Release group');
    });
});

// org/MB-POH-sync-withDiscogs.org Phase 3d: the windows' small tables are
// Compact tables (filter past a page, three-way sort, ‹ › pager).
test.describe('MusicBrainz link previews: Compact tables (Phase 3d)', () => {
    const WORK = '/work/9893a23c-f282-3b07-a2db-b4f2f3b9f4b2';
    const LABEL = '/label/011d1192-6f65-45bd-85c4-0400dd45693e';

    test('a work\'s 33 codes: a filter and a pager, the filter marks its matches and starts on page 1', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, WORK, 'Born to Run');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const codes = dialog(page).locator('[data-mb-tbl="codes"]');
        await expect(codes.locator('thead th')).toHaveText([/^Type/, /^Code/]);
        await expect(codes.locator('.mb-dg-pager span')).toHaveText('1–25 of 33');
        await codes.getByRole('button', { name: 'Next page' }).click();
        await expect(codes.locator('.mb-dg-pager span')).toHaveText('26–33 of 33');
        await codes.locator('input.mb-tbl-q').fill('akm');
        await expect(codes.locator('tbody tr')).toHaveCount(2);
        await expect(codes.locator('tbody mark.mb-dg-hl')).toHaveText(['AKM', 'AKM']);
    });

    test('a label: its 27 links a table (more than ten), its aliases one per line', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, LABEL, 'Columbia');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const links = dialog(page).locator('[data-mb-tbl="links"]');
        await expect(links.locator('thead th')).toHaveText([/^Site/, /^Relationship/, /^URL/]);
        await expect(links.locator('.mb-dg-pager span')).toHaveText('1–25 of 27');
        const aliases = dialog(page).locator('.mb-dp-area .mb-dp-kv dt:text-is("Aliases") + dd');
        expect(await aliases.locator('br').count(), 'three aliases, one per line').toBe(2);
    });

    test('an ISWC\'s works and a disc ID\'s releases are Compact tables', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, await addLink(page, '/iswc/T-070.246.800-1', 'T-070.246.800-1'));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('[data-mb-tbl="works"] thead th')).toHaveText([/^Work/, /^Type/, /^Language/]);
        await expect(dialog(page).locator('[data-mb-tbl="works"] tbody tr')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await ctrlHover(page, await addLink(page, '/cdtoc/coDDysS5IdmG1aPONqJSQd6TJws-', 'disc'));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('[data-mb-tbl="releases"] tbody tr')).toHaveCount(7);
        // The table of contents stays a plain table.
        await expect(dialog(page).locator('.mb-rg-wtable thead th')).toHaveText(['Track', 'Offset', 'Length']);
    });

    test('an artist\'s links: the filter narrows all 75 and marks the site', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await ctrlHover(page, page.locator('table.tbl tbody a[href="/artist/70248960-cb53-4ea4-943a-edb18f7d336f"]').first());
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const links = dialog(page).locator('[data-mb-tbl="links"]');
        await expect(links.locator('.mb-dg-pager span')).toHaveText('1–25 of 75');
        await links.locator('input.mb-tbl-q').fill('discogs');
        await expect(links.locator('tbody tr')).toHaveCount(1);
        await expect(links.locator('tbody mark.mb-dg-hl').first()).toHaveText('discogs');
    });
});

test.describe('MusicBrainz link previews: ISRC, ISWC, disc ID, collection (WIP.5)', () => {
    const DISCID = 'coDDysS5IdmG1aPONqJSQd6TJws-';
    const ATTENDING = '/collection/60df131d-bdb7-3c83-840d-e31e566baabe';
    const CV = '/collection/3d73c67c-76c6-459d-ac8b-3145cb49d672';

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
        await expect(dialog(page).locator('[data-mb-tbl="recordings"] tbody tr a').first()).toHaveAttribute('href', /^\/recording\/[0-9a-f-]{36}$/);
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

    test('a collection card is read from its page: type, size, owner, collaborators, description, first eight', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, CV, 'Cover art: Video');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Release group collection', '196 release groups', '2 pages', 'public']);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv.locator('dt')).toHaveText(['Owner', 'Collaborators', 'About']);
        await expect(kv.locator('a[href="/user/chaban"]')).toHaveText('chaban');
        await expect(kv.locator('dd').nth(1).locator('a')).toHaveText(['cherryblossom000', 'elQuotho', 'kellnerd', 'wileyfoxyx']);
        await expect(kv.locator('.mb-pop-coll-about')).toContainText('Tickets MBS-11633 CAA-132');
        const first = card(page).locator('ol.mb-pop-coll-first li');
        await expect(first).toHaveCount(8);
        await expect(first.first()).toContainText('÷');
        await expect(card(page).locator('.mb-tt-dim')).toHaveText('first 8 of 196');
        // One page request, and the Web Service is not asked.
        expect(log.html.filter(u => u.includes('/collection/'))).toEqual([`https://musicbrainz.org${CV}`]);
        expect(log.ws2.filter(u => u.includes('/collection'))).toEqual([]);
    });

    test('the window: the whole description; its entries as a List table, page 1 from the card\'s request, page 2 on "Load 1 more page"; covers', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, CV, 'Cover art: Video');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const dlg = dialog(page);
        await expect(dlg.locator(':scope > div > span').first()).toHaveText('Collection');
        await expect(dlg.locator('.mb-pop-coll-desc a', { hasText: 'MBS-11633' })).toHaveAttribute('href', 'https://tickets.metabrainz.org/browse/MBS-11633');
        await expect(dlg.locator('.mb-dp-kv dt')).toHaveText(['Owner', 'Collaborators', 'Holds']);
        await expect(dlg.locator('.mb-dp-kv dd').nth(2)).toHaveText('196 release groups on 2 pages');
        await expect(dlg.locator('h4', { hasText: 'Release groups' })).toHaveText('Release groups · 196');
        // Page 1 is the card's own record (Phase 3c): the window asks nothing.
        await expect(dlg.locator('.mb-dg-counts').first()).toHaveText('100 of 196 loaded · one segment = 100 release groups');
        expect(log.html.filter(u => u.includes('/collection/')), 'page 1 from the card\'s request').toHaveLength(1);
        // The page's own columns, but its stars; its tables per release group
        // type (an h3 each) are one list, the type a column (and its chips).
        // In front, the covers' column.
        const tbl = dlg.locator('[data-mb-tbl="collection"]');
        const rows = tbl.locator('tbody tr');
        await expect(tbl.locator('thead th')).toHaveText(['', /^Type/, /^Year/, /^Title/, /^Artist/, /^Releases/]);
        await expect(rows).toHaveCount(100);
        await expect(rows.first().locator('td').nth(1)).toHaveText('Album');
        await expect(rows.first().locator('a[href^="/release-group/"]:not(.mb-pop-cover-thumb)').first())
            .toHaveAttribute('href', '/release-group/e05f9927-e24b-41c5-928d-d0e008a12444');
        // Row 100 is page 1's last table's (MusicBrainz's seven tables hold 100 rows).
        await expect(rows.last().locator('td').nth(1)).toHaveText('Broadcast + DJ-mix');
        await expect(dlg.locator('table.tbl')).toHaveCount(0);
        // Covers: one per row the page marks, the empty box for the others.
        const imgs = tbl.locator('tbody tr > td:first-child img.mb-dg-vthumb');
        await expect(imgs.first()).toHaveAttribute('src', 'https://coverartarchive.org/release-group/e05f9927-e24b-41c5-928d-d0e008a12444/front-250');
        expect((await imgs.count()) + (await tbl.locator('tbody .mb-dg-nothumb').count())).toBe(100);
        // Type chips from the grouped page.
        await tbl.locator('.mb-dg-fc[data-mb-tbl-chip="Album"]').click();
        expect(new Set(await rows.locator('td:nth-child(2)').allTextContents())).toEqual(new Set(['Album']));
        await tbl.getByRole('button', { name: 'Clear filters' }).click();
        // The filter marks what it matched inside the page's own cells, links
        // kept (vzell 2026-10-27: it marked nothing).
        const q = tbl.locator('input.mb-tbl-q');
        await q.fill('broadcast');
        await expect(q).toBeFocused();
        const n = await rows.count();
        expect(n).toBeGreaterThan(0);
        await expect(rows.filter({ has: page.locator('mark.mb-dg-hl') })).toHaveCount(n);
        const title = (await rows.first().locator('a[href^="/release-group/"]:not(.mb-pop-cover-thumb)').first().textContent()).trim();
        await q.fill(title.slice(0, 5));
        await expect(rows.first().locator('a[href^="/release-group/"] mark.mb-dg-hl').first()).toHaveText(new RegExp(`^${title.slice(0, 5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
        await tbl.getByRole('button', { name: 'Clear filters' }).click();
        // Page 2 on the click, and the list is complete.
        await dlg.getByRole('button', { name: 'Load 1 more page (96 release groups, about 1 s)' }).click();
        await expect(dlg.locator('.mb-dg-counts').first()).toHaveText('196 of 196 loaded · one segment = 100 release groups', { timeout: 15000 });
        await expect(rows).toHaveCount(196);
        await expect(dlg.locator('.mb-dg-pill').first()).toHaveText('Done');
        expect(log.html.filter(u => u.includes('/collection/'))).toEqual([`https://musicbrainz.org${CV}`, `https://musicbrainz.org${CV}?page=2`]);
    });

    // org/TODO.org "some more BB and MB fixes/enhancements" 3 (vzell,
    // 2026-10-24): a cover is the standard image hover — the card of every
    // image of THAT release group, titled by it, and the viewer on a click
    // or Space — not a link to the entity's page in a new tab.
    test('a cover in the window: the card of that release group\'s images; a click or Space opens them in the viewer', async ({ page }) => {
        // The fixture's 16 images would cut the card off at 12, where Space is
        // the card's "every image" toggle (image-card-space.spec.js).
        const log = await open(page, { settings: { sa_pop_mb: true, sa_caa_tip_summary_tiles: 20 }, showAll: false });
        const a = await addLink(page, CV, 'Cover art: Video');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const dlg = dialog(page);
        const row = dlg.locator('[data-mb-tbl="collection"] tbody tr').first();
        const name = (await row.locator('a[href^="/release-group/"]:not(.mb-pop-cover-thumb)').first().textContent()).trim();
        const cover = row.locator('td:first-child a.mb-pop-cover-thumb');
        await expect(cover).toHaveAttribute('data-mb-sb-cover', '/release-group/e05f9927-e24b-41c5-928d-d0e008a12444');
        expect(log.caa, 'nothing asked before a rest').toEqual([]);
        const tip = page.locator('#mb-stat-tooltip');
        await page.mouse.move(0, 0);
        await cover.locator('img').hover();
        await expect(tip.locator('.mb-tt-title')).toHaveText(name);
        await expect(tip.locator('.mb-art-card-tile').first()).toBeVisible();
        expect(log.caa, 'one index, of that release group').toEqual(['/release-group/e05f9927-e24b-41c5-928d-d0e008a12444']);
        await expect(dlg.locator('.mb-dp-wfoot')).toContainText(`Viewer: ${name} · every image of it`);
        await expect(card(page), 'no window preview over the image card').toBeHidden();

        const viewer = page.locator('#mb-art-viewer');
        await page.keyboard.press('Space');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-title')).toHaveText(`${name} — cover art`);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dlg).toBeVisible();
        await expect(dlg.locator(':scope > div > span').first(), 'nothing drilled').toHaveText('Collection');

        await cover.click();
        await expect(viewer).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dlg.locator(':scope > div > span').first()).toHaveText('Collection');
        expect(log.caa, 'the record already read').toHaveLength(1);
    });

    test('an empty collection says so', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, ATTENDING, 'Attending');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Attending', '0 events', 'public']);
        await expect(card(page).locator('.mb-dp-kv a')).toHaveAttribute('href', '/user/vzell');
        await expect(card(page)).toContainText('This collection is empty.');
    });

    test('a collection we may not see: the card says why, and nothing is kept', async ({ page }) => {
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: (url) => (url.includes('/collection/') ? { status: 404, contentType: 'text/html', body: '<html><body><div id="page"><h1>Collection not found</h1></div></body></html>' } : null),
        });
        const a = await addLink(page, ATTENDING, 'Attending');
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-alert')).toContainText('It may be private, or no longer exist.');
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-alert')).toContainText('It may be private, or no longer exist.');
        await expect.poll(() => log.html.filter(u => u.includes('/collection/')).length, { message: 'a failure is asked again on the next hover' }).toBe(2);
    });

    test("other userscripts' additions to a collection page are never read", async ({ page }) => {
        const html = fs.readFileSync(path.join(__dirname, 'collection-page-coverart-video.html'), 'utf8')
            .replace('Open edits</bdi></a>', 'Open edits</bdi></a>&nbsp;(<span class="jesus2099PendingEditsCount">FOREIGN-COUNT</span>)')
            .replace('<ul class="pagination">', '<ul class="pagination"><li><a title="mb. PRINT ALL PAGES">FOREIGN-PRINT</a></li>')
            .replace('<div class="description"><h2>Description</h2><p>', '<div class="description"><h2>Description</h2><p><span class="mb-hq-flag-img">FOREIGN-FLAG</span>');
        await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: (url) => (/\/collection\/3d73c67c[^?]*$/.test(url) ? { status: 200, contentType: 'text/html', body: html } : null),
        });
        const a = await addLink(page, CV, 'Cover art: Video');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-pop-coll-desc')).toContainText('MBS-11633');
        for (const box of [card(page), dialog(page)]) await expect(box).not.toContainText('FOREIGN');
        await expect(dialog(page).locator('.mb-dp-kv dd').nth(2)).toHaveText('196 release groups on 2 pages');
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
        // An editor's edits are an editing history (org/mb-edit-history.org,
        // popup-mb-edits.spec.js), no longer a tab left alone.
        expect(r.userEdits).toBe('mb-entity|edits:user/vzell');
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
        await expect(dialog(page).locator('[data-mb-tbl="edits"] tbody tr').first()).toContainText('Total');
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

// A tag (2026-10-19): read from its page, like an edit or an editor. Pinned:
// WHAT is previewed (the bare tag only), the CARD's facts — counts from the
// "See all N" link where the page has one and from the list where it has
// not (Areas: 2 items, no link) — the WINDOW's lists with drillable entity
// links, ONE request shared with the Live page, and a page that is not a
// tag's failing unkept.
test.describe('MusicBrainz link previews: tags, read from the page', () => {
    const TAG = '/tag/alternative%20rock';

    test('what is previewed: a tag and its kind pages (the same card), not its other tabs; an editor\'s own tag is its own kind', async ({ page }) => {
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
                tag: res('/tag/alternative%20rock'), kind: res('/tag/alternative%20rock/artist'),
                tab: res('/tag/alternative%20rock/nothing'),
                mine: res('/user/vzell/tag/alternative%20rock'), mineKind: res('/user/vzell/tag/alternative%20rock/release'),
                all: res('/tags'),
            };
        });
        expect(r.tag).toBe('mb-entity|tag:alternative%20rock');
        // A kind page (Phase 3c): the tag's own card, its window on that kind.
        expect(r.kind).toBe('mb-entity|tag:alternative%20rock');
        expect(r.tab).toBeNull();
        expect(r.mine, 'an editor\'s own tag is its own kind (popup-mb-user-lists.spec.js)').toBe('mb-entity|usertag:vzell/alternative%20rock');
        expect(r.mineKind).toBe('mb-entity|usertag:vzell/alternative%20rock');
        expect(r.all).toBeNull();
    });

    test('the card: genre, total and the kinds by count, from one page request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, TAG, 'alternative rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('alternative rock');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Genre', '212,773 entities']);
        const kv = card(page).locator('.mb-dp-kv');
        // Largest first, the six biggest of eleven.
        await expect(kv.locator('dt')).toHaveText(['Recordings', 'Release groups', 'Releases', 'Artists', 'Works', 'Series']);
        await expect(kv.locator('dd').nth(1)).toHaveText('59,674');
        await expect(card(page)).toContainText('+ 5 more kinds');
        expect(log.html).toEqual([`https://musicbrainz.org${TAG}`]);
    });

    test('the window: counts by kind (from the list when there is no "See all"), the biggest kind\'s list from its page, another kind on a click; the Live page from the same request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, TAG, 'alternative rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Tag');
        const area = dialog(page).locator('.mb-dp-area');
        const rows = area.locator('[data-mb-tbl="tag-kinds"] tbody tr');
        await expect(rows).toHaveCount(11);
        await expect(rows.filter({ hasText: 'Areas' })).toContainText('2');
        await expect(rows.filter({ hasText: 'Instruments' })).toContainText('3');
        await expect(area.locator('.mb-dp-kv a[href="/genre/ceeaa283-5d7b-4202-8d1d-e25d116b2a18"]')).toHaveText('alternative rock');
        // The biggest kind's list (Phase 3c): its kind page, page 1, most
        // votes first, 100 of the page's own total.
        await expect(rows.locator('button[aria-pressed="true"]')).toHaveText('Recordings');
        // Each kind says what a click does (vzell 2026-10-29); the listed one
        // says it is listed. A kind of fewer than a page has no "more".
        await expect(rows.locator('button[aria-pressed="true"]')).toHaveAttribute('title', 'These recordings are on the right now.');
        await expect(rows.filter({ hasText: 'Areas' }).locator('button')).toHaveAttribute('title',
            'Show the 2 areas tagged alternative rock on the right, most votes first.');
        await expect(rows.filter({ hasText: 'Release groups' }).locator('button')).toHaveAttribute('title',
            /^Show the [\d,]+ release groups tagged alternative rock on the right, most votes first: the first 100 now, 100 more a page on demand\.$/);
        await expect(rows.locator('button:not([data-mb-tip])')).toHaveCount(0);
        await expect(area.locator('h4', { hasText: 'Recordings ·' })).toHaveText('Recordings · 129,630');
        await expect(area.locator('.mb-dg-counts').first()).toHaveText('100 of 129,630 loaded · one segment = 100 recordings');
        const recs = area.locator('[data-mb-tbl="tag-kind-recording"] tbody tr');
        await expect(recs).toHaveCount(100);
        await expect(area.locator('[data-mb-tbl="tag-kind-recording"] thead th')).toHaveText([/^Votes/, /^Recording/, /^By/]);
        const votes = (await recs.locator('td:first-child').allTextContents()).map(Number);
        expect(votes).toEqual([...votes].sort((x, y) => y - x));
        expect(log.html).toEqual([`https://musicbrainz.org${TAG}`, `https://musicbrainz.org${TAG}/recording`]);
        // Another kind: its own list, page 1 asked on the click.
        await rows.locator('button', { hasText: 'Artists' }).click();
        const artists = area.locator('[data-mb-tbl="tag-kind-artist"]');
        await expect(artists.locator('tbody tr')).toHaveCount(100, { timeout: 15000 });
        await expect(artists.locator('a[href="/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711"]')).toHaveText('Radiohead');
        await expect(artists).toContainText('(UK rock band)');
        await expect(area.getByRole('button', { name: /^Load 5 more pages \(500 artists, about 6 s\)$/ })).toBeVisible();
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: 'Live page' }).click();
        const frame = page.frameLocator('#mb-dp-dialog iframe');
        await expect(frame.locator('.tagheader h1')).toContainText('alternative rock', { timeout: 15000 });
        expect(log.html.filter(u => u === `https://musicbrainz.org${TAG}`), 'the Live page reuses the hover\'s page').toHaveLength(1);
    });

    // vzell 2026-10-27: in a tag's window, Ctrl-click on its "Genre" link
    // (/genre/<MBID>, not /tag/) opened a new tab: a genre link stands for
    // the tag of its name.
    test('Ctrl-click on the tag window\'s Genre link: your own tag of that name; the foot line says so', async ({ page }) => {
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: (u) => (/\/user\/vzell\/tag\//.test(u) ? 'user-tag-page-vzell-live.html' : null),
        });
        await page.evaluate(() => {
            document.addEventListener('click', (e) => { if (e.ctrlKey) e.preventDefault(); }, true);
            document.body.insertAdjacentHTML('afterbegin',
                '<div class="header" id="test-header"><ul class="menu"><li class="account"><ul><li><a href="/user/vzell">Profile</a></li></ul></li></ul></div>');
        });
        const a = await addLink(page, TAG, 'alternative rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const title = dialog(page).locator(':scope > div > span').first();
        await expect(title).toHaveText('Tag');
        const foot = dialog(page).locator('.mb-dp-wfoot');
        await page.mouse.move(0, 0);
        await expect(foot).toContainText('Ctrl-click a tag or genre: your own tag');
        const genre = dialog(page).locator('.mb-dp-kv a[href^="/genre/"]');
        await genre.hover();
        await expect(foot).toContainText('Ctrl-click: your own tag');
        await genre.click({ modifiers: ['Control'] });
        await expect(title).toHaveText('Tag › Editor\'s tag');
        await expect.poll(() => log.html.filter(u => u.includes('/user/'))[0]).toBe('https://musicbrainz.org/user/vzell/tag/alternative%20rock');
    });

    test('a link to a tag\'s kind page: the tag\'s card, its window on that kind', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, `${TAG}/artist`, 'alternative rock artists');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('alternative rock');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('[data-mb-tbl="tag-kinds"] button[aria-pressed="true"]')).toHaveText('Artists');
        await expect(area.locator('[data-mb-tbl="tag-kind-artist"] tbody tr')).toHaveCount(100, { timeout: 15000 });
        expect(log.html, 'the overview, then that kind\'s page; never the biggest kind\'s').toEqual([
            `https://musicbrainz.org${TAG}`, `https://musicbrainz.org${TAG}/artist`]);
    });

    test('a kind page that is not one (a login page): the list says so, and "Try again" asks it again', async ({ page }) => {
        let login = true;
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: (u) => (/\/tag\/alternative%20rock\/recording$/.test(u) && login ? 'user-page-vzell.html' : null),
        });
        const a = await addLink(page, TAG, 'alternative rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('.mb-dg-pill').first()).toHaveText('Done with errors', { timeout: 15000 });
        await expect(area.locator('.mb-dg-counts').first()).toContainText('not the page expected');
        login = false;
        await area.getByRole('button', { name: /^Try page 1 again/ }).click();
        await expect(area.locator('[data-mb-tbl="tag-kind-recording"] tbody tr')).toHaveCount(100, { timeout: 15000 });
        // Asked again, not read back from memory: the login page was forgotten.
        expect(log.html.filter(u => u.endsWith('/recording'))).toHaveLength(2);
    });

    test('a tag that is no genre: no Genre pill, "none" in the window', async ({ page }) => {
        const body = json('tag-page-alternative-rock.html').replace(/<h2>Genre<\/h2><p>.*?<\/p>/, '');
        expect(body).not.toContain('/genre/');
        await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: () => ({ status: 200, contentType: 'text/html', body }),
        });
        const a = await addLink(page, TAG, 'alternative rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['212,773 entities']);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-area .mb-dp-kv')).toContainText('none');
    });

    test('a page that is not a tag\'s (a login page) fails and is not kept', async ({ page }) => {
        let login = true;
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: () => (login ? { status: 200, contentType: 'text/html', body: '<html><body><div id="page"><h1>Log in</h1></div></body></html>' } : null),
        });
        const a = await addLink(page, TAG, 'alternative rock');
        await ctrlHover(page, a);
        await expect(card(page).locator('.mb-tt-alert')).toContainText('not the page expected');
        login = false;
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        expect(log.html).toHaveLength(2);
    });
});

// A genre (2026-10-26), read from its page: the links of a tag page's
// "Genre" heading, of a genre collection and of the genre lists. Pins:
//   1. what is previewed: the bare genre page, its collections and editing
//      history as their own kinds, never its tabs (/aliases);
//   2. the card from ONE page request: name, pills, the primary tag, every
//      relationship phrase with its names (three at most, "+N"), the start
//      of the Wikipedia extract — checking only the title passes on a
//      parser that reads nothing below the header;
//   3. the window: each related genre LINKED to its own page (so it drills),
//      the URLs apart from them, the collections link, the whole extract;
//      the Live page reuses the hover's request.
test.describe('MusicBrainz link previews: genres, read from the page', () => {
    const GID = '883d75d5-1365-46ee-8cbe-d3ae2facdd93';
    const GENRE = `/genre/${GID}`;

    test('what is previewed: a genre, its collections and history, not its tabs', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const r = await page.evaluate((g) => {
            const td = document.querySelector('table.tbl tbody tr td:first-child');
            const res = (href) => {
                const a = document.createElement('a');
                a.href = href;
                a.textContent = 'x';
                td.appendChild(a);
                return window.__saTest.popResolve(a);
            };
            return {
                genre: res(g), upper: res(g.toUpperCase().replace('/GENRE/', '/genre/')), tab: res(`${g}/aliases`),
                colls: res(`${g}/collections`), edits: res(`${g}/edits`), open: res(`${g}/open_edits`),
            };
        }, GENRE);
        expect(r.genre).toBe(`mb-entity|genre:${GID}`);
        expect(r.upper, 'an MBID in uppercase is the same genre').toBe(`mb-entity|genre:${GID}`);
        expect(r.tab).toBeNull();
        expect(r.colls).toBe(`mb-entity|collections:genre/${GID}`);
        expect(r.edits).toBe(`mb-entity|edits:genre/${GID}`);
        expect(r.open).toBe(`mb-entity|edits:${GENRE}/open_edits`);
    });

    test('the card: primary tag, relationships and the extract, from one page request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, GENRE, 'roots rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('roots rock');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['Genre', 'in 2 collections']);
        const kv = card(page).locator('.mb-dp-kv');
        await expect(kv.locator('dt')).toHaveText(['Primary tag', 'subgenre of', 'subgenres', 'influenced by']);
        await expect(kv.locator('dd')).toHaveText(['roots rock', 'rock', 'tex-mex', 'blues, country, r&b']);
        await expect(card(page)).toContainText('Roots rock is a genre of rock music');
        await expect(card(page), 'the URLs are the window\'s').not.toContainText('wikidata');
        expect(log.html).toEqual([`https://musicbrainz.org${GENRE}`]);
    });

    test('the window: related genres linked, links apart, collections, the Live page from the same request', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, GENRE, 'roots rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Genre');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area.locator('a[href="/genre/0e3fc579-2d24-4f20-9dae-736e1ec78798"]')).toHaveText('rock');
        await expect(area.locator('a[href="/genre/31be54b2-4d0c-42df-aa44-c496c7b4c3c3"]')).toHaveText('r&b');
        await expect(area.locator('a[href="https://www.wikidata.org/wiki/Q1929352"]')).toHaveText('Q1929352');
        await expect(area.locator('a[href^="/url/"]'), 'the "[info]" links are not targets').toHaveCount(0);
        await expect(area.locator(`a[href="/genre/${GID}/collections"]`)).toHaveText('2');
        await expect(area.locator('a[href="/tag/roots%20rock"]')).toHaveText('roots rock');
        await expect(area).toContainText('Grammy Award');
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: 'Live page' }).click();
        const frame = page.frameLocator('#mb-dp-dialog iframe');
        await expect(frame.locator('.genreheader h1')).toContainText('roots rock', { timeout: 15000 });
        expect(log.html, 'the Live page reuses the hover\'s page').toHaveLength(1);
    });

    // org/MB-POH-sync-withDiscogs.org Phase 3d: the links on the left, each
    // related-genres relationship a Compact table of its own on the right.
    test('the window: links on the left, each related-genres relationship its own table', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, GENRE, 'roots rock');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const cols = dialog(page).locator('.mb-dp-area .mb-dp-x > .mb-dp-col');
        await expect(cols.nth(0).locator('a[href="https://www.wikidata.org/wiki/Q1929352"]')).toHaveText('Q1929352');
        await expect(cols.nth(1).locator('a[href^="https://www.wikidata.org/"]')).toHaveCount(0);
        await expect(cols.nth(1).locator('.mb-dp-gname')).toHaveText(['subgenre of · 1', 'subgenres · 1', 'influenced by · 3']);
        const tables = cols.nth(1).locator('table.mb-dg-ct');
        await expect(tables).toHaveCount(3);
        await expect(tables.nth(2).locator('tbody td')).toHaveText(['blues', 'country', 'r&b']);
        // Name descending, then the page's order again.
        const th = tables.nth(2).locator('th[data-mb-tbl-sort="name"]');
        await th.click();
        await expect(th).toHaveAttribute('aria-sort', 'ascending');
        await th.click();
        await expect(tables.nth(2).locator('tbody td')).toHaveText(['r&b', 'country', 'blues']);
    });

    test('a page that is not a genre\'s fails and is not kept', async ({ page }) => {
        let login = true;
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: () => (login ? { status: 200, contentType: 'text/html', body: '<html><body><div id="page"><h1>Log in</h1></div></body></html>' } : null),
        });
        const a = await addLink(page, GENRE, 'roots rock');
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
        expect(log.ws2).toEqual([expect.stringContaining('/ws/2/label/011d1192-6f65-45bd-85c4-0400dd45693e?inc=genres+ratings+aliases')]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Catalog number');
        await expect(dialog(page).locator('h4:text-is("Related labels") + .mb-dp-kv')).toContainText('Vocalion');
        await expect(dialog(page).locator('a.mb-dp-tbtn')).toHaveAttribute('href', 'https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e');
    });

    // org/MB-POH-sync-withDiscogs.org Phase 3a: the card looked up the label's
    // answer under a key of another inc set than the label kind asks with,
    // so it was never "there", every repaint counted as a start, and a failed
    // label lookup was asked again on each one.
    test('a failed label lookup is asked once: a repaint does not ask again', async ({ page }) => {
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            ws2: (url) => (/\/ws\/2\/label\/[0-9a-f-]{36}\?/.test(url) ? { status: 400, body: '{"error":"planted"}' } : null),
        });
        await ctrlHover(page, catSpan(page));
        await expect(card(page)).toContainText('Could not load it from MusicBrainz', { timeout: 15000 });
        const labelAsked = () => log.ws2.filter(u => /\/ws\/2\/label\//.test(u)).length;
        expect(labelAsked()).toBe(1);
        // A repaint loop would ask once per rate slot (1.1 s): watch three.
        const more = await expect.poll(labelAsked, { timeout: 3500, intervals: [250] }).toBeGreaterThan(1).then(() => true, () => false);
        expect(more, 'no label lookup after the failure').toBe(false);
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
        await expect(dialog(page).locator('[data-mb-tbl="tracks"] tbody tr').first()).toBeVisible();
        return log;
    }

    test('a click on the release group shows it in the window; Back returns, from memory', async ({ page }) => {
        const log = await releaseWindow(page);
        await expect(title(page)).toHaveText('Release');
        await expect(backBtn(page)).toBeHidden();
        await dialog(page).locator('.mb-dp-area a[href^="/release-group/"]').first().click();
        await expect(title(page)).toHaveText('Release › Release group');
        await expect(dialog(page).locator('[data-mb-tbl="rg-releases"] tbody tr').first()).toBeVisible();
        await expect(backBtn(page)).toBeVisible();
        expect(log.browses, 'the release group\'s releases').toHaveLength(1);
        // The page's row keeps its mark; nothing in the window is marked.
        await expect(page.locator('tr.mb-dp-current')).toHaveCount(1);
        await expect(page.locator('table.tbl tbody tr.mb-dp-current')).toHaveCount(1);
        await backBtn(page).click();
        await expect(title(page)).toHaveText('Release');
        await expect(dialog(page).locator('[data-mb-tbl="tracks"] tbody tr')).toHaveCount(9);
        await expect(backBtn(page)).toBeHidden();
        expect(log.lookups, 'the release again: from memory').toHaveLength(1);
    });

    test('Backspace and Alt+← go back; the title shows the path', async ({ page }) => {
        await releaseWindow(page);
        await dialog(page).locator('.mb-dp-area a[href^="/release-group/"]').first().click();
        await expect(title(page)).toHaveText('Release › Release group');
        // A release's title link: its cover (the row's first link since
        // 2026-10-24) opens the artwork viewer, not the release.
        await dialog(page).locator('[data-mb-tbl="rg-releases"] tbody td:nth-child(2) a[href^="/release/"]').first().click();
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

test.describe('MusicBrainz link previews: hovering inside the window (org/dp-window-hover.org)', () => {
    const title = (page) => dialog(page).locator(':scope > div > span').first();
    const area = (page) => dialog(page).locator('.mb-dp-area');
    const foot = (page) => dialog(page).locator('.mb-dp-wfoot');
    const label = (page) => area(page).locator('a[href="/label/011d1192-6f65-45bd-85c4-0400dd45693e"]');

    /**
     * Opens the window on the page's first release (Greetings, its strip
     * of 16 cover images) and parks the pointer outside it.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object} [settings]
     * @returns {Promise<Object>} `open()`'s request log.
     */
    async function releaseWindow(page, settings = {}) {
        const log = await open(page, { settings: { sa_pop_mb: true, ...settings }, showAll: false });
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(area(page).locator('table.mb-pop-medtable tbody tr')).toHaveCount(9);
        await expect(area(page).locator('.mb-dp-gallery img')).toHaveCount(16);
        await page.mouse.move(0, 0);
        return log;
    }

    /**
     * Hovers an element of the window from outside it.
     *
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} el
     * @returns {Promise<void>}
     */
    async function rest(page, el) {
        await page.mouse.move(0, 0);
        await el.scrollIntoViewIfNeeded();
        await el.hover();
    }

    test('H1/H2: the foot line says what a click does; the links are marked at rest', async ({ page }) => {
        await releaseWindow(page);
        await expect(foot(page)).toContainText('Rest on a link or an image');
        await expect(foot(page)).toContainText('Esc close');
        await expect(label(page)).toHaveClass(/\bmb-dp-l-here\b/);
        await expect(area(page).locator('.mb-dp-gallery a').first()).toHaveClass(/\bmb-dp-l-img\b/);
        await rest(page, label(page));
        await expect(foot(page)).toContainText('Opens here: Label · Columbia');
        await expect(foot(page)).toContainText('Click: here · Ctrl-click: new tab');
        await rest(page, area(page).locator('.mb-dp-gallery a').nth(2));
        await expect(foot(page)).toContainText(/Viewer: .* · image 3 of 16/);
        // A link the window cannot open (the artist's external links, the
        // external previews being off): the ↗ and the foot line only.
        await area(page).locator('a[href^="/artist/"]').first().click();
        await expect(title(page)).toHaveText(/Release › Artist$/);
        const out = area(page).locator('a.mb-dp-l-out').first();
        await expect(out).toBeVisible();
        await rest(page, out);
        await expect(foot(page)).toContainText('New tab: ');
        await expect(card(page)).toBeHidden();
        await page.mouse.move(0, 0);
        await expect(foot(page)).toContainText('Rest on a link or an image');
    });

    test('H2: a link that opens here gets no glyph on hover, so it never changes width', async ({ page }) => {
        // Pins: hovering a `mb-dp-l-here` link adds no generated content, so
        // its width (and an auto-sized table column holding it) stays put.
        // A hover-only ↳ made the LABEL-CAT# column of a release group's
        // versions jump sideways and back. The ↗ of a new-tab link stays.
        await releaseWindow(page);
        const here = label(page);
        await expect(here).toHaveClass(/\bmb-dp-l-here\b/);
        await page.mouse.move(0, 0);
        const before = await here.evaluate(a => a.getBoundingClientRect().width);
        await rest(page, here);
        await expect(foot(page)).toContainText('Opens here: ');
        const hovered = await here.evaluate(a => ({
            after: getComputedStyle(a, '::after').content,
            width: a.getBoundingClientRect().width,
        }));
        expect(['none', 'normal']).toContain(hovered.after);
        expect(hovered.width).toBe(before);
        await area(page).locator('a[href^="/artist/"]').first().click();
        await expect(title(page)).toHaveText(/Release › Artist$/);
        const out = area(page).locator('a.mb-dp-l-out:not(.mb-dp-l-noglyph)').first();
        await expect(out).toBeVisible();
        expect(await out.evaluate(a => getComputedStyle(a, '::after').content)).toContain('↗');
    });

    test('H3: a link that opens here gets its card under the page\'s Ctrl rule; Space opens it here', async ({ page }) => {
        const log = await releaseWindow(page);
        // The page's rule (sa_dp_hover_without_ctrl off in fixtures): a plain hover shows nothing.
        await rest(page, label(page));
        await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
        await expect(card(page)).toBeHidden();
        expect(log.ws2.filter(u => u.includes('/ws/2/label/'))).toEqual([]);
        await ctrlHover(page, label(page));
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('Columbia');
        await expect(card(page).locator('.mb-pop-kind-head')).toContainText('Label');
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText(/Release › Label$/);
        await expect(card(page)).toBeHidden();
        await expect(dialog(page).locator('button.mb-dp-tbtn', { hasText: '← Back' })).toBeVisible();
        // H6: ← Back names where it goes.
        await expect(dialog(page).locator('button.mb-dp-tbtn', { hasText: '← Back' })).toHaveAttribute('title', /^Back to: Release · /);
    });

    // org/TODO.org "some more BB and MB fixes/enhancements" 1b (vzell,
    // 2026-10-24): Space on an image of the window opens the viewer at it,
    // as a click does. It used to be swallowed (pinned nothing, did
    // nothing), which is what this test asserted before.
    test('H4: an image shows large on a rest (no Ctrl, no request); Shift larger; Space opens the viewer at it', async ({ page }) => {
        const log = await releaseWindow(page);
        const before = log.caa.length;
        const viewer = page.locator('#mb-art-viewer');
        await rest(page, area(page).locator('.mb-dp-gallery a').nth(2).locator('img'));
        await expect(card(page)).toBeVisible();
        await expect(card(page).locator('img.mb-dp-imgprev')).toHaveCount(1);
        await expect(card(page)).toContainText('image 3 of 16');
        await expect(card(page)).toContainText('Click or Space: viewer · Shift: larger');
        await page.keyboard.down('Shift');
        await expect(card(page).locator('img.mb-dp-imgprev-big')).toHaveCount(1);
        await page.keyboard.up('Shift');
        await expect(card(page).locator('img.mb-dp-imgprev-big')).toHaveCount(0);
        await page.keyboard.press('Space');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos'), 'at the image the pointer rests on').toHaveText('3 / 16');
        await expect(card(page), 'the preview does not stay over the viewer').toBeHidden();
        await expect(title(page), 'nothing was pinned or drilled').toHaveText('Release');
        expect(log.caa.length, 'no archive request').toBe(before);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dialog(page), 'Esc closes the viewer, not the window').toBeVisible();
    });

    test('H4: Space before the image\'s preview shows opens the viewer all the same', async ({ page }) => {
        await releaseWindow(page);
        const viewer = page.locator('#mb-art-viewer');
        await rest(page, area(page).locator('.mb-dp-gallery a').nth(4).locator('img'));
        const top = await area(page).evaluate((el) => el.scrollTop);
        // At once: the preview waits 250 ms.
        await page.keyboard.press('Space');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('5 / 16');
        expect(await area(page).evaluate((el) => el.scrollTop), 'Space did not scroll the window').toBe(top);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dialog(page)).toBeVisible();
        // Off the picture, Space is the window's own again (no viewer).
        await page.mouse.move(0, 0);
        await page.keyboard.press('Space');
        await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
        await expect(viewer).toBeHidden();
    });

    test('H5 off (the default): a rest reads nothing ahead', async ({ page }) => {
        const log = await releaseWindow(page);
        const rec = area(page).locator('table.mb-pop-medtable tbody tr').nth(1).locator('a').first();
        await rest(page, rec);
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        expect(log.ws2.filter(u => u.includes('/ws/2/recording/')), 'off: nothing read ahead').toEqual([]);
        await expect(rec).not.toHaveClass(/\bmb-dp-l-read\b/);
    });

    test('H5 on: a 600 ms rest reads the recording ahead, then the click shows it from memory', async ({ page }) => {
        const log = await releaseWindow(page, { sa_dp_window_read_ahead: true });
        const rec = area(page).locator('table.mb-pop-medtable tbody tr').nth(1).locator('a').first();
        await rest(page, rec);
        await expect.poll(() => log.ws2.filter(u => u.includes('/ws/2/recording/')).length, { timeout: 5000 }).toBe(1);
        await expect(rec).toHaveClass(/\bmb-dp-l-read\b/);
        await expect(foot(page)).toContainText('(read before, no request)');
        await rec.click();
        await expect(title(page)).toHaveText(/Release › Recording$/);
        await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
        expect(log.ws2.filter(u => /\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-credits/.test(u)), 'the card\'s lookup, once').toHaveLength(1);
    });
});

// Phase 3f of org/MB-POH-sync-withDiscogs.org: a CD stub and the
// documentation, read from their pages; a documentation search, from the
// wiki's search API (the site's own search page is Google's, rendered in
// the browser). Mutation list: scripts/mutations/mb-window-3f.json.
test.describe('CD stubs and documentation (Phase 3f)', () => {
    const STUB = '/cdstub/.0bu2pqNY67hHTrw09eWyhBPhsA-';
    const DOC = '/doc/Style/Titles';
    const SEARCH = '/search?query=release%20group&type=doc';
    const API = 'https://wiki.musicbrainz.org/api.php?action=query&list=search&format=json&srlimit=50&srsearch=release%20group';
    const title = (page) => dialog(page).locator(':scope > div > span').first();

    /**
     * Answers the wiki's search API (through the GM_xmlhttpRequest stub),
     * before the page loads.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<void>}
     */
    async function answerWiki(page) {
        await page.context().addInitScript((r) => { window.__gmXhrResponses = r; }, {
            [API]: { status: 200, responseText: json('wiki-api-search-release-group.json'), responseHeaders: 'content-type: application/json; charset=utf-8' },
        });
    }

    test('a CD stub: the card from its page; the window, its facts and its tracklist as a Compact table', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, STUB, 'Blues In Orbit');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Blues In Orbit (mfsl-cd-sacd)');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['CD stub', '11 tracks', '36:23', '621 lookups']);
        await expect(card(page)).toContainText('Ellington, Duke');
        await expect(card(page).locator('ol.mb-pop-tracks li')).toHaveCount(6);
        await expect(card(page).locator('ol.mb-pop-tracks li').first()).toContainText("Three J's Blues");
        await expect(card(page).locator('.mb-tt-dim')).toHaveText('+ 5 more');
        await page.keyboard.press('Space');
        const dlg = dialog(page);
        await expect(title(page)).toHaveText('CD stub');
        const kv = dlg.locator('.mb-dp-kv');
        // "[none]" is no barcode: the row is left out.
        await expect(kv.locator('dt')).toHaveText(['Artist', 'Tracks', 'Length', 'Disc ID', 'Added', 'Last modified', 'Lookups', 'Modified']);
        await expect(kv.locator('dd').nth(3)).toHaveText('.0bu2pqNY67hHTrw09eWyhBPhsA-');
        const tbl = dlg.locator('[data-mb-tbl="tracks"]');
        await expect(tbl.locator('thead th')).toHaveText([/^#/, /^Title/, /^Length/]);
        const rows = tbl.locator('tbody tr');
        await expect(rows).toHaveCount(11);
        await expect(rows.last().locator('td').nth(1)).toHaveText('Villes Ville Is The Place, Man');
        // Three-state sort on Title: A first.
        await tbl.locator('th[data-mb-tbl-sort="title"]').click();
        await expect(rows.first().locator('td').nth(1)).toHaveText('Blues in Blueprint');
        expect(log.html.filter(u => u.includes('/cdstub/')), 'the card\'s one page request').toEqual([`https://musicbrainz.org${STUB}`]);
        expect(log.ws2, 'no Web Service request').toEqual([]);
    });

    test('a documentation page: the card, status and first paragraph; the window, contents and the whole text, its links drilling in', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        const a = await addLink(page, DOC, 'Style / Titles');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Style / Titles');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['official style guideline']);
        await expect(card(page).locator('.mb-tt-body').last()).toHaveText('When entering a new release into MusicBrainz, all titles should be normalized according to the following guidelines.');
        await expect(card(page).locator('.mb-tt-dim')).toHaveText('9 sections');
        await page.keyboard.press('Space');
        const dlg = dialog(page);
        await expect(title(page)).toHaveText('Documentation');
        await expect(dlg.locator('a', { hasText: 'On the wiki' })).toHaveAttribute('href', 'https://wiki.musicbrainz.org/Style/Titles');
        const toc = dlg.locator('ul.mb-pop-doc-toc > li');
        await expect(toc).toHaveCount(11);
        await expect(toc.first()).toHaveText('Capitalization');
        await expect(toc.nth(8)).toHaveText('OC ReMix series');
        await expect(toc.nth(8)).toHaveClass('mb-pop-doc-toc2');
        const text = dlg.locator('.mb-pop-doc');
        // The headings as lines of their own, the status box and contents not repeated.
        await expect(text.locator('.mb-pop-doc-h2').first()).toHaveText('Capitalization');
        await expect(text.locator('.mb-pop-doc-h2')).toHaveCount(9);
        await expect(text).not.toContainText('Status:');
        await expect(text, 'the contents only on the left').not.toContainText('1 Capitalization');
        await expect(text.locator('h1, h2, h3, h4, script, form, input, table.tbl')).toHaveCount(0);
        await expect(text.locator('img'), 'the wiki\'s images are dropped').toHaveCount(0);
        // A link to another documentation page opens it in the window (its
        // anchor is not part of what is asked).
        const link = text.locator('a[href^="/doc/"]').first();
        await expect(link).toHaveAttribute('href', '/doc/Style#Language-specific_guidelines');
        await link.click();
        await expect(title(page)).toHaveText('Documentation › Documentation');
        await expect.poll(() => log.html.filter(u => u.includes('/doc/'))).toEqual([`https://musicbrainz.org${DOC}`, 'https://musicbrainz.org/doc/Style']);
    });

    test('a documentation search: one request to the wiki\'s search API; the card counts, the window lists every hit and opens a page', async ({ page }) => {
        await answerWiki(page);
        const log = await open(page, {
            settings: { sa_pop_mb: true }, showAll: false,
            pageFixture: (url) => (/\/doc\//.test(url) ? 'doc-style-titles.html' : null),
        });
        const a = await addLink(page, SEARCH, 'release group');
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-title')).toHaveText('release group');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['19 pages']);
        await expect(card(page).locator('ol.mb-pop-tracks li')).toHaveCount(6);
        await expect(card(page).locator('ol.mb-pop-tracks li').nth(1)).toContainText('Release Group');
        const asked = await page.evaluate(() => window.__gmXhrLog.filter(x => x.url.startsWith('https://wiki.musicbrainz.org/')));
        expect(asked.map(x => x.url), 'one request, the API').toEqual([API]);
        expect(asked[0].anonymous, 'anonymous, as every request to another site').toBe(true);
        await page.keyboard.press('Space');
        const dlg = dialog(page);
        await expect(title(page)).toHaveText('Documentation search');
        const tbl = dlg.locator('[data-mb-tbl="docsearch"]');
        const rows = tbl.locator('tbody tr');
        await expect(tbl.locator('thead th')).toHaveText([/^Page/, /^Snippet/, /^Updated/]);
        await expect(rows).toHaveCount(19);
        await expect(rows.nth(3).locator('a')).toHaveAttribute('href', '/doc/Style/Release_Group');
        await expect(rows.nth(1).locator('td').nth(2)).toHaveText('2023-03-10');
        // The snippet is text, the query marked in it.
        await expect(rows.nth(1).locator('td').nth(1).locator('span.searchmatch')).toHaveCount(0);
        await expect(rows.nth(1).locator('td').nth(1)).not.toContainText('searchmatch');
        await expect(rows.nth(1).locator('td').nth(1).locator('mark.mb-dg-hl').first()).toBeVisible();
        const q = tbl.locator('input.mb-tbl-q');
        await q.fill('edit');
        await expect(q).toBeFocused();
        await expect(rows.first().locator('a')).toContainText('Edit');
        await tbl.getByRole('button', { name: 'Clear filters' }).click();
        // The window used the card's record: still one request, past the
        // host's 1 s spacing (a second one could not have been sent sooner).
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        expect(await page.evaluate(() => window.__gmXhrLog.filter(x => x.url.startsWith('https://wiki.musicbrainz.org/')).length)).toBe(1);
        await rows.nth(3).locator('a').click();
        await expect(title(page)).toHaveText('Documentation search › Documentation');
        expect(log.html.filter(u => u.includes('/doc/'))).toEqual(['https://musicbrainz.org/doc/Style/Release_Group']);
    });

    test('what is not previewed: the list of CD stubs, another kind of search, a search without a query', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        for (const href of ['/cdstub/browse', '/search?query=release%20group&type=artist', '/search?query=&type=doc']) {
            const a = await addLink(page, href, href);
            await ctrlHover(page, a);
            await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
            await expect(card(page), href).toBeHidden();
        }
        expect(await page.evaluate(() => (window.__gmXhrLog || []).filter(x => x.url.includes('wiki.musicbrainz.org')).length)).toBe(0);
    });
});

// A window filter's matches (`_hlEsc()`, mark.mb-dg-hl) take the tables'
// filter-highlight colours. The library resolves an unset key to its schema
// default, so the inline fallback counts only for a value stored empty (a
// cleared colour picker): there the tables fall back to red, and the window
// fell back to 'inherit' until 2026-10-28 (scripts/audit-config-defaults.py,
// "NEW drifting fallback").
test.describe('MusicBrainz link previews: a window filter\'s highlight', () => {
    test('a colour stored empty falls back to the tables\' red, not to the text\'s colour', async ({ page }) => {
        await open(page, { settings: { sa_pop_mb: true, sa_column_filter_highlight_color: '' }, showAll: false });
        const color = await page.evaluate(() => {
            for (const ss of Array.from(document.styleSheets)) {
                let rules;
                try {
                    rules = ss.cssRules;
                } catch (_) {
                    continue;
                }
                for (const r of Array.from(rules)) if (r.selectorText === '.mb-dp-dialog mark.mb-dg-hl') return r.style.color;
            }
            return null;
        });
        expect(color, 'the window\'s rule is installed and red').toBe('red');
    });
});

// A release window's cover strip after the archive did not answer (a 429 or
// 5xx, a network error): `_artFetchEntityImages()` keeps that failure for the
// session, so ⟳ read it back and never asked again (org/POH-headerline.org
// item 3, P2: vzell saw "The archive did not answer." on discogs.com, and the
// archive answered fine an hour later). `_mbPopArtLoad()` forgets it on ⟳.
test.describe('MusicBrainz link previews: a cover strip the archive did not answer', () => {
    test('⟳ asks the archive again, and the strip fills', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true } });
        let fail = true;
        // A page route wins over open()'s context route; it passes on once
        // the archive is back.
        await page.route(/^https:\/\/coverartarchive\.org\/release\/[0-9a-f-]{36}\/?$/, (route) => (fail
            ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' })
            : route.fallback()));
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('Greetings From Asbury Park, N.J.');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        await expect(area).toContainText('The archive did not answer.');
        fail = false;
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '⟳' }).click();
        await expect(area.locator('.mb-dp-gallery img')).toHaveCount(16);
        expect(log.caa, 'the archive asked again, once').toEqual([`/release/${REL_ID}`]);
    });
});

// The window's path in its title bar (org/POH-headerline.org, 2026-10-28;
// mockup https://claude.ai/artifact/YCnV4DZA5R4quLAGkmhCpC): every step a
// glyph linking its kind's documentation and a button back to it, the oldest
// behind "…". The fixture profile reads kinds (`sa_dp_path_label: 'kind'`,
// tests/support/loadPage.js); the names test seeds the default back.
test.describe('MusicBrainz link previews: the window\'s path (org/POH-headerline.org)', () => {
    const title = (page) => dialog(page).locator(':scope > div > span').first();
    const steps = (page) => title(page).locator('.mb-dp-crumb-step');
    const glyphs = (page) => title(page).locator('.mb-dp-crumb > a.mb-dp-crumb-g');
    const backBtn = (page) => dialog(page).locator('button.mb-dp-tbtn', { hasText: '← Back' });
    // The release window's links: its release group, and in the release
    // group's table a release's title (its cover opens the viewer).
    const rgLink = (page) => dialog(page).locator('.mb-dp-area a[href^="/release-group/"]').first();
    const relInRg = (page) => dialog(page).locator('[data-mb-tbl="rg-releases"] tbody td:nth-child(2) a[href^="/release/"]').first();

    /**
     * Opens the window on the page's first release, then drills down to its
     * release group and one of its releases: three steps.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object} [opts] - For `open()`.
     * @returns {Promise<{log: Object, names: string[]}>} The request log, and each step's link text.
     */
    async function threeSteps(page, opts = {}) {
        const log = await open(page, { showAll: false, ...opts, settings: { sa_pop_mb: true, ...(opts.settings || {}) } });
        const names = [(await relLink(page).textContent()).trim()];
        await ctrlHover(page, relLink(page));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('[data-mb-tbl="tracks"] tbody tr').first()).toBeVisible();
        names.push((await rgLink(page).textContent()).trim());
        await rgLink(page).click();
        await expect(dialog(page).locator('[data-mb-tbl="rg-releases"] tbody tr').first()).toBeVisible();
        names.push((await relInRg(page).textContent()).trim());
        await relInRg(page).click();
        await expect(steps(page)).toHaveCount(3);
        await page.mouse.move(0, 0);
        return { log, names };
    }

    test('every step has its glyph, linking its kind\'s documentation; the title\'s text is the kinds, as before', async ({ page }) => {
        await threeSteps(page);
        await expect(title(page)).toHaveText('Release › Release group › Release');
        await expect(glyphs(page)).toHaveCount(3);
        await expect(glyphs(page).locator('img.mb-dp-kind-icon')).toHaveCount(3);
        expect(await glyphs(page).locator('img').evaluateAll(xs => xs.map(x => x.getAttribute('src').replace(/^.*\//, ''))))
            .toEqual(['release.svg', 'release_group.svg', 'release.svg']);
        expect(await glyphs(page).evaluateAll(xs => xs.map(x => x.getAttribute('href'))))
            .toEqual(['https://musicbrainz.org/doc/Release', 'https://musicbrainz.org/doc/Release_Group', 'https://musicbrainz.org/doc/Release']);
        // Only the step shown now is current; the others are ways back.
        await expect(steps(page).nth(2)).toHaveAttribute('aria-current', 'step');
        await expect(title(page).locator('[aria-current]')).toHaveCount(1);
    });

    test('names (the default): each step reads the name of what it shows; a view reads its kind', async ({ page }) => {
        const { names } = await threeSteps(page, { settings: { sa_dp_path_label: undefined } });
        expect(names.every(Boolean), 'the three links have names').toBe(true);
        await expect(steps(page)).toHaveText(names);
        await expect(title(page)).toHaveText(names.join(' › '));
        // The editing history is a view of the release: its kind, not a name.
        await page.keyboard.press('h');
        await expect(steps(page)).toHaveCount(3);
        await expect(steps(page).last()).toHaveText('Editing history');
        await expect(title(page).locator('.mb-dp-crumb-more')).toHaveCount(1);
    });

    test('a click on an earlier step goes back to it, from memory; the steps after it go', async ({ page }) => {
        const { log } = await threeSteps(page);
        const asked = { lookups: log.lookups.length, browses: log.browses.length, ws2: log.ws2.length };
        await steps(page).nth(1).click();
        await expect(title(page)).toHaveText('Release › Release group');
        await expect(dialog(page).locator('[data-mb-tbl="rg-releases"] tbody tr').first()).toBeVisible();
        await expect(backBtn(page)).toBeVisible();
        await steps(page).first().click();
        await expect(title(page)).toHaveText('Release');
        await expect(dialog(page).locator('[data-mb-tbl="tracks"] tbody tr').first()).toBeVisible();
        await expect(backBtn(page)).toBeHidden();
        // The step shown now does nothing.
        await steps(page).first().click();
        await expect(title(page)).toHaveText('Release');
        expect({ lookups: log.lookups.length, browses: log.browses.length, ws2: log.ws2.length }, 'nothing asked again').toEqual(asked);
    });

    test('"…" holds the earlier steps: a menu of the whole path, a click goes back', async ({ page }) => {
        await threeSteps(page);
        // A fourth step: the second release's release group.
        await rgLink(page).click();
        await expect(steps(page)).toHaveCount(3);
        await expect(title(page)).toHaveText('… › Release group › Release › Release group');
        const more = title(page).locator('button.mb-dp-crumb-more');
        await expect(more).toHaveAttribute('aria-expanded', 'false');
        await more.click();
        const pop = dialog(page).locator('#mb-dp-path-pop');
        await expect(pop).toBeVisible();
        await expect(more).toHaveAttribute('aria-expanded', 'true');
        const rows = pop.locator('button.mb-dp-path-row');
        await expect(rows).toHaveCount(4);
        await expect(rows.locator('b')).toHaveText(['Release', 'Release group', 'Release', 'Release group']);
        await expect(rows.locator('.mb-hist-h')).toHaveText(['1', 'shown', 'shown', 'now']);
        await expect(rows.locator('img.mb-dp-kind-icon')).toHaveCount(4);
        await expect(rows.last()).toBeDisabled();
        // Escape closes it, and only it.
        await page.keyboard.press('Escape');
        await expect(pop).toHaveCount(0);
        await expect(dialog(page)).toBeVisible();
        await more.click();
        await pop.locator('button.mb-dp-path-row').first().click();
        await expect(pop).toHaveCount(0);
        await expect(title(page)).toHaveText('Release');
        await expect(backBtn(page)).toBeHidden();
    });

    test('a narrow window keeps two steps after "…"', async ({ page }) => {
        await threeSteps(page);
        await expect(title(page)).toHaveText('Release › Release group › Release');
        await dialog(page).evaluate((d) => { d.style.width = '540px'; d.style.minWidth = '0'; });
        await expect(title(page)).toHaveText('… › Release group › Release');
        await dialog(page).evaluate((d) => { d.style.width = '900px'; });
        await expect(title(page)).toHaveText('Release › Release group › Release');
    });

    test('resting on a step shows its own card from memory, no Ctrl, no request; Space goes back to it', async ({ page }) => {
        const { log } = await threeSteps(page);
        const asked = { lookups: log.lookups.length, browses: log.browses.length, ws2: log.ws2.length };
        await steps(page).first().hover();
        await expect(card(page)).toBeVisible();
        await expect(card(page).locator(':scope > .mb-pop-kind-head')).toHaveText('Release');
        await expect(card(page).locator(':scope > .mb-pop-kind-head img.mb-pop-kind-icon')).toHaveAttribute('src', /\/release\.svg$/);
        await expect(card(page).locator('.mb-tt-title').first()).toHaveText(/^Greetings From Asbury Park, N\.J\./);
        await expect(card(page).locator('.mb-tt-foot').last()).toContainText('Step 1 of 3');
        // One foot line, the step's: the source's own ("Space more") would
        // say what Space does on the page, not here.
        await expect(card(page).locator('.mb-tt-foot')).toHaveCount(1);
        await expect(dialog(page).locator('.mb-dp-wfoot')).toContainText('Back to: Release');
        expect({ lookups: log.lookups.length, browses: log.browses.length, ws2: log.ws2.length }, 'the card asked nothing').toEqual(asked);
        await page.keyboard.press('Space');
        await expect(title(page)).toHaveText('Release');
        await expect(dialog(page)).toBeVisible();
        // The release itself, not the step's stand-in target (which is named
        // like it and shows nothing).
        await expect(dialog(page).locator('[data-mb-tbl="tracks"] tbody tr').first()).toBeVisible();
        // The pointer now rests on the step shown now: its card may show,
        // and says so; moving away hides it.
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
    });

    test('a glyph\'s card is its kind\'s documentation; a click shows it in the window, Back returns', async ({ page }) => {
        const { log } = await threeSteps(page, { pageFixture: (url) => (/\/doc\/Release\/?$/.test(url) ? 'doc-style-titles.html' : null) });
        const g = glyphs(page).last();
        await ctrlHover(page, g);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator(':scope > .mb-pop-kind-head')).toHaveText('Documentation');
        await expect(dialog(page).locator('.mb-dp-wfoot')).toContainText('Documentation: musicbrainz.org/doc/Release');
        await page.mouse.move(0, 0);
        await g.click();
        await expect(title(page)).toHaveText('… › Release group › Release › Documentation');
        expect(log.html.filter(u => u.includes('/doc/'))).toEqual(['https://musicbrainz.org/doc/Release']);
        await backBtn(page).click();
        await expect(title(page)).toHaveText('Release › Release group › Release');
    });
});

// The genre list (`/genres`, vzell 2026-10-28): read from the page
// (`_mbParseGenresPage()`, tests/fixtures/genres-list.html, built from
// debug/genres-initial.html by scripts/build-genres-fixture.py).
test.describe('MusicBrainz link previews: the genre list (/genres)', () => {
    /**
     * Opens the host page with the MusicBrainz cards on, serving /genres
     * from its fixture, and adds a link to it.
     *
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<{log: Object, a: import('@playwright/test').Locator}>}
     */
    async function genresLink(page) {
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        await page.context().route(/^https:\/\/musicbrainz\.org\/genres\/?$/, (route) => {
            log.html.push(route.request().url());
            return route.fulfill({ path: path.join(__dirname, 'genres-list.html'), contentType: 'text/html' });
        });
        return { log, a: await addLink(page, '/genres', 'genres') };
    }

    test('the card: how many, from and to, how many disambiguated, the intro; one request', async ({ page }) => {
        const { log, a } = await genresLink(page);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator(':scope > .mb-pop-kind-head')).toHaveText('Genre list');
        await expect(card(page).locator('.mb-tt-pill')).toHaveText(['2,215 genres']);
        const kv = await card(page).locator('dl.mb-dp-kv').evaluate(dl => Array.from(dl.children).map(x => x.textContent));
        expect(kv.slice(0, 2)).toEqual(['From', '2 tone to zydeco']);
        expect(kv.slice(2)).toEqual(['Disambiguated', '32']);
        await expect(card(page)).toContainText('These are all the genres currently available for use in MusicBrainz.');
        expect(log.html).toEqual(['https://musicbrainz.org/genres']);
    });

    test('the window: every genre, letters A–Z as chips, a filter, a disambiguation; a genre drills into its card', async ({ page }) => {
        const { log, a } = await genresLink(page);
        await ctrlHover(page, a);
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const tbl = dialog(page).locator('[data-mb-tbl="genres"]');
        await expect(tbl.locator('.mb-dg-morerow')).toContainText('Showing 200 of 2,215');
        await expect(tbl.locator('tbody tr').first().locator('td').first()).toHaveText('2 tone');
        const chips = tbl.locator('.mb-dg-fc[data-mb-tbl-chip]');
        expect(await chips.evaluateAll(xs => xs.map(x => x.getAttribute('data-mb-tbl-chip'))), 'A–Z, not by count')
            .toEqual(['0–9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
        await tbl.locator('.mb-dg-more[data-mb-tbl-act="morechips"]').click();
        await expect(chips.last(), 'anything not a cased letter (an ʻokina) last').toHaveAttribute('data-mb-tbl-chip', '#');
        await tbl.locator('.mb-dg-fc[data-mb-tbl-chip="Z"]').click();
        const firsts = await tbl.locator('tbody tr td:first-child').allTextContents();
        expect(firsts.length).toBeGreaterThan(0);
        expect(firsts.every(x => /^z/i.test(x)), firsts.join(', ')).toBe(true);
        await tbl.locator('[data-mb-tbl-act="clear"]').click();
        // The filter reads the disambiguation too.
        await tbl.locator('input.mb-tbl-q').fill('not rock from Asia');
        await expect(tbl.locator('tbody tr')).toHaveCount(1);
        await expect(tbl.locator('tbody tr td').first()).toHaveText('asian rock');
        await expect(tbl.locator('tbody tr td').nth(1)).toHaveText('pluggnb subgenre - not rock from Asia');
        await tbl.locator('input.mb-tbl-q').fill('roots rock');
        await tbl.locator('tbody tr td:first-child a', { hasText: /^roots rock$/ }).click();
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Genre list › Genre');
        await expect.poll(() => log.html).toEqual(['https://musicbrainz.org/genres', 'https://musicbrainz.org/genre/883d75d5-1365-46ee-8cbe-d3ae2facdd93']);
    });

    test('a tag\'s card adds its genre\'s disambiguation once the list is in memory; it never asks for the list', async ({ page }) => {
        const COMMENT = 'a test disambiguation';
        const log = await open(page, { settings: { sa_pop_mb: true }, showAll: false });
        // alternative rock has none: the list served here gives it one.
        const html = fs.readFileSync(path.join(__dirname, 'genres-list.html'), 'utf8')
            .replace('<bdi>alternative rock</bdi></a>', `<bdi>alternative rock</bdi></a> <span class="comment">(<bdi>${COMMENT}</bdi>)</span>`);
        await page.context().route(/^https:\/\/musicbrainz\.org\/genres\/?$/, (route) => {
            log.html.push(route.request().url());
            return route.fulfill({ status: 200, contentType: 'text/html', body: html });
        });
        const tag = await addLink(page, '/tag/alternative%20rock', 'alternative rock');
        await ctrlHover(page, tag);
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText('Tag of the genre alternative rock');
        // Not the request log: a request would only leave after the rate
        // gate. `_mbLoad()` marks a record loading at once.
        expect(await page.evaluate(() => window.__saTest.mbPopStatus('pop:page:genres:all')), 'a tag card asks no genre list').toBeNull();
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        const list = await addLink(page, '/genres', 'genres');
        await ctrlHover(page, list);
        await expect(card(page)).toContainText('fetched now');
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        await ctrlHover(page, tag);
        await expect(card(page).locator('.mb-tt-comment').first()).toHaveText(`Tag of the genre alternative rock (${COMMENT})`);
        expect(log.html.filter(u => u.endsWith('/genres'))).toHaveLength(1);
    });
});

// The h1's entity icon (vzell 2026-10-28): MusicBrainz draws it as the
// header div's CSS background, so an empty link is laid over it
// (`_h1KindDocInstall()`); it shows the kind's documentation as the glyph
// in the window's path does.
test.describe('MusicBrainz link previews: the h1\'s entity icon links its kind\'s documentation', () => {
    const icon = (page) => page.locator('div.rgheader > a.mb-h1-kind-doc');
    const docFixture = (url) => (/\/doc\/Release_Group\/?$/.test(url) ? 'doc-style-titles.html' : null);

    test('over the icon, after the render; hover shows the Documentation card, a click opens it in the window', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb: true }, pageFixture: docFixture });
        await expect(icon(page)).toHaveCount(1);
        await expect(icon(page)).toHaveAttribute('data-mb-pop', 'doc:Release_Group');
        await expect(icon(page)).toHaveAttribute('href', '/doc/Release_Group');
        expect(await icon(page).getAttribute('title'), 'no title: it would be a "Link title" note').toBeNull();
        // It covers the 32px background icon, in the header's top-left corner.
        const box = await icon(page).boundingBox();
        const head = await page.locator('div.rgheader').boundingBox();
        expect({ w: box.width, h: box.height, dx: Math.round(box.x - head.x), dy: Math.round(box.y - head.y) })
            .toEqual({ w: 32, h: 32, dx: 0, dy: 0 });
        await ctrlHover(page, icon(page));
        await expect(card(page)).toContainText('fetched now');
        await expect(card(page).locator(':scope > .mb-pop-kind-head')).toHaveText('Documentation');
        expect(log.html.filter(u => u.includes('/doc/'))).toEqual(['https://musicbrainz.org/doc/Release_Group']);
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        await icon(page).click();
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Documentation');
        await expect(dialog(page).locator('.mb-pop-doc')).toBeVisible();
        expect(page.url(), 'the click stayed on the page').toBe(RG_URL);
        expect(log.html.filter(u => u.includes('/doc/')), 'the window used the card\'s record').toHaveLength(1);
    });

    test('no link while the MusicBrainz cards are off', async ({ page }) => {
        await open(page, { showAll: false, settings: { sa_pop_mb: false, sa_pop_ext: true } });
        await expect(page.locator('a.mb-h1-kind-doc')).toHaveCount(0);
        await expect(page.locator('.mb-h1-kind-doc-host')).toHaveCount(0);
    });
});
