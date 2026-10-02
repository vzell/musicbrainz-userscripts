'use strict';

// The ⚠️ WARNING / ❌ ERROR findings menus in the h1 toolbar
// (org/generalize-error-warning.org, docs/claude/findings.md).
//
// What each test pins, and the neighbouring bug it must still catch:
//   - placement: after ❓, behind a VISIBLE divider — not merely "present".
//   - a cell finding ticks its 📊 entry in EVERY table, so a sub-table without
//     the finding is emptied too, not left showing all its rows.
//   - a row finding uses the row filter (shown as a chip), so two unrelated
//     columns are OR'd per row rather than AND'd as 📊 ticks would be.
//   - rows compose with AND across columns, OR within one column.
//   - checked state is DERIVED: clearing the column filters by any other route
//     unticks the menu row.
//   - counts come from the source rows: a filter that hides the flagged rows
//     leaves the menu and its counts alone (AUDIT.md §3.6).
//   - the row tally is memoized: a keystroke does not re-walk the rows.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForFilterSettled } = require('../support/filterSortAssertions');
const {
    findingsMenuState, findingRow, clickFinding, clickClearFindings, findingRowState,
} = require('../support/findingsMenu');

const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false };

// Real live album, 2 mediums: one track whose recording links no work, two
// tracks with an undated live credit (both in one credit column).
const LIVE_URL = 'https://musicbrainz.org/release/20a52f17-ce0b-48bf-911e-9f962a518185';
const LIVE_FIXTURE = path.join(__dirname, 'release-tracks-live-date-flags.html');
// Synthetic release group: live-title errors and plain "-" separators across
// two status sub-tables (tests/fixtures/uvd-live-titles.spec.js).
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
// Artist release groups with pending edits in three sub-tables.
const PENDING_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const PENDING_FIXTURE = path.join(__dirname, 'pending-edits-multi.html');
// Release whose track and recording lengths differ on one track.
const LEN_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const LEN_FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

const FINDING_MODE = (id) => `\u0003finding-${id}`;

/**
 * Loads a fixture and presses its "Show all" button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixture
 * @param {string} button - The button's data-label.
 * @param {Object} [settingsOverride]
 */
async function open(page, url, fixture, button, settingsOverride = {}) {
    await loadUserscriptPage(page, { url, fixtureFile: fixture, testMode: true,
        settingsOverride: { ...SETTINGS, ...settingsOverride } });
    await page.route(`${url}*`, (r) => r.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.click(`button[data-label="${button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

const openLive = (page, s) => open(page, LIVE_URL, LIVE_FIXTURE, 'Show all Tracks for Release', s);
const openRg = (page, s) => open(page, RG_URL, RG_FIXTURE, 'Show all Releases for ReleaseGroup', s);

/**
 * Every column filter input carrying a finding's 📊 tick:
 * `{table, col, value}` per input.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
const ticksOf = (page, id) => page.evaluate((mode) => {
    const out = [];
    Array.from(document.querySelectorAll('table.tbl')).forEach((t, ti) => {
        t.querySelectorAll('thead tr.mb-col-filter-row .mb-col-filter-input').forEach((inp) => {
            let values = [];
            try { values = JSON.parse(inp.dataset.mbUniqValues || '[]'); } catch (e) { /* none */ }
            if (!values.includes(mode)) return;
            const th = t.querySelectorAll('thead tr:first-child th')[Number(inp.dataset.colIdx)];
            out.push({ table: ti, col: th ? th.dataset.colName : null, value: inp.value });
        });
    });
    return out;
}, FINDING_MODE(id));

/**
 * Settles after a finding row was clicked: the row's aria-checked reaches
 * `checked`, and the visible row count has stopped moving.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'warn'|'error'} level
 * @param {string} id
 * @param {string} checked - 'true' | 'false' | 'mixed'
 */
async function settleFinding(page, level, id, checked) {
    await expect.poll(async () => (await findingRow(page, level, id))?.checked,
        { timeout: 15000, message: `"${id}" row becomes aria-checked=${checked}` }).toBe(checked);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('findings menus — placement and counts', () => {
    test('the menus sit after ❓ behind a visible divider, and only the levels present appear', async ({ page }) => {
        await openLive(page);
        const tail = await page.evaluate(() =>
            Array.from(document.getElementById('mb-show-all-controls-container').children)
                .filter((c) => c.style.display !== 'none').map((c) => c.id).filter(Boolean));
        const help = tail.indexOf('mb-app-help-btn');
        expect(help, '❓ is in the bar').toBeGreaterThanOrEqual(0);
        expect(tail.slice(help, help + 3), 'divider, then ⚠️ WARNING, right after ❓')
            .toEqual(['mb-app-help-btn', 'mb-button-divider-findings', 'mb-findings-warn-menu-btn']);

        const warn = await findingsMenuState(page, 'warn');
        expect(warn.attached).toBe(true);
        expect(warn.rows.map((r) => [r.id, r.count])).toEqual([['no-work', 1], ['live-credit-nodate', 2]]);
        expect(warn.label, 'the button totals its rows').toBe('⚠️ WARNING (3)');
        expect(warn.title, 'its tooltip names each kind').toContain('Recording has no associated work (1)');
        expect(await findingsMenuState(page, 'error'), 'no ❌ menu on a page without errors').toBeNull();
    });

    test('the ❌ ERROR menu lists errors, the ⚠️ menu warnings, each with a tooltip', async ({ page }) => {
        await openRg(page);
        const err = await findingsMenuState(page, 'error');
        expect(err.rows.map((r) => r.id)).toEqual(['live-invalid', 'live-nearmiss']);
        expect(err.rows.every((r) => r.count > 0 && r.title.length > 20), 'counted and explained').toBe(true);
        const warn = await findingsMenuState(page, 'warn');
        expect(warn.rows.map((r) => r.id)).toEqual(['live-sep']);
    });

    test('counts describe the data, not the view: a filter hiding the flagged rows changes nothing', async ({ page }) => {
        await openLive(page);
        const before = await findingsMenuState(page, 'warn');
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'Rendezvous'));
        const rows = await findingRowState(page, 'live-credit-nodate');
        expect(rows.visible, 'the needle matches something').toBeGreaterThan(0);
        expect(rows.withFinding, 'and none of it is flagged').toBe(0);
        const after = await findingsMenuState(page, 'warn');
        expect(after.attached, 'the menu stays').toBe(true);
        expect(after.rows.map((r) => [r.id, r.count])).toEqual(before.rows.map((r) => [r.id, r.count]));
    });

    test('a keystroke does not re-walk the source rows (memoized tally)', async ({ page }) => {
        await openLive(page);
        const scans = () => page.evaluate(() => window.__saTest.findingTallyRowScans());
        const before = await scans();
        expect(before, 'the first refresh walked the rows').toBeGreaterThan(0);
        await waitForFilterSettled(page, () => page.fill('#mb-global-filter-input', 'Born'));
        expect(await scans(), 'a filter keystroke served the memo').toBe(before);
    });
});

test.describe('findings menus — filtering', () => {
    test('a cell finding ticks its 📊 entry in EVERY table and filters to its rows; again unticks', async ({ page }) => {
        await openRg(page);
        const total = (await findingRowState(page)).visible;
        const n = (await findingRow(page, 'error', 'live-invalid')).count;

        await clickFinding(page, 'live-invalid');
        await settleFinding(page, 'error', 'live-invalid', 'true');
        const ticks = await ticksOf(page, 'live-invalid');
        const tables = await page.evaluate(() => document.querySelectorAll('table.tbl').length);
        expect(ticks.length, 'one tick per table, including a table without the finding').toBe(tables);
        expect(new Set(ticks.map((t) => t.col)), 'all in the same-named column').toEqual(new Set([ticks[0].col]));
        expect(ticks.every((t) => t.value === '❌ Live title with an impossible date'), 'the column box shows the entry').toBe(true);
        const filtered = await findingRowState(page, 'live-invalid');
        expect(filtered.visible, 'only the flagged rows are left').toBe(n);
        expect(filtered.withFinding).toBe(n);

        await clickFinding(page, 'live-invalid');
        await settleFinding(page, 'error', 'live-invalid', 'false');
        expect(await ticksOf(page, 'live-invalid')).toEqual([]);
        expect((await findingRowState(page)).visible, 'every row is back').toBe(total);
    });

    test('two findings in ONE column are OR\'d, like two 📊 ticks', async ({ page }) => {
        await openRg(page);
        const nInvalid = (await findingRow(page, 'error', 'live-invalid')).count;
        const nSep = (await findingRow(page, 'warn', 'live-sep')).count;
        await clickFinding(page, 'live-invalid');
        await settleFinding(page, 'error', 'live-invalid', 'true');
        await clickFinding(page, 'live-sep');
        await settleFinding(page, 'warn', 'live-sep', 'true');
        // The two are disjoint (an error outranks a separator warning).
        expect((await findingRowState(page)).visible).toBe(nInvalid + nSep);
    });

    test('a row finding uses the row filter and a chip; its ✕ releases it', async ({ page }) => {
        await openLive(page);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'live-credit-nodate');
        await settleFinding(page, 'warn', 'live-credit-nodate', 'true');
        expect(await ticksOf(page, 'live-credit-nodate'), 'no 📊 tick for a row finding').toEqual([]);
        const rows = await findingRowState(page, 'live-credit-nodate');
        expect(rows.visible).toBe(2);
        expect(rows.withFinding).toBe(2);
        const chip = page.locator('#mb-findings-chips .mb-findings-chip[data-mb-finding-id="live-credit-nodate"]');
        await expect(chip).toBeVisible();
        await expect(page.locator('#mb-clear-all-filters-btn'), 'a filter no input holds still offers "Clear ALL filters"').toBeVisible();

        await chip.locator('.mb-findings-chip-remove').click();
        await settleFinding(page, 'warn', 'live-credit-nodate', 'false');
        await expect(chip).toHaveCount(0);
        expect((await findingRowState(page)).visible).toBe(total);
    });

    test('"Clear ALL filters" releases a row filter too — no input holds it', async ({ page }) => {
        await openLive(page);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'live-credit-nodate');
        await settleFinding(page, 'warn', 'live-credit-nodate', 'true');
        await page.click('#mb-clear-all-filters-btn');
        await settleFinding(page, 'warn', 'live-credit-nodate', 'false');
        await expect(page.locator('#mb-findings-chips .mb-findings-chip')).toHaveCount(0);
        expect((await findingRowState(page)).visible).toBe(total);
    });

    test('findings in different columns compose with AND', async ({ page }) => {
        await openLive(page);
        const both = await page.evaluate(() => {
            const rows = new Set();
            [...document.querySelectorAll('table.tbl tbody tr')].forEach((r) => {
                if (r.querySelector('td[data-mb-findings~="no-work"]') &&
                    r.querySelector('td[data-mb-findings~="live-credit-nodate"]')) rows.add(r);
            });
            return rows.size;
        });
        await clickFinding(page, 'no-work');
        await settleFinding(page, 'warn', 'no-work', 'true');
        expect((await findingRowState(page)).visible).toBe(1);
        await clickFinding(page, 'live-credit-nodate');
        await settleFinding(page, 'warn', 'live-credit-nodate', 'true');
        expect((await findingRowState(page)).visible, 'only rows carrying both').toBe(both);
    });

    test('checked state is derived: "Clear ALL COLUMN filters" unticks a cell finding', async ({ page }) => {
        await openLive(page);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'no-work');
        await settleFinding(page, 'warn', 'no-work', 'true');
        await page.click('#mb-clear-column-filters-btn');
        await settleFinding(page, 'warn', 'no-work', 'false');
        expect((await findingRowState(page)).visible).toBe(total);
        expect((await findingsMenuState(page, 'warn')).pressed).toBe('false');
    });

    test('the "Clear warning filters" row releases everything the menu set', async ({ page }) => {
        await openLive(page);
        const total = (await findingRowState(page)).visible;
        await clickFinding(page, 'no-work');
        await settleFinding(page, 'warn', 'no-work', 'true');
        await clickFinding(page, 'live-credit-nodate');
        await settleFinding(page, 'warn', 'live-credit-nodate', 'true');
        expect((await findingsMenuState(page, 'warn')).pressed, 'the menu button shows it is filtering').toBe('true');

        await clickClearFindings(page, 'warn');
        await settleFinding(page, 'warn', 'no-work', 'false');
        await settleFinding(page, 'warn', 'live-credit-nodate', 'false');
        await expect(page.locator('#mb-findings-chips .mb-findings-chip')).toHaveCount(0);
        expect((await findingRowState(page)).visible).toBe(total);
    });

    test('a co-flagged length mismatch ticks only the first duration column', async ({ page }) => {
        await open(page, LEN_URL, LEN_FIXTURE, 'Show all Tracks for Release');
        await clickFinding(page, 'len-warn');
        await settleFinding(page, 'warn', 'len-warn', 'true');
        const ticks = await ticksOf(page, 'len-warn');
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.every((t) => t.col === 'Length'), 'Length only, not Recording length too').toBe(true);
        const rows = await findingRowState(page, 'len-warn');
        expect(rows.visible).toBe((await findingRow(page, 'warn', 'len-warn')).count);
        expect(rows.withFinding).toBe(rows.visible);
    });

    test('the pending-edits row shows ONLY pending rows page-wide, sub-tables without any included', async ({ page }) => {
        // The global ⏳ toggle leaves a sub-table without pending edits
        // unfiltered (5 rows visible on this fixture, not 3). The menu row
        // must not inherit that: it is a row filter, page-wide, and the ⏳
        // toggles stay untouched.
        await open(page, PENDING_URL, PENDING_FIXTURE, '🧮 Artist RGs');
        const total = (await findingRowState(page)).visible;
        const n = (await findingRow(page, 'warn', 'pending')).count;
        await clickFinding(page, 'pending');
        await settleFinding(page, 'warn', 'pending', 'true');
        const rows = await findingRowState(page, 'pending');
        expect(rows.visible, 'every table is narrowed, also those without pending edits').toBe(n);
        expect(rows.withFinding).toBe(n);
        await expect(page.locator('#mb-pending-edits-btn'), 'the ⏳ toggle is independent').toHaveAttribute('aria-pressed', 'false');

        await clickFinding(page, 'pending');
        await settleFinding(page, 'warn', 'pending', 'false');
        expect((await findingRowState(page)).visible).toBe(total);
    });

    test('the master switch removes both menus', async ({ page }) => {
        await openRg(page, { sa_enable_findings_menus: false });
        for (const level of ['warn', 'error']) {
            const s = await findingsMenuState(page, level);
            expect(s === null || !s.attached, `${level} menu absent`).toBe(true);
        }
        expect(await page.evaluate(() => document.getElementById('mb-button-divider-findings').style.display)).toBe('none');
    });
});
