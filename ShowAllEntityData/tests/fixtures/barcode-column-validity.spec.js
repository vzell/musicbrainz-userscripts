'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');

// Feature: org/barcode.org. The native "Barcode" column (e.g.
// releasegroup-releases — see tests/snapshots/releasegroup-releases/raw.html
// for the real td.barcode-cell markup) gets a GS1 mod-10 format/check-digit
// validity pass — initBarcodeValidation() NEVER rewrites the cell's own
// text (unlike initIsrcFormatting()'s reformatting of valid ISRCs), only
// flags an invalid one with data-mb-barcode-invalid + a tooltip — plus three
// new 📊 sections: "Barcode - Validity" (fixed valid/invalid flags, mutually
// exclusive per row since a Barcode cell holds 0 or 1 value), "Barcode -
// Format" (which GS1 format a STRICTLY CONFORMING entry matches), and
// "Barcode - Same As" — an OPEN VALUE FAMILY, one entry per canonical-
// equivalence GROUP, labeled with the actual raw representations involved
// (e.g. "0196587565725 / 196587565725" — a real MusicBrainz UPC-A/EAN-13
// pair), not a flat "N rows share a barcode" count.
//
// The check-digit algorithm itself is verified against real, independently
// sourced examples in _parseBarcodeCode()'s own JSDoc; this fixture reuses
// those same values (EAN-8 73513537, UPC-A 036000241457, EAN-13
// 4006381333931) rather than constructed numbers, so a weight-direction bug
// that happens to be internally self-consistent still fails this test.
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000003';
const FIXTURE_FILE = path.join(__dirname, 'barcode-column-validity.html');

// Same-As group labels, longest raw representation first (_barcodeSameAsGroupLabel()).
const SAME_AS_GROUP_1 = '🔢 0036000241457 / 036000241457'; // Release A (UPC-A) / Release B (its own EAN-13)
const SAME_AS_GROUP_2 = '🔢 04006381333931 / 4006381333931'; // Release D (EAN-13) / Release E (its own GTIN-14)

async function loadAndRender(page) {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE_FILE, testMode: true,
        // Keep the merge-checkbox highlight feature's own DOM (background-
        // color/data-barcode-identifier) out of this test — it's an
        // unrelated, independently gated feature, and disabling it removes
        // any ambiguity about which attribute/state this spec is asserting.
        settingsOverride: { sa_enable_barcode_highlight: false },
    });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Opens the "Barcode" column's own 📊 unique-values dropdown. */
async function openBarcodeDropdown(page) {
    await page.evaluate(() => {
        const th = Array.from(document.querySelectorAll('table.tbl thead th'))
            .find((t) => t.dataset.colName === 'Barcode');
        th.querySelector('.mb-col-uniq-wrap').click();
    });
    await page.waitForSelector('#mb-col-uniq-dropdown');
}

/** @returns {Promise<Array<{release: string, text: string, invalid: boolean, title: ?string}>>} */
async function barcodeCells(page) {
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        return rows.map((tr) => {
            const td = tr.querySelector('td.barcode-cell');
            return {
                // cells[0]'s own text also carries a native "▶" toggle span
                // (data-erg-btn, "Toggle display of underlying entity
                // page") ahead of the release link — read the <a> directly.
                release: tr.cells[0].querySelector('a').textContent.trim(),
                text: td.textContent.trim(),
                invalid: td.hasAttribute('data-mb-barcode-invalid'),
                title: td.getAttribute('title'),
            };
        });
    });
}

test('flags invalid barcodes without rewriting text, and reports Validity/Format/Same-As in the 📊 dropdown', async ({ page }) => {
    await loadAndRender(page);

    const cells = await barcodeCells(page);
    const byRelease = Object.fromEntries(cells.map((c) => [c.release, c]));

    // Valid entries: text untouched, no marker at all (org/barcode.org's
    // "no auto-normalization" constraint — checked here, not just asserted
    // in a comment, since this is the one property most likely to regress
    // silently if a future change reintroduces ISRC-style reformatting).
    for (const [release, expectedText] of [
        ['Release A', '036000241457'],
        ['Release B', '0036000241457'],
        ['Release C', '73513537'],
        ['Release D', '4006381333931'],
        ['Release E', '04006381333931'],
        // Real barcode (debug/barcode.html) whose correct check digit is 0 —
        // the one value that catches a dropped final `% 10` in the check-
        // digit formula (see scripts/mutations/barcode-column-validity.json).
        ['Release J', '196589638540'],
    ]) {
        expect(byRelease[release].text).toBe(expectedText);
        expect(byRelease[release].invalid).toBe(false);
        expect(byRelease[release].title).toBeNull();
    }

    // Invalid entries: text still untouched, flagged with a reason-specific tooltip.
    expect(byRelease['Release F'].text).toBe('036000241452');
    expect(byRelease['Release F'].invalid).toBe(true);
    expect(byRelease['Release F'].title).toContain('Check digit');

    expect(byRelease['Release G'].text).toBe('123456789');
    expect(byRelease['Release G'].invalid).toBe(true);
    expect(byRelease['Release G'].title).toContain('Does not match a known barcode format');

    expect(byRelease['Release I'].text).toBe('1234-5678');
    expect(byRelease['Release I'].invalid).toBe(true);

    // [none]: excluded entirely — no marker, no title.
    expect(byRelease['Release H'].text).toBe('[none]');
    expect(byRelease['Release H'].invalid).toBe(false);
    expect(byRelease['Release H'].title).toBeNull();

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Barcode'));
    expect(sections).toBeTruthy();

    const validitySection = sections.find((s) => s.label === 'Barcode - Validity');
    expect(validitySection).toBeTruthy();
    const validityByLabel = Object.fromEntries(validitySection.items.map((i) => [i.label, i.count]));
    // 6 valid (A/B/C/D/E/J), 3 invalid (F/G/I) — [none] (H) counts toward neither.
    expect(validityByLabel['✅ valid barcode format']).toBe(6);
    expect(validityByLabel['⚠️ invalid barcode format']).toBe(3);

    const formatSection = sections.find((s) => s.label === 'Barcode - Format');
    expect(formatSection).toBeTruthy();
    const formatByLabel = Object.fromEntries(formatSection.items.map((i) => [i.label, i.count]));
    expect(formatByLabel['» format: UPC-A']).toBe(2);
    expect(formatByLabel['» format: EAN-13']).toBe(2);
    expect(formatByLabel['» format: EAN-8']).toBe(1);
    expect(formatByLabel['» format: GTIN-14']).toBe(1);

    const sameAsSection = sections.find((s) => s.label === 'Barcode - Same As');
    expect(sameAsSection).toBeTruthy();
    const sameAsByLabel = Object.fromEntries(sameAsSection.items.map((i) => [i.label, i.count]));
    // Two independent Same-As groups (A/B and D/E), each its own entry,
    // labeled with the group's own raw representations — never a flat
    // "N rows share a barcode" count, and never including row C or J
    // (unique, no partner) or row F (invalid, but still digit-shaped —
    // its canonical 36000241452 differs from A/B's by one digit, so it
    // must NOT be folded into their group).
    expect(Object.keys(sameAsByLabel).sort()).toEqual([SAME_AS_GROUP_1, SAME_AS_GROUP_2].sort());
    expect(sameAsByLabel[SAME_AS_GROUP_1]).toBe(2);
    expect(sameAsByLabel[SAME_AS_GROUP_2]).toBe(2);
});

test('"Barcode - Same As" filters to exactly one group\'s own pair, not the other group\'s', async ({ page }) => {
    await loadAndRender(page);
    await openBarcodeDropdown(page);

    const group1Item = page.locator('.mb-col-uniq-item', { hasText: SAME_AS_GROUP_1 }).first();
    await group1Item.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const visible = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0].querySelector('a').textContent.trim()));
    // A/B only — NOT D/E (a different group) and not C/J (unique, no partner).
    expect(visible.sort()).toEqual(['Release A', 'Release B']);
});

test('"Barcode - Format" (EAN-13) filters to exactly the strictly-conforming EAN-13 rows', async ({ page }) => {
    await loadAndRender(page);
    await openBarcodeDropdown(page);

    const formatItem = page.locator('.mb-col-uniq-item', { hasText: 'EAN-13' }).first();
    await formatItem.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const visible = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0].querySelector('a').textContent.trim()));
    expect(visible.sort()).toEqual(['Release B', 'Release D']);
});

test('"⚠️ invalid barcode format" filters to exactly the three non-conforming rows', async ({ page }) => {
    await loadAndRender(page);
    await openBarcodeDropdown(page);

    const invalidItem = page.locator('.mb-col-uniq-item', { hasText: '⚠️ invalid barcode format' }).first();
    await invalidItem.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const visible = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0].querySelector('a').textContent.trim()));
    expect(visible.sort()).toEqual(['Release F', 'Release G', 'Release I']);
});

test('sa_enable_barcode_validation: false suppresses markers and dropdown sections', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: FIXTURE_FILE, testMode: true,
        settingsOverride: { sa_enable_barcode_highlight: false, sa_enable_barcode_validation: false },
    });
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const cells = await barcodeCells(page);
    expect(cells.every((c) => !c.invalid)).toBe(true);
    expect(cells.every((c) => !c.title)).toBe(true);

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Barcode'));
    expect((sections || []).find((s) => s.label === 'Barcode - Validity')).toBeUndefined();
    expect((sections || []).find((s) => s.label === 'Barcode - Format')).toBeUndefined();
    expect((sections || []).find((s) => s.label === 'Barcode - Same As')).toBeUndefined();
});

// _getBarcodeCanonicalGroups() must be computed TABLE-WIDE (every row,
// regardless of current display state), not from whichever rows a DIFFERENT
// filter currently leaves visible — see that function's own JSDoc for the
// precedent bug this mirrors (_getLengthColumnAverages(), "matched on
// matchOnly:true, mismatched on the same filter's matchOnly:false highlight
// pass moments later"). Narrow to Release A ALONE with an unrelated global
// filter first (hiding its Same-As partner, Release B), then AND in Group
// 1's own entry — if the canonical-groups map were built from only-
// currently-visible rows, Release A's own canonical would appear to occur
// just once (its partner is hidden), so the group wouldn't exist at all
// (no >1-count canonical), the entry wouldn't even be OFFERED, and the
// combined filter would wrongly show zero rows instead of the one row that
// still genuinely shares a barcode number with a row the OTHER filter
// happens to be hiding. The group's LABEL is pinned too — it must still
// read the full "0036000241457 / 036000241457" pair from the table-wide
// map, not just whatever raw text the one visible row itself carries.
test('"Barcode - Same As" reads the whole table, not just what another filter currently shows', async ({ page }) => {
    await loadAndRender(page);

    await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Release A'));
    let visible = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0].querySelector('a').textContent.trim()));
    expect(visible).toEqual(['Release A']);

    await openBarcodeDropdown(page);
    const group1Item = page.locator('.mb-col-uniq-item', { hasText: SAME_AS_GROUP_1 }).first();
    await expect(group1Item).toHaveCount(1);
    await group1Item.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });

    visible = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0].querySelector('a').textContent.trim()));
    expect(visible).toEqual(['Release A']);
});
