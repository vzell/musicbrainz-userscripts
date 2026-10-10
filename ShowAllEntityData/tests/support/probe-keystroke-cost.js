'use strict';

/**
 * What a single keystroke in the global filter costs, and why — a probe, not
 * a metric. Run directly:
 *
 *   node tests/support/probe-keystroke-cost.js --pageType=artist-events [--delay=150] [--value=Germany]
 *
 * `capture-interaction-perf.js --only=typed` showed (tests/MEASUREMENTS.org,
 * "Typed filtering", 2026-10-10) that with a 150 ms pause between keys —
 * shorter than the debounce, so only ONE filter pass runs — `artist-events`
 * still has five keystrokes of 100 ms or more. That metric cannot say where
 * the time goes; this records a Chromium trace while typing and lists every
 * main-thread task of 16 ms or more inside the typing window, with what ran
 * in it (event dispatches, timers, idle callbacks, script by function and
 * line, style, layout, paint).
 *
 * It types the value TWICE on one page load:
 *   1. "fresh": straight after `waitForRenderComplete()`, the moment the
 *      typed metric starts typing;
 *   2. "settled": after the column-header counts have stopped changing and
 *      the field was cleared, i.e. once the post-render background work is
 *      over.
 * If the slow keys are slow only in (1), they wait behind post-render work,
 * not behind the keystroke's own handlers.
 *
 * Read-only towards the userscript; writes nothing into the repo. The trace
 * is kept at `--trace=<path>` if given (one file per window, each large).
 */

const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('./diskFixture');
const { seedGmValues } = require('./gmStubs');
const { waitForRenderComplete } = require('./browser');
const { waitForColHeaderCountsStable } = require('./filterSortAssertions');
const { toArm } = require('./perfDescriptors');

/** Same as capture-interaction-perf.js: link previews off, so a click is not a hover. */
const PREVIEWS_OFF = {
    sa_pop_mb: false, sa_pop_mb_page: false, sa_pop_ext: false,
    sa_dp_hover_without_ctrl: false, sa_event_rg_tooltip_without_ctrl: false,
};

/** Trace categories: top-level tasks, the timeline (events, script, style, layout, paint). */
const CATEGORIES = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'blink.user_timing'];

/** Tasks at or above this many ms are listed. */
const SLOW_TASK_MS = 16;

/**
 * Parses `--name=value` arguments.
 * @param {string[]} argv
 * `--css=<rules>` injects a stylesheet after the render and before the
 * first window, to test a CSS-only remedy without touching the userscript.
 * `--init=<js>` evaluates a script at the same point (an experiment hook:
 * counting or stubbing a DOM call). Neither is ever a measurement of the
 * script as shipped — say which arm a number came from.
 *
 * @returns {{pageType: string, delay: number, value: string|null, trace: string|null, css: string|null, init: string|null}}
 */
function parseArgs(argv) {
    const get = (k) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
    return {
        pageType: get('pageType') || 'artist-events',
        delay: parseInt(get('delay') || '150', 10),
        value: get('value'),
        trace: get('trace'),
        css: get('css'),
        init: get('init'),
    };
}

/**
 * Types `value` key by key (press, then pause), marking the window with
 * `performance.mark()` so it can be found in the trace.
 * @param {import('playwright').Page} page
 * @param {string} value
 * @param {number} delay
 * @param {string} tag
 * @returns {Promise<void>}
 */
async function typeMarked(page, value, delay, tag) {
    const input = page.locator('#mb-global-filter-input');
    await input.click();
    await page.evaluate((t) => performance.mark(`probe-${t}-start`), tag);
    for (let k = 0; k < value.length; k++) {
        await page.keyboard.press(value[k]);
        if (k < value.length - 1) await page.waitForTimeout(delay);
    }
    // Let the debounced pass and its render run inside the window too.
    await page.waitForTimeout(2500);
    await page.evaluate((t) => performance.mark(`probe-${t}-end`), tag);
}

/**
 * Clears the global filter back to its prefix-only value through the ✕,
 * the same path a user takes, and waits for the pass it starts.
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
async function clearFilter(page) {
    const clear = page.locator('#mb-global-filter-clear');
    if (await clear.count() && await clear.isVisible()) await clear.click();
    else {
        await page.locator('#mb-global-filter-input').click();
        await page.keyboard.press('End');
        for (let i = 0; i < 40; i++) await page.keyboard.press('Backspace');
    }
    await page.waitForTimeout(3000);
}

/**
 * Lists the slow main-thread tasks in each marked window.
 * @param {object[]} events - The trace's `traceEvents`.
 * @returns {Object<string, object>} Per window: keys, tasks, and totals by kind.
 */
function analyse(events) {
    // The renderer main thread is the one that dispatched our keydowns.
    const keyThreads = new Map();
    for (const e of events) {
        if (e.name === 'EventDispatch' && e.args && e.args.data && e.args.data.type === 'keydown') {
            const k = `${e.pid}:${e.tid}`;
            keyThreads.set(k, (keyThreads.get(k) || 0) + 1);
        }
    }
    const main = [...keyThreads.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!main) throw new Error('no keydown EventDispatch in the trace');
    const [pid, tid] = main[0].split(':').map(Number);
    const onMain = events.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number');
    const marks = {};
    for (const e of events) {
        if (e.pid === pid && e.cat && e.cat.includes('blink.user_timing') && /^probe-/.test(e.name)) marks[e.name] = e.ts;
    }
    // Chromium records one task under BOTH names, nested; keep one of them.
    const taskName = onMain.some((e) => e.name === 'ThreadControllerImpl::RunTask') ? 'ThreadControllerImpl::RunTask' : 'RunTask';
    const tasks = onMain.filter((e) => e.name === taskName);
    const out = {};
    for (const tag of ['fresh', 'settled']) {
        const t0 = marks[`probe-${tag}-start`], t1 = marks[`probe-${tag}-end`];
        if (!t0 || !t1) continue;
        const inWin = (e) => e.ts >= t0 && e.ts <= t1;
        const keys = onMain.filter((e) => inWin(e) && e.name === 'EventDispatch' && e.args.data.type === 'keydown').map((e) => e.ts);
        const slow = tasks.filter((e) => inWin(e) && e.dur >= SLOW_TASK_MS * 1000).map((task) => {
            const inside = onMain.filter((e) => e !== task && e.ts >= task.ts && e.ts + e.dur <= task.ts + task.dur);
            const kinds = {};
            const add = (k, us) => { kinds[k] = (kinds[k] || 0) + us; };
            for (const e of inside) {
                const d = (e.args && e.args.data) || {};
                if (e.name === 'EventDispatch') add(`event ${d.type}`, e.dur);
                else if (e.name === 'TimerFire') add('TimerFire', e.dur);
                else if (e.name === 'FireIdleCallback') add('FireIdleCallback', e.dur);
                else if (e.name === 'FireAnimationFrame') add('FireAnimationFrame', e.dur);
                else if (e.name === 'FunctionCall') add(`fn ${d.functionName || '(anon)'}:${d.lineNumber != null ? d.lineNumber + 1 : '?'}`, e.dur);
                else if (e.name === 'UpdateLayoutTree' || e.name === 'RecalculateStyles') add('style', e.dur);
                else if (e.name === 'Layout') add('layout', e.dur);
                else if (e.name === 'Paint' || e.name === 'PaintImage' || e.name === 'Layerize' || e.name === 'PrePaint') add('paint', e.dur);
                else if (e.name === 'MajorGC' || e.name === 'MinorGC' || e.name === 'V8.GC_SCAVENGER' || e.name === 'BlinkGC.AtomicPhase') add('gc', e.dur);
            }
            const nearestKey = keys.reduce((best, k) => (k <= task.ts + task.dur && (best == null || Math.abs(task.ts - k) < Math.abs(task.ts - best)) ? k : best), null);
            return {
                atMs: Math.round((task.ts - t0) / 1000),
                durMs: Math.round(task.dur / 1000),
                afterKeyMs: nearestKey != null ? Math.round((task.ts - nearestKey) / 1000) : null,
                top: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, us]) => `${k} ${Math.round(us / 1000)}ms`),
            };
        });
        out[tag] = { keys: keys.length, keyAtMs: keys.map((k) => Math.round((k - t0) / 1000)), slowTasks: slow };
    }
    return out;
}

(async () => {
    const args = parseArgs(process.argv.slice(2));
    const config = toArm(args.pageType);
    const value = args.value || config.filterValues[0];
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await seedGmValues(page, { ...PREVIEWS_OFF, ...config.seedGmValues });
        await loadFromDiskFixture(page, { url: config.url, fixturePath: config.fixturePath, testMode: true });
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: config.tableMode === 'multi' ? 120000 : 60000 });
        if (args.css) await page.addStyleTag({ content: args.css });
        if (args.init) await page.evaluate(args.init);
        // One trace per window: a single trace spanning the header-count wait
        // between them filled Chromium's buffer and silently lost the second.
        const result = {};
        const traced = async (tag) => {
            await browser.startTracing(page, { categories: CATEGORIES });
            await typeMarked(page, value, args.delay, tag);
            const buf = await browser.stopTracing();
            if (args.trace) fs.writeFileSync(args.trace.replace(/(\.json)?$/, `-${tag}.json`), buf);
            const trace = JSON.parse(buf.toString('utf8'));
            Object.assign(result, analyse(trace.traceEvents || trace));
        };
        await traced('fresh');
        await clearFilter(page);
        await waitForColHeaderCountsStable(page, { timeout: 120000 });
        await traced('settled');
        // An `--init=` experiment may leave its own counts in window.__probeOut.
        const experiment = await page.evaluate(() => window.__probeOut || null);
        console.log(JSON.stringify({
            pageType: config.pageType, value, delayMs: args.delay, host: os.hostname(),
            at: new Date().toISOString(), css: args.css, init: args.init, experiment, ...result,
        }, null, 2));
    } finally {
        await browser.close();
    }
})().catch((err) => {
    console.error('probe-keystroke-cost failed:', err);
    process.exit(1);
});
