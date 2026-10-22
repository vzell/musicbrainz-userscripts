'use strict';

// The 'annotation-version' pageType (2026-10-21): one version of an entity's
// annotation (/<kind>/<mbid>/annotation/<n>, or the current one without the
// number) compared with the current version, block by block, from the
// page's own JSON (applyAnnotationCompareToTables()).
//
// Guarantees pinned, each against its neighbour:
//   - the page is recognised and its button renders two groups, "This
//     version" (who, when, which) and "Compared with the current version";
//   - the STATUS of each block is right, not just "some rows exist": an old
//     release version whose one paragraph was rewritten (plain "-" → "‐")
//     and to which a heading and a paragraph were added reads changed /
//     added / added, in that order, with the section of the added
//     paragraph being the added heading;
//   - a changed row carries the rich comparison card, the two texts one
//     under the other;
//   - the current version compares equal throughout, and says so;
//   - the native annotation stays, its own wiki heading included;
//   - nothing is asked beyond the page itself;
//   - a Save to Disk → Load from Disk round trip shows the same statuses
//     (the converter runs on the reloaded page too).
//
// Fixtures (scripts/fetch-mb-page-fixture.js, logged out, 2026-10-21):
// release-annotation-version.html (release 3ec14d03-…, version 810603),
// release-annotation-current.html (its current version),
// artist-annotation-version.html (artist 70248960-…, version 630690).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const REL = 'https://musicbrainz.org/release/3ec14d03-2c03-4764-a69d-8155817a040f';
const BUTTON = 'button[data-label="Compare with the current version"]';

/**
 * Loads an annotation page from its fixture, renders it, and logs every
 * musicbrainz.org request other than the page itself.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @returns {Promise<{other: string[]}>}
 */
async function openAndRender(page, url, fixture) {
    const file = path.join(__dirname, fixture);
    const log = { other: [] };
    await loadUserscriptPage(page, { url, fixtureFile: file, testMode: true });
    await page.route(`${url}*`, (r) => r.fulfill({ path: file, contentType: 'text/html' }));
    page.on('request', (r) => {
        const u = r.url();
        if (/^https:\/\/musicbrainz\.org\//.test(u) && !u.startsWith(url) && !/\/static\//.test(u)) log.other.push(u);
    });
    await expect(page.locator(BUTTON)).toHaveCount(1);
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
    return log;
}

/**
 * The rendered groups: per h3 name, its rows' cell texts.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, string[][]>>}
 */
const groups = (page) => page.evaluate(() => {
    const out = {};
    document.querySelectorAll('table.tbl').forEach((t) => {
        let h = t.previousElementSibling;
        while (h && h.tagName !== 'H3') h = h.previousElementSibling;
        const name = h ? h.textContent.replace(/[▼▶]/g, '').replace(/\s+/g, ' ').trim() : '?';
        out[name] = Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.cells).map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    });
    return out;
});

/** The group whose name starts with `start`. */
const groupStarting = (all, start) => all[Object.keys(all).find((k) => k.startsWith(start))];

test.describe('annotation-version: this version beside the current one', () => {
    let pageErrors;
    test.beforeEach(({ page }) => {
        pageErrors = [];
        const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];
        page.on('pageerror', (e) => {
            const where = String(e.stack || e.message || '');
            if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
        });
    });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('an old release version: changed, then a heading and a paragraph added; the card on the change', async ({ page }) => {
        const log = await openAndRender(page, `${REL}/annotation/810603`, 'release-annotation-version.html');
        const all = await groups(page);
        const info = groupStarting(all, 'This version');
        expect(info, JSON.stringify(Object.keys(all))).toBeTruthy();
        expect(info).toEqual(expect.arrayContaining([['Version', 'an old one'], ['Edited by', 'vzell'], ['Date', '2020-03-24 08:51 UTC'], ['Versions', '3']]));
        const cmp = groupStarting(all, 'Compared with the current version');
        expect(cmp.map((r) => r[4]), 'the status of each block').toEqual(['changed', 'only in the current version', 'only in the current version']);
        expect(cmp[1][1], 'the added heading heads its own section').toBe('Barcode and Other Identifiers');
        expect(cmp[2][1], 'the added paragraph sits in the added heading\'s section').toBe('Barcode and Other Identifiers');
        expect(cmp[0][2]).toContain('6x3-inch snap-pack');
        expect(cmp[0][3]).toContain('6x3‐inch snap‐pack');
        expect(cmp[2][2], 'nothing on this side').toBe('');
        const card = await page.evaluate(() => {
            const td = document.querySelector('table.tbl td [data-mb-annot-status="changed"]');
            const div = document.createElement('div');
            div.innerHTML = window.__saTest.tipTextToHtml(td.getAttribute('title'), td);
            return { labels: Array.from(div.querySelectorAll('.mb-tt-cmp-lbl')).map((d) => d.textContent), marks: div.querySelectorAll('mark').length };
        });
        expect(card.labels, 'the rich card compares the two texts').toEqual(['This version', '≠ Current']);
        expect(card.marks, 'the difference is marked').toBeGreaterThan(0);
        expect(log.other, 'nothing asked beyond the page').toEqual([]);
    });

    test('an old artist version against a rewritten current one', async ({ page }) => {
        await openAndRender(page, 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/annotation/630690', 'artist-annotation-version.html');
        const all = await groups(page);
        expect(groupStarting(all, 'This version')).toEqual(expect.arrayContaining([
            ['Changelog', 'This comment is now superfluous, after the artists split'], ['Versions', '14']]));
        const cmp = groupStarting(all, 'Compared with the current version');
        expect(cmp.length).toBeGreaterThanOrEqual(2);
        expect(cmp.some((r) => r[4] === 'same'), 'nothing of the old text is still there').toBe(false);
        expect(cmp[0][2]).toContain('has an almost complete "lyrics" page');
    });

    test('the current version: every block the same, said so; the native annotation and its heading stay', async ({ page }) => {
        await openAndRender(page, `${REL}/annotation`, 'release-annotation-current.html');
        const all = await groups(page);
        expect(groupStarting(all, 'This version')).toEqual(expect.arrayContaining([['Version', 'the current one'], ['Current version', 'this one']]));
        const cmp = groupStarting(all, 'Compared with the current version');
        expect(cmp.map((r) => r[4])).toEqual(['same', 'same', 'same']);
        await expect(page.locator('.mb-group-intro, [data-mb-intro-html]').first()).toBeAttached();
        expect(await page.locator('body').textContent()).toContain('This is the current version: nothing has changed since.');
        await expect(page.locator('div.annotation .annotation-body'), 'the native annotation stays').toHaveCount(1);
        await expect(page.locator('div.annotation .annotation-body').getByText('Barcode and Other Identifiers'),
            'and its own wiki heading').toHaveCount(1);
    });

    test('a Save to Disk → Load from Disk round trip shows the same comparison', async ({ page, context }) => {
        const url = `${REL}/annotation/810603`;
        await openAndRender(page, url, 'release-annotation-version.html');
        const before = groupStarting(await groups(page), 'Compared with the current version').map((r) => r[4]);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-annot-disk-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(dir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const fresh = await context.newPage();
            await loadUserscriptPage(fresh, { url, fixtureFile: path.join(__dirname, 'release-annotation-version.html'), testMode: true });
            await clickToolbarItem(fresh, '#mb-load-from-disk-btn');
            await fresh.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = fresh.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(fresh, { waitForAutoResize: false });
            const master = fresh.locator('.mb-master-toggle');
            if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') await master.click();
            const after = groupStarting(await groups(fresh), 'Compared with the current version');
            expect(after && after.map((r) => r[4]), 'the reloaded page compares the same').toEqual(before);
            expect(await fresh.locator('td [data-mb-annot-status="changed"][data-mb-tip-cmp]').count(), 'the card survives the file').toBeGreaterThan(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
