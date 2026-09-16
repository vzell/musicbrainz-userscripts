// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { authStorageState } = require('./tests/support/authState');

// Populated by `npm run auth:login` (tests/support/auth-setup.js) — a real,
// interactive login you do yourself, never automated/scripted. When present,
// chromium-live tests start already logged in as you instead of anonymous
// (see the "Log in" link vs. your username in the header). Absent by
// default (gitignored — a saved session is as good as your password), so
// live tests run logged-out until you opt in.
//
// authStorageState() also WARNS when the file exists but its session has
// expired — that state is silent otherwise (Playwright loads the cookies, MB
// rejects them, the run proceeds logged out) and is easily mistaken for a
// real behavioural change. See tests/support/authState.js.

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
            // Network-free does NOT mean fast. These specs intercept every
            // request, but the userscript's own Relationships rate gate sleeps
            // ~1100 ms between WS/2 calls, so a 12-entity table legitimately
            // takes ~13 s to settle, and the specs that pin mid-fetch behaviour
            // must then wait inside that window on purpose.
            //
            // Playwright's 30 s default was therefore too small for a handful
            // of them, and it failed as flakiness rather than as a clear
            // message: three DIFFERENT tests timed out across three
            // consecutive full-suite runs (285/2, 286/1, 286/1, each ~10-11
            // min), and every one of them passed 3 of 3 when re-run in
            // isolation. That is load sensitivity, not a regression — the
            // suite runs single-worker, so a slower machine simply pushes the
            // tail of each test past the budget.
            //
            // 90 s is the project default rather than a per-spec patch, since
            // the alternative was patching one spec per run indefinitely.
            // Outliers still state their own budget where the real floor is
            // higher (rel-column-collapse-toggle.spec.js's MID-FETCH test sets
            // 180 s), and a test whose own inner poll is the constraint needs
            // that poll widened instead — a project timeout cannot help there.
            // The cost accepted: a genuinely hung test takes 90 s to fail.
            timeout: 90000,
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
                ...authStorageState({ label: 'chromium-live' }),
            },
        },
    ],
});
