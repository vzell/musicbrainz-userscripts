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
});
