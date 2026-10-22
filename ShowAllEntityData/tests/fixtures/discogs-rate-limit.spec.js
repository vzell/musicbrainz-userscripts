'use strict';

// discogs.com, 2026-10-19 (vzell: "HTTP 429 from Discogs" on dg-release and
// other Discogs pageTypes, debug/discogs-429.html; no token, 4+ Discogs tabs
// open): Discogs' API counts per IP (per token with one) over a moving
// minute, so
//   - the next request slot of api.discogs.com is shared by every tab, in GM
//     storage (`sa_ext_next_slot:api.discogs.com`);
//   - a 429, or `X-Discogs-Ratelimit-Remaining: 0`, pauses every tab's
//     requests for the minute (shortened here by
//     `__saTest.setExtRateLimitPauseMs()`), and the request is asked again
//     after it — up to four times in all; the run's status line says why
//     nothing moves.
// Before, a 429 was retried ONCE 1.5 s later, inside the same minute: it
// could never succeed. See docs/claude/discogs.md, "Discogs' request limit".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { seedGmValues } = require('../support/gmStubs');

const FX = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, `ext-${name}.json`), 'utf8'));
const MASTER_PAGE = 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run';
const MASTER_API = 'https://api.discogs.com/masters/26725';
const SLOT_KEY = 'sa_ext_next_slot:api.discogs.com';
// Longer than the 2.5 s spacing (no token), so a pause shows apart from it.
const PAUSE_MS = 4000;

/**
 * The master's answers, with `masters/26725` answered by a function: the
 * first `fails` asks get a 429, the rest the capture. Every API ask is
 * timed (`window.__apiAt`), and the answers may carry extra headers.
 *
 * @param {{fails?: number, headers?: string}} [opts]
 * @returns {{responses: Object, fails: number, headers: string}}
 */
function masterAnswers({ fails = 0, headers = '' } = {}) {
    const responses = {};
    for (const n of ['discogs-master', ...[1, 2, 3, 4].map(p => `discogs-master-versions-p${p}`)]) {
        const f = FX(n);
        responses[f.url] = { status: f.status, responseHeaders: `Content-Type: ${f.contentType}${headers ? `\r\n${headers}` : ''}`, responseText: f.body };
    }
    return { responses, fails, headers };
}

/**
 * Loads the master page fixture with the userscript, no token (vzell's
 * case), the pause shortened to `PAUSE_MS`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{fails?: number, headers?: string, seed?: Object}} [opts]
 * @returns {Promise<{errors: string[], logs: string[]}>}
 */
async function openMaster(page, { fails = 0, headers = '', seed = null } = {}) {
    const errors = [];
    const logs = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    page.on('console', (m) => logs.push(m.text()));
    await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
    if (seed) await seedGmValues(page, seed);
    const a = masterAnswers({ fails, headers });
    const master = a.responses[MASTER_API];
    delete a.responses[MASTER_API];
    await page.context().addInitScript(([r, m, n]) => {
        window.__gmXhrResponses = r;
        window.__apiAt = [];
        let asked = 0;
        window.__gmXhrResponder = (opts) => {
            if (opts.url !== 'https://api.discogs.com/masters/26725') return undefined;
            asked++;
            return asked <= n ? { status: 429, responseHeaders: 'Content-Type: application/json', responseText: '{"message": "You are making requests too quickly."}' } : m;
        };
        const orig = window.GM_xmlhttpRequest;
        Object.defineProperty(window, 'GM_xmlhttpRequest', {
            configurable: true,
            get() { return this.__gmXhrWrapped; },
            set(fn) {
                this.__gmXhrWrapped = function (opts) {
                    if (String(opts.url).startsWith('https://api.discogs.com/')) window.__apiAt.push({ url: opts.url, at: Date.now() });
                    return fn(opts);
                };
            },
        });
        if (orig) window.GM_xmlhttpRequest = orig;
    }, [a.responses, master, fails]);
    await loadUserscriptPage(page, {
        url: MASTER_PAGE, fixtureFile: path.join(__dirname, 'dg-master.html'), testMode: true,
        settingsOverride: { sa_enable_discogs: true, sa_pop_ext_discogs_token: '', sa_render_threshold: 100000 },
    });
    await page.evaluate((ms) => window.__saTest.setExtRateLimitPauseMs(ms), PAUSE_MS);
    return { errors, logs };
}

/**
 * Presses "Show all versions" and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function showVersions(page) {
    await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
}

const apiAt = (page) => page.evaluate(() => window.__apiAt.slice());

test.describe('discogs.com: Discogs\' request limit, shared by every tab (2026-10-19)', () => {
    test('three 429s in a row: each pauses, the fourth ask gets through, and every version renders', async ({ page }) => {
        // Pins: a 429 is waited out (the pause), not retried once inside
        // the same minute — three in a row still end in the whole list.
        test.setTimeout(90000);
        const { errors, logs } = await openMaster(page, { fails: 3 });
        await showVersions(page);
        const asks = (await apiAt(page)).filter(r => r.url === MASTER_API);
        expect(asks, 'the first ask and three more').toHaveLength(4);
        for (let i = 1; i < asks.length; i++) {
            expect(asks[i].at - asks[i - 1].at, `ask ${i + 1} waited the pause`).toBeGreaterThanOrEqual(PAUSE_MS - 50);
        }
        await expect(page.locator('#mb-dg-root table.tbl tbody > tr')).toHaveCount(387);
        expect(logs.some(t => /HTTP 429 — every tab pauses its requests/.test(t)), 'the pause is logged').toBe(true);
        expect(errors).toEqual([]);
    });

    test('four 429s: the page fails, said as a 429 — no endless retrying', async ({ page }) => {
        test.setTimeout(90000);
        const { logs } = await openMaster(page, { fails: 4 });
        await page.locator('#mb-dg-root button[data-label="Show all versions"]').click();
        await expect.poll(() => logs.some(t => /HTTP 429 from Discogs/.test(t)), { timeout: 30000 }).toBe(true);
        expect((await apiAt(page)).filter(r => r.url === MASTER_API)).toHaveLength(4);
    });

    test('another tab\'s reservation is honoured: the first ask waits for the shared slot, and ours is written back', async ({ page }) => {
        const at = Date.now() + 3000;
        await openMaster(page, { seed: { [SLOT_KEY]: at } });
        await showVersions(page);
        const asks = await apiAt(page);
        expect(asks[0].at, 'not before the other tab\'s slot').toBeGreaterThanOrEqual(at - 50);
        // Every ask of ours moved the shared slot on: the last one 2.5 s
        // (no token) after the last ask's SLOT. The slot is the time the ask
        // was scheduled for; the ask itself goes when its timer fires, which
        // is never earlier and, under a loaded suite, can be tens of ms later
        // (57 ms seen on NB-3641, 14 workers, 2026-10-20). So the stored slot
        // is at most 2.5 s past the measured ask, and only timer lateness
        // below that. 500 ms still tells both defects apart from it: a slot
        // not written back stays at the other tab's (~10 s before the last
        // ask), and one written without the spacing sits ~2.5 s short.
        const last = asks[asks.length - 1].at;
        const shared = await page.evaluate((k) => window.GM_getValue(k, 0), SLOT_KEY);
        expect(shared, 'never more than one spacing past the last ask').toBeLessThanOrEqual(last + 2500 + 5);
        expect(shared, 'one spacing past the last ask, less timer lateness').toBeGreaterThanOrEqual(last + 2500 - 500);
    });

    test('a slot far in the future (a clock gone wrong) is ignored, never blocks every tab', async ({ page }) => {
        await openMaster(page, { seed: { [SLOT_KEY]: Date.now() + 3600000 } });
        const t0 = Date.now();
        await showVersions(page);
        const asks = await apiAt(page);
        expect(asks[0].at - t0, 'asked at once').toBeLessThan(2000);
    });

    test('"X-Discogs-Ratelimit-Remaining: 0" pauses every tab before a 429 comes', async ({ page }) => {
        const { logs } = await openMaster(page, { headers: 'X-Discogs-Ratelimit-Remaining: 0' });
        await showVersions(page);
        const asks = await apiAt(page);
        expect(asks.length).toBeGreaterThan(1);
        for (let i = 1; i < asks.length; i++) {
            expect(asks[i].at - asks[i - 1].at, `ask ${i + 1} after the pause`).toBeGreaterThanOrEqual(PAUSE_MS - 50);
        }
        expect(logs.some(t => /no requests left this minute/.test(t))).toBe(true);
    });
});
