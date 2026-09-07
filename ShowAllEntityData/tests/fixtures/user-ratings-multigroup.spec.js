'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// user-ratings (/user/<name>/ratings) renders MULTIPLE simultaneous
// entity-type sections (Artist/Event/Label/Place/Recording/Release group/
// Work ratings) from one page load, each carrying its own per-entity-type
// config in `entityFeatures`. Two real bugs only reproduce with more than
// one such group present on the SAME page — see scripts/build-user-ratings-
// fixture.js for how this real capture was turned into a fixture.
const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings';
const FIXTURE_FILE = path.join(__dirname, 'user-ratings-multigroup.html');

const openRatings = async (page, settingsOverride = {}) => {
    await loadUserscriptPage(page, {
        url: RATINGS_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: { sa_enable_caa_pics: true, ...settingsOverride },
    });
    await page.click('button[data-label="Show Ratings for User"]');
    await page.waitForSelector('#mb-filter-container');
};

/** Expands a collapsed h3 sub-section by clicking its heading. */
async function expandSection(page, headingText) {
    await page.locator('h3', { hasText: headingText }).first().click();
    await page.waitForTimeout(50);
}

test.describe('user-ratings: multi-group entityFeatures staleness', () => {
    test('the 📊 dropdown on "Event ratings"\' Date column offers Date-info sections', async ({ page }) => {
        await openRatings(page);
        await expandSection(page, 'Event ratings');

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
        expect(sections).not.toBeNull();
        const labels = sections.map((s) => s.label);
        expect(labels).toEqual(expect.arrayContaining([
            expect.stringContaining('Date info'),
        ]));
    });

    test('hovering the CAA inline thumbnail on "Release group ratings" does not throw, and shows the rich tooltip popup', async ({ page }) => {
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));

        // The inline thumbnail's hover tooltip only wires up after its OWN
        // image successfully "loads" (_artFetchCachedImage's IDB-path success
        // callback calls _wireInlineThumbnailBigboxTooltip unconditionally,
        // without waiting for img.onload) — gmStubs.js's GM_xmlhttpRequest
        // 404s anything not explicitly configured, so without this the crash
        // under test would never get a chance to fire at all. Seed both of
        // the fixture's release-group GUIDs at the default small-thumbnail
        // size (sa_caa_small_img_size = 250) with a fake-but-valid Blob
        // response; its content is irrelevant on the IDB path (default
        // sa_art_idb_enable = true), which never waits for the browser to
        // actually decode the image.
        await page.context().addInitScript({ content: `
            window.__gmXhrResponses = {
                'https://coverartarchive.org/release-group/065db277-9ec0-45af-9fd2-b4435674d834/front-250':
                    { status: 200, blob: new Blob(['x'], { type: 'image/png' }) },
                'https://coverartarchive.org/release-group/3eb2f3c8-1975-48b2-b455-acc202057386/front-250':
                    { status: 200, blob: new Blob(['x'], { type: 'image/png' }) },
            };
        ` });

        await openRatings(page);
        await expandSection(page, 'Release group ratings');

        const thumb = page.locator(
            'h3:has-text("Release group ratings") ~ table .mb-caa-inline-ph',
        ).first();
        await expect(thumb).toHaveCount(1);
        // Let the (mocked-network, see gmStubs' 404 fallback) enrichment
        // settle before hovering — the crash under test happens inside the
        // mouseenter handler regardless of whether the image itself loaded.
        await page.waitForTimeout(300);
        await thumb.hover();
        await page.waitForTimeout(200);

        expect(pageErrors.filter((m) => m.includes('extractMainColumn'))).toEqual([]);

        const tooltip = await page.evaluate(() => {
            const tip = document.getElementById('mb-art-bigbox-tooltip');
            return tip ? { display: tip.style.display, hasContent: tip.innerHTML.trim().length > 0 } : null;
        });
        expect(tooltip).not.toBeNull();
        expect(tooltip.display).not.toBe('none');
        expect(tooltip.hasContent).toBe(true);
    });
});
