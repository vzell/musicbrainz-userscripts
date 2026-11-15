#!/usr/bin/env node
'use strict';

/**
 * Track A batch 3 (org/bbp-parity.org): runs the SHIPPED tag check of a
 * Brucebase show over every event page of BruceParser's mirror and compares
 * it with the Python probe's result
 * (scripts/probe-bb-batch3-findings.py --rows FILE), which was compared with
 * BruceBaseParser's own functions (scripts/check-bbp-tag-oracle.js).
 *
 * Three things per event, in the real userscript loaded through the test
 * harness:
 *   1. what the page says (`__saTest.bbTagFacts()`: kind, date, day letter,
 *      premiere count), against the probe's own reading of the same file;
 *   2. the page's own tags as the link previews' parser reads them
 *      (`__saTest.dpParse()`: `tags`), against the probe's;
 *   3. the missing and the not-expected tags (`__saTest.bbTagCheck()`), fed
 *      with the shipped facts, the page's tags and the probe's tags of the
 *      show's other pages, against the probe's four families.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-batch3-findings.js ROWS.json [--mirror DIR]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const args = process.argv.slice(2);
const mi = args.indexOf('--mirror');
const ROWS = args.find((a, i) => !a.startsWith('--') && i !== mi + 1);
const MIRROR = fs.realpathSync(mi >= 0 ? args[mi + 1] : path.join(os.homedir(), 'git/scripts/BruceParser/bb/latest'));

/**
 * The mirror's file of a page name ("gig:1985-01-13-…").
 *
 * @param {string} name - The page name.
 * @returns {string} The file.
 */
function fileOf(name) {
    const i = name.indexOf(':');
    const cat = name.slice(0, i);
    return path.join(MIRROR, cat, cat + '_' + name.slice(i + 1) + '.html');
}

/**
 * A list of [tag, family] pairs as one sorted string.
 *
 * @param {Array<Array<string>>} pairs - The pairs.
 * @returns {string} "tag/family tag/family".
 */
function key(pairs) {
    return pairs.map(p => `${p[0]}/${p[1]}`).sort().join(' ');
}

(async () => {
    if (!ROWS) {
        console.error('usage: node scripts/check-bb-batch3-findings.js ROWS.json [--mirror DIR]');
        process.exit(2);
    }
    const rows = JSON.parse(fs.readFileSync(ROWS, 'utf8'));
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs',
        fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbTagCheck);

    let diffs = 0;
    let flagged = 0;
    const BATCH = 40;
    for (let at = 0; at < rows.length; at += BATCH) {
        const part = rows.slice(at, at + BATCH).map(r => ({
            name: r.name, html: fs.readFileSync(fileOf(r.name), 'utf8'),
            more: [].concat(...r.pages.map(p => p[1].map(t => t.toLowerCase()))),
        }));
        const got = await page.evaluate(list => list.map(x => {
            const url = 'https://brucebase.wikidot.com/' + x.name;
            const facts = window.__saTest.bbTagFacts(x.html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', x.html, url);
            const own = ((rec && rec.tags) || []).map(t => t.text.toLowerCase());
            const res = window.__saTest.bbTagCheck(facts, own, x.more);
            return { facts, own, missing: res.missing.map(m => [m.tag, m.family]), spurious: res.spurious.map(m => [m.tag, m.family]),
                noWhy: res.missing.concat(res.spurious).filter(m => !m.why && m.tag !== 'prem').map(m => m.tag) };
        }), part);
        got.forEach((g, i) => {
            const r = rows[at + i];
            const bad = [];
            if (JSON.stringify(g.facts) !== JSON.stringify(r.facts)) bad.push(`facts ${JSON.stringify(g.facts)} / probe ${JSON.stringify(r.facts)}`);
            if (g.own.join(' ') !== r.tags.join(' ')) bad.push(`own tags differ (${g.own.length} / probe ${r.tags.length})`);
            if (key(g.missing) !== key(r.four.missing)) bad.push(`missing [${key(g.missing)}] / probe [${key(r.four.missing)}]`);
            if (key(g.spurious) !== key(r.four.spurious)) bad.push(`spurious [${key(g.spurious)}] / probe [${key(r.four.spurious)}]`);
            if (g.noWhy.length) bad.push(`no reason given for ${g.noWhy.join(', ')}`);
            if (g.missing.length || g.spurious.length) flagged++;
            if (bad.length) {
                diffs++;
                if (diffs <= 40) console.log(`DIFF ${r.name}\n   ${bad.join('\n   ')}`);
            }
        });
    }
    await browser.close();
    console.log(`${rows.length} events, the shipped tag check against the probe: ${diffs} differ; ${flagged} events flagged`);
    process.exit(diffs ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
