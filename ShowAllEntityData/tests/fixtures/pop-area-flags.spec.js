'use strict';

// The area links of the MusicBrainz windows keep still (vzell 2026-10-29,
// mockup https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag; DEBUG-NOTES.md):
// "MusicBrainz More Flags Everywhere" (@Lotheric) puts a flag and a space
// before every area link a moment after it appears, unless the link carries
// `data-flag-processed`; the window replaces its links on every repaint, so
// its flags arrived late each time and "Area" / "Born" jumped. The window now
// stamps its area links and draws its own flags in a fixed slot
// (`_mbPopAreaHtml()`, `_mbPopFlagHtml()`, `_mbPopFlagLoad()`).
//
// Pins, in order:
//   1. a stand-in for that script's observer finds nothing to do in the
//      window, and the "Born" chain's last link does not move by a pixel in
//      any frame of a repaint (a segment click);
//   2. a state's flag is its Wikidata item's P41 on Commons: one url-rels
//      lookup and one wbgetclaims, only after Space, kept: the window opened
//      again asks neither;
//   3. the country's flag is MusicBrainz's own (`span.flag.flag-US`); on
//      another host (discogs.com) its ISO code in a box; a state's slot is
//      there while its flag loads; a city has none.
//
// The Web Service answers are the popup-mb captures; Wikidata is the stubbed
// GM_xmlhttpRequest (`window.__gmXhrResponses`); Commons is a local PNG.
// Mutation list: scripts/mutations/poh-fixes.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f';
const NJ = 'a36544c1-cb40-4f44-9e0e-7a5a69e403a8';
const NJ_ITEM = 'Q1408';
const NJ_FLAG = 'Flag of New Jersey.svg';
const P41 = `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${NJ_ITEM}&property=P41`;
// The chain under Bruce Springsteen's birthplace (popup-mb.spec.js's captures).
const AREA_RELS = {
    'bb0af2e9-6ae0-4c4f-b729-c8d6444d6380': 'ws2-pop-area-bb0af2e9.json', // Long Branch (City)
    '604b7841-36b7-4bea-9bdc-7eeb52520e35': 'ws2-pop-area-monmouth.json', // Monmouth County (County)
    [NJ]: 'ws2-pop-area-nj.json',                                         // New Jersey (Subdivision)
};

/**
 * New Jersey's url-rels answer: its capture with a `wikidata` link.
 * @returns {string}
 */
const njUrlRels = () => {
    const d = JSON.parse(json('ws2-pop-area-nj.json'));
    d.relations = [{ type: 'wikidata', 'target-type': 'url', direction: 'forward',
        url: { id: 'u1', resource: `https://www.wikidata.org/wiki/${NJ_ITEM}` } }];
    return JSON.stringify(d);
};

/**
 * A `wbgetclaims` answer naming one P41 file.
 * @param {string} file
 * @returns {{status: number, responseHeaders: string, responseText: string}}
 */
const p41 = (file) => ({
    status: 200, responseHeaders: 'Content-Type: application/json; charset=utf-8',
    responseText: JSON.stringify({ claims: { P41: [{ mainsnak: { snaktype: 'value', property: 'P41',
        datavalue: { value: file, type: 'string' } }, type: 'statement', rank: 'normal' }] } }),
});

/**
 * Loads the release-group page (its tables link the artist) with the
 * artist's captures, the area chain, New Jersey's url-rels and Wikidata's
 * P41 answered; anything else of the Web Service 404. `mfe`: a stand-in
 * for More Flags Everywhere's observer (its l.1311–1394: debounced, a
 * span and a space before every area link not stamped
 * `data-flag-processed`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{mfe?: boolean}} [opts]
 * @returns {Promise<{ws2: string[]}>}
 */
async function open(page, { mfe = false } = {}) {
    const log = { ws2: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.route(/^https:\/\/(?:commons|upload)\.wikimedia\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route(/\/ws\/2\//, (route) => {
        const url = route.request().url();
        log.ws2.push(url);
        let body = null;
        const area = /\/ws\/2\/area\/([0-9a-f-]{36})\?inc=(area-rels|url-rels)&/.exec(url);
        if (/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=genres/.test(url)) body = json('ws2-pop-artist-bruce.json');
        else if (/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=url-rels/.test(url)) body = json('ws2-pop-artist-bruce-pin.json');
        else if (area && area[2] === 'area-rels' && AREA_RELS[area[1]]) body = json(AREA_RELS[area[1]]);
        else if (area && area[2] === 'url-rels' && area[1] === NJ) body = njUrlRels();
        return route.fulfill(body ? { status: 200, contentType: 'application/json', body }
            : { status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' });
    });
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, { [P41]: p41(NJ_FLAG) });
    if (mfe) {
        await ctx.addInitScript(() => {
            let pending = [];
            let timer = 0;
            const flag = (a) => {
                if (a.dataset.flagProcessed) return;
                a.dataset.flagProcessed = '1';
                const s = document.createElement('span');
                s.className = 'mfe-stub';
                s.style.cssText = 'display:inline-block;width:18px;height:12px';
                a.before(s, document.createTextNode(' '));
            };
            new MutationObserver((muts) => {
                muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) pending.push(n); }));
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const nodes = pending;
                    pending = [];
                    nodes.filter(n => n.isConnected).forEach((n) => {
                        if (n.matches('a[href*="/area/"]')) flag(n);
                        n.querySelectorAll('a[href*="/area/"]').forEach(flag);
                    });
                }, 30);
            }).observe(document, { childList: true, subtree: true });
        });
    }
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_pop_mb: true, sa_rich_tooltip_delay_ms: 0 },
    });
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Hovers with Ctrl held, released after, so a later Space is not Ctrl+Space.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} el
 */
async function ctrlHover(page, el) {
    await page.mouse.move(0, 0);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
}

const artistLink = (page) => page.locator(`table.tbl tbody a[href="/artist/${ARTIST}"]`).first();
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const facts = (page) => dialog(page).locator('.mb-dp-area h4:text-is("Facts") + .mb-dp-kv');
const born = (page) => facts(page).locator('dt:text-is("Born") + dd');
/** The Wikidata requests this page load made (the GM stub's log). */
const wdLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.includes('wikidata.org')));
const flagLookups = (log) => log.ws2.filter(u => /\/ws\/2\/area\/[0-9a-f-]{36}\?inc=url-rels&/.test(u));
// The artist window queues about nine lookups at one a second.
const QUEUE = { timeout: 25000 };

/**
 * Opens the artist's window and waits until the "Born" chain is whole and
 * New Jersey's flag has come.
 * @param {import('@playwright/test').Page} page
 */
async function pinArtist(page) {
    await ctrlHover(page, artistLink(page));
    await expect(card(page).locator('.mb-tt-foot')).toBeVisible(QUEUE);
    await page.keyboard.press('Space');
    await expect(dialog(page)).toBeVisible();
    await expect(born(page)).toHaveText('1949-09-23 · Long Branch, New Jersey, United States', QUEUE);
    await expect(born(page).locator(`.mb-pop-flag-img + a[href="/area/${NJ}"]`)).toHaveCount(1, QUEUE);
}

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

test.describe('the windows\' area links keep still (own flags, More Flags Everywhere skips them)', () => {
    test('More Flags Everywhere finds nothing to do, and a repaint moves no area link in any frame', async ({ page }) => {
        await open(page, { mfe: true });
        await pinArtist(page);
        await page.waitForTimeout(200);
        await expect(dialog(page).locator('.mfe-stub'), 'the other script left the window alone').toHaveCount(0);
        // A segment click repaints the whole window; sample the chain's last
        // link (re-found each frame: the repaint replaces it) for 400 ms.
        const xs = await page.evaluate(async () => {
            const sel = '#mb-dp-dialog .mb-dp-area h4 + .mb-dp-kv dt';
            const last = () => {
                const dt = Array.from(document.querySelectorAll(sel)).find(d => d.textContent === 'Born');
                const links = dt ? dt.nextElementSibling.querySelectorAll('a[href^="/area/"]') : [];
                return links.length ? Math.round(links[links.length - 1].getBoundingClientRect().left) : null;
            };
            const seen = [last()];
            document.querySelector('#mb-dp-dialog [data-mb-tbl-act="seg"][data-mb-tbl-v="single"]').click();
            const t0 = performance.now();
            while (performance.now() - t0 < 400) {
                await new Promise(r => requestAnimationFrame(r));
                seen.push(last());
            }
            return seen;
        });
        expect(new Set(xs), `"United States" stays at one x in every frame: ${xs.join(',')}`).toEqual(new Set([xs[0]]));
        await expect(dialog(page).locator('.mfe-stub')).toHaveCount(0);
    });

    test('a state\'s flag is its Wikidata item\'s P41: asked only after Space, once, then kept', async ({ page }) => {
        const log = await open(page);
        await ctrlHover(page, artistLink(page));
        await expect(card(page).locator('.mb-tt-foot')).toBeVisible(QUEUE);
        expect(flagLookups(log), 'a hover asks for no flag').toEqual([]);
        expect(await wdLog(page), 'a hover asks Wikidata nothing').toEqual([]);
        await page.keyboard.press('Space');
        await expect(born(page)).toHaveText('1949-09-23 · Long Branch, New Jersey, United States', QUEUE);
        const img = born(page).locator(`.mb-pop-flag-img + a[href="/area/${NJ}"]`);
        await expect(img).toHaveCount(1, QUEUE);
        await expect(born(page).locator('.mb-pop-flag-img img')).toHaveAttribute('src',
            'https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_New_Jersey.svg?width=32');
        // The slot is the same size whatever fills it.
        const sizes = await born(page).locator('.mb-pop-flag').evaluateAll(els => els.map(e => {
            const r = e.getBoundingClientRect();
            return `${Math.round(r.width)}x${Math.round(r.height)}`;
        }));
        expect(sizes).toEqual(['16x11', '16x11']);
        expect(flagLookups(log)).toHaveLength(1);
        expect(await wdLog(page)).toEqual([P41]);
        // Closed and opened again: nothing asked again.
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await pinArtist(page);
        expect(flagLookups(log)).toHaveLength(1);
        expect(await wdLog(page)).toEqual([P41]);
    });

    test('a country: MusicBrainz\'s own flag, its ISO code in a box elsewhere; a state\'s slot while it loads; a city none', async ({ page }) => {
        await open(page);
        const html = (area, onMb) => page.evaluate(([a, m]) => window.__saTest.mbPopFlagHtml(a, m), [area, onMb]);
        const us = { id: '489ce91b-6658-3307-9877-795b68554c98', name: 'United States', type: 'Country', 'iso-3166-1-codes': ['US'] };
        expect(await html(us, true)).toBe('<span class="flag flag-US mb-pop-flag" role="img" aria-label="United States"></span>');
        expect(await html(us, false)).toBe('<span class="mb-pop-flag mb-pop-flag-iso" aria-hidden="true">US</span>');
        // The artist's own area has no type: its ISO code says "country".
        expect(await html({ id: us.id, name: 'United States', 'iso-3166-1-codes': ['US'] }, false)).toContain('>US<');
        expect(await html({ id: NJ, name: 'New Jersey', type: 'Subdivision', 'iso-3166-2-codes': ['US-NJ'] }, true))
            .toBe('<span class="mb-pop-flag mb-pop-flag-wait" aria-hidden="true"></span>');
        // An artist's own area has no type either: an ISO 3166-2 code says "state".
        expect(await html({ id: NJ, name: 'New Jersey', type: null, 'iso-3166-2-codes': ['US-NJ'] }, true)).toContain('mb-pop-flag-wait');
        expect(await html({ id: 'bb0af2e9-6ae0-4c4f-b729-c8d6444d6380', name: 'Long Branch', type: 'City' }, true)).toBe('');
        expect(await html({ id: 'bb0af2e9-6ae0-4c4f-b729-c8d6444d6380', name: 'Long Branch', type: null }, true)).toBe('');
    });
});
