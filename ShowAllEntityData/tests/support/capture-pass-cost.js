'use strict';

/**
 * Counts the DOM work each interaction performs on an instrumented perf
 * fixture, and writes it to
 * `tests/snapshots/<pageType>/pass-cost-<label>-<version>-<capturedAt>[-<hostname>].json`.
 *
 * Usage:
 *   node tests/support/capture-pass-cost.js
 *   node tests/support/capture-pass-cost.js --label=main
 *   node tests/support/capture-pass-cost.js --pageType=artist-releasegroups
 *   node tests/support/capture-pass-cost.js --pageType=artist-releases-dylan --arm=expanded
 *   node tests/support/capture-pass-cost.js --stack-rate=1     (slow, exact attribution)
 *   node tests/support/capture-pass-cost.js --top=25
 *
 * `--pageType=` defaults to `artist-events` — every committed arm before
 * 2026-09-10 is that page, and it stays the default so those remain the
 * comparison target. It was also, until that date, the ONLY page this script
 * could measure: the pageType was a hardcoded `const` plus a direct
 * `artistEventsFixture` require, which made the one instrument that can prove
 * a listener count went to zero (`addEventListener`, with a `byEventType`
 * breakdown) unusable on the two features whose listeners PERFORMANCE.org
 * Steps 23 and 24 are about — `artist-events` has neither a Picard column nor
 * an ERG button. Registered pageTypes now live in `perfDescriptors.js`.
 *
 * `--arm=absent|collapsed|expanded` seeds the Picard settings, same three arms
 * and same filename suffix as `capture-interaction-perf.js`. A no-op on a
 * pageType whose rows carry no `/release/<mbid>` link, which the registry warns
 * about rather than silently reporting three identical arms.
 *
 * On a MULTI-table pageType the two filter phases act on ONE sub-table (the
 * descriptor's `SUB_TABLE_INDEX`) while `initialRender` and `postClearSettle`
 * are page-wide — see `perfDescriptors.js`'s multi-table contract before
 * comparing such an arm to a single-table one.
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
    columnIndex, columnFilterInput, columnFilterClear, ensureSubTableVisible,
} = require('./filterSortAssertions');
const { installDomCounters, measureDomCost } = require('./domCounters');
const {
    readScriptVersion, machineInfo, readCurrentBranch, archiveFileStem,
} = require('./runMetadata');
const {
    toArm, pageTypeList, applyPicardArm, PICARD_ARMS,
} = require('./perfDescriptors');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');
const DEFAULT_PAGE_TYPE = 'artist-events';

/**
 * @param {string[]} argv
 * @returns {{pageType: string, arm: string|null, label: string|null,
 *   stackRate: number, top: number}}
 */
function parseArgs(argv) {
    const val = (name, dflt) => {
        const hit = argv.find((a) => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : dflt;
    };
    return {
        pageType: val('pageType', DEFAULT_PAGE_TYPE),
        arm: val('arm', null),
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
    const { pageType, arm, label, stackRate, top } = parseArgs(process.argv.slice(2));
    let config;
    try {
        config = applyPicardArm(toArm(pageType), arm);
    } catch (err) {
        console.error(err.message);
        console.error(`Supported --pageType=: ${pageTypeList().join(', ')}`);
        console.error(`Supported --arm=: ${Object.keys(PICARD_ARMS).join(', ')}`);
        process.exit(1);
    }
    // On a multi-table page every per-table locator has to be scoped, or the
    // column filter lands in whichever sub-table comes first in document
    // order — 21 of artist-releasegroups' 2143 rows. See
    // perfDescriptors.js's multi-table contract.
    const tableScope = { tableIndex: config.subTableIndex };
    const stableTimeout = config.tableMode === 'multi' ? 300000 : 90000;
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
        await seedGmValues(page, config.seedGmValues);

        phases.initialRender = await measureDomCost(page, async () => {
            await loadFromDiskFixture(page, {
                url: config.url, fixturePath: config.fixturePath, testMode: true,
            });
            // waitForAutoResize: false — the auto-resize-on-load pass lives in
            // startFetchingProcess(), which the disk-load path never enters.
            await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });
        }, { top });

        // Let the deferred header-count scan finish before the first filter,
        // so its cost lands in initialRender rather than leaking into
        // filterApply and making that phase look worse than a pass really is.
        await waitForColHeaderCountsStable(page, { timeout: stableTimeout });

        // Multi-table only: most sub-tables render display:none despite the
        // master toggle reading "expanded", so the column-filter input the two
        // filter phases below type into is otherwise a 0x0 element. Done AFTER
        // initialRender is measured, so the expansion is not counted as part
        // of the render, and BEFORE either filter phase. See that helper's
        // JSDoc for the measured numbers.
        if (config.tableMode === 'multi') {
            await ensureSubTableVisible(page, config.subTableIndex);
        }

        const colIdx = await columnIndex(page, config.filterColumn, tableScope);
        if (colIdx < 0) {
            throw new Error(`column "${config.filterColumn}" not found in `
                + `${config.pageType}'s sub-table ${config.subTableIndex}`);
        }
        const input = columnFilterInput(page, colIdx, tableScope);

        // .click() then .pressSequentially(): the column-filter inputs are
        // readonly until a genuine trusted interaction (anti-autofill
        // hardening) and .fill() is rejected by _isGenuineFilterInputEvent().
        await input.click();

        phases.filterApply = await measureDomCost(page, async () => {
            await waitForFilterSettled(page, () => input.pressSequentially(config.filterValue));
        }, { top });

        // The ✕ button, for the same reason — and it calls runFilter()
        // directly and UNDEBOUNCED, so this phase is one pass with no
        // debounce window folded into it.
        phases.filterClear = await measureDomCost(page, async () => {
            await waitForFilterSettled(page, () => columnFilterClear(page, colIdx, tableScope).click());
        }, { top });

        // Everything the clear DEFERRED: the post-render row passes plus the
        // column-header scan, over a row set that has just grown back to the
        // full table. That is the expensive direction, and the one Step 3's
        // LRU exists for.
        phases.postClearSettle = await measureDomCost(page, async () => {
            await waitForColHeaderCountsStable(page, { timeout: stableTimeout });
        }, { top });

        // Page-wide, deliberately, on both table modes: a column filter in one
        // sub-table narrows only that sub-table, so a page-wide tally still
        // has to come back to the descriptor's TOTAL_ROWS once it is cleared.
        // A short count here means the clear did not take, which would
        // understate every counter above.
        const rows = await page.evaluate(
            () => document.querySelectorAll('table.tbl tbody tr').length
        );
        if (rows !== config.totalRows) {
            console.warn(`  WARNING: ${rows} rows rendered, ${config.pageType}'s descriptor `
                + `declares ${config.totalRows} — the filter may not have cleared, which would `
                + 'understate every count.');
        }

        await page.close();
    } finally {
        await browser.close();
    }

    // `--arm=` joins the label the same way capture-interaction-perf.js does
    // it, so three arms of one branch land side by side instead of
    // overwriting each other.
    const armLabel = label || (arm ? `${readCurrentBranch()}-picard-${arm}` : readCurrentBranch());
    const stem = archiveFileStem({
        prefix: 'pass-cost',
        label: armLabel,
        version: scriptVersion,
        capturedAt,
    });
    const outPath = path.join(SNAPSHOTS_DIR, config.pageType, `${stem}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({
        pageType: config.pageType,
        url: config.url,
        // See capture-interaction-perf.js's identical fields: on a 'multi' arm
        // the filter phases below act on sub-table `subTableIndex`, so the
        // counts are not comparable to a single-table arm's.
        tableMode: config.tableMode,
        subTableIndex: config.tableMode === 'multi' ? config.subTableIndex : null,
        totalRows: config.totalRows,
        picardArm: arm || null,
        seedGmValues: config.seedGmValues,
        label: armLabel,
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

    console.log(`${config.pageType} [pass-cost, ${armLabel}] -> ${path.relative(process.cwd(), outPath)}`);
    for (const [name, c] of Object.entries(phases)) console.log(summarize(name, c));
}

run().catch((err) => {
    console.error('capture-pass-cost failed:', err);
    process.exit(1);
});
