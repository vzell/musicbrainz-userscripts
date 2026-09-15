'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Reuses the already-committed uniq-drop-date-expression fixture/pageType
// (see uniq-drop-date-expression.spec.js) rather than hand-authoring a new
// one — its "Date" column already produces the full multi-section family
// ("Date info - Precision"/"- Decade"/"- Month"/"- Weekday" + the plain
// value list) this regression needs.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-date-expression.html');

// Regression test for a bug found via a real-page repro (release-tracks,
// "Artist"/"Length"/"Recording date" columns all showed an internal
// scrollbar the user judged unnecessary). openUniqDrop() used to ESTIMATE
// the panel's needed height via a per-item formula
// ((combinedVals.length + synItemCount) * 29 + 50 + 38), which assumes only
// ONE section header/divider's worth of overhead (the flat "+50") no matter
// how many distinct synBox sections actually render. A column producing
// several sections — like this "Date" column's Precision/Decade/Month/
// Weekday family — has that many section headers, each consuming real
// space the formula never counted. Measured directly (see this commit's
// history): the formula estimated 262px while the panel's real content was
// 849px, so even with 421px genuinely available below the button, the old
// code capped the panel at 262px — a scrollbar for content that had room to
// show a lot more of itself, or (with enough room, as here) all of itself.
// The fix measures the panel's real drop.scrollHeight instead, since its
// content is already built by the time this positioning code runs.
test.describe('unique-values dropdown: a multi-section panel shows fully when the viewport has room for it', () => {
    test('the "Date" column\'s full section family renders with no internal overflow, given a tall viewport', async ({ page }) => {
        // Tall enough that the panel's real content (measured: 849px, see
        // the comment above) comfortably fits below the button (measured:
        // button top ~275px in this fixture) — the old formula-based
        // estimate would still have capped the panel at 262px regardless.
        await page.setViewportSize({ width: 1280, height: 1200 });

        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const wrap = page.locator('table.tbl thead th[data-col-name="Date"] .mb-col-uniq-wrap').first();
        await wrap.locator('.mb-col-uniq-btn').click();
        const dropdown = page.locator('#mb-col-uniq-dropdown');
        await expect(dropdown).toBeVisible();

        // Sanity check: this column really does produce multiple distinct
        // synBox sections (the thing the old flat "+50" couldn't account
        // for) — otherwise this test isn't exercising the bug at all.
        const sectionCount = await dropdown.evaluate((el) => el.querySelectorAll('.mb-uniq-section').length);
        expect(sectionCount).toBeGreaterThanOrEqual(3);

        // The real assertion: no internal overflow. scrollHeight equals
        // clientHeight (within a couple px of rounding/border slop) when
        // every bit of content is actually visible.
        const { scrollHeight, clientHeight } = await dropdown.evaluate((el) => ({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
        }));
        expect(scrollHeight - clientHeight).toBeLessThanOrEqual(4);
    });
});
