'use strict';

/**
 * `_stripTransientCellState()` — one bucketed pass must do exactly what twelve
 * subtree walks did (PERFORMANCE.org Step 34).
 *
 * ── Why this spec is shaped as properties, not as a golden blob ──────────────
 *
 * Step 34 is a refactor with NO intended behaviour change, so CLAUDE.md's
 * "fails before the fix, passes after" does not apply as written — there is no
 * bug to reproduce. The equivalent guarantee is an equivalence pin, and the
 * honest way to build one is to make it pass on `main` FIRST and then keep
 * passing after the restructure. That is what every assertion below is for, and
 * it is why they name individual properties rather than diffing one serialised
 * cell: a golden blob would also fail on a harmless attribute-order difference,
 * and when it failed it would not say which of the twelve families broke.
 *
 * Each `test()` pins one guarantee, and several pin an ORDERING rather than an
 * outcome — the four places where a union `querySelectorAll()`'s document order
 * is not the step order the original depended on. Those are the ones a plausible
 * restructuring bug would actually trip:
 *
 *   - `_hadInlineArtPh` read BEFORE the placeholders are removed
 *   - the count badge rescued BEFORE its wrapper is removed
 *   - the art-cell toggle removal BEFORE the generic toggle collapse
 *   - an element in TWO families getting BOTH treatments
 *
 * `#kitchen-sink` carries every family at once so a single call exercises all
 * of them together, which is how the ordering gets tested at all; the smaller
 * cells isolate the conditional and overlapping cases. All of them are driven
 * through the real function via `__saTest.stripTransientCellState()` — driving
 * the real thing rather than re-deriving its rules is what makes this a
 * regression test instead of a restatement.
 */

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');

// Host page shape only — see the fixture's own comment. The cells under test
// are hidden and driven directly through __saTest.
const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'strip-transient-cell-equivalence.html');

/**
 * Runs the real strip over one cell and reports the whole resulting shape in
 * one round trip.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - the cell to strip.
 * @param {?Object} [opts]  - forwarded to `_stripTransientCellState()`.
 * @returns {Promise<Object>} a JSON-serialisable description of the cell after.
 */
function stripAndDescribe(page, selector, opts) {
    return page.evaluate(([sel, o]) => {
        window.__saTest.stripTransientCellState(sel, o);
        const cell = document.querySelector(sel);
        const id = (x) => (x ? document.getElementById(x) : null);
        const present = (x) => !!id(x);
        const styleOf = (x) => {
            const el = id(x);
            return el ? { backgroundImage: el.style.backgroundImage, display: el.style.display } : null;
        };
        return {
            // Cell-level dataset markers
            cellDataset: {
                caaMultiBuilt: cell.dataset.caaMultiBuilt ?? null,
                eaaMultiBuilt: cell.dataset.eaaMultiBuilt ?? null,
                caaInlineDone: cell.dataset.caaInlineDone ?? null,
                eaaInlineDone: cell.dataset.eaaInlineDone ?? null,
                ergInjected: cell.dataset.ergInjected ?? null,
            },
            enrichedDataset: (() => {
                const a = id('ks-enriched');
                return a ? { caa: a.dataset.caaEnriched ?? null, eaa: a.dataset.eaaEnriched ?? null } : null;
            })(),
            artLiDisplay: [styleOf('ks-art-li'), styleOf('ks-art-li-2')].map((s) => s && s.display),
            expandBtn: (() => {
                const b = id('ks-expand-btn');
                return b ? { state: b.dataset.caaExpandBtn, glyph: b.textContent, title: b.title } : null;
            })(),
            artTogglePresent: present('ks-art-toggle'),
            listTogglePresent: present('list-toggle'),
            listToggle: (() => {
                const t = id('list-toggle');
                if (!t) return null;
                return {
                    ariaExpanded: t.getAttribute('aria-expanded'),
                    glyph: t.querySelector('.mb-cell-collapse-glyph')?.textContent ?? null,
                    title: t.title,
                    ariaLabel: t.getAttribute('aria-label'),
                };
            })(),
            iconBackgrounds: [styleOf('ks-icon'), styleOf('ks-eaa-icon')].map((s) => s && s.backgroundImage),
            inlinePhCount: cell.querySelectorAll('.mb-caa-inline-ph, .mb-eaa-inline-ph').length,
            // The sort key must SURVIVE — removing it makes getCleanColumnText()
            // see no synthetic value and match nothing, hiding every row.
            sortKeyPresent: present('ks-sort-key'),
            badgePresent: present('ks-badge'),
            badgeParentIsCell: id('ks-badge') ? id('ks-badge').parentElement === cell : null,
            hintWrapPresent: present('ks-hint-wrap'),
            hintColPresent: present('ks-hint-col'),
            hintBigPresent: present('ks-hint-big'),
            hintInlinePresent: present('ks-hint-inline'),
            ergBtnGlyph: id('ks-erg-btn') ? id('ks-erg-btn').textContent : null,
            nestedErgInjected: id('ks-nested-erg-injected')
                ? (id('ks-nested-erg-injected').dataset.ergInjected ?? null) : null,
            ghostTablePresent: present('ks-ghost-table'),
            // Double membership, and the two jesus2099 dispositions
            dmArtLiDisplay: styleOf('dm-art-li') && styleOf('dm-art-li').display,
            dmArtLiErgInjected: id('dm-art-li') ? (id('dm-art-li').dataset.ergInjected ?? null) : null,
            jesusOnlyAnchorPresent: present('jesus-only-anchor'),
            jesusDuplicateAnchorPresent: present('jesus-duplicate-anchor'),
        };
    }, [selector, opts]);
}

test.describe('_stripTransientCellState(): one pass, twelve families', () => {
    test('every marker family in one cell is cleaned, and the sort key is not', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#kitchen-sink');

        // Cell-level dataset markers, including the ERG one.
        expect(after.cellDataset).toEqual({
            caaMultiBuilt: null, eaaMultiBuilt: null,
            caaInlineDone: null, eaaInlineDone: null, ergInjected: null,
        });
        // CAA/EAA enrichment markers, on a descendant <a>.
        expect(after.enrichedDataset).toEqual({ caa: null, eaa: null });
        // Art <li> items collapsed.
        expect(after.artLiDisplay).toEqual(['none', 'none']);
        // Artwork icon backgrounds blanked (no preserveLiveArt, and these are
        // plain http URLs, so both go regardless).
        expect(after.iconBackgrounds).toEqual(['', '']);
        // Inline placeholders removed — both the CAA and the EAA one.
        expect(after.inlinePhCount).toBe(0);
        // Cache-hint overlays removed, all three families.
        expect(after.hintWrapPresent).toBe(false);
        expect(after.hintColPresent).toBe(false);
        expect(after.hintBigPresent).toBe(false);
        expect(after.hintInlinePresent).toBe(false);
        // ERG: glyph reset ▼ → ▶, ghost table gone, nested marker cleared.
        expect(after.ergBtnGlyph).toBe('▶');
        expect(after.ghostTablePresent).toBe(false);
        expect(after.nestedErgInjected).toBeNull();

        // The one thing that must SURVIVE. It is deliberately absent from the
        // union selector for exactly this reason.
        expect(after.sortKeyPresent).toBe(true);
    });

    test('the count badge is rescued from the wrapper before the wrapper is removed', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#kitchen-sink');

        // An ordering, not an outcome: the badge lives INSIDE
        // .mb-art-cache-hint-col-wrap (_artEnrichIcon's "Resource Timing
        // wrapper adoption" puts it there), so removing the wrap first takes
        // the badge with it. It has to be lifted out as the wrap's own sibling
        // beforehand — which is why it ends up a direct child of the cell.
        expect(after.hintWrapPresent).toBe(false);
        expect(after.badgePresent).toBe(true);
        expect(after.badgeParentIsCell).toBe(true);
    });

    test('an art cell keeps its expand button, reset to collapsed, and loses its stale collapse toggle', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#kitchen-sink');

        expect(after.expandBtn.state).toBe('collapsed');
        expect(after.expandBtn.glyph).toBe('▶');
        // The title is re-derived from the sibling ul, so it carries the image
        // count (2 art <li>, ignoring the summary li) and the CAA label.
        expect(after.expandBtn.title).toContain('(2)');

        // The art-cell .mb-cell-collapse-toggle is REMOVED, not collapsed —
        // and this is the ordering that would break if the removal ran after
        // the generic collapse sweep instead of before it.
        expect(after.artTogglePresent).toBe(false);
    });

    test('a non-art list cell keeps its collapse toggle and is collapsed, never removed', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#list-cell');

        // The counterpart to the assertion above: only a toggle whose host
        // cell has an art <ul> is removed. Everything else is collapsed in
        // place, which is what keeps collapsable columns working across a
        // re-render.
        expect(after.listTogglePresent).toBe(true);
        expect(after.listToggle.ariaExpanded).toBe('false');
        expect(after.listToggle.glyph).toBe('▶');
        expect(after.listToggle.title).toContain('(3)');
        expect(after.listToggle.ariaLabel).toContain('3');
    });

    test('an element in two marker families gets BOTH treatments', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#double-membership');

        // Reachable, not theoretical: initExpandRGsFeature() stamps
        // data-erg-injected on a link's parent BEFORE it skips /cover-art
        // hrefs, so an li.mb-caa-art-li-image inside an art cell carries both
        // markers. The twelve loops this replaces each ran over every element
        // matching their OWN selector, so such an element was visited twice —
        // an `else if` dispatch chain would silently give it only the first
        // treatment, and nothing else in the suite would notice.
        expect(after.dmArtLiDisplay).toBe('none');
        expect(after.dmArtLiErgInjected).toBeNull();
    });

    test("jesus2099's icon survives when it is the cell's only artwork", async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#jesus-only');

        // WIP.91. On a pageType with no 'jesus2099' columnEraser configured,
        // the caa extractor's Path A moves this anchor into the synthetic CAA
        // column where it is the ONLY art content — an unconditional strip
        // destroyed it outright. The gate is "did this cell also carry our own
        // inline placeholder", read BEFORE those placeholders are removed.
        expect(after.jesusOnlyAnchorPresent).toBe(true);
    });

    test("jesus2099's icon is removed when it duplicates our own inline thumbnail", async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#jesus-duplicate');

        // The other half of the same gate, and the ordering it depends on: the
        // placeholder that makes this a duplicate is removed by this very
        // function, so "was one here" must be captured first. Read it after the
        // removal instead and this anchor survives — the shipped bug WIP.91
        // fixed, from the opposite direction.
        expect(after.jesusDuplicateAnchorPresent).toBe(false);
    });

    test('a text-only cell still has its cell-level markers cleared', async ({ page }) => {
        await loadUserscriptPage(page, { url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true });
        const after = await stripAndDescribe(page, '#text-only');

        // Most cells on most pages are text only, and skipping the subtree walk
        // for them is part of Step 34. The dataset markers live on the cell
        // itself, so they must be cleared before any such early-out.
        expect(after.cellDataset.caaMultiBuilt).toBeNull();
        expect(after.cellDataset.ergInjected).toBeNull();
    });
});
