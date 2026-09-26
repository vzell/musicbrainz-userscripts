'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: a slash-joined work-attribute identifier TYPE ("BUMA/STEMRA ID")
// is offered in "Attributes - Identifier type" as the compound AND as each
// part ("BUMA", "STEMRA ID") — see _workAttrTypeLabels(). The compound
// stays; the parts are additional. Fixture: uniq-drop-work-attr-slash-types.html.
const ARTIST_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-work-attr-slash-types.html');
const SECTION = 'Attributes - Identifier type';

/** Loads the fixture page and runs "Show all". */
async function loadAndRender(page) {
    await loadUserscriptPage(page, { url: ARTIST_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Works for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Clicks one entry of the identifier-type section by its dataset label. */
async function clickEntry(page, entryLabel) {
    await page.evaluate(({ sectionLabel, entryLabel }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === entryLabel).click();
    }, { sectionLabel: SECTION, entryLabel });
}

/** Titles (Work column, from the link) of the rows currently shown, sorted. */
async function visibleWorks(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.querySelector('a[href^="/work/"] bdi').textContent.trim())
            .sort());
}

test.describe('unique-values dropdown: slash-joined work-attribute identifier types', () => {
    test('offers the compound AND each part, with matching counts', async ({ page }) => {
        await loadAndRender(page);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Attributes'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();
        const byLabel = Object.fromEntries(section.items.map((i) => [i.label, i.count]));

        expect(byLabel['» identifier: BUMA/STEMRA ID']).toBe(2);   // the compound stays
        expect(byLabel['» identifier: BUMA']).toBe(2);             // parts are ADDED
        expect(byLabel['» identifier: STEMRA ID']).toBe(2);
        // Unrelated types are untouched. "Decoy" carries the VALUE "BUMA"
        // under an ACAM ID badge, which must not count towards BUMA.
        expect(byLabel['» identifier: ACAM ID']).toBe(2);
        expect(byLabel['» identifier: SUISA ID']).toBe(1);
        // No invented "BUMA ID".
        expect(byLabel['» identifier: BUMA ID']).toBeUndefined();
    });

    for (const label of ['» identifier: BUMA/STEMRA ID', '» identifier: BUMA', '» identifier: STEMRA ID']) {
        test(`ticking "${label}" filters to the two BUMA/STEMRA rows`, async ({ page }) => {
            await loadAndRender(page);
            await page.evaluate(() => window.__saTest.getUniqDropSections('Attributes'));
            await clickEntry(page, label);
            await page.waitForFunction(() =>
                Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < 4,
                null, { timeout: 15000 });
            // The badge count and the rows agree: 2 and 2, and never "Decoy".
            expect(await visibleWorks(page)).toEqual(['Dutch One', 'Dutch Two']);
        });
    }

    test('the "BUMA" part highlights only inside the parenthesized type name, never in a badge value', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Attributes'));
        await clickEntry(page, '» identifier: BUMA');
        await page.waitForFunction(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < 4,
            null, { timeout: 15000 });

        const marks = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((tr) => tr.style.display !== 'none')
                .map((tr) => [
                    tr.querySelector('a[href^="/work/"] bdi').textContent.trim(),
                    Array.from(tr.querySelectorAll('li.work-attribute .mb-column-filter-highlight'))
                        .map((s) => ({ text: s.textContent, afterParen: (s.previousSibling?.textContent || '').endsWith('(') })),
                ])
                .sort((a, b) => a[0].localeCompare(b[0])));

        // Exactly one mark per row, reading "BUMA", directly after the "(".
        // "Dutch Two"'s badge VALUE "BUMA-77" is the trap: a regex without
        // the lookarounds would mark that too.
        expect(marks).toEqual([
            ['Dutch One', [{ text: 'BUMA', afterParen: true }]],
            ['Dutch Two', [{ text: 'BUMA', afterParen: true }]],
        ]);
    });

    test('a dropdown reopen after ticking still offers the parts (extractor reads through its own highlight)', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Attributes'));
        await clickEntry(page, '» identifier: STEMRA ID');
        await page.waitForFunction(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < 4,
            null, { timeout: 15000 });
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Attributes'));
        const labels = sections.find((s) => s.label === SECTION).items.map((i) => i.label);
        expect(labels).toEqual(expect.arrayContaining([
            '» identifier: BUMA/STEMRA ID', '» identifier: BUMA', '» identifier: STEMRA ID']));
    });
});
