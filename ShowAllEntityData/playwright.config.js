// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Populated by `npm run auth:login` (tests/support/auth-setup.js) — a real,
// interactive login you do yourself, never automated/scripted. When present,
// chromium-live tests start already logged in as you instead of anonymous
// (see the "Log in" link vs. your username in the header). Absent by
// default (gitignored — a saved session is as good as your password), so
// live tests run logged-out until you opt in.
const AUTH_FILE = path.join(__dirname, 'playwright', '.auth', 'vzell.json');

/**
 * Playwright config for ShowAllEntityData.
 *
 * Two projects, split by test-file location:
 *  - chromium-fixtures: loads local tests/fixtures/*.html snapshots (served at a real
 *    musicbrainz.org-shaped URL via page.route()), no network dependency.
 *  - chromium-live: navigates to real musicbrainz.org pages, run explicitly via `npm run test:live`.
 *
 * `npm test` only runs chromium-fixtures, so routine runs never touch the network.
 */
module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: false,
    // 'list' for terminal output; 'html' writes playwright-report/ (open via
    // `npx playwright show-report` or `npm run report`) with a full trace/
    // screenshot/video viewer per test.
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        // On failure: capture a Playwright trace (DOM snapshots + network +
        // console at every step — open with `npx playwright show-trace
        // <path>` or via the HTML report) and a screenshot. Kept off on
        // passing runs to avoid bloating test-results/ on every green run.
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium-fixtures',
            testMatch: 'fixtures/**/*.spec.js',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'chromium-live',
            testMatch: 'live/**/*.spec.js',
            // Generous: release-group-fetch.spec.js clicks a button and waits
            // out a real (small) paginated fetch against musicbrainz.org.
            timeout: 120000,
            use: {
                ...devices['Desktop Chrome'],
                ...(fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}),
            },
        },
    ],
});
