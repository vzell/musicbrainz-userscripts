'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Regression coverage for: the uniq-dropdown's OWN quickfilter box
// (.mb-uniq-qf-input) highlighted only the FIRST occurrence of the typed
// substring inside an entry's label, via indexOf() instead of a global scan
// — unlike the main table's global/column filter highlighting
// (highlightText()/highlightCrossTag()), which highlights every occurrence.
// Three independent call sites shared the identical indexOf()-only bug:
// _applySynBoxQuickFilter() (synthetic entries), renderItems()'s plain-value
// branch, and renderItems()'s flag-icon (flagSegments) branch. All three now
// share one helper, _appendAllMatchesHighlighted().

// --- Case 1 + 2: user-ratings-multigroup fixture is a REAL captured
// snapshot of the reported page (/user/vzell/ratings). Its "Event ratings"
// group's one row carries exactly the reported example: the event's
// `<span class="comment">` holds a `<i title="Primary alias">Southside
// Johnny & The Asbury Jukes at The Stone Pony</i>` — typing "as" used to
// highlight only the "as" inside "alias" (in the synthetic label's own "»
// alias:" prefix), never the "As" inside "Asbury".
const RATINGS_URL = 'https://musicbrainz.org/user/vzell/ratings';
const RATINGS_FIXTURE = path.join(__dirname, 'user-ratings-multigroup.html');

const openRatings = async (page) => {
    await loadUserscriptPage(page, {
        url: RATINGS_URL, fixtureFile: RATINGS_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: true },
    });
    await page.click('button[data-label="Show Ratings for User"]');
    await page.waitForSelector('#mb-filter-container');
};

/** Expands a collapsed h3 sub-section by clicking its heading. */
async function expandSection(page, headingText) {
    await page.locator('h3', { hasText: headingText }).first().click();
    await page.waitForTimeout(50);
}

// --- Case 3: artist-events fixture's "Location" column mixes a flag icon
// into a plain whole-cell value ("Test Arena in Test City, Spain" + a
// Spain flag) — its own text segment ("Test Arena in Test City, ") repeats
// "Test" twice, exercising renderItems()'s flagSegments branch.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const AREA_FLAG_FIXTURE = path.join(__dirname, 'uniq-drop-area-name-flag-position.html');

test.describe('unique-values dropdown: quickfilter highlights every occurrence, not just the first', () => {
    test('synthetic entry label ("» alias: … Asbury …")', async ({ page }) => {
        await openRatings(page);
        await expandSection(page, 'Event ratings');
        await page.evaluate(() => window.__saTest.getUniqDropSections('Event'));

        await page.fill('#mb-col-uniq-dropdown .mb-uniq-qf-input', 'as');

        const marks = await page.evaluate(() => {
            const item = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section .mb-col-uniq-item'))
                .find((el) => (el.dataset.mbUniqSynLabel || '').includes('Southside Johnny & The Asbury Jukes at The Stone Pony'));
            return item ? Array.from(item.querySelectorAll('.mb-uniq-syn-label-text mark')).map((m) => m.textContent) : null;
        });

        // "as" inside "alias" (the synthetic "» alias:" prefix) AND "As"
        // inside "Asbury" — the exact reported gap.
        expect(marks).toEqual(['as', 'As']);
    });

    test('plain unique-value list entry', async ({ page }) => {
        await openRatings(page);
        await expandSection(page, 'Event ratings');
        await page.evaluate(() => window.__saTest.getUniqDropSections('Event'));

        // Find (before filtering) a plain-value entry whose own raw text
        // (item.title, set to displayText — see renderItems()'s JSDoc)
        // contains 2+ case-insensitive occurrences of "as", and compute the
        // true count ourselves rather than hardcoding fixture content.
        const before = await page.evaluate(() => {
            const countOccurrences = (haystack, needle) => {
                let count = 0, pos = 0, idx;
                while ((idx = haystack.indexOf(needle, pos)) !== -1) { count++; pos = idx + needle.length; }
                return count;
            };
            const items = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown [role="listbox"] .mb-col-uniq-item'));
            for (const item of items) {
                const text = item.title || '';
                const count = countOccurrences(text.toLowerCase(), 'as');
                if (count >= 2) return { title: text, expectedCount: count };
            }
            return null;
        });
        expect(before).not.toBeNull();

        await page.fill('#mb-col-uniq-dropdown .mb-uniq-qf-input', 'as');

        const markCount = await page.evaluate((title) => {
            const items = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown [role="listbox"] .mb-col-uniq-item'));
            const item = items.find((el) => el.title === title);
            return item ? item.querySelectorAll('mark').length : null;
        }, before.title);

        expect(markCount).toBe(before.expectedCount);
        expect(markCount).toBeGreaterThanOrEqual(2);
    });

    test('flag-icon (flagSegments) list entry — every occurrence within one text segment', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: AREA_FLAG_FIXTURE, testMode: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        await page.evaluate(() => window.__saTest.getUniqDropSections('Location'));
        await page.fill('#mb-col-uniq-dropdown .mb-uniq-qf-input', 'test');

        const marks = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown [role="listbox"] .mb-col-uniq-item'));
            const item = items.find((el) => (el.title || '').toLowerCase().includes('test arena'));
            return item ? Array.from(item.querySelectorAll('mark')).map((m) => m.textContent) : null;
        });

        // "Test Arena in Test City, " — both occurrences of "Test" live in
        // the SAME text segment (before the flag icon), so this does not
        // exercise the still-documented icon-straddling limitation.
        expect(marks).toEqual(['Test', 'Test']);
    });
});
