'use strict';

/**
 * Does a NATIVE MusicBrainz work page populate its "Length" column?
 *
 * jesus2099's RECORDING_LENGTH_COLUMN overwrites that column, and every
 * snapshot under debug/ was taken with jesus2099 running — so none of them can
 * answer this. It matters for the WS2 millisecond source: if MusicBrainz leaves
 * those cells empty, there is no seconds text to round-trip against and none to
 * restore when the toggle is switched back off.
 *
 * Loads the page with a bare browser (no userscripts at all) and reports the
 * column-header names plus each Length cell's text.
 *
 *   node scripts/probe-native-work-length.js [work-mbid]
 */
const { chromium } = require('playwright');

const MBID = process.argv[2] || '8727a75a-8d33-3a2c-912a-f57952773201';
const URL = `https://musicbrainz.org/work/${MBID}`;

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('table.tbl', { timeout: 60000 }).catch(() => {});

    const report = await page.evaluate(() => {
        const out = { title: document.title, tables: [] };
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const thRow = tbl.querySelector('thead tr');
            const ths = thRow ? Array.from(thRow.querySelectorAll('th')).map((t) => t.textContent.trim()) : [];
            const idx = ths.findIndex((t) => t === 'Length');
            const cells = [];
            if (idx >= 0) {
                Array.from(tbl.querySelectorAll('tbody tr')).slice(0, 8).forEach((tr) => {
                    const td = tr.children[idx];
                    if (td) cells.push({ text: td.textContent.trim(), cls: td.className || '' });
                });
            }
            out.tables.push({ headers: ths, lengthIdx: idx, cells });
        });
        out.anyJesus2099 = document.documentElement.outerHTML.includes('jesus2099');
        out.anyTreleases = (document.documentElement.outerHTML.match(/treleases/g) || []).length;
        return out;
    });

    console.log(JSON.stringify(report, null, 2));
    await browser.close();
})();
