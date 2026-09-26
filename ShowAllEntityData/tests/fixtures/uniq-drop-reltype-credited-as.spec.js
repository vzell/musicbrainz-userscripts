'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: "Relationship types - Credited as" — the `(as “credit”)` part of a
// "Relationship types" list item as its own dropdown family, prefixed with the
// relationship type ("» instrument as: lead guitar"). One static section
// serves every relationship type on the page. Fixture:
// uniq-drop-reltype-credited-as.html (each hazard in one row; see its comment).
const URL_ = 'https://musicbrainz.org/instrument/63021302-86cd-4aee-80df-2270d54f4978/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-reltype-credited-as.html');
const SECTION = 'Relationship types - Credited as';
const TOTAL = 5;

/** Loads the fixture page and runs "Show all". */
async function loadAndRender(page) {
    await loadUserscriptPage(page, { url: URL_, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Recordings for Instrument"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Clicks one entry of the section by its dataset label. */
async function clickEntry(page, entryLabel) {
    await page.evaluate(({ sectionLabel, entryLabel }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === entryLabel).click();
    }, { sectionLabel: SECTION, entryLabel });
}

/** Names of the rows currently shown, sorted. */
async function visibleNames(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.querySelector('a[href^="/recording/"] bdi').textContent.trim())
            .sort());
}

/** Per shown row: its name and every highlight in the Relationship types cell. */
async function marksByRow(page) {
    return page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const idx = ths.findIndex((t) => t.dataset.colName === 'Relationship types');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => [
                tr.querySelector('a[href^="/recording/"] bdi').textContent.trim(),
                Array.from(tr.cells[idx].querySelectorAll('.mb-column-filter-highlight'))
                    .map((s) => ({ text: s.textContent, afterQuote: /[“"]$/.test(s.previousSibling?.textContent || '') })),
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));
    });
}

const waitForNarrowed = (page) => page.waitForFunction((n) =>
    Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < n,
    TOTAL, { timeout: 15000 });

test.describe('unique-values dropdown: "Relationship types - Credited as" section', () => {
    test('lists each (as “credit”) once, prefixed with its type; a comma inside a credit stays one entry', async ({ page }) => {
        await loadAndRender(page);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Relationship types'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();

        expect(section.items.map((i) => [i.label, i.count])).toEqual([
            ['» guitar as: guitar', 1],
            ['» instrument as: acoustic, electric guitar', 1],   // ONE entry, not two
            ['» instrument as: lead guitar', 2],                 // Rec A + Rec B
            ['» vocal as: lead guitar', 1],                      // same credit, other type: separate
        ]);
        // A plain "instrument" (Rec C) has no credit and adds no entry here.
        expect(section.items.some((i) => i.label === '» instrument as: ')).toBe(false);

        const datasetLabels = await page.evaluate((label) => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === label);
            return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((i) => i.dataset.mbUniqSynLabel);
        }, SECTION);
        expect(datasetLabels).toHaveLength(4);
        expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    });

    test('ticking "instrument as: lead guitar" shows Rec A and Rec B only (not the vocal one) and marks just the credit', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Relationship types'));
        await clickEntry(page, '» instrument as: lead guitar');
        await waitForNarrowed(page);

        expect(await visibleNames(page)).toEqual(['Rec A', 'Rec B']);
        // One mark per row, reading "lead guitar", straight after the opening quote.
        // Rec A's matching item is a collapsed (hidden) list item — still found.
        expect(await marksByRow(page)).toEqual([
            ['Rec A', [{ text: 'lead guitar', afterQuote: true }]],
            ['Rec B', [{ text: 'lead guitar', afterQuote: true }]],
        ]);
    });

    test('a credit containing a comma is selectable as one value', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Relationship types'));
        await clickEntry(page, '» instrument as: acoustic, electric guitar');
        await waitForNarrowed(page);
        expect(await visibleNames(page)).toEqual(['Rec A']);
    });

    test('the credit word equal to the type word marks only the credit, never the type', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Relationship types'));
        await clickEntry(page, '» guitar as: guitar');
        await waitForNarrowed(page);
        expect(await visibleNames(page)).toEqual(['Rec E']);
        // "guitar (as “guitar”)": exactly one mark, inside the quotes.
        expect(await marksByRow(page)).toEqual([
            ['Rec E', [{ text: 'guitar', afterQuote: true }]],
        ]);
    });

    test('a dropdown reopen after ticking still offers the section (extractor reads through its own highlight)', async ({ page }) => {
        await loadAndRender(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('Relationship types'));
        await clickEntry(page, '» instrument as: lead guitar');
        await waitForNarrowed(page);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Relationship types'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();
        expect(section.items.find((i) => i.label === '» instrument as: lead guitar').count).toBe(2);
    });
});
