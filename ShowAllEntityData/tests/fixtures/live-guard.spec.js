'use strict';

// The fixture projects' live-request guard (tests/support/test.js,
// `liveGuard()`/`liveVerdict()`; 2026-11-26, test/fixture-shells) and the
// shells lookup (tests/support/shells.js). On 2026-11-26 musicbrainz.org
// refused this machine and 50 fixture specs failed on `page.goto`, because
// they loaded the live page as their shell. Guarantees pinned:
//   G1 a top-level page load that no spec route answered is aborted and
//      recorded; the teardown verdict names the URL and the way out;
//   G2 a frame's load and any other request are recorded and passed on;
//   G3 SA_LIVE_GUARD=report: recorded, never aborted, no verdict;
//   G4 SA_BLOCK_MB=1: every other request is refused too;
//   G5 the guard's host pattern takes musicbrainz.org and its subdomains,
//      never static.metabrainz.org (answered from disk) or other hosts;
//   G6 a real page: a routed load passes the guard untouched; an unrouted one
//      is refused (ERR_BLOCKED_BY_CLIENT), with no network involved;
//   G7 shellFor(): an index entry on disk is found (exact URL, or without its
//      query); a missing file or URL is null.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, liveGuard, liveVerdict, LIVE_MB_RE } = require('../support/test');

/** A stand-in for Playwright's Route: records what the guard did. */
function fakeRoute({ url = 'https://musicbrainz.org/artist/x', nav = false, child = false, type = 'document' } = {}) {
    const did = [];
    const route = {
        request: () => ({
            url: () => url, method: () => 'GET', resourceType: () => type,
            isNavigationRequest: () => nav,
            frame: () => ({ parentFrame: () => (child ? {} : null) }),
        }),
        abort: async (why) => { did.push(['abort', why]); },
        fallback: async () => { did.push(['fallback']); },
    };
    return { route, did };
}

/** Runs `fn` with environment variables set, restoring them afterwards. */
async function withEnv(vars, fn) {
    const old = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
    Object.entries(vars).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    try { return await fn(); } finally {
        Object.entries(old).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    }
}

test.describe('the fixture projects never load a live musicbrainz.org page', () => {
    test('G1-G4: the guard aborts and records a page load, passes the rest on; report and block modes', async () => {
        await withEnv({ SA_LIVE_GUARD: undefined, SA_BLOCK_MB: undefined }, async () => {
            const live = [];
            const p = fakeRoute({ nav: true });
            await liveGuard(p.route, live);
            expect(p.did, 'G1: a top-level page load is aborted').toEqual([['abort', 'blockedbyclient']]);
            const f = fakeRoute({ nav: true, child: true, url: 'https://musicbrainz.org/edit/1' });
            await liveGuard(f.route, live);
            const r = fakeRoute({ type: 'xhr', url: 'https://musicbrainz.org/ws/2/release/x' });
            await liveGuard(r.route, live);
            expect(f.did, 'G2: a frame is passed on').toEqual([['fallback']]);
            expect(r.did, 'G2: a request is passed on').toEqual([['fallback']]);
            expect(live.map(x => x.kind)).toEqual(['page', 'frame', 'request']);
            const v = liveVerdict(live);
            expect(v).toContain('live musicbrainz.org page load in a fixture spec: https://musicbrainz.org/artist/x');
            expect(v).toContain('tests/fixtures/shells/index.json');
            expect(liveVerdict(live.filter(x => x.kind !== 'page')), 'no page, no verdict').toBeNull();
        });
        await withEnv({ SA_LIVE_GUARD: 'report', SA_BLOCK_MB: undefined }, async () => {
            const live = [];
            const p = fakeRoute({ nav: true });
            await liveGuard(p.route, live);
            expect(p.did, 'G3: report mode passes a page load on').toEqual([['fallback']]);
            expect(liveVerdict(live), 'G3: and gives no verdict').toBeNull();
        });
        await withEnv({ SA_LIVE_GUARD: undefined, SA_BLOCK_MB: '1' }, async () => {
            const r = fakeRoute({ type: 'xhr' });
            await liveGuard(r.route, []);
            expect(r.did, 'G4: with SA_BLOCK_MB every request is refused').toEqual([['abort', 'connectionrefused']]);
        });
    });

    test('G5: the host pattern', () => {
        for (const u of ['https://musicbrainz.org/', 'https://beta.musicbrainz.org/artist/x', 'https://musicbrainz.org/ws/2/release/x']) {
            expect(LIVE_MB_RE.test(u), u).toBe(true);
        }
        for (const u of ['https://static.metabrainz.org/MB/x.js', 'https://coverartarchive.org/release/x', 'https://notmusicbrainz.org/', 'http://musicbrainz.org.example.com/']) {
            expect(LIVE_MB_RE.test(u), u).toBe(false);
        }
    });

    test('G6: in a real page, a routed load passes and an unrouted one is refused', async ({ page }) => {
        await page.route('https://musicbrainz.org/routed-shell', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body id="page">ok</body></html>' }));
        await page.goto('https://musicbrainz.org/routed-shell');
        await expect(page.locator('#page')).toHaveText('ok');
        // The unrouted load: refused before any network (the teardown would
        // then fail this test, so it goes to a second page whose context is
        // closed by hand, records and all).
        const ctx = await page.context().browser().newContext();
        const p2 = await ctx.newPage();
        const live = [];
        await ctx.route(LIVE_MB_RE, (route) => liveGuard(route, live));
        const err = await p2.goto('https://musicbrainz.org/artist/unrouted').then(() => null, e => e);
        expect(String(err && err.message)).toContain('ERR_BLOCKED_BY_CLIENT');
        expect(live).toEqual([expect.objectContaining({ kind: 'page', url: 'https://musicbrainz.org/artist/unrouted' })]);
        await ctx.close();
    });

    test('G7: shellFor() finds an index entry on disk, with or without its query; nothing else', () => {
        const { shellFor, ROOT } = require('../support/shells');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saed-shells-'));
        const indexFile = path.join(dir, 'index.json');
        const shellFile = path.join(dir, 'a.html');
        fs.writeFileSync(shellFile, '<html></html>');
        fs.writeFileSync(indexFile, JSON.stringify({ shells: {
            'https://musicbrainz.org/artist/a/releases': path.relative(ROOT, shellFile),
            'https://musicbrainz.org/artist/b/releases': 'tests/fixtures/shells/not-captured-yet.html',
        } }));
        try {
            expect(shellFor('https://musicbrainz.org/artist/a/releases', indexFile)).toBe(shellFile);
            expect(shellFor('https://musicbrainz.org/artist/a/releases?page=2', indexFile)).toBe(shellFile);
            expect(shellFor('https://musicbrainz.org/artist/b/releases', indexFile), 'listed, not on disk').toBeNull();
            expect(shellFor('https://musicbrainz.org/artist/c/releases', indexFile), 'not listed').toBeNull();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
