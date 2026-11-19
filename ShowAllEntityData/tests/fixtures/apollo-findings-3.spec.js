'use strict';

// Apollo findings, batch 3 (org/majkinetor.org; docs/claude/findings.md,
// "A role that doesn't fit the format"): format-role, Group Therapy's format
// rules on a release's "Credits" render (pageType release-credit-tables).
//
// What each test pins, and the neighbouring bug it must still catch:
//   - VINYL (the format read from the embedded release payload): only
//     "glass mastered by" is flagged; "lacquer cut by", "pressed at",
//     "manufactured by", "printed in" fit a 12" Vinyl. A rule that flagged
//     every physical role, or read "glass" as fitting vinyl, fails here.
//   - DIGITAL (the payload removed, the format read from the sidebar): every
//     physical role is flagged, the copyright roles are not. A source reader
//     that only knew the payload flags nothing here.
//   - the "Via release group" block's "pressed at" row (constructed) is never
//     flagged, in either layout: the format belongs to the release's own rows.
//     In the one-table layout only the From column tells them apart.
//   - the rules and the format reader through the shipping functions: a mixed
//     "CD + Digital Media" release is NOT flagged for "pressed" (Group
//     Therapy's substring test would flag it), a CD-R is not glass mastered,
//     shellac and acetate take a lacquer, an unknown medium blocks every flag.
//   - menu count, filter, look, tint switch, survival after a filter pass,
//     and a Save to Disk → Load from Disk round trip onto the OTHER fixture's
//     page (the flags come from the saved cells, not from the page the stamp
//     runs on).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled } = require('../support/filterSortAssertions');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');
const { clickToolbarItem } = require('../support/toolbarMenu');

const URL = 'https://musicbrainz.org/release/3ce46b79-5e8c-470a-bcdc-45f301d09f60';
const VINYL = path.join(__dirname, 'release-credits-format-role.html');
const DIGITAL = path.join(__dirname, 'release-credits-format-role-digital.html');
const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd
const BUTTON = 'Show all Credits for Release';

/**
 * Loads one fixture (MusicBrainz's own bundles blocked, every page fetch
 * answered with the same fixture, ws/2 refused) and presses "Credits".
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} fixture
 * @param {{settings?: Object, press?: boolean}} [opts]
 */
async function open(page, fixture, { settings = {}, press = true } = {}) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: fixture, testMode: true,
        settingsOverride: { sa_enable_relationship_tables: true, sa_enable_release_tracks: true,
            sa_sidebar_in_rel_tables: false, ...settings },
    });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (!press) return;
    await page.click(`button[data-label="${BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every rendered Relationship cell: its table's h3, its phrase, whether it
 * carries the finding, its formats mark, level, background and tooltip.
 *
 * @param {import('@playwright/test').Page} page
 */
const relCells = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((t) => {
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || th.textContent.trim());
        const k = names.indexOf('Relationship');
        if (k < 0) return;
        let h = t.previousElementSibling;
        while (h && h.tagName !== 'H3') h = h.previousElementSibling;
        const group = h ? (h.querySelector('.mb-h3-title, .mb-toggle-h3-text')?.textContent || h.textContent).trim() : '';
        t.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none' || !tr.cells[k]) return;
            const td = tr.cells[k];
            out.push({
                group, role: td.textContent.trim(),
                flagged: (td.dataset.mbFindings || '').split(' ').includes('format-role'),
                formats: td.dataset.mbRelFormats || '',
                level: td.dataset.mbFinding || null,
                bg: getComputedStyle(td).backgroundColor,
                tip: td.getAttribute('title') || '',
            });
        });
    });
    return out;
});

const flaggedRoles = (cells) => cells.filter((c) => c.flagged).map((c) => c.role).sort();
const PHYSICAL = ['glass mastered by', 'lacquer cut by', 'manufactured by', 'pressed at', 'printed in'];

test.describe('format-role', () => {
    test('12" Vinyl, read from the release payload: only "glass mastered" is flagged', async ({ page }) => {
        await open(page, VINYL);
        const cells = await relCells(page);
        const own = cells.filter((c) => !c.group.includes('Via release group'));
        expect(own.map((c) => c.role), 'the release has every physical role').toEqual(expect.arrayContaining(PHYSICAL));
        expect(own.every((c) => c.formats === '31'), 'every own row knows the format: 12" Vinyl (31)').toBe(true);
        expect(flaggedRoles(cells)).toEqual(['glass mastered by']);
        const glass = cells.find((c) => c.flagged);
        expect(glass.tip).toContain('glass mastered by, but the release is 12" Vinyl');
        expect(glass.level).toBe('warn');
        expect(glass.bg).toBe(WARN_BG);
        const via = cells.filter((c) => c.group.includes('Via release group'));
        expect(via.map((c) => c.role), 'the constructed release group row is there').toContain('pressed at');
        expect(via.every((c) => !c.formats && !c.flagged), 'a release group row carries no format').toBe(true);
        expect((await findingRow(page, 'warn', 'format-role')).count).toBe(1);
    });

    test('Digital Media, read from the sidebar: every physical role is flagged, copyright is not', async ({ page }) => {
        await open(page, DIGITAL);
        const cells = await relCells(page);
        expect(flaggedRoles(cells)).toEqual(PHYSICAL);
        const own = cells.filter((c) => !c.group.includes('Via release group'));
        expect(own.every((c) => c.formats === '12')).toBe(true);
        expect(own.filter((c) => /copyright/.test(c.role)).length, 'the copyright roles are there').toBeGreaterThan(0);
        expect(own.filter((c) => /copyright/.test(c.role)).every((c) => !c.flagged)).toBe(true);
        expect(cells.filter((c) => c.group.includes('Via release group')).every((c) => !c.flagged)).toBe(true);
        expect(cells.find((c) => c.role === 'pressed at' && c.flagged).tip).toContain('pressed at, but the release is Digital Media');

        const n = PHYSICAL.length;
        expect((await findingRow(page, 'warn', 'format-role')).count).toBe(n);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'format-role');
        await expect.poll(async () => findingRowState(page, 'format-role'), { timeout: 15000 })
            .toEqual(expect.objectContaining({ visible: n, withFinding: n }));
        await clickFinding(page, 'format-role');
        await expect.poll(async () => (await findingRowState(page)).visible, { timeout: 15000 }).toBe(total);
    });

    test('one-table layout: the From column keeps the release group\'s row out', async ({ page }) => {
        await open(page, DIGITAL, { settings: { sa_relationship_tables_one_table: true } });
        const cells = await relCells(page);
        expect(flaggedRoles(cells)).toEqual(PHYSICAL);
        const pressed = cells.filter((c) => c.role === 'pressed at');
        expect(pressed.length, 'the release\'s own and the release group\'s').toBe(2);
        expect(pressed.filter((c) => c.flagged).length).toBe(1);
    });

    test('the rules, through the shipping function', async ({ page }) => {
        await open(page, VINYL, { press: false });
        const got = await page.evaluate(() => {
            const f = window.__saTest.formatRoleMismatch;
            return {
                pressedDigital: f('pressed by', '12'),
                pressedTwoDigital: f('pressed at', '12 12'),
                pressedMixed: f('pressed at', '1 12'),
                printedDownloadCard: f('printed by', '46'),
                manufacturedForDigital: f('manufactured for', '12'),
                manufacturedInDigital: f('manufactured in', '12'),
                lacquerCd: f('lacquer cut by', '1'),
                lacquerVinyl: f('lacquer cut at', '31'),
                lacquerShellac: f('lacquer cut by', '56'),
                lacquerAcetate: f('lacquer cut by', '203'),
                lacquerCdPlusVinyl: f('lacquer cut by', '1 29'),
                glassVinyl: f('glass mastered by', '31'),
                glassCd: f('glass mastered at', '1'),
                glassCdr: f('glass mastered by', '33'),
                glassDvdVideoPlusVinyl: f('glass mastered by', '31 19'),
                glassBluray: f('glass mastered by', '20'),
                copyrightDigital: f('copyrighted (©) by', '12'),
                phonographicDigital: f('phonographic copyright (℗) by', '12'),
                unknown: f('glass mastered by', ''),
            };
        });
        expect(got).toEqual({
            pressedDigital: 'digital', pressedTwoDigital: 'digital', pressedMixed: null, printedDownloadCard: null,
            manufacturedForDigital: 'digital', manufacturedInDigital: 'digital',
            lacquerCd: 'lacquer', lacquerVinyl: null, lacquerShellac: null, lacquerAcetate: null, lacquerCdPlusVinyl: null,
            glassVinyl: 'glass', glassCd: null, glassCdr: 'glass', glassDvdVideoPlusVinyl: null, glassBluray: null,
            copyrightDigital: null, phonographicDigital: null, unknown: null,
        });
    });

    test('the format reader: payload first, then the sidebar; any unknown medium means none', async ({ page }) => {
        await open(page, VINYL, { press: false });
        const got = await page.evaluate(() => {
            const r = window.__saTest.releaseMediumFormatIds;
            const side = (t) => `<div id="sidebar"><dl><dd class="format">${t}</dd></dl></div>`;
            const json = (mediums) => `<script type="application/json">${JSON.stringify({ release: { mediums } })}</script>`;
            return {
                live: r('live'),
                sideMulti: r(side('2×CD + DVD-Video')),
                sideVinyl: r(side('12&quot; Vinyl')),
                sideUnknown: r(side('12&quot; Vinyl + (unknown)')),
                sideOther: r(side('Other')),
                sideTranslated: r(side('Disco de vinilo')),
                jsonTwo: r(json([{ format: { id: 1 } }, { format: { id: 12 } }]) + side('Other')),
                jsonNull: r(json([{ format: { id: 1 } }, { format: null }])),
                jsonFormatId: r(json([{ format_id: 31 }])),
                nothing: r('<p>no release</p>'),
            };
        });
        expect(got).toEqual({
            live: '31', sideMulti: '1 19', sideVinyl: '31', sideUnknown: '', sideOther: '', sideTranslated: '',
            jsonTwo: '1 12', jsonNull: '', jsonFormatId: '31', nothing: '',
        });
    });

    test('its stamp survives a filter re-render, and its tint switch keeps it', async ({ page }) => {
        await open(page, VINYL);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'mastered'));
        expect(flaggedRoles(await relCells(page))).toEqual(['glass mastered by']);

        await open(page, VINYL, { settings: { sa_findings_tint_format_role: false } });
        const off = (await relCells(page)).find((c) => c.flagged);
        expect(off, 'still detected').toBeTruthy();
        expect(off.level, 'not tinted').toBeNull();
        expect(off.bg).not.toBe(WARN_BG);
    });

    test('Save to Disk → Load from Disk on the other release\'s page keeps the saved formats', async ({ context }) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-format-role-'));
        try {
            const source = await context.newPage();
            await open(source, DIGITAL);
            expect(flaggedRoles(await relCells(source))).toEqual(PHYSICAL);
            const dl = source.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(source, '#mb-save-to-disk-btn');
            await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await source.click('#sa-sd-save-confirm');
            const saved = path.join(tmp, 'digital.json.gz');
            await (await dl).saveAs(saved);
            await source.close();

            const page = await context.newPage();
            await open(page, VINYL, { press: false });
            await clickToolbarItem(page, '#mb-load-from-disk-btn');
            await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = page.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            const cells = await relCells(page);
            expect(cells.filter((c) => c.formats).every((c) => c.formats === '12'), 'the saved Digital Media, not this page\'s vinyl').toBe(true);
            expect(flaggedRoles(cells)).toEqual(PHYSICAL);
            expect((await findingRow(page, 'warn', 'format-role')).count).toBe(PHYSICAL.length);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
