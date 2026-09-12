'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Same page/fixture as uniq-drop-length-bucket.spec.js — a real "Length"
// column with a working .mb-col-uniq-wrap control.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-length-bucket.html');

test.describe('unique-values dropdown: clicking the count badge toggles closed, same as the glyph', () => {
    test('second click on .mb-col-uniq-count closes the dropdown (not just .mb-col-uniq-btn)', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const wrap = page.locator('table.tbl thead th[data-col-name="Length"] .mb-col-uniq-wrap').first();
        const dropdown = page.locator('#mb-col-uniq-dropdown');

        // Sanity control: the glyph already toggles correctly — open, then
        // close on a second click of the same spot.
        await wrap.locator('.mb-col-uniq-btn').click();
        await expect(dropdown).toBeVisible();
        await wrap.locator('.mb-col-uniq-btn').click();
        await expect(dropdown).not.toBeVisible();

        // The bug: opening via the glyph, then clicking the count badge
        // (a sibling span inside the same .mb-col-uniq-wrap) must ALSO
        // close it, not reopen it.
        await wrap.locator('.mb-col-uniq-btn').click();
        await expect(dropdown).toBeVisible();
        await wrap.locator('.mb-col-uniq-count').click();
        await expect(dropdown).not.toBeVisible();
    });
});
