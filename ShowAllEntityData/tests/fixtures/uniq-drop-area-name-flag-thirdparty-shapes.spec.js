'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';

/**
 * Shared assertion: opens the "Location" column's 📊 dropdown, finds the
 * "Entity info - Area name" entry for `areaName`, and checks that its
 * leading marker slot still carries the generic `arealink` glyph (never
 * replaced) while a trailing sibling after the label carries an icon
 * matching `trailingIconSelector` — the same shape assertion
 * `uniq-drop-area-name-flag-position.spec.js` makes for the native country
 * flag, applied here to a SUBDIVISION decorated by a third-party userscript.
 */
async function assertGlyphThenTrailingIcon(page, areaName, trailingIconSelector) {
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Location'));
    const areaSection = sections.find((s) => s.label === 'Entity info - Area name');
    expect(areaSection).toBeTruthy();

    const label = `» area name: ${areaName}`;
    const entry = areaSection.items.find((i) => i.label === label);
    expect(entry).toBeTruthy();

    const iconShape = await page.evaluate(({ label, trailingIconSelector }) => {
        const dropEl = document.getElementById('mb-col-uniq-dropdown');
        const item = Array.from(dropEl.querySelectorAll('.mb-col-uniq-item')).find((el) => (
            (el.dataset.mbUniqSynLabel || el.querySelector('.mb-uniq-syn-label-text')?.textContent) === label
        ));
        if (!item) return null;

        const children = Array.from(item.children);
        const labelIdx = children.findIndex((c) => c.classList.contains('mb-uniq-syn-label-text'));
        const before = children.slice(0, labelIdx);
        const after = children.slice(labelIdx + 1);

        return {
            leadingHasGenericGlyph: before.some((c) => c.classList.contains('arealink') || c.querySelector('.arealink')),
            trailingHasIcon: after.some((c) => c.querySelector(trailingIconSelector)),
        };
    }, { label, trailingIconSelector });

    expect(iconShape).toBeTruthy();
    expect(iconShape.leadingHasGenericGlyph).toBe(true);
    expect(iconShape.trailingHasIcon).toBe(true);
}

test('unique-values dropdown: a subdivision decorated by "More Flags Everywhere"\'s CURRENT shape (span.custom-area-icon) gets its own trailing icon', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: ARTIST_EVENTS_URL,
        fixtureFile: path.join(__dirname, 'uniq-drop-area-name-flag-mfe-shape.html'),
        testMode: true,
    });

    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    await assertGlyphThenTrailingIcon(page, 'Catalunya', 'img.flag-custom-region');
});

test('unique-values dropdown: a subdivision decorated by "Right Side Flags Everywhere"\'s shape (span.mfe-flag-wrapper > img.mb-hq-flag-img) gets its own trailing icon', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: ARTIST_EVENTS_URL,
        fixtureFile: path.join(__dirname, 'uniq-drop-area-name-flag-rsfe-shape.html'),
        testMode: true,
    });

    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    await assertGlyphThenTrailingIcon(page, 'País Vasco', 'img.mb-hq-flag-img');
});
