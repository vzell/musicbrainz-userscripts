'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { waitForSortSettled } = require('../support/filterSortAssertions');

// An entity's "Found in N user collections" (/<entity>/<mbid>/collections)
// and "Subscribers" (/<entity>/<mbid>/subscribers) pages: h2 + intro <p> +
// <ul>, the list's last <li> a footer ("plus N other private collections",
// "Plus N other anonymous users"). Fixtures built by
// scripts/make-entity-list-fixtures.py from the debug/ snapshots
// (DEBUG-NOTES.md, 2026-10-22).

const MBID = '70248960-cb53-4ea4-943a-edb18f7d336f';
const fixture = (name) => path.join(__dirname, name);
const COLLECTIONS = fixture('entity-artist-collections.html');
const SUBSCRIBERS = fixture('entity-artist-subscribers.html');

/**
 * Loads a fixture at a URL and returns the labels of the page's action buttons.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixtureFile
 * @returns {Promise<string[]>}
 */
async function buttonLabels(page, url, fixtureFile) {
    await loadUserscriptPage(page, { url, fixtureFile, testMode: true });
    return page.locator('#mb-show-all-controls-container button[data-label]')
        .evaluateAll((bs) => bs.map((b) => b.dataset.label));
}

/**
 * Loads a fixture, clicks its button and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {string} fixtureFile
 * @param {string} label - the button's data-label
 */
async function render(page, url, fixtureFile, label) {
    await loadUserscriptPage(page, { url, fixtureFile, testMode: true });
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** Text of every rendered body row of the one table. */
const rowTexts = (page) => page.locator('table.tbl tbody tr')
    .evaluateAll((trs) => trs.map((tr) => tr.textContent.trim()));

/** Text of the paragraph matching a pattern, or null. */
const paragraph = (page, re) => page.evaluate((src) => {
    const p = Array.from(document.querySelectorAll('#content p')).find((x) => new RegExp(src).test(x.textContent));
    return p ? p.textContent.replace(/\s+/g, ' ').trim() : null;
}, re.source);

test.describe('entity collections pages', () => {
    test('artist-collections: Collection/Editor columns, the private-collections footer folded into the intro', async ({ page }) => {
        await render(page, `https://musicbrainz.org/artist/${MBID}/collections`, COLLECTIONS,
            'Show all Collections for Artist');

        const headers = await page.locator('table.tbl thead tr:first-child th')
            .evaluateAll((ths) => ths.map((th) => th.dataset.colName || th.textContent.trim()));
        expect(headers).toEqual(expect.arrayContaining(['Collection', 'Editor']));

        const rows = await rowTexts(page);
        expect(rows).toHaveLength(11);
        expect(rows.some((t) => /other private/i.test(t))).toBe(false);
        expect(await paragraph(page, /has been added to/)).toBe(
            'Bruce Springsteen has been added to 34 collections and 23 other private collections');
    });

    // Pins: the footer row stays out after a RE-RENDER, not only after the
    // first one. finalCleanup() used to remove it from the DOM alone, so a
    // sort re-rendered it from allRows. Same fixture, served as a release's
    // page, so the pre-existing release-collections pageType is what runs.
    test('release-collections: a sort does not bring the "plus N other private collections" row back', async ({ page }) => {
        await render(page, 'https://musicbrainz.org/release/52c6808b-037d-47d5-b0c7-17331c9d36cd/collections',
            COLLECTIONS, 'Show all Collections for Release');
        expect(await rowTexts(page)).toHaveLength(11);

        const th = page.locator('table.tbl thead tr:first-child th[data-col-name="Collection"]');
        await waitForSortSettled(page, () => th.locator('.sort-icon-btn', { hasText: '▲' }).first().click());

        const rows = await rowTexts(page);
        expect(rows.some((t) => /other private/i.test(t))).toBe(false);
        expect(rows).toHaveLength(11);
    });

    test('an entity in no collection gets no Collections button', async ({ page }) => {
        const labels = await buttonLabels(page,
            'https://musicbrainz.org/release/52c6808b-037d-47d5-b0c7-17331c9d36cd/collections',
            fixture('entity-release-collections-empty.html'));
        expect(labels).not.toContain('Show all Collections for Release');
    });

    // Pins the ORDER of pageDefinitions: each entity's collections page gets
    // its own pageType, not a broad matcher further up (includes('/label'),
    // includes('/series'), /work/<mbid>, includes('/recording'), …).
    for (const [kind, label] of [
        ['area', 'Area'], ['event', 'Event'], ['instrument', 'Instrument'], ['label', 'Label'],
        ['place', 'Place'], ['recording', 'Recording'], ['series', 'Series'], ['work', 'Work'],
        ['release-group', 'Release Group']
    ]) {
        test(`/${kind}/<mbid>/collections offers "Show all Collections for ${label}"`, async ({ page }) => {
            const labels = await buttonLabels(page, `https://musicbrainz.org/${kind}/${MBID}/collections`, COLLECTIONS);
            expect(labels).toEqual([`Show all Collections for ${label}`]);
        });
    }
});

test.describe('entity subscribers pages', () => {
    test('artist-subscribers: the anonymous-users footer folded into the intro', async ({ page }) => {
        await render(page, `https://musicbrainz.org/artist/${MBID}/subscribers`, SUBSCRIBERS,
            'Show all Subscribers for Artist');

        const rows = await rowTexts(page);
        expect(rows).toHaveLength(28);
        expect(rows.some((t) => /anonymous/i.test(t))).toBe(false);
        expect(await paragraph(page, /There are currently/)).toBe(
            'There are currently 28 real and 9 anonymous users subscribed to Bruce Springsteen:');
    });

    test('label-subscribers: no footer, the intro is left as it is', async ({ page }) => {
        await render(page, 'https://musicbrainz.org/label/45ffe1d8-92da-4750-9a4a-f42861f46e2c/subscribers',
            fixture('entity-label-subscribers.html'), 'Show all Subscribers for Label');

        expect(await rowTexts(page)).toEqual(['editor-1', 'editor-2']);
        expect(await paragraph(page, /There are currently/)).toBe(
            'There are currently 2 users subscribed to Legacy:');
    });

    for (const [kind, label] of [['series', 'Series'], ['collection', 'Collection']]) {
        test(`/${kind}/<mbid>/subscribers offers "Show all Subscribers for ${label}"`, async ({ page }) => {
            const labels = await buttonLabels(page, `https://musicbrainz.org/${kind}/${MBID}/subscribers`, SUBSCRIBERS);
            expect(labels).toEqual([`Show all Subscribers for ${label}`]);
        });
    }

    test('an editor\'s own subscribers page keeps its editor pageType', async ({ page }) => {
        const labels = await buttonLabels(page, 'https://musicbrainz.org/user/vzell/subscribers',
            fixture('subscribers-page-vzell.html'));
        expect(labels).toEqual(['Show all Editor Subscribers for User']);
    });
});
