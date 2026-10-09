#!/usr/bin/env node
'use strict';

/**
 * Runs the Brucebase year-page converter (`applyBbYearToTable()` and its
 * helpers, extracted from ShowAllEntityData.user.js) over every year page the
 * probe cached in debug/bb-year-cache/ (scripts/probe-bb-year-pages.py), in
 * Chromium, without the rest of the userscript, and reports what it made:
 * rows against the page's own heading count, column fill rates, the
 * distinct Types / Countries / States / set labels / media labels / tours,
 * and the shapes that would mean a parse went wrong (an entry heading left
 * on the page, a Notes cell that looks like a setlist, a row with no date).
 *
 * usage: node scripts/check-bb-year-converter.js [YEAR ...]
 *        (default: every cached page)
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'debug', 'bb-year-cache');
const SCRIPT = path.join(ROOT, 'ShowAllEntityData.user.js');

/**
 * The bb-year block of the userscript: from its section comment to the
 * Brucebase stylesheet's JSDoc.
 *
 * @returns {string}
 */
function extractConverter() {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf('    // --- Brucebase year pages (`bb-year`)');
    const b = src.indexOf('    /**\n     * Installs the Brucebase stylesheet');
    if (a < 0 || b < a) throw new Error('bb-year block not found in the userscript');
    return src.slice(a, b);
}

/**
 * Converts the page in the browser and returns its statistics.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} code The converter block.
 * @returns {Promise<Object>}
 */
function convert(page, code) {
    return page.evaluate((code) => {
        const warns = [];
        const run = new Function('Lib', '_isBbHost', '_setTip',
            `${code}\nreturn { applyBbYearToTable, _bbYearEntries };`);
        const api = run({ warn: (...a) => warns.push(a.join(' ')), debug: () => {}, info: () => {} }, false,
            (el, t) => el.setAttribute('title', t));
        const content = document.getElementById('page-content');
        const headsBefore = api._bbYearEntries(content).length;
        api.applyBbYearToTable({ features: { bbYearToTable: true } }, document);
        const table = document.querySelector('table.mb-bb-year-table');
        if (!table) return { headsBefore, rows: 0, warns };
        const names = Array.from(table.tHead.rows[0].cells).map(c => c.textContent);
        const col = (n) => names.indexOf(n);
        const rows = Array.from(table.tBodies[0].rows);
        const cell = (r, n) => r.cells[col(n)];
        const tally = (n, f = (c) => c.textContent.trim()) => {
            const m = {};
            rows.forEach(r => {
                const v = f(cell(r, n));
                m[v] = (m[v] || 0) + 1;
            });
            return m;
        };
        const lis = (r, n) => cell(r, n).querySelectorAll(':scope > ul > li').length;
        const labels = {};
        rows.forEach(r => cell(r, 'Setlist').querySelectorAll('.mb-bb-set-label').forEach(s => {
            labels[s.textContent] = (labels[s.textContent] || 0) + 1;
        }));
        const media = {};
        rows.forEach(r => cell(r, 'Media').querySelectorAll('.mb-bb-media-label').forEach(s => {
            media[s.textContent] = (media[s.textContent] || 0) + 1;
        }));
        const left = Array.from(content.querySelectorAll(':scope > p > strong'))
            .filter(s => /^\d{4}-\d\d-\d\d/.test(s.textContent.trim())).map(s => s.textContent.trim());
        const notesLikeSet = rows.filter(r => / \/ [A-Z' ]{4,} \/ /.test(cell(r, 'Notes').textContent) &&
            !/[a-z]{4,}/.test(cell(r, 'Notes').textContent.split(' / ')[0]))
            .map(r => `${cell(r, 'Date').textContent} ${cell(r, 'Notes').textContent.slice(0, 80)}`);
        return {
            headsBefore, rows: rows.length, warns, left,
            noDate: rows.filter(r => !cell(r, 'Date').textContent).length,
            noVenue: rows.filter(r => !cell(r, 'Venue').textContent).length,
            noLink: rows.filter(r => !cell(r, 'Venue').querySelector('a')).length,
            noNotes: rows.filter(r => !cell(r, 'Notes').textContent.trim()).length,
            withSet: rows.filter(r => lis(r, 'Setlist') > 0).length,
            withSoundcheck: rows.filter(r => lis(r, 'Soundcheck') > 0).length,
            songs: rows.reduce((s, r) => s + lis(r, 'Setlist'), 0),
            noteLong: rows.filter(r => cell(r, 'Set note').textContent.length > 120)
                .map(r => `${cell(r, 'Date').textContent} ${cell(r, 'Set note').textContent.slice(0, 80)}`),
            types: tally('Type'), countries: tally('Country'), states: tally('State'), tours: tally('Tour'),
            setNotes: tally('Set note'), info: tally('Info wanted'), labels, media, notesLikeSet,
        };
    }, code);
}

/**
 * Adds one page's tally into the running total.
 *
 * @param {Object<string, number>} into
 * @param {Object<string, number>} from
 * @returns {void}
 */
function addTally(into, from) {
    Object.entries(from || {}).forEach(([k, v]) => { into[k] = (into[k] || 0) + v; });
}

/**
 * Prints a tally, largest first.
 *
 * @param {string} title
 * @param {Object<string, number>} t
 * @param {number} [limit]
 * @returns {void}
 */
function printTally(title, t, limit = 60) {
    console.log(`== ${title}`);
    Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, limit)
        .forEach(([k, v]) => console.log(`   ${String(v).padStart(6)}  ${k === '' ? '(empty)' : k}`));
}

/**
 * Runs the check over the requested years.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const code = extractConverter();
    const years = process.argv.slice(2).length ? process.argv.slice(2)
        : fs.readdirSync(CACHE).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, '')).sort();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const totals = { types: {}, countries: {}, states: {}, tours: {}, setNotes: {}, info: {}, labels: {}, media: {} };
    const problems = [];
    let rowsTotal = 0;
    for (const year of years) {
        const html = fs.readFileSync(path.join(CACHE, `${year}.html`), 'utf8')
            .replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
        await page.route('**/*', (r) => r.abort());
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const r = await convert(page, code);
        await page.unroute('**/*');
        rowsTotal += r.rows;
        console.log(`${year}: ${r.rows} rows (headings ${r.headsBefore}), set ${r.withSet}, soundcheck ${r.withSoundcheck}, ` +
            `songs ${r.songs}, no notes ${r.noNotes}, no date ${r.noDate}, no link ${r.noLink}` +
            (r.warns.length ? `, WARN ${r.warns.join(' | ')}` : ''));
        if (r.rows !== r.headsBefore) problems.push(`${year}: ${r.rows} rows for ${r.headsBefore} headings`);
        if (r.left?.length) problems.push(`${year}: headings left on the page: ${r.left.slice(0, 3).join(' | ')}`);
        if (r.noVenue) problems.push(`${year}: ${r.noVenue} row(s) without a venue`);
        (r.notesLikeSet || []).forEach(n => problems.push(`${year}: Notes looks like a setlist: ${n}`));
        (r.noteLong || []).forEach(n => problems.push(`${year}: long Set note: ${n}`));
        Object.keys(totals).forEach(k => addTally(totals[k], r[k]));
    }
    await browser.close();
    console.log(`== total rows: ${rowsTotal}`);
    printTally('Type', totals.types);
    printTally('Country', totals.countries);
    printTally('State', totals.states, 90);
    printTally('Set note', totals.setNotes, 40);
    printTally('Set labels (non-Soundcheck)', totals.labels, 40);
    printTally('Media', totals.media);
    printTally('Info wanted', totals.info);
    printTally('Tour', totals.tours, 400);
    console.log(`== problems: ${problems.length}`);
    problems.forEach(p => console.log(`   ${p}`));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
