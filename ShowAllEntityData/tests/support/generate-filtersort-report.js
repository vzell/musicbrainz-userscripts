'use strict';

/**
 * Reads Playwright's `--reporter=json` output from stdin (the actual
 * pass/fail results of a run of
 * `tests/live/artist-releases-filter-sort.spec.js`) and writes:
 *   - debug/artist-releases-filterSort-test-report.org
 *   - debug/artist-releases-filterSort-test-report.html
 *
 * Usage:
 *   playwright test tests/live/artist-releases-filter-sort.spec.js \
 *     --project=chromium-live --reporter=json \
 *     | node tests/support/generate-filtersort-report.js
 *
 * Both report files are regenerated from the run's actual results every
 * time — never hand-typed — so they can't silently drift from reality.
 * The methodology/provenance prose below is authored once and reused
 * verbatim on every regeneration.
 */

const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '..', '..', 'debug');
const ORG_OUT = path.join(DEBUG_DIR, 'artist-releases-filterSort-test-report.org');
const HTML_OUT = path.join(DEBUG_DIR, 'artist-releases-filterSort-test-report.html');

/**
 * Recursively walks a Playwright JSON-reporter `suite` tree, collecting
 * every leaf spec's title and outcome, PLUS every `test.step()` inside it
 * (its own `title`/`duration`/pass-fail, nested under the parent test's
 * title) — most of this spec's individual filter/sort/dropdown cases are
 * `test.step()`s inside a handful of consolidated `test()`s (see the
 * spec's own "PERFORMANCE" note), so step-level timing is what actually
 * satisfies "timing information per case", not just each `test()`'s own
 * total duration which now spans many cases. Robust to suite nesting depth
 * (project -> file -> describe-block, or just project -> file).
 *
 * @param {Object} suite
 * @param {Array<{title: string, status: string, duration: number, error: ?string, isStep?: boolean}>} out
 */
function collectSpecs(suite, out) {
    if (!suite) return;
    for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
            const result = (t.results || [])[t.results.length - 1] || {};
            out.push({
                title: spec.title,
                status: result.status || 'unknown',
                duration: result.duration || 0,
                error: result.error ? String(result.error.message || result.error).split('\n')[0] : null,
            });
            walkSteps(result.steps || [], spec.title, out);
        }
    }
    for (const child of suite.suites || []) {
        collectSpecs(child, out);
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
 */
function walkSteps(steps, parentTitle, out) {
    for (const step of steps) {
        // Confirmed live (this Playwright version's JSON reporter): a
        // `test.step()` entry here carries no `category` field at all
        // (just `title`/`duration`/optionally `error`) — this spec never
        // creates any OTHER kind of nested step, so every entry in a
        // result's top-level `steps` array is one of ours; no filtering
        // needed (an earlier `category === 'test.step'` check silently
        // matched nothing and dropped every step from the report).
        out.push({
            title: `${parentTitle} › ${step.title}`,
            status: step.error ? 'failed' : 'passed',
            duration: step.duration || 0,
            error: step.error ? String(step.error.message || step.error).split('\n')[0] : null,
            isStep: true,
        });
        if (step.steps && step.steps.length) walkSteps(step.steps, parentTitle, out);
    }
}

function readJsonFromStdin() {
    const raw = fs.readFileSync(0, 'utf8');
    return JSON.parse(raw);
}

function orgEscape(s) {
    return String(s).replace(/\|/g, '\\vert{}');
}

function buildOrgReport(specs, stats) {
    const preface = `#+TITLE: artist-releases (BoDeans) filter/sort/highlight regression report
#+DATE: ${new Date().toISOString()}

* Methodology

This report is generated from an actual run of
tests/live/artist-releases-filter-sort.spec.js (\`node
tests/support/generate-filtersort-report.js\`, reading Playwright's own
--reporter=json output) — every row below reflects a real pass/fail
outcome, never a hand-typed expectation.

** Ground-truth provenance

Every expected count in the spec (see
tests/support/bodeansArtistReleasesFixture.js) was derived directly from
debug/BoDeans-artist-releases-final.html (the committed rendered baseline,
captured with real CAA/Relationships network access) and cross-checked
against debug/BoDeans-artist-releases-original.html (the true raw,
pre-script MusicBrainz HTML) — 8 of 8 core stats matched exactly between
the two files (Artist 55/1 case-variant split, all 9 Format buckets,
Label/Catalog#/Barcode breakdowns, CAA's 37/19 sort-key split).

** Single Cc/Rx/Ex checkbox triad

\`artist-releases\` is tableMode: 'single', so there is only ONE Cc/Rx/Ex
checkbox triad on the whole page — it governs the global filter AND every
column filter identically. There is no per-column-filter-row override (that
only exists on tableMode: 'multi' pages' Sub-Table Filter panel).

** Section key

- §A — per-column typed filter cases (plus highlight assertion)
- §B — combo / global+column-order-pair cases
- §C — sort-then-restore checkpoints
- §D — uniq-dropdown checks, filters cleared
- §E — uniq-dropdown checks, one filter left active
- §F — uniq-dropdown-DRIVEN filtering (checking items, not typing)

* Summary

| Metric | Value |
|---|---|
| Total cases | ${stats.total} |
| Passed | ${stats.passed} |
| Failed | ${stats.failed} |
| Other (skipped/timedOut/interrupted) | ${stats.other} |
| Total duration | ${(stats.totalDuration / 1000).toFixed(1)}s |

* Case-by-case results

#+CAPTION: Every case executed, in run order
| Case | Status | Duration (ms) | Error |
|---|---|---|---|
`;

    const rows = specs.map((s) => `| ${orgEscape(s.title)} | ${s.status} | ${s.duration} | ${s.error ? orgEscape(s.error) : ''} |`).join('\n');

    return `${preface}${rows}\n`;
}

function htmlEscape(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildHtmlReport(specs, stats) {
    const rows = specs.map((s) => `
        <tr class="${s.status}">
            <td>${htmlEscape(s.title)}</td>
            <td>${s.status}</td>
            <td>${s.duration}</td>
            <td>${s.error ? htmlEscape(s.error) : ''}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>artist-releases (BoDeans) filter/sort/highlight regression report</title>
<style>
    body { font-family: system-ui, sans-serif; margin: 2em; background: #fafafa; color: #222; }
    h1 { font-size: 1.4em; }
    .stats { display: flex; gap: 1.5em; margin: 1em 0 2em; }
    .stat { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 0.75em 1.25em; }
    .stat .n { font-size: 1.6em; font-weight: bold; display: block; }
    table { border-collapse: collapse; width: 100%; background: #fff; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 0.9em; }
    th { background: #f0f0f0; }
    tr.passed { background: #f0fff4; }
    tr.failed { background: #fff5f5; }
    tr.failed td:nth-child(2) { color: #b00020; font-weight: bold; }
    tr.passed td:nth-child(2) { color: #0a7a2c; }
</style>
</head>
<body>
<h1>artist-releases (BoDeans) filter/sort/highlight regression report</h1>
<p>Generated ${new Date().toISOString()} from an actual Playwright run of
<code>tests/live/artist-releases-filter-sort.spec.js</code>.</p>
<div class="stats">
    <div class="stat"><span class="n">${stats.total}</span>Total cases</div>
    <div class="stat"><span class="n">${stats.passed}</span>Passed</div>
    <div class="stat"><span class="n">${stats.failed}</span>Failed</div>
    <div class="stat"><span class="n">${(stats.totalDuration / 1000).toFixed(1)}s</span>Duration</div>
</div>
<table>
    <thead><tr><th>Case</th><th>Status</th><th>Duration (ms)</th><th>Error</th></tr></thead>
    <tbody>${rows}
    </tbody>
</table>
</body>
</html>
`;
}

(function main() {
    const json = readJsonFromStdin();
    const specs = [];
    for (const suite of json.suites || []) {
        collectSpecs(suite, specs);
    }

    const stats = {
        total: specs.length,
        passed: specs.filter((s) => s.status === 'passed').length,
        failed: specs.filter((s) => s.status === 'failed').length,
        other: specs.filter((s) => s.status !== 'passed' && s.status !== 'failed').length,
        totalDuration: specs.reduce((sum, s) => sum + s.duration, 0),
    };

    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(ORG_OUT, buildOrgReport(specs, stats));
    fs.writeFileSync(HTML_OUT, buildHtmlReport(specs, stats));

    console.log(`Wrote ${ORG_OUT}`);
    console.log(`Wrote ${HTML_OUT}`);
    console.log(`${stats.passed}/${stats.total} passed`);
})();
