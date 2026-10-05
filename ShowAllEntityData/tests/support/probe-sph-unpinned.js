'use strict';

// Sweep probe for org/sticky-bugs.org 4f ("there are potentially other PTs"):
// on LIVE pages (the fixtures carry no MusicBrainz stylesheet, and #page's
// table layout is part of what makes a page overflow), renders the
// consolidated table, scrolls to the far right and lists every visible
// element under #page that moved with the scroll although it is not part of
// a data table that keeps scrolling. Each such element is content that
// Sticky Page Headers leaves behind under the pinned bars.
//
// Reported per page: the outermost moved elements only (a moved element whose
// parent moved too is folded into the parent), with how far they moved.
//
// Usage:  node tests/support/probe-sph-unpinned.js [width]
//         PROBE_PAGES=<json file> node tests/support/probe-sph-unpinned.js
// The default page list is the reported pages plus every pageType in
// tests/pagetypes.json. Network: one page load plus the userscript's own
// fetch per page, stopped after three pages (#mb-stop-btn), which is enough
// to show a page's structure.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');
const { dismissCustomConfirmDialog } = require('./customDialog');
const { authStorageState } = require('./authState');
const { stopAfterPages } = require('./stopButton');

const WIDTH = Number(process.argv[2]) || 1400;

// The pages of org/sticky-bugs.org, each with the action button to press.
const REPORTED = [
    ['https://musicbrainz.org/artist/b3c01c39-429c-4b1e-8ad4-c7b04b601ca4/releases', null],
    ['https://musicbrainz.org/work/bcd490e5-dac7-3b8a-b423-ae17e1209f3d', null],
    ['https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/aliases', 'Show all Aliases for Artist'],
    ['https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/aliases', 'Show all Artist Credits for Artist'],
    ['https://musicbrainz.org/user/vzell/subscriptions/artist', null],
    ['https://musicbrainz.org/user/vzell/ratings', null],
    ['https://musicbrainz.org/search?query=Barcode+and+other+i&type=annotation&limit=25&method=indexed', null],
    ['https://musicbrainz.org/isrc/USSM19500019', null],
    ['https://musicbrainz.org/cdstub/browse', null],
];

/**
 * The page list: PROBE_PAGES (a JSON array of [url, buttonLabel|null]), else
 * the reported pages followed by every tests/pagetypes.json entry.
 *
 * @returns {Array<{url: string, label: ?string, selector: ?string}>}
 */
function pages() {
    if (process.env.PROBE_PAGES) {
        return JSON.parse(fs.readFileSync(process.env.PROBE_PAGES, 'utf8'))
            .map(([url, label]) => ({ url, label, selector: null }));
    }
    const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pagetypes.json'), 'utf8'));
    return REPORTED.map(([url, label]) => ({ url, label, selector: null }))
        .concat(registry.map((p) => ({ url: p.url, label: null, selector: p.showAllButtonSelector })));
}

/**
 * Tags every visible element under #page (outside #sidebar) with an index
 * and returns its left edge, so the same elements can be compared after the
 * scroll.
 *
 * @returns {number[]} Left edge per tagged index.
 */
function tagAndMeasure() {
    const out = [];
    const sidebar = document.getElementById('sidebar');
    document.querySelectorAll('#page *').forEach((el) => {
        if (sidebar && sidebar.contains(el)) return;
        if (!el.getClientRects().length) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        el.dataset.mbProbe = String(out.length);
        out.push(r.left);
    });
    return out;
}

/**
 * Lists the outermost tagged elements whose left edge moved, ignoring
 * everything inside a data table that is not pinned (those are meant to
 * scroll) and the table itself.
 *
 * @param {number[]} before - Output of `tagAndMeasure()` at scrollX 0.
 * @returns {Array<{el: string, moved: number, text: string}>}
 */
function movedElements(before) {
    // A container of a data table (and #content / #page, which the feature
    // always walks into) scrolls by design; its children are what count.
    const isContainer = (el) => el.id === 'content' || el.id === 'page'
        || !!el.querySelector('table.tbl');
    const moved = new Set();
    document.querySelectorAll('[data-mb-probe]').forEach((el) => {
        const tbl = el.closest('table.tbl');
        if (tbl && !tbl.classList.contains('mb-sph-target')) return;
        const d = el.getBoundingClientRect().left - before[Number(el.dataset.mbProbe)];
        if (Math.abs(d) > 1) moved.add(el);
    });
    const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    return Array.from(moved)
        // Outermost only, but a container of a data table (#content, a <form>)
        // is never reported: it scrolls by design, and its children are what
        // count.
        .filter((el) => !isContainer(el))
        .filter((el) => !moved.has(el.parentElement) || isContainer(el.parentElement))
        .map((el) => ({
            el: name(el),
            parent: el.parentElement ? name(el.parentElement) : '',
            moved: Math.round(el.getBoundingClientRect().left - before[Number(el.dataset.mbProbe)]),
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70),
        }));
}

(async () => {
    const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
    try {
        for (const p of pages()) {
            const context = await browser.newContext({
                viewport: { width: WIDTH, height: 1000 },
                ...authStorageState({ label: 'probe-sph-unpinned', silent: true }),
            });
            const page = await context.newPage();
            try {
                await loadUserscriptPage(page, {
                    url: p.url, testMode: true,
                    settingsOverride: { sa_enable_relationships_column: false, sa_render_threshold: 1e9,
                        sa_render_warning_threshold: 1e9, sa_max_page: 1000 },
                });
                const sel = p.selector || (p.label ? `button[data-label="${p.label}"]` : 'button[data-label]');
                await page.waitForSelector(sel, { timeout: 30000 });
                await page.$eval(sel, (b) => b.click());
                await dismissCustomConfirmDialog(page).catch(() => {});
                // Three pages show a page's structure; the rest only costs requests.
                await stopAfterPages(page, { n: 3, timeout: 120000 }).catch(() => {});
                await dismissCustomConfirmDialog(page, { timeout: 3000 }).catch(() => {});
                await waitForRenderComplete(page, { waitForAutoResize: true, timeout: 240000 });
                await page.waitForTimeout(2000);
                const before = await page.evaluate(tagAndMeasure);
                const scroll = await page.evaluate(() => {
                    window.scrollTo(document.documentElement.scrollWidth, window.scrollY);
                    return { x: window.scrollX, on: document.documentElement.classList.contains('mb-sph-on') };
                });
                await page.waitForTimeout(600);
                const moved = scroll.x > 0 ? await page.evaluate(movedElements, before) : [];
                console.log(`\n=== ${p.url}${p.label ? ` [${p.label}]` : ''}: scrollX ${scroll.x}, `
                    + `engaged ${scroll.on}, ${moved.length} element(s) left behind`);
                moved.forEach((m) => console.log(`    ${m.el} (in ${m.parent}) moved ${m.moved}px  "${m.text}"`));
            } catch (err) {
                console.log(`\n=== ${p.url}: FAILED ${err.message.split('\n')[0]}`);
            } finally {
                await context.close();
            }
        }
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
