'use strict';

/**
 * Counts the DOM work each interaction performs on the `artist-events`
 * fixture, and writes it to
 * `tests/snapshots/artist-events/pass-cost-<label>-<version>-<capturedAt>[-<hostname>].json`.
 *
 * Usage:
 *   node tests/support/capture-pass-cost.js
 *   node tests/support/capture-pass-cost.js --label=main
 *   node tests/support/capture-pass-cost.js --stack-rate=1     (slow, exact attribution)
 *   node tests/support/capture-pass-cost.js --top=25
 *
 * This is the counting sibling of `capture-interaction-perf.js`, and the two
 * must stay separate: the instrument this one installs wraps hot DOM APIs, so
 * running it would make that one's timings meaningless. See
 * `domCounters.js`'s own header.
 *
 * ONE sample, deliberately. Two runs against the same fixture and the same
 * userscript agreed exactly on 28 of 32 phase counters (measured, 9.99.1049);
 * the four that moved are `querySelector`/`createTreeWalker` on the two filter
 * phases, by a few percent, from the deferred header-count scan straddling a
 * phase boundary. See `domCounters.js` for the workings. That is the whole
 * reason PERFORMANCE.org's Tier 0 asks for counts before timings — `main`
 * alone measured 1735 / 3503 / 3033 ms on the global filter across three
 * sessions, a spread far wider than any of these.
 *
 * Phases measured, chosen to match the walks PERFORMANCE.org's "Findings: the
 * per-keystroke filter cost" section names:
 *
 *   initialRender  everything from page load to a settled first render.
 *                  The baseline every other phase is read against.
 *   filterApply    typing one column-filter value and waiting for the status
 *                  line to settle — ONE filter pass, since the debounce
 *                  swallows the keystrokes (see MEASUREMENTS.org).
 *   filterClear    clearing it again. The widening direction, which is the
 *                  expensive one: the header-count scan's row set grows back
 *                  to the full 4174 and Step 3's LRU is the only thing
 *                  between that and a full O(rows x columns) rescan.
 *   postClearSettle  everything DEFERRED that the clear scheduled, measured
 *                  after its status line had already settled.
 *
 * That last phase is not a tidy name for one thing, and the boundary is the
 * point rather than a wart: `runFilter()` writes its status text and then
 * hands off to `renderFinalTable()`'s completion hook, so the post-render
 * passes land in whatever window is open when they actually run. Measured,
 * `applyStickyColumn`'s per-cell walk lands here on a CLEAR (4174 rows) and
 * inside `filterApply` on an APPLY (158 rows) purely because the second is
 * fast enough to finish first. Read the two phases together when comparing an
 * arm, never `filterClear` alone.
 *
 * Why a COLUMN filter rather than the global one: it exercises the same
 * `runFilter()` pass while keeping `highlightText()` on its single-cell path
 * (`targetColIndex >= 0`), so the numbers isolate the per-cell walks from the
 * global highlighter's own every-`<td>` walk. Step 29 is where that second
 * cost gets its own measurement.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadFromDiskFixture } = require('./diskFixture');
const { seedGmValues } = require('./gmStubs');
const { waitForRenderComplete } = require('./browser');
const {
    waitForFilterSettled, waitForColHeaderCountsStable,
    columnIndex, columnFilterInput, columnFilterClear,
} = require('./filterSortAssertions');
const { installDomCounters, measureDomCost } = require('./domCounters');
const {
    readScriptVersion, machineInfo, readCurrentBranch, archiveFileStem,
} = require('./runMetadata');
const {
    URL, FIXTURE_PATH, SEED_GM_VALUES, FILTER_COLUMN, FILTER_VALUE, TOTAL_ROWS,
} = require('./artistEventsFixture');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');
const PAGE_TYPE = 'artist-events';

/**
 * @param {string[]} argv
 * @returns {{label: string|null, stackRate: number, top: number}}
 */
function parseArgs(argv) {
    const val = (name, dflt) => {
        const hit = argv.find((a) => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : dflt;
    };
    return {
        label: val('label', null),
        stackRate: Number(val('stack-rate', '200')),
        top: Number(val('top', '12')),
    };
}

/**
 * One-line summary of a phase, for the console.
 *
 * @param {string} name
 * @param {Object} c counter snapshot
 * @returns {string}
 */
function summarize(name, c) {
    return `  ${name.padEnd(14)} `
        + `gCS=${String(c.getComputedStyle).padStart(7)}  `
        + `qsa=${String(c.querySelectorAll).padStart(7)}  `
        + `qs=${String(c.querySelector).padStart(7)}  `
        + `clone(tr)=${String(c.cloneNodeDeepTr).padStart(6)}  `
        + `walker=${String(c.createTreeWalker).padStart(7)}  `
        + `layout=${String(c.layoutGetter).padStart(6)}`;
}

async function run() {
    const { label, stackRate, top } = parseArgs(process.argv.slice(2));
    const startedAt = new Date();
    const capturedAt = startedAt.toISOString().slice(0, 10);
    const scriptVersion = readScriptVersion();

    const browser = await chromium.launch();
    const phases = {};
    try {
        const page = await browser.newPage();

        // Before loadFromDiskFixture: init scripts run in registration order,
        // and the userscript is injected after navigation, so registering
        // here is what guarantees the wrappers see its very first call.
        await installDomCounters(page, { stackSampleRate: stackRate });
        await seedGmValues(page, SEED_GM_VALUES);

        phases.initialRender = await measureDomCost(page, async () => {
            await loadFromDiskFixture(page, { url: URL, fixturePath: FIXTURE_PATH, testMode: true });
            // waitForAutoResize: false — the auto-resize-on-load pass lives in
            // startFetchingProcess(), which the disk-load path never enters.
            await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
        }, { top });

        // Let the deferred header-count scan finish before the first filter,
        // so its cost lands in initialRender rather than leaking into
        // filterApply and making that phase look worse than a pass really is.
        await waitForColHeaderCountsStable(page);

        const colIdx = await columnIndex(page, FILTER_COLUMN);
        if (colIdx < 0) throw new Error(`column "${FILTER_COLUMN}" not found in the rendered header`);
        const input = columnFilterInput(page, colIdx);

        // .click() then .pressSequentially(): the column-filter inputs are
        // readonly until a genuine trusted interaction (anti-autofill
        // hardening) and .fill() is rejected by _isGenuineFilterInputEvent().
        await input.click();

        phases.filterApply = await measureDomCost(page, async () => {
            await waitForFilterSettled(page, () => input.pressSequentially(FILTER_VALUE));
        }, { top });

        // The ✕ button, for the same reason — and it calls runFilter()
        // directly and UNDEBOUNCED, so this phase is one pass with no
        // debounce window folded into it.
        phases.filterClear = await measureDomCost(page, async () => {
            await waitForFilterSettled(page, () => columnFilterClear(page, colIdx).click());
        }, { top });

        // Everything the clear DEFERRED: the post-render row passes plus the
        // column-header scan, over a row set that has just grown back to the
        // full table. That is the expensive direction, and the one Step 3's
        // LRU exists for.
        phases.postClearSettle = await measureDomCost(page, async () => {
            await waitForColHeaderCountsStable(page);
        }, { top });

        const rows = await page.evaluate(
            () => document.querySelectorAll('table.tbl tbody tr').length
        );
        if (rows !== TOTAL_ROWS) {
            console.warn(`  WARNING: ${rows} rows rendered, fixture declares ${TOTAL_ROWS} —`
                + ' the filter may not have cleared, which would understate every count.');
        }

        await page.close();
    } finally {
        await browser.close();
    }

    const stem = archiveFileStem({
        prefix: 'pass-cost',
        label: label || readCurrentBranch(),
        version: scriptVersion,
        capturedAt,
    });
    const outPath = path.join(SNAPSHOTS_DIR, PAGE_TYPE, `${stem}.json`);
    fs.writeFileSync(outPath, JSON.stringify({
        pageType: PAGE_TYPE,
        url: URL,
        label: label || readCurrentBranch(),
        branch: readCurrentBranch(),
        scriptVersion,
        capturedAt,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        machine: machineInfo(),
        instrument: { stackSampleRate: stackRate, topN: top },
        note: 'DOM operation COUNTS, not timings. The instrument distorts timings;'
            + ' see tests/support/domCounters.js.',
        phases,
    }, null, 2) + '\n');

    console.log(`${PAGE_TYPE} [pass-cost] -> ${path.relative(process.cwd(), outPath)}`);
    for (const [name, c] of Object.entries(phases)) console.log(summarize(name, c));
}

run().catch((err) => {
    console.error('capture-pass-cost failed:', err);
    process.exit(1);
});
