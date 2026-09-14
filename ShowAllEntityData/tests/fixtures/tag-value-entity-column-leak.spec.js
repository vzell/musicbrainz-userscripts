'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// tag-value (/tag/<value>, tableMode:'multi') declares an empty
// `entityFeatures: {}` for Areas/Artists/Instruments/Labels/Places/Series/
// Works — same as every other group with no per-entity-type extras. Two
// module-level extractor-registry rebuild sites only rebuilt
// activeColumnExtractors/activeSyntheticColumnExtractors/etc. when the
// CURRENT group's entityFeatures was non-empty, so a `{}` group silently
// inherited whatever the PREVIOUS group in iteration order (Areas, Artists,
// Events, Instruments, Labels, Places, Release groups, Releases, Recordings,
// Series, Works) last built. See DEBUG-NOTES.md's 2026-09-14 tag-value
// entity-column-leak entry for the full root-cause trace.
const TAG_URL = 'https://musicbrainz.org/tag/rock';
const FIXTURE_FILE = path.join(__dirname, 'tag-value-entity-column-leak.html');

async function openTagRock(page, settingsOverride = {}) {
    await loadUserscriptPage(page, {
        url: TAG_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride,
    });
    await page.click('button[data-label="Show all Entities tagged"]');
    await page.waitForSelector('#mb-filter-container');
}

/**
 * Reads one sub-table's header/cell shape by its h3 category heading text.
 */
function readGroupShape(page, categoryName) {
    return page.evaluate((name) => {
        // The rendered h3 gets a prepended toggle-icon span and an appended
        // row-count-stat span, so its textContent is e.g. "▼Areas(2)" —
        // match by substring, not by prefix.
        const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes(name));
        if (!h3) return null;
        let table = h3.nextElementSibling;
        while (table && table.tagName !== 'TABLE') table = table.nextElementSibling;
        if (!table) return null;
        const headers = Array.from(table.querySelectorAll('thead tr:first-child > th'))
            .map((th) => th.dataset.colName || th.textContent.trim());
        const row = table.querySelector('tbody tr');
        const cellTextAt = (colName) => {
            const idx = headers.indexOf(colName);
            if (idx === -1 || !row.cells[idx]) return null;
            return row.cells[idx].textContent.replace(/\s+/g, ' ').trim();
        };
        return {
            headers,
            headerCount: headers.length,
            rowCellCount: row ? row.cells.length : -1,
            mbName: cellTextAt('MB-Name'),
            comment: cellTextAt('Comment'),
            eventAdditionalInfo: cellTextAt('Event-Additional-Info'),
        };
    }, categoryName);
}

test.describe('tag-value: entity-column-leak between empty-entityFeatures groups', () => {
    test('Areas gets no leaked Event-* columns, and MB-Name/Comment hold the real data', async ({ page }) => {
        await openTagRock(page);
        const shape = await readGroupShape(page, 'Areas');
        expect(shape).not.toBeNull();
        expect(shape.headers).toEqual(['Area', 'MB-Name', 'Comment', 'Primary alias']);
        expect(shape.rowCellCount).toBe(shape.headerCount);
        expect(shape.mbName).toBe('United Kingdom');
        expect(shape.comment).toBe('');
    });

    test('Artists gets no leaked Event-* columns, and MB-Name/Comment hold the real data', async ({ page }) => {
        await openTagRock(page);
        const shape = await readGroupShape(page, 'Artists');
        expect(shape).not.toBeNull();
        expect(shape.headers).toEqual(['Artist', 'MB-Name', 'Comment', 'Primary alias']);
        expect(shape.rowCellCount).toBe(shape.headerCount);
        expect(shape.mbName).toBe('The Beatles');
        expect(shape.comment).toBe('UK rock band, “The Fab Four”');
    });

    test('Series gets no leaked Event-Additional-Info column duplicating Comment', async ({ page }) => {
        await openTagRock(page);
        const shape = await readGroupShape(page, 'Series');
        expect(shape).not.toBeNull();
        expect(shape.headers).toEqual(['Series', 'MB-Name', 'Comment', 'Primary alias']);
        expect(shape.eventAdditionalInfo).toBeNull();
        expect(shape.mbName).toBe('50 Years Later');
        expect(shape.comment).toBe('Pale Wizard Records');
    });

    test('Instruments keeps its own correct 4-column shape (regression guard)', async ({ page }) => {
        await openTagRock(page);
        const shape = await readGroupShape(page, 'Instruments');
        expect(shape).not.toBeNull();
        expect(shape.headers).toEqual(['Instrument', 'MB-Name', 'Comment', 'Primary alias']);
        expect(shape.rowCellCount).toBe(shape.headerCount);
        expect(shape.mbName).toBe('drums (drum set)');
        expect(shape.comment).toBe('Set of drums in modern music');
    });

    test('Events keeps its own declared Date columns, unaffected by neighboring empty groups', async ({ page }) => {
        await openTagRock(page);
        const shape = await readGroupShape(page, 'Events');
        expect(shape).not.toBeNull();
        expect(shape.headers).toEqual(expect.arrayContaining(['Date', 'DD', 'MM', 'YYYY', 'MB-Name', 'Comment']));
        expect(shape.rowCellCount).toBe(shape.headerCount);
    });

    test('Recordings keeps its own declared Event-* columns', async ({ page }) => {
        await openTagRock(page);
        const shape = await readGroupShape(page, 'Recordings');
        expect(shape).not.toBeNull();
        expect(shape.headers).toEqual(expect.arrayContaining([
            'Event-Type', 'Event-Date', 'Event-Detail', 'Event-Additional-Info', 'MB-Name', 'Comment',
        ]));
        expect(shape.rowCellCount).toBe(shape.headerCount);
    });
});

test.describe('tag-value: "Show single-table" button for sub-tables without a native overflow link', () => {
    test('Areas (no seeAllUrl) gets the button, routed to the singular /tag/rock/area sibling', async ({ page }) => {
        await openTagRock(page, { sa_enable_show_single_table_btn: true });

        // Areas is the first group in the fixture with no native seeAllUrl,
        // so its "Show single-table" button is the first on the page.
        const areaBtn = page.locator('.mb-show-single-table-btn').first();
        await expect(areaBtn).toBeVisible();

        // Intercept the popup's navigation so no real network request is made,
        // then read back only the target URL and the captured payload's
        // pageType — full cross-tab hydration is exercised elsewhere
        // (tests/fixtures/subtable-tab-handoff.spec.js) and isn't needed here.
        const context = page.context();
        await context.route('**/tag/rock/area*', (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: '<html><body></body></html>',
        }));

        const [tab] = await Promise.all([
            context.waitForEvent('page'),
            areaBtn.click(),
        ]);
        await tab.waitForLoadState('domcontentloaded');

        expect(tab.url()).toContain('/tag/rock/area');
        expect(tab.url()).not.toContain('/tag/rock/areas');
        expect(tab.url()).toContain('#mb-sa-snapshot=');

        const payload = await page.evaluate(() => {
            const values = JSON.parse(localStorage.getItem('__sa_test_gm_values__') || '{}');
            const key = Object.keys(values).find((k) => k.startsWith('mb_sa_subtable_snapshot_'));
            return key ? values[key] : null;
        });
        expect(payload).not.toBeNull();
        expect(payload.pageType).toBe('tag-value-entity');
        expect(payload.detailSegment).toBe('Areas');

        await tab.close();
    });

    test('Events (has seeAllUrl) gets the native "Show all N rows" button', async ({ page }) => {
        // NOTE: this does NOT also assert the single-table button is absent.
        // A later settle/re-render pass on this page independently re-adds
        // it here too (via the "Also inject … if absent" defensive block,
        // whose own `!group.seeAllUrl` check reads a rebuilt group object
        // that no longer carries `seeAllUrl`) — a pre-existing latent bug,
        // reproducible on every pageType already in
        // SA_SNAPSHOT_SUPPORTED_PAGETYPES before this change (e.g.
        // artist-relationships), not something introduced by adding
        // tag-value/user-tag-value to that Set. Out of scope here; flagged
        // separately rather than asserted around.
        await openTagRock(page, { sa_enable_show_single_table_btn: true });

        const eventsH3 = page.locator('h3', { hasText: 'Events' });
        await expect(eventsH3).toBeVisible();
        const hasShowAll = await eventsH3.evaluate((h3) => /Show all \d+ rows/.test(h3.textContent));
        expect(hasShowAll).toBe(true);
    });
});
