'use strict';
/**
 * Probe (2026-11-16): where the toolbar <h1> of a springsteenlyrics.com page
 * sits, and how far its sticky containing block (its parent) reaches.
 * Loads saved HTML offline with JavaScript off, and prints the h1's
 * ancestor chain, the parent's children, what follows each ancestor, and
 * where table.tbl (if any) sits. Usage: node scripts/probe-sl-sticky-parent.js <file.html>...
 */
const path = require('path');
const { chromium } = require('@playwright/test');

/**
 * Reads the structure of one saved page.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} file
 * @returns {Promise<object>}
 */
async function probe(browser, file) {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
    await page.goto('file://' + path.resolve(file));
    const out = await page.evaluate(() => {
        const d = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
            (e.classList.length ? '.' + Array.from(e.classList).join('.') : '');
        const h1 = document.querySelector('h1.mb-sl-h1');
        if (!h1) return { error: 'no h1.mb-sl-h1' };
        const anc = [];
        for (let a = h1.parentElement; a && a !== document.documentElement; a = a.parentElement) anc.push(a);
        const pd = h1.parentElement;
        const t = document.querySelector('table.tbl');
        const common = t ? anc.find((a) => a.contains(t)) : null;
        return {
            ancestors: anc.map(d),
            parentChildren: Array.from(pd.children, (c) => `${d(c).slice(0, 100)} text=${c.textContent.trim().length}`),
            after: anc.map((a) => ({ of: d(a).slice(0, 60),
                next: Array.from({ length: 6 }, (_, i) => i).reduce((acc) => {
                    const prev = acc.length ? acc[acc.length - 1].el : a;
                    const n = prev && prev.nextElementSibling;
                    if (n) acc.push({ el: n });
                    return acc;
                }, []).map((x) => d(x.el).slice(0, 70)) })),
            table: t ? Array.from({ length: 30 }).reduce((acc) => {
                const last = acc.el.parentElement;
                if (last && last !== document.documentElement) { acc.list.push(d(last)); acc.el = last; }
                return acc;
            }, { el: t, list: [] }).list : null,
            commonAncestorOfH1AndTable: common ? d(common) : null,
            listHeadings: Array.from(document.querySelectorAll('h3.heading, h2.mb-sl-list-heading, h2'), (e) => d(e) + ' :: ' + e.textContent.trim().slice(0, 40)).slice(0, 6),
        };
    });
    await ctx.close();
    return out;
}

(async () => {
    const browser = await chromium.launch();
    for (const f of process.argv.slice(2)) {
        console.log('==', f);
        console.log(JSON.stringify(await probe(browser, f), null, 1));
    }
    await browser.close();
})();
