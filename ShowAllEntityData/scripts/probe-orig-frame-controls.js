'use strict';

// What does NOT work in the original-page copy of the Springsteen sites
// (the frame of _origViewFrame(): no script runs, no form submits), so the
// "COPY" note can name it, or say nothing (vzell, 2026-11-25: "why is 'the
// site's own buttons may not respond here' still present"). Loads each
// site's saved list page through the spec helpers (fixtures, no network),
// presses its button, shows the copy and lists, inside the frame's document:
// forms, javascript: links (the tabview tabs we switch counted apart),
// elements with an inline on… handler, and buttons/inputs/selects; each with
// whether it is visible. Usage:
//   node scripts/probe-orig-frame-controls.js > debug/probe-orig-frame-controls.log

const { chromium } = require('playwright');
const { waitForRenderComplete } = require('../tests/support/browser');
const { loadSlListPage } = require('../tests/support/slFixture');
const { JL_BUTTON, loadJlListPage } = require('../tests/support/jlFixture');
const { loadBsRecordsPage } = require('../tests/support/bsFixture');
const bb = require('../tests/support/bbFixture');

const SITES = [
    { name: 'sl collection', load: async (p) => (await loadSlListPage(p, { kind: 'collection' })).spec.button },
    { name: 'jl list', load: async (p) => { await loadJlListPage(p); return JL_BUTTON; } },
    { name: 'bs records', load: async (p) => { await loadBsRecordsPage(p); return 'Unofficial'; } },
    { name: 'bb songs', load: async (p) => { await bb.loadBbSongsPage(p); return bb.BB_BUTTON; } },
    { name: 'bb year 1985', load: async (p) => { await bb.loadBbYearPage(p, '1985'); return bb.BB_YEAR_BUTTON; } },
    { name: 'bb year list 1985', load: async (p) => { await bb.loadBbYearListPage(p, '1985'); return bb.BB_YEAR_LIST_BUTTON; } },
];

/**
 * The dead controls of the copy, from inside the frame.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
const deadControls = (page) => page.locator('#mb-orig-frame').evaluate((f) => {
    const d = f.contentDocument;
    const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const txt = (el) => (el.textContent || el.value || el.name || el.id || el.className || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const tag = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${vis(el) ? '' : ' (hidden)'} "${txt(el)}"`;
    const js = Array.from(d.querySelectorAll('a[href^="javascript:" i]'));
    const tabs = js.filter(a => a.parentElement && a.parentElement.parentElement && a.parentElement.parentElement.classList.contains('yui-nav'));
    const onAttr = Array.from(d.querySelectorAll('*')).filter(el => Array.from(el.attributes).some(a => /^on/i.test(a.name)));
    return {
        forms: Array.from(d.forms).map(fm => `${tag(fm)} action=${fm.getAttribute('action') || ''}`),
        jsLinks: js.filter(a => !tabs.includes(a)).map(tag),
        tabLinks: tabs.length,
        onHandlers: onAttr.filter(el => !js.includes(el)).map(el => `${tag(el)} [${Array.from(el.attributes).filter(a => /^on/i.test(a.name)).map(a => a.name).join(',')}]`),
        note: (d.getElementById('mb-orig-frame-note') || {}).textContent || '',
        controls: Array.from(d.querySelectorAll('button, input:not([type=hidden]), select, textarea')).map(tag),
    };
});

/**
 * Runs the probe over every site.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    console.log(JSON.stringify({ chromium: browser.version(), start: new Date().toISOString() }));
    for (const s of SITES) {
        const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
        const page = await context.newPage();
        try {
            const label = await s.load(page);
            await page.click(`button[data-label="${label}"]`);
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await page.keyboard.press('Control+M');
            await page.keyboard.press('p');
            await page.locator('#mb-orig-frame').waitFor({ state: 'visible', timeout: 10000 });
            await page.waitForTimeout(300);
            const r = await deadControls(page);
            console.log(`=== ${s.name} (${page.url()})`);
            for (const [k, v] of Object.entries(r)) {
                if (Array.isArray(v)) { console.log(`   ${k}: ${v.length}`); for (const x of v.slice(0, 25)) console.log('      ' + x); } else console.log(`   ${k}: ${v}`);
            }
        } catch (e) {
            console.log(`=== ${s.name}: ${e.message.split('\n')[0]}`);
        }
        await context.close();
    }
    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
