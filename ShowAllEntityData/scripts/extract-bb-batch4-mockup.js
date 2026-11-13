#!/usr/bin/env node
'use strict';

/**
 * Data for the Phase 16 batch 4 mockup (org/brucebase.org: the sweep's G6,
 * G7). For real pages of the mirror copy (debug/bb-mirror/), what their
 * window shows today (`window.__saTest.dpParse()`, the shipping reader) and
 * what batch 4 would add: a story page's own picture (Wikidot's
 * `image-container`, not a gallery box: `scripts/probe-bb-story-images.py`)
 * and its Storyteller badge; a song page's intro with its links, and its
 * Lyrics tab read as a lyrics page (`bbLyricsRead`, batch 3's reader) with
 * its springsteenlyrics.com links. Lyrics are cut to their first four lines
 * per version. Writes debug/bb-batch4-mockup.json for
 * scripts/build-bb-batch4-mockup.py. No network.
 *
 * usage: node scripts/extract-bb-batch4-mockup.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const MIRROR = path.join(ROOT, 'debug', 'bb-mirror');
const OUT = path.join(ROOT, 'debug', 'bb-batch4-mockup.json');
const PAGES = [
    ['story', 'story/story_dj-2023-10-09-siriusxm-studio-new-york-city-ny.html', 'story:dj-2023-10-09-siriusxm-studio-new-york-city-ny'],
    ['story', 'story/story_about-bob-dylan.html', 'story:about-bob-dylan'],
    ['song', 'song/song_i-m-bad-i-m-nationwide.html', 'song:i-m-bad-i-m-nationwide'],
    ['song', 'song/song_the-promise.html', 'song:the-promise'],
    ['song', 'song/song_1945.html', 'song:1945'],
];

/**
 * Runs in the page: today's record and batch 4's additions for one page.
 *
 * @param {{kind: string, html: string, url: string}} arg
 * @returns {Object}
 */
function read({ kind, html, url }) {
    const T = window.__saTest;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pc = doc.getElementById('page-content');
    const title = (doc.getElementById('page-title') || { textContent: '' }).textContent.trim();
    const today = T.dpParse('brucebase.wikidot.com', html, url);
    const four = t => t.split('\n').filter(Boolean).slice(0, 4).join('\n');
    const base = {
        kind, url, title, subtitle: today.subtitle || '', fields: today.fields,
        todaySections: today.sections.map(s => ({ label: s.label, open: s.open, text: s.label === 'Lyrics' ? four(s.text) : (s.text || '').slice(0, 300) })),
        todayImages: today.images.map(i => ({ label: i.label, thumb: i.thumb })),
    };
    if (kind === 'story') {
        const pics = Array.from(pc.querySelectorAll('.image-container img')).map(img => ({
            thumb: img.src, full: img.src.replace(/\/local--resized-images\/([^/]+\/[^/]+)\/[^/]+$/, '/local--files/$1'), title: img.getAttribute('title') || '',
        }));
        return { ...base, pictures: pics, badge: !!pc.querySelector('img[src$="/storyteller.gif"]') };
    }
    // The intro: what comes before the tabview, its links kept (scripts, frames out).
    const nav = pc.querySelector('div.yui-navset');
    const box = doc.createElement('div');
    for (const n of Array.from(pc.childNodes)) {
        if (nav && (n === nav || (n.contains && n.contains(nav)))) break;
        box.appendChild(n.cloneNode(true));
    }
    box.querySelectorAll('script, iframe, hr').forEach(n => n.remove());
    const intro = Array.from(box.querySelectorAll('p')).map((p) => {
        p.querySelectorAll('a[href]').forEach(a => a.setAttribute('href', new URL(a.getAttribute('href'), url).href));
        return p.innerHTML.trim();
    }).filter(Boolean);
    // The Lyrics tab, read as a lyrics page.
    const labels = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li')).map(li => li.textContent.trim());
    const panels = Array.from(nav.querySelector(':scope > .yui-content').children);
    const panel = panels[labels.indexOf('Lyrics')];
    const lyr = panel ? T.bbLyricsRead(`<div id="page-title">${title}</div><div id="page-content">${panel.innerHTML}</div>`, url) : null;
    return {
        ...base, intro,
        lyrics: lyr ? { versions: lyr.versions.map(v => ({ name: v.name, date: v.date, lines: four(v.text) })), sl: lyr.sl } : null,
    };
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
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbLyricsRead);
    await page.evaluate(`window.__mockRead = ${read.toString()}`);
    const out = [];
    for (const [kind, file, slug] of PAGES) {
        const html = fs.readFileSync(path.join(MIRROR, file), 'utf8');
        out.push(await page.evaluate(a => window.__mockRead(a), { kind, html, url: `https://brucebase.wikidot.com/${slug}` }));
    }
    await browser.close();
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    for (const p of out) {
        const n = p.kind === 'story' ? `${p.pictures.length} picture(s), badge ${p.badge}, today ${p.todayImages.length} image(s)`
            : `intro ${p.intro.length} p, lyrics ${p.lyrics ? `${p.lyrics.versions.length} version(s), ${p.lyrics.sl.length} link(s)` : 'none'}`;
        console.log(p.url, '|', p.title, '|', n, '| today:', p.todaySections.map(s => s.label).join(', '));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
