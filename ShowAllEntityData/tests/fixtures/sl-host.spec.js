'use strict';

// springsteenlyrics.com host behaviour that is not about parsing cards:
//
//   - the opt-in gate: with `sa_enable_springsteenlyrics` off (its default) the
//     script leaves the site's page exactly as it was — no toolbar, no table, no
//     body class — while still having run (its log line says so);
//   - the navigation guard: every SL page is one PHP script told apart by its
//     query string, so `collection.php?item=…` must count as LEAVING the
//     consolidated `collection.php?cmd=list…` table, not as the same page;
//   - Load from Disk: after a reload the live page holds cards again, and the
//     disk path must convert them too, or the table is fabricated at the end of
//     <body> (the site has no #content).
//
// See docs/claude/springsteenlyrics.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadSlListPage, renderedSlRows } = require('../support/slFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

/**
 * Collects uncaught page errors, so every test can end by asserting none.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

test.describe('springsteenlyrics.com opt-in gate', () => {
    test('with the setting off, the page is left untouched', async ({ page }) => {
        const errors = trackPageErrors(page);
        const logs = [];
        page.on('console', (msg) => logs.push(msg.text()));
        await loadSlListPage(page, { kind: 'collection', enabled: false });

        // Positive evidence that the script ran and chose to stop, so the
        // assertions below cannot pass merely because nothing was injected.
        await expect.poll(() => logs.some((t) => t.includes('springsteenlyrics.com support is off')), {
            timeout: 10000, message: 'the gate logs why it stopped',
        }).toBe(true);

        expect(await page.locator('h1').count()).toBe(0);
        expect(await page.locator('button[data-label]').count()).toBe(0);
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(await page.locator('div.blog-post').count()).toBe(50);
        await expect(page.locator('.project-detail h3.heading')).toHaveText('OFFICIAL ALBUMS');
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-sl'))).toBe(false);
        expect(await page.evaluate(() => !!document.getElementById('mb-sl-style'))).toBe(false);
        expect(errors).toEqual([]);
    });

    test('with the setting on, the toolbar is offered and nothing else changes yet', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { spec } = await loadSlListPage(page, { kind: 'bootlegs' });
        await expect(page.locator(`h1.mb-sl-h1 button[data-label="${spec.button}"]`)).toHaveCount(1);
        expect(await page.evaluate(() => document.body.classList.contains('mb-sa-host-sl'))).toBe(true);
        // The cards stay until the button is pressed.
        expect(await page.locator('div.blog-post').count()).toBe(50);
        expect(await page.locator('table.tbl').count()).toBe(0);
        expect(errors).toEqual([]);
    });
});

test('springsteenlyrics.com: following an item link from the table asks first', async ({ page }) => {
    const errors = trackPageErrors(page);
    const { spec } = await loadSlListPage(page, { kind: 'collection' });
    await page.click(`button[data-label="${spec.button}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const listUrl = page.url();
    const dialogs = [];
    page.on('dialog', (d) => {
        dialogs.push(d.message());
        d.dismiss();
    });
    await page.locator('table.tbl tbody tr td a[href*="item="]').nth(1).click();
    await expect.poll(() => dialogs.length, { timeout: 10000, message: 'the leave-page guard asks' }).toBe(1);
    expect(dialogs[0]).toContain('You are about to leave this page');
    // Dismissed: still on the list, with the table intact.
    expect(page.url()).toBe(listUrl);
    expect(await renderedSlRows(page)).toHaveLength(100);
    expect(errors).toEqual([]);
});

test.describe('springsteenlyrics.com: Save to Disk → Load from Disk', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-sl-disk-'));
    });

    test.afterEach(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('a reopened list renders in place, from cards converted on the fresh page', async ({ context }) => {
        const source = await context.newPage();
        const sourceErrors = trackPageErrors(source);
        const { spec } = await loadSlListPage(source, { kind: 'bootlegs' });
        await source.click(`button[data-label="${spec.button}"]`);
        await waitForRenderComplete(source, { waitForAutoResize: false });
        const before = (await renderedSlRows(source)).map((r) => r._item).sort();
        expect(before).toHaveLength(100);

        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'sl-bootlegs.json.gz');
        await (await downloadPromise).saveAs(saved);
        expect(sourceErrors).toEqual([]);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        await loadSlListPage(page, { kind: 'bootlegs' });
        expect(await page.locator('div.blog-post').count(), 'a fresh page holds cards again').toBe(50);

        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect((await renderedSlRows(page)).map((r) => r._item).sort()).toEqual(before);
        // Converted in place: one table, inside the site's content block,
        // under the list heading — not a shell fabricated at the end of <body>.
        expect(await page.locator('table.tbl').count()).toBe(1);
        expect(await page.locator('.project-detail table.tbl').count()).toBe(1);
        expect(await page.locator('div.blog-post').count()).toBe(0);
        await expect(page.locator('.project-detail h2.heading')).toHaveCount(1);
        expect(errors).toEqual([]);
    });
});
