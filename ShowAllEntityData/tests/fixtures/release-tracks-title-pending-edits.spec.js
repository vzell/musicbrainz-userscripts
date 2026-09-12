'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Regression test for `applyExtractTrackTitleData()` silently discarding the
// pending-edits highlight from the Title column's OWN recording link — a
// track whose recording currently has open/pending edits on musicbrainz.org
// gets its anchor wrapped in native <span class="mp">, and the Title-cell
// rebuild used to move only the bare <a> back in (`_titleTd.appendChild(_recAnchor)`),
// dropping the wrapper it came from. The recording NAME still rendered
// correctly either way — only the highlight/marker was lost, the same
// "value survives, marker doesn't" shape as the Performer-credit gap fixed
// alongside this one (see release-tracks-credit-pending-edits.spec.js) —
// unlike the "Recording of work" bug in this same session, which dropped
// the value outright.
//
// This also matters beyond cosmetics: `_msStampFullReleaseRows()`'s WS2
// backfill (release-tracks-ms-length-overflow-pending-edits.spec.js) keys
// each row by re-reading this SAME Title-cell anchor after render — with the
// wrapper stripped here, that lookup would always see a bare anchor and its
// own `.mp`-tolerance would never actually be exercised.
//
// Fixture: release-tracks-ms-length-overflow.html (real "Born to Run") with
// track B1's Title-cell recording anchor wrapped in <span class="mp">
// (release-tracks-ms-length-overflow-pending-edits.html — shared with that
// other spec).
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-ms-length-overflow-pending-edits.html');

test.describe('release-tracks: Title column with an open-edits recording', () => {
    test('the recording name renders, and the pending-edits marker survives with it', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        const cells = await page.evaluate(() => {
            const tbl = document.querySelector('table.tbl');
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === 'Title');
            return Array.from(tbl.querySelectorAll('tbody tr')).map((tr) => {
                const td = tr.cells[idx];
                return {
                    text: td.textContent.trim(),
                    hasPendingEditsMarker: !!td.querySelector('span.mp'),
                    recordingHref: td.querySelector('a[href^="/recording/"]')?.getAttribute('href') || null,
                };
            });
        });

        // Every OTHER row: bare recording anchor, no marker — unaffected by
        // either the bug or the fix.
        const others = cells.filter((_, i) => i !== 4);
        expect(others.every((c) => !c.hasPendingEditsMarker)).toBe(true);
        expect(others.every((c) => !!c.recordingHref)).toBe(true);

        // B1 (index 4): the buggy row. Its name rendered even before the fix
        // (only the marker was lost) — this pins the marker specifically.
        const b1 = cells[4];
        expect(b1.text).toBe('Born to Run');
        expect(b1.recordingHref).toBe('/recording/7ada2178-c1db-4a24-9760-810681e95308');
        expect(b1.hasPendingEditsMarker).toBe(true);
    });
});
