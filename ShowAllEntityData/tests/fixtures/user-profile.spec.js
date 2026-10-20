'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled, waitForSortSettled, ensureSubTableVisible } = require('../support/filterSortAssertions');

// pageType 'user-profile' (/user/<name>): applyUserProfileToTables() turns the
// profile's "General information" and each "Statistics" table into h3 +
// table.tbl groups under one h2 "Profile". The guarantees pinned:
//   - the button is there on a bare profile page, and its render is exactly
//     the five groups, with these columns and row counts;
//   - a count cell holds the count only: the share and the "view" link sit
//     in their own columns, so Count sorts as a NUMBER ("1,234" above "99");
//   - the Votes table's one-cell "Total effective votes" row and the footer's
//     "Total" are rows of the group, in the Overall columns;
//   - other userscripts' additions are never copied: flag images and
//     wrappers, inline highlight styles; their "Edit Notes" block stays as it
//     was, outside every table;
//   - the global filter works on it; nothing is requested.

const URL = 'https://musicbrainz.org/user/vzell';
const FIXTURE = path.join(__dirname, 'user-page-vzell.html');
const BTN = 'button[data-label="Show profile as tables"]';

/**
 * Loads the profile and counts the musicbrainz.org requests made after load.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{n: number}>}
 */
async function open(page) {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    const reqs = { n: 0 };
    page.on('request', (r) => { if (/musicbrainz\.org\//.test(r.url()) && r.resourceType() !== 'image') reqs.n++; });
    return reqs;
}

/** Presses the button and waits for the render. */
async function press(page) {
    await page.click(BTN);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Each group: its h3 name, header names and rows (cell texts). */
const groups = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#page table.tbl')).map((t) => {
    let h = t.previousElementSibling;
    while (h && h.tagName !== 'H3') h = h.previousElementSibling;
    const name = h ? Array.from(h.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() : '';
    const cols = Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => th.dataset.colName || th.textContent.trim());
    const rows = Array.from(t.querySelectorAll('tbody tr')).filter((r) => r.style.display !== 'none')
        .map((r) => Array.from(r.cells).map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
    return { name, cols, rows };
}));

/** A group by name. */
const group = async (page, name) => (await groups(page)).find((g) => g.name === name);

/**
 * The fixture is the plain shape (counts only). A logged-in page
 * (debug/user-chaban.html, 2026-10-20) adds "(view)"/"(N%)" links after the
 * counts, a link on each overall vote count, a "(view)" in the Votes head and
 * a one-cell "Total effective votes" row. This puts that shape, verbatim, into
 * the fixture's own tables.
 * @param {import('@playwright/test').Page} page
 */
async function plantLoggedInShape(page) {
    await page.evaluate(() => {
        const [edits, votes, added] = document.querySelectorAll('table.statistics');
        const cell = (t, label) => Array.from(t.querySelectorAll('tbody th')).find((th) => th.textContent.trim() === label).nextElementSibling;
        cell(edits, 'Total').insertAdjacentHTML('beforeend', ' (<a href="/user/vzell/edits">view</a>)');
        cell(edits, 'Accepted').insertAdjacentHTML('beforeend', ' (<a href="/user/vzell/edits/accepted">100%</a>)');
        votes.querySelector('thead th').insertAdjacentHTML('beforeend', ' (<a href="/user/vzell/votes">view</a>)');
        votes.querySelectorAll('tbody td[headers="table_vote_summary_overall"]').forEach((td) => {
            const n = td.firstChild;
            const a = document.createElement('a');
            a.href = 'https://musicbrainz.org/search/edits?conditions.0.field=voter';
            a.textContent = n.textContent;
            n.replaceWith(a);
        });
        cell(votes, 'Abstain').parentElement.insertAdjacentHTML('beforebegin',
            '<tr><th><a href="/statistics/editors" title="See top voters">Total effective votes</a></th><th colspan="2">5,014 (95%)</th></tr>');
        cell(added, 'Artist').insertAdjacentHTML('beforeend', ' (<a href="/search/edits?conditions.1.field=type">7%</a>)');
    });
}

test.describe('user-profile: an editor profile as tables', () => {
    test('five groups with their columns; nothing requested', async ({ page }) => {
        const reqs = await open(page);
        await expect(page.locator(BTN)).toHaveCount(1);
        await press(page);
        const g = await groups(page);
        expect(g.map((x) => [x.name, x.rows.length])).toEqual([
            ['General information', 6], ['Edits', 9], ['Votes', 5], ['Added entities', 11], ['Tags and ratings', 3],
        ]);
        // The plain shape has no shares or links: those columns are left out.
        const cols = Object.fromEntries(g.map((x) => [x.name, x.cols.filter((c) => c)]));
        expect(cols['General information']).toEqual(['Field', 'Value']);
        expect(cols['Edits']).toEqual(['Status', 'Count']);
        expect(cols['Votes']).toEqual(['Vote', 'Last 28 days', 'Last 28 days %', 'Overall', 'Overall %']);
        expect(cols['Added entities']).toEqual(['Entity', 'Count']);
        expect(cols['Tags and ratings']).toEqual(['Kind', 'Count']);
        // One h2 "Profile" heads them; the native h2s and tables are gone.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('#page > h2')).map((h) =>
            Array.from(h.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()))).toContain('Profile');
        await expect(page.locator('#page table.profileinfo, #page table.statistics')).toHaveCount(0);
        expect(reqs.n, 'nothing is fetched').toBe(0);
    });

    test('a count cell holds the count only, and Count sorts as a number', async ({ page }) => {
        await open(page);
        const native = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table.statistics')[2].querySelectorAll('tbody tr'));
            return rows.map((r) => [r.cells[0].textContent.trim(), r.cells[1].textContent.trim().match(/^[\d,]+/)[0]]);
        });
        await plantLoggedInShape(page);
        await press(page);
        const added = await group(page, 'Added entities');
        const byName = Object.fromEntries(added.rows.map((r) => [r[added.cols.indexOf('Entity')], r[added.cols.indexOf('Count')]]));
        native.forEach(([name, count]) => expect(byName[name], name).toBe(count));
        const edits = await group(page, 'Edits');
        expect(edits.cols.filter((c) => c)).toEqual(['Status', 'Count', 'Share', 'Link']);
        const row = (label) => edits.rows.find((r) => r[0] === label);
        expect(row('Accepted')[edits.cols.indexOf('Count')]).toBe('109,579');
        expect(row('Accepted')[edits.cols.indexOf('Share')]).toBe('100%');
        expect(row('Total')[edits.cols.indexOf('Count')]).toBe('1,006,542');
        expect(row('Total')[edits.cols.indexOf('Link')]).toBe('view');
        expect(added.cols.filter((c) => c)).toEqual(['Entity', 'Count', 'Share']);

        // Sub-tables start collapsed; the sort icons show once it is open.
        await ensureSubTableVisible(page, 3);
        const sec = page.locator('h3.mb-toggle-h3', { hasText: 'Added entities' }).first();
        const tbl = page.locator('#page table.tbl').nth(3);
        const btn = tbl.locator('thead th[data-col-name="Count"] .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => btn.click(), { statusLocator: sec.locator('.mb-sort-status') });
        const after = await group(page, 'Added entities');
        const nums = after.rows.map((r) => Number(r[after.cols.indexOf('Count')].replace(/,/g, '')));
        expect(nums, 'descending by value, not by text').toEqual([...nums].sort((a, b) => b - a));
    });

    test("Votes: the one-cell row and the footer's Total are rows in the Overall columns", async ({ page }) => {
        await open(page);
        await plantLoggedInShape(page);
        await press(page);
        const v = await group(page, 'Votes');
        const col = (r, c) => r[v.cols.indexOf(c)];
        const eff = v.rows.find((r) => r[0] === 'Total effective votes');
        expect(eff, 'the colspan row').toBeTruthy();
        expect(col(eff, 'Last 28 days')).toBe('');
        expect(col(eff, 'Overall')).toMatch(/^[\d,]+$/);
        expect(col(eff, 'Overall %')).toMatch(/^\d+%$/);
        expect(v.rows).toHaveLength(6);
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('#page h3')).some((h) => /Votes/.test(h.textContent))
            && !!document.querySelector('#page a[href="/user/vzell/votes"]')), 'the head\'s "view" link is kept as the intro').toBe(true);
        const total = v.rows.find((r) => r[0] === 'Total');
        expect(col(total, 'Last 28 days')).toBe('24');
        expect(col(total, 'Last 28 days %')).toBe('100%');
        expect(col(total, 'Overall %')).toBe('100%');
        // The overall count keeps its link to the edit search.
        expect(await page.evaluate(() => !!document.querySelectorAll('#page table.tbl')[2].querySelector('tbody a[href*="search/edits"]'))).toBe(true);
    });

    test("other userscripts' additions are never copied; their block stays outside the tables", async ({ page }) => {
        await open(page);
        // What USER_STATS and the flag scripts add on a real page (debug/user-vac31.html).
        await page.evaluate(() => {
            const td = Array.from(document.querySelectorAll('table.profileinfo th')).find((th) => th.textContent === 'Member since:').nextElementSibling;
            td.insertAdjacentHTML('beforeend', ' <span class="mfe-flag-wrapper" style="white-space: nowrap;"><a href="/area/0785dc14-96af-3dc4-bde4-dcdfc2e2d0d6" class="arealink">Lithuania</a><img class="mb-hq-flag-img" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="height: 11px !important"></span>');
            document.querySelector('table.statistics tbody tr td').insertAdjacentHTML('beforeend', ' (<a href="/user/vzell/edits" style="background-color: rgb(255, 255, 102);">view</a>)');
            document.querySelector('table.statistics tbody tr td').setAttribute('style', 'background-color: rgb(255, 255, 102); font-weight: bold;');
            const h2 = document.querySelector('table.profileinfo').nextElementSibling;
            h2.insertAdjacentHTML('beforebegin', '<h2 title="USER_STATS">Edit Notes</h2><ul title="USER_STATS" id="planted-notes"><li><a href="/search/edits">Edits by vzell</a></li></ul>');
        });
        await press(page);
        expect(await page.evaluate(() => document.querySelectorAll('#page table.tbl img.mb-hq-flag-img, #page table.tbl .mfe-flag-wrapper').length)).toBe(0);
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('#page table.tbl tbody td, #page table.tbl tbody td *'))
            .some((n) => /255, 255, 102/.test(n.getAttribute('style') || '')))).toBe(false);
        // The unwrapped area link itself is MusicBrainz's and stays.
        const info = await group(page, 'General information');
        expect(info.rows.find((r) => r[0] === 'Member since')[1]).toContain('Lithuania');
        // Their block is untouched and is not a table.
        await expect(page.locator('#planted-notes')).toHaveCount(1);
        expect(await page.evaluate(() => document.querySelector('#planted-notes').closest('table'))).toBeNull();
        expect((await groups(page)).map((g) => g.name)).not.toContain('Edit Notes');
    });

    test('the global filter narrows the groups', async ({ page }) => {
        await open(page);
        await press(page);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'Cover art'));
        const g = await groups(page);
        expect(g.find((x) => x.name === 'Added entities').rows.map((r) => r[0])).toEqual(['Cover art']);
        expect(g.find((x) => x.name === 'Edits').rows).toHaveLength(0);
    });

    test('not on a page under the profile', async ({ page }) => {
        await loadUserscriptPage(page, { url: `${URL}/collections`, fixtureFile: FIXTURE, testMode: true }).catch(() => {});
        await expect(page.locator(BTN)).toHaveCount(0);
    });
});
