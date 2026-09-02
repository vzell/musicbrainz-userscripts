'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Same page type/header shape smoke.spec.js/entity-refs-mp-wrapper.spec.js
// use (artist-recordings) so pageType detection + headerContainer resolve.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'area-name-collision.html');

const CITY_HREF  = '/area/74e50e58-5deb-4b99-93a2-decbb365c07f';
const STATE_HREF = '/area/75e398a3-5f3f-4224-9cd8-0fe44715bc95';

test.describe('Two different MusicBrainz areas sharing the exact same display name ("New York")', () => {
    test('_flagIconSubdivisionLabel() reads the flag icon\'s own alt/title, not the anchor\'s bare text', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        // Before the fix, both anchors' OWN text is bare "New York" — the
        // exact ambiguity that let the city get misrouted into Region
        // alongside the state. The icon's own alt/title disambiguates them.
        const cityLabel  = await page.evaluate((sel) => window.__saTest.flagIconSubdivisionLabel(sel), `#loc-cell a[href="${CITY_HREF}"]`);
        const stateLabel = await page.evaluate((sel) => window.__saTest.flagIconSubdivisionLabel(sel), `#loc-cell a[href="${STATE_HREF}"]`);

        expect(cityLabel).toBe('new york city');
        expect(stateLabel).toBe('new york');
        expect(cityLabel).not.toBe(stateLabel);
    });

    test('splitLocation() keeps the city in Locality and the state alone in Region (does not force both into Region)', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        // `_findRowCountryName()` resolves "United States" here via its own
        // anchor-text fallback (no <abbr> needed), so `_routeAreaLink()`'s
        // `forceRegion` branch genuinely activates on this fixture exactly
        // as it does on a live "Location" cell — confirmed by temporarily
        // reverting `_flagIconSubdivisionLabel()` to plain `a.textContent`,
        // which reproduced the reported bug (the city dragged into Region
        // alongside the state) and failed this exact assertion.
        const split = await page.evaluate(() => window.__saTest.splitLocationAreas('#loc-cell'));

        expect(split.place).toEqual([
            { type: 'place', glyphClass: 'placelink', href: '/place/481c1e71-8707-407d-aaae-452a5cc96f84', name: 'SiriusXM Studio', isBare: true, hasFlag: false },
        ]);
        expect(split.locality).toEqual([
            { type: 'area', glyphClass: 'arealink', href: CITY_HREF, name: 'New York', isBare: true, hasFlag: true },
        ]);
        expect(split.region).toEqual([
            { type: 'area', glyphClass: 'arealink', href: STATE_HREF, name: 'New York', isBare: true, hasFlag: true },
        ]);
        expect(split.country).toEqual([
            { type: 'area', glyphClass: 'arealink', href: '/area/489ce91b-6658-3307-9877-795b68554c98', name: 'United States', isBare: true, hasFlag: true },
        ]);
    });

    test('_findCellEntityRefs()/_findCellEntityCommentParts() report the two colliding areas as distinct hrefs under the same name', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const refs = await page.evaluate(() => window.__saTest.findCellEntityRefs('#region-collision-cell'));
        expect(refs).toEqual([
            { type: 'area', glyphClass: 'arealink', href: CITY_HREF, name: 'New York', isBare: false, hasFlag: true },
            { type: 'area', glyphClass: 'arealink', href: STATE_HREF, name: 'New York', isBare: false, hasFlag: true },
        ]);

        // Non-bare (part of a 2-entity chain), so both feed
        // entityNameValueCounts/entityNameHrefsMap — the same "New York"
        // name backed by two DIFFERENT hrefs, which is exactly what
        // openUniqDrop()'s _emitNameSynItem() uses to decide to split the
        // flat "» area name: New York" entry into one per href.
        const parts = await page.evaluate(() => window.__saTest.findCellEntityCommentParts('#region-collision-cell'));
        expect(parts).toEqual([
            { name: 'New York', comment: null, alias: null, type: 'area', glyphClass: 'arealink', href: CITY_HREF },
            { name: 'New York', comment: null, alias: null, type: 'area', glyphClass: 'arealink', href: STATE_HREF },
        ]);
    });

    test('_cellMatchesStructureMode(): "namehref:" isolates ONE specific area, "name:" still matches both', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const matches = async (mode) => page.evaluate(
            ({ sel, m }) => window.__saTest.cellMatchesStructureMode(sel, m),
            { sel: '#region-collision-cell', m: mode },
        );

        // Broad 'name:' mode — unchanged, matches the cell regardless of
        // which of the two colliding areas it's checking for.
        expect(await matches('name:New York')).toBe(true);

        // href-scoped 'namehref:' mode — isolates exactly one entity.
        expect(await matches(`namehref:${CITY_HREF}`)).toBe(true);
        expect(await matches(`namehref:${STATE_HREF}`)).toBe(true);
        expect(await matches('namehref:/area/00000000-0000-0000-0000-000000000000')).toBe(false);
    });

    test('_entityNameSplitsByHref(): only "area" name collisions split into one entry per href', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        // area is the ONLY type this collision-split mechanism was built
        // for (two genuinely different areas can share a display name,
        // e.g. this fixture's own "New York" city/state collision). Every
        // other entity type collides on display name as ordinary
        // MusicBrainz data (many different recordings/releases/etc. sharing
        // one title — see debug/work.recordings.html's 93-recording "4th of
        // July, Asbury Park (Sandy)" collision) and must stay merged.
        expect(await page.evaluate(() => window.__saTest.entityNameSplitsByHref('area'))).toBe(true);
        expect(await page.evaluate(() => window.__saTest.entityNameSplitsByHref('recording'))).toBe(false);
        expect(await page.evaluate(() => window.__saTest.entityNameSplitsByHref('artist'))).toBe(false);
        expect(await page.evaluate(() => window.__saTest.entityNameSplitsByHref('work'))).toBe(false);
        expect(await page.evaluate(() => window.__saTest.entityNameSplitsByHref('label'))).toBe(false);
        expect(await page.evaluate(() => window.__saTest.entityNameSplitsByHref(undefined))).toBe(false);
    });
});
