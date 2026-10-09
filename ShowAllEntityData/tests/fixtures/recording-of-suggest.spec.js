'use strict';

const { test, expect } = require('../support/test');
const { DATA, setupRecordingOf, columnCells } = require('../support/recordingOf');

// "Recording of" work suggestions for recordings that have no performance
// relation yet (_recOfSuggestTitle()). Each test names the property it pins:
//   - an exact match after normalising (case, spacing, typographic
//     punctuation, a trailing "(…)" clause) is suggested; a fuzzy match is
//     the CLOSEST work within the threshold, not the first; no match leaves
//     the "no work" state; a row WITH a relation is never given a suggestion;
//   - the threshold setting at 0 allows exact matches only;
//   - the batch-add userscript's cached work list is reused with zero work
//     requests, and the progress card names it as the source;
//   - suggestions off: no work list request at all.

const row = (title, nth = 0) => DATA.recordings.map((r, i) => [r.title, i]).filter(([t]) => t === title)[nth][1];

/** Loads every row and waits for the job to settle. */
async function loadAll(page) {
    await page.locator('.mb-recof-col-hdr-btn').click();
    await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    // Suggestions run after the last answer, in idle slices.
    await expect.poll(async () => (await columnCells(page, 'Recording of'))[row('The Promised Land')].state,
        { timeout: 10000 }).not.toBe('none');
}

test.describe('"Recording of" work suggestions', () => {
    test('exact, parenthesised, fuzzy (closest wins) and no-match rows', async ({ page }) => {
        const { calls } = await setupRecordingOf(page);
        await loadAll(page);
        expect(calls.map((c) => c.kind)).toEqual(['browse', 'works']);
        const cells = await columnCells(page, 'Recording of');
        expect(cells[row('Badlands', 0)]).toMatchObject({ state: 'suggested', text: 'suggested: Badlands' });
        expect(cells[row('Badlands', 1)]).toMatchObject({ state: 'suggested', text: 'suggested: Badlands' });
        expect(cells[row('Prove It All Night (alternate take)')].text).toBe('suggested: Prove It All Night');
        // "Racing in the Streets": distance 1 to "Racing in the Street", 3 to
        // "Racing in the Street ’78" — the closer one, though it is not first.
        expect(cells[row('Racing in the Streets')].text).toBe('suggested: Racing in the Street');
        expect(cells[row('The Promised Land')].text).toBe('suggested: The Promised Land');
        expect(cells[row('Untitled Jam')].state).toBe('none');
        // A row with a relation keeps it.
        expect(cells[row('Born to Run', 0)]).toMatchObject({ state: 'has', text: 'Born to Run' });
        // The suggestion links the work.
        expect(cells[row('Badlands', 0)].html).toContain(`href="/work/${DATA.works.find((w) => w.title === 'Badlands').id}"`);
    });

    test('a 0 % threshold suggests exact matches only', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_max_distance_pct: 0 } });
        await loadAll(page);
        const cells = await columnCells(page, 'Recording of');
        expect(cells[row('Badlands', 0)].state).toBe('suggested');
        expect(cells[row('Racing in the Streets')].state).toBe('none');
    });

    test('the batch-add userscript\'s cached work list is reused: no work request', async ({ page }) => {
        const { calls } = await setupRecordingOf(page, {
            bprWorks: true, settings: { sa_async_pop_auto_open: true },
        });
        await loadAll(page);
        expect(calls.map((c) => c.kind)).toEqual(['browse']);
        expect((await columnCells(page, 'Recording of'))[row('Badlands', 0)].state).toBe('suggested');
        await expect(page.locator('#mb-async-pop .mb-tt-ajcache')).toContainText('batch-add userscript');
    });

    test('with suggestions off the work list is never requested', async ({ page }) => {
        const { calls } = await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        await page.locator('.mb-recof-col-hdr-btn').click();
        await expect(page.locator('.mb-recof-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
        expect(calls.map((c) => c.kind)).toEqual(['browse']);
        expect((await columnCells(page, 'Recording of'))[row('Badlands', 0)].state).toBe('none');
    });
});
