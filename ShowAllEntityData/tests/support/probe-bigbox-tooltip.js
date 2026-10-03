'use strict';

// Diagnostic probe: does hovering a CAA/EAA big-picture strip image show the
// rich #mb-art-bigbox-tooltip on a LIVE page? Reported 2026-10-04: it works on
// artist/<mbid>/events but not on release-group/f83d2211-… . The fixture spec
// (tests/fixtures/bigbox-tooltip.spec.js) passes on both, so this runs the
// real pages with real artwork and default settings.
//
// For each strip wrapper it hovers, it prints the tooltip's display and text,
// the element actually under the pointer (elementFromPoint), the wrapper's
// geometry, and any page errors.
//
// Usage:  [SCRIPTS=id1,id2] node tests/support/probe-bigbox-tooltip.js [url] [buttonLabel] [k=v ...]
//   k=v pairs are seeded as GM settings (true/false/numbers parsed).
//   SCRIPTS names third-party userscripts from
//   tests/fixtures/live-userscripts/manifest.json to run alongside.
// Network: the page, the userscript's own fetch, and real CAA/EAA images.

const { chromium } = require('@playwright/test');
const { loadUserscriptPageWithRealNetwork } = require('./realNetworkGmXhr');
const { loadManifest, resolveScripts, injectLiveUserscripts } = require('./liveUserscripts');

const URL = process.argv[2] || 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const LABEL = process.argv[3] || 'Show all Releases for ReleaseGroup';
const SETTINGS = Object.fromEntries(process.argv.slice(4).map((kv) => {
    const [k, v] = kv.split('=');
    return [k, v === 'true' ? true : v === 'false' ? false : (isNaN(Number(v)) ? v : Number(v))];
}));

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    try {
        const entries = process.env.SCRIPTS
            ? resolveScripts(loadManifest(), { ids: process.env.SCRIPTS.split(',') }) : [];
        console.log('third-party:', entries.map((e) => e.id).join(', ') || '(none)');
        await injectLiveUserscripts(page, entries.filter((e) => e.when === 'init'));
        await loadUserscriptPageWithRealNetwork(page, { url: URL, testMode: true, settingsOverride: SETTINGS });
        await injectLiveUserscripts(page, entries.filter((e) => e.when !== 'init'));
        await page.waitForTimeout(1500);
        await page.click(`button[data-label="${LABEL}"]`);
        await page.waitForSelector('#mb-filter-container', { timeout: 90000 });
        const master = page.locator('.mb-master-toggle');
        if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
            await master.click();
        }
        // Let the strips fill.
        await page.waitForTimeout(8000);
        console.log('strips:', JSON.stringify(await page.evaluate(() =>
            Array.from(document.querySelectorAll('.mb-caa-bigbox, .mb-eaa-bigbox')).map((b) => ({
                id: b.id, display: getComputedStyle(b).display, wrappers: b.querySelectorAll('a').length,
                visibleWrappers: Array.from(b.querySelectorAll('a')).filter((a) => a.getBoundingClientRect().width > 0).length,
            }))), null, 1));
        const wrappers = page.locator('.mb-caa-bigbox a:visible, .mb-eaa-bigbox a:visible');
        const n = await wrappers.count();
        console.log(`visible strip wrappers: ${n}`);
        for (let i = 0; i < Math.min(n, 4); i++) {
            const w = wrappers.nth(i);
            await w.scrollIntoViewIfNeeded();
            await page.mouse.move(0, 0);
            await page.waitForTimeout(100);
            await w.hover({ force: true });
            await page.waitForTimeout(250);
            const res = await page.evaluate((idx) => {
                const a = Array.from(document.querySelectorAll('.mb-caa-bigbox a, .mb-eaa-bigbox a'))
                    .filter((x) => x.getBoundingClientRect().width > 0)[idx];
                const r = a.getBoundingClientRect();
                const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                const desc = (el) => el ? `${el.tagName}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}` : 'null';
                const tip = document.getElementById('mb-art-bigbox-tooltip');
                return {
                    href: a.getAttribute('href'),
                    hasName: !!a.dataset.artTooltipName,
                    rect: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`,
                    topEl: desc(top),
                    topInsideWrapper: !!(top && a.contains(top)),
                    tipDisplay: tip ? tip.style.display : '(no tip element)',
                    tipText: tip ? tip.textContent.slice(0, 120) : '',
                    tipRect: tip ? (() => { const t = tip.getBoundingClientRect(); return `${Math.round(t.width)}x${Math.round(t.height)}@${Math.round(t.left)},${Math.round(t.top)}`; })() : '',
                    imgTitle: (a.querySelector('img') || {}).title || '',
                    aTitle: a.title || '',
                };
            }, i);
            console.log(JSON.stringify(res));
        }
        console.log('errors:', JSON.stringify(errors, null, 1));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
