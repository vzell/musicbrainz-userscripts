'use strict';

// The ⏳ pending-edits filter must MARK what it matched, so a collapsed
// multi-row cell can say "the thing you filtered for is one of the items I am
// hiding".
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `mb-collapse-toggle-has-match` — the tint on a collapsed cell's ▶N▤ toggle —
// is computed ONLY from `_COLLAPSE_MATCH_SEL` (the four filter-highlight
// classes) found inside the cell's HIDDEN `<li>`s. The ⏳ toggle is structural:
// MusicBrainz's `span.mp` is a CSS-only orange marker with no text of its own,
// so `testRowMatch()` consulted `ctx.pendingEditsOnly` as a predicate and wrote
// no highlight at all. A collapsed "Authors" cell hiding the pending author was
// therefore byte-identical to one with no pending author. Measured on
// debug/artist-works-pending-edits-collapsed.html: 12 `.mb-cell-collapse-toggle`,
// 0 tinted, `span.mp` at `<li>` index 1 and 2 of `td.mb-has-collapse-toggle`
// cells.
//
// ── What each test pins, and the adjacent property it avoids ────────────────
//
// The guarantee is "EXACTLY the toggles whose hidden items carry a marker are
// tinted", never "a toggle is tinted" — the latter passes just as happily if
// every toggle on the page lights up, which is the obvious way to get this
// wrong. The fixture is built so three different negatives exist at once
// (see its own comment):
//
//   row 1 Authors            marker on hidden item 3   -> MUST tint
//   row 1 Recording artists  multi-row, no marker      -> must NOT tint
//                            (same row, so a row-level tint fails here)
//   row 2 Authors            marker on the VISIBLE item -> must NOT tint
//                            (nothing is hidden, so a cell-level "has a
//                             marker anywhere" tint fails here)
//
// Network-free: the Relationships column is off and nothing is fetched.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

const WORKS_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/works';
const WORKS_FIXTURE = path.join(__dirname, 'artist-works-pending-edits.html');

const PENDING_BTN = '#mb-pending-edits-btn';
const GLOBAL_COLLAPSE_BTN = '#mb-col-collapse-all-btn';

/**
 * Renders the works fixture. Artwork and the Relationships column stay off —
 * this is about cell content, and both only add asynchronous noise.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function render(page) {
    await loadUserscriptPage(page, {
        url: WORKS_URL, fixtureFile: WORKS_FIXTURE, testMode: true,
    });
    await page.route('https://musicbrainz.org/artist/**/works*',
        (route) => route.fulfill({ path: WORKS_FIXTURE, contentType: 'text/html' }));
    await page.click('button[data-label="Show all Works for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every collapse toggle on the page as `"<row title> / <column name>"`, with
 * whether it is tinted, whether it is expanded, and whether its HIDDEN items
 * actually carry a pending-edits marker — the last one derived independently of
 * the code under test, so the expectation cannot drift with it.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<object>>}
 */
const toggles = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const colName = (i) => {
            const th = ths[i];
            if (!th) return '?';
            if (th.dataset && th.dataset.colName) return th.dataset.colName;
            const c = th.cloneNode(true);
            c.querySelectorAll('.mb-col-hdr-flex span, button').forEach((e) => e.remove());
            return c.textContent.replace(/[​⬍▲▼📊]/g, '').trim();
        };
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.classList.contains('mb-col-filter-row')) return;
            if (tr.style.display === 'none') return;
            const title = (tr.cells[0] ? tr.cells[0].textContent : '').trim();
            Array.from(tr.cells).forEach((td, i) => {
                const tg = td.querySelector(':scope > .mb-cell-collapse-toggle');
                if (!tg) return;
                const lis = Array.from(td.querySelectorAll('li'));
                out.push({
                    where: `${title} / ${colName(i)}`,
                    tinted: tg.classList.contains('mb-collapse-toggle-has-match'),
                    expanded: tg.getAttribute('aria-expanded') === 'true',
                    hiddenHasMarker: lis.slice(1).some((li) => !!li.querySelector('span.mp')),
                });
            });
        });
    });
    return out.sort((a, b) => a.where.localeCompare(b.where));
});

/** The global ▶/◀ collapse button's inline tint, or '' when it has none. */
const globalTint = (page) => page.evaluate((sel) => {
    const b = document.querySelector(sel);
    return b ? b.style.backgroundColor : null;
}, GLOBAL_COLLAPSE_BTN);

/** The ⏳ filter-bar toggle's visibility, label and pressed state. */
const pendingBtn = (page) => page.evaluate((sel) => {
    const b = document.querySelector(sel);
    return b ? { visible: b.style.display !== 'none', label: b.textContent,
                 pressed: b.getAttribute('aria-pressed') } : null;
}, PENDING_BTN);

test.describe('⏳ pending edits: a collapsed cell says when it is hiding the match', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('nothing is tinted before the filter is engaged', async ({ page }) => {
        await render(page);

        expect(await pendingBtn(page)).toEqual(
            { visible: true, label: '(2) ⏳', pressed: 'false' });

        const t = await toggles(page);
        // The fixture's own shape, asserted so a later edit to it cannot
        // quietly remove the case under test.
        expect(t.map((x) => x.where)).toEqual([
            'Livin’ on a Prayer / Authors',
            'Livin’ on a Prayer / Recording artists',
            'Wanted Dead or Alive / Authors',
            'You Give Love a Bad Name / Authors',
        ]);
        expect(t.filter((x) => x.hiddenHasMarker).map((x) => x.where),
            'exactly one cell hides a pending-edits marker')
            .toEqual(['Livin’ on a Prayer / Authors']);

        expect(t.filter((x) => x.tinted), 'no filter, no tint').toEqual([]);
        expect(await globalTint(page), 'no filter, no tint on the global button').toBe('');
    });

    test('engaging it tints exactly the toggles whose HIDDEN items carry a marker',
        async ({ page }) => {
            await render(page);
            await page.click(PENDING_BTN);
            await page.waitForTimeout(500);

            const t = await toggles(page);
            // Row 3 is gone: it has no marker at all, so the filter removed it.
            expect(t.map((x) => x.where), 'only pending rows survive the filter').toEqual([
                'Livin’ on a Prayer / Authors',
                'Livin’ on a Prayer / Recording artists',
                'Wanted Dead or Alive / Authors',
            ]);

            // THE assertion: tinted is exactly hiddenHasMarker, cell by cell.
            // "Livin' on a Prayer / Recording artists" is the same ROW as the
            // one that must tint, and "Wanted Dead or Alive / Authors" is a
            // cell that does contain a marker — just not a hidden one.
            expect(t.map((x) => [x.where, x.tinted])).toEqual(
                t.map((x) => [x.where, x.hiddenHasMarker]));
            expect(t.filter((x) => x.tinted).map((x) => x.where),
                'one toggle, and it is the right one')
                .toEqual(['Livin’ on a Prayer / Authors']);

            expect(await globalTint(page),
                'the global collapse button reports that a multi-row cell holds a match')
                .not.toBe('');
        });

    test('expanding the cell clears its own tint', async ({ page }) => {
        await render(page);
        await page.click(PENDING_BTN);
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            const tg = Array.from(document.querySelectorAll('.mb-cell-collapse-toggle'))
                .find((t) => t.classList.contains('mb-collapse-toggle-has-match'));
            tg.click();
        });
        await page.waitForTimeout(500);

        const t = await toggles(page);
        const cell = t.find((x) => x.where === 'Livin’ on a Prayer / Authors');
        expect(cell.expanded, 'the cell is open').toBe(true);
        expect(cell.tinted, 'nothing is hidden any more, so nothing to advertise').toBe(false);
    });

    test('releasing the filter clears every tint', async ({ page }) => {
        await render(page);
        await page.click(PENDING_BTN);
        await page.waitForTimeout(500);
        expect((await toggles(page)).some((x) => x.tinted)).toBe(true);

        await page.click(PENDING_BTN);
        await page.waitForTimeout(500);

        expect((await pendingBtn(page)).pressed).toBe('false');
        expect((await toggles(page)).filter((x) => x.tinted), 'filter off, tint off').toEqual([]);
        expect(await globalTint(page)).toBe('');
    });

    test('the pending entity itself is marked, in a visible cell too', async ({ page }) => {
        await render(page);
        await page.click(PENDING_BTN);
        await page.waitForTimeout(500);

        // Row 2's marker is the cell's FIRST item, so it is on screen while
        // collapsed. That is the half of the change the user sees directly, and
        // it is what the tint above is derived from.
        const marked = await page.evaluate(() => Array.from(
            document.querySelectorAll('table.tbl tbody td span.mp .mb-column-filter-highlight'))
            .map((el) => el.textContent.trim()));
        expect(marked, 'every pending entity in every matching row is highlighted')
            .toEqual(['Desmond Child', 'Desmond Child']);
    });
});
