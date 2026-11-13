#!/usr/bin/env node
'use strict';

/**
 * Runs Phase 13 batch 3's gallery reader (`_bbGalleryRead()`, the columns
 * `_bbGalleryCols()` and the helpers they use, extracted from
 * ShowAllEntityData.user.js; org/brucebase.org) over every
 * `stats:discography*` page of debug/bb-mirror/stats/ in Chromium, without
 * the rest of the userscript, and reports per page: the entries, their
 * columns, how many have a cover, a Released date (and how many of those
 * become ISO), a label, a subtitle, a note, a section and a strip tab; and
 * the shapes that would mean a read went wrong — an entry with no cover,
 * no Released or no label, a cover whose full image is its thumbnail, the
 * Released texts left as written. Writes debug/bb-galleries.json.
 *
 * usage: node scripts/check-bb-galleries.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'ShowAllEntityData.user.js');
const DIR = path.join(ROOT, 'debug', 'bb-mirror', 'stats');
const OUT = path.join(ROOT, 'debug', 'bb-galleries.json');

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
 * Reads every page in the browser and prints the summary.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const names = ['_bbText', '_dpText', '_bbAbsHref', '_BB_TAB_LABEL_RE', '_bbParseTabLabel', '_bbStatsTabPath', '_BB_TAG_MONTHS', '_bbLongDate',
        '_bbWdFullImage', '_bbGalleryIso', '_bbGalleryRead', '_bbGalleryCols', '_BB_GALLERY_PATH_RE'];
    const prelude = 'const _isBbHost = false; const Lib = { debug() {} };';
    const code = `${prelude}\n${names.map(n => extract(src, n)).join('\n')}`;
    const files = fs.readdirSync(DIR).filter(f => /^stats_discography.*\.html$/.test(f)).sort();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    const out = [];
    for (const f of files) {
        const html = fs.readFileSync(path.join(DIR, f), 'utf8');
        const name = f.replace(/^stats_/, '').replace(/\.html$/, '');
        out.push(await page.evaluate(({ code, html, name }) => {
            const api = new Function(`${code}\nreturn { _bbGalleryRead, _bbGalleryCols, _bbGalleryIso, _BB_GALLERY_PATH_RE };`)();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rec = api._bbGalleryRead(doc, `https://brucebase.wikidot.com/stats:${name}`) || { entries: [], sections: 0 };
            const en = rec.entries;
            return {
                name, matches: api._BB_GALLERY_PATH_RE.test(`/stats:${name}`), entries: en.length, sections: rec.sections,
                cols: en.length ? api._bbGalleryCols(rec) : [],
                cover: en.filter(e => e.covers.length).length, twoCovers: en.filter(e => e.covers.length > 1).length,
                released: en.filter(e => e.released).length, iso: en.filter(e => api._bbGalleryIso(e.released)).length,
                label: en.filter(e => e.label).length, subtitle: en.filter(e => e.subtitle).length,
                note: en.filter(e => e.note).map(e => `${e.text}: ${e.note}`).slice(0, 4),
                tab: en.filter(e => e.tab).length, songs: en.filter(e => /\/song:/.test(e.href)).length,
                noCover: en.filter(e => !e.covers.length).map(e => e.text).slice(0, 4),
                noReleased: en.filter(e => !e.released).map(e => e.text).slice(0, 4),
                noLabel: en.filter(e => !e.label).map(e => e.text).slice(0, 4),
                notFull: en.flatMap(e => e.covers).filter(c => c.full === c.thumb && /resized/.test(c.thumb)).length,
                asWritten: [...new Set(en.filter(e => e.released && !api._bbGalleryIso(e.released)).map(e => e.released))].slice(0, 8),
                sectionNames: [...new Set(en.map(e => e.section))],
            };
        }, { code, html, name }));
    }
    await browser.close();
    out.forEach(r => console.log(`${r.name.padEnd(36)} entries ${String(r.entries).padStart(4)} cover ${String(r.cover).padStart(4)} released ${String(r.released).padStart(4)} (iso ${String(r.iso).padStart(4)}) label ${String(r.label).padStart(4)} subtitle ${String(r.subtitle).padStart(4)} tab ${String(r.tab).padStart(4)} songs ${String(r.songs).padStart(4)} sections ${r.sections}`));
    const prob = (label, rs, show) => console.log(`${label}: ${rs.length}${rs.length ? `  ${rs.slice(0, 6).map(show).join(' | ')}` : ''}`);
    console.log('\n== problems');
    prob('pages with an entry without a cover', out.filter(r => r.noCover.length), r => `${r.name}: ${r.noCover.join(', ')}`);
    prob('pages with an entry without Released', out.filter(r => r.noReleased.length), r => `${r.name}: ${r.noReleased.join(', ')}`);
    prob('pages with an entry without a label', out.filter(r => r.noLabel.length), r => `${r.name}: ${r.noLabel.join(', ')}`);
    prob('pages with a resized cover not turned to its full image', out.filter(r => r.notFull), r => r.name);
    console.log(`\nReleased as written (no ISO): ${[...new Set(out.flatMap(r => r.asWritten))].join(' | ')}`);
    console.log(`notes: ${out.flatMap(r => r.note).slice(0, 8).join(' | ') || 'none'}`);
    console.log(`columns: ${[...new Set(out.filter(r => r.entries).map(r => r.cols.join(' | ')))].join('\n         ')}`);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log(`\nwrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
