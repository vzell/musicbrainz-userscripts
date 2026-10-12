'use strict';

// pageType 'event-overview' (org/event-overview-pt.org, WIP.3): the Video
// column, entity glyphs in the column headers, the setlist's "(with …)" links
// on the initial page, mixed-case MBIDs, and the `mbid-uppercase` finding.
//
// Fixtures (both raw captures, see event-overview.spec.js /
// event-overview-setlist.spec.js), each rewritten per test:
//   - tests/fixtures/event-overview.html (event 3f2ca30a-…): MusicBrainz's video
//     icon is planted on the "Badlands" recording, and a second relationship
//     ("shot for") to that same recording is added — as on event 4379731e-…
//     (debug/2024-05-23-initial.html), where "Thunder Road" is both;
//   - tests/fixtures/event-overview-with-artists.html (event cd595883-…): a song
//     and two "(with …)" artists get MBIDs typed with uppercase letters — as on
//     event 26cead1c-… (debug/2001-05-27-initial.html), where "The Fever" and
//     Bruce Springsteen are written "E497263c-…" / "70248960-Cb53-…".
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. VIDEO IS ITS OWN COLUMN, in "Recordings" and in the setlist table: right
//     after Recording, "video" on that row and "audio" on the others, and the
//     icon is gone from the Recording cell. "A Video column exists" passes on
//     code that copies the icon and leaves it in Recording too.
//  2. A RECORDING IS LISTED ONCE in a setlist row, though two relationships
//     name it. Counting rows in "Recordings" (which has both) cannot see it.
//  3. GLYPHS ARE IN THE HEADERS, NOT THE CELLS: every single-kind entity
//     column's header carries its glyph — after a re-render too, since
//     makeTableSortableUnified() rebuilds every header — and its cells carry
//     none; a country flag stays, and a mixed "Target" column keeps its cells'
//     glyphs. A header-only check passes on code that leaves the cell glyphs.
//  4. THE INITIAL PAGE LINKS "(WITH …)" ARTISTS AS ARTISTS, before any button,
//     and leaves the songs' links as works. The table tests pass without it.
//  5. A MIXED-CASE MBID IS STILL A WORK / AN ARTIST: the song is a work link in
//     Song (not plain text), the "(with …)" artist an /artist/ link — both
//     with their case kept, since the finding (6) reads it.
//  6. THE FINDING: the ⚠️ menu counts exactly the rows that carry it and
//     filters to them (and back); the cell is tinted with the ⚠️; the tint
//     setting turns the paint off but not the finding; Song and Additional
//     artists each offer it in 📊; the stamp survives a filter re-render and
//     a Save → Load round trip; a page without such an MBID has no menu row.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const BUTTON = 'button[data-label="Show all Relationships for Event"]';
const MAIN = {
    url: 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8',
    file: path.join(__dirname, 'event-overview.html'),
};
const WITH = {
    url: 'https://musicbrainz.org/event/cd595883-d26a-4e76-a033-eb588e0f9c55',
    file: path.join(__dirname, 'event-overview-with-artists.html'),
};
const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd, the default warn tint
const VIDEO = '<span class="video" title="This recording is a video"></span>';
const BADLANDS = '<a class="wrap-anywhere" href="/recording/0adb249e-86f9-4434-b064-0a61a328b67f">';

/**
 * Plants the video icon on "Badlands" and adds a "shot for" relationship to
 * the same recording (its line carries the icon too, as on the native page).
 *
 * @param {string} html
 * @returns {string}
 */
const withVideo = (html) => html
    .replace(`<span class="recordinglink"></span>${BADLANDS}`, `<span class="recordinglink"></span>${VIDEO}${BADLANDS}`)
    .replace('<tr><th>recording location for:</th>',
        `<tr><th>shot for:</th><td><span class="recordinglink"></span>${VIDEO}${BADLANDS}<bdi>Badlands</bdi></a><br></td></tr>` +
        '<tr><th>recording location for:</th>');

/**
 * Types two setlist MBIDs with uppercase letters: the song "Plane Wreck at Los
 * Gatos (Deportee)" and its "(with …)" artist Rosanne Cash (row 1), and the
 * artist Kenny Chesney (row 2, whose song keeps a lowercase MBID).
 *
 * @param {string} html
 * @returns {string}
 */
const withUppercase = (html) => html
    .replace('href="/work/c33ef12f-8cf9-4a6a-a5ff-ecd17bb019bd"', 'href="/work/C33ef12f-8cf9-4a6a-A5ff-ecd17bb019bd"')
    .replace('href="/work/5ff6f6eb-31ad-4903-a3c3-4c9283fcde8b"', 'href="/work/5FF6f6eb-31ad-4903-a3c3-4c9283fcde8b"')
    .replace('href="/work/5dca4d22-d6c8-4e70-8ca1-4543e43353c7"', 'href="/work/5dca4d22-D6c8-4e70-8ca1-4543e43353c7"');

/**
 * Loads an event fixture (optionally rewritten) and, unless `press` is false,
 * presses the button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{fixture?: {url: string, file: string}, rewrite?: function(string): string, settings?: Object, press?: boolean}} [opts]
 */
async function openEvent(page, { fixture = MAIN, rewrite = null, settings = {}, press = true } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    let fixtureFile = fixture.file;
    if (rewrite) {
        const html = fs.readFileSync(fixture.file, 'utf8');
        const out = rewrite(html);
        expect(out, 'premise: the rewrite found its targets').not.toBe(html);
        fixtureFile = path.join(__dirname, '..', '..', 'test-results', `event-vg-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
        fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
        fs.writeFileSync(fixtureFile, out);
    }
    await loadUserscriptPage(page, {
        url: fixture.url, fixtureFile, testMode: true,
        settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: true, ...settings },
    });
    await page.route('https://musicbrainz.org/event/**', (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (!press) return;
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * One rendered group's table: header names, header glyph classes, and per
 * column the cells' text, glyph spans and links.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name The group's h3 name.
 */
const table = (page, name) => page.evaluate((groupName) => {
    const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3')).find((h) => {
        const icon = h.querySelector('.mb-toggle-icon');
        return (icon && icon.nextSibling ? icon.nextSibling.textContent : h.textContent).trim() === groupName;
    });
    if (!h3) return null;
    let t = h3.nextElementSibling;
    while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
    const ths = Array.from(t.querySelectorAll('thead tr:first-child th'));
    const GLYPH = /^(artist|place|area|recording|release|rg|work|label|event|series)link$/;
    const glyphsIn = (el) => Array.from(el.querySelectorAll('span')).map((s) => Array.from(s.classList).find((c) => GLYPH.test(c))).filter(Boolean);
    return {
        index: Array.from(document.querySelectorAll('table.tbl')).indexOf(t),
        heads: ths.map((th) => (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊]/gu, '').trim()),
        headGlyphs: ths.map((th) => glyphsIn(th.querySelector('.mb-col-hdr-flex') || th)),
        rows: Array.from(t.querySelectorAll('tbody tr')).filter((tr) => tr.style.display !== 'none').map((tr) => Array.from(tr.cells).map((td) => ({
            text: td.textContent.replace(/\s+/g, ' ').trim(),
            glyphs: glyphsIn(td),
            video: td.querySelectorAll('span.video').length,
            flags: td.querySelectorAll('span.flag').length,
            hrefs: Array.from(td.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')),
        }))),
    };
}, name);

test.describe('pageType event-overview: Video, header glyphs, setlist links (WIP.3)', () => {
    test('Video is its own column in "Recordings" and the setlist; the icon leaves Recording', async ({ page }) => {
        await openEvent(page, { rewrite: withVideo });
        const rec = await table(page, 'Recordings');
        const rc = rec.heads.indexOf('Recording');
        expect(rec.heads[rc + 1], 'right after Recording').toBe('Video');
        const badlands = rec.rows.filter((r) => r[rc].text === 'Badlands');
        expect(badlands, 'premise: both relationships').toHaveLength(2);
        badlands.forEach((r) => {
            expect(r[rc + 1].text).toBe('video');
            expect(r[rc + 1].video, 'the icon is in Video').toBe(1);
        });
        expect(rec.rows.filter((r) => r[rc].text !== 'Badlands').every((r) => r[rc + 1].text === 'audio')).toBe(true);
        expect(rec.rows.every((r) => r[rc].video === 0), 'no icon left in Recording').toBe(true);

        const concert = await table(page, 'Setlist: Concert');
        const sc = concert.heads.indexOf('Recording');
        expect(concert.heads[sc + 1]).toBe('Video');
        const song = concert.rows.find((r) => r[sc].text === 'Badlands');
        expect(song[sc + 1].text).toBe('video');
        expect(song[sc].video).toBe(0);
        expect(concert.rows.filter((r) => r !== song).every((r) => r[sc + 1].text === 'audio')).toBe(true);
    });

    test('a recording named by two relationships is listed once in its setlist row', async ({ page }) => {
        await openEvent(page, { rewrite: withVideo });
        const concert = await table(page, 'Setlist: Concert');
        const sc = concert.heads.indexOf('Recording');
        const song = concert.rows.find((r) => r[sc].text.includes('Badlands'));
        expect(song[sc].hrefs).toEqual(['/recording/0adb249e-86f9-4434-b064-0a61a328b67f']);
    });

    test('entity glyphs sit in the headers, not on the cells — also after a re-render', async ({ page }) => {
        await openEvent(page);
        const expectGlyph = async (group, col, glyph) => {
            const t = await table(page, group);
            const i = t.heads.indexOf(col);
            expect(i, `${group}: ${col} exists`).toBeGreaterThanOrEqual(0);
            expect(t.headGlyphs[i], `${group}: ${col} header`).toEqual([glyph]);
            expect(t.rows.every((r) => !r[i].glyphs.includes(glyph)), `${group}: no ${glyph} on a ${col} cell`).toBe(true);
            return { t, i };
        };
        await expectGlyph('Artists', 'Artist', 'artistlink');
        const places = await expectGlyph('Places', 'Place', 'placelink');
        const area = await expectGlyph('Places', 'Area', 'arealink');
        expect(area.t.rows[0][area.i].flags, 'the country flag stays').toBe(1);
        expect(places.t.headGlyphs[places.t.heads.indexOf('Relationship')], 'a plain column has none').toEqual([]);
        await expectGlyph('Recordings', 'Recording', 'recordinglink');
        await expectGlyph('Recordings', 'Artist', 'artistlink');
        await expectGlyph('Releases', 'Release', 'releaselink');
        await expectGlyph('Series', 'Series', 'serieslink');
        await expectGlyph('Setlist: Line-up', 'Artist', 'artistlink');
        await expectGlyph('Setlist: Concert', 'Song', 'worklink');
        await expectGlyph('Setlist: Concert', 'Recording', 'recordinglink');

        const via = await table(page, 'Via 2023–25 International Tour');
        const vt = via.heads.indexOf('Target');
        expect(via.headGlyphs[vt], 'a mixed column has no header glyph').toEqual([]);
        expect(via.rows.some((r) => r[vt].glyphs.length > 0), 'and its cells keep theirs').toBe(true);

        // A filter re-render rebuilds every header (makeTableSortableUnified()).
        await page.fill('#mb-global-filter-input', 'Badlands');
        await expect.poll(async () => (await table(page, 'Recordings')).rows.length, { timeout: 15000 }).toBe(1);
        await expectGlyph('Recordings', 'Recording', 'recordinglink');
    });

    test('the initial page links the "(with …)" artists as artists, before any button', async ({ page }) => {
        await openEvent(page, { fixture: WITH, press: false });
        const links = await page.evaluate(() => {
            const p = document.querySelector('#content p.setlist');
            const out = { withArtists: [], songs: [] };
            let afterWith = false;
            p.childNodes.forEach((n) => {
                if (n.nodeName === 'BR') { afterWith = false; return; }
                if (n.nodeType === Node.TEXT_NODE && /\(\s*with\s/i.test(n.textContent)) afterWith = true;
                if (n.nodeName === 'A') (afterWith ? out.withArtists : out.songs).push(n.getAttribute('href'));
            });
            return out;
        });
        expect(links.withArtists.length, 'premise: the setlist has "(with …)" artists').toBeGreaterThan(5);
        expect(links.withArtists.every((h) => h.startsWith('/artist/')), links.withArtists.join(' ')).toBe(true);
        expect(links.songs.length).toBeGreaterThan(0);
        expect(links.songs.every((h) => h.startsWith('/work/')), 'the songs stay works').toBe(true);
    });

    test('a mixed-case MBID is still a work in Song and an artist in Additional artists, case kept', async ({ page }) => {
        await openEvent(page, { fixture: WITH, rewrite: withUppercase });
        const songs = await table(page, 'Setlist: Songs');
        const sc = songs.heads.indexOf('Song');
        const ac = songs.heads.indexOf('Additional artists');
        const plane = songs.rows.find((r) => r[sc].text.startsWith('Plane Wreck'));
        expect(plane[sc].hrefs, 'a work link, not plain text').toEqual(['/work/C33ef12f-8cf9-4a6a-A5ff-ecd17bb019bd']);
        expect(plane[ac].hrefs).toEqual(['/artist/5FF6f6eb-31ad-4903-a3c3-4c9283fcde8b']);
        const kenny = songs.rows.find((r) => r[ac].text === 'Kenny Chesney');
        expect(kenny[ac].hrefs).toEqual(['/artist/5dca4d22-D6c8-4e70-8ca1-4543e43353c7']);
    });
});

test.describe('finding mbid-uppercase (WIP.3)', () => {
    /**
     * The cells carrying the finding: their column, level and look.
     *
     * @param {import('@playwright/test').Page} page
     */
    const flagged = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-findings~="mbid-uppercase"]'))
        .filter((td) => td.closest('tr').style.display !== 'none')
        .map((td) => {
            const th = td.closest('table').querySelectorAll('thead tr:first-child th')[td.cellIndex];
            return {
                col: (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊]/gu, '').trim(),
                level: td.dataset.mbFinding || null,
                bg: getComputedStyle(td).backgroundColor,
                after: getComputedStyle(td, '::after').content,
                title: td.title,
            };
        }));

    test('the ⚠️ menu counts the rows, filters to them and back; the cells are tinted', async ({ page }) => {
        await openEvent(page, { fixture: WITH, rewrite: withUppercase });
        const cells = await flagged(page);
        expect(cells.map((c) => c.col).sort()).toEqual(['Additional artists', 'Additional artists', 'Song']);
        cells.forEach((c) => {
            expect(c.level).toBe('warn');
            expect(c.bg).toBe(WARN_BG);
            expect(c.after).toBe('"⚠️"');
        });
        expect(cells.find((c) => c.col === 'Song').title, 'the tooltip names the MBID').toContain('C33ef12f-8cf9-4a6a-A5ff-ecd17bb019bd');

        const rowsWith = (await findingRowState(page, 'mbid-uppercase')).withFinding;
        expect(rowsWith, 'premise: Plane Wreck and This Land Is Your Land (Kenny Chesney)').toBe(2);
        const total = (await findingRowState(page)).visible;
        expect((await findingRow(page, 'warn', 'mbid-uppercase'))?.count, 'one per ROW, not per cell').toBe(rowsWith);

        await clickFinding(page, 'mbid-uppercase');
        await expect.poll(async () => (await findingRowState(page, 'mbid-uppercase')).visible, { timeout: 15000 }).toBe(rowsWith);
        expect((await findingRowState(page, 'mbid-uppercase')).withFinding).toBe(rowsWith);
        await clickFinding(page, 'mbid-uppercase');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(total);
    });

    test('Song and Additional artists each offer it in 📊 "Findings - Warning"', async ({ page }) => {
        await openEvent(page, { fixture: WITH, rewrite: withUppercase });
        const songs = await table(page, 'Setlist: Songs');
        for (const [col, n] of [['Song', 1], ['Additional artists', 2]]) {
            const sections = await page.evaluate(([c, i]) => window.__saTest.getUniqDropSections(c, i), [col, songs.index]);
            const sec = (sections || []).find((s) => s.label === 'Findings - Warning');
            expect(sec, `${col}: the section exists`).toBeTruthy();
            const item = sec.items.find((i) => i.label.includes('MBID contains uppercase letters'));
            expect(item?.count, `${col}: its cells`).toBe(n);
        }
    });

    test('the tint setting turns the paint off, not the finding', async ({ page }) => {
        await openEvent(page, { fixture: WITH, rewrite: withUppercase, settings: { sa_findings_tint_mbid_case: false } });
        const cells = await flagged(page);
        expect(cells.length, 'still detected').toBe(3);
        cells.forEach((c) => {
            expect(c.level).toBeNull();
            expect(c.bg).not.toBe(WARN_BG);
        });
        expect((await findingRow(page, 'warn', 'mbid-uppercase'))?.count, 'the menu still offers it').toBe(2);
    });

    test('the stamp survives a filter re-render and a Save → Load round trip', async ({ page, context }) => {
        await openEvent(page, { fixture: WITH, rewrite: withUppercase });
        await page.fill('#mb-global-filter-input', 'Plane Wreck');
        await expect.poll(async () => (await flagged(page)).length, { timeout: 15000 }).toBe(2);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await flagged(page)).length, { timeout: 15000 }).toBe(3);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-event-vg-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const reopened = await context.newPage();
            await openEvent(reopened, { fixture: WITH, press: false });
            await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
            await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(reopened, { waitForAutoResize: false });
            expect((await flagged(reopened)).length).toBe(3);
            expect((await findingRow(reopened, 'warn', 'mbid-uppercase'))?.count).toBe(2);
            const songs = await table(reopened, 'Setlist: Songs');
            const sc = songs.heads.indexOf('Song');
            expect(songs.headGlyphs[sc], 'header glyphs come back on a disk load too').toEqual(['worklink']);
            await reopened.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('a setlist with lowercase MBIDs only: no finding, no menu row', async ({ page }) => {
        await openEvent(page, { fixture: WITH });
        expect(await flagged(page)).toEqual([]);
        expect(await findingRow(page, 'warn', 'mbid-uppercase')).toBeUndefined();
    });
});
