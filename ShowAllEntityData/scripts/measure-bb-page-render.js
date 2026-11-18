#!/usr/bin/env node
'use strict';

/**
 * Times a Brucebase detail page's render (parity batch 4: what the page tag
 * check costs the head): the press of the page's button to
 * `waitForRenderComplete`, `REPS` times on a fresh page each, median and
 * range, for each page named. The page is a fixture of
 * tests/fixtures/bb-findings/ ("venue:stone-pony-asbury-park-nj"). Run it
 * from the checkout whose userscript it should time — the harness loads
 * `ShowAllEntityData.user.js` next to `tests/` — so a main arm runs from a
 * git worktree with this script and the fixtures copied in, as
 * scripts/measure-bb-year-render.js does. Every request but the page's own
 * is refused; the "-N" tag pages are not read (the fixtures' default).
 * Prints one JSON line with the machine block.
 *
 * usage: node scripts/measure-bb-page-render.js REPS NAME [NAME …]
 */

const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');
const { waitForRenderComplete } = require('../tests/support/browser');

const REPS = Number(process.argv[2] || 7);
const NAMES = process.argv.slice(3);
const LABEL = { venue: 'Show the venue', song: 'Show the song', relation: 'Show the person', retail: 'Show the release' };

/**
 * Median and range of a list of numbers.
 *
 * @param {number[]} xs
 * @returns {{median: number, min: number, max: number}}
 */
function stats(xs) {
    const s = [...xs].sort((a, b) => a - b);
    return { median: Math.round(s[Math.floor(s.length / 2)]), min: Math.round(s[0]), max: Math.round(s[s.length - 1]) };
}

/**
 * Runs the reps of every page and prints the result.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    const out = {};
    for (const name of NAMES) {
        const times = [];
        for (let i = 0; i < REPS; i++) {
            const context = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
            const page = await context.newPage();
            await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
            await loadUserscriptPage(page, {
                url: `https://brucebase.wikidot.com/${name}`,
                fixtureFile: path.join(__dirname, '..', 'tests', 'fixtures', 'bb-findings', `${name.replace(':', '_')}.html`),
                testMode: true,
                settingsOverride: { sa_enable_brucebase: true, sa_bb_detail_pages: true, sa_foreign_mb_titles: false, sa_foreign_typography: false },
            });
            const t0 = Date.now();
            await page.click(`button[data-label="${LABEL[name.split(':')[0]]}"]`);
            await waitForRenderComplete(page, { waitForAutoResize: false });
            times.push(Date.now() - t0);
            await context.close();
        }
        out[name] = { renderMs: stats(times), render: times };
    }
    await browser.close();
    const tz = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
    console.log(JSON.stringify({
        checkout: path.resolve(__dirname, '..'), reps: REPS, pages: out,
        machine: { host: os.hostname(), at: `${tz.replace(' ', 'T')} Europe/Berlin`, chromium: chromium.name() },
    }));
}

main().catch((e) => { console.error(e); process.exit(1); });
