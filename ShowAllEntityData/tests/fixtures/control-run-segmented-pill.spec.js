'use strict';

// The h2/h3 artwork and Relationships control runs are drawn as segmented
// pills (org/503-handling.org, "Retry UI: one segmented control per table").
//
// ── What this pins, and what it deliberately does not ───────────────────────
//
// The change is pure CSS over ids that already existed, so there is nothing
// behavioural to assert. What CAN go wrong is all in the cascade and in the
// run-relative selectors:
//
//  1. THE CAPS ARE AT THE ENDS OF THE RUN. First segment rounded on the left,
//     last on the right, everything between square. Asserted as a PATTERN over
//     however many buttons the page happens to build, not against a fixed
//     list — the run's membership varies with settings and with how much
//     artwork failed.
//  2. ONE HAIRLINE BETWEEN SEGMENTS. Side borders start at 0 and are re-grown,
//     so a middle segment must have border-left 1px and border-right 0. Leaving
//     the inline shorthand's right border in place would pair it with the next
//     segment's left border and draw every divider twice.
//  3. CAA AND RELATIONSHIPS ARE SEPARATE PILLS. This is the design decision
//     that a single shared selector would silently undo: the last CAA segment
//     keeps its right cap and the first Rel segment its left cap, even though
//     they are adjacent siblings. A regression here looks *tidier*, which is
//     why it needs an explicit test.
//  4. THE RULES BEAT THE INLINE STYLES. Every one of these buttons sets
//     border-radius and margin-left inline, so a rule without !important is
//     simply ignored. Asserting a computed radius of 0 on a middle segment is
//     what catches that — the inline value is 3px.
//
// Single-table by necessity: the per-table runs live in an h3 that a disk
// fixture renders, but the BoDeans fixture is tableMode 'single', so its one
// run sits in the h2. The geometry under test is identical.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { collectPageErrors } = require('../support/liveAssertions');

const FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');
const PAGE_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';

const CAA = 'mb-caa-toggle-btn-';
const REL = 'mb-rel-retry-';

/**
 * Every element whose id starts with `prefix`, in document order, with the
 * computed values the pill is made of.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} prefix
 * @returns {Promise<Array<object>>}
 */
const runOf = (page, prefix) => page.evaluate((p) => Array.from(
    document.querySelectorAll(`[id^="${p}"]`)).map((el) => {
        const cs = getComputedStyle(el);
        return {
            id: el.id,
            tl: cs.borderTopLeftRadius,
            bl: cs.borderBottomLeftRadius,
            tr: cs.borderTopRightRadius,
            br: cs.borderBottomRightRadius,
            bl_w: cs.borderLeftWidth,
            br_w: cs.borderRightWidth,
            // Is the NEXT element sibling in the same run?
            nextSameRun: !!(el.nextElementSibling
                && el.nextElementSibling.id
                && el.nextElementSibling.id.startsWith(p)),
        };
    }), prefix);

test.describe('h2/h3 control runs render as segmented pills', () => {
    let pageErrors;

    test.beforeEach(async ({ page }) => {
        pageErrors = collectPageErrors(page);
        await page.route('https://coverartarchive.org/**',
            (route) => route.fulfill({ status: 404, body: '' }));
        await page.route('**/ws/2/**',
            (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: 'x' }));
        await loadFromDiskFixture(page, {
            url: PAGE_URL,
            fixturePath: FIXTURE,
            testMode: true,
            settingsOverride: {
                sa_enable_caa_pics: true,
                sa_enable_relationships_column: true,
                sa_rel_collapse_threshold: 0,
            },
        });
        // The controls are built on a timer after the render.
        await expect.poll(() => page.locator(`[id^="${CAA}"]`).count(),
            { timeout: 30000 }).toBeGreaterThan(1);
    });

    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('the caps sit at the ends of the run, and nowhere else', async ({ page }) => {
        const run = await runOf(page, CAA);
        expect(run.length, 'the fixture builds a multi-segment run').toBeGreaterThan(1);

        run.forEach((seg, i) => {
            const first = i === 0;
            const last = i === run.length - 1;
            const where = `${seg.id} (${i + 1} of ${run.length})`;
            // A middle segment computing 3px would mean the inline style won,
            // i.e. the rule is missing its !important.
            expect(seg.tl, `${where}: left cap only when first`).toBe(first ? '3px' : '0px');
            expect(seg.bl, `${where}: left cap only when first`).toBe(first ? '3px' : '0px');
            expect(seg.tr, `${where}: right cap only when last`).toBe(last ? '3px' : '0px');
            expect(seg.br, `${where}: right cap only when last`).toBe(last ? '3px' : '0px');
        });
    });

    test('exactly one hairline falls between two segments', async ({ page }) => {
        const run = await runOf(page, CAA);
        expect(run.length).toBeGreaterThan(1);

        run.forEach((seg, i) => {
            const last = i === run.length - 1;
            const where = `${seg.id} (${i + 1} of ${run.length})`;
            // Every segment carries its own left border — that IS the divider
            // for everything after the first, and the pill's left edge for the
            // first. The right border exists only at the very end, so no two
            // borders ever abut.
            expect(seg.bl_w, `${where}: left border always present`).toBe('1px');
            expect(seg.br_w, `${where}: right border only at the run's end`)
                .toBe(last ? '1px' : '0px');
        });
    });

    test('every segment in a run is the same height', async ({ page }) => {
        // Reported from a real page: the 📊 summary button stood taller than
        // its neighbours and broke the pill's straight edge. The shared-height
        // rule enumerated `-retry-` and `-global-retry` by name, so `-summary-`
        // was simply never in it — and its emoji is taller than the other
        // glyphs, so with no height to sit in it grew.
        //
        // Asserted across the WHOLE run rather than on the summary button
        // alone: the defect was a missing selector, and the next control added
        // would have hit it the same way. Heights are compared as rendered
        // pixels, which is the thing that was actually wrong.
        const heights = await page.evaluate((p) => Array.from(
            document.querySelectorAll(`[id^="${p}"]`),
            (el) => ({ id: el.id, h: Math.round(el.getBoundingClientRect().height) })),
        CAA);

        expect(heights.length, 'the fixture builds a multi-segment run')
            .toBeGreaterThan(1);
        const distinct = [...new Set(heights.map((x) => x.h))];
        expect(distinct,
            `every segment shares one height — got ${JSON.stringify(heights)}`)
            .toHaveLength(1);
        // And it is the height the rule declares, so a run that agreed on some
        // OTHER value would still fail.
        expect(distinct[0], 'and it is the declared 22px').toBe(22);
    });

    test('CAA and Relationships are two pills, not one', async ({ page }) => {
        const caa = await runOf(page, CAA);
        const rel = await runOf(page, REL);
        expect(caa.length, 'CAA run present').toBeGreaterThan(0);
        expect(rel.length, 'Relationships run present').toBeGreaterThan(0);

        const lastCaa = caa[caa.length - 1];
        const firstRel = rel[0];

        // THE assertion. A single shared selector across both prefixes would
        // merge them into one pill — which looks tidier and is wrong, because
        // they are two different sources. Note this holds even though the two
        // are adjacent siblings, which is what makes it a real test rather
        // than a restatement of the DOM.
        expect(lastCaa.tr, 'the CAA run keeps its right cap').toBe('3px');
        expect(lastCaa.br_w, 'the CAA run keeps its right border').toBe('1px');
        expect(firstRel.tl, 'the Relationships run opens its own left cap').toBe('3px');
        expect(firstRel.bl_w, 'the Relationships run opens its own left border').toBe('1px');

        // And they really are neighbours, so the above is not vacuous.
        const adjacent = await page.evaluate(([c, r]) => {
            const caaEls = Array.from(document.querySelectorAll(`[id^="${c}"]`));
            const last = caaEls[caaEls.length - 1];
            return !!(last && last.nextElementSibling
                && last.nextElementSibling.id.startsWith(r));
        }, [CAA, REL]);
        expect(adjacent, 'the two runs are adjacent siblings in the same header').toBe(true);
    });

    test('a single-segment run is a plain rounded button, capped both sides',
        async ({ page }) => {
            const rel = await runOf(page, REL);
            // The Relationships run on this page is one button. Both the
            // first-in-run and last-in-run rules must apply to it at once —
            // a :first-of-type/:last-of-type formulation would get this right
            // by accident and the multi-segment cases wrong.
            if (rel.length !== 1) test.skip(true, `run has ${rel.length} segments here`);
            expect(rel[0].tl).toBe('3px');
            expect(rel[0].tr).toBe('3px');
            expect(rel[0].bl_w).toBe('1px');
            expect(rel[0].br_w).toBe('1px');
        });
});
