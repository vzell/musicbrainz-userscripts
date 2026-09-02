'use strict';

/**
 * Builds a plain-JS source string that stubs every Tampermonkey `@grant`
 * the userscript declares (GM_xmlhttpRequest, GM_addStyle, GM_info,
 * GM_setValue/GM_getValue/GM_deleteValue, GM_registerMenuCommand/
 * GM_unregisterMenuCommand). Meant to be injected via `page.addInitScript()`
 * (or, from `loadPage.js`, `page.context().addInitScript()` — see its own
 * doc for why) so it exists before any page or userscript code runs.
 *
 * GM_getValue/GM_setValue/GM_deleteValue are backed by `localStorage`
 * (mirrored into an in-memory `window.__gmValues` cache for synchronous
 * reads within the current document) rather than a page-scoped in-memory
 * object alone — this is what makes real Tampermonkey GM storage
 * cross-tab in the first place (e.g. the "Show single-table" cross-tab
 * snapshot handoff's `GM_setValue`/`GM_getValue` round trip between the
 * original tab and the `window.open()`ed one), so the stub has to be too,
 * or any test exercising that handoff can't see the value the other tab
 * wrote. Still starts clean per test: Playwright's default `page` fixture
 * gives every test its own fresh `BrowserContext`, and `localStorage` is
 * scoped per origin *per context* — a same-origin popup within the SAME
 * test's context correctly shares it, while the NEXT test's fresh context
 * starts empty, unless a test seeds `window.__gmValues` itself before
 * navigation (see `seedGmValues()` below).
 *
 * GM_xmlhttpRequest looks up `window.__gmXhrResponses[url]` (an optional
 * per-test map of `{ status, blob }` or `{ status, responseText }`) and
 * falls back to a 404 for anything unconfigured, so CAA/EAA artwork fetches
 * during fixture tests fail closed instead of hitting the real network.
 *
 * @param {Object<string, *>} [initialValues] - Seeded into the GM_getValue
 *   store before the userscript runs (e.g. to force a setting off for a
 *   fixture test regardless of that setting's own configSchema default).
 * @returns {string} JS source to pass to `page.addInitScript({ content })`.
 */
function buildGmStubsScript(initialValues = {}) {
    return `
        (function () {
            const STORAGE_KEY = '__sa_test_gm_values__';
            let stored = {};
            try {
                stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            } catch (e) { /* corrupt/inaccessible storage — start clean */ }

            const gmValues = window.__gmValues || (window.__gmValues = Object.assign({}, stored));
            Object.assign(gmValues, ${JSON.stringify(initialValues)});

            function persist() {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(gmValues));
                } catch (e) { /* quota/serialization error — in-memory cache still works for this tab */ }
            }
            persist();

            window.GM_info = {
                script: { name: 'ShowAllEntityData (test)', version: 'test' },
            };

            window.GM_addStyle = function (css) {
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
                return style;
            };

            window.GM_setValue = function (key, value) {
                gmValues[key] = value;
                persist();
            };

            window.GM_getValue = function (key, defaultValue) {
                // Re-check localStorage for a key this tab's own cache
                // doesn't have yet — e.g. one a same-origin popup wrote via
                // its own GM_setValue after this tab's gmValues was seeded.
                if (!Object.prototype.hasOwnProperty.call(gmValues, key)) {
                    try {
                        const fresh = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                        if (Object.prototype.hasOwnProperty.call(fresh, key)) gmValues[key] = fresh[key];
                    } catch (e) { /* ignore — falls through to defaultValue below */ }
                }
                return Object.prototype.hasOwnProperty.call(gmValues, key) ? gmValues[key] : defaultValue;
            };

            window.GM_deleteValue = function (key) {
                delete gmValues[key];
                persist();
            };

            window.__gmMenuCommands = window.__gmMenuCommands || {};
            let __gmMenuCommandId = 0;

            window.GM_registerMenuCommand = function (name, callback) {
                const id = ++__gmMenuCommandId;
                window.__gmMenuCommands[id] = { name, callback };
                return id;
            };

            window.GM_unregisterMenuCommand = function (id) {
                delete window.__gmMenuCommands[id];
            };

            window.GM_xmlhttpRequest = function (opts) {
                const responses = window.__gmXhrResponses || {};
                const configured = responses[opts.url];

                setTimeout(() => {
                    if (!configured) {
                        if (typeof opts.onload === 'function') {
                            opts.onload({ status: 404, response: null, responseText: '' });
                        }
                        return;
                    }
                    if (typeof opts.onload === 'function') {
                        opts.onload({
                            status: configured.status || 200,
                            response: configured.blob !== undefined ? configured.blob : configured.responseText,
                            responseText: configured.responseText || '',
                        });
                    }
                }, 0);

                return { abort() {} };
            };
        })();
    `;
}

/**
 * Pre-seeds `window.__gmValues` via an init script registered BEFORE any
 * navigation, so `buildGmStubsScript()`'s own init script (registered
 * later, e.g. inside `loadUserscriptPage()`) merges its `initialValues`
 * onto this instead of overwriting it — the same technique
 * `loadUserscriptPage`'s own `testMode` option uses for
 * `window.__SA_TEST_MODE__`. No-ops when `values` is empty/absent.
 *
 * Originally written once inline inside `capture-snapshots.js`; promoted
 * here once a second live spec needed the identical "seed a setting before
 * `loadUserscriptPage()` runs, for a page type `loadUserscriptPage()` has
 * no dedicated option for" pattern.
 *
 * Registered on `page.context()` — same reasoning as `loadPage.js`'s own
 * `page.context().addInitScript()` switch — so this seed still lands ahead
 * of `buildGmStubsScript()`'s init script (registration order is preserved
 * whether both are page-level, both context-level, or split, as long as a
 * caller always awaits this before `loadUserscriptPage()`, which every
 * existing caller does). Splitting the two across page- and context-level
 * would risk the opposite order silently replacing (not merging into)
 * `window.__gmValues` — `buildGmStubsScript()`'s closures would keep
 * writing to the object they captured, orphaned by this reassignment.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} [values]
 * @returns {Promise<void>}
 */
async function seedGmValues(page, values) {
    if (!values || Object.keys(values).length === 0) return;
    await page.context().addInitScript({ content: `window.__gmValues = ${JSON.stringify(values)};` });
}

module.exports = { buildGmStubsScript, seedGmValues };
