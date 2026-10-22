'use strict';

// The entity's picture in the MusicBrainz link previews (docs/claude/sidebar.md
// part 4, `_mbPopImageLoad()`): what musicbrainz-server's CommonsImage role
// would answer if its Commons switch were on — an `image`/`logo` relationship
// to a Commons file, else the Wikidata item's P18/P154 — asked in the browser,
// only when Space opens the window.
//
// Pins, in order:
//   1. a hover asks Wikidata nothing and shows no picture — a place's card
//      too, although its own lookup already carries the Wikidata link;
//   2. Space: one `wbgetclaims`, the window shows the picture (a deprecated
//      value skipped), a click opens the viewer with "Open on Commons", Esc
//      gives focus back to it;
//   3. afterwards the CARD shows it, with no request; after a reload too,
//      from IndexedDB, with no request;
//   4. a Commons relationship gives the picture with no Wikidata request;
//   5. an artist without P18 asks P154 next; a label asks P154 FIRST;
//   6. "no picture" is kept: after a reload a second Space asks nothing;
//   7. a failure says so, and "Try again" asks again;
//   8. `sa_pop_mb_image` off: no request, no picture.
//
// Every Wikidata request is a stubbed GM_xmlhttpRequest (`window.__gmXhrResponses`,
// logged in `window.__gmXhrLog`); the Web Service answers are the popup-mb
// captures; Commons' images are a local PNG. Nothing reaches the network.
// Mutation list: scripts/mutations/sidebar-overhaul.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../support/loadPage');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f';
const LABEL = '011d1192-6f65-45bd-85c4-0400dd45693e';
const PLACE = '6a59a67c-fcc5-491f-949c-bfc45bc97463';   // The Stone Pony: its card lookup has url-rels
const WD = (item, prop) => `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${item}&property=${prop}`;
const JSON_HEADERS = 'Content-Type: application/json; charset=utf-8';

/**
 * A `wbgetclaims` answer for one property.
 * @param {string} prop
 * @param {Array<[string, string]>} values - [rank, file] pairs.
 * @returns {{status: number, responseHeaders: string, responseText: string}}
 */
const claims = (prop, values) => ({
    status: 200, responseHeaders: JSON_HEADERS,
    responseText: JSON.stringify({ claims: values.length ? { [prop]: values.map(([rank, file]) => ({
        mainsnak: { snaktype: 'value', property: prop, datavalue: { value: file, type: 'string' } }, type: 'statement', rank,
    })) } : {} }),
});

/**
 * A url-rels capture with the Commons `image`/`logo` relationships left out,
 * so only its Wikidata link remains.
 * @param {string} file
 * @returns {string}
 */
const withoutCommons = (file) => {
    const d = JSON.parse(json(file));
    d.relations = d.relations.filter(r => r.type !== 'image' && r.type !== 'logo');
    return JSON.stringify(d);
};

/**
 * Loads the release-group page (its tables link the artist and the label),
 * with every Web Service request answered: the artist's and the label's
 * captures (`pins` replaces a url-rels answer), anything else 404.
 * Wikidata answers come from `responses`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{settings?: Object, responses?: Object, pins?: {artist?: string, label?: string, place?: string}}} [opts]
 * @returns {Promise<{ws2: string[]}>}
 */
async function open(page, { settings = {}, responses = {}, pins = {} } = {}) {
    const log = { ws2: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await ctx.route(/^https:\/\/(?:commons|upload)\.wikimedia\.org\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await ctx.route(/\/ws\/2\//, (route) => {
        const url = route.request().url();
        log.ws2.push(url);
        let body = null;
        if (/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=genres/.test(url)) body = json('ws2-pop-artist-bruce.json');
        else if (/\/ws\/2\/artist\/[0-9a-f-]{36}\?inc=url-rels/.test(url)) body = pins.artist || json('ws2-pop-artist-bruce-pin.json');
        else if (/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=genres/.test(url)) body = json('ws2-pop-label-columbia.json');
        else if (/\/ws\/2\/label\/[0-9a-f-]{36}\?inc=url-rels/.test(url)) body = pins.label || json('ws2-pop-label-columbia-pin.json');
        else if (/\/ws\/2\/release\?label=/.test(url)) body = json('ws2-pop-label-columbia-count.json');
        else if (/\/ws\/2\/place\/[0-9a-f-]{36}\?/.test(url)) body = pins.place || json('ws2-pop-place-sp.json');
        return route.fulfill(body ? { status: 200, contentType: 'application/json', body }
            : { status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' });
    });
    await ctx.addInitScript((r) => { window.__gmXhrResponses = r; }, responses);
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_pop_mb: true, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.route('https://musicbrainz.org/release-group/**', (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Re-runs the userscript on a reload (routes and init scripts live on the
 * context; IndexedDB survives).
 * @param {import('@playwright/test').Page} page
 */
async function reloadScript(page) {
    await page.reload();
    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await expect(page.locator('#mb-show-all-controls-container')).toBeVisible({ timeout: 30000 });
    await page.mouse.move(0, 0);
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
const labelLink = (page) => page.locator(`table.tbl tbody a[href="/label/${LABEL}"]`).first();
const card = (page) => page.locator('#mb-dp-peek');
const dialog = (page) => page.locator('#mb-dp-dialog');
const winPic = (page) => dialog(page).locator('.mb-pop-xpic');
/** The Wikidata requests this page load made (the GM stub's log). */
const wdLog = (page) => page.evaluate(() => (window.__gmXhrLog || []).map(r => r.url).filter(u => u.includes('wikidata.org')));

// The Web Service's one-a-second gate: an artist window queues about nine
// lookups (its links, five release-group counts, the area chain), and a
// later card or a ⟳ waits behind them.
const QUEUE = { timeout: 25000 };

/**
 * Opens the window on a link: hover, wait for the card, Space.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function pin(page, link) {
    await ctrlHover(page, link);
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

test.describe('the entity picture in the link previews (sa_pop_mb_image)', () => {
    test('a hover asks Wikidata nothing; Space asks once and the window shows the picture, which opens the viewer', async ({ page }) => {
        await open(page, {
            pins: { artist: withoutCommons('ws2-pop-artist-bruce-pin.json') },
            responses: { [WD('Q1225', 'P18')]: claims('P18', [['deprecated', 'Old photo.jpg'], ['normal', 'Bruce Springsteen 2025.jpg']]) },
        });
        await ctrlHover(page, artistLink(page));
        await expect(card(page).locator('.mb-tt-foot')).toBeVisible();
        await expect(card(page).locator('.mb-pop-pic')).toHaveCount(0);
        expect(await wdLog(page), 'a hover asks Wikidata nothing').toEqual([]);

        await page.keyboard.press('Space');
        await expect(winPic(page).locator('img')).toHaveAttribute('src',
            'https://commons.wikimedia.org/wiki/Special:FilePath/Bruce_Springsteen_2025.jpg?width=330');
        await expect(winPic(page).locator('figcaption')).toContainText('from Wikidata Q1225 (image)');
        expect(await wdLog(page)).toEqual([WD('Q1225', 'P18')]);
        expect(await page.evaluate(() => window.__gmXhrLog.find(r => r.url.includes('wikidata.org')).anonymous), 'anonymous').toBe(true);

        // Every request answered, so no repaint replaces the picture's link
        // while the viewer is open (focus goes back to that very element).
        await expect(dialog(page).locator('.mb-dp-spin')).toHaveCount(0, QUEUE);
        const link = winPic(page).locator('a[data-mb-artv-ext]');
        await link.click();
        const viewer = page.locator('#mb-art-viewer');
        await expect(viewer).toBeVisible();
        await expect(viewer.locator('[data-mb-artv-page]')).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Bruce_Springsteen_2025.jpg');
        // Off the window first: its scroll area takes the focus on mouseenter
        // (createInfoDialog()), which the closing overlay would fire under a
        // pointer still parked over the picture.
        await page.mouse.move(0, 0);
        await page.keyboard.press('Escape');
        await expect(viewer).toBeHidden();
        await expect(dialog(page)).toBeVisible();
        expect(await link.evaluate((a) => document.activeElement === a), 'focus back on the picture').toBe(true);
    });

    test('a place card asks Wikidata nothing, although its lookup carries the link; its window does', async ({ page }) => {
        await open(page, {
            pins: { artist: withoutCommons('ws2-pop-artist-bruce-pin.json'), place: withoutCommons('ws2-pop-place-sp.json') },
            responses: {
                [WD('Q1225', 'P18')]: claims('P18', [['normal', 'Bruce Springsteen 2025.jpg']]),
                [WD('Q3989486', 'P18')]: claims('P18', [['normal', 'Stone Pony.jpg']]),
            },
        });
        await page.evaluate((h) => {
            const a = document.createElement('a');
            a.href = h;
            a.className = 'pop-probe';
            a.textContent = 'The Stone Pony';
            document.querySelector('table.tbl tbody tr td:first-child').append(' ', a);
        }, `/place/${PLACE}`);
        const place = page.locator('a.pop-probe');
        await ctrlHover(page, place);
        await expect(card(page).locator('.mb-tt-title')).toHaveText('The Stone Pony');
        await expect(card(page).locator('.mb-pop-pic')).toHaveCount(0);
        // A request the card started would come before the artist's: the log
        // holds only the artist's once its picture is there.
        await pin(page, artistLink(page));
        await expect(winPic(page)).toBeVisible(QUEUE);
        expect(await wdLog(page)).toEqual([WD('Q1225', 'P18')]);
        await page.keyboard.press('Escape');

        await pin(page, place);
        await expect(winPic(page).locator('img')).toHaveAttribute('src', /Stone_Pony\.jpg/, QUEUE);
        expect(await wdLog(page)).toEqual([WD('Q1225', 'P18'), WD('Q3989486', 'P18')]);
    });

    test('after a Space the card shows the picture with no request, and after a reload from IndexedDB', async ({ page }) => {
        const log = await open(page, {
            pins: { artist: withoutCommons('ws2-pop-artist-bruce-pin.json') },
            responses: { [WD('Q1225', 'P18')]: claims('P18', [['normal', 'Bruce Springsteen 2025.jpg']]) },
        });
        await pin(page, artistLink(page));
        await expect(winPic(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toBeHidden();

        await ctrlHover(page, artistLink(page));
        const thumb = card(page).locator('.mb-pop-pic img');
        await expect(thumb).toHaveAttribute('src', /Special:FilePath\/Bruce_Springsteen_2025\.jpg\?width=330$/);
        await expect(card(page).locator('.mb-tt-foot')).toContainText('picture & more');
        expect(await wdLog(page)).toHaveLength(1);

        await reloadScript(page);
        const before = log.ws2.length;
        await ctrlHover(page, artistLink(page));
        await expect(card(page).locator('.mb-pop-pic img')).toHaveAttribute('src', /Bruce_Springsteen_2025\.jpg/);
        expect(await wdLog(page), 'from IndexedDB: no Wikidata request').toEqual([]);
        expect(log.ws2.slice(before).filter(u => u.includes('url-rels')), 'nor a url-rels lookup').toEqual([]);
    });

    test('a Commons image relationship gives the picture with no Wikidata request', async ({ page }) => {
        await open(page);
        await pin(page, artistLink(page));
        await expect(winPic(page).locator('img')).toHaveAttribute('src', /Special:FilePath\/Bruce_Springsteen_-_Roskilde_Festival_2012\.jpg\?width=330$/);
        await expect(winPic(page).locator('figcaption')).not.toContainText('Wikidata');
        expect(await wdLog(page)).toEqual([]);
    });

    test('an artist without an image asks for the logo next; a label asks for its logo first', async ({ page }) => {
        await open(page, {
            pins: { artist: withoutCommons('ws2-pop-artist-bruce-pin.json'), label: withoutCommons('ws2-pop-label-columbia-pin.json') },
            responses: {
                [WD('Q1225', 'P18')]: claims('P18', []),
                [WD('Q1225', 'P154')]: claims('P154', [['normal', 'Springsteen logo.svg']]),
                [WD('Q183387', 'P154')]: claims('P154', [['normal', 'Columbia Records Colored Logo.svg']]),
                [WD('Q183387', 'P18')]: claims('P18', [['normal', 'AWomansSmileCraigCampbell.jpg']]),
            },
        });
        await pin(page, artistLink(page));
        await expect(winPic(page).locator('img')).toHaveAttribute('src', /Springsteen_logo\.svg/);
        await expect(winPic(page).locator('figcaption')).toContainText('(logo)');
        expect(await wdLog(page)).toEqual([WD('Q1225', 'P18'), WD('Q1225', 'P154')]);
        await page.keyboard.press('Escape');

        await pin(page, labelLink(page));
        await expect(winPic(page).locator('img')).toHaveAttribute('src', /Columbia_Records_Colored_Logo\.svg/, QUEUE);
        expect((await wdLog(page)).slice(2), 'the label asked P154 only').toEqual([WD('Q183387', 'P154')]);
    });

    test('"no picture" is kept: after a reload a second Space asks Wikidata nothing', async ({ page }) => {
        await open(page, {
            pins: { artist: withoutCommons('ws2-pop-artist-bruce-pin.json') },
            responses: { [WD('Q1225', 'P18')]: claims('P18', []), [WD('Q1225', 'P154')]: claims('P154', []) },
        });
        await pin(page, artistLink(page));
        await expect.poll(() => wdLog(page)).toHaveLength(2);
        await expect(dialog(page).locator('.mb-pop-xpic-wait')).toHaveCount(0);
        await expect(winPic(page)).toHaveCount(0);
        await page.keyboard.press('Escape');

        await reloadScript(page);
        await pin(page, artistLink(page));
        await expect(dialog(page).locator('.mb-rg-links > div').first()).toBeVisible();
        await expect(winPic(page)).toHaveCount(0);
        expect(await wdLog(page)).toEqual([]);
    });

    test('a failure says so, and Try again asks again', async ({ page }) => {
        await open(page, {
            pins: { artist: withoutCommons('ws2-pop-artist-bruce-pin.json') },
            responses: { [WD('Q1225', 'P18')]: { status: 500, responseHeaders: JSON_HEADERS, responseText: '{}' } },
        });
        await pin(page, artistLink(page));
        const fail = dialog(page).locator('.mb-pop-xpic-fail');
        await expect(fail).toContainText('Could not ask Wikidata for a picture (the site answered HTTP 500)', QUEUE);
        await page.evaluate((u) => { window.__gmXhrResponses[u] = {
            status: 200, responseHeaders: 'Content-Type: application/json',
            responseText: JSON.stringify({ claims: { P18: [{ mainsnak: { datavalue: { value: 'Retry.jpg' } }, rank: 'normal' }] } }),
        }; }, WD('Q1225', 'P18'));
        await dialog(page).locator('.mb-dp-retry').first().click();
        await expect(winPic(page).locator('img')).toHaveAttribute('src', /Retry\.jpg/, QUEUE);
        expect((await wdLog(page)).filter(u => u === WD('Q1225', 'P18'))).toHaveLength(2);
    });

    test('switched off: no request and no picture', async ({ page }) => {
        await open(page, {
            settings: { sa_pop_mb_image: false },
            pins: { artist: withoutCommons('ws2-pop-artist-bruce-pin.json') },
            responses: { [WD('Q1225', 'P18')]: claims('P18', [['normal', 'Bruce Springsteen 2025.jpg']]) },
        });
        await pin(page, artistLink(page));
        await expect(dialog(page).locator('.mb-rg-links > div').first()).toBeVisible();
        await expect(winPic(page)).toHaveCount(0);
        expect(await wdLog(page)).toEqual([]);
    });
});
