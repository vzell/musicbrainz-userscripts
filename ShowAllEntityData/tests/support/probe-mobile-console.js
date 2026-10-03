'use strict';

// Diagnostic: loads one fixture under Pixel 7 emulation and prints every
// console message and page error, plus whether the h1 action buttons were
// injected. For "the userscript does nothing on a phone" questions
// (org/mobile.org).
//
// Usage: node tests/support/probe-mobile-console.js [url] [fixtureFile] [device]

const path = require('path');
const { chromium, devices } = require('@playwright/test');
const { loadUserscriptPage } = require('./loadPage');

const URL = process.argv[2] || 'https://musicbrainz.org/iswc/T-070.127.339-3';
const FIXTURE = process.argv[3] || path.join(__dirname, '..', 'fixtures', 'iswc.html');
const DEVICE = process.argv[4] || 'Pixel 7';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext(devices[DEVICE]);
    const page = await context.newPage();
    page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 300)));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : ''));
    try {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
        await page.waitForTimeout(3000);
        const n = await page.evaluate(() => document.querySelectorAll('button[data-label]').length);
        console.log(`\naction buttons injected: ${n}`);
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
