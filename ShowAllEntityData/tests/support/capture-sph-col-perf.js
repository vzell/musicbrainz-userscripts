'use strict';

/**
 * Sticky-page-headers A/B perf capture: standalone Node script, not a
 * Playwright test.
 *
 *   node tests/support/capture-sph-col-perf.js --arm=main=main --arm=branch=fddfe5b
 *   node tests/support/capture-sph-col-perf.js --arm=main=main --arm=head=WORKTREE --rounds=7
 *   node tests/support/capture-sph-col-perf.js --page=credits --arm=main=main --arm=head=WORKTREE
 *
 * `--page=credits` measures a narrow table the feature pins whole, fetched
 * live (see `PAGES`); the default is the artist-events disk fixture below.
 *
 * It rebuilds, and now commits, the scratch harness behind the
 * `tests/MEASUREMENTS.org` entry "2026-10-05 — sticky column docks at its
 * table's left (branch feature/sticky-col-align), artist-events (vzell-lap)".
 * That one was never committed, so it could not be re-run on another host.
 * The spec is the one recorded there:
 *
 *   - one Chromium, a fresh context per sample;
 *   - the committed `artist-events.json.gz` disk fixture (4174 rows,
 *     single-table), loaded through `loadFromDiskFixture()` with the live
 *     musicbrainz.org page shell, like `capture-interaction-perf.js`. The
 *     shell needs MB's own stylesheet, or the page geometry the feature
 *     reacts to is not the real one;
 *   - viewport 1600x900;
 *   - arms round-robin, the order reversed every round;
 *   - each arm is a FROZEN copy of `ShowAllEntityData.user.js`, taken from a
 *     git ref (or the working tree, `WORKTREE`) into a temp directory, and
 *     injected by wrapping `page.addScriptTag`. The real file is never
 *     touched, so no arm depends on what is checked out.
 *
 * Per sample, on one page, in this order:
 *
 *   longAfterRender - sum of `longtask` durations starting in the 2 s after
 *                     `waitForRenderComplete()`;
 *   sort            - wall clock of a settled sort (Date ▲), after that settle;
 *   quietWait       - wall clock from the sort's settled status until no long
 *                     task has run for 1 s: the sort's tail work, which the
 *                     status line does not wait for;
 *   scroll          - sum of `longtask` durations starting in the 1 s after
 *                     scrolling to the far right. DEVIATION from the
 *                     vzell-lap run: the scroll waits first until no long
 *                     task has run for 1 s (`quietWait` records how long that
 *                     took), see the comment in `sampleOnce()`. Its numbers
 *                     are therefore not the same metric as that entry's.
 *
 * Every sample also records whether the feature was engaged
 * (`html.mb-sph-on`) and whether a table carries `data-mb-sph-col-left`.
 * Arms that predate the column alignment never stamp, so the flag is only
 * reported, not enforced; read the per-arm counts in the summary.
 *
 * Output: `tests/snapshots/artist-events/sph-col-perf-<label>-<version>-<date>[-<host>].json`,
 * with a `machine` block and UTC start and finish (`runMetadata.js`). Quote
 * only ratios between arms of ONE run, never absolutes across hosts or
 * sessions (CLAUDE.md, "Performance is a priority").
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('./diskFixture');
const { seedGmValues } = require('./gmStubs');
const { waitForRenderComplete } = require('./browser');
const { waitForSortSettled } = require('./filterSortAssertions');
const { USERSCRIPT_PATH } = require('./loadPage');
const { loadUserscriptPage } = require('./loadPage');
const { URL, FIXTURE_PATH, SEED_GM_VALUES, SORT_COLUMN } = require('./artistEventsFixture');
const {
    REPO_ROOT, readScriptVersion, machineInfo, readCurrentBranch, archiveFileStem,
} = require('./runMetadata');

const VIEWPORT = { width: 1600, height: 900 };
const SETTLE_AFTER_RENDER_MS = 2000;
const SETTLE_AFTER_SCROLL_MS = 1000;
const QUIET_BEFORE_SCROLL_MS = 1000;
const DEFAULT_ROUNDS = 7;
/**
 * The measured pages (`--page=`). `artist-events` is the vzell-lap entry's
 * page: one table thousands of px wide, so its sticky column docks. `credits`
 * is an artist's "Artist credits" list (Bruce Springsteen, 521 rows, one
 * visible column, ~900 px): narrow enough that the feature pins the whole
 * table, the case org/sticky-bugs.org 3c added. It has no disk fixture, so it
 * is fetched live (outside every bracket) with auto-resize, as a user sees it.
 */
const PAGES = {
    'artist-events': {
        pageType: 'artist-events', tableMode: 'single', url: URL, fixture: FIXTURE_PATH,
        seed: SEED_GM_VALUES, sortColumn: SORT_COLUMN,
        outDir: path.join(__dirname, '..', 'snapshots', 'artist-events'),
    },
    credits: {
        pageType: 'artist-aliases', tableMode: 'single',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/aliases',
        button: 'Show all Artist Credits for Artist',
        seed: { sa_enable_caa_pics: false, sa_enable_relationships_column: false }, sortColumn: 'Name',
        outDir: path.join(__dirname, '..', 'snapshots', 'artist-aliases-credits'),
    },
};

/**
 * Parses `--arm=<label>=<ref>` (repeatable, first arm is the reference the
 * paired differences are taken against), `--rounds=N`, `--label=<name>` and
 * `--page=artist-events|credits` (see `PAGES`).
 *
 * @param {string[]} argv
 * @returns {{arms: Array<{label: string, ref: string}>, rounds: number, label: string|null, page: Object}}
 */
function parseArgs(argv) {
    const arms = [];
    let rounds = DEFAULT_ROUNDS;
    let label = null;
    let page = 'artist-events';
    argv.forEach((a) => {
        let m;
        if ((m = a.match(/^--arm=([^=]+)=(.+)$/))) arms.push({ label: m[1], ref: m[2] });
        else if ((m = a.match(/^--rounds=(\d+)$/))) rounds = Number(m[1]);
        else if ((m = a.match(/^--label=(.+)$/))) label = m[1];
        else if ((m = a.match(/^--page=(.+)$/)) && PAGES[m[1]]) page = m[1];
        else throw new Error(`unknown argument: ${a}`);
    });
    if (arms.length < 2) throw new Error('give at least two --arm=<label>=<git ref|WORKTREE|file:<path>>');
    return { arms, rounds, label, page: PAGES[page] };
}

/**
 * Freezes one arm's userscript into `dir`: `git show <ref>:<path>`, or a copy
 * of the working tree file for `WORKTREE`.
 *
 * @param {{label: string, ref: string}} arm
 * @param {string} dir - Temp directory.
 * @returns {{label: string, ref: string, file: string, commit: string|null, version: string}}
 */
function freezeArm(arm, dir) {
    const file = path.join(dir, `${arm.label}.user.js`);
    let commit = null;
    if (arm.ref === 'WORKTREE') {
        fs.copyFileSync(USERSCRIPT_PATH, file);
    } else if (arm.ref.startsWith('file:')) {
        // A hand-made variant (e.g. one guard switched off) to attribute a cost.
        fs.copyFileSync(arm.ref.slice(5), file);
    } else {
        // `<ref>:./<name>` resolves against cwd; REPO_ROOT (runMetadata.js)
        // is this project's directory, not the git top level.
        const name = path.basename(USERSCRIPT_PATH);
        fs.writeFileSync(file, execFileSync('git', ['show', `${arm.ref}:./${name}`],
            { cwd: path.dirname(USERSCRIPT_PATH), maxBuffer: 1 << 30 }));
        commit = execFileSync('git', ['rev-parse', arm.ref], { cwd: REPO_ROOT }).toString().trim();
    }
    const m = fs.readFileSync(file, 'utf8').match(/^\/\/ @version\s+(\S+)/m);
    return { ...arm, file, commit, version: m ? m[1] : 'unknown' };
}

/**
 * Median of a numeric array (mean of the middle two for an even count).
 *
 * @param {number[]} xs
 * @returns {number|null}
 */
function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Retries a flaky step (the live page shell can time out) up to `attempts`
 * times. Only page loading is wrapped; no measurement bracket is retried
 * half way.
 *
 * @template T
 * @param {string} what
 * @param {() => Promise<T>} fn
 * @param {number} [attempts]
 * @returns {Promise<T>}
 */
async function withRetry(what, fn, attempts = 3) {
    for (let i = 1; ; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i >= attempts) throw err;
            console.warn(`  ${what}: attempt ${i} failed (${err.message.split('\n')[0]}), retrying`);
        }
    }
}

/**
 * One sample of one arm: fresh context, render from disk, then the three
 * metrics in order.
 *
 * @param {import('playwright').Browser} browser
 * @param {{label: string, file: string}} arm
 * @param {Object} cfg - One `PAGES` entry.
 * @returns {Promise<{longAfterRender: number, sort: number, scroll: number, engaged: boolean, stamped: boolean}>}
 */
async function sampleOnce(browser, arm, cfg) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    try {
        // Every long task from navigation on; the brackets below pick theirs
        // out by start time.
        await context.addInitScript({
            content: `window.__lt = [];
                try {
                    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); })
                        .observe({ type: 'longtask', buffered: true });
                } catch (e) { window.__ltError = String(e); }`,
        });
        const addScriptTag = page.addScriptTag.bind(page);
        page.addScriptTag = (opts) => addScriptTag(opts && opts.path === USERSCRIPT_PATH ? { ...opts, path: arm.file } : opts);

        await seedGmValues(page, cfg.seed);
        if (cfg.fixture) {
            await loadFromDiskFixture(page, { url: cfg.url, fixturePath: cfg.fixture, testMode: true });
            await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
        } else {
            await loadUserscriptPage(page, { url: cfg.url, testMode: true, settingsOverride: cfg.seed });
            await page.$eval(`button[data-label="${cfg.button}"]`, (b) => b.click());
            await waitForRenderComplete(page, { waitForAutoResize: true, timeout: 120000 });
        }

        const t0 = await page.evaluate(() => performance.now());
        await page.waitForTimeout(SETTLE_AFTER_RENDER_MS);
        const longAfterRender = await page.evaluate((from) => window.__lt
            .filter(([s]) => s >= from).reduce((sum, [, d]) => sum + d, 0), t0);

        const th = page.locator('table.tbl thead th', { hasText: cfg.sortColumn }).first();
        const btn = th.locator('.sort-icon-btn', { hasText: '▲' }).first();
        const start = Date.now();
        await waitForSortSettled(page, () => btn.click());
        const sort = Date.now() - start;

        // The sort's status settles before its follow-up work (header counts,
        // the post-sort render tail) is done; without this wait that work
        // lands in the scroll bracket. Measured on petri, 2026-10-05: ~3 s of
        // long tasks in the "scroll" second on BOTH arms without it.
        const quietStart = Date.now();
        await page.waitForFunction((quietMs) => {
            const now = performance.now();
            const last = window.__lt.reduce((m, [s, d]) => Math.max(m, s + d), 0);
            return now - last >= quietMs;
        }, QUIET_BEFORE_SCROLL_MS, { timeout: 30000, polling: 100 });
        const quietWait = Date.now() - quietStart;

        const t1 = await page.evaluate(() => {
            const t = performance.now();
            window.scrollTo(document.documentElement.scrollWidth, window.scrollY);
            return t;
        });
        await page.waitForTimeout(SETTLE_AFTER_SCROLL_MS);
        const state = await page.evaluate((from) => ({
            scroll: window.__lt.filter(([s]) => s >= from).reduce((sum, [, d]) => sum + d, 0),
            engaged: document.documentElement.classList.contains('mb-sph-on'),
            stamped: !!document.querySelector('table.tbl[data-mb-sph-col-left]'),
            pinnedTable: !!document.querySelector('table.tbl.mb-sph-table'),
            scrollX: window.scrollX,
            ltError: window.__ltError || null,
        }), t1);
        if (state.ltError) throw new Error(`longtask observer unavailable: ${state.ltError}`);
        if (!(state.scrollX > 0)) throw new Error('the page did not scroll horizontally; nothing to measure');
        return { longAfterRender, sort, quietWait, scroll: state.scroll, engaged: state.engaged, stamped: state.stamped,
            pinnedTable: state.pinnedTable };
    } finally {
        await context.close();
    }
}

/**
 * Runs every round, then writes and prints the summary.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const { arms: armSpecs, rounds, label, page: cfg } = parseArgs(process.argv.slice(2));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sph-col-perf-'));
    const arms = armSpecs.map((a) => freezeArm(a, tmp));
    const samples = Object.fromEntries(arms.map((a) => [a.label, []]));
    const startedAt = new Date().toISOString();
    const browser = await chromium.launch();
    try {
        for (let r = 0; r < rounds; r++) {
            const order = r % 2 ? [...arms].reverse() : arms;
            for (const arm of order) {
                const s = await withRetry(`round ${r + 1} ${arm.label}`, () => sampleOnce(browser, arm, cfg));
                samples[arm.label].push({ round: r + 1, ...s });
                console.log(`round ${r + 1}/${rounds} ${arm.label.padEnd(10)} render+2s ${Math.round(s.longAfterRender)} ms`
                    + `  sort ${s.sort} ms  scroll ${Math.round(s.scroll)} ms  engaged=${s.engaged} stamped=${s.stamped}`);
            }
        }
    } finally {
        await browser.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    const finishedAt = new Date().toISOString();

    const metrics = ['longAfterRender', 'sort', 'quietWait', 'scroll'];
    const ref = arms[0].label;
    const summary = {};
    arms.forEach((a) => {
        const ss = samples[a.label];
        const row = {
            engaged: ss.filter((s) => s.engaged).length,
            stamped: ss.filter((s) => s.stamped).length,
            pinnedTable: ss.filter((s) => s.pinnedTable).length,
            n: ss.length,
        };
        metrics.forEach((m) => {
            row[m] = { median: median(ss.map((s) => s[m])) };
            if (a.label !== ref) {
                const diffs = ss.map((s, i) => s[m] - samples[ref][i][m]);
                row[m].pairedMedianDiff = median(diffs);
                row[m].higherInRounds = diffs.filter((d) => d > 0).length;
            }
        });
        summary[a.label] = row;
    });

    const capturedAt = startedAt.slice(0, 10);
    const stem = archiveFileStem({
        prefix: 'sph-col-perf',
        label: label || readCurrentBranch(),
        version: readScriptVersion(),
        capturedAt,
    });
    fs.mkdirSync(cfg.outDir, { recursive: true });
    const out = path.join(cfg.outDir, `${stem}.json`);
    fs.writeFileSync(out, `${JSON.stringify({
        harness: 'tests/support/capture-sph-col-perf.js',
        page: { pageType: cfg.pageType, tableMode: cfg.tableMode, url: cfg.url,
            fixture: cfg.fixture ? path.relative(REPO_ROOT, cfg.fixture) : null },
        viewport: VIEWPORT,
        rounds,
        arms: arms.map(({ label: l, ref: r, commit, version }) => ({ label: l, ref: r, commit, version })),
        machine: machineInfo(),
        startedAt,
        finishedAt,
        summary,
        samples,
    }, null, 2)}\n`);

    console.log(`\n${os.hostname()}  UTC ${startedAt} – ${finishedAt}  (${rounds} rounds)`);
    arms.forEach((a) => {
        const row = summary[a.label];
        const cells = metrics.map((m) => {
            const v = row[m];
            const extra = v.pairedMedianDiff === undefined ? ''
                : ` (Δ ${Math.round(v.pairedMedianDiff)}, higher in ${v.higherInRounds}/${row.n})`;
            return `${m} ${Math.round(v.median)}${extra}`;
        });
        console.log(`${a.label.padEnd(10)} ${cells.join('  |  ')}  engaged ${row.engaged}/${row.n} stamped ${row.stamped}/${row.n} pinned table ${row.pinnedTable}/${row.n}`);
    });
    console.log(`\nwrote ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
