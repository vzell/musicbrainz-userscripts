'use strict';

// What the original-page copy costs (`_origViewCapture()`: one
// `document.getElementById('page').cloneNode(true)` at the press): times that
// clone, the strip of our controls and the element count on saved MusicBrainz
// pages, in headless Chromium, without the userscript (the clone is the same
// DOM operation). Usage: node scripts/measure-orig-copy.js <page.html> …
// Prints one JSON line per page: elements, the median and max of 15 clones in ms.

const path = require('path');
const { chromium } = require('playwright');

/**
 * Measures one saved page.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} file - A saved MusicBrainz page with `#page`.
 * @returns {Promise<object>}
 */
async function measure(browser, file) {
    const page = await browser.newPage();
    // Scripts and the network off: the saved page as parsed, nothing else.
    await page.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : route.abort()));
    await page.goto('file://' + path.resolve(file), { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(() => {
        const live = document.getElementById('page');
        if (!live) return null;
        const times = [];
        for (let i = 0; i < 15; i++) {
            const t0 = performance.now();
            const copy = live.cloneNode(true);
            copy.querySelectorAll('#mb-show-all-controls-container, #mb-status-displays-container, #mb-ctrl-m-tooltip').forEach((el) => el.remove());
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return { elements: live.getElementsByTagName('*').length, medianMs: +times[7].toFixed(2), maxMs: +times[14].toFixed(2) };
    });
    await page.close();
    return { file: path.basename(file), ...r };
}

/**
 * Measures every page named on the command line.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    console.log(JSON.stringify({ chromium: browser.version() }));
    for (const f of process.argv.slice(2)) console.log(JSON.stringify(await measure(browser, f)));
    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
