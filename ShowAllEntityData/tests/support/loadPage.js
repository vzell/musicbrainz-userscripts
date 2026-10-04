'use strict';

const path = require('path');
const { buildGmStubsScript } = require('./gmStubs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// The two third-party libraries the userscript `@require`s, served from
// node_modules instead of their CDNs. They are exact-pinned devDependencies
// (package.json) and byte-identical to what the CDNs serve: same sha256 for
// `@jaames/iro@5` (jsdelivr resolves it to 5.5.2, dist/iro.min.js) and for
// cdnjs `pako/2.1.0/pako.min.js`, checked 2026-10-04. Loading them from the
// CDNs on every page load made each spec depend on two third-party hosts: on
// 2026-10-04 a jsdelivr outage failed 72 tests of the merge gate, every one in
// `addScriptTag` before any assertion ran (DEBUG-NOTES.md).
// `tests/fixtures/harness-required-libs.spec.js` keeps the pin in step with
// the userscript's `@require` lines; `scripts/check-vendored-libs.py` compares
// the bytes with the CDNs by hand.
const IRO_PATH = require.resolve('@jaames/iro/dist/iro.min.js');
const PAKO_PATH = require.resolve('pako/dist/pako.min.js');

// The CDN hosts of the userscript's `@require`s. With PLAYWRIGHT_BLOCK_CDN=1
// every request to them is aborted, which is how a whole suite run proves it
// needs neither of them.
const CDN_RE = /^https?:\/\/(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//;
const MB_LIBRARY_PATH = path.join(REPO_ROOT, 'lib', 'VZ_MBLibrary.user.js');
const USERSCRIPT_PATH = path.join(PROJECT_ROOT, 'ShowAllEntityData.user.js');

// Both default to `true` in configSchema. CAA/EAA fetches via GM_xmlhttpRequest
// (already stubbed to a fake 404 by gmStubs.js) so they're harmless either way,
// but the "Relationships" injected column fetches via plain fetch() — NOT
// stubbed — straight to musicbrainz.org's WS/2 API. Forcing both off for
// fixture tests keeps that suite genuinely network-free even once a fixture
// test clicks a "Show all" button, rather than relying on no test happening
// to trigger it.
const FIXTURE_SETTINGS_OVERRIDE = {
    sa_enable_caa_pics: false,
    sa_enable_relationships_column: false,
};

// `_migrateFrozenSettings()` repairs a GM profile that VZ_MBLibrary's old SAVE
// handler froze (org/config-handling.org F1), and it decides what was frozen by
// comparing stored values against defaults this script once shipped. A SEEDED
// setting looks exactly like a frozen one — and several specs seed a value that
// IS a retired default, `sa_auto_resize_columns: false` above all
// (collapse-column-width-stable-on-sort.spec.js, four call sites). Left alone,
// the migration would delete those seeds and hand the spec today's default
// instead, so the test would measure the opposite of what it asked for and
// still pass or fail for reasons of its own.
//
// So every load starts with migrations already applied. The level is a plain
// number the userscript compares with `>=`, and seeding one far above anything
// it will ship keeps this from going stale on the next migration step — the
// point is "not this profile", not "up to date".
//
// The one spec that exercises the migration seeds `sa_settings_migration_level:
// 0` through `settingsOverride`, which is merged on top of this.
const SETTINGS_MIGRATION_PRE_APPLIED = {
    sa_settings_migration_level: 9999,
};

// A fixture page is served from disk, but only its main document is routed:
// every subresource it references still goes to the network, and `page.goto()`
// waits for all of them before `load` fires. One of them is a saved release
// page's sidebar cover thumbnail, fetched straight from the Internet Archive
// (`archive.org/download/mbid-…_thumb250.jpg`, or a `*.archive.org` mirror it
// redirects to). Under load that request has taken 20 s, and in one full-suite
// trace never finished — so `len-flag-disk-roundtrip` and
// `live-date-flags-survive-disk-roundtrip` timed out in `page.goto()` before
// the userscript was even injected (DEBUG-NOTES.md, 2026-10-01).
//
// Matches `archive.org` and its subdomains only. `coverartarchive.org` and
// `eventartarchive.org` are different hosts and do NOT match, so every spec
// that mocks those keeps working; and a non-image request falls back to
// whatever other route applies.
const ARCHIVE_ORG_RE = /^https?:\/\/(?:[^/]+\.)?archive\.org\//;

/**
 * Loads ShowAllEntityData.user.js onto `page`, matching the exact
 * `@require` order declared in the userscript header (iro, pako,
 * VZ_MBLibrary), after stubbing every `@grant`ed GM_* API.
 *
 * `pageDefinitions[].match()` reads `window.location.pathname`/`search`, so
 * a fixture must be served at a real musicbrainz.org-shaped URL for page-type
 * detection to behave as it does live. When `fixtureFile` is given, this
 * intercepts navigation to `url` via `page.route()` and fulfills it with the
 * local file instead of touching the network — `url` still has to be the
 * musicbrainz.org URL the fixture represents. Omit `fixtureFile` to navigate
 * to a real live page instead.
 *
 * iro and pako come from node_modules (`addRequiredLibs()`), not from the
 * CDNs the userscript `@require`s them from: a fixture load touches no
 * network at all. See IRO_PATH for why, and for how the pin is kept honest.
 *
 * `testMode: true` sets `window.__SA_TEST_MODE__ = true` before the
 * userscript loads, which gates its `window.__saTest` debug hook (see
 * ShowAllEntityData.user.js's "Test-mode debug hook" section, near the end
 * of the file) — never set outside a test run.
 *
 * Both init scripts are registered on `page.context()`, not `page` itself,
 * so a same-origin tab the userscript opens with `window.open()` (e.g. the
 * "Show single-table" cross-tab snapshot handoff) also gets GM stubs/test
 * mode applied to its own first navigation — a page-level
 * `page.addInitScript()` only ever applies to `page`'s own navigations, not
 * to a separate `Page` object Playwright creates for that popup. Harmless
 * for every existing single-page test: for one page, context-level and
 * page-level init scripts behave identically.
 *
 * `settingsOverride` is merged on TOP of `FIXTURE_SETTINGS_OVERRIDE` (so it
 * wins on any key both specify) — for a test that specifically needs one of
 * those two forced-off settings back on (e.g. `sa_enable_caa_pics: true` to
 * exercise the CAA/EAA artwork pipeline against mocked `page.route()`
 * responses rather than real network), instead of duplicating this whole
 * function's setup.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ url: string, fixtureFile?: string, testMode?: boolean, settingsOverride?: Object<string, *> }} opts
 * @returns {Promise<void>}
 */
async function loadUserscriptPage(page, { url, fixtureFile, testMode, settingsOverride }) {
    if (testMode) {
        await page.context().addInitScript({ content: 'window.__SA_TEST_MODE__ = true;' });
    }

    await page.context().addInitScript({
        content: buildGmStubsScript({
            // Applied to live specs too: they run against a real page with an
            // empty GM store, where the migration would find nothing to do —
            // but "nothing to do" is a property of the store, not a guarantee,
            // and a live spec that seeds a setting deserves the same protection.
            ...SETTINGS_MIGRATION_PRE_APPLIED,
            ...(fixtureFile ? FIXTURE_SETTINGS_OVERRIDE : {}),
            ...(settingsOverride || {}),
        }),
    });

    if (fixtureFile) {
        await page.route(url, (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
        // See ARCHIVE_ORG_RE: a fixture must not wait on the Internet Archive.
        await page.route(ARCHIVE_ORG_RE, (route) => (route.request().resourceType() === 'image'
            ? route.abort('blockedbyclient')
            : route.fallback()));
    }

    if (process.env.PLAYWRIGHT_BLOCK_CDN) {
        await page.context().route(CDN_RE, (route) => route.abort('blockedbyclient'));
    }

    await page.goto(url);

    await addRequiredLibs(page);
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
}

/**
 * Injects the userscript's two third-party `@require`s, iro then pako (the
 * header's order), from node_modules. Every place that loads the userscript
 * by hand (a popup tab, a real-network page) goes through this, so there is
 * one copy of where they come from.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function addRequiredLibs(page) {
    await page.addScriptTag({ path: IRO_PATH });
    await page.addScriptTag({ path: PAKO_PATH });
}

module.exports = {
    loadUserscriptPage, addRequiredLibs, USERSCRIPT_PATH, MB_LIBRARY_PATH, ARCHIVE_ORG_RE,
    IRO_PATH, PAKO_PATH, CDN_RE,
};
