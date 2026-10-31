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

    test('the MetaBrainz family beyond musicbrainz.org is another site; musicbrainz.org and the artwork archives are not', async ({ page }) => {
        // vzell 2026-10-28: a BookBrainz search among the sidebar's Search
        // links had no card and no Space. Only musicbrainz.org (the entity
        // cards') and the artwork archives (their own preview) are skipped.
        const BB = 'https://bookbrainz.org/search?type=edition&q=Verano%20%C3%89xitos%20de%20los%2080';
        const others = [
            BB,
            'https://listenbrainz.org/player/release/22a6802f-d22e-4f47-9f22-6aac257a4194',
            'https://critiquebrainz.org/release-group/2a4dbe4f-bd2a-4a5c-9bf5-2bc4f9b5e3f8',
            'https://metabrainz.org/donate',
            'https://acousticbrainz.org/',
        ];
        const skipped = [
            'https://beta.musicbrainz.org/release/22a6802f-d22e-4f47-9f22-6aac257a4194',
            'https://musicbrainz.eu/',
            'https://coverartarchive.org/release/22a6802f-d22e-4f47-9f22-6aac257a4194',
        ];
        await openEvent(page, { settings: { sa_pop_ext: true, sa_pop_mb: true } });
        await addAnnotationLinks(page, [...others, ...skipped]);
        const r = await page.evaluate(() => Array.from(document.querySelectorAll('.ext-probe a'))
            .map(a => window.__saTest.popResolve(a)));
        others.forEach((href, i) => expect(r[i], href).toBe(`ext|ext:generic:${href}`));
        skipped.forEach((href, i) => expect(r[others.length + i], href).toBeNull());
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
            // sa_pop_mb: the "[info]" link's window is a MusicBrainz preview.
            settings: { sa_pop_ext: true, sa_pop_mb: true, sa_pop_ext_favicons: true, sa_rich_tooltip_delay_ms: 0, sa_pop_ext_hosts: ['www.setlist.fm', 'icon.example', 'cdn-icon.example'] },
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
        // The window's path shows the site's icon on its step (vzell
        // 2026-10-29: every other site, not only Wikidata and the like) …
        await page.keyboard.press('Space');
        const step = dialog(page).locator('.mb-dp-crumb').last();
        await expect(step.locator('img.mb-dp-kind-icon')).toHaveAttribute('src', /^data:image\/png;base64,/);
        // Its rich tooltip (vzell 2026-10-29): the site, what the step read,
        // where the icon comes from — a "Liner notes" card.
        // A link to the site's home page, with the finger as the MusicBrainz glyph has.
        const icon = step.locator('a.mb-dp-crumb-site');
        await expect(icon).toHaveAttribute('href', 'https://www.setlist.fm/');
        await expect(icon).toHaveAttribute('target', '_blank');
        expect(await icon.locator('img').evaluate(i => getComputedStyle(i).cursor), 'the finger, not the title bar\'s move').toBe('pointer');
        await expect(icon).toHaveAttribute('data-mb-tip', '');
        await expect(icon).toHaveAttribute('title', /^setlist\.fm\nThis step of the window shows a page of setlist\.fm\.\nRead from the page itself/);
        await expect(icon).toHaveAttribute('title', /\nClick: setlist\.fm's home page in a new tab\.$/);
        await icon.hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip.locator('.mb-tt-title')).toHaveText('setlist.fm');
        await expect(tip).toContainText('asked once from www.setlist.fm and kept for a month; a hover never asks for it');
        await page.mouse.move(0, 0);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        // … and so does a MusicBrainz URL entity's window, the icon of the
        // site its URL names (the same one, from memory: no request).
        await ctrlHover(page, infoLink(page));
        await expect(c).toContainText('1 relationship');
        await page.keyboard.press('Space');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText('URL');
        await expect(dialog(page).locator('.mb-dp-crumb').last().locator('img.mb-dp-kind-icon'))
            .toHaveAttribute('src', /^data:image\/png;base64,/);
        await expect(dialog(page).locator('.mb-dp-crumb').last().locator('a.mb-dp-crumb-site'))
            .toHaveAttribute('title', /^setlist\.fm\nThe icon of the site this MusicBrainz URL names\./);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        expect((await xhrLog(page)).filter(r => r.url.endsWith('/favicon.ico')), 'the icon asked once').toHaveLength(1);

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

    test('a URL entity\'s window opened before its lookup answered: its path gets the site\'s icon once the address is known', async ({ page }) => {
        let release;
        const held = new Promise((r) => { release = r; });
        const png = { status: 200, responseHeaders: 'Content-Type: image/png', base64: PNG.toString('base64'), contentType: 'image/png' };
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_mb: true, sa_pop_ext_favicons: true, sa_pop_ext_hosts: ['www.setlist.fm'] },
            responses: { [SETLIST]: { status: 200, responseHeaders: HTML_HEADERS, responseText: SETLIST_HTML }, 'https://www.setlist.fm/favicon.ico': png },
            ws2: async () => { await held; return null; },
        });
        // The site's icon is known (its card read it) …
        await ctrlHover(page, setlistLink(page));
        await expect(card(page).locator('img.mb-ext-favimg')).toBeVisible();
        // … the "[info]" window opens while its lookup is held: no address, no icon yet.
        await ctrlHover(page, infoLink(page));
        await expect(card(page)).toContainText('Loading');
        await page.keyboard.press('Space');
        const icon = dialog(page).locator('.mb-dp-crumb').last().locator('img.mb-dp-kind-icon');
        await expect(dialog(page).locator(':scope > div > span').first()).toHaveText(/URL|www\.setlist\.fm|setlist/);
        await expect(icon).toHaveCount(0);
        release();
        await expect(dialog(page)).toContainText('Linked from · 1');
        await expect(icon).toHaveAttribute('src', /^data:image\/png;base64,/);
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

// setlist.fm through its API with the user's key (branch B, mockup 4 of
// https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag). The answers are
// vzell's probe of 2026-10-29 (scripts/probe-setlistfm-api.py,
// tests/fixtures/ext-sfm-*.json), served by the GM_xmlhttpRequest stub; the
// artist search and a second page of setlists are built from them (the
// probe asked neither). Mutation list: scripts/mutations/wiki-setlistfm.json.
const SFM_API = 'https://api.setlist.fm/rest/1.0';
const SFM = {
    setlist: 'https://www.setlist.fm/setlist/bruce-springsteen/2016/los-angeles-sports-arena-los-angeles-ca-4bf0375a.html',
    artist: 'https://www.setlist.fm/setlists/bruce-springsteen-2bd6dcce.html',
    venue: 'https://www.setlist.fm/venue/los-angeles-sports-arena-los-angeles-ca-usa-3d6c967.html',
    stats: 'https://www.setlist.fm/stats/bruce-springsteen-2bd6dcce.html',
};
const SFM_MBID = '70248960-cb53-4ea4-943a-edb18f7d336f';
const sfmJson = (body, status = 200) => ({ status, responseHeaders: 'Content-Type: application/json;charset=UTF-8', responseText: body });
const sfmAnswers = () => {
    const p1 = JSON.parse(json('ext-sfm-artist-setlists-p1.json'));
    const p2 = Object.assign({}, p1, { page: 2, setlist: p1.setlist.map(x => Object.assign({}, x, { id: `p2${x.id}` })) });
    return {
        [`${SFM_API}/setlist/4bf0375a`]: sfmJson(json('ext-sfm-setlist.json')),
        [`${SFM_API}/venue/3d6c967`]: sfmJson(json('ext-sfm-venue.json')),
        [`${SFM_API}/venue/3d6c967/setlists?p=1`]: sfmJson(json('ext-sfm-venue-setlists-p1.json')),
        [`${SFM_API}/search/artists?artistName=bruce%20springsteen&sort=relevance`]:
            sfmJson(JSON.stringify({ type: 'artists', itemsPerPage: 30, page: 1, total: 1, artist: [JSON.parse(json('ext-sfm-artist.json'))] })),
        [`${SFM_API}/artist/${SFM_MBID}/setlists?p=1`]: sfmJson(JSON.stringify(p1)),
        [`${SFM_API}/artist/${SFM_MBID}/setlists?p=2`]: sfmJson(JSON.stringify(p2)),
    };
};
const SFM_KEY = 'sfm-probe-key';

test.describe('setlist.fm through its API (branch B)', () => {
    test('which reader takes which link: setlist.fm\'s only with a key; its other pages, and every page without a key, the generic one', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true, sa_pop_ext_setlistfm_key: '' } });
        await addAnnotationLinks(page, [SFM.setlist, SFM.artist, SFM.venue, SFM.stats]);
        const keys = () => page.evaluate(() => Array.from(document.querySelectorAll('.ext-probe a'))
            .map(a => (window.__saTest.popResolve(a) || '').split(':').slice(0, 2).join(':')));
        expect(await keys(), 'no key: as before the reader').toEqual(['ext|ext:generic', 'ext|ext:generic', 'ext|ext:generic', 'ext|ext:generic']);
        expect((await xhrFull(page)).filter(r => r.url.startsWith(SFM_API)), 'nothing asked of the API').toEqual([]);
    });

    test('a setlist: the card from one API request with the key; the window: its parts, covers linked to MusicBrainz, notes, attribution; the venue opens in the window', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true, sa_pop_ext_setlistfm_key: SFM_KEY }, responses: sfmAnswers() });
        await addAnnotationLinks(page, [SFM.setlist, SFM.artist, SFM.venue, SFM.stats]);
        const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.ext-probe a'))
            .map(a => (window.__saTest.popResolve(a) || '').split(':').slice(0, 2).join(':')));
        expect(keys, 'with a key: the three pages the reader knows; its other pages stay generic')
            .toEqual(['ext|ext:setlistfm', 'ext|ext:setlistfm', 'ext|ext:setlistfm', 'ext|ext:generic']);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        await expect(c.locator('.mb-tt-title')).toHaveText('Bruce Springsteen at Los Angeles Sports Arena');
        await expect(c).toContainText('2016-03-19');
        await expect(c).toContainText('The River Tour 2016');
        await expect(c).toContainText('35');
        const log = (await xhrFull(page)).filter(r => r.url.startsWith(SFM_API));
        expect(log.map(r => r.url), 'one API request, never the page').toEqual([`${SFM_API}/setlist/4bf0375a`]);
        expect(log[0].headers['x-api-key']).toBe(SFM_KEY);
        expect(log[0].headers.Accept).toBe('application/json');
        expect(log[0].anonymous).toBe(true);

        await page.keyboard.press('Space');
        const d = dialog(page);
        const area = d.locator('.mb-dp-area');
        await expect(d.locator(':scope > div > span').first()).toHaveText('setlist.fm setlist');
        const songs = area.locator('[data-mb-tbl="sfm-setlist"] tbody tr:not(.mb-dp-tsec)');
        await expect(songs).toHaveCount(35);
        await expect(area.locator('[data-mb-tbl="sfm-setlist"] .mb-dp-tsec-n')).toHaveText(['The River', 'Encore']);
        const cover = songs.filter({ hasText: 'Because the Night' });
        await expect(cover).toContainText('Patti Smith Group cover');
        await expect(cover.locator('a')).toHaveAttribute('href', 'https://musicbrainz.org/artist/26638df8-ef34-40d1-8d93-616836b72878');
        await expect(area).toContainText('forthcoming demolition');
        await expect(area.locator('.mb-dg-counts a', { hasText: 'setlist.fm' })).toHaveAttribute('href', SFM.setlist);
        await expect(area.locator('dt:text-is("Where") + dd')).toContainText('Los Angeles, California (CA), United States');
        await expect(area.locator('dt:text-is("Where") + dd a', { hasText: 'map' })).toHaveAttribute('href', /openstreetmap\.org\/\?mlat=34\.052&mlon=-118\.244/);
        // The venue opens in the window, through the API, and Back returns.
        const pages = [];
        page.on('popup', (pp) => pages.push(pp.url()));
        await area.locator(`a[href="${SFM.venue}"]`).first().click();
        await expect(d.locator(':scope > div > span').first()).toHaveText(/setlist\.fm venue$/);
        await expect(area.locator('[data-mb-tbl="sfm-venue"] tbody tr')).toHaveCount(20);
        expect(pages, 'no new tab').toEqual([]);
        await d.locator('button', { hasText: 'Back' }).click();
        await expect(songs).toHaveCount(35);
    });

    test('an artist: found by its slug\'s name, 20 setlists a page, "Load 20 more" asks the next; what the loaded setlists show is counted', async ({ page }) => {
        await openEvent(page, { settings: { sa_pop_ext: true, sa_pop_ext_setlistfm_key: SFM_KEY }, responses: sfmAnswers() });
        await addAnnotationLinks(page, [SFM.artist]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Bruce Springsteen');
        await expect(card(page)).toContainText('3,003');
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const rows = area.locator('[data-mb-tbl="sfm-artist"] tbody tr');
        await expect(rows).toHaveCount(20);
        await expect(area).toContainText('20 of 3,003 loaded');
        await expect(area.locator('dt:text-is("On MusicBrainz") + dd a')).toHaveAttribute('href', `https://musicbrainz.org/artist/${SFM_MBID}`);
        await expect(area.locator('h4', { hasText: 'In the loaded setlists' })).toHaveText('In the loaded setlists · 20');
        await area.locator('[data-mb-sfm-act="more"]').click();
        await expect(area).toContainText('40 of 3,003 loaded');
        await expect(area.locator('h4', { hasText: 'In the loaded setlists' })).toHaveText('In the loaded setlists · 40');
        expect((await xhrFull(page)).map(r => r.url).filter(u => u.startsWith(SFM_API))).toEqual([
            `${SFM_API}/search/artists?artistName=bruce%20springsteen&sort=relevance`,
            `${SFM_API}/artist/${SFM_MBID}/setlists?p=1`, `${SFM_API}/artist/${SFM_MBID}/setlists?p=2`]);
    });

    test('a key setlist.fm refuses: the card says so, and nothing is kept', async ({ page }) => {
        await openEvent(page, {
            settings: { sa_pop_ext: true, sa_pop_ext_setlistfm_key: SFM_KEY },
            responses: { [`${SFM_API}/setlist/4bf0375a`]: sfmJson('{"code":403,"status":"Forbidden","message":"Forbidden"}', 403) },
        });
        await addAnnotationLinks(page, [SFM.setlist]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('setlist.fm did not accept the API key (HTTP 403)');
        await page.mouse.move(0, 0);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('did not accept the API key');
        expect((await xhrFull(page)).filter(r => r.url.startsWith(SFM_API)), 'not kept: asked again').toHaveLength(2);
    });
});

// The rich Wikidata and Wikipedia windows (branch B; the mockup's tabs
// "Wikidata" and "Wikipedia"). Answers: scripts/probe-wiki-rich.py --save
// (2026-10-29), served by URL pattern through `__gmXhrResponder`; the card
// keeps its one small request. Mutation list: scripts/mutations/wiki-setlistfm.json.
const WIKI_FIX = {
    claims: 'ext-wd-claims-Q1225.json', props: 'ext-wd-props-Q1225-en.json',
    itemsEn: 'ext-wd-items-Q1225-en.json', itemsDe: 'ext-wd-items-Q1225-de.json',
    s0: 'ext-wp-en-Bruce_Springsteen-s0.json', sections: 'ext-wp-en-Bruce_Springsteen-sections.json', s1: 'ext-wp-en-Bruce_Springsteen-s1.json',
};
const WP_BRUCE = 'https://en.wikipedia.org/wiki/Bruce_Springsteen';
const WP_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/Bruce_Springsteen';

/**
 * Answers the rich windows' requests from the captures, by URL pattern.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function answerWiki(page) {
    const bodies = Object.fromEntries(Object.entries(WIKI_FIX).map(([k, f]) => [k, json(f)]));
    bodies.png = PNG.toString('base64');
    bodies.summary = JSON.stringify({ type: 'standard', title: 'Bruce Springsteen', lang: 'en', titles: { canonical: 'Bruce_Springsteen' },
        description: 'American musician (born 1949)', extract: 'Bruce Frederick Joseph Springsteen is an American singer, songwriter, and musician.',
        wikibase_item: 'Q1225', timestamp: '2026-10-28T00:00:00Z' });
    await page.context().addInitScript((b) => {
        const ok = body => ({ status: 200, responseHeaders: 'Content-Type: application/json; charset=utf-8', responseText: body });
        window.__gmXhrResponder = (opts) => {
            const u = opts.url;
            if (u.startsWith('https://www.wikidata.org/w/api.php') && u.includes('props=claims')) return ok(b.claims);
            if (u.startsWith('https://query.wikidata.org/sparql')) {
                const q = decodeURIComponent(u.split('query=')[1] || '');
                if (q.includes('?p ?l ?f ?a')) return ok(b.props);
                return ok(q.includes('"de"') ? b.itemsDe : b.itemsEn);
            }
            if (u.startsWith('https://en.wikipedia.org/w/api.php')) {
                if (u.includes('section=0')) return ok(b.s0);
                if (u.includes('prop=sections')) return ok(b.sections);
                if (u.includes('section=1')) return ok(b.s1);
            }
            if (u === 'https://en.wikipedia.org/api/rest_v1/page/summary/Bruce_Springsteen') return ok(b.summary);
            // The sites' icons (the window asks them once, `_extIconEnsure()`).
            if (/^https:\/\/(www\.wikidata|en\.wikipedia)\.org\/favicon\.ico$/.test(u)) {
                return { status: 200, responseHeaders: 'Content-Type: image/png', base64: b.png, contentType: 'image/png' };
            }
            return undefined;
        };
    }, bodies);
}

test.describe('the rich Wikidata and Wikipedia windows (branch B)', () => {
    test('Wikidata: the card asks once; Space: statements, identifiers in groups through Wikidata\'s own address patterns, a filter, the articles; another language asks only its names', async ({ page }) => {
        await answerWiki(page);
        await openEvent(page, { settings: { sa_pop_ext: true, sa_pop_ext_favicons: true }, responses: extAnswers('wikidata-q1225') });
        await addAnnotationLinks(page, [WD.item]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('fetched now');
        expect((await xhrFull(page)).map(r => r.url).filter(u => !u.endsWith('/favicon.ico')), 'the card: one small request')
            .toEqual([EXT('wikidata-q1225').url]);
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const kv = area.locator('h4', { hasText: /^Statements/ }).locator('xpath=following-sibling::dl[1]');
        await expect(kv.locator('dt:text-is("date of birth") + dd')).toHaveText('1949-09-23', { timeout: 15000 });
        await expect(kv.locator('dt:text-is("place of birth") + dd a')).toHaveText('Long Branch');
        await expect(kv.locator('dt:text-is("place of birth") + dd a')).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q995231');
        // Identifiers: Music first, MusicBrainz's through its formatter URL.
        const mb = area.locator('[data-mb-fold="wd-ids-music"] .mb-wd-idrow', { hasText: 'MusicBrainz artist ID' });
        await expect(mb.locator('a')).toHaveAttribute('href', 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f');
        const auth = area.locator('[data-mb-fold-act="wd-ids-auth"] .mb-dp-foldn');
        expect(Number((await auth.textContent()).replace(/\D/g, '')), 'most identifiers are authority files').toBeGreaterThan(100);
        await area.locator('input[data-mb-wiki-q]').fill('isni');
        await expect(area.locator('[data-mb-fold="wd-ids-auth"] .mb-wd-idrow')).toHaveCount(1);
        // The match is marked, as in the window's tables (vzell 2026-10-29).
        await expect(area.locator('[data-mb-fold="wd-ids-auth"] .mb-wd-idrow mark.mb-dg-hl')).toHaveText(['ISNI']);
        // Its site's icon heads its step in the window's path, from the icon
        // the window asked once (a hover asks none).
        await expect(dialog(page).locator('.mb-dp-crumb img.mb-dp-kind-icon').last()).toHaveAttribute('src', /^data:image\/png;base64,/);
        await expect(area.locator('[data-mb-fold="wd-ids-auth"] .mb-wd-idrow a')).toHaveAttribute('href', 'https://isni.org/isni/0000000121418834');
        await expect(area.locator('h4', { hasText: /^Wikipedia · / })).toHaveText(/^Wikipedia · \d{2,}$/);
        const wdReq = async () => (await xhrFull(page)).map(r => r.url).filter(u => !u.startsWith(EXT('wikidata-q1225').url) && !u.endsWith('/favicon.ico'));
        const before = await wdReq();
        expect(before.filter(u => u.includes('props=claims')), 'the claims, once').toHaveLength(1);
        expect(before.filter(u => u.startsWith('https://query.wikidata.org/')), 'two SPARQL queries').toHaveLength(2);
        // An authority file is an instance of a SUBCLASS of Q18614948 too
        // (the direct P31 found 5 of 183: probe 2026-10-29).
        expect(before.map(u => decodeURIComponent(u)).some(u => u.includes('wdt:P31/wdt:P279* wd:Q18614948')),
            'the authority test follows subclass of').toBe(true);
        expect((await xhrFull(page)).filter(r => !r.url.endsWith('/favicon.ico'))
            .every(r => r.anonymous && /^ShowAllEntityData\//.test(r.headers['Api-User-Agent'] || '')),
        'the API requests: anonymous, named as Wikimedia asks').toBe(true);
        // Another language: its names only (two queries), the claims not again.
        await area.locator('select[data-mb-wiki-lang]').selectOption('de');
        await expect(kv.locator('dt:text-is("country of citizenship") + dd a')).toHaveText('Vereinigte Staaten');
        const after = await wdReq();
        expect(after.filter(u => u.includes('props=claims'))).toHaveLength(1);
        expect(after.filter(u => u.startsWith('https://query.wikidata.org/'))).toHaveLength(4);
    });

    test('Wikipedia: Space reads the infobox, the opening and the sections; a section is read when opened, once; links open in the window; no table, picture or note mark from the article', async ({ page }) => {
        await answerWiki(page);
        await openEvent(page, { settings: { sa_pop_ext: true } });
        await addAnnotationLinks(page, [WP_BRUCE]);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('fetched now');
        expect((await xhrFull(page)).map(r => r.url)).toEqual([WP_SUMMARY]);
        await page.keyboard.press('Space');
        const area = dialog(page).locator('.mb-dp-area');
        const info = area.locator('h4:text-is("Infobox") + .mb-dp-kv');
        await expect(info.locator('dt', { hasText: 'Born' })).toHaveCount(1, { timeout: 15000 });
        await expect(info).toContainText('Long Branch');
        await expect(area.locator('.mb-wp-text').first()).toContainText('is an American singer');
        await expect(area.locator('.mb-wp-text').first()).not.toContainText('[1]');
        await expect(area.locator('h4', { hasText: /^Sections/ })).toHaveText('Sections · 12');
        await expect(area.locator('h4', { hasText: /^Other languages/ })).toHaveText('Other languages · 92');
        await expect(area.locator('.mb-wd-wikis a', { hasText: 'Deutsch' })).toHaveAttribute('href', 'https://de.wikipedia.org/wiki/Bruce_Springsteen');
        const sec = area.locator('[data-mb-wp-sec="1"]');
        await expect(sec).toContainText('Early life and education');
        await sec.click();
        const body = area.locator('.mb-wp-sec', { has: page.locator('[data-mb-wp-sec="1"]') }).locator('.mb-wp-text');
        await expect(body).toContainText('Long Branch');
        await expect(body.locator('table, img, script, style, sup')).toHaveCount(0);
        await expect(body, 'no "[1]" note marks (section 1 has 27 references)').not.toContainText(/\[\d+\]/);
        await expect(body.locator('a[href^="https://en.wikipedia.org/wiki/"]').first()).toBeVisible();
        expect(await body.locator('a').evaluateAll(as => as.every(a => /^https?:\/\//.test(a.getAttribute('href')))), 'links absolute').toBe(true);
        await sec.click();
        await expect(body).toHaveCount(0);
        await sec.click();
        await expect(area.locator('.mb-wp-sec .mb-wp-text')).toContainText('Long Branch');
        expect((await xhrFull(page)).map(r => r.url).filter(u => u.includes('section=1')), 'the section, once').toHaveLength(1);
        // A link in the text opens in the window.
        const pages = [];
        page.on('popup', (pp) => pages.push(pp.url()));
        await area.locator('.mb-wp-text a[href^="https://en.wikipedia.org/wiki/"]').first().click();
        await expect(dialog(page).locator(':scope > div > span').first(), 'a step deeper in the same window').toHaveText(/^Wikipedia › Wikipedia$/);
        await expect(dialog(page).locator('button', { hasText: 'Back' })).toBeVisible();
        expect(pages, 'no new tab').toEqual([]);
    });
});

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
        // The card's summary, the rich window's opening (branch B: section 0;
        // unanswered here, so no section list follows), the Live page.
        expect((await xhrFull(page)).map(r => r.url)).toEqual([EXT('wikipedia-greetings').url,
            'https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&redirects=1' +
            '&page=Greetings_from_Asbury_Park%2C_N.J.&prop=text%7Clanglinks&section=0', W.greet]);
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
        // A master's videos since org/youtube.org (decision 3, record version 5).
        await expect(d.locator('.mb-dg-xh')).toHaveText(['Images 7', 'Videos 3', 'Tracklist 8', 'Notes', 'Versions 387']);
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
        // The match is marked in every row kept (2026-10-26), in text only.
        await expect(vers.locator('tbody tr:not(:has(mark.mb-dg-hl))'), 'every row shows its match').toHaveCount(0);
        expect((await vers.locator('mark.mb-dg-hl').evaluateAll(ms => ms.map(m => m.textContent.toLowerCase())))
            .every(t => t === 'japan'), 'the marks are the query').toBe(true);
        expect(await vers.locator('[title*="<mark"], [href*="<mark"]').count(), 'no mark in an attribute').toBe(0);
        await vers.getByRole('button', { name: 'Clear filters' }).click();
        await expect(vers.locator('tbody tr')).toHaveCount(387);
        await expect(vers.locator('mark.mb-dg-hl'), 'no query, no mark').toHaveCount(0);
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
        // A third click: the initial order, the rows exactly as the four
        // answers list them, and the header says so (a dimmed ⇅).
        await vers.locator('th[data-mb-dg-sort="year"]').click();
        await expect(vers.locator('th[data-mb-dg-sort="year"]')).toHaveAttribute('aria-sort', 'none');
        // (The tip of a header the pointer is not on: the one under it is
        // parked by the tooltip engine while it shows.)
        await expect(vers.locator('th[data-mb-dg-sort="country"]')).toHaveAttribute('title', 'Initial order (as Discogs lists them) · click: ascending');
        const discogsOrder = [1, 2, 3, 4].flatMap(p => JSON.parse(EXT(`discogs-master-versions-p${p}`).body).versions.map(v => String(v.id)));
        const vids = () => vers.locator('tbody tr[data-mb-dg-vid]').evaluateAll(trs => trs.map(tr => tr.dataset.mbDgVid));
        expect(await vids(), 'Discogs\' order').toEqual(discogsOrder);
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
        // A card of another site has the kind line too: the window's kind;
        // since org/POH-headerline.org a Discogs kind's emoji before it, as
        // generated content (no image, and the line's text stays the kind).
        await expect(card(page).locator(':scope > .mb-pop-kind-head')).toHaveText('Discogs release');
        await expect(card(page).locator(':scope > .mb-pop-kind-head img')).toHaveCount(0);
        await expect(card(page).locator(':scope > .mb-pop-kind-head > span.mb-pop-kind-icon.mb-dp-emo')).toHaveAttribute('data-mb-emo', '📄');
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
        // The path's glyphs (org/POH-headerline.org): each kind's emoji,
        // linking its Database Guidelines article.
        const glyphs = title.locator('.mb-dp-crumb > a.mb-dp-crumb-g');
        expect(await glyphs.locator('span.mb-dp-emo').evaluateAll(xs => xs.map(x => x.dataset.mbEmo))).toEqual(['📄', '👤']);
        expect(await glyphs.evaluateAll(xs => xs.map(x => x.getAttribute('href').replace(/^.*\/articles\//, '')))).toEqual([
            '360004016474-Overview-Of-Submission-Guidelines-For-Releases', '360005054753-Database-Guidelines-2-Artist',
        ]);
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

        // Discogs' order (by year) first, every header in the initial state
        // (aria-sort "none", painted as a dimmed ⇅); "Have" sorts most first.
        const have = onRel.locator('th[data-mb-dg-asort="have"]');
        await expect(onRel.locator('tbody > tr').first()).toContainText('Love, Love, Love');
        await expect(have).toHaveAttribute('aria-sort', 'none');
        // The glyph in a fixed box, so a fallback font drawing ⇅ later
        // cannot widen the header and move the rows (release-rg-popup, 2026-10-26).
        const glyph = await have.evaluate((th) => {
            const cs = getComputedStyle(th, '::after');
            return { content: cs.content, display: cs.display, width: parseFloat(cs.width), em: parseFloat(cs.fontSize) };
        });
        expect(glyph.content).toContain('⇅');
        expect(glyph.display).toBe('inline-block');
        expect(glyph.width).toBeCloseTo(glyph.em * 1.4, 1);
        await have.click();
        await expect(have).toHaveAttribute('aria-sort', 'descending');
        await expect(onRel.locator('tbody > tr').first()).toContainText('Born In The U.S.A.');
        await expect(onRel.locator('tbody > tr').first().locator('td.mb-dg-num').first()).toHaveText('63,340');
        // A second click: the other direction, fewest first.
        await have.click();
        await expect(have).toHaveAttribute('aria-sort', 'ascending');
        await expect(onRel.locator('tbody > tr').first()).not.toContainText('Born In The U.S.A.');
        // A third click: back to Discogs' order.
        await have.click();
        await expect(have).toHaveAttribute('aria-sort', 'none');
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
        await expect(disco.locator('[data-mb-dg-sec="a-c-Producer"] tbody > tr mark.mb-dg-hl')).toHaveText(['Signal Hill']);
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
        // A third click: Discogs' own order (not sorted by name either way).
        await subs.locator('th[data-mb-dg-ssort="name"]').click();
        await expect(subs.locator('th[data-mb-dg-ssort="name"]')).toHaveAttribute('aria-sort', 'none');
        await expect(subs.locator('th[data-mb-dg-ssort="status"]')).toHaveAttribute('aria-sort', 'none');
        const raw = await subRows.locator('td:first-child').evaluateAll(tds => tds.map(td => td.textContent));
        const byName = [...raw].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        expect(raw, 'Discogs\' order is not the name order').not.toEqual(byName);
        expect(raw, 'nor its reverse').not.toEqual([...byName].reverse());
        // The filter: the field keeps its focus, page 1 of the matches.
        const sq = subs.locator('.mb-dg-sq');
        await sq.fill('Columbia');
        await expect(sq).toBeFocused();
        const nMatch = await subRows.count();
        expect(nMatch).toBeGreaterThan(0);
        expect((await subRows.locator('td:first-child').allTextContents()).every(n => /columbia/i.test(n))).toBe(true);
        await expect(subRows.locator('mark.mb-dg-hl')).toHaveCount(nMatch);
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
        await expect(rel.locator('tbody > tr mark.mb-dg-hl')).toHaveText(['Y4LPLY585']);
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

    test('a label\'s releases: a row without a thumbnail keeps the thumbnail\'s box (org/MB-POH-sync-withDiscogs.org, Phase 2)', async ({ page }) => {
        await openDiscogsEntities(page);
        await ctrlHover(page, probe(page, 2));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Columbia');
        await page.keyboard.press('Space');
        const rel = dialog(page).locator('[data-mb-dg-disco="label"]');
        await expect(rel.locator('tbody > tr')).toHaveCount(100);
        // Page 1 newest first has one release without a thumbnail.
        const none = rel.locator('tbody > tr > td:first-child > .mb-dg-nothumb');
        await expect(none).toHaveCount(1);
        const real = await rel.locator('tbody > tr > td:first-child img.mb-dg-vthumb').first().boundingBox();
        const blank = await none.boundingBox();
        expect([blank.width, blank.height]).toEqual([real.width, real.height]);
        expect(real.width).toBe(42);
        // The sublabels (a Compact table): typing on page 2 starts over on page 1.
        const subs = dialog(page).locator('[data-mb-dg-sec="sublabels"]');
        await subs.getByRole('button', { name: 'Next page' }).click();
        await expect(subs.locator('.mb-dg-pager span')).toHaveText('26–50 of 217');
        await subs.locator('input.mb-tbl-q').fill('a');
        await expect(subs.locator('.mb-dg-pager span')).toHaveText(/^1–25 of \d+ \(217 in all\)$/);
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

    // The window's tables and its height (org/POH-table-sizing.org, A+D,
    // 2026-10-31): every right-column table, a Discogs one too. The label
    // window has its sides swapped (mb-dg-swap): the releases on the right.
    test('a label\'s releases (right column) fill the window body and follow its height', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 1000 });
        await openDiscogsEntities(page);
        await ctrlHover(page, probe(page, 2));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('Columbia');
        await page.keyboard.press('Space');
        const rel = dialog(page).locator('[data-mb-dg-disco="label"]');
        await expect(rel.locator('tbody > tr')).toHaveCount(100);
        const read = () => page.evaluate(() => {
            const area = document.querySelector('#mb-dp-dialog .mb-dp-area');
            const pane = area.querySelector('.mb-dp-x.mb-dg-swap > .mb-dp-col:nth-child(2)');
            const w = pane.querySelector('[data-mb-dg-disco="label"] .mb-dg-vwrap');
            const pad = parseFloat(getComputedStyle(pane.parentElement).paddingBottom);
            const a = area.getBoundingClientRect();
            return {
                fill: w.classList.contains('mb-dp-fill'),
                pane: pane.classList.contains('mb-dp-pane'),
                max: parseFloat(w.style.maxHeight) || 0,
                gap: (a.top + area.clientTop + area.clientHeight - pad) - pane.getBoundingClientRect().bottom,
            };
        });
        await page.evaluate(() => { document.getElementById('mb-dp-dialog').style.height = '600px'; });
        await expect.poll(async () => (await read()).fill).toBe(true);
        const low = await read();
        expect(low.pane).toBe(true);
        expect(Math.abs(low.gap), 'the pane ends where the window body ends').toBeLessThanOrEqual(4);
        await page.evaluate(() => { document.getElementById('mb-dp-dialog').style.height = '850px'; });
        await expect.poll(async () => (await read()).max - low.max).toBeGreaterThan(240);
        expect((await read()).max - low.max).toBeLessThanOrEqual(260);
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
        // The page's own <style> @imports Wikidot's theme from cloudfront: left
        // to the network, that CSS restyled the page whenever it came, and
        // when it came after the reader's wheel ~2,300 px above the show
        // collapsed and the show left the view (a 50 ms timeline, 2026-10-27,
        // DEBUG-NOTES): the test failed 1 run in 10 under load, 3 in 10 on
        // main. Served empty, at once.
        await page.context().route('https://d3g0gp89917ko0.cloudfront.net/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
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

// Phase 4 of org/MB-POH-sync-withDiscogs.org (2026-10-27): a release's
// Images page and its image editor ("Image history") get their own reader,
// `dgimages`, ahead of `discogs` (whose path pattern takes /images too).
// It reads the API (the title; signed out, the images at the size Discogs
// serves them) and the image editor's data, `/release/<id>/images/data`
// (what Discogs' own uploader script reads: the editor's PAGE is sent empty),
// WITH the user's Discogs session (vzell's consent: the only non-anonymous
// request of the popup engine). Fixtures: ext-discogs-release-1313481.json
// (scripts/probe-dg-release-images.py --fixture), dg-release-images-data.json
// (vzell's copy, scripts/build-discogs-fixtures.py). Dates are the browser's
// local time: Berlin here. Mutations: scripts/mutations/dg-images.json.
test.describe('Discogs Images and Image history (Phase 4)', () => {
    test.use({ timezoneId: 'Europe/Berlin' });
    const IMG = {
        images: 'https://www.discogs.com/release/1313481-Born-To-Run/images',
        editor: 'https://www.discogs.com/release/1313481-Born-To-Run/images/update',
    };
    const API = 'https://api.discogs.com/releases/1313481';
    // The editor's data (the page itself never holds the images).
    const EDITOR = 'https://www.discogs.com/release/1313481/images/data';

    /**
     * The event page with the two links, the API answered, the editor's page
     * answered by `editor` (the fixture by default); `settings` over the
     * previews' switch.
     *
     * @param {import('@playwright/test').Page} page
     * @param {{editor?: ?Object, settings?: Object}} [opts]
     * @returns {Promise<void>}
     */
    async function openImages(page, { editor = undefined, settings = {} } = {}) {
        await page.context().route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await openEvent(page, {
            settings: { sa_pop_ext: true, ...settings },
            responses: {
                ...extAnswers('discogs-release-1313481'),
                [EDITOR]: editor !== undefined ? editor
                    : { status: 200, responseHeaders: 'Content-Type: application/json', responseText: json('dg-release-images-data.json') },
            },
        });
        await addAnnotationLinks(page, [IMG.images, IMG.editor]);
    }

    test('both pages are the images reader\'s, before the release reader; slug and language do not matter', async ({ page }) => {
        await openImages(page);
        await addAnnotationLinks(page, ['https://www.discogs.com/de/release/1313481/images/update/', 'https://www.discogs.com/release/1313481-Born-To-Run']);
        const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.ext-probe a')).map(a => window.__saTest.popResolve(a)));
        expect(keys).toEqual([
            'ext|ext:dgimages:https://www.discogs.com/release/1313481/images/update',
            'ext|ext:discogs:https://www.discogs.com/release/1313481-Born-To-Run',
            'ext|ext:dgimages:https://www.discogs.com/release/1313481/images',
            'ext|ext:dgimages:https://www.discogs.com/release/1313481/images/update',
        ]);
    });

    test('Image history: the card asks nothing; Space reads the API (anonymous) and the editor (with the session); one table of every image', async ({ page }) => {
        await openImages(page);
        await ctrlHover(page, probe(page, 1));
        await expect(card(page)).toContainText('not contacted yet'); // www.discogs.com, first contact: Space only
        expect(await xhrFull(page), 'a hover reads nothing').toEqual([]);
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Discogs image history');
        const tbl = d.locator('[data-mb-tbl="dg-imghist"]');
        const rows = tbl.locator('tbody tr');
        await expect(rows).toHaveCount(17);
        const log = await xhrFull(page);
        expect(log.map(r => r.url)).toEqual([API, EDITOR]);
        expect(log.map(r => r.anonymous), 'the API anonymous, the editor with the Discogs session').toEqual([true, false]);
        await expect(tbl.locator('thead th')).toHaveText([/^#/, '', /^Type/, /^Uploaded by/, /^Date/, /^W × H/, /^Size/]);
        const cells = (r) => rows.nth(r).locator('td');
        await expect(cells(0)).toHaveText(['1', '', 'Primary', 'dsmith', '2008-05-20', '500 × 500', '127KB']);
        // 2008-05-19T23:46:48 UTC is 01:46 the next day in Berlin, as the editor shows it.
        await expect(cells(0).nth(4).locator('span')).toHaveAttribute('title', '2008-05-20 01:46 · 2008-05-19T23:46:48+00:00 (UTC)');
        expect(log[1].headers['X-Requested-With'], 'asked as Discogs\' own script asks').toBe('XMLHttpRequest');
        await expect(cells(0).nth(3).locator('a')).toHaveAttribute('href', 'https://www.discogs.com/user/dsmith');
        // The editor's own size, not the 600 px the API serves.
        await expect(cells(4)).toHaveText(['5', '', 'Secondary', 'Cl0ver', '2023-06-12', '2002 × 2000', '1.2MB']);
        await expect(cells(0).nth(1).locator('img.mb-dg-vthumb')).toHaveAttribute('src', /^https:\/\/i\.discogs\.com\//);
        // The facts from both sources.
        await expect(d).toContainText('17 (1 primary, 16 secondary)');
        await expect(d).toContainText('Cl0ver 11, dsmith 5, heaven83 1');
        await expect(d).toContainText('2040 × 2000 px');
        // Size sorts by bytes: ascending, then descending.
        await tbl.locator('th[data-mb-tbl-sort="size"]').click();
        await expect(cells(0).nth(6)).toHaveText('70KB');
        await tbl.locator('th[data-mb-tbl-sort="size"]').click();
        await expect(cells(0).nth(6)).toHaveText('3.5MB');
        await expect(d.locator('.mb-dp-warn')).toHaveCount(0);
    });

    test('with www.discogs.com contacted before, a hover still reads nothing: the session\'s page is read on Space only', async ({ page }) => {
        // The first-contact rule no longer holds the hover back here; only
        // the reader's `windowOnly` does.
        await openImages(page, { settings: { sa_pop_ext_hosts: ['www.discogs.com'] } });
        await ctrlHover(page, probe(page, 1));
        await expect(card(page)).toContainText('Not read yet');
        await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
        expect(await xhrFull(page), 'a hover reads nothing, past the hosts\' gates').toEqual([]);
        await page.keyboard.press('Space');
        await expect(dialog(page).locator('[data-mb-tbl="dg-imghist"] tbody tr')).toHaveCount(17);
        expect((await xhrFull(page)).map(r => r.url)).toEqual([API, EDITOR]);
    });

    test('Images: the uploaders on the left, every image captioned on the right; a click opens the viewer', async ({ page }) => {
        await openImages(page);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page)).toContainText('no request yet');
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Discogs images');
        const users = d.locator('[data-mb-tbl="dg-imgusers"] tbody tr');
        await expect(users).toHaveCount(3);
        await expect(users.first().locator('td')).toHaveText(['Cl0ver', '11', '2023']);
        const tiles = d.locator('[data-mb-dg-sec="dgi-gallery"] .mb-dp-gallery a');
        await expect(tiles).toHaveCount(17);
        await expect(tiles.first()).toHaveAttribute('href', /^https:\/\/i\.discogs\.com\/.*\/w:500\//);
        await expect(tiles.first().locator('span').first()).toHaveText('front');
        await expect(tiles.first().locator('.mb-dg-imgcap')).toHaveText('500 × 500 · 127KB · dsmith, 2008');
        await expect(tiles.nth(16).locator('.mb-dg-imgcap')).toHaveText('1655 × 1427 · 502KB · heaven83, 2017');
        await tiles.nth(2).click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(d).toBeVisible();
    });

    // Here, not on discogs.com: a same-origin fetch()'s text() drops a
    // leading BOM itself, GM_xmlhttpRequest's responseText keeps it.
    test('the editor\'s data with a leading BOM (vzell\'s saved copy had one) is still read', async ({ page }) => {
        await openImages(page, { editor: { status: 200, responseHeaders: 'Content-Type: application/json', responseText: `\uFEFF${json('dg-release-images-data.json')}` } });
        await ctrlHover(page, probe(page, 1));
        await expect(card(page)).toContainText('no request yet');
        await page.keyboard.press('Space');
        const rows = dialog(page).locator('[data-mb-tbl="dg-imghist"] tbody tr');
        await expect(rows).toHaveCount(17);
        await expect(rows.first().locator('td').nth(3)).toHaveText('dsmith');
        await expect(dialog(page).locator('.mb-dp-warn')).toHaveCount(0);
    });

    test('signed out of Discogs: the editor shows no images; the API\'s images and types, the served size marked, and why', async ({ page }) => {
        await openImages(page, { editor: { status: 200, responseHeaders: 'Content-Type: text/html', responseText: '<html><body><form id="login"></form></body></html>' } });
        await ctrlHover(page, probe(page, 1));
        await expect(card(page)).toContainText('no request yet');
        await page.keyboard.press('Space');
        const d = dialog(page);
        const rows = d.locator('[data-mb-tbl="dg-imghist"] tbody tr');
        await expect(rows).toHaveCount(17);
        await expect(d.locator('.mb-dp-warn')).toContainText('Discogs did not give the image editor\'s data');
        await expect(rows.nth(4).locator('td')).toHaveText(['5', '', 'Secondary', '—', '—', '600 × 599 served', '—']);
        await expect(d).not.toContainText('Uploaders');
    });
});

// org/POH-headerline.org item 4 (vzell, 2026-10-28): a Discogs window's
// "✎ Editing history" (no ▾) opens its subject's history page in the window
// — a release's, a master's, an artist's or a label's — through the history
// reader; a history of several pages shows the newest (the page the plain
// URL serves) and reads the earlier ones on request, newest first. Fixtures:
// tests/fixtures/dg-*-history.html (scripts/build-discogs-fixtures.py, from
// vzell's saved pages; the artist's is its page 2 of 2).
const histAnswer = (file) => htmlAnswer(fs.readFileSync(path.join(__dirname, file), 'utf8'));
// The history page requests so far, and whether each was anonymous.
const histLog = async (page) => (await xhrFull(page)).filter(r => /\/history(?:\?|$)/.test(r.url)).map(r => [r.url, r.anonymous]);

test.describe('Discogs windows: ✎ Editing history (org/POH-headerline.org item 4)', () => {
    test('a release: the button without ▾; its history page in the window, one anonymous request; H opens it too', async ({ page }) => {
        const url = 'https://www.discogs.com/release/1874253/history';
        await openDiscogs(page, { responses: { [url]: histAnswer('dg-release-history.html') } });
        await ctrlHover(page, probe(page, 0));
        await page.keyboard.press('Space');
        const d = dialog(page);
        const title = d.locator(':scope > div > span').first();
        await expect(title).toHaveText('Discogs release');
        const hist = d.locator('button.mb-meh-hist-btn');
        await expect(hist).toBeVisible();
        await expect(d.locator('button.mb-meh-hist-more'), 'no presets menu for Discogs').toBeHidden();
        await expect(hist).toHaveAttribute('title', /edit history on Discogs/);
        await hist.click();
        await expect(title).toHaveText('Discogs release › Discogs release history');
        await expect(d.locator('.mb-dgh-e')).toHaveCount(14);
        await expect(d.locator('.mb-dgh-pages'), 'one page: no pages line').toHaveCount(0);
        await d.getByRole('button', { name: /Back/ }).click();
        await expect(title).toHaveText('Discogs release');
        await d.locator('.mb-dp-area').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press('h');
        await expect(title).toHaveText('Discogs release › Discogs release history');
        expect(await histLog(page), 'one request, from memory the second time').toEqual([[url, true]]);
    });

    // vzell, 2026-10-28, a master's history: "the edit type buttons and the
    // edit text overlap" — "EDIT MASTER RELEASE" ran past its 8.5em column.
    test('a master: its kind pills ("Edit Master Release") stay in their column, clear of the note', async ({ page }) => {
        const url = 'https://www.discogs.com/master/26725/history';
        await openDiscogs(page, { responses: { [url]: histAnswer('dg-master-history.html') } });
        await ctrlHover(page, probe(page, 1));
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Discogs master');
        await d.locator('button.mb-meh-hist-btn').click();
        await expect(d.locator('.mb-dgh-e')).toHaveCount(50);
        const rows = await d.locator('.mb-dgh-e').evaluateAll(es => es.map((e) => {
            const pill = e.querySelector('.mb-dgh-pill').getBoundingClientRect();
            const note = e.querySelector('.mb-dgh-n').getBoundingClientRect();
            return { label: e.querySelector('.mb-dgh-pill').textContent, gap: Math.round(note.left - pill.right) };
        }));
        expect(rows.some(r => r.label === 'Edit Master Release'), 'the long kind is there').toBe(true);
        expect(rows.filter(r => r.gap < 0), 'no pill runs into its note').toEqual([]);
        await expect(d.locator('.mb-dgh-pill').first()).toHaveAttribute('title', 'Edit Master Release');
    });

    test('an artist: the newest page, then the earlier one on request; murdos\' importer\'s link is not the subject', async ({ page }) => {
        const url = 'https://www.discogs.com/artist/219986/history';
        await openDiscogsEntities(page, {
            responses: {
                [url]: histAnswer('dg-artist-history.html'),
                // Page 1: a stand-in (the label's page 1, 59 changes): the run's
                // mechanism, not its content.
                [`${url}?page=1`]: histAnswer('dg-label-history.html'),
            },
        });
        await ctrlHover(page, probe(page, 1));
        await page.keyboard.press('Space');
        const d = dialog(page);
        const title = d.locator(':scope > div > span').first();
        await expect(title).toHaveText('Discogs artist');
        await expect(d.locator('button.mb-meh-hist-more')).toBeHidden();
        await d.locator('button.mb-meh-hist-btn').click();
        await expect(title).toHaveText('Discogs artist › Discogs artist history');
        await expect(d.locator('.mb-dgh-e')).toHaveCount(46);
        // The saved page carries murdos' musicbrainz.org link (and glyph)
        // first in its <h1>: the picture is not that glyph.
        await expect(d.locator('.mb-dp-area img[src*="musicbrainz.org"]')).toHaveCount(0);
        const pages = d.locator('.mb-dgh-pages');
        await expect(pages).toContainText('Page 2 of 2 shown (the newest) · 46 changes');
        const load = pages.getByRole('button', { name: /^Load the 1 earlier page \(1 request, about \d+ s\)$/ });
        await expect(load).toBeVisible();
        expect(await histLog(page), 'nothing more until asked').toEqual([[url, true]]);
        await load.click();
        await expect(d.locator('.mb-dgh-e')).toHaveCount(105, { timeout: 15000 });
        await expect(pages).toContainText('Pages 1–2 of 2 shown · 105 changes');
        await expect(pages.getByRole('button'), 'every page in').toHaveCount(0);
        // Oldest first: the earlier page's first change leads.
        await d.getByRole('button', { name: 'Oldest first' }).click();
        await expect(d.locator('.mb-dgh-e .mb-dgh-d').first()).toHaveText('2011-09-02 07:22');
        expect(await histLog(page), 'one request per page, anonymous').toEqual([[url, true], [`${url}?page=1`, true]]);
    });
});

// An archive.org item through its metadata API (the `iadetails` reader,
// 2026-10-31, org/internet.archive.org; mockup
// https://claude.ai/artifact/4aXkdPxudwhuzACj4Wg81C views 2–5): the card on a
// hover, the window on Space, a link to one track sharing its show's request
// and marked in its setlist, "Play here" in archive.org's own player. The
// answers are real captures (scripts/build-ia-fixtures.py →
// tests/fixtures/ext-ia-metadata-*.json). Mutations:
// scripts/mutations/internet-archive.json.
test.describe('archive.org items (the iadetails reader)', () => {
    const IA_SHOW = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16';
    const IA_VIDEO = '1975-bruce-springsteen-widener-college-audience-cam';
    const IA_MISS = 'this-item-does-not-exist-sa-fixture';
    const IA = {
        show: `https://archive.org/details/${IA_SHOW}`,
        track: `https://archive.org/details/${IA_SHOW}/1-02.+Tenth+Avenue+Freeze-Out.flac`,
        video: `https://archive.org/details/${IA_VIDEO}`,
        miss: `https://archive.org/details/${IA_MISS}`,
    };
    const iaLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.startsWith('https://archive.org/')));

    /**
     * The event page with archive.org links in its annotation; archive.org's
     * pictures and players answered locally.
     *
     * @param {import('@playwright/test').Page} page
     * @param {Object} [settings]
     * @returns {Promise<void>}
     */
    async function openIa(page, settings = {}) {
        await openEvent(page, {
            settings: { sa_pop_ext: true, ...settings },
            responses: extAnswers(`ia-metadata-${IA_SHOW}`, `ia-metadata-${IA_VIDEO}`, `ia-metadata-${IA_MISS}`),
        });
        // On the page, after the load: the harness's own page routes win
        // over the context's, and a picture that fails is removed from the
        // window (its error listener).
        await page.route(/^https:\/\/archive\.org\/(?:services\/img|download)\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.route('https://archive.org/embed/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' }));
        await addAnnotationLinks(page, [IA.show, IA.track, IA.video, IA.miss]);
    }

    test('a show: the card on a hover (one request, its first songs); Space: its facts, links and the whole setlist', async ({ page }) => {
        await openIa(page);
        await ctrlHover(page, probe(page, 0));
        const c = card(page);
        await expect(c.locator('.mb-tt-title')).toHaveText('Bruce Springsteen - 1975-12-27, Tower Theater, Philadelphia');
        await expect(c).toContainText('Internet Archive · Audio');
        await expect(c.locator('.mb-dp-tracks li')).toHaveCount(6);
        await expect(c.locator('.mb-dp-tracks li').nth(1)).toHaveText('2Tenth Avenue Freeze-Out');
        await expect(c).toContainText('+ 13 more');
        expect(await iaLog(page), 'one request: the item\'s metadata').toEqual([`https://archive.org/metadata/${IA_SHOW}`]);
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Internet Archive');
        const rows = d.locator('[data-mb-tbl="ia-setlist"] tbody tr');
        await expect(rows).toHaveCount(19);
        await expect(rows.nth(1)).toContainText('Tenth Avenue Freeze-Out');
        await expect(rows.nth(1)).toContainText('3:50');
        await expect(d.locator('.mb-dp-x.mb-dg-swap')).toHaveCount(1);
        await expect(d).toContainText('Tower Theater, Philadelphia');
        await expect(d.locator('a[href^="http://brucebase.wikidot.com/"], a[href^="https://brucebase.wikidot.com/"]').first()).toBeVisible();
        await expect(d.locator('.mb-ia-desc')).not.toBeEmpty();
        // Play is off (the fixtures' default): no ▶, no slot.
        await expect(d.locator('.mb-yt-tile')).toHaveCount(0);
        expect(await iaLog(page), 'still the one request').toEqual([`https://archive.org/metadata/${IA_SHOW}`]);
    });

    test('a link to one track: its show\'s request (no second one), the track in the card, its row marked in the window', async ({ page }) => {
        await openIa(page);
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-tt-title')).toHaveText(/Tower Theater/);
        await ctrlHover(page, probe(page, 1));
        await expect(card(page)).toContainText('Tenth Avenue Freeze-Out · track 2 of 19 · 3:50');
        expect(await iaLog(page)).toEqual([`https://archive.org/metadata/${IA_SHOW}`]);
        await page.keyboard.press('Space');
        const d = dialog(page);
        await expect(d.locator(':scope > div > span').first()).toHaveText('Internet Archive track');
        await expect(d.locator('[data-mb-tbl="ia-setlist"] tbody tr.mb-ia-mark')).toHaveCount(1);
        await expect(d.locator('[data-mb-tbl="ia-setlist"] tbody tr.mb-ia-mark')).toContainText('Tenth Avenue Freeze-Out');
    });

    test('Play here: a song plays in archive.org\'s player above the setlist, one at a time; a video\'s tile plays the video; Esc stops', async ({ page }) => {
        await openIa(page, { sa_ia_play_in_place: true });
        await ctrlHover(page, probe(page, 0));
        await expect(card(page).locator('.mb-tt-title')).toHaveText(/Tower Theater/);
        await page.keyboard.press('Space');
        const d = dialog(page);
        const plays = d.locator('[data-mb-tbl="ia-setlist"] tbody .mb-yt-tile.mb-yt-mini');
        await expect(plays).toHaveCount(19);
        expect(await iaLog(page), 'no player asked before a click').toEqual([`https://archive.org/metadata/${IA_SHOW}`]);
        await plays.nth(1).click();
        const frame = d.locator('[data-mb-yt-slots] > .mb-yt-slot iframe.mb-yt-frame');
        await expect(frame).toHaveAttribute('src', `https://archive.org/embed/${IA_SHOW}/1-02.%20Tenth%20Avenue%20Freeze-Out.flac?autoplay=1`);
        await expect(frame).toHaveClass(/mb-yt-frame-audio/);
        await expect(d.locator('.mb-yt-foot')).toContainText('Track');
        await expect(d.locator('.mb-yt-foot a')).toHaveAttribute('href', `https://archive.org/details/${IA_SHOW}/1-02.%20Tenth%20Avenue%20Freeze-Out.flac`);
        await expect(plays.nth(1)).toHaveAttribute('aria-pressed', 'true');
        // A second song: one player still.
        await plays.nth(2).click();
        await expect(d.locator('iframe.mb-yt-frame')).toHaveCount(1);
        await expect(frame).toHaveAttribute('src', /\/1-03\.%20Spirit%20In%20The%20Night\.flac\?autoplay=1$/);
        await page.keyboard.press('Escape');
        await expect(d.locator('iframe.mb-yt-frame')).toHaveCount(0);
        await expect(d).toBeVisible();
        // The video: a tile with its picture; the player under it.
        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();
        await ctrlHover(page, probe(page, 2));
        await expect(card(page).locator('.mb-tt-title')).toHaveText('1975 Bruce Springsteen Widener College (Audience Cam)');
        await page.keyboard.press('Space');
        const tile = dialog(page).locator('.mb-yt-win .mb-yt-tile');
        await expect(tile.locator('img')).toHaveAttribute('src', `https://archive.org/services/img/${IA_VIDEO}`);
        await expect(dialog(page).locator('.mb-ia-thumbs img')).toHaveCount(12);
        await expect(dialog(page).locator('[data-mb-tbl="ia-videos"] tbody tr')).not.toHaveCount(0);
        await tile.click();
        await expect(dialog(page).locator('iframe.mb-yt-frame')).toHaveAttribute('src', `https://archive.org/embed/${IA_VIDEO}?autoplay=1`);
        await expect(dialog(page).locator('iframe.mb-yt-frame')).not.toHaveClass(/mb-yt-frame-audio/);
    });

    test('an item archive.org does not have: a dead link in its words, kept as such', async ({ page }) => {
        await openIa(page);
        await ctrlHover(page, probe(page, 3));
        await expect(card(page)).toContainText('The Internet Archive has no such item.');
        expect(await iaLog(page)).toEqual([`https://archive.org/metadata/${IA_MISS}`]);
    });
});
