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
 * Anonymous by default, one page per run. `--auth` loads the live specs'
 * login state (`playwright/.auth/vzell.json`, `npm run auth:login`), for
 * pages that show more, or anything at all, only to a logged-in editor: an
 * edit's editor and notes, an edit list (org/iframe.org Phase 3). A
 * logged-in page also carries the session's form tokens; `scrub()` blanks
 * them. Capture only pages whose content may be committed: the user's own
 * edits, never another editor's profile.
 *
 *   node scripts/fetch-mb-page-fixture.js --auth /edit/126930910 tests/fixtures/edit-page-applied.html
 */

const fs = require('fs');
const path = require('path');
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
        // A logged-in page's form and session tokens, and the logged-in
        // editor's own preferences (timezone, date format) in the page's
        // embedded config (--auth).
        .replace(/("preferences"\s*:\s*)\{[^{}]*\}/g, '$1{}')
        .replace(/(name="[^"]*(?:csrf|token|session)[^"]*"\s+value=")[^"]*(")/gi, '$1$2')
        .replace(/(value=")[^"]*("\s+name="[^"]*(?:csrf|token|session)[^"]*")/gi, '$1$2')
        .replace(/("[A-Za-z_]*(?:csrf|token|session)[A-Za-z_]*"\s*:\s*")[^"]*(")/gi, '$1$2')
        .replace(/\b[ps]k\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '');
}

/**
 * Entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const args = process.argv.slice(2);
    const auth = args.includes('--auth');
    const [pagePath, out] = args.filter(a => a !== '--auth');
    if (!pagePath || !out || !pagePath.startsWith('/')) {
        console.log('usage: node scripts/fetch-mb-page-fixture.js [--auth] </path/on/musicbrainz.org> <out.html>');
        process.exit(2);
    }
    const state = path.join(__dirname, '..', 'playwright', '.auth', 'vzell.json');
    if (auth && !fs.existsSync(state)) {
        console.log(`--auth: no login state at ${state}; run npm run auth:login first`);
        process.exit(2);
    }
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext(auth ? { storageState: state } : {});
        const page = await context.newPage();
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
