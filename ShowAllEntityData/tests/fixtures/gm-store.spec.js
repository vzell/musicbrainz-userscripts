'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { setupRecordingOf } = require('../support/recordingOf');
const { clickToolbarItem } = require('../support/toolbarMenu');

// The 🗄️ Script storage dialog (_gms*, vzell 2026-10-26): the Tampermonkey
// key/values of this script. Properties pinned:
//   - the SAED menu's View group lists it right below 💾 Browser cache, and
//     the Tampermonkey menu has it too;
//   - every stored key is listed with its kind: a setting (changed or not),
//     workspace state (by its group), a hand-off, an orphaned key, other;
//   - the kind chips and the filter narrow the table; the filter never
//     matches a secret's value;
//   - the Discogs token (`secret: true`) is dots everywhere in the dialog,
//     has no editor and no Copy, and is left out of the export;
//   - Save refuses invalid JSON, asks first, and Cancel changes nothing;
//     Reset to default and Delete remove the key from GM storage;
//   - "Delete leftovers" removes the orphaned keys and old hand-offs;
//   - Esc cancels a confirmation first, then closes;
//   - moved by its header, it remembers where (`sa_gms_geometry`).

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');
const TOKEN = 'SECRET-TOKEN-1234567890';
const dlg = (page) => page.locator('#mb-gm-store');
const row = (page, key) => page.locator(`#mb-gm-store tr.mb-gms-row[data-key="${key}"]`);
const gm = (page, key) => page.evaluate((k) => window.GM_getValue(k, undefined), key);

/**
 * Loads the page with a secret, a changed setting and a workspace key
 * stored, then (after the start-up sweep, which would delete them) an
 * orphaned key and a two-hour-old hand-off, and opens the dialog.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>} The hand-off's key.
 */
async function openStore(page) {
    await loadUserscriptPage(page, {
        url: URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: {
            sa_pop_ext_discogs_token: TOKEN,
            sa_caa_tip_summary_tiles: 20,
            sa_fgal_geometry: { top: 20, left: 64, width: 704, height: 529 },
        },
    });
    // One macrotask after load: `_sweepOrphanedGmValues()` has run.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    const snap = await page.evaluate(() => {
        const key = `mb_sa_subtable_snapshot_${(Date.now() - 2 * 3600000).toString(36)}abc`;
        window.GM_setValue(key, { timestamp: Date.now() - 2 * 3600000, rows: [] });
        window.GM_setValue('sa_app_help_geometry', { top: 1, left: 2, width: 300, height: 200 });
        window.__saTest.gmStore.open();
        return key;
    });
    await expect(dlg(page)).toBeVisible();
    return snap;
}

test.describe('🗄️ Script storage', () => {
    test('lists every key with its kind; chips and the filter narrow it; the secret is dots', async ({ page }) => {
        const snap = await openStore(page);
        await expect(row(page, 'sa_caa_tip_summary_tiles').locator('td').nth(1)).toHaveText('Setting · changed');
        await expect(row(page, 'sa_fgal_geometry').locator('td').nth(1)).toHaveText('Panel geometry');
        await expect(row(page, 'sa_app_help_geometry').locator('td').nth(1)).toHaveText('Orphaned');
        await expect(row(page, snap).locator('td').nth(1)).toHaveText('Hand-offs');
        await expect(row(page, 'sa_pop_ext_discogs_token').locator('td.v')).toHaveText('••••••••');
        await expect(page.locator('#mb-gm-store [data-gms-detail]'), 'no empty detail box before a key is picked').toBeHidden();
        expect(await dlg(page).innerHTML(), 'the token appears nowhere in the dialog').not.toContain(TOKEN);
        // Chips.
        await page.locator('#mb-gm-store [data-gms-kind="orphaned"]').click();
        await expect(page.locator('#mb-gm-store tr.mb-gms-row')).toHaveCount(1);
        await expect(row(page, 'sa_app_help_geometry')).toBeVisible();
        await page.locator('#mb-gm-store [data-gms-kind="all"]').click();
        // The filter: a key, a value, never a secret's value.
        await page.fill('#mb-gms-q', 'fgal');
        await expect(page.locator('#mb-gm-store tr.mb-gms-row')).toHaveCount(1);
        await page.fill('#mb-gms-q', '704');
        await expect(row(page, 'sa_fgal_geometry')).toBeVisible();
        await page.fill('#mb-gms-q', 'SECRET-TOKEN');
        await expect(page.locator('#mb-gm-store tr.mb-gms-row')).toHaveCount(0);
        // The secret's detail: dots, Delete only.
        await page.fill('#mb-gms-q', 'discogs_token');
        await row(page, 'sa_pop_ext_discogs_token').click();
        const detail = page.locator('#mb-gm-store [data-gms-detail]');
        await expect(detail).toContainText('••••••••');
        await expect(detail.locator('textarea')).toHaveCount(0);
        await expect(detail.locator('[data-gms="copy"]')).toHaveCount(0);
        await expect(detail.locator('[data-gms="delete"]')).toBeVisible();
        expect(await dlg(page).innerHTML()).not.toContain(TOKEN);
    });

    test('Save refuses invalid JSON and asks first; Reset and Delete remove the key', async ({ page }) => {
        await openStore(page);
        await row(page, 'sa_caa_tip_summary_tiles').click();
        const ta = page.locator('#mb-gms-edit');
        await expect(ta).toHaveValue('20');
        await ta.fill('fifteen');
        await page.locator('#mb-gm-store [data-gms="save"]').click();
        await expect(page.locator('#mb-gm-store [data-gms-err]')).toContainText('Not valid JSON');
        await expect(page.locator('#mb-gm-store .mb-idbo-confirm')).toHaveCount(0);
        expect(await gm(page, 'sa_caa_tip_summary_tiles')).toBe(20);
        await ta.fill('15');
        await page.locator('#mb-gm-store [data-gms="save"]').click();
        await expect(page.locator('#mb-gm-store .mb-idbo-confirm')).toContainText('Overwrite sa_caa_tip_summary_tiles');
        await page.locator('#mb-gm-store [data-gms="no"]').click();
        expect(await gm(page, 'sa_caa_tip_summary_tiles'), 'Cancel changes nothing').toBe(20);
        await page.locator('#mb-gm-store [data-gms="save"]').click();
        await page.locator('#mb-gm-store [data-gms="yes"]').click();
        expect(await gm(page, 'sa_caa_tip_summary_tiles')).toBe(15);
        await expect(page.locator('#mb-gm-store [data-gms-toast]')).toHaveText('Saved sa_caa_tip_summary_tiles.');
        // Reset to default: the key goes, so the schema default applies.
        await page.locator('#mb-gm-store [data-gms="reset"]').click();
        await page.locator('#mb-gm-store [data-gms="yes"]').click();
        expect(await gm(page, 'sa_caa_tip_summary_tiles')).toBeUndefined();
        await expect(row(page, 'sa_caa_tip_summary_tiles')).toHaveCount(0);
        // Delete a workspace key.
        await row(page, 'sa_fgal_geometry').click();
        await page.locator('#mb-gm-store [data-gms="delete"]').click();
        await page.locator('#mb-gm-store [data-gms="yes"]').click();
        expect(await gm(page, 'sa_fgal_geometry')).toBeUndefined();
        await expect(row(page, 'sa_fgal_geometry')).toHaveCount(0);
    });

    test('Export JSON leaves the secret out; "Delete leftovers" removes the orphaned key and the old hand-off', async ({ page }) => {
        const snap = await openStore(page);
        const [dl] = await Promise.all([
            page.waitForEvent('download'),
            page.locator('#mb-gm-store [data-gms="export"]').click(),
        ]);
        const file = await dl.path();
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        expect(dl.suggestedFilename()).toMatch(/^ShowAllEntityData-script-storage-\d{4}-\d{2}-\d{2}\.json$/);
        expect(data.sa_caa_tip_summary_tiles).toBe(20);
        expect(data.sa_fgal_geometry).toEqual({ top: 20, left: 64, width: 704, height: 529 });
        expect(Object.keys(data)).not.toContain('sa_pop_ext_discogs_token');
        expect(fs.readFileSync(file, 'utf8')).not.toContain(TOKEN);
        await page.locator('#mb-gm-store [data-gms="orphans"]').click();
        await expect(page.locator('#mb-gm-store .mb-idbo-confirm')).toBeVisible();
        await page.locator('#mb-gm-store [data-gms="yes"]').click();
        expect(await gm(page, 'sa_app_help_geometry')).toBeUndefined();
        expect(await gm(page, snap)).toBeUndefined();
        expect(await gm(page, 'sa_fgal_geometry'), 'workspace state stays').toBeTruthy();
        await expect(page.locator('#mb-gm-store [data-gms-toast]')).toHaveText('Deleted 2 keys.');
    });

    test('Esc cancels a pending confirmation first, then closes', async ({ page }) => {
        await openStore(page);
        await row(page, 'sa_fgal_geometry').click();
        await page.locator('#mb-gm-store [data-gms="delete"]').click();
        await expect(page.locator('#mb-gm-store .mb-idbo-confirm')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mb-gm-store .mb-idbo-confirm')).toHaveCount(0);
        await expect(dlg(page)).toBeVisible();
        expect(await gm(page, 'sa_fgal_geometry')).toBeTruthy();
        await page.keyboard.press('Escape');
        await expect(dlg(page)).toHaveCount(0);
    });

    test('moved by its header, it reopens where it was left', async ({ page }) => {
        await openStore(page);
        const box = page.locator('#mb-gm-store .mb-idbo-dlg');
        const hb = await page.locator('#mb-gms-title').boundingBox();
        const b0 = await box.boundingBox();
        await page.mouse.move(hb.x + 5, hb.y + 5);
        await page.mouse.down();
        await page.mouse.move(hb.x + 45, hb.y + 25, { steps: 6 });
        await page.mouse.up();
        await expect.poll(() => gm(page, 'sa_gms_geometry')).toMatchObject({ left: Math.round(b0.x + 40), top: Math.round(b0.y + 20) });
        await page.locator('#mb-gm-store [data-gms="close"]').click();
        await expect(dlg(page)).toHaveCount(0);
        await page.evaluate(() => window.__saTest.gmStore.open());
        const b1 = await box.boundingBox();
        expect(Math.round(b1.x)).toBe(Math.round(b0.x + 40));
        expect(Math.round(b1.y)).toBe(Math.round(b0.y + 20));
    });

    test('the ways in: the SAED menu right below 💾 Browser cache, and the Tampermonkey menu', async ({ page }) => {
        await setupRecordingOf(page);
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.mb-saed-group[data-mb-group="view"] .mb-toolbar-menu-item')).map(b => b.id));
        expect(rows.indexOf('mb-gms-menu-btn'), 'right below Browser cache').toBe(rows.indexOf('mb-idbo-menu-btn') + 1);
        expect(rows.indexOf('mb-shortcuts-help-btn')).toBe(rows.indexOf('mb-gms-menu-btn') + 1);
        await expect(page.locator('#mb-gms-menu-btn')).toHaveText('🗄️ Script storage');
        await clickToolbarItem(page, '#mb-gms-menu-btn');
        await expect(dlg(page)).toBeVisible();
        await expect(page.locator('#mb-saed-menu-btn-panel')).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(dlg(page)).toHaveCount(0);
        const viaMenu = await page.evaluate(() => {
            const c = Object.values(window.__gmMenuCommands || {}).find((x) => /Script storage/.test(x.name));
            if (!c) return false;
            c.callback();
            return true;
        });
        expect(viaMenu).toBe(true);
        await expect(dlg(page)).toBeVisible();
    });
});
