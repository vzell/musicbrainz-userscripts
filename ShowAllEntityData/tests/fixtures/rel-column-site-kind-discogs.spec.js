'use strict';

// Two features of the deferred Relationships column (org/TODO.org 2026-10-19):
//
//  - 📊 "Relationship icons - Site kind" (item 3): amazon.com and amazon.de
//    are two hosts of one site; "Relationship icons" lists them apart, the
//    new section counts them as ONE "amazon.*" entry.
//  - ⚠️ "Several links to one site in Relationships" (rel-multi-site, until WIP.2 rel-multi-discogs): a cell
//    showing two or more DIFFERENT Discogs URLs is a WARNING.
//
// Shell: the releasegroup-releases raw snapshot (7 releases, 2 sub-tables,
// tableMode 'multi', so the live rows are clones of the master rows). Every
// ws/2 lookup is answered by the order it arrives in (ANSWERS); the oracles
// are read back from the cells, so the test does not depend on which release
// got which answer.
//
// Guarantees pinned, each named:
//   - KIND COUNT: the "amazon.*" entry counts the rows holding an Amazon icon
//     of ANY host, the per-host entries stay; ticking it leaves those rows;
//   - FINDING COUNT: the ⚠️ row counts the rows whose cell has 2+ distinct
//     Discogs URLs (a "?…" variant of one URL is one) — a DOM oracle;
//   - FILTER: clicking the row leaves exactly those rows, clicking again
//     restores every row;
//   - LOOK: the flagged cell has the warn tint and the ⚠️ (its ::before, not the generic ::after); with the
//     tint setting off no tint, the menu row stays;
//   - SURVIVAL: the stamp outlives a filter re-render (the master was
//     stamped — multi-table re-renders clone it).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickMasterToggleAndExpandAll } = require('../support/liveAssertions');
const { waitForFilterSettled, typeGlobalFilter } = require('../support/filterSortAssertions');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');

const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_ROWS = 7;
const WARN_BG = 'rgb(255, 243, 205)';   // #fff3cd, the default warn tint

/** A ws/2 URL relation. */
const rel = (type, resource) => ({ 'target-type': 'url', type, url: { resource } });
// One answer per lookup, in arrival order; the rest get ONE Discogs link.
const ANSWERS = [
    [rel('amazon asin', 'https://www.amazon.com/gp/product/B000002KGU'), rel('discogs', 'https://www.discogs.com/release/1'), rel('discogs', 'https://www.discogs.com/release/2')],
    [rel('amazon asin', 'https://www.amazon.de/gp/product/B000002KGV'), rel('discogs', 'https://www.discogs.com/release/3')],
    // The same page twice (a query variant): one URL, not flagged.
    [rel('discogs', 'https://www.discogs.com/release/4'), rel('discogs', 'https://www.discogs.com/release/4?ev=rr')],
    [rel('discogs', 'https://www.discogs.com/master/5'), rel('discogs', 'https://www.discogs.com/release/6')],
];
const ONE = [rel('discogs', 'https://www.discogs.com/release/9')];

/**
 * Loads the shell with the Relationships column on, answers its lookups and
 * waits until every row's cell is written.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function open(page, settings = {}) {
    let k = 0;
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_SHELL, testMode: true,
        settingsOverride: {
            sa_enable_relationships_column: true, sa_rel_collapse_threshold: 50, sa_rel_browse_batch_enable: false,
            ...settings,
        },
    });
    await page.route('**/ws/2/**', (route) => {
        const relations = ANSWERS[k++] || ONE;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relations }) });
    });
    await page.route('https://musicbrainz.org/release-group/**', (route) => route.fulfill({ path: RG_SHELL, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await clickMasterToggleAndExpandAll(page);
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('table.tbl tbody td.mb-rel-cell[data-rel-done="1"]').length),
        { timeout: 30000, message: 'every Relationships cell written' }).toBe(RG_ROWS);
}

/**
 * Per row, from the cells: the hosts of its icons and its distinct Discogs
 * URLs (host without "www.", path without a trailing "/", no query).
 *
 * @param {import('@playwright/test').Page} page
 */
const cellOracle = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl')).map((t, idx) => ({
    idx,
    rows: Array.from(t.querySelectorAll('tbody td.mb-rel-cell')).map((td) => {
        const urls = Array.from(td.querySelectorAll('.mb-rel-filter-key')).map((s) => new URL(s.textContent));
        const discogs = new Set(urls.filter((u) => /(^|\.)discogs\.com$/.test(u.hostname))
            .map((u) => u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')));
        return { hosts: urls.map((u) => u.hostname), discogs: discogs.size };
    }),
})).filter((t) => t.rows.length));

test.describe('Relationships column: 📊 Relationship icons - Site kind', () => {
    test('KIND COUNT: amazon.com and amazon.de are one "amazon.*" entry; ticking it leaves their rows', async ({ page }) => {
        await open(page);
        const tables = await cellOracle(page);
        const t = tables.find((x) => x.rows.some((r) => r.hosts.some((h) => /amazon\./.test(h))));
        expect(t, 'premise: a table with Amazon icons').toBeTruthy();
        const amazonRows = t.rows.filter((r) => r.hosts.some((h) => /(^|\.)amazon\./.test(h))).length;
        const amazonHosts = new Set(t.rows.flatMap((r) => r.hosts.filter((h) => /(^|\.)amazon\./.test(h))));
        expect(amazonHosts.size, 'premise: two Amazon hosts in one table').toBe(2);

        const sections = await page.evaluate((i) => window.__saTest.getUniqDropSections('Relationships', i), t.idx);
        const kind = sections.find((s) => s.label === 'Relationship icons - Site kind');
        expect(kind, 'the section').toBeTruthy();
        expect(kind.items.find((i) => i.label === 'amazon.*'), 'one entry for both hosts').toMatchObject({ count: amazonRows });
        const hosts = sections.find((s) => s.label === 'Relationship icons').items.map((i) => i.label);
        expect(hosts.filter((h) => /amazon/.test(h)), 'the per-host entries stay').toHaveLength(2);

        await waitForFilterSettled(page, () => page.evaluate(() => Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-col-uniq-item'))
            .find((el) => el.dataset.mbUniqSynLabel === 'amazon.*').click()));
        const visible = await page.evaluate((i) => Array.from(document.querySelectorAll('table.tbl')[i].querySelectorAll('tbody tr'))
            .filter((tr) => tr.style.display !== 'none').length, t.idx);
        expect(visible).toBe(amazonRows);
    });
});

test.describe('finding: Several links to one site in Relationships (Discogs cases)', () => {
    /** Rows (all tables) whose cell holds 2+ distinct Discogs URLs. */
    const flaggedOracle = async (page) => (await cellOracle(page)).reduce((n, t) => n + t.rows.filter((r) => r.discogs >= 2).length, 0);

    test('FINDING COUNT + FILTER + LOOK + SURVIVAL', async ({ page }) => {
        await open(page);
        const expected = await flaggedOracle(page);
        expect(expected, 'premise: two flagged rows; the query variant is not one').toBe(2);
        await expect.poll(async () => (await findingRow(page, 'warn', 'rel-multi-site') || {}).count,
            { timeout: 15000, message: 'the re-stamp after the column loaded' }).toBe(expected);

        const cells = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-findings~="rel-multi-site"]')).map((td) => ({
            rel: td.classList.contains('mb-rel-cell'),
            bg: getComputedStyle(td).backgroundColor,
            before: getComputedStyle(td, '::before').content,
        })));
        expect(cells).toHaveLength(expected);
        cells.forEach((c) => expect(c).toEqual({ rel: true, bg: WARN_BG, before: '"⚠️"' }));

        await clickFinding(page, 'rel-multi-site');
        await expect.poll(async () => findingRowState(page, 'rel-multi-site')).toEqual({ visible: expected, withFinding: expected });
        await clickFinding(page, 'rel-multi-site');
        await expect.poll(async () => (await findingRowState(page)).visible).toBe(RG_ROWS);

        // A filter re-render clones the master rows: the stamp is on them too.
        await typeGlobalFilter(page, 'zzzz-nothing');
        await typeGlobalFilter(page, '');
        await expect.poll(async () => (await findingRowState(page, 'rel-multi-site')).withFinding).toBe(expected);
    });

    test('LOOK: with the tint setting off no tint, the menu row stays', async ({ page }) => {
        await open(page, { sa_findings_tint_rel_multi_discogs: false });
        await expect.poll(async () => (await findingRow(page, 'warn', 'rel-multi-site') || {}).count, { timeout: 15000 }).toBe(2);
        const cells = await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl tbody td[data-mb-findings~="rel-multi-site"]'))
            .map((td) => ({ level: td.dataset.mbFinding || null, bg: getComputedStyle(td).backgroundColor })));
        expect(cells).toHaveLength(2);
        cells.forEach((c) => { expect(c.level).toBeNull(); expect(c.bg).not.toBe(WARN_BG); });
    });
});
