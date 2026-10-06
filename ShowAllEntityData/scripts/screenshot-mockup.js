'use strict';

/**
 * Loads a local design mockup (org/*-mockups.html) in headless Chromium and
 * reports what a reviewer would trip over: page errors, console errors, and
 * horizontal overflow of the page body. Saves a full-page screenshot at a
 * desktop and a phone width, and an optional element screenshot.
 *
 * Outside images (archive thumbnails) may be blocked or slow; the mockups fall
 * back to labelled tiles, so failed image requests are not reported.
 *
 * usage:
 *   node scripts/screenshot-mockup.js org/event-overview-mockups.html <out-dir> [css-selector ...]
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

/**
 * Runs the check.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const [file, outDir, ...selectors] = process.argv.slice(2);
    if (!file || !outDir) {
        console.error('usage: node scripts/screenshot-mockup.js <mockup.html> <out-dir> [css-selector ...]');
        process.exit(2);
    }
    fs.mkdirSync(outDir, { recursive: true });
    const url = 'file://' + path.resolve(file);
    const browser = await chromium.launch();
    let problems = 0;
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 400, height: 860 }]]) {
        const page = await browser.newPage({ viewport });
        page.on('pageerror', (e) => { problems += 1; console.log(`[${name}] PAGE ERROR: ${e.message}`); });
        page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { problems += 1; console.log(`[${name}] CONSOLE: ${m.text()}`); } });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) { problems += 1; console.log(`[${name}] body overflows sideways by ${overflow}px`); }
        const shot = path.join(outDir, `${path.basename(file, '.html')}-${name}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        console.log(`[${name}] ${shot}`);
        for (const sel of selectors) {
            const loc = page.locator(sel).first();
            if (await loc.count()) {
                const s = path.join(outDir, `${path.basename(file, '.html')}-${name}-${sel.replace(/[^a-z0-9]+/gi, '_')}.png`);
                await loc.screenshot({ path: s });
                console.log(`[${name}] ${s}`);
            }
        }
        await page.close();
    }
    await browser.close();
    console.log(problems ? `${problems} problem(s)` : 'no page errors, no console errors, no sideways overflow');
}

main().catch((e) => { console.error(e); process.exit(1); });
