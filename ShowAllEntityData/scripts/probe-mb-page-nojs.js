'use strict';

/**
 * Phase 0 of the popup engine (org/iframe.org): what does a MusicBrainz
 * entity page show in the window's "Live page" view, where it runs WITHOUT
 * its scripts?
 *
 *   node scripts/probe-mb-page-nojs.js [--out debug]
 *
 * The view is the detail-page engine's (docs/claude/detail-pages.md): the
 * page's HTML, fetched same-origin, cleaned by `_dpLiveDocHtml()` (scripts,
 * noscripts, inline handlers, javascript: URLs and meta refresh removed,
 * iframes turned into links, a `<base href>` added) and shown as the `srcdoc`
 * of an `<iframe sandbox="allow-same-origin …">` with no `allow-scripts`.
 * MusicBrainz renders its pages on the server and then hydrates them with
 * React, so the question is how much of each page is in the server's HTML.
 *
 * For every entity kind the planned cards serve, this probe:
 *   1. fetches the page from INSIDE a musicbrainz.org page (as the userscript
 *      would; a plain HTTP client gets a proof-of-work page since 2026-10-01,
 *      see scripts/fetch-release-fixture.js) and records the status, size,
 *      time and the response headers that matter for rate limiting;
 *   2. lists the page's embedded `<script type="application/json">` blocks
 *      and their top-level keys: where one exists, a single HTML fetch could
 *      feed BOTH the Extracted view and the Live page view;
 *   3. shows the cleaned copy in a sandboxed srcdoc frame, exactly as the
 *      engine would, and measures it: #content and #sidebar present and
 *      visible, text length, table rows, section headings, images loaded;
 *   4. loads the same page normally (scripts on) and measures it the same
 *      way, so the difference is what only the scripts produce;
 *   5. saves a screenshot of the frame as <out>/probe-nojs-<kind>.png.
 *
 * Requests: one page load to pass the browser check, then per kind one
 * in-page fetch and one normal page load, 1.5 s apart (about 30 requests).
 * Anonymous, no login. Prints a report and writes <out>/probe-mb-page-nojs.json.
 *
 * Results of the first runs (2026-10-07, host petri) are recorded in
 * org/iframe.org, "Phase 0: probes", R5 to R9: every probed page is complete
 * without its scripts except a "Wikipedia" section whose cache is cold; the
 * content sits in #content, or #page on /user/ and /isrc/; only /release/
 * embeds its entity as JSON; HTML answers carry no x-ratelimit headers.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const MB = 'https://musicbrainz.org';
const SPACING_MS = 1500;

/** The pages probed, one per kind the cards serve (identifier legend of PAGETYPES-TESTING-REFERENCE.org). */
const PAGES = [
    ['release-group', '/release-group/39b22944-7503-3937-8bba-09b17281cc6a'],
    ['release', '/release/1d404e1d-fcb6-3a52-b478-e706e893c897'],
    ['recording', '/recording/bbcedc0f-2fff-42f4-9ca6-6d2263d1a042'],
    ['work', '/work/9893a23c-f282-3b07-a2db-b4f2f3b9f4b2'],
    ['artist', '/artist/70248960-cb53-4ea4-943a-edb18f7d336f'],
    ['label', '/label/011d1192-6f65-45bd-85c4-0400dd45693e'],
    ['event', '/event/3f2ca30a-7de4-4964-ad30-48376535fec8'],
    ['place', '/place/6a59a67c-fcc5-491f-949c-bfc45bc97463'],
    ['area', '/area/a36544c1-cb40-4f44-9e0e-7a5a69e403a8'],
    ['series', '/series/aa3694d3-a3d0-48ed-8f07-5b576de87908'],
    ['instrument', '/instrument/63021302-86cd-4aee-80df-2270d54f4978'],
    ['isrc', '/isrc/USSM17500803'],
    ['user', '/user/vzell'],
    // The edit is resolved at run time from the release group's edit history.
    ['edit', null],
];

let lastAt = 0;

/**
 * Waits until SPACING_MS has passed since the previous request.
 *
 * @returns {Promise<void>}
 */
async function spacing() {
    const wait = lastAt + SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
}

/**
 * Fetches a page from inside the musicbrainz.org page and analyses it there:
 * status, headers, size, embedded JSON, and the cleaned copy measured in a
 * sandboxed srcdoc frame. Runs in the browser.
 *
 * @param {{url: string, frameId: string}} arg
 * @returns {Promise<object>}
 */
async function inPageProbe({ url, frameId }) {
    /**
     * `_dpLiveDocHtml()` of the userscript, the same in behaviour; an iframe
     * becomes a placeholder paragraph instead of a link.
     *
     * @param {string} html
     * @param {string} pageUrl
     * @returns {string} The document for the frame's srcdoc.
     */
    function liveDocHtml(html, pageUrl) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, noscript, meta[http-equiv="refresh" i]').forEach((n) => n.remove());
        doc.querySelectorAll('*').forEach((el) => {
            Array.from(el.attributes).forEach((a) => {
                const name = a.name.toLowerCase();
                if (name.startsWith('on') ||
                    (/^(?:href|src|action|formaction|xlink:href)$/.test(name) && /^\s*javascript:/i.test(a.value))) {
                    el.removeAttribute(a.name);
                }
            });
        });
        doc.querySelectorAll('iframe').forEach((fr) => {
            const p = doc.createElement('p');
            p.textContent = '[embedded frame]';
            fr.replaceWith(p);
        });
        let base = doc.querySelector('base');
        if (!base) {
            base = doc.createElement('base');
            doc.head.insertBefore(base, doc.head.firstChild);
        }
        base.setAttribute('href', pageUrl);
        const dt = doc.doctype;
        return (dt ? `<!DOCTYPE ${dt.name}>` : '') + doc.documentElement.outerHTML;
    }
    /**
     * Measures one document: the frame's script-free copy.
     *
     * @param {Document} doc
     * @returns {object}
     */
    function measure(doc) {
        const vis = (el) => !!el && el.getClientRects().length > 0;
        const content = doc.querySelector('#content');
        const sidebar = doc.querySelector('#sidebar');
        const page = doc.querySelector('#page');
        const imgs = Array.from(doc.querySelectorAll('#page img'));
        const tag = (c) => (c.id ? '#' + c.id : c.tagName.toLowerCase() + (c.classList.length ? '.' + c.classList[0] : ''));
        return {
            // Where the page's own content sits: the Live page view's liveRoot.
            layout: page ? `#page${page.className ? '.' + page.className.trim().split(/\s+/).join('.') : ''} > ` +
                Array.from(page.children).map(tag).join(', ') : 'no #page',
            chrome: ['.header', '#header', '.banner', '.tabs', '#footer', '.footer'].filter((s) => doc.querySelector(s)),
            content: !!content,
            contentVisible: vis(content),
            // Rendered text only: #content holds <script> JSON payloads (731 KB
            // on a release page) that textContent would count.
            contentText: (content || page) ? (content || page).innerText.replace(/\s+/g, ' ').trim().length : 0,
            sidebar: !!sidebar,
            sidebarVisible: vis(sidebar),
            h1: ((doc.querySelector('#content h1, .pageheader h1, h1') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            h2s: Array.from(doc.querySelectorAll('#content h2')).map((h) => h.textContent.replace(/\s+/g, ' ').trim()).slice(0, 12),
            tables: doc.querySelectorAll('#content table.tbl').length,
            rows: doc.querySelectorAll('#content table.tbl > tbody > tr').length,
            visibleRows: Array.from(doc.querySelectorAll('#content table.tbl > tbody > tr')).filter(vis).length,
            images: imgs.length,
            imagesLoaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
            header: vis(doc.querySelector('#header, .header')),
            footer: vis(doc.querySelector('#footer, .footer')),
            styleSheets: doc.styleSheets.length,
        };
    }
    const t0 = performance.now();
    const resp = await fetch(url, { credentials: 'include' });
    const html = await resp.text();
    const ms = Math.round(performance.now() - t0);
    const headers = {};
    ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'x-mb-gateway',
        'cache-control', 'content-type', 'server'].forEach((h) => {
        if (resp.headers.get(h) !== null) headers[h] = resp.headers.get(h);
    });
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const json = Array.from(parsed.querySelectorAll('script[type="application/json"]')).map((s) => {
        let keys;
        try {
            const v = JSON.parse(s.textContent);
            keys = v && typeof v === 'object' ? Object.keys(v).slice(0, 12) : typeof v;
        } catch (e) {
            keys = 'not JSON';
        }
        return { id: s.id || null, bytes: s.textContent.length, keys };
    });
    const scripts = parsed.querySelectorAll('script').length;
    const challenge = /Verifying your browser|__meb_verify/.test(html);

    const old = document.getElementById(frameId);
    if (old) old.remove();
    const frame = document.createElement('iframe');
    frame.id = frameId;
    frame.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:1500px;z-index:2147483647;background:#fff;border:0';
    document.body.appendChild(frame);
    const loaded = new Promise((resolve) => {
        frame.addEventListener('load', function onLoad() {
            if (frame.contentDocument && frame.contentDocument.URL !== 'about:blank') {
                frame.removeEventListener('load', onLoad);
                resolve();
            }
        });
    });
    frame.srcdoc = liveDocHtml(html, url);
    await loaded;
    await new Promise((r) => setTimeout(r, 2500)); // stylesheets and images
    return {
        status: resp.status, ms, bytes: html.length, headers, challenge, scripts, json,
        nojs: measure(frame.contentDocument),
    };
}

/**
 * Measures the normally loaded page (scripts on). Runs in the browser.
 *
 * @returns {object}
 */
function measureLive() {
    const vis = (el) => !!el && el.getClientRects().length > 0;
    const content = document.querySelector('#content') || document.querySelector('#page');
    return {
        contentText: content ? content.innerText.replace(/\s+/g, ' ').trim().length : 0,
        h2s: Array.from(document.querySelectorAll('#content h2')).map((h) => h.textContent.replace(/\s+/g, ' ').trim()).slice(0, 12),
        tables: document.querySelectorAll('#content table.tbl').length,
        rows: document.querySelectorAll('#content table.tbl > tbody > tr').length,
        visibleRows: Array.from(document.querySelectorAll('#content table.tbl > tbody > tr')).filter(vis).length,
        sidebarVisible: vis(document.querySelector('#sidebar')),
    };
}

/**
 * Entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const outIdx = process.argv.indexOf('--out');
    const out = outIdx > 0 ? process.argv[outIdx + 1] : 'debug';
    fs.mkdirSync(out, { recursive: true });
    console.log(`Probe run ${new Date().toISOString()}`);
    const browser = await chromium.launch();
    const results = {};
    try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
        const page = await context.newPage();
        // Pass the browser check once; the cookie then serves every in-page fetch.
        await spacing();
        await page.goto(`${MB}/release-group/39b22944-7503-3937-8bba-09b17281cc6a`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('#content', { timeout: 90000 });

        // An edit to probe: the newest one in the release group's history.
        await spacing();
        const editPath = await page.evaluate(async () => {
            const html = await (await fetch('/release-group/39b22944-7503-3937-8bba-09b17281cc6a/edits', { credentials: 'include' })).text();
            const m = html.match(/href="(\/edit\/\d+)"/);
            return m ? m[1] : null;
        });
        PAGES.find((p) => p[0] === 'edit')[1] = editPath;

        const live = await context.newPage();
        for (const [kind, p] of PAGES) {
            if (!p) {
                console.log(`\n## ${kind}: no page found to probe`);
                continue;
            }
            const url = MB + p;
            await spacing();
            const r = await page.evaluate(inPageProbe, { url, frameId: 'mb-probe-frame' });
            await page.locator('#mb-probe-frame').screenshot({ path: path.join(out, `probe-nojs-${kind}.png`) });
            await spacing();
            let liveM;
            try {
                await live.goto(url, { waitUntil: 'load', timeout: 90000 });
                await live.waitForTimeout(1500);
                liveM = await live.evaluate(measureLive);
            } catch (e) {
                liveM = { error: String(e).slice(0, 120) };
            }
            results[kind] = { url, ...r, live: liveM };
            const n = r.nojs;
            console.log(`\n## ${kind}  ${p}`);
            console.log(`   HTTP ${r.status} · ${r.bytes.toLocaleString()} chars · ${r.ms} ms · ${r.scripts} scripts${r.challenge ? ' · BROWSER CHECK PAGE' : ''}`);
            console.log(`   headers: ${JSON.stringify(r.headers)}`);
            const groups = new Map();
            r.json.forEach((j) => {
                const k = JSON.stringify(j.keys);
                const g = groups.get(k) || { n: 0, bytes: 0 };
                g.n += 1;
                g.bytes += j.bytes;
                groups.set(k, g);
            });
            console.log(`   embedded JSON: ${groups.size ? Array.from(groups).map(([k, g]) => `${g.n}x ${k} (${g.bytes.toLocaleString()} chars)`).join('; ') : 'none'}`);
            console.log(`   layout: ${n.layout}; site chrome: ${n.chrome.join(' ')}`);
            console.log(`   without scripts: #content ${n.content ? (n.contentVisible ? 'visible' : 'HIDDEN') : 'MISSING'}, ${n.contentText} chars;` +
                ` #sidebar ${n.sidebar ? (n.sidebarVisible ? 'visible' : 'HIDDEN') : 'none'}; ${n.tables} tables, ${n.visibleRows}/${n.rows} rows visible;` +
                ` images ${n.imagesLoaded}/${n.images}; stylesheets ${n.styleSheets}; header ${n.header ? 'shown' : 'hidden'}`);
            console.log(`   h1: ${JSON.stringify(n.h1)}  h2: ${JSON.stringify(n.h2s)}`);
            if (liveM && !liveM.error) {
                console.log(`   with scripts:    ${liveM.contentText} chars; ${liveM.tables} tables, ${liveM.visibleRows}/${liveM.rows} rows visible;` +
                    ` sidebar ${liveM.sidebarVisible ? 'visible' : 'hidden'}; h2: ${JSON.stringify(liveM.h2s)}`);
            } else {
                console.log(`   with scripts:    ${liveM && liveM.error}`);
            }
        }
    } finally {
        await browser.close();
    }
    const jsonOut = path.join(out, 'probe-mb-page-nojs.json');
    fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
    console.log(`\nwrote ${jsonOut} and ${out}/probe-nojs-<kind>.png`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
