'use strict';

/**
 * Report a paginated MusicBrainz listing's EXACT native row count, cheaply —
 * two page loads instead of the full "Show all" walk.
 *
 * Sizing a perf fixture needs the real number, and the WS/2 `release-count`
 * used by scripts/probe-artist-release-counts.py is only an estimate: that
 * browse counts releases whose credit includes the artist, while the
 * `artist-releases` pageType's URL carries `?va=0`, which excludes
 * various-artist releases. Close, but not the number that ends up in the
 * fixture.
 *
 * Method: load page 1, read the pagination widget's highest page number and
 * page 1's own row count, then load the LAST page and count its rows. Total is
 * (maxPage - 1) * perPage + lastPageRows. No userscript is injected — this
 * reads MusicBrainz's own native table, which is what a capture would fetch.
 *
 *   node scripts/probe-pagetype-row-count.js <url> [<url> ...]
 */

const { chromium } = require('playwright');

/**
 * @param {import('playwright').Page} page
 * @param {string} url
 * @returns {Promise<{maxPage: number, rows: number}>}
 */
async function readPage(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return page.evaluate(() => {
        const nums = Array.from(document.querySelectorAll('.pagination a, nav.pagination a'))
            .map((a) => parseInt((a.textContent || '').trim(), 10))
            .filter((n) => Number.isFinite(n));
        const table = document.querySelector('table.tbl');
        const rows = table
            ? Array.from(table.querySelectorAll('tbody tr'))
                .filter((tr) => !tr.querySelector('td[colspan]') || tr.cells.length > 1).length
            : 0;
        return { maxPage: nums.length ? Math.max(...nums) : 1, rows };
    });
}

(async () => {
    const urls = process.argv.slice(2);
    if (!urls.length) {
        console.error('usage: node scripts/probe-pagetype-row-count.js <url> [...]');
        process.exit(2);
    }
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const url of urls) {
        try {
            const first = await readPage(page, url);
            let total = first.rows;
            if (first.maxPage > 1) {
                const sep = url.includes('?') ? '&' : '?';
                const last = await readPage(page, `${url}${sep}page=${first.maxPage}`);
                total = (first.maxPage - 1) * first.rows + last.rows;
                console.log(`${url}\n    pages=${first.maxPage}  perPage=${first.rows}  `
                    + `lastPage=${last.rows}  => ${total} rows`);
            } else {
                console.log(`${url}\n    pages=1  => ${total} rows`);
            }
        } catch (e) {
            console.log(`${url}\n    error: ${e.message}`);
        }
    }
    await browser.close();
})();
