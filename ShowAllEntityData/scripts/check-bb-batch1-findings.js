#!/usr/bin/env node
'use strict';

/**
 * Track A batch 1 (org/bbp-parity.org): runs the SHIPPED name and anchor
 * checks of the Brucebase year table over every entry of BruceParser's
 * mirror and compares them with the Python probe's result
 * (scripts/probe-bb-batch1-findings.py --rows FILE), which was compared with
 * BruceParser's own reports.
 *
 * Two things per entry, in the real userscript loaded through the test
 * harness:
 *   1. the event page's title as written and its "Info & Setlist" link, read
 *      by the link previews' parser (`__saTest.dpParse()`: `bbRawTitle`,
 *      `bbInfoHref`), against the probe's own reading of the same file;
 *   2. the checks the row fails (`__saTest.bbEventChecks()`), fed with what
 *      the parser read, against the probe's.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-batch1-findings.js ROWS.json [--mirror DIR] [--rules-only]
 *        --rules-only  skip step 1 (no event page is parsed; a few seconds)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const ROWS = args.find(a => !a.startsWith('--'));
const mi = args.indexOf('--mirror');
const MIRROR = fs.realpathSync(mi >= 0 ? args[mi + 1] : path.join(os.homedir(), 'git/scripts/BruceParser/bb/latest'));
const RULES_ONLY = args.includes('--rules-only');

/**
 * The mirror's file of an event link ("/gig:1985-01-13-…").
 *
 * @param {string} href
 * @returns {string} '' for a link of another shape.
 */
function eventFile(href) {
    const m = href.match(/^\/([a-z]+):(.+)$/);
    return m ? path.join(MIRROR, m[1], `${m[1]}_${m[2]}.html`) : '';
}

/**
 * Checks every row and prints what differs.
 *
 * @returns {Promise<void>}
 */
async function main() {
    if (!ROWS) throw new Error('usage: node scripts/check-bb-batch1-findings.js ROWS.json [--mirror DIR] [--rules-only]');
    const rows = JSON.parse(fs.readFileSync(ROWS, 'utf8'));
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.route(/^https?:\/\//, route => (route.request().url().startsWith('https://brucebase.wikidot.com/stats:songs')
        ? route.fallback() : route.abort('blockedbyclient')));
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs', fixtureFile: path.join(ROOT, 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbEventChecks);
    console.log(`Mirror: ${MIRROR}`);
    console.log(`Browser: Chromium ${browser.version()}, GM stubs`);
    let diffs = 0;
    let parsed = 0;
    const counts = {};
    const say = (what, row, a, b) => {
        diffs++;
        if (diffs <= 40) console.log(`DIFF ${what}: ${row.year} ${row.href || row.heading}\n  probe:  ${JSON.stringify(a)}\n  script: ${JSON.stringify(b)}`);
    };
    for (const row of rows) {
        let pageData = row.title === null ? null : { title: row.title, infoHref: row.infoHref || '' };
        if (!RULES_ONLY && pageData) {
            const file = eventFile(row.href);
            const read = await page.evaluate(({ html, url }) => {
                const d = window.__saTest.dpParse('brucebase.wikidot.com', html, url);
                return d ? { title: d.bbRawTitle, infoHref: d.bbInfoHref } : null;
            }, { html: fs.readFileSync(file, 'utf8'), url: `https://brucebase.wikidot.com${row.href}` });
            parsed++;
            if (!read || read.title !== pageData.title || read.infoHref !== pageData.infoHref) say('page', row, pageData, read);
            if (read) pageData = read;
        }
        const got = await page.evaluate(({ r, p }) => window.__saTest.bbEventChecks(r, p),
            { r: { heading: row.heading, anchor: row.anchor, href: row.href ? `https://brucebase.wikidot.com${row.href}` : '' }, p: pageData });
        got.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
        if (got.slice().sort().join(' ') !== row.checks.slice().sort().join(' ')) say('checks', row, row.checks, got);
    }
    await browser.close();
    console.log(`Entries: ${rows.length}, event pages parsed: ${parsed}`);
    console.log(`Rows per check (script): ${JSON.stringify(counts)}`);
    console.log(diffs ? `${diffs} DIFFERENCES` : 'No difference: the shipped checks flag the probe\'s rows.');
    process.exitCode = diffs ? 1 : 0;
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
