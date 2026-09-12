'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// artist-relationships-filtered (path matches /relationships and the URL
// carries link_type_id) — tableMode: 'single', and its lone button carries
// no `params`, so startFetchingProcess reuses the live document instead of
// re-fetching (same reasoning as uniq-drop-date-expression.spec.js's choice
// of artist-events).
const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/relationships?link_type_id=44';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-title-release-quality.html');

async function openTitleDrop(page) {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Relationships for Artist (complete)"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return page.evaluate(() => window.__saTest.getUniqDropSections('Title'));
}

test.describe('unique-values dropdown: "Release info - Data quality" on a relationship "Title" column', () => {
    test('classifies release targets by quality and ignores a non-release target entirely', async ({ page }) => {
        const sections = await openTitleDrop(page);
        const quality = sections.find((s) => s.label === 'Release info - Data quality');
        expect(quality).toBeTruthy();

        // Row A=high, Row B=low, Row C=release with no marker (normal). Row
        // D targets a work (no <span class="releaselink">) and must not
        // appear in ANY of these three counts — that's the regression the
        // entity-kind guard exists to prevent.
        expect(Object.fromEntries(quality.items.map((i) => [i.label, i.count]))).toEqual({
            '🟢 high data quality': 1,
            '🟠 low data quality': 1,
            '⚪ normal data quality': 1,
        });
    });

    test('checking "high data quality" narrows to the one release row', async ({ page }) => {
        await openTitleDrop(page);
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Release info - Data quality');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '🟢 high data quality');
            item.click();
        });

        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 1, null, { timeout: 15000 });

        const titleText = await page.evaluate(() =>
            document.querySelector('table.tbl tbody tr td:nth-child(2)').textContent.trim());
        expect(titleText).toContain('Magic');
    });

    test('offers no "Release info - Data quality" section on the "Artist" column', async ({ page }) => {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.click('button[data-label="Show all Relationships for Artist (complete)"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));
        expect(sections.map((s) => s.label)).not.toContain('Release info - Data quality');
    });
});
