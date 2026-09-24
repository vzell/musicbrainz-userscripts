'use strict';

// The ⚠️/❌ live-date summary buttons must survive Save to Disk → Load from
// Disk. This is the path `_countLiveDateFlags()`'s gate can break silently,
// and only for people who use Save to Disk.
//
// `.mb-live-date-flag` spans are built by `_appendLiveDateFlag()` during
// `applyExtractTrackTitleData()`. A hydrated row does not go through that: its
// flags arrive as stored HTML, so the one signal that says "this page HAS
// flags" never fires. If the gate were left holding a cached `false`,
// `_updateLiveDateFlagButtons()` would hide both buttons on every reopened
// tracklist — no error, no missing data, just two affordances quietly gone.
// `_hydrateAndRenderFromSnapshotData()` resets the gate for exactly this.
//
// Two flows, and only the second can see the reset:
//
//   A. A FRESH page, which is what a user does. The gate starts `null`, so the
//      first tally walks the hydrated rows and finds the flags. This passes
//      even without the reset — it is here because it is the real journey, and
//      because it pins the whole save→load round trip end to end.
//   B. The SAME page session, after a flagless page has already rendered and
//      filtered. That is what caches `false`, and it is the only arrangement in
//      which removing the reset changes the outcome.
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

/** The ⚠️ button's rendered state, or null when it is not in the DOM. */
const warningButton = (page) => page.evaluate(() => {
    const b = document.getElementById('mb-live-date-warning-btn');
    if (!b) return null;
    return { text: b.textContent, hidden: b.style.display === 'none' };
});

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
    const before = await warningButton(page);
    expect(before, 'the ⚠️ button exists on the source page').not.toBeNull();
    expect(before.hidden, 'and is visible').toBe(false);
    expect(before.text, 'and counts both flagged tracks').toContain(`(${WARNING_ROWS})`);

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

            const after = await warningButton(reopened);
            expect(after, 'the ⚠️ button exists after the round trip').not.toBeNull();
            expect(after.hidden, 'and is visible').toBe(false);
            expect(after.text, 'and still counts both flagged tracks')
                .toContain(`(${WARNING_ROWS})`);
        });

    test('B: loading it after a flagless page has already been filtered', async ({ page, context }) => {
        const saved = await renderAndSave(page, tmpDir);

        // Arm the gate on a page that genuinely has no flags: render it, then
        // filter, so `_countLiveDateFlags()` runs over the captured rows and
        // caches "none here". Without the reset in
        // `_hydrateAndRenderFromSnapshotData()`, that answer would still be in
        // force when the flagged snapshot is hydrated below.
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
        expect(armed, 'the page used to arm the gate really has no flags').toBe(0);

        // Now hydrate the flagged snapshot into that same page session.
        await loadFromDiskHere(other, saved);

        const flags = await other.evaluate(() =>
            document.querySelectorAll('tbody tr .mb-live-date-flag').length);
        expect(flags, 'the hydrated rows carry their flags').toBeGreaterThan(0);

        const after = await warningButton(other);
        expect(after, 'the ⚠️ button exists').not.toBeNull();
        expect(after.hidden, 'and is not hidden by a gate armed before the load').toBe(false);
        expect(after.text, 'and counts the hydrated flags')
            .toContain(`(${WARNING_ROWS})`);
    });
});
