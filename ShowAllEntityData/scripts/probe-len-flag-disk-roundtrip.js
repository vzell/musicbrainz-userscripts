/**
 * Probes whether the LENGTH ⚠️/❌ summary buttons survive Save to Disk →
 * Load from Disk on a release tracklist.
 *
 * Suspected while landing PERFORMANCE.org Step 26, CONFIRMED by this probe on
 * 2026-09-23 (8 flagged cells before the save, 0 after the load, both buttons
 * hidden — DEBUG-NOTES.md, the Step 26 entry), and FIXED on 2026-09-24 by
 * `_restoreLenMismatchFlag()`. The regression test is now
 * tests/fixtures/len-flag-disk-roundtrip.spec.js; this stays as the
 * report-only reproduction, and against a fixed tree it should print 8 and 8.
 * The original reason:
 * `_buildDiskCellData()` stores a cell's `innerHTML` plus colSpan/rowSpan and
 * nothing else, while a length mismatch is marked by `data-mb-len-flag` ON the
 * `<td>` itself (`_applyLengthMismatchFlag()`, attributes only by design). A
 * hydrated `<td>` would then carry no flag, and — since the buttons hide at a
 * count of 0 — both buttons would silently disappear from a reopened
 * tracklist. The ⏳ pending-edits markers are not at risk: `span.mp` lives
 * INSIDE the cell's HTML.
 *
 * Read-only against the repo: renders the fixture, saves through the real
 * `#mb-save-to-disk-btn` path into a temp dir, reopens in a fresh page, and
 * prints what each side shows. No pass/fail — it reports.
 *
 *     node scripts/probe-len-flag-disk-roundtrip.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');
const { waitForRenderComplete } = require('../tests/support/browser');
const { machineInfo, readScriptVersion } = require('../tests/support/runMetadata');
const { clickToolbarItem } = require('../tests/support/toolbarMenu');

const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'release-tracks-ms-length.html');
const SETTINGS = { sa_enable_release_tracks: true, sa_release_tracks_length_mismatch_threshold_ms: 500 };

/**
 * In the page: the two LENGTH buttons, the ⏳ button, and the markers behind them.
 *
 * @returns {Object}
 */
function readState() {
    const btn = (id) => {
        const b = document.getElementById(id);
        return b ? { label: b.textContent, visible: b.style.display !== 'none' } : null;
    };
    return {
        rows: Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => !r.classList.contains('mb-col-filter-row')).length,
        flaggedCells: document.querySelectorAll('table.tbl td[data-mb-len-flag]').length,
        warn: btn('mb-len-mismatch-warn-btn'),
        severe: btn('mb-len-mismatch-severe-btn'),
    };
}

(async () => {
    const startedAt = new Date().toISOString();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-len-flag-probe-'));
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
    const out = {};
    try {
        const page = await context.newPage();
        await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: SETTINGS });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        out.beforeSave = await page.evaluate(readState);

        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(page, '#mb-save-to-disk-btn');
        await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await page.click('#sa-sd-save-confirm');
        const download = await downloadPromise;
        const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
        await download.saveAs(saved);

        const reopened = await context.newPage();
        await loadUserscriptPage(reopened, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: SETTINGS });
        await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
        await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(reopened, { waitForAutoResize: false });
        out.afterLoad = await reopened.evaluate(readState);
    } finally {
        await browser.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    console.log(JSON.stringify({
        what: 'LENGTH ⚠️/❌ buttons across Save to Disk → Load from Disk',
        page: { url: RELEASE_URL, pageType: 'release-tracks', title: 'Born to Run', fixture: path.basename(FIXTURE) },
        settings: SETTINGS,
        version: readScriptVersion(),
        machine: machineInfo(),
        startedAt,
        finishedAt: new Date().toISOString(),
        ...out,
    }, null, 2));
})();
