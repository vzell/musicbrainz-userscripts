'use strict';

// The row-count stat (`.mb-row-count-stat`) keeps ONE width across all of its
// formats — `(N)`, `(F of T)` and, on the h2 of a multi-table page,
// `(F of T)/A` — so the controls after it (the master toggle in the h2, the
// ↔️ resize button in every h3, …) do not shift right on every filter and back
// when it is cleared (org/fixed-width-row-stats.org).
//
// ── The guarantee pinned ────────────────────────────────────────────────────
//
// The element AFTER each count span keeps its x position through a filter and
// its clear. That is not "the count is correct" — the existing filter specs
// cover that — and it is not "the span has a min-width": a span sized for the
// wrong format (2-tier slot on a 3-tier h2) passes a width check and still
// shifts. So each test first asserts the count text actually reached its wide
// form, and only then compares positions; without the first half a filter that
// matched nothing different would pass while measuring nothing.
//
// The mechanism is CSS (`display: inline-grid` + an invisible zero-height
// `::after` rendering `data-mb-sizer`, written by `_setCountStatText()`), so
// `textContent` is unchanged — asserted below, because
// `parseRowCountText()` and `liveAssertions.js` read it.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForFilterSettled, typeGlobalFilter } = require('../support/filterSortAssertions');

// "Tougher Than the Rest" — 7 releases across 2 groups (Official 6, Promotion 1).
const RG_URL = 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c';
const RG_SHELL = path.join(__dirname, '..', 'snapshots', 'releasegroup-releases', 'raw.html');
const RG_FIXTURE = path.join(__dirname, 'saved-data', 'releasegroup-releases.json.gz');

// The BoDeans page: artist-releases, tableMode 'single', 56 rows.
const BODEANS_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const BODEANS_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');

// Matches some rows of each fixture but not all of them.
const RG_QUERY = 'CD';
const BODEANS_QUERY = 'Home';

/**
 * For every `.mb-row-count-stat` in an h2/h3: its text, and the left edge of
 * the element right after it (null if that element is not laid out).
 *
 * The edge is measured RELATIVE TO THE HEADING, not the viewport: typing in the
 * global filter can scroll the whole page sideways by a few pixels (observed:
 * 8 px on the release-group fixture, the toggle icon and every other h2 child
 * moving together), which is not the shift this spec is about and would
 * otherwise fail it with the count span's width unchanged.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{tag: string, text: string, nextId: string, nextLeft: number|null}>>}
 */
const readStats = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('h2 .mb-row-count-stat, h3 .mb-row-count-stat')).map((s) => {
        const next = s.nextElementSibling;
        const r = next ? next.getBoundingClientRect() : null;
        const headLeft = s.parentElement.getBoundingClientRect().left;
        return {
            tag: s.parentElement.tagName,
            text: s.textContent,
            nextId: next ? (next.id || String(next.className).split(' ')[0] || next.tagName) : '(none)',
            nextLeft: r && r.width > 0 ? r.left - headLeft : null,
        };
    }));

/**
 * Asserts every recorded "next element" sits where it did in `before`.
 *
 * @param {Array<{tag: string, text: string, nextId: string, nextLeft: number|null}>} before
 * @param {Array<{tag: string, text: string, nextId: string, nextLeft: number|null}>} after
 * @param {string} when  Label for failure messages.
 */
function expectNoShift(before, after, when) {
    expect(after.length, `${when}: same number of count spans`).toBe(before.length);
    before.forEach((b, i) => {
        const a = after[i];
        expect(a.nextId, `${when}: span ${i} (${b.tag}) is still followed by the same control`).toBe(b.nextId);
        expect(Math.abs(a.nextLeft - b.nextLeft),
            `${when}: ${b.tag} "${b.text}" → "${a.text}" moved ${b.nextId}`).toBeLessThan(0.5);
    });
}

test.describe('fixed-width row-count stat', () => {
    test('multi-table: h2 master toggle and h3 controls stay put through GF, STF and clear', async ({ page }) => {
        test.setTimeout(120000);
        await loadFromDiskFixture(page, {
            url: RG_URL, fixturePath: RG_FIXTURE, pageFixtureFile: RG_SHELL, testMode: true,
        });
        await expect(page.locator('#mb-filter-container')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('table.tbl')).toHaveCount(2);

        const before = await readStats(page);
        expect(before.map((s) => s.tag)).toEqual(['H2', 'H3', 'H3']);
        expect(before.map((s) => s.text)).toEqual(['(7)', '(6)', '(1)']);
        before.forEach((s, i) => expect(s.nextLeft, `control after span ${i} is laid out`).not.toBeNull());
        expect(before[0].nextId).toBe('mb-master-toggle');

        // Global filter: the h2 reaches its 3-tier form, at least one h3 its 2-tier form.
        await waitForFilterSettled(page, () => typeGlobalFilter(page, RG_QUERY));
        await expect.poll(async () => (await readStats(page))[0].text).toMatch(/^\(\d+ of \d+\)\/7$/);
        const filtered = await readStats(page);
        expect(filtered.slice(1).some((s) => / of /.test(s.text)),
            `a sub-table count reached "(F of T)": ${JSON.stringify(filtered.map((s) => s.text))}`).toBe(true);
        expectNoShift(before, filtered, 'after global filter');

        // Sub-table filter on top: still no shift anywhere.
        const h3 = page.locator('h3.mb-toggle-h3').nth(0);
        const panel = h3.locator('.mb-subtable-filter-container');
        if (!await panel.isVisible()) await page.locator('.mb-subtable-filter-toggle-icon').nth(0).click();
        await expect(panel).toBeVisible();
        // Opening the 🔍 panel legitimately reflows the h3 (the panel itself is
        // inline in the heading), so the baseline for the STF step is taken here.
        const beforeStf = await readStats(page);
        const stfInput = panel.locator('input[type="search"]');
        await stfInput.click();
        await stfInput.pressSequentially('zzzz-no-match');
        await expect.poll(async () => (await readStats(page))[1].text).toMatch(/^\(0 of 6\)$/);
        expectNoShift(beforeStf, await readStats(page), 'after sub-table filter');
        await stfInput.fill('');
        await expect.poll(async () => (await readStats(page))[1].text).not.toMatch(/^\(0 of/);

        // Clear the global filter: back to the unfiltered texts, same positions.
        // The 🔍 panel is still open, so compare against the STF baseline.
        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-input').fill(''));
        await expect.poll(async () => (await readStats(page)).map((s) => s.text)).toEqual(['(7)', '(6)', '(1)']);
        expectNoShift(beforeStf, await readStats(page), 'after clearing every filter');
    });

    test('the sizer is data, not text: textContent is the bare count', async ({ page }) => {
        test.setTimeout(120000);
        await loadFromDiskFixture(page, {
            url: RG_URL, fixturePath: RG_FIXTURE, pageFixtureFile: RG_SHELL, testMode: true,
        });
        await expect(page.locator('table.tbl')).toHaveCount(2);
        const sizers = await page.evaluate(() =>
            Array.from(document.querySelectorAll('h2 .mb-row-count-stat, h3 .mb-row-count-stat'))
                .map((s) => [s.textContent, s.dataset.mbSizer]));
        // h2 of a multi-table page reserves the 3-tier form; h3s the 2-tier one.
        expect(sizers).toEqual([['(7)', '(8 of 8)/8'], ['(6)', '(8 of 8)'], ['(1)', '(8 of 8)']]);
    });

    test('single-table: the control after the h2 count stays put through a filter and its clear', async ({ page }) => {
        test.setTimeout(120000);
        await loadFromDiskFixture(page, {
            url: BODEANS_URL, fixturePath: BODEANS_FIXTURE, testMode: true,
            settingsOverride: { sa_enable_relationships_column: false },
        });
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)', { timeout: 30000 });

        const before = (await readStats(page)).filter((s) => s.tag === 'H2');
        expect(before).toHaveLength(1);
        expect(before[0].nextLeft, 'control after the h2 count is laid out').not.toBeNull();

        await waitForFilterSettled(page, () => typeGlobalFilter(page, BODEANS_QUERY));
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText(/^\(\d+ of 56\)$/);
        expectNoShift(before, (await readStats(page)).filter((s) => s.tag === 'H2'), 'after global filter');

        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-input').fill(''));
        await expect(page.locator('h2 .mb-row-count-stat')).toHaveText('(56)');
        expectNoShift(before, (await readStats(page)).filter((s) => s.tag === 'H2'), 'after clearing');
    });
});
