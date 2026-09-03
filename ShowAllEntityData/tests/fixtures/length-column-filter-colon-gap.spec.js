'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForFilterSettled, getPageRowCount, getColumnHighlightTexts } = require('../support/filterSortAssertions');

// Same fixture as uniq-drop-length-bucket.spec.js (5 rows spanning several
// "M:SS[.mmm]"/"?:??" Length shapes) — reused here for a DIFFERENT bug:
// applyIntegerColumnStyling()'s split-align ':' technique renders "5:05.146"
// as three sibling spans (.mb-ic-left "5" / .mb-ic-sep ":" / .mb-ic-right
// "05.146"). getCleanColumnText()/highlightCrossTag() used to insert their
// own unconditional single-space join-gap between every separately-collected
// text node, so this cell's filter/highlight text actually read "5 : 05.146"
// — a manually-typed column filter like "5:0" (the way a person actually
// types a duration, no spaces) never matched at all, even though the row
// visibly shows "5:05". Fixed by collapsing `.mb-ic-wrap` into one opaque
// text node in getCleanColumnText() and suppressing the equivalent virtual
// gap in highlightCrossTag() for text nodes sharing one `.mb-ic-wrap`
// ancestor.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-length-bucket.html');
const FILTER_COLUMN = 'Length';

test('typing "5:0" into the "Length" column filter matches "5:05.146" (not defeated by the split-align cell\'s own internal spans)', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="⊚ All recordings"]');
    await page.waitForSelector('#mb-filter-container');

    const before = await getPageRowCount(page);
    expect(before.filtered).toBe(5);

    const colIdx = await page.evaluate((colName) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        return Array.from(document.querySelectorAll('table.tbl thead th')).findIndex((t) => strip(t.textContent) === colName);
    }, FILTER_COLUMN);
    expect(colIdx).toBeGreaterThanOrEqual(0);

    // Column filter inputs are readonly-until-a-genuine-trusted-interaction
    // (anti-autofill hardening) — .click() lifts that, and typing must go
    // through .pressSequentially() (real per-key events), never .fill()
    // (see filter-column.spec.js's own identical comment).
    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially('5:0'));

    // Only "5:05.146" (Track C) contains the literal substring "5:0" —
    // "5:50" (Track D) does not ("5:5" then "50", never "5:0").
    const after = await getPageRowCount(page);
    expect(after.filtered).toBe(1);

    const visibleTitle = await page.locator('table.tbl tbody tr:not([style*="display: none"]) td:first-child').first().textContent();
    expect(visibleTitle.trim()).toContain('Track C');

    // The matched text is actually highlighted too, not just used for the
    // row-count narrowing — confirms highlightCrossTag()'s own gap fix.
    const highlights = await getColumnHighlightTexts(page, colIdx);
    expect(highlights.join('')).toBe('5:0');
});

test('typing "5:0" into the GLOBAL filter also matches "5:05.146" (getCleanVisibleText() shares the same gap bug/fix)', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="⊚ All recordings"]');
    await page.waitForSelector('#mb-filter-container');

    const before = await getPageRowCount(page);
    expect(before.filtered).toBe(5);

    const globalInput = page.locator('#mb-global-filter-input');
    await globalInput.click();
    await waitForFilterSettled(page, () => globalInput.pressSequentially('5:0'));

    const after = await getPageRowCount(page);
    expect(after.filtered).toBe(1);

    const visibleTitle = await page.locator('table.tbl tbody tr:not([style*="display: none"]) td:first-child').first().textContent();
    expect(visibleTitle.trim()).toContain('Track C');
});
