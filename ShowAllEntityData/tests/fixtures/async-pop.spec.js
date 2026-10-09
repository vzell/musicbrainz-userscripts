'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

// The async job popup (_aj* in ShowAllEntityData.user.js): one "Liner notes"
// card that every background job reports through. These tests drive the
// SHIPPING framework through window.__saTest.asyncPop with a stand-in
// provider, so no network-backed feature stands in the way; the features'
// own specs (recording-of-*, rel-*, ms-*) check their providers.
//
// Each test names the property it pins:
//   - a job the user starts opens the card under its anchor; one the script
//     starts by itself does not;
//   - Esc hides it and the job keeps reporting (repaints stop while hidden);
//   - hovering the anchor shows it again, live; leaving closes it after the
//     grace period, unless the pointer moved onto the card;
//   - an action button reaches the provider's act();
//   - sa_async_pop_auto_open off: no auto-open, hover still works;
//     sa_async_pop_enable off: never shown;
//   - while the card shows, the anchor's own Liner-notes card stays away;
//   - Esc belongs to the artwork viewer while that is open.

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');
const pop = (page) => page.locator('#mb-async-pop');

/**
 * Loads the tiny fixture (no render needed), adds an anchor button with an
 * own tooltip into the table header, and registers a stand-in provider whose
 * counters live on window.__ajTest.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function setup(page, settings = {}) {
    // A fake clock (time still flows) lets a test jump past the hover
    // delay and the leave grace period instead of sleeping through them.
    await page.clock.install();
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_async_pop_auto_open: true, sa_rich_tooltip_delay_ms: 0, ...settings },
    });
    await page.evaluate(() => {
        const th = document.querySelector('table.tbl thead th');
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'aj-anchor';
        b.textContent = '▶🧪';
        b.dataset.mbAj = 'test';
        b.setAttribute('data-mb-tip', '');
        b.title = 'Load the test column';
        th.prepend(b);
        window.__ajTest = { done: 0, total: 40, failed: 0, acts: [] };
        window.__saTest.asyncPop.register('test', {
            glyph: '🧪', label: 'Test job',
            snapshot: (scope, job) => ({
                phase: job ? job.phase : 'idle',
                summary: job ? 'Loading 40 things' : 'Not loaded yet',
                done: window.__ajTest.done, total: window.__ajTest.total, failed: window.__ajTest.failed,
                unit: 'things',
                facts: [['Source', 'a stand-in']],
                actions: [{ id: 'retry', label: 'Retry failed', kind: 'danger' }],
            }),
            act: (scope, id) => { window.__ajTest.acts.push(id); },
        });
    });
    await page.mouse.move(0, 0);
}

/** Starts the stand-in job for the anchor's table. */
async function startJob(page, user = true) {
    await page.evaluate((u) => {
        const table = document.querySelector('table.tbl');
        window.__saTest.asyncPop.start('test', table, { user: u, anchor: document.getElementById('aj-anchor') });
    }, user);
}

/** Advances the stand-in job by `n` and reports a change. */
async function step(page, n = 10) {
    await page.evaluate((k) => {
        window.__ajTest.done += k;
        const table = document.querySelector('table.tbl');
        window.__saTest.asyncPop.log('test', table, `loaded ${k}`, 'good');
    }, n);
}

test.describe('async job popup (_aj*)', () => {
    test('a user-started job opens the card under its anchor; a script-started one does not', async ({ page }) => {
        await setup(page);
        await startJob(page, false);
        await expect(pop(page)).toHaveCount(0);   // never even created

        await startJob(page, true);
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('.mb-tt-title')).toHaveText('🧪 Test job');
        await expect(pop(page).locator('[data-mb-aj-phase]')).toHaveAttribute('data-mb-aj-phase', 'running');
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('0 / 40 things');
        // Under the anchor, not at the pointer.
        const a = await page.locator('#aj-anchor').boundingBox();
        const p = await pop(page).boundingBox();
        expect(p.y).toBeGreaterThanOrEqual(a.y + a.height);
        expect(p.y - (a.y + a.height)).toBeLessThan(20);
        // It is a Liner-notes card.
        await expect(pop(page)).toHaveClass(/mb-tt-liner/);
    });

    test('Esc hides it, the job keeps reporting, and repaints stop while hidden', async ({ page }) => {
        await setup(page);
        await startJob(page);
        await step(page);
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('10 / 40');
        await page.keyboard.press('Escape');
        await expect(pop(page)).toBeHidden();
        const before = await page.evaluate(() => window.__saTest.asyncPop.repaints());
        await step(page);
        await step(page);
        await page.clock.fastForward(100);
        expect(await page.evaluate(() => window.__saTest.asyncPop.repaints())).toBe(before);
        // The job record still advanced: hovering shows the current state.
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('30 / 40');
        await expect(pop(page).locator('.mb-tt-ajlog li')).toHaveCount(4); // started + 3 steps
    });

    test('hover reopens it; leaving closes it after the grace period unless the pointer is on the card', async ({ page }) => {
        await setup(page);
        await startJob(page);
        await page.keyboard.press('Escape');
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
        // Onto the card: stays open past the grace period.
        await pop(page).locator('.mb-tt-title').hover();
        await page.clock.fastForward(600);
        await expect(pop(page)).toBeVisible();
        // Away from both: closes.
        await page.mouse.move(2, 2);
        await expect(pop(page)).toBeHidden();
        // Live while open: a step repaints it.
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
        await step(page, 5);
        await expect(pop(page).locator('.mb-tt-ajcount')).toContainText('5 / 40');
    });

    test('hovering an idle anchor shows the provider\'s preview', async ({ page }) => {
        await setup(page);
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('[data-mb-aj-phase]')).toHaveAttribute('data-mb-aj-phase', 'idle');
        await expect(pop(page)).toContainText('Not loaded yet');
    });

    test('the cache section shows, and onOpen fills it asynchronously once per opening', async ({ page }) => {
        await setup(page);
        await page.evaluate(() => {
            window.__ajCache = { records: null, opens: 0 };
            window.__saTest.asyncPop.register('test', {
                glyph: '🧪', label: 'Test job',
                snapshot: (scope, job) => ({
                    phase: job ? job.phase : 'idle', summary: 'stand-in',
                    cache: [
                        ['Store', 'IndexedDB test-store, kept 30 days'],
                        ['Records', window.__ajCache.records === null ? 'counting…' : String(window.__ajCache.records)],
                    ],
                }),
                onOpen: (scope, repaint) => {
                    window.__ajCache.opens++;
                    setTimeout(() => { window.__ajCache.records = 1234; repaint(); }, 50);
                },
            });
        });
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
        await expect(pop(page).locator('.mb-tt-ajcache')).toContainText('IndexedDB test-store');
        await expect(pop(page).locator('.mb-tt-ajcache')).toContainText('1234');
        // A repaint while open does not start another refresh.
        await startJob(page);
        await step(page);
        await expect(pop(page).locator('.mb-tt-ajcount')).toHaveCount(0); // no progress in this snapshot
        expect(await page.evaluate(() => window.__ajCache.opens)).toBe(1);
        // Closing and reopening does (off the anchor first: a pointer still
        // resting on it after Esc sends no new mouseover).
        await page.keyboard.press('Escape');
        await page.mouse.move(0, 0);
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
        expect(await page.evaluate(() => window.__ajCache.opens)).toBe(2);
    });

    test('an action button reaches the provider', async ({ page }) => {
        await setup(page);
        await startJob(page);
        await pop(page).locator('[data-mb-aj-act="retry"]').click();
        expect(await page.evaluate(() => window.__ajTest.acts)).toEqual(['retry']);
    });

    test('sa_async_pop_auto_open off: no auto-open, hover still shows it', async ({ page }) => {
        await setup(page, { sa_async_pop_auto_open: false });
        await startJob(page);
        await page.clock.fastForward(100);
        await expect(pop(page)).toHaveCount(0);
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
    });

    test('sa_async_pop_enable off: never shown', async ({ page }) => {
        await setup(page, { sa_async_pop_enable: false });
        await startJob(page);
        await page.locator('#aj-anchor').hover();
        await page.clock.fastForward(500);
        await expect(pop(page)).toHaveCount(0);
    });

    test('the anchor\'s own Liner-notes card stays away while the popup shows', async ({ page }) => {
        await setup(page, { sa_rich_tooltip_delay_ms: 400 });
        await page.locator('#aj-anchor').hover();
        await expect(pop(page)).toBeVisible();
        await page.clock.fastForward(600);
        await expect(page.locator('#mb-stat-tooltip')).toBeHidden();
    });

    test('Esc belongs to the artwork viewer while it is open', async ({ page }) => {
        await setup(page);
        await startJob(page);
        await page.evaluate(() => {
            const v = document.createElement('div');
            v.id = 'mb-art-viewer';
            document.body.appendChild(v);
        });
        await page.keyboard.press('Escape');
        await expect(pop(page)).toBeVisible();
        await page.evaluate(() => { document.getElementById('mb-art-viewer').hidden = true; });
        await page.keyboard.press('Escape');
        await expect(pop(page)).toBeHidden();
    });
});
