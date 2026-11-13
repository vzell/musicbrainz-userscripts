#!/usr/bin/env node
'use strict';

/**
 * Data for the Phase 16 batch 3 mockup (org/brucebase.org: new previews, the
 * sweep's L1–L4). Links to these pages have no preview today. For real pages
 * of the mirror copy (debug/bb-mirror/), what their card and window would
 * show, read by the readers the page buttons already use, run in the real
 * userscript through the test harness (`window.__saTest`): a song's tour
 * counts (`bbTourCounts`), an album's studio sessions (`bbSessionsRead`), a
 * discography (`bbGalleryRead`), an On The Tracks page (`bbOttRead`), and a
 * lyrics page (read here: its version headings and verses — no reader yet).
 * Writes debug/bb-batch3-mockup.json for scripts/build-bb-batch3-mockup.py.
 * No network.
 *
 * usage: node scripts/extract-bb-batch3-mockup.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const MIRROR = path.join(ROOT, 'debug', 'bb-mirror');
const OUT = path.join(ROOT, 'debug', 'bb-batch3-mockup.json');
const PAGES = [
    ['tour', 'stats-tour/stats_thunder-road-tour.html', 'stats:thunder-road-tour'],
    ['sessions', 'stats/stats_born-to-run-studio-sessions.html', 'stats:born-to-run-studio-sessions'],
    ['discography', 'stats/stats_discography-album.html', 'stats:discography-album'],
    ['ott', '../../tests/fixtures/bb-ott-do-you-want-me-to-say-alright.html', 'ott:do-you-want-me-to-say-alright'],
    ['lyrics', 'lyrics/lyrics_born-in-the-u-s-a.html', 'lyrics:born-in-the-u-s-a'],
];

/**
 * Runs in the page: the reading of one page by its kind.
 *
 * @param {{kind: string, html: string, url: string}} arg
 * @returns {Object}
 */
function read({ kind, html, url }) {
    const T = window.__saTest;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = (doc.getElementById('page-title') || { textContent: '' }).textContent.trim();
    const today = T.dpParse('brucebase.wikidot.com', html, url);
    const base = { kind, url, title, todaySections: today ? today.sections.map(s => s.label) : [] };
    if (kind === 'tour') return { ...base, tours: T.bbTourCounts(html) };
    if (kind === 'sessions') {
        const r = T.bbSessionsRead(html, url);
        return { ...base, sessions: { title: r.title, overview: r.overview, credits: r.credits, released: r.released, label: r.label, album: r.album,
            tables: r.tables.map(t => ({ name: t.name, cols: t.cols, rows: t.rows.slice(0, 120), total: t.rows.length })) } };
    }
    if (kind === 'discography') {
        const r = T.bbGalleryRead(html, url);
        return { ...base, entries: r.entries.map(e => ({ year: e.year, href: e.href, text: e.text, subtitle: e.subtitle, released: e.released, label: e.label, section: e.section, tab: e.tab, cover: (e.covers[0] || {}).thumb || '' })) };
    }
    if (kind === 'ott') {
        const r = T.bbOttRead(html, url);
        return { ...base, ott: r.ott, notes: r.texts.map(t => t.html).join('') };
    }
    // lyrics: each version's heading, then its verses (the paragraphs up to the next heading table).
    const pc = doc.getElementById('page-content');
    const versions = [];
    let cur = null;
    Array.from(pc.querySelectorAll('h2, p')).forEach((el) => {
        if (el.tagName === 'H2') { cur = { name: el.textContent.trim(), verses: [] }; versions.push(cur); return; }
        if (!cur || el.closest('table')) return;
        const lines = el.innerHTML.split(/<br\s*\/?>/i).map(l => new DOMParser().parseFromString(l, 'text/html').body.textContent.trim()).filter(Boolean);
        if (lines.length) cur.verses.push(lines);
    });
    const sl = pc.querySelector('a[href*="springsteenlyrics.com"]');
    return { ...base, versions, sl: sl ? sl.getAttribute('href') : '' };
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
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbTourCounts);
    await page.evaluate(`window.__mockRead = ${read.toString()}`);
    const out = [];
    for (const [kind, file, slug] of PAGES) {
        const html = fs.readFileSync(path.join(MIRROR, file), 'utf8');
        out.push(await page.evaluate(a => window.__mockRead(a), { kind, html, url: `https://brucebase.wikidot.com/${slug}` }));
    }
    await browser.close();
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    for (const p of out) {
        const n = p.tours ? `${p.tours.tours.length} tours` : p.sessions ? `${p.sessions.tables.length} tables (${p.sessions.tables.map(t => `${t.name} ${t.total}`).join(', ')})`
            : p.entries ? `${p.entries.length} entries` : p.ott ? `${p.ott.length} versions` : `${p.versions.length} versions`;
        console.log(p.url, '|', p.title, '|', n, '| today:', p.todaySections.join(', '));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
