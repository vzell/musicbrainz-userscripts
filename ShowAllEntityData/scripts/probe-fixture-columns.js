'use strict';

/**
 * Derive an interaction-perf descriptor's constants FROM a committed disk
 * fixture, by loading it through the real Load-from-disk pipeline and reading
 * the rendered table.
 *
 * `artistEventsFixture.js`'s own JSDoc is emphatic that its filter values and
 * uniq counts "were derived directly from the committed DISK FIXTURE" and must
 * be re-verified if it is ever re-captured. This script is how that is done
 * for a NEW fixture, instead of writing plausible-looking numbers and
 * discovering later that a filter matched nothing (which reads as a fast
 * result, not as a failure).
 *
 * Reports: row count, every column's header name and index, the highest- and
 * lowest-cardinality columns, and — for the column named by --filterColumn —
 * its distinct values with counts, so the five perf filter values and the
 * narrow header-count filter value can be picked from real data.
 *
 *   node scripts/probe-fixture-columns.js --pageType=artist-releases-dylan \
 *        --filterColumn=Country
 */

const path = require('path');
const { chromium } = require('playwright');
const { seedGmValues } = require('../tests/support/gmStubs');
const { loadFromDiskFixture } = require('../tests/support/diskFixture');
const { waitForRenderComplete } = require('../tests/support/browser');
const { waitForColHeaderCountsStable } = require('../tests/support/filterSortAssertions');

// Registered pageTypes live in ONE place — see that module's header for what
// the three-copy version cost.
const { DESCRIPTORS, pageTypeList } = require('../tests/support/perfDescriptors');

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
    const pageType = args.pageType;
    // A fixture being probed for the FIRST time has no descriptor module yet —
    // that is the whole point of running this — so --url/--fixture override it.
    let url = args.url;
    let fixturePath = args.fixture;
    let seeds = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };
    if (!url && DESCRIPTORS[pageType]) {
        const d = DESCRIPTORS[pageType];
        url = d.URL;
        fixturePath = d.FIXTURE_PATH;
        seeds = d.SEED_GM_VALUES;
        // A registered multi-table descriptor already knows which sub-table it
        // means; only override it when --tableIndex= says otherwise.
        if (d.SUB_TABLE_INDEX !== undefined && !args.tableIndex) {
            args.tableIndex = String(d.SUB_TABLE_INDEX);
        }
    }
    if (!url || !fixturePath) {
        console.error('need --pageType with a descriptor, or --url= and --fixture=');
        console.error(`registered pageTypes: ${pageTypeList().join(', ')}`);
        process.exit(2);
    }
    fixturePath = path.resolve(fixturePath);
    // Which sub-table the column report describes. Only meaningful on a
    // multi-table page, and NOT safely defaulted to 0 there: on
    // artist-releasegroups sub-table 0 is "Album" with 21 of the page's 2143
    // rows, so a descriptor written from it would have every per-table metric
    // measuring 1% of the page. Read the "largest sub-tables" list this script
    // prints, then re-run with --tableIndex=<that index>.
    const subTableIndex = Number(args.tableIndex || 0);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await seedGmValues(page, seeds);
        await loadFromDiskFixture(page, { url, fixturePath, testMode: true });
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });
        // The .mb-col-uniq-count badges are the AUTHORITATIVE uniq counts —
        // they come from the real uniq-drop machinery, which does not
        // necessarily agree with a naive distinct-textContent tally (multi-row
        // cells, sort-key sentinels, getCleanColumnText's own normalisation).
        // UNIQ_COUNT_TOTAL is asserted against a badge by
        // waitForColHeaderUniqCount(), so it has to be read from one.
        // 300 s, not the 90 s default: a multi-table page runs the
        // column-header scan per sub-table, and 47 of them do not settle
        // inside the single-table budget.
        await waitForColHeaderCountsStable(page, { timeout: 300000 });

        // ── Page shape, for a `tableMode: 'multi'` descriptor ────────────────
        // The column report below is deliberately scoped to the FIRST
        // `table.tbl`, which is what every per-table metric in
        // `capture-interaction-perf.js` also resolves to (see
        // `perfDescriptors.js`'s multi-table contract). On a multi-table page
        // that makes its `rows:` line a SUB-TABLE row count, not the page's —
        // so the page-wide numbers have to be reported separately, or
        // TOTAL_ROWS gets written from the wrong one.
        const shape = await page.evaluate(() => {
            const tables = Array.from(document.querySelectorAll('table.tbl'));
            // An h3's textContent swallows its whole per-table filter-bar UI
            // (history dropdown, pinned list, toggle labels — hundreds of
            // characters), so keep only the leading label up to its own
            // "(N)" row-count marker. Enough to recognise the section;
            // never enough to match on, which is the point.
            const headings = Array.from(document.querySelectorAll('h3.mb-toggle-h3'))
                .map((h) => {
                    const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
                    const m = t.match(/^([^(]*\([0-9 ]+\))/);
                    return m ? m[1].trim() : t.slice(0, 60);
                });
            return {
                tableCount: tables.length,
                pageRows: document.querySelectorAll('table.tbl tbody tr').length,
                perTableRows: tables.map((t) => t.querySelectorAll('tbody tr').length),
                headings,
            };
        });

        const report = await page.evaluate(({ filterColumn, countColumn, countSubstrings, tableIndex }) => {
            const table = document.querySelectorAll('table.tbl')[tableIndex];
            if (!table) throw new Error(`no table.tbl at index ${tableIndex}`);
            const ths = Array.from(table.querySelectorAll('thead tr:first-child th'));
            const names = ths.map((th, i) => th.dataset.colName
                || (th.textContent || '').replace(/[⇅▲▼📊▶◀▤⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim()
                || `(col ${i})`);
            // What `columnIndex()`/`waitForColHeaderUniqCount()` will actually
            // match on: the STRIPPED textContent alone, with no
            // `dataset.colName` fallback. A column whose header carries a
            // dynamically-injected glyph embeds a zero-width space those
            // helpers do not strip, so the two can disagree — and a descriptor
            // written from the `names` above would then name a column the
            // harness can never resolve.
            const strippedNames = ths.map((th) => (th.textContent || '')
                .replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim());
            const rows = Array.from(table.querySelectorAll('tbody tr'));

            const cellText = (tr, i) => {
                const td = tr.cells[i];
                if (!td) return '';
                const c = td.cloneNode(true);
                c.querySelectorAll('[style*="display: none"], [style*="display:none"], script')
                    .forEach((el) => el.remove());
                return (c.textContent || '').replace(/\s+/g, ' ').trim();
            };

            const cardinality = names.map((name, i) => {
                const seen = new Set();
                for (const tr of rows) seen.add(cellText(tr, i));
                const badgeEl = ths[i].querySelector('.mb-col-uniq-count');
                const badge = badgeEl ? (badgeEl.textContent || '').trim() : '';
                return { i, name, distinct: seen.size, badge: badge === '' ? null : Number(badge) };
            });

            // Candidates for UNIQ_COUNT_FILTER_VALUE: a distinct value of the
            // count column that a SUBSTRING filter isolates cleanly. A column
            // filter is a substring match, so a title that is a prefix of
            // other titles ("Desire" inside "Desire (remastered)") drags them
            // in — reported here as substringRows > ownRows, which is the
            // signal to pick a different one rather than discover it later as
            // a badge that never reaches the expected number.
            let countCandidates = null;
            const ci = names.indexOf(countColumn);
            if (ci !== -1) {
                const own = {};
                for (const tr of rows) {
                    const v = cellText(tr, ci);
                    if (v) own[v] = (own[v] || 0) + 1;
                }
                const texts = rows.map((tr) => cellText(tr, ci));
                countCandidates = Object.entries(own)
                    .filter(([, n]) => n >= 2 && n <= 6)
                    .map(([v, n]) => {
                        const hits = texts.filter((t) => t.includes(v));
                        return {
                            value: v,
                            ownRows: n,
                            substringRows: hits.length,
                            substringDistinct: new Set(hits).size,
                        };
                    })
                    .filter((c) => c.substringRows === c.ownRows)
                    .sort((a, b) => a.ownRows - b.ownRows)
                    .slice(0, 12);
            }

            let values = null;
            const fi = names.indexOf(filterColumn);
            if (fi !== -1) {
                const counts = {};
                for (const tr of rows) {
                    const v = cellText(tr, fi);
                    if (!v) continue;
                    counts[v] = (counts[v] || 0) + 1;
                }
                values = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            }
            // Evaluate explicit candidate SUBSTRINGS against the count
            // column. This is what a column filter actually does, and it is
            // the only way to know both numbers UNIQ_COUNT_FILTER_VALUE needs
            // (rows kept, and distinct values among them) before writing them
            // into a descriptor. A candidate wanted for the header-count
            // metric should keep SEVERAL distinct values, not one: a badge of
            // 1 is also what a badly-truncated scan would produce, so it
            // cannot distinguish a correct scan from a broken one.
            let substringResults = null;
            if (ci !== -1 && countSubstrings.length) {
                const texts2 = rows.map((tr) => cellText(tr, ci));
                substringResults = countSubstrings.map((sub) => {
                    const hits = texts2.filter((t) => t.includes(sub));
                    return { sub, rows: hits.length, distinct: new Set(hits).size };
                });
            }
            return {
                rowCount: rows.length, names, strippedNames, cardinality,
                filterIndex: fi, values, countCandidates, substringResults,
            };
        }, {
            filterColumn: args.filterColumn || '',
            countColumn: args.countColumn || '',
            countSubstrings: (args.countSubstrings || '').split('|').filter(Boolean),
            tableIndex: subTableIndex,
        });

        if (shape.tableCount > 1) {
            console.log(`page shape: MULTI-table — ${shape.tableCount} table.tbl, `
                + `${shape.pageRows} rows page-wide  <-- TOTAL_ROWS`);
            const top = shape.perTableRows
                .map((n, i) => ({ i, n, h: shape.headings[i] || '(no h3)' }))
                .sort((a, b) => b.n - a.n)
                .slice(0, 8);
            console.log('  largest sub-tables (index, rows, h3):');
            for (const t of top) console.log(`    ${String(t.i).padStart(2)}  ${String(t.n).padStart(5)}  ${t.h}`);
            console.log(`  h3 headings: ${shape.headings.length} (index-aligned with the tables `
                + 'when equal — the ONLY safe way to name a sub-table, since an h3\'s textContent '
                + 'swallows the whole per-table filter-bar UI)');
        } else {
            console.log(`page shape: SINGLE-table — ${shape.pageRows} rows  <-- TOTAL_ROWS`);
        }
        console.log(`rows (sub-table ${subTableIndex}): ${report.rowCount}`
            + '  <-- SUB_TABLE_INDEX, and the row set every per-table metric acts on');
        console.log(`columns (${report.names.length}):`);
        for (const c of report.cardinality) {
            const flag = (c.badge !== null && c.badge !== c.distinct) ? '  <-- badge != naive tally' : '';
            console.log(`  ${String(c.i).padStart(2)}  ${c.name.padEnd(22)} `
                + `badge=${String(c.badge).padStart(5)}  naive=${String(c.distinct).padStart(5)}${flag}`);
        }
        const mismatch = report.names
            .map((n, i) => ({ n, s: report.strippedNames[i], i }))
            .filter((x) => x.n !== x.s);
        if (mismatch.length) {
            console.log('  NOTE: header name != stripped textContent for '
                + `${mismatch.length} column(s) — a descriptor MUST use the stripped form, `
                + 'since that is what columnIndex()/waitForColHeaderUniqCount() match on:');
            for (const x of mismatch) {
                console.log(`    ${String(x.i).padStart(2)}  dataset="${x.n}"  stripped="${x.s}"`);
            }
        }
        const byCard = [...report.cardinality].sort((a, b) => b.distinct - a.distinct);
        console.log(`highest cardinality: ${byCard[0].name} (${byCard[0].distinct})`);
        if (report.values) {
            console.log(`\n"${args.filterColumn}" distinct values (count desc), top 25:`);
            for (const [v, n] of report.values.slice(0, 25)) console.log(`  ${String(n).padStart(5)}  ${v}`);
            const narrow = report.values.filter(([, n]) => n >= 2 && n <= 5);
            console.log(`\n  values matching 2-5 rows (for the narrow header-count filter): `
                + narrow.slice(0, 10).map(([v, n]) => `${v} (${n})`).join(', '));
        } else if (args.filterColumn) {
            console.log(`\ncolumn "${args.filterColumn}" not found`);
        }
        if (report.countCandidates) {
            console.log(`\n"${args.countColumn}" narrow-filter candidates `
                + '(substring isolates the value cleanly):');
            for (const c of report.countCandidates) {
                console.log(`  rows=${c.ownRows} distinct=${c.substringDistinct}  ${c.value}`);
            }
        }
        if (report.substringResults) {
            console.log(`\n"${args.countColumn}" candidate SUBSTRINGS (what a column filter would do):`);
            for (const r of report.substringResults) {
                const good = r.rows >= 2 && r.distinct >= 2 && r.rows <= 30 ? '  <-- usable' : '';
                console.log(`  rows=${String(r.rows).padStart(4)} distinct=${String(r.distinct).padStart(4)}`
                    + `  "${r.sub}"${good}`);
            }
        }
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error('probe failed:', e); process.exit(1); });
