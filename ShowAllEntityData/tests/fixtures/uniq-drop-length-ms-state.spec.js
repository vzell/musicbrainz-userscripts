'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Feature: the "Length info - Milliseconds" section — whether a Length cell
// carries real sub-second precision (ms != .000), only whole seconds (.000),
// or no millisecond data at all. Reuses work-recordings-ms-length.html and its
// mocked Web Service answer (the same fixture work-recordings-ms-length.spec.js
// drives), because the page has no length data of its own: milliseconds only
// appear after ⏱ is pressed, which is exactly the "section appears once some
// cell has milliseconds" behaviour under test.
//
// Rows, after ⏱ (see WS2_BODY): 5:05.146 precise · 5:05.000 whole ·
// 5:34.866 precise · ?:?? none · 4:24.000 whole · 2:00 none (its mocked
// value disagrees with the displayed seconds and is discarded, so no stamp).
const WORK_URL = 'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201';
const FIXTURE_FILE = path.join(__dirname, 'work-recordings-ms-length.html');
const SECTION = 'Length info - Milliseconds';

const REC = {
    a: '528327c7-0f7a-46d1-b03f-700ebc39f747',
    b: 'de9ff1d7-dd78-4ed6-a328-c1ab126304e6',
    c: '089026d3-1c1d-45bb-bf16-072d0bff8412',
    d: '299b2860-570e-4dca-9166-9e3842d8c381',
    e: '0b62eb61-f75f-498c-845f-5e7fbd3ac924',
    mismatch: 'bbbbbbbb-2222-4222-8222-222222222222',
};
const WS2_BODY = JSON.stringify({
    relations: [
        { recording: { id: REC.a, length: 305146 } },
        { recording: { id: REC.b, length: 305000 } },
        { recording: { id: REC.c, length: 334866 } },
        { recording: { id: REC.d, length: null } },
        { recording: { id: REC.e, length: 264000 } },
        { recording: { id: REC.mismatch, length: 305146 } },
    ],
});

const PRECISE = '🔬 milliseconds ≠ .000';
const WHOLE = '⭕ milliseconds = .000 (whole seconds)';
const NONE = '∅ no millisecond data';

/** Loads the fixture with the Web Service mocked. */
async function setup(page) {
    await page.route('**/ws/2/work/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY }));
    await loadUserscriptPage(page, { url: WORK_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Recordings for Work"]');
    await page.waitForSelector('#mb-filter-container');
}

const toggle = (page) => page.locator('.mb-ms-col-hdr-btn').first();

/** Presses ⏱ and waits for the fetch to land. */
async function pressToggle(page, pressed) {
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', pressed);
}

/** Clicks one entry of the milliseconds section by its dataset label. */
async function clickEntry(page, entryLabel) {
    await page.evaluate(({ sectionLabel, entryLabel }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sectionLabel);
        Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === entryLabel).click();
    }, { sectionLabel: SECTION, entryLabel });
}

/** The Length cells of the rows currently shown, whitespace-stripped, in row order. */
async function visibleLengths(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const idx = Array.from(tbl.querySelectorAll('thead th')).findIndex((t) => (t.dataset.colName || '') === 'Length');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none' || tr.classList.contains('subh')) return;
                out.push(tr.cells[idx].textContent.replace(/\s+/g, ''));
            });
        });
        return out;
    });
}

/** The highlighted text inside each shown Length cell, in row order. */
async function highlightedInLength(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const idx = Array.from(tbl.querySelectorAll('thead th')).findIndex((t) => (t.dataset.colName || '') === 'Length');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none' || tr.classList.contains('subh')) return;
                out.push(Array.from(tr.cells[idx].querySelectorAll('.mb-column-filter-highlight')).map((s) => s.textContent).join(''));
            });
        });
        return out;
    });
}

/** Waits until fewer rows than `total` are shown. */
async function waitForNarrowed(page, total) {
    await page.waitForFunction((n) =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none' && !r.classList.contains('subh')).length < n,
        total, { timeout: 15000 });
}

test.describe('unique-values dropdown: "Length info - Milliseconds" section', () => {
    test('is absent before ⏱ (no cell has milliseconds), and appears with the right split once pressed', async ({ page }) => {
        await setup(page);

        let sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        // Nothing carries milliseconds yet: a section here would read "6 x none".
        expect(sections.find((s) => s.label === SECTION)).toBeFalsy();

        await pressToggle(page, 'true');
        // The dropdown is a cache keyed on the visible row set, which the ⏱
        // rewrite does not change — so this also proves the cache was dropped.
        sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();
        expect(section.items.map((i) => [i.label, i.count])).toEqual([
            [PRECISE, 2],   // 5:05.146, 5:34.866
            [WHOLE, 2],     // 5:05.000, 4:24.000
            [NONE, 2],      // ?:?? and the discarded 2:00
        ]);

        const datasetLabels = await page.evaluate((label) => {
            const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === label);
            return Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item')).map((i) => i.dataset.mbUniqSynLabel);
        }, SECTION);
        expect(datasetLabels).toHaveLength(3);
        expect(datasetLabels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    });

    test('"ms ≠ .000" shows exactly the two precise rows and marks their millisecond part', async ({ page }) => {
        await setup(page);
        await pressToggle(page, 'true');
        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await clickEntry(page, PRECISE);
        await waitForNarrowed(page, 6);
        expect(await visibleLengths(page)).toEqual(['5:05.146', '5:34.866']);
        expect(await highlightedInLength(page)).toEqual(['.146', '.866']);
    });

    test('"ms = .000" shows exactly the two whole-second rows', async ({ page }) => {
        await setup(page);
        await pressToggle(page, 'true');
        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await clickEntry(page, WHOLE);
        await waitForNarrowed(page, 6);
        expect(await visibleLengths(page)).toEqual(['5:05.000', '4:24.000']);
        expect(await highlightedInLength(page)).toEqual(['.000', '.000']);
    });

    test('"no millisecond data" shows the unknown and the discarded row, and marks nothing', async ({ page }) => {
        await setup(page);
        await pressToggle(page, 'true');
        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await clickEntry(page, NONE);
        await waitForNarrowed(page, 6);
        expect(await visibleLengths(page)).toEqual(['?:??', '2:00']);
        expect(await highlightedInLength(page)).toEqual(['', '']);
    });

    test('with ⏱ switched back off the cells still HAVE milliseconds, so the split is unchanged', async ({ page }) => {
        await setup(page);
        await pressToggle(page, 'true');
        await pressToggle(page, 'false');
        // Displayed as rounded seconds again ...
        expect(await visibleLengths(page)).toEqual(['5:05', '5:05', '5:35', '?:??', '4:24', '2:00']);
        // ... yet the stamp is still on the cells, and the state is read from it.
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();
        expect(section.items.map((i) => i.count)).toEqual([2, 2, 2]);
    });

    test('a dropdown reopen after ticking still offers the section (extractor reads through its own highlight)', async ({ page }) => {
        await setup(page);
        await pressToggle(page, 'true');
        await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        await clickEntry(page, PRECISE);
        await waitForNarrowed(page, 6);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Length'));
        const section = sections.find((s) => s.label === SECTION);
        expect(section).toBeTruthy();
        expect(section.items.find((i) => i.label === PRECISE).count).toBe(2);
    });
});
