'use strict';

// An area's pictures in the MusicBrainz link previews and on its own page
// (feat/area-pictures; mockups https://claude.ai/artifact/C2YZCFYWfMndTv37pBRr2o
// part A and https://claude.ai/artifact/23mGArYVMW2bru1egjRDxR, approved
// 2026-11-23), after Event Horizon's areaImages() (majkinetor): the Wikidata
// locator map (P242) with the flag (P41) on its corner, then the flag, the
// coat of arms (P94), the seal (P158) and the image (P18).
//
// Pins, in order:
//   1. a hover asks Wikidata nothing; Space asks the url-rels once and the
//      five properties once each, IN ORDER; the window shows all five, the
//      map first with the flag as a badge, a caption naming the property,
//      and the links table under the facts;
//   2. afterwards the card shows the map with a 16 px flag and "+4", asking
//      nothing; after a reload too, from IndexedDB;
//   3. the badge only ever sits on a map: no map, the flag comes first and
//      has none; a map without a flag has none;
//   4. the area's own page shows the pictures beside the name only once a
//      window asked them, and asks nothing itself, before or after;
//   5. a Wikidata 429 pauses the requests and the window waits: the five
//      pictures still arrive, nothing fails;
//   6. pictures off: the links table still shows, Wikidata is not asked.
//
// Wikidata is the stubbed GM_xmlhttpRequest (`window.__gmXhrResponses`,
// `__gmXhrResponder`, logged in `window.__gmXhrLog`); the Web Service answers
// are the popup-mb captures; Commons' images are a local PNG.
// Mutation list: scripts/mutations/area-pictures.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
// The area page: the United States' overview, served at New Jersey's address
// (only the address, the heading and the sidebar matter to the heading).
const AREA_PAGE = path.join(__dirname, 'rel-area-overview.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const NJ = 'a36544c1-cb40-4f44-9e0e-7a5a69e403a8';
const NJ_URL = `https://musicbrainz.org/area/${NJ}`;
const ITEM = 'Q1408';
const PROPS = ['P242', 'P41', 'P94', 'P158', 'P18'];
const FILES = {
    P242: 'Map of New Jersey highlighting the state.svg',
    P41: 'Flag of New Jersey.svg',
    P94: 'Coat of arms of New Jersey.svg',
    P158: 'Seal of New Jersey.svg',
    P18: 'Jersey Shore 2019.jpg',
};
const WD = (prop) => `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${ITEM}&property=${prop}`;
const THUMB = (file) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=330`;

/**
 * A `wbgetclaims` answer naming `file` for `prop`, or none.
 * @param {string} prop
 * @param {?string} file
 * @returns {{status: number, responseHeaders: string, responseText: string}}
 */
const claims = (prop, file) => ({
    status: 200, responseHeaders: 'Content-Type: application/json; charset=utf-8',
    responseText: JSON.stringify({ claims: file ? { [prop]: [{ mainsnak: { snaktype: 'value', property: prop,
        datavalue: { value: file, type: 'string' } }, type: 'statement', rank: 'normal' }] } : {} }),
});

/**
 * Wikidata's answers for the five properties; `drop` names those it has none for.
 * @param {string[]} [drop]
 * @returns {Object<string, Object>}
 */
const answers = (drop = []) => Object.fromEntries(PROPS.map(p => [WD(p), claims(p, drop.includes(p) ? null : FILES[p])]));

/** New Jersey's url-rels: its capture with a Wikidata and a GeoNames link. */
const njUrlRels = () => {
    const d = JSON.parse(json('ws2-pop-area-nj.json'));
    d.relations = [
        { type: 'geonames', 'target-type': 'url', direction: 'forward', url: { id: 'u0', resource: 'http://sws.geonames.org/5101760/' } },
        { type: 'wikidata', 'target-type': 'url', direction: 'forward', url: { id: 'u1', resource: `https://www.wikidata.org/wiki/${ITEM}` } },
    ];
    return JSON.stringify(d);
};

/**
 * Loads the release-group page with a New Jersey link in its first table,
 * its area-rels and url-rels answered, Wikidata from `responses`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, responses?: Object, responder?: ?string}} [opts] - `responder`:
 *   the body of a `window.__gmXhrResponder(opts)` function, as text.
 * @returns {Promise<{ws2: string[]}>}
 */
async function open(page, { settings = {}, responses = answers(), responder = null } = {}) {
    const log = { ws2: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.route(/^https:\/\/(?:commons|upload)\.wikimedia\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route(/\/ws\/2\//, (route) => {
        const url = route.request().url();
        log.ws2.push(url);
        let body = null;
        if (url.includes(`/ws/2/area/${NJ}?inc=area-rels&`)) body = json('ws2-pop-area-nj.json');
        else if (url.includes(`/ws/2/area/${NJ}?inc=url-rels&`)) body = njUrlRels();
        return route.fulfill(body ? { status: 200, contentType: 'application/json', body }
            : { status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' });
    });
    await ctx.addInitScript(([r, fn]) => {
        window.__gmXhrResponses = r;
        if (fn) window.__gmXhrResponder = new Function('opts', fn);
    }, [responses, responder]);
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_pop_mb: true, sa_entity_images: true, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.route('https://musicbrainz.org/release-group/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.route(`${NJ_URL}*`, (route) => route.fulfill({ path: AREA_PAGE, contentType: 'text/html' }));
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Goes to `url` (or reloads) and runs the userscript again (routes and init
 * scripts live on the context; IndexedDB survives).
 * @param {import('@playwright/test').Page} page
 * @param {?string} [url]
 */
async function rerun(page, url = null) {
    if (url) await page.goto(url);
    else await page.reload();
    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await expect(page.locator('#mb-show-all-controls-container')).toBeVisible({ timeout: 30000 });
    await page.mouse.move(0, 0);
}

/**
 * The New Jersey link, added to the first cell of the first table.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function njLink(page) {
    await page.evaluate((href) => {
        const td = document.querySelector('table.tbl tbody tr td:first-child');
        const a = document.createElement('a');
        a.href = href;
        a.className = 'pop-probe';
        a.textContent = 'New Jersey';
        td.append(' ', a);
    }, `/area/${NJ}`);
    return page.locator(`a.pop-probe[href="/area/${NJ}"]`);
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

const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const win = (page) => dialog(page).locator('.mb-ei-win');
const wdLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.includes('wikidata.org')));
const urlRels = (log) => log.ws2.filter(u => u.includes(`/ws/2/area/${NJ}?inc=url-rels&`));
// Five Wikidata requests at one a second, after the url-rels.
const SLOW = { timeout: 20000 };

/**
 * Hovers the link, then opens its window and waits for its card first.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function pin(page, link) {
    await ctrlHover(page, link);
    await expect(card(page).locator('.mb-tt-foot')).toBeVisible(SLOW);
    await page.keyboard.press('Space');
    await expect(dialog(page)).toBeVisible();
}

/** The strip's pictures in order, by what each is. */
const strip = (page) => win(page).locator('.mb-ei-strip a').evaluateAll(as => as.map(a => a.getAttribute('aria-label')));

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

test.describe('an area\'s pictures: the locator map with its flag, then flag, arms, seal, image', () => {
    test('a hover asks nothing; Space asks the five in order and shows them, the map first with the flag; the links under the facts', async ({ page }) => {
        const log = await open(page);
        const link = await njLink(page);
        await ctrlHover(page, link);
        await expect(card(page).locator('.mb-tt-foot')).toBeVisible(SLOW);
        expect(await wdLog(page), 'a hover asks Wikidata nothing').toEqual([]);
        expect(urlRels(log), 'nor the url-rels').toEqual([]);
        await page.keyboard.press('Space');
        await expect(win(page)).toBeVisible(SLOW);
        await expect.poll(() => strip(page), SLOW).toEqual([
            'Picture 1: Wikidata P242 (locator map)', 'Picture 2: Wikidata P41 (flag)', 'Picture 3: Wikidata P94 (coat of arms)',
            'Picture 4: Wikidata P158 (seal)', 'Picture 5: Wikidata P18 (image)',
        ]);
        expect(await wdLog(page), 'each property once, in Event Horizon\'s order').toEqual(PROPS.map(WD));
        expect(urlRels(log)).toHaveLength(1);
        // The large picture is the map, with the flag on its corner.
        await expect(win(page).locator('a.mb-ei-big img.mb-dp-xcover')).toHaveAttribute('src', THUMB(FILES.P242));
        await expect(win(page).locator('a.mb-ei-big img.mb-ei-badge')).toHaveAttribute('src', THUMB(FILES.P41));
        await expect(win(page).locator('figcaption')).toContainText(`from Wikidata ${ITEM} (locator map)`);
        await expect(win(page).locator('.mb-ei-pos')).toHaveText('1 / 5');
        await expect(win(page).locator('.mb-ei-strip img.mb-ei-badge'), 'no badge in the strip').toHaveCount(0);
        // Another picture picked: no badge on it.
        await win(page).locator('.mb-ei-strip a[data-mb-ei-pick="2"]').click();
        await expect(win(page).locator('figcaption')).toContainText('(coat of arms)');
        await expect(win(page).locator('img.mb-ei-badge')).toHaveCount(0);
        // The links table, under the facts in the left column (the links mockup, A).
        const left = dialog(page).locator('.mb-dp-x > .mb-dp-col').first();
        await expect(left.locator('h4', { hasText: /^Links/ })).toHaveText('Links (2)');
        await expect(left.locator('[data-mb-tbl="links"] tbody tr')).toHaveCount(2);
        await expect(left.locator('[data-mb-tbl="links"]')).toContainText('wikidata.org');
        await expect(left.locator('[data-mb-tbl="links"]')).toContainText('/5101760/');
    });

    test('afterwards the card shows the map with a 16 px flag and +4, asking nothing; after a reload too', async ({ page }) => {
        const log = await open(page);
        await pin(page, await njLink(page));
        await expect.poll(() => strip(page), SLOW).toHaveLength(5);
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();
        const before = (await wdLog(page)).length;
        await ctrlHover(page, page.locator(`a.pop-probe[href="/area/${NJ}"]`));
        const pic = card(page).locator('.mb-pop-pic');
        await expect(pic.locator('img').first()).toHaveAttribute('src', THUMB(FILES.P242));
        await expect(pic.locator('img.mb-ei-badge')).toHaveAttribute('src', THUMB(FILES.P41));
        await expect(pic.locator('.mb-pop-pic-more')).toHaveText('+4');
        expect(Math.round((await pic.locator('img.mb-ei-badge').boundingBox()).width)).toBe(16);
        expect((await wdLog(page)).length, 'the card asked nothing').toBe(before);

        await rerun(page);
        const urlRelsBefore = urlRels(log).length;
        await ctrlHover(page, await njLink(page));
        await expect(card(page).locator('.mb-pop-pic img.mb-ei-badge')).toHaveAttribute('src', THUMB(FILES.P41));
        expect(await wdLog(page), 'from IndexedDB: Wikidata not asked').toEqual([]);
        expect(urlRels(log).length, 'nor the url-rels').toBe(urlRelsBefore);
    });

    test('the badge only ever sits on a map: no map, the flag first without one; a map without a flag, none', async ({ page }) => {
        await open(page, { responses: answers(['P242']) });
        await pin(page, await njLink(page));
        await expect.poll(() => strip(page), SLOW).toEqual([
            'Picture 1: Wikidata P41 (flag)', 'Picture 2: Wikidata P94 (coat of arms)', 'Picture 3: Wikidata P158 (seal)',
            'Picture 4: Wikidata P18 (image)',
        ]);
        await expect(win(page).locator('img.mb-dp-xcover')).toHaveAttribute('src', THUMB(FILES.P41));
        await expect(win(page).locator('img.mb-ei-badge')).toHaveCount(0);
    });

    test('a map without a flag has no badge', async ({ page }) => {
        await open(page, { responses: answers(['P41']) });
        await pin(page, await njLink(page));
        await expect.poll(() => strip(page), SLOW).toHaveLength(4);
        await expect(win(page).locator('img.mb-dp-xcover')).toHaveAttribute('src', THUMB(FILES.P242));
        await expect(win(page).locator('img.mb-ei-badge')).toHaveCount(0);
    });

    test('the area\'s own page shows them beside the name only once a window asked them, and asks nothing itself', async ({ page }) => {
        const log = await open(page);
        // Nothing known yet: nothing shown, nothing asked.
        await rerun(page, NJ_URL);
        await expect(page.locator('#sidebar')).toHaveAttribute('data-mb-ei', 'none', SLOW);
        await expect(page.locator('h1 .mb-ei-avatar')).toHaveCount(0);
        expect(await wdLog(page)).toEqual([]);
        expect(urlRels(log), 'the heading never looks the links up for an area').toEqual([]);
        // A window asks them (on the release-group page)...
        await rerun(page, RG_URL);
        await pin(page, await njLink(page));
        await expect.poll(() => strip(page), SLOW).toHaveLength(5);
        const asked = urlRels(log).length;
        // ...and the area page shows the map with its flag, asking nothing.
        await rerun(page, NJ_URL);
        await expect(page.locator('#sidebar')).toHaveAttribute('data-mb-ei', 'known', SLOW);
        const av = page.locator('h1 .mb-ei-avatar');
        await expect(av.locator('.mb-ei-clip img')).toHaveCount(5);
        await expect(av.locator('.mb-ei-clip img').first()).toHaveAttribute('src', THUMB(FILES.P242));
        await expect(av.locator('img.mb-ei-badge')).toHaveAttribute('src', THUMB(FILES.P41));
        await expect(av.locator('img.mb-ei-badge')).toBeVisible();
        expect(await wdLog(page)).toEqual([]);
        expect(urlRels(log).length).toBe(asked);
        // Stepped to the flag: the badge goes, and comes back on the map.
        // (The arrows show on hover; clicked directly, as a hover over a
        // 34 px box that fades its pictures is no steadier.)
        await av.locator('.mb-ei-next').evaluate(b => b.click());
        await expect(av).toHaveAttribute('data-mb-ei-i', '1');
        await expect(av.locator('img.mb-ei-badge')).toBeHidden();
        await av.locator('.mb-ei-prev').evaluate(b => b.click());
        await expect(av).toHaveAttribute('data-mb-ei-i', '0');
        await expect(av.locator('img.mb-ei-badge')).toBeVisible();
    });

    test('a Wikidata 429 pauses the requests and the window waits: all five arrive, nothing fails', async ({ page }) => {
        // The coat of arms is refused twice, with Retry-After: 1, then answered:
        // more than the one retry a host outside the shared gate gets.
        const ok = JSON.stringify(claims('P94', FILES.P94));
        const responder = `if (!/property=P94$/.test(opts.url)) return undefined;
            window.__wd429 = (window.__wd429 || 0) + 1;
            return window.__wd429 <= 2
                ? { status: 429, responseHeaders: 'Retry-After: 1\\r\\nContent-Type: text/plain', responseText: 'Too Many Requests' }
                : ${ok};`;
        const responses = answers();
        delete responses[WD('P94')];
        await open(page, { responses, responder });
        await page.evaluate(() => window.__saTest.setExtRateLimitPauseMs(300));
        await pin(page, await njLink(page));
        await expect.poll(() => strip(page), { timeout: 30000 }).toHaveLength(5);
        await expect(dialog(page).locator('.mb-pop-xpic-fail')).toHaveCount(0);
        expect((await wdLog(page)).filter(u => u === WD('P94')), 'the coat of arms asked again after each pause').toHaveLength(3);
    });

    test('pictures off: the links table still shows, Wikidata is not asked', async ({ page }) => {
        const log = await open(page, { settings: { sa_pop_mb_image: false } });
        await pin(page, await njLink(page));
        const left = dialog(page).locator('.mb-dp-x > .mb-dp-col').first();
        await expect(left.locator('[data-mb-tbl="links"] tbody tr')).toHaveCount(2, SLOW);
        expect(urlRels(log)).toHaveLength(1);
        await expect(dialog(page).locator('.mb-ei-win, .mb-pop-xpic-wait')).toHaveCount(0);
        expect(await wdLog(page)).toEqual([]);
    });
});
