'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { collectPageErrors } = require('../support/liveAssertions');

// This artist's alias table (see debug/artist-aliases.html) mixes primary
// and non-primary locales, distinct languages, and alias Types with no
// Locale at all (e.g. "Search hint") — enough variety to exercise both the
// "Locale info - Language" and "Locale info - Primary" sections. Real counts
// can drift as aliases are added/edited, hence the >0 assertions below
// rather than hardcoded exact numbers.
const ARTIST_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/aliases';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Aliases for Artist"]';
const COLUMN = 'Locale';

test('unique-values dropdown gets a "Locale info" section (Language / Primary)', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await loadUserscriptPage(page, { url: ARTIST_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const sections = await page.evaluate(
        (colName) => window.__saTest.getUniqDropSections(colName),
        COLUMN
    );
    expect(sections).toBeTruthy();

    const languageSection = sections.find((s) => s.label === 'Locale info - Language');
    const primarySection  = sections.find((s) => s.label === 'Locale info - Primary');
    expect(languageSection, 'expected a "Locale info - Language" section').toBeTruthy();
    expect(primarySection,  'expected a "Locale info - Primary" section').toBeTruthy();

    // At least one distinct language value, each with a real count.
    expect(languageSection.items.length).toBeGreaterThan(0);
    for (const item of languageSection.items) {
        expect(item.label.startsWith('» language: ')).toBe(true);
        expect(item.count).toBeGreaterThan(0);
    }

    // Fixed 2-value flag pair.
    const byLabel = Object.fromEntries(primarySection.items.map((i) => [i.label, i]));
    expect(byLabel['🥇 primary']).toBeTruthy();
    expect(byLabel['🥇 primary'].count).toBeGreaterThan(0);

    // Every entry (both sections) must carry dataset.mbUniqSynLabel — the
    // quickfilter-visibility wiring the uniq-dropdown-section skill
    // documents.
    const datasetLabels = await page.evaluate(() => {
        const sectionEls = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .filter((s) => {
                const l = s.querySelector('.mb-uniq-section-label')?.textContent;
                return l === 'Locale info - Language' || l === 'Locale info - Primary';
            });
        return sectionEls.flatMap((s) => Array.from(s.querySelectorAll('.mb-col-uniq-item')).map((item) => item.dataset.mbUniqSynLabel));
    });
    expect(datasetLabels.length).toBe(languageSection.items.length + primarySection.items.length);
    expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);

    // Checking "🥇 primary" must narrow the table to only rows whose own
    // "Locale" cell carries MusicBrainz's own `(primary)` marker, and every
    // surviving row's Locale text must end with "(primary)".
    const totalBefore = await page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);

    await page.evaluate(() => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === 'Locale info - Primary');
        const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === '🥇 primary');
        item.click();
    });
    await page.waitForFunction((expected) => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
        return rows.length > 0 && rows.length < expected;
    }, totalBefore, { timeout: 15000 });

    const afterCheckAllPrimary = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const idx = Array.from(th.parentElement.children).indexOf(th);
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
        return rows.every((r) => /\(primary\)\s*$/.test(r.cells[idx]?.textContent.trim() || ''));
    }, COLUMN);
    expect(afterCheckAllPrimary).toBe(true);

    // The "primary" marker's own text must be wrapped in a
    // .mb-column-filter-highlight span (_highlightLocalePrimaryMatch) on
    // every surviving row's "Locale" cell — not just a row-count narrow with
    // no visual highlight.
    const allHighlighted = await page.evaluate((colName) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === colName);
        const idx = Array.from(th.parentElement.children).indexOf(th);
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none');
        return rows.every((r) => {
            const span = r.cells[idx]?.querySelector('span.comment .mb-column-filter-highlight, span.comment.mb-column-filter-highlight');
            return !!span && /primary/i.test(span.textContent);
        });
    }, COLUMN);
    expect(allHighlighted).toBe(true);

    expect(pageErrors).toEqual([]);
});
