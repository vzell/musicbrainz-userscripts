'use strict';

/**
 * Counts the DOM operations one interaction performs, so a change that
 * removes work can be proven to have removed it.
 *
 * PERFORMANCE.org's Tier 0 asks for this. The reason is in its own text and
 * in Step 19's precedent: on the `artist-events` fixture the run-to-run
 * spread of a filter timing is wider than most of the deltas being chased —
 * `main` alone measured 1735 / 3503 / 3033 ms on the global filter across
 * three sessions — so a timing cannot settle "did this walk go away". A count
 * can. Steps 23-26 each delete a specific, nameable per-cell walk, and each
 * one shows up here as a number going to zero.
 *
 * *** THIS INSTRUMENT DISTORTS TIMINGS. NEVER RUN IT ALONGSIDE ONE. ***
 * Every wrapped API gains a function call, a counter increment and (for the
 * selector APIs) a Map lookup keyed by the selector string. That is cheap per
 * call and irrelevant to a count, but on the ~88 000-call walks this exists to
 * measure it is emphatically not free. `capture-interaction-perf.js` and
 * `capture-pass-cost.js` are therefore separate scripts that must not be
 * merged: one answers "how long", the other "how many", and the second makes
 * the first meaningless.
 *
 * Counts are far steadier than timings, so ONE sample is enough — there is no
 * median here and no `SAMPLES` constant. *Measured, not assumed*: two
 * back-to-back runs on `artist-events` at 9.99.1049 agreed exactly on 28 of
 * 32 phase counters, including every `getComputedStyle`, `querySelectorAll`,
 * `cloneNode` and layout-getter figure.
 *
 * The four that moved are `querySelector` and `createTreeWalker` in
 * `filterApply` and `filterClear`, by +1.4%/+2.9% and -1.1%/-6.6%, in
 * opposite directions — and the mechanism is legible rather than noise. The
 * deltas hold a 4:1 ratio (634:158 and 1268:316), which is one
 * `getCleanColumnText()` call: ~4 `querySelector` plus one TreeWalker. In
 * both runs the moved amount is a multiple of 158, the filtered row count. So
 * it is a slice of the deferred header-count scan sliding across a phase
 * boundary — the same async-spill the phase list below warns about — not
 * measurement noise.
 *
 * Read those two counters with a few percent of slack, and the other 28 as
 * exact. A `getComputedStyle` or `querySelectorAll` figure that moves at all
 * is a real behaviour change.
 *
 * Attribution comes from sampled stack traces rather than from instrumenting
 * the userscript: one in `stackSampleRate` calls captures `new Error().stack`
 * and records the first frame inside `ShowAllEntityData.user.js`. That is what
 * turns "87 700 getComputedStyle calls" into "87 700 calls, 99% of them from
 * `applyStickyColumn`" — which is the claim Step 24 actually needs to make.
 * It costs nothing at the default rate (~440 captures against 88 000 calls)
 * and it is why this file needs no `__saTest` hook and no userscript change.
 *
 * @see PERFORMANCE.org, "Recommended order" -> "Tier 0 — make it verifiable"
 */

/**
 * Builds the in-page instrumentation script.
 *
 * Every wrapper is a pure pass-through: it forwards `this` and the original
 * arguments via `Reflect.apply` and returns the original's result untouched,
 * so nothing observable about the DOM changes. Each patch is individually
 * wrapped in try/catch — a browser that will not let one of these be
 * redefined loses that one counter and keeps the rest, rather than throwing
 * during page setup and failing the run for an unrelated reason.
 *
 * @param {{stackSampleRate?: number}} [opts]
 *   `stackSampleRate` — capture a stack trace on one call in N (default 200).
 *   Set to 1 to attribute every call, which is much slower; set to 0 to
 *   disable attribution entirely.
 * @returns {string} script source, for `page.addInitScript({content})`.
 */
function buildDomCountersScript({ stackSampleRate = 200 } = {}) {
    return `(() => {
    'use strict';
    const RATE = ${Number(stackSampleRate) || 0};

    /** Zeroed state — also the shape returned by readDomCounters(). */
    const blank = () => ({
        getComputedStyle: 0,
        querySelector: 0,
        querySelectorAll: 0,
        cloneNode: 0,
        cloneNodeDeep: 0,
        cloneNodeDeepTr: 0,
        createTreeWalker: 0,
        createElement: 0,
        addEventListener: 0,
        getBoundingClientRect: 0,
        layoutGetter: 0,
        bySelector: {},
        byTagName: {},
        byEventType: {},
        byStack: {},
    });

    const C = blank();
    window.__saDomCounters = C;
    window.__saDomCountersReset = () => { Object.assign(C, blank()); };

    const bump = (obj, key) => {
        if (!key) return;
        obj[key] = (obj[key] || 0) + 1;
    };

    // ── Attribution ──────────────────────────────────────────────────────
    // The first stack frame inside the userscript is the function that asked
    // for the DOM operation. Playwright's addScriptTag({path}) appends a
    // //# sourceURL, so frames carry the real filename and the declared
    // function names survive.
    let tick = 0;
    const attribute = (label) => {
        if (!RATE) return;
        if (++tick % RATE !== 0) return;
        let frames;
        try {
            frames = new Error().stack.split('\\n');
        } catch { return; }
        // Keep the function NAME, not the raw frame: a frame carries an
        // absolute path plus line:col, which would make every sample from a
        // different line its own bucket and defeat the aggregation.
        //
        // Walk to the first NAMED userscript frame rather than taking the
        // first userscript frame outright. The hot loops that matter here are
        // anonymous arrows inside a forEach — applyStickyColumn's per-cell
        // snapshot is the worked example — whose own frame has no name at
        // all. Taking the first frame bucketed all 87 654 of its calls as
        // 'unattributed', which is the one answer the instrument exists to
        // avoid giving.
        let name = null;
        for (const f of frames) {
            if (!f.includes('ShowAllEntityData')) continue;
            const m = f.match(/at\\s+(?:async\\s+)?([A-Za-z_$][A-Za-z0-9_$.]*)\\s/);
            if (!m) continue;
            // Array.forEach/map frames sit between an arrow and its enclosing
            // named function; they identify the loop, never the caller.
            if (/^(Array|Object|Function|Promise|Map|Set)\\./.test(m[1])) continue;
            name = m[1];
            break;
        }
        bump(C.byStack, label + ' <- ' + (name || 'unattributed'));
    };

    const patchMethod = (owner, name, label, extra) => {
        try {
            const orig = owner[name];
            if (typeof orig !== 'function') return;
            owner[name] = function (...args) {
                C[label]++;
                if (extra) extra(this, args);
                attribute(label);
                return Reflect.apply(orig, this, args);
            };
        } catch { /* counter unavailable; the rest still work */ }
    };

    patchMethod(window, 'getComputedStyle', 'getComputedStyle');

    // querySelector/All live on Element, Document and DocumentFragment
    // separately — the ParentNode mixin is not a patchable object — so a
    // walk that queries from the document is counted the same as one that
    // queries from a cell.
    for (const proto of [Element.prototype, Document.prototype, DocumentFragment.prototype]) {
        for (const name of ['querySelector', 'querySelectorAll']) {
            patchMethod(proto, name, name, (_self, args) => bump(C.bySelector, String(args[0])));
        }
    }

    patchMethod(Node.prototype, 'cloneNode', 'cloneNode', (self, args) => {
        if (!args[0]) return;
        C.cloneNodeDeep++;
        if (self && self.tagName === 'TR') C.cloneNodeDeepTr++;
    });

    patchMethod(Document.prototype, 'createTreeWalker', 'createTreeWalker');
    patchMethod(Document.prototype, 'createElement', 'createElement',
        (_self, args) => bump(C.byTagName, String(args[0]).toLowerCase()));
    patchMethod(EventTarget.prototype, 'addEventListener', 'addEventListener',
        (_self, args) => bump(C.byEventType, String(args[0])));
    patchMethod(Element.prototype, 'getBoundingClientRect', 'getBoundingClientRect');

    // Layout-forcing getters, counted together: which one was read matters
    // far less than that a read happened mid-walk at all.
    for (const [proto, prop] of [
        [HTMLElement.prototype, 'offsetWidth'],
        [HTMLElement.prototype, 'offsetHeight'],
        [Element.prototype, 'scrollWidth'],
        [Element.prototype, 'scrollHeight'],
        [Element.prototype, 'clientWidth'],
        [Element.prototype, 'clientHeight'],
    ]) {
        try {
            const desc = Object.getOwnPropertyDescriptor(proto, prop);
            if (!desc || !desc.get) continue;
            Object.defineProperty(proto, prop, {
                ...desc,
                get() {
                    C.layoutGetter++;
                    attribute('layoutGetter');
                    return desc.get.call(this);
                },
            });
        } catch { /* counter unavailable */ }
    }
})();`;
}

/**
 * Registers the counters on `page`'s CONTEXT, so they are installed before
 * any script the page loads — including the userscript, which
 * `loadUserscriptPage()` injects with `addScriptTag` after `goto`, and
 * including a popup the userscript opens itself (the "Show single-table"
 * handoff). Context-level registration is the same choice, for the same
 * reason, that `loadPage.js` makes for its GM stubs.
 *
 * Call this BEFORE `loadFromDiskFixture()`/`loadUserscriptPage()`. Init
 * scripts run in registration order, so an early registration is what
 * guarantees the wrappers are in place for the userscript's very first call.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{stackSampleRate?: number}} [opts]
 * @returns {Promise<void>}
 */
async function installDomCounters(page, opts) {
    await page.context().addInitScript({ content: buildDomCountersScript(opts) });
}

/**
 * Zeroes every counter, so the next read describes one interaction rather
 * than everything since page load.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function resetDomCounters(page) {
    await page.evaluate(() => window.__saDomCountersReset && window.__saDomCountersReset());
}

/**
 * Reads the counters, with the three unbounded breakdown maps trimmed to
 * their largest entries — a full `bySelector` map on a filter pass has
 * hundreds of one-off entries that bury the handful that matter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{top?: number}} [opts] how many entries to keep per breakdown (default 12).
 * @returns {Promise<Object>} counter snapshot; `{}` if the counters are absent.
 */
async function readDomCounters(page, { top = 12 } = {}) {
    return page.evaluate((n) => {
        const C = window.__saDomCounters;
        if (!C) return {};
        const trim = (obj) => Object.fromEntries(
            Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
        );
        return {
            ...C,
            bySelector: trim(C.bySelector),
            byTagName: trim(C.byTagName),
            byEventType: trim(C.byEventType),
            byStack: trim(C.byStack),
        };
    }, top);
}

/**
 * Resets, runs `fn`, and returns what `fn` cost.
 *
 * `fn` must await whatever settles the interaction — this helper cannot know
 * when a filter has finished, and reading too early undercounts silently
 * rather than failing. Use the same waiters the timing harness does
 * (`waitForFilterSettled`, `waitForColHeaderCountsStable`, …).
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} fn
 * @param {{top?: number}} [opts]
 * @returns {Promise<Object>} counter snapshot for `fn` alone.
 */
async function measureDomCost(page, fn, opts) {
    await resetDomCounters(page);
    await fn();
    return readDomCounters(page, opts);
}

module.exports = {
    buildDomCountersScript,
    installDomCounters,
    resetDomCounters,
    readDomCounters,
    measureDomCost,
};
