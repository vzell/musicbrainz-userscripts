'use strict';

// loadUserscriptPage() serves a fixture's main document from disk, but every
// subresource still goes to the network, and page.goto() waits for all of them
// before `load`. A saved release page's sidebar cover thumbnail comes straight
// from the Internet Archive (`//archive.org/download/mbid-…_thumb250.jpg`); in a
// full-suite run that request never finished, and two disk round-trip specs
// timed out inside page.goto() (DEBUG-NOTES.md, 2026-10-01).
//
// loadUserscriptPage() now aborts image requests to archive.org and its
// subdomains whenever a fixture is served (ARCHIVE_ORG_RE). This spec makes
// the Internet Archive hang on purpose — a route registered BEFORE the load
// that never answers — and pins that:
//   - the fixture still loads well inside the budget (the hanging route is
//     never reached, because the helper's own route, registered later, wins);
//   - the thumbnail request was blocked, not answered;
//   - coverartarchive.org is NOT swallowed by the pattern: a spec's own mock
//     for it is still the one that answers.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage, ARCHIVE_ORG_RE } = require('../support/loadPage');

const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE = path.join(__dirname, 'release-tracks-ms-length.html');

test('a fixture load never waits on an archive.org image', async ({ page }) => {
    test.setTimeout(30000);
    let hangingRouteHit = 0;
    // Never fulfilled: stands in for an Internet Archive that does not answer.
    await page.route(/^https?:\/\/(?:[^/]+\.)?archive\.org\//, () => { hangingRouteHit++; });

    const blocked = [];
    page.on('requestfailed', (req) => {
        if (/archive\.org\//.test(req.url()) && !/coverartarchive\.org/.test(req.url())) {
            blocked.push(req.failure() && req.failure().errorText);
        }
    });

    const t0 = Date.now();
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true });
    const loadMs = Date.now() - t0;

    expect(loadMs, 'the fixture loaded without waiting on archive.org').toBeLessThan(20000);
    expect(hangingRouteHit, 'the helper\'s abort route answered first').toBe(0);
    expect(blocked.length, 'the sidebar thumbnail was requested and blocked').toBeGreaterThan(0);
    expect(blocked.every((t) => /BLOCKED_BY_CLIENT/.test(t || ''))).toBe(true);
});

test('a coverartarchive.org mock registered BEFORE the load still answers its images', async ({ page }) => {
    // The order the CAA specs use: mock first, then loadUserscriptPage(). The
    // helper's route is newer, so it would win for any URL its pattern
    // matched — an image from coverartarchive.org must not be one of them.
    let mockHits = 0;
    await page.route('https://coverartarchive.org/**', (route) => {
        mockHits++;
        route.fulfill({ status: 404, body: '' });
    });
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true });
    await page.evaluate(() => new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = resolve;
        img.src = 'https://coverartarchive.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897/front-250';
    }));
    expect(mockHits, 'the spec\'s own coverartarchive.org mock answered').toBeGreaterThan(0);
});

test('ARCHIVE_ORG_RE: the Internet Archive only, never the art archives', () => {
    expect(ARCHIVE_ORG_RE.test('https://archive.org/download/x')).toBe(true);
    expect(ARCHIVE_ORG_RE.test('https://ia800.us.archive.org/x')).toBe(true);
    expect(ARCHIVE_ORG_RE.test('https://coverartarchive.org/release/x')).toBe(false);
    expect(ARCHIVE_ORG_RE.test('https://eventartarchive.org/event/x')).toBe(false);
});
