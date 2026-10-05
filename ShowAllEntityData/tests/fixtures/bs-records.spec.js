'use strict';

// brucespringsteen.it record database ('bs-records'), opt-in via
// sa_enable_brucespringsteen. records.aspx lists one <p> per record for the
// query's `tipe=` (unofficial -1 / official -2, then the ticked formats). The
// page offers two buttons, Unofficial and Official; each FETCHES the list of
// its kind with every format ticked, and applyBsRecordsToTable() turns the
// fetched records into the table — the live page (here the frameset's default,
// Vinyl LP only) only gets an empty table in place of its own records. Only
// records.aspx opened as its own tab is converted. Fixtures:
// scripts/build-bs-fixtures.py (raw curl captures in debug/). See
// docs/claude/brucespringsteen.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const {
    BS_FIXTURES, ALL_FORMATS, loadBsRecordsPage, loadBsFramesetPage, renderedBsRows, renderedBsHeaders,
} = require('../support/bsFixture');
const { waitForRenderComplete } = require('../support/browser');
const { columnFilterInput } = require('../support/filterSortAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');

const HEADERS = {
    unofficial: ['Title', 'Matrix', 'Format', 'Label', 'Code', 'Notes'],
    official: ['Title', 'Catalogue', 'Format', 'Country', 'Promo', 'Code', 'Notes'],
};

/**
 * The fixture's own "N RESULTS:" count, read from the file rather than
 * written down, so a re-captured fixture cannot leave this spec checking a
 * stale number.
 * @param {string} file
 * @returns {number}
 */
function announced(file) {
    return parseInt(fs.readFileSync(file, 'utf8').match(/(\d+) RESULTS:/)[1], 10);
}

/**
 * Collects uncaught page errors, so every test can end by asserting none.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Presses one of the two buttons and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {('Unofficial'|'Official')} label
 */
async function show(page, label) {
    await page.click(`h1.mb-bs-h1 button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Reads the site's filter form: which format boxes are ticked, and which
 * kind radio is selected.
 * @param {import('@playwright/test').Page|import('@playwright/test').Frame} page
 * @returns {Promise<{checked: string[], un: ?string}>}
 */
function formState(page) {
    return page.evaluate(() => {
        const form = document.querySelector('form[name="mio"]');
        return {
            checked: Array.from(form.querySelectorAll('input[type="checkbox"]')).filter((b) => b.checked).map((b) => b.name),
            un: form.querySelector('input[name="UN"]:checked')?.value || null,
        };
    });
}

const ALL_BOXES = ALL_FORMATS.split(',').map((c) => `C${c}`);

test('the fixtures are what the spec assumes', () => {
    // The live page is the frameset's default list, whose own onload ticks
    // Vinyl LP (C4) only — so "every box ticked" is the script's doing.
    expect(fs.readFileSync(BS_FIXTURES.lp, 'utf8')).toContain('onLoad="setup(\'-1,4\',0,0);"');
    expect(announced(BS_FIXTURES.unofficial)).toBe(1878);
    expect(announced(BS_FIXTURES.official)).toBe(1186);
});

test.describe('brucespringsteen.it opt-in and frame gates', () => {
    test('with the setting off, the page is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        await loadBsRecordsPage(page, { enabled: false });

        await expect.poll(() => logs.some((t) => t.includes('brucespringsteen.it support is off')), {
            timeout: 10000, message: 'the gate logs why it stopped',
        }).toBe(true);
        expect(await page.locator('h1').count()).toBe(0);
        expect(await page.locator('button[data-label]').count()).toBe(0);
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(await page.locator('a[href*="detrec.aspx?code="]').count()).toBe(announced(BS_FIXTURES.lp));
        // The site's own onload state is left as it was: Vinyl LP only.
        expect(await formState(page)).toEqual({ checked: ['C4'], un: '-1' });
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-bs'))).toBe(false);
        expect(errors).toEqual([]);
    });

    test('inside the Blegsdx.htm frameset the list frame is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        const frame = await loadBsFramesetPage(page);

        await expect.poll(() => logs.some((t) => t.includes('inside the Blegsdx.htm frameset')), {
            timeout: 10000, message: 'the frame gate logs why it stopped',
        }).toBe(true);
        expect(await frame.locator('h1').count()).toBe(0);
        expect(await frame.locator('table.tbl').count()).toBe(0);
        expect(await formState(frame)).toEqual({ checked: ['C4'], un: '-1' });
        expect(errors).toEqual([]);
    });

    test('with the setting on: two buttons, every format ticked, nothing else yet', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBsRecordsPage(page);
        await expect(page.locator('h1.mb-bs-h1 > bdi')).toHaveText('brucespringsteen.it — Bootleg database');
        const labels = await page.locator('h1.mb-bs-h1 button[data-label]').evaluateAll((bs) => bs.map((b) => b.dataset.label));
        expect(labels).toEqual(['Unofficial', 'Official']);
        expect(await formState(page)).toEqual({ checked: ALL_BOXES, un: '-1' });
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(await page.locator('a[href*="detrec.aspx?code="]').count()).toBe(announced(BS_FIXTURES.lp));
        expect(errors).toEqual([]);
    });
});

test.describe('bs-records: Unofficial', () => {
    let errors;
    let served;

    test.beforeEach(async ({ page }) => {
        errors = trackPageErrors(page);
        ({ served } = await loadBsRecordsPage(page));
        await show(page, 'Unofficial');
    });

    test.afterEach(() => {
        expect(errors).toEqual([]);
    });

    test('every unofficial record of every format, fetched, in one table', async ({ page }) => {
        const fetched = served.map((u) => new URL(u)).filter((u) => u.searchParams.get('tipe') !== '-1,4');
        expect(fetched).toHaveLength(1);
        expect(fetched[0].searchParams.get('tipe')).toBe(`-1,${ALL_FORMATS}`);
        expect(fetched[0].searchParams.get('sort')).toBe('0');
        expect(fetched[0].searchParams.get('addon')).toBe('0');

        expect(await renderedBsHeaders(page)).toEqual(HEADERS.unofficial);
        // All 1878, not the live page's 416 LPs: the live records are gone,
        // and nothing of them is in the table.
        expect(await renderedBsRows(page)).toHaveLength(announced(BS_FIXTURES.unofficial));
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(await page.locator('p a[href*="detrec.aspx?code="]').count()).toBe(0);
        await expect(page.locator('h2.mb-bs-list-heading')).toHaveCount(1);
        expect(await formState(page)).toEqual({ checked: ALL_BOXES, un: '-1' });

        // The site has no MusicBrainz CSS; the table look shared with the
        // other foreign hosts (_ensureForeignTableStyle()) applies here too.
        expect(await page.evaluate(() => {
            const cs = getComputedStyle(document.querySelector('table.mb-bs-table tbody td'));
            return `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor} / ${cs.paddingLeft}`;
        })).toBe('1px solid rgb(221, 221, 221) / 6px');
    });

    test('record fields land in their own columns', async ({ page }) => {
        const byCode = Object.fromEntries((await renderedBsRows(page)).map((r) => [r.Code, r]));
        expect(byCode.CR1AD1).toMatchObject({
            Title: '1001 AMERICAN DREAMS', Matrix: '2211/12', Format: '2 CD-R', Label: 'Anubis Records', Notes: '',
            _href: 'https://www.brucespringsteen.it/DB/detrec.aspx?code=CR1AD1', _target: '_blank',
        });
        // "Mx : " with spaces.
        expect(byCode.CDTYLHSSTB1).toMatchObject({ Matrix: 'ON TOUR20211', Format: '3 CD', Label: 'Red line' });
        // A note line, and the site's "(copy/repress)" kept in the title.
        expect(byCode.LPAITS3).toMatchObject({
            Title: 'ACTION IN THE STREET(copy/repress)', Matrix: 'BS1515', Notes: 'Monochrome picture',
        });
        // A label with its own parentheses stays whole.
        expect(byCode.CRAGN1).toMatchObject({ Label: 'UPC (?)', Format: '3 CD-R' });
        // No matrix line at all (and an unclosed <b> in the site's markup).
        expect(byCode.COL6629497L).toMatchObject({ Title: 'THE GHOST OF TOM JOAD / STRAIGHT TIME', Matrix: '', Label: 'Unknown' });
        // UTF-8 decoded as the server declares it, not as the meta tag claims.
        expect(Object.values(byCode).some((r) => r.Title.includes('…'))).toBe(true);
        expect(Object.values(byCode).some((r) => r.Title.includes('â€'))).toBe(false);
    });

    test('a Label column filter narrows the rows', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.unofficial.indexOf('Label'));
        await input.click();
        await input.pressSequentially('Anubis');
        // Two labels contain it: "Anubis Records" and "PiggAnubis".
        await expect.poll(async () => [...new Set((await renderedBsRows(page)).map((r) => r.Label))].sort(), {
            timeout: 15000, message: 'only the labels containing "Anubis" remain',
        }).toEqual(['Anubis Records', 'PiggAnubis']);
    });
});

test.describe('bs-records: Official', () => {
    let errors;
    let served;

    test.beforeEach(async ({ page }) => {
        errors = trackPageErrors(page);
        ({ served } = await loadBsRecordsPage(page));
        await show(page, 'Official');
    });

    test.afterEach(() => {
        expect(errors).toEqual([]);
    });

    test('every official record of every format, with the official columns', async ({ page }) => {
        const fetched = served.map((u) => new URL(u)).filter((u) => u.searchParams.get('tipe') !== '-1,4');
        expect(fetched.map((u) => u.searchParams.get('tipe'))).toEqual([`-2,${ALL_FORMATS}`]);
        expect(await renderedBsHeaders(page)).toEqual(HEADERS.official);
        expect(await renderedBsRows(page)).toHaveLength(announced(BS_FIXTURES.official));
        expect(await formState(page)).toEqual({ checked: ALL_BOXES, un: '-2' });
    });

    test('country, catalogue number, promo flag and notes', async ({ page }) => {
        const byCode = Object.fromEntries((await renderedBsRows(page)).map((r) => [r.Code, r]));
        expect(byCode.COL3102742).toMatchObject({
            Title: '10TH AVENUE FREEZE OUT (MONO/STEREO)', Catalogue: 'COL 3-10274', Format: '1 7 in.',
            Country: 'USA', Promo: '', Notes: '',
        });
        expect(byCode.CBS39404).toMatchObject({ Country: 'Germany', Promo: 'yes', Catalogue: 'CBS 3940' });
        // "Catalogue:" without spaces, and the italic note line.
        expect(byCode['57LOWER-LS']).toMatchObject({
            Catalogue: 'COL 658138 7', Country: 'Holland',
            Notes: 'Lower \'Bruce Springsteen\' - Little Steven Mix',
        });
        const rows = Object.values(byCode);
        expect(rows.filter((r) => r.Promo === 'yes').length).toBeGreaterThan(0);
        expect(rows.filter((r) => /PROMO/.test(r.Country + r.Format))).toEqual([]);
    });

    test('a Country column filter narrows the rows', async ({ page }) => {
        const input = columnFilterInput(page, HEADERS.official.indexOf('Country'));
        await input.click();
        await input.pressSequentially('Japan');
        await expect.poll(async () => [...new Set((await renderedBsRows(page)).map((r) => r.Country))], {
            timeout: 15000, message: 'only Japan remains',
        }).toEqual(['Japan']);
    });
});

test('bs-records: a predefined-filter link (same path, other query) asks first', async ({ page }) => {
    const errors = trackPageErrors(page);
    await loadBsRecordsPage(page);
    await show(page, 'Unofficial');
    const dialogs = [];
    page.on('dialog', (d) => {
        dialogs.push(d.message());
        d.dismiss();
    });
    await page.locator('a[href^="records.aspx?tipe=-1,9"]').click();
    await expect.poll(() => dialogs.length, { timeout: 10000, message: 'the leave-page guard asks' }).toBe(1);
    expect(dialogs[0]).toContain('You are about to leave this page');
    expect(await renderedBsRows(page)).toHaveLength(announced(BS_FIXTURES.unofficial));
    expect(errors).toEqual([]);
});

test('bs-records: nothing is requested from MusicBrainz or the Cover Art Archive', async ({ page }) => {
    const { requests } = await loadBsRecordsPage(page, {
        settingsOverride: { sa_enable_caa_pics: true, sa_enable_relationships_column: true },
    });
    await show(page, 'Official');
    expect(await renderedBsRows(page)).toHaveLength(announced(BS_FIXTURES.official));
    expect(requests.filter((u) => /\/ws\/2\/|musicbrainz\.(org|eu)|coverartarchive\.org|eventartarchive\.org/.test(u))).toEqual([]);
});

test.describe('brucespringsteen.it: Save to Disk → Load from Disk', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bs-disk-'));
    });

    test.afterEach(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened Official list renders in place on a fresh page', async ({ context }) => {
        const source = await context.newPage();
        const sourceErrors = trackPageErrors(source);
        await loadBsRecordsPage(source);
        await show(source, 'Official');
        const before = (await renderedBsRows(source)).map((r) => r.Code).sort();
        expect(before).toHaveLength(announced(BS_FIXTURES.official));

        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bs-records.json.gz');
        await (await downloadPromise).saveAs(saved);
        expect(sourceErrors).toEqual([]);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        const consoleTexts = [];
        page.on('console', (m) => consoleTexts.push(m.text()));
        await loadBsRecordsPage(page);
        expect(await page.locator('a[href*="detrec.aspx?code="]').count(), 'a fresh page holds its own records again')
            .toBe(announced(BS_FIXTURES.lp));

        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect(await renderedBsHeaders(page)).toEqual(HEADERS.official);
        expect((await renderedBsRows(page)).map((r) => r.Code).sort()).toEqual(before);
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(await page.locator('table.mb-bs-table').count()).toBe(1);
        expect(await page.locator('p a[href*="detrec.aspx?code="]').count()).toBe(0);
        await expect(page.locator('h2.mb-bs-list-heading')).toHaveCount(1);
        expect(consoleTexts.filter((t) => t.includes('no records found'))).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test('_bsParseHead handles the first-line shapes the site writes', async ({ page }) => {
    await loadBsRecordsPage(page);
    const out = await page.evaluate(() => {
        const f = window.__saTest.bsParseHead;
        return [
            f('2 CD-R (Anubis Records) '),
            f('1 7 in. (Germany) PROMO'),
            f('3 CD-R (UPC (?))'),
            f('4 CD (Scorpion (Scorpio?))'),
            f('CD 3 in.'),
            f('  2   LP   (Zebra Records)  '),
        ];
    });
    expect(out).toEqual([
        { format: '2 CD-R', party: 'Anubis Records', promo: false },
        { format: '1 7 in.', party: 'Germany', promo: true },
        { format: '3 CD-R', party: 'UPC (?)', promo: false },
        { format: '4 CD', party: 'Scorpion (Scorpio?)', promo: false },
        { format: 'CD 3 in.', party: '', promo: false },
        { format: '2 LP', party: 'Zebra Records', promo: false },
    ]);
});
