#!/usr/bin/env node
'use strict';

/**
 * Data for the Phase 16 batch 1 mockup (org/brucebase.org: the event
 * windows' gaps G1–G3). For a few real event pages of the mirror copy
 * (debug/bb-mirror/): the window's record TODAY, from the shipped parser
 * (`window.__saTest.dpParse()` in the real userscript, through the test
 * harness), and the parts the batch would add, read from the page: the
 * description above the tabs (the page view's "About this show"), each cast
 * tab other than On Stage (its bold line and its people), a Playlist (song,
 * original artist, link), and the other-event lists (Appearances,
 * Cancelled, Performances (w/o Bruce), From My Home To Yours, …: the note
 * and the entries). Writes debug/bb-event-window-mockup.json for
 * scripts/build-bb-event-window-mockup.py. No network.
 *
 * usage: node scripts/extract-bb-event-window-mockup.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const MIRROR = path.join(ROOT, 'debug', 'bb-mirror');
const OUT = path.join(ROOT, 'debug', 'bb-event-window-mockup.json');
const PAGES = [
    'gig_1984-10-29-memorial-sports-arena-los-angeles-ca',
    'recording_1972-06-27-914-sound-studios-blauvelt-ny',
    'interview_1974-04-07-wmmr-studio-philadelphia-pa',
    'interview_2020-04-24-siriusxm-studio-new-york-city-ny',
    'gig_1974-08-14-monmouth-arts-center-red-bank-nj-early',
];

/**
 * Finds a mirror copy by its name in any folder.
 *
 * @param {string} name
 * @returns {string} The path.
 */
function find(name) {
    for (const d of fs.readdirSync(MIRROR)) {
        const p = path.join(MIRROR, d, `${name}.html`);
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`not in the mirror copy: ${name}`);
}

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
    // A block's HTML with only links and emphasis kept, links absolute.
    const clean = (el) => {
        const c = el.cloneNode(true);
        c.querySelectorAll('script, style, iframe').forEach(n => n.remove());
        c.querySelectorAll('*').forEach((n) => {
            if (n.tagName === 'A' && n.getAttribute('href')) {
                const h = abs(n.getAttribute('href'));
                Array.from(n.attributes).forEach(a => n.removeAttribute(a.name));
                n.setAttribute('href', h);
            } else {
                Array.from(n.attributes).forEach(a => n.removeAttribute(a.name));
            }
        });
        return c.innerHTML.replace(/\s+/g, ' ').trim();
    };
    const nav = pc.querySelector('.yui-navset');
    // The description: the first .list-pages-box before the tabview that is
    // not the Share box (as the page view reads it).
    const desc = Array.from(pc.querySelectorAll('.list-pages-box'))
        .find(b => !b.querySelector('[id^="social"]') && nav && (b.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING));
    const labels = nav ? Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li')).map(text) : [];
    const panels = nav ? Array.from(nav.querySelector(':scope > .yui-content').children) : [];
    const CAST = /^(?:In Studio|On Studio|On Set|On Site|On Phone|On Call|In Room)$/i;
    const LISTS = /^(?:Appearances|Cancelled|Performances \(w\/o Bruce\)|From My Home To Yours)$/i;
    const casts = [];
    const lists = [];
    let playlist = null;
    labels.forEach((label, i) => {
        const p = panels[i];
        if (!p) return;
        if (CAST.test(label)) {
            const lis = Array.from(p.querySelectorAll(':scope > ul > li')).map(li => ({
                name: text(li.querySelector(':scope > a') || li), href: li.querySelector(':scope > a') ? abs(li.querySelector(':scope > a').getAttribute('href')) : '',
                members: Array.from(li.querySelectorAll(':scope > ul > li')).map(m => text(m)),
            }));
            casts.push({ label, line: text(p.querySelector('p > strong')), people: lis });
        } else if (label === 'Playlist') {
            playlist = {
                line: text(p.querySelector('p > strong')),
                songs: Array.from(p.querySelectorAll(':scope > ul > li')).map((li) => {
                    const a = li.querySelector(':scope > a');
                    const em = li.querySelector('span em');
                    return { song: a ? text(a) : text(li.firstChild), href: a ? abs(a.getAttribute('href')) : '', by: em ? text(em).replace(/^\((.*)\)$/, '$1') : '' };
                }),
                note: text(Array.from(p.querySelectorAll('p')).find(x => /Note/.test(x.textContent))),
            };
        } else if (LISTS.test(label)) {
            const items = Array.from(p.querySelectorAll('li a')).map(a => ({ text: text(a), href: abs(a.getAttribute('href')) }));
            if (items.length) lists.push({ label, note: text(p.querySelector('sup')), items });
        }
    });
    return {
        url,
        today: {
            title: rec.title, fields: rec.fields,
            sections: rec.sections.map(s => ({ label: s.label, html: s.html || '' })),
            images: rec.images.length,
        },
        tabs: labels,
        description: desc ? clean(desc) : '',
        casts, playlist, lists,
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
    await page.waitForFunction(() => window.__saTest && window.__saTest.dpParse);
    await page.evaluate(`window.__mockRead = ${read.toString()}`);
    const out = [];
    for (const name of PAGES) {
        const html = fs.readFileSync(find(name), 'utf8');
        const [kind, slug] = name.split(/_(.+)/);
        out.push(await page.evaluate(a => window.__mockRead(a), { html, url: `https://brucebase.wikidot.com/${kind}:${slug}` }));
    }
    await browser.close();
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    for (const p of out) {
        console.log(p.url, `| desc ${p.description.length} ch | casts ${p.casts.map(c => `${c.label}(${c.people.length})`).join(',') || '-'} | playlist ${p.playlist ? p.playlist.songs.length : '-'} | lists ${p.lists.map(l => `${l.label}(${l.items.length})`).join(',') || '-'}`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
