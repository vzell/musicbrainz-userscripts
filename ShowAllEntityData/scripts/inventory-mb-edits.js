'use strict';

/**
 * Inventory of the edit types an entity's "Editing history" page can show,
 * and how each is represented, for the editing-history window of the
 * MusicBrainz entity popup (org/mb-edit-history.org):
 *
 *   node scripts/inventory-mb-edits.js [--json OUT.json] <page.html>...
 *
 * Each saved page (scripts/fetch-mb-page-fixture.js, debug/edits-*.html) is
 * parsed inside Playwright Chromium by the prototype parser
 * scripts/lib/mb-edits-parser.browser.js (DOMParser, as the userscript's
 * `_mbPageLoad()` does). Prints, per page, the record's head (subject, total,
 * pages, entries), then across all pages one line per edit type: its
 * category, how many, the statuses seen, the row shapes (label:kind, `+tbl`
 * when a value holds a nested table) and one example edit per page. --json
 * writes every parsed record, keyed by file name, for the mockups.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

/**
 * Entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const args = process.argv.slice(2);
    let jsonOut = null;
    const ji = args.indexOf('--json');
    if (ji >= 0) {
        jsonOut = args[ji + 1];
        args.splice(ji, 2);
    }
    if (!args.length) {
        console.log('usage: node scripts/inventory-mb-edits.js [--json OUT.json] <page.html>...');
        process.exit(2);
    }
    const browser = await chromium.launch();
    const records = {};
    const types = new Map();
    try {
        const page = await browser.newPage();
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ path: path.join(__dirname, 'lib', 'mb-edits-parser.browser.js') });
        for (const file of args) {
            const html = fs.readFileSync(file, 'utf8');
            const rec = await page.evaluate((h) => window.mbParseEditsPage(new DOMParser().parseFromString(h, 'text/html')), html);
            const name = path.basename(file, '.html');
            records[name] = rec;
            if (!rec) {
                console.log(`${name}: NOT an editing-history page`);
                continue;
            }
            console.log(`${name}: ${rec.subject ? rec.subject.path : '?'} "${rec.subject ? rec.subject.name : ''}" `
                + `total=${rec.atLeast ? '≥' : ''}${rec.total} page=${rec.page}/${rec.pages} entries=${rec.entries.length}`);
            rec.entries.forEach((e) => {
                const k = e.type + (e.preNgs ? ' (pre-NGS)' : '');
                if (!types.has(k)) types.set(k, { cat: e.cat, slug: e.slug, n: 0, statuses: new Set(), shapes: new Set(), ex: new Set(), notes: 0 });
                const t = types.get(k);
                t.n++;
                t.statuses.add(e.status + (e.statusLabel ? `=${e.statusLabel}` : ''));
                t.shapes.add(e.rows.map(r => `${r.label}:${r.kind}${r.nestedTable ? '+tbl' : ''}`).join(' | ') || '(no rows)');
                if (t.ex.size < 3) t.ex.add(`${name}#${e.id}`);
                t.notes += e.notes.length;
            });
        }
    } finally {
        await browser.close();
    }
    console.log('\n=== edit types across all pages ===');
    Array.from(types.entries()).sort((a, b) => a[1].cat.localeCompare(b[1].cat) || b[1].n - a[1].n).forEach(([k, t]) => {
        console.log(`\n[${t.cat}] ${k}  (slug ${t.slug}) ×${t.n}, statuses ${Array.from(t.statuses).join(', ')}, notes ${t.notes}`);
        console.log(`   e.g. ${Array.from(t.ex).join(', ')}`);
        Array.from(t.shapes).slice(0, 4).forEach(s => console.log(`   rows: ${s}`));
        if (t.shapes.size > 4) console.log(`   … ${t.shapes.size - 4} more row shapes`);
    });
    if (jsonOut) {
        fs.writeFileSync(jsonOut, JSON.stringify(records, null, 1), 'utf8');
        console.log(`\nwrote ${jsonOut}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
