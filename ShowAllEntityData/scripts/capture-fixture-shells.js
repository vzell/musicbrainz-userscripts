'use strict';

/**
 * Captures the fixture projects' page shells (2026-11-26, test/fixture-shells):
 * every entry of `tests/fixtures/shells/index.json` whose file is missing
 * (all of them with `--all`), as `tests/support/capture-raw-page.js` does it:
 * logged out, the "Verifying your browser" check solved by a first load, the
 * raw page as the browser received it, scrubbed by `snapshot.js`'s `scrub()`.
 * Each file is then checked for a Mapbox token (GitHub's push protection
 * refuses one, CLAUDE.md memory) and for the check page itself. One page every
 * 2 s; a page that fails is reported and the rest go on.
 *
 *   node scripts/capture-fixture-shells.js [--all] [--dry-run]
 *
 * Network: musicbrainz.org, two loads per page. Run it where musicbrainz.org
 * answers (`curl -4 -sS -o /dev/null -w '%{http_code}' https://musicbrainz.org/`).
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { captureRaw, scrub } = require('../tests/support/snapshot');
const { INDEX, ROOT } = require('../tests/support/shells');

const MAPBOX_RE = /\b[ps]k\.eyJ[A-Za-z0-9._-]+/;
const CHECK_RE = /<title>\s*Verifying your browser\s*<\/title>/i;

/** @param {number} ms @returns {Promise<void>} */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const all = process.argv.includes('--all');
    const dry = process.argv.includes('--dry-run');
    const shells = JSON.parse(fs.readFileSync(INDEX, 'utf8')).shells || {};
    const todo = Object.entries(shells).filter(([, rel]) => all || !fs.existsSync(path.join(ROOT, rel)));
    console.log(`${todo.length} of ${Object.keys(shells).length} shell(s) to capture${dry ? ' (dry run)' : ''}`);
    if (dry || !todo.length) {
        todo.forEach(([url, rel]) => console.log(`  ${url} -> ${rel}`));
        return;
    }
    const browser = await chromium.launch();
    let failed = 0;
    try {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        for (const [url, rel] of todo) {
            const out = path.join(ROOT, rel);
            try {
                await page.goto(url, { waitUntil: 'load' });
                await page.waitForSelector('#page', { timeout: 60000 });
                const html = scrub(await captureRaw(page, url), null);
                if (CHECK_RE.test(html) || !html.includes('id="page"')) throw new Error('still the "Verifying your browser" page');
                if (MAPBOX_RE.test(html)) throw new Error('a Mapbox token survived the scrub: not written');
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, html);
                console.log(`wrote ${rel} (${html.length} bytes) <- ${url}`);
            } catch (e) {
                failed++;
                console.error(`FAILED ${url}: ${e.message}`);
            }
            await sleep(2000);
        }
    } finally {
        await browser.close();
    }
    if (failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
