'use strict';

/** Dumps the heading/table skeleton of a native work page, so a fixture can mimic it. */
const { chromium } = require('playwright');

const URL = 'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('table.tbl', { timeout: 60000 }).catch(() => {});
    const out = await page.evaluate(() => {
        const content = document.getElementById('content');
        const seq = [];
        if (content) {
            Array.from(content.children).forEach((el) => {
                seq.push(`<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}> ${(el.textContent || '').trim().slice(0, 60).replace(/\s+/g, ' ')}`);
            });
        }
        const tbl = document.querySelector('table.tbl');
        return {
            hasContent: !!content,
            contentChildren: seq,
            firstRow: tbl ? tbl.querySelector('tbody tr').outerHTML.slice(0, 700) : null,
            theadHtml: tbl ? tbl.querySelector('thead').outerHTML.slice(0, 500) : null,
        };
    });
    console.log(JSON.stringify(out, null, 2));
    await browser.close();
})();
