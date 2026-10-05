'use strict';

/**
 * Saves one live musicbrainz.org page, as the browser has it after `load`
 * and without its scripts, as a fixture shell for `loadUserscriptPage()`'s
 * `fixtureFile`. Same serializer and generic scrubbing as the snapshot
 * harness's `raw.html` (`snapshot.js`), but for a page that is not a
 * registered snapshot pageType.
 *
 *   node tests/support/capture-raw-page.js <url> <out.html>
 *
 * Logged OUT on purpose (no saved session), so the fixture carries no
 * account chrome. A plain HTTP fetch no longer works: musicbrainz.org now
 * answers it with a JavaScript proof-of-work page ("Verifying your
 * browser"), which only a real browser gets past. The first navigation
 * solves it and sets the cookie; the second one is the capture.
 *
 * Network: two page loads.
 */

const fs = require('fs');
const { chromium } = require('playwright');
const { captureRaw, scrub } = require('./snapshot');

const [url, out] = process.argv.slice(2);

(async () => {
    if (!url || !out) throw new Error('usage: node tests/support/capture-raw-page.js <url> <out.html>');
    const browser = await chromium.launch();
    try {
        const page = await (await browser.newContext()).newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForSelector('#page', { timeout: 60000 });
        const html = scrub(await captureRaw(page, url), null);
        if (!html.includes('id="page"')) throw new Error('captured page has no #page: still the challenge?');
        fs.writeFileSync(out, html);
        console.log(`wrote ${out} (${html.length} bytes)`);
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
