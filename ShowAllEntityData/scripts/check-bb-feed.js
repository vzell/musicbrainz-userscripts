#!/usr/bin/env node
'use strict';

/**
 * The Brucebase feed, version 1 (org/bbp-parity.org): runs the SHIPPED
 * lookup over the same pages as the Python probe (scripts/probe-bb-feed.py)
 * and must come out equal to it.
 *
 * In the real userscript, loaded through the test harness with the feed
 * kept (`mb_sa_bb_feed`):
 *   1. every page the feed names: its facts (`__saTest.bbFeed(name)`), and
 *      the facts the page itself leaves standing (`live` read from its mirror
 *      file: the title as written, its tags, a breadcrumb link) — the probe
 *      found every kind true on its page, so none may be dropped;
 *   2. the rows each list would mark: the song: pages stats:songs links and
 *      the relation: pages stats:relations links (read from their mirror
 *      files: the wiki builds both from the first-letter tags, so neither
 *      lists every page of its category), every story: page tagged
 *      storyteller (from the run's all-sorted.txt) — the probe's counts and
 *      kinds;
 *   3. the shows marked through their dependent pages (the feed's `event`
 *      read backwards) — the probe's 25.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-feed.js FEED.json PROBE.json [--mirror DIR]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const args = process.argv.slice(2);
const mi = args.indexOf('--mirror');
const [FEED, PROBE] = args.filter((a, i) => !a.startsWith('--') && (mi < 0 || i !== mi + 1));
const MIRROR = fs.realpathSync(mi >= 0 ? args[mi + 1] : path.join(os.homedir(), 'git/scripts/BruceParser/bb/latest'));

/**
 * The mirror's file of a page name.
 *
 * @param {string} name - "story:story-1972-01-21-neptune-nj".
 * @returns {string}
 */
function fileOf(name) {
    const i = name.indexOf(':');
    return path.join(MIRROR, name.slice(0, i), `${name.slice(0, i)}_${name.slice(i + 1)}.html`);
}

/**
 * A Counter-like object of the kinds of the given facts lists.
 *
 * @param {Array<Array<{kind: string}>>} lists
 * @returns {Object<string, number>}
 */
function kinds(lists) {
    const out = {};
    lists.forEach(l => l.forEach((f) => { out[f.kind] = (out[f.kind] || 0) + 1; }));
    return out;
}

(async () => {
    if (!FEED || !PROBE) {
        console.error('usage: node scripts/check-bb-feed.js FEED.json PROBE.json [--mirror DIR]');
        process.exit(2);
    }
    const feed = JSON.parse(fs.readFileSync(FEED, 'utf8'));
    const probe = JSON.parse(fs.readFileSync(PROBE, 'utf8'));
    const lines = fs.readFileSync(path.join(MIRROR, 'all-sorted.txt'), 'latin1').split('\n')
        .map(l => l.split('>')).filter(p => p.length >= 3);
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs',
        fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_feed: true, mb_sa_bb_feed: { at: Date.now(), data: feed, err: '', errAt: 0 } },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbFeed);
    let diffs = 0;

    // 1. every page the feed names, against its own mirror file
    const names = Object.keys(feed.pages);
    const dropped = [];
    for (let at = 0; at < names.length; at += 40) {
        const part = names.slice(at, at + 40).map(n => [n, fs.readFileSync(fileOf(n), 'utf8')]);
        const res = await page.evaluate(all => all.map(([n, html]) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const t = doc.getElementById('page-title');
            const box = doc.querySelector('div.page-tags');
            const crumbs = doc.getElementById('breadcrumbs');
            const live = {
                title: t ? t.textContent.replace(/^\s+|\s+$/g, '') : null,
                tags: box ? Array.from(box.querySelectorAll('a[href*="/system:page-tags/tag/"]'), a => a.textContent.trim()).filter(Boolean) : null,
                parent: crumbs ? !!crumbs.querySelector('a[href]') : null,
            };
            const r = window.__saTest.bbFeed(n, live);
            const own = r.facts.filter(f => f.kind !== 'dependent-title' || f.deps.some(d => d.own));
            const keptOwn = r.kept.filter(f => f.kind !== 'dependent-title' || f.deps.some(d => d.own));
            return { n, own: own.map(f => f.kind), kept: keptOwn.map(f => f.kind) };
        }), part);
        res.forEach((r) => {
            const want = Object.keys(feed.pages[r.n]).sort().join(' ');
            if (r.own.slice().sort().join(' ') !== want) { diffs++; console.log(`facts ${r.n}: ${r.own} vs ${want}`); }
            if (r.kept.length !== r.own.length) dropped.push(`${r.n}: ${r.own.filter(k => !r.kept.includes(k))}`);
        });
    }
    console.log(`1. ${names.length} pages: facts as the feed's, ${dropped.length} kind(s) dropped by their own page (probe: ${probe.kindFalse.length})`);
    dropped.slice(0, 10).forEach(d => console.log(`   dropped ${d}`));
    if (dropped.length !== probe.kindFalse.length) diffs++;

    // 2. the lists
    // A stats list's rows: the pages of its category that its mirror file links.
    const listed = (cat, listPage) => {
        const linked = new Set(Array.from(fs.readFileSync(fileOf(listPage), 'utf8').matchAll(new RegExp(`href="/(${cat}:[^"#?/]+)"`, 'g')), m => m[1]));
        return lines.map(p => p[0]).filter(n => n.startsWith(`${cat}:`) && linked.has(n));
    };
    const lists = {
        'songs (stats:songs)': listed('song', 'stats:songs'),
        'relations (stats:relations)': listed('relation', 'stats:relations'),
        'tag storyteller (story:)': lines.filter(p => p[0].startsWith('story:') && p[2].split(/\s+/).includes('storyteller')).map(p => p[0]),
    };
    for (const [label, rows] of Object.entries(lists)) {
        const facts = await page.evaluate(ns => ns.map(n => window.__saTest.bbFeed(n).facts), rows);
        const marked = facts.filter(f => f.length);
        const got = { rows: rows.length, marked: marked.length, kinds: kinds(marked) };
        const want = probe.lists[label];
        const same = got.rows === want.rows && got.marked === want.marked && JSON.stringify(Object.entries(got.kinds).sort()) === JSON.stringify(Object.entries(want.kinds).sort());
        if (!same) diffs++;
        console.log(`2. ${label}: ${JSON.stringify(got)} ${same ? '= probe' : `≠ probe ${JSON.stringify(want)}`}`);
    }

    // 3. the shows marked through their dependent pages
    const shows = lines.map(p => p[0]).filter(n => /^(?:gig|nogig|recording|rehearsal|interview):/.test(n));
    const showFacts = await page.evaluate(ns => ns.map(n => [n, window.__saTest.bbFeed(n).facts
        .filter(f => f.kind === 'dependent-title').flatMap(f => f.deps.filter(d => !d.own).map(d => d.name))]), shows);
    const marked = showFacts.filter(([, d]) => d.length);
    const deps = marked.reduce((s, [, d]) => s + d.length, 0);
    const same = marked.length === probe.reverse.shows && deps === probe.reverse.dependents;
    if (!same) diffs++;
    console.log(`3. shows marked through a dependent page: ${marked.length} (${deps} pages) ${same ? '= probe' : `≠ probe ${probe.reverse.shows} (${probe.reverse.dependents})`}`);

    await browser.close();
    console.log(diffs ? `${diffs} difference(s)` : 'no difference');
    process.exit(diffs ? 1 : 0);
})();
