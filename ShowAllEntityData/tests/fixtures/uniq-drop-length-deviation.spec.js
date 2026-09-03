'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Same page type/header shape uniq-drop-length-bucket.spec.js uses
// (artist-recordings) so pageType detection + headerContainer resolve, plus
// one added native "Attributes" column (see the fixture's own comment for
// why its shape mirrors debug/work-rec.html's REAL confirmed content).
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-length-deviation.html');

test.describe('unique-values dropdown: "Length info - Deviation" bucket section', () => {
    test('buckets 9 known-length rows into 7 signed deviation ranges, live-recording-aware', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // Row J ("cover and live", 700s) is excluded from the reference
        // average (which stays exactly 200s, computed from rows A-H only)
        // but is still bucketed against it — landing in the same
        // "50%+ longer" bucket as Row G.
        const averages = await page.evaluate(() => window.__saTest.getLengthColumnAverages('table.tbl'));
        expect(averages).toEqual({
            ready: true,
            referenceAvgSeconds: 200,
            studioAvgSeconds: 200,
            liveAvgSeconds: 700,
            hasLiveCol: true,
            knownCount: 9,
            studioKnownCount: 8,
            liveKnownCount: 1,
        });

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const section = sections.find((s) => s.label === 'Length info - Deviation');
        expect(section).toBeTruthy();

        const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i]));
        expect(byLabel['🎯 within 10% of average'].count).toBe(2);
        expect(byLabel['🔽 10–25% shorter than average'].count).toBe(1);
        expect(byLabel['🔼 10–25% longer than average'].count).toBe(1);
        expect(byLabel['⏬ 25–50% shorter than average'].count).toBe(1);
        expect(byLabel['⏫ 25–50% longer than average'].count).toBe(1);
        expect(byLabel['⬇️ 50%+ shorter than average'].count).toBe(1);
        // Row G (320s, +60%) AND Row J (700s, +250%, live) share this bucket —
        // proves J is bucketed against the studio average without having
        // been counted INTO it.
        expect(byLabel['⬆️ 50%+ longer than average'].count).toBe(2);
        expect(section.items).toHaveLength(7);

        // Every entry must carry dataset.mbUniqSynLabel — the quickfilter-
        // visibility wiring the uniq-dropdown-section skill documents.
        const datasetLabels = await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Length info - Deviation');
            return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel);
        });
        expect(datasetLabels).toHaveLength(7);
        expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    });

    test('checking "10–25% longer than average" narrows to Track C only, with its Length cell highlighted', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);
        expect(totalBefore).toBe(10);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Length info - Deviation');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '🔼 10–25% longer than average');
            item.click();
        });

        await page.waitForFunction((expected) => {
            const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
            return rows.length > 0 && rows.length < expected;
        }, totalBefore, { timeout: 15000 });

        const visibleRows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .map((r) => r.cells[0].textContent.trim())
        );
        expect(visibleRows).toEqual(['Track C']);

        const highlightedRowCount = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none' && r.querySelector('.mb-column-filter-highlight'))
                .length
        );
        expect(highlightedRowCount).toBe(1);
    });

    test('checking "50%+ longer than average" narrows to both Track G and the live Track J', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);

        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await page.evaluate(() => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Length info - Deviation');
            const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
                .find((el) => el.dataset.mbUniqSynLabel === '⬆️ 50%+ longer than average');
            item.click();
        });

        await page.waitForFunction((expected) => {
            const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
            return rows.length > 0 && rows.length < expected;
        }, totalBefore, { timeout: 15000 });

        const visibleRows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((r) => r.style.display !== 'none')
                .map((r) => r.cells[0].textContent.trim())
        );
        expect(visibleRows.sort()).toEqual(['Track G', 'Track J']);
    });

    test('setting off: no "Length info - Deviation" section renders, and the averages are not computed', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: ARTIST_RECORDINGS_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_length_deviation_section: false },
        });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const section = sections.find((s) => s.label === 'Length info - Deviation');
        expect(section).toBeUndefined();

        const averages = await page.evaluate(() => window.__saTest.getLengthColumnAverages('table.tbl'));
        expect(averages.ready).toBe(false);
        expect(averages.referenceAvgSeconds).toBeNull();
    });

    test('renaming the live-flag column WITHOUT an override loses live-detection (proves the default "Attributes" name is load-bearing)', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // Rename the fixture's own "Attributes" column (via its
        // dataset.colName, which _getLengthColumnAverages()'s own header-
        // name resolution prefers over textContent) to something else,
        // with no override set — the live row must now be counted as
        // "studio" (no live column recognized at all).
        await page.evaluate(() => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => (t.dataset.colName || t.textContent.trim()) === 'Attributes');
            th.dataset.colName = 'Recording attributes';
        });

        // _getLengthColumnAverages() is self-memoized per table (via
        // _visibleRowSetSignature); this is its first-ever call on this
        // table/render, so there's no stale-cache concern here.
        const averages = await page.evaluate(() => window.__saTest.getLengthColumnAverages('table.tbl'));
        expect(averages.hasLiveCol).toBe(false);
        expect(averages.liveKnownCount).toBe(0);
        expect(averages.studioKnownCount).toBe(9);
    });

    test('per-pageType override: a differently-named live-flag column is honored via features.lengthDeviationLiveColumn', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        await page.evaluate(() => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th'))
                .find((t) => (t.dataset.colName || t.textContent.trim()) === 'Attributes');
            th.dataset.colName = 'Recording attributes';
        });

        // Set the override BEFORE the first-ever getLengthColumnAverages()
        // call on this table, so there's no stale-cache concern — the
        // live row must be excluded from the reference average, exactly
        // like the default-"Attributes" case.
        const averages = await page.evaluate(() => {
            window.__saTest.setLengthDeviationLiveColumnOverride('Recording attributes');
            return window.__saTest.getLengthColumnAverages('table.tbl');
        });
        expect(averages.hasLiveCol).toBe(true);
        expect(averages.studioKnownCount).toBe(8);
        expect(averages.liveKnownCount).toBe(1);
        expect(averages.referenceAvgSeconds).toBe(200);
        expect(averages.liveAvgSeconds).toBe(700);
    });
});
