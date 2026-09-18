'use strict';

/**
 * One-time (re-run-when-needed) capture of a MusicBrainz page's RAW HTML as a
 * fixture shell, for specs that need a pageType no committed fixture covers.
 *
 * Distinct from the two existing capture tools: `capture-fixture.js` saves the
 * Save-to-disk JSON of an already-fetched table, and `capture-snapshots.js`
 * captures raw + rendered baselines for the snapshot registry. This one just
 * writes the page as the browser received it, with no userscript involved, for
 * use as a `loadUserscriptPage({ fixtureFile })` shell.
 *
 * Standalone Node script (not a Playwright test):
 *   node scripts/capture-page-fixture.js <url> <output-path> [--strip-json]
 *
 * `--strip-json` drops MusicBrainz's embedded `<script type="application/json">`
 * payloads. On a release page that one element is most of the file — 978 KB of
 * 1.1 MB for the live-album capture below — and only the millisecond-length
 * features read it (`_msStampReleaseTrackLengths()`,
 * `_buildReleaseRecordingLengthMap()`). Strip it when the fixture's subject is
 * the rendered markup; keep it when the fixture is about track lengths.
 *
 * Example:
 *   node scripts/capture-page-fixture.js \
 *     https://musicbrainz.org/label/011d1192-6f65-45bd-85c4-0400dd45693e/relationships \
 *     tests/fixtures/label-relationships-release-events.html
 *
 * Captured logged OUT, deliberately: a fixture must render the same for anyone
 * running the suite, and login-gated markup would make it depend on whose
 * session captured it.
 *
 * Credential-shaped strings are replaced before the file is written. A
 * MusicBrainz page embeds its own Mapbox access token, and GitHub's push
 * protection rejects a commit carrying one — correctly, since a fixture has no
 * use for it. Nothing in these fixtures ever calls Mapbox: the page is served
 * from disk with the network intercepted.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Replaces credential-shaped strings in captured markup with obvious
 * placeholders. See this file's header for why.
 *
 * @param {string} html
 * @returns {string}
 */
function sanitize(html) {
    return html
        // Mapbox tokens: pk.<base64>.<base64> (public) and sk.<...> (secret).
        .replace(/\b[ps]k\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, 'REDACTED_MAPBOX_TOKEN')
        // Long bearer-ish values in obvious token fields.
        .replace(/("(?:[A-Z_]*TOKEN|access_token)"\s*:\s*")[^"]{16,}(")/gi, '$1REDACTED$2');
}

(async () => {
    const args = process.argv.slice(2);
    const stripJson = args.includes('--strip-json');
    const [url, out] = args.filter(a => !a.startsWith('--'));
    if (!url || !out) {
        console.error('usage: node scripts/capture-page-fixture.js <url> <output-path>');
        process.exit(2);
    }
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    if (!resp || !resp.ok()) {
        console.error(`HTTP ${resp ? resp.status() : '(no response)'} for ${url}`);
        await browser.close();
        process.exit(1);
    }
    let html = sanitize(await page.content());
    if (stripJson) {
        html = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g,
            '<!-- embedded JSON payload stripped by capture-page-fixture.js --strip-json -->');
    }
    await browser.close();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html, 'utf8');
    console.log(JSON.stringify({
        url, out, bytes: html.length, stripJson,
        capturedAt: new Date().toISOString(),
    }, null, 2));
})();
