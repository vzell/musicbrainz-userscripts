'use strict';

// An editor's collections page with a "Collaborative collections" section
// (vzell, 2026-10-26, /user/ApeKattQuest, MonkeyPython/collections). The IP
// has two h2 sections, "My collections" (5 h3 tables, no Privacy column) and
// "Collaborative collections" (one "Artist collections" table WITH a Privacy
// column). Before applyMergeCollaborativeCollections(), the render dropped the
// collaborative table under "My collections" with the first table's header, so
// its Privacy cell had no header and the columns after it were shifted.
//
// Pinned (FRP):
//   - one h2, "Collections", and no "Collaborative collections";
//   - the five h3 groups, each once, "Artist collections" with 3 + 1 rows;
//   - every rendered row has exactly as many cells as its table's header
//     (the column-shift bug), and every table has a Privacy column;
//   - Privacy reads "Private" for the first section's rows and keeps
//     MusicBrainz's "Public" for the collaborative row, cell by cell under
//     the Privacy header (not just "somewhere in the row").
// Fixture: scripts/build-user-collections-fixture.py from vzell's IP.

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/user/ApeKattQuest%2C%20MonkeyPython/collections';
const FIXTURE = path.join(__dirname, 'user-collections-collaborative.html');
const LABEL = 'Show all Collections for User';
const GROUPS = ['Artist collections', 'Recording collections', 'Release collections',
    'Release group collections', 'Series collections'];

/**
 * Loads the fixture, clicks the button and waits for the render.
 * @param {import('@playwright/test').Page} page
 */
async function render(page) {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.click(`button[data-label="${LABEL}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Reads every rendered table: its h3, its header names, and each row as
 * { name, privacy, cells } with `privacy` taken from the Privacy column.
 * @param {import('@playwright/test').Page} page
 */
const readTables = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl')).map((t) => {
    let h = t.previousElementSibling;
    while (h && h.tagName !== 'H3') h = h.previousElementSibling;
    const heads = Array.from(t.querySelectorAll(':scope > thead > tr:first-child > th'))
        .map((th) => th.dataset.colName || th.textContent.trim());
    const pi = heads.indexOf('Privacy');
    const rows = Array.from(t.querySelectorAll(':scope > tbody > tr')).map((tr) => ({
        name: tr.cells[heads.indexOf('Collection')]?.textContent.trim(),
        privacy: pi >= 0 ? tr.cells[pi]?.textContent.trim() : null,
        cells: tr.cells.length,
    }));
    const h3 = h ? (h.querySelector('.mb-h3-title, .mb-toggle-h3-title')?.textContent || h.firstChild?.textContent || '').trim() : '';
    return { h3, h3Full: h ? h.textContent : '', heads, rows };
}));

test.describe('user-collections with collaborative collections', () => {
    test('one "Collections" h2, the collaborative h2 gone', async ({ page }) => {
        await render(page);
        const h2s = await page.locator('#page > h2').evaluateAll((hs) => hs.map((h) => h.textContent));
        expect(h2s.filter((t) => /Collaborative collections/.test(t))).toEqual([]);
        expect(h2s.filter((t) => /My collections/.test(t))).toEqual([]);
        expect(h2s.filter((t) => /Collections/.test(t))).toHaveLength(1);
    });

    test('five h3 groups, each once; the collaborative row merged into Artist collections', async ({ page }) => {
        await render(page);
        const tables = await readTables(page);
        const names = GROUPS.map((g) => tables.filter((t) => t.h3Full.includes(g)).length);
        expect(names).toEqual([1, 1, 1, 1, 1]);
        const artist = tables.find((t) => t.h3Full.includes('Artist collections'));
        expect(artist.rows.map((r) => r.name)).toEqual(expect.arrayContaining(
            ['Bands with Dinosaur Names', 'ColourAnimal', 'Not quite that.... but?', 'Composer Diversity Project']));
        expect(artist.rows).toHaveLength(4);
    });

    test('no column shift: every row as wide as its header, and every table has Privacy', async ({ page }) => {
        await render(page);
        const tables = await readTables(page);
        for (const t of tables) {
            expect(t.heads, `${t.h3Full}: a Privacy column`).toContain('Privacy');
            expect(t.rows.filter((r) => r.cells !== t.heads.length), `${t.h3Full}: rows of another width`).toEqual([]);
        }
    });

    test('each group has its own header: the count column names its entity', async ({ page }) => {
        // Before data-mb-col-headers, every group copied the FIRST table's
        // header, so all five read "Artists".
        await render(page);
        const counts = (await readTables(page)).map((t) => t.heads[2]);
        expect(counts).toEqual(['Artists', 'Recordings', 'Releases', 'Release groups', 'Series']);
    });

    test('Privacy: "Private" for the first section, MusicBrainz\'s "Public" for the collaborative one', async ({ page }) => {
        await render(page);
        const rows = (await readTables(page)).flatMap((t) => t.rows);
        expect(rows.find((r) => r.name === 'Composer Diversity Project').privacy).toBe('Public');
        const others = rows.filter((r) => r.name !== 'Composer Diversity Project');
        expect(others).toHaveLength(12);
        expect(others.filter((r) => r.privacy !== 'Private')).toEqual([]);
    });
});
