'use strict';
/**
 * Probe (2026-11-16): the boxes around springsteenlyrics.com's moved toolbar
 * h1 on memorabilia (the h1 in div.mb-sl-header inside .row, before the
 * floated .col-sm-12), and the same after putting it back in .project-detail.
 * Prints each box's top, margins and display, to find where a vertical shift
 * comes from. Run: npx playwright test -c scripts/probe-sl-sticky-head.config.js -g margins
 */
const { test } = require('@playwright/test');
const { loadSlListPage } = require('../tests/support/slFixture');

const CSS = [
    '*, *::before, *::after { box-sizing: border-box; }',
    '.container { padding-left: 15px; padding-right: 15px; margin-left: auto; margin-right: auto; }',
    '.row { margin-left: -15px; margin-right: -15px; }',
    '.row::after { content: ""; display: table; clear: both; }',
    '.col-sm-12 { position: relative; min-height: 1px; padding-left: 15px; padding-right: 15px; float: left; width: 100%; }',
    '@media (min-width: 992px) { .container { width: 970px; } }',
].join('\n');

test('margins memorabilia', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await loadSlListPage(page, { kind: 'memorabilia', headCss: CSS, settingsOverride: { sa_render_threshold: 100000 } });
    await page.waitForTimeout(800);
    const dump = () => page.evaluate(() => {
        const h1 = document.querySelector('h1.mb-sl-h1');
        const d = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + Array.from(e.classList).filter((c) => !/^mb-sph/.test(c)).join('.') : '');
        const box = (e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
            return `${d(e).slice(0, 50).padEnd(50)} top=${Math.round(r.top)} h=${Math.round(r.height)} mt=${cs.marginTop} mb=${cs.marginBottom} pt=${cs.paddingTop} disp=${cs.display} float=${cs.float} pos=${cs.position}`; };
        const out = ['h1: ' + box(h1)];
        for (let a = h1.parentElement; a && a !== document.body; a = a.parentElement) {
            out.push('anc: ' + box(a));
            let p = a.previousElementSibling; let n = 0;
            while (p && n < 3) { out.push('   prev: ' + box(p)); p = p.previousElementSibling; n++; }
        }
        const status = document.getElementById('mb-status-displays-wrapper');
        out.push('status: ' + box(status));
        const pd = document.querySelector('.project-detail');
        for (const [name, el] of [['row', pd.closest('.row')], ['col', pd.closest('.col-sm-12')]]) {
            const before = getComputedStyle(el, '::before');
            out.push(`children of the h1's ${name} (::before content=${before.content} display=${before.display} height=${before.height}):`);
            Array.from(el.childNodes).slice(0, 14).forEach((c) => {
                if (c.nodeType === 1) out.push('   ' + box(c));
                else if (c.nodeType === 3) {
                    const r = document.createRange(); r.selectNodeContents(c); const rr = r.getBoundingClientRect();
                    out.push(`   #text ${JSON.stringify(c.textContent.slice(0, 30))} h=${Math.round(rr.height)} top=${Math.round(rr.top)}`);
                } else out.push(`   node type ${c.nodeType}`);
            });
        }
        return out.join('\n');
    });
    console.log('=== MOVED\n' + await dump());
    await page.evaluate(() => {
        const h1 = document.querySelector('h1.mb-sl-h1');
        const pd = document.querySelector('.project-detail');
        const status = document.getElementById('mb-status-displays-wrapper');
        const w = h1.parentElement;
        pd.insertBefore(status, pd.firstChild);
        pd.insertBefore(h1, status);
        w.remove();
    });
    console.log('=== ORIGINAL\n' + await dump());
});
