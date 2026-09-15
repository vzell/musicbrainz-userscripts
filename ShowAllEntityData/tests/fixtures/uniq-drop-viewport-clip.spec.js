'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Same page/fixture shape as uniq-drop-length-bucket.spec.js (artist-recordings,
// single-table) so pageType detection + headerContainer resolve.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

// Regression test for the openUniqDrop() viewport-clamp fix (see
// "Position panel below the button (flip upward if needed)" in
// ShowAllEntityData.user.js). The old code only flipped the panel upward
// when the WHOLE panel fit above the button (`bRect.top > dropH`); when a
// short viewport left neither the space above NOR below the button large
// enough to hold the whole panel, it fell through to opening downward with
// no clamp at all — and since the panel is `position: fixed` on
// `document.body`, anything past `window.innerHeight` was genuinely clipped,
// not just off-screen-but-scrollable.
test.describe('unique-values dropdown: stays within the viewport when neither side has full room', () => {
    test('panel bounding rect never extends past window.innerHeight/0, even in a cramped viewport', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const wrap = page.locator('table.tbl thead th[data-col-name="Name"] .mb-col-uniq-wrap').first();
        const btnRectBefore = await wrap.boundingBox();
        expect(btnRectBefore).toBeTruthy();

        // Shrink the viewport so it ends just below the header button —
        // this leaves only a sliver of room below it, and (given this
        // fixture's minimal header markup) also less room above it than
        // the ~320px the "Name" column's 10-value panel naturally wants.
        // Neither direction can then hold the whole panel, which is exactly
        // the scenario the old all-or-nothing flip gate mishandled.
        const crampedHeight = Math.ceil(btnRectBefore.y + btnRectBefore.height) + 30;
        await page.setViewportSize({ width: 1024, height: crampedHeight });

        // Sanity-check the scenario actually exercises the bug: the space
        // above the button must also be less than a full-size panel, or
        // this test would pass trivially via the "flip upward" branch alone.
        expect(btnRectBefore.y).toBeLessThan(300);

        await wrap.locator('.mb-col-uniq-btn').click();
        const dropdown = page.locator('#mb-col-uniq-dropdown');
        await expect(dropdown).toBeVisible();

        const dropRect = await dropdown.boundingBox();
        expect(dropRect).toBeTruthy();
        expect(dropRect.y).toBeGreaterThanOrEqual(-1);
        // A few px of slack absorbs sub-pixel/rounding noise from the
        // viewport resize itself — the bug this guards produced an overshoot
        // of hundreds of px (the panel's full, unclamped natural height),
        // not a rounding-sized one.
        expect(dropRect.y + dropRect.height).toBeLessThanOrEqual(crampedHeight + 5);
    });
});
