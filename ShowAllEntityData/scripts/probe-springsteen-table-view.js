'use strict';

// What still shows of the site's own page in the TABLE view of the four
// Springsteen sites (phase 4 of the original-page switch, 2026-11-25): loads
// each site's saved list page through the spec helpers (fixtures, no
// network), presses its button, and lists the visible blocks that are NOT
// ours, by their path from <body>, with their size. Usage:
//   node scripts/probe-springsteen-table-view.js > debug/probe-springsteen-table-view.log

const { chromium } = require('playwright');
const { waitForRenderComplete } = require('../tests/support/browser');
const { loadSlListPage } = require('../tests/support/slFixture');
const { JL_BUTTON, loadJlListPage } = require('../tests/support/jlFixture');
const { loadBsRecordsPage } = require('../tests/support/bsFixture');
const { BB_BUTTON, loadBbSongsPage, BB_EVENT_BUTTON, BB_EVENT_PAGES, loadBbEventPage } = require('../tests/support/bbFixture');

/** Debug logging on, for _origViewTagRest()'s timing line. */
const DEBUG = { sa_enable_debug_logging: true };

const SITES = [
    { name: 'sl collection', load: async (p) => (await loadSlListPage(p, { kind: 'collection', settingsOverride: DEBUG })).spec.button },
    { name: 'jl list', load: async (p) => { await loadJlListPage(p, { settingsOverride: DEBUG }); return JL_BUTTON; } },
    { name: 'bs records', load: async (p) => { await loadBsRecordsPage(p, { settingsOverride: DEBUG }); return 'Unofficial'; } },
    { name: 'bb songs', load: async (p) => { await loadBbSongsPage(p, { settingsOverride: DEBUG }); return BB_BUTTON; } },
    { name: 'bb event', load: async (p) => { await loadBbEventPage(p, Object.keys(BB_EVENT_PAGES)[0], { settingsOverride: DEBUG }); return BB_EVENT_BUTTON; } },
];

/**
 * Lists the visible blocks of the page that hold nothing of ours, one level
 * at a time: a block holding ours is descended into, any other is reported.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>}
 */
const visibleSiteBlocks = (page) => page.evaluate(() => {
    // Ours = what we create: mb- ids, our tables, our toolbar and list headings,
    // our status lines. NOT a site element that only carries a class of ours.
    const OURS = '[id^="mb-"], [id^="mbu-"], table.tbl, h1[class*="mb-"], h2[class*="mb-"], h3.mb-toggle-h3, .mb-master-toggle';
    const isOurs = (el) => el.matches(OURS);
    const holdsOurs = (el) => isOurs(el) || !!el.querySelector(OURS);
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + Array.from(el.classList).slice(0, 3).join('.') : '');
    const out = [];
    const walk = (parent, pathStr, depth) => {
        for (const el of parent.children) {
            if (/^(SCRIPT|STYLE|LINK|NOSCRIPT|TEMPLATE|BR)$/.test(el.tagName) || !vis(el) || isOurs(el)) continue;
            const p = pathStr + ' > ' + name(el);
            if (holdsOurs(el) && depth < 8) walk(el, p, depth + 1);
            else { const r = el.getBoundingClientRect(); out.push(`${p}  [${Math.round(r.width)}×${Math.round(r.height)}] ${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)}`); }
        }
    };
    walk(document.body, 'body', 0);
    return out;
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
        const timing = [];
        page.on('console', (m) => { if (m.text().includes('leftovers marked')) timing.push(m.text().replace(/^.*Original page: /, '')); });
        try {
            const label = await s.load(page);
            await page.click(`button[data-label="${label}"]`);
            await waitForRenderComplete(page, { waitForAutoResize: false });
            console.log(`=== ${s.name} (${page.url()})`);
            for (const line of await visibleSiteBlocks(page)) console.log('   ' + line);
            for (const t of timing) console.log('   timing: ' + t);
        } catch (e) {
            console.log(`=== ${s.name}: ${e.message.split('\n')[0]}`);
        }
        await context.close();
    }
    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
