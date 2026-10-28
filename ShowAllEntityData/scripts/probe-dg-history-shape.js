'use strict';

/**
 * Probe the shape of Discogs' history pages for the `dghistory` reader
 * (org/POH-headerline.org, Step 4): vzell saved a master's, an artist's and
 * a label's history page from his browser (Cloudflare refuses scripts) as
 * debug/dg-{master,artist,label}-history.html, beside the release history
 * the reader was written for (debug/discogs-release-history.html). In a
 * headless Chromium, from disk (no network: every request is aborted), for
 * each page: the change rows (`table#hist tbody > tr.datarow`), the
 * `#editing_header` and its `<h1>` links (the saved copies passed murdos'
 * importer, which puts a musicbrainz.org link first in it), the diff table,
 * the data quality, and the pagination (`.pagination_links`: the current
 * page and the pages linked).
 *
 * usage: node scripts/probe-dg-history-shape.js
 */
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGES = ['discogs-release-history', 'dg-master-history', 'dg-artist-history', 'dg-label-history'];

/**
 * Opens each saved page and prints what the reader would find in it.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route(/^https?:\/\//, (route) => route.abort());
    for (const name of PAGES) {
        await page.goto(`file://${path.join(ROOT, 'debug', `${name}.html`)}`, { waitUntil: 'domcontentloaded' });
        const r = await page.evaluate(() => {
            const head = document.querySelector('#editing_header');
            const pag = document.querySelector('.pagination_links');
            return {
                rows: document.querySelectorAll('table#hist tbody > tr.datarow').length,
                latest: !!document.querySelector('table#hist tr#latest'),
                h1Links: head ? Array.from(head.querySelectorAll('h1 a[href]')).map(a => `${a.getAttribute('href').slice(0, 70)} "${a.textContent.trim().slice(0, 40)}"`) : null,
                h1Text: head && head.querySelector('h1') ? head.querySelector('h1').textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : '',
                code: (head && head.querySelector('.copy_shortcut_code') || {}).textContent || '',
                diff: !!document.querySelector('table.diff'),
                quality: ((document.querySelector('#rating .vote_info_helper') || {}).textContent || '').trim(),
                current: pag ? ((pag.querySelector('.currentpage') || {}).textContent || '').trim() : '',
                pages: pag ? Array.from(new Set(Array.from(pag.querySelectorAll('a[href]')).map(a => (/[?&]page=(\d+)/.exec(a.href) || [])[1]).filter(Boolean))) : [],
                actions: Array.from(new Set(Array.from(document.querySelectorAll('table#hist tbody > tr.datarow .hili')).map(x => x.textContent.trim()))),
                // Which way a page runs, and so which page holds the latest change.
                firstRow: ((document.querySelector('table#hist tbody > tr.datarow td span[title]') || {}).title || ''),
                lastRow: (Array.from(document.querySelectorAll('table#hist tbody > tr.datarow td span[title]')).pop() || {}).title || '',
                latestRowIndex: Array.from(document.querySelectorAll('table#hist tbody > tr.datarow')).findIndex(tr => tr.id === 'latest'),
            };
        });
        console.log(`== ${name}`);
        console.log(JSON.stringify(r, null, 1));
    }
    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
