'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Feature: `artist-works`' "Attributes" column renders MusicBrainz's own
// identifier-badge shape (rights-society/tune-code IDs like "ACAM ID",
// "SUISA ID") — a COMPLETELY DIFFERENT DOM shape from the natural-language
// recording-attribute words `uniq-drop-recording-attributes.spec.js` covers,
// despite both columns being literally named "Attributes". The unique-values
// dropdown had no section for this identifier-badge shape at all.
//
// This is also the regression test for reading the POST-expansion DOM: one
// row's Attributes cell is truncated by MusicBrainz (a <li class="show-all">
// placeholder hiding "PRS tune code" in the middle of its own JSON blob) —
// expandShowAllCells() must reconstruct it before the extractor ever runs,
// or "PRS tune code" silently never becomes a dropdown entry.
const ARTIST_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works';
const FIXTURE_FILE = path.join(__dirname, 'artist-works-attributes.html');

test('unique-values dropdown: artist-works "Attributes" column gets an identifier-type section', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Works for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Attributes'));
    expect(sections).toBeTruthy();

    // Distinct section from the free-text recording-attribute-words family
    // (label 'Attributes', glyph 🏷️) — proves no collision even though both
    // can appear under a column literally named "Attributes".
    const idSection = sections.find((s) => s.label === 'Attributes - Identifier type');
    expect(idSection).toBeTruthy();
    expect(sections.find((s) => s.label === 'Attributes')).toBeFalsy();

    const byLabel = Object.fromEntries(idSection.items.map((i) => [i.label, i.count]));
    expect(byLabel['» identifier: ACAM ID']).toBe(1);
    expect(byLabel['» identifier: SUISA ID']).toBe(2);
    expect(byLabel['» identifier: AGADU ID']).toBe(1);
    expect(byLabel['» identifier: AKM ID']).toBe(1);
    // The regression assertion: "PRS tune code" is never a rendered <li> in
    // this fixture's own markup — it exists only inside the truncated row's
    // JSON blob, behind a <li class="show-all"> placeholder.
    expect(byLabel['» identifier: PRS tune code']).toBe(1);

    // Checking "SUISA ID" narrows to exactly the 2 rows carrying it.
    const suisaCheckbox = page.locator('.mb-col-uniq-item', { hasText: '» identifier: SUISA ID' }).first();
    await suisaCheckbox.click();
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const visibleTitles = await page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[0]?.textContent.trim())
    );
    expect(visibleTitles.sort()).toEqual(['Born to Run', 'Racing in the Street']);
});
