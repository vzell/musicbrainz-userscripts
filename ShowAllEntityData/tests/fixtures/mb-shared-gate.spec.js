'use strict';

// The shared cross-tab MusicBrainz request gate: `mbu:mb-gate`, protocol
// version 1 (majkinetor's dev/net/mb-gate.mjs, ported as `_mbGate*`;
// docs/claude/fetch-and-render-pipeline.md, "The shared MusicBrainz request
// gate (mbu:mb-gate v1)").
//
// ── What each test pins, and the neighbouring property it would also catch ──
//
//  1. HONOURS SOMEONE ELSE'S HOLD. A `cool` another script wrote delays OUR
//     request until it passes — measured on the intercepted request's own
//     timestamp, through the real click path (`_relLoadRow()` →
//     `_relFetchWs2()` → `_ws2GetJson()` → `_mbGateFetch()`). The control
//     arm (no seed) proves the delay is the hold's, not the harness's.
//  2. REPORTS OUR THROTTLE, KEEPING WHAT IT DOES NOT KNOW. A 503 writes
//     `version: 1`, `hot: 1` and a `cool` in the future, and the field a
//     newer writer added survives; the clean answer after it takes `hot` back
//     to 0. "Something was written" would also pass a writer that drops
//     fields, so the unknown field is asserted by value.
//  3. REFUSES AN UNKNOWN VERSION WITHOUT WRITING. The stored string is
//     byte-identical after a 503 + 200 cycle, and the request still goes out
//     (on the per-tab pacing alone).
//  4. A LEAD HOLDS BACKGROUND, NOT FOREGROUND. Through the shipping
//     `_mbGateSlot()` (`__saTest.mbGate.slot`): no background request of
//     this script is reachable in a test in reasonable time (the expanded
//     Relationships queue costs 1.1 s a row), so the hook is the way in.
//  5. CROSS-TAB. Two pages of one browser context book eight slots between
//     them; after the burst of three, every start is ≥ ~1 s after the one
//     before, whichever page booked it. This is the guarantee itself: one
//     page alone would pass with a per-page gate.
//  6. OFF AND FOREIGN. With `sa_mb_shared_gate` off nothing is written; on
//     discogs.com the gate is not active at all (another origin's storage).
//  7. THE FORMULAS. Episode stepping, the 30 s quiet reset, the 60 s cap,
//     `Retry-After: 0` → a 1 s floor, the HTTP-date form — through the
//     shipping `_mbGateAnswer()`, by seeding the stored schedule.
//
// Network-free: every `**/ws/2/**` request is intercepted (`route.fulfill`).
// Timestamps on the Node side are `performance.now()` (WSL2 steps the wall
// clock; DEBUG-NOTES.md, 2026-10-14). In the page, the schedule is in
// `Date.now()` by protocol, so the seeds are too.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const KEY = 'mbu:mb-gate';

// "Bruce Springsteen Studio Collection" — 12 releases, `tableMode: 'single'`
// (the shell ws2-transient-classifier.spec.js uses).
const SERIES = {
    url: 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908',
    shell: path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html'),
    showAllLabel: 'Show all Releases for Series',
    urlGlob: 'https://musicbrainz.org/series/**',
};

/** One url-rel, so a loaded cell has exactly one icon. */
const OK_BODY = JSON.stringify({
    relations: [{ 'target-type': 'url', type: 'discogs', url: { resource: 'https://www.discogs.com/release/1' } }],
});

/**
 * Loads the series shell with the Relationships column COLLAPSED (nothing is
 * requested until a cell is clicked) and routes every WS/2 request through
 * `respond(url)` → `{status, headers}` (falsy: 200 with `OK_BODY`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {?function(string): ?{status?: number, headers?: Object<string, string>}} respond
 * @param {Object<string, *>} [settings]
 * @returns {Promise<Array<{url: string, at: number}>>} The live request log.
 */
async function loadRelPage(page, respond, settings = {}) {
    const ws2 = [];
    await loadUserscriptPage(page, {
        url: SERIES.url,
        fixtureFile: SERIES.shell,
        testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true,
            sa_rel_collapse_threshold: 2,
            sa_rel_browse_batch_enable: false,
            ...settings,
        },
    });
    await page.route('**/ws/2/**', async (route) => {
        const url = route.request().url();
        ws2.push({ url, at: performance.now() });
        const r = (respond && respond(url)) || {};
        try {
            if (r.status && r.status !== 200) {
                await route.fulfill({
                    status: r.status,
                    headers: { 'content-type': 'text/plain', ...(r.headers || {}) },
                    body: 'Service Unavailable',
                });
            } else {
                await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: OK_BODY });
            }
        } catch (_) { /* the page closed first */ }
    });
    await page.route(SERIES.urlGlob, (route) => route.fulfill({ path: SERIES.shell, contentType: 'text/html' }));
    await page.click(`button[data-label="${SERIES.showAllLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    expect(ws2, 'a collapsed column requests nothing at render').toHaveLength(0);
    return ws2;
}

/** @returns {Promise<string[]>} Rel-cell MBIDs in document order. */
const rowMbids = (page) => page.evaluate(() => Array.from(
    document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-mbid]')).map((td) => td.dataset.mbid));

/**
 * Clicks a rel cell at its right edge (the hover ⟳'s empty area), which loads
 * that one row (`_relLoadRow()`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} mbid
 * @returns {Promise<void>}
 */
async function clickCell(page, mbid) {
    const loc = page.locator(`table.tbl tbody td.mb-rel-cell[data-mbid="${mbid}"]`);
    const box = await loc.boundingBox();
    await loc.click({ position: { x: Math.max(1, box.width - 3), y: Math.floor(box.height / 2) } });
}

/** @returns {Promise<boolean>} Whether a rel cell finished loading. */
const cellDone = (page, mbid) => page.evaluate((m) => {
    const td = document.querySelector(`table.tbl tbody td.mb-rel-cell[data-mbid="${m}"]`);
    return !!td && td.dataset.relDone === '1';
}, mbid);

/** @returns {Promise<?string>} The raw stored schedule. */
const rawGate = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);

/**
 * Writes a schedule object, with `cool`/`leadUntil` given relative to the
 * page's clock (`coolIn`, `leadFor`, `coolAgo`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} s
 * @returns {Promise<void>}
 */
const seedGate = (page, s) => page.evaluate(([k, seed]) => {
    const now = Date.now();
    const o = { ...seed };
    if ('coolIn' in o) { o.cool = now + o.coolIn; delete o.coolIn; }
    if ('coolAgo' in o) { o.cool = now - o.coolAgo; delete o.coolAgo; }
    if ('leadFor' in o) { o.leadUntil = now + o.leadFor; delete o.leadFor; }
    localStorage.setItem(k, JSON.stringify(o));
}, [KEY, s]);

test.describe('shared MusicBrainz request gate (mbu:mb-gate v1)', () => {

    test('a hold another script wrote delays our request until it passes', async ({ page }) => {
        const ws2 = await loadRelPage(page, null);
        const [first, second] = (await rowMbids(page)).slice(2, 4);

        // Control: no hold → the click's request goes out at once.
        let t0 = performance.now();
        await clickCell(page, first);
        await expect.poll(() => cellDone(page, first)).toBe(true);
        const fast = ws2.find((h) => h.url.includes(first)).at - t0;
        expect(fast, 'without a hold the request starts promptly').toBeLessThan(900);

        // Another script saw a 503: everyone holds 3 s.
        // Past our own per-tab slot (1100 ms), so only the shared hold can delay the next one.
        await expect.poll(() => page.evaluate(() => window.__saTest.mbRateSlotWaitMs())).toBe(0);
        await seedGate(page, { version: 1, tat: 0, coolIn: 3000, hot: 1, lead: '', leadUntil: 0 });
        t0 = performance.now();
        await clickCell(page, second);
        await expect.poll(() => cellDone(page, second), { timeout: 10000 }).toBe(true);
        const held = ws2.find((h) => h.url.includes(second)).at - t0;
        expect(held, 'the request waits out the shared hold').toBeGreaterThan(2700);
        expect(held, 'and no longer than it').toBeLessThan(4500);
    });

    test('our 503 is reported: version 1, hot, cool — unknown fields kept; a clean answer cools hot', async ({ page }) => {
        let target = null;
        let seen = 0;
        await loadRelPage(page, (url) => {
            if (!target || !url.includes(target)) return null;
            seen += 1;
            return seen === 1 ? { status: 503, headers: { 'Retry-After': '0' } } : null;
        });
        target = (await rowMbids(page))[3];
        await seedGate(page, { tat: 0, cool: 0, hot: 0, fromNewerWriter: 'keep me' }); // no version = legacy 1

        await clickCell(page, target);
        await expect.poll(() => seen).toBeGreaterThanOrEqual(1);
        // Right after the 503 the hold is written (before the retry is sent).
        await expect.poll(async () => JSON.parse(await rawGate(page)).hot).toBe(1);
        const after503 = JSON.parse(await rawGate(page));
        expect(after503.version, 'the writer stamps version 1').toBe(1);
        expect(after503.fromNewerWriter, 'an unknown field survives our write').toBe('keep me');
        expect(after503.cool, 'a hold of at least the 1 s floor').toBeGreaterThan(await page.evaluate(() => Date.now()));

        await expect.poll(() => cellDone(page, target), { timeout: 10000 }).toBe(true);
        expect(seen, 'the 503 was retried once').toBe(2);
        const end = JSON.parse(await rawGate(page));
        expect(end.hot, 'the clean answer takes one step of hot back').toBe(0);
        expect(end.fromNewerWriter).toBe('keep me');
        expect(await page.evaluate(() => window.__saTest.mbGate.stats().holds)).toBe(1);
    });

    test('an unknown protocol version is left byte-identical and the request still goes out', async ({ page }) => {
        let target = null;
        let seen = 0;
        await loadRelPage(page, (url) => {
            if (!target || !url.includes(target)) return null;
            seen += 1;
            return seen === 1 ? { status: 503 } : null;
        });
        target = (await rowMbids(page))[3];
        const seeded = JSON.stringify({ version: 2, slots: [1, 2, 3], tat: 0, cool: 0 });
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, seeded]);

        await clickCell(page, target);
        await expect.poll(() => cellDone(page, target), { timeout: 10000 }).toBe(true);
        expect(seen, 'requested and retried on the per-tab pacing').toBe(2);
        expect(await rawGate(page), 'never written').toBe(seeded);
        expect(await page.evaluate(() => window.__saTest.mbGate.refused())).toBe(2);
        expect(await page.evaluate(() => window.__saTest.mbGate.active()), 'left for the session').toBe(false);
    });

    test("another script's lead holds a background request, not a foreground one", async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: 'eh-page-draw', leadFor: 2500 });

        const fg = await page.evaluate(async () => {
            const t = performance.now();
            const r = await window.__saTest.mbGate.slot({ background: false });
            return { ok: r.ok, ms: performance.now() - t };
        });
        expect(fg.ok).toBe(true);
        expect(fg.ms, 'foreground does not wait for the lead').toBeLessThan(500);

        const bg = await page.evaluate(async () => {
            const t = performance.now();
            const r = await window.__saTest.mbGate.slot({ background: true });
            return { ok: r.ok, shared: r.shared, ms: performance.now() - t };
        });
        expect(bg.ok && bg.shared).toBe(true);
        expect(bg.ms, 'background waits until the lead lapses').toBeGreaterThan(1800);
        expect(bg.ms).toBeLessThan(4000);

        // A cancel lands while waiting: no slot is used.
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: 'eh-page-draw', leadFor: 5000 });
        const cancelled = await page.evaluate(async () => {
            const t0 = performance.now();
            const r = await window.__saTest.mbGate.slot({ background: true, cancelled: () => performance.now() - t0 > 600 });
            return { ok: r.ok, ms: performance.now() - t0 };
        });
        expect(cancelled.ok).toBe(false);
        expect(cancelled.ms).toBeLessThan(1500);
    });

    test('two tabs share one schedule: after the burst, one start a second across both', async ({ page }) => {
        await loadRelPage(page, null);
        const page2 = await page.context().newPage();
        await loadRelPage(page2, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: '', leadUntil: 0 });

        const book = (p) => p.evaluate(() => Promise.all([0, 1, 2, 3].map(() =>
            window.__saTest.mbGate.slot({ background: true }).then(() => Date.now()))));
        const [a, b] = await Promise.all([book(page), book(page2)]);
        const starts = [...a, ...b].sort((x, y) => x - y);
        expect(starts).toHaveLength(8);
        const gaps = starts.slice(1).map((t, i) => t - starts[i]);
        // Slots 1–3 are the burst (back to back); every later one is ≥ GAP after its predecessor.
        expect(gaps[0], 'burst: the 2nd start follows the 1st at once').toBeLessThan(400);
        expect(gaps[1], 'burst: the 3rd start follows the 2nd at once').toBeLessThan(400);
        gaps.slice(2).forEach((g, i) => expect(g, `gap after start ${i + 3}`).toBeGreaterThan(900));
        expect(starts[7] - starts[0], 'eight starts span ~5 s, not ~0').toBeGreaterThan(4500);
        const both = [a.length, b.length];
        expect(both).toEqual([4, 4]);
        await page2.close();
    });

    test('a hold that appears while a request queues still applies', async ({ page }) => {
        await loadRelPage(page, null);
        // The schedule is busy: a background booking now gets at = tat − 2000 ≈ now + 1000.
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: '', leadUntil: 0 });
        await page.evaluate(() => {
            const s = JSON.parse(localStorage.getItem('mbu:mb-gate'));
            s.tat = Date.now() + 3000;
            localStorage.setItem('mbu:mb-gate', JSON.stringify(s));
        });
        const ms = await page.evaluate(async () => {
            const t = performance.now();
            const p = window.__saTest.mbGate.slot({ background: true });
            // 300 ms later, another script gets a 503 and holds everyone 2.5 s.
            setTimeout(() => {
                const s = JSON.parse(localStorage.getItem('mbu:mb-gate'));
                s.cool = Date.now() + 2500;
                localStorage.setItem('mbu:mb-gate', JSON.stringify(s));
            }, 300);
            await p;
            return performance.now() - t;
        });
        expect(ms, 'booked for ~1 s, held to ~2.8 s by the new hold').toBeGreaterThan(2400);
        expect(ms).toBeLessThan(4000);
    });

    test('foreground books at once in a busy schedule; background queues behind it', async ({ page }) => {
        await loadRelPage(page, null);
        const timed = (bg) => page.evaluate(async (b) => {
            const s = { version: 1, tat: Date.now() + 5000, cool: 0, hot: 0, lead: '', leadUntil: 0 };
            localStorage.setItem('mbu:mb-gate', JSON.stringify(s));
            const t = performance.now();
            await window.__saTest.mbGate.slot({ background: b });
            return performance.now() - t;
        }, bg);
        expect(await timed(false), 'foreground: max(now, cool)').toBeLessThan(500);
        const bg = await timed(true);
        expect(bg, 'background: tat − 2000 ≈ now + 3000').toBeGreaterThan(2600);
        expect(bg).toBeLessThan(4200);
    });

    test('switched off: nothing is booked or written', async ({ page }) => {
        await loadRelPage(page, null, { sa_mb_shared_gate: false });
        const target = (await rowMbids(page))[3];
        await clickCell(page, target);
        await expect.poll(() => cellDone(page, target)).toBe(true);
        expect(await rawGate(page)).toBeNull();
        expect(await page.evaluate(() => window.__saTest.mbGate.active())).toBe(false);
        expect(await page.evaluate(() => window.__saTest.mbGate.stats().booked)).toBe(0);
    });

    test('on another site (discogs.com) the gate is not active', async ({ page }) => {
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run',
            fixtureFile: path.join(__dirname, 'dg-master.html'),
            testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
        });
        await expect.poll(() => page.evaluate(() => !!window.__saTest)).toBe(true);
        expect(await page.evaluate(() => window.__saTest.mbGate.active())).toBe(false);
        expect(await page.evaluate(() => window.__saTest.mbGate.slot().then(r => r.shared))).toBe(false);
        expect(await rawGate(page)).toBeNull();
    });

    test('formulas: episodes, the quiet reset, the cap, the Retry-After floor and date form', async ({ page }) => {
        await loadRelPage(page, null);
        const hold = (status, ra) => page.evaluate(([s, r]) => window.__saTest.mbGate.answer(s, r), [status, ra]);
        const read = () => page.evaluate(() => window.__saTest.mbGate.read());

        // Retry-After: 0 → the 1 s floor, hot 1.
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0 });
        let h = await hold(503, '0');
        expect(h).toBeGreaterThan(900);
        expect(h).toBeLessThanOrEqual(1000);
        expect((await read()).hot).toBe(1);

        // A second 503 inside the same hold is the same episode: hot stays 1.
        await hold(503, '0');
        expect((await read()).hot, 'one throttle, one step').toBe(1);

        // A throttle long gone (cool 31 s ago) resets hot before stepping.
        await seedGate(page, { version: 1, tat: 0, coolAgo: 31000, hot: 5 });
        await hold(429, null);
        expect((await read()).hot, 'reset after 30 s of quiet, then one step').toBe(1);

        // Inside the quiet window, a new episode steps up: hold = RA × hot.
        await seedGate(page, { version: 1, tat: 0, coolAgo: 1000, hot: 2 });
        h = await hold(503, '2');
        expect((await read()).hot).toBe(3);
        expect(h).toBeGreaterThan(5800);
        expect(h).toBeLessThanOrEqual(6000);

        // The cap: hot 6 × 30 s → 60 s, never more.
        await seedGate(page, { version: 1, tat: 0, coolAgo: 1000, hot: 6 });
        h = await hold(503, '30');
        expect((await read()).hot, 'hot is capped at 6').toBe(6);
        expect(h).toBeGreaterThan(59000);
        expect(h).toBeLessThanOrEqual(60000);

        // The HTTP-date form of Retry-After.
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0 });
        const date = await page.evaluate(() => new Date(Date.now() + 4000).toUTCString());
        h = await hold(503, date);
        expect(h).toBeGreaterThan(2500); // toUTCString drops the milliseconds
        expect(h).toBeLessThanOrEqual(4000);

        // A clean answer below 500 cools hot by one; a 502 changes nothing.
        await seedGate(page, { version: 1, tat: 0, coolIn: 500, hot: 3 });
        await hold(200, null);
        expect((await read()).hot).toBe(2);
        await hold(502, null);
        expect((await read()).hot, '502/504 are a local retry only').toBe(2);
    });
});
