'use strict';

/**
 * Probes the "Relationships"-style sections of saved MusicBrainz pages
 * (org/relationship-tables-pt.org, Step 1): for every `<h2>` in `#content`,
 * its class, text, the `table.details` lists under it (and under each of its
 * `<h3>` sub-sections), each list's relationship phrases with their target
 * lines, and anything that looks like a truncated list ("show more" controls,
 * "See all" links).
 *
 *   node scripts/probe-rel-sections.js <fixture.html>… [--json out.json]
 *
 * No network: each file is opened from disk in Chromium with JavaScript off,
 * so what is measured is the server's HTML, as the userscript's fetched-page
 * path sees it.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args.splice(jsonIdx, 2)[1] : null;

/**
 * Runs inside the page: describes every h2 section of #content.
 *
 * @returns {Array<Object>}
 */
function describe() {
    const root = document.getElementById('content') || document.body;
    const lineTexts = (td) => {
        const lines = [[]];
        td.childNodes.forEach(n => {
            if (n.nodeName === 'BR') lines.push([]);
            else lines[lines.length - 1].push(n.textContent);
        });
        return lines.map(l => l.join('').replace(/\s+/g, ' ').trim()).filter(Boolean);
    };
    const lists = (nodes) => {
        const out = [];
        nodes.forEach(n => {
            const tables = n.matches('table.details') ? [n] : Array.from(n.querySelectorAll('table.details'));
            tables.forEach(t => {
                const rows = Array.from(t.querySelectorAll(':scope > tbody > tr, :scope > tr')).map(tr => {
                    const th = tr.querySelector(':scope > th');
                    const td = tr.querySelector(':scope > td');
                    if (!th || !td) return null;
                    return {
                        phrase: th.textContent.trim().replace(/:\s*$/, ''),
                        lines: lineTexts(td),
                        hrefs: Array.from(td.querySelectorAll('a[href]')).slice(0, 3).map(a => a.getAttribute('href'))
                    };
                }).filter(Boolean);
                out.push({ cls: t.className, rows });
            });
        });
        return out;
    };
    const sections = [];
    const h2s = Array.from(root.querySelectorAll('h2')).filter(h => !h.closest('table'));
    h2s.forEach(h2 => {
        const nodes = [];
        for (let n = h2.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) nodes.push(n);
        // #bottom-credits keeps its h3 blocks inside sibling divs of the h2.
        const subs = [];
        nodes.forEach(n => {
            const h3s = n.tagName === 'H3' ? [n] : Array.from(n.querySelectorAll(':scope > h3'));
            h3s.forEach(h3 => subs.push({ h3: h3.textContent.replace(/\s+/g, ' ').trim(), parentId: n.id || '' }));
        });
        sections.push({
            h2: h2.textContent.replace(/\s+/g, ' ').trim(),
            cls: h2.className,
            parent: h2.parentElement.id || h2.parentElement.tagName,
            tblTables: nodes.reduce((k, n) => k + (n.matches('table.tbl') ? 1 : n.querySelectorAll('table.tbl').length), 0),
            subs,
            lists: lists(nodes),
            showMore: nodes.reduce((k, n) => k + n.querySelectorAll('button, a[href*="link_type_id"], .show-all, [class*="more"]').length, 0)
        });
    });
    return sections;
}

(async () => {
    if (!args.length) throw new Error('usage: node scripts/probe-rel-sections.js <fixture.html>… [--json out.json]');
    const browser = await chromium.launch();
    const report = {};
    try {
        const ctx = await browser.newContext({ javaScriptEnabled: false });
        const page = await ctx.newPage();
        await page.route(/^https?:/, r => r.abort());
        for (const f of args) {
            await page.goto('file://' + path.resolve(f), { waitUntil: 'domcontentloaded' });
            const sections = await page.evaluate(describe);
            report[path.basename(f)] = sections;
            console.log(`\n=== ${path.basename(f)}`);
            sections.forEach(s => {
                const nRows = s.lists.reduce((k, l) => k + l.rows.length, 0);
                const nLines = s.lists.reduce((k, l) => k + l.rows.reduce((j, r) => j + r.lines.length, 0), 0);
                console.log(`  h2 "${s.h2}" .${s.cls || '-'} in #${s.parent}: ${s.tblTables} table.tbl, ` +
                    `${s.lists.length} table.details (${nRows} phrases, ${nLines} lines), ` +
                    `${s.subs.length} h3 [${s.subs.map(x => x.h3 + (x.parentId ? '@' + x.parentId : '')).join(' | ')}], showMore-ish ${s.showMore}`);
                s.lists.forEach(l => l.rows.forEach(r => console.log(`      ${r.phrase}: ${r.lines.length} → ${r.lines.slice(0, 2).join(' ‖ ').slice(0, 150)}`)));
            });
        }
    } finally {
        await browser.close();
    }
    if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
