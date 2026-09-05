'use strict';

/**
 * What do the still-uncovered pageTypes actually put in their "Length" column,
 * and how many recordings does each page list?
 *
 * Two things this answers that WS2 alone cannot:
 *   - `recording-releases` rows are RELEASES, not recordings. If its Length
 *     column carries the per-release TRACK length, a recording-length source is
 *     the wrong measurement there — the same correctness objection that already
 *     excluded release-discids' TOC-derived lengths.
 *   - How many rows a page lists, which sets the cost of any per-row batched
 *     lookup.
 *
 * musicbrainz.org serves scripted HTTP clients a JavaScript proof-of-work
 * challenge instead of the page, so curl cannot answer either question; a real
 * browser can. No userscripts are loaded — this reports NATIVE markup only.
 *
 *   node scripts/probe-ms-page-shapes.js
 */
const { chromium } = require('playwright');

const PAGES = [
    { type: 'recording-releases',   url: 'https://musicbrainz.org/recording/875a6a0d-1fcc-416e-959f-433f96b0da17' },
    { type: 'area-recordings',      url: 'https://musicbrainz.org/area/10fa66f7-aa08-4823-8af8-52108f350a5a/recordings' },
    { type: 'instrument-recordings', url: 'https://musicbrainz.org/instrument/63e37f1a-30b6-4746-8a49-dfb55be3cdd1/recordings' },
    { type: 'isrc',                 url: 'https://musicbrainz.org/isrc/QM9WB1602576' },
];

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    for (const { type, url } of PAGES) {
        const page = await ctx.newPage();
        let report;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForSelector('table.tbl', { timeout: 60000 }).catch(() => {});
            report = await page.evaluate(() => {
                const out = { title: document.title, tables: [] };
                document.querySelectorAll('table.tbl').forEach((tbl) => {
                    const ths = Array.from(tbl.querySelectorAll('thead th')).map(t => t.textContent.trim());
                    const idx = ths.indexOf('Length');
                    const bodyRows = Array.from(tbl.querySelectorAll('tbody tr'));
                    const rows = bodyRows.slice(0, 6).map((tr) => {
                        const td = idx >= 0 ? tr.children[idx] : null;
                        const rec = tr.querySelector('a[href*="/recording/"]');
                        const rel = tr.querySelector('a[href*="/release/"]');
                        return {
                            length: td ? td.textContent.trim() : null,
                            recording: rec ? rec.getAttribute('href').split('/')[2] : null,
                            release: rel ? rel.getAttribute('href').split('/')[2] : null,
                        };
                    });
                    out.tables.push({
                        headers: ths,
                        lengthIdx: idx,
                        bodyRowCount: bodyRows.length,
                        rows,
                    });
                });
                const html = document.documentElement.outerHTML;
                out.distinctRecordingLinks = new Set(
                    (html.match(/\/recording\/[a-f0-9-]{36}/g) || [])).size;
                out.distinctReleaseLinks = new Set(
                    (html.match(/\/release\/[a-f0-9-]{36}/g) || [])).size;
                return out;
            });
        } catch (err) {
            report = { error: err.message };
        }
        console.log(`\n########## ${type}\n${url}`);
        console.log(JSON.stringify(report, null, 2));
        await page.close();
    }
    await browser.close();
})();
