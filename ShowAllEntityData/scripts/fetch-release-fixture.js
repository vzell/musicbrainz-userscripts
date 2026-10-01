'use strict';

/**
 * Saves a real MusicBrainz release page, AS THE SERVER SENT IT, as a
 * release-tracks fixture:
 *
 *   node scripts/fetch-release-fixture.js <release-mbid> <out.html>
 *
 * Why not the snapshot capture: it strips every `<script>` tag, and a release
 * page's embedded `<script type="application/json">` payload is load-bearing
 * for several release-tracks features — millisecond lengths, the "Recording
 * length" column, and the Video column's medium-format check, which resolves
 * each medium's format id from `release.mediums[].format.id`.
 * `scripts/build-ms-length-fixture.py` had to REASSEMBLE that payload for its
 * fixtures for exactly this reason.
 *
 * Why not a plain HTTP client: as of 2026-10-01 musicbrainz.org answers a
 * non-browser request with a "Verifying your browser" proof-of-work page (a
 * SHA-256 loop POSTing to `/__meb_verify`), not the release. A real Chromium
 * passes it on its own. Once the release page has loaded, the HTML is
 * re-fetched from INSIDE the page with `fetch(location.href)`, so what lands
 * on disk is the server's raw response — never the live DOM, which page
 * scripts have already modified.
 *
 * Anonymous (no login state), one page per run.
 *
 * Scrubbed before saving: the page's global config carries MusicBrainz's own
 * Mapbox access token (`"MAPBOX_ACCESS_TOKEN":"pk.…"`). It is a public token
 * served to every visitor, but GitHub push protection rejects any push that
 * contains one (it blocked the first commit of these fixtures on 2026-10-01),
 * and no fixture needs a map. See `scrub()`.
 *
 * Prints one line per medium from the payload (position, gid, format id/name,
 * and which track numbers are video recordings), so a spec's expected values
 * can be read off instead of guessed.
 *
 * Fixtures built with it (re-run to refresh):
 *   node scripts/fetch-release-fixture.js 812b0aa0-0550-4235-9c3b-fa97f2572e74 tests/fixtures/release-tracks-video-on-cd.html
 *   node scripts/fetch-release-fixture.js 6d19588c-0305-4fb0-b687-d4b75a75c3fd tests/fixtures/release-tracks-video-on-dvd.html
 */

const fs = require('fs');
const { chromium } = require('@playwright/test');

/**
 * Blanks every credential-shaped value MusicBrainz embeds in a page, so the
 * fixture can be committed: the Mapbox access token in the global config, and
 * — belt and braces — any other `pk.`/`sk.` Mapbox-format token.
 *
 * @param {string} html - Raw page HTML.
 * @returns {string} The HTML with those values replaced by empty strings.
 */
function scrub(html) {
    return html
        .replace(/("MAPBOX_ACCESS_TOKEN"\s*:\s*")[^"]*(")/g, '$1$2')
        .replace(/\b[ps]k\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '');
}

/**
 * Prints the release payload's medium list.
 *
 * @param {string} html - Raw page HTML.
 * @returns {boolean} Whether a release payload was found.
 */
function summarize(html) {
    const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (m[1].indexOf('"mediums"') === -1) continue;
        let data;
        try { data = JSON.parse(m[1]); } catch (err) { continue; }
        const rel = (data && data.release) || {};
        console.log(`release ${rel.gid}: ${JSON.stringify(rel.name)}`);
        (rel.mediums || []).forEach((med) => {
            const fmt = med.format || {};
            const vids = (med.tracks || [])
                .filter((t) => t.recording && t.recording.video)
                .map((t) => t.number);
            console.log(`  medium ${med.position} gid=${med.gid} name=${JSON.stringify(med.name)} `
                + `format.id=${fmt.id} format.name=${JSON.stringify(fmt.name)} video tracks=[${vids.join(', ')}]`);
        });
        return true;
    }
    console.log('WARNING: no embedded release payload found');
    return false;
}

/**
 * Entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const [mbid, out] = process.argv.slice(2);
    if (!mbid || !out) {
        console.log('usage: node scripts/fetch-release-fixture.js <release-mbid> <out.html>');
        process.exit(2);
    }
    const url = `https://musicbrainz.org/release/${mbid}`;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        // The verification page submits itself and lands back on the release.
        await page.waitForSelector('table.tbl.medium', { timeout: 90000 });
        const html = scrub(await page.evaluate(async () => {
            const resp = await fetch(location.href, { credentials: 'include' });
            return resp.text();
        }));
        fs.writeFileSync(out, html, 'utf8');
        console.log(`wrote ${out} (${html.length} chars)`);
        if (!summarize(html)) process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
