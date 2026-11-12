#!/usr/bin/env node
'use strict';

/**
 * Runs Phase 13 batch 2's Brucebase readers (org/brucebase.org), extracted
 * from ShowAllEntityData.user.js, over whole page families of a local copy
 * of the mirror in Chromium, without the rest of the userscript:
 *
 * - `_bbTourCounts()` over every `stats:<song>-tour` page
 *   (scripts/copy-bb-stats-tours.sh → debug/bb-mirror/stats-tour/): the
 *   tour rows, the box of other shows, notes; pages with no tour row (they
 *   stay bb-page's), a box the reader missed (the page's "Performed at"
 *   sentences against the rows read), a tour with more played than shows.
 * - `_bbSessionsRead()` over every `*-studio-sessions*` page of
 *   debug/bb-mirror/stats/: the tables, their names and columns, how many
 *   takes split into Song / Version / Take / Date; tables whose columns are
 *   all "Column N", a ragged row, a "Song Title" column of takes left
 *   unsplit, a take whose version keeps a bracket; the notes under the
 *   tables — the page's paragraphs beginning "Note:" against the notes
 *   read, and the ones missed (a Note paragraph not right after a table).
 * - `_bbSplitVersion()` over every take name of those pages and of
 *   debug/bb-mirror/ott/: the Take and Date shapes, and what is left beside
 *   the version.
 *
 * Writes debug/bb-tours-sessions.json.
 *
 * usage: node scripts/check-bb-tours-sessions.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'ShowAllEntityData.user.js');
const MIRROR = path.join(ROOT, 'debug', 'bb-mirror');
const OUT = path.join(ROOT, 'debug', 'bb-tours-sessions.json');

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
 * Lists a mirror folder's pages matching `re`.
 *
 * @param {string} dir
 * @param {RegExp} re
 * @returns {string[]}
 */
function pages(dir, re) {
    const d = path.join(MIRROR, dir);
    return fs.existsSync(d) ? fs.readdirSync(d).filter(f => re.test(f)).sort().map(f => path.join(d, f)) : [];
}

/**
 * Reads every page in the browser and prints the summary.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const names = ['_rgEsc', '_bbText', '_dpText', '_bbAbsHref', '_BB_TAB_LABEL_RE', '_bbParseTabLabel', '_BB_STATS_SKIP_KINDS',
        '_bbStatsTurn', '_bbStatsTabPath', '_bbStatsLinkKind', '_bbStatsRead', '_bbStatsCellHtml', '_BB_YEAR_TYPES',
        '_BB_CA_PROVINCES', '_BB_REGIONS', '_bbParseHeading', '_bbTourCounts', '_BB_SONG_TOURS_PATH_RE', '_bbSplitVersion',
        '_bbSessionsRead', '_BB_SESSIONS_PATH_RE'];
    const prelude = 'const _isBbHost = false; const Lib = { debug() {} }; const _mbSiteTitleText = t => t;';
    const code = `${prelude}\n${names.map(n => extract(src, n)).join('\n')}`;
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    const run = (fn, file) => page.evaluate(fn, { code, html: fs.readFileSync(file, 'utf8'), file: path.basename(file) });

    const tours = [];
    for (const f of pages('stats-tour', /^stats_.*-tour\.html$/)) {
        tours.push(await run(({ code, html, file }) => {
            const api = new Function(`${code}\nreturn { _bbTourCounts, _BB_SONG_TOURS_PATH_RE };`)();
            const name = file.replace(/^stats_/, '').replace(/\.html$/, '');
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const root = doc.getElementById('page-content');
            const rec = api._bbTourCounts(root);
            const said = (root.textContent.replace(/\s+/g, ' ').match(/Performed at \d+ show\(s\) of/g) || []).length;
            return {
                name, matches: api._BB_SONG_TOURS_PATH_RE.test(`/stats:${name}`), tours: rec.tours.length, said,
                played: rec.tours.filter(t => t.played).length, other: rec.other,
                notes: rec.tours.filter(t => t.note).map(t => t.note),
                over: rec.tours.filter(t => t.played > t.shows).map(t => t.tour),
                noTour: rec.tours.filter(t => !t.tour).length,
            };
        }, f));
    }

    const sessions = [];
    const versions = [];
    for (const f of pages('stats', /^stats_.*-studio-sessions.*\.html$/)) {
        sessions.push(await run(({ code, html, file }) => {
            const api = new Function(`${code}\nreturn { _bbSessionsRead, _bbSplitVersion, _bbStatsRead, _BB_SESSIONS_PATH_RE };`)();
            const name = file.replace(/^stats_/, '').replace(/\.html$/, '');
            const url = `https://brucebase.wikidot.com/stats:${name}`;
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rec = api._bbSessionsRead(doc, url);
            const strip = h => h.replace(/<[^>]+>/g, '').trim();
            const noteRe = /^Notes?\s*:/i;
            const saidP = Array.from(doc.querySelectorAll('#page-content p')).filter(x => noteRe.test(x.textContent.replace(/\s+/g, ' ').trim()));
            const st = api._bbStatsRead(doc, url, { minRows: 1 }) || { tables: [] };
            const readFirst = { size: st.tables.filter(t => t.notes.length).length };
            const missed = saidP.filter((x) => {
                let prev = x.previousElementSibling;
                while (prev && ((prev.tagName === 'P' && !prev.textContent.trim()) || prev.classList.contains('image-container'))) prev = prev.previousElementSibling;
                return !(prev && prev.tagName === 'TABLE');
            }).map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 70));
            return {
                notesSaid: saidP.length, notesRead: readFirst.size, notesMissed: missed,
                notedRows: rec ? rec.tables.reduce((n, t) => n + (t.cols.includes('Note') ? t.rows.filter(r => r[t.cols.indexOf('Note')]).length : 0), 0) : 0,
                name, matches: api._BB_SESSIONS_PATH_RE.test(`/stats:${name}`),
                album: rec && rec.album ? rec.album.text : '', released: rec ? rec.released : '', label: rec ? rec.label : '',
                sections: rec ? rec.sections : [], links: rec ? rec.links : {}, overview: rec ? rec.overview.length : 0,
                tables: rec ? rec.tables.map(t => ({
                    name: t.name, cols: t.cols, rows: t.rows.length,
                    generic: t.cols.every(c => /^Column \d+$/.test(c)),
                    ragged: t.rows.filter(r => r.length !== t.cols.length).length,
                    split: t.cols.includes('Version') ? t.rows.length : 0,
                    unsplit: t.cols.includes('Song Title') ? t.rows.filter(r => / - V\d/.test(strip(r[t.cols.indexOf('Song Title')]))).length : 0,
                    bracket: t.cols.includes('Version') ? t.rows.filter(r => /\(/.test(strip(r[t.cols.indexOf('Version')]))).map(r => strip(r[t.cols.indexOf('Version')])).slice(0, 4) : [],
                })) : [],
            };
        }, f));
    }
    for (const f of [...pages('stats', /^stats_.*-studio-sessions.*\.html$/), ...pages('ott', /\.html$/), ...pages('song', /\.html$/)]) {
        versions.push(...await run(({ code, html }) => {
            const api = new Function(`${code}\nreturn { _bbSplitVersion };`)();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return Array.from(doc.querySelectorAll('#page-content td'))
                .map(td => td.textContent.replace(/\s+/g, ' ').trim())
                .filter(t => / - V\d/.test(t) && t.length < 140)
                .map(t => ({ t, ...api._bbSplitVersion(t) }));
        }, f));
    }
    await browser.close();

    const prob = (label, rs, show = r => r.name) => console.log(`${label}: ${rs.length}${rs.length ? `  ${rs.slice(0, 8).map(show).join(', ')}` : ''}`);
    const tm = tours.filter(r => r.matches);
    console.log(`== tour pages: ${tours.length} read, ${tm.length} match the path`);
    console.log(`with tour rows (bb-song-tours): ${tm.filter(r => r.tours).length}; only other shows (stay bb-page): ${tm.filter(r => !r.tours && r.other).length}; nothing: ${tm.filter(r => !r.tours && !r.other).length}`);
    console.log(`tour rows: ${tm.reduce((n, r) => n + r.tours, 0)}, played > 0: ${tm.reduce((n, r) => n + r.played, 0)}, max per page: ${Math.max(...tm.map(r => r.tours))}`);
    console.log(`notes: ${[...new Set(tm.flatMap(r => r.notes))].join(' | ') || 'none'}`);
    prob('pages where boxes said != rows read', tm.filter(r => r.said !== r.tours), r => `${r.name} (${r.said}/${r.tours})`);
    prob('tours with more played than shows', tm.filter(r => r.over.length), r => `${r.name}: ${r.over.join('; ')}`);
    prob('rows with no tour name', tm.filter(r => r.noTour));

    const sm = sessions.filter(r => r.matches);
    console.log(`\n== studio-session pages: ${sessions.length} read, ${sm.length} match the path`);
    console.log(`with a table (bb-sessions): ${sm.filter(r => r.tables.length).length}; no table: ${sm.filter(r => !r.tables.length).map(r => r.name).join(', ') || 'none'}`);
    console.log(`tables: ${sm.reduce((n, r) => n + r.tables.length, 0)}; takes split: ${sm.reduce((n, r) => n + r.tables.reduce((k, t) => k + t.split, 0), 0)}`);
    const main = sm.filter(r => /-studio-sessions$/.test(r.name));
    console.log(`main pages: ${main.length}; with album ${main.filter(r => r.album).length}, released ${main.filter(r => r.released).length}, label ${main.filter(r => r.label).length}, overview ${main.filter(r => r.overview).length}`);
    const colSets = {};
    sm.forEach(r => r.tables.forEach((t) => { const k = t.cols.join(' | '); colSets[k] = (colSets[k] || 0) + 1; }));
    console.log('column sets:');
    Object.entries(colSets).sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log(`${String(v).padStart(5)}  ${k}`));
    prob('pages with an all-"Column N" table', sm.filter(r => r.tables.some(t => t.generic)), r => `${r.name} [${r.tables.filter(t => t.generic).map(t => t.name).join('; ')}]`);
    prob('pages with a ragged table', sm.filter(r => r.tables.some(t => t.ragged)));
    prob('pages with takes left in a Song Title column', sm.filter(r => r.tables.some(t => t.unsplit)), r => `${r.name} [${r.tables.filter(t => t.unsplit).map(t => t.name).join('; ')}]`);
    console.log(`notes: ${sm.reduce((n, r) => n + r.notesSaid, 0)} "Note:" paragraphs, ${sm.reduce((n, r) => n + r.notesRead, 0)} notes read, on ${sm.reduce((n, r) => n + r.notedRows, 0)} rows`);
    prob('pages where a "Note:" paragraph does not follow a table', sm.filter(r => r.notesMissed.length), r => `${r.name}: ${r.notesMissed.slice(0, 2).join(' / ')}`);
    prob('pages with a bracket left in Version', sm.filter(r => r.tables.some(t => t.bracket.length)), r => `${r.name}: ${r.tables.flatMap(t => t.bracket).slice(0, 3).join(' / ')}`);

    console.log(`\n== take names: ${versions.length}; with a version ${versions.filter(v => v.version).length}, a take ${versions.filter(v => v.take).length}, a date ${versions.filter(v => v.date).length}`);
    const left = {};
    versions.filter(v => v.version).forEach((v) => { const k = v.version.replace(/^V\d+[A-Za-z]*\d*\s*/, '').replace(/\d+/g, 'N'); if (k) left[k] = (left[k] || 0) + 1; });
    console.log('left beside the version:');
    Object.entries(left).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`${String(v).padStart(5)}  ${k}`));
    console.log(`takes: ${[...new Set(versions.map(v => v.take).filter(Boolean))].slice(0, 20).join(', ')}`);
    console.log(`dates: ${[...new Set(versions.map(v => v.date).filter(Boolean))].slice(0, 16).join(' | ')}`);
    prob('names with " - V" and no version', versions.filter(v => !v.version), v => v.t);

    fs.writeFileSync(OUT, JSON.stringify({ tours, sessions, versions }, null, 1));
    console.log(`\nwrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
