'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Regression test for a "Recording of work" cell rendering EMPTY when the
// credited work currently has open/pending edits on musicbrainz.org.
//
// MusicBrainz wraps a credited entity's anchor in native <span class="mp">
// (the same open-edits marker _findCellPendingEdits() scans for elsewhere)
// whenever that entity's own /entity/<mbid>/open_edits list is non-empty —
// see debug/release-tracks-initial.html/-final.html's "Light of Day" row
// (release 20a52f17-ce0b-48bf-911e-9f962a518185, track 8, work
// d662d712-f9f8-4118-8bb2-a821395dbf96). The "Recording of work" builder
// looked up the work anchor via `:scope > a` (a DIRECT-CHILD-only query),
// which the <span class="mp"> wrapper defeats, so the whole cell rendered
// empty instead of "Light of Day".
//
// The fixture is real native MusicBrainz markup for that exact row (plus a
// neighboring, non-mp-wrapped row for contrast — "Brothers Under the
// Bridges", crediting the work "Brothers Under the Bridge") spliced into
// the clean, already-validated Born to Run release-tracks DOM shell
// (tests/snapshots/release-tracks/raw.html) that every other release-tracks
// fixture spec in this file builds from.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-recording-of-pending-edits.html');

/** Reads one column's cell content for every visible row, in row order. */
async function columnCells(page, colName) {
    return page.evaluate((name) => {
        const out = [];
        document.querySelectorAll('table.tbl').forEach((tbl) => {
            const ths = Array.from(tbl.querySelectorAll('thead th'));
            const idx = ths.findIndex((t) => (t.dataset.colName || '') === name);
            if (idx < 0) return;
            tbl.querySelectorAll('tbody tr').forEach((tr) => {
                if (tr.style.display === 'none') return;
                const td = tr.cells[idx];
                if (!td) return;
                out.push({
                    text: td.textContent.replace(/\s+/g, ' ').trim(),
                    hasPendingEditsMarker: !!td.querySelector('span.mp'),
                    workHref: td.querySelector('a[href^="/work/"]')?.getAttribute('href') || null,
                });
            });
        });
        return out;
    }, colName);
}

test.describe('release-tracks: "Recording of work" with an open-edits work', () => {
    test('renders the work name instead of an empty cell', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        const cells = await columnCells(page, 'Recording of work');
        expect(cells).toHaveLength(2);

        // Control row: no pending edits, unaffected by the bug or the fix.
        expect(cells[0].text).toBe('Brothers Under the Bridge (live)');
        expect(cells[0].workHref).toBe('/work/2ba51d23-e042-3279-b9ee-de5b552fafdb');
        expect(cells[0].hasPendingEditsMarker).toBe(false);

        // Buggy row before the fix: this was '' (empty cell, no work link at
        // all) because the work anchor sits inside <span class="mp">, one
        // level deeper than the `:scope > a` lookup accepted.
        expect(cells[1].text).toBe('Light of Day (live)');
        expect(cells[1].workHref).toBe('/work/d662d712-f9f8-4118-8bb2-a821395dbf96');

        // The pending-edits highlight/marker must survive too, not just the
        // link — _findCellPendingEdits()'s column-agnostic scan depends on
        // the real <span class="mp"> surviving into the cloned cell.
        expect(cells[1].hasPendingEditsMarker).toBe(true);
    });

    test('does not pick up the SAME dd\'s own nested "version of:" work instead', async ({ page }) => {
        // The "Light of Day" row's <dd> also nests a separate, further-out
        // "version of:" relationship to a DIFFERENT work
        // (01cbbe51-0b54-4f77-a9e9-294889e185e7, "Just Around the Corner to
        // the Light of Day"), itself also <span class="mp">-wrapped, inside
        // the same <dd> as a nested <dl class="ars">. An unscoped
        // "first work-href anywhere in this dd" query is only correct
        // because the PRIMARY work anchor precedes it in document order —
        // this test pins that document-order dependency explicitly, so a
        // future markup reshuffle that broke it would fail loudly here
        // instead of silently swapping which work name a row shows.
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');

        const cells = await columnCells(page, 'Recording of work');
        expect(cells[1].workHref).not.toBe('/work/01cbbe51-0b54-4f77-a9e9-294889e185e7');
        expect(cells[1].workHref).toBe('/work/d662d712-f9f8-4118-8bb2-a821395dbf96');
    });
});
