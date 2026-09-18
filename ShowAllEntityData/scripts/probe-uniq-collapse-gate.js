/**
 * Probe: does `openUniqDrop()`'s `isCollapsableCol` gate agree with the header?
 *
 * The header's ▶N▤ button is built by `initCollapsableColumns()`, which resolves
 * the column name with `_cleanColHeaderText()` (preferring `th.dataset.colName`)
 * precisely because `_initColHeaderGlyph()` appends a U+200B to its glyph span,
 * and U+200B is not JS whitespace — it survives both a glyph-character strip and
 * `.trim()`. `openUniqDrop()` hand-rolls that strip instead.
 *
 * Prints, per column of a release tracklist: the raw header text with U+200B
 * made visible, what each resolver returns, whether the ▶N▤ toggle exists, and
 * what the column's own 📊 Structure section offers.
 *
 *     node scripts/probe-uniq-collapse-gate.js [fixture.html]
 */

'use strict';

const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');
const { waitForRenderComplete } = require('../tests/support/browser');

// Defaults to the fixture this bug was found on: 5 collapsable AR columns, all
// glyph-bearing, badges 3/10/9/2/14. Pass another fixture path to check it.
const FIXTURE = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', 'tests', 'fixtures', 'release-tracks-multirow-instruments.html');
const URL = 'https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const rows = await page.evaluate(() => {
        const vis = (s) => s.replace(/​/g, '<ZWSP>');
        const strip = (t) => t.replace(/[⇅▲▼⁰¹²³⁴⁵⁶⁷⁸⁹📊▶◀▤0-9]/g, '').trim().replace(/\s+/g, ' ');
        const tables = Array.from(document.querySelectorAll('table.tbl'));
        const headers = tables.flatMap((t) =>
            Array.from(t.querySelectorAll('thead tr:first-child th')));
        return headers.map((th, i) => {
            const toggle = th.querySelector('.mb-col-collapse-hdr-btn');
            const badge = th.querySelector('.mb-col-collapse-count');
            return {
                i,
                dataset: th.dataset.colName || null,
                stripped: vis(strip(th.textContent)),
                hasToggle: !!toggle,
                badge: badge ? badge.textContent.trim() : null,
            };
        });
    });

    const declared = await page.evaluate(() => {
        // The page definition's own list, as openUniqDrop() reads it.
        const d = window.__saTest && window.__saTest.activeCollapsableColumns
            ? window.__saTest.activeCollapsableColumns() : null;
        return d;
    });

    console.log(`fixture: ${path.basename(FIXTURE)}`);
    console.log(`declared collapsableColumns: ${declared ? JSON.stringify(declared) : '(not exposed)'}`);
    console.log('');
    console.log('idx  toggle  badge  dataset.colName          stripped textContent');
    for (const r of rows) {
        console.log(`${String(r.i).padStart(3)}  ${r.hasToggle ? '  ▶▤  ' : '      '}  `
            + `${String(r.badge || '').padEnd(5)}  ${String(r.dataset).padEnd(22)}  ${r.stripped}`);
    }

    // For each column that HAS a ▶N▤ toggle, what does its 📊 offer?
    console.log('\ncolumn with a ▶N▤ toggle -> its 📊 Structure entries');
    for (const r of rows.filter((x) => x.hasToggle)) {
        const sections = await page.evaluate((n) => window.__saTest.getUniqDropSections(n), r.dataset);
        const structure = (sections || []).find((s) => s.label === 'Structure');
        const labels = structure ? structure.items.map((it) => `${it.label} (${it.count})`) : [];
        console.log(`  [${r.i}] ${r.dataset}: ${labels.length ? labels.join(', ') : '(no Structure section)'}`);
    }

    await browser.close();
})();
