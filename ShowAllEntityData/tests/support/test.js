'use strict';

const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SAVE_HTML_DIR = path.join(__dirname, '..', '..', 'test-results', 'rendered-html');

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
