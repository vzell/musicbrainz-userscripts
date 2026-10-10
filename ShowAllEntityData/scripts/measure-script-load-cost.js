/**
 * What does the userscript's sheer SIZE cost on a page load, before it does
 * anything useful?  (org/build-framework.org, question 0.)
 *
 * Every page an `@include` matches parses the whole file and runs its top
 * level down to the pageType gate (`if (!pageType || !headerContainer)`),
 * even when no pageType matches. This measures that fixed cost, in Chromium,
 * on a page that has no pageType, so every run stops at that gate:
 *
 *   real            today's file, unchanged
 *   prescan         the file wrapped in a never-called function: V8 only
 *                   pre-parses it. A floor, not a separate phase.
 *   stripped        comments and indentation removed with acorn tokens,
 *                   every newline kept (line numbers stay 1:1), lines up to
 *                   the IIFE kept verbatim
 *   pad-code-10MB   real + a never-called function of comment-free code
 *                   from the file itself, to 10,000,000 bytes
 *   pad-comment-10MB real + comment-only lines from the file itself, to
 *                   10,000,000 bytes
 *   real+changelog  real, with the library's changelog cache seeded the way
 *                   a normal user's profile has it (1.9 MB JSON, parsed by
 *                   VZ_MBLibrary's initRemoteContent() right after the IIFE)
 *
 * Per run: a fresh BrowserContext (its own renderer, so no in-memory V8
 * compilation cache carries over), iro/pako/VZ_MBLibrary injected untimed,
 * the arm's source fetched into the page untimed, then a `<script>` element
 * with that text is appended. An inline script runs synchronously on
 * insertion, so `performance.now()` around the append is parse + compile +
 * run-to-the-gate. "settled" waits two more macrotasks, which catches the
 * library's async changelog parse. CDP `Performance.getMetrics` gives the
 * renderer's ScriptDuration delta; JSHeapUsedSize is read after a forced GC
 * before and after.
 *
 * The GM_* functions are a minimal IN-MEMORY stub written here, not
 * tests/support/gmStubs.js: that one persists the whole store to
 * localStorage on every GM_setValue, which with a 1.9 MB changelog cached
 * would add a cost Tampermonkey does not have.
 *
 * What this cannot see: Tampermonkey itself (reading the script and its
 * storage, handing them to the page, its own sandbox). See the manual recipe
 * in org/build-framework.org.
 *
 * Nothing is written to the working copy. Output is JSON to --out (or
 * stdout) and a summary table on stderr.
 *
 *     node scripts/measure-script-load-cost.js [--runs 15] [--warmup 2]
 *         [--throttle 1,4] [--arms real,stripped,…] [--out file.json]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { chromium } = require('playwright');
const { IRO_PATH, PAKO_PATH, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('../tests/support/loadPage');
const { machineInfo, readScriptVersion, readCurrentBranch } = require('../tests/support/runMetadata');

const PROJECT_ROOT = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(PROJECT_ROOT, 'ShowAllEntityData_CHANGELOG.json');
const CHANGELOG_CACHE_KEY = 'showallentitydata-remote-changelog';

const PAGE_URL = 'https://musicbrainz.org/__saed-measure';
const ARM_URL = 'https://musicbrainz.org/__saed-measure/arm.js';
const PAGE_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>measure</title></head>'
    + '<body><div id="content"></div></body></html>';
const GATE_TEXT = 'Required elements not found';
const TARGET_BYTES = 10000000;

/**
 * Parse `--name value` pairs from the command line.
 *
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {{runs: number, warmup: number, throttle: number[], arms: string[]|null, out: string|null}}
 */
function parseArgs(argv) {
    const opts = { runs: 15, warmup: 2, throttle: [1, 4], arms: null, out: null };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        const val = argv[i + 1];
        if (key === '--runs') opts.runs = Number(val);
        else if (key === '--warmup') opts.warmup = Number(val);
        else if (key === '--throttle') opts.throttle = val.split(',').map(Number);
        else if (key === '--arms') opts.arms = val.split(',');
        else if (key === '--out') opts.out = val;
        else throw new Error(`unknown argument ${key}`);
    }
    return opts;
}

/**
 * Parse a script with acorn, collecting its comments and the ranges of
 * string/template tokens (a line start inside one is string content, so its
 * whitespace must survive).
 *
 * @param {string} src - Script source.
 * @returns {{ast: Object, comments: Array<{block: boolean, start: number, end: number}>, literals: Array<number[]>}}
 */
function parseWithTokens(src) {
    const comments = [];
    const literals = [];
    const ast = acorn.parse(src, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        allowHashBang: true,
        onComment: (block, text, start, end) => comments.push({ block, start, end }),
        onToken: (tok) => {
            const label = tok.type.label;
            if (label === 'template' || label === 'string') literals.push([tok.start, tok.end]);
        },
    });
    return { ast, comments, literals };
}

/**
 * Whether `pos` lies inside one of the sorted, non-overlapping `ranges`.
 *
 * @param {Array<number[]>} ranges - Sorted [start, end) pairs.
 * @param {number} pos - Offset to test.
 * @returns {boolean}
 */
function insideRange(ranges, pos) {
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (pos < ranges[mid][0]) hi = mid - 1;
        else if (pos >= ranges[mid][1]) lo = mid + 1;
        else return true;
    }
    return false;
}

/**
 * Offset of the first character of 1-based line `line`.
 *
 * @param {string} src - Source text.
 * @param {number} line - 1-based line number.
 * @returns {number}
 */
function offsetOfLine(src, line) {
    let pos = 0;
    for (let l = 1; l < line; l++) {
        pos = src.indexOf('\n', pos) + 1;
        if (pos === 0) return src.length;
    }
    return pos;
}

/**
 * Remove comments and leading indentation from `src`, keeping every newline
 * so line numbers stay 1:1. Everything before `keepFrom` is copied verbatim
 * (the ==UserScript== header and the credits block). A block comment becomes
 * its own newlines, or one space if it had none, so ASI and token boundaries
 * do not change.
 *
 * @param {string} src - Script source.
 * @param {number} keepFrom - Offset before which nothing is touched.
 * @returns {string}
 */
function stripCommentsKeepLines(src, keepFrom) {
    const { comments, literals } = parseWithTokens(src);
    const out = [];
    let ci = 0;
    let chunkStart = 0;
    let atLineStart = true;
    let i = 0;
    while (ci < comments.length && comments[ci].start < keepFrom) ci++;
    while (i < src.length) {
        if (i < keepFrom) {
            i = keepFrom;
            atLineStart = true;
            continue;
        }
        if (ci < comments.length && i === comments[ci].start) {
            out.push(src.slice(chunkStart, i));
            const body = src.slice(comments[ci].start, comments[ci].end);
            const newlines = body.split('\n').length - 1;
            out.push(comments[ci].block ? (newlines ? '\n'.repeat(newlines) : ' ') : '');
            i = comments[ci].end;
            chunkStart = i;
            ci++;
            atLineStart = false;
            continue;
        }
        const ch = src[i];
        if (atLineStart && (ch === ' ' || ch === '\t') && !insideRange(literals, i)) {
            out.push(src.slice(chunkStart, i));
            i++;
            chunkStart = i;
            continue;
        }
        atLineStart = ch === '\n';
        i++;
    }
    out.push(src.slice(chunkStart));
    return out.join('');
}

/**
 * Body statements of the file's top-level IIFE, as [start, end) ranges.
 *
 * @param {Object} ast - acorn Program node.
 * @returns {Array<number[]>}
 */
function iifeStatementRanges(ast) {
    for (const stmt of ast.body) {
        const call = stmt.type === 'ExpressionStatement' ? stmt.expression : null;
        const fn = call && call.type === 'CallExpression' ? call.callee : null;
        if (fn && fn.type === 'FunctionExpression') {
            return fn.body.body.map(s => [s.start, s.end]);
        }
    }
    throw new Error('no top-level IIFE found');
}

/**
 * A never-called function declaration filled with whole top-level
 * statements of `codeSrc`'s IIFE, about `bytes` long. A declaration, not a
 * parenthesised expression: V8 compiles a parenthesised function eagerly.
 * Each pass over the statements goes into its own nested function, so a
 * second copy of a `const` never shares a scope with the first.
 *
 * @param {string} codeSrc - Comment-free source to copy statements from.
 * @param {number} bytes - Wanted size.
 * @returns {string}
 */
function buildCodePad(codeSrc, bytes) {
    const { ast } = parseWithTokens(codeSrc);
    const ranges = iifeStatementRanges(ast);
    const copies = [];
    let size = 0;
    for (let copy = 0; size < bytes; copy++) {
        const parts = [];
        for (const [start, end] of ranges) {
            if (size >= bytes) break;
            const text = codeSrc.slice(start, end);
            parts.push(text);
            size += Buffer.byteLength(text) + 1;
        }
        copies.push(`function __saedPadCopy${copy}() {\n${parts.join('\n')}\n}`);
    }
    return '\nfunction __saedPadCode() {\n' + copies.join('\n') + '\n}\n';
}

/**
 * Comment-only lines of `src` (its `//` and `*` lines, as written), repeated
 * until about `bytes` long.
 *
 * @param {string} src - Script source.
 * @param {number} bytes - Wanted size.
 * @returns {string}
 */
function buildCommentPad(src, bytes) {
    const lines = src.split('\n').filter(l => /^\s*\/\//.test(l));
    const parts = [];
    let size = 0;
    for (let k = 0; size < bytes; k++) {
        const line = lines[k % lines.length];
        parts.push(line);
        size += Buffer.byteLength(line) + 1;
    }
    return '\n' + parts.join('\n') + '\n';
}

/**
 * Build the source text of every arm.
 *
 * @param {string} src - Today's userscript.
 * @returns {Object<string, {source: string, seedChangelog: boolean, note: string}>}
 */
function buildArms(src) {
    const keepFrom = offsetOfLine(src, src.slice(0, 20000).split('\n').findIndex(l => l.startsWith('(function')) + 1);
    const stripped = stripCommentsKeepLines(src, keepFrom);
    parseWithTokens(stripped);
    const padCode = src + buildCodePad(stripped, TARGET_BYTES - Buffer.byteLength(src));
    const padComment = src + buildCommentPad(src, TARGET_BYTES - Buffer.byteLength(src));
    parseWithTokens(padCode);
    return {
        'real': { source: src, seedChangelog: false, note: "today's file" },
        'prescan': {
            source: 'function __saedPrescanOnly() {\n' + src + '\n}\n',
            seedChangelog: false,
            note: 'never-called wrapper: lazy pre-parse only',
        },
        'stripped': { source: stripped, seedChangelog: false, note: 'comments + indentation removed, newlines kept' },
        'pad-code-10MB': { source: padCode, seedChangelog: false, note: 'real + never-called code to 10 MB' },
        'pad-comment-10MB': { source: padComment, seedChangelog: false, note: 'real + comment lines to 10 MB' },
        'real+changelog': { source: src, seedChangelog: true, note: 'real, changelog cache seeded (1.9 MB JSON)' },
    };
}

/**
 * Init-script text for a minimal in-memory GM_* stub (see the file comment
 * for why not tests/support/gmStubs.js).
 *
 * @param {Object<string, *>} seed - Initial GM values.
 * @returns {string}
 */
function gmStubScript(seed) {
    return `(() => {
        const values = ${JSON.stringify(seed)};
        window.__gmSetCount = 0;
        window.GM_info = { script: { name: 'ShowAllEntityData (measure)', version: 'measure' } };
        window.GM_getValue = (k, d) => (Object.prototype.hasOwnProperty.call(values, k) ? values[k] : d);
        window.GM_setValue = (k, v) => { window.__gmSetCount++; values[k] = v; };
        window.GM_deleteValue = (k) => { delete values[k]; };
        window.GM_listValues = () => Object.keys(values);
        window.GM_addStyle = (css) => {
            const s = document.createElement('style');
            s.textContent = css;
            document.head.appendChild(s);
            return s;
        };
        window.GM_registerMenuCommand = () => 0;
        window.GM_unregisterMenuCommand = () => {};
        window.GM_xmlhttpRequest = (o) => {
            setTimeout(() => o.onload && o.onload({ status: 404, responseText: '', response: null, finalUrl: o.url }), 0);
            return { abort() {} };
        };
    })();`;
}

/**
 * Read one named metric from a CDP Performance.getMetrics answer.
 *
 * @param {{metrics: Array<{name: string, value: number}>}} m - CDP answer.
 * @param {string} name - Metric name.
 * @returns {number}
 */
function metric(m, name) {
    const hit = m.metrics.find(x => x.name === name);
    return hit ? hit.value : NaN;
}

/**
 * One measured page load of one arm.
 *
 * @param {import('playwright').Browser} browser - Shared browser.
 * @param {{source: string, seedChangelog: boolean}} arm - The arm.
 * @param {number} rate - CPU throttling rate (1 = none).
 * @param {string} changelogText - Changelog JSON text, for the seeded arm.
 * @returns {Promise<Object>} timings, or {error}
 */
async function measureOnce(browser, arm, rate, changelogText) {
    const context = await browser.newContext();
    const seed = { sa_settings_migration_level: 9999 };
    if (arm.seedChangelog) seed[CHANGELOG_CACHE_KEY] = { ts: Date.now(), data: changelogText };
    await context.addInitScript({ content: gmStubScript(seed) });
    await context.route('**/*', (route) => {
        const url = route.request().url();
        if (url === PAGE_URL) return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE_HTML });
        if (url === ARM_URL) return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: arm.source });
        return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    const errors = [];
    let gateSeen = false;
    page.on('pageerror', e => errors.push(String(e && e.message || e)));
    page.on('console', (msg) => { if (msg.text().includes(GATE_TEXT)) gateSeen = true; });
    try {
        await page.goto(PAGE_URL);
        await page.addScriptTag({ path: IRO_PATH });
        await page.addScriptTag({ path: PAKO_PATH });
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        await page.evaluate(async (u) => { window.__armSrc = await (await fetch(u)).text(); }, ARM_URL);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await cdp.send('HeapProfiler.collectGarbage');
        const before = await cdp.send('Performance.getMetrics');
        const t = await page.evaluate(async () => {
            const t0 = performance.now();
            const s = document.createElement('script');
            s.textContent = window.__armSrc;
            document.head.appendChild(s);
            const t1 = performance.now();
            await new Promise(r => setTimeout(r, 0));
            await new Promise(r => setTimeout(r, 0));
            const t2 = performance.now();
            return { syncMs: t1 - t0, settledMs: t2 - t0, gmSets: window.__gmSetCount };
        });
        const after = await cdp.send('Performance.getMetrics');
        await cdp.send('HeapProfiler.collectGarbage');
        const afterGc = await cdp.send('Performance.getMetrics');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        return {
            ...t,
            scriptDurationMs: (metric(after, 'ScriptDuration') - metric(before, 'ScriptDuration')) * 1000,
            heapDeltaMB: (metric(afterGc, 'JSHeapUsedSize') - metric(before, 'JSHeapUsedSize')) / 1e6,
            gateSeen,
            errors,
        };
    } catch (e) {
        return { error: String(e && e.message || e), errors };
    } finally {
        await context.close();
    }
}

/**
 * Time JSON.parse of the changelog text inside a page (median of `n`).
 *
 * @param {import('playwright').Browser} browser - Shared browser.
 * @param {string} text - Changelog JSON.
 * @param {number} rate - CPU throttling rate.
 * @param {number} n - Repetitions.
 * @returns {Promise<{medianMs: number, all: number[]}>}
 */
async function measureChangelogParse(browser, text, rate, n) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(PAGE_HTML);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const all = await page.evaluate(({ t, k }) => {
        const r = [];
        for (let i = 0; i < k; i++) {
            const t0 = performance.now();
            JSON.parse(t);
            r.push(performance.now() - t0);
        }
        return r;
    }, { t: text, k: n });
    await context.close();
    return { medianMs: stats(all.slice(1)).median, all };
}

/**
 * Median, p10, p90, min and max of `xs`.
 *
 * @param {number[]} xs - Samples.
 * @returns {{n: number, median: number, p10: number, p90: number, min: number, max: number}}
 */
function stats(xs) {
    const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
    const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN);
    return { n: s.length, median: q(0.5), p10: q(0.1), p90: q(0.9), min: s[0], max: s[s.length - 1] };
}

/**
 * Size facts of one arm's source.
 *
 * @param {string} source - Arm source.
 * @returns {{bytes: number, chars: number, charsAboveFF: number, lines: number}}
 */
function sizeFacts(source) {
    let above = 0;
    for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) > 0xff) above++;
    return {
        bytes: Buffer.byteLength(source),
        chars: source.length,
        charsAboveFF: above,
        lines: source.split('\n').length,
    };
}

(async () => {
    const opts = parseArgs(process.argv.slice(2));
    const startedAt = new Date().toISOString();
    const src = fs.readFileSync(USERSCRIPT_PATH, 'utf8');
    const changelogText = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const allArms = buildArms(src);
    const armNames = opts.arms || Object.keys(allArms);
    const browser = await chromium.launch();
    const result = {
        what: 'userscript load cost to the pageType gate (org/build-framework.org Q0)',
        scriptVersion: readScriptVersion(),
        branch: readCurrentBranch(),
        browser: `Chromium ${browser.version()}`,
        tampermonkey: 'none (in-memory GM stub)',
        machine: machineInfo(),
        startedAt,
        options: opts,
        arms: {},
        changelogParse: {},
    };
    for (const name of armNames) {
        result.arms[name] = { note: allArms[name].note, size: sizeFacts(allArms[name].source), byThrottle: {} };
    }
    for (const rate of opts.throttle) {
        const samples = Object.fromEntries(armNames.map(n => [n, []]));
        for (let r = 0; r < opts.warmup + opts.runs; r++) {
            for (const name of armNames) {
                const one = await measureOnce(browser, allArms[name], rate, changelogText);
                // The prescan arm never runs, so it never reaches the gate.
                const expectGate = name !== 'prescan';
                const valid = !one.error && !one.errors.length && (one.gateSeen || !expectGate);
                if (!valid) process.stderr.write(`[${name} x${rate} run ${r}] INVALID: ${JSON.stringify(one)}\n`);
                samples[name].push({ warmup: r < opts.warmup, invalid: !valid, ...one });
            }
            process.stderr.write(`throttle x${rate}: round ${r + 1}/${opts.warmup + opts.runs}\n`);
        }
        for (const name of armNames) {
            const kept = samples[name].filter(s => !s.warmup && !s.invalid);
            result.arms[name].byThrottle[rate] = {
                syncMs: stats(kept.map(s => s.syncMs)),
                settledMs: stats(kept.map(s => s.settledMs)),
                scriptDurationMs: stats(kept.map(s => s.scriptDurationMs)),
                heapDeltaMB: stats(kept.map(s => s.heapDeltaMB)),
                gmSets: stats(kept.map(s => s.gmSets)),
                invalid: samples[name].filter(s => s.invalid).length,
                samples: samples[name],
            };
        }
        result.changelogParse[rate] = await measureChangelogParse(browser, changelogText, rate, 11);
    }
    await browser.close();
    result.finishedAt = new Date().toISOString();
    const json = JSON.stringify(result, null, 2);
    if (opts.out) fs.writeFileSync(opts.out, json + '\n');
    else process.stdout.write(json + '\n');
    for (const rate of opts.throttle) {
        process.stderr.write(`\nCPU x${rate}  (median ms: sync / settled / ScriptDuration; heap MB)\n`);
        for (const name of armNames) {
            const b = result.arms[name].byThrottle[rate];
            process.stderr.write(`  ${name.padEnd(18)} ${(result.arms[name].size.bytes / 1e6).toFixed(2)} MB  `
                + `${b.syncMs.median.toFixed(1)} / ${b.settledMs.median.toFixed(1)} / ${b.scriptDurationMs.median.toFixed(1)}  `
                + `heap ${b.heapDeltaMB.median.toFixed(1)}  (n=${b.syncMs.n}, invalid=${b.invalid})\n`);
        }
        process.stderr.write(`  changelog JSON.parse median ${result.changelogParse[rate].medianMs.toFixed(1)} ms\n`);
    }
})();
