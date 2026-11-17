#!/usr/bin/env node
'use strict';

/**
 * The year reader's setlist notes (`_extBbParseYear()`, version 5;
 * fix/bb-year-setlist-note, 2026-11-18): runs the SHIPPED parser, in the
 * real userscript through the test harness, over every year page of the
 * Brucebase mirror and checks that no song of any show is, or ends with,
 * a note of its year page, a `<sup>` that ends a paragraph (read here with
 * a plain regex, independent of the parser): until version 5 the setlist paragraph's closing note
 * ("Incomplete setlist.") was the last song, and a paragraph holding only
 * "No set details known." a one-song setlist. Printed for information: the
 * shows with a `setlistNote`, and the `<sup>`s that end a paragraph (more:
 * some are not in a setlist paragraph, and the second entry on a shared
 * anchor is no show of its own).
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-year-setlist-notes.js [--mirror DIR] [--list]
 *   --list: also print every note with its count and a first show.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const args = process.argv.slice(2);
const mi = args.indexOf('--mirror');
const MIRROR = fs.realpathSync(mi >= 0 ? args[mi + 1] : path.join(os.homedir(), 'git/scripts/BruceParser/bb/latest'));
const LIST = args.includes('--list');

/**
 * A year page's notes, by a plain regex: the texts of the `<sup>`s that end
 * a paragraph (a setlist paragraph's note is always its end; a `<sup>`
 * elsewhere, a footnote mark inside prose, is no note).
 *
 * @param {string} html
 * @returns {{texts: string[], ending: number}}
 */
function rawSups(html) {
    const all = [...html.matchAll(/<sup>((?:(?!<\/sup>)[\s\S])*)<\/sup>\s*<\/p>/g)]
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
    return { texts: [...new Set(all.filter(Boolean))], ending: all.length };
}

(async () => {
    const files = fs.readdirSync(MIRROR).filter(f => /^(\d{4}|1949-64)\.html$/.test(f)).sort();
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs',
        fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.extBbParseYear);
    let raw = 0;
    let parsed = 0;
    let shows = 0;
    const glued = [];
    const byNote = new Map();
    for (const f of files) {
        const html = fs.readFileSync(path.join(MIRROR, f), 'utf8');
        const sups = rawSups(html);
        raw += sups.ending;
        const base = `https://brucebase.wikidot.com/${f.replace(/\.html$/, '')}`;
        const res = await page.evaluate(([h, b]) => {
            const y = window.__saTest.extBbParseYear(h, b);
            return Object.entries(y.shows).map(([a, s]) => ({ a, note: s.setlistNote || '', songs: s.setlist, n: s.setlist.length }));
        }, [html, base]);
        shows += res.length;
        res.forEach((r) => {
            if (r.note) {
                parsed++;
                const e = byNote.get(r.note) || { count: 0, first: `${f}#${r.a} (${r.n} songs)` };
                e.count++;
                byNote.set(r.note, e);
            }
            // The defect's shape: a song that IS a note ("No set details
            // known.") or ENDS with one ("… DO YOU LOVE ME Setlist may be …");
            // not any song merely containing a note's words (2016's prose
            // entries contain the note "Bruce Springsteen").
            const bad = r.songs.find(song => sups.texts.some(t => song === t || song.endsWith(` ${t}`)));
            if (bad) glued.push(`${f}#${r.a}: ${bad}`);
        });
    }
    await browser.close();
    console.log(`${files.length} year pages, ${shows} shows`);
    console.log(`shows with a setlistNote: ${parsed}; <sup>s ending a paragraph: ${raw} (information)`);
    console.log(`a song that is, or ends with, a note: ${glued.length}`);
    glued.slice(0, 10).forEach(g => console.log(`    ${g}`));
    if (LIST) [...byNote].sort((x, y) => y[1].count - x[1].count).forEach(([n, e]) => console.log(`    ${String(e.count).padStart(4)}  ${JSON.stringify(n).slice(0, 100)}  ${e.first}`));
    const ok = glued.length === 0 && parsed > 0;
    console.log(ok ? 'no difference' : 'DIFFERENCES');
    process.exit(ok ? 0 : 1);
})();
