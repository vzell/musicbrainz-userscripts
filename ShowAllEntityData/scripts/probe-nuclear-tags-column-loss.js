'use strict';
/**
 * Probe: who removes "MusicBrainz Nuclear Tags"' leading checkbox column
 * (`td/th.elephant-tag-col`) on a release page when jesus2099's
 * "mb. INLINE STUFF" is active too?
 *
 * Opens a REAL musicbrainz.org release page, logged in
 * (`playwright/.auth/vzell.json`), WITHOUT ShowAllEntityData, injects the
 * chosen third-party scripts at DOMContentLoaded (the harness's 'init'
 * approximation of Tampermonkey's document-idle), and hooks every DOM
 * removal path a framework or script can use (`removeChild`, `replaceChild`,
 * `remove`, `replaceWith`, `replaceChildren`, and the `textContent` /
 * `innerHTML` setters). Whenever the removed subtree contains an
 * `.elephant-tag-col`, it records the time and the JS stack, so the remover
 * is named rather than guessed. Console errors are collected too: React
 * reports a hydration mismatch there (minified errors #418/#423/#425).
 *
 *   node scripts/probe-nuclear-tags-column-loss.js [--arm=<arm>|all] [--url=<release url>] [--fixed-nuclear]
 *
 * Arms: `none` = no third-party script (baseline: does React hydrate
 * cleanly?); `nuclear` = Nuclear Tags only; `both` = INLINE STUFF then
 * Nuclear Tags; `both-rev` = Nuclear Tags then INLINE STUFF; `saed-nuclear`
 * / `saed-both` = the same plus ShowAllEntityData, injected after `load` by
 * the harness's `loadUserscriptPage()`; `all` (default) = each in turn.
 * INLINE STUFF is the fixed copy in `debug/` (falls back to the registered
 * one), since that is what the user's browser runs. `--fixed-nuclear` does
 * the same for Nuclear Tags.
 *
 * Result (2026-10-03, vzell-lap, logged in, Nuclear Tags 1.6): `none` has
 * no React error. Every arm with Nuclear Tags adds 43 cells at about 290 ms
 * (DOMContentLoaded), and at about 460 ms React throws #418 (hydration text
 * mismatch). It then clears `div.tracklist-and-credits` via `textContent =`
 * from `flushSync` in MusicBrainz's DOMContentLoaded handler, and the count
 * drops to 0. ShowAllEntityData and INLINE STUFF are not on the stack.
 *
 * Read-only against MusicBrainz: page loads plus INLINE STUFF's own `/ws/2`
 * lookup; nothing is submitted.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { buildGmStubsScript } = require('../tests/support/gmStubs');
const { injectLiveUserscripts, SCRIPTS_DIR } = require('../tests/support/liveUserscripts');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const AUTH = path.join(ROOT, 'playwright', '.auth', 'vzell.json');
const DEFAULT_URL = 'https://musicbrainz.org/release/230fd31d-f63f-4c01-8f10-432d36a1cb86';
const SETTLE_MS = 12000;

// --fixed-nuclear: use the patched copy in debug/ instead of the registered one.
const NUCLEAR = process.argv.includes('--fixed-nuclear')
    ? { id: 'aerozol-nuclear-tags (debug fix)', file: 'MusicBrainz Nuclear Tags.user.js', when: 'init', dir: path.join(ROOT, 'debug') }
    : { id: 'aerozol-nuclear-tags', file: 'MusicBrainz Nuclear Tags.user.js', when: 'init' };
const FIXED_INLINE = path.join(ROOT, 'debug', 'mb_INLINE-STUFF.user.js');
// --orig-inline: use the registered (unfixed) INLINE STUFF instead of the debug/ fix.
const INLINE = fs.existsSync(FIXED_INLINE) && !process.argv.includes('--orig-inline')
    ? { id: 'jesus2099-inline-stuff (debug fix)', file: 'mb_INLINE-STUFF.user.js', when: 'init', dir: path.join(ROOT, 'debug') }
    : { id: 'jesus2099-inline-stuff', file: 'mb_INLINE-STUFF.user.js', when: 'init' };

const ARMS = {
    none: [],
    nuclear: [NUCLEAR],
    both: [INLINE, NUCLEAR],
    'both-rev': [NUCLEAR, INLINE],
    'saed-nuclear': [NUCLEAR],
    'saed-both': [INLINE, NUCLEAR],
};

/** Arms that also load ShowAllEntityData (via the harness's loadUserscriptPage()). */
const SAED_ARMS = new Set(['saed-nuclear', 'saed-both']);

/**
 * In-page instrumentation, installed before any page script runs.
 * Records removals of subtrees containing `.elephant-tag-col` and a
 * timeline of the live column count.
 *
 * @returns {void}
 */
function installRemovalHooks() {
    const log = [];
    window.__ntProbe = log;
    const t0 = performance.now();
    const SEL = '.elephant-tag-col';
    const stack = () => (new Error().stack || '').split('\n').slice(2, 14).join('\n');
    const holds = (n) => !!n && n.nodeType === 1 && (n.matches(SEL) || !!n.querySelector(SEL));
    const record = (how, n) => log.push({
        t: Math.round(performance.now() - t0),
        how,
        node: n && n.nodeType === 1 ? `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : ''}` : String(n),
        stack: stack(),
    });

    const wrap = (proto, name, pick) => {
        const orig = proto[name];
        proto[name] = function (...args) {
            const victims = pick(this, args);
            for (const v of victims) if (holds(v)) record(name, v);
            return orig.apply(this, args);
        };
    };
    wrap(Node.prototype, 'removeChild', (self, a) => [a[0]]);
    wrap(Node.prototype, 'replaceChild', (self, a) => [a[1]]);
    wrap(Element.prototype, 'remove', (self) => [self]);
    wrap(Element.prototype, 'replaceWith', (self) => [self]);
    wrap(Element.prototype, 'replaceChildren', (self) => [self]);
    for (const [proto, prop] of [[Node.prototype, 'textContent'], [Element.prototype, 'innerHTML']]) {
        const d = Object.getOwnPropertyDescriptor(proto, prop);
        Object.defineProperty(proto, prop, {
            configurable: true,
            get: d.get,
            set(v) { if (holds(this)) record(`${prop}=`, this); d.set.call(this, v); },
        });
    }

    let last = 0;
    const tick = () => {
        const n = document.querySelectorAll('td' + SEL).length;
        if (n !== last) { log.push({ t: Math.round(performance.now() - t0), how: 'count', node: `${last} -> ${n} td${SEL}` }); last = n; }
    };
    document.addEventListener('DOMContentLoaded', () => {
        log.push({ t: Math.round(performance.now() - t0), how: 'event', node: 'DOMContentLoaded' });
        new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
    });
    window.addEventListener('load', () => log.push({ t: Math.round(performance.now() - t0), how: 'event', node: 'load' }));
}

/**
 * Runs one arm and prints its timeline.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} arm
 * @param {string} url
 * @returns {Promise<void>}
 */
async function runArm(browser, arm, url) {
    const context = await browser.newContext({ storageState: fs.existsSync(AUTH) ? AUTH : undefined });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));

    const withSaed = SAED_ARMS.has(arm);
    // loadUserscriptPage() registers its own GM stubs on the context.
    if (!withSaed) await page.addInitScript({ content: buildGmStubsScript({}) });
    await page.addInitScript(installRemovalHooks);
    for (const entry of ARMS[arm]) {
        await injectLiveUserscripts(page, [entry], { scriptsDir: entry.dir || SCRIPTS_DIR });
    }

    if (withSaed) {
        await loadUserscriptPage(page, { url });
    } else {
        await page.goto(url, { waitUntil: 'load' });
    }
    await page.waitForTimeout(SETTLE_MS);

    const result = await page.evaluate(() => ({
        log: window.__ntProbe,
        tdNow: document.querySelectorAll('td.elephant-tag-col').length,
        thNow: document.querySelectorAll('th.elephant-tag-col').length,
        wrapper: !!document.querySelector('.elephant-tags-wrapper'),
        tagForm: !!document.getElementById('tag-form'),
        loggedIn: !!document.querySelector('a[href="/logout"], a[href^="/logout"]'),
        inlineMarkers: document.querySelectorAll('[class*="jesus2099userjs81127"]').length,
        arsInCheckboxCol: document.querySelectorAll('td.elephant-tag-col div.ars').length,
        arsInTitleCol: document.querySelectorAll('td.title > div.ars[class*="AcoustID"], td.title > div.ars[class*="ISRC"]').length,
    }));

    console.log(`\n=== arm: ${arm} (${ARMS[arm].map((e) => e.id).join(' -> ')}) ===`);
    console.log(`logged in: ${result.loggedIn}, #tag-form: ${result.tagForm}, wrapper: ${result.wrapper}, INLINE markers: ${result.inlineMarkers}`);
    console.log(`FINAL: td.elephant-tag-col=${result.tdNow}, th.elephant-tag-col=${result.thNow}`);
    console.log(`ISRC/AcoustID blocks: in td.title=${result.arsInTitleCol}, in td.elephant-tag-col=${result.arsInCheckboxCol}`);
    for (const e of result.log) {
        console.log(`  [${String(e.t).padStart(6)} ms] ${e.how.padEnd(16)} ${e.node}`);
        if (e.stack) console.log(e.stack.split('\n').map((l) => '        ' + l.trim()).join('\n'));
    }
    if (consoleErrors.length) {
        console.log('  console errors:');
        for (const c of consoleErrors) console.log('    ' + c);
    }
    await context.close();
}

/**
 * Entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const arg = (f) => { const a = process.argv.find((x) => x.startsWith(`${f}=`)); return a ? a.slice(f.length + 1) : null; };
    const arm = arg('--arm') || 'all';
    const url = arg('--url') || DEFAULT_URL;
    const arms = arm === 'all' ? Object.keys(ARMS) : [arm];
    const browser = await chromium.launch({ headless: true });
    try {
        for (const a of arms) await runArm(browser, a, url);
    } finally {
        await browser.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
