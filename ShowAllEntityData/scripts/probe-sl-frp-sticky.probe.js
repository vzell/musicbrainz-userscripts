'use strict';
/**
 * Probe (2026-11-16): on springsteenlyrics.com's collection entry page after
 * the press, in a narrow touch window, which of the sticky bars (the header
 * block, the data h2, the thead) actually stick, and what could stop them:
 * the html classes, each bar's computed position/top and its top in the
 * window deep in the table, and every ancestor whose overflow is not
 * visible. Reported: nothing sticks on the FRP in Firefox's responsive mode
 * (908 x 1377, touch) and on a phone, while the IP docks.
 * The `frp-sticky-live` cases load the REAL page (the site's own CSS and
 * scripts, which the fixtures have stripped) with the userscript injected
 * and default settings: a few requests to springsteenlyrics.com.
 * Run: npx playwright test -c scripts/probe-sl-sticky-head.config.js -g frp-sticky
 */
const fs = require('fs');
const path = require('path');
const { test, devices, chromium, firefox } = require('@playwright/test');
const { loadSlListPage, SL_KINDS } = require('../tests/support/slFixture');
const { loadUserscriptPage } = require('../tests/support/loadPage');
const { waitForRenderComplete } = require('../tests/support/browser');

const CSS = [
    '*, *::before, *::after { box-sizing: border-box; }',
    '.container { padding-left: 15px; padding-right: 15px; margin-left: auto; margin-right: auto; }',
    '.row { margin-left: -15px; margin-right: -15px; }',
    '.col-sm-12 { position: relative; min-height: 1px; padding-left: 15px; padding-right: 15px; }',
    '@media (min-width: 768px) { .col-sm-12 { float: left; width: 100%; } .container { width: 750px; } }',
    '@media (min-width: 992px) { .container { width: 970px; } }',
    '.navbar { min-height: 80px; height: 80px; overflow: hidden; background: #fff; width: 100%; }',
    '@media (max-width: 992px) { .navbar-default, .navbar-inverse { position: relative !important; } }',
].join('\n');

const CONFIGS = {
    'chromium Pixel 7': { browser: chromium, ctx: { ...devices['Pixel 7'] } },
    'chromium 908 touch': { browser: chromium, ctx: { viewport: { width: 908, height: 1377 }, hasTouch: true, isMobile: true } },
    'firefox 908': { browser: firefox, ctx: { viewport: { width: 908, height: 1377 } } },
    // Playwright's Firefox cannot emulate touch; the script only asks this
    // media query (_isTouchPrimaryDevice()), so it is answered "touch" here.
    'firefox 908 touch-query': { browser: firefox, ctx: { viewport: { width: 908, height: 1377 } }, touchQuery: true },
};

/** Init script: `(hover: none) and (pointer: coarse)` matches, as on a phone. */
const TOUCH_QUERY = `(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/hover:\\s*none/.test(q) && /pointer:\\s*coarse/.test(q))
        ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {},
            addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } : orig(q);
})();`;
const out = {};

/**
 * Reads the bars' state deep in the table.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object>}
 */
const read = (page) => page.evaluate(() => {
    const d = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + Array.from(e.classList).slice(0, 4).join('.') : '');
    const h1 = document.querySelector('h1.mb-sl-h1');
    const head = h1 && (h1.closest('.mb-vsb-head') || h1);
    const h2 = document.getElementById('mb-global-filter-input')?.closest('h2');
    const thead = document.querySelector('table.tbl > thead');
    const bar = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const scrollers = [];
        for (let a = el.parentElement; a; a = a.parentElement) {
            const c = getComputedStyle(a);
            if (c.overflowX !== 'visible' || c.overflowY !== 'visible') scrollers.push(`${d(a)} ${c.overflowX}/${c.overflowY}`);
        }
        return { el: d(el), position: cs.position, top: cs.top, rectTop: Math.round(el.getBoundingClientRect().top), scrollers };
    };
    return {
        html: document.documentElement.className, body: document.body.className.slice(0, 120),
        touch: matchMedia('(hover: none) and (pointer: coarse)').matches,
        innerWidth, clientWidth: document.documentElement.clientWidth, scrollY: Math.round(scrollY),
        scrollW: document.documentElement.scrollWidth,
        head: bar(head), h2: bar(h2), thead: bar(thead),
        dyn: document.getElementById('mb-vsb-dyn-style')?.textContent || null,
    };
});

for (const [name, cfg] of Object.entries(CONFIGS)) {
    test(`frp-sticky ${name}`, async () => {
        const browser = await cfg.browser.launch();
        const ctx = await browser.newContext(cfg.ctx);
        if (cfg.touchQuery) await ctx.addInitScript({ content: TOUCH_QUERY });
        const page = await ctx.newPage();
        try {
            await loadSlListPage(page, { kind: 'collection-intro', headCss: CSS, settingsOverride: { sa_render_threshold: 100000 } });
            await page.waitForTimeout(500);
            const res = {};
            await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.5)));
            await page.waitForTimeout(300);
            res.ip = await read(page);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.$eval(`button[data-label="${SL_KINDS['collection-intro'].button}"]`, (b) => b.click());
            await waitForRenderComplete(page, { waitForAutoResize: false });
            await page.waitForTimeout(800);
            await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.5)));
            await page.waitForTimeout(300);
            res.frp = await read(page);
            out[name] = res;
        } finally {
            await browser.close();
        }
    });
}

for (const [name, cfg] of Object.entries(CONFIGS)) {
    test(`frp-sticky-live ${name}`, async () => {
        test.setTimeout(360000);
        const browser = await cfg.browser.launch();
        const ctx = await browser.newContext(cfg.ctx);
        if (cfg.touchQuery) await ctx.addInitScript({ content: TOUCH_QUERY });
        const page = await ctx.newPage();
        try {
            await loadUserscriptPage(page, { url: 'https://www.springsteenlyrics.com/collection.php', testMode: true,
                settingsOverride: { sa_enable_springsteenlyrics: true, sa_render_threshold: 100000, sa_max_page: 100 } });
            await page.waitForSelector('h1.mb-sl-h1', { timeout: 30000 });
            await page.waitForTimeout(1500);
            const res = {};
            await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.5)));
            await page.waitForTimeout(500);
            res.ip = await read(page);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.$eval('button[data-label="Show all latest additions"]', (b) => b.click());
            try {
                await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 240000 });
            } catch (e) {
                const tag = name.replace(/\W+/g, '-');
                await page.screenshot({ path: path.join(__dirname, '..', 'debug', `probe-sl-frp-sticky-live-${tag}-stuck.png`) });
                const info = await page.evaluate(() => ({
                    status: document.getElementById('mb-status-displays-container')?.textContent.replace(/\s+/g, ' ').trim(),
                    dialogs: Array.from(document.querySelectorAll('[role="dialog"], .mb-custom-dialog, #mb-dialog-render'))
                        .map((d) => d.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)),
                    url: location.href,
                }));
                out['live ' + name] = { stuck: info };
                throw e;
            }
            await page.waitForTimeout(1500);
            await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.5)));
            await page.waitForTimeout(500);
            res.frp = await read(page);
            await page.screenshot({ path: path.join(__dirname, '..', 'debug', `probe-sl-frp-sticky-live-${name.replace(/\W+/g, '-')}.png`) });
            out['live ' + name] = res;
        } finally {
            await browser.close();
        }
    });
}

test.afterAll(() => {
    fs.writeFileSync(path.join(__dirname, '..', 'debug', 'probe-sl-frp-sticky.json'), JSON.stringify(out, null, 1));
});
