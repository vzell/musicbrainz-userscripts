'use strict';

/**
 * Prints the rows of a saved page's `table.tbl` groups that have a value in
 * one column, with that cell's HTML — for reading a user's final-rendered-page
 * snapshot (debug/*.html) without opening it.
 *
 *   node scripts/probe-snapshot-table-col.js <snapshot.html> <column> [max-rows] [row-regex]
 *
 * `row-regex`: only rows whose whole text matches it (case-insensitive).
 *
 * No network: the file is opened with JavaScript off and every request aborted.
 */

const path = require('path');
const { chromium } = require('playwright');

const [file, column, max = '8', rowRe = ''] = process.argv.slice(2);

(async () => {
    if (!file || !column) throw new Error('usage: node scripts/probe-snapshot-table-col.js <snapshot.html> <column> [max-rows]');
    const browser = await chromium.launch();
    try {
        const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
        await page.route(/^https?:/, r => r.abort());
        await page.goto('file://' + path.resolve(file), { waitUntil: 'domcontentloaded' });
        const out = await page.evaluate(({ column, max, rowRe }) => Array.from(document.querySelectorAll('table.tbl')).map(t => {
            const heads = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th =>
                (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊0-9]/gu, '').trim());
            const k = heads.indexOf(column);
            if (k < 0) return null;
            let h = t.previousElementSibling;
            while (h && h.tagName !== 'H3') h = h.previousElementSibling;
            const re = new RegExp(rowRe, 'i');
            const rows = Array.from(t.querySelectorAll('tbody tr')).filter(tr => tr.cells[k] && tr.cells[k].textContent.trim() && re.test(tr.textContent));
            return `== ${h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '?'}: ${rows.length} row(s) with "${column}"\n` +
                rows.slice(0, max).map(tr => '  ' + Array.from(tr.cells).slice(0, 4).map(c => c.textContent.trim()).join(' | ') +
                    '\n     ' + tr.cells[k].innerHTML.slice(0, 400)).join('\n');
        }).filter(Boolean), { column, max: +max, rowRe });
        console.log(out.join('\n'));
    } finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
