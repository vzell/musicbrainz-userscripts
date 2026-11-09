'use strict';

// The in-tab request schedulers must not follow a wall-clock jump.
//
// ── The bug (DEBUG-NOTES.md 2026-11-09, "petri's clock spikes") ─────────────
//
// SAED paces its requests with three in-tab schedulers that reserve slots
// synchronously: `_relAwaitRateSlot()` (MusicBrainz's Web Service, one a
// 1.1 s), `_dpAwaitSlot()` (the foreign sites' detail pages) and
// `_extAwaitSlot()` (per external host; Discogs' API also shared across
// tabs in GM storage). They booked on `Date.now()`. On petri the wall clock
// spiked 16.8 s ahead for ~100 ms every ~5 s (WSL2: Hyper-V's time sync and
// systemd-timesyncd fighting; measured with Date.now() against the monotonic
// clock). A slot reserved inside a spike lay 16.8 s too far ahead, and every
// request queued behind it waited that much longer: an artist window's
// album page came at +25.3 s instead of +8.5 s, and 16-23 link-preview
// specs failed per run under the parallel suite. A real clock step (an NTP
// correction, a VM resync, waking from sleep) does the same to a user.
//
// The fix books on `_steadyNow()` (performance.timeOrigin +
// performance.now(): epoch ms, so GM-shared values keep their unit, but
// monotonic within the page). Guarantee pinned per scheduler: a +16.8 s
// step of Date.now() AROUND one reservation adds nothing to the wait of the
// next request beyond the scheduler's own spacing. Control per scheduler:
// reservations still space requests (the wait grows with each one), so the
// fix did not turn pacing off.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');
const STEP_MS = 16800;

/**
 * Loads a MusicBrainz fixture page; no button is pressed, so no scheduler
 * has a reservation of the page's own.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openPage(page) {
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.waitForFunction(() => !!(window.__saTest && window.__saTest.reserveMbRateSlots));
}

/**
 * In the page: the wait a next request would have before, and after, one
 * reservation made while Date.now() reads STEP_MS ahead (then restored),
 * and after one more plain reservation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'mb'|'dp'|'ext'} kind - Which scheduler.
 * @param {string} [host] - For 'ext'.
 * @returns {Promise<{before: number, stepped: number, next: number}>}
 */
function stepAround(page, kind, host = '') {
    return page.evaluate(({ kind, host, step }) => {
        const t = window.__saTest;
        const reserve = () => (kind === 'mb' ? t.reserveMbRateSlots(1) : kind === 'dp' ? t.reserveDpRateSlots(1) : t.reserveExtRateSlots(host, 1));
        const wait = () => (kind === 'mb' ? t.mbRateSlotWaitMs() : kind === 'dp' ? t.dpRateSlotWaitMs() : t.extRateSlotWaitMs(host));
        const before = wait();
        const realNow = Date.now;
        Date.now = () => realNow.call(Date) + step;
        try { reserve(); } finally { Date.now = realNow; }
        const stepped = wait();
        reserve();
        return { before, stepped, next: wait() };
    }, { kind, host, step: STEP_MS });
}

test.describe('in-tab request schedulers ignore a wall-clock jump', () => {
    for (const [kind, host, label] of [
        ['mb', '', "MusicBrainz's Web Service slot (_relAwaitRateSlot)"],
        ['dp', '', "the detail pages' slot (_dpAwaitSlot)"],
        ['ext', 'www.setlist.fm', 'an external host (_extAwaitSlot)'],
        ['ext', 'api.discogs.com', "Discogs' API, shared across tabs (_extAwaitSlot + GM)"],
    ]) {
        test(`${label}: a +16.8 s clock step adds no wait`, async ({ page }) => {
            await openPage(page);
            const r = await stepAround(page, kind, host);
            // Guarantee: the stepped reservation is one spacing ahead, not
            // the step plus a spacing (Date.now-based: about 17-19 s).
            expect(r.stepped - r.before, JSON.stringify(r)).toBeLessThan(STEP_MS / 4);
            // Control: pacing still works, the next reservation lies further out.
            expect(r.next, JSON.stringify(r)).toBeGreaterThan(r.stepped);
        });
    }
});
