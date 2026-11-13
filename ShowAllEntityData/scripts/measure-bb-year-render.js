#!/usr/bin/env node
'use strict';

/**
 * Times the Brucebase year table (org/brucebase.org Phase 14: what the four
 * event-page columns cost it before any page is read): the render after the
 * button (click to `waitForRenderComplete`) and a sort by Date (click on the
 * header to the re-render's end), each `REPS` times on a fresh page, median
 * and range. Run it from the checkout whose userscript it should time — the
 * harness loads `ShowAllEntityData.user.js` next to `tests/` — so a main or
 * pre-change arm runs from a git worktree with the same script copied in.
 * Prints one JSON line with the machine block.
 *
 * usage: node scripts/measure-bb-year-render.js [year] [reps]
 */

const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadBbYearPage, BB_YEAR_BUTTON } = require('../tests/support/bbFixture');
const { waitForRenderComplete } = require('../tests/support/browser');

const YEAR = process.argv[2] || '1985';
const REPS = Number(process.argv[3] || 7);

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
 * Runs the reps and prints the result.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    const render = [];
    const sort = [];
    for (let i = 0; i < REPS; i++) {
        const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
        const page = await context.newPage();
        await loadBbYearPage(page, YEAR);
        const t0 = Date.now();
        await page.click(`button[data-label="${BB_YEAR_BUTTON}"]`);
        await waitForRenderComplete(page, { waitForAutoResize: false });
        render.push(Date.now() - t0);
        const th = page.locator('table.tbl thead tr:first-child th[data-col-name="Date"]');
        const t1 = Date.now();
        await th.click({ position: { x: 5, y: 5 } });
        await waitForRenderComplete(page, { waitForAutoResize: false });
        sort.push(Date.now() - t1);
        await context.close();
    }
    await browser.close();
    const tz = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
    console.log(JSON.stringify({
        checkout: path.resolve(__dirname, '..'), year: YEAR, reps: REPS, renderMs: stats(render), sortMs: stats(sort), render, sort,
        machine: { host: os.hostname(), at: `${tz.replace(' ', 'T')} Europe/Berlin`, chromium: chromium.name() },
    }));
}

main().catch((e) => { console.error(e); process.exit(1); });
