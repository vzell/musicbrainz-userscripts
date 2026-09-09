'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// Reproduces debug/Czech-flag.html: "Right Side Flags Everywhere" decorates
// the "Locality" area ("Praha") with span.mfe-flag-wrapper (icon trailing
// the anchor, inside the wrapper). Two rows for the exact same area ended up
// with DIFFERENT icon order in the synthetic "Locality" column — one
// matching _routeAreaLink()'s own rendering, the other overwritten by RSFE's
// own live re-decoration of the freshly-cloned anchor. See DEBUG-NOTES.md's
// dated entry for the full race analysis.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-locality-flag-order.html');

test('_routeAreaLink() renders the area NAME before its icon in synthetic columns, and stamps the clone so a flag-decorating userscript never re-decorates it in a different order', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const shape = await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('table.tbl thead th'))
            .map((t) => t.dataset.colName || '');
        const row = document.querySelector('table.tbl tbody tr');
        const cellFor = (name) => row.children[headers.indexOf(name)];

        // Praha has an icon, so it lands in EITHER Locality or Region
        // depending on _routeAreaLink()'s forceRegion heuristic — check
        // whichever one actually got it.
        const localityCell = cellFor('Locality');
        const regionCell = cellFor('Region');
        const cell = localityCell?.querySelector('a[href*="/area/"]') ? localityCell
            : regionCell?.querySelector('a[href*="/area/"]') ? regionCell
            : null;
        if (!cell) return null;

        const anchor = cell.querySelector('a[href*="/area/"]');
        const icon = cell.querySelector('img.mb-hq-flag-img, span.area-icon, span.custom-area-icon');
        if (!anchor || !icon) return { anchorFound: !!anchor, iconFound: !!icon };

        // DOM position comparison: is the icon AFTER the anchor?
        const order = anchor.compareDocumentPosition(icon);
        const iconIsAfterAnchor = !!(order & Node.DOCUMENT_POSITION_FOLLOWING);

        return {
            anchorFound: true,
            iconFound: true,
            iconIsAfterAnchor,
            anchorStampedProcessed: anchor.dataset.flagProcessed === '1',
        };
    });

    expect(shape).toBeTruthy();
    expect(shape.anchorFound).toBe(true);
    expect(shape.iconFound).toBe(true);
    // The load-bearing assertion: name first, icon after — our own
    // consistent convention, regardless of the source's own icon-before or
    // icon-after shape.
    expect(shape.iconIsAfterAnchor).toBe(true);
    // And stamped so a live flag-decorating userscript never re-wraps this
    // clone afterward in its own (possibly different) order.
    expect(shape.anchorStampedProcessed).toBe(true);
});
