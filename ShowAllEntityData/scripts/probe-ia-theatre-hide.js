'use strict';

// Who hides archive.org's player (#theatre-ia) on an item page after our
// render and the switch back (vzell, 2026-11-25, debug/ia-IP-release-ctrlmp-3-bug.html)?
// Loads the LIVE item page in headless Chromium with the userscript (test
// mode, GM stubs; our one metadata request answered from the saved fixture),
// records every write of display on #theatre-ia's style with its call stack,
// and reads the state at four moments: the initial page, after the press and
// render, after Ctrl+M P, after a wait. One anonymous page load from archive.org
// (and the page's own requests). Usage: node scripts/probe-ia-theatre-hide.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ID = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16';
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', `ext-ia-metadata-${ID}.json`), 'utf8'));

/** Records every display write on #theatre-ia (installed before the page's own scripts). */
const SPY = `(() => {
    window.__theatreLog = [];
    const note = (how, v) => {
        const t = document.getElementById('theatre-ia');
        return t && (how(t)) ? (window.__theatreLog.push({ at: Math.round(performance.now()), phase: window.__phase || 'load', v: String(v), stack: new Error().stack.split('\\n').slice(2, 9).join(' | ') }), true) : false;
    };
    // Chromium 151: an element's style is a CSSStyleProperties, whose
    // property accessors are not on CSSStyleDeclaration.prototype; wrap the
    // prototype that has 'display'.
    let proto = Object.getPrototypeOf(document.createElement('div').style);   // no documentElement yet at document start
    while (proto && !Object.getOwnPropertyDescriptor(proto, 'display')) proto = Object.getPrototypeOf(proto);
    proto = proto || CSSStyleDeclaration.prototype;
    window.__spyProto = proto.constructor && proto.constructor.name;
    // And the attribute itself, whoever writes it: the phase it happens in.
    new MutationObserver((ms) => ms.forEach((m) => { if (m.target.id === 'theatre-ia') window.__theatreLog.push({ at: Math.round(performance.now()), phase: window.__phase || 'load', v: 'MO style=' + m.target.getAttribute('style'), stack: '' }); }))
        .observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
    const d = Object.getOwnPropertyDescriptor(proto, 'display');
    if (d && d.set) Object.defineProperty(proto, 'display', { configurable: true, get: d.get, set(v) { note((t) => this === t.style, 'display=' + v); return d.set.call(this, v); } });
    const sp = proto.setProperty;
    proto.setProperty = function (k, v, p) { if (k === 'display') note((t) => this === t.style, 'setProperty display=' + v); return sp.call(this, k, v, p); };
    const ct = Object.getOwnPropertyDescriptor(proto, 'cssText');
    if (ct && ct.set) Object.defineProperty(proto, 'cssText', { configurable: true, get: ct.get, set(v) { note((t) => this === t.style, 'cssText=' + v); return ct.set.call(this, v); } });
    const sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (k, v) { if (k === 'style' && this.id === 'theatre-ia') note(() => true, 'setAttribute style=' + v); return sa.call(this, k, v); };
})();`;

/**
 * Reads #theatre-ia's state.
 *
 * @param {import('playwright').Page} page
 * @param {string} tag - The moment.
 * @returns {Promise<void>}
 */
async function state(page, tag) {
    const s = await page.evaluate(() => {
        const t = document.getElementById('theatre-ia');
        if (!t) return { theatre: 'absent' };
        const r = t.getBoundingClientRect();
        return { inline: t.getAttribute('style') || '', computed: getComputedStyle(t).display, w: Math.round(r.width), h: Math.round(r.height), body: document.body.className };
    });
    console.log(JSON.stringify({ moment: tag, ...s }));
}

/**
 * Runs the probe.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, bypassCSP: true });   // the harness injects inline scripts; archive.org's CSP forbids them
    const page = await context.newPage();
    console.log(JSON.stringify({ chromium: browser.version(), start: new Date().toISOString() }));
    await context.addInitScript({ content: SPY });
    await context.addInitScript((r) => { window.__gmXhrResponses = r; }, {
        [FX.url]: { status: FX.status, responseHeaders: `Content-Type: ${FX.contentType}`, responseText: FX.body },
    });
    await loadUserscriptPage(page, { url: `https://archive.org/details/${ID}`, testMode: true, settingsOverride: { sa_enable_internetarchive: true, sa_render_threshold: 100000 } });
    await page.waitForTimeout(6000);
    await state(page, 'initial page, 6 s after load');
    // A DOM breakpoint on #theatre-ia's attributes: the debugger reports the
    // call stack of whatever changes them, in any world (the setter wrappers
    // above caught nothing, 2026-11-25).
    const cdp = await context.newCDPSession(page);
    await cdp.send('Debugger.enable');
    await cdp.send('DOMDebugger.enable').catch(() => {});
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#theatre-ia' });
    await cdp.send('DOMDebugger.setDOMBreakpoint', { nodeId, type: 'attribute-modified' });
    cdp.on('Debugger.paused', async (e) => {
        const frames = e.callFrames.slice(0, 14).map((f) => `${f.functionName || '(anon)'} @ ${f.url.replace(/^.*\//, '').slice(0, 60)}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`);
        console.log(JSON.stringify({ paused: e.reason, data: e.data, frames }));
        await cdp.send('Debugger.resume').catch(() => {});
    });
    await page.evaluate(() => { window.__phase = 'press'; });
    await page.locator('#mb-ia-root button[data-label="Show all tracks"]').click();
    await page.waitForFunction(() => document.body.classList.contains('mb-orig-tables'), null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    await state(page, 'after the render (table view)');
    await page.evaluate(() => { window.__phase = 'switch'; document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    await page.keyboard.press('Control+M');
    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    await state(page, 'right after Ctrl+M P');
    await page.waitForTimeout(4000);
    await state(page, '4 s later');
    console.log(JSON.stringify({ spyProto: await page.evaluate(() => window.__spyProto) }));
    for (const e of await page.evaluate(() => window.__theatreLog)) console.log(JSON.stringify(e));
    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
