#!/usr/bin/env node
'use strict';

/**
 * Track A batch 3b, the tour family (org/springsteen-marriage.org; vzell,
 * 2026-11-19): runs the SHIPPED tag check of a Brucebase show with
 * `sa_bb_tag_family_tour` on and a kept feed over every event page of
 * BruceParser's mirror, and compares its tour findings with the Python
 * probe's rule (scripts/probe-bb-tour-tags.py --json FILE).
 *
 * Per event, in the real userscript loaded through the test harness:
 * `__saTest.bbTagFacts()` on the page, its own tags from the link previews'
 * parser (`__saTest.dpParse()`), the probe's tags of its other pages, and
 * `__saTest.bbTagCheck()`; the findings of family "tour" against the
 * probe's. A second pass with the setting off must find no tour finding at
 * all, and one with the feed lacking its tables neither.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-tour-tags.js ROWS.json RULE.json FEED.json [--mirror DIR]
 *   ROWS.json  scripts/probe-bb-batch3-findings.py --rows
 *   RULE.json  scripts/probe-bb-tour-tags.py ROWS.json TABLES.json --json
 *   FEED.json  a bb-feed.json of feed 1.4 (its tagTables are the probe's TABLES.json)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const args = process.argv.slice(2);
const mi = args.indexOf('--mirror');
const pos = args.filter((a, i) => !a.startsWith('--') && (mi < 0 || i !== mi + 1));
const [ROWS, RULE, FEED] = pos;
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
 * Loads the userscript on a Brucebase fixture with the given settings.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {Object<string, *>} settings - Merged on top of the fixture profile.
 * @returns {Promise<{page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext}>}
 */
async function open(browser, settings) {
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs',
        fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: settings,
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbTagCheck);
    return { page, context };
}

/**
 * The tour findings of every row, as the shipped check gives them.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<Object>} rows - The probe's rows.
 * @returns {Promise<Array<{missing: string[], spurious: string[], noWhy: string[]}>>}
 */
async function tourFindings(page, rows) {
    const out = [];
    const BATCH = 40;
    for (let at = 0; at < rows.length; at += BATCH) {
        const part = rows.slice(at, at + BATCH).map(r => ({
            name: r.name, html: fs.readFileSync(fileOf(r.name), 'utf8'),
            more: [].concat(...r.pages.map(p => p[1].map(t => t.toLowerCase()))),
        }));
        out.push(...await page.evaluate(list => list.map((x) => {
            const url = 'https://brucebase.wikidot.com/' + x.name;
            const facts = window.__saTest.bbTagFacts(x.html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', x.html, url);
            const own = ((rec && rec.tags) || []).map(t => t.text.toLowerCase());
            const res = window.__saTest.bbTagCheck(facts, own, x.more, null);
            const tour = list => list.filter(m => m.family === 'tour');
            return {
                missing: tour(res.missing).map(m => m.tag), spurious: tour(res.spurious).map(m => m.tag),
                noWhy: tour(res.missing.concat(res.spurious)).filter(m => !m.why).map(m => m.tag),
            };
        }), part));
    }
    return out;
}

(async () => {
    if (!ROWS || !RULE || !FEED) {
        console.error('usage: node scripts/check-bb-tour-tags.js ROWS.json RULE.json FEED.json [--mirror DIR]');
        process.exit(2);
    }
    const rows = JSON.parse(fs.readFileSync(ROWS, 'utf8'));
    const rule = JSON.parse(fs.readFileSync(RULE, 'utf8'));
    const feed = JSON.parse(fs.readFileSync(FEED, 'utf8'));
    const kept = data => ({ mb_sa_bb_feed: { at: Date.now() - 1000, data, err: '', errAt: 0 } });
    const browser = await chromium.launch();
    const sorted = list => list.slice().sort().join(' ');

    // 1. The family on, the feed kept: equal to the probe's rule.
    let { page, context } = await open(browser, { sa_bb_feed: true, sa_bb_tag_family_tour: true, ...kept(feed) });
    const got = await tourFindings(page, rows);
    await context.close();
    let diffs = 0;
    let flagged = 0;
    got.forEach((g, i) => {
        const r = rows[i];
        const want = rule[r.name] || { missing: [], spurious: [] };
        const bad = [];
        if (sorted(g.missing) !== sorted(want.missing)) bad.push(`missing [${sorted(g.missing)}] / probe [${sorted(want.missing)}]`);
        if (sorted(g.spurious) !== sorted(want.spurious)) bad.push(`spurious [${sorted(g.spurious)}] / probe [${sorted(want.spurious)}]`);
        if (g.noWhy.length) bad.push(`no reason given for ${g.noWhy.join(', ')}`);
        if (g.missing.length || g.spurious.length) flagged++;
        if (bad.length) {
            diffs++;
            if (diffs <= 40) console.log(`DIFF ${r.name}\n   ${bad.join('\n   ')}`);
        }
    });
    console.log(`${rows.length} events, the shipped tour check against the probe: ${diffs} differ; ${flagged} events flagged`);

    // 2. The family off, and 3. the feed without its tables: no tour finding.
    const quiet = [
        ['the setting off', { sa_bb_feed: true, sa_bb_tag_family_tour: false, ...kept(feed) }],
        ['a feed without tagTables', { sa_bb_feed: true, sa_bb_tag_family_tour: true, ...kept({ ...feed, tagTables: undefined }) }],
        ['the feed off', { sa_bb_feed: false, sa_bb_tag_family_tour: true, ...kept(feed) }],
    ];
    let loud = 0;
    for (const [label, settings] of quiet) {
        ({ page, context } = await open(browser, settings));
        const res = await tourFindings(page, rows);
        await context.close();
        const n = res.filter(g => g.missing.length || g.spurious.length).length;
        console.log(`${label}: ${n} events with a tour finding (want 0)`);
        loud += n;
    }
    await browser.close();
    process.exit(diffs || loud ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
