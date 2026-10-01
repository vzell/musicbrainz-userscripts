'use strict';

// Regression for org/remove-showall.org TODO 2: a `shortLabel` field lets a
// button paint shorter text than `conf.label` without touching `conf.label`
// itself (so eb.dataset.label / the .includes('Show all') tooltip branch are
// unaffected — same "display-only" contract as the generic prefix strip in
// action-button-label-prefix-stripped.spec.js), a `buttonGroupLabel` on the
// pageDefinition paints a bold "<Label>:" ahead of the button row, and every
// button now carries a rich HTML hover tooltip (`data-mbtt`, shown via the
// shared #mb-stat-tooltip delegation) restoring the full descriptive text a
// shortLabel hides.
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadFromDiskFixture } = require('../support/diskFixture');

const SUBSCRIPTIONS_URL = 'https://musicbrainz.org/user/vzell/subscriptions/artist';
const SUBSCRIPTIONS_FIXTURE = path.join(__dirname, 'user-subscriptions-series-entity-info.html');

const ARTIST_RELEASES_URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const ARTIST_RELEASES_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releases-bodeans.json.gz');

const ARTIST_RGS_URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f';
const ARTIST_RGS_FIXTURE = path.join(__dirname, 'saved-data', 'artist-releasegroups.json.gz');

const ISWC_URL = 'https://musicbrainz.org/iswc/T-070.127.339-3';
const ISWC_FIXTURE = path.join(__dirname, 'iswc.html');

const SEARCH_URL = 'https://musicbrainz.org/search?query=roulette&type=recording&method=indexed';
const SEARCH_FIXTURE = path.join(__dirname, 'search-recordings-continuation.html');

/**
 * Reads the h1 action-button row: the optional bold group-label text (first
 * non-button child of the controls container) and each button's rendered
 * text / data-label / data-mbtt.
 *
 * @param {import('@playwright/test').Page} page
 */
const buttonRow = (page) => page.evaluate(() => {
    const container = document.getElementById('mb-show-all-controls-container');
    const groupLabelEl = container.querySelector('strong');
    const dividerEl = container.querySelector('.mb-button-group-label-divider');
    return {
        groupLabel: groupLabelEl ? groupLabelEl.textContent : null,
        groupLabelFontSize: groupLabelEl ? groupLabelEl.style.fontSize : null,
        groupDividerText: dividerEl ? dividerEl.textContent : null,
        groupDividerBeforeLabel: !!(dividerEl && dividerEl.nextElementSibling === groupLabelEl),
        buttons: Array.from(container.querySelectorAll('button[data-label]')).map((btn) => ({
            text: btn.textContent.trim(),
            dataLabel: btn.dataset.label,
            mbtt: btn.dataset.mbtt || null,
            title: btn.title,
        })),
    };
});

test.describe('action buttons: shortLabel, buttonGroupLabel and rich hover tooltip', () => {
    test('user-subscriptions: "Subscriptions:" heading, short per-button labels, dataset.label unchanged', async ({ page }) => {
        await loadUserscriptPage(page, { url: SUBSCRIPTIONS_URL, fixtureFile: SUBSCRIPTIONS_FIXTURE, testMode: true });

        const row = await buttonRow(page);
        expect(row.groupLabel).toBe('Subscriptions:');
        // A "|" ahead of the label, same divider style as the one before 📦 Data ▾,
        // and the label reads smaller than the native h1 text it follows.
        expect(row.groupDividerText).toBe(' | ');
        expect(row.groupDividerBeforeLabel).toBe(true);
        expect(row.groupLabelFontSize).toBe('0.65em');
        expect(row.buttons).toHaveLength(5);
        expect(row.buttons[0].text).toBe('🧮¹ Artist');
        expect(row.buttons[0].dataLabel).toBe('🧮 Artist subscriptions');
        expect(row.buttons[1].text).toBe('🧮² Collection');
        expect(row.buttons[4].text).toBe('🧮⁵ Editor');
    });

    // The first button is the artist's OWN releases, so its short label is
    // the singular "Artist" — "Artists" read as if it fetched several artists'
    // releases. "Various Artists" is a proper name and stays plural.
    test('artist-releases: "Releases:" heading, "Artist"/"Various Artists" short labels', async ({ page }) => {
        await loadFromDiskFixture(page, { url: ARTIST_RELEASES_URL, fixturePath: ARTIST_RELEASES_FIXTURE, testMode: true });

        const row = await buttonRow(page);
        expect(row.groupLabel).toBe('Releases:');
        expect(row.buttons).toHaveLength(2);
        expect(row.buttons[0].text).toBe('🧮¹ Artist');
        expect(row.buttons[0].dataLabel).toBe('🧮 Artist releases');
        expect(row.buttons[1].text).toBe('🧮² Various Artists');
        expect(row.buttons[1].dataLabel).toBe('🧮 VA releases');
    });

    test('artist-releasegroups: "RGs:" heading, "Artist"/"Various Artists" short labels', async ({ page }) => {
        await loadFromDiskFixture(page, { url: ARTIST_RGS_URL, fixturePath: ARTIST_RGS_FIXTURE, testMode: true });

        const row = await buttonRow(page);
        expect(row.groupLabel).toBe('RGs:');
        expect(row.buttons).toHaveLength(2);
        expect(row.buttons[0].text).toBe('🧮¹ Artist');
        expect(row.buttons[0].dataLabel).toBe('🧮 Artist RGs');
        expect(row.buttons[1].text).toBe('🧮² Various Artists');
        expect(row.buttons[1].dataLabel).toBe('🧮 Various Artists RGs');
    });

    test('iswc: the rich tooltip restores the full label and the shortcut hint, and shows on hover', async ({ page }) => {
        await loadUserscriptPage(page, { url: ISWC_URL, fixtureFile: ISWC_FIXTURE, testMode: true });

        const row = await buttonRow(page);
        expect(row.buttons).toHaveLength(1);
        expect(row.buttons[0].text).toBe('🧮¹ Works');
        expect(row.buttons[0].mbtt).toContain('<strong>Works</strong>');
        expect(row.buttons[0].mbtt).toContain('Fetch all the table data');
        expect(row.buttons[0].mbtt).toContain('mb-mbtt-shortcut');
        expect(row.buttons[0].title).toContain('Fetch all the table data');

        const btn = page.locator('#mb-show-all-controls-container button[data-label="Show all Works"]');
        await btn.hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible();
        await expect(tip).toContainText('Works');
        // The native title is suppressed while the rich tooltip is shown, so
        // the browser never overlays both tooltips at once.
        expect(await btn.getAttribute('title')).toBe('');

        await page.mouse.move(0, 0);
        await expect(tip).toBeHidden();
        // ...and restored once the rich tooltip is dismissed.
        expect(await btn.getAttribute('title')).toContain('Fetch all the table data');
    });

    test('search results: "Search Results for " is dropped — the native h1 already says "Search results"', async ({ page }) => {
        await loadUserscriptPage(page, { url: SEARCH_URL, fixtureFile: SEARCH_FIXTURE, testMode: true });
        await page.route(`${SEARCH_URL.split('?')[0]}?**`,
            (route) => route.fulfill({ path: SEARCH_FIXTURE, contentType: 'text/html' }));

        const row = await buttonRow(page);
        expect(row.buttons).toHaveLength(1);
        expect(row.buttons[0].text).toBe('🧮¹ Recordings');
        expect(row.buttons[0].dataLabel).toBe('Show all Search Results for Recordings');
        expect(row.buttons[0].mbtt).toContain('<strong>Search Results for Recordings</strong>');
    });
});
