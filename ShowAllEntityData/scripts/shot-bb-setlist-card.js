#!/usr/bin/env node
'use strict';

/**
 * Screenshots of the Brucebase setlist card (bbp-parity batch 2 part 3) on
 * the 1981 fixture, to compare with the approved mockup: the card of a
 * song written differently, the same with every song, and the card of a
 * setlist with a Soundcheck only on the year page.
 *
 * No network: the fixture's own pages.
 *
 * usage: node scripts/shot-bb-setlist-card.js OUT_DIR
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const FIX = path.join(__dirname, '..', 'tests', 'fixtures');
const OUT = process.argv[2];
const PAGE_RE = /^https:\/\/brucebase\.wikidot\.com\/((?:gig|venue):[^/?#]+)$/;

/**
 * Renders the year, reads its four pages and shoots the cards.
 *
 * @returns {Promise<void>}
 */
async function main() {
    if (!OUT) throw new Error('usage: node scripts/shot-bb-setlist-card.js OUT_DIR');
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1700, height: 1100 } })).newPage();
    await page.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: 'https://brucebase.wikidot.com/1981', fixtureFile: path.join(FIX, 'bb-year-1981-findings.html'), testMode: true,
        settingsOverride: { sa_enable_brucebase: true, sa_bb_year_pages: true, sa_findings_bb_venue_mismatch: false, sa_findings_bb_year_unlisted: false },
    });
    await page.route(PAGE_RE, (route) => {
        const file = path.join(FIX, 'bb-findings', `${route.request().url().match(PAGE_RE)[1].replace(':', '_')}.html`);
        return fs.existsSync(file) ? route.fulfill({ path: file, contentType: 'text/html; charset=utf-8' }) : route.fulfill({ status: 404, body: '' });
    });
    await page.click('button[data-label="Show all events"]');
    await page.waitForSelector('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');
    await page.click('th[data-col-name="On stage"] .mb-bbevp-col-hdr-btn');
    await page.waitForFunction(() => document.querySelectorAll('span.mb-bb-set-data[data-mb-bb-set-event]').length === 4, null, { timeout: 60000 });
    const cell = date => page.locator('table.tbl tbody tr', { has: page.locator(`td.mb-bb-event-cell a[href*="gig:${date}"]`) }).locator('td:has(> span.mb-bb-set-data)');
    await cell('1981-03-04').hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'card-spelling.png') });
    await page.locator('#mb-bb-setlist-card button').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, 'card-all.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await cell('1981-04-11').hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'card-songs.png') });
    await browser.close();
    console.log(`wrote ${OUT}/card-spelling.png, card-all.png, card-songs.png`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
