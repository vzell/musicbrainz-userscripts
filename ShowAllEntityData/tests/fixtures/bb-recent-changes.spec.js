'use strict';

// Brucebase "Recent changes" ('bb-recent-changes',
// brucebase.wikidot.com/system:recent-changes), under sa_enable_brucebase.
// The page's list is not paginated by URL: its pager and "Update list" POST
// to Wikidot's AJAX module (/ajax-module-connector.php,
// changes/SiteChangesListModule). So the definition carries
// `features.pageRequest` — the engine's one non-URL page source — and each
// button a `pageCount`; every request asks for 200 changes per page, the
// most the site offers. applyBbChangesToTable() gives the live page an
// empty table and turns each AJAX answer into rows. Fixtures:
// scripts/build-bb-fixtures.py (the page as the server sends it, and two
// AJAX answers of 200 changes, from scripts/probe-bb-recent-changes.py).
// See docs/claude/brucebase.md, "Recent changes".

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { BB_CHANGES_AJAX, loadBbChangesPage, renderedBbHeaders } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled, columnFilterInput } = require('../support/filterSortAssertions');
const { clickToolbarItem } = require('../support/toolbarMenu');

const HEADERS = ['Page', 'Category', 'Flags', 'Date', 'Time', 'Revision', 'User', 'Comment'];
// The Date column's dateParts split, appended after the converter's own columns.
const DATE_PARTS = ['DD', 'MM', 'YYYY', 'Day', 'Month'];
const TZ = 'Europe/Berlin';
test.use({ timezoneId: TZ });

const FLAG_TEXT = {
    N: 'new page created', S: 'content source text changed', T: 'title changed', R: 'page renamed/moved',
    A: 'tags changed', M: 'meta data changed', F: 'file/attachment action',
};

/**
 * The changes of one saved AJAX answer, read in Node with plain regexes —
 * independent of the converter — as the rows the table should show.
 * @param {string} file
 * @returns {Array<Object<string, *>>}
 */
function expectedRows(file) {
    const body = JSON.parse(fs.readFileSync(file, 'utf8')).body;
    const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    const fmt = new Intl.DateTimeFormat('sv-SE', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    return body.split('class="changes-list-item"').slice(1).map((it) => {
        const t = it.match(/<td class="title">\s*<a href="([^"]*)">([\s\S]*?)<\/a>/);
        const href = t[1];
        const cat = (href.match(/^\/([^/:]+):/) || [])[1] || '';
        let title = clean(t[2]);
        if (cat && title.toLowerCase().startsWith(`${cat.toLowerCase()}:`)) title = title.slice(cat.length + 1).trim();
        const flags = [...it.matchAll(/class="spantip"[^>]*>([A-Z])</g)].map((m) => m[1]);
        const epoch = parseInt(it.match(/odate time_(\d+)/)[1], 10);
        const rev = clean(it.match(/<td class="revision-no">([\s\S]*?)<\/td>/)[1]);
        const user = it.match(/<span class="printuser">[\s\S]*?<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        const comment = (it.match(/<div class="comments">([\s\S]*?)<\/div>/) || [])[1];
        return {
            Page: title,
            Category: cat,
            _flagItems: flags.map((f) => `${f} ${FLAG_TEXT[f]}`),
            _flags: flags,
            Date: fmt.format(new Date(epoch * 1000)).slice(0, 10),
            Time: fmt.format(new Date(epoch * 1000)).slice(11),
            Revision: (rev.match(/\d+/) || ['0'])[0],
            User: user ? clean(user[2]) : '',
            _userHref: user ? user[1] : '',
            Comment: comment ? clean(comment) : '',
            _href: `https://brucebase.wikidot.com${href}`,
        };
    });
}

const P1 = expectedRows(BB_CHANGES_AJAX[0]);
const P2 = expectedRows(BB_CHANGES_AJAX[1]);

/**
 * Collects uncaught page errors.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * The rendered rows, in table order: every column's text, the Page and
 * User links, and the Flags items.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object<string, *>>>}
 */
function renderedRows(page) {
    return page.evaluate(() => {
        const names = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        const at = (tr, n) => tr.cells[names.indexOf(n)];
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => {
                const row = {};
                names.forEach((n, i) => { row[n] = (tr.cells[i]?.textContent || '').replace(/\s+/g, ' ').trim(); });
                row._flags = Array.from(at(tr, 'Flags')?.querySelectorAll('li .mb-bb-flag') || []).map((s) => s.textContent);
                row._flagItems = Array.from(at(tr, 'Flags')?.querySelectorAll('li') || []).map((li) => li.textContent.trim());
                row._href = at(tr, 'Page')?.querySelector('a')?.href || '';
                row._userHref = at(tr, 'User')?.querySelector('a')?.href || '';
                row._userTarget = at(tr, 'User')?.querySelector('a')?.getAttribute('target') || '';
                return row;
            });
    });
}

/**
 * Presses one of the buttons and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test('the fixtures still have the shape this spec relies on', () => {
    expect(P1).toHaveLength(200);
    expect(P2).toHaveLength(200);
    // Two-flag changes, a "(new)" revision, a page without a category, and
    // changes with and without a comment are all in page 1 or 2.
    expect([...P1, ...P2].some((r) => r._flags.length === 2)).toBe(true);
    expect([...P1, ...P2].some((r) => r._flags.includes('N'))).toBe(true);
    expect([...P1, ...P2].some((r) => r.Category === '')).toBe(true);
    expect([...P1, ...P2].some((r) => r.Comment === '')).toBe(true);
    expect([...P1, ...P2].some((r) => r.Comment !== '')).toBe(true);
    expect(new Set([...P1, ...P2].flatMap((r) => r._flags))).toEqual(new Set(Object.keys(FLAG_TEXT)));
});

test.describe('gate and toolbar', () => {
    test('with sa_enable_brucebase off, the page is left untouched', async ({ page }) => {
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        const { posts } = await loadBbChangesPage(page, { enabled: false });
        await expect.poll(() => logs.some((t) => t.includes('brucebase.wikidot.com support is off')), { timeout: 10000 }).toBe(true);
        expect(await page.locator('button[data-label]').count()).toBe(0);
        await expect(page.locator('#rev-perpage')).toHaveValue('20');
        expect(posts).toEqual([]);
    });

    test('with it on: three buttons on the injected <h1>, 200 per page in the site\'s form, no request yet', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { posts } = await loadBbChangesPage(page);
        for (const label of ['Show the last 200 changes', 'Show the last 1,000 changes', 'Show the last 5,000 changes']) {
            await expect(page.locator(`h1.mb-bb-h1 button[data-label="${label}"]`)).toHaveCount(1);
        }
        await expect(page.locator('h1.mb-bb-h1 > bdi')).toHaveText('Brucebase — Manage - Recent Changes');
        // "change to 200 revisions per page beforehand": the site's own
        // select says 200, so its "Update list" loads as many as the buttons.
        await expect(page.locator('#rev-perpage')).toHaveValue('200');
        await expect(page.locator('#site-changes-list')).toBeVisible();
        expect(posts).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-recent-changes', () => {
    test('"200": one POST for page 1 at 200 per page, one row per change, every column', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { posts, requests } = await loadBbChangesPage(page);
        await press(page, 'Show the last 200 changes');

        // The request is the site's own "Update list" request, with 200 per page.
        expect(posts).toHaveLength(1);
        const p = posts[0];
        expect(p._method).toBe('POST');
        expect(p._contentType).toContain('application/x-www-form-urlencoded');
        expect(p.moduleName).toBe('changes/SiteChangesListModule');
        expect(p.page).toBe('1');
        expect(p.perpage).toBe('200');
        expect(p.categoryId).toBe('');
        expect(JSON.parse(p.options)).toEqual({ all: true });
        // The token in the body is the cookie's, which the server compares.
        const cookie = await page.evaluate(() => (document.cookie.match(/(?:^|;\s*)wikidot_token7=([^;]*)/) || [])[1] || '');
        expect(cookie).not.toBe('');
        expect(p.wikidot_token7).toBe(cookie);

        expect(await renderedBbHeaders(page)).toEqual([...HEADERS, ...DATE_PARTS]);
        const rows = await renderedRows(page);
        expect(rows).toHaveLength(200);
        // Every field of every row, in the site's order (newest first).
        expect(rows.map((r) => ({
            Page: r.Page, Category: r.Category, _flagItems: r._flagItems, _flags: r._flags, Date: r.Date, Time: r.Time, Revision: r.Revision,
            User: r.User, _userHref: r._userHref, Comment: r.Comment, _href: r._href,
        }))).toEqual(P1);
        expect(rows.every((r) => r._userTarget === '_blank')).toBe(true);

        // The live page: the site's list hidden, the table after it under its <h2>.
        await expect(page.locator('#site-changes-list')).toBeHidden();
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(await page.evaluate(() => {
            const list = document.getElementById('site-changes-list');
            const h2 = document.querySelector('h2.mb-bb-list-heading');
            const table = document.querySelector('table.mb-bb-changes-table');
            const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
            // The engine adds a toggle, the row count and the filter bar to the <h2>.
            return !!h2 && h2.textContent.includes('Recent changes') && after(list, h2) && after(h2, table);
        })).toBe(true);
        expect(requests.filter((u) => /\/ws\/2\/|musicbrainz\.(org|eu)|coverartarchive\.org/.test(u))).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('"1,000": five POSTs, pages 1 to 5 in order, 1,000 rows', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { posts } = await loadBbChangesPage(page);
        await press(page, 'Show the last 1,000 changes');
        expect(posts.map((f) => f.page)).toEqual(['1', '2', '3', '4', '5']);
        expect(posts.every((f) => f.perpage === '200')).toBe(true);
        const rows = await renderedRows(page);
        expect(rows).toHaveLength(1000);
        // The route answers page n with p1 or p2 in turn: page 2's rows follow page 1's.
        expect(rows.slice(200, 400).map((r) => r._href)).toEqual(P2.map((r) => r._href));
        expect(errors).toEqual([]);
    });

    test('the site\'s form decides what is asked for: revision types and category', async ({ page }) => {
        const { posts } = await loadBbChangesPage(page);
        await page.evaluate(() => {
            document.getElementById('rev-type-all').checked = false;
            document.getElementById('rev-type-new').checked = true;
            document.getElementById('rev-type-tags').checked = true;
            document.getElementById('rev-category').value = '18072044'; // "song"
        });
        await press(page, 'Show the last 200 changes');
        expect(JSON.parse(posts[0].options)).toEqual({ new: true, tags: true });
        expect(posts[0].categoryId).toBe('18072044');
    });

    test('Flags is one row per letter, and filters by its meaning', async ({ page }) => {
        await loadBbChangesPage(page);
        await press(page, 'Show the last 200 changes');
        const rows = await renderedRows(page);
        const two = rows.filter((r) => r._flags.length === 2);
        expect(two.length).toBe(P1.filter((r) => r._flags.length === 2).length);
        expect(two.length).toBeGreaterThan(0);
        expect(await page.locator('table.tbl tbody tr td ul li .mb-bb-flag').count())
            .toBe(P1.reduce((n, r) => n + r._flags.length, 0));

        const input = columnFilterInput(page, HEADERS.indexOf('Flags'));
        await input.click();
        await input.pressSequentially('new page');
        const wantN = P1.filter((r) => r._flags.includes('N')).length;
        await expect.poll(async () => (await renderedRows(page)).length, { timeout: 15000 }).toBe(wantN);
        const filtered = await renderedRows(page);
        expect(filtered.every((r) => r._flags.includes('N'))).toBe(true);
    });

    // Pins that Flags is a MULTI-ROW column (collapsableColumns), not just a
    // list: a two-flag cell shows one row and a ▶ toggle, a one-flag cell
    // none; the toggle opens it; the header has its collapse button and the
    // count of multi-row cells (2026-10-22, the user's screenshot of
    // "content source text changed / title changed" as two loose lines).
    test('Flags is a multi-row column: a two-flag cell collapses behind its toggle', async ({ page }) => {
        await loadBbChangesPage(page);
        await press(page, 'Show the last 200 changes');
        const wantMulti = P1.filter((r) => r._flags.length === 2).length;
        const flagsTh = page.locator('table.tbl thead tr:first-child th[data-col-name="Flags"]');
        await expect(flagsTh.locator('.mb-col-collapse-hdr-btn')).toHaveCount(1);
        await expect(flagsTh.locator('.mb-col-collapse-count')).toContainText(String(wantMulti));

        const flagsIdx = HEADERS.indexOf('Flags') + 1;
        const cells = page.locator(`table.tbl tbody tr td:nth-child(${flagsIdx})`);
        const multi = cells.filter({ has: page.locator('.mb-cell-collapse-toggle') });
        await expect(multi).toHaveCount(wantMulti);
        const first = multi.first();
        await expect(first.locator('li:visible')).toHaveCount(1);
        await first.locator('.mb-cell-collapse-toggle').click();
        await expect(first.locator('li:visible')).toHaveCount(2);

        const single = cells.filter({ has: page.locator('li') }).filter({ hasNot: page.locator('.mb-cell-collapse-toggle') });
        await expect(single).toHaveCount(P1.filter((r) => r._flags.length === 1).length);
    });

    test('Date is split into DD / MM / YYYY / Day / Month, as on MusicBrainz pages', async ({ page }) => {
        await loadBbChangesPage(page);
        await press(page, 'Show the last 200 changes');
        const rows = await renderedRows(page);
        const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });
        const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
        rows.forEach((r) => {
            const [y, m, d] = r.Date.split('-');
            const at = new Date(`${r.Date}T12:00:00Z`);
            expect([r.DD, r.MM, r.YYYY, r.Day, r.Month], r.Date)
                .toEqual([String(parseInt(d, 10)), String(parseInt(m, 10)), y, weekday.format(at), month.format(at)]);
        });
    });

    test('Date and Time get the 📊 sections their MusicBrainz namesakes get', async ({ page }) => {
        await loadBbChangesPage(page);
        await press(page, 'Show the last 200 changes');
        // Date: the "Date info" sections of every dateParts-fed column.
        const dateSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Date'));
        const dateLabels = dateSections.map((s) => s.label);
        for (const label of ['Date info - Year', 'Date info - Month', 'Date info - Weekday']) {
            expect(dateLabels, label).toContain(label);
        }
        const years = dateSections.find((s) => s.label === 'Date info - Year');
        const wantYears = new Map();
        P1.forEach((r) => wantYears.set(r.Date.slice(0, 4), (wantYears.get(r.Date.slice(0, 4)) || 0) + 1));
        expect(years.items.reduce((n, i) => n + i.count, 0)).toBe(200);
        expect(years.items.length).toBe(wantYears.size);
        // Time: "Time info - Time of day", by the column's name, as an event page's "Time".
        const timeSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Time'));
        const tod = timeSections.find((s) => s.label === 'Time info - Time of day');
        expect(tod, 'Time info - Time of day').toBeTruthy();
        const bucket = (t) => {
            const [h, m] = t.split(':').map(Number);
            const min = h * 60 + m;
            return min < 240 ? 'Night' : min < 720 ? 'Morning' : min < 780 ? 'Lunch' : min < 1080 ? 'Afternoon' : 'Evening';
        };
        const want = new Map();
        P1.forEach((r) => want.set(bucket(r.Time), (want.get(bucket(r.Time)) || 0) + 1));
        const got = new Map(tod.items.map((i) => [i.label.replace('» time of day: ', '').split(' ')[0], i.count]));
        expect(got).toEqual(want);
    });

    test('Revision sorts as a number', async ({ page }) => {
        await loadBbChangesPage(page);
        await press(page, 'Show the last 200 changes');
        const btn = page.locator('table.tbl thead th[data-col-name="Revision"] .sort-icon-btn', { hasText: '▲' }).first();
        await waitForSortSettled(page, () => btn.click());
        const revs = (await renderedRows(page)).map((r) => parseInt(r.Revision, 10));
        expect(revs).toEqual([...revs].sort((a, b) => a - b));
        expect(revs[0]).toBe(0);
    });

    test('a Wikidot error answer is a failed page, said out loud, not an empty table', async ({ page }) => {
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        const { posts } = await loadBbChangesPage(page, { ajaxStatus: 'wrong_token7' });
        await page.click('button[data-label="Show the last 1,000 changes"]');
        await expect.poll(() => logs.some((t) => /wrong_token7/.test(t)), { timeout: 15000 }).toBe(true);
        // It stops at the first failed page: no request for pages 2 to 5.
        // The run is over once the button is usable again.
        await expect(page.locator('button[data-label="Show the last 1,000 changes"]')).toBeEnabled({ timeout: 15000 });
        expect(posts).toHaveLength(1);
        expect(await page.locator('table.tbl tbody tr').count()).toBe(0);
    });

    test('an HTTP error on page 3 keeps pages 1 and 2 and offers the rest', async ({ page }) => {
        const { posts } = await loadBbChangesPage(page, { failPage: 3 });
        await press(page, 'Show the last 1,000 changes');
        // fetchHtml() retries a 500 (three attempts), then the run stops.
        expect(posts.filter((f) => f.page === '3').length).toBeGreaterThanOrEqual(1);
        expect(posts.some((f) => f.page === '4')).toBe(false);
        expect(await renderedRows(page)).toHaveLength(400);
    });
});

test.describe('Recent changes: Save to Disk → Load from Disk', () => {
    let tmpDir;
    test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-changes-')); });
    test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('a reopened log renders into the empty table of a fresh page, with no request', async ({ context }) => {
        const source = await context.newPage();
        await loadBbChangesPage(source);
        await press(source, 'Show the last 200 changes');
        const before = (await renderedRows(source)).map((r) => `${r._href} ${r.Revision} ${r.Date} ${r.Time}`);
        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-changes.json.gz');
        await (await downloadPromise).saveAs(saved);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        const { posts } = await loadBbChangesPage(page);
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await renderedRows(page)).map((r) => `${r._href} ${r.Revision} ${r.Date} ${r.Time}`)).toEqual(before);
        expect(await page.locator('table.tbl').count()).toBe(1);
        await expect(page.locator('#site-changes-list')).toBeHidden();
        expect(posts).toEqual([]);
        expect(errors).toEqual([]);
    });
});
