'use strict';

// release-tracks on a /release/<mbid>/disc/<n>#<track MBID> URL: MusicBrainz
// highlights the targeted track's row through CSS `:target`
// (`tr:target > td`, measured live as rgb(242, 242, 178)). That pseudo-class
// only matches the one element the browser resolved the fragment to, and the
// multi-table render shows cloneNode(true) copies — so the highlight vanished
// on "Show all Tracks". _stampTrackTarget() marks the source row with
// `data-mb-track-target` before the rows are captured; a CSS rule on that
// attribute repaints it, and _scrollToTrackTarget() scrolls it into view once.
//
// Also pinned: the userscript header's @include and the release-tracks
// matcher accept the /disc/<n> path (with and without a fragment).
//
// Fixture: "Live and Swingin'" (25 tracks, one medium). Track 22 "Nancy (with
// the Laughing Face)" is the target — far enough down to need a scroll.
// Track 1 "Fanfare & Introduction" has no associated work, so its Title cell
// carries the ⚠️ flag, which must keep its own tint on a targeted row.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, USERSCRIPT_PATH } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE = 'a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const DISC_URL = `https://musicbrainz.org/release/${RELEASE}/disc/1`;
const FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const NANCY = '8a44df38-225a-30b6-ab37-f37ed9f866e7';
const FANFARE = 'c09baa9c-21c0-3e4b-b7b2-c89884a210fa';
const TARGET_BG = 'rgb(242, 242, 178)';
const NO_WORK_BG = 'rgb(255, 243, 205)';

/**
 * Loads the fixture at the /disc/1 URL, points the fragment at `trackId`
 * (as a #<track MBID> link would) and runs "Show all Tracks".
 *
 * @param {import('@playwright/test').Page} page
 * @param {?string} trackId
 */
async function openDisc(page, trackId) {
    await loadUserscriptPage(page, {
        url: DISC_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true },
    });
    if (trackId) await page.evaluate((id) => { location.hash = id; }, trackId);
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every visible row: its id, whether it carries the target marker, each
 * cell's computed background, and whether the row is inside the viewport.
 *
 * @param {import('@playwright/test').Page} page
 */
const rows = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
    .filter((tr) => tr.style.display !== 'none')
    .map((tr) => {
        const r = tr.getBoundingClientRect();
        return {
            id: tr.id,
            marked: tr.dataset.mbTrackTarget === '1',
            bgs: Array.from(tr.cells).filter((td) => td.offsetParent !== null)
                // A cell carrying a warning keeps its own tint on the
                // targeted row: the no-work flag, and every finding with a
                // generic tint (on this fixture Nancy's Artist cell credits
                // Frank Sinatra, who has pending edits — docs/claude/findings.md).
                .map((td) => ({ bg: getComputedStyle(td).backgroundColor,
                                flagged: !!td.dataset.mbWorkFlag || !!td.dataset.mbFinding })),
            inView: r.top >= 0 && r.bottom <= window.innerHeight,
        };
    }));

test.describe('release-tracks: /disc/<n>#<track> target highlight', () => {
    test('the /disc/1 page is recognised and the targeted track stays highlighted after "Show all"', async ({ page }) => {
        await openDisc(page, NANCY);
        const all = await rows(page);
        expect(all.length).toBe(25);
        const marked = all.filter((r) => r.marked);
        expect(marked.map((r) => r.id)).toEqual([NANCY]);
        expect(marked[0].bgs.length).toBeGreaterThan(3);
        expect(marked[0].bgs.filter((c) => !c.flagged).every((c) => c.bg === TARGET_BG)).toBe(true);
        expect(marked[0].bgs.filter((c) => c.flagged).map((c) => c.bg), 'the pending-edits cell keeps its warning tint')
            .toEqual([NO_WORK_BG]);
        // Nobody else is painted.
        expect(all.filter((r) => !r.marked).every((r) => r.bgs.every((c) => c.bg !== TARGET_BG))).toBe(true);
        // Scrolled into view.
        expect(marked[0].inView).toBe(true);
    });

    test('the highlight survives a filter re-render', async ({ page }) => {
        await openDisc(page, NANCY);
        await page.fill('#mb-global-filter-input', 'Nancy');
        await expect.poll(async () => (await rows(page)).map((r) => [r.id, r.marked,
            r.bgs.filter((c) => !c.flagged).every((c) => c.bg === TARGET_BG)]),
            { timeout: 15000 }).toEqual([[NANCY, true, true]]);
    });

    test('a warning-flagged cell keeps its own tint on the targeted row', async ({ page }) => {
        await openDisc(page, FANFARE);
        const row = (await rows(page)).find((r) => r.id === FANFARE);
        expect(row.marked).toBe(true);
        const flagged = row.bgs.filter((c) => c.flagged);
        expect(flagged.map((c) => c.bg)).toEqual([NO_WORK_BG]);
        expect(row.bgs.filter((c) => !c.flagged).every((c) => c.bg === TARGET_BG)).toBe(true);
    });

    test('no fragment, or one that is not a track MBID: nothing is marked', async ({ page }) => {
        await openDisc(page, null);
        expect((await rows(page)).filter((r) => r.marked)).toEqual([]);
        await openDisc(page, 'disc1');
        expect((await rows(page)).filter((r) => r.marked)).toEqual([]);
    });
});

test('the header @include accepts /release/<mbid>/disc/<n> with and without a fragment', () => {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').split('// ==/UserScript==')[0];
    const includes = Array.from(header.matchAll(/^\/\/ @include\s+\/(.*)\/\s*$/gm)).map((m) => new RegExp(m[1]));
    const hit = (u) => includes.some((re) => re.test(u));
    expect(hit(`https://musicbrainz.org/release/${RELEASE}/disc/1#${NANCY}`)).toBe(true);
    expect(hit(`https://musicbrainz.org/release/${RELEASE}/disc/12`)).toBe(true);
    expect(hit(`https://musicbrainz.org/release/${RELEASE}#${NANCY}`)).toBe(true);
    expect(hit(`https://musicbrainz.org/release/${RELEASE}`)).toBe(true);
    // Not every sub-path: the release edit page stays excluded.
    expect(hit(`https://musicbrainz.org/release/${RELEASE}/edit`)).toBe(false);
    expect(hit(`https://musicbrainz.org/release/${RELEASE}/disc/x`)).toBe(false);
});
