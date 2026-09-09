'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// artist-events' native "Location" column carries a place + area chain in
// one cell (see splitLocation's 'Location' sourceColumn wiring), so opening
// its 📊 dropdown surfaces BOTH "Entity info - Place name" and "Entity info
// - Area name" sections from that single column — matching
// debug/originally-country-flag-right-uvdd.html.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-area-name-flag-position.html');

test('unique-values dropdown: area-name entry keeps the generic glyph AND shows the country flag after the name, not instead of it', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Location'));
    const areaSection = sections.find((s) => s.label === 'Entity info - Area name');
    expect(areaSection).toBeTruthy();

    const spainEntry = areaSection.items.find((i) => i.label === '» area name: Spain');
    expect(spainEntry).toBeTruthy();
    expect(spainEntry.count).toBe(1);

    // The load-bearing assertion: makeValueSynItem()'s leading marker slot
    // still shows the generic 'arealink' glyph (never replaced by the real
    // flag), and a SEPARATE trailing node carrying the real `flag flag-XX`
    // class exists after the label — i.e. rendered as
    // "[glyph] » area name: Spain [flag]", not "[flag] » area name: Spain".
    const iconShape = await page.evaluate(() => {
        const dropEl = document.getElementById('mb-col-uniq-dropdown');
        const item = Array.from(dropEl.querySelectorAll('.mb-col-uniq-item')).find((el) => (
            (el.dataset.mbUniqSynLabel || el.querySelector('.mb-uniq-syn-label-text')?.textContent) === '» area name: Spain'
        ));
        if (!item) return null;

        const children = Array.from(item.children);
        const labelIdx = children.findIndex((c) => c.classList.contains('mb-uniq-syn-label-text'));
        const before = children.slice(0, labelIdx);
        const after = children.slice(labelIdx + 1);
        const hasFlagClass = (el) => /\bflag-/.test(el.className) || !!el.querySelector('[class*="flag-"]');

        return {
            leadingHasGenericGlyph: before.some((c) => c.classList.contains('arealink') || c.querySelector('.arealink')),
            leadingHasFlag: before.some(hasFlagClass),
            trailingHasFlag: after.some(hasFlagClass),
        };
    });

    expect(iconShape).toBeTruthy();
    expect(iconShape.leadingHasGenericGlyph).toBe(true);
    expect(iconShape.leadingHasFlag).toBe(false);
    expect(iconShape.trailingHasFlag).toBe(true);
});
