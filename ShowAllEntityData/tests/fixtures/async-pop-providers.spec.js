'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The Relationships and ⏱ providers of the async job popup. Properties:
//   - before any job ran, hovering the toggle shows its OWN Liner-notes
//     tooltip and no progress card (snapshot() → null) — nothing changes for
//     a user who never starts a job;
//   - clicking the toggle opens the card, which reaches "done" with the right
//     progress, logs the requests, and shows the IndexedDB cache rows.

const pop = (page) => page.locator('#mb-async-pop');

/**
 * Hovers a toggle and proves the old tooltip is what appears.
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 */
async function idleHoverShowsOwnTooltip(page, sel) {
    await page.locator(sel).first().hover();
    await expect(page.locator('#mb-stat-tooltip')).toBeVisible();
    await expect(pop(page)).toHaveCount(0);
    await page.mouse.move(0, 0);
}

test.describe('progress card providers', () => {
    test('Relationships: no card before a job; ▶🔗 opens one that finishes with the cache rows', async ({ page }) => {
        const url = 'https://musicbrainz.org/series/aa3694d3-a3d0-48ed-8f07-5b576de87908';
        const shell = path.join(__dirname, '..', 'snapshots', 'series-releases', 'raw.html');
        await loadUserscriptPage(page, {
            url, fixtureFile: shell, testMode: true,
            settingsOverride: {
                sa_enable_relationships_column: true, sa_rel_browse_batch_enable: false,
                sa_rel_collapse_threshold: 2, sa_async_pop_auto_open: true, sa_rich_tooltip_delay_ms: 0,
            },
        });
        await page.route('**/ws/2/**', (route) => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ relations: [{ 'target-type': 'url', type: 'discogs', url: { resource: 'https://www.discogs.com/release/1' } }] }),
        }));
        await page.route(`${url}?**`, (route) => route.fulfill({ path: shell, contentType: 'text/html' }));
        await page.click('button[data-label="Show all Releases for Series"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await page.mouse.move(0, 0);

        await idleHoverShowsOwnTooltip(page, 'thead .mb-rel-col-hdr-btn');
        await page.locator('thead .mb-rel-col-hdr-btn').first().click();
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('.mb-tt-title')).toContainText('Relationships');
        await expect(pop(page).locator('[data-mb-aj-phase]')).toHaveAttribute('data-mb-aj-phase', 'done', { timeout: 40000 });
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('12 / 12 entities');
        await expect(pop(page).locator('.mb-tt-ajlog')).toContainText(': ok');
        await expect(pop(page).locator('.mb-tt-ajcache')).toContainText('rel-ws2');
        await expect(pop(page).locator('.mb-tt-ajcache')).toContainText('network');
    });

    test('⏱ Length: no card before a job; the toggle opens one with batches, log and cache', async ({ page }) => {
        const url = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
        const fixture = path.join(__dirname, 'artist-recordings-ms-batch.html');
        await page.route('**/ws/2/recording?**', (route) => {
            const q = new URL(route.request().url()).searchParams.get('query') || '';
            const ids = q.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g) || [];
            const recordings = ids.map((id) => ({ id, length: (60 + Number(id.slice(-12))) * 1000 + 123 }));
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: recordings.length, recordings }) });
        });
        await loadUserscriptPage(page, {
            url, fixtureFile: fixture, testMode: true,
            settingsOverride: { sa_async_pop_auto_open: true, sa_rich_tooltip_delay_ms: 0 },
        });
        await page.route(`${url}?**`, (route) => route.fulfill({ path: fixture, contentType: 'text/html' }));
        await page.click('button[data-label="⊚ All recordings"]');
        await page.waitForSelector('#mb-filter-container');
        await page.mouse.move(0, 0);

        await idleHoverShowsOwnTooltip(page, '.mb-ms-col-hdr-btn');
        await page.locator('.mb-ms-col-hdr-btn').first().click();
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('[data-mb-aj-phase]')).toHaveAttribute('data-mb-aj-phase', 'done', { timeout: 20000 });
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('2 / 2 requests');
        await expect(pop(page).locator('.mb-tt-ajfacts').first()).toContainText('a recording search');
        await expect(pop(page).locator('.mb-tt-ajlog')).toContainText('batch of 100');
        await expect(pop(page).locator('.mb-tt-ajcache')).toContainText('ms-rec-len');
        await expect(pop(page).locator('.mb-tt-ajcache')).toContainText('network');
    });
});
