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
 * Added 2026-10-22 (org/userscript-size.org):
 *
 *   none            no userscript at all: the floor of the page plus the
 *                   three @require'd libraries, and the memory baseline
 *   stripped-ascii  stripped, with every character above U+00FF written as
 *                   an escape (comments: replaced), so the source can be held
 *                   one-byte instead of two-byte
 *   rev:<version>   an OLDER userscript, read with `git show <rev>:…`
 *                   (`--rev`), timed in the same session as today's file so
 *                   versions are compared as ratios, never as absolutes from
 *                   two sessions. It runs against today's library.
 *   pad-code-<N>MB  one per `--pad-to` size (default 10 MB, as before)
 *
 *   --memory        after each run, drop the arm's text from the page, force a
 *                   GC, and take a Chromium memory-infra dump of the run's
 *                   renderer: its private footprint (the task manager's
 *                   "Memory footprint") and the allocators, above all
 *                   `parkable_strings`, where Blink keeps the source text.
 *                   PSS/RSS from /proc/<pid>/smaps_rollup are recorded too
 *                   (Linux only), but they also count freed memory the
 *                   allocator has not returned yet, so they are the weaker
 *                   figure. The pid comes from CDP SystemInfo.getProcessInfo:
 *                   the largest renderer that did not exist before the run.
 *   --page/--url    measure a SUPPORTED pageType's initial page instead of
 *                   the bare gate page: `--page` is a saved raw snapshot
 *                   (tests/snapshots/<pageType>/raw.html), `--url` the
 *                   musicbrainz.org URL it was captured at. A run is valid
 *                   when the h1 toolbar (#mb-show-all-controls-container) is
 *                   in the document, and "settled" adds one animation frame.
 *                   Every request but the page and the arm is aborted, so
 *                   MusicBrainz's own CSS and scripts do not load.
 *
 * Per run: a fresh BrowserContext (its own renderer, so no in-memory V8
 * compilation cache carries over), iro/pako/VZ_MBLibrary injected untimed,
 * the arm's source handed into the page untimed (an evaluate() argument
 * since 2026-10-22; a routed fetch() before, see measureOnce()), then a `<script>` element
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
 * stdout) and a summary table on stderr. Times are stored in Berlin time
 * with the offset (CLAUDE.md, "Time zone: Europe/Berlin").
 *
 *     node scripts/measure-script-load-cost.js [--runs 15] [--warmup 2]
 *         [--throttle 1,4] [--arms real,stripped,…] [--out file.json]
 *         [--rev <git-rev>,…] [--pad-to 10000000,15000000] [--memory]
 *         [--page tests/snapshots/<pageType>/raw.html --url <mb-url>]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const {
    IRO_PATH, PAKO_PATH, MB_LIBRARY_PATH, USERSCRIPT_PATH, SETTINGS_MIGRATION_PRE_APPLIED,
} = require('../tests/support/loadPage');
const { machineInfo, readScriptVersion, readCurrentBranch, berlinIso } = require('../tests/support/runMetadata');
const {
    parseWithTokens, iifeLineOffset, stripCommentsKeepLines, escapeAboveLatin1, iifeStatementRanges, sizeFacts,
} = require('./lib/userscript-source');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(PROJECT_ROOT, '..');
const USERSCRIPT_REPO_PATH = 'ShowAllEntityData/ShowAllEntityData.user.js';
const CHANGELOG_PATH = path.join(PROJECT_ROOT, 'ShowAllEntityData_CHANGELOG.json');
const CHANGELOG_CACHE_KEY = 'showallentitydata-remote-changelog';

const PAGE_URL = 'https://musicbrainz.org/__saed-measure';
const PAGE_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>measure</title></head>'
    + '<body><div id="content"></div></body></html>';
const GATE_TEXT = 'Required elements not found';
const TOOLBAR_ID = 'mb-show-all-controls-container';
const DEFAULT_PAD_TO = [10000000];
const MEMORY_FIELDS = [
    'privateFootprintMB', 'parkableStringsMB', 'v8MB', 'partitionAllocMB', 'mallocMB', 'blinkGcMB',
    'pssMB', 'rssMB', 'jsHeapMB',
];

/**
 * Parse `--name value` pairs (and the bare `--memory` flag) from the command
 * line.
 *
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {{runs: number, warmup: number, throttle: number[], arms: string[]|null, out: string|null,
 *   revs: string[], padTo: number[], memory: boolean, page: string|null, url: string|null}}
 */
function parseArgs(argv) {
    const opts = {
        runs: 15, warmup: 2, throttle: [1, 4], arms: null, out: null,
        revs: [], padTo: DEFAULT_PAD_TO, memory: false, page: null, url: null,
    };
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (key === '--memory') {
            opts.memory = true;
            continue;
        }
        const val = argv[++i];
        if (val === undefined) throw new Error(`${key} needs a value`);
        if (key === '--runs') opts.runs = Number(val);
        else if (key === '--warmup') opts.warmup = Number(val);
        else if (key === '--throttle') opts.throttle = val.split(',').map(Number);
        else if (key === '--arms') opts.arms = val.split(',');
        else if (key === '--out') opts.out = val;
        else if (key === '--rev') opts.revs = val.split(',');
        else if (key === '--pad-to') opts.padTo = val.split(',').map(Number);
        else if (key === '--page') opts.page = val;
        else if (key === '--url') opts.url = val;
        else throw new Error(`unknown argument ${key}`);
    }
    if (Boolean(opts.page) !== Boolean(opts.url)) throw new Error('--page and --url go together');
    return opts;
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
 * An older userscript, read from git (`git show <rev>:…`), with the version
 * its own header names.
 *
 * @param {string} rev - Any git revision that has the userscript.
 * @returns {{version: string, source: string}}
 */
function readRevision(rev) {
    const source = execFileSync('git', ['show', `${rev}:${USERSCRIPT_REPO_PATH}`], {
        cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024,
    }).toString('utf8');
    const m = source.slice(0, 2000).match(/\/\/ @version\s+(\S+)/);
    return { version: m ? m[1] : rev, source };
}

/**
 * Size label of a pad target, e.g. `10MB` for 10,000,000.
 *
 * @param {number} bytes - Pad target in bytes.
 * @returns {string}
 */
function mbLabel(bytes) {
    return `${Math.round(bytes / 1e6)}MB`;
}

/**
 * Build the source text of every arm. `runs` says whether the arm executes
 * the userscript at all (it then has to reach the gate, or build the
 * toolbar on a `--page` run); `prescan` and `none` never do.
 *
 * @param {string} src - Today's userscript.
 * @param {{revs: string[], padTo: number[]}} opts - Parsed options.
 * @returns {Object<string, {source: string, seedChangelog: boolean, runs: boolean, note: string}>}
 */
function buildArms(src, opts) {
    const stripped = stripCommentsKeepLines(src, iifeLineOffset(src));
    parseWithTokens(stripped);
    const ascii = escapeAboveLatin1(stripped);
    const arms = {
        'real': { source: src, seedChangelog: false, runs: true, note: "today's file" },
        'none': { source: '', seedChangelog: false, runs: false, note: 'no userscript: page + the three @require libraries' },
        'prescan': {
            source: 'function __saedPrescanOnly() {\n' + src + '\n}\n',
            seedChangelog: false,
            runs: false,
            note: 'never-called wrapper: lazy pre-parse only',
        },
        'stripped': {
            source: stripped, seedChangelog: false, runs: true, note: 'comments + indentation removed, newlines kept',
        },
        'stripped-ascii': {
            source: ascii.source,
            seedChangelog: false,
            runs: true,
            note: `stripped, ${ascii.escaped} chars above U+00FF escaped, ${ascii.replacedInComments} in kept comments replaced: one-byte`,
        },
    };
    opts.padTo.forEach((bytes, i) => {
        const room = bytes - Buffer.byteLength(src);
        if (room <= 0) return;
        const padCode = src + buildCodePad(stripped, room);
        parseWithTokens(padCode);
        arms[`pad-code-${mbLabel(bytes)}`] = {
            source: padCode, seedChangelog: false, runs: true, note: `real + never-called code to ${mbLabel(bytes)}`,
        };
        if (i === 0) {
            arms[`pad-comment-${mbLabel(bytes)}`] = {
                source: src + buildCommentPad(src, room),
                seedChangelog: false,
                runs: true,
                note: `real + comment lines to ${mbLabel(bytes)}`,
            };
        }
    });
    arms['real+changelog'] = {
        source: src, seedChangelog: true, runs: true, note: 'real, changelog cache seeded (the changelog JSON as on disk)',
    };
    for (const rev of opts.revs) {
        const old = readRevision(rev);
        arms[`rev:${old.version.split('+')[0]}`] = {
            source: old.source, seedChangelog: false, runs: true, note: `${old.version} (git ${rev}), today's library`,
        };
    }
    return arms;
}

/**
 * Default arm list for a `--page` run: what a supported initial page costs
 * with and without the script, today and at each `--rev`.
 *
 * @param {Object<string, Object>} arms - Every built arm.
 * @returns {string[]}
 */
function defaultPageArms(arms) {
    return ['none', 'real', 'stripped', 'stripped-ascii'].concat(Object.keys(arms).filter(n => n.startsWith('rev:')));
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
 * One deterministic, detailed Chromium memory-infra dump (the data behind
 * chrome://tracing's memory view and the task manager's "Memory footprint"),
 * taken over the browser CDP session. Deterministic means Chromium runs a GC
 * first.
 *
 * @param {import('playwright').CDPSession} browserCdp - Browser-level CDP session.
 * @returns {Promise<Object[]>} The trace's memory-dump events (`ph: 'v'`).
 */
async function memoryDumpEvents(browserCdp) {
    await browserCdp.send('Tracing.start', {
        traceConfig: {
            includedCategories: ['disabled-by-default-memory-infra'],
            excludedCategories: ['*'],
            memoryDumpConfig: { triggers: [] },
        },
        transferMode: 'ReturnAsStream',
    });
    await browserCdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' });
    const complete = new Promise(r => browserCdp.once('Tracing.tracingComplete', r));
    await browserCdp.send('Tracing.end');
    const { stream } = await complete;
    const chunks = [];
    for (;;) {
        const chunk = await browserCdp.send('IO.read', { handle: stream });
        chunks.push(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data);
        if (chunk.eof) break;
    }
    await browserCdp.send('IO.close', { handle: stream });
    const trace = JSON.parse(chunks.join(''));
    return (Array.isArray(trace) ? trace : trace.traceEvents).filter(e => e.ph === 'v');
}

/**
 * The memory-infra figures of one renderer, in MB: Chromium's private
 * footprint (what its task manager calls "Memory footprint") and the
 * allocators the script's cost can land in. `parkableStringsMB` is where
 * Blink keeps a classic script's source text (measured 2026-10-22: 14.9 MB
 * for the 7.9 MB file, i.e. two bytes per character); Chromium can compress
 * those strings once a tab is in the background.
 *
 * @param {Object[]} events - memoryDumpEvents() result.
 * @param {number} pid - The renderer's pid.
 * @returns {{privateFootprintMB: number, parkableStringsMB: number, v8MB: number,
 *   partitionAllocMB: number, mallocMB: number, blinkGcMB: number}|{error: string}}
 */
function rendererAllocators(events, pid) {
    const mine = events.filter(e => e.pid === pid && e.args && e.args.dumps);
    const totals = mine.map(e => e.args.dumps.process_totals).find(Boolean);
    const allocators = mine.map(e => e.args.dumps.allocators).find(Boolean);
    if (!totals || !allocators) return { error: `no memory dump for renderer ${pid}` };
    const hexMB = (hex) => (hex ? parseInt(hex, 16) / 1048576 : NaN);
    const size = (name) => hexMB(allocators[name] && allocators[name].attrs && allocators[name].attrs.size
        && allocators[name].attrs.size.value);
    return {
        privateFootprintMB: hexMB(totals.private_footprint_bytes),
        parkableStringsMB: size('parkable_strings'),
        v8MB: size('v8'),
        partitionAllocMB: size('partition_alloc'),
        mallocMB: size('malloc'),
        blinkGcMB: size('blink_gc'),
    };
}

/**
 * Pids of the browser's renderer processes right now.
 *
 * @param {import('playwright').CDPSession} browserCdp - Browser-level CDP session.
 * @returns {Promise<number[]>}
 */
async function rendererPids(browserCdp) {
    const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
    return processInfo.filter(p => p.type === 'renderer').map(p => p.id);
}

/**
 * PSS and RSS of this run's renderer, in MB, from /proc/<pid>/smaps_rollup.
 *
 * "This run's renderer" is the largest renderer that did NOT exist before
 * the run's context was created: a previous run's renderer can still be
 * shutting down when the next run reads, and with megabytes of script in it
 * it would win a plain "largest" contest. If Chromium handed the page a
 * renderer it had started in advance, nothing is new; the largest one is
 * taken then and the run says so (`reusedRenderer`).
 *
 * @param {import('playwright').CDPSession} browserCdp - Browser-level CDP session.
 * @param {Set<number>} before - Renderer pids that existed before the run.
 * @returns {Promise<{pssMB: number, rssMB: number, pid: number, renderers: number, reusedRenderer: boolean}|{error: string}>}
 */
async function readRendererMemory(browserCdp, before) {
    const pids = await rendererPids(browserCdp);
    const fresh = pids.filter(pid => !before.has(pid));
    const candidates = fresh.length ? fresh : pids;
    let best = null;
    for (const pid of candidates) {
        let text;
        try {
            text = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
        } catch (e) {
            continue;
        }
        const kb = (field) => {
            const m = text.match(new RegExp(`^${field}:\\s+(\\d+) kB`, 'm'));
            return m ? Number(m[1]) : NaN;
        };
        const pss = kb('Pss');
        if (!best || pss > best.pssKb) best = { pid, pssKb: pss, rssKb: kb('Rss') };
    }
    if (!best) return { error: `no readable renderer among ${pids.length}` };
    return {
        pssMB: best.pssKb / 1024,
        rssMB: best.rssKb / 1024,
        pid: best.pid,
        renderers: pids.length,
        reusedRenderer: fresh.length === 0,
    };
}

/**
 * One measured page load of one arm.
 *
 * The validity check depends on the page: on the bare gate page an arm that
 * runs the script must log the gate line; on a `--page` run it must have put
 * the h1 toolbar into the document. Arms that never run the script (`none`,
 * `prescan`) only have to stay free of page errors.
 *
 * @param {import('playwright').Browser} browser - Shared browser.
 * @param {{source: string, seedChangelog: boolean, runs: boolean}} arm - The arm.
 * @param {number} rate - CPU throttling rate (1 = none).
 * @param {string} changelogText - Changelog JSON text, for the seeded arm.
 * @param {{page: string|null, url: string|null, memory: boolean}} opts - Parsed options.
 * @param {import('playwright').CDPSession|null} browserCdp - Browser-level CDP session, for --memory.
 * @returns {Promise<Object>} timings, or {error}
 */
async function measureOnce(browser, arm, rate, changelogText, opts, browserCdp) {
    const rendererPidsBefore = browserCdp ? new Set(await rendererPids(browserCdp)) : null;
    const context = await browser.newContext();
    const seed = { ...SETTINGS_MIGRATION_PRE_APPLIED };
    if (arm.seedChangelog) seed[CHANGELOG_CACHE_KEY] = { ts: Date.now(), data: changelogText };
    await context.addInitScript({ content: gmStubScript(seed) });
    const pageUrl = opts.page ? opts.url : PAGE_URL;
    const pageHtml = opts.page ? fs.readFileSync(opts.page, 'utf8') : PAGE_HTML;
    await context.route('**/*', (route) => {
        const url = route.request().url();
        if (url === pageUrl) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml });
        return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    const errors = [];
    let gateSeen = false;
    page.on('pageerror', e => errors.push(String(e && e.message || e)));
    page.on('console', (msg) => { if (msg.text().includes(GATE_TEXT)) gateSeen = true; });
    try {
        await page.goto(pageUrl);
        await page.addScriptTag({ path: IRO_PATH });
        await page.addScriptTag({ path: PAKO_PATH });
        await page.addScriptTag({ path: MB_LIBRARY_PATH });
        // Handed over as an evaluate() argument, not fetch()ed from a routed
        // URL as on 2026-10-10: the fetch left a second decoded copy of the
        // text in Blink's buffer partition after the run (memory-infra,
        // 2026-10-22), which Tampermonkey's injection has no counterpart for.
        await page.evaluate((source) => { window.__armSrc = source; }, arm.source);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await cdp.send('HeapProfiler.collectGarbage');
        const before = await cdp.send('Performance.getMetrics');
        const t = await page.evaluate(async ({ frame, toolbarId }) => {
            const t0 = performance.now();
            const s = document.createElement('script');
            s.id = '__saed-measure-arm';
            s.textContent = window.__armSrc;
            document.head.appendChild(s);
            const t1 = performance.now();
            await new Promise(r => setTimeout(r, 0));
            await new Promise(r => setTimeout(r, 0));
            if (frame) await new Promise(r => requestAnimationFrame(() => r()));
            const t2 = performance.now();
            const bar = document.getElementById(toolbarId);
            return {
                syncMs: t1 - t0,
                settledMs: t2 - t0,
                gmSets: window.__gmSetCount,
                toolbarSeen: Boolean(bar && bar.isConnected),
            };
        }, { frame: Boolean(opts.page), toolbarId: TOOLBAR_ID });
        const after = await cdp.send('Performance.getMetrics');
        await cdp.send('HeapProfiler.collectGarbage');
        const afterGc = await cdp.send('Performance.getMetrics');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        let memory = null;
        if (opts.memory) {
            // Tampermonkey hands the script to V8 without a <script> element
            // or a page-side copy of the text, so drop both before reading.
            await page.evaluate(() => {
                const s = document.getElementById('__saed-measure-arm');
                if (s) s.remove();
                delete window.__armSrc;
            });
            await cdp.send('HeapProfiler.collectGarbage');
            await cdp.send('HeapProfiler.collectGarbage');
            await page.waitForTimeout(250);
            const cleaned = await cdp.send('Performance.getMetrics');
            const proc = await readRendererMemory(browserCdp, rendererPidsBefore);
            const alloc = proc.error ? { error: proc.error } : rendererAllocators(await memoryDumpEvents(browserCdp), proc.pid);
            memory = {
                ...proc,
                ...alloc,
                error: proc.error || alloc.error,
                jsHeapMB: metric(cleaned, 'JSHeapUsedSize') / 1e6,
            };
        }
        return {
            ...t,
            scriptDurationMs: (metric(after, 'ScriptDuration') - metric(before, 'ScriptDuration')) * 1000,
            heapDeltaMB: (metric(afterGc, 'JSHeapUsedSize') - metric(before, 'JSHeapUsedSize')) / 1e6,
            memory,
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
 * Whether one run of an arm counts. See measureOnce() for what each kind of
 * arm has to show.
 *
 * @param {Object} one - measureOnce() result.
 * @param {{runs: boolean}} arm - The arm.
 * @param {{page: string|null, memory: boolean}} opts - Parsed options.
 * @returns {boolean}
 */
function runIsValid(one, arm, opts) {
    if (one.error || one.errors.length) return false;
    if (opts.memory && (!one.memory || one.memory.error)) return false;
    if (!arm.runs) return true;
    return opts.page ? one.toolbarSeen : one.gateSeen;
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

(async () => {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.memory && process.platform !== 'linux') throw new Error('--memory reads /proc and needs Linux');
    const startedAt = berlinIso();
    const src = fs.readFileSync(USERSCRIPT_PATH, 'utf8');
    const changelogText = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const allArms = buildArms(src, opts);
    const armNames = opts.arms || (opts.page ? defaultPageArms(allArms) : Object.keys(allArms));
    for (const name of armNames) if (!allArms[name]) throw new Error(`unknown arm ${name}`);
    const browser = await chromium.launch();
    const browserCdp = opts.memory ? await browser.newBrowserCDPSession() : null;
    const result = {
        what: opts.page
            ? 'userscript load cost on a supported initial page (org/userscript-size.org)'
            : 'userscript load cost to the pageType gate (org/build-framework.org Q0, org/userscript-size.org)',
        scriptVersion: readScriptVersion(),
        branch: readCurrentBranch(),
        browser: `Chromium ${browser.version()}`,
        tampermonkey: 'none (in-memory GM stub)',
        machine: machineInfo(),
        page: opts.page ? { file: opts.page, url: opts.url } : { url: PAGE_URL, note: 'bare page, no pageType' },
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
                const one = await measureOnce(browser, allArms[name], rate, changelogText, opts, browserCdp);
                const valid = runIsValid(one, allArms[name], opts);
                if (!valid) process.stderr.write(`[${name} x${rate} run ${r}] INVALID: ${JSON.stringify(one).slice(0, 2000)}\n`);
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
                memory: opts.memory ? Object.fromEntries(MEMORY_FIELDS.map(f => [
                    f, stats(kept.map(s => (s.memory ? s.memory[f] : NaN))),
                ])) : null,
                invalid: samples[name].filter(s => s.invalid).length,
                samples: samples[name],
            };
        }
        result.changelogParse[rate] = await measureChangelogParse(browser, changelogText, rate, 11);
    }
    await browser.close();
    result.finishedAt = berlinIso();
    const json = JSON.stringify(result, null, 2);
    if (opts.out) fs.writeFileSync(opts.out, json + '\n');
    else process.stdout.write(json + '\n');
    for (const rate of opts.throttle) {
        process.stderr.write(`\nCPU x${rate}  (median ms: sync / settled / ScriptDuration; heap MB`
            + `${opts.memory ? '; MB: footprint / parkable strings / v8 / PSS' : ''})\n`);
        for (const name of armNames) {
            const b = result.arms[name].byThrottle[rate];
            const m = b.memory;
            process.stderr.write(`  ${name.padEnd(18)} ${(result.arms[name].size.bytes / 1e6).toFixed(2)} MB  `
                + `${b.syncMs.median.toFixed(1)} / ${b.settledMs.median.toFixed(1)} / ${b.scriptDurationMs.median.toFixed(1)}  `
                + `heap ${b.heapDeltaMB.median.toFixed(1)}`
                + (m ? `  mem ${m.privateFootprintMB.median.toFixed(1)} / ${m.parkableStringsMB.median.toFixed(1)}`
                    + ` / ${m.v8MB.median.toFixed(1)} / ${m.pssMB.median.toFixed(1)}` : '')
                + `  (n=${b.syncMs.n}, invalid=${b.invalid})\n`);
        }
        process.stderr.write(`  changelog JSON.parse median ${result.changelogParse[rate].medianMs.toFixed(1)} ms\n`);
    }
})();
