'use strict';

// release-tracks: a track whose recording is not linked to any work (empty
// "Recording of work" cell) gets its Title cell marked like an over-threshold
// Length mismatch: the warning tint (sa_release_tracks_length_mismatch_warn_bg,
// default #fff3cd) and a ⚠️ ::after glyph, plus a tooltip. See
// _applyNoWorkFlag(). Like the LENGTH and Video flags it is attributes-only
// (`data-mb-work-flag="none"`), so it rides cloneNode(true) re-renders and
// travels through Save to Disk as the cell record's `workFlag` field.
//
// Fixture: "Live and Swingin': The Ultimate Rat Pack Collection", 25 tracks,
// 4 of them with no work ("Fanfare & Introduction" among them). See
// uniq-drop-title-anatomy.spec.js for the matching 📊 "Title info - Work" counts.

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const RELEASE_URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const SETTINGS = { sa_enable_release_tracks: true };
const NO_WORK = 4;
const WARN_BG = 'rgb(255, 243, 205)';

// Serving a saved page: MusicBrainz's own supported-browser-check.js throws,
// and a versioned bundle it references answers with an HTML error page.
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

/**
 * Every visible row's Title cell: its title text, flag, tooltip, computed
 * background/position and ::after glyph, plus whether the same row's
 * "Recording of work" cell links a work.
 *
 * @param {import('@playwright/test').Page} page
 */
const titleCells = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const tIdx = ths.findIndex((t) => t.dataset.colName === 'Title');
        const wIdx = ths.findIndex((t) => t.dataset.colName === 'Recording of work');
        if (tIdx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none') return;
            const td = tr.cells[tIdx];
            if (!td) return;
            const bdi = td.querySelector('a[href] bdi');
            const cs = getComputedStyle(td);
            out.push({
                title: bdi ? bdi.textContent : '',
                flag: td.dataset.mbWorkFlag || null,
                tip: td.title,
                bg: cs.backgroundColor,
                position: cs.position,
                glyph: getComputedStyle(td, '::after').content,
                hasWork: wIdx >= 0 && !!(tr.cells[wIdx] && tr.cells[wIdx].querySelector('a[href*="/work/"]')),
            });
        });
    });
    return out;
});

/** Opens a page on the release with the userscript and the given settings. */
async function openRelease(context, pageErrors, settings) {
    const page = await context.newPage();
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || '');
        if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
    });
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: settings });
    return page;
}

/** Runs "Show all Tracks" and waits for the render. */
async function showAll(page) {
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('release-tracks: "no associated work" Title flag', () => {
    let pageErrors;

    test.beforeEach(() => { pageErrors = []; });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('exactly the rows with an empty "Recording of work" are tinted with a ⚠️', async ({ context }) => {
        const page = await openRelease(context, pageErrors, SETTINGS);
        await showAll(page);
        const cells = await titleCells(page);
        expect(cells.length).toBe(25);

        const flagged = cells.filter((c) => c.flag === 'none');
        expect(flagged.length).toBe(NO_WORK);
        // The flag and the Recording of work column agree row by row.
        expect(cells.every((c) => (c.flag === 'none') === !c.hasWork)).toBe(true);
        expect(flagged.map((c) => c.title)).toContain('Fanfare & Introduction');

        for (const c of flagged) {
            expect(c.bg).toBe(WARN_BG);
            expect(c.glyph).toBe('"⚠️"');
            expect(c.tip).toContain('not linked to any work');
            // The sticky Title column stays sticky.
            expect(c.position).toBe('sticky');
        }
        for (const c of cells.filter((x) => !x.flag)) {
            expect(c.bg).not.toBe(WARN_BG);
            expect(c.glyph).toBe('none');
        }
    });

    test('the flag survives a filter re-render and stays out of the filter text', async ({ context }) => {
        const page = await openRelease(context, pageErrors, SETTINGS);
        await showAll(page);
        // The global filter is debounced, so poll for the settled result.
        await page.fill('#mb-global-filter-input', 'Fanfare');
        await expect.poll(async () => (await titleCells(page)).map((c) => [c.title, c.flag, c.bg]), { timeout: 15000 })
            .toEqual([['Fanfare & Introduction', 'none', WARN_BG]]);

        // The ⚠️ is CSS only: a filter for it matches no row.
        await page.fill('#mb-global-filter-input', '⚠️');
        await expect.poll(async () => (await titleCells(page)).length, { timeout: 15000 }).toBe(0);
    });

    test('switched off: nothing is tinted, the 📊 still counts the rows', async ({ context }) => {
        const page = await openRelease(context, pageErrors, { ...SETTINGS, sa_enable_release_tracks_no_work_flag: false });
        await showAll(page);
        const cells = await titleCells(page);
        expect(cells.filter((c) => c.flag).length).toBe(0);
        expect(cells.filter((c) => c.bg === WARN_BG).length).toBe(0);
        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Title'));
        const work = sections.find((s) => s.label === 'Title info - Work');
        expect(work.items.find((i) => i.label === '🚫 no associated work').count).toBe(NO_WORK);
    });
});

test.describe('release-tracks: "no associated work" flag survives Save to Disk → Load from Disk', () => {
    let pageErrors;
    let tmpDir;
    let saved;

    /** Saves the page through the real Save-to-Disk path; returns the file. */
    async function saveToDisk(page, dir, name) {
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(page, '#mb-save-to-disk-btn');
        await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await page.click('#sa-sd-save-confirm');
        const download = await downloadPromise;
        const file = path.join(dir, name);
        await download.saveAs(file);
        return file;
    }

    /** Load from Disk → "Render All Rows", on the page as it stands. */
    async function loadFromDisk(page, file) {
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }

    test.beforeEach(async ({ context }) => {
        pageErrors = [];
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-no-work-flag-'));
        const source = await openRelease(context, pageErrors, SETTINGS);
        await showAll(source);
        expect((await titleCells(source)).filter((c) => c.flag === 'none').length).toBe(NO_WORK);
        saved = await saveToDisk(source, tmpDir, 'live-and-swingin.json.gz');
        await source.close();
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened tracklist shows the same flagged titles', async ({ context }) => {
        const page = await openRelease(context, pageErrors, SETTINGS);
        await loadFromDisk(page, saved);
        const flagged = (await titleCells(page)).filter((c) => c.flag === 'none');
        expect(flagged.length).toBe(NO_WORK);
        expect(flagged.every((c) => c.bg === WARN_BG && c.tip.includes('not linked to any work'))).toBe(true);
    });

    test('a saved flag value other than "none" is not written into the DOM', async ({ context }) => {
        const tampered = path.join(tmpDir, 'tampered.json.gz');
        const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(saved)).toString('utf8'));
        let touched = 0;
        (data.groups ? data.groups.map((g) => g.rows) : [data.rows]).forEach((rows) => rows.forEach((cells) => cells.forEach((cell) => {
            if (cell.workFlag) { cell.workFlag = 'x" onmouseover="alert(1)'; touched++; }
        })));
        fs.writeFileSync(tampered, zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8')));
        expect(touched).toBe(NO_WORK);

        const page = await openRelease(context, pageErrors, SETTINGS);
        await loadFromDisk(page, tampered);
        expect((await titleCells(page)).filter((c) => c.flag).length).toBe(0);
    });
});
