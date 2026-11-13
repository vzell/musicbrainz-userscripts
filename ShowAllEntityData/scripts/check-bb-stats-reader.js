#!/usr/bin/env node
'use strict';

/**
 * Runs the Brucebase stats reader (`_bbStatsRead()`, `_bbStatsListCols()`
 * and the helpers they use, extracted from ShowAllEntityData.user.js) over
 * every stats page of a local copy of the mirror in Chromium, without the
 * rest of the userscript (org/brucebase.org Phase 13, batch 1), and reports
 * per page what the two buttons would make: the list's items, columns, link
 * kinds and tab paths, how many shows split into place columns, and the
 * tables with their names, columns and row counts. Lists the shapes that
 * would mean a read went wrong: a page that matches bb-stats with neither
 * shape, list items with an empty first cell, a show whose split has no
 * date, a table whose columns are all "Column N", a table row wider or
 * narrower than its columns. Writes debug/bb-stats-reader.json.
 *
 * usage: node scripts/check-bb-stats-reader.js [stats_dir]
 *   stats_dir: debug/bb-mirror/stats (scripts/copy-bb-stats-sample.sh)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'ShowAllEntityData.user.js');
const DIR = process.argv[2] || path.join(ROOT, 'debug', 'bb-mirror', 'stats');
const OUT = path.join(ROOT, 'debug', 'bb-stats-reader.json');

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
    const names = ['_rgEsc', '_bbText', '_bbAbsHref', '_BB_YEAR_TYPES', '_BB_CA_PROVINCES', '_BB_REGIONS', '_bbParseHeading',
        '_BB_TAB_LABEL_RE', '_bbParseTabLabel', '_bbRelationDisplayName', '_BB_STATS_PATH_RE', '_BB_STATS_SKIP_KINDS',
        '_BB_STATS_KIND_LABELS', '_bbStatsTurn', '_bbStatsTabPath', '_bbStatsLinkKind', '_bbStatsRead', '_bbStatsCellHtml',
        '_bbStatsListCols', '_bbStatsListRowHtml'];
    const prelude = 'const _isBbHost = false; const Lib = { debug() {} }; const _mbSiteTitleText = t => t;';
    const code = `${prelude}\n${names.map(n => extract(src, n)).join('\n')}`;
    const files = fs.readdirSync(DIR).filter(f => /^stats_.*\.html$/.test(f)).sort();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    const out = [];
    for (const f of files) {
        const html = fs.readFileSync(path.join(DIR, f), 'utf8');
        const name = f.replace(/^stats_/, '').replace(/\.html$/, '');
        const url = `https://brucebase.wikidot.com/stats:${name}`;
        out.push(await page.evaluate(({ code, html, url, name }) => {
            const api = new Function(`${code}\nreturn { _bbStatsRead, _bbStatsListCols, _bbStatsListRowHtml, _BB_STATS_PATH_RE };`)();
            const matches = api._BB_STATS_PATH_RE.test(`/stats:${name}`);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rec = api._bbStatsRead(doc, url) || { list: [], tables: [] };
            const cols = rec.list.length ? api._bbStatsListCols(rec.list) : [];
            const count = arr => Object.entries(arr.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
            const box = document.createElement('table');
            const firstEmpty = rec.list.filter((r) => {
                box.innerHTML = api._bbStatsListRowHtml(r, cols);
                return !box.rows[0].cells[0].textContent.trim();
            }).length;
            return {
                name, matches, items: rec.list.length, cols,
                kinds: count(rec.list.map(r => r.kind)),
                tabs: count(rec.list.map(r => r.tab.join(' › '))).slice(0, 6),
                tabDepth: Math.max(0, ...rec.list.map(r => r.tab.length)),
                shows: rec.list.filter(r => r.loc && r.loc.date).length,
                showsNoDate: rec.list.filter(r => r.loc && /^\d{4}/.test(r.text) && !r.loc.date).length,
                venues: rec.list.filter(r => r.kind === 'venue').length,
                turned: rec.list.filter(r => r.loc && / \((?:The|A|An)\)/.test(r.text)).length,
                notes: rec.list.filter(r => r.note).slice(0, 3).map(r => r.note),
                firstEmpty,
                tables: rec.tables.map(t => ({
                    name: t.name, cols: t.cols, rows: t.rows.length,
                    generic: t.cols.every(c => /^Column \d+$/.test(c)),
                    ragged: t.rows.filter(r => r.length !== t.cols.length).length,
                })),
            };
        }, { code, html, url, name }));
    }
    await browser.close();
    const m = out.filter(r => r.matches);
    const neither = m.filter(r => !r.items && !r.tables.length);
    const both = m.filter(r => r.items && r.tables.length);
    console.log(`${out.length} stats pages read, ${m.length} match bb-stats (${out.length - m.length} are fragments)`);
    console.log(`list: ${m.filter(r => r.items).length} pages, ${m.reduce((n, r) => n + r.items, 0)} items; ` +
        `tables: ${m.filter(r => r.tables.length).length} pages, ${m.reduce((n, r) => n + r.tables.length, 0)} tables; ` +
        `both: ${both.length}; neither: ${neither.length}`);
    const colSets = {};
    m.filter(r => r.items).forEach((r) => { const k = r.cols.join(' | '); (colSets[k] = colSets[k] || []).push(r.name); });
    console.log('\n== list column sets');
    Object.entries(colSets).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => console.log(`${String(v.length).padStart(4)}  ${k}   e.g. ${v.slice(0, 3).join(', ')}`));
    console.log('\n== problems');
    const prob = (label, rs) => console.log(`${label}: ${rs.length}${rs.length ? `  ${rs.slice(0, 8).map(r => r.name).join(', ')}` : ''}`);
    prob('path matches with neither shape (they stay bb-page)', neither);
    prob('lists with an empty first cell', m.filter(r => r.firstEmpty));
    prob('date-led items with no date', m.filter(r => r.showsNoDate));
    prob('pages with an all-"Column N" table', m.filter(r => r.tables.some(t => t.generic)));
    prob('pages with a ragged table', m.filter(r => r.tables.some(t => t.ragged)));
    console.log(`\ntab depth 2+: ${m.filter(r => r.tabDepth >= 2).map(r => r.name).join(', ') || 'none'}`);
    console.log(`turned venues: ${m.reduce((n, r) => n + r.turned, 0)}; shows split: ${m.reduce((n, r) => n + r.shows, 0)}`);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
