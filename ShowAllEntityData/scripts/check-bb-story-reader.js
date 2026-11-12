#!/usr/bin/env node
'use strict';

/**
 * Runs the Brucebase story reader (`_bbStoryRead()` and the helpers it
 * uses, extracted from ShowAllEntityData.user.js) over every story page of
 * the BruceParser mirror in Chromium, without the rest of the userscript
 * (org/brucebase.org Phase 12), and reports per kind what it made: parts,
 * rows, the columns a table would get, "Compiled by", and the shapes that
 * would mean a parse went wrong — a page with no rows, a speaker that looks
 * like a moment or a sentence, a row with no words, the distinct speakers
 * and moment words. Writes debug/bb-story-reader.json.
 *
 * usage: node scripts/check-bb-story-reader.js [mirror_dir]
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'ShowAllEntityData.user.js');
const MIRROR = process.argv[2] || '/home/vzell/git/scripts/BruceParser/bb/latest';

/**
 * One top-level declaration of the userscript, by name: a function (to its
 * closing brace at the same indent) or a const (to its `;` line).
 *
 * @param {string} src
 * @param {string} name
 * @returns {string}
 */
function extract(src, name) {
    const fn = src.indexOf(`\n    function ${name}(`);
    if (fn >= 0) return src.slice(fn, src.indexOf('\n    }\n', fn) + 7);
    const c = src.indexOf(`\n    const ${name} =`);
    if (c < 0) throw new Error(`${name} not found`);
    const end = src.indexOf('\n    };\n', c);
    const semi = src.indexOf(';\n', c);
    return src.slice(c, end >= 0 && end < src.indexOf('\n    const ', c + 10) ? end + 8 : semi + 2);
}

/**
 * Reads every story page in the browser and prints the summary.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const code = ['_dpText', '_bbStoryQuote', '_BB_STORY_KINDS', '_BB_STORY_MOMENT_RE', '_bbStoryRead'].map(n => extract(src, n)).join('\n');
    const dir = path.join(MIRROR, 'story');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    const out = [];
    for (const f of files) {
        const html = fs.readFileSync(path.join(dir, f), 'utf8');
        const url = `https://brucebase.wikidot.com/story:${f.replace(/^story_/, '').replace(/\.html$/, '')}`;
        out.push(await page.evaluate(({ code, html, url }) => {
            const api = new Function(`${code}\nreturn { _bbStoryRead };`)();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rec = api._bbStoryRead(doc, url);
            if (!rec) return { url, none: true };
            const rows = rec.parts.flatMap(p => p.rows);
            return {
                url, kind: rec.kind, label: rec.label, title: rec.title, date: rec.date, compiled: rec.compiled,
                parts: rec.parts.map(p => [p.label, p.rows.length]), rows: rows.length,
                moments: rows.filter(r => r.moment || r.song).length, songs: rows.filter(r => r.song).length,
                speakers: rows.filter(r => r.speaker).map(r => r.speaker), plain: rows.filter(r => !r.moment && !r.song && !r.speaker).length,
                emptyWords: rows.filter(r => !r.words).length, momentWords: rows.filter(r => r.moment).map(r => r.moment),
            };
        }, { code, html, url }));
    }
    await browser.close();
    const kinds = {};
    out.forEach((r) => { (kinds[r.kind] = kinds[r.kind] || []).push(r); });
    const count = (arr) => Object.entries(arr.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
    console.log(`${out.length} story pages read`);
    for (const [k, rs] of Object.entries(kinds).sort((a, b) => b[1].length - a[1].length)) {
        const sum = (f) => rs.reduce((n, r) => n + f(r), 0);
        console.log(`\n== ${k}: ${rs.length} pages, ${sum(r => r.rows)} rows (${sum(r => r.moments)} moments, ${sum(r => r.songs)} with a song, ` +
            `${sum(r => r.speakers.length)} speaker turns, ${sum(r => r.plain)} plain); no rows: ${rs.filter(r => !r.rows).length}; ` +
            `empty words: ${sum(r => r.emptyWords)}; compiled: ${rs.filter(r => r.compiled).length}; more than one part: ${rs.filter(r => r.parts.length > 1).length}`);
        const sp = count(rs.flatMap(r => r.speakers));
        if (sp.length) console.log(`   speakers (${sp.length} distinct): ${sp.slice(0, 14).map(([s, n]) => `${s}×${n}`).join(', ')}`);
        const odd = sp.filter(([s]) => s.length > 40 || /[.!?]$/.test(s) || /\b(?:intro|song|middle|after)\b/i.test(s));
        if (odd.length) console.log(`   odd speakers: ${odd.slice(0, 10).map(([s, n]) => `"${s}"×${n}`).join(', ')}`);
        const mw = count(rs.flatMap(r => r.momentWords));
        if (mw.length) console.log(`   moments (${mw.length} distinct): ${mw.slice(0, 10).map(([s, n]) => `${s}×${n}`).join(', ')}`);
        const none = rs.filter(r => !r.rows).map(r => r.url.replace(/^.*story:/, ''));
        if (none.length) console.log(`   no rows: ${none.slice(0, 6).join(', ')}`);
    }
    fs.writeFileSync(path.join(ROOT, 'debug', 'bb-story-reader.json'), JSON.stringify(out, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
