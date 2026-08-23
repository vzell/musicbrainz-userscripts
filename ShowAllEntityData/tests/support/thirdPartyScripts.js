'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'fixtures', 'thirdPartyScripts');

/**
 * Injects a "simulated third-party userscript" snippet from
 * `tests/fixtures/thirdPartyScripts/<name>.js` — a hand-built DOM-mutation
 * script reproducing one specific, known side effect a real third-party
 * userscript can have (NOT a vendored copy of any real third-party
 * script's own source; see each fixture's own JSDoc for what it simulates
 * and why).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - Fixture filename without `.js`, e.g.
 *   `'jesus2099-title-mismatch'`.
 * @param {{ when?: 'init'|'now', config?: Object }} [opts]
 *   - `when: 'now'` (default) — runs the snippet immediately via
 *     `page.evaluate()` against the CURRENT page state. Use this to
 *     simulate a third-party script running *after* ours has already
 *     rendered — how both of this repo's known real-world cases (the
 *     jesus2099 title-mismatch marker, the rogue filter-write bug) were
 *     actually observed to happen in practice.
 *   - `when: 'init'` — registers the snippet via `page.addInitScript()`,
 *     which runs before every future navigation on `page` (mimicking a
 *     userscript manager's `@run-at document-start`, ordered relative to
 *     whichever of OUR OWN init scripts/`page.addScriptTag()` calls the
 *     caller sequences around it). Use this to simulate "the third-party
 *     script registered/ran before ours."
 *   - `config`, when given, is written to `window.__thirdPartySim` (via
 *     `page.evaluate()`) BEFORE the snippet runs, letting a test
 *     parameterize a fixture (target column name, row indices, poison
 *     value, …) without editing the fixture file itself. For `when:
 *     'init'`, `config` is applied via its own preceding `addInitScript`
 *     call, so it's in place before the snippet's init script runs on the
 *     next navigation too.
 * @returns {Promise<void>}
 */
async function injectThirdPartyScript(page, name, { when = 'now', config } = {}) {
    const source = fs.readFileSync(path.join(SCRIPTS_DIR, `${name}.js`), 'utf8');

    if (when === 'init') {
        if (config !== undefined) {
            await page.addInitScript({ content: `window.__thirdPartySim = ${JSON.stringify(config)};` });
        }
        await page.addInitScript({ content: source });
        return;
    }

    if (config !== undefined) {
        await page.evaluate((cfg) => { window.__thirdPartySim = cfg; }, config);
    }
    await page.evaluate(source);
}

module.exports = { injectThirdPartyScript };
