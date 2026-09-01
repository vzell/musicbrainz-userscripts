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
            { name: 'Queen', comment: 'UK rock group', alias: null, type: 'artist', glyphClass: 'artistlink' },
            { name: 'David Bowie', comment: 'English singer‐songwriter', alias: null, type: 'artist', glyphClass: 'artistlink' },
        ]);

        // Control case: no "mp" wrapper on either anchor here (neither
        // entity has open edits) — both were already found correctly
        // before this fix, but the comment-attribution bug above applies
        // equally to this shape (two independently-commented entities
        // sharing one <bdi>, no <li> boundary between them), so this
        // guards that fix too.
        const jlYoParts = await page.evaluate(() => window.__saTest.findCellEntityCommentParts('#jl-yo-cell'));
        expect(jlYoParts).toEqual([
            { name: 'John Lennon', comment: 'The Beatles', alias: null, type: 'artist', glyphClass: 'artistlink' },
            { name: 'Yoko Ono', comment: 'Japanese‐American musician and artist', alias: null, type: 'artist', glyphClass: 'artistlink' },
        ]);
    });
});
