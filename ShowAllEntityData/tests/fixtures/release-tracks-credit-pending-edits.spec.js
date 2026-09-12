'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Regression test for `_buildCreditListItem()`/`_buildInstrumentVocalsListItem()`
// silently dropping the pending-edits highlight (not the name — that part
// already worked) when a credited artist currently has open/pending edits.
//
// Both functions clone the WRAPPING element around the artist's <a> instead
// of the bare anchor, but before this fix only checked for
// <span class="name-variation">, never MusicBrainz's own
// <span class="mp"> open-edits marker (the same one the "Recording of work"
// fix in this same session addressed for a different relationship — see
// release-tracks-recording-of-pending-edits.spec.js). `_findCreditSegmentArtistAnchor()`
// itself already finds the anchor regardless of wrapping (an unscoped
// querySelector), so the credited name never actually disappeared — only the
// <span class="mp"> wrapper, and with it _findCellPendingEdits()'s
// column-agnostic "does this cell mention a pending-edits entity" scan.
//
// The fixture takes the same real "Light of Day" track row used by the
// "Recording of work" regression test and synthetically wraps its
// "performer:" credit's artist anchor in <span class="mp">, mirroring the
// exact wrapping shape MusicBrainz uses elsewhere on that same real row for
// a pending-edits WORK relationship (see that file's own <span class="mp">
// on its work anchor) — see build_credit_fixture.py's own comment for the
// substitution.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-credit-pending-edits.html');

/** Reads the "Performer" column's cell content for every visible row, in row order. */
async function performerCells(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Performer');
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none') return;
                const td = tr.cells[idx];
                if (!td) return;
                out.push({
                    text: td.textContent.replace(/\s+/g, ' ').trim(),
                    hasPendingEditsMarker: !!td.querySelector('span.mp'),
                });
            });
        });
        return out;
    });
}

test.describe('release-tracks: Performer credit with an open-edits artist', () => {
    test('the artist name renders either way, but the pending-edits marker only survives with the fix', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        const cells = await performerCells(page);
        expect(cells).toHaveLength(2);

        // Control row: no pending edits.
        expect(cells[0].text).toBe('The E Street Band (on 1999-04-11)');
        expect(cells[0].hasPendingEditsMarker).toBe(false);

        // Buggy row before the fix: the name rendered fine even then (the
        // anchor-finder already looks past wrappers), but the pending-edits
        // <span class="mp"> was silently dropped from the clone.
        expect(cells[1].text).toBe('The E Street Band (on 1999-04-11)');
        expect(cells[1].hasPendingEditsMarker).toBe(true);
    });
});
