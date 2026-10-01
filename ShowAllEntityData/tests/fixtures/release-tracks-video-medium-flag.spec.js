'use strict';

const { test, expect } = require('../support/test');
const fs = require('fs');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// release-tracks: a VIDEO recording on a medium whose format cannot carry
// video at all (a CD, a vinyl record, …) is a data error — either the
// recording's video flag or the medium's format is wrong. Such Video cells are
// marked `data-mb-video-flag="mismatch"` and painted exactly like a far-over
// Length mismatch (light red + ❌); video recordings on a video-capable medium
// get `"ok"`, which paints nothing. See _applyVideoMediumFlag() and
// MEDIUM_FORMAT_VIDEO_CAPABLE.
//
// Both fixtures are real musicbrainz.org pages saved verbatim, embedded
// release payload included, by scripts/fetch-release-fixture.js:
//   - "Only the Strong Survive: Covers Vol. 1" — ONE CD, whose tracks 3, 4, 6
//     and 10 are recordings marked as videos (the reported bug);
//   - "The Rising: Tour Edition With Bonus DVD" — a CD with no videos plus a
//     DVD-Video whose five tracks are all videos (the must-not-flag side).
const CD_URL = 'https://musicbrainz.org/release/812b0aa0-0550-4235-9c3b-fa97f2572e74';
const CD_FIXTURE = path.join(__dirname, 'release-tracks-video-on-cd.html');
const DVD_URL = 'https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd';
const DVD_FIXTURE = path.join(__dirname, 'release-tracks-video-on-dvd.html');
const FORMATS_FIXTURE = path.join(__dirname, 'medium-formats.html');

// What the far-over Length level paints — the default of
// sa_release_tracks_length_mismatch_severe_bg (#f8d7da).
const SEVERE_BG = 'rgb(248, 215, 218)';

/**
 * Loads a release fixture and runs "Show all Tracks".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixtureFile
 * @param {Object} [settingsOverride]
 */
async function openRelease(page, url, fixtureFile, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url,
        fixtureFile,
        testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, ...settingsOverride },
    });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await page.waitForSelector('#mb-filter-container');
}

/**
 * Reads every rendered row's Video cell: its sub-table heading, track number,
 * whether it holds the video icon, its flag, computed background and the
 * `::after` glyph.
 *
 * @param {import('@playwright/test').Page} page
 */
const videoCells = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead th'));
        const vIdx = ths.findIndex((t) => (t.dataset.colName || '') === 'Video');
        const pIdx = ths.findIndex((t) => (t.dataset.colName || '') === '#');
        if (vIdx < 0) return;
        let h = tbl.previousElementSibling;
        while (h && h.tagName !== 'H3') h = h.previousElementSibling;
        const medium = h ? (h.firstChild && h.firstChild.nextSibling ? h.firstChild.nextSibling.textContent : h.textContent).trim() : '';
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none') return;
            const td = tr.cells[vIdx];
            if (!td) return;
            out.push({
                medium,
                pos: pIdx >= 0 && tr.cells[pIdx] ? tr.cells[pIdx].textContent.trim() : '',
                isVideo: !!td.querySelector('span.video'),
                flag: td.dataset.mbVideoFlag || null,
                title: td.title,
                ownTip: td.dataset.mbColTip === '1',
                bg: getComputedStyle(td).backgroundColor,
                glyph: getComputedStyle(td, '::after').content,
            });
        });
    });
    return out;
});

test.describe('release-tracks: video recordings on a medium that cannot carry video', () => {
    test('CD: exactly the four video rows are flagged, tinted and marked ❌', async ({ page }) => {
        await openRelease(page, CD_URL, CD_FIXTURE);
        const cells = await videoCells(page);
        expect(cells).toHaveLength(15);

        const flagged = cells.filter((c) => c.flag === 'mismatch').map((c) => c.pos);
        expect(flagged).toEqual(['3', '4', '6', '10']);
        // The flag follows the icon exactly: every video row, no audio row.
        expect(cells.filter((c) => c.isVideo).map((c) => c.pos)).toEqual(flagged);

        for (const c of cells.filter((x) => x.flag === 'mismatch')) {
            expect(c.bg).toBe(SEVERE_BG);
            expect(c.glyph).toBe('"❌"');
            expect(c.ownTip).toBe(true);
            expect(c.title).toContain('medium 1 is a CD');
            expect(c.title).toContain('cannot carry video');
        }
        for (const c of cells.filter((x) => !x.flag)) {
            expect(c.bg).not.toBe(SEVERE_BG);
            expect(c.glyph).toBe('none');
        }
    });

    test('CD: the flag survives a sort re-render (cloneNode)', async ({ page }) => {
        await openRelease(page, CD_URL, CD_FIXTURE);
        const th = page.locator('table.tbl thead th[data-col-name="Title"]').first();
        await waitForSortSettled(
            page,
            () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click(),
            { subTableHeading: 'CD' },
        );
        const cells = await videoCells(page);
        const flagged = cells.filter((c) => c.flag === 'mismatch').map((c) => c.pos).sort((a, b) => a - b);
        expect(flagged).toEqual(['3', '4', '6', '10']);
        expect(cells.filter((c) => c.flag === 'mismatch').every((c) => c.bg === SEVERE_BG)).toBe(true);
    });

    test('setting off: nothing is flagged', async ({ page }) => {
        await openRelease(page, CD_URL, CD_FIXTURE, { sa_enable_release_tracks_video_medium_flag: false });
        const cells = await videoCells(page);
        expect(cells.filter((c) => c.isVideo)).toHaveLength(4);
        expect(cells.filter((c) => c.flag)).toHaveLength(0);
        expect(cells.every((c) => c.bg !== SEVERE_BG)).toBe(true);
    });

    test('DVD-Video: video rows are "ok" — untinted, no ❌, no tooltip', async ({ page }) => {
        await openRelease(page, DVD_URL, DVD_FIXTURE);
        const cells = await videoCells(page);
        const videos = cells.filter((c) => c.isVideo);
        expect(videos).toHaveLength(5);
        for (const c of videos) {
            expect(c.medium).toContain('DVD-Video');
            expect(c.flag).toBe('ok');
            expect(c.bg).not.toBe(SEVERE_BG);
            expect(c.glyph).toBe('none');
            expect(c.title).toBe('');
        }
        // The CD medium beside it has no videos, so nothing on it is marked.
        expect(cells.filter((c) => c.medium.includes('CD') && !c.medium.includes('DVD') && c.flag)).toHaveLength(0);
    });

    test('without the embedded payload, the format is read from the medium header instead', async ({ page }, testInfo) => {
        // _mediumFormatId()'s fallback: no release payload, so the format id
        // comes from the header text ("CD") matched by name. Strip the payload
        // from a copy of the real page to reach it.
        const html = fs.readFileSync(CD_FIXTURE, 'utf8').replace(
            /<script[^>]*type="application\/json"[^>]*>(?:(?!<\/script>)[\s\S])*"mediums"[\s\S]*?<\/script>/g, '');
        expect(html).not.toContain('"mediums"');
        const noPayload = testInfo.outputPath('release-tracks-video-on-cd-no-payload.html');
        fs.writeFileSync(noPayload, html, 'utf8');

        await openRelease(page, CD_URL, noPayload);
        const cells = await videoCells(page);
        expect(cells.filter((c) => c.flag === 'mismatch').map((c) => c.pos)).toEqual(['3', '4', '6', '10']);
    });

    test('every MusicBrainz medium format has an entry in MEDIUM_FORMAT_VIDEO_CAPABLE', async ({ page }) => {
        // The release editor's own format <select>, saved verbatim. A format
        // MusicBrainz adds later would otherwise be silently "unknown" (never
        // flagged) instead of being classified on purpose.
        const html = fs.readFileSync(FORMATS_FIXTURE, 'utf8');
        const options = [...html.matchAll(/<option value="(\d+)">(?:&nbsp;)*([^<]*)<\/option>/g)]
            .map((m) => ({ id: Number(m[1]), name: m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&') }));
        expect(options).toHaveLength(115);

        await openRelease(page, CD_URL, CD_FIXTURE);
        const byId = new Map(await page.evaluate(() => window.__saTest.mediumFormatVideoCapable()));
        expect(byId.size).toBe(options.length);
        for (const o of options) {
            expect(byId.has(o.id), `format ${o.id} ${o.name}`).toBe(true);
            expect(byId.get(o.id).name).toBe(o.name);
        }
        // Spot-check the verdicts that decide the reported bug and its inverse.
        expect(byId.get(1).video).toBe(false);   // CD
        expect(byId.get(19).video).toBe(true);   // DVD-Video
        expect(byId.get(42).video).toBe(true);   // Enhanced CD
        expect(byId.get(13).video).toBe(null);   // Other
    });
});

// 📊 "Video info - Medium format" on the Video column: counts both sides of the
// flag and filters to them. Reads the same `data-mb-video-flag` attribute the
// tint and the ❌ read, via _findCellVideoMediumFlag().
const VIDEO_SECTION = 'Video info - Medium format';
const MISMATCH = '❌ video on a medium that cannot carry video';
const OK = '✅ video on a video-capable medium';

/**
 * Opens the Video column's 📊 dropdown and clicks one entry of the
 * "Video info - Medium format" section.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function checkVideoEntry(page, label) {
    await page.evaluate(() => window.__saTest.getUniqDropSections('Video'));
    await page.evaluate(({ section, entry }) => {
        const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === section);
        Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === entry).click();
    }, { section: VIDEO_SECTION, entry: label });
}

test.describe('unique-values dropdown: "Video info - Medium format"', () => {
    test('CD: ❌ counts the four video rows, no ✅ entry; checking ❌ leaves those four', async ({ page }) => {
        await openRelease(page, CD_URL, CD_FIXTURE);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Video'));
        const sec = sections.find((s) => s.label === VIDEO_SECTION);
        expect(sec).toBeTruthy();
        expect(sec.items.map((i) => [i.label, i.count])).toEqual([[MISMATCH, 4]]);

        await checkVideoEntry(page, MISMATCH);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((r) => r.style.display !== 'none').length === 4, null, { timeout: 15000 });
        const cells = await videoCells(page);
        expect(cells.map((c) => c.pos)).toEqual(['3', '4', '6', '10']);
        expect(cells.every((c) => c.flag === 'mismatch')).toBe(true);
    });

    test('DVD-Video: ✅ counts the five DVD videos, no ❌ entry', async ({ page }) => {
        await openRelease(page, DVD_URL, DVD_FIXTURE);
        // Sub-tables: the Video column exists on both mediums (decided
        // page-wide), and the dropdown counts the table it is opened on —
        // so open it on the DVD's table.
        const sections = await page.evaluate(() => {
            const dvdIdx = Array.from(document.querySelectorAll('table.tbl')).findIndex((t) => {
                let h = t.previousElementSibling;
                while (h && h.tagName !== 'H3') h = h.previousElementSibling;
                return !!h && h.textContent.includes('DVD-Video');
            });
            return dvdIdx < 0 ? null : window.__saTest.getUniqDropSections('Video', dvdIdx);
        });
        const sec = (sections || []).find((s) => s.label === VIDEO_SECTION);
        expect(sec).toBeTruthy();
        expect(sec.items.map((i) => [i.label, i.count])).toEqual([[OK, 5]]);
    });

    test('a re-opened panel (served from the dropdown cache) shows the same counts', async ({ page }) => {
        // The second open on an unchanged table is answered from
        // _getUniqDropDataCache() — the counts must be stored there too.
        await openRelease(page, CD_URL, CD_FIXTURE);
        const first = await page.evaluate(() => window.__saTest.getUniqDropSections('Video'));
        await page.evaluate(() => window.__saTest.closeUniqDrop());
        const second = await page.evaluate(() => window.__saTest.getUniqDropSections('Video'));
        const pick = (secs) => (secs.find((s) => s.label === VIDEO_SECTION) || { items: [] })
            .items.map((i) => [i.label, i.count]);
        expect(pick(first)).toEqual([[MISMATCH, 4]]);
        expect(pick(second)).toEqual(pick(first));
    });

    test('setting off: no section', async ({ page }) => {
        await openRelease(page, CD_URL, CD_FIXTURE, { sa_enable_release_tracks_video_medium_flag: false });
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Video'));
        expect(sections.map((s) => s.label)).not.toContain(VIDEO_SECTION);
    });
});
