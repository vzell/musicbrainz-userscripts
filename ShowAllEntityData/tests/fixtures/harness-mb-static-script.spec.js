'use strict';

// Harness guarantee: a fixture page's musicbrainz.org-hosted script is
// answered locally, never by the live server.
//
// Every saved MusicBrainz page carries
// `<script src="/static/scripts/supported-browser-check.js">`, which resolves
// to musicbrainz.org (the rest of MusicBrainz's JS comes from the
// static.metabrainz.org CDN). Under a parallel suite run the live server
// intermittently answered it with `200 text/html`, and Chromium's
// `Unexpected token '<'` then failed every spec that asserts "no page errors"
// — search-annotation-tooltip.spec.js failed 10 of 48 repeated runs on main
// (2026-10-06, DEBUG-NOTES.md). loadPage.js now routes it (MB_BROWSER_CHECK_RE).
//
// What each test pins, and the neighbouring property it keeps apart:
//
//  1. THE STUB ANSWERED, NOT THE NETWORK. Asserted on the stub's own marker
//     header, because "no page error" alone passes on every lucky run against
//     the live server — exactly how the flake hid.
//  2. THE STUB DOES WHAT THE REAL SCRIPT DOES in a supported browser: the
//     hidden #unsupported-browser warning is removed. An empty stub would also
//     pass test 1 and leave a DOM the real page never has.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const SEARCH_URL =
    'https://musicbrainz.org/search?query=Barcode+and+other+i&type=annotation&limit=25&method=indexed';
const FIXTURE = path.join(__dirname, 'search-annotation-tooltip.html');
const SCRIPT_RE = /\/static\/scripts\/supported-browser-check\.js/;

test.describe('fixture harness: musicbrainz.org static script', () => {
    test('supported-browser-check.js is served by the harness stub, not musicbrainz.org', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const seen = [];
        page.on('response', (r) => {
            if (SCRIPT_RE.test(r.url())) {
                seen.push({ stub: r.headers()['x-sa-fixture-stub'] || null, type: r.headers()['content-type'] || '' });
            }
        });
        await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: FIXTURE, testMode: true });

        expect(seen.length, 'the fixture page requests the script').toBe(1);
        expect(seen[0].stub).toBe('supported-browser-check');
        expect(seen[0].type).toMatch(/javascript/);
        expect(errors).toEqual([]);
    });

    test('the stub removes the hidden unsupported-browser warning, as the real script does', async ({ page }) => {
        await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: FIXTURE, testMode: true });
        expect(await page.locator('#unsupported-browser').count()).toBe(0);
    });
});
