'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const {
    loadUserscriptPage, USERSCRIPT_PATH, IRO_PATH, PAKO_PATH, CDN_RE,
} = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The harness serves the userscript's two third-party @requires (iro, pako)
// from node_modules instead of their CDNs (DEBUG-NOTES.md, 2026-10-04: a
// jsdelivr outage failed 72 tests of the merge gate, all in addScriptTag).
//
// What this pins:
//   - a fixture page loads and renders with both CDN hosts unreachable;
//   - the node_modules copies are the versions the userscript @requires, so
//     a later @require bump fails here until the devDependency follows.

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');

/** The userscript header's `// @require` URLs. */
function requireLines() {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').split('// ==/UserScript==')[0];
    return Array.from(header.matchAll(/^\/\/ @require\s+(\S+)/gm), (m) => m[1]);
}

/** A package's installed version, from its own package.json. */
const installed = (name) => JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;

test.describe('harness: the userscript\'s @require libraries come from node_modules', () => {
    test('the pinned copies are the versions the userscript @requires', () => {
        const urls = requireLines();
        const devDeps = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).devDependencies;

        const iro = urls.map((u) => u.match(/@jaames\/iro@(\d+)(?:\.\d+\.\d+)?$/)).find(Boolean);
        const pako = urls.map((u) => u.match(/\/pako\/(\d+\.\d+\.\d+)\/pako\.min\.js$/)).find(Boolean);
        expect(iro, 'premise: the header @requires iro').toBeTruthy();
        expect(pako, 'premise: the header @requires pako').toBeTruthy();

        // pako is pinned to an exact version in the header: match it exactly.
        expect(devDeps.pako).toBe(pako[1]);
        expect(installed('pako')).toBe(pako[1]);
        // iro is @require'd by major version only (jsdelivr serves the newest
        // 5.x, 5.5.2 on 2026-10-04): the pin must be inside that major.
        expect(devDeps['@jaames/iro'].split('.')[0]).toBe(iro[1]);
        expect(installed('@jaames/iro').split('.')[0]).toBe(iro[1]);
        // Exact pins, so package-lock and package.json say the same thing.
        expect(devDeps.pako).toMatch(/^\d+\.\d+\.\d+$/);
        expect(devDeps['@jaames/iro']).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('the files are the libraries themselves (version banners)', () => {
        expect(fs.readFileSync(IRO_PATH, 'utf8').slice(0, 200)).toContain(`iro.js v${installed('@jaames/iro')}`);
        expect(fs.readFileSync(PAKO_PATH, 'utf8').slice(0, 200)).toContain(`pako ${installed('pako')}`);
    });

    test('a fixture page loads and renders with both CDN hosts unreachable', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const cdnRequests = [];
        await page.context().route(CDN_RE, (route) => {
            cdnRequests.push(route.request().url());
            return route.abort('internetdisconnected');
        });

        await loadUserscriptPage(page, { url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true });
        // Both libraries are really there, not merely not-erroring.
        expect(await page.evaluate(() => typeof window.iro === 'object' && typeof window.pako === 'object')).toBe(true);

        await page.click('button[data-label="Show all Releases for ReleaseGroup"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(page.locator('#mb-filter-container')).toBeVisible();
        expect(errors).toEqual([]);
        expect(cdnRequests, 'requests that tried a CDN').toEqual([]);
    });
});
