#!/usr/bin/env node
'use strict';

/**
 * Data for the Phase 16 batch 2 mockup (org/brucebase.org: the person and
 * release windows' gaps G4, G5). For real pages of the mirror copy
 * (debug/bb-mirror/): the window's record TODAY (`window.__saTest.dpParse()`
 * in the real userscript, through the test harness) and what batch 2 would
 * add, read from the page and from the release page view's own reader
 * (`bbReleaseRead`): a person's biography above the tabs and its source
 * line; a release's On The Tracks versions, its Recording 'Live' Dates, its
 * Gallery/News headings and press lines, and — asked, not yet in the sweep's
 * list — Performed live, Notes, History, Lyrics and Media. Writes
 * debug/bb-batch2-mockup.json for scripts/build-bb-batch2-mockup.py. No
 * network.
 *
 * usage: node scripts/extract-bb-batch2-mockup.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const MIRROR = path.join(ROOT, 'debug', 'bb-mirror');
const OUT = path.join(ROOT, 'debug', 'bb-batch2-mockup.json');
const PAGES = [
    ['pick/relation_patti-scialfa.html', 'relation:patti-scialfa'],
    ['retail-main/retail_born-to-run.html', 'retail:born-to-run'],
    ['retail-main/retail_live-1975-85.html', 'retail:live-1975-85'],
    ['retail-main/retail_get-up-stand-up-highlights.html', 'retail:get-up-stand-up-highlights'],
    ['playlist-main/playlist_songs-of-love.html', 'playlist:songs-of-love'],
];

/**
 * Runs in the page: today's record and the parts to add.
 *
 * @param {{html: string, url: string}} arg
 * @returns {Object}
 */
function read({ html, url }) {
    const rec = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pc = doc.getElementById('page-content');
    const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    const abs = h => new URL(h, url).href;
    const clean = (el) => {
        const c = el.cloneNode(true);
        c.querySelectorAll('script, style, iframe, .gallery-box').forEach(n => n.remove());
        c.querySelectorAll('*').forEach((n) => {
            const h = n.tagName === 'A' && n.getAttribute('href') ? abs(n.getAttribute('href')) : '';
            Array.from(n.attributes).forEach(a => n.removeAttribute(a.name));
            if (h) n.setAttribute('href', h);
        });
        return c.innerHTML.replace(/\s+/g, ' ').replace(/<p>\s*<\/p>/g, '').trim();
    };
    const out = {
        url, kind: /^\/relation:/.test(new URL(url).pathname) ? 'person' : 'release',
        today: { title: rec.title, fields: rec.fields, sections: rec.sections.map(s => ({ label: s.label, html: s.html || '', open: s.open })), images: rec.images.length, tracks: rec.tracks.length },
    };
    const nav = pc.querySelector('.yui-navset');
    if (out.kind === 'person') {
        const before = el => !nav || !!(nav.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
        const ps = Array.from(pc.children).filter(el => el.tagName === 'P' && before(el) && text(el));
        const box = doc.createElement('div');
        ps.forEach(p => box.appendChild(p.cloneNode(true)));
        out.about = clean(box);
        return out;
    }
    const v = window.__saTest.bbReleaseRead(html, url);
    out.ott = v.ott || [];
    out.dates = v.dates || [];
    out.performance = v.performance || [];
    out.texts = (v.texts || []).map(t => ({ label: t.label, html: t.html || '' }));
    out.media = v.media || [];
    out.lyrics = v.lyrics || [];
    // Gallery/News: its headings and press lines, the pictures left to Images.
    const tabsAll = Array.from(pc.querySelectorAll('.yui-navset'));
    let news = null;
    tabsAll.forEach((n) => {
        const labels = Array.from(n.querySelectorAll(':scope > ul.yui-nav > li')).map(text);
        const panels = Array.from((n.querySelector(':scope > .yui-content') || { children: [] }).children);
        const i = labels.indexOf('Gallery/News');
        if (i >= 0 && panels[i]) news = clean(panels[i]);
    });
    out.news = news && news.replace(/<[^>]+>/g, '').trim() ? news : '';
    return out;
}

/**
 * Reads the pages and writes the JSON.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.route(/^https?:\/\//, r => (r.request().url().startsWith('https://brucebase.wikidot.com/stats:songs')
        ? r.fallback() : r.abort('blockedbyclient')));
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs', fixtureFile: path.join(ROOT, 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.dpParse && window.__saTest.bbReleaseRead);
    await page.evaluate(`window.__mockRead = ${read.toString()}`);
    const out = [];
    for (const [file, slug] of PAGES) {
        const html = fs.readFileSync(path.join(MIRROR, file), 'utf8');
        out.push(await page.evaluate(a => window.__mockRead(a), { html, url: `https://brucebase.wikidot.com/${slug}` }));
    }
    await browser.close();
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    for (const p of out) {
        console.log(p.url, p.kind, p.kind === 'person' ? `about ${p.about.length} ch` :
            `ott ${p.ott.length} · dates ${p.dates.length} · perf ${p.performance.length} · texts ${p.texts.map(t => t.label).join('/') || '-'} · news ${p.news.length} ch · lyrics ${p.lyrics.length} · media ${p.media.length}`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
