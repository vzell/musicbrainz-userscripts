'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'fixtures', 'live-userscripts');
const MANIFEST_PATH = path.join(SCRIPTS_DIR, 'manifest.json');

/**
 * Loads `tests/fixtures/live-userscripts/manifest.json` — real third-party
 * userscripts your own live browser runs, dropped into that directory by
 * hand (gitignored, see its own README.md), plus the named combinations you
 * want to test alongside ShowAllEntityData. Returns an empty shape rather
 * than throwing if the manifest (or the directory) doesn't exist yet, so a
 * fresh checkout with no local scripts set up still runs cleanly.
 *
 * @returns {{ scripts: Array<{id:string,file:string,when:'init'|'now'}>, combinations: Object<string,string[]> }}
 */
function loadManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return { scripts: [], combinations: {} };
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return { scripts: parsed.scripts || [], combinations: parsed.combinations || {} };
}

/**
 * Resolves a `--combo <name>` or explicit `--scripts id1,id2` selector
 * against a loaded manifest, preserving the order given — a combination's
 * array order (or the ids as passed for an ad hoc list) is also the
 * injection order, so it doubles as your approximation of real load order
 * when that matters (see `injectOne()`'s own caveat on that).
 *
 * @param {{ scripts: Array<{id:string,file:string,when:string}>, combinations: Object<string,string[]> }} manifest
 * @param {{ combo?: string, ids?: string[] }} selector
 * @returns {Array<{id:string,file:string,when:string}>}
 */
function resolveScripts(manifest, { combo, ids } = {}) {
    const wantedIds = combo ? manifest.combinations[combo] : ids;
    if (!wantedIds) {
        throw new Error(combo
            ? `Unknown combination "${combo}" — known: ${Object.keys(manifest.combinations).join(', ') || '(none defined in manifest.json)'}`
            : 'resolveScripts() needs either { combo } or { ids }');
    }
    const byId = new Map(manifest.scripts.map((s) => [s.id, s]));
    return wantedIds.map((id) => {
        const entry = byId.get(id);
        if (!entry) {
            throw new Error(`Unknown script id "${id}" — known: ${manifest.scripts.map((s) => s.id).join(', ') || '(none defined in manifest.json)'}`);
        }
        return entry;
    });
}

/**
 * Strips a userscript's `// ==UserScript== … // ==/UserScript==` metadata
 * block — Tampermonkey's own `@grant`s are already covered by
 * `gmStubs.js`'s classic `GM_*` stubs, so nothing in the block itself needs
 * to run — and pulls out any `@require` URLs so the caller can load those
 * first, mirroring how a real userscript manager resolves `@require` before
 * running the script body.
 *
 * @param {string} source
 * @returns {{ body: string, requires: string[] }}
 */
function parseUserscript(source) {
    const match = source.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?/);
    const header = match ? match[0] : '';
    const body = match ? source.slice(match[0].length) : source;
    const requires = [...header.matchAll(/^\/\/ @require\s+(\S+)/gm)].map((m) => m[1]);
    return { body, requires };
}

/**
 * Injects one real third-party userscript (read verbatim from
 * `tests/fixtures/live-userscripts/<file>`) into `page`.
 *
 * `when: 'init'` mimics `@run-at document-end`/`document-idle` (Tampermonkey's
 * default, and what the large majority of real scripts declare): registered
 * via `page.addInitScript()` so it's in place before ShowAllEntityData if
 * this is called before `loadUserscriptPage()`, but its actual EXECUTION is
 * deferred inside the injected content itself until `document.readyState`
 * leaves `'loading'` (a `DOMContentLoaded` listener when needed) — NOT true
 * `document-start` timing, which fires before any DOM exists at all.
 * Confirmed load-bearing empirically: `page.addInitScript()`'s raw timing
 * broke `mb_SUPER-MIND-CONTROL-II-X-TURBO.user.js` (`@run-at document-end`)
 * with a `null.appendChild` crash inside one of its own `@require`d
 * libraries — that library's code assumes DOM elements it expects already
 * exist, a safe assumption under its real declared `document-end` timing
 * but not under raw `document-start`. A script that specifically declares
 * `@run-at document-start` itself (rare — reserved for scripts that must
 * run before any page JS, e.g. ad-blockers) would still want genuine
 * pre-DOM timing this readiness-gate no longer provides; none of the
 * scripts registered here do, so this hasn't needed its own third `when`
 * value yet — flag it if one ever does.
 * `when: 'now'` runs immediately against the CURRENT page state, for a
 * script simulating one that finishes only after ShowAllEntityData has
 * already rendered.
 *
 * This is a best-effort APPROXIMATION of real Tampermonkey scheduling, not a
 * guarantee — Tampermonkey's own internal ordering between multiple
 * `document-start` scripts isn't observable from outside it. Treat a clean
 * run here as supporting evidence, not proof; cross-check anything
 * suspicious against your real browser.
 *
 * `unsafeWindow` is stubbed to plain `window` — real Tampermonkey sandboxes
 * a userscript's own globals away from the page's; nothing in this harness
 * does, so a script reading/writing `unsafeWindow` behaves identically to
 * touching `window` directly, a reasonable approximation for interop
 * purposes (the page never sees a genuine sandbox boundary either way).
 *
 * `@require` URLs are loaded before the script body, in declared order —
 * pre-fetched with Node's global `fetch` and concatenated ahead of it, for
 * BOTH `when: 'init'` and `when: 'now'`. An earlier version used a real
 * in-page `page.addScriptTag({ url })` for `'now'`, on the theory that its
 * network/CORS behavior would match a real page load more closely; that
 * broke in practice against a real page (`page.addScriptTag` failed to load
 * a jesus2099 `@require` from a commit-pinned `github.com/…/raw/…` URL,
 * confirmed independently reachable via a plain `curl`, so the failure was
 * specific to loading it as a same-document `<script src>` — most likely
 * MusicBrainz's own script-loading restrictions, though the exact
 * mechanism wasn't pinned down). Fetching server-side sidesteps whatever
 * page-level restriction caused that and is strictly more robust either
 * way, at the cost of not exercising the target page's own CORS behavior
 * for that request — acceptable, since the interesting thing being tested
 * is the target script's OWN DOM effects, not its `@require` transport.
 *
 * Any GM_* API the target script calls beyond what `gmStubs.js` already
 * stubs (classic `GM_*`, not the newer `GM.*` dot-syntax) throws inside the
 * page — surfaced via the caller's own `collectPageErrors()`, not silently
 * swallowed here. Extend `gmStubs.js` if a specific script you're testing
 * genuinely needs more.
 *
 * The body is wrapped in `(async () => { … })();` before injection — a real
 * userscript manager runs each script in its own async-capable scope, and
 * at least one real script in practice (sanojjonas' "visualise stuff") uses
 * top-level `await` at the very start of its body, which a bare
 * `page.evaluate(body)`/`addInitScript({content: body})` would reject with
 * a `SyntaxError` (top-level `await` is only valid inside an async
 * function, not in a plain evaluated script). Wrapping costs nothing for a
 * script that doesn't need it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{id:string,file:string,when:'init'|'now'}} entry
 * @param {{ scriptsDir?: string }} [opts]
 * @returns {Promise<void>}
 */
async function injectOne(page, entry, { scriptsDir = SCRIPTS_DIR } = {}) {
    const source = fs.readFileSync(path.join(scriptsDir, entry.file), 'utf8');
    const { body, requires } = parseUserscript(source);
    const requireBodies = await Promise.all(requires.map((url) => fetch(url).then((r) => r.text())));
    const content = `window.unsafeWindow = window;\n${requireBodies.join('\n')}\n(async () => {\n${body}\n})();`;

    if (entry.when === 'init') {
        const deferredContent = `
            (function () {
                function __mbRun() {\n${content}\n}
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', __mbRun, { once: true });
                } else {
                    __mbRun();
                }
            })();
        `;
        await page.addInitScript({ content: deferredContent });
        return;
    }

    await page.evaluate(content);
}

/**
 * Injects every entry in `entries`, in order — see `injectOne()` for the
 * per-script mechanics and its approximation caveats. A caller mixing
 * `'init'` and `'now'` entries must call this twice (once for each `when`,
 * around its own navigation/render steps) rather than passing a mixed list
 * in one call — `'init'` entries have to be registered before
 * `page.goto()`, `'now'` entries only make sense after the page they're
 * meant to react to already exists.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<{id:string,file:string,when:'init'|'now'}>} entries
 * @param {{ scriptsDir?: string }} [opts]
 * @returns {Promise<void>}
 */
async function injectLiveUserscripts(page, entries, opts = {}) {
    for (const entry of entries) {
        await injectOne(page, entry, opts);
    }
}

module.exports = {
    loadManifest, resolveScripts, parseUserscript, injectLiveUserscripts, SCRIPTS_DIR, MANIFEST_PATH,
};
