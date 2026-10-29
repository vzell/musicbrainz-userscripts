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
//
// `sa_enable_release_tracks_cover_art` (default true) is the third: the
// release page's "Cover art (N)" section fetches the archive record with plain
// fetch() on every release-tracks render. Specs of that section turn it back
// on and route coverartarchive.org themselves.
//
// `sa_event_overview_event_art` (default true) is the fourth, for the same
// reason on the event page (eventartarchive.org).
//
// The link previews are the other five (all default true since the branch
// feature/popup-defaults-on, org/non-MB-sites.org). With them on, a plain
// hover over any table link in ANY spec shows a card after the rich-tooltip
// delay, and that card asks MusicBrainz's WS/2 (or the linked site) for its
// data: a card can cover the element a spec is about to click, and the
// request leaves the fixture's sandbox. The popup specs seed the switches they
// exercise. A spec that wants the schema default back passes the key as
// `undefined` in `settingsOverride`: `JSON.stringify` drops it, so nothing is
// seeded and `GM_getValue` falls back to `configSchema`.
//
// `sa_async_pop_auto_open` (default true) is the tenth: a background job the
// spec starts by clicking a column toggle would open its progress card
// (#mb-async-pop) right under that toggle, over the header cells a spec clicks
// next. async-pop.spec.js and the job specs that test the card seed it back on.
//
// `sa_bb_mb_event_lookup` (default true, 2026-10-24) is the eleventh: after a
// Brucebase year table renders, its MB-Event column asks MusicBrainz for every
// entry, about one GM request a second. In a spec the stub answers 404, so it
// runs on through every row's name search while the spec interacts, and each
// answer repaints cells and re-runs the filter. bb-mb-event.spec.js seeds it
// back on with its own answers.
//
// The last six (all default true since 2026-10-26, when every non-MB site
// setting went on except the Brucebase side bar and the touch ones) keep the
// foreign-site specs where they were written: the four detail previews
// (`sa_sl/jl/bs/bb_detail_preview`) hang a card on a resting pointer that
// fetches the item page, the compact springsteenlyrics bar
// (`sa_sl_compact_nav`) folds the walls a spec reads, and
// `sa_dp_window_read_ahead` reads a MusicBrainz link ahead inside the preview
// window, one WS/2 request per rest. The specs of each seed it back on.
// The site gates themselves (`sa_enable_<site>`) are not here: the site
// loaders (`slFixture.js`, `bbFixture.js`, …) already seed them.
//
// `sa_yt_play_in_place` and `sa_yt_stills` (org/youtube.org, default true)
// are the last two: every YouTube link would otherwise gain a "Play here"
// tile, whose still frame is a request to i.ytimg.com — the network — and
// whose markup every spec that reads a URL cell, the sidebar or an annotation
// would see. youtube-embeds.spec.js seeds them back on.
//
// `sa_entity_images` (default true, 2026-10-29) is off for the same reason
// as the network ones above: on an artist, label, place, series, instrument
// or area page it asks MusicBrainz for the entity's url-rels a few seconds
// after load (`_eiStart()`, after waiting for zabe's pictures) and loads
// every picture it finds, so a spec that counts requests or reads the
// heading would see it. entity-images.spec.js seeds it back on.
//
// `sa_dp_path_label` (org/POH-headerline.org, default 'name' since
// 2026-10-28) is the one that is not switched off but set back: the window's
// path in its title bar reads each step's KIND with it, the way every spec
// written before the path's names asserts it ("Recording › Editing history").
// popup-mb.spec.js's "the window's path" names test seeds the default back.
const FIXTURE_SETTINGS_OVERRIDE = {
    sa_enable_caa_pics: false,
    sa_enable_relationships_column: false,
    sa_enable_release_tracks_cover_art: false,
    sa_event_overview_event_art: false,
    sa_pop_mb: false,
    sa_pop_mb_page: false,
    sa_pop_ext: false,
    sa_dp_hover_without_ctrl: false,
    sa_event_rg_tooltip_without_ctrl: false,
    sa_async_pop_auto_open: false,
    sa_bb_mb_event_lookup: false,
    sa_sl_detail_preview: false,
    sa_jl_detail_preview: false,
    sa_bs_detail_preview: false,
    sa_bb_detail_preview: false,
    sa_sl_compact_nav: false,
    sa_dp_window_read_ahead: false,
    sa_yt_play_in_place: false,
    sa_yt_stills: false,
    sa_entity_images: false,
    sa_dp_path_label: 'kind',
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

// Settings off for EVERY load, unlike FIXTURE_SETTINGS_OVERRIDE above, which
// applies only when a spec serves an HTML fixture (`fixtureFile`): a
// saved-data load (`loadFromDiskFixture()` without a page shell) and a live
// spec get it too.
//
// `sa_findings_title_style_hint` (default true, 2026-10-29): a card that
// appears 0.9 s after any render with titles, takes Esc and pulses the Aa
// button, so every spec that renders a MusicBrainz table would race it. It
// first showed in a saved-data spec: column-filter-modes.spec.js's Esc went
// to the hint instead of the column's Cc / Rx / Ex pop-up.
// findings-title-style.spec.js seeds it back on.
const HARNESS_SETTINGS_ALWAYS = {
    sa_findings_title_style_hint: false,
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

// The same wait, one hop removed: a page's cover thumbnails are
// `//coverartarchive.org/…/front-250` (or eventartarchive.org), which answers
// with a redirect to archive.org. A route only ever sees the FIRST url of a
// redirect chain, so ARCHIVE_ORG_RE never gets to block the second hop, and
// `filter-autofocus.spec.js` (user-ratings-multigroup.html, two such
// thumbnails) timed out in page.goto() in two full runs (2026-10-14).
//
// So the images IN THE FIXTURE'S OWN MARKUP are blocked at the first hop, and
// only while page.goto() runs: that route is removed as soon as the page has
// loaded, so every request the userscript makes afterwards (the CAA/EAA
// columns, the art sections, the previews) reaches a spec's own mock, or the
// network, exactly as before.
const ART_ARCHIVE_RE = /^https?:\/\/(?:[^/]+\.)?(?:cover|event)artarchive\.org\//;

// The other subresource that reached the real network: every saved
// MusicBrainz page carries `<script src="/static/scripts/supported-browser-check.js">`,
// which resolves to musicbrainz.org itself (the rest of MusicBrainz's JS comes
// from the static.metabrainz.org CDN). Under a parallel suite run that server
// intermittently answers it with `200 text/html` — a page, not a script — and
// Chromium reports the parse as an uncaught `Unexpected token '<'`. Any spec
// that asserts "no page errors" then failed for a reason outside the
// userscript: measured 2026-10-06 as 10 of 48 and 24 of 48 failed runs of
// search-annotation-tooltip.spec.js, on main and on a branch alike
// (DEBUG-NOTES.md).
//
// Answered locally with what the real script does in a supported browser —
// it removes the hidden `#unsupported-browser` warning (fetched 2026-10-06:
// eval a private async method, query `:has()`, then `msg.remove()`) — so the
// DOM a spec sees is the DOM the real page ends up with. The header marks the
// stub so tests/fixtures/harness-mb-static-script.spec.js can tell it apart
// from the network. Another musicbrainz.org script in a future fixture goes
// here too: tests/fixtures and tests/snapshots reference no other one today.
const MB_BROWSER_CHECK_RE = /^https:\/\/musicbrainz\.org\/static\/scripts\/supported-browser-check\.js(?:\?.*)?$/;
const MB_BROWSER_CHECK_STUB =
    "var msg = document.getElementById('unsupported-browser');\n" +
    'if (msg) msg.remove();\n';

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
            ...HARNESS_SETTINGS_ALWAYS,
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
        // See MB_BROWSER_CHECK_RE: musicbrainz.org can answer it with HTML.
        await page.route(MB_BROWSER_CHECK_RE, (route) => route.fulfill({
            status: 200,
            contentType: 'text/javascript; charset=utf-8',
            headers: { 'x-sa-fixture-stub': 'supported-browser-check' },
            body: MB_BROWSER_CHECK_STUB,
        }));
    }

    if (process.env.PLAYWRIGHT_BLOCK_CDN) {
        await page.context().route(CDN_RE, (route) => route.abort('blockedbyclient'));
    }

    // See ART_ARCHIVE_RE: during the load only, newer than any spec mock.
    const blockArtImage = (route) => (route.request().resourceType() === 'image'
        ? route.abort('blockedbyclient')
        : route.fallback());
    if (fixtureFile) await page.route(ART_ARCHIVE_RE, blockArtImage);

    await page.goto(url);

    if (fixtureFile) await page.unroute(ART_ARCHIVE_RE, blockArtImage);

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
    loadUserscriptPage, addRequiredLibs, USERSCRIPT_PATH, MB_LIBRARY_PATH, ARCHIVE_ORG_RE, ART_ARCHIVE_RE,
    IRO_PATH, PAKO_PATH, CDN_RE, FIXTURE_SETTINGS_OVERRIDE, SETTINGS_MIGRATION_PRE_APPLIED, HARNESS_SETTINGS_ALWAYS,
};
