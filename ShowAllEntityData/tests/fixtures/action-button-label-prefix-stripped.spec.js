'use strict';

// Regression for org/remove-showall.org TODO 1: every action button's
// *visible* text drops its "Show all "/"Show " prefix, while `data-label`
// (what ~100 other fixture specs use to click buttons, and what the tooltip
// `.includes('Show all')` check reads) keeps the original, untouched text.
// This pins the "display-only" guarantee precisely: a bug that stripped the
// prefix from `conf.label` itself (rather than only from what's painted)
// would still pass a naive "no 'Show all' on screen" check while silently
// breaking every `button[data-label="Show all …"]` selector in the suite.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const ISWC_URL = 'https://musicbrainz.org/iswc/T-070.127.339-3';
const ISWC_FIXTURE = path.join(__dirname, 'iswc.html');

const REPORT_URL = 'https://musicbrainz.org/report/PlacesWithoutCoordinates';
const REPORT_FIXTURE = path.join(__dirname, 'places-without-coordinates.html');

/**
 * Reads every h1 action button's rendered text, title and `data-label`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{text: string, title: string, dataLabel: string}[]>}
 */
const actionButtons = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('#mb-show-all-controls-container button[data-label]')).map((btn) => ({
        text: btn.textContent.trim(),
        title: btn.title,
        dataLabel: btn.dataset.label,
    })));

test.describe('action-button labels: generic "Show all "/"Show " prefix stripped from display only', () => {
    test('iswc: "Show all Works" renders as "Works", but data-label keeps the original text', async ({ page }) => {
        await loadUserscriptPage(page, { url: ISWC_URL, fixtureFile: ISWC_FIXTURE, testMode: true });

        const buttons = await actionButtons(page);
        expect(buttons).toHaveLength(1);
        expect(buttons[0].text).toBe('🧮¹ Works');
        expect(buttons[0].dataLabel).toBe('Show all Works');
        // The tooltip still keys off the untouched conf.label, so it survives.
        expect(buttons[0].title).toContain('Fetch all the table data');
    });

    test('report-detail: the two report buttons read "Unfiltered" / "Subscribed Only" and keep a tooltip', async ({ page }) => {
        await loadUserscriptPage(page, { url: REPORT_URL, fixtureFile: REPORT_FIXTURE, testMode: true });

        const buttons = await actionButtons(page);
        expect(buttons).toHaveLength(2);
        expect(buttons[0].text).toBe('🧮¹ Unfiltered');
        expect(buttons[0].dataLabel).toBe('Unfiltered');
        expect(buttons[0].title).toContain('Fetch all the table data');
        expect(buttons[1].text).toBe('🧮² Subscribed Only');
        expect(buttons[1].dataLabel).toBe('Subscribed Only');
        expect(buttons[1].title).toContain('Fetch all the table data');
    });
});
