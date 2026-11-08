'use strict';

/**
 * Coexistence probe: ShowAllEntityData (SA) next to majkinetor's Event
 * Horizon (EH) or the whole String Theory bundle, on a REAL
 * musicbrainz.org page. A debugging aid like run-live-interop.js, NOT a
 * regression gate: it asserts nothing and prints/records what it observes,
 * for org/majkinetor.org ("Coexistence").
 *
 *   node tests/support/probe-majkinetor-interop.js --out=<file.json>
 *   node tests/support/probe-majkinetor-interop.js --cases=A,C --scripts=majkinetor-string-theory
 *   node tests/support/probe-majkinetor-interop.js --cases=0      # SA alone, the baseline
 *
 * Cases (each in a fresh browser context, so GM storage starts clean):
 *   0  SA alone (baseline for layout/CSS and request counts).
 *   A  EH on at load (its default, `view.on: true`): where SA's h1 bar
 *      lands, whether it is visible, then V (EH off, same page, no reload),
 *      the SA fetch, V/V again — is the FRP still there?
 *   B  EH off at load: SA fetch first, then V/V; SA's floating elements
 *      per body before and after; EH's single-key commands on the FRP.
 *   C  EH on at load, a link followed INSIDE EH (pushState), then V: EH
 *      reloads into MusicBrainz's page of the new path ('eh-off'); SA is
 *      re-injected after that reload (the harness only injects SA once per
 *      navigation, Tampermonkey would run it again by itself).
 *   D  EH on at load on an artist page, V at once, SA fetch while EH's
 *      own requests may still run: requests per second and 503s.
 *   E  EH off at load: SA fetch, V (EH on), h in EH's view (its keyGo()
 *      clicks its own #app link, in place), V (EH off: reloads when EH
 *      navigated), then a click on a recording link of MusicBrainz's page:
 *      whether SA's "You are about to leave this page" confirm came, at
 *      each step (vzell, 2026-11-08; dialogs are recorded and dismissed).
 *   I  ISRC Scout alone (--scripts=majkinetor-isrc-scout) or inside the
 *      bundle (--scripts=majkinetor-string-theory; EH seeded off) on a
 *      release with track links: how its "Links" icons are labelled (title or data-tip)
 *      on the native page, and whether SA's render gives each icon its
 *      platform name (data-mb-link-platform, _normalizeIsrcScoutLinksTd()).
 *      --url=<release> overrides the release (default ISRC_RELEASE).
 *
 * Harness notes (also in the manifest entries):
 * - EH is `@run-at document-start`; injectOne()'s 'init' defers it to
 *   DOMContentLoaded. SA is added after `load` (addScriptTag), so the
 *   order EH-then-SA matches Tampermonkey's document-start/document-idle.
 * - String Theory calls GM functions gmStubs.js lacks; PROBE_GM_EXTRA
 *   adds no-op versions here, in this probe only.
 * - GM storage is ONE store shared by every injected script (EH's 'view'
 *   key beside SA's 'sa_*' keys), as in Tampermonkey per script it is not:
 *   the keys do not collide, so this does not change behaviour.
 *
 * Output: one JSON object per case (`--out`), plus a short console line
 * per observation.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPageWithRealNetwork } = require('./realNetworkGmXhr');
const { addRequiredLibs, MB_LIBRARY_PATH, USERSCRIPT_PATH } = require('./loadPage');
const { loadManifest, resolveScripts, injectLiveUserscripts } = require('./liveUserscripts');
const { seedGmValues } = require('./gmStubs');
const { dismissCustomConfirmDialog } = require('./customDialog');

const PAGETYPES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pagetypes.json'), 'utf8'));

const RELEASE = PAGETYPES.find((c) => c.pageType === 'release-tracks');
const ARTIST = PAGETYPES.find((c) => c.pageType === 'artist-releasegroups');

/** A release whose recordings carry ISRCs and streaming links (manifest: majkinetor-isrc-scout). */
const ISRC_RELEASE = 'https://musicbrainz.org/release/22a6802f-d22e-4f47-9f22-6aac257a4194';

/** No-op stand-ins for the GM functions String Theory calls and gmStubs.js does not provide. */
const PROBE_GM_EXTRA = `
    window.GM_addValueChangeListener = window.GM_addValueChangeListener || function () { return 0; };
    window.GM_removeValueChangeListener = window.GM_removeValueChangeListener || function () {};
    window.GM_openInTab = window.GM_openInTab || function (u) { return window.open(u, '_blank'); };
    window.GM_setClipboard = window.GM_setClipboard || function () {};
    window.GM_cookie = window.GM_cookie || { list: function (d, cb) { cb([], null); } };
    window.GM = window.GM || {};
`;

/**
 * Parses `--key=value` arguments.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ cases: string[], scripts: string[], out: string|null, url: string|null, headed: boolean }}
 */
function parseArgs(argv) {
    const arg = (flag, dflt) => {
        const found = argv.find((a) => a.startsWith(`${flag}=`));
        return found ? found.slice(flag.length + 1) : dflt;
    };
    return {
        cases: arg('--cases', '0,A,B,C,D').split(',').map((s) => s.trim()).filter(Boolean),
        scripts: arg('--scripts', 'majkinetor-event-horizon').split(',').map((s) => s.trim()).filter(Boolean),
        out: arg('--out', null),
        url: arg('--url', null),
        headed: argv.includes('--headed'),
    };
}

/**
 * Reads, in the page, everything the cases compare: the bodies, where SA's
 * bar and floating elements are, whether they can be seen, the FRP, EH's
 * marks on <html>, and a few computed styles that global CSS could move.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function snapshotState(page) {
    return page.evaluate(() => {
        const bodies = [...document.documentElement.children].filter((n) => n.tagName === 'BODY');
        const mbBody = bodies.find((b) => b.querySelector('#page, #content')) || null;
        const bodyIdx = (el) => (el ? bodies.findIndex((b) => b.contains(el)) : -2);
        const seen = (el) => {
            if (!el || !el.isConnected) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const bar = document.querySelector('#mb-saed-bar');
        const buttons = [...document.querySelectorAll('button[data-label]')];
        const floating = bodies.map((b) => [...b.children].filter((c) => /^mb-/.test(c.id) || [...c.classList].some((k) => k.startsWith('mb-'))).map((c) => c.id || '.' + c.className.split(' ')[0]));
        const content = document.querySelector('#content');
        const frpRows = mbBody ? mbBody.querySelectorAll('table.tbl tbody tr').length : 0;
        return {
            path: location.pathname + location.search,
            bodies: bodies.length,
            documentBodyIsMb: document.body === mbBody,
            mbBodyHidden: mbBody ? mbBody.hidden : null,
            htmlMarks: ['data-mbu-page', 'data-mbu-release', 'data-mbu-dock', 'data-mbu-st'].filter((a) => document.documentElement.hasAttribute(a)).map((a) => `${a}=${document.documentElement.getAttribute(a)}`),
            saBar: bar ? { inBody: bodyIdx(bar), visible: seen(bar), h1: (bar.closest('h1') || {}).textContent ? bar.closest('h1').textContent.trim().slice(0, 60) : null, inApp: !!bar.closest('#app') } : null,
            saButtons: buttons.map((b) => ({ label: b.getAttribute('data-label'), inBody: bodyIdx(b), visible: seen(b) })),
            saFloatingPerBody: floating,
            // #sidebar-toggle-handle (initSidebarCollapse()): made once at
            // start-up and appended to document.body, so under EH it lands in
            // EH's body; the mb-* filter of `floating` cannot see its id
            sidebarHandle: (() => { const h = document.getElementById('sidebar-toggle-handle'); return h ? { inBody: bodyIdx(h), visible: seen(h), copies: document.querySelectorAll('#sidebar-toggle-handle').length } : null; })(),
            frp:{ filterBar: !!document.querySelector('#mb-filter-container'), rows: frpRows },
            css: {
                scrollbarGutter: getComputedStyle(document.documentElement).scrollbarGutter,
                contentWidth: content ? Math.round(content.getBoundingClientRect().width) : null,
                contentFloat: content ? getComputedStyle(content).float : null,
                pagePadding: document.querySelector('#page') ? getComputedStyle(document.querySelector('#page')).padding : null,
            },
            ehLaunch: (() => { const l = document.getElementById('eh-launch'); if (!l) return null; const r = l.getBoundingClientRect(); return { inBody: bodyIdx(l), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; })(),
            corner: [...document.querySelectorAll('[data-mb-corner]')].map((n) => n.id || n.className),
        };
    });
}

/**
 * Opens one page in a fresh context: probe GM extras, the chosen
 * majkinetor scripts ('init'), EH's on/off seed, then SA via the
 * real-network loader. Collects page errors and every musicbrainz.org
 * response (time, status, url) for the request-rate figures.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {{ url: string, entries: Object[], ehOn: boolean|null, settings: Object }} opts
 * @returns {Promise<{ context: Object, page: Object, errors: string[], responses: Object[] }>}
 */
async function openPage(browser, { url, entries, ehOn, settings }) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const responses = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('response', (r) => {
        if (/musicbrainz\.org/.test(r.url()) && ['document', 'fetch', 'xhr'].includes(r.request().resourceType())) {
            responses.push({ t: Date.now(), status: r.status(), url: r.url().replace('https://musicbrainz.org', '').slice(0, 140), type: r.request().resourceType() });
        }
    });
    // GM_xmlhttpRequest under realNetworkGmXhr is answered from Node (context.request.get), so it never shows up
    // as a page response. Since 2026-11-06 (1df6193) EH, ISRC Scout and the bundle send their ws/2 that way
    // (mbnWsFetch); count those as type 'gm', or the request figures miss majkinetor's traffic.
    const realGet = context.request.get.bind(context.request);
    context.request.get = async (u, o) => {
        const r = await realGet(u, o);
        if (/musicbrainz\.org/.test(u)) {
            responses.push({ t: Date.now(), status: r.status(), url: String(u).replace(/^https:\/\/[a-z.]*musicbrainz\.org/, '').slice(0, 140), type: 'gm' });
        }
        return r;
    };
    await page.addInitScript({ content: PROBE_GM_EXTRA });
    await injectLiveUserscripts(page, entries);
    if (ehOn !== null) await seedGmValues(page, { view: { on: ehOn } });
    await loadUserscriptPageWithRealNetwork(page, { url, testMode: true, settingsOverride: settings });
    await page.waitForTimeout(3000);
    return { context, page, errors, responses };
}

/**
 * Re-injects SA after a reload EH caused itself. The page-level init
 * scripts (GM stubs, EH) run again on their own; only SA's addScriptTag
 * has to be repeated, as Tampermonkey would by itself.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function reinjectSa(page) {
    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
    await page.waitForTimeout(2500);
}

/**
 * Presses V (EH's "Toggle Event Horizon") with nothing focused, and waits
 * for either a reload or the body swap to settle.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} true when the press reloaded the page
 */
async function pressV(page) {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    const nav = page.waitForEvent('load', { timeout: 6000 }).then(() => true).catch(() => false);
    await page.keyboard.press('v');
    const reloaded = await nav;
    await page.waitForTimeout(reloaded ? 1500 : 2000);
    return reloaded;
}

/**
 * Clicks SA's button by label (forcing past visibility, so a hidden bar
 * still records whether the click does anything) and waits for the FRP.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - the pagetypes.json showAllButtonSelector
 * @returns {Promise<{ clicked: boolean, rendered: boolean, ms: number, error?: string }>}
 */
async function runSaFetch(page, selector) {
    const t0 = Date.now();
    try {
        const btn = page.locator(selector).first();
        if (!(await btn.count())) return { clicked: false, rendered: false, ms: 0, error: 'no button' };
        const visible = await btn.isVisible();
        if (visible) await btn.click(); else await btn.evaluate((b) => b.click());
        await dismissCustomConfirmDialog(page).catch(() => {});
        await page.waitForSelector('#mb-filter-container', { timeout: 120000, state: 'attached' });
        await page.waitForTimeout(1500);
        return { clicked: true, viaVisibleClick: visible, rendered: true, ms: Date.now() - t0 };
    } catch (e) {
        return { clicked: true, rendered: false, ms: Date.now() - t0, error: e.message.split('\n')[0] };
    }
}

/**
 * Uses two of SA's floating elements the way a user would: opens the
 * ☰ SAED menu (its panel re-attaches itself to `document.body` on open)
 * and hovers a visible `[data-mb-tip]` element, whose card lives in the
 * one `#mb-stat-tooltip` made at start-up and kept by reference.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ menu: Object|null, tooltip: Object|null }>}
 */
async function probeUi(page) {
    const res = { menu: null, tooltip: null };
    const btn = page.locator('#mb-saed-menu-btn');
    if (await btn.count() && await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(400);
        res.menu = await page.evaluate(() => {
            const p = document.getElementById('mb-saed-menu-btn-panel');
            return p ? { connected: p.isConnected, shown: p.isConnected && p.getBoundingClientRect().height > 0 } : { connected: false, shown: false, missing: true };
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
    }
    const at = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[data-mb-tip]')].find((x) => {
            const r = x.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.top > 0 && r.bottom < innerHeight;
        });
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, what: (el.id || el.className || el.tagName).toString().slice(0, 40) };
    });
    if (at) {
        await page.mouse.move(at.x, at.y);
        await page.waitForTimeout(1500);
        res.tooltip = await page.evaluate((what) => {
            const t = document.getElementById('mb-stat-tooltip');
            const all = document.querySelectorAll('#mb-stat-tooltip').length;
            return { target: what, inDocument: !!t, copies: all, shown: !!t && getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().height > 0 };
        }, at.what);
        await page.mouse.move(5, 5);
    }
    return res;
}

/**
 * Counts ISRC Scout's "Links" icons inside or outside SA's rendered tables,
 * by how they are labelled and whether SA gave them a platform name.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function isrcScoutLinks(page) {
    return page.evaluate(() => {
        const all = [...document.querySelectorAll('a.ii-trk-ln')];
        const inFrp = (a) => !!a.closest('table.tbl') && !!document.querySelector('#mb-filter-container');
        const sum = (list) => ({
            icons: list.length,
            withTitle: list.filter((a) => a.hasAttribute('title')).length,
            withDataTip: list.filter((a) => a.hasAttribute('data-tip')).length,
            withPlatformStamp: list.filter((a) => a.hasAttribute('data-mb-link-platform')).length,
            withHiddenName: list.filter((a) => a.querySelector(':scope > .mb-ii-link-name')).length,
            sampleLabel: list[0] ? (list[0].getAttribute('title') || list[0].getAttribute('data-tip') || '').split('\n')[0] : null,
        });
        return {
            linksCells: document.querySelectorAll('td.ii-col-links').length,
            isrcCells: document.querySelectorAll('td.ii-col-isrc').length,
            native: sum(all.filter((a) => !inFrp(a))),
            frp: sum(all.filter(inFrp)),
        };
    });
}

/**
 * Highest number of responses inside any 1-second window, and the 503s.
 *
 * @param {Object[]} responses - from openPage()
 * @returns {{ total: number, maxPerSecond: number, s503: number, byKind: Object, throttled: string[] }}
 */
function rateFigures(list) {
    // page responses and Node-side GM answers are pushed from two places: order them by time first
    const responses = [...list].sort((a, b) => a.t - b.t);
    let max = 0;
    for (let i = 0, j = 0; i < responses.length; i++) {
        while (responses[i].t - responses[j].t >= 1000) j++;
        max = Math.max(max, i - j + 1);
    }
    const byKind = {};
    responses.forEach((r) => {
        const base = r.url.startsWith('/ws/2') ? 'ws2' : r.url.startsWith('/ws/js') ? 'wsjs' : r.type;
        const k = r.type === 'gm' && base !== 'gm' ? `gm-${base}` : base;
        byKind[k] = (byKind[k] || 0) + 1;
    });
    // which request was throttled tells whose: a page 'fetch' of ?page=N is SA's, a 'gm' ws/2 is majkinetor's gate
    const throttled = responses.filter((r) => r.status === 503 || r.status === 429);
    return {
        total: responses.length, maxPerSecond: max, s503: throttled.filter((r) => r.status === 503).length, byKind,
        throttled: throttled.map((r) => `${r.status} ${r.type} ${r.url}`),
    };
}

/**
 * Runs one case and returns its observations.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {string} name - '0', 'A', 'B', 'C' or 'D'
 * @param {Object[]} entries - resolved manifest entries
 * @param {string|null} urlOverride - --url, used by case I only
 * @returns {Promise<Object>}
 */
async function runCase(browser, name, entries, urlOverride) {
    const steps = [];
    const note = async (page, label, extra = {}) => {
        const s = { step: label, ...extra, state: await snapshotState(page) };
        steps.push(s);
        const b = s.state.saBar;
        console.log(`[${name}] ${label}: path=${s.state.path} bodies=${s.state.bodies} docBodyIsMb=${s.state.documentBodyIsMb} saBar=${b ? `body${b.inBody} visible=${b.visible} inApp=${b.inApp}` : 'none'} frpRows=${s.state.frp.rows} sbHandle=${s.state.sidebarHandle ? `body${s.state.sidebarHandle.inBody} visible=${s.state.sidebarHandle.visible}` : 'none'} ${Object.keys(extra).length ? JSON.stringify(extra) : ''}`);
    };
    let cfg = name === 'D' || name === '0' ? ARTIST : RELEASE;
    if (name === 'I') cfg = { ...RELEASE, url: urlOverride || ISRC_RELEASE };
    const settings = cfg.seedGmValues || {};
    const ehEntries = name === '0' ? [] : entries;
    // Case I starts with EH off (seeded; harmless without EH), so the bundle shows MusicBrainz's page too.
    const ehOn = name === '0' ? null : (name === 'I' ? false : !['B', 'E'].includes(name));
    const { context, page, errors, responses } = await openPage(browser, { url: cfg.url, entries: ehEntries, ehOn, settings });
    const out = { case: name, url: cfg.url, scripts: ehEntries.map((e) => e.id), steps };
    try {
        await note(page, 'loaded');
        if (name === '0') {
            await note(page, 'fetch', await runSaFetch(page, cfg.showAllButtonSelector));
            await note(page, 'menu + tooltip', await probeUi(page));
        } else if (name === 'A') {
            await note(page, 'V (EH off, same page)', { reloaded: await pressV(page) });
            await note(page, 'SA fetch', await runSaFetch(page, cfg.showAllButtonSelector));
            await note(page, 'menu + tooltip', await probeUi(page));
            await note(page, 'V (EH on)', { reloaded: await pressV(page) });
            await note(page, 'V (EH off again)', { reloaded: await pressV(page) });
        } else if (name === 'B') {
            // EH's single keys on the INITIAL page too (vzell, 2026-11-08):
            // 'h' = Editing history; SAED's _ehKeyGuardInstall() takes it
            // (sa_block_eh_single_keys) since WIP.2. Leaving would end the case,
            // so it is pressed only where the guard is expected to hold.
            await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
            const navIp = page.waitForEvent('load', { timeout: 6000 }).then(() => true).catch(() => false);
            await page.keyboard.press('h');
            await note(page, "key 'h' on the IP", { navigated: await navIp });
            if (page.url().includes('/edits')) { await page.goBack(); await page.waitForLoadState('load'); await reinjectSa(page); }
            await note(page, 'SA fetch', await runSaFetch(page, cfg.showAllButtonSelector));
            await note(page, 'menu + tooltip', await probeUi(page));
            // a SA floating element made on demand: the cell hover tooltip host
            await page.hover('table.tbl tbody tr td a').catch(() => {});
            await page.waitForTimeout(800);
            await note(page, 'after hover');
            await note(page, 'V (EH on)', { reloaded: await pressV(page) });
            await note(page, 'V (EH off)', { reloaded: await pressV(page) });
            // EH's single keys on MusicBrainz's page: 'h' = Editing history
            await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
            const nav = page.waitForEvent('load', { timeout: 6000 }).then(() => true).catch(() => false);
            await page.keyboard.press('h');
            await note(page, "key 'h' on the FRP", { navigated: await nav });
        } else if (name === 'E') {
            const dialogs = [];
            page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message().split('\n')[0]}`); d.dismiss().catch(() => {}); });
            await note(page, 'SA fetch', await runSaFetch(page, cfg.showAllButtonSelector));
            await note(page, 'V (EH on)', { reloaded: await pressV(page) });
            await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
            const navH = page.waitForEvent('load', { timeout: 6000 }).then(() => true).catch(() => false);
            await page.keyboard.press('h');
            await note(page, "key 'h' in EH's view", { reloaded: await navH, dialogs: dialogs.splice(0) });
            const reloaded = await pressV(page);
            if (reloaded) await reinjectSa(page);
            await note(page, 'V (EH off)', { reloaded, dialogs: dialogs.splice(0) });
            const link = page.locator('table.tbl tbody a[href*="/recording/"], #content a[href*="/recording/"]').first();
            const has = await link.count();
            if (has) { await link.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1500); }
            await note(page, 'click a recording link', { hadLink: !!has, dialogs: dialogs.splice(0) });
        } else if (name === 'C') {
            const link = await page.evaluate(() => {
                const a = [...document.querySelectorAll('#app a[href*="/release-group/"]')].find((x) => x.getBoundingClientRect().width > 0);
                if (!a) return null;
                a.click();
                return a.getAttribute('href');
            });
            await page.waitForTimeout(5000);
            await note(page, 'link followed inside EH', { link });
            const reloaded = await pressV(page);
            if (reloaded) await reinjectSa(page);
            await note(page, 'V (EH off on the new path)', { reloaded, saReinjected: reloaded });
            await note(page, 'V (EH on again)', { reloaded: await pressV(page) });
            await page.goBack().catch(() => {});
            await page.waitForTimeout(3000);
            await note(page, 'browser Back');
        } else if (name === 'D') {
            await note(page, 'V at once (EH off)', { reloaded: await pressV(page) });
            await note(page, 'SA fetch', await runSaFetch(page, cfg.showAllButtonSelector));
        } else if (name === 'I') {
            await page.waitForSelector('a.ii-trk-ln', { timeout: 30000 }).catch(() => {});
            await note(page, 'native page, ISRC Scout columns in', await isrcScoutLinks(page));
            await note(page, 'SA fetch', await runSaFetch(page, cfg.showAllButtonSelector));
            await page.waitForTimeout(3000);
            await note(page, 'FRP + 3 s', await isrcScoutLinks(page));
        }
    } catch (e) {
        out.error = e.message.split('\n')[0];
        console.log(`[${name}] ERROR ${out.error}`);
    }
    out.errors = errors;
    out.rate = rateFigures(responses);
    console.log(`[${name}] requests: ${JSON.stringify(out.rate)} pageErrors=${errors.length}`);
    await context.close();
    return out;
}

(async () => {
    const args = parseArgs(process.argv.slice(2));
    const entries = resolveScripts(loadManifest(), { ids: args.scripts });
    const browser = await chromium.launch({ headless: !args.headed });
    const results = { scripts: args.scripts, chromium: browser.version(), started: new Date().toISOString(), cases: [] };
    for (const c of args.cases) {
        results.cases.push(await runCase(browser, c, entries, args.url));
    }
    results.finished = new Date().toISOString();
    await browser.close();
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(results, null, 2));
    console.log(`done${args.out ? ` → ${args.out}` : ''}`);
})().catch((err) => {
    console.error('probe-majkinetor-interop failed:', err);
    process.exit(1);
});
