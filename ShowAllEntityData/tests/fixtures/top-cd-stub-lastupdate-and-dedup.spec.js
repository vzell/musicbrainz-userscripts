'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const CDSTUB_URL = 'https://musicbrainz.org/cdstub/browse';

/** Reads one column's cell text for every rendered row, by header name. */
const columnValues = (page, colName) => page.evaluate((name) => {
    const table = document.querySelector('table.tbl');
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.dataset.colName || th.textContent.trim());
    const idx = headers.indexOf(name);
    return Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.cells[idx]?.textContent.trim() ?? null);
}, colName);

test.describe('top-cd-stub (/cdstub/browse)', () => {
    test('the merged lastupdate text lands in Comment, not Primary alias', async ({ page }) => {
        const FIXTURE_FILE = path.join(__dirname, 'top-cd-stub-lastupdate.html');
        await loadUserscriptPage(page, { url: CDSTUB_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${CDSTUB_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

        await page.click('button[data-label="Show all CD Stubs"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const comments = await columnValues(page, 'Comment');
        const aliases = await columnValues(page, 'Primary alias');

        // _extractMainColumnParts() always appends MB-Name, Comment, Primary
        // alias in that order — Primary alias is the row's real last cell,
        // not Comment. The lastupdate-merge branch used to write into
        // `cells.length - 1` (Primary alias); it must write into
        // `cells.length - 2` (Comment) instead.
        expect(comments).toEqual(['Added 9 years ago, last modified 9 years ago']);
        expect(aliases).toEqual(['']);
    });

    test('a row already rendered from an earlier page is not rendered again', async ({ page }) => {
        const PAGE1 = path.join(__dirname, 'top-cd-stub-dup-rows-page1.html');
        const PAGE2 = path.join(__dirname, 'top-cd-stub-dup-rows-page2.html');
        await loadUserscriptPage(page, { url: CDSTUB_URL, fixtureFile: PAGE1, testMode: true });
        await page.route(`${CDSTUB_URL}?**`, (route) => {
            const pageNum = new URL(route.request().url()).searchParams.get('page') || '1';
            route.fulfill({ path: pageNum === '2' ? PAGE2 : PAGE1, contentType: 'text/html' });
        });

        await page.click('button[data-label="Show all CD Stubs"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // page1 = A, B, C; page2 = B, C, D (B/C are the SAME hrefs on both
        // pages — MusicBrainz's own live-reranking overlap, see
        // top-cd-stub-dup-rows-page2.html's own comment). The consolidated
        // table must show each of A/B/C/D exactly once, never B or C twice.
        const titles = await columnValues(page, 'MB-Name');
        expect(titles.sort()).toEqual(['Row A', 'Row B', 'Row C', 'Row D']);

        const statusText = await page.locator('#mb-global-status-display').textContent();
        expect(statusText).toContain('Loaded 2 pages (4 rows)');
    });

    test('a duplicate row\'s own lastupdate text is dropped, not merged onto an unrelated kept row', async ({ page }) => {
        // MusicBrainz always renders a data row's own lastupdate info row as
        // the VERY NEXT sibling <tr>. When a data row is skipped as a
        // duplicate, that sibling still arrives — the lastupdate-merge
        // branch must skip it too, or it silently merges onto
        // allRows[allRows.length - 1] (whichever row happened to be kept
        // most recently), corrupting an unrelated row's Title cell (the
        // Comment COLUMN can self-heal by coincidence with only a single
        // duplicate in the run, since it OVERWRITES rather than appends —
        // page2 here dupes THREE consecutive rows, A/B/C, so that cannot
        // happen: only Comment values that are actually correct pass).
        // Reproduces the real-world failure: on a real 1200-row fetch, one
        // kept row's Title cell ended up with 44,000+ accumulated
        // characters this way, from a long run of skipped duplicates all
        // wrongly merging onto it.
        const PAGE1 = path.join(__dirname, 'top-cd-stub-dup-rows-page1.html');
        const PAGE2 = path.join(__dirname, 'top-cd-stub-dup-rows-page2.html');
        await loadUserscriptPage(page, { url: CDSTUB_URL, fixtureFile: PAGE1, testMode: true });
        await page.route(`${CDSTUB_URL}?**`, (route) => {
            const pageNum = new URL(route.request().url()).searchParams.get('page') || '1';
            route.fulfill({ path: pageNum === '2' ? PAGE2 : PAGE1, contentType: 'text/html' });
        });

        await page.click('button[data-label="Show all CD Stubs"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const titles = await columnValues(page, 'MB-Name');
        const comments = await columnValues(page, 'Comment');
        const byTitle = Object.fromEntries(titles.map((t, i) => [t, comments[i]]));

        expect(byTitle['Row A']).toBe('Added 1 year ago, last modified 1 year ago');
        expect(byTitle['Row B']).toBe('Added 2 years ago, last modified 2 years ago');
        expect(byTitle['Row C']).toBe('Added 3 years ago, last modified 3 years ago');
        expect(byTitle['Row D']).toBe('Added 4 years ago, last modified 4 years ago');

        // The sticky Title column's own <span class="comment"> is built with
        // appendChild (never overwritten), so it's the more sensitive
        // signal: exactly one per row, always. A leaked duplicate merge
        // appends a SECOND (or third) span onto whichever row absorbed it.
        const titleCommentSpanCounts = await page.evaluate(() =>
            Array.from(document.querySelectorAll('table.tbl tbody tr td.mb-sticky-col'))
                .map((td) => td.querySelectorAll('span.comment').length));
        expect(titleCommentSpanCounts).toEqual([1, 1, 1, 1]);
    });
});
