'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: org/ISRC.org item 7. MusicBrainz's native "ISWC" column (e.g.
// artist-works — see debug/artist-works-initial.html) already displays the
// correct T-NNN.NNN.NNN-C form, so initIswcValidation() never rewrites a
// valid cell — it only adds a ⚠️ glyph (+ tooltip) when the code doesn't
// match ISO 15707's shape or its computed check digit is wrong, and the 📊
// dropdown gets a new "ISWC - Validity" section. The check-digit formula
// (S = 1 + sum(i*d_i) over the 9 work-number digits, C = (10 - (S mod 10))
// mod 10) is verified against the real debug fixture's own
// T-070.127.339-3 (S=197, C=3) as well as the org file's own worked example
// (T-034524680-1, S=179, C=1) — see _parseIswcCode()'s own JSDoc.
//
// A non-existent artist mbid, with every paginated URL variant stubbed to
// the same fixture — see isrc-column-format.spec.js's openFixture() for why
// this is required (fetchMaxPageGeneric() probes a DIFFERENT, unstubbed URL
// otherwise, reaching the real, populated artist and its real works list).
const ARTIST_URL = 'https://musicbrainz.org/artist/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/works';
const FIXTURE_FILE = path.join(__dirname, 'artist-works-iswc-validity.html');

test('a valid ISWC is left untouched; a wrong check digit is flagged, and the 📊 dropdown reports both', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(new RegExp(`^${ARTIST_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?.*)?$`), (route) =>
        route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' })
    );
    await page.click('button[data-label="Show all Works for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const cells = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
        return rows.map((tr) => {
            const iswcTd = tr.cells[4]; // Work, Authors, Recording artists, Other artists, ISWC
            const a = iswcTd.querySelector('a');
            return { text: a.textContent, invalid: a.hasAttribute('data-mb-iswc-invalid'), title: a.getAttribute('title') };
        });
    });

    // Row 1: valid — never rewritten, no marker.
    expect(cells[0].text).toBe('T-070.127.339-3');
    expect(cells[0].invalid).toBe(false);

    // Row 2: wrong check digit — original text kept, flagged.
    expect(cells[1].text).toBe('T-070.127.339-9');
    expect(cells[1].invalid).toBe(true);
    expect(cells[1].title).toContain('Check digit');

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('ISWC'));
    expect(sections).toBeTruthy();
    const validitySection = sections.find((s) => s.label === 'ISWC - Validity');
    expect(validitySection).toBeTruthy();
    const byLabel = Object.fromEntries(validitySection.items.map((i) => [i.label, i.count]));
    expect(byLabel['✅ valid ISWC format']).toBe(1);
    expect(byLabel['⚠️ invalid ISWC format']).toBe(1);

    // Checking "invalid" narrows to row 2 only.
    const invalidCheckbox = page.locator('.mb-col-uniq-item', { hasText: '⚠️ invalid ISWC format' }).first();
    await invalidCheckbox.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const visibleWorks = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0].textContent.trim())
    );
    expect(visibleWorks).toEqual(['Invalid ISWC Work']);
});
