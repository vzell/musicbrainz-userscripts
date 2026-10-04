/**
 * ESLint flat config for ShowAllEntityData — the userscript, the shared
 * VZ_MBLibrary it `@require`s, and the Playwright/Node harness.
 *
 * Report-only for now: `npm run lint` is NOT part of `npm test`/`test:full`.
 * The ratchet is `python3 scripts/lint-summary.py --check`, which compares
 * per-file, per-rule counts with `tests/lint-baseline.json`; the rules
 * themselves are proven to fire by `python3 scripts/selftest-lint.py`.
 * See tests/README.org, section "Lint".
 *
 * Replaces the legacy `.eslintrc.json` (b7697b1), which ESLint 9+ no longer
 * reads and whose hand-written GM globals list had already drifted from the
 * header (it lacked GM_listValues).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const js = require('@eslint/js');
const globals = require('globals');
const jsdoc = require('eslint-plugin-jsdoc');
const playwright = require('eslint-plugin-playwright');

/**
 * Every config object is anchored at the REPO ROOT, because the library lives
 * outside this project (`../lib/`). ESLint 10 looks a config up from each
 * linted file's own directory and treats anything outside the base path as
 * ignored, so `lib/` is only reachable by running from the root with an
 * explicit `--config` — which is what the npm `lint*` scripts do. Anchoring
 * the patterns at the root keeps them correct from either working directory.
 */
const REPO_ROOT = path.resolve(__dirname, '..');
const PROJECT = path.basename(__dirname);
const USERSCRIPT = `${PROJECT}/ShowAllEntityData.user.js`;
const LIBRARY = 'lib/VZ_MBLibrary.user.js';

/**
 * Read the `// @grant` lines from a userscript's `==UserScript==` header and
 * return them as a readonly-globals map. Deriving the list from the header
 * means `no-undef` reports a GM API the script calls but never grants — which
 * in Tampermonkey's sandbox is `undefined` at runtime — and the list can never
 * drift from the header the way the old hand-written one did.
 *
 * @param {string} relPath - Userscript path relative to the repo root.
 * @returns {Object<string, string>} Map of granted API name to 'readonly'.
 */
function grantedGlobals(relPath) {
    const src = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    const header = src.slice(0, src.indexOf('// ==/UserScript=='));
    const out = {};
    for (const m of header.matchAll(/^\/\/\s*@grant\s+(\S+)/gm)) {
        if (m[1] !== 'none') out[m[1]] = 'readonly';
    }
    return out;
}

/** Globals the userscript gets from its `@require` lines rather than `@grant`. */
const REQUIRED_LIB_GLOBALS = {
    VZ_MBLibrary: 'readonly',
    iro: 'readonly',
    pako: 'readonly',
};

/**
 * Globals the userscript FEATURE-DETECTS (`typeof GM !== 'undefined'`) rather
 * than grants: the Picard fetch prefers the async `GM.xmlHttpRequest` when a
 * manager provides it. `no-undef` ignores the `typeof` test but not the
 * guarded call after it.
 */
const USERSCRIPT_FEATURE_DETECTED = {
    GM: 'readonly',
};

/**
 * Globals the library uses but does not own: a `@require`d library runs in its
 * CONSUMER's sandbox, with the consumer's grants and the consumer's other
 * `@require`s. `GM_xmlhttpRequest` is feature-detected (`typeof` test) and
 * `iro` comes from the consumer's own `@require` of iro.js (the colour-picker
 * widget). Declared here rather than by editing the library.
 */
const LIBRARY_CONSUMER_GLOBALS = {
    GM_xmlhttpRequest: 'readonly',
    iro: 'readonly',
};

/**
 * Comments document zero-width/no-break spaces literally, and regexes and
 * templates match them on purpose; code is where one is a bug.
 */
const IRREGULAR_WHITESPACE = ['error', { skipComments: true, skipRegExps: true, skipTemplates: true }];

/** Rules shared by the two userscript files (browser, classic script). */
const USERSCRIPT_RULES = {
    // Carried over from .eslintrc.json — the b7697b1 dead-code audit's setting.
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_unused', caughtErrors: 'none' }],
    'no-unreachable': 'warn',
    // `cond ? a() : b()` and `x && x.focus()` are house idiom; what is left
    // to catch is a bare `a == b;` meant as an assignment.
    'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
    // TDZ: a `const`/`let` read in the SAME scope before its declaration line
    // has run. `variables: false` skips references from inside nested
    // functions — those run later, usually after the declaration, and flagging
    // them (328 hits) buried the real cases. A function CALLED too early (the
    // `_seedNewTableRows()`-at-the-foot-of-the-IIFE trap) is beyond any
    // static rule; that one stays a documented convention.
    'no-use-before-define': ['warn', { functions: false, classes: false, variables: false }],
    'no-irregular-whitespace': IRREGULAR_WHITESPACE,
    // `try { … } catch (_) {}` is the deliberate "best effort, ignore" idiom
    // (JSON.parse of a dataset attribute, new URL() of a maybe-relative href).
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Mandatory conventions (root CLAUDE.md): 4 spaces, no tabs, no trailing
    // whitespace, every function has a JSDoc block.
    'no-tabs': 'warn',
    'no-trailing-spaces': 'warn',
    'jsdoc/require-jsdoc': ['warn', {
        require: { FunctionDeclaration: true, FunctionExpression: false, ArrowFunctionExpression: false },
    }],
};

/**
 * Stamp the repo root as `basePath` on every config object.
 *
 * @param {Array<Object>} configs - Flat config objects.
 * @returns {Array<Object>} The same objects, each with `basePath: REPO_ROOT`.
 */
function withRepoRoot(configs) {
    return configs.map(c => ({ basePath: REPO_ROOT, ...c }));
}

module.exports = withRepoRoot([
    {
        ignores: [
            `${PROJECT}/node_modules/**`,
            `${PROJECT}/playwright-report/**`,
            `${PROJECT}/test-results/**`,
            `${PROJECT}/playwright/**`,
            `${PROJECT}/debug/**`,
            `${PROJECT}/tests/snapshots/**`,
            `${PROJECT}/tests/fixtures/live-userscripts/**`,
            `${PROJECT}/tests/fixtures/local-large/**`,
        ],
    },
    {
        files: [USERSCRIPT],
        plugins: { jsdoc },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...grantedGlobals(USERSCRIPT),
                ...REQUIRED_LIB_GLOBALS,
                ...USERSCRIPT_FEATURE_DETECTED,
            },
        },
        rules: { ...js.configs.recommended.rules, ...USERSCRIPT_RULES },
    },
    {
        files: [LIBRARY],
        plugins: { jsdoc },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...grantedGlobals(LIBRARY),
                ...LIBRARY_CONSUMER_GLOBALS,
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            ...USERSCRIPT_RULES,
            // The library's one top-level const IS its export: consumers read
            // it as a global after `@require`.
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^(_unused|VZ_MBLibrary$)', caughtErrors: 'none' }],
        },
    },
    {
        files: [`${PROJECT}/tests/**/*.js`, `${PROJECT}/scripts/**/*.js`, `${PROJECT}/playwright.config.js`, `${PROJECT}/eslint.config.js`],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            // Browser globals too: page.evaluate()/addInitScript() callbacks
            // are written here but run in the page.
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-irregular-whitespace': IRREGULAR_WHITESPACE,
        },
    },
    {
        files: [`${PROJECT}/tests/**/*.spec.js`],
        ...playwright.configs['flat/recommended'],
        rules: {
            ...playwright.configs['flat/recommended'].rules,
            // Correctness, not taste: a missed await leaves the assertion to
            // surface only if a later await happens to catch it; a stray
            // test.only silently shrinks the suite.
            'playwright/missing-playwright-await': 'error',
            'playwright/no-focused-test': 'error',
            // Shared helpers that assert on the test's behalf, so a test whose
            // only check is one of these calls is not "a test with no
            // assertion". Add a helper here only once it really calls expect().
            'playwright/expect-expect': ['warn', {
                assertFunctionNames: ['expectNoGrowth', 'assertGlyphThenTrailingIcon', 'settleRows'],
            }],
            // test.skip(condition, reason) is how the harness opts out when the
            // case cannot arise (a fixture that never wraps, an env-gated
            // section). An unconditional .skip() is still reported.
            'playwright/no-skipped-test': ['warn', { allowConditional: true }],
            // "Settle, don't sleep" (docs/claude/testing-playwright.md).
            'playwright/no-wait-for-timeout': 'warn',
            // Advice, not defects: demoted to warnings.
            'playwright/prefer-web-first-assertions': 'warn',
            'playwright/no-networkidle': 'warn',
            // House style differs on purpose, and at hundreds of hits each they
            // would drown the rules above. The harness reads the DOM through
            // page.evaluate()/$eval and plain element handles by design, and
            // live specs branch on what the real page served.
            'playwright/prefer-locator': 'off',
            'playwright/prefer-to-have-length': 'off',
            'playwright/prefer-to-have-count': 'off',
            'playwright/consistent-spacing-between-blocks': 'off',
            'playwright/no-conditional-in-test': 'off',
            'playwright/no-eval': 'off',
        },
    },
]);
