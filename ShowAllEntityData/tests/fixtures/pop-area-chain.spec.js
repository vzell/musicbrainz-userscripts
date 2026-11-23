'use strict';

// An area's chain in ONE request (2026-11-23, idea: majkinetor's Event
// Horizon, `areaChain()`; org/majkinetor.org "Entity pictures"): a window
// asks the website's `/ws/js/entity/<id>` for the whole line MusicBrainz
// names above an area (City, Subdivision, Country), where it used to climb
// one `/ws/2/area/<id>?inc=area-rels` lookup per level
// (`_mbPopChainRecordFor()`, `_mbPopAreaChainLoad()`; docs/claude/
// detail-pages.md "An area is named in its area chain").
//
// Pins, in order:
//   1. the artist window's "Born" line comes from exactly one /ws/js request
//      and NO area-rels lookup (the request count, not only the text: the
//      climb gives the same text);
//   2. a /ws/js answer that fails, is not JSON or is another area: the
//      climb, same line (the fallback);
//   3. the window opened again asks nothing; a hover card asks no chain;
//   4. New Jersey, named by the record, still gets its P41 flag.
//
// /ws/js is answered by a page route registered after the load (it beats
// loadPage's default 404). The Web Service answers are the popup-mb captures;
// ws-js-area-bb0af2e9.json is the live answer of 2026-11-23 (petri).
// Mutation list: scripts/mutations/area-chain.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f';
const LONG_BRANCH = 'bb0af2e9-6ae0-4c4f-b729-c8d6444d6380';
const NJ = 'a36544c1-cb40-4f44-9e0e-7a5a69e403a8';
const NJ_ITEM = 'Q1408';
const P41 = `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${NJ_ITEM}&property=P41`;
const AREA_RELS = {
    [LONG_BRANCH]: 'ws2-pop-area-bb0af2e9.json',
    '604b7841-36b7-4bea-9bdc-7eeb52520e35': 'ws2-pop-area-monmouth.json',
    [NJ]: 'ws2-pop-area-nj.json',
};
const BORN = '1949-09-23 · Long Branch, New Jersey, United States';

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
 * What /ws/js/entity answers, by mode.
 * @param {string} mode - 'serve' | 'fail' | 'html' | 'other'.
 * @returns {Object} A `route.fulfill()` argument.
 */
const wsJsAnswer = (mode) => {
    if (mode === 'serve') return { status: 200, contentType: 'application/json', body: json('ws-js-area-bb0af2e9.json') };
    if (mode === 'html') return { status: 200, contentType: 'text/html',
        body: '<!doctype html><html><head><title>Verifying your browser</title></head><body></body></html>' };
    if (mode === 'other') {
        const d = JSON.parse(json('ws-js-area-bb0af2e9.json'));
        d.gid = NJ;
        return { status: 200, contentType: 'application/json', body: JSON.stringify(d) };
    }
    if (mode === 'self') {
        const d = JSON.parse(json('ws-js-area-bb0af2e9.json'));
        d.containment.unshift({ gid: d.gid, name: d.name, typeID: 3, iso_3166_1_codes: [], iso_3166_2_codes: [] });
        return { status: 200, contentType: 'application/json', body: JSON.stringify(d) };
    }
    return { status: 503, contentType: 'application/json', body: '{"error":"down"}' };
};

/**
 * Loads the release-group page (its tables link the artist) with the
 * artist's captures, the area-rels climb, New Jersey's url-rels and
 * Wikidata's P41 answered, and /ws/js answered as `mode` says.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} mode - See `wsJsAnswer()`.
 * @returns {Promise<{ws2: string[], wsjs: string[], flagcdn: string[]}>}
 */
async function open(page, mode) {
    const log = { ws2: [], wsjs: [], flagcdn: [] };
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
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, {
        [P41]: { status: 200, responseHeaders: 'Content-Type: application/json; charset=utf-8',
            responseText: JSON.stringify({ claims: { P41: [{ mainsnak: { snaktype: 'value', property: 'P41',
                datavalue: { value: 'Flag of New Jersey.svg', type: 'string' } }, type: 'statement', rank: 'normal' }] } }) },
    });
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_pop_mb: true, sa_rich_tooltip_delay_ms: 0 },
    });
    await page.route(/^https:\/\/musicbrainz\.org\/ws\/js\//, (route) => {
        log.wsjs.push(route.request().url());
        return route.fulfill(wsJsAnswer(mode));
    });
    await page.route('https://flagcdn.com/**', (route) => {
        log.flagcdn.push(route.request().url());
        // Germany's flag fails (a site's content policy, no network); every other one loads.
        return route.fulfill(/\/de\.png$/.test(route.request().url()) ? { status: 404, body: '' }
            : { status: 200, contentType: 'image/png', body: PNG });
    });
    await page.mouse.move(0, 0);
    return log;
}

/**
 * A Long Branch link, added to the first cell of the first table.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function longBranchLink(page) {
    await page.evaluate((href) => {
        const td = document.querySelector('table.tbl tbody tr td:first-child');
        const a = document.createElement('a');
        a.href = href;
        a.className = 'pop-probe';
        a.textContent = 'Long Branch';
        td.append(' ', a);
    }, `/area/${LONG_BRANCH}`);
    return page.locator(`a.pop-probe[href="/area/${LONG_BRANCH}"]`);
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
const areaRels = (log) => log.ws2.filter(u => /\/ws\/2\/area\/[0-9a-f-]{36}\?inc=area-rels&/.test(u))
    .map(u => u.match(/area\/([0-9a-f-]{36})/)[1]);
// The artist window queues about nine lookups at one a second.
const QUEUE = { timeout: 25000 };

/**
 * Hovers the artist, waits for the card, presses Space.
 * @param {import('@playwright/test').Page} page
 */
async function pinArtist(page) {
    await ctrlHover(page, artistLink(page));
    await expect(card(page).locator('.mb-tt-foot')).toBeVisible(QUEUE);
    await page.keyboard.press('Space');
    await expect(dialog(page)).toBeVisible();
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

test.describe('an area\'s chain in one request (/ws/js/entity), the Web Service climb as the fallback', () => {
    test('the "Born" line: one /ws/js request, no area-rels lookup; a hover asks no chain; opened again asks nothing', async ({ page }) => {
        const log = await open(page, 'serve');
        await ctrlHover(page, artistLink(page));
        await expect(card(page).locator('.mb-tt-foot')).toBeVisible(QUEUE);
        expect(log.wsjs, 'a hover card asks no chain').toEqual([]);
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        await expect(born(page)).toHaveText(BORN, QUEUE);
        expect(log.wsjs).toEqual([`https://musicbrainz.org/ws/js/entity/${LONG_BRANCH}`]);
        expect(areaRels(log), 'no step of the climb').toEqual([]);
        // New Jersey, named by the record, still gets its flag (P41).
        await expect(born(page).locator(`.mb-pop-flag-img + a[href="/area/${NJ}"]`)).toHaveCount(1, QUEUE);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await pinArtist(page);
        await expect(born(page)).toHaveText(BORN, QUEUE);
        expect(log.wsjs, 'the record is kept').toHaveLength(1);
        expect(areaRels(log)).toEqual([]);
    });

    for (const [mode, what] of [['fail', 'a 503'], ['html', 'the browser check (HTML)'], ['other', 'another area']]) {
        test(`/ws/js answering ${what}: the climb, same line, the record asked once`, async ({ page }) => {
            const log = await open(page, mode);
            await pinArtist(page);
            await expect(born(page)).toHaveText(BORN, QUEUE);
            expect(log.wsjs, 'one try, no retry').toEqual([`https://musicbrainz.org/ws/js/entity/${LONG_BRANCH}`]);
            expect(areaRels(log)).toEqual([LONG_BRANCH, '604b7841-36b7-4bea-9bdc-7eeb52520e35', NJ]);
        });
    }

    test('a record that lists the area itself: it is named once', async ({ page }) => {
        const log = await open(page, 'self');
        await pinArtist(page);
        await expect(born(page)).toHaveText(BORN, QUEUE);
        expect(areaRels(log)).toEqual([]);
    });

    test('a record seeds the line\'s own areas: New Jersey\'s chain is known without a request', async ({ page }) => {
        await open(page, 'serve');
        await pinArtist(page);
        await expect(born(page)).toHaveText(BORN, QUEUE);
        const text = await page.evaluate((nj) => window.__saTest.mbPopAreaChainText(
            { id: nj, name: 'New Jersey', type: 'Subdivision', 'iso-3166-2-codes': ['US-NJ'] }), NJ);
        expect(text).toBe('New Jersey, United States');
    });
});

test.describe('the area window\'s "Part of", and country flags off musicbrainz.org (mockup CCkfRzZFpFGchmBDdMsxzm)', () => {
    test('"Part of" is the first fact, the line above the area from one /ws/js request; the card names it once known', async ({ page }) => {
        const log = await open(page, 'serve');
        const link = await longBranchLink(page);
        await ctrlHover(page, link);
        const cardPartOf = card(page).locator('dt:text-is("Part of") + dd');
        await expect(cardPartOf, 'the card: the parent its own lookup names').toHaveText('Monmouth County', QUEUE);
        expect(log.wsjs, 'a hover card asks no chain').toEqual([]);
        await page.keyboard.press('Space');
        await expect(dialog(page)).toBeVisible();
        const partOf = facts(page).locator('dt:text-is("Part of") + dd');
        await expect(partOf).toHaveText('New Jersey, United States', QUEUE);
        await expect(facts(page).locator('dt').first()).toHaveText('Part of');
        expect(log.wsjs, 'the record of the area itself').toEqual([`https://musicbrainz.org/ws/js/entity/${LONG_BRANCH}`]);
        expect(areaRels(log), 'only the card\'s own lookup').toEqual([LONG_BRANCH]);
        // musicbrainz.org: MusicBrainz's own country flag, New Jersey's P41, nothing from flagcdn.com.
        await expect(partOf.locator('span.flag-US.mb-pop-flag[data-hq-skip="true"]')).toHaveCount(1);
        await expect(partOf.locator(`.mb-pop-flag-img + a[href="/area/${NJ}"]`)).toHaveCount(1, QUEUE);
        expect(log.flagcdn, 'no flagcdn.com request on musicbrainz.org').toEqual([]);
        // Lotheric's Right Side / More Flags Everywhere find nothing to do in the Facts:
        // their processFlags() and img selectors, and insertFlags()'s unstamped area links.
        const hits = await facts(page).evaluate(el => [
            el.querySelectorAll('.flag:not([data-hq-processed]):not([data-hq-skip])').length,
            el.querySelectorAll('img[src*="/flags/"]:not([data-hq-processed]):not([data-hq-skip])').length,
            Array.from(el.querySelectorAll('a[href*="/area/"]')).filter(a => !a.dataset.flagProcessed).length,
        ]);
        expect(hits).toEqual([0, 0, 0]);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        await ctrlHover(page, link);
        await expect(cardPartOf, 'the card: the whole line, now in memory').toHaveText('New Jersey, United States', QUEUE);
        expect(log.wsjs).toHaveLength(1);
    });

    test('off musicbrainz.org: a country\'s flagcdn.com image; XE keeps its box; a failed image becomes its box and stays one', async ({ page }) => {
        const log = await open(page, 'serve');
        const html = (a) => page.evaluate((x) => window.__saTest.mbPopFlagHtml(x, false), a);
        const country = (code, name) => ({ id: code, name, type: 'Country', 'iso-3166-1-codes': [code] });
        expect(await html(country('US', 'United States'))).toBe(
            '<span class="mb-pop-flag mb-pop-flag-img" role="img" aria-label="United States">' +
            '<img class="mb-pop-flag-cdn" data-mb-code="US" src="https://flagcdn.com/w40/us.png" alt="" ' +
            'referrerpolicy="no-referrer" decoding="async"></span>');
        expect(await html(country('XE', 'Europe'))).toBe('<span class="mb-pop-flag mb-pop-flag-iso" aria-hidden="true">XE</span>');
        expect(await html(country('XW', '[Worldwide]'))).toContain('>XW<');
        expect(await html(country('XK', 'Kosovo')), 'flagcdn has Kosovo').toContain('/w40/xk.png');
        // Into the page: the US image loads and stays, Germany's fails and turns into its box.
        const [us, de] = [await html(country('US', 'United States')), await html(country('DE', 'Germany'))];
        await page.evaluate((h) => {
            const d = document.createElement('div');
            d.id = 'cdn-probe';
            d.innerHTML = h;
            document.body.appendChild(d);
        }, us + de);
        const slots = page.locator('#cdn-probe > span');
        await expect(slots.nth(1)).toHaveClass('mb-pop-flag mb-pop-flag-iso');
        await expect(slots.nth(1)).toHaveText('DE');
        await expect(slots.nth(0).locator('img.mb-pop-flag-cdn')).toHaveCount(1);
        expect(log.flagcdn.sort()).toEqual(['https://flagcdn.com/w40/de.png', 'https://flagcdn.com/w40/us.png']);
        expect(await html(country('DE', 'Germany')), 'remembered: a repaint asks no more').toBe(
            '<span class="mb-pop-flag mb-pop-flag-iso" aria-hidden="true">DE</span>');
    });
});
