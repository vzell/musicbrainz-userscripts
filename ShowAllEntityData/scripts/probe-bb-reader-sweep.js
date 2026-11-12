#!/usr/bin/env node
'use strict';

/**
 * Phase 16 sweep (org/brucebase.org: recheck what our readers miss). Over
 * the copies in debug/bb-mirror/<folder>/ (scripts/copy-bb-sweep-samples.sh
 * and the earlier phases' copies), for every page: what the PAGE holds —
 * its tabs (and whether each has content), its text blocks (the leaf p, li,
 * td, th, dt, dd, h1–h4 of #page-content, each with the tab or heading it
 * sits under), its links by target (a Brucebase kind such as `gig`, `song`,
 * a year page, or another host), its pictures — against what OUR READERS
 * return for it, run in the real userscript through the test harness:
 *   - the window's record (`_DP_SITES['brucebase.wikidot.com'].parse`,
 *     `window.__saTest.dpParse()`): what the hover card and window show on
 *     every host;
 *   - the page's own view, where a hook exists (`bbEventRead`,
 *     `bbSongRead`, `bbReleaseRead`, `bbBootlegRead`): what the button's
 *     page shows.
 * A block is "kept" when its text (lower case, letters and digits only) is
 * in the reader's text; a link class "kept" when the reader links it at all.
 * Gaps are aggregated per family (the file's prefix; stats pages split into
 * tour counts, studio sessions, discographies and the rest) and per tab or
 * heading, each with up to five sample pages.
 *
 * Writes debug/bb-reader-sweep.json (with an Env stamp) and prints the
 * summary. No network: every request is blocked.
 *
 * usage: node scripts/probe-bb-reader-sweep.js [family,family,…]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const MIRROR = path.join(ROOT, 'debug', 'bb-mirror');
const OUT = path.join(ROOT, 'debug', 'bb-reader-sweep.json');
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const SAMPLES = 5;

/**
 * The page's family from its file name.
 *
 * @param {string} f File name, e.g. "stats_born-to-run-studio-sessions.html".
 * @returns {{family: string, url: string}|null} null for a paged copy (`_live-p1`).
 */
function familyOf(f) {
    const base = f.replace(/\.html$/, '');
    if (/^\d{4}(?:-\d{2})?$/.test(base)) return { family: 'year', url: `https://brucebase.wikidot.com/${base}` };
    const m = /^([a-z]+)_(.+)$/.exec(base);
    if (!m || /_live-p\d+$/.test(base)) return null;
    let family = m[1];
    // A release page is assembled from included sub-pages (…-overview,
    // -credits, -addinfo, -release, -recgig, about 190 each), which no link
    // names: their own family, kept apart from the pages people open.
    if ((family === 'retail' || family === 'playlist') && /-(?:overview|credits|addinfo|release|recgig)$/.test(m[2])) family = `${family}-part`;
    if (family === 'stats') {
        if (/-tour$/.test(m[2])) family = 'stats-tour';
        else if (/-studio-sessions/.test(m[2])) family = 'stats-sessions';
        else if (/^discography/.test(m[2])) family = 'stats-discography';
    }
    return { family, url: `https://brucebase.wikidot.com/${m[1]}:${m[2]}` };
}

/**
 * The view reader hook a family has, if any.
 *
 * @param {string} family
 * @returns {string} The `__saTest` method name, '' for none.
 */
function viewHookOf(family) {
    if (['gig', 'nogig', 'rehearsal', 'recording', 'interview', 'soundcheck', 'nobruce', 'multi'].includes(family)) return 'bbEventRead';
    if (family === 'song') return 'bbSongRead';
    if (family === 'retail' || family === 'playlist') return 'bbReleaseRead';
    if (family === 'bootleg') return 'bbBootlegRead';
    return '';
}

/**
 * Runs in the page: the page's parts and what each reader keeps of them.
 *
 * @param {{html: string, url: string, hook: string}} arg
 * @returns {Object}
 */
function measure({ html, url, hook }) {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const textOf = (h) => {
        if (!/[<&]/.test(h)) return h;
        return new DOMParser().parseFromString(`<div>${h}</div>`, 'text/html').body.textContent;
    };
    // Every string value of a record, its HTML as text, and every link in it.
    const flatten = (rec) => {
        const texts = [];
        const hrefs = [];
        const walk = (v, key) => {
            if (v == null) return;
            if (typeof v === 'string') {
                if (/^(?:https?:)?\/\//.test(v) || /^\/[a-z0-9-]+:/.test(v) || /url|href/i.test(key || '')) hrefs.push(v);
                for (const m of v.matchAll(/href="([^"]+)"/g)) hrefs.push(m[1].replace(/&amp;/g, '&'));
                texts.push(textOf(v));
            } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
            else if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
            else texts.push(String(v));
        };
        walk(rec, '');
        return { text: ` ${norm(texts.join(' '))} `, hrefs };
    };
    const classOf = (href) => {
        let u;
        try { u = new URL(href, url); } catch (_) { return ''; }
        if (!/^https?:$/.test(u.protocol)) return '';
        const host = u.hostname.toLowerCase();
        if (host === 'brucebase.wikidot.com') {
            const p = u.pathname;
            if (p === '/' || p === '') return 'bb:home';
            if (/^\/\d{4}(?:-\d{2})?\/?$/.test(p)) return 'bb:year';
            const k = /^\/([a-z]+):/.exec(p);
            return k ? `bb:${k[1]}` : 'bb:other';
        }
        if (/\.wdfiles\.com$/.test(host)) return 'bb:file';
        return host.replace(/^www\./, '');
    };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pc = doc.querySelector('#page-content');
    if (!pc) return { noContent: true };
    pc.querySelectorAll('script, style').forEach(n => n.remove());
    // The wiki's footer, inside #page-content on every page: Disclaimer, ©,
    // the social icons (a centred div around the disclaimer link).
    pc.querySelectorAll('a[href="/content:disclaimer"]').forEach((a) => {
        const d = a.closest('div');
        if (d && d !== pc && pc.contains(d)) d.remove();
    });
    // The share bar at the top of an event page ("Share:" and the icons).
    pc.querySelectorAll('span[id^="social"]').forEach((sp) => {
        const d = sp.closest('div');
        if (d && d !== pc && pc.contains(d)) d.remove();
    });
    // A line of links only ("Info & Setlist | Venue"): navigation, which the
    // window has its own of.
    const navOnly = (el) => {
        const loose = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('');
        return el.querySelector('a') && !/[^\s|·•\-–]/.test(loose) && Array.from(el.children).every(c => c.tagName === 'A' || c.tagName === 'BR');
    };
    // Tabs: every tabview, its labels and panels.
    const tabOfPanel = new Map();
    const tabs = [];
    pc.querySelectorAll('.yui-navset').forEach((nav) => {
        const labels = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li')).map(li => li.textContent.trim());
        const panels = Array.from((nav.querySelector(':scope > .yui-content') || { children: [] }).children);
        const outer = nav.parentElement && nav.parentElement.closest('.yui-navset');
        panels.forEach((pn, i) => {
            const label = labels[i] || `#${i + 1}`;
            tabOfPanel.set(pn, label);
            const content = pn.textContent.replace(/\s+/g, ' ').trim().length >= 15 || !!pn.querySelector('img, a[href]');
            if (!outer) tabs.push({ label, content });
        });
    });
    const ctxOf = (el) => {
        const parts = [];
        for (let p = el.parentElement; p && p !== pc; p = p.parentElement) {
            if (tabOfPanel.has(p)) parts.unshift(tabOfPanel.get(p));
        }
        if (parts.length) return `tab: ${parts.join(' › ')}`;
        // The nearest heading before it, outside any tab.
        const heads = Array.from(pc.querySelectorAll('h1, h2, h3, h4')).filter(h => !h.closest('.yui-navset'));
        let last = '';
        for (const h of heads) {
            if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING || h === el) last = h.textContent.trim();
        }
        return last ? `heading: ${last.slice(0, 40)}` : '(top)';
    };
    // The wiki's placeholders and boilerplate, which no reader should keep:
    // an empty tab's "Sorry, no Photos available.", "No Handwritten or
    // Printed Setlist available.", the photo credit line, the scheduled-time
    // line (the window's Scheduled field says it in its own words).
    const PLACEHOLDER = /^(?:sorry,? no\b|no (?:handwritten|printed|[\w -]{0,30}available)|incl\. (?:interviews|recording)|© all credits to the original|scheduled:|local start time)/i;
    const BLOCK = 'p, li, td, th, dt, dd, h1, h2, h3, h4, pre';
    const blocks = Array.from(pc.querySelectorAll(BLOCK))
        .filter(el => !el.closest('.yui-nav') && !el.querySelector(BLOCK) && !navOnly(el))
        .map(el => ({ ctx: ctxOf(el), t: norm(el.textContent), raw: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) }))
        .filter(b => b.t.length >= 12 && !PLACEHOLDER.test(b.raw));
    const pageLinks = new Set(Array.from(pc.querySelectorAll('a[href]'))
        .filter(a => !(a.parentElement && navOnly(a.parentElement)))
        .map(a => classOf(a.getAttribute('href'))).filter(Boolean));
    const pageImgs = pc.querySelectorAll('img').length;
    const readers = {};
    const run = (name, rec, also = null) => {
        if (!rec) {
            readers[name] = { none: true };
            return;
        }
        const f = flatten(also ? { rec, also } : rec);
        const lost = {};
        const texts = {};
        let kept = 0;
        for (const b of blocks) {
            const probe = b.t.length > 60 ? b.t.slice(0, 60).replace(/ \S*$/, '') : b.t;
            if (f.text.includes(` ${probe} `) || f.text.includes(probe)) kept++;
            else {
                lost[b.ctx] = (lost[b.ctx] || 0) + 1;
                if (!texts[b.ctx]) texts[b.ctx] = b.raw;
            }
        }
        const recLinks = new Set(f.hrefs.map(classOf).filter(Boolean));
        readers[name] = {
            kept, lost, texts,
            lostLinks: Array.from(pageLinks).filter(c => !recLinks.has(c)),
            images: Array.isArray(rec.images) ? rec.images.length : null,
            sections: Array.isArray(rec.sections) ? rec.sections.map(s => s.label.replace(/\s*\(\d+\)$/, '')) : null,
        };
    };
    const win = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
    run('window', win);
    if (hook) {
        let rec;
        try { rec = window.__saTest[hook](html, url); } catch (e) { rec = { error: String(e && e.message) }; }
        // The page's view draws its own reading AND the window's record.
        run('view', rec, win);
    }
    return { tabs, blocks: blocks.length, pageLinks: Array.from(pageLinks), pageImgs, readers };
}

/**
 * Collects the pages, measures them, writes and prints the summary.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const started = new Date();
    const seen = new Set();
    const pages = [];
    for (const dir of fs.readdirSync(MIRROR).sort()) {
        const d = path.join(MIRROR, dir);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d).filter(x => x.endsWith('.html')).sort()) {
            const fam = familyOf(f);
            if (!fam || seen.has(f) || (ONLY && !ONLY.has(fam.family))) continue;
            seen.add(f);
            pages.push({ file: path.join(d, f), name: f, ...fam });
        }
    }
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.route(/^https?:\/\//, r => (r.request().url().startsWith('https://brucebase.wikidot.com/stats:songs')
        ? r.fallback() : r.abort('blockedbyclient')));
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs', fixtureFile: path.join(ROOT, 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.dpParse);
    await page.evaluate(`window.__sweepMeasure = ${measure.toString()}`);
    const fam = {};
    let i = 0;
    for (const p of pages) {
        i++;
        if (i % 250 === 0) console.error(`… ${i} / ${pages.length}`);
        const html = fs.readFileSync(p.file, 'utf8');
        let m;
        try {
            m = await page.evaluate(a => window.__sweepMeasure(a), { html, url: p.url, hook: viewHookOf(p.family) });
        } catch (e) {
            m = { error: String(e && e.message).slice(0, 200) };
        }
        const F = fam[p.family] || (fam[p.family] = { pages: 0, noContent: 0, errors: [], tabs: {}, links: {}, readers: {} });
        F.pages++;
        if (m.error) { F.errors.push(`${p.url}: ${m.error}`); continue; }
        if (m.noContent) { F.noContent++; continue; }
        for (const c of m.pageLinks) F.links[c] = (F.links[c] || 0) + 1;
        for (const t of m.tabs) {
            const T = F.tabs[t.label] || (F.tabs[t.label] = { pages: 0, content: 0 });
            T.pages++;
            if (t.content) T.content++;
        }
        for (const [name, r] of Object.entries(m.readers)) {
            const R = F.readers[name] || (F.readers[name] = { pages: 0, none: 0, blocks: 0, kept: 0, lost: {}, lostLinks: {}, images: { page: 0, rec: 0, short: [] }, sections: {} });
            R.pages++;
            if (r.none) { R.none++; continue; }
            R.blocks += m.blocks;
            R.kept += r.kept;
            for (const [ctx, n] of Object.entries(r.lost)) {
                const L = R.lost[ctx] || (R.lost[ctx] = { blocks: 0, pages: 0, samples: [] });
                L.blocks += n;
                L.pages++;
                if (L.samples.length < SAMPLES) L.samples.push(p.url);
                if ((L.texts || (L.texts = [])).length < 3 && r.texts[ctx]) L.texts.push(r.texts[ctx]);
            }
            for (const c of r.lostLinks) {
                const L = R.lostLinks[c] || (R.lostLinks[c] = { pages: 0, samples: [] });
                L.pages++;
                if (L.samples.length < SAMPLES) L.samples.push(p.url);
            }
            if (r.images !== null) {
                R.images.page += m.pageImgs;
                R.images.rec += r.images;
                if (m.pageImgs > 0 && r.images === 0 && R.images.short.length < SAMPLES) R.images.short.push(p.url);
            }
            for (const s of r.sections || []) R.sections[s] = (R.sections[s] || 0) + 1;
        }
    }
    await browser.close();
    const finished = new Date();
    const berlin = (d) => {
        const at = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium' }).format(d);
        const off = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' }).format(d).replace(/^.*GMT/, '');
        return `${at.replace(' ', 'T')}${off || '+00:00'}`;
    };
    const result = {
        probe: 'scripts/probe-bb-reader-sweep.js', started: berlin(started), finished: berlin(finished),
        env: `${os.hostname()} · ${os.type()} ${os.release()} · Playwright ${require('@playwright/test/package.json').version} Chromium · no Tampermonkey (GM stubs)`,
        pages: pages.length, families: fam,
    };
    fs.writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`);
    console.log(`${pages.length} pages, ${result.started} → ${result.finished}, ${result.env}`);
    for (const [name, F] of Object.entries(fam).sort()) {
        const parts = [`${name}: ${F.pages} pages${F.noContent ? `, ${F.noContent} without #page-content` : ''}${F.errors.length ? `, ${F.errors.length} ERRORS` : ''}`];
        for (const [rn, R] of Object.entries(F.readers)) {
            const pct = R.blocks ? Math.round((100 * R.kept) / R.blocks) : 0;
            const lost = Object.entries(R.lost).sort((a, b) => b[1].blocks - a[1].blocks).slice(0, 6)
                .map(([c, L]) => `${c} ${L.blocks}/${L.pages}p`).join('; ');
            const links = Object.entries(R.lostLinks).sort((a, b) => b[1].pages - a[1].pages).slice(0, 8).map(([c, L]) => `${c} ${L.pages}p`).join(', ');
            parts.push(`  ${rn}: kept ${pct}% of ${R.blocks} blocks${R.none ? `, no record ${R.none}` : ''}; images page ${R.images.page} / rec ${R.images.rec}` +
                `\n    lost: ${lost || '—'}\n    links never kept: ${links || '—'}`);
        }
        console.log(parts.join('\n'));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
