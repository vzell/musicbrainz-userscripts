#!/usr/bin/env node
'use strict';

/**
 * Track A batch 2 part 3 (org/bbp-parity.org): runs the SHIPPED setlist
 * comparison of the Brucebase year table over BruceParser's mirror.
 *
 * In the real userscript, loaded through the test harness, for every entry
 * of every year page that has a page of its own:
 *   - the year page's sets as the row's carrier holds them
 *     (`__saTest.bbYearSets()`: `_bbYearEntries()`, `_bbYearBuildRow()`);
 *   - the event page's sets (`__saTest.bbSetlistRaw()`);
 *   - `__saTest.bbSetlistCheck()`: songs | spelling, and sections.
 * Prints the counts, and compares the flagged events with the Python
 * probe's (scripts/probe-bb-batch2-findings.py --json FILE) and with
 * BruceParser's own report (<mirror>/REPORTING/setlist-differences.txt).
 * The probe's readers are simple ones of its own: a difference is listed,
 * not an error.
 *
 * Read-only, no network.
 *
 * usage: node scripts/check-bb-setlist-findings.js [FLAGGED.json] [--mirror DIR] [--out FILE] [--show EVENT]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const FLAGGED = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const MIRROR = fs.realpathSync(opt('--mirror') || path.join(os.homedir(), 'git/scripts/BruceParser/bb/latest'));
const OUT = opt('--out');
const SHOW = opt('--show');

/**
 * The mirror's file of an event link ("/gig:1985-…").
 *
 * @param {string} href
 * @returns {string}
 */
function eventFile(href) {
    const [kind, slug] = href.replace(/^\//, '').split(':');
    return path.join(MIRROR, kind, `${kind}_${slug}.html`);
}

/**
 * Checks every entry and prints the result.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.route(/^https?:\/\//, route => (route.request().url().startsWith('https://brucebase.wikidot.com/stats:songs')
        ? route.fallback() : route.abort('blockedbyclient')));
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs', fixtureFile: path.join(ROOT, 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_foreign_mb_titles: false, sa_foreign_typography: false },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbSetlistCheck && window.__saTest.bbYearSets);
    console.log(`Mirror: ${MIRROR}`);
    console.log(`Browser: Chromium ${browser.version()}, GM stubs`);
    const years = fs.readdirSync(MIRROR).filter(f => /^\d{4}(-\d\d)?\.html$/.test(f)).map(f => f.slice(0, -5)).sort();
    const stats = {};
    const bump = (k) => { stats[k] = (stats[k] || 0) + 1; };
    const flagged = { songs: [], spelling: [], sections: [] };
    for (const year of years) {
        const entries = await page.evaluate(h => window.__saTest.bbYearSets(h), fs.readFileSync(path.join(MIRROR, `${year}.html`), 'utf8'));
        const jobs = entries.filter(e => /^\/[a-z]+:/.test(e.href) && fs.existsSync(eventFile(e.href)));
        bump.n = (bump.n || 0) + entries.length;
        for (let i = 0; i < jobs.length; i += 40) {
            const part = jobs.slice(i, i + 40);
            const res = await page.evaluate(list => list.map((e) => {
                const ev = window.__saTest.bbSetlistRaw(e.html);
                if (!ev) return { none: true };
                const df = window.__saTest.bbSetlistDiff(e.sets || [], ev);
                return { checks: window.__saTest.bbSetlistCheck(e.sets || [], ev), ev, yLabels: df.yLabels, dLabels: df.dLabels, diff: df.items.filter(x => x.t !== 'same').slice(0, 8) };
            }), part.map(e => ({ sets: e.sets, html: fs.readFileSync(eventFile(e.href), 'utf8') })));
            res.forEach((r, k) => {
                const key = part[k].href.slice(1);
                if (r.none) { bump('event pages without a Setlist tab'); return; }
                bump('compared');
                if (!r.checks.length) bump('equal');
                r.checks.forEach((c) => { bump(c); flagged[c].push({ year, event: key, yLabels: r.yLabels, dLabels: r.dLabels, diff: r.diff }); });
                if (SHOW && key === SHOW) console.log(JSON.stringify({ year: part[k].sets, event: r.ev, checks: r.checks, diff: r.diff }, null, 1));
            });
        }
    }
    await browser.close();
    console.log(`Year entries: ${bump.n}; ${JSON.stringify(stats)}`);
    const ours = k => new Set(flagged[k].map(r => r.event));
    const list = (label, set) => console.log(`    ${label}: ${set.length}${set.length ? `, e.g. ${set.slice(0, 10).join(' ')}` : ''}`);
    if (FLAGGED) {
        const probe = JSON.parse(fs.readFileSync(FLAGGED, 'utf8'));
        [['songs', 'bb-setlist-songs'], ['spelling', 'bb-setlist-spelling']].forEach(([k, id]) => {
            const theirs = new Set((probe[id] || []).map(r => r.event));
            const mine = ours(k);
            console.log(`  ${id}: script ${mine.size}, probe ${theirs.size}, both ${Array.from(mine).filter(x => theirs.has(x)).length}`);
            list('only the script', Array.from(mine).filter(x => !theirs.has(x)).sort());
            list('only the probe', Array.from(theirs).filter(x => !mine.has(x)).sort());
        });
    }
    const rep = path.join(MIRROR, 'REPORTING', 'setlist-differences.txt');
    if (fs.existsSync(rep)) {
        const theirs = new Set();
        fs.readFileSync(rep, 'utf8').split('\n').forEach((line) => {
            const m = line.trim().match(/^([\w'-]+):([a-z]+)/);
            if (m) theirs.add(`${m[2]}:${m[1]}`);
        });
        const mine = new Set([...ours('songs'), ...ours('spelling'), ...ours('sections')]);
        console.log(`  all three against BruceParser's setlist-differences.txt: script ${mine.size}, report ${theirs.size}, both ${Array.from(mine).filter(x => theirs.has(x)).length}`);
        list('only the script', Array.from(mine).filter(x => !theirs.has(x)).sort());
        list('only the report', Array.from(theirs).filter(x => !mine.has(x)).sort());
    }
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(flagged, null, 1));
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
