'use strict';

// Diagnostic probe for org/sticky-bugs.org 3b/3c: on an artist's Aliases tab
// the sticky column of the rendered Aliases table docks at the window edge
// (debug/aliases.html: html.mb-sph-on is set, but the table carries no
// data-mb-sph-col-left and #mb-sph-col-style was never created), and the
// Credits table scrolls away while the page still overflows.
//
// Loads the LIVE page (the fixtures carry no MusicBrainz stylesheet), presses
// the given action buttons in turn and, after each render and after a scroll
// to the far right, prints what _sphRefresh() decides from: the refresh pass
// count, each table's stamps and geometry, and which body child or table
// reaches past the viewport. Debug logging is on, so "Sticky page headers"
// lines and warnings from the userscript are printed as they happen.
//
// Usage:  node tests/support/probe-sph-aliases.js [url] [width] [label…]
// Network: one page load plus the userscript's own fetch of that page.

const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');
const { USERSCRIPT_PATH } = require('./loadPage');
const { authStorageState } = require('./authState');

const URL = process.argv[2] || 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/aliases';
const WIDTH = Number(process.argv[3]) || 2000;
const LABELS = process.argv.slice(4).length ? process.argv.slice(4)
    : ['Show all Aliases for Artist', 'Show all Artist Credits for Artist'];

/**
 * Collects the state the sticky-page-headers refresh pass works from.
 *
 * @returns {object} Plain JSON-able measurements.
 */
function collect() {
    const docEl = document.documentElement;
    const sx = window.scrollX;
    const name = (el) => el.tagName + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const reach = [];
    for (const el of Array.from(document.body.children)) {
        if (el.classList.contains('mb-sph-target')) continue;
        const pos = getComputedStyle(el).position;
        if (pos === 'absolute' || pos === 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.width || r.height) reach.push({ el: name(el), right: Math.round(r.right + sx) });
    }
    const tables = Array.from(document.querySelectorAll('table.tbl')).map((t) => {
        const r = t.getBoundingClientRect();
        const sticky = t.querySelector(':scope > thead > tr:first-child > .mb-sticky-col');
        const sr = sticky ? sticky.getBoundingClientRect() : null;
        return {
            cls: t.className,
            colLeft: t.dataset.mbSphColLeft || null,
            colPre: t.dataset.mbSphColPre || null,
            rendered: t.getClientRects().length > 0,
            left: Math.round(r.left + sx), right: Math.round(r.right + sx), width: Math.round(r.width),
            sticky: sticky ? { name: sticky.dataset.colName || sticky.textContent.trim().slice(0, 20),
                viewportLeft: Math.round(sr.left), width: Math.round(sr.width), inlineLeft: sticky.style.left } : null,
        };
    });
    // Widest descendants of #page, to name whatever makes #page wide.
    const vw = docEl.clientWidth;
    const wide = Array.from(document.querySelectorAll('#page *'))
        .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width && r.right + sx > vw + 1 && !el.closest('table.tbl');
        })
        .slice(0, 12)
        .map((el) => ({ el: name(el), right: Math.round(el.getBoundingClientRect().right + sx) }));
    return {
        scrollX: sx,
        clientWidth: vw,
        scrollWidth: docEl.scrollWidth,
        sphOn: docEl.classList.contains('mb-sph-on'),
        passes: window.__saTest ? window.__saTest.sphRefreshPasses() : null,
        colStyle: !!document.getElementById('mb-sph-col-style'),
        targets: Array.from(document.querySelectorAll('.mb-sph-target')).map(name),
        bodyChildrenReach: reach,
        tables,
        wideOutsideTables: wide,
    };
}

(async () => {
    // PROBE_SCROLLBARS=1 keeps classic scrollbars (headless hides them), as a
    // desktop browser shows them: they change clientWidth when they appear.
    const browser = await chromium.launch(process.env.PROBE_SCROLLBARS
        ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {});
    try {
        // One fresh page per button: pressing a second action button
        // RELOADS the page, which drops the injected userscript.
        for (const label of LABELS) {
            const context = await browser.newContext({
                viewport: { width: WIDTH, height: 1000 },
                ...authStorageState({ label: 'probe-sph-aliases' }),
            });
            const page = await context.newPage();
            page.on('console', (msg) => {
                const t = msg.text();
                if (/sticky page headers/i.test(t) || msg.type() === 'warning' || msg.type() === 'error') {
                    console.log(`  [console.${msg.type()}] ${t.slice(0, 300)}`);
                }
            });
            page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));
            // PROBE_USERSCRIPT=<file> runs a frozen copy instead of the working
            // tree, e.g. one written by `git show <ref>:./ShowAllEntityData.user.js`.
            if (process.env.PROBE_USERSCRIPT) {
                const add = page.addScriptTag.bind(page);
                page.addScriptTag = (o) => add(o && o.path === USERSCRIPT_PATH
                    ? { ...o, path: process.env.PROBE_USERSCRIPT } : o);
            }
            await loadUserscriptPage(page, {
                url: URL, testMode: true,
                settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false,
                    sa_enable_debug_logging: true },
            });
            const sel = `button[data-label="${label}"]`;
            await page.waitForSelector(sel, { timeout: 30000 });
            await page.$eval(sel, (b) => b.click());
            try {
                await waitForRenderComplete(page, { waitForAutoResize: true, timeout: 30000 });
            } catch (err) {
                // Name whatever blocks the render (a confirm overlay, a stuck
                // heading) instead of a bare timeout.
                console.log(`\n!!!!! "${label}" did not finish rendering: ${err.message.split('\n')[0]}`);
                console.log(await page.evaluate(() => Array.from(document.querySelectorAll(
                    '[id^="mb-"][style*="fixed"], .mb-custom-dialog, #mb-render-heading, h2'))
                    .filter((el) => el.getClientRects().length)
                    .map((el) => `${el.tagName}#${el.id}.${el.className}: ${el.textContent.trim().slice(0, 120)}`)
                    .join('\n')));
                await page.screenshot({ path: `${process.env.PROBE_SHOT_DIR || '.'}/probe-sph-aliases-stuck.png` });
                await context.close();
                continue;
            }
            await page.waitForTimeout(1500);
            console.log(`\n===== after "${label}", scrollX 0 (width ${WIDTH}) =====`);
            console.log(JSON.stringify(await page.evaluate(collect), null, 1));
            await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0));
            await page.waitForTimeout(800);
            console.log(`\n===== after "${label}", scrolled right =====`);
            console.log(JSON.stringify(await page.evaluate(collect), null, 1));
            if (process.env.PROBE_SHOT_DIR) {
                await page.screenshot({ path: `${process.env.PROBE_SHOT_DIR}/probe-sph-${LABELS.indexOf(label)}.png` });
            }
            await context.close();
        }
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
