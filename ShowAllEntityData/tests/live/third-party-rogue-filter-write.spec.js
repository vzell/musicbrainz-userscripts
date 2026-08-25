'use strict';

const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { seedGmValues } = require('../support/gmStubs');
const { injectThirdPartyScript } = require('../support/thirdPartyScripts');
const { collectPageErrors } = require('../support/liveAssertions');
const { getPageRowCount } = require('../support/filterSortAssertions');

// Same release-tracks pilot page as third-party-title-mismatch.spec.js.
// debug/fail.debug's real capture showed the "ISRCs" column getting
// poisoned this way, but that column is entirely absent on THIS specific
// release (1975 catalog release, predates ISRC assignment — confirmed live:
// no "ISRCs" header at all) — "Length" is used instead, since the guard
// being tested (_isGenuineFilterInputEvent()) is column-agnostic; any real
// column reproduces the same mechanism.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const SHOW_ALL_BUTTON = 'button[data-label="Show all Tracks for Release"]';
const TARGET_COLUMN = 'Length';
const POISON_VALUE = 'vzell'; // matches the real debug/fail.debug case: a cached MusicBrainz username

test('rejects a rogue script writing directly into a column filter input without a trusted event', { tag: '@extended' }, async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await seedGmValues(page, { sa_enable_release_tracks: true });
    await loadUserscriptPage(page, { url: RELEASE_URL, testMode: true });

    const showAllBtn = page.locator(SHOW_ALL_BUTTON);
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 90000 });

    const before = await getPageRowCount(page);
    expect(before.filtered).toBe(before.total);
    expect(before.total).toBeGreaterThan(0);

    // Real debug/fail.debug scenario: another script sets .value directly
    // (bypasses the anti-autofill readonly attribute entirely — that only
    // blocks *user keyboard* editing, never a programmatic .value=
    // assignment) and dispatches an untrusted 'input' event to "make it
    // stick". No visibility/expand-sub-tables step needed first — a rogue
    // script doesn't care whether the element is currently displayed, and
    // neither does plain DOM .value/.dispatchEvent().
    await injectThirdPartyScript(page, 'rogue-filter-writer', {
        config: { columnName: TARGET_COLUMN, value: POISON_VALUE },
    });

    // Sanity: confirm the rogue write was genuinely ATTEMPTED — via the
    // fixture's own self-report (window.__thirdPartySimResult), not by
    // checking whether the poisoned value still sits in the input.
    // Confirmed empirically: it doesn't. dispatchEvent() for a plain
    // (non-custom) event runs listeners SYNCHRONOUSLY before returning, and
    // ShowAllEntityData's rejection path for an untrusted event doesn't
    // just ignore it — it actively resets the input's value as part of
    // rejecting it. That's a stronger defense than debug/fail.debug's own
    // wording implied (that incident predates the fix), but it also means
    // there's no async gap in which to observe the value "briefly"
    // poisoned from outside this fixture's own synchronous execution —
    // "input ends up empty" would be indistinguishable from "the fixture
    // never found the column at all" without this self-report.
    const simResult = await page.evaluate(() => window.__thirdPartySimResult);
    expect(simResult).toEqual({ found: true, colIdx: expect.any(Number) });

    // The actual assertion, in two parts:
    // 1. The guard didn't just fail to filter — it reset the poisoned
    //    input back to empty, confirmed directly.
    const inputValueAfter = await page.evaluate((colIdx) => {
        const el = document.querySelector(`.mb-col-filter-input[data-col-idx="${colIdx}"]`);
        return el ? el.value : null;
    }, simResult.colIdx);
    expect(inputValueAfter).toBe('');

    // 2. No genuine filter pass ever ran off the untrusted event, so the
    //    table still shows every row. Wait comfortably longer than the
    //    ~500ms debounce ceiling observed elsewhere in this suite
    //    (filterSortAssertions.js) so a delayed false-positive filter
    //    application would have had time to show up.
    await page.waitForTimeout(1000);
    const after = await getPageRowCount(page);
    expect(after).toEqual(before);

    expect(pageErrors).toEqual([]);
});
