'use strict';

// The popup engine on MusicBrainz table links (org/iframe.org, Phase 2):
// every entity link in a `table.tbl` body gets a card (Ctrl gate, as the
// foreign hosts' previews) and a pinned window (Space), from the Web
// Service, behind ONE opt-in setting, `sa_pop_mb`.
//
// Pins, in order:
//   1. off by default: no stylesheet, no card, no request;
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
    test('off by default: no stylesheet, no card, no request', async ({ page }) => {
        // A fake clock (time still flows) lets the test jump past the card's
        // show timer before asserting there is none, as detail-preview.spec.js does.
        await page.clock.install();
        const log = await open(page);
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
        expect(log.ws2).toEqual([expect.stringContaining(`/ws/2${EVENT}?inc=artist-rels+place-rels&fmt=json`)]);
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
        expect(log.ws2.filter(u => u.includes('inc=recording-rels+release-rels'))).toHaveLength(1);
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
