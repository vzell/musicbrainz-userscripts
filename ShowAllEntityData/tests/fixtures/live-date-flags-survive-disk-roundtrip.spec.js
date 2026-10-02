'use strict';

// The live-date ⚠️ count must survive Save to Disk → Load from Disk.
//
// `.mb-live-date-flag` spans are built by `_appendLiveDateFlag()` during
// `applyExtractTrackTitleData()`. A hydrated row does not go through that: its
// flags arrive as stored HTML. The ⚠️ WARNING findings menu (which replaced
// the filter bar's "(N) WARNING ⚠️" button, org/generalize-error-warning.org)
// counts the `data-mb-findings` stamp `stampFindings()` writes at the
// disk-load tail, through a tally memoized per source-row array and per stamp
// generation. Leave either out — the stamp call on the disk path, or the
// generation — and a reopened tracklist offers no live-date row: no error, no
// missing data, just the affordance quietly gone.
//
// Two flows, and only the second can see a stale memo:
//
//   A. A FRESH page, which is what a user does. Nothing is memoized yet, so
//      the first tally walks the hydrated rows. It pins the whole save→load
//      round trip end to end, including the stamp on the disk path.
//   B. The SAME page session, after a flagless page has already rendered and
//      filtered, so a tally of ITS rows is memoized. That is the arrangement
//      in which a memo that ignored the stamp generation could answer from
//      before the load.
//
// Nothing is hand-built: the fixture saves itself through the real
// `#mb-save-to-disk-btn` path and the file that comes back is what gets loaded,
// the same principle as `tests/support/diskFixture.js`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled, typeGlobalFilter } = require('../support/filterSortAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { findingsMenuState } = require('../support/findingsMenu');

// The live album from AUDIT.md §3.6: 27 tracks, 2 ⚠️ rows, no ❌.
const RELEASE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const RELEASE_FIXTURE = path.join(__dirname, 'release-tracks-live-date-flags.html');
const WARNING_ROWS = 2;

// A flagless page, used only to make the gate cache "no flags here" before the
// disk load in flow B. Deliberately the SAME pageType — "Born to Run", 8 tracks,
// none of them live-attributed. A release-group page was tried first and its
// snapshot hydrated into nothing: Load-from-Disk restores a dataset into the
// page it is opened on, so the destination has to be a page the dataset fits.
const FLAGLESS_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FLAGLESS_FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

// showSaveDialog()'s confirm button — the single point the save path converges
// on before a browser download fires (see tests/support/capture-fixture.js).
const SAVE_CONFIRM_BTN = '#sa-sd-save-confirm';

/** The ⚠️ menu's live-date row count, or null when there is no such row. */
const warningCount = async (page) => {
    const menu = await findingsMenuState(page, 'warn');
    if (!menu || !menu.attached) return null;
    const row = menu.rows.find((r) => r.id === 'live-credit-nodate');
    return row ? row.count : null;
};

/**
 * Renders the flagged release and saves it through the real Save-to-Disk path.
 *
 * @returns {Promise<string>} the downloaded .json.gz's path on disk
 */
async function renderAndSave(page, outDir) {
    await loadUserscriptPage(page, {
        url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    // Sanity before saving: there is something worth round-tripping.
    expect(await warningCount(page), 'the ⚠️ menu counts both flagged tracks on the source page')
        .toBe(WARNING_ROWS);

    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await clickToolbarItem(page, '#mb-save-to-disk-btn');
    await page.locator(SAVE_CONFIRM_BTN).waitFor({ state: 'visible', timeout: 15000 });
    await page.click(SAVE_CONFIRM_BTN);
    const download = await downloadPromise;

    const saved = path.join(outDir, download.suggestedFilename() || 'snapshot.json.gz');
    await download.saveAs(saved);
    expect(fs.statSync(saved).size, 'the saved snapshot is not empty').toBeGreaterThan(0);
    return saved;
}

/**
 * Drives Load-from-Disk on the page as it stands — no navigation, so a gate
 * armed by an earlier render on this same page survives into the load. This is
 * `diskFixture.js`'s tail without its `loadUserscriptPage()` head.
 */
async function loadFromDiskHere(page, fixturePath) {
    await clickToolbarItem(page, '#mb-load-from-disk-btn');
    const fileInput = page.locator('input[type="file"][accept*="json"]');
    await fileInput.setInputFiles(fixturePath);
    const renderBtn = page.locator('#sa-render-no-filter-confirm');
    await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
    // Dispatched through the DOM: the dialog is position:fixed and its button
    // can land below the fold at the project viewport — see diskFixture.js.
    await renderBtn.evaluate((el) => el.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('live-date flags survive a Save to Disk → Load from Disk round trip', () => {
    let pageErrors;
    let tmpDir;

    test.beforeEach(async ({ page }) => {
        pageErrors = [];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-disk-roundtrip-'));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('A: reopening a saved tracklist in a fresh page still shows the ⚠️ button',
        async ({ page, context }) => {
            const saved = await renderAndSave(page, tmpDir);

            // A genuinely fresh page: module state starts empty, and
            // _appendLiveDateFlag() never runs on the hydrated rows.
            const reopened = await context.newPage();
            reopened.on('pageerror', (e) => {
                const where = String(e.stack || e.message || '');
                if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
            });
            await loadUserscriptPage(reopened, {
                url: RELEASE_URL, fixtureFile: RELEASE_FIXTURE, testMode: true,
            });
            await loadFromDiskHere(reopened, saved);

            const flags = await reopened.evaluate(() =>
                document.querySelectorAll('tbody tr .mb-live-date-flag').length);
            expect(flags, 'the hydrated rows carry their flags as stored HTML')
                .toBeGreaterThan(0);

            expect(await warningCount(reopened), 'the ⚠️ menu still counts both flagged tracks')
                .toBe(WARNING_ROWS);
        });

    test('B: loading it after a flagless page has already been filtered', async ({ page, context }) => {
        const saved = await renderAndSave(page, tmpDir);

        // Fill the memo on a page that genuinely has no live-date flags:
        // render it, then filter, so the findings tally runs over its
        // captured rows and memoizes "none here".
        const other = await context.newPage();
        other.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        await loadUserscriptPage(other, {
            url: FLAGLESS_URL, fixtureFile: FLAGLESS_FIXTURE, testMode: true,
        });
        await other.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(other, { waitForAutoResize: false });
        await waitForFilterSettled(other, () => typeGlobalFilter(other, 'a'));
        // Clear it again: a filter left active would narrow the hydrated rows
        // too, and "no flagged rows on screen" would then be ambiguous.
        await waitForFilterSettled(other, () => other.click('#mb-clear-all-filters-btn'));

        const armed = await other.evaluate(() =>
            document.querySelectorAll('.mb-live-date-flag').length);
        expect(armed, 'the page that filled the memo really has no flags').toBe(0);

        // Now hydrate the flagged snapshot into that same page session.
        await loadFromDiskHere(other, saved);

        const flags = await other.evaluate(() =>
            document.querySelectorAll('tbody tr .mb-live-date-flag').length);
        expect(flags, 'the hydrated rows carry their flags').toBeGreaterThan(0);

        expect(await warningCount(other), 'the ⚠️ menu counts the hydrated flags, not the memo from before')
            .toBe(WARNING_ROWS);
    });
});
