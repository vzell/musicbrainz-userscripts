'use strict';

/**
 * Interactive, one-time (or occasional re-run once the session expires)
 * login helper — NOT a test, run it directly via `npm run auth:login`.
 *
 * Opens a real, visible Chromium window at musicbrainz.org/login so YOU log
 * in yourself (and solve any CAPTCHA MusicBrainz shows) — this script never
 * sees or handles your credentials. Once you confirm you're logged in, it
 * saves the browser's cookies/storage to playwright/.auth/vzell.json via
 * Playwright's `storageState` mechanism. playwright.config.js's
 * `chromium-live` project automatically picks that file up if present (see
 * the `use.storageState` line there), so every subsequent `npm run
 * test:live` run starts already logged in as you — no per-test login flow,
 * no credentials anywhere in the test code.
 *
 * playwright/.auth/ is gitignored — a saved session file is as good as your
 * password for MusicBrainz purposes and must never be committed.
 *
 * Tip: tick "Remember me" during login for a longer-lived session cookie —
 * otherwise you'll need to re-run this once it expires (tests still run
 * fine logged-out in the meantime; they just won't reflect logged-in state).
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const AUTH_DIR = path.join(__dirname, '..', '..', 'playwright', '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'vzell.json');

function waitForEnter(promptText) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(promptText, () => {
            rl.close();
            resolve();
        });
    });
}

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://musicbrainz.org/login');

    await waitForEnter(
        '\nLog in (and solve any CAPTCHA) in the opened browser window.\n' +
        'Once you see you are logged in, press Enter here to save the session... '
    );

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: AUTH_FILE });
    console.log(`Saved logged-in session to ${AUTH_FILE}`);

    await browser.close();
})();
