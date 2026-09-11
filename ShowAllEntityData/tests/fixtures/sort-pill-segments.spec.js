'use strict';

// The ⇅ ▲ ▼ sort glyphs are drawn as ONE segmented pill: three sibling
// `span.sort-icon-btn` elements sharing a background and outer border, with a
// hairline rule between each pair, and rounded caps on the run's two ends only.
//
// ── Why this spec exists at all ──────────────────────────────────────────────
//
// Nothing pinned any of it. The pill is built entirely from CSS with ZERO DOM
// change (deliberately — see the CSS block's own comment for the Playwright
// `hasText` trap a wrapper element would spring), so there is no markup for an
// existing spec to have noticed, and the 19 specs that click these glyphs would
// all stay green if the pill fell apart completely.
//
// ── The assertion that actually matters ─────────────────────────────────────
//
// The run's two ends are found with run-relative selectors —
// `:not(.sort-icon-btn + .sort-icon-btn)` and `:not(:has(+ .sort-icon-btn))` —
// rather than the obvious `:first-of-type` / `:last-of-type`. Those count
// elements of the same TAG, and the sort icons are neither the first nor the
// last `<span>` in `.mb-col-hdr-flex`: a `.mb-ms-col-hdr-btn`,
// `.mb-caa-col-hdr-btn`, `.mb-rel-col-hdr-btn` or a `.worklink` glyph can
// precede them, and `.mb-col-uniq-wrap` always follows.
//
// The two naive selectors fail DIFFERENTLY, and the split is worth stating
// because it decides which test is load-bearing for which rule. Both halves
// were mutated separately rather than reasoned about:
//
//   `:first-of-type`  breaks only on a PREFIXED column, because on a plain one
//                     the ⇅ really is the first <span>. → fails test 3 ONLY.
//   `:last-of-type`   breaks on EVERY column, because `.mb-col-uniq-wrap`
//                     always follows the trio, so ▼ is never the last <span>
//                     anywhere. → fails tests 1 and 3.
//
// So test 3 — the Length column, prefixed by `.mb-ms-col-hdr-btn` — is the sole
// guard on the first-in-run selector, and is the reason it exists. An earlier
// draft of this comment claimed it was the only test either mutation broke;
// that was wrong, and the decomposition above is what replaced the guess.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// "Born to Run" — a release tracklist, chosen because its header row contains
// every complication at once: a Length column prefixed by `.mb-ms-col-hdr-btn`,
// plain columns with no prefix, and a `.mb-col-uniq-wrap` after every trio.
const RELEASE_URL = 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-ms-length.html');

const RADIUS = '3px';
const NO_RADIUS = '0px';

/**
 * The three sort segments of one column header, with the computed values this
 * spec asserts on.
 *
 * Read in a single `evaluate` rather than through per-property `toHaveCSS`
 * calls: the three segments have to be compared against EACH OTHER (same
 * background, same top/bottom border, differing side borders and radii), and
 * pulling them one at a time would let the page re-render between reads.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} colName  `data-col-name` of the header to inspect.
 * @returns {Promise<Array<Object>>} one entry per segment, in document order.
 */
const segments = (page, colName) => page.evaluate((name) => {
    const th = document.querySelector(`table.tbl thead th[data-col-name="${name}"]`);
    if (!th) throw new Error(`no <th> for column "${name}"`);
    return Array.from(th.querySelectorAll('.sort-icon-btn')).map((el) => {
        const cs = getComputedStyle(el);
        return {
            glyph:        el.textContent.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, ''),
            background:   cs.backgroundColor,
            color:        cs.color,
            borderLeft:   cs.borderLeftWidth,
            borderRight:  cs.borderRightWidth,
            borderTop:    cs.borderTopWidth,
            borderBottom: cs.borderBottomWidth,
            radiusTL:     cs.borderTopLeftRadius,
            radiusBL:     cs.borderBottomLeftRadius,
            radiusTR:     cs.borderTopRightRadius,
            radiusBR:     cs.borderBottomRightRadius,
            // Non-zero width is what makes it clickable; ~19 other specs
            // depend on it and Playwright clicks element centres.
            width:        el.getBoundingClientRect().width,
        };
    });
}, colName);

test.describe('sort glyphs render as one segmented pill', () => {
    test.beforeEach(async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL,
            fixtureFile: FIXTURE_FILE,
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await page.waitForSelector('#mb-filter-container');
    });

    test('a plain column: one shared ground, hairline dividers, caps on the ends only',
        async ({ page }) => {
            const seg = await segments(page, 'Title');
            expect(seg).toHaveLength(3);
            expect(seg.map((s) => s.glyph)).toEqual(['⇅', '▲', '▼']);

            // One pill: same ground and the same top/bottom edge across all three.
            const grounds = new Set(seg.map((s) => s.background));
            expect(grounds.size, 'all three segments share one background').toBe(1);
            seg.forEach((s, i) => {
                expect(s.borderTop, `segment ${i} top border`).toBe('1px');
                expect(s.borderBottom, `segment ${i} bottom border`).toBe('1px');
                expect(s.width, `segment ${i} must stay clickable`).toBeGreaterThan(0);
            });

            // Dividers: every segment carries a left border, so the rule between
            // two segments is one shared hairline and the run has an outer edge.
            seg.forEach((s, i) => expect(s.borderLeft, `segment ${i} left`).toBe('1px'));
            // Only the last closes the run on the right.
            expect(seg[0].borderRight).toBe('0px');
            expect(seg[1].borderRight).toBe('0px');
            expect(seg[2].borderRight).toBe('1px');

            // Caps on the ends only — a radius mid-run would show as a notch in
            // the middle of the pill, and would round the active segment's
            // yellow fill.
            expect([seg[0].radiusTL, seg[0].radiusBL]).toEqual([RADIUS, RADIUS]);
            expect([seg[0].radiusTR, seg[0].radiusBR]).toEqual([NO_RADIUS, NO_RADIUS]);
            expect([seg[1].radiusTL, seg[1].radiusTR]).toEqual([NO_RADIUS, NO_RADIUS]);
            expect([seg[2].radiusTR, seg[2].radiusBR]).toEqual([RADIUS, RADIUS]);
            expect([seg[2].radiusTL, seg[2].radiusBL]).toEqual([NO_RADIUS, NO_RADIUS]);
        });

    test('the active direction fills its whole segment with the existing yellow',
        async ({ page }) => {
            const th = page.locator('table.tbl thead th[data-col-name="Title"]');
            await th.locator('.sort-icon-btn', { hasText: '▲' }).first().click();
            await page.waitForTimeout(400);

            const seg = await segments(page, 'Title');
            const asc = seg.find((s) => s.glyph === '▲');

            // Unchanged signal, unchanged colours — the only difference from
            // before the restyle is that it now fills the segment rather than
            // sitting as a ragged background behind the glyph text.
            expect(asc.background).toBe('rgb(255, 255, 0)');
            expect(asc.color).toBe('rgb(0, 128, 0)');

            // The other two keep the pill's own ground, so "which direction" is
            // still readable at a glance.
            seg.filter((s) => s.glyph !== '▲')
                .forEach((s) => expect(s.background).not.toBe('rgb(255, 255, 0)'));

            // And the fill is square-edged mid-run, which is the whole reason
            // the per-segment radius had to move to the run's ends.
            expect([asc.radiusTL, asc.radiusTR]).toEqual([NO_RADIUS, NO_RADIUS]);
        });

    test('a column PREFIXED by another header control still caps its first segment',
        async ({ page }) => {
            // THE DISCRIMINATING CASE. Length is preceded by
            // `.mb-ms-col-hdr-btn`, so its ⇅ is the SECOND <span> in the flex
            // row — `:first-of-type` would skip it and leave this pill with no
            // left cap and no left border, while every other column looked
            // perfect. Mutation-checked in isolation: replacing ONLY the
            // first-in-run selector with `:first-of-type` fails this test and
            // leaves the other two green, so this is the only thing standing
            // between that rule and a silent regression.
            const prefixed = await page.evaluate(() => {
                const th = document.querySelector('table.tbl thead th[data-col-name="Length"]');
                const flex = th && th.querySelector('.mb-col-hdr-flex');
                if (!flex) return null;
                const kids = Array.from(flex.children).map((el) => el.className.split(' ')[0]);
                return { kids, firstIsSortIcon: kids[0] === 'sort-icon-btn' };
            });
            expect(prefixed, 'Length header not found').not.toBeNull();
            // Guard the premise: if this ever stops being true the test below
            // silently stops discriminating anything.
            expect(prefixed.firstIsSortIcon,
                'premise: Length must be PREFIXED by another control, or this '
                + 'test no longer covers the :first-of-type case').toBe(false);
            expect(prefixed.kids[0]).toBe('mb-ms-col-hdr-btn');

            const seg = await segments(page, 'Length');
            expect(seg).toHaveLength(3);
            expect(seg[0].borderLeft, 'prefixed column: first segment still has its left edge')
                .toBe('1px');
            expect([seg[0].radiusTL, seg[0].radiusBL],
                'prefixed column: first segment still capped')
                .toEqual([RADIUS, RADIUS]);
            expect([seg[2].radiusTR, seg[2].radiusBR],
                'prefixed column: last segment still capped')
                .toEqual([RADIUS, RADIUS]);
            expect(seg[2].borderRight).toBe('1px');
        });
});
