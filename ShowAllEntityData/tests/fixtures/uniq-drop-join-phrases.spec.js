'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const {
    getColumnHighlightTexts, columnIndex, columnFilterInput, columnFilterClear,
} = require('../support/filterSortAssertions');

// The reported page: pageType `work-recordings`. Its tbody is led by a
// <tr class="subh"> group row, so it RENDERS GROUPED — which is why every
// wait below polls the visible row set rather than `waitForFilterSettled()`:
// on a grouped render `#mb-filter-status-display` only ever reports the
// GLOBAL filter, so it reads "✓ Global filter" from the first column-filter
// change onward and never changes again. Polling the rows also asserts the
// thing each step is actually about.
//
// See org/uvd-filtering-join-phrases-missing-bug.org and the fixture's own
// header comment for what each row reproduces.
const WORK_URL = 'https://musicbrainz.org/work/bcd490e5-dac7-3b8a-b423-ae17e1209f3d';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-join-phrases.html');
const SECTION = 'Join phrases';

// Every row, in fixture order — the "nothing is filtered" expectation.
const ALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
// Row I ("John Lennon with Yoko Ono") is the only credit without "bruce".
const BRUCE = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'];

/** Renders the fixture through the script's real fetch/render pipeline. */
async function render(page) {
    await loadUserscriptPage(page, { url: WORK_URL, fixtureFile: FIXTURE_FILE, testMode: true });
    await page.route(`${WORK_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Recordings for Work"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** The "Come Together X" letter of every currently visible row, in order. */
const visibleRowLetters = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('table.tbl tbody tr'))
        .filter((r) => r.style.display !== 'none' && !r.classList.contains('subh'))
        .map((r) => (r.textContent.match(/Come Together ([A-Z])/) || [])[1])
        .filter(Boolean));

/**
 * Runs `trigger` and waits for the visible row set to become exactly
 * `expected`. Polling for a KNOWN value rather than for "the text stopped
 * changing" is deliberate: a trigger that silently did nothing leaves the
 * previous set stable, and a stability-based wait would accept it.
 */
async function settleRows(page, trigger, expected) {
    await trigger();
    await expect.poll(() => visibleRowLetters(page), { timeout: 20000 }).toEqual(expected);
}

/** Reads one dropdown section as a plain {label: count} map. */
async function sectionCounts(page, colName, sectionLabel) {
    const sections = await page.evaluate((c) => window.__saTest.getUniqDropSections(c), colName);
    const sec = (sections || []).find((s) => s.label === sectionLabel);
    return sec ? Object.fromEntries(sec.items.map((i) => [i.label, i.count])) : null;
}

/** Opens the Artist panel without reading it. */
const openArtistDrop = (page) => page.evaluate(() => window.__saTest.getUniqDropSections('Artist'));

/** Clicks one synthetic dropdown entry by its section label + entry label. */
const clickSynItem = (page, sectionLabel, itemLabel) => page.evaluate(([sec, lbl]) => {
    const sectionEl = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
        .find((s) => s.querySelector('.mb-uniq-section-label')?.textContent === sec);
    const item = Array.from(sectionEl.querySelectorAll('.mb-col-uniq-item'))
        .find((el) => el.dataset.mbUniqSynLabel === lbl);
    item.click();
}, [sectionLabel, itemLabel]);

const artistColIdx = (page) => columnIndex(page, 'Artist');

/** Reads the Artist input's live value + both dataset halves. */
const artistInputState = (page, colIdx) => page.evaluate((idx) => {
    const inp = document.querySelector(`table.tbl thead .mb-col-filter-input[data-col-idx="${idx}"]`);
    return {
        value: inp.value,
        uniq: inp.dataset.mbUniqValues ?? null,
        typed: inp.dataset.mbUniqTypedText ?? null,
        tinted: !!inp.style.backgroundColor,
    };
}, colIdx);

/** Types into the Artist column filter and waits for `expected` to be shown. */
async function typeArtistFilter(page, colIdx, text, expected) {
    const input = columnFilterInput(page, colIdx);
    // Column filter inputs are readonly-until-a-genuine-trusted-interaction
    // (anti-autofill hardening) — .click() lifts that, and typing must go
    // through .pressSequentially() (real per-key events), never .fill().
    await input.click();
    await settleRows(page, () => input.pressSequentially(text), expected);
}

test.describe('unique-values dropdown: "Join phrases"', () => {
    // ── Bug 1: the wrapper that hid a phrase ────────────────────────────────
    test('offers every phrase in the table, including one whose anchor MusicBrainz wrapped in <span class="mp">', async ({ page }) => {
        await render(page);

        // The whole map, not just "feat. is present": a boundary fix that
        // over-counts (one entry per occurrence instead of per row, or a
        // <bdi> scanned twice) still has to fail here.
        expect(await sectionCounts(page, 'Artist', SECTION)).toEqual({
            '» join phrase: &': 1,        // row G
            '» join phrase: and': 1,      // row B
            '» join phrase: feat.': 3,    // rows E, F, H — none existed before the fix
            '» join phrase: vs.': 1,      // row J
            '» join phrase: with': 3,     // rows C, D, I
        });
    });

    test('resolves the entity boundary through every wrapper nesting, not just a direct-child <a>', async ({ page }) => {
        await render(page);

        const phrasesOf = (sel) => page.evaluate((s) => window.__saTest.findCellJoinPhrases(s), sel);

        // Control: the plain shape, both anchors direct children of the <bdi>.
        expect(await phrasesOf('#jp-cell-b')).toEqual([{ phrase: 'and', hasNode: true }]);
        // Row A has one entity — there is no "between" at all.
        expect(await phrasesOf('#jp-cell-a')).toEqual([]);

        // .mp on the LEADING anchor — the reported bug, verbatim from
        // debug/work-ComeTogether-final-filtered.html row 46.
        expect(await phrasesOf('#jp-cell-e')).toEqual([{ phrase: 'feat.', hasNode: true }]);
        // .mp on the TRAILING anchor — a left-looking-only fix passes row E
        // and fails this one.
        expect(await phrasesOf('#jp-cell-f')).toEqual([{ phrase: 'feat.', hasNode: true }]);
        // .mp wrapping a .name-variation wrapping the <a> — two nested wrappers.
        expect(await phrasesOf('#jp-cell-g')).toEqual([{ phrase: '&', hasNode: true }]);
        // ONE wrapper around BOTH anchors AND the phrase. This is the case
        // that separates the nearest-common-ancestor walk from one that hosts
        // every anchor on the <bdi>: that one sees a single host and finds
        // nothing here, while still passing E, F and G.
        expect(await phrasesOf('#jp-cell-h')).toEqual([{ phrase: 'feat.', hasNode: true }]);

        // Each entity carries its own .comment, so the "between" slice here
        // is three nodes for a four-character phrase — and the phrase is
        // still assembled from the text nodes alone.
        expect(await phrasesOf('#jp-cell-j')).toEqual([{ phrase: 'vs.', hasNode: true }]);

        // `hasNode` is not incidental — it is the precondition
        // _highlightJoinPhraseMatch() needs. A phrase found with no text node
        // is counted and filterable but can never be marked.
    });

    test('the highlight lands on the phrase, not on the nbsp in front of the previous entity\'s comment', async ({ page }) => {
        await render(page);
        const colIdx = await artistColIdx(page);

        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: vs.'), ['J']);

        // Row J's slice between the two anchors is
        // [ "\u00a0", <span class="comment">, " vs. " ]. Taking the first
        // text node marks a blank in front of "(UK rock group)" — visually a
        // stray highlighted gap, and a mark that does not name what matched.
        const marks = await getColumnHighlightTexts(page, colIdx);
        expect(marks).toHaveLength(1);
        expect(marks[0].trim()).toBe('vs.');
    });

    test('a phrase found only through a wrapper is usable as a filter, and marks the phrase text', async ({ page }) => {
        await render(page);
        const colIdx = await artistColIdx(page);

        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: feat.'), ['E', 'F', 'H']);

        // The mark lands on the PHRASE, not on the artist name — the
        // guarantee _highlightJoinPhraseMatch() exists for. Asserting the
        // texts rather than "something is highlighted" is what separates them.
        const marks = await getColumnHighlightTexts(page, colIdx);
        expect(marks.map((t) => t.trim())).toEqual(['feat.', 'feat.', 'feat.']);
    });

    // ── Bug 2: the badge count and the rows it produces must agree ──────────
    test('a checked entry NARROWS a typed filter instead of replacing it, so its badge equals the row count', async ({ page }) => {
        await render(page);
        const colIdx = await artistColIdx(page);

        await typeArtistFilter(page, colIdx, 'bruce', BRUCE);

        // The panel counts VISIBLE rows, so this badge already means
        // "…and bruce": 2 (rows C and D), not the 3 that "with" has overall.
        const counts = await sectionCounts(page, 'Artist', SECTION);
        expect(counts['» join phrase: with']).toBe(2);

        // Before the fix this was ['C', 'D', 'I'] — row I came back because
        // the typed filter was thrown away.
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), ['C', 'D']);

        // The actual guarantee is the AGREEMENT between the two numbers, so
        // assert it as such and not only as the literal 2 above.
        expect((await visibleRowLetters(page)).length).toBe(counts['» join phrase: with']);
    });

    test('the typed text stays visible in the input, stays highlighted, and is stashed once', async ({ page }) => {
        await render(page);
        const colIdx = await artistColIdx(page);

        await typeArtistFilter(page, colIdx, 'bruce', BRUCE);
        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), ['C', 'D']);

        const state = await artistInputState(page, colIdx);
        expect(state.value).toBe('bruce + » join phrase: with');
        expect(state.typed).toBe('bruce');

        // Both halves of the AND are marked. The typed half regained its
        // highlight for free — testRowMatch()'s highlight loop iterates every
        // descriptor, and the typed text is now one of them.
        const marks = (await getColumnHighlightTexts(page, colIdx)).map((t) => t.trim());
        expect(marks.filter((t) => t.toLowerCase() === 'bruce')).toHaveLength(2);
        expect(marks.filter((t) => t === 'with')).toHaveLength(2);

        // Stashed ONCE, on the transition. Ticking a second box must not
        // re-read the input — by then it holds the label, so the text would
        // append to itself ("bruce + bruce + 2 selected").
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: and'), ['B', 'C', 'D']);
        const state2 = await artistInputState(page, colIdx);
        expect(state2.typed).toBe('bruce');
        expect(state2.value).toBe('bruce + 2 selected');
    });

    test('unchecking the last entry restores the typed filter rather than clearing the column', async ({ page }) => {
        await render(page);
        const colIdx = await artistColIdx(page);

        await typeArtistFilter(page, colIdx, 'bruce', BRUCE);
        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), ['C', 'D']);

        // Back to the typed filter's own row set — NOT to the whole table,
        // which is what blanking the input would give.
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), BRUCE);

        const state = await artistInputState(page, colIdx);
        expect(state.value).toBe('bruce');
        expect(state.uniq).toBeNull();
        expect(state.typed).toBeNull();
        // The column is still filtered, so it must still LOOK filtered.
        expect(state.tinted).toBe(true);
    });

    test('typing into a field that holds a selection still replaces it — the deliberate asymmetry', async ({ page }) => {
        await render(page);
        const colIdx = await artistColIdx(page);
        const input = columnFilterInput(page, colIdx);

        await typeArtistFilter(page, colIdx, 'bruce', BRUCE);
        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), ['C', 'D']);
        await page.evaluate(() => window.__saTest.closeUniqDrop());

        // The whole label becomes the literal text filter, matching nothing.
        await input.click();
        await settleRows(page, () => input.pressSequentially('x'), []);

        const state = await artistInputState(page, colIdx);
        expect(state.uniq).toBeNull();
        // Both halves go, or the stash would keep narrowing rows with nothing
        // on screen explaining why.
        expect(state.typed).toBeNull();
    });

    test('no stash is left behind by any clear path, or by a selection made with nothing typed', async ({ page }) => {
        await render(page);
        const colIdx = await artistColIdx(page);

        // (a) A selection with no typed text underneath stashes nothing.
        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), ['C', 'D', 'I']);
        let state = await artistInputState(page, colIdx);
        expect(state.typed).toBeNull();
        expect(state.value).toBe('» join phrase: with');
        await page.evaluate(() => window.__saTest.closeUniqDrop());

        // (b) The per-column ✕.
        await settleRows(page, () => columnFilterClear(page, colIdx).click(), ALL);
        state = await artistInputState(page, colIdx);
        expect(state.uniq).toBeNull();
        expect(state.typed).toBeNull();

        // (c) "Clear ALL COLUMN filters", on a real typed+selected combination.
        await typeArtistFilter(page, colIdx, 'bruce', BRUCE);
        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), ['C', 'D']);
        await page.evaluate(() => window.__saTest.closeUniqDrop());
        await settleRows(page, () => page.click('#mb-clear-column-filters-btn'), ALL);

        state = await artistInputState(page, colIdx);
        expect(state.uniq).toBeNull();
        expect(state.typed).toBeNull();
    });

    test('with nothing typed, a checked entry behaves exactly as it always did', async ({ page }) => {
        await render(page);

        // The counter-guard for the AND: it must change nothing when there is
        // nothing to AND with. Row I is back.
        await openArtistDrop(page);
        await settleRows(page, () => clickSynItem(page, SECTION, '» join phrase: with'), ['C', 'D', 'I']);
    });
});
