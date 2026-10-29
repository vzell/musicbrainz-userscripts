'use strict';

const base = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SAVE_HTML_DIR = path.join(__dirname, '..', '..', 'test-results', 'rendered-html');

// MusicBrainz's CDN, from which every saved fixture page still loads its
// scripts, stylesheets and images: only the main document is served from
// disk (loadPage.js), and page.goto() waits for all of them. One release
// fixture pulls about 0.93 MB from it; under 28 workers a fixture load took
// 27 s median and 73 s at worst, every request still open after 8 s being
// on this host, and a full suite run timed out in page.goto() (DEBUG-NOTES
// 2026-10-29). So the fixture projects answer it from a disk cache: the same
// bytes, and MusicBrainz's scripts still run. Its URLs carry content hashes,
// so a cached file never goes stale. Gitignored; only the first fetch of a
// file on a machine reaches the network. SA_NO_STATIC_CACHE=1 turns it off.
const STATIC_MB_RE = /^https:\/\/static\.metabrainz\.org\//;
const STATIC_MB_CACHE = path.join(__dirname, '..', '.cache', 'static-mb');
const STATIC_MB_HEADERS = ['content-type', 'access-control-allow-origin', 'timing-allow-origin', 'cache-control'];
const FIXTURE_PROJECTS = new Set(['chromium-fixtures', 'chromium-mobile']);

/**
 * Answers a static.metabrainz.org GET from the disk cache, or fetches it,
 * stores a 200 answer (written to a temporary file and renamed, so a
 * parallel worker never reads half a file) and passes the answer on.
 *
 * @param {import('@playwright/test').Route} route
 * @returns {Promise<void>}
 */
async function serveStaticMb(route) {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const key = crypto.createHash('sha1').update(req.url()).digest('hex');
    const bodyFile = path.join(STATIC_MB_CACHE, `${key}.body`);
    const metaFile = path.join(STATIC_MB_CACHE, `${key}.json`);
    let cached = null;
    try {
        cached = { meta: JSON.parse(fs.readFileSync(metaFile, 'utf8')), body: fs.readFileSync(bodyFile) };
    } catch {
        // Not cached yet (or half written by a parallel worker): fetch it.
    }
    try {
        if (cached) {
            await route.fulfill({ status: cached.meta.status, headers: cached.meta.headers, body: cached.body });
            return;
        }
        const res = await route.fetch();
        const body = await res.body();
        if (res.status() === 200) {
            const all = res.headers();
            const headers = {};
            STATIC_MB_HEADERS.forEach((h) => { if (all[h]) headers[h] = all[h]; });
            fs.mkdirSync(STATIC_MB_CACHE, { recursive: true });
            const tmp = `${bodyFile}.${process.pid}.${Date.now()}.tmp`;
            fs.writeFileSync(tmp, body);
            fs.renameSync(tmp, bodyFile);
            fs.writeFileSync(`${tmp}.json`, JSON.stringify({ url: req.url(), status: 200, headers }));
            fs.renameSync(`${tmp}.json`, metaFile);
        }
        await route.fulfill({ response: res, body });
    } catch {
        // The page closed mid-request, or the network failed: answer as
        // the network would have, and never fail a test from here.
        await route.abort('failed').catch(() => {});
    }
}

/**
 * Playwright `test`, extended so every test's final `page.content()` gets
 * saved to disk when the `SAVE_HTML` env var is set (any non-empty value),
 * e.g. `SAVE_HTML=1 npm run test:live`. Runs once per test, after the test
 * body finishes (pass or fail), using whatever the page looked like at that
 * point — no per-test code needed.
 *
 * Saved as a static DOM snapshot under test-results/rendered-html/, openable
 * directly in a real browser for visual review. It is inert, though: the
 * userscript's JS/event listeners won't be running in the saved copy, since
 * that requires re-injecting and re-running the script against the DOM,
 * which it isn't designed to do post-hoc — this is for eyeballing the
 * rendered output, not for interacting with it.
 *
 * `<script>` elements are stripped from the saved copy (they serve no
 * purpose in a static snapshot) rather than left inlined verbatim.
 * loadPage.js injects ShowAllEntityData.user.js/VZ_MBLibrary.user.js as
 * inline `<script>` text via `page.addScriptTag({ path })` — harmless live
 * (Playwright sets it via the DOM API, which never runs the HTML tokenizer),
 * but `<script>`/`<style>` raw-text content is serialized completely
 * unescaped, and that multi-megabyte source almost certainly contains a
 * literal `</script` substring somewhere in a comment or string. A fresh
 * parse of the *saved* file (re-opening it in a browser) ends the script tag
 * right there and dumps the rest of the source as literal page text — hence
 * stripping instead of keeping them. A `<base>` tag is also added so
 * MusicBrainz's own CSS/images (referenced with root-relative URLs) still
 * load when the file is opened directly instead of served.
 *
 * All spec files should import `test`/`expect` from this module instead of
 * directly from '@playwright/test' so the behavior applies uniformly.
 */
const test = base.test.extend({
    // Registered when the context is created, before any spec code: route
    // handlers run newest first, so a spec's own route for this host (most
    // abort it, so MusicBrainz's current bundle cannot re-render a fixture)
    // still wins, and this one answers only what nothing else handles.
    context: async ({ context }, use, testInfo) => {
        if (FIXTURE_PROJECTS.has(testInfo.project.name) && !process.env.SA_NO_STATIC_CACHE) {
            await context.route(STATIC_MB_RE, serveStaticMb);
        }
        await use(context);
    },
    page: async ({ page }, use, testInfo) => {
        await use(page);

        if (!process.env.SAVE_HTML) return;

        try {
            const html = await page.evaluate((baseHref) => {
                const clone = document.documentElement.cloneNode(true);
                clone.querySelectorAll('script').forEach((el) => el.remove());

                const base = document.createElement('base');
                base.href = baseHref;
                const head = clone.querySelector('head') || clone;
                head.insertBefore(base, head.firstChild);

                return '<!DOCTYPE html>\n' + clone.outerHTML;
            }, page.url());
            fs.mkdirSync(SAVE_HTML_DIR, { recursive: true });
            const slug = testInfo.titlePath
                .join(' - ')
                .replace(/[^a-z0-9]+/gi, '-')
                .replace(/^-+|-+$/g, '')
                .toLowerCase();
            const filePath = path.join(SAVE_HTML_DIR, `${slug}.html`);
            fs.writeFileSync(filePath, html);
            await testInfo.attach('rendered-html', { path: filePath, contentType: 'text/html' });
        } catch {
            // Best-effort debug convenience (e.g. the page may already be
            // closed/navigated away by the time this runs) — never fail a
            // test because this couldn't run.
        }
    },
});

module.exports = { test, expect: base.expect };
