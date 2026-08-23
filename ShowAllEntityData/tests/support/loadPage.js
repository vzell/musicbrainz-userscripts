'use strict';

const path = require('path');
const { buildGmStubsScript } = require('./gmStubs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const IRO_URL = 'https://cdn.jsdelivr.net/npm/@jaames/iro@5';
const PAKO_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js';
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
 * iro/pako are pulled from the same CDN URLs the userscript itself
 * `@require`s (pinned versions, so they're already stable/offline-safe in
 * practice) rather than vendored locally — revisit only if that CDN
 * dependency turns out to cause real friction.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ url: string, fixtureFile?: string }} opts
 * @returns {Promise<void>}
 */
async function loadUserscriptPage(page, { url, fixtureFile }) {
    await page.addInitScript({
        content: buildGmStubsScript(fixtureFile ? FIXTURE_SETTINGS_OVERRIDE : {}),
    });

    if (fixtureFile) {
        await page.route(url, (route) => route.fulfill({ path: fixtureFile, contentType: 'text/html' }));
    }

    await page.goto(url);

    await page.addScriptTag({ url: IRO_URL });
    await page.addScriptTag({ url: PAKO_URL });
    await page.addScriptTag({ path: MB_LIBRARY_PATH });
    await page.addScriptTag({ path: USERSCRIPT_PATH });
}

module.exports = { loadUserscriptPage, USERSCRIPT_PATH, MB_LIBRARY_PATH };
