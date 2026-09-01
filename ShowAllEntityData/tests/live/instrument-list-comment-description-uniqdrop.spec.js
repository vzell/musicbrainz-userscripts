'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// The "Family" sub-table (see debug/instruments.html) is small (16 rows) but
// mixes rows with/without a comment and with/without a description, and one
// row's description itself contains a nested <a> link (e.g. "bin" -> "rudra
// veena") — enough to exercise both facets plus the cross-tag highlight
// case. Real counts can drift as the instrument list is edited, hence the
// >0 assertions below rather than hardcoded exact numbers.
//
// This is a multi-table pageType (8 family sub-tables on one page) — every
// row/column query below is scoped to the "Family" table specifically
// (`th.closest('table')`), never the page-wide `table.tbl tbody tr`, or it
// would pick up unrelated rows from the other 7 sub-tables too.
const INSTRUMENTS_URL = 'https://musicbrainz.org/instruments';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Instruments"]';
const COLUMN = 'Family';

test('unique-values dropdown gets "Instrument info - Comment"/"- Description" sections on a sub-table\'s first column', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: INSTRUMENTS_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const sections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLUMN
    );
    expect(sections).toBeTruthy();

    const commentSection     = sections.find((s) => s.label === 'Instrument info - Comment');
    const descriptionSection = sections.find((s) => s.label === 'Instrument info - Description');
    expect(commentSection,     'expected an "Instrument info - Comment" section').toBeTruthy();
    expect(descriptionSection, 'expected an "Instrument info - Description" section').toBeTruthy();

    const commentByLabel     = Object.fromEntries(commentSection.items.map((i) => [i.label, i]));
    const descriptionByLabel = Object.fromEntries(descriptionSection.items.map((i) => [i.label, i]));
    expect(commentByLabel['💬 has comment']).toBeTruthy();
    expect(commentByLabel['💬 has comment'].count).toBeGreaterThan(0);
    expect(descriptionByLabel['📝 has description']).toBeTruthy();
    expect(descriptionByLabel['📝 has description'].count).toBeGreaterThan(0);

    // Every entry (both sections) must carry dataset.mbUniqSynLabel — the
    // quickfilter-visibility wiring the uniq-dropdown-section skill
    // documents.
    const datasetLabels = await page.evaluate(() => {
        const sectionEls = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .filter((s) => {
                const l = s.querySelector('.mb-uniq-section-label')?.textContent;
                return l === 'Instrument info - Comment' || l === 'Instrument info - Description';
            });
        return sectionEls.flatMap((s) => Array.from(s.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel));
    });
    expect(datasetLabels.length).toBe(commentSection.items.length + descriptionSection.items.length);
    expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);

    const totalBefore = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        return th.closest('table').tBodies[0].rows.length;
    }, COLUMN);

    // Checking "📝 has description" must narrow the FAMILY TABLE ONLY to
    // rows with description content, and highlight it — including across a
    // nested <a> link inside the description (e.g. "bin"'s description
    // links to "rudra veena") — the cross-tag case
    // _highlightInstrumentDescriptionMatch is specifically meant to handle.
    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Instrument info - Description');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '📝 has description');
        item.click();
    });
    await page.waitForFunction(({ colName, expected }) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const rows = Array.from(th.closest('table').tBodies[0].rows).filter((r) => r.style.display !== 'none');
        return rows.length > 0 && rows.length < expected;
    }, { colName: COLUMN, expected: totalBefore }, { timeout: 15000 });

    const descriptionCheck = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const idx = Array.from(th.parentElement.children).indexOf(th);
        const rows = Array.from(th.closest('table').tBodies[0].rows).filter((r) => r.style.display !== 'none');
        const allHighlighted = rows.every((r) => r.cells[idx]?.querySelector('.mb-column-filter-highlight'));
        // The dash separator itself must NOT be swallowed into the highlight
        // — only the description text after it.
        const dashNotHighlighted = rows.every((r) => {
            const html = r.cells[idx]?.innerHTML || '';
            return !/—<span class="mb-column-filter-highlight">/.test(html) &&
                   !/<span class="mb-column-filter-highlight">\s*—/.test(html);
        });
        // At least one row's highlight must span into a nested <a> (the
        // "rudra veena" link inside "bin"'s description) — confirms the
        // cross-tag walk, not just plain-text highlighting.
        const hasNestedLinkHighlight = rows.some((r) => !!r.cells[idx]?.querySelector('a .mb-column-filter-highlight, a.mb-column-filter-highlight'));
        return { allHighlighted, dashNotHighlighted, hasNestedLinkHighlight, rowCount: rows.length };
    }, COLUMN);
    expect(descriptionCheck.rowCount).toBeGreaterThan(0);
    expect(descriptionCheck.allHighlighted).toBe(true);
    expect(descriptionCheck.dashNotHighlighted).toBe(true);
    expect(descriptionCheck.hasNestedLinkHighlight).toBe(true);

    // Uncheck "📝 has description" (the dropdown stays open — see HELP.txt's
    // own "keeps the panel open" documentation), then check "💬 has comment"
    // instead — must narrow the FAMILY TABLE ONLY to rows whose cell carries
    // a direct-child span.comment, with that comment's text highlighted.
    await page.evaluate(() => {
        const dropEl = document.getElementById('mb-col-uniq-dropdown');
        const descSection = Array.from(dropEl.querySelectorAll('.mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Instrument info - Description');
        Array.from(descSection.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '📝 has description')
            .click(); // uncheck
        const commentSection = Array.from(dropEl.querySelectorAll('.mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Instrument info - Comment');
        Array.from(commentSection.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '💬 has comment')
            .click();
    });
    await page.waitForFunction(({ colName, expected }) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const rows = Array.from(th.closest('table').tBodies[0].rows).filter((r) => r.style.display !== 'none');
        return rows.length > 0 && rows.length < expected;
    }, { colName: COLUMN, expected: totalBefore }, { timeout: 15000 });

    const commentCheck = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const idx = Array.from(th.parentElement.children).indexOf(th);
        const rows = Array.from(th.closest('table').tBodies[0].rows).filter((r) => r.style.display !== 'none');
        const allMatch = rows.every((r) => {
            const cell = r.cells[idx];
            const commentSpan = cell?.querySelector(':scope > span.comment');
            const highlight = cell?.querySelector('span.comment .mb-column-filter-highlight');
            return !!commentSpan && !!highlight;
        });
        return { allMatch, rowCount: rows.length };
    }, COLUMN);
    expect(commentCheck.rowCount).toBeGreaterThan(0);
    expect(commentCheck.allMatch).toBe(true);

    expect(pageErrors).toEqual([]);
});
