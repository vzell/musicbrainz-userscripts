'use strict';

/**
 * Probes MusicBrainz's undocumented `/<type>/<mbid>/commons-image` endpoint
 * from inside a real browser page, the way MusicBrainz's own sidebar calls it.
 * `scripts/probe-commons-image.py` cannot: MusicBrainz answers non-browser
 * clients with a "Verifying your browser" challenge page (HTTP 200, HTML) on
 * these URLs (seen 2026-10-11T02:24Z).
 *
 * Opens Bruce Springsteen's artist page, waits for MusicBrainz's own sidebar
 * picture (and records which request delivered it), then fetches the endpoint
 * for each case from the page, one per 1.2 s.
 *
 * Run: node tests/support/probe-commons-image.js
 */

const { chromium } = require('playwright');

const CASES = [
    ['artist', '70248960-cb53-4ea4-943a-edb18f7d336f', 'Bruce Springsteen: has a sidebar picture'],
    ['artist', '89ad4ac3-39f7-470e-963a-56509c546377', 'Various Artists: no picture expected'],
    ['label', '011d1192-6f65-45bd-85c4-0400dd45693e', 'Columbia: label'],
    ['place', '9e3e1c20-1d63-43f2-8e09-6e30c06aa7c4', 'a place'],
    ['artist', '00000000-0000-0000-0000-000000000000', 'an MBID that does not exist'],
];

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const seen = [];
    page.on('response', (r) => { if (/commons|wikimedia|wikidata/.test(r.url())) seen.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
    await page.goto('https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const title = await page.title();
    let picture = null;
    try {
        await page.waitForSelector('#sidebar .entity-image .picture img', { timeout: 20000 });
        picture = await page.evaluate(() => document.querySelector('#sidebar .entity-image .picture img').src);
    } catch (_) { /* none within 20 s */ }
    const results = [];
    for (const [kind, mbid, note] of CASES) {
        await page.waitForTimeout(1200);
        results.push(await page.evaluate(async ([k, m, n]) => {
            const t0 = performance.now();
            try {
                const r = await fetch(`/${k}/${m}/commons-image`, { headers: { Accept: 'application/json' } });
                const text = await r.text();
                let body;
                try { body = JSON.parse(text); } catch (_) { body = `(not JSON) ${text.slice(0, 160)}`; }
                return { kind: k, mbid: m, note: n, status: r.status, ms: Math.round(performance.now() - t0), contentType: r.headers.get('content-type'), body };
            } catch (e) {
                return { kind: k, mbid: m, note: n, error: String(e) };
            }
        }, [kind, mbid, note]));
    }
    console.log(JSON.stringify({ probedAt: new Date().toISOString(), pageTitle: title, sidebarPicture: picture, requestsSeen: seen, results }, null, 1));
    await browser.close();
})();
