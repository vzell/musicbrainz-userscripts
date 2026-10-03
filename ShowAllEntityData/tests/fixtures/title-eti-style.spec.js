'use strict';

// Extra title information rendered in green italics (styleTitleEti(),
// _styleTitleEtiEl()), the way the Vocals column draws a credit attribute
// such as "background" (.mb-credit-attr, sa_credit_attr_color).
//
// Guarantees pinned, each against its neighbour:
//   - placement: exactly the text of every group the parser calls ETI is
//     wrapped, brackets OUTSIDE the span; an alternative title in brackets
//     (even one in front of an ETI group) is not;
//   - look: computed colour and font-style, not only the class;
//   - transparency: the span changes no text a filter sees — a typed filter
//     spanning the bracket still matches its row AND is highlighted in full;
//   - reach: the span is on the SOURCE rows — a multi-table re-render (clones)
//     still has it, and Save to Disk → Load from Disk neither loses nor
//     doubles it;
//   - the setting: off → no span is written, and a span restored from disk is
//     drawn plain.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

// "Seren E.P.": five of six tracks carry ETI, two of them capitalized-name
// remixes ("Moonitor remix", "Psyche remix"); "Come Alive" has none. One
// table.
const REMIX_URL = 'https://musicbrainz.org/release/f6215982-62e1-4b81-b88f-754dca0da149';
const REMIX_FIXTURE = path.join(__dirname, 'release-tracks-remix-eti.html');
// "NOW Yearbook: The Vault 1986" (debug/ETI.html): three sub-tables;
// "I Do What I Do (Theme for 9 1/2 Weeks) (7” version)" puts an alternative
// title in front of the ETI group, "I’m Not Perfect (but I’m Perfect for
// You)" has a bracket group that is not ETI at all.
const NOW86_URL = 'https://musicbrainz.org/release/5cf63c93-e27e-4d98-81bc-9aba8b6861a7';
const NOW86_FIXTURE = path.join(__dirname, 'release-tracks-eti-keywords.html');

const GREEN = 'rgb(46, 125, 50)';   // #2e7d32, sa_credit_attr_color's default

// Serving a saved page: MusicBrainz's own supported-browser-check.js throws,
// and a versioned bundle it references answers with an HTML error page.
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

/**
 * Loads a release fixture and, unless `render` is false, runs "Show all Tracks".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixtureFile
 * @param {Object} [settingsOverride]
 * @param {boolean} [render]
 */
async function openRelease(page, url, fixtureFile, settingsOverride = {}, render = true) {
    await loadUserscriptPage(page, {
        url, fixtureFile, testMode: true,
        settingsOverride: { sa_enable_release_tracks: true, ...settingsOverride },
    });
    if (!render) return;
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every rendered Title cell's title element: its text, how it splits around
 * each `.mb-title-eti` span (the character before and after it), and the
 * span's computed look.
 *
 * @param {import('@playwright/test').Page} page
 */
const titleEti = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const idx = ths.findIndex((t) => t.dataset.colName === 'Title');
        if (idx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.cells[idx]) return;
            const bdi = tr.cells[idx].querySelector('a[href] bdi');
            if (!bdi) return;
            const spans = Array.from(bdi.querySelectorAll('.mb-title-eti'));
            const text = bdi.textContent;
            out.push({
                title: text,
                eti: spans.map((s) => {
                    // The text right around the span, read off the title
                    // element's own text by position.
                    const range = document.createRange();
                    range.selectNodeContents(bdi);
                    range.setEndBefore(s);
                    const at = range.toString().length;
                    return {
                        text: s.textContent,
                        before: text[at - 1],
                        after: text[at + s.textContent.length],
                        color: getComputedStyle(s).color,
                        fontStyle: getComputedStyle(s).fontStyle,
                    };
                }),
            });
        });
    });
    return out;
});

/** Visible rows across every table, excluding the column-filter row. */
const visibleRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('mb-col-filter-row')).length);

test.describe('ETI in green italics', () => {
    test('every ETI group\'s text is wrapped, brackets outside, green and italic', async ({ page }) => {
        await openRelease(page, REMIX_URL, REMIX_FIXTURE);
        const rows = await titleEti(page);
        const withEti = rows.filter((r) => r.eti.length);
        expect(withEti.map((r) => r.eti.map((e) => e.text)).flat().sort()).toEqual(
            ['Moonitor remix', 'Psyche remix', 'album version', 'edit', 'single version']);
        withEti.forEach((r) => r.eti.forEach((e) => {
            expect(e.before, `"(" stays outside in ${r.title}`).toBe('(');
            expect(e.after, `")" stays outside in ${r.title}`).toBe(')');
            expect(e.color).toBe(GREEN);
            expect(e.fontStyle).toBe('italic');
        }));
        // The one track without ETI has no span.
        expect(rows.filter((r) => !r.eti.length).map((r) => r.title)).toEqual(['Come Alive']);
    });

    test('only the parser\'s ETI: not an alternative title, not one in front of an ETI group', async ({ page }) => {
        await openRelease(page, NOW86_URL, NOW86_FIXTURE);
        const byTitle = Object.fromEntries((await titleEti(page)).map((r) => [r.title, r.eti.map((e) => e.text)]));
        expect(byTitle['I Do What I Do (Theme for 9 1/2 Weeks) (7” version)']).toEqual(['7” version']);
        expect(byTitle['Mothers Talk (U.S. remix)']).toEqual(['U.S. remix']);
        // A lowercase minor word starts it: part of the name, not ETI.
        expect(byTitle['I’m Not Perfect (but I’m Perfect for You)']).toEqual([]);
    });

    test('a typed filter across the bracket still matches its row and is highlighted in full', async ({ page }) => {
        await openRelease(page, REMIX_URL, REMIX_FIXTURE);
        await page.fill('#mb-global-filter-input', 'These (Moonitor remix)');
        await expect.poll(() => visibleRows(page), { timeout: 15000 }).toBe(1);
        const marked = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl tbody tr:not(.mb-col-filter-row) .mb-global-filter-highlight, ' +
                'table.tbl tbody tr:not(.mb-col-filter-row) .mb-column-filter-highlight'))
            .filter((s) => s.closest('tr').style.display !== 'none')
            .map((s) => s.textContent).join(''));
        expect(marked, 'every character of the query is marked').toBe('These (Moonitor remix)');
    });

    test('the span is on the source rows: a multi-table re-render keeps it', async ({ page }) => {
        await openRelease(page, NOW86_URL, NOW86_FIXTURE);
        const before = (await titleEti(page)).filter((r) => r.eti.length).length;
        expect(before).toBeGreaterThan(0);
        await page.fill('#mb-global-filter-input', 'version');
        await expect.poll(async () => (await titleEti(page)).every((r) => r.eti.length > 0),
            { timeout: 15000, message: 'every row left by "version" still has its span' }).toBe(true);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await titleEti(page)).filter((r) => r.eti.length).length,
            { timeout: 15000, message: 'all of them, back' }).toBe(before);
    });

    test('switched off: no span is written', async ({ page }) => {
        await openRelease(page, REMIX_URL, REMIX_FIXTURE, { sa_enable_title_eti_style: false });
        const rows = await titleEti(page);
        expect(rows.length).toBe(6);
        expect(rows.every((r) => r.eti.length === 0)).toBe(true);
    });
});

test.describe('ETI style survives Save to Disk → Load from Disk', () => {
    let pageErrors;
    let tmpDir;

    test.beforeEach(() => {
        pageErrors = [];
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-title-eti-'));
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    /**
     * A new page in `context`, collecting the userscript's own page errors.
     *
     * @param {import('@playwright/test').BrowserContext} context
     */
    const newPage = async (context) => {
        const page = await context.newPage();
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
        return page;
    };

    /**
     * Saves the page through the real Save-to-Disk path; returns the file.
     *
     * @param {import('@playwright/test').Page} page
     */
    const saveToDisk = async (page) => {
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(page, '#mb-save-to-disk-btn');
        await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await page.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'seren.json.gz');
        await (await downloadPromise).saveAs(saved);
        return saved;
    };

    /**
     * Load from Disk → "Render All Rows".
     *
     * @param {import('@playwright/test').Page} page
     * @param {string} file
     */
    const loadFromDisk = async (page, file) => {
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
    };

    test('a reopened tracklist has every span once, and drawn plain when switched off', async ({ context }) => {
        const source = await newPage(context);
        await openRelease(source, REMIX_URL, REMIX_FIXTURE);
        const before = await titleEti(source);
        expect(before.filter((r) => r.eti.length).length).toBe(5);
        const saved = await saveToDisk(source);
        await source.close();

        const page = await newPage(context);
        await openRelease(page, REMIX_URL, REMIX_FIXTURE, {}, false);
        await loadFromDisk(page, saved);
        expect(await titleEti(page), 'the same spans, not wrapped twice').toEqual(before);

        const off = await newPage(context);
        await openRelease(off, REMIX_URL, REMIX_FIXTURE, { sa_enable_title_eti_style: false }, false);
        await loadFromDisk(off, saved);
        const restored = (await titleEti(off)).flatMap((r) => r.eti);
        expect(restored.length, 'the saved spans are in the cells').toBe(5);
        restored.forEach((e) => {
            expect(e.color).not.toBe(GREEN);
            expect(e.fontStyle).toBe('normal');
        });
    });
});
