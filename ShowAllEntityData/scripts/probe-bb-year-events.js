#!/usr/bin/env node
'use strict';

/**
 * Phase 14 survey (org/brucebase.org: the year table's columns from each
 * event's own page): runs the link previews' own Brucebase parser — the
 * record the event's hover card and window show, `_DP_SITES[…].parse`
 * through `window.__saTest.dpParse()` in the real userscript, loaded once
 * through the test harness — over every event page of one year's copy
 * (scripts/copy-bb-year-events.sh → debug/bb-mirror/year-<YYYY>/), and
 * reports what columns it could fill and how often: Scheduled, On stage (and
 * the names it lists), the setlist count, the images by kind, the tabs with
 * content, the tags by family; the page sizes (what a load costs). Writes
 * debug/bb-year-events-<YYYY>.json, the rows the mockup shows.
 *
 * usage: node scripts/probe-bb-year-events.js 1978
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const YEAR = process.argv[2] || '1978';
const DIR = path.join(ROOT, 'debug', 'bb-mirror', `year-${YEAR}`);
const OUT = path.join(ROOT, 'debug', `bb-year-events-${YEAR}.json`);

/**
 * Reads every event page of the year in the browser and prints the summary.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const files = fs.readdirSync(DIR).filter(f => /^(gig|nogig|rehearsal|recording|interview)_.*\.html$/.test(f)).sort();
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route(/^https?:\/\//, route => (route.request().url().startsWith('https://brucebase.wikidot.com/stats:songs')
        ? route.fallback() : route.abort('blockedbyclient')));
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs', fixtureFile: path.join(ROOT, 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.dpParse);
    const out = [];
    for (const f of files) {
        const html = fs.readFileSync(path.join(DIR, f), 'utf8');
        const [kind, slug] = f.replace(/\.html$/, '').split('_');
        const url = `https://brucebase.wikidot.com/${kind}:${slug}`;
        const rec = await page.evaluate(({ html, url }) => {
            const d = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
            if (!d) return null;
            const field = name => ((d.fields || []).find(x => x[0] === name) || [])[1] || '';
            const kinds = {};
            (d.images || []).forEach((im) => { kinds[im.label || 'Other'] = (kinds[im.label || 'Other'] || 0) + 1; });
            const fam = {};
            (d.tags || []).forEach((t) => { (fam[t.family] = fam[t.family] || []).push(t.text); });
            const stage = (d.sections || []).find(s => s.label === 'On stage');
            return {
                title: d.title, scheduled: field('Scheduled'), onStage: field('On stage'),
                stageNames: stage ? (stage.html.match(/<a [^>]*href="[^"]*\/relation:[^"]*"/g) || []).length : 0,
                setlist: (field('Setlist').match(/^(\d+) song/) || [])[1] || '',
                images: (d.images || []).length, kinds, onPage: field('On the page'), tags: fam,
            };
        }, { html, url });
        out.push({ file: f, kind, url, bytes: Buffer.byteLength(html), ...rec });
    }
    await browser.close();
    const n = out.length;
    const has = k => out.filter(r => r[k] && (typeof r[k] !== 'object' || Object.keys(r[k]).length)).length;
    const tabs = {};
    out.forEach(r => (r.onPage || '').split(' · ').filter(Boolean).forEach((t) => { tabs[t] = (tabs[t] || 0) + 1; }));
    const imgKinds = {};
    out.forEach(r => Object.entries(r.kinds || {}).forEach(([k, v]) => { imgKinds[k] = (imgKinds[k] || 0) + v; }));
    const tagFam = {};
    out.forEach(r => Object.entries(r.tags || {}).forEach(([k, v]) => { tagFam[k] = (tagFam[k] || 0) + v.length; }));
    const kb = out.map(r => r.bytes / 1024).sort((a, b) => a - b);
    console.log(`${YEAR}: ${n} event pages (${Object.entries(out.reduce((m, r) => { m[r.kind] = (m[r.kind] || 0) + 1; return m; }, {})).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    console.log(`page size: median ${kb[Math.floor(n / 2)].toFixed(0)} KB, max ${kb[n - 1].toFixed(0)} KB, all ${(kb.reduce((a, b) => a + b, 0) / 1024).toFixed(1)} MB`);
    console.log(`Scheduled ${has('scheduled')}, On stage ${has('onStage')}, setlist ${has('setlist')}, images ${has('images')}, tags ${has('tags')}`);
    console.log(`tabs with content: ${Object.entries(tabs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`images by kind: ${Object.entries(imgKinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`tags by family: ${Object.entries(tagFam).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`On stage, e.g.: ${out.filter(r => r.onStage).slice(0, 3).map(r => r.onStage.slice(0, 100)).join(' | ')}`);
    console.log(`Scheduled, e.g.: ${out.filter(r => r.scheduled).slice(0, 3).map(r => r.scheduled).join(' | ')}`);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
