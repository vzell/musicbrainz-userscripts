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

/**
 * Puts a controllable clock into the page as `window.__clk`:
 * - `pass(ms)`: time passes: `Date.now()` AND `performance.now()` move on;
 * - `step(ms)`: the wall clock steps (an NTP or VM resync, WSL2's spikes):
 *   only `Date.now()` moves, the monotonic clock does not;
 * - `realPerf()`: the unpatched `performance.now()`, to measure with;
 * - `restore()`.
 * Since the gate counts its waits on `performance.now()` (feat/mb-gate-clock),
 * moving `Date.now()` alone no longer stands for time passing.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const installClock = (page) => page.evaluate(() => {
    const realNow = Date.now;
    const realPerfNow = performance.now.bind(performance);
    let wall = 0;
    let mono = 0;
    Date.now = () => realNow.call(Date) + wall;
    performance.now = () => realPerfNow() + mono;
    window.__clk = {
        pass: (ms) => { wall += ms; mono += ms; },
        step: (ms) => { wall += ms; },
        realPerf: realPerfNow,
        restore: () => { Date.now = realNow; delete performance.now; },
    };
});

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
        // The clock starts BEFORE the seed: the hold ends 3 s after the seed at the earliest,
        // so no load on the test machine can make the request look early.
        t0 = performance.now();
        await seedGate(page, { version: 1, tat: 0, coolIn: 3000, hot: 1, lead: '', leadUntil: 0 });
        await clickCell(page, second);
        await expect.poll(() => cellDone(page, second), { timeout: 10000 }).toBe(true);
        const held = ws2.find((h) => h.url.includes(second)).at - t0;
        expect(held, 'the request waits out the shared hold').toBeGreaterThan(2900);
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
        const coolBefore = (await read()).cool;
        await hold(502, null);
        expect((await read()).hot, '502/504 are a local retry only').toBe(2);
        expect((await read()).cool, 'and write no hold').toBe(coolBefore);
    });
});

// ── In line with upstream (dev/net/mb-gate.mjs at 0693aea; org/majkinetor.org,
//    "Bring SAED's request-gate port in line with upstream") ──
//
//  8. A STUCK LOCK. A `navigator.locks.request` that never settles, not even
//     on abort (some userscript bridges): the booking goes ahead unlocked
//     after ~3 s, and the grant that comes late books NOTHING a second time.
//     "It resolves" alone would pass a port that books twice, so `tat` is
//     asserted across the late grant.
//  9. A FAR-FUTURE HOLD IS READ AS AT MOST 60 s — at booking AND in the wait.
//     Asserted on the wait the gate announces and on the `tat` it books, then
//     cancelled (no 60 s wait). Capping only the wait (upstream's form) still
//     books `tat` ten minutes out and announces "600 s", so both are pinned.
// 10. A WAIT WAKES WITH THE PAGE'S TIMERS HELD BACK (#999). Every page
//     `setTimeout` is delayed 8 s; a 1 s hold must still end in ~1 s (the
//     worker's timer and animation frames wake it). Afterwards every waker
//     rests: the page observer is off and the worker stops ticking — the
//     property that keeps a render's DOM changes free of it.
// 11. THE JOB LOG HEARS A LONGER WAIT ONCE. When a hold appears that moves
//     the wait's end later, `onWait` is told again, with the reason; a wait
//     that does not move is told once.
// 12. THE LOCK HOLD (upstream's MBN_LOCK_HOLD since 5d4d464, 2026-11-23).
//     The lock is kept 30 ms after a write, so the write reaches other tabs
//     before the next holder reads; the caller is answered at once. Pinned
//     both ways: the lock is still held when the write has answered, and a
//     second write right after the first waits ≥ ~30 ms. Two real tabs
//     booking one slot cannot be reproduced here (Playwright's pages share
//     one storage process), so the hold itself is what is asserted.

test.describe('shared request gate: aligned with upstream (lock race, sleep, hold cap)', () => {

    test('a lock that never settles: unlocked after ~3 s, and its late grant books nothing', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: '', leadUntil: 0 });
        const r = await page.evaluate(async () => {
            window.__lockCbs = [];
            const real = navigator.locks.request;
            // A bridge that takes the request and never answers, abort or not.
            navigator.locks.request = (name, opts, cb) => {
                window.__lockCbs.push(cb || opts);
                return new Promise(() => {});
            };
            const t = performance.now();
            const out = await Promise.race([
                window.__saTest.mbGate.slot({ background: false }).then((s) => ({ ok: s.ok })),
                new Promise((res) => setTimeout(() => res({ hung: true }), 8000)),
            ]);
            out.ms = performance.now() - t;
            out.tatAfterBooking = JSON.parse(localStorage.getItem('mbu:mb-gate')).tat;
            // The lock is granted at last: the callback must not book again.
            out.lateResult = window.__lockCbs.length ? window.__lockCbs[0]() : 'no callback';
            out.tatAfterGrant = JSON.parse(localStorage.getItem('mbu:mb-gate')).tat;
            navigator.locks.request = real;
            return out;
        });
        expect(r.hung, 'the request does not hang behind the stuck lock').toBeUndefined();
        expect(r.ok).toBe(true);
        expect(r.ms, 'it waited the lock timeout').toBeGreaterThan(2800);
        expect(r.ms, 'and not much more').toBeLessThan(5000);
        expect(r.tatAfterBooking, 'the unlocked booking was written').toBeGreaterThan(0);
        expect(r.lateResult, 'the late grant runs nothing').toBeUndefined();
        expect(r.tatAfterGrant, 'and books nothing a second time').toBe(r.tatAfterBooking);
    });

    test('a hold ten minutes out counts as at most 60 s, at booking and in the wait', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 600000, hot: 1, lead: '', leadUntil: 0 });
        const r = await page.evaluate(async () => {
            const told = [];
            const t0 = performance.now();
            const now = Date.now();
            const s = await window.__saTest.mbGate.slot({
                background: false,
                onWait: (m) => told.push(m),
                cancelled: () => performance.now() - t0 > 800,
            });
            return { ok: s.ok, told, tat: JSON.parse(localStorage.getItem('mbu:mb-gate')).tat - now };
        });
        expect(r.ok, 'cancelled while waiting').toBe(false);
        expect(r.told).toHaveLength(1);
        const secs = Number((/waits (\d+(?:\.\d+)?) s/.exec(r.told[0]) || [])[1]);
        expect(secs, `the announced wait (${r.told[0]})`).toBeGreaterThan(55);
        expect(secs).toBeLessThanOrEqual(61);
        expect(r.tat, 'the booked slot is within the cap, not ten minutes out').toBeLessThanOrEqual(62000);
    });

    test('a hold ten minutes out ends 60 s after the tab first saw it, for the next request too', async ({ page }) => {
        // The cap counts from the first read of that stored value, not from
        // each re-read's `now` (upstream's wait, which moves the end along and
        // so still waits the whole ten minutes). The page's clocks are moved
        // 61 s on in the middle of the wait instead of waiting a minute.
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 600000, hot: 1, lead: '', leadUntil: 0 });
        await installClock(page);
        const r = await page.evaluate(async () => {
            const clk = window.__clk;
            const realTimeout = window.setTimeout;
            const told = [];
            const t = clk.realPerf();
            const within = (p, ms) => Promise.race([p, new Promise((res) => realTimeout(() => res({ hung: true }), ms))]);
            try {
                const first = within(window.__saTest.mbGate.slot({
                    background: false,
                    onWait: (m) => told.push(m),
                }).then((x) => ({ ok: x.ok })), 4000);
                realTimeout(() => clk.pass(61000), 400);
                const a = await first;
                a.ms = clk.realPerf() - t;
                const t2 = clk.realPerf();
                const b = await within(window.__saTest.mbGate.slot({
                    background: false,
                    onWait: (m) => told.push(m),
                }).then((x) => ({ ok: x.ok, waited: x.waited })), 3000);
                b.ms = clk.realPerf() - t2;
                return { a, b, told };
            } finally {
                clk.restore();
            }
        });
        expect(r.a.hung, `the first request ends once its 60 s are up (${JSON.stringify(r)})`).toBeUndefined();
        expect(r.a.ok).toBe(true);
        expect(r.told, 'told once: the end does not move along').toHaveLength(1);
        expect(r.b.hung, 'the next request does not wait another 60 s').toBeUndefined();
        expect(r.b.ok).toBe(true);
        expect(r.b.ms).toBeLessThan(1500);
    });

    test("behind a broken hold, the tab's own 503 still holds it for its own time, and says so", async ({ page }) => {
        // vzell's browser check (2026-11-18): with a hold planted ten minutes
        // out, a real 503 (Retry-After: 1) logged "every script holds 522.3 s".
        // `max(cool, now + ms)` leaves such a stored value as it is, so the
        // answer must read the hold as this tab counts it (`_mbGateHoldEnd()`),
        // and remember its own.
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 600000, hot: 1, lead: '', leadUntil: 0 });
        await installClock(page);
        const r = await page.evaluate(async () => {
            const g = window.__saTest.mbGate;
            const clk = window.__clk;
            try {
                await g.answer(200, null);   // the tab first sees the planted value
                clk.pass(61000);             // ... and its minute is over
                const h = await g.answer(503, '2');
                const t = clk.realPerf();
                const told = [];
                const s = await g.slot({ background: false, onWait: (m) => told.push(m) });
                return { h, hot: g.read().hot, ok: s.ok, ms: clk.realPerf() - t, told };
            } finally {
                clk.restore();
            }
        });
        expect(r.h, `the reported hold is the 503's own (${JSON.stringify(r)})`).toBeGreaterThan(1500);
        expect(r.h).toBeLessThanOrEqual(2000);
        expect(r.hot, 'a new episode: hot steps up behind the broken value too (the 200 took it to 0)').toBe(1);
        expect(r.ok).toBe(true);
        expect(r.ms, 'the next request waits out that hold').toBeGreaterThan(1200);
        expect(r.ms).toBeLessThan(3500);
        expect(r.told.join(' | ')).toMatch(/waits \d.*MusicBrainz asked every script to wait/);
    });

    test("a wait ends on time with the page's timers held back, and its wakers rest afterwards", async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: '', leadUntil: 0 });
        const r = await page.evaluate(async () => {
            const real = window.setTimeout;
            // #999: the page's timers fire seconds late (Firefox, Violentmonkey).
            window.setTimeout = (fn, ms, ...a) => real(fn, (ms || 0) + 8000, ...a);
            const s = JSON.parse(localStorage.getItem('mbu:mb-gate'));
            s.cool = Date.now() + 1000;
            localStorage.setItem('mbu:mb-gate', JSON.stringify(s));
            const t = performance.now();
            let out;
            try {
                out = await Promise.race([
                    window.__saTest.mbGate.slot({ background: false }).then((x) => ({ ok: x.ok })),
                    new Promise((res) => real(() => res({ hung: true }), 7000)),
                ]);
            } finally {
                window.setTimeout = real;
            }
            out.ms = performance.now() - t;
            return out;
        });
        expect(r.hung, 'the wait is not held back with the timers').toBeUndefined();
        expect(r.ok).toBe(true);
        expect(r.ms, 'the 1 s hold is waited out').toBeGreaterThan(800);
        expect(r.ms, 'and ends on time, not 8 s late').toBeLessThan(3000);
        await expect.poll(() => page.evaluate(() => window.__saTest.mbGate.wakers()),
            { message: 'no sleeper, no frame loop, no observer, no worker tick' })
            .toEqual({ sleepers: 0, frame: false, observer: false, ticking: false });
        // A plain write under the lock leaves no sleeper behind either: the
        // lock timer's sleep ends when the lock answers, not a slice later.
        // Since the lock hold (12. below) one sleeper is left for its 30 ms:
        // the hold's own. A lock timer still asleep would make it two.
        const left = await page.evaluate(async () => {
            await window.__saTest.mbGate.answer(200, null);
            return window.__saTest.mbGate.wakers().sleepers;
        });
        expect(left, 'only the lock hold sleeps after the write').toBeLessThanOrEqual(1);
        await expect.poll(() => page.evaluate(() => window.__saTest.mbGate.wakers()),
            { message: 'and the hold ends too: every waker rests' })
            .toEqual({ sleepers: 0, frame: false, observer: false, ticking: false });
    });

    test('the lock is kept 30 ms after a write, and the caller does not wait for it', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: '', leadUntil: 0 });
        const r = await page.evaluate(async () => {
            const held = async () => (await navigator.locks.query()).held.some((l) => l.name === 'mbu-mb-gate');
            await window.__saTest.mbGate.answer(200, null);
            // Answered while the lock is still ours: the caller did not wait the hold out.
            const atAnswer = await held();
            await new Promise((res) => setTimeout(res, 150));
            return { atAnswer, later: await held() };
        });
        expect(r.atAnswer, 'the lock is still held when the write has answered').toBe(true);
        expect(r.later, 'and let go once the hold is over').toBe(false);
    });

    test('the next holder waits the hold out: a second write comes at least ~30 ms after the first', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: '', leadUntil: 0 });
        const gaps = await page.evaluate(async () => {
            const out = [];
            for (let i = 0; i < 3; i++) {
                await window.__saTest.mbGate.answer(200, null);
                const t = performance.now();
                await window.__saTest.mbGate.answer(200, null);
                out.push(performance.now() - t);
                await new Promise((res) => setTimeout(res, 100));
            }
            return out;
        });
        // Every second write waited for the first one's hold (30 ms, a few ms of slack).
        for (const g of gaps) expect(g, `gaps ${gaps.map(Math.round).join(', ')} ms`).toBeGreaterThanOrEqual(25);
    });

    test("the hold is not held back with the page's timers: the next write still comes at once", async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: '', leadUntil: 0 });
        const r = await page.evaluate(async () => {
            const real = window.setTimeout;
            // #999: the page's timers fire seconds late. A hold on a plain timer
            // would keep the lock (and every tab and script behind it) 8 s.
            window.setTimeout = (fn, ms, ...a) => real(fn, (ms || 0) + 8000, ...a);
            let ms;
            try {
                await window.__saTest.mbGate.answer(200, null);
                const t = performance.now();
                await Promise.race([
                    window.__saTest.mbGate.answer(200, null),
                    new Promise((res) => real(res, 6000)),
                ]);
                ms = performance.now() - t;
            } finally {
                window.setTimeout = real;
            }
            return ms;
        });
        expect(r, 'the second write waited the 30 ms hold, not the held-back timer').toBeLessThan(1500);
    });

    test('the job log is told again only when a new hold moves the wait later', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 1500, hot: 1, lead: '', leadUntil: 0 });
        const told = await page.evaluate(async () => {
            const msgs = [];
            const p = window.__saTest.mbGate.slot({ background: false, onWait: (m) => msgs.push(m) });
            setTimeout(() => {
                const s = JSON.parse(localStorage.getItem('mbu:mb-gate'));
                s.cool = Date.now() + 2500;
                localStorage.setItem('mbu:mb-gate', JSON.stringify(s));
            }, 400);
            await p;
            return msgs;
        });
        expect(told, told.join(' | ')).toHaveLength(2);
        expect(told[0], 'a wait caused by a hold says so, not "pacing"').toMatch(/waits \d.*MusicBrainz asked every script to wait/);
        expect(told[1], 'the second line names the new end and why').toMatch(/longer.*MusicBrainz asked every script to wait/);
    });
});

// ── A step of the wall clock (feat/mb-gate-clock) ──
//
// The stored times stay `Date.now()` epochs (protocol v1, every tab must read
// them alike), but a tab counts its waits on `performance.now()`: a stored
// value is turned into a monotonic end when the tab first sees it, so a step
// of the wall clock afterwards moves nothing. Before, a backward step during a
// wait stretched it by the step (16.8 s on petri, 2026-11-09), a forward one
// ended a hold or a paced slot early (NB-3641, 2026-11-17: a 3 s hold sent
// after 842 ms), and a `leadUntil` ten minutes out held background requests
// for ten minutes, its 10 s cap re-read from `now` each slice.
test.describe('shared request gate: a step of the wall clock', () => {

    /**
     * Runs one foreground or background slot while `act(clk)` runs after
     * `atMs`, and measures it on the real monotonic clock.
     *
     * @param {import('@playwright/test').Page} page
     * @param {{background: boolean, atMs: number, act: string, arg: number, hangMs: number}} o
     *   `act`: 'step' or 'pass'; `arg`: its ms.
     * @returns {Promise<{ok?: boolean, hung?: boolean, ms: number, stall: *}>}
     */
    const slotAcross = (page, o) => page.evaluate(async (opt) => {
        const g = window.__saTest.mbGate;
        const clk = window.__clk;
        const realTimeout = window.setTimeout;
        const t = clk.realPerf();
        try {
            const p = g.slot({ background: opt.background }).then((x) => ({ ok: x.ok }));
            realTimeout(() => clk[opt.act](opt.arg), opt.atMs);
            const out = await Promise.race([p, new Promise((res) => realTimeout(() => res({ hung: true }), opt.hangMs))]);
            out.ms = clk.realPerf() - t;
            out.stall = typeof g.stall === 'function' ? g.stall() : 'no hook';
            return out;
        } finally {
            clk.restore();
        }
    }, o);

    test('a backward step during a hold does not stretch the wait', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 1000, hot: 1, lead: '', leadUntil: 0 });
        await installClock(page);
        const r = await slotAcross(page, { background: false, atMs: 300, act: 'step', arg: -16800, hangMs: 6000 });
        expect(r.hung, `the wait is not stretched by the step (${JSON.stringify(r)})`).toBeUndefined();
        expect(r.ok).toBe(true);
        expect(r.ms, 'the 1 s hold is waited out').toBeGreaterThan(800);
        expect(r.ms, 'and no longer').toBeLessThan(3000);
    });

    test('a forward step during a hold does not end it early, and is not taken for a late timer', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 3000, hot: 1, lead: '', leadUntil: 0 });
        await installClock(page);
        const r = await slotAcross(page, { background: false, atMs: 300, act: 'step', arg: 16800, hangMs: 8000 });
        expect(r.hung).toBeUndefined();
        expect(r.ok).toBe(true);
        expect(r.ms, `the 3 s hold is waited out in full (${JSON.stringify(r)})`).toBeGreaterThan(2700);
        expect(r.ms, 'and no longer').toBeLessThan(4500);
        expect(r.stall, 'no "timer fired 16.8 s late" note for a clock step').toBeNull();
    });

    test('a forward step does not end a paced slot early', async ({ page }) => {
        // Background, behind a busy schedule: `at = tat − (BURST − 1) × GAP`,
        // 2 s out; no hold involved, so the booked slot itself is what counts.
        await loadRelPage(page, null);
        await page.evaluate(() => localStorage.setItem('mbu:mb-gate', JSON.stringify(
            { version: 1, tat: Date.now() + 4000, cool: 0, hot: 0, lead: '', leadUntil: 0 })));
        await installClock(page);
        const r = await slotAcross(page, { background: true, atMs: 300, act: 'step', arg: 16800, hangMs: 8000 });
        expect(r.hung).toBeUndefined();
        expect(r.ok).toBe(true);
        expect(r.ms, `the 2 s slot is waited out (${JSON.stringify(r)})`).toBeGreaterThan(1700);
        expect(r.ms, 'and no longer').toBeLessThan(3500);
    });

    test('a forward step does not end a hold that appeared while the request queued', async ({ page }) => {
        // The booked deadline covers a hold seen at the booking; one that
        // appears later is kept only by its own end, fixed at first sight.
        await loadRelPage(page, null);
        await page.evaluate(() => localStorage.setItem('mbu:mb-gate', JSON.stringify(
            { version: 1, tat: Date.now() + 4000, cool: 0, hot: 0, lead: '', leadUntil: 0 })));
        await installClock(page);
        const r = await page.evaluate(async () => {
            const g = window.__saTest.mbGate;
            const clk = window.__clk;
            const realTimeout = window.setTimeout;
            const t = clk.realPerf();
            try {
                const p = g.slot({ background: true }).then((x) => ({ ok: x.ok }));   // paced to ~2 s
                realTimeout(() => {   // another script's 503: everyone holds until ~3.3 s
                    const s = JSON.parse(localStorage.getItem('mbu:mb-gate'));
                    s.cool = Date.now() + 3000;
                    localStorage.setItem('mbu:mb-gate', JSON.stringify(s));
                }, 300);
                realTimeout(() => clk.step(16800), 700);
                const out = await Promise.race([p, new Promise((res) => realTimeout(() => res({ hung: true }), 8000))]);
                out.ms = clk.realPerf() - t;
                return out;
            } finally {
                clk.restore();
            }
        });
        expect(r.hung).toBeUndefined();
        expect(r.ok).toBe(true);
        expect(r.ms, `the hold, not the 2 s slot, ends the wait (${JSON.stringify(r)})`).toBeGreaterThan(3000);
        expect(r.ms, 'and no longer').toBeLessThan(4800);
    });

    test('a lead ten minutes out holds background requests for 10 s from the first sight, once', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: 'eh-page-draw', leadFor: 600000 });
        await installClock(page);
        const r = await page.evaluate(async () => {
            const g = window.__saTest.mbGate;
            const clk = window.__clk;
            const realTimeout = window.setTimeout;
            const within = (p, ms) => Promise.race([p, new Promise((res) => realTimeout(() => res({ hung: true }), ms))]);
            try {
                const t = clk.realPerf();
                const first = within(g.slot({ background: true }).then((x) => ({ ok: x.ok })), 4000);
                realTimeout(() => clk.pass(10500), 400);
                const a = await first;
                a.ms = clk.realPerf() - t;
                const t2 = clk.realPerf();
                const b = await within(g.slot({ background: true }).then((x) => ({ ok: x.ok })), 3000);
                b.ms = clk.realPerf() - t2;
                return { a, b };
            } finally {
                clk.restore();
            }
        });
        expect(r.a.hung, `the first request ends once its 10 s are up (${JSON.stringify(r)})`).toBeUndefined();
        expect(r.a.ok).toBe(true);
        expect(r.a.ms, 'it waited for the lead first').toBeGreaterThan(350);
        expect(r.b.hung, 'the same stored lead does not hold the next request again').toBeUndefined();
        expect(r.b.ms).toBeLessThan(1500);
    });

    test('a renewed lead holds again: each new leadUntil counts from its own first sight', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: 'eh-page-draw', leadFor: 1500 });
        const ms = await page.evaluate(async () => {
            const t = performance.now();
            const p = window.__saTest.mbGate.slot({ background: true });
            setTimeout(() => {
                const s = JSON.parse(localStorage.getItem('mbu:mb-gate'));
                s.leadUntil = Date.now() + 1500;   // Event Horizon renews its lead
                localStorage.setItem('mbu:mb-gate', JSON.stringify(s));
            }, 1000);
            await p;
            return performance.now() - t;
        });
        expect(ms, 'waits out the renewal, about 2.5 s').toBeGreaterThan(2300);
        expect(ms).toBeLessThan(4000);
    });
});

// Upstream's write clamp (majkinetor's #938 answer, 2026-11-20; mb-gate.mjs:64–68
// at a1e8f54, anchor gate-write-clamp): every write lowers a stored `cool` past
// now + 60 s and a `leadUntil` past now + 10 s IN STORAGE, so a broken value is
// repaired for every tab and script after the writer, not only counted capped by
// this one (9.99.1651). SAED's own twist, pinned by the third test: a tab that
// already counts the broken value keeps the end it gave it at first sight, or
// its own write would restart the 60 s.
test.describe('shared request gate: a write lowers a broken hold or lead in storage', () => {

    test('a write lowers a hold ten minutes out to at most now + 60 s in storage', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 600000, hot: 1, lead: '', leadUntil: 0 });
        const left = await page.evaluate(async () => {
            const t0 = performance.now();
            await window.__saTest.mbGate.slot({ background: false, cancelled: () => performance.now() - t0 > 300 });
            return JSON.parse(localStorage.getItem('mbu:mb-gate')).cool - Date.now();
        });
        // Guarantee: the STORED value is lowered (not just read capped), and
        // not below a real hold's longest (a cut to `now` would be ≤ 0).
        expect(left, 'the stored cool after one booking').toBeLessThanOrEqual(60000);
        expect(left).toBeGreaterThan(55000);
    });

    test('a write lowers a lead ten minutes out to at most now + 10 s in storage', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 0, lead: 'eh-page-draw', leadFor: 600000 });
        const r = await page.evaluate(async () => {
            const s = await window.__saTest.mbGate.slot({ background: false });
            const g = JSON.parse(localStorage.getItem('mbu:mb-gate'));
            return { ok: s.ok, left: g.leadUntil - Date.now(), lead: g.lead };
        });
        expect(r.ok).toBe(true);
        expect(r.left, 'the stored leadUntil after one booking').toBeLessThanOrEqual(10000);
        expect(r.left).toBeGreaterThan(5000);
        expect(r.lead, 'the lead itself is kept').toBe('eh-page-draw');
    });

    test('the tab that lowers a value it already counts keeps its first-sight end', async ({ page }) => {
        // A request waits in the paced queue; another script (a stepped clock)
        // writes a hold ten minutes out, which this tab first reads in its
        // wait (end: +60 s). 30 s later this tab writes (an answer): the clamp
        // stores now + 60 s, which must not count as a new first sight (+90 s).
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 1, lead: '', leadUntil: 0 });
        await installClock(page);
        const r = await page.evaluate(async () => {
            const g = window.__saTest.mbGate;
            const clk = window.__clk;
            const realTimeout = window.setTimeout;
            const sleep = (ms) => new Promise((res) => realTimeout(res, ms));
            const within = (p, ms) => Promise.race([p, new Promise((res) => realTimeout(() => res({ hung: true }), ms))]);
            try {
                const s0 = JSON.parse(localStorage.getItem('mbu:mb-gate'));
                s0.tat = Date.now() + 5000;
                localStorage.setItem('mbu:mb-gate', JSON.stringify(s0));
                const first = within(g.slot({ background: true }).then((x) => ({ ok: x.ok })), 5000);
                await sleep(300);
                const s1 = JSON.parse(localStorage.getItem('mbu:mb-gate'));
                s1.cool = Date.now() + 600000;   // another script's broken write
                localStorage.setItem('mbu:mb-gate', JSON.stringify(s1));
                await sleep(400);                // the wait reads it: first sight
                clk.pass(30000);
                await g.answer(200, null);       // this tab writes: the clamp
                const stored = JSON.parse(localStorage.getItem('mbu:mb-gate')).cool - Date.now();
                await sleep(300);
                clk.pass(31000);
                const a = await first;
                return { a, stored };
            } finally {
                clk.restore();
            }
        });
        expect(r.stored, 'the write lowered the stored hold').toBeLessThanOrEqual(60000);
        expect(r.a.hung, `the request goes 60 s after the first sight, not 60 s after the clamp (${JSON.stringify(r)})`).toBeUndefined();
        expect(r.a.ok).toBe(true);
    });

    test('a lead this tab already counts keeps its first-sight end when a write lowers it', async ({ page }) => {
        // The lead's twin of the test above: a background request first reads
        // a lead ten minutes out (end: +10 s); 5 s later this tab writes and
        // the clamp stores now + 10 s, which must not hold it until +15 s.
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, cool: 0, hot: 1, lead: 'eh-page-draw', leadFor: 600000 });
        await installClock(page);
        const r = await page.evaluate(async () => {
            const g = window.__saTest.mbGate;
            const clk = window.__clk;
            const realTimeout = window.setTimeout;
            const sleep = (ms) => new Promise((res) => realTimeout(res, ms));
            const within = (p, ms) => Promise.race([p, new Promise((res) => realTimeout(() => res({ hung: true }), ms))]);
            try {
                const first = within(g.slot({ background: true }).then((x) => ({ ok: x.ok })), 3000);
                await sleep(300);                // the lead wait reads it: first sight
                clk.pass(5000);
                await g.answer(200, null);       // this tab writes: the clamp
                const stored = JSON.parse(localStorage.getItem('mbu:mb-gate')).leadUntil - Date.now();
                await sleep(300);
                clk.pass(5500);
                const a = await first;
                return { a, stored };
            } finally {
                clk.restore();
            }
        });
        expect(r.stored, 'the write lowered the stored lead').toBeLessThanOrEqual(10000);
        expect(r.a.hung, `the request goes 10 s after the first sight, not 10 s after the clamp (${JSON.stringify(r)})`).toBeUndefined();
        expect(r.a.ok).toBe(true);
    });

    test('a real hold is not touched by a write', async ({ page }) => {
        await loadRelPage(page, null);
        await seedGate(page, { version: 1, tat: 0, coolIn: 3000, hot: 1, lead: 'eh-page-draw', leadFor: 4000 });
        const r = await page.evaluate(async () => {
            const before = JSON.parse(localStorage.getItem('mbu:mb-gate'));
            await window.__saTest.mbGate.answer(200, null);
            const after = JSON.parse(localStorage.getItem('mbu:mb-gate'));
            return { cool: after.cool - before.cool, lead: after.leadUntil - before.leadUntil };
        });
        // Guarantee: only a value past what any writer sets is lowered.
        expect(r).toEqual({ cool: 0, lead: 0 });
    });
});
