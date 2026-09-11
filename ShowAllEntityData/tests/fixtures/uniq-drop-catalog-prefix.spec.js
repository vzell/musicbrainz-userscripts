'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: the "Catalog info - Prefix" unique-values dropdown section
// (releasegroup-releases' "Catalog#" column) already existed and was fully
// wired, but _findCellCatalogParts()'s old `/^(?:(.+?)\s+)?(\d+)$/` grammar
// required the ENTIRE trailing portion to be pure digits with WHITESPACE
// separation — silently dropping the prefix for any real-world catalog
// number ending in embedded punctuation with no space ("SOPL-248"), or
// separated by a bare hyphen/dot/slash instead of whitespace ("40-32210",
// "138.645"), or with no separator at all between letters and digits
// ("CDCBS65480"). This is the regression test for the fix (first-digit-index
// split), plus the mid-task token-split requirement: a multi-word prefix
// like "CBS S" must surface "CBS" and "S" as two INDEPENDENT dropdown
// entries, since a short token like "S" (historically, though never
// universally, a stereo/mono marker) recurs across unrelated labels.
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000001';
const FIXTURE_FILE = path.join(__dirname, 'releasegroup-releases-catalog-prefix.html');

test('unique-values dropdown: "Catalog#" prefix section handles real-world separators and splits multi-word prefixes into tokens', async ({ page }) => {
    await loadUserscriptPage(page, { url: RG_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Catalog#'));
    expect(sections).toBeTruthy();

    const prefixSection = sections.find((s) => s.label === 'Catalog info - Prefix');
    expect(prefixSection).toBeTruthy();
    const byLabel = Object.fromEntries(prefixSection.items.map((i) => [i.label, i.count]));

    // "CBS S 65480" splits into two independent tokens.
    expect(byLabel['» prefix: CBS']).toBe(1);
    expect(byLabel['» prefix: S']).toBe(1);
    // No combined "CBS S" entry — only the decomposed tokens.
    expect(byLabel['» prefix: CBS S']).toBeUndefined();
    // Dash-joined with no space — previously silently dropped.
    expect(byLabel['» prefix: SOPL-']).toBe(1);
    // Letters with no separator at all — previously silently dropped.
    expect(byLabel['» prefix: CDCBS']).toBe(1);
    // Leading-digit numbers (with embedded "-"/"." punctuation) have NO
    // letter prefix at all — must not appear as spurious prefix entries.
    expect(byLabel['» prefix: 40']).toBeUndefined();
    expect(byLabel['» prefix: 138']).toBeUndefined();

    // The three presence flags (Catalog info - Presence) are unaffected by
    // the fix: "40-32210"/"138.645" still count as "no catalog prefix" (a
    // bare number), and "[none]" still counts as its own dedicated flag,
    // never as "no catalog prefix".
    const presenceSection = sections.find((s) => s.label === 'Catalog info - Presence');
    expect(presenceSection).toBeTruthy();
    const presenceByLabel = Object.fromEntries(presenceSection.items.map((i) => [i.label, i.count]));
    expect(presenceByLabel['🏷️ has catalog prefix']).toBe(3); // CBS S, SOPL-, CDCBS rows
    expect(presenceByLabel['🔢 no catalog prefix']).toBe(2);  // 40-32210, 138.645
    expect(presenceByLabel['🚫 no catalog number']).toBe(1);  // [none]

    // Checking the "S" token alone highlights only the standalone "S" in
    // "CBS S 65480" — it must NOT also fire on "CDCBS", which contains the
    // letter "S" but not as its own separate prefix token.
    const sTokenCheckbox = page.locator('.mb-col-uniq-item', { hasText: '» prefix: S' }).first();
    await sTokenCheckbox.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const visibleTitles = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none' && !tr.classList.contains('subh'))
            .map((tr) => tr.cells[0]?.textContent.trim())
    );
    // Release-column decoration (e.g. a per-row expand toggle glyph) may
    // prefix the visible text — the row identity, not exact formatting, is
    // what this assertion cares about.
    expect(visibleTitles.length).toBe(1);
    expect(visibleTitles[0]).toContain('CBS S Release');

    const highlighted = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody .mb-column-filter-highlight')).map((el) => el.textContent)
    );
    expect(highlighted).toEqual(['S']);

    // The generic explanatory tooltip is present on every prefix entry,
    // including a single-token one — never a per-prefix specific claim.
    const tooltip = await sTokenCheckbox.getAttribute('title');
    expect(tooltip).toContain('never standardized across labels');
    expect(tooltip).toContain('not a universal standard');
});
