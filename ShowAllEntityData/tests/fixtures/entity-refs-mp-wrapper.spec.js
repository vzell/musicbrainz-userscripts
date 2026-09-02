'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Same page type/header shape smoke.spec.js uses (artist-recordings), just
// so pageType detection + headerContainer resolve and the script's init
// block doesn't bail out early (`!pageType || !headerContainer`) before
// reaching the trailing window.__saTest hook this spec relies on. The two
// cells under test (#qb-cell/#jl-yo-cell) are standalone markup copied
// verbatim from debug/rock-on-recordings.html — not touched by the
// userscript's own fetch/render pipeline, which this test never triggers.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'entity-refs-mp-wrapper.html');

test.describe('_findCellEntityRefs()/_findCellEntityCommentParts(): "mp" open-edits wrapper', () => {
    test('finds every entity in a joined credit even when MusicBrainz wraps one in <span class="mp">', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const refs = await page.evaluate(() => window.__saTest.findCellEntityRefs('#qb-cell'));

        expect(refs).toEqual([
            { type: 'artist', glyphClass: 'artistlink', href: '/artist/0383dadf-2a4e-4d10-a46a-e9e041da8eb3', name: 'Queen', isBare: false, hasFlag: false },
            { type: 'artist', glyphClass: 'artistlink', href: '/artist/5441c29d-3602-4898-b1a1-b77fa23b8e50', name: 'David Bowie', isBare: false, hasFlag: false },
        ]);
    });

    test('attributes each entity its OWN comment, not the first .comment span in the cell', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        const qbParts = await page.evaluate(() => window.__saTest.findCellEntityCommentParts('#qb-cell'));
        expect(qbParts).toEqual([
            { name: 'Queen', comment: 'UK rock group', alias: null, type: 'artist', glyphClass: 'artistlink', href: '/artist/0383dadf-2a4e-4d10-a46a-e9e041da8eb3' },
            { name: 'David Bowie', comment: 'English singer‐songwriter', alias: null, type: 'artist', glyphClass: 'artistlink', href: '/artist/5441c29d-3602-4898-b1a1-b77fa23b8e50' },
        ]);

        // Control case: no "mp" wrapper on either anchor here (neither
        // entity has open edits) — both were already found correctly
        // before this fix, but the comment-attribution bug above applies
        // equally to this shape (two independently-commented entities
        // sharing one <bdi>, no <li> boundary between them), so this
        // guards that fix too.
        const jlYoParts = await page.evaluate(() => window.__saTest.findCellEntityCommentParts('#jl-yo-cell'));
        expect(jlYoParts).toEqual([
            { name: 'John Lennon', comment: 'The Beatles', alias: null, type: 'artist', glyphClass: 'artistlink', href: '/artist/4d5447d7-c61c-4120-ba1b-d7f471d385b9' },
            { name: 'Yoko Ono', comment: 'Japanese‐American musician and artist', alias: null, type: 'artist', glyphClass: 'artistlink', href: '/artist/b0b33754-a664-43b7-ba00-be0dc4ec2396' },
        ]);
    });

    test('a SOLO commented entity resolves to its bare name, not the whole bdi (name+comment)', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        // #bowie-solo-cell ("mp"-wrapped) and #gilmour-solo-cell (no
        // wrapper) must both resolve `name` to the bare artist name alone —
        // this is exactly what _cellMatchesStructureMode()'s `name:` row
        // filter compares against (`ref.name === want`), so a leaked
        // comment here is what let the "» name: David Bowie" checkbox
        // match the joined #qb-cell row but silently skip every solo
        // "David Bowie (English singer‐songwriter)" row.
        const bowieSoloRefs = await page.evaluate(() => window.__saTest.findCellEntityRefs('#bowie-solo-cell'));
        expect(bowieSoloRefs).toEqual([
            { type: 'artist', glyphClass: 'artistlink', href: '/artist/5441c29d-3602-4898-b1a1-b77fa23b8e50', name: 'David Bowie', isBare: false, hasFlag: false },
        ]);

        const gilmourSoloRefs = await page.evaluate(() => window.__saTest.findCellEntityRefs('#gilmour-solo-cell'));
        expect(gilmourSoloRefs).toEqual([
            { type: 'artist', glyphClass: 'artistlink', href: '/artist/1dce970e-34bc-48b2-ab51-48d87544a4c2', name: 'David Gilmour', isBare: false, hasFlag: false },
        ]);

        // `isBare: false` above means these now also feed
        // entityCommentValueCounts (via _findCellEntityCommentParts(), which
        // skips isBare refs) — so the solo row's own comment is no longer
        // dropped either.
        const bowieSoloParts = await page.evaluate(() => window.__saTest.findCellEntityCommentParts('#bowie-solo-cell'));
        expect(bowieSoloParts).toEqual([
            { name: 'David Bowie', comment: 'English singer‐songwriter', alias: null, type: 'artist', glyphClass: 'artistlink', href: '/artist/5441c29d-3602-4898-b1a1-b77fa23b8e50' },
        ]);

        const gilmourSoloParts = await page.evaluate(() => window.__saTest.findCellEntityCommentParts('#gilmour-solo-cell'));
        expect(gilmourSoloParts).toEqual([
            { name: 'David Gilmour', comment: 'Pink Floyd', alias: null, type: 'artist', glyphClass: 'artistlink', href: '/artist/1dce970e-34bc-48b2-ab51-48d87544a4c2' },
        ]);
    });

    test('the same "» name:" value matches both a joined AND a solo occurrence of the same entity', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

        // Mirrors _cellMatchesStructureMode()'s `name:` mode:
        // `_findCellEntityRefs(cell).some(ref => ref.name === want)`.
        const matchesDavidBowie = async (selector) => page.evaluate(
            (sel) => window.__saTest.findCellEntityRefs(sel).some((ref) => ref.name === 'David Bowie'),
            selector,
        );

        expect(await matchesDavidBowie('#qb-cell')).toBe(true);
        expect(await matchesDavidBowie('#bowie-solo-cell')).toBe(true);
        expect(await matchesDavidBowie('#gilmour-solo-cell')).toBe(false);
        expect(await matchesDavidBowie('#jl-yo-cell')).toBe(false);
    });
});
