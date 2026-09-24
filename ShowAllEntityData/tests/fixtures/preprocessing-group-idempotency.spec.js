'use strict';

// The heading pre-processing block is idempotent per function, but NOT as a
// group — and a second pass over the same document duplicates the <h2> this
// script injects as its own render anchor.
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `applyInsertH2()` guards itself carefully, with a long comment about why a
// text-based guard was not enough: it stamps `data-mb-injected-h2="1"` on its
// own output and queries `h2[data-mb-injected-h2="1"]` before injecting again.
//
// `applyRenameH2ToH3()` runs BEFORE it in the same block, renames EVERY <h2>
// in the document, and copies all attributes onto the <h3> it substitutes. So
// on a second pass:
//
//   1. the injected <h2 data-mb-injected-h2="1"> becomes
//      <h3 data-mb-injected-h2="1">  — an orphan carrying the marker;
//   2. applyInsertH2()'s own query looks for an H2 and finds nothing;
//   3. a second heading is injected beside the orphan.
//
// That matters for more than tidiness. applyInsertH2()'s guard exists because
// a duplicate <h2> "shifts the allH2s sequence that renderGroupedTable uses to
// locate targetHeader, which can cause targetHeader to resolve to the
// duplicate instead of the intended anchor — breaking group insertion order".
// The guard is defeated, so that is exactly what a second pass sets up.
//
// ── How it is reached, which is NOT what it first looked like ───────────────
//
// It is NOT reachable by pressing the action button twice. That path never
// re-runs pre-processing at all: `startFetchingProcess()` answers a second
// press with `window.location.reload()` long before the block, so the DOM is
// MusicBrainz's own again and the first pass is the only pass.
//
// The reachable path is LOAD FROM DISK after the page has already rendered —
// `_hydrateAndRenderFromSnapshotData()` re-runs the block itself, gated on
// `features.listToTable`. Two loads in a row do it just as well as
// fetch-then-load. 17 pageTypes declare all three of the features this needs
// (renameH2ToH3 + insertH2 + listToTable): every `*-tags` type plus
// user-ratings, popular-tags, reports-index, edit-types, instrument-list and
// privileged-accounts. `notes-received` declares the first two but not
// listToTable, so it cannot reach it this way.
//
// Nothing here is hand-built: the fixture saves itself through the real
// `#mb-save-to-disk-btn` path and the file that comes back is what gets
// loaded, so the second pass is the production one.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');

// user-ratings: renameH2ToH3 + insertH2 + listToTable, and the one pageType in
// that set with a committed fixture.
const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings';
const FIXTURE_FILE = path.join(__dirname, 'user-ratings-multigroup.html');
const BUTTON = 'button[data-label="Show Ratings for User"]';
const SAVE_CONFIRM_BTN = '#sa-sd-save-confirm';

/** Drives Load-from-Disk on the page as it stands — no navigation. */
async function loadFromDiskHere(page, fixturePath) {
    await clickToolbarItem(page, '#mb-load-from-disk-btn');
    await page.locator('input[type="file"][accept*="json"]').setInputFiles(fixturePath);
    const renderBtn = page.locator('#sa-render-no-filter-confirm');
    await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
    await renderBtn.evaluate((el) => el.click());
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Renders the fixture and saves it through the real Save-to-Disk path. */
async function renderAndSave(page, outDir, name) {
    await loadUserscriptPage(page, {
        url: RATINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true,
    });
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await clickToolbarItem(page, '#mb-save-to-disk-btn');
    await page.locator(SAVE_CONFIRM_BTN).waitFor({ state: 'visible', timeout: 15000 });
    await page.click(SAVE_CONFIRM_BTN);
    const download = await downloadPromise;
    const saved = path.join(outDir, download.suggestedFilename() || name);
    await download.saveAs(saved);
    expect(fs.statSync(saved).size, 'the saved snapshot is not empty').toBeGreaterThan(0);
    return saved;
}

test.describe('heading pre-processing is idempotent as a GROUP, not just per function', () => {
    let pageErrors;
    let outDir;

    test.beforeAll(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-preproc-'));
    });

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('the injected anchor survives a second pass as the SAME element',
        async ({ page }) => {
            test.setTimeout(120000);
            const saved = await renderAndSave(page, outDir, 'ratings.json.gz');

            // Tag the anchor with a token no production code knows about. This
            // is the whole test: a COUNT of anchors is 1 either way, because
            // renderGroupedTable()'s cleanup sweeps the demoted orphan and the
            // freshly injected <h2> takes its place. Only identity tells the
            // two apart.
            const tagged = await page.evaluate(() => {
                const h = document.querySelector('h2[data-mb-injected-h2="1"]');
                if (!h) return false;
                h.setAttribute('data-spec-token', 'ORIGINAL');
                return true;
            });
            expect(tagged, 'one pass produced an <h2> anchor to tag').toBe(true);

            await loadFromDiskHere(page, saved);

            const after = await page.evaluate(() => ({
                markedTags: Array.from(
                    document.querySelectorAll('[data-mb-injected-h2="1"]'),
                    (e) => e.tagName),
                anchorIsSameElement: !!document.querySelector(
                    'h2[data-mb-injected-h2="1"][data-spec-token="ORIGINAL"]'),
                orphanCount: document.querySelectorAll(
                    'h3[data-mb-injected-h2="1"]').length,
            }));

            // Recorded so a failure says which half broke. Before the fix this
            // was already ['H2'] — the count never showed the defect.
            expect(after.markedTags, 'still exactly one marked anchor, and it is an h2')
                .toEqual(['H2']);
            expect(after.orphanCount, 'no demoted orphan is left carrying the marker').toBe(0);

            // THE assertion. Before the fix: false — the anchor was demoted to
            // an <h3>, swept by the render cleanup, and replaced by a brand new
            // <h2>, so anything holding a reference to it or state on it lost
            // both. After: the same node is still there, untouched.
            expect(after.anchorIsSameElement,
                'the second pass must leave the anchor element alone, not destroy '
                + 'and re-create it').toBe(true);
        });

    test('a native <h2> is still demoted — the guard is not a blanket opt-out',
        async ({ page }) => {
            test.setTimeout(120000);
            await loadUserscriptPage(page, {
                url: RATINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true,
            });

            const nativeH2s = await page.locator('h2').count();
            expect(nativeH2s, 'the fixture has native h2 section headings to demote')
                .toBeGreaterThan(1);

            await page.click(BUTTON);
            await waitForRenderComplete(page, { waitForAutoResize: false });

            // Counter-guard: excluding the marker must not accidentally exclude
            // MusicBrainz's own headings, which is the entire point of the
            // feature. Exactly one <h2> should remain — ours.
            const h2s = await page.evaluate(() => Array.from(
                document.querySelectorAll('h2'),
                (h) => h.getAttribute('data-mb-injected-h2') === '1'));
            expect(h2s.length, 'exactly one <h2> survives pre-processing').toBe(1);
            expect(h2s[0], 'and it is the injected anchor, not a native heading').toBe(true);
        });
});
