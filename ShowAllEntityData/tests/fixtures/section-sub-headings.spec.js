'use strict';

// Sub-headings inside the non-data h2 sections above the Tracklist: the
// Credits section's native "Release" / "Release group" <h3>s, and the
// Annotation's wiki "== … ==" headings.
//
// MusicBrainz renders a wiki "== … ==" heading as an <h2> nested inside
// div.annotation-body. Left as an h2, makeH2sCollapsible() treats it as a page-
// level section (h2 colour, page-wide Ctrl+Click, collapsed by default), and
// _sphSectionBodies() refuses to pin a body that contains an h2, so the whole
// Annotation text scrolled away sideways. _makeAnnotationH3sCollapsible() now
// demotes those headings to <h3> bars that look and behave like the Credits
// ones, and Ctrl+Click on any such bar toggles every bar of ITS section only.
//
// Fixture: the "Live in Barcelona"-shaped release with an annotation that
// carries "== Barcode and Other Identifiers ==" and a bottom Credits section
// with Release and Release group bars.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const RELEASE_URL = 'https://musicbrainz.org/release/6d19588c-0305-4fb0-b687-d4b75a75c3fd';
const FIXTURE_FILE = path.join(__dirname, 'release-tracks-multirow-instruments.html');
const ANN_H3 = 'div.annotation-body h3.mb-annotation-toggle-h3';
const CREDITS_H3 = '#bottom-credits h3.mb-credits-toggle-h3';

/**
 * Whether each sub-heading bar matching `sel` is currently expanded (▼).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @returns {Promise<boolean[]>}
 */
const expandedStates = (page, sel) => page.$$eval(sel, (hs) => hs.map((h) => {
    const icon = h.querySelector(':scope > .mb-toggle-icon');
    return !!icon && icon.textContent === '▼';
}));

/**
 * Whether the element is rendered (has client rects).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @returns {Promise<boolean>}
 */
const isShown = (page, sel) => page.$eval(sel, (el) => el.getClientRects().length > 0);

test.describe('section sub-headings (Credits / Annotation h3 bars)', () => {
    test.beforeEach(async ({ page }) => {
        await loadUserscriptPage(page, {
            url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true,
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        // On a live page autoExpandNativeAnnotation() clicks MB's own
        // "Show more..." toggle, whose React handler drops this class. The
        // fixture carries MB's CSS but not its JS, so the annotation stays
        // height-clipped under a fade overlay (a pseudo-element of the body)
        // that sits over the bar and swallows real clicks. Do what the
        // native toggle does.
        await page.$$eval('div.annotation-body.annotation-collapsed',
            (els) => els.forEach((el) => el.classList.remove('annotation-collapsed')));
        // Both sections start collapsed; open them through their own bars.
        await page.locator('h2.annotation').click();
        await page.locator('#bottom-credits > h2').click();
    });

    test('the Annotation wiki heading becomes an h3 bar styled and indented like the Credits bars', async ({ page }) => {
        const probe = await page.evaluate(([annSel, credSel]) => {
            const left = (el) => el.getBoundingClientRect().left;
            const body = document.querySelector('div.annotation-body');
            const annH2 = document.querySelector('h2.annotation');
            const annH3 = document.querySelector(annSel);
            const credH2 = document.querySelector('#bottom-credits > h2');
            const credH3 = document.querySelector(credSel);
            return {
                nestedH2s: body ? body.querySelectorAll('h2').length : -1,
                annText: annH3 ? annH3.textContent.replace(/[▲▼]/g, '').trim() : null,
                annIsToggleH2: annH3 ? annH3.classList.contains('mb-toggle-h2') : null,
                annBg: annH3 ? getComputedStyle(annH3).backgroundColor : null,
                credBg: credH3 ? getComputedStyle(credH3).backgroundColor : null,
                annOffset: annH3 ? left(annH3) - left(annH2) : null,
                credOffset: credH3 ? left(credH3) - left(credH2) : null,
            };
        }, [ANN_H3, CREDITS_H3]);

        expect(probe.nestedH2s, 'no h2 is left inside the annotation body').toBe(0);
        expect(probe.annText).toBe('Barcode and Other Identifiers');
        expect(probe.annIsToggleH2, 'not wired as a page-level h2 section').toBe(false);
        expect(probe.credOffset, 'premise: the Credits bar is indented').toBeGreaterThan(0);
        expect(probe.annBg, 'same background as the Credits "Release" bar').toBe(probe.credBg);
        expect(Math.abs(probe.annOffset - probe.credOffset),
            'indented under its h2 by the same amount as the Credits bar').toBeLessThanOrEqual(1);
    });

    test('the content under an Annotation bar starts at the bar\'s left edge; text before the first bar does not move', async ({ page }) => {
        const probe = await page.evaluate((annSel) => {
            const left = (el) => el.getBoundingClientRect().left;
            const h2 = document.querySelector('h2.annotation');
            const bar = document.querySelector(annSel);
            const first = document.querySelector('div.annotation-body > p:first-child');
            const under = bar ? bar.nextElementSibling : null;
            return {
                bar: bar ? left(bar) - left(h2) : null,
                first: first ? left(first) - left(h2) : null,
                under: under ? left(under) - left(h2) : null,
                underTag: under ? under.tagName : null,
            };
        }, ANN_H3);
        expect(probe.underTag, 'premise: a paragraph follows the bar').toBe('P');
        expect(probe.bar, 'premise: the bar is indented').toBeGreaterThan(0);
        expect(Math.abs(probe.first), 'text before the first bar stays flush with the h2')
            .toBeLessThanOrEqual(1);
        expect(Math.abs(probe.under - probe.bar), 'its content is aligned with the bar')
            .toBeLessThanOrEqual(1);
    });

    test('clicking the Annotation bar collapses only the content under it', async ({ page }) => {
        const before = 'div.annotation-body > p:first-child';
        const after = `${ANN_H3} + p`;
        expect(await expandedStates(page, ANN_H3), 'starts expanded').toEqual([true]);
        expect(await isShown(page, before)).toBe(true);
        expect(await isShown(page, after)).toBe(true);

        await page.locator(ANN_H3).click();
        expect(await expandedStates(page, ANN_H3)).toEqual([false]);
        expect(await isShown(page, after), 'its own paragraph is hidden').toBe(false);
        expect(await isShown(page, before), 'text before the heading stays').toBe(true);
        expect(await isShown(page, ANN_H3), 'the bar itself stays').toBe(true);

        await page.locator(ANN_H3).click();
        expect(await expandedStates(page, ANN_H3)).toEqual([true]);
        expect(await isShown(page, after)).toBe(true);
    });

    test('Ctrl+Click toggles every sub-heading of its own section, and no other section', async ({ page }) => {
        expect(await expandedStates(page, CREDITS_H3), 'premise: Release + Release group, expanded')
            .toEqual([true, true]);
        expect(await expandedStates(page, ANN_H3)).toEqual([true]);

        await page.locator(CREDITS_H3).first().click({ modifiers: ['Control'] });
        expect(await expandedStates(page, CREDITS_H3), 'Ctrl+Click collapses both Credits bars')
            .toEqual([false, false]);
        expect(await isShown(page, '#release-group-relationships > table.details'),
            'the peer\'s content is hidden too').toBe(false);
        expect(await expandedStates(page, ANN_H3), 'the Annotation bar is not a peer').toEqual([true]);

        await page.locator(CREDITS_H3).first().click({ modifiers: ['Control'] });
        expect(await expandedStates(page, CREDITS_H3), 'Ctrl+Click expands both again')
            .toEqual([true, true]);

        await page.locator(ANN_H3).click({ modifiers: ['Control'] });
        expect(await expandedStates(page, ANN_H3)).toEqual([false]);
        expect(await expandedStates(page, CREDITS_H3), 'the Credits bars are not peers of it')
            .toEqual([true, true]);

        // A plain click still toggles one bar only.
        await page.locator(CREDITS_H3).first().click();
        expect(await expandedStates(page, CREDITS_H3)).toEqual([false, true]);
    });
});

test.describe('native Annotation "Show less..." toggle', () => {
    /**
     * Loads the fixture, optionally expands the annotation the way MB's own
     * toggle does (the fixture has MB's CSS but not its JS), and renders.
     *
     * @param {import('@playwright/test').Page} page
     * @param {boolean} expand - drop `.annotation-collapsed` before the render
     * @returns {Promise<void>}
     */
    async function render(page, expand) {
        await loadUserscriptPage(page, {
            url: RELEASE_URL, fixtureFile: FIXTURE_FILE, testMode: true,
        });
        if (expand) {
            await page.$$eval('div.annotation-body.annotation-collapsed',
                (els) => els.forEach((el) => el.classList.remove('annotation-collapsed')));
        }
        expect(await page.locator('div.annotation a.annotation-toggle').count(),
            'premise: the native toggle is there before the render').toBe(1);
        await page.click('button[data-label="Show all Tracks for Release"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
    }

    test('is removed once the annotation is expanded', async ({ page }) => {
        await render(page, true);
        expect(await page.locator('div.annotation a.annotation-toggle').count()).toBe(0);
        expect(await page.locator('div.annotation > p').count(),
            'its wrapping paragraph goes with it').toBe(0);
        expect(await page.locator('div.annotation-details').count(),
            'the "last modified" line stays').toBe(1);
    });

    test('is kept while the annotation is still collapsed (it is the only way to open it)', async ({ page }) => {
        await render(page, false);
        expect(await page.locator('div.annotation a.annotation-toggle').count()).toBe(1);
    });
});
