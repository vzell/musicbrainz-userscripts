'use strict';

// A release-tracks Title cell whose link has NO <bdi> still has a title
// element (_findCellTitleEl()), so ETI, its green italics, the title findings
// and every 📊 "Title info" entry read it.
//
// The shape comes from the third-party "mb. INLINE STUFF" userscript: on a
// track whose name differs from its recording's name it replaces the link's
// <bdi> with "Track name<br>Recording name", and applyExtractTrackTitleData()
// drops the second line. Reported on "The Rising: Tour Edition With Bonus
// DVD" (debug/release-tracks-DVD-ETI-bug.html): "(live 2002 MTV VMA
// performance)" and "(music video)" were neither ETI nor green.
//
// Fixture: the same release's native page (release-tracks-video-on-dvd.html),
// with INLINE STUFF's exact rewrite applied AFTER load by the simulator
// tests/fixtures/thirdPartyScripts/inline-stuff-recname.js. Baking the
// rewrite into the HTML does not work: MusicBrainz's release bundle
// re-renders the tracklist from its JSON payload on hydration and puts the
// <bdi> back — the real INLINE STUFF runs after that, and so does this.
//
// Guarantees pinned, each against its neighbour:
//   - the precondition: the two rendered links really have no <bdi> (else the
//     rest proves nothing about this shape);
//   - detection: both groups are 📊 ETI entries with a count of one each;
//   - look: both cells carry the green italic span, inside the link;
//   - filter + highlight: ticking one keeps exactly its row and marks exactly
//     the ETI text in the link.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');

const URL = 'https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd';
const FIXTURE = path.join(__dirname, 'release-tracks-video-on-dvd.html');
const TRACKS = {
    'The Rising (live 2002 MTV VMA performance)': 'live 2002 MTV VMA performance',
    'Lonesome Day (music video)': 'music video',
};

/**
 * Loads the fixture, lets the INLINE STUFF simulator rewrite the two track
 * links (checking that it did), and runs "Show all Tracks".
 *
 * @param {import('@playwright/test').Page} page
 */
async function openRelease(page) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, sa_uvd_autocollapse_threshold: 0 },
    });
    await injectThirdPartyScript(page, 'inline-stuff-recname');
    const rewritten = await page.evaluate(() => Array.from(
        document.querySelectorAll('a[jesus2099userjs81127recname]')).filter((a) => !a.querySelector('bdi')).length);
    expect(rewritten, 'the simulator rewrote both links before the render').toBe(2);
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The visible Title cells whose recording link is one of TRACKS: the link's
 * text (without the rewritten second line, which the extractor drops),
 * whether it holds a <bdi>, its green spans and its highlight marks — plus
 * the index of the table holding them.
 *
 * @param {import('@playwright/test').Page} page
 */
const rewrittenCells = (page) => page.evaluate((titles) => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl, ti) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const idx = ths.findIndex((t) => t.dataset.colName === 'Title');
        if (idx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.cells[idx]) return;
            const a = tr.cells[idx].querySelector('a[href^="/recording/"]');
            if (!a || !titles.includes(a.textContent.trim())) return;
            out.push({
                table: ti,
                title: a.textContent.trim(),
                hasBdi: !!a.querySelector('bdi'),
                eti: Array.from(a.querySelectorAll('.mb-title-eti')).map((s) => ({
                    text: s.textContent,
                    color: getComputedStyle(s).color,
                    fontStyle: getComputedStyle(s).fontStyle,
                })),
                marks: Array.from(a.querySelectorAll('.mb-column-filter-highlight')).map((m) => m.textContent),
            });
        });
    });
    return out;
}, Object.keys(TRACKS));

/**
 * Rows currently rendered in one table, excluding the filter row — a 📊 tick
 * filters only the sub-table whose panel it was ticked in.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} ti - Table index.
 */
const visibleRows = (page, ti) => page.evaluate((i) =>
    Array.from(document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length, ti);

test.describe('Title link without <bdi> (mb. INLINE STUFF track/recording name rewrite)', () => {
    test('both groups are ETI, green and italic, inside the bdi-less link', async ({ page }) => {
        await openRelease(page);
        const cells = await rewrittenCells(page);
        expect(cells.map((c) => c.title).sort()).toEqual(Object.keys(TRACKS).sort());
        cells.forEach((c) => {
            expect(c.hasBdi, `${c.title}: the fixture really has no <bdi>`).toBe(false);
            expect(c.eti.map((e) => e.text)).toEqual([TRACKS[c.title]]);
            expect(c.eti[0].color).toBe('rgb(46, 125, 50)');
            expect(c.eti[0].fontStyle).toBe('italic');
        });
        const ti = cells[0].table;
        expect(cells.every((c) => c.table === ti), 'both tracks are on the DVD').toBe(true);
        const sections = await page.evaluate((i) => window.__saTest.getUniqDropSections('Title', i), ti);
        const eti = Object.fromEntries(((sections || []).find((s) => s.label === 'Title info - Extra title information') || { items: [] })
            .items.map((i) => [i.label, i.count]));
        expect(eti['» ETI: live 2002 MTV VMA performance']).toBe(1);
        expect(eti['» ETI: music video']).toBe(1);
    });

    test('ticking "» ETI: music video" keeps only its row in the DVD table and marks the ETI text in the link', async ({ page }) => {
        await openRelease(page);
        const ti = (await rewrittenCells(page))[0].table;
        await page.evaluate((i) => window.__saTest.getUniqDropSections('Title', i), ti);
        await page.locator('.mb-col-uniq-item').filter({ hasText: '» ETI: music video' }).first().click();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => visibleRows(page, ti), { timeout: 15000 }).toBe(1);
        const cells = await rewrittenCells(page);
        expect(cells.map((c) => ({ title: c.title, marks: c.marks }))).toEqual([
            { title: 'Lonesome Day (music video)', marks: ['music video'] },
        ]);
    });
});
