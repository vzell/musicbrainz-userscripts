'use strict';

// org/brucebase.org, Phase 15 — a Brucebase page's History section in its
// window on OTHER sites. The probes (2026-11-12): Wikidot checks only that
// the body's wikidot_token7 equals the cookie sent with it, a made-up one
// and no session included (scripts/probe-bb-history-token.py), and
// Tampermonkey 5.5.1 delivers a Cookie header on an anonymous
// GM_xmlhttpRequest from musicbrainz.org
// (scripts/probe-bb-history-xorigin.user.js,
// debug/bb-history-xorigin-probe-20261112.json).
//
// Pinned, on musicbrainz.org (an event's annotation link) and on
// springsteenlyrics.com: the Springsteen sites' reader's window of a
// Brucebase page has the closed History section, nothing asked before it
// opens; opening it asks the same modules as on the wiki (the list, the
// comparison, the two sources), each an anonymous GM POST to the wiki with
// a Cookie header whose token equals the body's, one token for the page
// load, never a cookie set on this site, never a same-origin fetch; ✎ in
// the title bar and H open the section; a token refusal says the request
// was not accepted from this site; the setting off: no section, no ✎, no
// request.
//
// Answers: the page is tests/fixtures/bb-history-song-the-promise.html
// (its page id is in its script), the modules' answers
// tests/fixtures/bb-history/ (as bb-history.spec.js), all through the GM
// stub's responder.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadSlListPage } = require('../support/slFixture');
const { BB_HISTORY_DIR } = require('../support/bbFixture');

const BB_PAGE = 'https://brucebase.wikidot.com/song:the-promise';
const AJAX = 'https://brucebase.wikidot.com/ajax-module-connector.php';
const PAGE_HTML = fs.readFileSync(path.join(__dirname, 'bb-history-song-the-promise.html'), 'utf8');
const URL_EVENT = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const EVENT_FIXTURE = path.join(__dirname, 'event-overview.html');
const R47 = '1543144729';
const R46 = '1543144715';

const dialog = (page) => page.locator('#mb-dp-dialog');
const histSec = (page) => dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="History"]');
const rows = (page) => histSec(page).locator('.mb-bbh-e');

/**
 * Answers every GM request of the test from the fixtures and records the
 * module POSTs (`window.__bbPosts`: module, its key fields, the body's
 * token, the Cookie header, anonymous, method). `refuse` answers the
 * revision list with Wikidot's token refusal.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{refuse?: boolean}} [opts]
 * @returns {Promise<void>}
 */
async function answerGm(page, { refuse = false } = {}) {
    const files = {};
    for (const f of fs.readdirSync(BB_HISTORY_DIR)) files[f] = fs.readFileSync(path.join(BB_HISTORY_DIR, f), 'utf8');
    await page.context().addInitScript(({ html, files, page, ajax, refuse }) => {
        window.__bbPosts = [];
        window.__gmXhrResponses = { [page]: { status: 200, responseHeaders: 'Content-Type: text/html; charset=utf-8', responseText: html } };
        window.__gmXhrResponder = (opts) => {
            if (opts.url !== ajax) return undefined;
            const p = new URLSearchParams(opts.data || '');
            const module = p.get('moduleName') || '';
            window.__bbPosts.push({
                module: module.replace('history/', ''),
                key: p.get('revision_id') || (p.get('from_revision_id') ? `${p.get('from_revision_id')}-${p.get('to_revision_id')}` : `p${p.get('page')}`),
                token: p.get('wikidot_token7') || '',
                cookie: (opts.headers || {}).Cookie || '',
                anonymous: opts.anonymous === true,
                method: opts.method || 'GET',
            });
            const json = (o) => ({ status: 200, responseHeaders: 'Content-Type: application/json', responseText: JSON.stringify(o) });
            if (module === 'history/PageRevisionListModule') {
                if (refuse) return json({ status: 'wrong_token7', message: 'no' });
                return { status: 200, responseText: files[`list-p${p.get('page')}.json`] };
            }
            const name = module === 'history/PageSourceModule' ? `source-${p.get('revision_id')}.json`
                : module === 'history/PageDiffModule' ? `compare-${p.get('from_revision_id')}-${p.get('to_revision_id')}.json` : '';
            return files[name] ? { status: 200, responseText: files[name] } : json({ status: 'not_ok', message: 'no such fixture' });
        };
    }, { html: PAGE_HTML, files, page: BB_PAGE, ajax: AJAX, refuse });
}

/**
 * Loads a MusicBrainz event page (no render) with a link to the Brucebase
 * page at the top of its annotation; the wiki itself is never reachable
 * by a page fetch.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 * @returns {Promise<{bbFetches: string[]}>} Requests the PAGE made to the wiki (none expected).
 */
async function loadOnMb(page, settings = {}) {
    const bbFetches = [];
    const ctx = page.context();
    await ctx.route(/^https?:\/\/(?:[^/]+\.)?(?:wikidot\.com|wdfiles\.com)\//, (route) => {
        bbFetches.push(route.request().url());
        return route.abort('blockedbyclient');
    });
    await ctx.route(/\/ws\/2\//, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' }));
    await ctx.route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await ctx.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await loadUserscriptPage(page, {
        url: URL_EVENT, fixtureFile: EVENT_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: false, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0, sa_pop_ext_favicons: false, ...settings },
    });
    await page.evaluate((h) => {
        const host = document.querySelector('.annotation .annotation-body') || document.querySelector('.annotation');
        const a = document.createElement('a');
        a.className = 'p15-probe';
        a.setAttribute('href', h);
        a.textContent = 'The Promise';
        host.insertBefore(a, host.firstChild);
    }, BB_PAGE);
    return { bbFetches };
}

/**
 * Opens the window of the probe link (Ctrl+hover, the card, Space).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sel The link's selector.
 * @returns {Promise<void>}
 */
async function openWindow(page, sel) {
    const link = page.locator(sel).first();
    await page.mouse.move(0, 0);
    await link.scrollIntoViewIfNeeded();
    await page.keyboard.down('Control');
    await link.hover();
    await page.keyboard.up('Control');
    await expect(page.locator('#mb-dp-peek .mb-tt-title').first()).toHaveText('The Promise', { timeout: 10000 });
    await page.keyboard.press('Space');
    await expect(dialog(page).locator('.mb-dp-xtitle')).toHaveText('The Promise');
}

/**
 * Waits out one slot of the window's request gate, so a request that should
 * not be made would have been made by now.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function quiet(page) {
    await page.evaluate(() => new Promise(r => setTimeout(r, 1300)));
}

const posts = (page) => page.evaluate(() => window.__bbPosts.slice());

let pageErrors;
test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message || e)));
});
test.afterEach(() => {
    expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

test.describe('Brucebase page history on other sites (Phase 15)', () => {
    test.describe.configure({ timeout: 30000 });

    test('on musicbrainz.org: the section, closed, nothing asked; opening it asks the wiki anonymously with a token of its own', async ({ page }) => {
        await answerGm(page);
        const { bbFetches } = await loadOnMb(page);
        await openWindow(page, 'a.p15-probe');
        await expect(histSec(page)).toHaveCount(1);
        await expect(histSec(page)).not.toHaveAttribute('open', '');
        await quiet(page);
        expect(await posts(page)).toEqual([]);

        await histSec(page).locator(':scope > summary').click();
        await expect(rows(page)).toHaveCount(20);
        await expect(histSec(page).locator(':scope > summary h4')).toHaveText('History (48)');
        await expect(rows(page).first().locator('.mb-bbh-n')).toHaveText('47');
        await expect(histSec(page).locator('.mb-bbh-pane .mb-bbh-ph b')).toHaveText(/^Revision 47 · against 46 · /);
        await expect(histSec(page).locator('.mb-bbh-l.mb-bbh-chg')).toHaveCount(2);
        await quiet(page);
        const p = await posts(page);
        // The same modules as on the wiki itself (bb-history.spec.js).
        expect(p.map(x => `${x.module} ${x.key}`).sort()).toEqual(['PageRevisionListModule p1', `PageDiffModule ${R46}-${R47}`,
            `PageSourceModule ${R46}`, `PageSourceModule ${R47}`].sort());
        // Each an anonymous POST whose Cookie header carries the body's token,
        // one token for the page load.
        const token = p[0].token;
        expect(token).toMatch(/^[0-9a-f]{8}$/);
        for (const x of p) {
            expect(x).toMatchObject({ method: 'POST', anonymous: true, token, cookie: `wikidot_token7=${token}` });
        }
        // Nothing set on this site, nothing fetched by the page itself.
        expect(await page.evaluate(() => document.cookie)).not.toContain('wikidot_token7');
        expect(bbFetches).toEqual([]);
    });

    test('on musicbrainz.org: ✎ in the title bar and H open the section', async ({ page }) => {
        await answerGm(page);
        await loadOnMb(page);
        await openWindow(page, 'a.p15-probe');
        const hist = dialog(page).locator('.mb-meh-hist-btn');
        await expect(hist).toBeVisible();
        await expect(hist).toHaveAttribute('title', /This page's history on Brucebase/);
        await page.keyboard.press('h');
        await expect(histSec(page)).toHaveAttribute('open', '');
        await expect(rows(page)).toHaveCount(20);
    });

    test('on musicbrainz.org: a token refusal says the request was not accepted from this site', async ({ page }) => {
        await answerGm(page, { refuse: true });
        await loadOnMb(page);
        await openWindow(page, 'a.p15-probe');
        await histSec(page).locator(':scope > summary').click();
        await expect(histSec(page).locator('.mb-dp-warn')).toHaveText('Brucebase did not accept the request from this site. ' +
            'The page\'s window on brucebase.wikidot.com shows its history.');
        await expect(histSec(page).locator('[data-mb-bbh-act="retry"]')).toHaveCount(0);
    });

    test('on musicbrainz.org with the setting off: no section, no ✎, no request', async ({ page }) => {
        await answerGm(page);
        await loadOnMb(page, { sa_bb_history: false });
        await openWindow(page, 'a.p15-probe');
        await expect(dialog(page)).toContainText('Credits');
        await expect(histSec(page)).toHaveCount(0);
        await expect(dialog(page).locator('.mb-meh-hist-btn')).toBeHidden();
        await page.keyboard.press('h');
        await quiet(page);
        expect(await posts(page)).toEqual([]);
    });

    test('on springsteenlyrics.com too: the section reads the history the same way', async ({ page }) => {
        await answerGm(page);
        await loadSlListPage(page, { kind: 'bootlegs', settingsOverride: { sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 } });
        await page.evaluate((h) => {
            const a = document.createElement('a');
            a.className = 'p15-probe';
            a.setAttribute('href', h);
            a.textContent = 'The Promise';
            const host = document.querySelector('.project-detail');
            host.insertBefore(a, host.firstChild);
        }, BB_PAGE);
        await openWindow(page, 'a.p15-probe');
        await histSec(page).locator(':scope > summary').click();
        await expect(rows(page)).toHaveCount(20);
        await quiet(page);
        const p = await posts(page);
        expect(p.map(x => x.module)).toContain('PageRevisionListModule');
        for (const x of p) expect(x).toMatchObject({ anonymous: true, cookie: `wikidot_token7=${x.token}` });
    });
});
