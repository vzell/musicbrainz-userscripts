'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// Feature: org/ISRC.org items 1/3/4/6. The native "ISRCs" column (artist-
// recordings and others — see debug/BoDeans-Recordings-initial.html) always
// showed MusicBrainz's own compact, un-hyphenated code (e.g.
// "US3L30406433"). initIsrcFormatting() now rewrites it, page-agnostically,
// to the hyphenated CC-XXX-YY-NNNNN form with tinted country/year segments
// (item 3), leaves a malformed code untouched but flags it with a ⚠️ glyph
// (item 6), and the 📊 unique-values dropdown gets four new constituent
// sections plus a validity section (item 4).
//
// This fixture covers the NATIVE compact shape only. The release-tracks
// synthetic column (built from jesus2099's already-hyphenated
// mb_INLINE-STUFF.user.js markup, see debug/Western-Stars-ISRCs-initial.html)
// goes through the exact same _parseIsrcCode()/initIsrcFormatting() — there
// is no shape-specific branch in the implementation, both resolve the
// compact code from the anchor's own href — so it is not re-covered by a
// second fixture here.
// A non-existent artist mbid (fetchMaxPageGeneric() re-fetches "…?page=1"
// as its own separate request, a DIFFERENT URL than the one navigated to —
// see openFixture()'s own comment for why every page-numbered variant must
// be stubbed too, or this pageType's real pagination would otherwise reach
// the real, populated BoDeans artist and fetch actual live data).
const ARTIST_URL = 'https://musicbrainz.org/artist/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/recordings';
const FIXTURE_FILE = path.join(__dirname, 'artist-recordings-isrc-format.html');

/**
 * Loads the fixture and stubs every paginated variant of ARTIST_URL (not
 * just the exact URL loadUserscriptPage() itself stubs) to the SAME 3-row
 * fixture, which carries no `ul.pagination` — so fetchMaxPageGeneric()'s own
 * `?page=1` probe (a request to a DIFFERENT URL than the one just navigated
 * to) resolves `maxPage: 1` from genuinely absent pagination markup, rather
 * than falling through to the real network and fetching a real artist's
 * real, many-paged recordings list.
 */
async function openFixture(page) {
    await loadUserscriptPage(page, { url: ARTIST_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(new RegExp(`^${ARTIST_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?.*)?$`), (route) =>
        route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' })
    );
    await page.click('button[data-label="⊚ All recordings"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('ISRCs column: reformat, invalid-flagging, and the constituent dropdown sections', () => {
    test('valid codes are rewritten to CC-XXX-YY-NNNNN with tinted country/year segments; an invalid one is flagged, not rewritten', async ({ page }) => {
        await openFixture(page);

        const cells = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
            return rows.map((tr) => {
                const isrcTd = tr.cells[2]; // Name, Artist, ISRCs
                return Array.from(isrcTd.querySelectorAll('a')).map((a) => ({
                    text: a.textContent,
                    invalid: a.hasAttribute('data-mb-isrc-invalid'),
                    title: a.getAttribute('title'),
                    tintedSegments: Array.from(a.querySelectorAll('code > span'))
                        .filter((s) => s.style.color === 'red').map((s) => s.textContent),
                }));
            });
        });

        // Row 1: single valid ISRC -> hyphenated, country+year tinted.
        expect(cells[0]).toHaveLength(1);
        expect(cells[0][0].text).toBe('US-3L3-04-06433');
        expect(cells[0][0].invalid).toBe(false);
        expect(cells[0][0].tintedSegments).toEqual(['US', '04']);

        // Row 2: two valid ISRCs in one cell, each reformatted independently.
        expect(cells[1]).toHaveLength(2);
        expect(cells[1][0].text).toBe('US-3L3-04-06433');
        expect(cells[1][1].text).toBe('GB-AAA-99-12345');

        // Row 3: malformed code (non-digit designation) is left as its
        // original text and flagged, not silently reformatted or dropped.
        expect(cells[2]).toHaveLength(1);
        expect(cells[2][0].text).toBe('INVALIDISRC1');
        expect(cells[2][0].invalid).toBe(true);
        expect(cells[2][0].title).toContain('CC-XXX-YY-NNNNN');

        // The ⚠️ glyph itself is CSS ::after content (data-mb-isrc-invalid
        // only), never real cell text — so it can't leak into
        // getCleanColumnText()/filter matching.
        const invalidCellText = await page.evaluate(
            () => document.querySelectorAll('table.tbl tbody tr')[2].cells[2].textContent
        );
        expect(invalidCellText).not.toContain('⚠');
    });

    test('reformatting survives a column sort (self-healing render-tail pass, no persisted state)', async ({ page }) => {
        await openFixture(page);

        // Sort by Name — forces a re-render/re-clone.
        const nameHeader = page.locator('table.tbl thead tr:first-child th[data-col-name="Name"]');
        await waitForSortSettled(page, () => nameHeader.locator('.sort-icon-btn', { hasText: '▲' }).first().click());

        const stillHyphenated = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr td:nth-child(3) a')).map((a) => a.textContent)
        );
        expect(stillHyphenated.sort()).toEqual(['GB-AAA-99-12345', 'INVALIDISRC1', 'US-3L3-04-06433', 'US-3L3-04-06433'].sort());
    });

    test('📊 dropdown offers Country/Registrant/Year/Designation/Validity sections with correct counts, and a value entry narrows rows', async ({ page }) => {
        await openFixture(page);

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('ISRCs'));
        expect(sections).toBeTruthy();

        const byLabel = (sectionLabel) => {
            const s = sections.find((sec) => sec.label === sectionLabel);
            expect(s).toBeTruthy();
            return Object.fromEntries(s.items.map((i) => [i.label, i.count]));
        };

        // "US" appears in rows 1 and 2 -> count 2; "GB" only in row 2.
        const country = byLabel('ISRC - Country');
        expect(country['» country: US']).toBe(2);
        expect(country['» country: GB']).toBe(1);

        const registrant = byLabel('ISRC - Registrant');
        expect(registrant['» registrant: 3L3']).toBe(2);
        expect(registrant['» registrant: AAA']).toBe(1);

        // Resolved 4-digit year (design decision), not the raw "04"/"99".
        const year = byLabel('ISRC - Year');
        expect(year['» year: 2004']).toBe(2);
        expect(year['» year: 1999']).toBe(1);

        const designation = byLabel('ISRC - Designation');
        expect(designation['» designation: 06433']).toBe(2);
        expect(designation['» designation: 12345']).toBe(1);

        const validity = byLabel('ISRC - Validity');
        expect(validity['✅ valid ISRC format']).toBe(2);
        expect(validity['⚠️ invalid ISRC format']).toBe(1);

        // Checking "» country: GB" narrows to row 2 only.
        const gbCheckbox = page.locator('.mb-col-uniq-item', { hasText: '» country: GB' }).first();
        await gbCheckbox.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const visibleNames = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr'))
                .filter((tr) => tr.style.display !== 'none')
                .map((tr) => tr.cells[0].textContent.trim())
        );
        expect(visibleNames).toEqual(['Two ISRC Recording']);
    });
});
