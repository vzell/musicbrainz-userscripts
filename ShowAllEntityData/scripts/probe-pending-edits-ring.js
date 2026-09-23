'use strict';

/**
 * Does the pending-edits match ring actually PAINT on a real MusicBrainz page?
 *
 * 9.99.x's fix makes `_highlightPendingEditsMatch()` write a second class,
 * `mb-pending-edits-match`, and rings the marker with
 * `table.tbl td span.mp:has(.mb-pending-edits-match)`. The markup half was
 * confirmed on the real page from
 * `debug/work-recordings-pending-edits-filtered-final-bug.html` — 4 spans, both
 * classes, each inside a `span.mp`. What that file CANNOT answer is whether the
 * ring rendered: the save stripped every `<style>` element, MusicBrainz's own
 * included, so it carries no CSS at all.
 *
 * The fixture suite cannot answer it either. A fixture has no MusicBrainz
 * stylesheet, so `.mp` has no orange there and nothing of MB's can compete with
 * the rule. This probe is the missing arm: a REAL page, MB's real CSS, the real
 * sticky-column and `mp mp-rel` shapes.
 *
 * Reports, per marker: the computed outline (style/width/colour) on the
 * `span.mp`, its own background (what the ring is drawn AGAINST — the contrast
 * question), and the inner span's background (which must be transparent, or the
 * orange is still covered). Plus `CSS.supports('selector(:has(*))')`, because a
 * browser without `:has()` drops the ring rule alone and keeps the rest — which
 * would look exactly like "the orange came back but there is no ring".
 *
 * It does NOT load the user's third-party userscripts, so it cannot clear one of
 * those as a cause; it can only show whether MusicBrainz plus this script alone
 * are enough to produce the ring.
 *
 *   node scripts/probe-pending-edits-ring.js [work-mbid]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const MBID = process.argv[2] || 'bcd490e5-dac7-3b8a-b423-ae17e1209f3d';
const URL = `https://musicbrainz.org/work/${MBID}`;
const SCRIPT = path.join(__dirname, '..', 'ShowAllEntityData.user.js');
const AUTH = path.join(__dirname, '..', 'playwright', '.auth', 'vzell.json');
const LIB = path.join(__dirname, '..', '..', 'lib', 'VZ_MBLibrary.user.js');

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext(
        fs.existsSync(AUTH) ? { storageState: AUTH } : {});
    const page = await ctx.newPage();

    page.on('console', (m) => {
        const t = m.text();
        if (/error|Error/.test(t)) console.log('[console]', t.slice(0, 200));
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('table.tbl', { timeout: 90000 }).catch(() => {});

    // Minimal GM shims — this probe only needs GM_addStyle and the settings
    // defaults the script falls back to, not the whole harness.
    await page.addInitScript(() => { /* placeholder, see addScriptTag below */ });
    await page.evaluate(() => {
        window.GM_addStyle = (css) => {
            const s = document.createElement('style');
            s.textContent = css;
            document.head.appendChild(s);
            return s;
        };
        window.GM_getValue = (k, d) => d;
        window.GM_setValue = () => {};
        window.GM_deleteValue = () => {};
        window.GM_listValues = () => [];
        window.GM_registerMenuCommand = () => {};
        window.GM_xmlhttpRequest = () => {};
        window.GM_info = { script: { version: 'probe' } };
        window.unsafeWindow = window;
    });

    if (fs.existsSync(LIB)) await page.addScriptTag({ path: LIB });
    await page.addScriptTag({ path: SCRIPT });

    // Press "Show all …", then the ⏳ pending-edits toggle.
    const showAll = page.locator('button[id^="mb-show-all"], button[data-label]').first();
    await showAll.click({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(6000);
    await page.locator('#mb-pending-edits-btn').click({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const report = await page.evaluate(() => {
        const out = {
            title: document.title,
            hasSelectorHas: CSS.supports('selector(:has(*))'),
            ringRuleFound: false,
            transparentRuleFound: false,
            markers: [],
        };
        // Is the rule even in a stylesheet this document can see?
        for (const sheet of Array.from(document.styleSheets)) {
            let rules;
            try { rules = sheet.cssRules; } catch (_) { continue; }
            for (const r of Array.from(rules || [])) {
                const sel = r.selectorText || '';
                if (sel.includes('mb-pending-edits-match')) {
                    if (sel.includes(':has(')) out.ringRuleFound = true;
                    else out.transparentRuleFound = true;
                }
            }
        }
        document.querySelectorAll('table.tbl td span.mp').forEach((mp) => {
            const inner = mp.querySelector('.mb-pending-edits-match');
            const cs = getComputedStyle(mp);
            out.markers.push({
                text: mp.textContent.trim().slice(0, 44),
                cls: mp.className,
                hasModifier: !!inner,
                mpBackground: cs.backgroundColor,
                mpOutlineStyle: cs.outlineStyle,
                mpOutlineWidth: cs.outlineWidth,
                mpOutlineColor: cs.outlineColor,
                innerBackground: inner ? getComputedStyle(inner).backgroundColor : null,
                innerColor: inner ? getComputedStyle(inner).color : null,
            });
        });
        return out;
    });

    console.log(JSON.stringify(report, null, 2));
    await browser.close();
})();
