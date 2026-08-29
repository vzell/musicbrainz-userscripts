'use strict';

/**
 * One-time (re-run-when-needed) capture of a Save-to-disk fixture for a
 * given pageType, consumed by `diskFixture.js`'s `loadFromDiskFixture()`
 * to test against a fixed, committed dataset instead of live
 * musicbrainz.org — immune to other editors' data changes between runs.
 * The captured `.json.gz` is not test-only either — it's the exact same
 * format the real "Save to Disk"/"Load from Disk" buttons use, so any
 * fixture here can also be dropped into a real browser's Load-from-Disk
 * dialog by hand.
 *
 * Standalone Node script (not a Playwright test) — run directly:
 *   node tests/support/capture-fixture.js
 *
 * Captures every entry in the FIXTURES list below by loading the page
 * live and clicking its "Show all" button, then one of two paths depending
 * on row count:
 *
 * - **Normal-size fetch** (renders below `sa_render_threshold`, default
 *   5000 rows): waits for render completion, then drives the toolbar
 *   Save-to-disk dialog (`#mb-save-to-disk-btn`).
 * - **Large fetch** (exceeds the threshold): the script itself pops
 *   `showRenderDecisionDialog()` ("Large Dataset Fetched" — Save to Disk /
 *   Render Now / Cancel) instead of ever touching the DOM. This path
 *   clicks "💾 Save to Disk" (`#mb-dialog-save`) and deliberately never
 *   renders — this is the actual point of the whole `Load from Disk` +
 *   pre-filter workflow: a table too large to render safely in a browser
 *   can still be fetched and saved, then later loaded with a pre-filter
 *   applied (via the real dialog's Phase 2) to cut it down to a
 *   renderable size. Both paths converge on the same `showSaveDialog()`
 *   (`#sa-save-dialog-overlay` → `#sa-sd-save-confirm`) — that's the only
 *   place a browser download actually fires, captured via Playwright's
 *   `page.on('download')`.
 *
 * Set `local: true` on a FIXTURES entry to write it to `LOCAL_OUTPUT_DIR`
 * (git-ignored) instead of the normal, committed `OUTPUT_DIR` — for large
 * dogfooding captures that exist only to be loaded by hand later and have
 * no automated-test consumer, so there's no reason to bloat git history
 * with a multi-MB blob that never diffs cleanly.
 *
 * Add more pageTypes by extending the FIXTURES list — each entry is a
 * data change, not a code change.
 *
 * Use `--only=<pageType>` to capture a single entry — useful for a
 * many-hundred-page fixture you want to kick off in the background on its
 * own rather than blocking behind the rest of the list:
 *   node tests/support/capture-fixture.js --only=artist-recordings
 *
 * A paginated fetch whose page count exceeds `sa_max_page` (default 50)
 * pops ANOTHER dialog before the fetch loop even starts — a plain custom
 * confirm ("⚠️ High Page Count", Lib.showCustomConfirm), same shape and
 * same "Playwright's native dialog handling can't see it" problem as the
 * unboundedPagination confirm `tests/support/customDialog.js` already
 * handles (see `add-snapshot-pagetype`/`add-live-behavior-test` skills).
 * This script calls `dismissCustomConfirmDialog()` right after every
 * "Show all" click for exactly that reason — always, since whether either
 * dialog appears depends on live MusicBrainz page/row counts this script
 * doesn't control.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { loadUserscriptPage } = require('./loadPage');
const { loadUserscriptPageWithRealNetwork } = require('./realNetworkGmXhr');
const { waitForRenderComplete } = require('./browser');
const { seedGmValues } = require('./gmStubs');
const { dismissCustomConfirmDialog } = require('./customDialog');

const OUTPUT_DIR = path.join(__dirname, '..', 'fixtures', 'saved-data');
// Git-ignored (see ../../.gitignore) — for `local: true` FIXTURES entries:
// large dogfooding captures with no automated-test consumer, so there's no
// reason to commit a multi-MB blob that never diffs cleanly on re-capture.
const LOCAL_OUTPUT_DIR = path.join(__dirname, '..', 'fixtures', 'local-large');

// showRenderDecisionDialog()'s "💾 Save to Disk" button — only appears when
// a fetch exceeds `sa_render_threshold` (default 5000 rows); see this
// file's own JSDoc for why that path skips rendering entirely.
const LARGE_DATASET_SAVE_BTN = '#mb-dialog-save';
// showSaveDialog()'s confirm button — the single point both the normal
// (`#mb-save-to-disk-btn`) and large-dataset (`LARGE_DATASET_SAVE_BTN`)
// paths converge on before a browser download actually fires.
const SAVE_CONFIRM_BTN = '#sa-sd-save-confirm';
// saveTableDataToDisk() (JSON.stringify + pako.gzip of the WHOLE dataset)
// runs synchronously on the renderer's main thread, triggered directly by
// clicking either save button above — Playwright's own action timeouts
// (30s default) have nothing to do with how long that takes. Generous on
// purpose; see the LARGE_DATASET_SAVE_BTN click site's own comment for the
// empirical case (74,511 rows) that hit Playwright's default and prompted
// this.
const SAVE_SERIALIZE_TIMEOUT = 600000; // 10 min

const FIXTURES = [
    {
        // "Tougher Than the Rest" (Bruce Springsteen release-group) — the
        // same small, stable, two-group pilot page used by
        // filter-global/filter-column/filter-subtable/sort-column.spec.js.
        pageType: 'releasegroup-releases',
        url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
        showAllButtonSelector: 'button[data-label="Show all Releases for ReleaseGroup"]',
    },
    {
        // Bruce Springsteen's own events tab — deliberately large/paginated
        // (42 native MB pages, 4174 rows) single-table pageType, used as the
        // interaction-perf and post-filter/post-sort regression-snapshot
        // fixture (see tests/live/artist-events-interactions.spec.js and
        // tests/support/capture-interaction-perf.js). Config matches
        // tests/pagetypes.json's artist-events entry exactly.
        pageType: 'artist-events',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
        showAllButtonSelector: 'button[data-label="Show all Events for Artist"]',
        seedGmValues: { sa_enable_caa_pics: false },
        renderTimeout: 300000,
    },
    // ── Large dogfooding captures (local: true — see this file's own JSDoc) ──
    // All anchored on Bruce Springsteen's own artist page. CAA/relationships
    // forced off wherever the pageType's features carry addCAA/injectedColumns
    // ['Relationships'] — same reasoning as every other large capture in this
    // project: a real, unstubbed CAA queue or WS/2 relationships fetch across
    // thousands of rows doesn't finish in a practical capture window.
    {
        pageType: 'artist-releasegroups-va0',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0',
        showAllButtonSelector: 'button[data-label="🧮 Artist RGs"]',
        seedGmValues: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
        renderTimeout: 300000,
        local: true,
    },
    {
        pageType: 'artist-releasegroups-va1',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=1',
        showAllButtonSelector: 'button[data-label="🧮 Various Artists RGs"]',
        seedGmValues: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
        renderTimeout: 300000,
        local: true,
    },
    {
        // 82 native MB pages.
        pageType: 'artist-releases',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/releases?va=0',
        showAllButtonSelector: 'button[data-label="🧮 Artist releases"]',
        seedGmValues: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
        renderTimeout: 3600000, // 60 min — 82 pages (30 min proved too tight on the first attempt)
        local: true,
    },
    {
        // BoDeans' own artist-releases page (56 rows, single native MB
        // page) — committed (not local:true) fixture for
        // tests/live/artist-releases-filter-sort.spec.js. Unlike every
        // other artist-releases capture above, this one needs REAL CAA art
        // + Relationships baked in (realNetwork: true, CAA/relationships
        // left at their configSchema defaults) since the spec's expected
        // counts (see tests/support/bodeansArtistReleasesFixture.js) were
        // derived directly from debug/BoDeans-artist-releases-final.html,
        // itself captured with real network access.
        pageType: 'artist-releases-bodeans',
        url: 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases',
        showAllButtonSelector: 'button[data-label="🧮 Artist releases"]',
        realNetwork: true,
        renderTimeout: 300000,
    },
    {
        // 746 native MB pages — the largest capture in this project by far.
        pageType: 'artist-recordings',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/recordings?all=1',
        showAllButtonSelector: 'button[data-label="⊚ All recordings"]',
        seedGmValues: { sa_enable_caa_pics: false },
        renderTimeout: 3600000, // 60 min — 746 pages
        local: true,
    },
    {
        // 16 native MB pages.
        pageType: 'artist-works',
        url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works',
        showAllButtonSelector: 'button[data-label="Show all Works for Artist"]',
        seedGmValues: { sa_enable_relationships_column: false },
        renderTimeout: 300000,
        local: true,
    },
];

/**
 * Captures one fixture: fetches `url` live, then saves the data to disk via
 * whichever of the script's two Save-to-disk paths this fetch actually
 * takes (see this file's own JSDoc — normal-render vs. large-dataset), and
 * writes the resulting `.json.gz` download to `<pageType>.json.gz` under
 * `OUTPUT_DIR` (or `LOCAL_OUTPUT_DIR` when `local: true`).
 *
 * @param {import('playwright').Browser} browser
 * @param {{ pageType: string, url: string, showAllButtonSelector: string, seedGmValues?: Object, renderTimeout?: number, local?: boolean, realNetwork?: boolean }} fixture
 * @returns {Promise<void>}
 */
async function captureOne(browser, {
    pageType, url, showAllButtonSelector, seedGmValues: seedValues, renderTimeout = 90000, local = false,
    realNetwork = false,
}) {
    const page = await browser.newPage();
    await seedGmValues(page, seedValues);
    // realNetwork: true routes GM_xmlhttpRequest through a real network
    // passthrough (see realNetworkGmXhr.js) instead of gmStubs.js's
    // always-404 stub — needed when CAA art/Relationships must be genuinely
    // populated in the saved snapshot, not left empty/disabled.
    if (realNetwork) {
        await loadUserscriptPageWithRealNetwork(page, { url, testMode: true });
    } else {
        await loadUserscriptPage(page, { url, testMode: true });
    }

    const showAllBtn = page.locator(showAllButtonSelector);
    await showAllBtn.waitFor({ state: 'visible', timeout: 15000 });
    await showAllBtn.click();

    // "⚠️ High Page Count" confirm — only appears when this pageType's real
    // page count exceeds `sa_max_page` (default 50); see this file's own
    // JSDoc. Must be dismissed before the fetch loop can start at all.
    await dismissCustomConfirmDialog(page);

    // Race the two possible outcomes of this click — which one actually
    // happens depends on whether the fetch's row count exceeds
    // `sa_render_threshold` (default 5000), not on anything this script
    // controls, so both must be watched for concurrently rather than
    // guessed from the fixture's expected size.
    const largeDatasetDialogAppeared = page.locator(LARGE_DATASET_SAVE_BTN)
        .waitFor({ state: 'visible', timeout: renderTimeout })
        .then(() => 'large-dataset-dialog')
        .catch(() => null);
    // waitForRenderComplete (not a bare #mb-filter-container wait) — needed
    // for large single-table pages like artist-events, where that element
    // becomes visible before renderRowsChunked()'s batched insertion loop
    // has actually finished (see browser.js's own JSDoc for the confirmed
    // repro on this exact page).
    const renderCompleted = waitForRenderComplete(page, {
        waitForAutoResize: true,
        // realNetwork fixtures fetch real CAA art + Relationships — wait
        // for both to genuinely finish so they're baked into the saved
        // snapshot, not left mid-flight.
        hasCaaOrEaa: realNetwork,
        hasRelationships: realNetwork,
        timeout: renderTimeout,
    })
        .then(() => 'rendered')
        .catch(() => null);
    const outcome = await Promise.race([largeDatasetDialogAppeared, renderCompleted]);

    if (outcome === 'large-dataset-dialog') {
        // "💾 Save to Disk" on showRenderDecisionDialog() — never renders;
        // saveTableDataToDisk() serializes straight from the already-fetched
        // in-memory rows. This is the actual point of this whole path: a
        // table too large to render safely gets saved anyway.
        //
        // Explicit generous timeout (not Playwright's 30s click-action
        // default): saveTableDataToDisk() runs SYNCHRONOUSLY inside this
        // click's handler — JSON.stringify + pako.gzip of the entire
        // dataset, blocking the renderer's main thread before
        // showSaveDialog() ever appears. Confirmed empirically on a
        // 74,511-row/746-page capture: fetch finished and this dialog
        // appeared in ~11 minutes exactly as expected, but the click itself
        // then hung past Playwright's default 30s action timeout (visible/
        // enabled/stable all confirmed, stuck at "performing click action")
        // while that synchronous serialize+compress ran. Scales with row
        // count, not page count — a table with far fewer pages but very
        // wide/rich columns could hit this too.
        await page.click(LARGE_DATASET_SAVE_BTN, { timeout: SAVE_SERIALIZE_TIMEOUT });
    } else if (outcome === 'rendered') {
        await page.click('#mb-save-to-disk-btn', { timeout: SAVE_SERIALIZE_TIMEOUT });
    } else {
        throw new Error(
            `${pageType}: neither render completion nor the large-dataset dialog appeared within ${renderTimeout}ms`
        );
    }

    // Both paths converge here — saveTableDataToDisk() -> showSaveDialog()
    // fires unconditionally regardless of which button triggered it, and a
    // browser download only ever happens on this confirm click. Same
    // generous timeout here too — showSaveDialog() only appears once the
    // serialize+compress above has already finished, but give it the same
    // margin rather than assume the boundary is exactly where expected.
    await page.locator(SAVE_CONFIRM_BTN).waitFor({ state: 'visible', timeout: SAVE_SERIALIZE_TIMEOUT });
    const downloadPromise = page.waitForEvent('download');
    await page.click(SAVE_CONFIRM_BTN);
    const download = await downloadPromise;

    const outputDir = local ? LOCAL_OUTPUT_DIR : OUTPUT_DIR;
    fs.mkdirSync(outputDir, { recursive: true });
    const outPath = path.join(outputDir, `${pageType}.json.gz`);
    await download.saveAs(outPath);
    console.log(`Captured "${pageType}" -> ${outPath}${local ? ' (git-ignored, local only)' : ''}`);

    await page.close();
}

/**
 * @param {string[]} argv - `process.argv.slice(2)`
 * @returns {{ only: string|null }}
 */
function parseArgs(argv) {
    const onlyArg = argv.find((a) => a.startsWith('--only='));
    return { only: onlyArg ? onlyArg.slice('--only='.length) : null };
}

(async () => {
    const { only } = parseArgs(process.argv.slice(2));
    const fixtures = only ? FIXTURES.filter((f) => f.pageType === only) : FIXTURES;

    if (fixtures.length === 0) {
        console.error(`No pageType matching --only=${only} in FIXTURES`);
        process.exit(1);
    }

    const browser = await chromium.launch();
    try {
        for (const fixture of fixtures) {
            await captureOne(browser, fixture);
        }
    } finally {
        await browser.close();
    }
})().catch((err) => {
    console.error('Fixture capture failed:', err);
    process.exit(1);
});
