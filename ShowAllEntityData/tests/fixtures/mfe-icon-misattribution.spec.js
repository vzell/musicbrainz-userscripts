'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Reproduces debug/More-Flags-Everywhere-bug.html: an area anchor with no
// flag of its own (e.g. "Midtown Manhattan", "Gelsenkirchen" — neither is in
// "More Flags Everywhere"'s region map), chained immediately before a
// DIFFERENT, flagged area anchor, wrongly "borrowed" that neighbor's icon
// into its own Locality cell via `_findAreaLinkIcon()`'s ambiguous
// `nextElementSibling` fallback — see that function's JSDoc for the full
// mechanism, confirmed against the real third-party script's own
// `processLink()` (icon always precedes ITS OWN anchor, never the anchor
// before it).
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'mfe-icon-misattribution.html');

const MANHATTAN_HREF = '/area/edd27a39-ff8a-4af4-8bbf-f369b0fb1899';
const NY_COUNTY_HREF = '/area/74e50e58-5deb-4b99-93a2-decbb365c07f';
const NY_STATE_HREF  = '/area/75e398a3-5f3f-4224-9cd8-0fe44715bc95';
const GELSENKIRCHEN_HREF = '/area/47cf7072-da93-4354-85ec-7852c338ec87';
const NRW_HREF = '/area/1de7fa77-cb52-40a2-b82a-251c7818249d';

test.describe('"More Flags Everywhere" icon misattribution: an unflagged area anchor must not borrow the NEXT anchor\'s icon', () => {
    test('3-anchor chain (Midtown Manhattan -> New York county -> New York state): Locality gets no icon, Region gets both, each with its own correct icon', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const split = await page.evaluate(() => window.__saTest.splitLocationAreas('#loc-cell-3anchor'));

        // The load-bearing assertion: before the fix, Manhattan wrongly
        // reported `hasFlag: true` (a clone of the county's own icon).
        expect(split.locality).toEqual([
            { type: 'area', glyphClass: 'arealink', href: MANHATTAN_HREF, name: 'Midtown Manhattan', isBare: true, hasFlag: false, flagLabel: null },
        ]);

        // Both distinct "New York" areas land in Region, each with its OWN
        // correct icon (never a shared/misattributed one) — asserting
        // `flagLabel` here, not just `hasFlag`, is what catches a borrowed
        // icon: a borrowed icon still reports `hasFlag: true`.
        // `isBare: false` for both — the cell holds TWO entities, so
        // neither is the cell's entire content alone (`isBare` requires a
        // single-entity cell, e.g. the 2-anchor case's Region entry below).
        expect(split.region).toEqual([
            { type: 'area', glyphClass: 'arealink', href: NY_COUNTY_HREF, name: 'New York', isBare: false, hasFlag: true, flagLabel: 'New York City' },
            { type: 'area', glyphClass: 'arealink', href: NY_STATE_HREF, name: 'New York', isBare: false, hasFlag: true, flagLabel: 'New York' },
        ]);
    });

    test('2-anchor chain (Gelsenkirchen -> Nordrhein-Westfalen): Locality gets no icon, Region gets its own', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const split = await page.evaluate(() => window.__saTest.splitLocationAreas('#loc-cell-2anchor'));

        expect(split.locality).toEqual([
            { type: 'area', glyphClass: 'arealink', href: GELSENKIRCHEN_HREF, name: 'Gelsenkirchen', isBare: true, hasFlag: false, flagLabel: null },
        ]);
        expect(split.region).toEqual([
            { type: 'area', glyphClass: 'arealink', href: NRW_HREF, name: 'Nordrhein-Westfalen', isBare: true, hasFlag: true, flagLabel: 'Nordrhein-Westfalen' },
        ]);
    });
});
