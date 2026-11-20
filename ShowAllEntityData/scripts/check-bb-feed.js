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
 *      file: the title as written, its tags, a breadcrumb link, its
 *      pictures) — the probe found every kind true on its page, so none may
 *      be dropped. Feed 1.1's `date-parts` is two kinds in the script,
 *      `date-missing` and `date-wrong`, one per list it has;
 *   2. the rows each list would mark: the song: pages stats:songs links and
 *      the relation: pages stats:relations links (read from their mirror
 *      files: the wiki builds both from the first-letter tags, so neither
 *      lists every page of its category), every story: page tagged
 *      storyteller (from the run's all-sorted.txt) — the probe's counts and
 *      kinds;
 *   3. the shows marked through their dependent pages (the feed's `event`
 *      read backwards) — the probe's 25 of dependent-title, and since
 *      2026-11-20 those of feed 1.6's dependent-name (the probe's
 *      `reverseName`);
 *   4. (feed 1.2) every row of every year listing of the mirror, its show
 *      found by the shipped `_bbFeedAnchorPage()` (the row's anchor and
 *      date) — the probe's rows, marked rows and kinds;
 *   5. (feed 1.3) every MusicBrainz event of the probe, through the shipped
 *      `_bbFeedMbFact()` on a MusicBrainz page with the feed kept — the
 *      probe's kinds, event by event.
 *   6. (feed 1.8, with --works FILE: scripts/probe-bb-mb-works.py's output)
 *      every work the probe or the feed marks, through the shipped
 *      `_bbFeedMbwFact()` on a works page with the feed kept — the probe's
 *      kind, work by work, and words for each.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-feed.js FEED.json PROBE.json [--mirror DIR] [--works WORKS-PROBE.json]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const args = process.argv.slice(2);
const mi = args.indexOf('--mirror');
const wi = args.indexOf('--works');
const WORKS_PROBE = wi >= 0 ? args[wi + 1] : '';
const [FEED, PROBE] = args.filter((a, i) => !a.startsWith('--') && (mi < 0 || i !== mi + 1) && (wi < 0 || i !== wi + 1));
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
                images: doc.getElementById('page-content')
                    ? Array.from(doc.getElementById('page-content').querySelectorAll('img[src]'))
                        .filter(img => !/\/local--files\/content:files\//.test(img.getAttribute('src') || '')).length
                    : null,
            };
            const r = window.__saTest.bbFeed(n, live);
            const own = r.facts.filter(f => f.kind !== 'dependent-title' || f.deps.some(d => d.own));
            const keptOwn = r.kept.filter(f => f.kind !== 'dependent-title' || f.deps.some(d => d.own));
            return { n, own: own.map(f => f.kind), kept: keptOwn.map(f => f.kind) };
        }), part);
        res.forEach((r) => {
            const want = Object.entries(feed.pages[r.n]).flatMap(([k, v]) => (k === 'date-parts'
                ? [...(v.missing && v.missing.length ? ['date-missing'] : []), ...(v.wrong && v.wrong.length ? ['date-wrong'] : [])]
                : [k])).sort().join(' ');
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
        // feed 1.1: the tag pages the new kinds show up on
        'tag files': lines.filter(p => p[2].split(/\s+/).includes('files')).map(p => p[0]),
        'tag news': lines.filter(p => p[2].split(/\s+/).includes('news')).map(p => p[0]),
        'tag media': lines.filter(p => p[2].split(/\s+/).includes('media')).map(p => p[0]),
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

    // 4. the year listings, through the feed's anchors (feed 1.2)
    if (probe.listings) {
        const rows = [];
        fs.readdirSync(MIRROR).filter(f => /^\d{4}(-\d\d)?-list\.html$/.test(f)).sort().forEach((f) => {
            const src = fs.readFileSync(path.join(MIRROR, f), 'utf8');
            for (const m of src.matchAll(/<li><a href="\/(\d{4}(?:-\d\d)?#[0-9a-z]+)">([\s\S]*?)<\/a>/g)) {
                const d = m[2].replace(/<[^>]+>/g, '').match(/^\s*(\d{4}-\d{2}-\d{2})/);
                rows.push([`https://brucebase.wikidot.com/${m[1]}`, d ? d[1] : '']);
            }
        });
        const res = await page.evaluate(rs => rs.map(([h, d]) => {
            const n = window.__saTest.bbFeedAnchor(h, d);
            return n ? window.__saTest.bbFeed(n).facts.map(f => f.kind) : [];
        }), rows);
        const markedL = res.filter(k => k.length);
        const got = { rows: rows.length, marked: markedL.length, kinds: {} };
        markedL.forEach(ks => ks.forEach((k) => { got.kinds[k] = (got.kinds[k] || 0) + 1; }));
        const want = probe.listings;
        const same = got.rows === want.rows && got.marked === want.marked && JSON.stringify(Object.entries(got.kinds).sort()) === JSON.stringify(Object.entries(want.kinds).sort());
        if (!same) diffs++;
        console.log(`4. listings: ${JSON.stringify(got)} ${same ? '= probe' : `≠ probe ${JSON.stringify({ rows: want.rows, marked: want.marked, kinds: want.kinds })}`}`);
    }

    // 5. the MusicBrainz part (feed 1.3), on a MusicBrainz page
    if (probe.mb && feed.mb) {
        const mbPage = await context.newPage();
        await loadUserscriptPage(mbPage, {
            url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
            fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', 'html-fetch-transient-events.html'), testMode: true,
            settingsOverride: { sa_bb_feed: true, sa_bb_feed_mb: true, mb_sa_bb_feed: { at: Date.now(), data: feed, err: '', errAt: 0 } },
        });
        await mbPage.waitForFunction(() => window.__saTest && window.__saTest.bbFeedMb);
        const ids = Object.keys(feed.mb);
        const got = await mbPage.evaluate(xs => xs.map(x => { const r = window.__saTest.bbFeedMb(x); return [x, r.on, r.fact ? r.fact.kind : '', !!r.text]; }), ids);
        const kindsMb = {};
        let off = 0;
        let noText = 0;
        got.forEach(([, on, kind, text]) => { if (!on) off++; if (!text) noText++; kindsMb[kind] = (kindsMb[kind] || 0) + 1; });
        const want = probe.mb.byKind;
        const same = off === 0 && noText === 0 && JSON.stringify(Object.entries(kindsMb).sort()) === JSON.stringify(Object.entries(want).sort()) && (probe.mb.differ || []).length === 0;
        if (!same) diffs++;
        console.log(`5. MusicBrainz events: ${JSON.stringify(kindsMb)}${off ? `, ${off} not on` : ''}${noText ? `, ${noText} without words` : ''} ${same ? '= probe' : `≠ probe ${JSON.stringify(want)}`}`);
        await mbPage.close();
    }

    // 6. the MusicBrainz works (feed 1.8), on a works page
    if (WORKS_PROBE) {
        const wprobe = JSON.parse(fs.readFileSync(WORKS_PROBE, 'utf8'));
        const wPage = await context.newPage();
        await loadUserscriptPage(wPage, {
            url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works',
            fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', 'artist-works-pending-edits.html'), testMode: true,
            settingsOverride: { sa_bb_feed: true, sa_bb_feed_mb: true, mb_sa_bb_feed: { at: Date.now(), data: feed, err: '', errAt: 0 } },
        });
        await wPage.waitForFunction(() => window.__saTest && window.__saTest.bbFeedMbw);
        const ids = [...new Set([...Object.keys(wprobe.marks || {}), ...Object.keys(feed.mbWorks || {})])];
        const got = await wPage.evaluate(xs => xs.map((x) => { const r = window.__saTest.bbFeedMbw(x); return [x, r.fact ? r.fact.kind : '', !!r.text]; }), ids);
        const bad = got.filter(([id, kind, text]) => kind !== ((wprobe.marks || {})[id] || {}).kind || !text);
        if (bad.length) diffs++;
        const kindsW = {};
        got.forEach(([, kind]) => { kindsW[kind] = (kindsW[kind] || 0) + 1; });
        console.log(`6. MusicBrainz works: ${JSON.stringify(kindsW)} ${bad.length ? `≠ probe: ${JSON.stringify(bad.slice(0, 5))}` : '= probe'}`);
        await wPage.close();
    }

    // 3. the shows marked through their dependent pages: titled differently
    // (dependent-title, the probe's `reverse`) and, feed 1.6, named
    // differently (dependent-name, the probe's `reverseName`; its shows may
    // also be nobruce pages, as feed.sh's check allows)
    const shows = lines.map(p => p[0]).filter(n => /^(?:gig|nogig|recording|rehearsal|interview|nobruce):/.test(n));
    for (const [kind, want, label] of [['dependent-title', probe.reverse, 'a dependent page'],
        ['dependent-name', probe.reverseName, 'a dependent page named differently']]) {
        if (!want) continue;
        const showFacts = await page.evaluate(([ns, k]) => ns.map(n => [n, window.__saTest.bbFeed(n).facts
            .filter(f => f.kind === k).flatMap(f => f.deps.filter(d => !d.own).map(d => d.name))]), [shows, kind]);
        const marked = showFacts.filter(([, d]) => d.length);
        const deps = marked.reduce((s, [, d]) => s + d.length, 0);
        const same = marked.length === want.shows && deps === want.dependents;
        if (!same) diffs++;
        console.log(`3. shows marked through ${label}: ${marked.length} (${deps} pages) ${same ? '= probe' : `≠ probe ${want.shows} (${want.dependents})`}`);
    }

    await browser.close();
    console.log(diffs ? `${diffs} difference(s)` : 'no difference');
    process.exit(diffs ? 1 : 0);
})();
