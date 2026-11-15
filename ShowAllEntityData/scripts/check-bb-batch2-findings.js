#!/usr/bin/env node
'use strict';

/**
 * Track A batch 2 (org/bbp-parity.org): runs the SHIPPED listing and venue
 * checks of the Brucebase tables over BruceParser's mirror and compares them
 * with the Python probe's result (scripts/probe-bb-batch2-findings.py
 * --rows FILE), which was compared with BruceParser's own reports.
 *
 * In the real userscript, loaded through the test harness:
 *   1. every listing entry: the year page read by the shipped year reader
 *      (`__saTest.extBbParseYear()`: the headings of the entry's anchor),
 *      then `__saTest.bbEventChecks()` for the row — its `list-title` and
 *      `list-anchor` against the probe's;
 *   2. every event with a venue page: `__saTest.bbVenueCheck(title, venue)`
 *      against the probe's result ('', variant, detail, mismatch);
 *   3. every year entry: the year's listing read by the shipped listing
 *      reader (`__saTest.extBbParseYearList()`), the entry's anchor looked
 *      up in its links as `_bbYearApplyListing()` does, then
 *      `__saTest.bbEventChecks()` — its `unlisted` against the probe's.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bb-batch2-findings.js ROWS.json [--mirror DIR]
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

/**
 * Checks every row and prints what differs.
 *
 * @returns {Promise<void>}
 */
async function main() {
    if (!ROWS) throw new Error('usage: node scripts/check-bb-batch2-findings.js ROWS.json [--mirror DIR]');
    const rows = JSON.parse(fs.readFileSync(ROWS, 'utf8'));
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.route(/^https?:\/\//, route => (route.request().url().startsWith('https://brucebase.wikidot.com/stats:songs')
        ? route.fallback() : route.abort('blockedbyclient')));
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/stats:songs', fixtureFile: path.join(ROOT, 'tests', 'fixtures', 'bb-songs.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true },
    });
    await page.waitForFunction(() => window.__saTest && window.__saTest.bbVenueCheck && window.__saTest.extBbParseYear && window.__saTest.extBbParseYearList);
    console.log(`Mirror: ${MIRROR}`);
    console.log(`Browser: Chromium ${browser.version()}, GM stubs`);
    let diffs = 0;
    const say = (what, row, a, b) => {
        diffs++;
        if (diffs <= 40) console.log(`DIFF ${what}: ${JSON.stringify(row).slice(0, 200)}\n  probe:  ${JSON.stringify(a)}\n  script: ${JSON.stringify(b)}`);
    };

    // 1. The listings, a year at a time.
    const years = Array.from(new Set(rows.list.map(r => r.year)));
    const counts = {};
    for (const year of years) {
        const mine = rows.list.filter(r => r.year === year);
        const got = await page.evaluate(({ html, base, list }) => {
            const shows = window.__saTest.extBbParseYear(html, base).shows;
            return list.map((r) => {
                const show = shows[r.href.split('#')[1]];
                return window.__saTest.bbEventChecks({
                    heading: r.label, anchor: null, href: `https://brucebase.wikidot.com${r.href}`, list: true,
                    listHeadings: show ? [show.heading, ...(show.also || [])] : [],
                }, null).filter(t => t.startsWith('list-'));
            });
        }, { html: fs.readFileSync(path.join(MIRROR, `${year}.html`), 'utf8'), base: `https://brucebase.wikidot.com/${year}`, list: mine });
        mine.forEach((r, i) => {
            got[i].forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
            if (got[i].slice().sort().join(' ') !== r.checks.slice().sort().join(' ')) say('listing', r, r.checks, got[i]);
        });
    }
    console.log(`Listing entries: ${rows.list.length} in ${years.length} years; rows per check (script): ${JSON.stringify(counts)}`);

    // 2. The venues.
    const got = await page.evaluate(list => list.map(r => window.__saTest.bbVenueCheck(r.title, r.venue)), rows.venue);
    const kinds = {};
    rows.venue.forEach((r, i) => {
        kinds[got[i] || 'equal'] = (kinds[got[i] || 'equal'] || 0) + 1;
        if (got[i] !== r.result) say('venue', r, r.result, got[i]);
    });
    console.log(`Events with a venue page: ${rows.venue.length}; results (script): ${JSON.stringify(kinds)}`);

    // 3. The year entries against their year's listing.
    let unlisted = 0;
    for (const year of Array.from(new Set((rows.year || []).map(r => r.year)))) {
        const mine = rows.year.filter(r => r.year === year);
        const res = await page.evaluate(({ html, slug, list }) => {
            const links = new Set(window.__saTest.extBbParseYearList(html).links);
            return list.map(r => window.__saTest.bbEventChecks({
                heading: r.heading, anchor: r.anchor, href: '', listed: !!r.anchor && links.has(`${slug}#${r.anchor}`),
            }, null).includes('unlisted'));
        }, { html: fs.readFileSync(path.join(MIRROR, `${year}-list.html`), 'utf8'), slug: year, list: mine });
        mine.forEach((r, i) => {
            if (res[i]) unlisted++;
            if (res[i] !== !r.listed) say('year entry', r, !r.listed, res[i]);
        });
    }
    console.log(`Year entries: ${(rows.year || []).length}; not in their year's listing (script): ${unlisted}`);
    await browser.close();
    console.log(diffs ? `${diffs} DIFFERENCES` : 'No difference: the shipped checks flag the probe\'s rows.');
    process.exitCode = diffs ? 1 : 0;
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
