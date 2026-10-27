'use strict';

// Entity-history presets (vzell, 2026-10-26; mockup
// https://claude.ai/artifact/QS8dxD8FRYib8nZ6wSimqD): the window's
// "✎ Editing history ▾" and the ☰ SAED menu's "Editing history" group list
// predefined edit searches on one entity — All edits, Own edits, Edits by
// others, Open edits, Open edits by others, jesus2099's COOL_SEARCH_LINKS
// variants, the Annotation history — and each opens in the window.
//
// Pins, each named in its test (the uppercase tag):
//   LOGGEDOUT  the rows that need a session (me / not_me) are left out; the
//              rest wait for the entity's search, then fill in;
//   OTHERS     "Edits by others" asks /search/edits with the entity's own
//              condition (its row id and name, from its /edits page's
//              "Refine this search") plus `editor not_me`; the window is
//              titled after the preset; the /edits page is read once;
//   J2         jesus2099's Relationship edits: the negated form (or, 1, !=)
//              with the edit types and every link type; Post-NGS is not
//              negated and adds `open_time > 2011-05-16`;
//   NOVOTE     "Edits I have not voted on": `voter = <me>` with the reader's
//              editor id from their own history's search, args=no;
//   EDITOR     an editor's window has the ✎ button but no ▾;
//   SAED       the SAED menu's group on an entity page: Entity history ▸ and
//              Annotation history; a preset from it opens the window.
//
// Fixtures: tests/fixtures/edits-page-*.html (see popup-mb-edits.spec.js).

const path = require('path');
const fs = require('fs');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { openToolbarMenu } = require('../support/toolbarMenu');

const RG_URL = 'https://musicbrainz.org/release-group/c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const RG_PAGE = 'c497fc44-ddaf-3cce-a9b4-bfec958a0f3c';
const FIXTURE = path.join(__dirname, 'releasegroup-releases-multirow-catalog.html');
const REC = 'de571208-2c6d-4dc6-9efa-c16405c904f9';
const REC_ROW_ID = '522482';          // its "Refine this search": conditions.0.args.0
const MY_ID = '1126444';              // vzell, from edits-page-user-vzell.html
const json = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const PAGES = [
    [new RegExp(`/recording/${REC}/edits$`), 'edits-page-recording.html'],
    [new RegExp(`/release-group/${RG_PAGE}/edits$`), 'edits-page-rg.html'],
    [new RegExp(`/release-group/${RG_PAGE}/open_edits$`), 'edits-page-rg.html'],
    [/\/user\/vzell\/edits$/, 'edits-page-user-vzell.html'],
    [/\/user\/vzell$/, 'user-page-vzell.html'],
    // Every preset search: any edits page will do, the spec reads the URL.
    [/\/search\/edits\?/, 'edits-page-recording.html'],
];
const WS2 = [
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-credits\+isrcs/, 'ws2-pop-recording-thunder.json'],
    [/\/ws\/2\/recording\/[0-9a-f-]{36}\?inc=artist-rels/, 'ws2-pop-recording-thunder-pin.json'],
    [/\/ws\/2\/release\?recording=/, 'ws2-pop-recording-thunder-count.json'],
];
const dialog = (page) => page.locator('#mb-dp-dialog');
const title = (page) => dialog(page).locator(':scope > div > span').first();
const histBtn = (page) => dialog(page).locator('button.mb-meh-hist-btn');
const histMore = (page) => dialog(page).locator('button.mb-meh-hist-more');
const pop = (page) => page.locator('#mb-dp-hist-pop');

/**
 * Loads the release-group page with the MusicBrainz cards on, answers the
 * Web Service and the pages, and logs every page request.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{loggedIn?: boolean}} [opts] - `loggedIn` adds MusicBrainz's header account menu for vzell.
 * @returns {Promise<{html: string[]}>}
 */
async function open(page, { loggedIn = false } = {}) {
    const log = { html: [] };
    const ctx = page.context();
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route(/\/ws\/2\//, (route) => {
        const hit = WS2.find(([re]) => re.test(route.request().url()));
        return route.fulfill(hit ? { status: 200, contentType: 'application/json', body: json(hit[1]) }
            : { status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' });
    });
    await ctx.route(/^https:\/\/musicbrainz\.org\/(recording|release-group|user|search)\//, (route) => {
        const url = route.request().url();
        if (url === RG_URL) return route.fulfill({ path: FIXTURE, contentType: 'text/html' });
        log.html.push(url.replace('https://musicbrainz.org', ''));
        const hit = (PAGES.find(([re]) => re.test(url)) || [])[1];
        if (!hit) return route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>no fixture</body></html>' });
        return route.fulfill({ path: path.join(__dirname, hit), contentType: 'text/html' });
    });
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_rich_tooltip_delay_ms: 0, sa_pop_mb: true },
    });
    if (loggedIn) {
        await page.evaluate(() => {
            const li = document.createElement('li');
            li.className = 'account';
            li.innerHTML = '<span class="menu-header">vzell ▾</span><ul><li><a href="/user/vzell">Profile</a></li></ul>';
            (document.querySelector('#header') || document.body).prepend(li);
        });
    }
    await page.mouse.move(0, 0);
    return log;
}

/**
 * Adds a link to the table's first cell and pins its card into the window.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} href
 * @param {string} text
 * @returns {Promise<void>}
 */
async function pinLink(page, href, text) {
    await page.evaluate(([h, x]) => {
        const a = document.createElement('a');
        a.href = h;
        a.className = 'pop-probe';
        a.textContent = x;
        document.querySelector('table.tbl tbody tr td:first-child').append(' ', a);
    }, [href, text]);
    const el = page.locator(`a.pop-probe[href="${href}"]`);
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await el.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(dialog(page)).toBeVisible();
}

/**
 * The preset rows of a list: key → {enabled, label}.
 *
 * @param {import('@playwright/test').Locator} list
 * @returns {Promise<Object<string, {enabled: boolean, label: string}>>}
 */
const presetRows = (list) => list.evaluate((el) => Object.fromEntries(Array.from(el.querySelectorAll('button.mb-hist-row'))
    .map((b) => [b.dataset.mbHist, { enabled: !b.disabled, label: b.querySelector('.mb-hist-l').textContent }])));

/**
 * A logged request's query as name → values.
 *
 * @param {string} url - A path with its query.
 * @returns {Object<string, string[]>}
 */
const query = (url) => {
    const out = {};
    new URL(url, 'https://musicbrainz.org').searchParams.forEach((v, k) => { (out[k] = out[k] || []).push(v); });
    return out;
};

/**
 * Waits for the n-th logged edit search (1-based) and returns it: a preset's
 * request leaves after the MusicBrainz rate slot, not with the click.
 *
 * @param {{html: string[]}} log
 * @param {number} n
 * @returns {Promise<string>}
 */
async function nthSearch(log, n) {
    const all = () => log.html.filter((u) => u.startsWith('/search/edits?'));
    await expect.poll(() => all().length, { timeout: 15000, message: `edit search #${n} asked` }).toBeGreaterThanOrEqual(n);
    return all()[n - 1];
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

test.describe('entity-history presets (window ▾ and the SAED menu)', () => {
    test('LOGGEDOUT: no me/not_me rows; the others wait for the entity\'s search, then fill in', async ({ page }) => {
        await open(page);
        await pinLink(page, `/recording/${REC}`, 'She’s a Runaway');
        await expect(histMore(page)).toBeVisible();
        await histMore(page).click();
        await expect(pop(page)).toBeVisible();
        await expect.poll(async () => (await presetRows(pop(page)))['j2-effective']?.enabled).toBe(true);
        const rows = await presetRows(pop(page));
        expect(Object.keys(rows)).toEqual(['all', 'open', 'j2-only', 'j2-pure', 'j2-rel', 'j2-post', 'j2-pre', 'j2-effective', 'annot']);
        expect(Object.values(rows).filter((r) => !r.enabled)).toEqual([]);
        expect(rows['j2-only'].label).toBe('Only this recording\'s edits');
    });

    test('OTHERS: the entity\'s own condition plus editor not_me; titled after the preset; /edits read once', async ({ page }) => {
        const log = await open(page, { loggedIn: true });
        await pinLink(page, `/recording/${REC}`, 'She’s a Runaway');
        await histMore(page).click();
        await expect.poll(async () => (await presetRows(pop(page))).others?.enabled).toBe(true);
        expect(Object.keys(await presetRows(pop(page)))).toEqual(expect.arrayContaining(['own', 'others', 'open-others', 'j2-novote']));
        await pop(page).locator('button[data-mb-hist="others"]').click();
        await expect(pop(page)).toHaveCount(0);
        await expect(title(page)).toHaveText('Recording › Edits by others');
        const q = query(await nthSearch(log, 1));
        expect(q['conditions.0.field']).toEqual(['recording']);
        expect(q['conditions.0.args.0']).toEqual([REC_ROW_ID]);
        expect(q['conditions.1.field']).toEqual(['editor']);
        expect(q['conditions.1.operator']).toEqual(['not_me']);
        expect(q.form_only, 'the search runs, not its form').toBeUndefined();
        expect(log.html.filter((u) => u === `/recording/${REC}/edits`), 'the /edits page once').toHaveLength(1);
        // Back, then All edits: the same page, from memory.
        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '← Back' }).click();
        await histBtn(page).click();
        await expect(title(page)).toHaveText('Recording › Editing history');
        expect(log.html.filter((u) => u === `/recording/${REC}/edits`), 'All edits asks nothing more').toHaveLength(1);
    });

    test('J2: Relationship edits in the negated form with every link type; Post-NGS plain with open_time', async ({ page }) => {
        const log = await open(page);
        await pinLink(page, `/recording/${REC}`, 'She’s a Runaway');
        await histMore(page).click();
        await expect.poll(async () => (await presetRows(pop(page)))['j2-rel']?.enabled).toBe(true);
        await pop(page).locator('button[data-mb-hist="j2-rel"]').click();
        await expect(title(page)).toHaveText('Recording › Relationship edits');
        let q = query(await nthSearch(log, 1));
        expect([q.combinator, q.negation]).toEqual([['or'], ['1']]);
        expect(q['conditions.0.operator']).toEqual(['!=']);
        expect(q['conditions.1.field']).toEqual(['type']);
        expect(q['conditions.1.args']).toEqual(['90', '233', '91', '234', '92', '235', '99']);
        expect(q['conditions.2.field']).toEqual(['link_type']);
        expect(q['conditions.2.operator']).toEqual(['!=']);
        expect(q['conditions.2.args'].length, 'jesus2099\'s recording link types').toBeGreaterThan(100);

        await dialog(page).locator('button.mb-dp-tbtn', { hasText: '← Back' }).click();
        await histMore(page).click();
        await pop(page).locator('button[data-mb-hist="j2-post"]').click();
        await expect(title(page)).toHaveText('Recording › Post-NGS');
        q = query(await nthSearch(log, 2));
        expect([q.combinator, q.negation]).toEqual([['and'], ['0']]);
        expect(q['conditions.3.field']).toEqual(['open_time']);
        expect(q['conditions.3.operator']).toEqual(['>']);
        expect(q['conditions.3.args.0']).toEqual(['2011-05-16']);
    });

    test('NOVOTE: voter = me with the reader\'s editor id, args=no, and editor not_me', async ({ page }) => {
        const log = await open(page, { loggedIn: true });
        await pinLink(page, `/recording/${REC}`, 'She’s a Runaway');
        await histMore(page).click();
        // The row waits for TWO pages (the recording's /edits, then the
        // editor's own), both behind the window's Web Service requests in
        // the 1.1 s gate: 4.7–5.2 s after the click on NB-3641 (2026-10-27,
        // 20 runs), so the poll's 5 s default failed about one run in three.
        await expect.poll(async () => (await presetRows(pop(page)))['j2-novote']?.enabled, { timeout: 15000 }).toBe(true);
        expect(log.html).toContain('/user/vzell/edits');
        await pop(page).locator('button[data-mb-hist="j2-novote"]').click();
        const q = query(await nthSearch(log, 1));
        expect(q['conditions.1.field']).toEqual(['editor']);
        expect(q['conditions.1.operator']).toEqual(['not_me']);
        expect(q['conditions.2.field']).toEqual(['voter']);
        expect(q['conditions.2.voter_id']).toEqual([MY_ID]);
        expect(q['conditions.2.name']).toEqual(['vzell']);
        expect(q['conditions.2.args']).toEqual(['no']);
    });

    test('EDITOR: an editor\'s window has ✎ but no ▾', async ({ page }) => {
        await open(page);
        await pinLink(page, '/user/vzell', 'vzell');
        await expect(histBtn(page)).toBeVisible();
        await expect(histMore(page)).toBeHidden();
    });

    test('SAED: Editing history group on an entity page; a preset from it opens the window', async ({ page }) => {
        const log = await open(page);
        expect(await openToolbarMenu(page, 'saed')).toBe(true);
        await expect(page.locator('.mb-saed-group[data-mb-group="hist"]')).toBeVisible();
        await expect(page.locator('#mb-saed-annot-btn')).toBeVisible();
        expect(await openToolbarMenu(page, 'saed-hist')).toBe(true);
        const panel = page.locator('#mb-saed-hist-sub-panel');
        await expect.poll(async () => (await presetRows(panel))['j2-effective']?.enabled).toBe(true);
        expect(Object.keys(await presetRows(panel))).toEqual(
            ['all', 'open', 'j2-only', 'j2-pure', 'j2-rel', 'j2-post', 'j2-pre', 'j2-effective', 'annot']);
        await panel.locator('button[data-mb-hist="open"]').click();
        await expect(dialog(page)).toBeVisible();
        await expect(title(page)).toContainText('Open edits');
        await expect.poll(() => log.html, { timeout: 15000 }).toContain(`/release-group/${RG_PAGE}/open_edits`);
    });
});
