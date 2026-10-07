'use strict';

/**
 * Saves any musicbrainz.org page, AS THE SERVER SENT IT, as a fixture:
 *
 *   node scripts/fetch-mb-page-fixture.js <path> <out.html>
 *   e.g. node scripts/fetch-mb-page-fixture.js /release-group/fa9c43a7-2592-3336-a09b-1414b4b6ee68 tests/fixtures/rg-page-berlin.html
 *
 * The sibling of scripts/fetch-release-fixture.js for pages that are not a
 * release (that one waits for a tracklist and prints the release payload).
 * Written for the popup engine's Live page view (org/iframe.org, Phase 1),
 * whose specs need a real entity page WITH its scripts, to show that the
 * view's copy has none.
 *
 * Same reasons as its sibling: a plain HTTP client gets the "Verifying your
 * browser" proof-of-work page since 2026-10-01, so a real Chromium loads the
 * page and the HTML is re-fetched from INSIDE it (`fetch(location.href)`),
 * which saves the server's response, not the DOM the page's scripts changed;
 * and the Mapbox access token in the page's global config is blanked, since
 * GitHub push protection refuses any push that carries one.
 *
 * Anonymous (no login state), one page per run.
 */

const fs = require('fs');
const { chromium } = require('@playwright/test');

/**
 * Blanks every credential-shaped value MusicBrainz embeds in a page (see
 * scripts/fetch-release-fixture.js).
 *
 * @param {string} html - Raw page HTML.
 * @returns {string}
 */
function scrub(html) {
    return html
        .replace(/("MAPBOX_ACCESS_TOKEN"\s*:\s*")[^"]*(")/g, '$1$2')
        .replace(/\b[ps]k\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '');
}

/**
 * Entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const [pagePath, out] = process.argv.slice(2);
    if (!pagePath || !out || !pagePath.startsWith('/')) {
        console.log('usage: node scripts/fetch-mb-page-fixture.js </path/on/musicbrainz.org> <out.html>');
        process.exit(2);
    }
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`https://musicbrainz.org${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        // The verification page submits itself and lands back on the page.
        await page.waitForSelector('#page', { timeout: 90000 });
        const html = scrub(await page.evaluate(async () => {
            const resp = await fetch(location.href, { credentials: 'include' });
            return resp.text();
        }));
        fs.writeFileSync(out, html, 'utf8');
        const scripts = (html.match(/<script\b/g) || []).length;
        console.log(`wrote ${out} (${html.length} chars, ${scripts} <script> tags, #content ${html.includes('id="content"') ? 'present' : 'absent'})`);
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
