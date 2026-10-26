'use strict';

// The popup engine on links to OTHER sites (org/iframe.org, "* generalize to
// URLs", U1): `_extSource()`, behind ONE setting, `sa_pop_ext` (on touch its twin).
// Every external request is a `GM_xmlhttpRequest` (fetch() cannot read
// another origin), answered here by the stub's `window.__gmXhrResponses`,
// which also logs each call (`window.__gmXhrLog`) — nothing reaches the
// network.
//
// Pins, in order:
//   1. off when switched off: no card, no request; the schema default (on,
//      plain hover); the touch twin does nothing on a desktop;
//   2. what is previewed (`__saTest.popResolve()`): a link to another site
//      in the "URLs" sub-table and in the annotation; NOT an absolute
//      musicbrainz.org link, the "[info]" link, an artwork archive, a link
//      around an image or a share button; outside the scope only with
//      `sa_pop_mb_page`; the entity cards keep their own links;
//   3. FIRST CONTACT (answer 7): a host the script never reached gets a card
//      that asks nothing; Space loads it — anonymously — and remembers the
//      host; a later hover of a known host loads at once;
//   4. the card's fields and context ("MusicBrainz: setlist.fm of this
//      event"), one request then memory, IndexedDB after a reload;
//   5. the link's status: a dead link (kept for this page load only, never
//      in IndexedDB), Cloudflare's browser check (NOT dead), a moved page
//      with its final URL, a PDF told from its headers (aborted there);
//   6. a failure is shown and not kept (the next hover asks again), and a
//      host Tampermonkey refused is not remembered;
//   7. a hover that moved on asks nothing, and the rate gate is per host;
//   8. the window: Extracted, the Live page from the hover's own fetch with
//      no script left, ⟳ asks again, ← → step down the URL column;
//   9. U2, MusicBrainz URL entities: the "[info]" link's card (named after
//      its link while it loads, one lookup with every relationship include),
//      its window, a release group (typed and keyed "release_group") linking
//      /release-group/, the card's and window's caps; an external
//      window's "MusicBrainz knows this URL" — never on hover, by the
//      "[info]" MBID (sharing the "[info]" card's answer) or else by
//      `?resource=` with the href ATTRIBUTE verbatim, a 404 as "not in
//      MusicBrainz" for this page load only, through the shared MusicBrainz
//      rate gate.
//
// Mutation list: scripts/mutations/popup-ext.json.
//
// Host page: tests/fixtures/event-overview.html (an event whose "Show all"
// turns the relationships into tables, its URLs into a "URLs" sub-table).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL_EVENT = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const BUTTON = 'button[data-label="Show all Relationships for Event"]';
const SETLIST = 'https://www.setlist.fm/setlist/bruce-springsteen/2025/co-op-live-manchester-england-43535b97.html';
const HTML_HEADERS = 'Content-Type: text/html; charset=utf-8';
// How long a run of Discogs pages may take before "N of N loaded": the pages
// go through the Discogs gate one by one (1 s apart with the default token).
// Five pages took 6.5 s alone on petri, but the third of them was still
// queued after 20 s in a 12-worker test:full (2026-10-24), the gate's
// wall-clock waits also stretched by that host's clock steps (500 ms back
// every 5.5 s). 45 s: still far short of the test's own timeout.
const DG_RUN_MS = 45000;
const SETLIST_HTML = '<!doctype html><html lang="en"><head><title>Concert Setlist | setlist.fm</title>' +
    '<meta property="og:title" content="Bruce Springsteen Setlist at Co-op Live, Manchester">' +
    '<meta property="og:type" content="setlist"><meta property="og:site_name" content="setlist.fm">' +
    '<meta name="description" content="Get the Bruce Springsteen Setlist of the concert at Co-op Live, Manchester.">' +
    '<meta property="og:image" content="https://img.example/setlist.png">' +
    `<link rel="canonical" href="${SETLIST}"><link rel="preload" as="script" href="https://img.example/bundle.js">` +
    '<link rel="preconnect" href="https://img.example"></head><body><p id="live-probe">The setlist itself</p>' +
    '<script>window.__liveRan = 1;</script><a href="#" onclick="window.__liveRan = 2">x</a></body></html>';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
// U2: the setlist.fm link's URL entity ("[info]" beside it), and the inc set
// of every URL lookup (every relationship include, nothing else: U0 X7).
const SETLIST_URL_ID = '2e9887a2-ec25-4423-9f10-eee13f180512';
const URL_INC = 'area-rels+artist-rels+event-rels+instrument-rels+label-rels+place-rels+recording-rels' +
    '+release-rels+release-group-rels+series-rels+url-rels+work-rels';
const SETLIST_LOOKUP = `https://musicbrainz.org/ws/2/url/${SETLIST_URL_ID}?inc=${URL_INC}&fmt=json`;
const SETLIST_EVENT = JSON.parse(json('ws2-pop-url-setlist.json')).relations[0].event.name;
const infoLink = (page) => page.locator(`table.tbl a[href="/url/${SETLIST_URL_ID}"]`).first();
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const setlistLink = (page) => page.locator(`table.tbl a[href="${SETLIST}"]`).first();
// The stub logs every GM_xmlhttpRequest; the script's own changelog check
// (raw.githubusercontent.com) is not a preview's.
const xhrLog = (page) => page.evaluate(() => (window.__gmXhrLog || [])
    .filter(r => !/^https:\/\/raw\.githubusercontent\.com\//.test(r.url))
    .map(r => ({ url: r.url, anonymous: r.anonymous })));
const knownHosts = (page) => page.evaluate(() => (window.__gmValues || {}).sa_pop_ext_hosts || []);

/**
 * Expands the sub-table that holds the setlist.fm link (the "URLs" table
 * renders collapsed), by its own h3, and waits until the link shows.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function showUrlsTable(page) {
    await page.evaluate((u) => {
        const a = document.querySelector(`table.tbl a[href="${u}"]`);
        const t = a && a.closest('table.tbl');
        if (!t || t.getClientRects().length) return;
        let h = t.previousElementSibling;
        while (h && !h.matches('h3.mb-toggle-h3')) h = h.previousElementSibling;
        if (h) h.click();
    }, SETLIST);
    await expect(setlistLink(page)).toBeVisible();
}

/**
 * Loads the event page with `responses` as the `GM_xmlhttpRequest` answers
 * (kept across reloads), presses "Show all" and waits for the render. The
 * Web Service's URL lookups (U2) are answered from the setlist.fm capture
 * (by its MBID or its `?resource=`), else 404, unless `ws2` answers (it may
 * return a promise, to hold an answer back); each is logged with the time
 * it arrived.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, responses?: Object, press?: boolean,
 *   ws2?: function(string): (?{status: number, body: string}|Promise<?{status: number, body: string}>)}} [opts]
 * @returns {Promise<{ws2: string[], ws2At: number[]}>}
 */
async function openEvent(page, { settings = {}, responses = {}, press = true, ws2 = null } = {}) {
    const log = { ws2: [], ws2At: [] };
    const ctx = page.context();
    await ctx.route(/\/ws\/2\/url[/?]/, async (route) => {
        const url = route.request().url();
        log.ws2.push(url);
        log.ws2At.push(performance.now());
        const own = ws2 ? await ws2(url) : null;
        const known = url.startsWith(`https://musicbrainz.org/ws/2/url/${SETLIST_URL_ID}?`) ||
            url.includes(`resource=${encodeURIComponent(SETLIST)}&`);
        const r = own || (known ? { status: 200, body: json('ws2-pop-url-setlist.json') } : { status: 404, body: '{"error":"Not Found"}' });
        return route.fulfill({ status: r.status, contentType: 'application/json', body: r.body });
    });
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.route('https://img.example/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    // The real site is never asked: a page fetch() (instead of the stubbed
    // GM_xmlhttpRequest) fails here, as it would against CORS.
    await ctx.route('https://www.setlist.fm/**', (route) => route.abort('blockedbyclient'));
    // A Live page's frame loads the site's own CSS and images (its <base> is
    // the site): never from the network here. Brucebase's year page alone
    // names 260 images on brucebase.wdfiles.com, and the frame's load event,
    // which marked and scrolled to the show, waited for all of them: the
    // Brucebase Live page test failed whenever the real site was slow
    // (2026-10-17: 5 runs in a row, main too). A test that wants them answers
    // them itself (a later route wins).
    await ctx.route(/^https?:\/\/(?:[^/]+\.)?(?:wikidot\.com|wdfiles\.com|springsteenlyrics\.com|jungleland\.it|brucespringsteen\.it)\//,
        (route) => route.abort('blockedbyclient'));
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, responses);
    await loadUserscriptPage(page, {
        url: URL_EVENT, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_event_overview: true, sa_event_overview_setlist: false, sa_rich_tooltip_delay_ms: 0,
            // Icons add a request per site: off here, so the other tests
            // count only the page's; the icon test switches them on.
            sa_pop_ext_favicons: false,
            ...settings,
        },
    });
    await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    if (press) {
        await page.click(BUTTON);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await showUrlsTable(page);
    }
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Re-runs the userscript on a reload and presses "Show all" again.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function reloadEvent(page) {
    await page.reload();
    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await expect(page.locator(BUTTON)).toBeVisible({ timeout: 30000 });
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await showUrlsTable(page);
    await page.mouse.move(0, 0);
}

/**
 * Hovers an element with Ctrl held (down while parked, up after, so a later
 * Space is not Ctrl+Space), as popup-mb.spec.js does.
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
 * Adds links to other sites at the top of the annotation (its body is
 * collapsed below its first lines), as an annotation would carry them.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} hrefs
 * @returns {Promise<void>}
 */
async function addAnnotationLinks(page, hrefs) {
    await page.evaluate((list) => {
        const host = document.querySelector('.annotation .annotation-body') || document.querySelector('.annotation');
        const p = document.createElement('p');
        p.className = 'ext-probe';
        list.forEach((h, i) => {
            const a = document.createElement('a');
            a.setAttribute('href', h);
            a.setAttribute('rel', 'nofollow');
            a.textContent = `probe ${i + 1}`;
            p.append(a, ' ');
        });
        host.insertBefore(p, host.firstChild);
    }, hrefs);
    // The render collapses the page's h2 sections ("▲ Annotation"): open it.
    const probe = page.locator('.ext-probe a').first();
    if (!await probe.isVisible()) await page.locator('.annotation h2').first().click();
    await expect(probe).toBeVisible();
}

/**
 * Whether the detail-page database holds a key (call only once the script
 * has created it: opening a missing database here would create it without
 * its store).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @returns {Promise<boolean>}
 */
const idbHas = (page, key) => page.evaluate((k) => new Promise((resolve) => {
    const req = indexedDB.open('vz-saed-detail-pages');
    req.onsuccess = () => {
        const db = req.result;
        try {
            const g = db.transaction('pages', 'readonly').objectStore('pages').get(k);
            g.onsuccess = () => { resolve(!!g.result); db.close(); };
            g.onerror = () => { resolve(false); db.close(); };
        } catch (_) {
            resolve(false);
            db.close();
        }
    };
    req.onerror = () => resolve(false);
}), key);

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || '');
        if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
    });
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('external link previews (sa_pop_ext)', () => {
    test('off when switched off: no card, no request', async ({ page }) => {
        // Off is loadPage.js's FIXTURE_SETTINGS_OVERRIDE; the schema default
        // (on since org/non-MB-sites.org) has its own test below.
        await page.clock.install();
        await openEvent(page, { settings: { sa_pop_ext_hosts: ['www.setlist.fm'] } });
        await ctrlHover(page, setlistLink(page));
        await page.clock.fastForward(1000);
        expect(await page.locator('#mb-dp-style, #mb-dp-peek, #mb-dp-dialog').count()).toBe(0);
        expect(await xhrLog(page)).toEqual([]);
    });

    test('the schema default: on, on a plain hover', async ({ page }) => {
        // `undefined` seeds nothing, so both keys fall back to configSchema.
        await openEvent(page, {
            settings: { sa_pop_ext: undefined, sa_dp_hover_without_ctrl: undefined, sa_pop_ext_hosts: ['www.setlist.fm'] },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML } },
        });
        await page.mouse.move(0, 0);
        await setlistLink(page).scrollIntoViewIfNeeded();
        await setlistLink(page).hover();
        await expect(card(page)).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
    });

    test('the touch twin does nothing on a desktop', async ({ page }) => {
        // `sa_pop_ext_on_touch` replaces `sa_pop_ext` only on a touch-primary
        // device (`_popSettingOn()`); here the plain key, off, is the one.
        await page.clock.install();
        await openEvent(page, { settings: { sa_pop_ext_on_touch: true, sa_pop_ext_hosts: ['www.setlist.fm'] } });
        await ctrlHover(page, setlistLink(page));
        await page.clock.fastForward(1000);
        expect(await page.locator('#mb-dp-style, #mb-dp-peek, #mb-dp-dialog').count()).toBe(0);
        expect(await xhrLog(page)).toEqual([]);
    });

    test('what is previewed: links to other sites, in scope, never MusicBrainz, artwork, images or share buttons', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true, sa_pop_mb: true } });
        await addAnnotationLinks(page, [
            'https://en.wikipedia.org/wiki/TeachRock',
            'https://musicbrainz.org/area/852531bf-3410-401f-b432-9c3157a386b9',
            'https://eventartarchive.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8',
            'https://www.facebook.com/sharer.php?u=https%3A%2F%2Fexample.org',
            'mailto:someone@example.org',
            'https://www.youtube.com/playlist?list=PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt',
            'http://www.youtube.com/brucebasewiki',
        ]);
        const r = await page.evaluate((setlist) => {
            const R = (el) => window.__saTest.popResolve(el);
            const probes = Array.from(document.querySelectorAll('.ext-probe a'));
            const img = document.createElement('a');
            img.setAttribute('href', 'https://img.example/page');
            img.innerHTML = '<img src="https://img.example/x.png" alt="">';
            probes[0].parentElement.appendChild(img);
            // Outside every scope: a paragraph of #page that is no table,
            // relationship list, annotation or external-links list.
            const outside = document.createElement('a');
            outside.setAttribute('href', 'https://en.wikipedia.org/wiki/Outside');
            outside.textContent = 'outside';
            document.querySelector('#page').appendChild(outside);
            const relLink = document.querySelector('table.tbl tbody a[href^="/artist/"]');
            return {
                table: R(document.querySelector(`table.tbl a[href="${setlist}"]`)),
                info: R(document.querySelector('table.tbl a[href^="/url/"]')),
                wiki: R(probes[0]), mbAbs: R(probes[1]), art: R(probes[2]), share: R(probes[3]), mail: R(probes[4]),
                ytList: R(probes[5]), ytChannel: R(probes[6]),
                img: R(img), outside: R(outside), entity: R(relLink),
            };
        }, SETLIST);
        expect(r.table).toBe(`ext|ext:generic:${SETLIST}`);
        expect(r.wiki, 'the Wikipedia reader (U3)').toBe('ext|ext:wikipedia:https://en.wikipedia.org/wiki/TeachRock');
        expect(r.ytList, 'a playlist is the YouTube reader\'s').toBe('ext|ext:youtube:https://www.youtube.com/playlist?list=PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt');
        expect(r.ytChannel, 'a channel is not (oEmbed has none): the generic reader').toBe('ext|ext:generic:http://www.youtube.com/brucebasewiki');
        expect(r.info, 'the "[info]" link is MusicBrainz\'s own: the url kind (U2)').toMatch(/^mb-entity\|url:[0-9a-f-]{36}$/);
        expect(r.mbAbs, 'an absolute musicbrainz.org link is not another site').toBeNull();
        expect(r.art, 'artwork has its own preview').toBeNull();
        expect(r.share).toBeNull();
        expect(r.mail).toBeNull();
        expect(r.img, 'a link around an image').toBeNull();
        expect(r.outside, 'outside the scope without sa_pop_mb_page').toBeNull();
        expect(r.entity, 'the entity cards keep their links').toMatch(/^mb-entity\|artist:/);

        // Not GM_setValue: the GM stub re-applies its seeds on every load, and
        // loadPage.js's FIXTURE_SETTINGS_OVERRIDE seeds sa_pop_mb_page false,
        // so a stored true would be overwritten by the reload. An init script
        // registered after the stub's runs after it.
        await page.context().addInitScript(() => {
            if (window.__gmValues) window.__gmValues.sa_pop_mb_page = true;
        });
        await page.reload();
        await addRequiredLibs(page);
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.addScriptTag({ path: USERSCRIPT_PATH });
        await expect(page.locator(BUTTON)).toBeVisible({ timeout: 30000 });
        const wide = await page.evaluate(() => {
            const outside = document.createElement('a');
            outside.setAttribute('href', 'https://en.wikipedia.org/wiki/Outside');
            document.querySelector('#page').appendChild(outside);
            return window.__saTest.popResolve(outside);
        });
        expect(wide, 'page-wide scope (sa_pop_mb_page)').toBe('ext|ext:wikipedia:https://en.wikipedia.org/wiki/Outside');
    });

    test('first contact: a hover asks nothing; Space loads it anonymously and remembers the host', async ({ page }) => {
        await page.clock.install();
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML } },
        });
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText('not contacted yet');
        await expect(card(page)).toContainText('MusicBrainz: setlist.fm of this event');
        await expect(card(page)).toContainText('Tampermonkey asks once');
        await page.clock.fastForward(5000);
        expect(await xhrLog(page), 'a hover never makes the first request').toEqual([]);

        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('Web page');
        await expect(dialog(page)).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
        expect(await xhrLog(page)).toEqual([{ url: SETLIST, anonymous: true }]);
        expect(await knownHosts(page)).toEqual(['www.setlist.fm']);

        // Known now, and loaded: the card shows the page from memory.
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
        expect(await xhrLog(page)).toHaveLength(1);
    });

    test('a known host: the card\'s fields and context, one request then memory, IndexedDB after a reload', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: ['www.setlist.fm'] },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML } },
        });
        await ctrlHover(page, setlistLink(page));
        const c = card(page);
        await expect(c).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
        await expect(c).toContainText('setlist.fm');
        await expect(c).toContainText('Get the Bruce Springsteen Setlist of the concert');
        await expect(c.locator('.mb-ext-host')).toHaveText('www.setlist.fm');
        await expect(c.locator('.mb-ext-st')).toHaveText('200');
        await expect(c).toContainText('MusicBrainz: setlist.fm of this event');
        await expect(c.locator('img.mb-ext-img')).toHaveAttribute('referrerpolicy', 'no-referrer');
        await expect(c).toContainText('fetched now');
        expect(await xhrLog(page)).toEqual([{ url: SETLIST, anonymous: true }]);

        await ctrlHover(page, setlistLink(page));
        await expect(c).toContainText('fetched now');
        expect(await xhrLog(page), 'memory: no second request').toHaveLength(1);
        await expect.poll(() => idbHas(page, `mb:ext:generic:${SETLIST}`)).toBe(true);

        await reloadEvent(page);
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toContainText('saved today');
        await expect(card(page)).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
        expect(await xhrLog(page), 'IndexedDB: no request after the reload').toEqual([]);

        // sa_pop_ext_ttl_hours ages it: a record older than the setting is asked again.
        await page.evaluate(() => window.GM_setValue('sa_pop_ext_ttl_hours', 1));
        await page.evaluate((k) => new Promise((resolve) => {
            const req = indexedDB.open('vz-saed-detail-pages');
            req.onsuccess = () => {
                const db = req.result;
                const st = db.transaction('pages', 'readwrite').objectStore('pages');
                const g = st.get(k);
                g.onsuccess = () => {
                    const rec = g.result;
                    rec.at -= 2 * 60 * 60 * 1000;
                    st.put(rec).onsuccess = () => { db.close(); resolve(); };
                };
            };
        }), `mb:ext:generic:${SETLIST}`);
        await reloadEvent(page);
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toContainText('fetched now');
        expect(await xhrLog(page)).toHaveLength(1);
    });

    test('the link\'s status: dead (this page load only), Cloudflare\'s check (not dead), moved, not a page', async ({ page }) => {
        const DEAD = 'https://dead.example/gone';
        const CHECK = 'https://checked.example/album';
        const MOVED = 'http://moved.example/old';
        const PDF = 'https://pdf.example/programme.pdf';
        const QUERY = 'https://query.example/list?id=7';
        const HTTPS = 'http://upgrade.example/2025';
        const WAF405 = 'https://waf.example/artist';
        const WAF202 = 'https://waf.example/challenge';
        await openEvent(page, {
            settings: {
                sa_pop_ext: true,
                sa_pop_ext_hosts: ['www.setlist.fm', 'dead.example', 'checked.example', 'moved.example', 'pdf.example',
                    'query.example', 'upgrade.example', 'waf.example'],
            },
            responses: {
                [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML },
                [DEAD]: { status: 404, responseHeaders: HTML_HEADERS, responseText: '<title>Not found</title>' },
                [CHECK]: { status: 403, responseHeaders: `${HTML_HEADERS}\r\ncf-mitigated: challenge\r\nserver: cloudflare`, responseText: '<title>Just a moment...</title>' },
                [MOVED]: { status: 200, finalUrl: 'https://moved.example/new/', responseHeaders: HTML_HEADERS, responseText: '<title>The new place</title>' },
                [PDF]: { status: 200, responseHeaders: 'Content-Type: application/pdf\r\nContent-Length: 2400000', responseText: '%PDF-1.4' },
                [QUERY]: { status: 200, finalUrl: `${QUERY}&cbrd=1&ucbcb=1`, responseHeaders: HTML_HEADERS, responseText: '<title>Same page, more parameters</title>' },
                [HTTPS]: { status: 200, finalUrl: 'https://upgrade.example/2025', responseHeaders: HTML_HEADERS, responseText: '<title>Now on https</title>' },
                [WAF405]: { status: 405, responseHeaders: `${HTML_HEADERS}\r\nx-amzn-waf-action: captcha\r\nserver: awselb/2.0`, responseText: '<title>Human Verification</title>' },
                [WAF202]: { status: 202, responseHeaders: `${HTML_HEADERS}\r\nx-amzn-waf-action: challenge`, responseText: '' },
            },
        });
        await addAnnotationLinks(page, [DEAD, CHECK, MOVED, PDF, QUERY, HTTPS, WAF405, WAF202]);
        const probe = (i) => page.locator('.ext-probe a').nth(i);
        const c = card(page);

        await ctrlHover(page, probe(0));
        await expect(c.locator('.mb-ext-st')).toHaveText('404 Not found');
        await expect(c).toContainText('The page is gone');
        await expect(c).toContainText('in the annotation');
        await ctrlHover(page, probe(0));
        await expect(c.locator('.mb-ext-st')).toHaveText('404 Not found');
        expect((await xhrLog(page)).filter(r => r.url === DEAD), 'kept for this page load').toHaveLength(1);

        // Its Live page fails in the external source's words, not the
        // foreign hosts' "detail page" (reported from Chrome and Firefox).
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d).toBeVisible();
        await d.getByRole('button', { name: 'Live page' }).click();
        await expect(d.locator('.mb-dp-warn')).toHaveText('Could not load the page.');
        await expect(d).toContainText('The page is gone');
        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();

        await ctrlHover(page, probe(1));
        await expect(c.locator('.mb-ext-st')).toHaveText('checked by Cloudflare');
        await expect(c).toContainText('The link itself is fine');
        await expect(c).not.toContainText('gone');

        // AWS WAF's bot check (us.7digital.com, 2026-10-08): its CAPTCHA as a
        // 405, its silent challenge as a 202 — told by x-amzn-waf-action, not
        // by status, and never a page with nothing on it.
        for (const i of [6, 7]) {
            await ctrlHover(page, probe(i));
            await expect(c.locator('.mb-ext-st')).toHaveText('checked by AWS WAF');
            await expect(c).toContainText('browser check (AWS WAF)');
        }

        await ctrlHover(page, probe(2));
        await expect(c.locator('.mb-ext-st')).toHaveText('moved');
        await expect(c).toContainText('→ https://moved.example/new/');
        await expect(c).toContainText('The new place');

        await ctrlHover(page, probe(3));
        await expect(c).toContainText('Not a web page: application/pdf, 2.3 MB');

        // Not moves (decided 2026-10-08): query parameters added on the way
        // (YouTube's consent bounce), and http becoming https on the same
        // host and path — a quiet "→ https", the pill stays green.
        await ctrlHover(page, probe(4));
        await expect(c).toContainText('Same page, more parameters');
        await expect(c.locator('.mb-ext-st')).toHaveText('200');
        await expect(c).not.toContainText('→');
        await ctrlHover(page, probe(5));
        await expect(c).toContainText('Now on https');
        await expect(c.locator('.mb-ext-st')).toHaveText('200');
        await expect(c.locator('.mb-ext-https')).toHaveText('→ https');

        // Only a readable page goes to IndexedDB: an ok record first (so the
        // database exists), then none of the others.
        await ctrlHover(page, setlistLink(page));
        await expect(c).toContainText('Bruce Springsteen Setlist');
        await expect.poll(() => idbHas(page, `mb:ext:generic:${SETLIST}`)).toBe(true);
        for (const u of [DEAD, CHECK, PDF, WAF405, WAF202]) expect(await idbHas(page, `mb:ext:generic:${u}`), u).toBe(false);
        expect(await idbHas(page, `mb:ext:generic:${MOVED}`), 'a moved page is a page').toBe(true);
    });

    test('a failure is shown and not kept; a host Tampermonkey refused is not remembered', async ({ page }) => {
        const DOWN = 'https://down.example/page';
        const REFUSED = 'https://refused.example/page';
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: ['down.example'] },
            responses: {
                [DOWN]: { error: 'net::ERR_NAME_NOT_RESOLVED' },
                [REFUSED]: { error: 'Refused to connect to "refused.example": URL is not permitted' },
            },
        });
        await addAnnotationLinks(page, [DOWN, REFUSED]);
        const c = card(page);
        await ctrlHover(page, page.locator('.ext-probe a').nth(0));
        await expect(c).toContainText('Could not load the page: the site could not be reached');
        await ctrlHover(page, page.locator('.ext-probe a').nth(0));
        await expect(c).toContainText('Could not load the page');
        expect((await xhrLog(page)).filter(r => r.url === DOWN), 'not kept: the next hover asks again').toHaveLength(2);

        // A refused host: first contact through the window (Space).
        await ctrlHover(page, page.locator('.ext-probe a').nth(1));
        await expect(c).toContainText('not contacted yet');
        await page.keyboard.press('Space');
        await expect(dialog(page)).toContainText('Tampermonkey did not let the script contact this site');
        await expect(dialog(page).locator('.mb-dp-retry')).toBeVisible();
        expect(await knownHosts(page)).toEqual(['down.example']);

        // Still unknown: a hover shows why the last try failed and asks
        // nothing (a retry from a hover could bring the prompt back).
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await page.clock.install();
        await ctrlHover(page, page.locator('.ext-probe a').nth(1));
        await expect(c).toContainText('not contacted yet');
        await expect(c).toContainText('The last try failed: Tampermonkey did not let the script contact this site');
        await page.clock.fastForward(5000);
        expect((await xhrLog(page)).filter(r => r.url === REFUSED), 'a hover does not retry a host never reached').toHaveLength(1);
    });

    test('a hover that moved on asks nothing, and the rate gate is per host', async ({ page }) => {
        const A = 'https://gate.example/a';
        const B = 'https://gate.example/b';
        const OTHER = 'https://other.example/c';
        const page1 = (t) => ({ status: 200, responseHeaders: HTML_HEADERS, responseText: `<title>${t}</title>` });
        await page.clock.install();
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: ['gate.example', 'other.example'] },
            responses: { [A]: page1('Page A'), [B]: page1('Page B'), [OTHER]: page1('Page C') },
        });
        await addAnnotationLinks(page, [A, B, OTHER]);
        const probe = (i) => page.locator('.ext-probe a').nth(i);

        await ctrlHover(page, probe(0));
        await expect(card(page)).toContainText('Page A');
        // gate.example's next slot is a second away; other.example's is free.
        expect(await page.evaluate(() => window.__saTest.extRateSlotWaitMs('gate.example'))).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.__saTest.extRateSlotWaitMs('other.example'))).toBe(0);

        // B waits for gate.example's slot; the pointer leaves before it comes.
        await ctrlHover(page, probe(1));
        await expect(card(page)).toContainText('Loading');
        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        await page.clock.fastForward(3000);
        expect((await xhrLog(page)).map(r => r.url), 'B was not asked').toEqual([A]);

        await ctrlHover(page, probe(2));
        await expect(card(page)).toContainText('Page C');
        await ctrlHover(page, probe(1));
        await expect(card(page)).toContainText('Page B');
        expect((await xhrLog(page)).map(r => r.url)).toEqual([A, OTHER, B]);
    });

    test('YouTube: one oEmbed request (no prompt: www.youtube.com is in @connect), no Live page, a missing video in its words', async ({ page }) => {
        // Brought into U1 on 2026-10-08: a YouTube PAGE is 1 MB of script,
        // bounced through consent.youtube.com without cookies, its tags at
        // 769 KB and its Live page blank.
        const LIST = 'https://www.youtube.com/playlist?list=PLtestlist';
        const GONE = 'https://youtu.be/aaaaaaaaaaa';
        const oembed = (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`;
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: {
                [oembed(LIST)]: {
                    status: 200, responseHeaders: 'Content-Type: application/json',
                    responseText: JSON.stringify({
                        type: 'video', title: '2025‐10‐26: The Stone Pony, Asbury Park, NJ, USA', author_name: 'Volker Zell',
                        thumbnail_url: 'https://img.example/hqdefault.jpg',
                    }),
                },
                [oembed(GONE)]: { status: 400, responseHeaders: 'Content-Type: text/html', responseText: 'Bad Request' },
            },
        });
        await addAnnotationLinks(page, [LIST, GONE]);
        const c = card(page);
        await ctrlHover(page, page.locator('.ext-probe a').nth(0));
        await expect(c, 'no first-contact card: the reader\'s host is in @connect').toContainText('2025‐10‐26: The Stone Pony');
        await expect(c).toContainText('A playlist by Volker Zell');
        await expect(c.locator('.mb-ext-st')).toHaveText('200');
        expect(await xhrLog(page), 'oEmbed only, never the page').toEqual([{ url: oembed(LIST), anonymous: true }]);

        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('YouTube');
        await expect(d).toContainText('Volker Zell');
        await expect(d.getByRole('button', { name: 'Live page' }), 'the page is nothing without its scripts').toBeHidden();
        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();

        await ctrlHover(page, page.locator('.ext-probe a').nth(1));
        await expect(c.locator('.mb-ext-st')).toHaveText('not available');
        await expect(c).toContainText('YouTube does not show this video');
    });

    test('the initial standing in for a site\'s icon is its name\'s, not a country or language prefix\'s', async ({ page }) => {
        // Reported 2026-10-08: us.7digital.com showed "U".
        const hosts = ['us.7digital.com', 'en.wikipedia.org', 'brucebase.wikidot.com', 'www.bbc.co.uk', 'example.org'];
        const urls = hosts.map(h => `https://${h}/page`);
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: hosts },
            responses: Object.fromEntries(urls.map(u => [u, { status: 200, responseHeaders: HTML_HEADERS, responseText: '<title>A page</title>' }])),
        });
        await addAnnotationLinks(page, urls);
        const seen = [];
        for (let i = 0; i < urls.length; i++) {
            await ctrlHover(page, page.locator('.ext-probe a').nth(i));
            await expect(card(page).locator('.mb-ext-host')).toHaveText(hosts[i]);
            seen.push(await card(page).locator('.mb-ext-fav').textContent());
        }
        expect(seen).toEqual(['7', 'W', 'B', 'B', 'E']);
    });

    test('site icons (sa_pop_ext_favicons): anonymous, own host only, once per site, never for a site not contacted yet', async ({ page }) => {
        const ICONHOST = 'https://icon.example/page';
        const CDNICON = 'https://cdn-icon.example/page';
        const NEWSITE = 'https://new.example/page';
        const PNG_B64 = PNG.toString('base64');
        const png = { status: 200, responseHeaders: 'Content-Type: image/png', base64: PNG_B64, contentType: 'image/png' };
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_favicons: true, sa_pop_ext_hosts: ['www.setlist.fm', 'icon.example', 'cdn-icon.example'] },
            responses: {
                [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML },
                'https://www.setlist.fm/favicon.ico': png,
                // The page names its own icon on its own host: that one, not /favicon.ico.
                [ICONHOST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: '<head><link rel="icon" href="/img/own.png"><title>Own icon</title></head>' },
                'https://icon.example/img/own.png': png,
                // An icon on another host (a CDN) would bring Tampermonkey's prompt: /favicon.ico instead.
                [CDNICON]: { status: 200, responseHeaders: HTML_HEADERS, responseText: '<head><link rel="icon" href="https://cdn.elsewhere.example/i.png"><title>CDN icon</title></head>' },
                'https://cdn-icon.example/favicon.ico': png,
            },
        });
        const c = card(page);
        await ctrlHover(page, setlistLink(page));
        await expect(c.locator('img.mb-ext-favimg')).toHaveAttribute('src', /^data:image\/png;base64,/);
        await expect(c.locator('.mb-ext-fav')).toContainText('S');
        const log1 = await xhrLog(page);
        expect(log1).toEqual([{ url: SETLIST, anonymous: true }, { url: 'https://www.setlist.fm/favicon.ico', anonymous: true }]);
        await expect.poll(() => idbHas(page, 'mb:ext-icon:www.setlist.fm')).toBe(true);
        await ctrlHover(page, setlistLink(page));
        await expect(c.locator('img.mb-ext-favimg')).toBeVisible();
        expect(await xhrLog(page), 'once per site: memory').toHaveLength(2);

        await addAnnotationLinks(page, [ICONHOST, CDNICON, NEWSITE]);
        await ctrlHover(page, page.locator('.ext-probe a').nth(0));
        await expect(c.locator('img.mb-ext-favimg')).toBeVisible();
        await ctrlHover(page, page.locator('.ext-probe a').nth(1));
        await expect(c.locator('img.mb-ext-favimg')).toBeVisible();
        await page.clock.install();
        await ctrlHover(page, page.locator('.ext-probe a').nth(2));
        await expect(c).toContainText('not contacted yet');
        await page.clock.fastForward(5000);
        const urls = (await xhrLog(page)).map(r => r.url);
        expect(urls).toContain('https://icon.example/img/own.png');
        expect(urls).not.toContain('https://icon.example/favicon.ico');
        expect(urls).toContain('https://cdn-icon.example/favicon.ico');
        expect(urls.some(u => u.includes('cdn.elsewhere.example')), 'never another host').toBe(false);
        expect(urls.some(u => u.includes('new.example')), 'a site not contacted yet: no icon either').toBe(false);
        expect((await xhrLog(page)).every(r => r.anonymous)).toBe(true);
    });

    test('site icons off: letters only, no icon request', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_favicons: false, sa_pop_ext_hosts: ['www.setlist.fm'] },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML } },
        });
        await page.clock.install();
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toContainText('Bruce Springsteen Setlist');
        // Past the host's next rate slot, when an icon request would go out.
        await page.clock.fastForward(3000);
        await expect(card(page).locator('img.mb-ext-favimg')).toHaveCount(0);
        expect(await xhrLog(page)).toEqual([{ url: SETLIST, anonymous: true }]);
    });

    test('tags past the 512 KB cap are found in the rest of the page, without parsing it', async ({ page }) => {
        const LATE = 'https://late.example/page';
        const filler = `<script>var x = "${'x'.repeat(600 * 1024)}";</script>`;
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: ['late.example'] },
            responses: {
                [LATE]: {
                    status: 200, responseHeaders: HTML_HEADERS,
                    responseText: `<!doctype html><html lang="en"><head></head><body>${filler}` +
                        '<title>Late title</title><meta property="og:title" content="The late og:title">' +
                        '<meta property="og:description" content="Found past the cap."></body></html>',
                },
            },
        });
        await addAnnotationLinks(page, [LATE]);
        const c = card(page);
        await ctrlHover(page, page.locator('.ext-probe a').nth(0));
        await expect(c).toContainText('The late og:title');
        await expect(c).toContainText('Found past the cap.');
    });

    test('the window: Extracted, the Live page from the hover\'s fetch with no script, ⟳, ← → down the URL column', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: ['www.setlist.fm', 'brucebase.wikidot.com', 'www.nugs.net'] },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML } },
        });
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toContainText('Bruce Springsteen Setlist');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d).toBeVisible();
        await expect(d).toContainText('Get the Bruce Springsteen Setlist of the concert');
        await expect(d).toContainText('The page says');
        await expect(d).toContainText('setlist');
        await expect(d).toContainText('MusicBrainz: setlist.fm of this event');
        await expect(d.locator('.mb-dp-pos-label')).toHaveText(/^\d \/ 3$/);

        await d.getByRole('button', { name: 'Live page' }).click();
        const frame = d.locator('iframe');
        await expect(frame).toHaveAttribute('srcdoc', /live-probe/);
        const srcdoc = await frame.getAttribute('srcdoc');
        expect(srcdoc).not.toContain('<script');
        expect(srcdoc).not.toContain('onclick');
        expect(srcdoc, 'no preload of what nothing uses without scripts').not.toMatch(/rel="(?:preload|preconnect)"/);
        expect(srcdoc).toContain('rel="canonical"');
        expect(await xhrLog(page), 'the Live page reuses the hover\'s fetch').toHaveLength(1);
        await d.getByRole('button', { name: '⟳' }).click();
        await expect(frame).toHaveAttribute('srcdoc', /live-probe/);
        expect(await xhrLog(page), '⟳ asks again').toHaveLength(2);

        await d.getByRole('button', { name: 'Extracted' }).click();
        const before = await d.locator('.mb-dp-pos-label').textContent();
        const [i, n] = before.split(' / ').map(Number);
        await page.keyboard.press(i < n ? 'ArrowRight' : 'ArrowLeft');
        await expect(d.locator('.mb-dp-pos-label')).toHaveText(`${i < n ? i + 1 : i - 1} / ${n}`);
        await expect(d.locator('.mb-ext-url a').first()).not.toHaveText(SETLIST);
    });
});

test.describe('MusicBrainz URL entities (U2)', () => {
    test('the "[info]" link: named after its link while it loads, then the URL and who links it, from one lookup', async ({ page }) => {
        let release;
        const held = new Promise((r) => { release = r; });
        const log = await openEvent(page, { settings: { sa_pop_mb: true }, ws2: async () => { await held; return null; } });
        expect(await page.evaluate((id) => window.__saTest.popResolve(document.querySelector(`table.tbl a[href="/url/${id}"]`)),
            SETLIST_URL_ID)).toBe(`mb-entity|url:${SETLIST_URL_ID}`);
        await ctrlHover(page, infoLink(page));
        const c = card(page);
        await expect(c).toContainText('Loading');
        await expect(c.locator('.mb-tt-title'), 'the link beside it, not "info"').toHaveText(SETLIST);
        release();
        await expect(c).toContainText('1 relationship');
        await expect(c.locator('.mb-tt-title')).toHaveText('www.setlist.fm');
        await expect(c.locator('.mb-ext-url')).toHaveText(SETLIST);
        await expect(c.locator('dt')).toHaveText(['Setlistfm']);
        await expect(c.locator('dd')).toHaveText([`Event: ${SETLIST_EVENT}`]);
        expect(log.ws2, 'one lookup, every relationship include and nothing else').toEqual([SETLIST_LOOKUP]);

        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('URL');
        await expect(d).toContainText('Linked from · 1');
        await expect(d).toContainText(SETLIST_URL_ID);
        await expect(d.locator('.mb-dp-area a[href^="/event/"]')).toHaveText([SETLIST_EVENT]);
        await expect(d.locator('.mb-dp-pos-label'), '‹ › step through the "[info]" links of the URL column').toHaveText(/^\d \/ 3$/);
        expect(log.ws2, 'the window reuses the card\'s answer').toHaveLength(1);
    });

    test('grouped by relationship; a release group (typed and keyed "release_group") links /release-group/', async ({ page }) => {
        const log = await openEvent(page, {
            settings: { sa_pop_mb: true },
            ws2: (u) => (u.includes(`/url/${SETLIST_URL_ID}?`) ? { status: 200, body: json('ws2-pop-url-sl-bootlegs.json') } : null),
        });
        await ctrlHover(page, infoLink(page));
        const c = card(page);
        await expect(c).toContainText('4 relationships');
        await expect(c.locator('dt')).toHaveText(['Discography entry', 'Official homepage']);
        await expect(c.locator('dd').first()).toContainText('Release group: 1996‐03‐13: Cirkus, Stockholm, Sweden');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d).toContainText('Linked from · 4');
        await expect(d.locator('.mb-dp-area a[href^="/release-group/"]')).toHaveCount(4);
        expect(await d.locator('.mb-dp-area a[href^="/release_group/"], .mb-dp-area a[href^="/undefined"]').count()).toBe(0);
        expect(log.ws2).toHaveLength(1);
    });

    test('the card names 3 per relationship, the window 100 and then links the URL\'s own page', async ({ page }) => {
        const sched = JSON.parse(json('ws2-pop-url-schedule.json'));
        const rel = sched.relations[0];
        const many = Object.assign({}, sched, {
            relations: Array.from({ length: 102 }, (_, i) => Object.assign({}, rel, {
                series: Object.assign({}, rel.series, { id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `Tour ${i + 1}` }),
            })),
        });
        await openEvent(page, {
            settings: { sa_pop_mb: true },
            ws2: (u) => (u.includes(`/url/${SETLIST_URL_ID}?`) ? { status: 200, body: JSON.stringify(many) } : null),
        });
        await ctrlHover(page, infoLink(page));
        const c = card(page);
        await expect(c.locator('dt')).toHaveText(['Schedule']);
        await expect(c.locator('dd a[href^="/series/"]')).toHaveText(['Tour 1', 'Tour 2', 'Tour 3']);
        await expect(c.locator('dd')).toContainText('+ 99 more');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d).toContainText('Linked from · 102');
        await expect(d.locator('.mb-dp-area a[href^="/series/"]')).toHaveCount(100);
        await expect(d.locator(`.mb-dp-area a[href="/url/${sched.id}"]`)).toHaveText('+ 2 more');
    });

    test('an external window says what MusicBrainz knows of the URL — never on hover, by the "[info]" MBID, shared with that card', async ({ page }) => {
        const log = await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_mb: true, sa_pop_ext_hosts: ['www.setlist.fm'] },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML } },
        });
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
        expect(log.ws2, 'a hover asks MusicBrainz nothing').toEqual([]);

        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator('h4', { hasText: 'MusicBrainz knows this URL' })).toBeVisible();
        await expect(d.locator('.mb-dp-area dt')).toContainText(['Setlistfm']);
        await expect(d.locator('.mb-dp-area a[href^="/event/"]')).toHaveText([SETLIST_EVENT]);
        await expect(d.locator(`.mb-dp-area a[href="/url/${SETLIST_URL_ID}"]`)).toHaveText('MusicBrainz\'s page for this URL');
        expect(log.ws2, 'by the "[info]" link\'s MBID, not by ?resource=').toEqual([SETLIST_LOOKUP]);
        expect(await xhrLog(page), 'the site was asked once, by the hover').toHaveLength(1);

        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();
        await ctrlHover(page, infoLink(page));
        await expect(card(page)).toContainText('1 relationship');
        expect(log.ws2, 'the "[info]" card shares that answer').toHaveLength(1);
    });

    test('a link with no "[info]" of its own: ?resource= with the href as written; a 404 is "not in MusicBrainz", for this page load only', async ({ page }) => {
        const BARE = 'http://www.example.org';
        const log = await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: ['www.example.org', 'www.setlist.fm'] },
            responses: {
                [`${BARE}/`]: { status: 200, responseHeaders: HTML_HEADERS, responseText: '<!doctype html><html><head><title>Example</title></head><body></body></html>' },
                [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML },
            },
        });
        await addAnnotationLinks(page, [BARE, SETLIST]);
        // The setlist.fm link gets its own "[info]" after it, as MusicBrainz
        // writes one: it belongs to that link only, never to the link before.
        await page.evaluate((id) => {
            const a = document.querySelectorAll('.ext-probe a')[1];
            const info = document.createElement('a');
            info.setAttribute('href', `/url/${id}`);
            info.textContent = 'info';
            a.after(' [', info, ']');
        }, SETLIST_URL_ID);
        const bare = page.locator('.ext-probe a').nth(0);
        await ctrlHover(page, bare);
        await expect(card(page)).toContainText('Example');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator('.mb-ext-mb-none')).toHaveText('Not in MusicBrainz: no entity links this URL — it is only in the annotation.');
        // The ATTRIBUTE, not a.href ("http://www.example.org/"): MusicBrainz
        // matches a resource exactly (U0 X7).
        expect(log.ws2).toEqual([`https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(BARE)}&inc=${URL_INC}&fmt=json`]);
        await expect.poll(() => idbHas(page, `mb:ext:generic:${BARE}/`)).toBe(true);
        expect(await idbHas(page, `mb:pop:url:${BARE}:${URL_INC}`), 'a 404 never goes to IndexedDB').toBe(false);

        await page.keyboard.press('Escape');
        await ctrlHover(page, bare);
        await page.keyboard.press('Space');
        await expect(d.locator('.mb-ext-mb-none')).toBeVisible();
        expect(log.ws2, 'remembered for this page load').toHaveLength(1);

        await page.keyboard.press('Escape');
        await ctrlHover(page, page.locator('.ext-probe a').nth(1));
        await page.keyboard.press('Space');
        await expect(d.locator('.mb-dp-area a[href^="/event/"]')).toHaveText([SETLIST_EVENT]);
        expect(log.ws2[1], 'its own "[info]" MBID').toBe(SETLIST_LOOKUP);
    });

    test('the window\'s MusicBrainz request waits for the shared MusicBrainz gate', async ({ page }) => {
        const log = await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_hosts: ['www.setlist.fm'] },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML } },
        });
        await ctrlHover(page, setlistLink(page));
        await expect(card(page)).toContainText('Bruce Springsteen Setlist at Co-op Live, Manchester');
        await page.evaluate(() => window.__saTest.reserveMbRateSlots(2));
        const t0 = performance.now();
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('.mb-dp-area a[href^="/event/"]')).toHaveText([SETLIST_EVENT], { timeout: 10000 });
        expect(log.ws2).toEqual([SETLIST_LOOKUP]);
        expect(log.ws2At[0] - t0, 'waited behind two slots of the gate the Relationships column shares').toBeGreaterThanOrEqual(2000);
    });
});

// U3: the readers of Wikipedia, Wikidata and Discogs. Every answer is a real
// capture (scripts/capture-ext-fixtures.py → tests/fixtures/ext-*.json), keyed
// by the exact request the reader builds; the links are put in the
// annotation, as an annotation carries them. Their API hosts are in the
// header's @connect, so no test seeds sa_pop_ext_hosts: a hover loads them.
const EXT = (name) => JSON.parse(json(`ext-${name}.json`));
const extAnswers = (...names) => Object.fromEntries(names.map((n) => {
    const f = EXT(n);
    return [f.url, { status: f.status, responseHeaders: `Content-Type: ${f.contentType}`, responseText: f.body }];
}));
const W = {
    teach: 'https://en.wikipedia.org/wiki/TeachRock',
    greet: 'https://en.wikipedia.org/wiki/Greetings_from_Asbury_Park%2C_N.J.',
    merc: 'https://en.wikipedia.org/wiki/Mercury',
    miss: 'https://en.wikipedia.org/wiki/No_such_article_ShowAllEntityData_probe',
};
const WD = { item: 'https://www.wikidata.org/wiki/Q1225', miss: 'https://www.wikidata.org/wiki/Q999999999' };
const DG = {
    release: 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run',
    master: 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run',
    artist: 'https://www.discogs.com/artist/219986-Bruce-Springsteen',
    label: 'https://www.discogs.com/label/1866-Columbia',
    miss: 'https://www.discogs.com/release/999999999',
};
const probe = (page, i) => page.locator('.ext-probe a').nth(i);
// Every logged request to another site, with its headers.
const xhrFull = (page) => page.evaluate(() => (window.__gmXhrLog || [])
    .filter(r => !/^https:\/\/raw\.githubusercontent\.com\//.test(r.url)));

test.describe('readers of known sites (U3): Wikipedia, Wikidata, Discogs', () => {
    test('which reader serves which link; the others stay generic', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true } });
        const links = [
            W.teach, WD.item, DG.release, DG.master, DG.artist, DG.label,
            'https://de.m.wikipedia.org/wiki/Bruce_Springsteen',
            'https://www.discogs.com/de/release/1874253',
            'https://www.wikipedia.org/', 'https://en.wikipedia.org/wiki/Special:Search',
            'https://www.wikidata.org/wiki/Property:P31', 'https://www.discogs.com/sell/list',
            // As MusicBrainz's sidebar writes its Wikidata link (found by the
            // live spec): protocol-relative.
            '//www.wikidata.org/wiki/Q1470381',
        ];
        await addAnnotationLinks(page, links);
        const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.ext-probe a'))
            .map(a => window.__saTest.popResolve(a)));
        expect(keys.map(k => k && k.split(':').slice(0, 2).join(':'))).toEqual([
            'ext|ext:wikipedia', 'ext|ext:wikidata', 'ext|ext:discogs', 'ext|ext:discogs', 'ext|ext:discogs', 'ext|ext:discogs',
            'ext|ext:wikipedia', 'ext|ext:discogs',
            'ext|ext:generic', 'ext|ext:generic', 'ext|ext:generic', 'ext|ext:generic',
            'ext|ext:wikidata',
        ]);
        expect(keys[12], 'read as https').toBe('ext|ext:wikidata:https://www.wikidata.org/wiki/Q1470381');
    });

    test('Wikipedia: one REST summary with Api-User-Agent; the article, a disambiguation page, a missing title', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: extAnswers('wikipedia-teachrock', 'wikipedia-greetings', 'wikipedia-mercury', 'wikipedia-missing'),
        });
        await addAnnotationLinks(page, [W.teach, W.greet, W.merc, W.miss]);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        await expect(c).toContainText('fetched now');
        await expect(c.locator('.mb-tt-title')).toHaveText('TeachRock');
        await expect(c).toContainText('Wikipedia (en)');
        await expect(c).toContainText('TeachRock is an education initiative');
        await expect(c).toContainText('Education initiative founded by Steven Van Zandt');
        await expect(c.locator('.mb-ext-st')).toHaveText('200');
        const log = await xhrFull(page);
        expect(log.map(r => r.url), 'the REST summary, not the page').toEqual([EXT('wikipedia-teachrock').url]);
        expect(log[0].anonymous).toBe(true);
        expect(log[0].headers['Api-User-Agent'], 'as Wikimedia asks of browser scripts').toMatch(/^ShowAllEntityData\//);

        // MusicBrainz's %2C title: the same article, no "Redirected from";
        // its thumbnail.
        await ctrlHover(page, probe(page, 1));
        await expect(c.locator('.mb-tt-title')).toHaveText('Greetings from Asbury Park, N.J.');
        await expect(c.locator('img.mb-ext-img')).toHaveAttribute('src', /upload\.wikimedia\.org/);
        await expect(c).not.toContainText('Redirected from');

        await ctrlHover(page, probe(page, 2));
        await expect(c.locator('.mb-tt-title')).toHaveText('Mercury');
        await expect(c).toContainText('a disambiguation page');

        await ctrlHover(page, probe(page, 3));
        await expect(c.locator('.mb-ext-st')).toHaveText('404 Not found');
        await expect(c).toContainText('Wikipedia has no article of this title');

        // A "/" in a title is encoded, or the REST path would split there
        // (no answer configured: the stub's 404 is enough to see the URL).
        await addAnnotationLinks(page, ['https://en.wikipedia.org/wiki/AC/DC']);
        await ctrlHover(page, page.locator('.ext-probe a[href$="/AC/DC"]'));
        await expect(c.locator('.mb-ext-st')).toHaveText('404 Not found');
        expect((await xhrFull(page)).map(r => r.url)).toContain('https://en.wikipedia.org/api/rest_v1/page/summary/AC%2FDC');
    });

    test('Wikipedia\'s window: its facts, the Wikidata item, and the whole article as Live page with the site around #content hidden', async ({ page }) => {
        // Longer than the card's 512 KB cap: the Live page reads the whole page.
        const ARTICLE = '<!doctype html><html><head><title>TeachRock - Wikipedia</title></head><body>' +
            '<header class="probe-head">the site\'s header</header><div class="mw-page-container"><nav class="probe-nav">menu</nav>' +
            `<main id="content"><h1>TeachRock</h1><p>${'Lorem ipsum. '.repeat(48 * 1024)}</p><p id="article-end">The end.</p></main></div></body></html>`;
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: { ...extAnswers('wikipedia-greetings'), [W.greet]: { status: 200, responseHeaders: HTML_HEADERS, responseText: ARTICLE } },
        });
        await addAnnotationLinks(page, [W.greet]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('fetched now');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Wikipedia');
        await expect(d).toContainText('Wikipedia (en) says');
        await expect(d).toContainText('1973 studio album by Bruce Springsteen');
        await expect(d.locator('a[href="https://www.wikidata.org/wiki/Q1470381"]')).toBeVisible();

        await d.getByRole('button', { name: 'Live page' }).click();
        const frame = d.locator('iframe');
        await expect(frame).toHaveAttribute('srcdoc', /article-end/);
        // The classes are set on the frame's load (_dpIsolateFrame()), which
        // comes after srcdoc: read them once that has run.
        await expect.poll(() => frame.evaluate((f) => {
            const doc = f.contentDocument;
            // The srcdoc swap can leave the document without a root element
            // for a moment: "not yet", not a throw.
            if (!doc || !doc.documentElement || !doc.documentElement.dataset.mbDpDone) return null;
            return ['header.probe-head', 'nav.probe-nav', '#content'].map(s => doc.querySelector(s).classList.contains('mb-dp-hide'));
        }), 'the header and menus hidden, the article shown').toEqual([true, true, false]);
        expect((await xhrFull(page)).map(r => r.url)).toEqual([EXT('wikipedia-greetings').url, W.greet]);
    });

    test('Wikidata: one wbgetentities in the browser\'s language and English; a missing item', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true }, responses: extAnswers('wikidata-q1225', 'wikidata-missing') });
        await addAnnotationLinks(page, [WD.item, WD.miss]);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        await expect(c.locator('.mb-tt-title')).toHaveText('Bruce Springsteen');
        await expect(c).toContainText('American rock singer (born 1949)');
        await expect(c).toContainText('Q1225');
        expect((await xhrFull(page)).map(r => r.url)).toEqual([EXT('wikidata-q1225').url]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('a[href="https://en.wikipedia.org/wiki/Bruce_Springsteen"]')).toBeVisible();
        await page.keyboard.press('Escape');

        await ctrlHover(page, probe(page, 1));
        await expect(c.locator('.mb-ext-st')).toHaveText('not available');
        await expect(c).toContainText('Wikidata has no item Q999999999.');
    });

    test('Discogs: the API with its User-Agent, no token by default, 2.5 s apart; release, master, artist, label, a missing release', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: extAnswers('discogs-release', 'discogs-master', 'discogs-artist', 'discogs-label', 'discogs-missing'),
        });
        await addAnnotationLinks(page, [DG.release, DG.master, DG.artist, DG.label, DG.miss]);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        await expect(c.locator('.mb-tt-title')).toHaveText('Born To Run');
        await expect(c).toContainText('Discogs');
        await expect(c).toContainText('Bruce Springsteen · 1975 · Vinyl, LP, Album, Stereo');
        await expect(c.locator('img.mb-ext-img')).toHaveAttribute('src', /i\.discogs\.com/);
        const log = await xhrFull(page);
        expect(log.map(r => r.url)).toEqual(['https://api.discogs.com/releases/1874253']);
        expect(log[0].headers['User-Agent'], 'Discogs requires one').toMatch(/^ShowAllEntityData\//);
        expect(log[0].headers.Authorization, 'no token set').toBeUndefined();
        expect(await page.evaluate(() => window.__saTest.extRateSlotWaitMs('api.discogs.com')),
            '25 a minute without a token').toBeGreaterThan(1500);

        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Discogs release');
        await expect(d.getByRole('button', { name: 'Live page' }), 'the API, not the page').toBeHidden();
        await expect(d).toContainText('Columbia – PC 33795');
        await expect(d).toContainText('Rock, Pop Rock, Rock & Roll');
        await page.keyboard.press('Escape');

        await ctrlHover(page, probe(page, 1));
        await expect(c.locator('.mb-tt-title')).toHaveText('Born To Run', { timeout: 10000 });
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('a[href="https://www.discogs.com/release/13896528"]')).toBeVisible();
        await page.keyboard.press('Escape');

        await ctrlHover(page, probe(page, 2));
        await expect(c.locator('.mb-tt-title')).toHaveText('Bruce Springsteen', { timeout: 10000 });
        await expect(c).toContainText('Bruce Frederick Joseph Springsteen');

        await ctrlHover(page, probe(page, 3));
        await expect(c.locator('.mb-tt-title')).toHaveText('Columbia', { timeout: 10000 });
        await expect(c).toContainText('Sony Music Entertainment');
        await expect(c).not.toContainText('[l');

        await ctrlHover(page, probe(page, 4));
        await expect(c.locator('.mb-ext-st')).toHaveText('404 Not found', { timeout: 10000 });
        await expect(c).toContainText('Discogs has no release 999999999');
    });

    test('Discogs with the user\'s token: in the Authorization header only, 1 s apart, never in a debug line', async ({ page }) => {
        const TOKEN = 'tok-ShowAllEntityData-probe-123';
        const lines = [];
        page.on('console', (m) => lines.push(m.text()));
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_discogs_token: `  ${TOKEN} `, sa_enable_debug_logging: true },
            responses: extAnswers('discogs-release'),
        });
        await addAnnotationLinks(page, [DG.release]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Born To Run');
        const log = await xhrFull(page);
        expect(log.map(r => r.url), 'never in the URL').toEqual(['https://api.discogs.com/releases/1874253']);
        expect(log[0].headers.Authorization).toBe(`Discogs token=${TOKEN}`);
        expect(await page.evaluate(() => window.__saTest.extRateSlotWaitMs('api.discogs.com')), '60 a minute').toBeLessThanOrEqual(1000);
        expect(lines.some(l => l.includes('api.discogs.com/releases/1874253')), 'the debug channel was on').toBe(true);
        expect(lines.filter(l => l.includes(TOKEN)), 'the token in no console line').toEqual([]);
    });
});

// The Discogs window (2026-10-17, mockup https://claude.ai/artifact/49tucEnfghTCMtyvwN6qaM):
// a release's tracklist with credits, companies, credits, identifiers,
// notes, videos and images come in the reader's ONE answer; a master's
// versions are their own request, 100 a page (ext-discogs-master-versions-p1..p4:
// 387 versions, captured 2026-10-17), page 1 when the window opens, the rest
// on its button. Images from i.discogs.com are answered with a pixel here.
const DGV = [1, 2, 3, 4].map(p => `https://api.discogs.com/masters/26725/versions?per_page=100&page=${p}`);
const DG_REL = JSON.parse(EXT('discogs-release').body);
const dgVersionsLog = async (page) => (await xhrFull(page)).map(r => r.url).filter(u => u.includes('/versions?'));
// How long the next request to Discogs' API would wait for its slot, ms (0: it would go now).
const dgSlotWait = (page) => () => page.evaluate(() => window.__saTest.extRateSlotWaitMs('api.discogs.com'));

/**
 * The event page with the Discogs answers, and i.discogs.com's images as a
 * pixel (the gallery and the versions' thumbnails are plain images).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, responses?: Object}} [opts]
 * @returns {Promise<void>}
 */
async function openDiscogs(page, { settings = {}, responses = {} } = {}) {
    await page.context().route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await openEvent(page, {
        settings: { sa_pop_ext: true, ...settings },
        responses: {
            ...extAnswers('discogs-release', 'discogs-master', 'discogs-artist', 'discogs-master-versions-p1', 'discogs-master-versions-p2',
                'discogs-master-versions-p3', 'discogs-master-versions-p4'),
            ...responses,
        },
    });
    await addAnnotationLinks(page, [DG.release, DG.master]);
}

test.describe('the Discogs window (2026-10-17)', () => {
    test('a release: its sections from the one answer, track credits closed until opened, the gallery in the viewer', async ({ page }) => {
        await openDiscogs(page);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        const trackCredits = DG_REL.tracklist.reduce((n, x) => n + (x.extraartists || []).length, 0);
        // The card's summary line counts what the window holds.
        await expect(c.locator('.mb-dg-sum')).toHaveText(
            `8 tracks · ${trackCredits + DG_REL.extraartists.length} credits · 12 companies · 12 identifiers · 5 images`);
        await expect(c, 'the new facts are the window\'s only').not.toContainText('Data quality');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator('.mb-dg-xh')).toHaveText(['Images 5', 'Companies, etc. 12', 'Credits 18',
            'Barcode and Other Identifiers 12', 'Videos 3', 'Tracklist 8', 'Notes']);
        // Sides swapped (2026-10-26): the info under the pictures on the
        // left, the tracklist and notes on the right, the right one wider.
        const cols = d.locator('.mb-dp-x.mb-dg-swap > .mb-dp-col');
        await expect(cols).toHaveCount(2);
        await expect(cols.nth(0).locator('.mb-dg-xh')).toHaveText(['Images 5', 'Companies, etc. 12', 'Credits 18',
            'Barcode and Other Identifiers 12', 'Videos 3']);
        await expect(cols.nth(1).locator('.mb-dg-xh')).toHaveText(['Tracklist 8', 'Notes']);
        await expect(cols.nth(0).locator(':scope > h4', { hasText: /^Link$/ }), 'Link on the left').toHaveCount(1);
        await expect(cols.nth(0).locator(':scope > h4', { hasText: /^Discogs says$/ }), '"Discogs says" on the left').toHaveCount(1);
        await expect(cols.nth(1).locator(':scope > h4')).toHaveCount(0);
        const [w0, w1] = await cols.evaluateAll(cs => cs.map(c => c.getBoundingClientRect().width));
        expect(w0 / w1, 'the columns 0.7 : 1.3').toBeCloseTo(0.7 / 1.3, 1);
        expect((await xhrFull(page)).map(r => r.url), 'no request more than the card\'s').toEqual(['https://api.discogs.com/releases/1874253']);
        await expect(d).toContainText(`${DG_REL.community.have.toLocaleString('en-US')} have · ${DG_REL.community.want.toLocaleString('en-US')} want`);
        await expect(d).toContainText('Needs Vote');

        // Track credits: closed; one opens; "Show all" opens the eight; "Hide" closes them.
        const tl = d.locator('[data-mb-dg-sec="tracklist"]');
        await expect(tl.locator('.mb-dg-tcred')).toHaveCount(0);
        await tl.locator('.mb-dg-cr').first().click();
        await expect(tl.locator('.mb-dg-cr').first()).toHaveText('▾ 7 credits');
        await expect(tl.locator('.mb-dg-tcred')).toHaveCount(1);
        await expect(tl.locator('.mb-dg-tcred')).toContainText('Backing Vocals – Mike Appel, Steve Van Zandt');
        await tl.getByRole('button', { name: 'Show all track credits' }).click();
        await expect(tl.locator('.mb-dg-tcred')).toHaveCount(8);
        // A name credited differently: Discogs' own *, its Discogs name on hover.
        await expect(tl.locator('.mb-dg-anv').first()).toHaveText('Max M. Weinberg*');
        await expect(tl.locator('.mb-dg-anv').first()).toHaveAttribute('title', /on Discogs: Max Weinberg/);
        await tl.getByRole('button', { name: 'Hide all track credits' }).click();
        await expect(tl.locator('.mb-dg-tcred')).toHaveCount(0);

        // Grouped as Discogs lists them.
        await expect(d.locator('[data-mb-dg-sec="companies"]')).toContainText('Recorded At – Record Plant, N.Y.C., 914 Sound Studios');
        await expect(d.locator('[data-mb-dg-sec="credits"]')).toContainText('Producer – Jon Landau (tracks: A1 to A4, B2 to B4)');
        const ids = d.locator('[data-mb-dg-sec="identifiers"]');
        await expect(ids.locator('.mb-dg-it')).toHaveText(['Rights Society', 'Pressing Plant ID', 'Matrix / Runout']);
        await expect(ids).toContainText('P AL 33795-1J · A-side deadwax, stamped, var. 3');
        await expect(d.locator('[data-mb-dg-sec="notes"] a', { hasText: 'Canadian Pressing' })).toHaveAttribute('href', 'http://www.discogs.com/release/567824');
        await expect(d.locator('[data-mb-dg-sec="videos"] a')).toHaveCount(3);

        // A section closes and stays closed through a repaint (another track toggle would repaint it).
        await d.locator('.mb-dg-xh', { hasText: 'Credits' }).click();
        await expect(d.locator('.mb-dg-xh', { hasText: 'Credits' })).toHaveAttribute('aria-expanded', 'false');
        await expect(d.locator('[data-mb-dg-sec="credits"] .mb-dg-lines')).toHaveCount(0);
        await tl.locator('.mb-dg-cr').nth(1).click();
        await expect(d.locator('[data-mb-dg-sec="credits"] .mb-dg-lines')).toHaveCount(0);
        await d.locator('.mb-dg-xh', { hasText: 'Credits' }).click();
        await expect(d.locator('[data-mb-dg-sec="credits"] .mb-dg-lines')).toHaveCount(1);

        // The gallery: five images, the cover the same file as the first, so the viewer counts five.
        const gal = d.locator('[data-mb-dg-sec="images"] .mb-dp-gallery a');
        await expect(gal).toHaveCount(5);
        await gal.nth(2).click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('3 / 5');
        await page.keyboard.press('ArrowRight');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('4 / 5');
    });

    test('a master: no versions from a hover; page 1 when the window opens; the rest on the button; filter, chips, sort; a version in the window and back', async ({ page }) => {
        // A token: 1 s apart, so the three pages take about 3 s.
        await openDiscogs(page, { settings: { sa_pop_ext_discogs_token: 'tok-probe' } });
        await ctrlHover(page, probe(page, 1));
        const c = card(page);
        await expect(c.locator('.mb-tt-title')).toHaveText('Born To Run');
        await expect(c.locator('.mb-dg-sum')).toHaveText('Versions: Space lists them');
        // Until the host's next slot has come (1 s apart with the token): a
        // request the card had started would be made by then.
        await expect.poll(dgSlotWait(page), { timeout: 5000 }).toBe(0);
        await expect(c.locator('.mb-dg-sum')).toHaveText('Versions: Space lists them');
        expect(await dgVersionsLog(page), 'a card never asks for versions').toEqual([]);

        await page.keyboard.press('Space');
        const d = dialog(page);
        const vers = d.locator('[data-mb-dg-sec="versions"]');
        await expect(vers.locator('.mb-dg-counts').first()).toHaveText('100 of 387 loaded');
        expect(await dgVersionsLog(page), 'page 1 only').toEqual([DGV[0]]);
        await expect(d.locator('.mb-dg-xh')).toHaveText(['Images 7', 'Tracklist 8', 'Notes', 'Versions 387']);
        // The versions in the right column under the tracklist (2026-10-26), no full-width part.
        await expect(d.locator('.mb-dp-x.mb-dg-swap > .mb-dp-col').nth(1).locator('.mb-dg-xh')).toHaveText(['Tracklist 8', 'Notes', 'Versions 387']);
        await expect(d.locator('.mb-dg-full')).toHaveCount(0);
        await expect(vers.locator('.mb-dg-bar i')).toHaveCount(4);
        await expect(vers.locator('.mb-dg-bar i.mb-dg-seg-loaded')).toHaveCount(1);
        await expect(vers.locator('tbody tr')).toHaveCount(100);
        // The master's main release, and the release this page links too.
        await expect(vers.locator('tr[data-mb-dg-vid="13896528"] .mb-dg-pill')).toHaveText('main');
        await expect(vers.locator('tr[data-mb-dg-vid="1874253"] .mb-dg-pill')).toHaveText('this page links it');
        // A version's label: Discogs gives its name only, no id, so it links
        // Discogs' label search for that name, in a new tab (not the window).
        const label = vers.locator('tr[data-mb-dg-vid="1874253"] a.mb-dg-label');
        await expect(label).toHaveText('Columbia');
        await expect(label).toHaveAttribute('href', 'https://www.discogs.com/search/?q=Columbia&type=label');
        await expect(label).toHaveAttribute('target', '_blank');

        await vers.getByRole('button', { name: 'Load the other 287 (3 requests, about 3 s)' }).click();
        // Typing while the pages arrive: each arrival repaints the window,
        // and the field keeps its focus, caret and text through them.
        const q = vers.locator('.mb-dg-vq');
        await q.fill('Japan');
        await expect(vers.locator('.mb-dg-counts').first()).toHaveText('387 of 387 loaded', { timeout: DG_RUN_MS });
        await expect(vers.locator('.mb-dg-pill').first()).toHaveText('Done');
        expect(await dgVersionsLog(page), 'one after the other, each once').toEqual(DGV);
        await expect(q).toBeFocused();
        await expect(q).toHaveValue('Japan');
        expect(await q.evaluate(el => el.selectionStart), 'the caret where it was').toBe(5);
        await expect(vers.locator('tbody tr')).toHaveCount(37);
        await vers.getByRole('button', { name: 'Clear filters' }).click();
        await expect(vers.locator('tbody tr')).toHaveCount(387);
        // A chip filters by its value; a second click lifts it.
        await vers.locator('.mb-dg-fc[data-mb-dg-v="Japan"]').click();
        await expect(vers.locator('tbody tr')).toHaveCount(37);
        await expect(vers.locator('tbody tr td:nth-child(4)')).toHaveText(Array(37).fill('Japan'));
        await vers.locator('.mb-dg-fc[data-mb-dg-v="Japan"]').click();
        await expect(vers.locator('tbody tr')).toHaveCount(387);

        // Ctrl-click adds a chip (2026-10-26): OR inside a facet, AND across
        // facets; a plain click keeps only its own value.
        const vCountries = await vers.locator('tbody tr td:nth-child(4)').allTextContents();
        const nOf = (c) => vCountries.filter(x => x === c).length;
        const other = await vers.locator('.mb-dg-fc[data-mb-dg-f="country"]').nth(1).getAttribute('data-mb-dg-v');
        const second = other === 'Japan' ? await vers.locator('.mb-dg-fc[data-mb-dg-f="country"]').nth(0).getAttribute('data-mb-dg-v') : other;
        await vers.locator('.mb-dg-fc[data-mb-dg-v="Japan"]').click();
        await vers.locator(`.mb-dg-fc[data-mb-dg-f="country"][data-mb-dg-v="${second}"]`).click({ modifiers: ['Control'] });
        await expect(vers.locator('.mb-dg-fc[aria-pressed="true"]')).toHaveCount(2);
        await expect(vers.locator('tbody tr')).toHaveCount(nOf('Japan') + nOf(second));
        await expect(vers.locator('.mb-dg-picked')).toHaveText(`Showing Country: Japan or ${second}`);
        const fmt = vers.locator('.mb-dg-fc[data-mb-dg-f="format"]').first();
        const fmtName = await fmt.getAttribute('data-mb-dg-v');
        await fmt.click({ modifiers: ['Control'] });
        await expect(vers.locator('.mb-dg-picked')).toHaveText(`Showing Format: ${fmtName} — and — Country: Japan or ${second}`);
        const both = await vers.locator('tbody tr td:nth-child(4)').allTextContents();
        expect(both.length, 'AND across facets: fewer rows').toBeLessThanOrEqual(nOf('Japan') + nOf(second));
        expect(both.every(c => c === 'Japan' || c === second), 'only the two countries').toBe(true);
        // Ctrl-click takes one out; a plain click keeps only its own value.
        await vers.locator('.mb-dg-fc[data-mb-dg-v="Japan"]').click({ modifiers: ['Control'] });
        await expect(vers.locator('.mb-dg-fc[aria-pressed="true"]')).toHaveCount(2);
        await fmt.click({ modifiers: ['Control'] });
        await vers.locator('.mb-dg-fc[data-mb-dg-v="Japan"]').click();
        await expect(vers.locator('.mb-dg-fc[aria-pressed="true"]')).toHaveCount(1);
        await expect(vers.locator('.mb-dg-fc[aria-pressed="true"]')).toHaveAttribute('data-mb-dg-v', 'Japan');
        await expect(vers.locator('tbody tr')).toHaveCount(nOf('Japan'));
        await vers.getByRole('button', { name: 'Clear filters' }).click();
        await expect(vers.locator('tbody tr')).toHaveCount(387);
        await expect(vers.locator('.mb-dg-fc[aria-pressed="true"]')).toHaveCount(0);

        // The sort ORDERS the rows (years ascending by default; a click on
        // Year descends; versions of no year stay last either way).
        const years = () => vers.locator('tbody tr td.mb-dg-yr').allTextContents();
        const asNum = (list) => list.filter(y => y !== '—').map(y => parseInt(y, 10));
        let ys = await years();
        expect(asNum(ys), 'ascending').toEqual([...asNum(ys)].sort((a, b) => a - b));
        expect(ys.includes('—'), 'the capture has versions of no year').toBe(true);
        expect(ys.slice(ys.indexOf('—')).every(y => y === '—'), 'no year: last').toBe(true);
        await vers.locator('th[data-mb-dg-sort="year"]').click();
        await expect(vers.locator('th[data-mb-dg-sort="year"]')).toHaveAttribute('aria-sort', 'descending');
        ys = await years();
        expect(asNum(ys), 'descending').toEqual([...asNum(ys)].sort((a, b) => b - a));
        expect(ys.slice(ys.indexOf('—')).every(y => y === '—'), 'no year: last').toBe(true);
        await vers.locator('th[data-mb-dg-sort="country"]').click();
        const countries = await vers.locator('tbody tr td:nth-child(4)').allTextContents();
        expect(countries.filter(Boolean), 'countries A→Z').toEqual([...countries.filter(Boolean)].sort((a, b) => a.localeCompare(b)));

        // Back on the card: the versions the window read; again in the window: no request.
        await page.keyboard.press('Escape');
        await ctrlHover(page, probe(page, 1));
        await expect(c.locator('.mb-dg-sum')).toHaveText('387 versions in 33 countries, 1975–2025');
        await page.keyboard.press('Space');
        await expect(vers.locator('.mb-dg-counts').first()).toHaveText('387 of 387 loaded');
        expect(await dgVersionsLog(page), 'memory: no request').toEqual(DGV);

        // A click on a version's row shows that release in the window; Back returns.
        await vers.locator('tr[data-mb-dg-vid="1874253"] td:nth-child(4)').click();
        await expect(d.locator(':scope > div > span').first()).toHaveText('Discogs master › Discogs release');
        await expect(d.locator('.mb-dg-xh', { hasText: 'Companies, etc.' })).toBeVisible();
        await d.getByRole('button', { name: /Back/ }).click();
        await expect(d.locator('[data-mb-dg-sec="versions"] .mb-dg-counts').first()).toHaveText('387 of 387 loaded');
    });

    test('a failed page: "Done with errors", the button asks that page only', async ({ page }) => {
        await openDiscogs(page, {
            settings: { sa_pop_ext_discogs_token: 'tok-probe' },
            responses: { [DGV[2]]: { error: 'network down' } },
        });
        await ctrlHover(page, probe(page, 1));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Born To Run');
        await page.keyboard.press('Space');
        const vers = dialog(page).locator('[data-mb-dg-sec="versions"]');
        await vers.getByRole('button', { name: /^Load the other 287/ }).click();
        await expect(vers.locator('.mb-dg-pill').first()).toHaveText('Done with errors', { timeout: 15000 });
        await expect(vers.locator('.mb-dg-counts').first()).toContainText('287 of 387 loaded');
        await expect(vers.locator('.mb-dg-bad')).toContainText('page 3 failed');
        await expect(vers.locator('.mb-dg-bar i.mb-dg-seg-failed')).toHaveCount(1);
        expect(await dgVersionsLog(page), 'page 4 after the failed 3').toEqual(DGV);
        await page.evaluate(([u, ok]) => { window.__gmXhrResponses[u] = ok; }, [DGV[2], extAnswers('discogs-master-versions-p3')[DGV[2]]]);
        await vers.getByRole('button', { name: 'Try page 3 again (1 request, about 1 s)' }).click();
        await expect(vers.locator('.mb-dg-pill').first()).toHaveText('Done', { timeout: 15000 });
        expect(await dgVersionsLog(page), 'page 3 only, again').toEqual([...DGV, DGV[2]]);
    });

    test('Stop: the page under way finishes, nothing more is asked', async ({ page }) => {
        const slow = extAnswers('discogs-master-versions-p2')[DGV[1]];
        await openDiscogs(page, {
            settings: { sa_pop_ext_discogs_token: 'tok-probe' },
            responses: { [DGV[1]]: { ...slow, delayMs: 1500 } },
        });
        await ctrlHover(page, probe(page, 1));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Born To Run');
        await page.keyboard.press('Space');
        const vers = dialog(page).locator('[data-mb-dg-sec="versions"]');
        await vers.getByRole('button', { name: /^Load the other 287/ }).click();
        await expect(vers.locator('.mb-dg-pill').first()).toHaveText('Running');
        await expect(vers.locator('.mb-dg-bar i.mb-dg-seg-queued')).toHaveCount(2);
        // Stop while page 2's answer is under way (held back 1.5 s).
        await expect.poll(() => dgVersionsLog(page)).toEqual([DGV[0], DGV[1]]);
        await vers.getByRole('button', { name: 'Stop' }).click();
        await expect(vers).toContainText('Stopping after this page');
        await expect(vers.locator('.mb-dg-pill').first()).toHaveText('Idle', { timeout: 10000 });
        await expect(vers.locator('.mb-dg-counts').first()).toHaveText('200 of 387 loaded');
        // Page 3's slot would have come by now.
        await expect.poll(dgSlotWait(page), { timeout: 5000 }).toBe(0);
        expect(await dgVersionsLog(page), 'nothing after the page under way').toEqual([DGV[0], DGV[1]]);
        await expect(vers.getByRole('button', { name: 'Load the other 187 (2 requests, about 2 s)' })).toBeVisible();
    });

    test('Stop before the next page\'s turn: nothing is asked, and the window says so', async ({ page }) => {
        // Without a token: 2.5 s between requests, so page 2 waits its turn.
        await openDiscogs(page);
        await ctrlHover(page, probe(page, 1));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Born To Run', { timeout: 10000 });
        await page.keyboard.press('Space');
        const vers = dialog(page).locator('[data-mb-dg-sec="versions"]');
        await expect(vers.locator('.mb-dg-counts').first()).toHaveText('100 of 387 loaded', { timeout: 10000 });
        await vers.getByRole('button', { name: /^Load the other 287/ }).click();
        await vers.getByRole('button', { name: 'Stop' }).click();
        await expect(vers.locator('.mb-dg-pill').first()).toHaveText('Idle', { timeout: 10000 });
        await expect(vers.locator('.mb-dg-bar i.mb-dg-seg-running, .mb-dg-bar i.mb-dg-seg-queued')).toHaveCount(0);
        expect(await dgVersionsLog(page), 'page 1 only').toEqual([DGV[0]]);
    });

    test('names link their Discogs pages; the title and subtitle say what the link is; an artist opens in the window', async ({ page }) => {
        await openDiscogs(page);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-ext-headtext .mb-tt-comment')).toHaveText('Discogs · release');
        // A card of another site has the kind line too: the window's kind,
        // no glyph (MusicBrainz kinds only).
        await expect(card(page).locator(':scope > .mb-pop-kind-head')).toHaveText('Discogs release');
        await expect(card(page).locator(':scope > .mb-pop-kind-head img')).toHaveCount(0);
        await page.keyboard.press('Space');
        const d = dialog(page);
        const title = d.locator(':scope > div > span').first();
        await expect(title).toHaveText('Discogs release');
        await expect(d.locator('.mb-dp-xsub').first()).toHaveText('Discogs · release');
        // The facts: the artist and the label link their pages.
        await expect(d.locator('.mb-dp-kv a[href="https://www.discogs.com/artist/219986"]')).toHaveText('Bruce Springsteen');
        await expect(d.locator('.mb-dp-kv a[href="https://www.discogs.com/label/1866"]')).toHaveText('Columbia');
        await expect(d.locator('.mb-dp-kv')).toContainText('Columbia – PC 33795');
        // A company and a credit, a name credited differently included.
        await expect(d.locator('[data-mb-dg-sec="companies"] a[href="https://www.discogs.com/label/265540"]').first()).toHaveText('Record Plant, N.Y.C.');
        const landau = d.locator('[data-mb-dg-sec="credits"] a.mb-dg-name', { hasText: 'Jon Landau' }).first();
        await expect(landau).toHaveAttribute('href', /^https:\/\/www\.discogs\.com\/artist\/\d+$/);
        const tl = d.locator('[data-mb-dg-sec="tracklist"]');
        await tl.getByRole('button', { name: 'Show all track credits' }).click();
        await expect(tl.locator('a[href="https://www.discogs.com/artist/254876"]').first()).toHaveText('Max M. Weinberg*');
        // A click on the artist shows the artist in the window; Back returns.
        await d.locator('.mb-dp-kv a[href="https://www.discogs.com/artist/219986"]').click();
        await expect(title).toHaveText('Discogs release › Discogs artist');
        await expect(d).toContainText('Bruce Frederick Joseph Springsteen');
        await expect(d.locator('.mb-dp-xsub').first()).toHaveText('Discogs · artist');
        await d.getByRole('button', { name: /Back/ }).click();
        await expect(title).toHaveText('Discogs release');
    });

    test('a record of an earlier Discogs reader is not served from IndexedDB', async ({ page }) => {
        await openDiscogs(page);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-dg-sum')).toBeVisible();
        const key = `mb:ext:discogs:${DG.release}`;
        await expect.poll(() => idbHas(page, key)).toBe(true);
        // The same record as an earlier reader kept it: version 3 (before
        // 2026-10-17, no window data) and 302 (the window without the
        // names' Discogs ids, which a browser that tried the branch holds).
        for (const v of [3, 302]) {
            await page.evaluate(([k, ver]) => new Promise((resolve, reject) => {
                const req = indexedDB.open('vz-saed-detail-pages');
                req.onsuccess = () => {
                    const db = req.result;
                    const store = db.transaction('pages', 'readwrite').objectStore('pages');
                    const g = store.get(k);
                    g.onsuccess = () => {
                        const r = g.result;
                        r.v = ver;
                        r.data = { ...r.data, title: 'OLD RECORD', discogs: undefined };
                        store.put(r).onsuccess = () => { db.close(); resolve(); };
                    };
                    g.onerror = reject;
                };
                req.onerror = reject;
            }), [key, v]);
            await reloadEvent(page);
            await addAnnotationLinks(page, [DG.release, DG.master]);
            await ctrlHover(page, probe(page, 0));
            await expect(card(page).locator('.mb-tt-title'), `version ${v}`).toHaveText('Born To Run');
            expect((await xhrFull(page)).map(r => r.url), `version ${v}: asked again`).toEqual(['https://api.discogs.com/releases/1874253']);
        }
    });
});

// The Discogs artist and label windows (2026-10-18, mockup
// https://claude.ai/artifact/WuBNbFTgNHJtxip4xBv6yc): the profile, every
// image, the names and sites come in the reader's ONE answer; an artist's
// discography and a label's releases are lists of their own, 100 a page,
// page 1 when the window opens. Fixtures (captured 2026-10-18,
// scripts/capture-ext-fixtures.py): Max Weinberg (254876), 528 entries = 6
// pages holding every kind of role in Discogs' order (page 1: Main 2,
// Producer 7, Mixed by 2, Appearance 89; pages 2-4 Appearance; page 5
// Appearance 35, TrackAppearance 7, UnofficialRelease 58; page 6
// UnofficialRelease 28); Bruce Springsteen's page 1 of 68 (Main only);
// Columbia newest first pages 1-6 and oldest first page 1 (396,611 releases).
const DGA = {
    small: 'https://www.discogs.com/artist/254876-Max-Weinberg',
    pages: [1, 2, 3, 4, 5, 6].map(p => `https://api.discogs.com/artists/254876/releases?sort=year&sort_order=asc&per_page=100&page=${p}`),
    bigP1: 'https://api.discogs.com/artists/219986/releases?sort=year&sort_order=asc&per_page=100&page=1',
    nest: 'https://api.discogs.com/masters/450426/versions?per_page=100&page=1',
};
const DGL = (order, p) => `https://api.discogs.com/labels/1866/releases?sort=year&sort_order=${order}&per_page=100&page=${p}`;
// The list requests made so far (not the readers' own records).
const dgListLog = async (page) => (await xhrFull(page)).map(r => r.url).filter(u => /\/releases\?|\/versions\?/.test(u));

/**
 * The event page with the Discogs answers of the artist and label windows,
 * the links in the annotation: Max Weinberg, Bruce Springsteen, Columbia.
 * A token by default (1 s apart), so a run of pages takes seconds.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, responses?: Object}} [opts]
 * @returns {Promise<void>}
 */
async function openDiscogsEntities(page, { settings = {}, responses = {} } = {}) {
    await page.context().route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await openEvent(page, {
        settings: { sa_pop_ext: true, sa_pop_ext_discogs_token: 'tok-probe', ...settings },
        responses: {
            ...extAnswers('discogs-artist', 'discogs-label', 'discogs-master', 'discogs-artist-small', 'discogs-artist-releases-p1',
                'discogs-master-450426-versions-p1', 'discogs-label-releases-asc-p1',
                ...[1, 2, 3, 4, 5, 6].map(p => `discogs-artist-small-p${p}`),
                ...[1, 2, 3, 4, 5, 6].map(p => `discogs-label-releases-desc-p${p}`)),
            ...responses,
        },
    });
    await addAnnotationLinks(page, [DGA.small, DG.artist, DG.label]);
}

test.describe('the Discogs artist and label windows (2026-10-18)', () => {
    test('an artist: no discography from a hover; the window\'s profile, images, names, sites; sections by role, "so far" until a later role; the rest on the button', async ({ page }) => {
        await openDiscogsEntities(page);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        await expect(c.locator('.mb-tt-title')).toHaveText('Max Weinberg');
        await expect(c.locator('.mb-dg-sum')).toHaveText('3 images · discography: Space lists it');
        await expect(c, 'the data quality is the window\'s only').not.toContainText('Data quality');
        await expect(c).toContainText('Aliases');
        await expect.poll(dgSlotWait(page), { timeout: 5000 }).toBe(0);
        expect(await dgListLog(page), 'a card never asks for the discography').toEqual([]);

        await page.keyboard.press('Space');
        const d = dialog(page);
        const disco = d.locator('[data-mb-dg-disco="artist"]');
        await expect(disco.locator('.mb-dg-counts').first()).toHaveText('100 of 528 loaded');
        expect(await dgListLog(page), 'page 1 only').toEqual([DGA.pages[0]]);
        // Page 1 holds Main, the credits and the first Appearances: Releases
        // and Credits are complete (a later role has arrived), Appearances not.
        // Sides swapped (2026-10-26): the discography is the right column.
        await expect(d.locator('.mb-dp-x.mb-dg-swap > .mb-dp-col').nth(1).locator(':scope > [data-mb-dg-disco="artist"]')).toHaveCount(1);
        await expect(d.locator('.mb-dp-x.mb-dg-swap > .mb-dp-col').nth(0).locator('.mb-dg-xh')).toHaveText(['Profile', 'Sites 3', 'Images 3']);
        await expect(d.locator('.mb-dg-xh')).toHaveText(['Profile', 'Sites 3', 'Images 3', 'Releases 2', 'Appearances 89 so far',
            'On releases 89 so far', 'On tracks …', 'Unofficial …', 'Credits 9', 'Producer 7', 'Mixed by 2']);
        await expect(disco.locator('.mb-dg-c.mb-dg-sofar')).toHaveCount(4);
        await expect(disco.locator('[data-mb-dg-sec="a-TrackAppearance"]')).toContainText('Not loaded yet');
        await expect(disco.locator('[data-mb-dg-sec="a-credits"] .mb-dg-box'))
            .toContainText('(for Max Weinberg: Producer, Mixed by, 9 entries)');
        await expect(disco.locator('[data-mb-dg-sec="a-credits"] .mb-dg-box a')).toHaveAttribute('href', 'https://www.discogs.com/artist/254876?type=Credits');
        // The profile is its own section, not the description again.
        await expect(d.locator('.mb-ext-xdesc')).toHaveCount(0);
        await expect(d.locator('[data-mb-dg-sec="profile"]')).toContainText('no junior Ginger Bakers');
        // "Discogs says": the names linked to their pages, the data quality.
        const kv = d.locator('.mb-dp-kv').last();
        await expect(kv.locator('dt')).toHaveText(['Real name', 'In groups', 'Aliases', 'Variations', 'Data quality']);
        await expect(kv.locator('a[href="https://www.discogs.com/artist/408247"]')).toHaveText('The E-Street Band');
        await expect(kv.locator('a[href="https://www.discogs.com/artist/7670035"]')).toHaveText('Mighty Max');
        // A release row: its format and label; a master row: no format, a versions toggle.
        const main = disco.locator('[data-mb-dg-sec="a-main"] tbody > tr');
        await expect(main).toHaveCount(2);
        await expect(main.nth(0)).toContainText('13xFile, MP3, Single, 256 · Sha-La Music');
        await expect(main.nth(0).locator('.mb-dg-pill')).toHaveText('release');
        await expect(main.nth(1).locator('.mb-dg-pill')).toHaveText('master');
        await expect(main.nth(1).locator('.mb-dg-exp')).toHaveText('▸ versions');
        // Releases: by this artist (with others), so the artist column is there.
        await expect(disco.locator('[data-mb-dg-sec="a-main"] th')).toHaveText(['', 'Title', 'Artist', 'Year', 'Have', 'Want']);

        await disco.getByRole('button', { name: 'Load the other 428 (5 requests, about 5 s)' }).click();
        await expect(disco.locator('.mb-dg-pill').first()).toHaveText('Running');
        await expect(disco.getByRole('button', { name: 'Stop' })).toBeVisible();
        await expect(disco.locator('.mb-dg-counts').first()).toHaveText('528 of 528 loaded', { timeout: DG_RUN_MS });
        await expect(disco.locator('.mb-dg-pill').first()).toHaveText('Done');
        expect(await dgListLog(page), 'one after the other, each once').toEqual(DGA.pages);
        await expect(d.locator('.mb-dg-xh')).toHaveText(['Profile', 'Sites 3', 'Images 3', 'Releases 2', 'Appearances 431',
            'On releases 424', 'On tracks 7', 'Unofficial 86', 'Credits 9', 'Producer 7', 'Mixed by 2']);
        await expect(disco.locator('.mb-dg-c.mb-dg-sofar')).toHaveCount(0);
        await expect(disco.locator('.mb-dg-bar i.mb-dg-seg-loaded')).toHaveCount(6);
    });

    test('an artist\'s tables: 150 rows, then "Show more"; sort; the filter and chips over what is loaded; a master row\'s versions', async ({ page }) => {
        await openDiscogsEntities(page);
        await ctrlHover(page, probe(page, 0));
        await page.keyboard.press('Space');
        const d = dialog(page);
        const disco = d.locator('[data-mb-dg-disco="artist"]');
        await disco.getByRole('button', { name: /^Load the other 428/ }).click();
        await expect(disco.locator('.mb-dg-counts').first()).toHaveText('528 of 528 loaded', { timeout: DG_RUN_MS });

        const onRel = disco.locator('[data-mb-dg-sec="a-Appearance"]');
        await expect(onRel.locator('tbody > tr')).toHaveCount(150);
        await expect(onRel.locator('.mb-dg-morerow')).toContainText('Showing 150 of 424.');
        await onRel.getByRole('button', { name: 'Show 274 more' }).click();
        await expect(onRel.locator('tbody > tr')).toHaveCount(424);
        await expect(onRel.locator('.mb-dg-morerow')).toHaveCount(0);

        // Discogs' order (by year) first; "Have" sorts most first.
        await expect(onRel.locator('tbody > tr').first()).toContainText('Love, Love, Love');
        await onRel.locator('th[data-mb-dg-asort="have"]').click();
        await expect(onRel.locator('th[data-mb-dg-asort="have"]')).toHaveAttribute('aria-sort', 'descending');
        await expect(onRel.locator('tbody > tr').first()).toContainText('Born In The U.S.A.');
        await expect(onRel.locator('tbody > tr').first().locator('td.mb-dg-num').first()).toHaveText('63,340');
        // A second click: back to Discogs' order.
        await onRel.locator('th[data-mb-dg-asort="have"]').click();
        await expect(onRel.locator('th[data-mb-dg-asort="have"]')).not.toHaveAttribute('aria-sort', /./);
        await expect(onRel.locator('tbody > tr').first()).toContainText('Love, Love, Love');

        // The Masters chip and the filter narrow every section; the counts stay what Discogs has.
        await disco.locator('.mb-dg-fc[data-mb-dg-atype="m"]').click();
        await expect(disco.locator('.mb-dg-fc[data-mb-dg-atype="m"]')).toHaveText('Masters352');
        await expect(disco.locator('[data-mb-dg-sec="a-main"] tbody > tr')).toHaveCount(1);
        const q = disco.locator('.mb-dg-aq');
        await q.fill('signal hill');
        await expect(q).toBeFocused();
        await expect(disco.locator('[data-mb-dg-sec="a-main"]')).toContainText('No loaded entry matches the filter.');
        await expect(disco.locator('[data-mb-dg-sec="a-c-Producer"] tbody > tr')).toHaveCount(1);
        await expect(disco.locator('[data-mb-dg-sec="a-c-Producer"] tbody > tr')).toContainText('Summer On Signal Hill');
        await expect(d.locator('.mb-dg-xh', { hasText: 'Producer' })).toHaveText('Producer 7');
        await disco.getByRole('button', { name: 'Clear filters' }).click();
        await expect(q).toHaveValue('');
        await expect(disco.locator('[data-mb-dg-sec="a-c-Producer"] tbody > tr')).toHaveCount(7);

        // A master row's versions: one request, on the click only.
        const before = await dgListLog(page);
        expect(before.filter(u => u.includes('/versions?')), 'no versions before the click').toEqual([]);
        const john = disco.locator('[data-mb-dg-sec="a-c-Producer"] tbody > tr', { hasText: 'John Eddie' }).first();
        await john.locator('.mb-dg-exp').click();
        const nest = disco.locator('[data-mb-dg-sec="a-c-Producer"] .mb-dg-nest');
        await expect(nest.locator('.mb-dg-nt tr')).toHaveCount(12);
        await expect(nest.locator('.mb-dg-counts')).toContainText('18 versions · the first 12 in Discogs\' order.');
        await expect(nest.locator('a', { hasText: 'Open the master here' })).toHaveAttribute('href', 'https://www.discogs.com/master/450426');
        expect((await dgListLog(page)).filter(u => u.includes('/versions?')), 'one request').toEqual([DGA.nest]);
        // The same master under "Mixed by" is open too, from the same answer.
        await expect(disco.locator('[data-mb-dg-sec="a-c-Mixed-by"] .mb-dg-nt tr')).toHaveCount(12);
        expect((await dgListLog(page)).filter(u => u.includes('/versions?'))).toEqual([DGA.nest]);
        await john.locator('.mb-dg-exp').click();
        await expect(disco.locator('.mb-dg-nest')).toHaveCount(0);
    });

    test('Bruce Springsteen: page 1 of 68; the profile\'s names; 27 images in the viewer; a master opens in the window and Back returns', async ({ page }) => {
        // No token: 2.5 s apart, as most users have it.
        await openDiscogsEntities(page, { settings: { sa_pop_ext_discogs_token: '' } });
        await ctrlHover(page, probe(page, 1));
        const c = card(page);
        await expect(c.locator('.mb-dg-sum')).toHaveText('27 images · discography: Space lists it');
        await page.keyboard.press('Space');
        const d = dialog(page);
        const disco = d.locator('[data-mb-dg-disco="artist"]');
        await expect(disco.locator('.mb-dg-counts').first()).toHaveText('100 of 6,782 loaded');
        await expect(disco.locator('h3')).toHaveText('Discography 6,782');
        // Page 1 is Main only: nothing is complete yet, the button names the cost.
        await expect(disco.locator('.mb-dg-xh')).toHaveText(['Releases 100 so far', 'Appearances …', 'On releases …', 'On tracks …',
            'Unofficial …', 'Credits …']);
        await expect(disco.getByRole('button', { name: 'Load the other 6,682 (67 requests, about 2 min 48 s)' })).toBeVisible();
        await expect(disco.locator('.mb-dg-bar i')).toHaveCount(68);
        await expect(disco.locator('[data-mb-dg-sec="a-credits"]')).toContainText('Not loaded yet: Discogs lists credits after the artist\'s own releases.');
        // Some of his Main entries are splits with others: the artist column is there.
        await expect(disco.locator('[data-mb-dg-sec="a-main"] th', { hasText: 'Artist' })).toHaveCount(1);

        // The profile's names link Discogs' search (the markup gives no id).
        const prof = d.locator('[data-mb-dg-sec="profile"]');
        await expect(prof.locator('a', { hasText: 'Patti Scialfa' })).toHaveAttribute('href', 'https://www.discogs.com/search/?q=Patti%20Scialfa&type=artist');
        await expect(prof).not.toContainText('[a=');
        // Name variations: ten, then all.
        const kv = d.locator('.mb-dp-kv').last();
        await kv.getByRole('button', { name: '+31 more' }).click();
        await expect(kv.getByRole('button', { name: 'fewer' })).toBeVisible();
        await expect(kv.locator('dt')).toHaveText(['Real name', 'In groups', 'Aliases', 'Variations', 'Data quality']);

        // Every image, the "More images" set included; the cover is the first, counted once.
        const gal = d.locator('[data-mb-dg-sec="images"] .mb-dp-gallery a');
        await expect(gal).toHaveCount(27);
        await expect(gal.first().locator('span')).toHaveText('primary');
        await gal.nth(26).click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('27 / 27');
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();

        // A master's title shows it in the window; Back returns to the discography.
        await disco.locator('[data-mb-dg-sec="a-main"] a[href="https://www.discogs.com/master/26725"]').click();
        await expect(d.locator(':scope > div > span').first()).toHaveText('Discogs artist › Discogs master');
        await expect(d.locator('.mb-dg-xh', { hasText: 'Tracklist' })).toBeVisible();
        await d.getByRole('button', { name: /Back/ }).click();
        await expect(disco.locator('.mb-dg-counts').first()).toHaveText('100 of 6,782 loaded');
    });

    test('a label: page 1 newest first, a warning for its size; 5 more pages a click; the other order is asked once; format chips, filter, Show all', async ({ page }) => {
        await openDiscogsEntities(page);
        await ctrlHover(page, probe(page, 2));
        const c = card(page);
        await expect(c.locator('.mb-tt-title')).toHaveText('Columbia');
        await expect(c.locator('.mb-dg-sum')).toHaveText('74 images · releases: Space lists them');
        await expect(c).toContainText('Sony Music Entertainment');
        await expect.poll(dgSlotWait(page), { timeout: 5000 }).toBe(0);
        expect(await dgListLog(page), 'a card never asks for the releases').toEqual([]);

        await page.keyboard.press('Space');
        const d = dialog(page);
        const rel = d.locator('[data-mb-dg-disco="label"]');
        await expect(rel.locator('h3')).toHaveText('Releases 396,611');
        await expect(rel.locator('.mb-dg-warnbox')).toContainText('Columbia has 396,611 releases on Discogs. Loading them all would take 3,967 requests');
        await expect(rel.locator('.mb-dg-counts').first()).toHaveText('100 of 396,611 loaded · one segment = 100 releases');
        expect(await dgListLog(page)).toEqual([DGL('desc', 1)]);
        await expect(rel.locator('.mb-dg-bar i')).toHaveCount(1);
        await expect(rel.locator('tbody > tr').first()).toContainText('Sweet FA');
        // "Discogs says": the parent label linked, how many releases.
        const kv = d.locator('.mb-dp-kv').last();
        await expect(kv.locator('a[href="https://www.discogs.com/label/29073"]')).toHaveText('Sony Music Entertainment');
        await expect(kv).toContainText('396,611');
        // The profile's label references by id link the label's page.
        await expect(d.locator('[data-mb-dg-sec="profile"] a[href="https://www.discogs.com/label/112015"]')).toHaveText('label 112015');
        await expect(d.locator('.mb-dg-xh', { hasText: 'Contact info' })).toBeVisible();
        // Sides swapped (2026-10-26): the releases are the right column,
        // the sublabels a table with a pager on the left.
        const cols = d.locator('.mb-dp-x.mb-dg-swap > .mb-dp-col');
        await expect(cols.nth(1).locator(':scope > [data-mb-dg-disco="label"]')).toHaveCount(1);
        const subs = cols.nth(0).locator('[data-mb-dg-sec="sublabels"]');
        const subRows = subs.locator('table.mb-dg-subt tbody tr');
        await expect(subRows).toHaveCount(25);
        await expect(subs.locator('.mb-dg-pager span')).toHaveText('1–25 of 217');
        await expect(subs.getByRole('button', { name: 'Previous page' })).toBeDisabled();
        const firstName = await subRows.first().locator('a').textContent();
        await subs.getByRole('button', { name: 'Next page' }).click();
        await expect(subs.locator('.mb-dg-pager span')).toHaveText('26–50 of 217');
        await expect(subRows.first().locator('a')).not.toHaveText(firstName);
        // Sorted by name: the page's names in order.
        const names = await subRows.locator('td:first-child').evaluateAll(tds => tds.map(td => td.textContent));
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
        // Name descending, back to page 1.
        await subs.locator('th[data-mb-dg-ssort="name"]').click();
        await expect(subs.locator('th[data-mb-dg-ssort="name"]')).toHaveAttribute('aria-sort', 'descending');
        await expect(subs.locator('.mb-dg-pager span')).toHaveText('1–25 of 217');
        // The filter: the field keeps its focus, page 1 of the matches.
        const sq = subs.locator('.mb-dg-sq');
        await sq.fill('Columbia');
        await expect(sq).toBeFocused();
        const nMatch = await subRows.count();
        expect(nMatch).toBeGreaterThan(0);
        expect((await subRows.locator('td:first-child').allTextContents()).every(n => /columbia/i.test(n))).toBe(true);
        await sq.fill('');
        await expect(subRows).toHaveCount(25);
        await expect(subs.getByRole('button', { name: /more/ })).toHaveCount(0);

        await rel.getByRole('button', { name: 'Load 5 more pages (500 releases, about 5 s)' }).click();
        await expect(rel.locator('.mb-dg-counts').first()).toHaveText('600 of 396,611 loaded · one segment = 100 releases', { timeout: 20000 });
        expect(await dgListLog(page), 'the batch, and no page more').toEqual([1, 2, 3, 4, 5, 6].map(p => DGL('desc', p)));
        await expect(rel.locator('.mb-dg-bar i.mb-dg-seg-loaded')).toHaveCount(6);
        await expect(rel.getByRole('button', { name: 'Load 5 more pages (500 releases, about 5 s)' })).toBeVisible();

        // 200 rows, then all of them.
        await expect(rel.locator('tbody > tr')).toHaveCount(200);
        await rel.getByRole('button', { name: 'Show all 600' }).click();
        await expect(rel.locator('tbody > tr')).toHaveCount(600);
        // Format chips count what is loaded; one narrows the table.
        await expect(rel.locator('.mb-dg-fc').first()).toHaveText('LP314');
        await rel.locator('.mb-dg-fc[data-mb-dg-lfmt="CD"]').click();
        await expect(rel.locator('tbody > tr')).toHaveCount(100);
        const q = rel.locator('.mb-dg-lq');
        await rel.getByRole('button', { name: 'Clear filters' }).click();
        await q.fill('Y4LPLY585');
        await expect(rel.locator('tbody > tr')).toHaveCount(1);
        await expect(q).toBeFocused();
        await rel.getByRole('button', { name: 'Clear filters' }).click();

        // Oldest first: another list, asked once; back to newest: no request, the 600 still there.
        await rel.getByRole('button', { name: 'Oldest first' }).click();
        await expect(rel.locator('.mb-dg-counts').first()).toHaveText('100 of 396,611 loaded · one segment = 100 releases');
        await expect(rel.locator('tbody > tr').first().locator('.mb-dg-yr')).toHaveText('—');
        await rel.getByRole('button', { name: 'Newest first' }).click();
        await expect(rel.locator('.mb-dg-counts').first()).toHaveText('600 of 396,611 loaded · one segment = 100 releases');
        expect(await dgListLog(page)).toEqual([...[1, 2, 3, 4, 5, 6].map(p => DGL('desc', p)), DGL('asc', 1)]);
    });

    test('a later visit: the discography from IndexedDB, hatched, without a request; Stop ends a run with the page under way', async ({ page }) => {
        await openDiscogsEntities(page);
        await ctrlHover(page, probe(page, 0));
        await page.keyboard.press('Space');
        const disco = dialog(page).locator('[data-mb-dg-disco="artist"]');
        await disco.getByRole('button', { name: /^Load the other 428/ }).click();
        await expect(disco.locator('.mb-dg-counts').first()).toHaveText(/^300 of 528 loaded/, { timeout: 20000 });
        await disco.getByRole('button', { name: 'Stop' }).click();
        await expect(disco.locator('.mb-dg-pill').first()).toHaveText('Idle', { timeout: 10000 });
        const loaded = (await dgListLog(page)).length;
        expect(loaded, 'the page under way finished, nothing more').toBeLessThanOrEqual(4);
        await expect(disco.getByRole('button', { name: /^Load the other/ })).toBeVisible();
        // "Nothing more" needs time to pass: with the token a page may go 1 s
        // after the last, so watch for more than two slots for a request
        // more (a poll for "still N" would pass on its first look). The pill
        // reads Idle for a moment between two pages of a run, so it is
        // checked after the watch too.
        const more = await expect.poll(async () => (await dgListLog(page)).length, { timeout: 2500, intervals: [250] })
            .toBeGreaterThan(loaded).then(() => true, () => false);
        expect(more, 'no page after Stop').toBe(false);
        await expect(disco.locator('.mb-dg-pill').first()).toHaveText('Idle');

        await reloadEvent(page);
        await addAnnotationLinks(page, [DGA.small, DG.artist, DG.label]);
        await ctrlHover(page, probe(page, 0));
        await page.keyboard.press('Space');
        const again = dialog(page).locator('[data-mb-dg-disco="artist"]');
        await expect(again.locator('.mb-dg-counts').first()).toHaveText(new RegExp(`^${loaded * 100} of 528 loaded · ${loaded * 100} from cache`));
        await expect(again.locator('.mb-dg-bar i.mb-dg-seg-cache')).toHaveCount(loaded);
        expect(await dgListLog(page), 'nothing asked again').toEqual([]);
    });

    test('an artist record of the reader before its window is not served from IndexedDB', async ({ page }) => {
        await openDiscogsEntities(page);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-dg-sum')).toBeVisible();
        const key = `mb:ext:discogs:${DGA.small}`;
        await expect.poll(() => idbHas(page, key)).toBe(true);
        // As reader version 3 kept it (2026-10-17): no window data.
        await page.evaluate((k) => new Promise((resolve, reject) => {
            const req = indexedDB.open('vz-saed-detail-pages');
            req.onsuccess = () => {
                const db = req.result;
                const store = db.transaction('pages', 'readwrite').objectStore('pages');
                const g = store.get(k);
                g.onsuccess = () => {
                    const r = g.result;
                    r.v = 303;
                    r.data = { ...r.data, title: 'OLD RECORD', discogs: undefined, descInWindow: undefined };
                    store.put(r).onsuccess = () => { db.close(); resolve(); };
                };
                g.onerror = reject;
            };
            req.onerror = reject;
        }), key);
        await reloadEvent(page);
        await addAnnotationLinks(page, [DGA.small, DG.artist, DG.label]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Max Weinberg');
        expect((await xhrFull(page)).map(r => r.url), 'asked again').toEqual(['https://api.discogs.com/artists/254876']);
    });
});

// U4: the four Springsteen sites' own parsers on links from MusicBrainz, and
// the Brucebase date anchor. Pages are the detail-preview fixtures
// (scripts/build-detail-fixtures.py; jungleland.it's is windows-1252 bytes,
// read here as latin1, i.e. as a correct decoding gives it) and Brucebase's
// 2025 year page (tests/fixtures/ext-bb-year-2025.html). All four hosts are in
// the header's @connect: a hover loads them.
const page_ = (name, enc = 'utf8') => fs.readFileSync(path.join(__dirname, name), enc);
const htmlAnswer = (body) => ({ status: 200, responseHeaders: HTML_HEADERS, responseText: body });
const SP = {
    sl: 'https://www.springsteenlyrics.com/bootlegs.php?item=6739&category=aud_live2014',
    jl: new URL('https://www.jungleland.it/html/Magic In The Köln Night (2007-12-13).htm').href,
    bs: 'https://www.brucespringsteen.it/DB/detrec.aspx?code=CR1AD1',
    bb: 'https://brucebase.wikidot.com/song:4th-of-july-asbury-park-sandy',
};
const BB_YEAR = 'https://brucebase.wikidot.com/2025';
const BBD = {
    stonePony: 'http://brucebase.wikidot.com/2025#261025',
    library: 'https://brucebase.wikidot.com/2025#031125',
    january: 'https://brucebase.wikidot.com/2025#090125',
    none: 'https://brucebase.wikidot.com/2025#010125',
};

/**
 * A solid PNG of a given size: an image answer that takes room once it
 * has loaded (a 1×1 pixel would not move anything on the page).
 *
 * @param {number} w
 * @param {number} h
 * @returns {Buffer}
 */
function solidPng(w, h) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr.set([8, 0, 0, 0, 0], 8);
    // One filter byte (0) and w grey pixels per row.
    const rows = Buffer.alloc((w + 1) * h, 0x99);
    for (let y = 0; y < h; y++) rows[y * (w + 1)] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe('the Springsteen sites across hosts (U4)', () => {
    test('which reader serves which link: the four sites\' detail pages, a Brucebase date; the rest generic', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true } });
        await addAnnotationLinks(page, [
            SP.sl, SP.jl, SP.bs, SP.bb, BBD.stonePony,
            'https://brucebase.wikidot.com/2025', 'https://brucebase.wikidot.com/gig:2025-10-26-stone-pony-asbury-park-nj',
            'https://www.springsteenlyrics.com/index.php', 'https://www.jungleland.it/html/list.htm',
        ]);
        const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.ext-probe a'))
            .map(a => window.__saTest.popResolve(a).split(':').slice(0, 2).join(':')));
        expect(keys).toEqual([
            'ext|ext:springsteen', 'ext|ext:springsteen', 'ext|ext:springsteen', 'ext|ext:springsteen', 'ext|ext:bbdate',
            'ext|ext:generic', 'ext|ext:generic', 'ext|ext:generic', 'ext|ext:generic',
        ]);
    });

    test('each site\'s own card, fetched anonymously; jungleland.it decoded as windows-1252', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: {
                [SP.sl]: htmlAnswer(page_('detail-sl-bootlegs-6739.html')),
                [SP.jl]: htmlAnswer(page_('detail-jl-koln.html', 'latin1')),
                [SP.bs]: htmlAnswer(page_('detail-bs-CR1AD1.html')),
                [SP.bb]: htmlAnswer(page_('detail-bb-4th-of-july.html')),
            },
        });
        await addAnnotationLinks(page, [SP.sl, SP.jl, SP.bs, SP.bb]);
        const c = card(page);
        const expected = [
            ['First Ever Show In Perth', '28 tracks'],
            ['Magic In The Köln Night (2007-12-13)', 'jungleland.it'],
            ['1001 AMERICAN DREAMS', '14 tracks'],
            ['4th Of July, Asbury Park (Sandy)', '280'],
        ];
        for (const [i, [title, more]] of expected.entries()) {
            await ctrlHover(page, probe(page, i));
            await expect(c.locator('.mb-tt-title').first()).toHaveText(title, { timeout: 10000 });
            await expect(c).toContainText(more);
            await expect(c.locator('.mb-ext-st')).toHaveText('200');
            // The site line keeps its look around a site's own card body: the
            // green pill, the 16 px initial (a user's screenshot showed them
            // unstyled; this pins that the script's own rules reach them).
            await expect(c.locator('.mb-ext-st')).toHaveCSS('background-color', 'rgb(220, 239, 226)');
            await expect(c.locator('.mb-ext-fav')).toHaveCSS('width', '16px');
        }
        const log = await xhrFull(page);
        expect(log.map(r => r.url)).toEqual([SP.sl, SP.jl, SP.bs, SP.bb]);
        expect(log.every(r => r.anonymous)).toBe(true);
        expect(log.map(r => r.overrideMimeType), 'only jungleland.it names its charset for it').toEqual(
            ['', 'text/html; charset=windows-1252', '', '']);
    });

    test('a site\'s window: its own columns beside the link\'s; its Live page from the hover\'s fetch, trimmed as on the site', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true }, responses: { [SP.sl]: htmlAnswer(page_('detail-sl-bootlegs-6739.html')) } });
        await addAnnotationLinks(page, [SP.sl]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('28 tracks');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Detail page');
        await expect(d).toContainText('Tracklist · 28 tracks');
        await expect(d.locator('h4', { hasText: 'Link' })).toBeVisible();
        await expect(d).toContainText('MusicBrainz knows this URL');
        await d.getByRole('button', { name: 'Live page' }).click();
        const frame = d.locator('iframe');
        await expect(frame).toHaveAttribute('srcdoc', /blog-post/);
        // Set on the frame's load (_dpIsolateFrame()), after srcdoc: read
        // once that has run. Read at once, it failed under a loaded full run
        // (0 hidden, 2026-10-14).
        await expect.poll(() => frame.evaluate((f) => {
            const doc = f.contentDocument;
            return doc && doc.documentElement && doc.documentElement.dataset.mbDpDone ? doc.querySelectorAll('.mb-dp-hide').length : -1;
        }), 'springsteenlyrics.com\'s own liveRoot hides its navigation').toBeGreaterThan(0);
        expect((await xhrFull(page)).map(r => r.url), 'one request: the Live page reuses the hover\'s').toEqual([SP.sl]);
    });

    test('a Brucebase date: one year page for every show of that year, kept by year; the show\'s card, a date without a show', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: { [BB_YEAR]: htmlAnswer(page_('ext-bb-year-2025.html')) },
        });
        await addAnnotationLinks(page, [BBD.stonePony, BBD.library, BBD.none, BBD.january]);
        const c = card(page);
        await ctrlHover(page, probe(page, 0));
        await expect(c.locator('.mb-tt-title').first()).toHaveText('THE STONE PONY, ASBURY PARK, NJ');
        await expect(c).toContainText('2025-10-26');
        await expect(c).toContainText('3 tracks');
        await expect(c).toContainText('I DON\'T WANT TO GO HOME');
        await expect(c).toContainText('Steven Van Zandt');
        await expect(c.locator('.mb-ext-https'), 'asked as https, as the site redirects').toHaveText('→ https');
        expect((await xhrFull(page)).map(r => r.url), 'the year page, as https').toEqual([BB_YEAR]);

        await ctrlHover(page, probe(page, 1));
        await expect(c.locator('.mb-tt-title').first()).toHaveText('NEW YORK PUBLIC LIBRARY, NEW YORK CITY, NY');
        await expect(c).toContainText('THUNDER ROAD');
        await ctrlHover(page, probe(page, 2));
        await expect(c.locator('.mb-ext-st')).toHaveText('not available');
        await expect(c).toContainText('Brucebase\'s 2025 page has no show at #010125.');
        expect(await xhrFull(page), 'a second date of the same year costs nothing').toHaveLength(1);
        await expect.poll(() => idbHas(page, `mb:ext-bbyear:${BB_YEAR}`)).toBe(true);

        // After a reload, a date never hovered comes from the kept year.
        await reloadEvent(page);
        await addAnnotationLinks(page, [BBD.january]);
        await ctrlHover(page, probe(page, 0));
        await expect(c).toContainText('2025-01-09');
        expect(await xhrFull(page), 'the year from IndexedDB').toEqual([]);
    });

    test('two dates of one year asked while its page loads share that one request', async ({ page }) => {
        // The year page answers after 2 s: the second date is hovered while
        // the first one's request runs, before anything is in IndexedDB,
        // so only the year load in memory (`_extBbYears`) can join them.
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: { [BB_YEAR]: Object.assign(htmlAnswer(page_('ext-bb-year-2025.html')), { delayMs: 2000 }) },
        });
        await addAnnotationLinks(page, [BBD.stonePony, BBD.library]);
        const c = card(page);
        await ctrlHover(page, probe(page, 0));
        await expect(c).toContainText('several seconds');
        await expect.poll(() => xhrFull(page).then(l => l.length)).toBe(1);
        await ctrlHover(page, probe(page, 1));
        await expect(c.locator('.mb-tt-title').first()).toHaveText('NEW YORK PUBLIC LIBRARY, NEW YORK CITY, NY', { timeout: 10000 });
        expect((await xhrFull(page)).map(r => r.url)).toEqual([BB_YEAR]);
    });

    test('a Brucebase show\'s window: notes, gig page, and the year page as Live page, scrolled to the show and marked', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            // The Live page asks the year page as https, with the anchor:
            // not the http link MusicBrainz writes.
            responses: {
                [BB_YEAR]: htmlAnswer(page_('ext-bb-year-2025.html')),
                'https://brucebase.wikidot.com/2025#261025': htmlAnswer(page_('ext-bb-year-2025.html')),
            },
        });
        await addAnnotationLinks(page, [BBD.stonePony]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('3 tracks');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Brucebase show');
        await expect(d).toContainText('a benefit for TeachRock');
        await expect(d.locator('a[href="https://brucebase.wikidot.com/gig:2025-10-26-stone-pony-asbury-park-nj"]')).toBeVisible();
        await d.getByRole('button', { name: 'Live page' }).click();
        const frame = d.locator('iframe');
        await expect(frame).toHaveAttribute('srcdoc', /name="261025"/);
        await expect(frame, 'its base is https: no mixed content from the page\'s own relative links')
            .toHaveAttribute('srcdoc', /<base href="https:\/\/brucebase\.wikidot\.com\/2025#261025"/);
        await expect.poll(() => frame.evaluate((f) => {
            const m = f.contentDocument.querySelector('.mb-dp-anchor');
            return m ? m.textContent.trim() : '';
        })).toContain('2025-10-26 - THE STONE PONY, ASBURY PARK, NJ');
        // Scrolled to it: the show's heading near the top of the frame's
        // view (it sits near the end of the year page). The frame runs no
        // script, so the scroll comes from the userscript's own window: the
        // first version used the frame's setTimeout, which never fired.
        await expect.poll(() => frame.evaluate((f) => {
            const top = f.contentDocument.querySelector('.mb-dp-anchor').getBoundingClientRect().top;
            const se = f.contentDocument.scrollingElement;
            return se.scrollTop > 1000 && top >= 0 && top < 60;
        }), { timeout: 5000 }).toBe(true);
        expect((await xhrFull(page)).map(r => r.url)).toEqual([BB_YEAR, 'https://brucebase.wikidot.com/2025#261025']);
    });

    test('the Live page is prepared before its images are in, scrolled to the show again once they are, and a reader\'s scroll is kept', async ({ page }) => {
        // The year page's 260 images on brucebase.wdfiles.com answer after
        // 6 s, each a 40×40 picture that pushes the show down when it lands.
        // Before 2026-10-17 nothing was trimmed, marked or scrolled until the
        // frame's load event, i.e. until the last of them.
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: {
                [BB_YEAR]: htmlAnswer(page_('ext-bb-year-2025.html')),
                'https://brucebase.wikidot.com/2025#261025': htmlAnswer(page_('ext-bb-year-2025.html')),
            },
        });
        const IMG = solidPng(40, 40);
        await page.context().route('https://brucebase.wdfiles.com/**', (route) => new Promise((resolve) => {
            setTimeout(() => resolve(route.fulfill({ status: 200, contentType: 'image/png', body: IMG }).catch(() => {})), 6000);
        }));
        await addAnnotationLinks(page, [BBD.stonePony]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('3 tracks');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await d.getByRole('button', { name: 'Live page' }).click();
        const frame = d.locator('iframe');
        await expect(frame).toHaveAttribute('srcdoc', /name="261025"/);
        const state = () => frame.evaluate((f) => {
            const doc = f.contentDocument;
            const m = doc && doc.documentElement && doc.querySelector('.mb-dp-anchor');
            return {
                loaded: !!doc && doc.URL !== 'about:blank' && doc.readyState === 'complete',
                trimmed: !!doc && !!doc.documentElement && doc.documentElement.classList.contains('mb-dp-isolate'),
                marked: m ? m.textContent.trim().slice(0, 44) : '',
                top: m ? Math.round(m.getBoundingClientRect().top) : null,
                scrollTop: doc && doc.scrollingElement ? doc.scrollingElement.scrollTop : 0,
            };
        });
        // Long before the images: trimmed, marked and scrolled to the show.
        await expect.poll(state, { timeout: 2500 }).toMatchObject({
            loaded: false, trimmed: true, marked: '2025-10-26 - THE STONE PONY, ASBURY PARK, NJ',
        });
        await expect.poll(async () => { const s = await state(); return s.top >= 0 && s.top < 60 && s.scrollTop > 1000; }, { timeout: 2500 }).toBe(true);
        // As in a browser without scroll anchoring (Chromium's keeps the show
        // in place by itself while the images land, which would hide whether
        // the script scrolls to it again).
        await frame.evaluate((f) => { f.contentDocument.documentElement.style.overflowAnchor = 'none'; f.contentDocument.body.style.overflowAnchor = 'none'; });
        // Once they are in, scrolled to it again (they pushed it down).
        await expect.poll(async () => (await state()).loaded, { timeout: 20000 }).toBe(true);
        await expect.poll(async () => { const s = await state(); return s.top >= 0 && s.top < 60; }, { timeout: 3000 }).toBe(true);
    });

    test('a reader who scrolls the Live page before its images are in is not pulled back to the show', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true },
            responses: {
                [BB_YEAR]: htmlAnswer(page_('ext-bb-year-2025.html')),
                'https://brucebase.wikidot.com/2025#261025': htmlAnswer(page_('ext-bb-year-2025.html')),
            },
        });
        const IMG = solidPng(40, 40);
        await page.context().route('https://brucebase.wdfiles.com/**', (route) => new Promise((resolve) => {
            setTimeout(() => resolve(route.fulfill({ status: 200, contentType: 'image/png', body: IMG }).catch(() => {})), 4000);
        }));
        await addAnnotationLinks(page, [BBD.stonePony]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('3 tracks');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await d.getByRole('button', { name: 'Live page' }).click();
        const frame = d.locator('iframe');
        const scrolled = () => frame.evaluate((f) => {
            const doc = f.contentDocument;
            return doc && doc.querySelector('.mb-dp-anchor') && doc.scrollingElement ? doc.scrollingElement.scrollTop : -1;
        });
        await expect.poll(scrolled, { timeout: 2500 }).toBeGreaterThan(1000);
        // The reader turns the wheel back up the year page, right away
        // (before the later scrolls at 0.3 and 1.5 s and the images at 4 s).
        const box = await frame.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -1500);
        const top = () => frame.evaluate((f) => f.contentDocument.scrollingElement.scrollTop);
        let settled = -1;
        await expect.poll(async () => { const v = await top(); const same = v === settled; settled = v; return same; }, { intervals: [250] }).toBe(true);
        // Where the show sits in the view now: well below its top.
        const markTop = () => frame.evaluate((f) => f.contentDocument.querySelector('.mb-dp-anchor').getBoundingClientRect().top);
        expect(settled, 'the wheel moved the page').toBeGreaterThanOrEqual(0);
        expect(await markTop(), 'the show is below the top of the view').toBeGreaterThan(300);
        // Past the later scrolls and the images' arrival (load): the show is
        // NOT brought back to the top. (scrollTop itself may change: Chrome's
        // scroll anchoring keeps what the reader looks at in place while the
        // images above it take their room — measured 9393 → 10541.)
        await expect.poll(() => frame.evaluate((f) => f.contentDocument.readyState), { timeout: 20000 }).toBe('complete');
        await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
        expect(await markTop(), 'not pulled back').toBeGreaterThan(300);
    });

    test('a cancelled show: no setlist, "did not take place", its /nogig: page', async ({ page }) => {
        const YEAR_1978 = 'https://brucebase.wikidot.com/1978';
        const html = '<!doctype html><html><head><title>1978 - Brucebase Wiki</title></head><body><div id="main-content"><div id="page-content">' +
            '<p><a name="250778"></a><br /><strong><a href="/nogig:1978-07-25-civic-auditorium-jacksonville-fl">' +
            '1978-07-25 - CIVIC AUDITORIUM, JACKSONVILLE, FL</a></strong></p>' +
            '<div class="list-pages-box"><div class="list-pages-item"><p>Cancelled, never re-scheduled.</p></div></div>' +
            '<a href="/Info%20Request"><img src="https://img.example/help.png" title="Help Us" alt=""></a>' +
            '<hr /><p><a name="260778"></a><br /><strong><a href="/nogig:1978-07-26-civic-center-lakeland-fl">' +
            '1978-07-26 - LAKELAND CIVIC CENTER, LAKELAND, FL</a></strong></p></div></div></body></html>';
        await openEvent(page, { settings: { sa_pop_ext: true }, responses: { [YEAR_1978]: htmlAnswer(html) } });
        await addAnnotationLinks(page, ['https://brucebase.wikidot.com/1978#250778']);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        await expect(c.locator('.mb-tt-title').first()).toHaveText('CIVIC AUDITORIUM, JACKSONVILLE, FL');
        await expect(c).toContainText('1978-07-25 · did not take place');
        await expect(c).not.toContainText('track');
        await expect(c).not.toContainText('Help Us');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('a[href="https://brucebase.wikidot.com/nogig:1978-07-25-civic-auditorium-jacksonville-fl"]')).toBeVisible();
    });
});

test.describe('hovering inside a Discogs window (org/dp-window-hover.org)', () => {
    test('every link opens here: marked so, the foot line names it, Ctrl shows its card, Space opens it here', async ({ page }) => {
        await openDiscogs(page);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-dg-sum')).toBeVisible();
        await page.keyboard.press('Space');
        const d = dialog(page);
        const credit = d.locator('[data-mb-dg-sec="credits"] a', { hasText: 'Jon Landau' }).first();
        await expect(credit).toBeVisible();
        await expect(credit).toHaveClass(/\bmb-dp-l-here\b/);
        await page.mouse.move(0, 0);
        await credit.hover();
        await expect(d.locator('.mb-dp-wfoot')).toContainText('Opens here: ');
        await expect(d.locator('.mb-dp-wfoot')).toContainText('Jon Landau');
        // The page's Ctrl rule: Ctrl on the hovered link shows its card.
        await page.keyboard.down('Control');
        await expect(card(page)).toBeVisible();
        await page.keyboard.up('Control');
        await page.keyboard.press('Space');
        await expect(card(page)).toBeHidden();
        await expect(d.locator('button.mb-dp-tbtn', { hasText: '← Back' })).toBeVisible();
        await expect(d.locator('button.mb-dp-tbtn', { hasText: '← Back' })).toHaveAttribute('title', /^Back to: /);
    });

    // org/TODO.org "some more BB and MB fixes/enhancements" 1a (vzell,
    // 2026-10-24): a version's thumbnail was a bare <img>, so neither a rest
    // nor Space did anything. It is now the page Image column's trigger: the
    // card shows every image of THAT release, Space or a click opens the
    // viewer on them, and the window stays where it was.
    test('a version\'s thumbnail: the card of that release\'s images; Space and a click open the viewer on them, not the release', async ({ page }) => {
        await openDiscogs(page, { settings: { sa_pop_ext_discogs_token: 'tok-probe' } });
        await ctrlHover(page, probe(page, 1));
        await expect(card(page).locator('.mb-dg-sum')).toHaveText('Versions: Space lists them');
        await page.keyboard.press('Space');
        const d = dialog(page);
        const title = d.locator(':scope > div > span').first();
        const vers = d.locator('[data-mb-dg-sec="versions"]');
        await expect(vers.locator('tbody tr')).toHaveCount(100);
        const thumb = vers.locator('tr[data-mb-dg-vid="1874253"] a.mb-dg-vthumblink');
        await expect(thumb).toHaveCount(1);
        await expect(thumb, 'ringed as an image, not ↗').toHaveClass(/\bmb-dp-l-img\b/);
        await expect(thumb).not.toHaveClass(/\bmb-dp-l-out\b/);
        const before = (await xhrFull(page)).filter(r => r.url === 'https://api.discogs.com/releases/1874253').length;
        expect(before, 'nothing read that release yet').toBe(0);

        const tip = page.locator('#mb-stat-tooltip');
        await page.mouse.move(0, 0);
        await thumb.scrollIntoViewIfNeeded();
        await thumb.hover();
        await expect(tip.locator('.mb-art-card-tile')).toHaveCount(5);
        await expect(tip.locator('.mb-tt-title')).toContainText('Born To Run');
        // The window's foot line names the viewer, never "New tab".
        await expect(d.locator('.mb-dp-wfoot')).toContainText('Viewer: Born To Run · every image of it');
        await expect(d.locator('.mb-dp-wfoot')).toContainText('Click or Space: viewer');
        await expect(card(page), 'no window preview over the image card').toBeHidden();
        expect((await xhrFull(page)).filter(r => r.url === 'https://api.discogs.com/releases/1874253'), 'one request, for this row')
            .toHaveLength(1);

        const viewer = page.locator('#mb-art-viewer');
        await page.keyboard.press('Space');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 5');
        await expect(viewer.locator('.mb-artv-title'), 'the window\'s title').toHaveText('Born To Run');
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(d).toBeVisible();
        await expect(title, 'Space opened no release in the window').toHaveText('Discogs master');

        // A plain click: the viewer too, never the row's drill into the release.
        await thumb.click();
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('1 / 5');
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(title).toHaveText('Discogs master');
        expect((await xhrFull(page)).filter(r => r.url === 'https://api.discogs.com/releases/1874253'), 'the card\'s record, reused')
            .toHaveLength(1);
    });

    // Item 1b: Space on a gallery image of the window opens the viewer at
    // it, as a click does (it used to be swallowed).
    test('the gallery: Space on an image opens the viewer at that image', async ({ page }) => {
        await openDiscogs(page);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-dg-sum')).toBeVisible();
        await page.keyboard.press('Space');
        const d = dialog(page);
        const gal = d.locator('[data-mb-dg-sec="images"] .mb-dp-gallery a');
        await expect(gal).toHaveCount(5);
        await page.mouse.move(0, 0);
        await gal.nth(3).locator('img').hover();
        await page.keyboard.press('Space');
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('.mb-artv-pos')).toHaveText('4 / 5');
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(d).toBeVisible();
    });
});
