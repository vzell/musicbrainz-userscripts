'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// `integerColumns` alignment must land on the columns it was configured for.
//
// The styling is applied POSITIONALLY — `applyIntegerColumnStyling()` reaches
// for `row.cells[entry.colIdx]` — against indices resolved once, up front,
// from a reconstructed list of the final column names. Any column the script
// renders but that list omits shifts every later index silently: no error, no
// missing UI, just alignment stamped onto unrelated columns.
//
// That is what happened here. The list is assembled in row-assembly order, and
// its synthetic-column-extractor step guarded on `_finalColNames.includes(
// entry.sourceColumn)` — but `eventParts` sources from 'Comment', which the
// MB-Name/Comment/Primary alias step only appends AFTERWARDS. So the entry
// looked unresolved, its nine Event-* names were dropped from the list, and
// R-YYYY (align 'C') resolved onto 'MB-Name' — centring a free-text column —
// while R-DD/R-MM (align 'R') landed on two Event-* columns.
//
// The assertion is deliberately the general invariant rather than "MB-Name is
// not centred": ANY styled cell outside the configured columns is the bug,
// whichever column it happens to land on.

const PLACE_URL = 'https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463'
    + '/performances?direction=1&link_type_id=693&page=1';
const FIXTURE_FILE = path.join(__dirname, 'place-performances-intcol-align.html');

// place-performances(-filtered)'s own `features.integerColumns`.
const CONFIGURED_INT_COLUMNS = ['DD', 'MM', 'YYYY', 'R-DD', 'R-MM', 'R-YYYY', 'Length'];

/**
 * Loads the fixture and runs the "Show all" fetch/render.
 *
 * `sa_enable_release_events_column` must stay ON: it is what declares the
 * 'Release events' injected column, and therefore what makes the R-DD/R-MM/
 * R-YYYY integerColumns exist at all. Its WS/2 call is stubbed with an empty
 * relations list — the columns' existence is what this test needs, not their
 * contents.
 *
 * `sa_enable_relationships_column` must ALSO stay ON, and that is not
 * incidental: it contributes one more name to the reconstructed column list,
 * which is exactly what makes R-YYYY land on 'MB-Name' rather than one column
 * earlier. With it off the defect still occurs — it just lands on
 * 'Event-Additional-Info' instead, and the reported symptom (a centred
 * MB-Name) would not reproduce. Its fetch goes through the same stub.
 */
async function setup(page) {
    await page.route('**/ws/2/**', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ relations: [] }),
    }));
    await loadUserscriptPage(page, {
        url: PLACE_URL,
        fixtureFile: FIXTURE_FILE,
        testMode: true,
        settingsOverride: {
            sa_enable_release_events_column: true,
            sa_enable_relationships_column: true,
            sa_enable_caa_pics: false,
            sa_enable_event_parts_extractor: true,
        },
    });
    await page.click('button[data-label="Show all Performances for Place (complete)"]');
    await page.waitForSelector('#mb-filter-container');
    await expect(page.locator('table.tbl tbody tr').first()).toBeVisible();
}

/**
 * Reads back, per column name, whether that column's body cells carry the
 * integer-column styling marker.
 *
 * @returns {Promise<{columns: string[], styled: string[]}>}
 */
function readStyledColumns(page) {
    return page.evaluate(() => {
        const table = document.querySelector('table.tbl');
        const ths = Array.from(table.querySelectorAll('thead th'));
        const columns = ths.map((th) => th.dataset.colName || '');
        const styled = new Set();
        for (const tr of table.querySelectorAll('tbody tr')) {
            const tds = tr.cells;
            for (let i = 0; i < tds.length && i < columns.length; i++) {
                if (tds[i] && tds[i].dataset.mbIntColStyled === '1') styled.add(columns[i]);
            }
        }
        return { columns, styled: Array.from(styled) };
    });
}

test.describe('place-performances: integerColumns alignment lands on the right columns', () => {
    test('the eventParts synthetic columns are actually present', async ({ page }) => {
        await setup(page);
        const { columns } = await readStyledColumns(page);
        // Guard: if eventParts ever stops emitting here the real assertion
        // below would pass vacuously, since the index gap is what it probes.
        for (const name of ['Event-Type', 'Event-Date', 'Event-Country', 'Event-Additional-Info']) {
            expect(columns).toContain(name);
        }
        expect(columns).toContain('MB-Name');
    });

    test('no column outside features.integerColumns is given integer-column styling', async ({ page }) => {
        await setup(page);
        const { columns, styled } = await readStyledColumns(page);

        const stray = styled.filter((name) => !CONFIGURED_INT_COLUMNS.includes(name));
        expect(
            stray,
            `integerColumns styling landed on ${JSON.stringify(stray)}, which is not in `
            + `features.integerColumns (${CONFIGURED_INT_COLUMNS.join(', ')}). `
            + `Rendered column order: ${JSON.stringify(columns)}`
        ).toEqual([]);
    });

    test('MB-Name specifically is left alone', async ({ page }) => {
        await setup(page);
        const { styled } = await readStyledColumns(page);
        // The user-visible symptom of the original defect: a free-text column
        // rendered centre-aligned because R-YYYY (align 'C') resolved onto it.
        expect(styled).not.toContain('MB-Name');
    });
});
