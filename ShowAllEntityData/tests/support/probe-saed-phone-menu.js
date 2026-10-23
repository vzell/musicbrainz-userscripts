'use strict';
/**
 * Probe (2026-10-23): on a phone layout (Pixel 7, device-width), where does
 * the open ☰ SAED panel paint, and what is under its first "Load" row?
 * Network-free: the releasegroup-releases raw snapshot.
 *
 *     node tests/support/probe-saed-phone-menu.js
 */
const path = require('path');
const { chromium, devices } = require('@playwright/test');
const { loadUserscriptPage } = require('./loadPage');

const URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    await loadUserscriptPage(page, { url: URL, fixtureFile: SHELL, testMode: true });
    await page.locator('#mb-saed-menu-btn').tap();
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
        const panel = document.getElementById('mb-saed-menu-btn-panel');
        const row = panel.querySelector('.mb-saed-load-row');
        const rr = row.getBoundingClientRect();
        const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
        const chain = [];
        for (let el = panel; el; el = el.parentElement) {
            const cs = getComputedStyle(el);
            chain.push(`${el.tagName.toLowerCase()}#${el.id}.${el.className} pos=${cs.position} z=${cs.zIndex} tr=${cs.transform} ct=${cs.contain} filter=${cs.filter}`);
        }
        const hdr = document.querySelector('.header');
        return {
            clientWidth: document.documentElement.clientWidth,
            innerWH: [innerWidth, innerHeight], vv: [visualViewport.width, visualViewport.height, visualViewport.offsetTop, visualViewport.scale],
            scroll: [scrollX, scrollY],
            btn: r(document.getElementById('mb-saed-menu-btn')),
            panel: r(panel), panelStyle: panel.getAttribute('style'), panelClass: panel.className,
            row: r(row),
            hit: hit ? `${hit.tagName}.${hit.className} ${hit.textContent.slice(0, 40)}` : null,
            chain,
            hdr: hdr ? [r(hdr), getComputedStyle(hdr).position, getComputedStyle(hdr).zIndex] : null,
        };
    });
    console.log(JSON.stringify(out, null, 2));
    await browser.close();
})();
