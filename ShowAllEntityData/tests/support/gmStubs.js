'use strict';

/**
 * Builds a plain-JS source string that stubs every Tampermonkey `@grant`
 * the userscript declares (GM_xmlhttpRequest, GM_addStyle, GM_info,
 * GM_setValue/GM_getValue/GM_deleteValue, GM_registerMenuCommand/
 * GM_unregisterMenuCommand). Meant to be injected via `page.addInitScript()`
 * so it exists before any page or userscript code runs.
 *
 * GM_getValue/GM_setValue/GM_deleteValue are backed by an in-memory object
 * (not localStorage) so each test's page context starts with clean settings
 * unless a test seeds `window.__gmValues` itself before navigation.
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
            const gmValues = window.__gmValues || (window.__gmValues = {});
            Object.assign(gmValues, ${JSON.stringify(initialValues)});

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
            };

            window.GM_getValue = function (key, defaultValue) {
                return Object.prototype.hasOwnProperty.call(gmValues, key) ? gmValues[key] : defaultValue;
            };

            window.GM_deleteValue = function (key) {
                delete gmValues[key];
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

module.exports = { buildGmStubsScript };
