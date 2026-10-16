'use strict';

/**
 * Check for scripts/probe-offline-capabilities.user.js (org/offline.org,
 * "Answer", plan step "probe").
 *
 *   node scripts/check-probe-offline-capabilities.js
 *
 * Loads the probe without Tampermonkey into Playwright's Chromium on a routed
 * page (https://probe.test/, no real network), so it exports its pure
 * functions, and asserts:
 *   1. pageKind() names MusicBrainz, the four sites, localhost and file://;
 *   2. probeFetch() + classifyOutcome() turn a real answer, a dropped
 *      connection and a hanging request into 'answered', 'no-answer' and
 *      'timeout' — over real fetch() calls, not hand-made objects;
 *   3. classifyNetwork() decides from the requests, NOT from
 *      navigator.onLine: all requests unanswered while onLine is true is
 *      'offline' (the case navigator.onLine gets wrong), an answer while
 *      onLine is false is 'online', a mix is 'split';
 *   4. with the context switched offline (context.setOffline) and the route
 *      removed, the browser reports navigator.onLine false and the probe's
 *      request goes unanswered, so the verdict is 'offline';
 *   5. berlinStamp() carries the right offset on both sides of the
 *      2026-10-25 clock change, including the hour that happens twice.
 * Exit code 0 when all hold, 1 otherwise.
 *
 * Mutation check (by hand, as for check-probe-logged-in-diff.js): copy the
 * probe, break classifyNetwork() so it trusts navigator.onLine, and run
 *   PROBE_FILE=<copy> node scripts/check-probe-offline-capabilities.js
 * — it must exit 1.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
// PROBE_FILE points the check at a mutated copy (mutation check), never at
// anything but a copy of the probe.
const PROBE = process.env.PROBE_FILE || path.join(ROOT, 'scripts', 'probe-offline-capabilities.user.js');
const ORIGIN = 'https://probe.test';

/**
 * Runs the checks and prints one line per check.
 * @returns {Promise<number>} The exit code.
 */
async function main() {
    const browser = await chromium.launch();
    let failures = 0;
    const check = (ok, label) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
        if (!ok) failures++;
    };
    try {
        const context = await browser.newContext();
        const handler = route => {
            const p = new URL(route.request().url()).pathname;
            if (p === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
            if (p === '/ok') return route.fulfill({ status: 204, body: '' });
            if (p === '/missing') return route.fulfill({ status: 404, body: '' });
            if (p === '/gone') return route.abort('internetdisconnected');
            if (p === '/hang') return undefined;   // never answered: the probe's timeout must fire
            return route.abort('failed');
        };
        await context.route(`${ORIGIN}/**`, handler);
        const page = await context.newPage();
        await page.goto(`${ORIGIN}/`);
        await page.addScriptTag({ content: fs.readFileSync(PROBE, 'utf8') });

        // 1. pageKind
        const kinds = await page.evaluate(() => {
            const C = globalThis.__saedOfflineProbe;
            return [
                'https://musicbrainz.org/artist/x', 'https://beta.musicbrainz.org/', 'https://www.springsteenlyrics.com/lyrics.php',
                'https://www.jungleland.it/html/list.htm', 'https://www.brucespringsteen.it/DB/records.aspx',
                'https://brucebase.wikidot.com/2026', 'http://127.0.0.1:8765/archive/', 'http://localhost/',
                'file:///V:/sa-archive/index.html', 'https://example.org/', 'not a url',
            ].map(u => C.pageKind(u));
        });
        const want = ['mb', 'mb', 'sl', 'jl', 'bs', 'bb', 'localhost', 'localhost', 'file', 'other', 'other'];
        check(JSON.stringify(kinds) === JSON.stringify(want), `pageKind names every kind (${kinds.join(', ')})`);

        // 2. real requests → outcomes
        const outcomes = await page.evaluate(async () => {
            const C = globalThis.__saedOfflineProbe;
            const one = async p => C.classifyOutcome(await C.probeFetch(p, 400));
            return { ok: await one('/ok'), missing: await one('/missing'), gone: await one('/gone'), hang: await one('/hang') };
        });
        check(outcomes.ok === 'answered', `a 204 is 'answered' (${outcomes.ok})`);
        check(outcomes.missing === 'answered', `a 404 is still 'answered': a server replied (${outcomes.missing})`);
        check(outcomes.gone === 'no-answer', `a dropped connection is 'no-answer' (${outcomes.gone})`);
        check(outcomes.hang === 'timeout', `a hanging request is 'timeout' (${outcomes.hang})`);

        // 3. the verdict comes from the requests
        const v = await page.evaluate(() => {
            const C = globalThis.__saedOfflineProbe;
            const a = { target: 'same-origin', outcome: 'answered' };
            const n = { target: 'caa', outcome: 'no-answer' };
            const t = { target: 'same-origin', outcome: 'timeout' };
            return {
                liar: C.classifyNetwork(true, [t, n]),
                answeredWhileFalse: C.classifyNetwork(false, [a]),
                split: C.classifyNetwork(true, [a, n]),
                nothing: C.classifyNetwork(true, [{ target: 'same-origin', outcome: 'skipped' }]),
                nothingOff: C.classifyNetwork(false, []),
            };
        });
        check(v.liar.state === 'offline' && /onLine was true/.test(v.liar.note),
            `no answers while navigator.onLine is true → 'offline', and says so (${JSON.stringify(v.liar)})`);
        check(v.answeredWhileFalse.state === 'online', `an answer while navigator.onLine is false → 'online' (${v.answeredWhileFalse.state})`);
        check(v.split.state === 'split' && /caa/.test(v.split.note), `one answered, one not → 'split' naming the silent one (${v.split.note})`);
        check(v.nothing.state === 'unknown', `only skipped checks while online → 'unknown' (${v.nothing.state})`);
        check(v.nothingOff.state === 'offline', `no checks while navigator.onLine is false → 'offline' (${v.nothingOff.state})`);

        // 4. the browser really offline. The route is removed first: a
        // routed request is still fulfilled after context.setOffline(true)
        // (interception runs before the offline emulation; seen 2026-10-16),
        // so with the route in place this step would test nothing. A future
        // fixture spec for offline handling has to abort its routes instead.
        await context.unroute(`${ORIGIN}/**`, handler);
        await context.setOffline(true);
        const off = await page.evaluate(async () => {
            const C = globalThis.__saedOfflineProbe;
            const onLine = navigator.onLine;
            const r = await C.probeFetch('/ok?offline', 2000);
            const outcome = C.classifyOutcome(r);
            return { onLine, outcome, verdict: C.classifyNetwork(onLine, [{ target: 'same-origin', outcome }]) };
        });
        await context.setOffline(false);
        check(off.onLine === false, `context offline → navigator.onLine false (${off.onLine})`);
        check(off.outcome !== 'answered', `context offline → the request goes unanswered (${off.outcome})`);
        check(off.verdict.state === 'offline', `context offline → verdict 'offline' (${off.verdict.state})`);

        // 5. Berlin time across the clock change
        const stamps = await page.evaluate(() => {
            const C = globalThis.__saedOfflineProbe;
            return ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-01-15T12:00:00Z', '2026-07-01T22:15:09Z']
                .map(s => C.berlinStamp(new Date(s)));
        });
        const wantStamps = ['2026-10-25T02:30:00+02:00', '2026-10-25T02:30:00+01:00', '2026-01-15T13:00:00+01:00', '2026-07-02T00:15:09+02:00'];
        stamps.forEach((s, i) => check(s === wantStamps[i], `berlinStamp ${wantStamps[i]} (${s})`));
    } finally {
        await browser.close();
    }
    console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
    return failures ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(1); });
