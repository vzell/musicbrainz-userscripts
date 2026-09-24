'use strict';

// ↔️ Resize and 👁️ Visible moved out of the h1 controls bar and into the
// table's own h2, immediately before `#mb-filter-container` — the same slot the
// per-sub-table pair has always occupied in every h3. This pins the three
// things that move can break, none of which is visible as an error.
//
// ── A. The pair must survive `updateH2Count()` ──────────────────────────────
//
// That function REPLACES `.mb-row-count-stat` on every filter change and then
// re-anchors a hard-coded list of direct h2 children after the new span. A
// control not in that list is displaced to the front of the heading on the
// first keystroke — CLAUDE.md records the same trap for `mb-rel-retry-*`. The
// pair is deliberately NOT in that list (see B); `_reanchorH2TableControls()`
// re-asserts its own anchor instead. **The first-render assertion alone proves
// nothing here** — the bug only appears after a count rebuild.
//
// ── B. The artwork/Relationships runs are segmented pills ───────────────────
//
// They are selected by id prefix and drawn as one pill with hairline dividers,
// so an element inserted between two of them splits one pill into two.
// Anchoring on the filter container puts the pair past the end of every run.
// This is why the pair is a single WRAPPER placed after those runs rather than
// two buttons joining the count-stat re-anchor list.
//
// Note `FIXTURE_SETTINGS_OVERRIDE` forces `sa_enable_caa_pics` OFF for every
// fixture spec, so this file turns it back on — against a 404 route, since what
// matters is that the control run EXISTS, not what it reports. Without that,
// the run is empty and the assertion passes while measuring nothing.
//
// ── C. `#mb-resize-btn.title` is a test contract ────────────────────────────
//
// `tests/support/browser.js`'s `waitForRenderComplete({ waitForAutoResize })`
// polls for a title starting with "Restore" to know the auto-resize-on-load
// pass has finished. The button is glyph-only now, so the title is the only
// thing carrying its state — and a change that moved the wording into the
// glyph would hang every render wait in the suite rather than failing here.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { typeGlobalFilter } = require('../support/filterSortAssertions');

// The BoDeans page: artist-releases, tableMode 'single', 56 rows, every one
// carrying a /cover-art anchor — so the h2 gets a real artwork control run to
// stay clear of.
const FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');
const PAGE_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';

/**
 * The h2's direct children as a list of ids/classes, in document order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]|null>}
 */
const headerChildren = (page) => page.evaluate(() => {
    const fc = document.getElementById('mb-filter-container');
    const h2 = fc ? fc.parentElement : document.querySelector('h2');
    if (!h2) return null;
    return Array.from(h2.children).map(
        (el) => el.id || (el.className && String(el.className).split(' ')[0]) || el.tagName);
});

/**
 * Loads the fixture with artwork on and waits for the h2 pair to be mounted.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function loadPage(page) {
    await page.route('https://coverartarchive.org/**',
        (route) => route.fulfill({ status: 404, body: '' }));

    await loadFromDiskFixture(page, {
        url: PAGE_URL,
        fixturePath: FIXTURE,
        testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: true,
            sa_enable_relationships_column: false,
        },
    });

    await expect.poll(() => page.locator('h2 .mb-h2-table-controls').count(),
        { timeout: 30000 }).toBe(1);
}

test.describe('the h2 table-control pair (↔️ / 👁️)', () => {
    test('both buttons live in one wrapper, and that wrapper precedes the filter bar', async ({ page }) => {
        test.setTimeout(120000);
        await loadPage(page);

        const wrap = page.locator('h2 .mb-h2-table-controls');
        await expect(wrap.locator('#mb-resize-btn')).toHaveCount(1);
        await expect(wrap.locator('#mb-visible-btn')).toHaveCount(1);

        // Neither is left behind in the h1 bar.
        await expect(page.locator('#mb-show-all-controls-container #mb-resize-btn')).toHaveCount(0);
        await expect(page.locator('#mb-show-all-controls-container #mb-visible-btn')).toHaveCount(0);

        const children = await headerChildren(page);
        expect(children, 'the h2 exposes its children').not.toBeNull();
        const wrapAt = children.indexOf('mb-h2-table-controls');
        const filterAt = children.indexOf('mb-filter-container');
        expect(wrapAt, 'the pair is a direct child of the h2').toBeGreaterThan(-1);
        expect(filterAt - wrapAt,
            'the pair sits immediately before the filter bar').toBe(1);
    });

    test('A: the pair keeps its anchor after a filter rebuilds the row-count stat', async ({ page }) => {
        test.setTimeout(120000);
        await loadPage(page);

        const before = await headerChildren(page);
        expect(before.indexOf('mb-filter-container') - before.indexOf('mb-h2-table-controls')).toBe(1);

        // Any filter rewrites the count, which destroys and re-creates
        // `.mb-row-count-stat` — the event this whole test exists for.
        // `page.fill()` is not actionable on this input after a disk load (it
        // carries a 🔍 focus prefix the script re-asserts); `typeGlobalFilter()`
        // is the harness's own answer.
        await typeGlobalFilter(page, 'Home');
        await page.waitForTimeout(2500);

        const after = await headerChildren(page);
        expect(after.indexOf('mb-row-count-stat'),
            'the stat is still in the header').toBeGreaterThan(-1);

        const wrapAt = after.indexOf('mb-h2-table-controls');
        const filterAt = after.indexOf('mb-filter-container');
        expect(wrapAt, 'the pair is still a direct child of the h2').toBeGreaterThan(-1);
        expect(filterAt - wrapAt,
            'the pair is STILL immediately before the filter bar').toBe(1);
        // The displacement this guards puts it at the front of the heading,
        // ahead of the stat — so assert the side it must be on, not just the gap.
        expect(wrapAt, 'and it did not jump ahead of the row-count stat')
            .toBeGreaterThan(after.indexOf('mb-row-count-stat'));
    });

    test('B: the artwork control run stays one unbroken pill', async ({ page }) => {
        test.setTimeout(120000);
        await loadPage(page);

        const children = await headerChildren(page);
        const run = children.filter((k) => /^mb-caa-toggle-btn|^mb-rel-retry/.test(k));
        expect(run.length,
            'the fixture really does render an artwork control run — without ' +
            'sa_enable_caa_pics back on, this assertion would measure nothing')
            .toBeGreaterThan(1);

        const firstAt = children.indexOf(run[0]);
        expect(children.slice(firstAt, firstAt + run.length),
            'nothing is wedged between two controls of the run').toEqual(run);

        // And the pair is past the end of it, not inside.
        expect(children.indexOf('mb-h2-table-controls'),
            'the pair follows the whole run').toBeGreaterThan(firstAt + run.length - 1);
    });

    test('C: the resize button is glyph-only, and its title still carries the state', async ({ page }) => {
        test.setTimeout(120000);
        await loadPage(page);

        const resize = page.locator('#mb-resize-btn');
        expect((await resize.textContent()).trim(),
            'glyph only — the label moved into the tooltip').toBe('↔️');

        const titleBefore = await resize.getAttribute('title');
        expect(titleBefore,
            'waitForRenderComplete({waitForAutoResize}) polls for this exact first word')
            .toMatch(/^(Resize|Auto-resize|Restore|One or more)/);

        await resize.click();
        await expect.poll(() => resize.getAttribute('title'), { timeout: 30000 })
            .toMatch(/^Restore/);
        expect((await resize.textContent()).trim(),
            'still glyph-only in the resized state').toBe('↔️');
    });
});
