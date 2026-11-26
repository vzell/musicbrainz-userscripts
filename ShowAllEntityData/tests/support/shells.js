'use strict';

/**
 * The fixture projects' page shells (2026-11-26, test/fixture-shells): a
 * saved musicbrainz.org page for every URL a fixture spec loads without its
 * own `fixtureFile`, so no fixture spec depends on the live site.
 * `tests/fixtures/shells/index.json` maps a URL to a file, relative to the
 * repo's `ShowAllEntityData/` directory (a shell of its own under
 * `tests/fixtures/shells/`, or a committed snapshot that IS that page).
 * `scripts/capture-fixture-shells.js` captures the missing ones.
 *
 * @module shells
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'tests', 'fixtures', 'shells', 'index.json');

const cache = new Map();

/**
 * An index, read once per worker.
 * @param {string} [index] - Its path (the committed one by default; a spec may pass its own).
 * @returns {Object<string, string>} url → file (relative to ShowAllEntityData/).
 */
function shellIndex(index = INDEX) {
    if (cache.has(index)) return cache.get(index);
    let map;
    try {
        map = JSON.parse(fs.readFileSync(index, 'utf8')).shells || {};
    } catch {
        map = {};
    }
    cache.set(index, map);
    return map;
}

/**
 * The saved shell of `url`, or null: the exact URL first, then the URL
 * without its query and hash. A file listed but not on disk counts as none
 * (not captured yet), so the live-request guard names the page.
 *
 * @param {string} url
 * @param {string} [index] - The index's path (`shellIndex()`).
 * @returns {?string} An absolute path.
 */
function shellFor(url, index = INDEX) {
    const idx = shellIndex(index);
    const bare = String(url).replace(/[?#].*$/, '');
    const rel = idx[url] || idx[bare];
    if (!rel) return null;
    const abs = path.join(ROOT, rel);
    return fs.existsSync(abs) ? abs : null;
}

module.exports = { shellFor, shellIndex, INDEX, ROOT };
