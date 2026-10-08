'use strict';

// The popup engine on links to OTHER sites (org/iframe.org, "* generalize to
// URLs", U1): `_extSource()`, behind ONE opt-in setting, `sa_pop_ext`.
// Every external request is a `GM_xmlhttpRequest` (fetch() cannot read
// another origin), answered here by the stub's `window.__gmXhrResponses`,
// which also logs each call (`window.__gmXhrLog`) — nothing reaches the
// network.
//
// Pins, in order:
//   1. off by default: no card, no request;
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
//      no script left, ⟳ asks again, ← → step down the URL column.
//
// Mutation list: scripts/mutations/popup-ext.json.
//
// Host page: tests/fixtures/event-overview.html (an event whose "Show all"
// turns the relationships into tables, its URLs into a "URLs" sub-table).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL_EVENT = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const BUTTON = 'button[data-label="Show all Relationships for Event"]';
const SETLIST = 'https://www.setlist.fm/setlist/bruce-springsteen/2025/co-op-live-manchester-england-43535b97.html';
const HTML_HEADERS = 'Content-Type: text/html; charset=utf-8';
const SETLIST_HTML = '<!doctype html><html lang="en"><head><title>Concert Setlist | setlist.fm</title>' +
    '<meta property="og:title" content="Bruce Springsteen Setlist at Co-op Live, Manchester">' +
    '<meta property="og:type" content="setlist"><meta property="og:site_name" content="setlist.fm">' +
    '<meta name="description" content="Get the Bruce Springsteen Setlist of the concert at Co-op Live, Manchester.">' +
    '<meta property="og:image" content="https://img.example/setlist.png">' +
    `<link rel="canonical" href="${SETLIST}"><link rel="preload" as="script" href="https://img.example/bundle.js">` +
    '<link rel="preconnect" href="https://img.example"></head><body><p id="live-probe">The setlist itself</p>' +
    '<script>window.__liveRan = 1;</script><a href="#" onclick="window.__liveRan = 2">x</a></body></html>';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
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
 * (kept across reloads), presses "Show all" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, responses?: Object, press?: boolean}} [opts]
 * @returns {Promise<void>}
 */
async function openEvent(page, { settings = {}, responses = {}, press = true } = {}) {
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.route('https://img.example/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    // The real site is never asked: a page fetch() (instead of the stubbed
    // GM_xmlhttpRequest) fails here, as it would against CORS.
    await ctx.route('https://www.setlist.fm/**', (route) => route.abort('blockedbyclient'));
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
    test('off by default: no card, no request', async ({ page }) => {
        await page.clock.install();
        await openEvent(page, { settings: { sa_pop_ext_hosts: ['www.setlist.fm'] } });
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
        expect(r.wiki).toBe('ext|ext:generic:https://en.wikipedia.org/wiki/TeachRock');
        expect(r.ytList, 'a playlist is the YouTube reader\'s').toBe('ext|ext:youtube:https://www.youtube.com/playlist?list=PLM0aPYPhFzkrHWh8uoXwAsxdDXyFEEELt');
        expect(r.ytChannel, 'a channel is not (oEmbed has none): the generic reader').toBe('ext|ext:generic:http://www.youtube.com/brucebasewiki');
        expect(r.info, 'the "[info]" link is MusicBrainz\'s own (U2)').toBeNull();
        expect(r.mbAbs, 'an absolute musicbrainz.org link is not another site').toBeNull();
        expect(r.art, 'artwork has its own preview').toBeNull();
        expect(r.share).toBeNull();
        expect(r.mail).toBeNull();
        expect(r.img, 'a link around an image').toBeNull();
        expect(r.outside, 'outside the scope without sa_pop_mb_page').toBeNull();
        expect(r.entity, 'the entity cards keep their links').toMatch(/^mb-entity\|artist:/);

        await page.evaluate(() => window.GM_setValue('sa_pop_mb_page', true));
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
        expect(wide, 'page-wide scope (sa_pop_mb_page)').toBe('ext|ext:generic:https://en.wikipedia.org/wiki/Outside');
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
