'use strict';

/**
 * Probe discogs.com's own pages for the dg-* pageTypes (2026-10-18,
 * docs/claude/discogs.md, "The live page"): in a headless Chromium, on the
 * live site,
 *
 *  1. which roots the page has (Discogs' header `#__header_root_<n>`, its
 *     number varies per load; the React page `#app`);
 *  2. whether a node put between them (where `_dgPrepareLivePage()` puts
 *     `#mb-dg-root`) survives the page's own scripts for 8 s;
 *  3. whether a click on a release link from a master page is a full page
 *     load (the userscript then runs afresh) or a route change inside the
 *     app (it would not).
 *
 * Result 2026-10-18 02:04+02:00 (petri): header root `__header_root_3576`,
 * `#app` with one child; the node survived; master → release was a full
 * load (the window's own state was gone).
 *
 * usage: node scripts/probe-discogs-pages.js
 */
const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MASTER = 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run';

/**
 * Runs the three checks and prints what it found.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const browser = await chromium.launch();
    try {
        const page = await (await browser.newContext({ userAgent: UA })).newPage();
        const res = await page.goto(MASTER, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('status', res.status(), '| title', await page.title());
        console.log('roots', JSON.stringify(await page.evaluate(() => {
            const app = document.getElementById('app');
            const hdr = document.querySelector('[id^="__header_root"]');
            if (app) {
                const s = document.createElement('section');
                s.id = 'sa-probe';
                app.before(s);
            }
            return { header: hdr && hdr.id, app: !!app, appChildren: app ? app.children.length : -1 };
        })));
        await page.waitForTimeout(8000);
        console.log('after 8 s, the node is still there:', await page.evaluate(() => !!document.getElementById('sa-probe')));
        await page.evaluate(() => { window.__probeMark = 'kept'; });
        const href = await page.evaluate(() => document.querySelector('#app a[href*="/release/"]')?.href || '');
        if (!href) {
            console.log('no release link in #app to click');
            return;
        }
        await page.evaluate(() => document.querySelector('#app a[href*="/release/"]').click());
        await page.waitForTimeout(6000);
        console.log('click ->', page.url(), '| full page load:', await page.evaluate(() => window.__probeMark !== 'kept'));
    } finally {
        await browser.close();
    }
}

main().catch((e) => {
    console.error('ERR', e.message);
    process.exit(1);
});
