#!/usr/bin/env node
'use strict';

/**
 * Parity batch 4 (org/bbp-parity.org): runs the SHIPPED tag check of a
 * Brucebase venue, song, relation or release page over every such page of
 * BruceParser's mirror and compares it with the Python probe's shipped rule
 * (scripts/probe-bb-page-tags.py --rows FILE, its `ship` and `facts`),
 * whose BruceBaseParser reading was compared with BruceBaseParser's own
 * functions (scripts/check-bbp-page-tag-oracle.js).
 *
 * Three things per page, in the real userscript loaded through the test
 * harness:
 *   1. what the page says (`__saTest.bbTagFacts()`), against the probe's
 *      facts; null exactly where the probe skips the page (a redirect, a
 *      "-N" page without tabs, a release's tab page);
 *   2. the page's own tags as the link previews' parser reads them
 *      (`__saTest.dpParse()`: `tags`), against the probe's;
 *   3. the missing and the not-expected tags (`__saTest.bbTagCheck()`), fed
 *      with the shipped facts, the page's tags and the probe's tags of its
 *      "-N" siblings, against the probe's shipped rule.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-page-tag-findings.js ROWS.json [--mirror DIR]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const args = process.argv.slice(2);
const mi = args.indexOf('--mirror');
const ROWS = args.find((a, i) => !a.startsWith('--') && (mi < 0 || i !== mi + 1));
const MIRROR = fs.realpathSync(mi >= 0 ? args[mi + 1] : path.join(os.homedir(), 'git/scripts/BruceParser/bb/latest'));

/**
 * The mirror's file of a page name ("venue:stone-pony-asbury-park-nj").
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
 * The probe's {family: [tag]} as one sorted "tag/family" string.
 *
 * @param {Object<string, string[]>} byFam - The probe's map.
 * @returns {string} "tag/family tag/family".
 */
function probeKey(byFam) {
    return Object.entries(byFam || {}).flatMap(([f, ts]) => ts.map(t => `${t}/${f}`)).sort().join(' ');
}

/**
 * The shipped check's [{tag, family}] as one sorted "tag/family" string.
 *
 * @param {Array<Array<string>>} pairs - [tag, family] pairs.
 * @returns {string} "tag/family tag/family".
 */
function key(pairs) {
    return pairs.map(p => `${p[0]}/${p[1]}`).sort().join(' ');
}

(async () => {
    if (!ROWS) {
        console.error('usage: node scripts/check-bb-page-tag-findings.js ROWS.json [--mirror DIR]');
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
    let skipped = 0;
    const byKind = {};
    const BATCH = 40;
    for (let at = 0; at < rows.length; at += BATCH) {
        const part = rows.slice(at, at + BATCH).map(r => ({
            name: r.name, html: fs.readFileSync(fileOf(r.name), 'utf8'), more: r.more,
        }));
        const got = await page.evaluate(list => list.map(x => {
            const url = 'https://brucebase.wikidot.com/' + x.name;
            const facts = window.__saTest.bbTagFacts(x.html, url);
            const rec = window.__saTest.dpParse('brucebase.wikidot.com', x.html, url);
            const own = ((rec && rec.tags) || []).map(t => t.text.toLowerCase());
            const res = window.__saTest.bbTagCheck(facts, own, x.more, null);
            return {
                facts, own, recFacts: !!(rec && rec.bbTagFacts),
                missing: res.missing.map(m => [m.tag, m.family]), spurious: res.spurious.map(m => [m.tag, m.family]),
                noWhy: res.missing.concat(res.spurious).filter(m => !m.why).map(m => m.tag),
            };
        }), part);
        got.forEach((g, i) => {
            const r = rows[at + i];
            const bad = [];
            if (r.ship.skip) {
                skipped++;
                if (g.facts !== null) bad.push(`facts for a page the probe skips (${r.ship.skip})`);
            } else if (!g.facts) {
                bad.push('no facts for a page the probe checks');
            } else {
                const f = g.facts;
                const mine = { letter: f.letter, construction: f.construction, lyricsheet: f.lyricsheet,
                    bands: f.bands, members: f.members, titleTags: f.titleTags };
                if (JSON.stringify(mine) !== JSON.stringify(r.facts)) bad.push(`facts ${JSON.stringify(mine)} / probe ${JSON.stringify(r.facts)}`);
                if (!g.recFacts) bad.push('the preview record has no bbTagFacts');
            }
            if (g.own.join(' ') !== r.tags.join(' ')) bad.push(`own tags differ (${g.own.length} / probe ${r.tags.length})`);
            if (key(g.missing) !== probeKey(r.ship.missing)) bad.push(`missing [${key(g.missing)}] / probe [${probeKey(r.ship.missing)}]`);
            if (key(g.spurious) !== probeKey(r.ship.spurious)) bad.push(`spurious [${key(g.spurious)}] / probe [${probeKey(r.ship.spurious)}]`);
            if (g.noWhy.length) bad.push(`no reason given for ${g.noWhy.join(', ')}`);
            if (g.missing.length || g.spurious.length) flagged++;
            if (bad.length) {
                diffs++;
                byKind[r.kind] = (byKind[r.kind] || 0) + 1;
                if (diffs <= 40) console.log(`DIFF ${r.name}\n   ${bad.join('\n   ')}`);
            }
        });
    }
    await browser.close();
    console.log(`${rows.length} pages (${skipped} skipped), the shipped tag check against the probe: ${diffs} differ`
        + (diffs ? ` ${JSON.stringify(byKind)}` : '') + `; ${flagged} pages flagged`);
    process.exit(diffs ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
