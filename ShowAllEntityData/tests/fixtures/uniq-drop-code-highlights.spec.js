'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');

// Reported live (2026-09-26), three defects in ONE family — a 📊 entry that
// filters correctly but marks nothing in the cell:
//
//   1. "valid ISWC format" (and, the same omission, "valid ISRC format" and
//      "valid barcode format") had no highlighter at all. Only the INVALID
//      flags did.
//   2. "» country: GB" on an ISRCs cell marked nothing. runFilter() matches
//      and highlights on a fresh CLONE of the unformatted source row, and
//      initIsrcFormatting() only ran AFTER that — so the four segment <span>s
//      the highlighter scopes to did not exist yet, and when the tail pass
//      then rebuilt them it would have wiped the mark anyway.
//   3. "» year: 2004" could never mark anything: the entry value is the
//      4-digit year, the cell shows the 2-digit "04".
const ISRC_URL = 'https://musicbrainz.org/artist/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/recordings';
const ISRC_FIXTURE = path.join(__dirname, 'artist-recordings-isrc-format.html');
const ISWC_URL = 'https://musicbrainz.org/artist/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/works';
const ISWC_FIXTURE = path.join(__dirname, 'artist-works-iswc-validity.html');
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000003';
const BARCODE_FIXTURE = path.join(__dirname, 'barcode-column-validity.html');

/** Stubs every paginated variant of `url` to `file` (see isrc-column-format.spec.js's openFixture()). */
async function stubAll(page, url, file) {
    await page.route(new RegExp(`^${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?.*)?$`), (route) =>
        route.fulfill({ path: file, contentType: 'text/html' }));
}

/** Clicks one entry of `sectionLabel` (or, when null, any section) by its dataset label. */
async function clickEntry(page, entryLabel) {
    await page.evaluate((label) => {
        const item = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === label);
        item.click();
    }, entryLabel);
}

/** Waits until fewer than `total` rows are shown. */
async function waitForNarrowed(page, total) {
    await page.waitForFunction((n) =>
        Array.from(document.querySelectorAll('table.tbl tbody tr')).filter((r) => r.style.display !== 'none').length < n,
        total, { timeout: 15000 });
}

/**
 * Per shown row: its first link's text, and the text of every highlight inside
 * the named column's cell.
 */
async function marksIn(page, colName, linkSel) {
    return page.evaluate(({ colName, linkSel }) => {
        const idx = Array.from(document.querySelector('table.tbl thead tr').cells)
            .findIndex((t) => t.dataset.colName === colName);
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => [
                tr.querySelector(linkSel).textContent.trim(),
                Array.from(tr.cells[idx].querySelectorAll('.mb-column-filter-highlight')).map((s) => s.textContent),
            ]);
    }, { colName, linkSel });
}

test.describe('ISRCs: a ticked segment entry marks that segment', () => {
    async function open(page) {
        await loadUserscriptPage(page, { url: ISRC_URL, fixtureFile: ISRC_FIXTURE, testMode: true });
        await stubAll(page, ISRC_URL, ISRC_FIXTURE);
        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
    }

    // Fixture: row 1 US3L30406433; row 2 US3L30406433 + GBAAA9912345 (second
    // item collapsed); row 3 an invalid code. Each entry names the segment
    // text the cell actually DISPLAYS.
    for (const [entry, shown, rows] of [
        ['» country: US', 'US', ['Single ISRC Recording', 'Two ISRC Recording']],
        ['» registrant: 3L3', '3L3', ['Single ISRC Recording', 'Two ISRC Recording']],
        ['» year: 2004', '04', ['Single ISRC Recording', 'Two ISRC Recording']],   // value is 4-digit, cell shows "04"
        ['» designation: 06433', '06433', ['Single ISRC Recording', 'Two ISRC Recording']],
        ['» country: GB', 'GB', ['Two ISRC Recording']],                              // the collapsed second item
    ]) {
        test(`ticking "${entry}" marks "${shown}" in each matching row`, async ({ page }) => {
            await open(page);
            await clickEntry(page, entry);
            await waitForNarrowed(page, 3);
            const marks = await marksIn(page, 'ISRCs', 'a[href^="/recording/"]');
            expect(marks.map((m) => m[0]).sort()).toEqual([...rows].sort());
            // Exactly one mark per row, reading the displayed segment.
            for (const [, texts] of marks) expect(texts).toEqual([shown]);
        });
    }

    test('"valid ISRC format" marks every valid code and not the invalid one', async ({ page }) => {
        await open(page);
        await clickEntry(page, '✅ valid ISRC format');
        await waitForNarrowed(page, 3);
        const marks = await marksIn(page, 'ISRCs', 'a[href^="/recording/"]');
        expect(marks.map((m) => m[0]).sort()).toEqual(['Single ISRC Recording', 'Two ISRC Recording']);
        // The whole formatted code is marked: its four segments concatenate to it.
        expect(marks.find((m) => m[0] === 'Single ISRC Recording')[1].join('')).toBe('US-3L3-04-06433');
    });

    test('the mark survives a later filter pass (which re-runs the render tail and its ISRC formatting)', async ({ page }) => {
        await open(page);
        await clickEntry(page, '» country: US');
        await waitForNarrowed(page, 3);
        // An unrelated GLOBAL filter that keeps the same rows re-runs runFilter()
        // and the tail, where initIsrcFormatting() used to rebuild every <code>.
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Recording'));
        const marks = await marksIn(page, 'ISRCs', 'a[href^="/recording/"]');
        expect(marks.map((m) => m[0]).sort()).toEqual(['Single ISRC Recording', 'Two ISRC Recording']);
        for (const [, texts] of marks) expect(texts).toEqual(['US']);
    });
});

test.describe('ISRCs: entries that exist only in a collapsed list item are marked', () => {
    // Reported live (2026-09-26): after pre-filtering, the ISRCs 📊 offered
    // "» country: QM" and friends although no QM code was on screen — it was
    // the SECOND item of a collapsed cell. Decision: keep offering it (ticking
    // still shows the row and tints the ▶ toggle) but say why nothing shows it.
    async function open(page) {
        await loadUserscriptPage(page, { url: ISRC_URL, fixtureFile: ISRC_FIXTURE, testMode: true });
        await stubAll(page, ISRC_URL, ISRC_FIXTURE);
        await page.click('button[data-label="⊚ All recordings"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }
    /** Labels of the dropdown entries carrying the collapsed-only marker. */
    const markedLabels = (page) => page.evaluate(() =>
        Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item[data-mb-uniq-collapsed-only="1"]'))
            .map((el) => el.dataset.mbUniqSynLabel).sort());

    test('only the segments of the collapsed second item (GBAAA9912345) are marked; the visible ones are not', async ({ page }) => {
        await open(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
        expect(await markedLabels(page)).toEqual([
            '» country: GB', '» designation: 12345', '» registrant: AAA', '» year: 1999',
        ]);
        // The marker sits outside the label, so the label text is exactly the value.
        const labelText = await page.evaluate(() => {
            const el = document.querySelector('#mb-col-uniq-dropdown .mb-col-uniq-item[data-mb-uniq-syn-label="» country: GB"] .mb-uniq-syn-label-text');
            return el.textContent;
        });
        expect(labelText).toBe('» country: GB');
        // ... and the entry is still offered, still counted.
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
        const country = sections.find((s) => s.label === 'ISRC - Country');
        expect(country.items.map((i) => [i.label, i.count])).toEqual([['» country: GB', 1], ['» country: US', 2]]);
    });

    test('a CACHED reopen (same visible rows) draws the same markers', async ({ page }) => {
        await open(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
        const first = await markedLabels(page);
        expect(first).toContain('» country: GB');

        // getUniqDropSections() does not re-open an already-open panel, so
        // close it (a second click on its own opener toggles it shut) and open
        // it again: the visible row set is unchanged, so this is a cache HIT.
        await page.evaluate(() => {
            const th = Array.from(document.querySelectorAll('table.tbl thead th')).find((t) => t.dataset.colName === 'ISRCs');
            th.querySelector('.mb-col-uniq-wrap').click();
        });
        await page.waitForFunction(() => {
            const d = document.getElementById('mb-col-uniq-dropdown');
            return !d || d.style.display === 'none';
        });
        await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
        expect(await markedLabels(page)).toEqual(first);
    });

    test('expanding the cell drops the marker (the counts cache is invalidated by the expand)', async ({ page }) => {
        await open(page);
        await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
        expect(await markedLabels(page)).toContain('» country: GB');

        // Expand the two-item cell, then reopen the dropdown.
        await page.locator('table.tbl tbody tr', { hasText: 'Two ISRC Recording' })
            .locator('.mb-cell-collapse-toggle').first().click();
        await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
        expect(await markedLabels(page)).toEqual([]);
    });
});

test('ISWC: "valid ISWC format" marks the valid code, and only that row is shown', async ({ page }) => {
    await loadUserscriptPage(page, { url: ISWC_URL, fixtureFile: ISWC_FIXTURE, testMode: true });
    await stubAll(page, ISWC_URL, ISWC_FIXTURE);
    await page.click('button[data-label="Show all Works for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.evaluate(() => window.__saTest.getUniqDropSections('ISWC'));
    await clickEntry(page, '✅ valid ISWC format');
    await waitForNarrowed(page, 2);

    const marks = await marksIn(page, 'ISWC', 'a[href^="/work/"]');
    expect(marks).toHaveLength(1);
    expect(marks[0][0]).toBe('Valid ISWC Work');
    expect(marks[0][1].join('')).toBe('T-070.127.339-3');
});

test('Barcode: "valid barcode format" marks every valid barcode', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: BARCODE_FIXTURE, testMode: true,
        settingsOverride: { sa_enable_barcode_highlight: false },
    });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.evaluate(() => window.__saTest.getUniqDropSections('Barcode'));
    await clickEntry(page, '✅ valid barcode format');
    await waitForNarrowed(page, 9);

    const shown = await page.evaluate(() => {
        const idx = Array.from(document.querySelector('table.tbl thead tr').cells).findIndex((t) => t.dataset.colName === 'Barcode');
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => [tr.cells[idx].textContent.trim(),
                Array.from(tr.cells[idx].querySelectorAll('.mb-column-filter-highlight')).map((s) => s.textContent).join('')]);
    });
    expect(shown).toHaveLength(6);
    // The mark covers the whole barcode, for every one of the six.
    for (const [text, marked] of shown) expect(marked).toBe(text);
});
