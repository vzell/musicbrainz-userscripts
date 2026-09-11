'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: top-cd-stub's Title column folds MusicBrainz's own separate
// "Added N ago, last modified M ago" info row onto the preceding data row's
// Title cell as a `.comment` span (see startFetchingProcess()'s own
// pageType==='top-cd-stub' merge branch). The unique-values dropdown had no
// section decomposing that into its "Added"/"last modified" facets — only
// the generic flat comment:/entityComment kind existed, which cannot express
// two independent facets from one string, and doesn't even fire here since
// a `/cdstub/<hash>` href is never recognized as an entity ref.
const CDSTUB_URL = 'https://musicbrainz.org/cdstub/browse';
const FIXTURE_FILE = path.join(__dirname, 'top-cd-stub-title-age.html');

test('unique-values dropdown: top-cd-stub Title column gets Added/Modified sections', async ({ page }) => {
    await loadUserscriptPage(page, { url: CDSTUB_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${CDSTUB_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="Show all CD Stubs"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Title'));
    expect(sections).toBeTruthy();

    const addedSection = sections.find((s) => s.label === 'Title info - Added');
    const modifiedSection = sections.find((s) => s.label === 'Title info - Modified');
    expect(addedSection).toBeTruthy();
    expect(modifiedSection).toBeTruthy();

    const addedByLabel = Object.fromEntries(addedSection.items.map((i) => [i.label, i.count]));
    const modifiedByLabel = Object.fromEntries(modifiedSection.items.map((i) => [i.label, i.count]));

    expect(addedByLabel['» added: 9 years ago']).toBe(1);
    expect(addedByLabel['» added: 15 years ago']).toBe(1);
    expect(addedByLabel['» added: 17 years ago']).toBe(1);

    expect(modifiedByLabel['» modified: 9 years ago']).toBe(1);
    expect(modifiedByLabel['» modified: 15 years ago']).toBe(1);
    // Row C's Modified value (16) differs from its Added value (17) — the
    // two facets are independently tracked, not derived from one another.
    expect(modifiedByLabel['» modified: 16 years ago']).toBe(1);
    expect(modifiedByLabel['» modified: 17 years ago']).toBeUndefined();

    // Checking "9 years ago" under Added narrows to exactly Row A, and
    // highlights ONLY the Added half of that row's comment text — Row A's
    // Modified half reads the IDENTICAL "9 years ago" string, which is
    // exactly the case the lookaround-anchored highlight design exists for.
    const addedCheckbox = page.locator('.mb-col-uniq-item', { hasText: '» added: 9 years ago' }).first();
    await addedCheckbox.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const visibleTitles = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none' && !tr.cells[0]?.classList.contains('lastupdate'))
            .map((tr) => tr.cells[0]?.textContent.trim())
    );
    expect(visibleTitles.length).toBe(1);
    expect(visibleTitles[0]).toContain('Row A');

    const highlightCount = await page.evaluate(() =>
        document.querySelectorAll('table.tbl tbody .mb-column-filter-highlight').length);
    expect(highlightCount).toBe(1);
});
