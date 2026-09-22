'use strict';

// An inline `Lib.settings.sa_X || literal` fallback must use the SAME value as
// that setting's own `default:` in configSchema.
//
// ── The bug ──────────────────────────────────────────────────────────────────
//
// org/config-handling.org F4. 165 sites read a setting with `||` or `??`; 15 of
// them, across 11 settings, disagreed with that setting's schema default. So
// the same setting resolved to two different values depending on which code
// path reached it.
//
// The cause is visible in git: `bfb8ac3` ("adjust configuration setting
// defaults to sensible values", 2026-08-17) changed `sa_uniq_dropdown_visible_rows`
// from 8 to 30 and left `Number(Lib.settings.…) || 8` untouched a few thousand
// lines away. The schema default is the deliberate value; the inline literal is
// what the flip missed. That is why every one of the 15 was fixed by moving the
// LITERAL, never the default.
//
// ── When the fallback actually fires, which is the whole subtlety ────────────
//
// `settingsInterface.init()` does `values[key] = GM_getValue(key, schema.default)`
// for every schema key, so `Lib.settings.sa_X` is never undefined in normal
// operation — the `||` is inert and the drift is invisible. It fires in exactly
// two situations:
//
//   1. the stored value is FALSY — a cleared colour field (''), or a 0; and
//   2. the VZ_MBLibrary `@require` failed to load, where `Lib` is a stub whose
//      `settings` is `{}` and every consumer's own fallback is all there is.
//
// This spec drives (1), because it is reachable from the settings dialog and
// needs no broken page. (2) has the same fix and no fixture can produce it.
//
// ── What this does NOT cover, deliberately ───────────────────────────────────
//
// The other 14 sites. A Playwright test can pin one or two rendered colours;
// the guarantee is about all 165, and `scripts/audit-config-defaults.py` is
// what checks it — mechanically, against the committed defaults snapshot,
// failing on any NEW disagreement. Its own arms are mutation-checked by
// `scripts/check-config-defaults-gate.py`. This file exists for the half a
// person would actually see.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { collectPageErrors } = require('../support/liveAssertions');

const SERIES_URL = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
const SERIES_SHELL = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
const SERIES_LABEL = 'Show all Releases for Series';
const SERIES_GLOB = 'https://musicbrainz.org/series/**';

// The schema defaults these two settings carry, and the stale literals that
// used to stand in for them. Asserted against BOTH so a test that merely
// "reads some colour" cannot pass: the old value is named, not just absent.
const HEADER_BG = { schemaDefault: 'rgb(186, 186, 186)', staleLiteral: 'rgb(232, 232, 232)' };
const FILTER_ROW_BG = { schemaDefault: 'rgb(209, 209, 209)', staleLiteral: 'rgb(244, 244, 244)' };

/**
 * Loads the series shell with `settings` seeded into GM storage, then clicks
 * "Show all".
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, *>} settings  Seeded verbatim — an empty string is the
 *   whole point here and must NOT be normalised away.
 */
async function loadSeriesPage(page, settings) {
    await loadUserscriptPage(page, {
        url: SERIES_URL,
        fixtureFile: SERIES_SHELL,
        testMode: true,
        settingsOverride: settings,
    });
    await page.route(SERIES_GLOB, (route) => route.fulfill({
        path: SERIES_SHELL, contentType: 'text/html',
    }));
    await page.click(`button[data-label="${SERIES_LABEL}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Computed background-color of the first header cell of the given row kind. */
const headerBg = (page, selector) => page.evaluate((sel) => {
    const th = document.querySelector(sel);
    return th ? getComputedStyle(th).backgroundColor : null;
}, selector);

const PLAIN_TH = 'table.tbl thead tr:first-child th:not([data-col-name="Relationships"])';
const FILTER_TH = 'table.tbl thead tr.mb-col-filter-row th';

test.describe('an inline settings fallback uses the schema default', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
    });

    test.afterEach(() => {
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('a CLEARED colour falls back to the schema default, not a stale literal',
        async ({ page }) => {
            // Exactly what the settings dialog stores when the user empties the
            // field and saves: '' is falsy, so the `||` fires.
            await loadSeriesPage(page, {
                sa_ui_thead_th_bg: '',
                sa_ui_thead_filter_row_bg: '',
            });

            const th = await headerBg(page, PLAIN_TH);
            expect(th, 'header uses the schema default #bababa')
                .toBe(HEADER_BG.schemaDefault);
            expect(th, 'and specifically NOT the stale #e8e8e8 literal')
                .not.toBe(HEADER_BG.staleLiteral);

            const filterTh = await headerBg(page, FILTER_TH);
            expect(filterTh, 'filter row uses the schema default #d1d1d1')
                .toBe(FILTER_ROW_BG.schemaDefault);
            expect(filterTh, 'and specifically NOT the stale #f4f4f4 literal')
                .not.toBe(FILTER_ROW_BG.staleLiteral);
        });

    test('an unset setting already rendered the schema default, and still does',
        async ({ page }) => {
            // The regression control. With nothing seeded, `init()` puts the
            // schema default into Lib.settings and the `||` never fires — this
            // path was correct before the fix and must be untouched by it. It
            // is also what makes the test above meaningful: both paths now
            // agree, which is the entire guarantee.
            await loadSeriesPage(page, {});

            expect(await headerBg(page, PLAIN_TH)).toBe(HEADER_BG.schemaDefault);
            expect(await headerBg(page, FILTER_TH)).toBe(FILTER_ROW_BG.schemaDefault);
        });

    test('a colour the user actually chose still wins over both', async ({ page }) => {
        // The counter-guard: without it, "the header is #bababa" would also
        // pass if the fix had hardcoded the colour and stopped reading the
        // setting at all.
        await loadSeriesPage(page, { sa_ui_thead_th_bg: '#112233' });

        expect(await headerBg(page, PLAIN_TH)).toBe('rgb(17, 34, 51)');
    });
});
