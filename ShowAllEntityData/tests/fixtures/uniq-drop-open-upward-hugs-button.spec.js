'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-open-upward-hugs-button.html');

// Regression test for a bug found via a real-page repro (release-tracks,
// "Title"/other columns): when openUniqDrop() opens the panel UPWARD, it
// sized max-height to ALL available space above the button (spaceAbove)
// instead of to what the panel's own content (dropH) actually needs. With
// a generous spaceAbove — here driven by a tall spacer, in the field by a
// user-raised sa_uniq_dropdown_visible_rows widening maxDropH — a modest
// panel got stretched to fill the whole gap, and since `top` is computed
// by SUBTRACTING max-height from the button's top, that oversized height
// pushed the panel flush against the top of the page, dozens/hundreds of
// px away from the button that opened it, even though the content would
// have fit comfortably right above it.
test.describe('unique-values dropdown: opening upward hugs the button instead of filling all headroom', () => {
    test('a panel shorter than its available headroom sits close to the button, not at the top of the page', async ({ page }) => {
        // Mirrors the real repro: a user-raised visible-rows cap (default 8)
        // makes maxDropH wide enough that it's never the limiting factor —
        // only the content height (dropH) and the available space are.
        await loadUserscriptPage(page, {
            url: ARTIST_RECORDINGS_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_uniq_dropdown_visible_rows: 30 },
        });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const wrap = page.locator('table.tbl thead th[data-col-name="Name"] .mb-col-uniq-wrap').first();
        const initialBtnRect = await wrap.boundingBox();
        expect(initialBtnRect).toBeTruthy();

        // The 500px spacer should have pushed the header well down the page.
        expect(initialBtnRect.y).toBeGreaterThan(400);

        // Crop the viewport just below the button so spaceBelow is tiny —
        // this forces the "open upward" branch, since spaceAbove (~btnRect.y)
        // is far larger. The 3-row "Name" column's natural content height is
        // nowhere near btnRect.y, so a correctly-sized panel should hug the
        // button, not stretch to fill the whole gap above it. Keep the
        // WIDTH unchanged from the default viewport — changing it (as well
        // as height) reflows the table and shifts the button's Y position,
        // which is why the button is re-measured below rather than reusing
        // initialBtnRect.
        const crampedHeight = Math.ceil(initialBtnRect.y + initialBtnRect.height) + 30;
        await page.setViewportSize({ width: page.viewportSize().width, height: crampedHeight });

        const btnRect = await wrap.boundingBox();
        expect(btnRect).toBeTruthy();

        await wrap.locator('.mb-col-uniq-btn').click();
        const dropdown = page.locator('#mb-col-uniq-dropdown');
        await expect(dropdown).toBeVisible();

        const dropRect = await dropdown.boundingBox();
        expect(dropRect).toBeTruthy();

        // The bug: the panel filled the ENTIRE spaceAbove (~595px here),
        // opening flush with the page top and leaving a ~470px gap to the
        // button. The fix: max-height is capped to dropH, not spaceAbove,
        // so the panel sits close to the button instead — some gap remains
        // because dropH is itself only an ESTIMATE (combinedVals.length +
        // synItemCount) * 29 + 50 + 38, not the actual rendered height (CSS
        // max-height lets a shorter box shrink-wrap below the cap), so this
        // deliberately doesn't assert near-zero — just "close", which is
        // categorically different from "filled all available headroom".
        const gapToButton = btnRect.y - (dropRect.y + dropRect.height);
        expect(gapToButton).toBeGreaterThanOrEqual(0);
        expect(gapToButton).toBeLessThan(200);

        // And, as a consequence, it's nowhere near the top of the page.
        expect(dropRect.y).toBeGreaterThan(100);
    });
});
