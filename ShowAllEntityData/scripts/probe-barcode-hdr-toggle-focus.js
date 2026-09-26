'use strict';

/**
 * Probe: does the Barcode column-header toggle survive focus after the render
 * "done" signal, or is the element replaced under the user's feet?
 *
 * `tests/fixtures/barcode-col-header-toggle.spec.js:85` focuses
 * `.mb-barcode-col-hdr-btn` and then presses Enter as a SEPARATE step. It
 * passes standalone and fails in a full-suite run, twice in a row, with
 * `aria-pressed` still "true" — i.e. Enter never reached the control. Its five
 * sibling tests all pass, and every one of them either uses `.click()` (which
 * re-resolves the locator at click time) or a document-level shortcut that does
 * not care what has focus. Only this one has a GAP between focusing a node and
 * acting on it.
 *
 * Two very different explanations fit that, and they want opposite fixes:
 *
 *   TEST RACE   — the idle-scheduled column-header count scan is still running
 *                 when the test focuses, and something in it steals or drops
 *                 focus. Fix: wait for the scan (waitForColHeaderCountsStable).
 *
 *   PRODUCT BUG — the header subtree is rebuilt after the render signal, so the
 *                 focused node is detached and replaced by an equivalent one.
 *                 A real user tabbing to that control would lose focus too, and
 *                 adding a wait to the spec would HIDE that.
 *
 * This watches the actual element identity and activeElement across the window
 * the test lives in, so the answer is measured rather than assumed.
 *
 *   node scripts/probe-barcode-hdr-toggle-focus.js
 */

const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');
const { waitForRenderComplete } = require('../tests/support/browser');

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'barcode-col-header-toggle.html');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    await loadUserscriptPage(page, { url: RG_URL, fixtureFile: FIXTURE, testMode: true });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    // WHO takes the focus? Five deferred focus() calls exist in the script and
    // none of them obviously fires on a render with no interaction, so the
    // call site is captured from a real stack rather than guessed at — the
    // first guess (the sub-table filter toggle's own 50 ms timer) came from
    // reading and was never confirmed.
    await page.evaluate(() => {
        window.__focusCalls = [];
        const orig = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function (...args) {
            try {
                window.__focusCalls.push({
                    target: this.id || this.className || this.tagName,
                    stack: (new Error().stack || '').split('\n').slice(1, 6).join(' | '),
                    at: Date.now(),
                });
            } catch { /* never let instrumentation break the page */ }
            return orig.apply(this, args);
        };
    });

    // Tag the node that exists at the moment the test would focus it, and
    // install an observer so a replacement is visible rather than inferred.
    await page.evaluate(() => {
        const el = document.querySelector('.mb-barcode-col-hdr-btn');
        el.dataset.probeTag = 'original';
        el.focus();
        window.__probe = { replaced: 0, blurred: 0, focusAtPress: null };
        el.addEventListener('blur', () => { window.__probe.blurred++; });
        const th = el.closest('th') || document.body;
        new MutationObserver((muts) => {
            for (const m of muts) {
                for (const n of m.removedNodes) {
                    if (n.nodeType === 1 && (n.matches?.('.mb-barcode-col-hdr-btn')
                        || n.querySelector?.('.mb-barcode-col-hdr-btn'))) {
                        window.__probe.replaced++;
                    }
                }
            }
        }).observe(th, { childList: true, subtree: true });
    });

    const sample = async (label) => {
        const s = await page.evaluate(() => {
            const el = document.querySelector('.mb-barcode-col-hdr-btn');
            const active = document.activeElement;
            return {
                stillOriginal: el ? el.dataset.probeTag === 'original' : null,
                isFocused: el === active,
                activeTag: active ? (active.className || active.tagName) : '(none)',
                pressed: el ? el.getAttribute('aria-pressed') : null,
                replaced: window.__probe.replaced,
                blurred: window.__probe.blurred,
            };
        });
        console.log(`${label.padEnd(26)} sameNode=${String(s.stillOriginal).padEnd(5)} `
            + `focused=${String(s.isFocused).padEnd(5)} pressed=${s.pressed} `
            + `replacedNodes=${s.replaced} blurs=${s.blurred}  active=${String(s.activeTag).slice(0, 40)}`);
        return s;
    };

    console.log('--- focus held across the window the failing test lives in ---');
    await sample('immediately after focus');
    for (const ms of [50, 250, 1000, 3000]) {
        await page.waitForTimeout(ms);
        await sample(`+${ms}ms`);
    }

    // Now do exactly what the test does, and report whether it worked.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const after = await sample('after Enter');
    console.log(`\nverdict: Enter ${after.pressed === 'false' ? 'DID' : 'did NOT'} toggle the control`);

    const calls = await page.evaluate(() => window.__focusCalls.map((c, i) => ({ ...c, i })));
    const t0 = calls.length ? calls[0].at : 0;
    console.log(`\n--- every focus() call after the render signal (${calls.length}) ---`);
    for (const c of calls) {
        console.log(`  +${String(c.at - t0).padStart(5)}ms  -> ${String(c.target).slice(0, 44)}`);
        console.log(`           ${c.stack.slice(0, 200)}`);
    }

    await browser.close();
})();
