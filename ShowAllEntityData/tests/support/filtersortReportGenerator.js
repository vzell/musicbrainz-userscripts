'use strict';

/**
 * Shared, config-driven engine behind every `generate-*-filtersort-report.js`
 * entry point (currently `generate-filtersort-report.js` for
 * `artist-releases-filter-sort.spec.js`, and
 * `generate-releasegroup-releases-filtersort-report.js` for
 * `releasegroup-releases-filter-sort.spec.js`). Extracted from the former's
 * original single-suite implementation so a future new-pageType suite can
 * get report coverage by writing a small config object + a 3-line entry
 * script, rather than copy-pasting this whole file.
 *
 * Reads Playwright's own `--reporter=json` output from stdin (never
 * hand-typed) and writes a timestamped `.org`/`.html` pair to `debug/` — see
 * `main()`'s own JSDoc for the exact filename shape and why it's
 * timestamped.
 *
 * Usage (from an entry script):
 *   require('./filtersortReportGenerator').main(config);
 *
 * @typedef {Object} FilterSortReportConfig
 * @property {string} suiteLabel - Human-readable suite name, e.g. "artist-releases (BoDeans)" — used in titles/headings.
 * @property {string} specPath - Relative path to the spec file, for the report's own methodology line.
 * @property {string} outputBasename - e.g. "artist-releases-filterSort-test-report" — a timestamp + extension is appended by `main()`, not the config.
 * @property {Array<{heading: string, body: string}>} methodologySections - Suite-specific prose blocks (ground-truth provenance, single-vs-per-subtable Cc/Rx/Ex note, etc.) — each rendered as its own "**"/`<h3>` subsection under "Methodology".
 * @property {Array<{marker: string, description: string}>} sectionKey - e.g. `[{marker:'§A', description:'per-column typed filter cases...'}, ...]` — rendered as a bullet list.
 * @property {(title: string) => string} classifyCase - Suite-specific pattern classifier for the "Coverage by category" table — the one genuinely per-suite piece of LOGIC, not just data.
 * @property {(title: string) => (string|null)} [classifyGroup] - OPTIONAL second dimension (e.g. extracts "Official release"/"Promotion release" from a case title) — when present, an EXTRA "Coverage by group" table is rendered alongside "Coverage by category"; omit for a suite with no such dimension (the report shape is then identical to before this engine existed).
 */

const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '..', '..', 'debug');

/**
 * Recursively walks a Playwright JSON-reporter `suite` tree, collecting
 * every leaf spec's title and outcome, PLUS every `test.step()` inside it
 * (its own `title`/`duration`/pass-fail, nested under the parent test's
 * title) — most of a comprehensive filter/sort suite's individual cases are
 * `test.step()`s inside a handful of consolidated `test()`s (see each
 * spec's own "PERFORMANCE" note), so step-level timing is what actually
 * satisfies "timing information per case", not just each `test()`'s own
 * total duration which now spans many cases. Robust to suite nesting depth
 * (project -> file -> describe-block, or just project -> file).
 *
 * @param {Object} suite
 * @param {Array<{title: string, status: string, duration: number, error: ?string, isStep?: boolean}>} out
 * @param {(title: string) => string} classifyCase
 */
function collectSpecs(suite, out, classifyCase) {
    if (!suite) return;
    for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
            const result = (t.results || [])[t.results.length - 1] || {};
            out.push({
                title: spec.title,
                category: classifyCase(spec.title),
                status: result.status || 'unknown',
                duration: result.duration || 0,
                error: result.error ? String(result.error.message || result.error).split('\n')[0] : null,
            });
            walkSteps(result.steps || [], spec.title, out, classifyCase);
        }
    }
    for (const child of suite.suites || []) {
        collectSpecs(child, out, classifyCase);
    }
}

/**
 * Recursively collects `test.step()` entries (steps can nest) from one
 * test result's `steps` array, prefixing each with its parent test's title
 * for readability in the flat report table.
 *
 * @param {Array<Object>} steps
 * @param {string} parentTitle
 * @param {Array<Object>} out
 * @param {(title: string) => string} classifyCase
 */
function walkSteps(steps, parentTitle, out, classifyCase) {
    for (const step of steps) {
        const fullTitle = `${parentTitle} › ${step.title}`;
        out.push({
            title: fullTitle,
            category: classifyCase(fullTitle),
            status: step.error ? 'failed' : 'passed',
            duration: step.duration || 0,
            error: step.error ? String(step.error.message || step.error).split('\n')[0] : null,
            isStep: true,
        });
        if (step.steps && step.steps.length) walkSteps(step.steps, parentTitle, out, classifyCase);
    }
}

function readJsonFromStdin() {
    const raw = fs.readFileSync(0, 'utf8');
    return JSON.parse(raw);
}

function orgEscape(s) {
    return String(s).replace(/\|/g, '\\vert{}');
}

function htmlEscape(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Formats a millisecond duration as "Xm Y.Ys" (or just "Y.Ys" under a
 * minute) — the summary-level wall-clock/sum-of-durations metrics run into
 * several hundred seconds on a full opt-in run, and a raw seconds count at
 * that size is harder to read at a glance than minutes + seconds. Per-case/
 * step durations in the case-by-case table stay in raw ms — precision
 * matters more than readability there, and they're all well under a minute
 * individually.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    return minutes > 0 ? `${minutes}m ${seconds.toFixed(1)}s` : `${seconds.toFixed(1)}s`;
}

/**
 * Groups `specs` by `category` (or, for the group-dimension variant, by
 * whatever `keyFn` returns) and tallies pass/fail/other per group, in
 * descending total-count order.
 *
 * @param {Array<Object>} specs
 * @param {(spec: Object) => string} keyFn
 * @returns {Array<{category: string, total: number, passed: number, failed: number, other: number}>}
 */
function summarizeBy(specs, keyFn) {
    const byKey = new Map();
    for (const s of specs) {
        const key = keyFn(s);
        if (key === null || key === undefined) continue;
        if (!byKey.has(key)) byKey.set(key, { category: key, total: 0, passed: 0, failed: 0, other: 0 });
        const c = byKey.get(key);
        c.total++;
        if (s.status === 'passed') c.passed++;
        else if (s.status === 'failed') c.failed++;
        else c.other++;
    }
    return [...byKey.values()].sort((a, b) => b.total - a.total);
}

function buildSummaryTableOrg(rows) {
    return rows.map((c) => `| ${orgEscape(c.category)} | ${c.total} | ${c.passed} | ${c.failed} | ${c.other} |`).join('\n');
}

function buildSummaryTableHtml(rows) {
    return rows.map((c) => `
        <tr>
            <td>${htmlEscape(c.category)}</td>
            <td>${c.total}</td>
            <td>${c.passed}</td>
            <td>${c.failed}</td>
            <td>${c.other}</td>
        </tr>`).join('');
}

/**
 * @param {Array<Object>} specs
 * @param {{total:number,passed:number,failed:number,other:number,totalDuration:number,wallClockDuration:number}} stats
 * @param {FilterSortReportConfig} config
 * @returns {string}
 */
function buildOrgReport(specs, stats, config) {
    const categorySummary = summarizeBy(specs, (s) => s.category);
    const categoryRows = buildSummaryTableOrg(categorySummary);

    const groupSummary = config.classifyGroup ? summarizeBy(specs, (s) => config.classifyGroup(s.title)) : null;

    const methodologyOrg = config.methodologySections
        .map((sec) => `** ${sec.heading}\n\n${sec.body}\n`)
        .join('\n');

    const sectionKeyOrg = config.sectionKey
        .map((sk) => `- ${sk.marker} — ${sk.description}`)
        .join('\n');

    const preface = `#+TITLE: ${config.suiteLabel} filter/sort/highlight regression report
#+DATE: ${new Date().toISOString()}

* Methodology

This report is generated from an actual run of
${config.specPath} (via a \`generate-*-filtersort-report.js\` entry script
built on the shared \`tests/support/filtersortReportGenerator.js\` engine,
reading Playwright's own --reporter=json output) — every row below reflects
a real pass/fail outcome, never a hand-typed expectation.

${methodologyOrg}
** Section key

${sectionKeyOrg}

* Summary

| Metric | Value |
|---|---|
| Total cases | ${stats.total} |
| Passed | ${stats.passed} |
| Failed | ${stats.failed} |
| Other (skipped/timedOut/interrupted) | ${stats.other} |
| **Complete test run duration (wall-clock)** | **${formatDuration(stats.wallClockDuration)}** |
| Sum of individual case/step durations | ${formatDuration(stats.totalDuration)} (steps nest inside their parent test, so this over-counts vs. wall-clock — informational only) |

* Coverage by category

Purely pattern-classified from each case/step's own title (section markers
+ keywords, see the suite's own \`classifyCase()\`) — not a separate
assertion, just a breakdown of what kind of behavior each already-run case
covers.

#+CAPTION: Cases grouped by what they actually verify
| Category | Total | Passed | Failed | Other |
|---|---|---|---|---|
${categoryRows}
`;

    const groupSection = groupSummary ? `
* Coverage by group

Purely pattern-classified from each case/step's own title via the suite's
own \`classifyGroup()\` — surfaces whether a gap is per-kind (see "Coverage
by category" above) or per-group (e.g. one sub-table's own scenarios).

#+CAPTION: Cases grouped by which sub-table/group they exercise
| Group | Total | Passed | Failed | Other |
|---|---|---|---|---|
${buildSummaryTableOrg(groupSummary)}
` : '';

    const caseTableHeader = `
* Case-by-case results

#+CAPTION: Every case executed, in run order
| Case | Category | Status | Duration (ms) | Error |
|---|---|---|---|---|
`;
    const rows = specs.map((s) => `| ${orgEscape(s.title)} | ${orgEscape(s.category)} | ${s.status} | ${s.duration} | ${s.error ? orgEscape(s.error) : ''} |`).join('\n');

    return `${preface}${groupSection}${caseTableHeader}${rows}\n`;
}

/**
 * @param {Array<Object>} specs
 * @param {{total:number,passed:number,failed:number,other:number,totalDuration:number,wallClockDuration:number}} stats
 * @param {FilterSortReportConfig} config
 * @returns {string}
 */
function buildHtmlReport(specs, stats, config) {
    const categorySummary = summarizeBy(specs, (s) => s.category);
    const categoryRows = buildSummaryTableHtml(categorySummary);

    const groupSummary = config.classifyGroup ? summarizeBy(specs, (s) => config.classifyGroup(s.title)) : null;

    const methodologyHtml = config.methodologySections
        .map((sec) => `<h3>${htmlEscape(sec.heading)}</h3>\n<p>${sec.body}</p>`)
        .join('\n');

    const sectionKeyHtml = `<ul>${config.sectionKey.map((sk) => `<li><strong>${htmlEscape(sk.marker)}</strong> — ${sk.description}</li>`).join('')}</ul>`;

    const rows = specs.map((s) => `
        <tr class="${s.status}">
            <td>${htmlEscape(s.title)}</td>
            <td>${htmlEscape(s.category)}</td>
            <td>${s.status}</td>
            <td>${s.duration}</td>
            <td>${s.error ? htmlEscape(s.error) : ''}</td>
        </tr>`).join('');

    const groupSection = groupSummary ? `
<h2>Coverage by group</h2>
<p>Purely pattern-classified from each case/step's own title via the suite's
own <code>classifyGroup()</code> — surfaces whether a gap is per-kind or
per-group.</p>
<table>
    <thead><tr><th>Group</th><th>Total</th><th>Passed</th><th>Failed</th><th>Other</th></tr></thead>
    <tbody>${buildSummaryTableHtml(groupSummary)}
    </tbody>
</table>` : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${htmlEscape(config.suiteLabel)} filter/sort/highlight regression report</title>
<style>
    body { font-family: system-ui, sans-serif; margin: 2em; background: #fafafa; color: #222; }
    h1 { font-size: 1.4em; }
    h2 { font-size: 1.1em; margin-top: 2em; }
    h3 { font-size: 1em; margin-top: 1.5em; }
    .stats { display: flex; gap: 1.5em; margin: 1em 0 2em; flex-wrap: wrap; }
    .stat { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 0.75em 1.25em; }
    .stat.highlight { border-color: #1976D2; }
    .stat .n { font-size: 1.6em; font-weight: bold; display: block; }
    table { border-collapse: collapse; width: 100%; background: #fff; margin-bottom: 1.5em; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 0.9em; }
    th { background: #f0f0f0; }
    tr.passed { background: #f0fff4; }
    tr.failed { background: #fff5f5; }
    tr.failed td:nth-child(3) { color: #b00020; font-weight: bold; }
    tr.passed td:nth-child(3) { color: #0a7a2c; }
</style>
</head>
<body>
<h1>${htmlEscape(config.suiteLabel)} filter/sort/highlight regression report</h1>
<p>Generated ${new Date().toISOString()} from an actual Playwright run of
<code>${htmlEscape(config.specPath)}</code>.</p>
<div class="stats">
    <div class="stat"><span class="n">${stats.total}</span>Total cases</div>
    <div class="stat"><span class="n">${stats.passed}</span>Passed</div>
    <div class="stat"><span class="n">${stats.failed}</span>Failed</div>
    <div class="stat highlight"><span class="n">${formatDuration(stats.wallClockDuration)}</span>Complete run duration (wall-clock)</div>
    <div class="stat"><span class="n">${formatDuration(stats.totalDuration)}</span>Sum of case/step durations (over-counts vs. wall-clock)</div>
</div>
<h2>Methodology</h2>
${methodologyHtml}
<h3>Section key</h3>
${sectionKeyHtml}
<h2>Coverage by category</h2>
<p>Purely pattern-classified from each case/step's own title — not a separate
assertion, just a breakdown of what kind of behavior each already-run case
covers.</p>
<table>
    <thead><tr><th>Category</th><th>Total</th><th>Passed</th><th>Failed</th><th>Other</th></tr></thead>
    <tbody>${categoryRows}
    </tbody>
</table>
${groupSection}
<h2>Case-by-case results</h2>
<table>
    <thead><tr><th>Case</th><th>Category</th><th>Status</th><th>Duration (ms)</th><th>Error</th></tr></thead>
    <tbody>${rows}
    </tbody>
</table>
</body>
</html>
`;
}

/**
 * Reads Playwright's `--reporter=json` output from stdin, builds the report,
 * and writes a TIMESTAMPED `.org`/`.html` pair to `debug/` — e.g.
 * `debug/artist-releases-filterSort-test-report-2026-08-31T10-15-03-123Z.org`
 * — so repeated runs never clobber a previous report (the earlier behavior,
 * a fixed filename overwritten every run, made it impossible to compare two
 * runs after the fact). `debug/` is already gitignored, so accumulating
 * timestamped reports over time doesn't touch version control — no cleanup
 * mechanism is provided, by design; prune `debug/` manually whenever.
 *
 * @param {FilterSortReportConfig} config
 */
function main(config) {
    const json = readJsonFromStdin();
    const specs = [];
    for (const suite of json.suites || []) {
        collectSpecs(suite, specs, config.classifyCase);
    }

    const stats = {
        total: specs.length,
        passed: specs.filter((s) => s.status === 'passed').length,
        failed: specs.filter((s) => s.status === 'failed').length,
        other: specs.filter((s) => s.status !== 'passed' && s.status !== 'failed').length,
        totalDuration: specs.reduce((sum, s) => sum + s.duration, 0),
        // The real end-to-end wall-clock time of the whole run, from
        // Playwright's own top-level `stats.duration` — distinct from
        // `totalDuration` above (which sums every case AND every step
        // nested inside it, double-counting since a step's duration is a
        // subset of its parent test's own duration).
        wallClockDuration: (json.stats && json.stats.duration) || 0,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const orgOut = path.join(DEBUG_DIR, `${config.outputBasename}-${stamp}.org`);
    const htmlOut = path.join(DEBUG_DIR, `${config.outputBasename}-${stamp}.html`);

    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(orgOut, buildOrgReport(specs, stats, config));
    fs.writeFileSync(htmlOut, buildHtmlReport(specs, stats, config));

    console.log(`Wrote ${orgOut}`);
    console.log(`Wrote ${htmlOut}`);
    console.log(`${stats.passed}/${stats.total} passed in ${formatDuration(stats.wallClockDuration)}`);
}

module.exports = {
    main,
    collectSpecs,
    walkSteps,
    formatDuration,
    orgEscape,
    htmlEscape,
    summarizeBy,
    buildOrgReport,
    buildHtmlReport,
};
