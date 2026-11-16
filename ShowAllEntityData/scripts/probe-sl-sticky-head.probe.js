'use strict';
/**
 * Probe (2026-11-16): on every springsteenlyrics.com fixture kind, does the
 * toolbar <h1> (the sticky header block) stay docked while the page is
 * scrolled through the list (initial page) and through the table (after the
 * press)? Prints, per kind and compact-bar setting: the h1's parent, the
 * nearest ancestor that also holds the data (the list heading before the
 * press, table.tbl after), and the h1's top against its dock at 80 % of the
 * page's scroll range, classified docked / carried away / not reached
 * yet. Output goes to debug/probe-sl-sticky-head.json.
 */
const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { loadSlListPage, SL_KINDS } = require('../tests/support/slFixture');
const { waitForRenderComplete } = require('../tests/support/browser');

const KINDS = Object.keys(SL_KINDS);
const results = [];

/**
 * Reads where the h1 sits and whether it is docked, at 80 % of the scroll range.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object>}
 */
async function read(page) {
    await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.8)));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => {
        const d = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
            (e.classList.length ? '.' + Array.from(e.classList).filter((c) => !c.startsWith('mb-sph')).join('.') : '') : null;
        const h1Own = document.querySelector('h1.mb-sl-h1');
        if (!h1Own) return { h1: false };
        // The sticky block: the h1, or the header wrapper around it.
        const h1 = h1Own.closest('.mb-vsb-head') || h1Own;
        const data = document.querySelector('table.tbl') || document.querySelector('h3.heading:not(.navbar h3), h2.mb-sl-list-heading');
        let common = null;
        for (let a = h1.parentElement; a; a = a.parentElement) if (data && a.contains(data)) { common = a; break; }
        const cs = getComputedStyle(h1);
        const r = h1.getBoundingClientRect();
        return {
            scrollY: Math.round(scrollY), range: document.documentElement.scrollHeight - innerHeight,
            sticky: h1.classList.contains('mb-vsb-head'), position: cs.position, dock: cs.top,
            block: d(h1), h1Top: Math.round(r.top), docked: h1.classList.contains('mb-vsb-head') && Math.abs(r.top - parseFloat(cs.top)) <= 1,
            // carried away = above its dock; "not reached" = below it, in its
            // natural place (an unstyled fixture navbar is thousands of px).
            state: !h1.classList.contains('mb-vsb-head') ? 'not sticky'
                : r.top < (parseFloat(cs.top) || 0) - 1 ? 'carried away'
                    : Math.abs(r.top - parseFloat(cs.top)) <= 1 ? 'docked' : 'not reached yet',
            parent: d(h1.parentElement), parentBottom: Math.round(h1.parentElement.getBoundingClientRect().bottom),
            data: d(data), dataInParent: !!(data && h1.parentElement.contains(data)), commonAncestor: d(common),
            hops: (() => { let n = 0; for (let a = h1.parentElement; a && a !== common; a = a.parentElement) n++; return common ? n : null; })(),
            parentOverflow: getComputedStyle(h1.parentElement).overflow,
        };
    });
}

for (const kind of KINDS) {
    for (const compact of [false, true]) {
        test(`${kind} compact=${compact}`, async ({ page }) => {
            await page.setViewportSize({ width: 1000, height: 800 });
            const { spec } = await loadSlListPage(page, { kind, settingsOverride: { sa_sl_compact_nav: compact, sa_render_threshold: 100000 } });
            await page.waitForTimeout(500);
            const ip = await read(page);
            let frp = null;
            const btn = spec.button && await page.$(`button[data-label="${spec.button}"]`);
            if (btn) {
                await page.evaluate(() => window.scrollTo(0, 0));
                await page.$eval(`button[data-label="${spec.button}"]`, (b) => b.click());
                await waitForRenderComplete(page, { waitForAutoResize: false });
                await page.waitForTimeout(500);
                frp = await read(page);
            }
            results.push({ kind, compact, ip, frp });
        });
    }
}

const { loadUserscriptPage, FIXTURE_SETTINGS_OVERRIDE } = require('../tests/support/loadPage');
const SL = 'https://www.springsteenlyrics.com/';
/** Item and song pages: [URL path, fixture file] (from sl-item.spec.js and sl-song.spec.js). */
const DETAIL = {
    'item collection-8595': ['collection.php?item=8595&category=album&f_format=12i', 'detail-sl-collection-8595.html'],
    'item collection-5240': ['collection.php?item=5240&category=sampler&f_format=12i', 'detail-sl-collection-5240.html'],
    'item collection-9685': ['collection.php?item=9685&category=vaalbum&f_format=12i', 'detail-sl-collection-9685.html'],
    'item collection-6463': ['collection.php?item=6463&category=single&f_format=cd3', 'detail-sl-collection-6463.html'],
    'item collection-5472': ['collection.php?item=5472&category=single&f_format=cd3', 'detail-sl-collection-5472.html'],
    'item bootlegs-9507': ['bootlegs.php?item=9507&category=aud_live1988', 'detail-sl-bootlegs-9507.html'],
    'item bootlegs-2567': ['bootlegs.php?item=2567', 'detail-sl-bootlegs-2567.html'],
    'item brucelegs-281': ['brucelegs.php?item=281&f_format=vinyl', 'detail-sl-brucelegs-281.html'],
    'item brucelegs-41': ['brucelegs.php?item=41&f_format=vinyl', 'detail-sl-brucelegs-41.html'],
    'item brucelegs-148': ['brucelegs.php?item=148&f_format=vinyl', 'detail-sl-brucelegs-148.html'],
    'song backstreets': ['lyrics.php?song=backstreets', 'detail-sl-song-backstreets-logged-in.html'],
    'song item2298': ['lyrics.php?item=2298', 'detail-sl-song-backstreets-logged-in.html'],
    'song live': ['lyrics.php?song=backstreets_1975-11-18', 'detail-sl-song-backstreets-1975-11-18-logged-in.html'],
    'song unofficial': ['lyrics.php?song=backstreets_unofficial1', 'detail-sl-song-backstreets-unofficial1-logged-in.html'],
    'song babyme': ['lyrics.php?song=babyme', 'detail-sl-song-babyme-logged-in.html'],
    'song badlands': ['lyrics.php?song=badlands', 'detail-sl-lyrics-badlands.html'],
};
for (const [key, [url, file]] of Object.entries(DETAIL)) {
    test(key, async ({ page }) => {
        await page.setViewportSize({ width: 1000, height: 800 });
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route(/_infofile\.txt$/, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'TAPER: x' }));
        await loadUserscriptPage(page, {
            url: SL + url, fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', file), testMode: true,
            settingsOverride: { ...FIXTURE_SETTINGS_OVERRIDE, sa_enable_springsteenlyrics: true, sa_render_threshold: 100000,
                sa_foreign_mb_titles: false, sa_foreign_typography: false },
        });
        await page.waitForTimeout(500);
        const ip = await read(page);
        let frp = null;
        const label = await page.evaluate(() => {
            const b = document.querySelector('#mb-saed-bar button[data-label]');
            return b ? b.dataset.label : null;
        });
        if (label) {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.$eval(`button[data-label="${label}"]`, (b) => b.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await page.waitForTimeout(500);
            frp = await read(page);
            frp.button = label;
        }
        results.push({ kind: key, compact: false, ip, frp });
    });
}

test.afterAll(() => {
    const out = path.join(__dirname, '..', 'debug', 'probe-sl-sticky-head.json');
    fs.writeFileSync(out, JSON.stringify(results, null, 1));
});
