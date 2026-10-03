'use strict';

// Diagnostic probe for org/mobile.org bug 2: on a phone, Sticky Page Headers
// squeezes every pinned bar into a ~120 px column.
//
// Loads a LIVE musicbrainz.org page (the fixtures carry no MusicBrainz
// stylesheet, so #page is not display:table there and the layout the bug
// lives in cannot occur) under Playwright's Pixel 7 emulation, renders the
// consolidated table with Sticky Page Headers forced ON for touch devices,
// and dumps the numbers _sphRefresh() works from: the viewport widths, the
// content extent, and per pinned target its parent's content box, the
// gutter and the width it was clamped to. A desktop run of the same page is
// printed beside it as the control.
//
// Usage:  node tests/support/probe-mobile-sph.js [url] [buttonLabel]
// Network: one page load plus the userscript's own fetch of that page.

const { chromium, devices } = require('@playwright/test');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');

const URL = process.argv[2] || 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const LABEL = process.argv[3] || null;

/**
 * Collects the viewport and per-target geometry the sticky-page-headers
 * refresh pass bases its decisions on.
 *
 * @returns {object} Plain JSON-able measurements.
 */
function collect() {
    const docEl = document.documentElement;
    const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left + window.scrollX), right: Math.round(r.right + window.scrollX),
            width: Math.round(r.width) };
    };
    const tables = Array.from(document.querySelectorAll('table.tbl'));
    const extent = Math.max(0, ...tables.map((t) => t.getBoundingClientRect().right + window.scrollX));
    const page = document.getElementById('page');
    const targets = Array.from(document.querySelectorAll('.mb-sph-target')).map((el) => {
        const p = el.parentElement;
        return {
            el: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.') : ''),
            parent: p ? p.tagName + (p.id ? '#' + p.id : '') : null,
            parentRect: rect(p),
            maxw: el.style.getPropertyValue('--mb-sph-maxw'),
            left: el.style.getPropertyValue('--mb-sph-left'),
            width: Math.round(el.getBoundingClientRect().width),
        };
    });
    return {
        ua: navigator.userAgent.slice(0, 60),
        coarse: matchMedia('(hover: none) and (pointer: coarse)').matches,
        clientWidth: docEl.clientWidth,
        innerWidth: window.innerWidth,
        visualViewport: window.visualViewport
            ? { width: Math.round(visualViewport.width), scale: visualViewport.scale } : null,
        scrollWidth: docEl.scrollWidth,
        sphOn: docEl.classList.contains('mb-sph-on'),
        tablesExtent: Math.round(extent),
        body: rect(document.body),
        page: rect(page),
        pageDisplay: page ? getComputedStyle(page).display : null,
        pageInlineWidth: page ? page.style.width : null,
        content: rect(document.getElementById('content')),
        targets,
    };
}

/**
 * Runs one emulation arm and prints its measurements.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {string} name - arm name for the printout
 * @param {object} contextOpts - Playwright context options (device descriptor)
 * @param {object} settingsOverride - GM settings to seed
 * @returns {Promise<void>}
 */
async function arm(browser, name, contextOpts, settingsOverride) {
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();
    await loadUserscriptPage(page, { url: URL, testMode: true, settingsOverride });
    const sel = LABEL ? `button[data-label="${LABEL}"]` : 'button[data-label]';
    await page.waitForSelector(sel, { timeout: 30000 });
    await page.$eval(sel, (b) => b.click());
    await waitForRenderComplete(page, { waitForAutoResize: settingsOverride.sa_auto_resize_columns !== false });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(collect);
    console.log(`\n===== ${name} =====`);
    console.log(JSON.stringify(m, null, 1));
    await context.close();
}

(async () => {
    const browser = await chromium.launch();
    const base = { sa_enable_sticky_page_headers: true, sa_sticky_page_headers_on_touch: true,
        sa_enable_caa_pics: false, sa_enable_relationships_column: false };
    try {
        await arm(browser, 'desktop 1280 (control)', { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }, base);
        await arm(browser, 'Pixel 7, auto-resize on', devices['Pixel 7'], base);
        await arm(browser, 'Pixel 7, auto-resize off', devices['Pixel 7'], { ...base, sa_auto_resize_columns: false });
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
