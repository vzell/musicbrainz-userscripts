'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// The Length header's tooltip says what the column SHOWS, which the ⏱
// toggle changes (seconds vs milliseconds). Properties:
//   - release-tracks (multi-table, one per medium): the "Length" tooltip
//     says the value is rounded to the second, and after ⏱ that it is shown
//     with milliseconds; toggling back restores the first text. Every
//     sub-table's header follows, not only the first;
//   - another page's Length (work-recordings, the generic description from
//     _COLUMN_DESCRIPTIONS) follows the toggle the same way;
//   - a native `<th class="treleases">` (MusicBrainz's own Length marking,
//     here on an ISRC page) keeps that class AND our description after the
//     next render: the description is our tooltip (`data-mb-tip`), not
//     jesus2099's (_isOwnColumnTooltip()). 9.99.1406 lost both on the first
//     filter keystroke.

/**
 * Every rendered Length header's tooltip text, class and card title.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{tip: string, cls: string, title: ?string}>>}
 */
const lengthHeaders = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
    .filter((th) => th.dataset.colName === 'Length')
    .map((th) => {
        const tip = th.getAttribute('title') || th.dataset.mbTipSaved || '';
        const d = document.createElement('div');
        d.innerHTML = tip ? window.__saTest.tipTextToHtml(tip, th) : '';
        const title = d.querySelector('.mb-tt-title');
        return { tip, cls: th.className, title: title ? title.textContent : null };
    }));

/**
 * Presses the first ⏱ toggle and waits for its new state.
 *
 * @param {import('@playwright/test').Page} page
 * @param {boolean} wantMs
 */
async function toggleMs(page, wantMs) {
    const btn = page.locator('.mb-ms-col-hdr-btn').first();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', wantMs ? 'true' : 'false');
}

test.describe('Length header tooltip follows the ⏱ toggle', () => {
    test('release-tracks: rounded to the second, then shown with milliseconds, then back', async ({ page }) => {
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897',
            fixtureFile: path.join(__dirname, 'release-tracks-ms-length.html'),
            testMode: true,
            settingsOverride: { sa_enable_release_tracks: true },
        });
        await page.click('button[data-label="Show all Tracks for Release"]');
        await expect(page.locator('#mb-filter-container')).toBeVisible();

        const before = await lengthHeaders(page);
        expect(before.length).toBeGreaterThan(0);
        for (const h of before) {
            expect(h.tip).toMatch(/^Track length — /);
            expect(h.tip).toContain('rounded to the nearest second, so "4:50" can be anything');
            expect(h.tip).not.toContain('Shown here with milliseconds');
            expect(h.title).toBe('Length');
        }

        await toggleMs(page, true);
        await expect.poll(async () => (await lengthHeaders(page)).map((h) => /Shown here with milliseconds/.test(h.tip)),
            { message: 'every Length header says milliseconds are shown' }).toEqual(before.map(() => true));
        for (const h of await lengthHeaders(page)) {
            expect(h.tip).toContain('back to whole seconds');
            expect(h.tip).not.toContain('can be anything from 4:49.500');
        }

        await toggleMs(page, false);
        await expect.poll(async () => (await lengthHeaders(page)).map((h) => h.tip),
            { message: 'toggling back restores the seconds text' }).toEqual(before.map((h) => h.tip));
    });

    test('work-recordings: the generic Length description follows too', async ({ page }) => {
        const WS2_BODY = JSON.stringify({ relations: [
            { recording: { id: '528327c7-0f7a-46d1-b03f-700ebc39f747', length: 305146 } },
            { recording: { id: 'de9ff1d7-dd78-4ed6-a328-c1ab126304e6', length: 305000 } },
            { recording: { id: '089026d3-1c1d-45bb-bf16-072d0bff8412', length: 334866 } },
            { recording: { id: '299b2860-570e-4dca-9166-9e3842d8c381', length: null } },
            { recording: { id: '0b62eb61-f75f-498c-845f-5e7fbd3ac924', length: 264000 } },
        ] });
        await page.route('**/ws/2/work/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: WS2_BODY }));
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201',
            fixtureFile: path.join(__dirname, 'work-recordings-ms-length.html'),
            testMode: true,
        });
        await page.click('button[data-label="Show all Recordings for Work"]');
        await expect(page.locator('#mb-filter-container')).toBeVisible();

        expect((await lengthHeaders(page))[0].tip).toBe('The duration, in minutes and seconds.');
        await toggleMs(page, true);
        await expect.poll(async () => (await lengthHeaders(page))[0].tip).toMatch(/^The duration, in minutes, seconds and milliseconds/);
        await toggleMs(page, false);
        await expect.poll(async () => (await lengthHeaders(page))[0].tip).toBe('The duration, in minutes and seconds.');
    });
});

test.describe('native treleases Length header', () => {
    test('an ISRC page keeps MusicBrainz\'s treleases class and our description after a re-render', async ({ page }) => {
        const url = 'https://musicbrainz.org/isrc/USSM19500019';
        const file = path.join(__dirname, 'recording-of-pt-isrc.html');
        await page.route('**/ws/2/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        await loadUserscriptPage(page, { url, fixtureFile: file, testMode: true });
        await page.route(`${url}?**`, (route) => route.fulfill({ path: file, contentType: 'text/html' }));
        await page.locator('button[data-label^="Show all Recordings"]').first().click();
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const [first] = await lengthHeaders(page);
        expect(first.cls.split(/\s+/)).toContain('treleases');
        expect(first.tip).toBe('The duration, in minutes and seconds.');

        // A filter keystroke re-renders the table and runs the jesus2099 purge again.
        const gf = page.locator('#mb-global-filter-input, input.mb-global-filter').first();
        await gf.click();
        await gf.pressSequentially('a');
        await expect.poll(() => page.evaluate(() => document.getElementById('mb-filter-status-display')?.textContent || ''))
            .toMatch(/Filtered/);
        const [after] = await lengthHeaders(page);
        expect(after.cls.split(/\s+/), 'MusicBrainz\'s own class survives').toContain('treleases');
        expect(after.tip, 'our description survives').toBe('The duration, in minutes and seconds.');
    });
});
