'use strict';

// PERFORMANCE.org Step 26. `updateFilterButtonsVisibility()` runs on EVERY
// filter pass, and its tail feeds two families of summary buttons from the
// captured SOURCE rows — the ⏳ pending-edits toggles and the LENGTH ⚠️/❌
// buttons. They count source rows on purpose (AUDIT.md §3.6: `runFilter()`
// REMOVES non-matching rows, so a live-DOM tally makes a button vanish under
// the very filter it describes), and that made them cost one `querySelector`
// per source row per counter per pass — flat at the full row count however
// narrow the filter was. `_sourceRowTally()` now memoizes them per source-row
// ARRAY, validated by that array's length.
//
// Three kinds of test, each paired with the guarantee a broken memo would
// lose, because "the counter did not move" alone is passed perfectly by a
// function that returns zeros:
//
//   - the GATE: after the first tally, filter passes stop walking rows
//     (`__saTest.sourceRowTallyScans()`), on a multi-table page, a
//     single-table page and a release tracklist;
//   - the GUARANTEE: the counts those passes show are still the whole table's
//     — under a filter that excludes the counted rows, and after a sort;
//   - the RE-KEY: a NEW row set in the same page session is counted afresh.
//     That is the one arrangement in which a memo that is never invalidated
//     shows a wrong number, so it is the one that pins the invalidation.
//
// Why the gate tests call `updateFilterButtonsVisibility()` themselves: it
// runs at the TAIL of a filter pass, after the rows have settled, so a count
// read the moment the rows settle can beat it — and a missing memo would then
// go unseen. A direct call is synchronous; a broken memo moves the counter by
// a whole row set on that call alone. That call is also where the second
// probe sits — see `tallyQueriesPerRefresh()` for why the counter alone
// cannot see every way back to a per-pass walk.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// Multi-table: artist-releasegroups, three <h3> sub-tables — Album (2 of 3
// rows pending), Single (1 of 2), Live (0 of 2). Same fixture as
// pending-edits-filter.spec.js.
const RG_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const RG_FIXTURE = path.join(__dirname, 'pending-edits-multi.html');

// Single-table: artist-recordings, "Track A".."Track E", A-D pending. The
// three David Bowie rows (A, B, D) are all pending, which is what makes a
// "Bowie" pre-filtered load land on a different, NONZERO count: (3), not (4).
const REC_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const REC_FIXTURE = path.join(__dirname, 'uniq-drop-pending-edits.html');

// Release tracklist: "Born to Run", 8 tracks. At a 500 ms threshold and the
// default ×3 "far over" factor, A2/A3/B2 are ⚠️ and B3 (3 s) is ❌ — see
// release-tracks-recording-length.spec.js, which owns those numbers.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const RELEASE_FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

const GLOBAL_BTN = '#mb-pending-edits-btn';
const SAVE_CONFIRM_BTN = '#sa-sd-save-confirm';

// Serving a saved page: MusicBrainz's own supported-browser-check.js throws,
// and a versioned bundle it references answers with an HTML error page.
// Excluded by origin, not by message text — neither involves the userscript.
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

const tallyScans = (page) => page.evaluate(() => window.__saTest.sourceRowTallyScans());

/** One synchronous run of the function every filter pass ends with. */
const refreshButtons = (page) => page.evaluate(() => window.updateFilterButtonsVisibility());

/**
 * Runs `updateFilterButtonsVisibility()` once and returns how many
 * `querySelector` calls it made with the two tally selectors — the per-row
 * queries Step 26 is about. `sourceRowTallyScans()` only sees walks INSIDE
 * `_sourceRowTally()`; this also sees a call site that walks the rows itself
 * (e.g. one reverted to its pre-memo `reduce(... _rowHasPendingEdits ...)`),
 * which the counter would report as zero.
 */
const tallyQueriesPerRefresh = (page) => page.evaluate(() => {
    const WATCHED = new Set(['td span.mp', 'td[data-mb-len-flag]']);
    const orig = Element.prototype.querySelector;
    let n = 0;
    Element.prototype.querySelector = function (sel) {
        if (WATCHED.has(sel)) n++;
        return orig.call(this, sel);
    };
    try {
        window.updateFilterButtonsVisibility();
    } finally {
        Element.prototype.querySelector = orig;
    }
    return n;
});

/** Rows currently rendered, across every table, excluding the filter row. */
const visibleRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length);

/** Types into the global filter and waits for the rendered row set to reach `rows`. */
async function filterTo(page, text, rows) {
    await page.fill('#mb-global-filter-input', text);
    await page.waitForFunction((n) => Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row'))
        .length === n, rows, { timeout: 15000 });
}

/** A button's label and visibility, or null when it is not in the DOM. */
const button = (page, sel) => page.evaluate((s) => {
    const b = document.querySelector(s);
    return b ? { label: b.textContent, visible: b.style.display !== 'none' } : null;
}, sel);

/** Per-sub-table ⏳ labels in DOM order (null where a section has none). */
const subLabels = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
        const b = h3.querySelector('.mb-subtable-pending-edits-btn');
        return b && b.style.display !== 'none' ? b.textContent : null;
    }));

const renderMulti = async (page) => {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: false, sa_enable_relationships_column: false },
    });
    await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="🧮 Artist RGs"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // Sub-sections can render collapsed; expanded, every row is countable.
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
        await master.click();
    }
};

const renderSingle = async (page) => {
    await loadUserscriptPage(page, { url: REC_URL, fixtureFile: REC_FIXTURE, testMode: true });
    await page.route(`${REC_URL}?**`, (r) => r.fulfill({ path: REC_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

const renderRelease = async (page) => {
    await loadUserscriptPage(page, {
        url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_release_tracks: true,
            sa_release_tracks_length_mismatch_threshold_ms: 500,
        },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
};

/**
 * Establishes the "already counted" baseline: one direct refresh, so the
 * tally has certainly run over the rendered row set, then the counter.
 */
async function countedBaseline(page) {
    await refreshButtons(page);
    return tallyScans(page);
}

test.describe('source-row tallies are memoized per row set (PERFORMANCE.org Step 26)', () => {
    let pageErrors;
    let tmpDir;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        tmpDir = null;
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('multi-table: filter passes stop walking rows, and the ⏳ counts stay whole', async ({ page }) => {
        await renderMulti(page);
        expect(await visibleRows(page), 'all seven rows are rendered').toBe(7);

        const baseline = await countedBaseline(page);
        // The tally really ran over every source row — otherwise "it stopped"
        // would be true of a function that never ran.
        expect(baseline, 'the first tally walked every source row').toBeGreaterThanOrEqual(7);

        // "Born" keeps Album's one NON-pending row and nothing else, so a
        // live-DOM count would read 0 everywhere and hide every button.
        await filterTo(page, 'Bor', 1);
        await filterTo(page, 'Born', 1);

        expect(await tallyQueriesPerRefresh(page), 'a refresh makes no per-row tally query').toBe(0);
        expect(await tallyScans(page), 'no pass after the first re-walked a source row').toBe(baseline);
        expect(await subLabels(page), 'each sub-table still counts its own rows').toEqual(['(2) ⏳', '(1) ⏳', null]);
        const g = await button(page, GLOBAL_BTN);
        expect(g.visible, 'the global toggle is still offered').toBe(true);
        expect(g.label, 'and still counts the whole page').toBe('(3) ⏳');
    });

    test('single-table: filter passes stop walking rows; a sort re-keys without changing the count',
        async ({ page }) => {
            await renderSingle(page);
            expect(await visibleRows(page)).toBe(5);

            const baseline = await countedBaseline(page);
            expect(baseline, 'the first tally walked every source row').toBeGreaterThanOrEqual(5);

            // "Track E" is the one row with no pending edits.
            await filterTo(page, 'Track', 5);
            await filterTo(page, 'Track E', 1);

            expect(await tallyQueriesPerRefresh(page), 'a refresh makes no per-row tally query').toBe(0);
            expect(await tallyScans(page), 'no pass after the first re-walked a source row').toBe(baseline);
            const underFilter = await button(page, GLOBAL_BTN);
            expect(underFilter.visible, 'the ⏳ toggle survives a filter excluding every pending row').toBe(true);
            expect(underFilter.label, 'and counts the data, not the view').toBe('(4) ⏳');

            // A sort REPLACES `allRows` (a new, reordered array). The count
            // must come through unchanged — the memo re-keys, it does not reset
            // to zero or double up.
            await filterTo(page, '', 5);
            const sortBtn = page.locator('table.tbl thead .sort-icon-btn', { hasText: '▼' }).first();
            await waitForSortSettled(page, () => sortBtn.click());
            await refreshButtons(page);
            expect((await button(page, GLOBAL_BTN)).label, 'a sort keeps the count').toBe('(4) ⏳');
        });

    test('release tracklist: the LENGTH ⚠️/❌ counts stay whole and stop re-walking', async ({ page }) => {
        await renderRelease(page);

        const warn = await button(page, '#mb-len-mismatch-warn-btn');
        const severe = await button(page, '#mb-len-mismatch-severe-btn');
        expect(warn.label, 'three tracks are over the 500 ms threshold').toBe('(3) LENGTH ⚠️');
        expect(severe.label, 'and one is over ×3 of it').toBe('(1) LENGTH ❌');

        const baseline = await countedBaseline(page);
        expect(baseline, 'the first tally walked every track').toBeGreaterThanOrEqual(8);

        // "Thunder Road" (A1) carries neither flag.
        await filterTo(page, 'Thunder', 1);
        await filterTo(page, 'Thunder Road', 1);

        expect(await tallyQueriesPerRefresh(page), 'a refresh makes no per-row tally query').toBe(0);
        expect(await tallyScans(page), 'no pass after the first re-walked a track').toBe(baseline);
        const warnAfter = await button(page, '#mb-len-mismatch-warn-btn');
        const severeAfter = await button(page, '#mb-len-mismatch-severe-btn');
        expect(warnAfter.visible && severeAfter.visible, 'both survive a filter excluding every flagged row').toBe(true);
        expect(warnAfter.label).toBe('(3) LENGTH ⚠️');
        expect(severeAfter.label).toBe('(1) LENGTH ❌');
    });

    test('re-key: a new row set loaded into the same page is counted afresh', async ({ page }) => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-tally-memo-'));
        await renderSingle(page);
        expect((await button(page, GLOBAL_BTN)).label, 'the source page counts four').toBe('(4) ⏳');
        const before = await countedBaseline(page);

        // Save through the real Save-to-Disk path.
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await page.click('#mb-save-to-disk-btn');
        await page.locator(SAVE_CONFIRM_BTN).waitFor({ state: 'visible', timeout: 15000 });
        await page.click(SAVE_CONFIRM_BTN);
        const download = await downloadPromise;
        const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
        await download.saveAs(saved);

        // Load it back into THIS page — no navigation, so the memo filled
        // above is still there — through the pre-filtered path, which hydrates
        // only the three Bowie rows. That is a new source-row set with a
        // different count; a memo that is never invalidated keeps saying (4).
        await page.click('#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const loadFilter = page.locator('#sa-load-filter-input');
        await loadFilter.click();
        await loadFilter.pressSequentially('Bowie');
        await page.click('#sa-filter-confirm');
        const renderBtn = page.locator('#sa-render-confirm');
        await renderBtn.waitFor({ state: 'visible', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect(await visibleRows(page), 'the pre-filter hydrated only the Bowie rows').toBe(3);
        await refreshButtons(page);
        const after = await button(page, GLOBAL_BTN);
        expect(after.visible, 'the ⏳ toggle is offered on the hydrated rows').toBe(true);
        expect(after.label, 'and counts THEM, not the page it replaced').toBe('(3) ⏳');
        expect(await tallyScans(page), 'the new row set was walked').toBeGreaterThan(before);
    });
});
