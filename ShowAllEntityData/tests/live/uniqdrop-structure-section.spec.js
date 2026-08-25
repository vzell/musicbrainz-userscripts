'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// Bruce Springsteen — a prolific, stable-catalogue artist MBID already used
// elsewhere in this repo (tasks/task-playwright-html-snapshot-harness.md's
// artist-releasegroups pilot). His /works listing (1588 works at the time
// this test was written) reliably produces a genuine mix of empty /
// single-row / multi-row "Lyrics languages" cells — real counts drift
// slightly as MusicBrainz data is edited, hence the >0 assertions below
// rather than hardcoded exact numbers.
const WORKS_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Works for Artist"]';

// "Lyrics languages" — one of artist-works' six declared collapsableColumns
// (see ShowAllEntityData.user.js's artist-works pageDefinitions entry) — was
// chosen over the more obvious "Authors" column because on this artist it's
// the only one that naturally produces cells in every one of the three
// PASSIVE structure states (empty / single-row / multi-row) at once;
// "Authors" here has zero empty cells (every work lists Springsteen himself
// as an author).
//
// The fourth state ("expanded") never occurs on a fresh page load by
// design — expandedCells starts empty on every fetch (see
// initCollapsableColumns()'s own JSDoc) — so this test manually expands one
// multi-row cell before opening the dropdown, exercising the same action a
// real person would take.
const COLLAPSIBLE_COLUMN = 'Lyrics languages';

test('unique-values dropdown "Structure" section reflects all four cell-structure states', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: WORKS_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();

    // artist-works is tableMode: 'single' (no <h3> sub-tables), so
    // assertGroupedRenderCompleted()'s per-group row-count check doesn't
    // apply here — #mb-filter-container becoming visible is the render-
    // complete signal both table modes share.
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    // initCollapsableColumns() processes all six collapsable columns across
    // ~1600 rows; "Lyrics languages" is 5th of 6, so give it real time to
    // get there and build that column's per-cell toggles before trying to
    // click one.
    await page.waitForFunction((colName) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((t) => strip(t.textContent) === colName);
        if (idx === -1) return false;
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .some((row) => row.cells[idx] && row.cells[idx].querySelector('.mb-cell-collapse-toggle'));
    }, COLLAPSIBLE_COLUMN, { timeout: 60000 });

    // Manually expand exactly one multi-row cell, the same way a real user
    // would, so the dropdown's Structure section has a non-zero "expanded"
    // count to report (see COLLAPSIBLE_COLUMN's own comment above).
    const expandedOne = await page.evaluate((colName) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        const idx = Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((t) => strip(t.textContent) === colName);
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        for (const row of rows) {
            const toggle = row.cells[idx] && row.cells[idx].querySelector('.mb-cell-collapse-toggle');
            if (toggle) { toggle.click(); return true; }
        }
        return false;
    }, COLLAPSIBLE_COLUMN);
    expect(expandedOne).toBe(true);

    const sections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLLAPSIBLE_COLUMN
    );

    const structure = sections.find((s) => s.label === 'Structure');
    expect(structure).toBeTruthy();

    const byLabel = Object.fromEntries(structure.items.map((i) => [i.label, i]));
    expect(byLabel['○ empty cells'].count).toBeGreaterThan(0);
    expect(byLabel['• single-row cells'].count).toBeGreaterThan(0);
    expect(byLabel['▶ collapsed multi-row cells'].count).toBeGreaterThan(0);
    expect(byLabel['◀ expanded multi-row cells'].count).toBe(1);
    expect(byLabel['▶◀ any multi-row cells'].count).toBe(
        byLabel['▶ collapsed multi-row cells'].count + byLabel['◀ expanded multi-row cells'].count
    );

    // Every entry must carry dataset.mbUniqSynLabel — the quickfilter-
    // visibility wiring the uniq-dropdown-section skill documents. Read
    // straight from the DOM (scoped to the Structure section specifically),
    // not through the __saTest summary — a wiring gap here is invisible to
    // the summary but breaks quickfilter in practice.
    const datasetLabels = await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Structure');
        if (!sectionEl) return null;
        return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel);
    });
    expect(datasetLabels).toHaveLength(structure.items.length);
    expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);

    // Reopening the panel must reproduce an identical section/entry list —
    // guards the "self-corrupting on second filter pass" failure mode the
    // uniq-dropdown-section skill documents.
    await page.evaluate(() => window.__saTest.closeUniqDrop());
    const reopenedSections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLLAPSIBLE_COLUMN
    );
    expect(reopenedSections).toEqual(sections);

    expect(pageErrors).toEqual([]);
});
