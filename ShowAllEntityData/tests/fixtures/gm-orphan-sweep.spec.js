'use strict';

// _sweepOrphanedGmValues(): GM values nothing reads any more are deleted at
// start-up (after it, in a setTimeout), because Tampermonkey hands a script's
// whole GM store to every page it runs on (org/userscript-size.org 2.3).
//
// What is pinned, each of which would fail silently:
//   • a fixed orphan (the old plain-text help cache) is deleted;
//   • a "Show single-table" hand-off payload older than an hour is deleted,
//     one younger than an hour is KEPT (a tab may be about to read it);
//   • the age comes from the key's base-36 timestamp; a key that does not
//     decode falls back to the payload's own `timestamp`, and a payload of
//     unknown age is deleted;
//   • nothing else is touched;
//   • without GM_listValues the fixed keys are still found, and no payload
//     is deleted blindly.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

const HELP_TEXT_KEY = 'showallentitydata-remote-help-text';
const PREFIX = 'mb_sa_subtable_snapshot_';
const HOUR = 60 * 60 * 1000;

/**
 * The seeded store: one fixed orphan, four hand-off payloads of known and
 * unknown age, and one unrelated value that must survive.
 *
 * @returns {{seed: Object<string, *>, oldKey: string, youngKey: string,
 *            youngByPayload: string, unknownAge: string, unrelated: string}}
 */
function makeSeed() {
    const now = Date.now();
    const oldKey = PREFIX + (now - 2 * HOUR).toString(36) + 'abc123';
    const youngKey = PREFIX + (now - 5 * 60 * 1000).toString(36) + 'def456';
    const youngByPayload = PREFIX + 'zz';          // not a stamp: the payload decides
    const unknownAge = PREFIX + 'yy';              // not a stamp, no timestamp either
    const unrelated = 'vz-mb-colvis-artist-recordings';
    return {
        oldKey, youngKey, youngByPayload, unknownAge, unrelated,
        seed: {
            [HELP_TEXT_KEY]: { ts: 1, data: 'old plain-text help' },
            [oldKey]: { timestamp: now - 2 * HOUR, rows: [] },
            [youngKey]: { timestamp: now - 5 * 60 * 1000, rows: [] },
            [youngByPayload]: { timestamp: now - 10 * 60 * 1000, rows: [] },
            [unknownAge]: { rows: [] },
            [unrelated]: ['Title'],
        },
    };
}

/**
 * The stored keys, read through the stub's own GM_getValue (it also merges
 * what another tab persisted).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} keys
 * @returns {Promise<Object<string, boolean>>} key → still present
 */
async function presence(page, keys) {
    return page.evaluate((ks) => Object.fromEntries(
        ks.map((k) => [k, window.GM_getValue(k, undefined) !== undefined])), keys);
}

test.describe('_sweepOrphanedGmValues()', () => {
    test('deletes the orphans and the stale hand-offs, and nothing else', async ({ page }) => {
        const s = makeSeed();
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride: s.seed });

        await expect.poll(() => presence(page, [HELP_TEXT_KEY]), { timeout: 5000 })
            .toEqual({ [HELP_TEXT_KEY]: false });
        expect(await presence(page, [s.oldKey, s.unknownAge]), 'the stale and the age-unknown hand-offs are gone')
            .toEqual({ [s.oldKey]: false, [s.unknownAge]: false });
        expect(await presence(page, [s.youngKey, s.youngByPayload]),
            'a hand-off younger than an hour stays, whether its age comes from the key or the payload')
            .toEqual({ [s.youngKey]: true, [s.youngByPayload]: true });
        expect(await presence(page, [s.unrelated]), 'an unrelated value is untouched')
            .toEqual({ [s.unrelated]: true });
    });

    test('without GM_listValues the fixed orphans still go, and no hand-off is deleted blindly', async ({ page }) => {
        // The stubs ASSIGN window.GM_listValues; a setter that drops the
        // assignment makes the grant look absent to the script.
        await page.context().addInitScript({ content: `
            Object.defineProperty(window, 'GM_listValues', {
                configurable: true, get() { return undefined; }, set() { /* dropped */ },
            });
        ` });
        const s = makeSeed();
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE_FILE, testMode: true, settingsOverride: s.seed });

        await expect.poll(() => presence(page, [HELP_TEXT_KEY]), { timeout: 5000 })
            .toEqual({ [HELP_TEXT_KEY]: false });
        expect(await presence(page, [s.oldKey, s.unknownAge, s.youngKey]),
            'with no way to list keys, the hand-offs cannot be found, so all of them stay')
            .toEqual({ [s.oldKey]: true, [s.unknownAge]: true, [s.youngKey]: true });
    });
});
