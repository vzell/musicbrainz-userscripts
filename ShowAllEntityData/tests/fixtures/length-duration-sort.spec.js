'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// Regression coverage for the explicit duration comparator:
// _parseDurationToMs() / _sortColumnKind() / _compareDurations(), wired into
// BOTH createSortComparator() (single-column) and createMultiColumnComparator()
// (Ctrl+Click chains).
//
// Before this, a "Length" column was compared with
// `parseFloat(text.replace(/[^0-9.-]/g, '')) || 0` — which happens to order
// real durations correctly (seconds are always zero-padded, so "5:05.146"
// becomes 505.146 and stays monotonic), but collapsed MusicBrainz's own "?:??"
// unknown-duration placeholder to 0. An unknown length is absent data, not a
// zero-length recording, so it floated to the TOP of every ascending sort.
// It must now sit last in BOTH directions.
//
// The two comparators also disagreed about which columns were numeric at all:
// the single-column path consulted the page definition's own integerColumns
// descriptors, the multi-column path only the raw header text. Both now go
// through _sortColumnKind().
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'length-duration-sort.html');

/** Reads one column's visible cell text for every rendered row, in row order. */
async function columnValues(page, colName) {
    return page.evaluate((name) => {
        const strip = (t) => t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
        const ths = Array.from(document.querySelectorAll('table.tbl thead th'));
        const idx = ths.findIndex((t) => (t.dataset.colName || strip(t.textContent)) === name);
        if (idx < 0) return null;
        return Array.from(document.querySelectorAll('table.tbl tbody tr'))
            .filter((tr) => tr.style.display !== 'none')
            .map((tr) => tr.cells[idx].textContent.replace(/\s+/g, ''));
    }, colName);
}

/** Clicks a column header's ▲ or ▼ sort icon, optionally Ctrl+Click for multi-sort. */
async function clickSort(page, colName, glyph, { ctrl = false } = {}) {
    const th = page.locator('table.tbl thead th').filter({ has: page.locator(`[data-col-name="${colName}"]`) });
    const target = (await th.count())
        ? th.first()
        : page.locator(`table.tbl thead th[data-col-name="${colName}"]`).first();
    const btn = target.locator('.sort-icon-btn', { hasText: glyph }).first();
    await waitForSortSettled(page, () => btn.click(ctrl ? { modifiers: ['Control'] } : {}));
}

test.describe('duration-aware Length sorting', () => {
    test.beforeEach(async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        await page.route(`${ARTIST_RECORDINGS_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
        await page.click('button[data-label="⊚ All recordings"]');
        await page.waitForSelector('#mb-filter-container');
    });

    test('_parseDurationToMs parses M:SS, M:SS.mmm and H:MM:SS, and rejects "?:??"', async ({ page }) => {
        const parsed = await page.evaluate(() => ({
            plain:      window.__saTest.parseDurationToMs('5:05'),
            millis:     window.__saTest.parseDurationToMs('5:05.146'),
            shortFrac:  window.__saTest.parseDurationToMs('5:05.5'),
            twoFrac:    window.__saTest.parseDurationToMs('5:05.02'),
            hours:      window.__saTest.parseDurationToMs('1:02:03.500'),
            zero:       window.__saTest.parseDurationToMs('0:00'),
            unknown:    window.__saTest.parseDurationToMs('?:??'),
            empty:      window.__saTest.parseDurationToMs(''),
            garbage:    window.__saTest.parseDurationToMs('not a duration'),
        }));

        expect(parsed.plain).toBe(305000);
        expect(parsed.millis).toBe(305146);
        // A short fractional part is right-padded: ".5" is 500 ms, not 5 ms.
        expect(parsed.shortFrac).toBe(305500);
        expect(parsed.twoFrac).toBe(305020);
        expect(parsed.hours).toBe(3723500);
        // 0:00 is a KNOWN zero duration and must not collapse into "unknown".
        expect(parsed.zero).toBe(0);
        expect(parsed.unknown).toBeNull();
        expect(parsed.empty).toBeNull();
        expect(parsed.garbage).toBeNull();
    });

    test('_sortColumnKind classifies Length as a duration, other columns as before', async ({ page }) => {
        const kinds = await page.evaluate(() => ({
            length: window.__saTest.sortColumnKind('Length'),
            name:   window.__saTest.sortColumnKind('Name'),
            artist: window.__saTest.sortColumnKind('Artist'),
            hash:   window.__saTest.sortColumnKind('#'),
            empty:  window.__saTest.sortColumnKind(''),
        }));
        expect(kinds.length).toBe('duration');
        expect(kinds.name).toBe('text');
        expect(kinds.artist).toBe('text');
        expect(kinds.hash).toBe('numeric');
        expect(kinds.empty).toBe('text');
    });

    test('_compareDurations pins an unknown duration last in BOTH directions', async ({ page }) => {
        const cmp = await page.evaluate(() => ({
            unknownFirstAsc:  window.__saTest.compareDurations('?:??', '0:45', true),
            unknownFirstDesc: window.__saTest.compareDurations('?:??', '0:45', false),
            unknownSecondAsc: window.__saTest.compareDurations('0:45', '?:??', true),
            unknownSecondDesc: window.__saTest.compareDurations('0:45', '?:??', false),
            bothUnknown:      window.__saTest.compareDurations('?:??', '?:??', true),
            msAsc:            window.__saTest.compareDurations('5:05.020', '5:05.146', true),
            msDesc:           window.__saTest.compareDurations('5:05.020', '5:05.146', false),
            equal:            window.__saTest.compareDurations('5:05.146', '5:05.146', true),
        }));

        // Positive => "a sorts after b". The unknown is always the one that
        // moves to the bottom, whichever direction and whichever side it is on.
        expect(cmp.unknownFirstAsc).toBeGreaterThan(0);
        expect(cmp.unknownFirstDesc).toBeGreaterThan(0);
        expect(cmp.unknownSecondAsc).toBeLessThan(0);
        expect(cmp.unknownSecondDesc).toBeLessThan(0);
        // Two unknowns are indistinguishable, so a tie-breaking chain continues.
        expect(cmp.bothUnknown).toBe(0);
        // True millisecond resolution within the same second.
        expect(cmp.msAsc).toBeLessThan(0);
        expect(cmp.msDesc).toBeGreaterThan(0);
        expect(cmp.equal).toBe(0);
    });

    test('single-column sort: ascending puts "?:??" last, not first', async ({ page }) => {
        await clickSort(page, 'Length', '▲');
        // The discriminating assertion: the old parseFloat path mapped "?:??"
        // to 0 and so led with both unknown rows here.
        expect(await columnValues(page, 'Length')).toEqual([
            '0:45', '5:05.020', '5:05.146', '10:00', '?:??', '?:??',
        ]);
    });

    test('single-column sort: descending keeps "?:??" last too', async ({ page }) => {
        await clickSort(page, 'Length', '▼');
        expect(await columnValues(page, 'Length')).toEqual([
            '10:00', '5:05.146', '5:05.020', '0:45', '?:??', '?:??',
        ]);
    });

    test('multi-column sort: Length as a tie-breaker still pins "?:??" last per group', async ({ page }) => {
        // Artist▲ groups the rows (Alpha, Beta); Length▲ orders within each.
        await clickSort(page, 'Artist', '▲', { ctrl: true });
        await clickSort(page, 'Length', '▲', { ctrl: true });

        expect(await columnValues(page, 'Artist')).toEqual(
            ['Alpha', 'Alpha', 'Alpha', 'Beta', 'Beta', 'Beta']);
        expect(await columnValues(page, 'Length')).toEqual([
            '0:45', '5:05.146', '?:??',
            '5:05.020', '10:00', '?:??',
        ]);
    });

    test('multi-column sort: a descending Length tie-breaker does not float "?:??" to the top', async ({ page }) => {
        await clickSort(page, 'Artist', '▲', { ctrl: true });
        await clickSort(page, 'Length', '▼', { ctrl: true });

        expect(await columnValues(page, 'Artist')).toEqual(
            ['Alpha', 'Alpha', 'Alpha', 'Beta', 'Beta', 'Beta']);
        expect(await columnValues(page, 'Length')).toEqual([
            '5:05.146', '0:45', '?:??',
            '10:00', '5:05.020', '?:??',
        ]);
    });
});
