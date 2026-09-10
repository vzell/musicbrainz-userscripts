'use strict';

/**
 * Why a per-sub-table perf metric cannot reach its target on a multi-table
 * page, answered from the rendered DOM rather than guessed.
 *
 * Written after `capture-interaction-perf.js --pageType=artist-releasegroups`
 * timed out clicking sub-table 29's column-filter input. CLAUDE.md already
 * warns that `artist-releasegroups`' `.mb-master-toggle` reads `expanded`
 * while individual sub-tables are still hidden, and that a hidden element is
 * a 0x0 target Playwright will never click — so "is it visible" has to be
 * asked per element, per sub-table, before a descriptor commits to one.
 *
 *   node scripts/probe-multitable-metric-targets.js --pageType=artist-releasegroups
 *   node scripts/probe-multitable-metric-targets.js --pageType=… --tableIndex=29
 */

const { chromium } = require('playwright');
const { seedGmValues } = require('../tests/support/gmStubs');
const { loadFromDiskFixture } = require('../tests/support/diskFixture');
const { waitForRenderComplete } = require('../tests/support/browser');
const { toArm, pageTypeList } = require('../tests/support/perfDescriptors');

/** @param {string[]} argv @returns {Object<string, string>} */
function parseArgs(argv) {
    const out = {};
    for (const a of argv) {
        const m = a.match(/^--([^=]+)=(.*)$/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

(async () => {
    const args = parseArgs(process.argv.slice(2));
    let config;
    try {
        config = toArm(args.pageType);
    } catch (err) {
        console.error(err.message);
        console.error(`registered: ${pageTypeList().join(', ')}`);
        process.exit(2);
    }
    const want = args.tableIndex === undefined ? config.subTableIndex : Number(args.tableIndex);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await seedGmValues(page, config.seedGmValues);
        await loadFromDiskFixture(page, {
            url: config.url, fixturePath: config.fixturePath, testMode: true,
        });
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 180000 });

        // --expand: prove (or disprove) that a DOM-level click on the section's
        // own <h3> is what makes its table reachable. `el.click()` rather than
        // Playwright's Locator.click() for the reason capture-interaction-perf.js
        // already records for the uniq-drop wrap: a mouse-simulated click at
        // computed coordinates can land on one of the many controls the h3
        // contains, while a DOM-level click targets the h3 itself, so
        // makeH2sCollapsible's "ignore clicks on A/BUTTON/INPUT/..." guard
        // cannot swallow it.
        if (args.expand !== undefined) {
            const before = await page.locator('table.tbl').nth(want).isVisible();
            await page.locator('h3.mb-toggle-h3').nth(want).evaluate((el) => el.click());
            await page.waitForTimeout(500);
            const after = await page.locator('table.tbl').nth(want).isVisible();
            console.log(`--expand: sub-table ${want} visible ${before} -> ${after}`);
        }

        const report = await page.evaluate(({ idx, filterColumn, sortColumn }) => {
            const vis = (el) => {
                if (!el) return 'absent';
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                if (cs.display === 'none') return 'display:none';
                if (cs.visibility === 'hidden') return 'visibility:hidden';
                if (r.width === 0 && r.height === 0) return '0x0';
                return `visible ${Math.round(r.width)}x${Math.round(r.height)}`;
            };
            const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();

            const tables = Array.from(document.querySelectorAll('table.tbl'));
            const h3s = Array.from(document.querySelectorAll('h3.mb-toggle-h3'));
            const master = document.querySelector('.mb-master-toggle');

            const perTable = tables.map((t, i) => ({
                i,
                rows: t.querySelectorAll('tbody tr').length,
                table: vis(t),
                h3: vis(h3s[i]),
                discHidden: h3s[i] ? h3s[i].getAttribute('data-mb-disc-hidden') : null,
                filterRow: vis(t.querySelector('thead .mb-col-filter-input')),
            }));

            const t = tables[idx];
            const detail = t ? (() => {
                const ths = Array.from(t.querySelectorAll('thead th'));
                const names = ths.map((th) => strip(th.textContent));
                const fi = names.indexOf(filterColumn);
                const si = names.indexOf(sortColumn);
                return {
                    rows: t.querySelectorAll('tbody tr').length,
                    table: vis(t),
                    h3: vis(h3s[idx]),
                    filterColumnIndex: fi,
                    filterInput: vis(t.querySelector(`thead .mb-col-filter-input[data-col-idx="${fi}"]`)),
                    filterClear: vis(t.querySelector(
                        `thead .mb-col-filter-wrapper:has(.mb-col-filter-input[data-col-idx="${fi}"]) .mb-col-filter-clear`
                    )),
                    sortColumnIndex: si,
                    sortBtn: vis(si >= 0 ? ths[si].querySelector('.sort-icon-btn') : null),
                    uniqWrap: vis(si >= 0 ? ths[si].querySelector('.mb-col-uniq-wrap') : null),
                    sortStatus: vis(h3s[idx] ? h3s[idx].querySelector('.mb-sort-status') : null),
                    searchToggle: vis(h3s[idx] ? h3s[idx].querySelector('.mb-subtable-filter-toggle, [class*="filter-toggle"]') : null),
                };
            })() : null;

            return {
                tableCount: tables.length,
                h3Count: h3s.length,
                masterState: master ? master.getAttribute('data-state') : null,
                masterText: master ? (master.textContent || '').trim().slice(0, 40) : null,
                perTable,
                detail,
                // Every distinct visibility verdict, so "how many are hidden"
                // is one line rather than 47.
                tableVisSummary: perTable.reduce((acc, p) => {
                    acc[p.table] = (acc[p.table] || 0) + 1;
                    return acc;
                }, {}),
                filterRowVisSummary: perTable.reduce((acc, p) => {
                    acc[p.filterRow] = (acc[p.filterRow] || 0) + 1;
                    return acc;
                }, {}),
            };
        }, { idx: want, filterColumn: config.filterColumn, sortColumn: config.sortColumn });

        console.log(`${config.pageType}: ${report.tableCount} table.tbl, ${report.h3Count} h3.mb-toggle-h3`);
        console.log(`master toggle: data-state=${report.masterState} text="${report.masterText}"`);
        console.log(`table visibility across the page: ${JSON.stringify(report.tableVisSummary)}`);
        console.log(`filter-row visibility across the page: ${JSON.stringify(report.filterRowVisSummary)}`);
        console.log(`\nsub-table ${want} (the descriptor's SUB_TABLE_INDEX):`);
        for (const [k, v] of Object.entries(report.detail || {})) {
            console.log(`  ${k.padEnd(18)} ${v}`);
        }
        console.log('\nfirst 6 and the 4 largest sub-tables:');
        const show = [...report.perTable.slice(0, 6),
            ...[...report.perTable].sort((a, b) => b.rows - a.rows).slice(0, 4)];
        for (const p of show) {
            console.log(`  ${String(p.i).padStart(2)} rows=${String(p.rows).padStart(4)} `
                + `table=${p.table.padEnd(22)} h3=${p.h3.padEnd(22)} filterRow=${p.filterRow}`);
        }
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error('probe failed:', e); process.exit(1); });
