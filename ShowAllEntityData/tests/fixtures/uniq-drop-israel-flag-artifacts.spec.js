'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');

// Reproduces debug/Israel-flag.html: "Right Side Flags Everywhere" wraps the
// country anchor in its own `span.mfe-flag-wrapper` (trailing
// `img.mb-hq-flag-img`) and, because the anchor already sat inside a NATIVE
// `<span class="flag flag-IL">`, explicitly neutralizes that native flag's
// own background (`data-hq-processed`, `background-image: none !important`)
// rather than removing the now-empty wrapping span — see DEBUG-NOTES.md's
// dated entry for the full trace.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-israel-flag-artifacts.html');
const LOCATION_COLUMN = 'Location';

async function openLocationDropdown(page) {
    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Location'));
    return sections;
}

test('a country whose native flag was neutralized by "Right Side Flags Everywhere" gets exactly ONE icon, not a hollow duplicate', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await openLocationDropdown(page);
    const areaSection = sections.find((s) => s.label === 'Entity info - Area name');
    expect(areaSection).toBeTruthy();
    const entry = areaSection.items.find((i) => i.label === '» area name: Israel');
    expect(entry).toBeTruthy();

    const shape = await page.evaluate(() => {
        const dropEl = document.getElementById('mb-col-uniq-dropdown');
        const item = Array.from(dropEl.querySelectorAll('.mb-col-uniq-item')).find((el) => (
            (el.dataset.mbUniqSynLabel || el.querySelector('.mb-uniq-syn-label-text')?.textContent) === '» area name: Israel'
        ));
        if (!item) return null;
        const labelIdx = Array.from(item.children).findIndex((c) => c.classList.contains('mb-uniq-syn-label-text'));
        const after = Array.from(item.children).slice(labelIdx + 1);
        // The load-bearing assertion: exactly one trailing icon slot, and it
        // must carry a REAL flag image (RSFE's own `<img>`), not an empty
        // `<span class="flag flag-IL">` shell left over from the now-hollow
        // native flag span.
        return {
            trailingSlotCount: after.length,
            trailingHasRealImg: after.some((c) => c.querySelector('img.mb-hq-flag-img[src]')),
            trailingHasEmptyNativeSpan: after.some((c) => {
                const span = c.querySelector('span.flag');
                return !!span && !span.querySelector('img') && !span.style.backgroundImage;
            }),
        };
    });

    expect(shape).toBeTruthy();
    expect(shape.trailingSlotCount).toBe(1);
    expect(shape.trailingHasRealImg).toBe(true);
    expect(shape.trailingHasEmptyNativeSpan).toBe(false);

    // Same guarantee in the cell-preview row at the bottom of the dropdown
    // (built by _buildFlagSegmentsForRoot()): exactly one icon, not the
    // hollow native flag AND the RSFE wrapper both matching as bogus icon
    // segments in front of the name.
    const previewIconCount = await page.evaluate(() => {
        const dropEl = document.getElementById('mb-col-uniq-dropdown');
        const preview = Array.from(dropEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.title?.includes('Cinema City Hall in Israel'));
        if (!preview) return -1;
        return preview.querySelectorAll('img.mb-hq-flag-img, span.mfe-flag-wrapper, span.flag').length;
    });
    expect(previewIconCount).toBe(1);
});

test('filtering to a partial match that highlights part of a country name does not insert an artificial space in the preview', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const colIdx = await page.evaluate((colName) => {
        return Array.from(document.querySelectorAll('table.tbl thead th'))
            .findIndex((t) => (t.dataset.colName || '') === colName);
    }, LOCATION_COLUMN);
    expect(colIdx).toBeGreaterThanOrEqual(0);

    const colInput = page.locator(`table.tbl thead .mb-col-filter-input[data-col-idx="${colIdx}"]`).first();
    await colInput.click();
    await waitForFilterSettled(page, () => colInput.pressSequentially('isra'));

    const sections = await openLocationDropdown(page);
    const areaSection = sections.find((s) => s.label === 'Entity info - Area name');
    // The load-bearing assertion: the entry's OWN label text is still the
    // unbroken value "Israel", never split into "Isra" + " " + "el" by the
    // still-live column-filter highlight span this query created.
    expect(areaSection.items.map((i) => i.label)).toContain('» area name: Israel');

    // The load-bearing assertion is on the RENDERED text content, not the
    // `title` tooltip — the tooltip is built from a separately-cached,
    // already-correct value and stayed right even while the actual visible
    // text (built by _buildFlagSegmentsForRoot()) regressed to "Isra el".
    const previewText = await page.evaluate(() => {
        const dropEl = document.getElementById('mb-col-uniq-dropdown');
        const preview = Array.from(dropEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.title?.includes('flag/area icon shown as it appears in the table'));
        return preview ? preview.textContent : null;
    });
    expect(previewText).not.toBeNull();
    expect(previewText).not.toContain('Isra el');
    expect(previewText).toContain('Cinema City Hall in Israel');
});
