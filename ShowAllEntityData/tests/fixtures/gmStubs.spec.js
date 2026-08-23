'use strict';

const { test, expect } = require('../support/test');
const { buildGmStubsScript } = require('../support/gmStubs');

// Exercises the GM_* stub in isolation (no userscript involved) since a
// large share of ShowAllEntityData's behavior (216 sa_* settings) depends
// on GM_setValue/GM_getValue round-tripping correctly.
test('GM_setValue/GM_getValue/GM_deleteValue round-trip within a page', async ({ page }) => {
    await page.addInitScript({ content: buildGmStubsScript() });
    await page.goto('about:blank');

    const result = await page.evaluate(() => {
        const out = {};
        out.defaultWhenUnset = window.GM_getValue('sa_missing_key', 'fallback');

        window.GM_setValue('sa_test_key', 42);
        out.afterSet = window.GM_getValue('sa_test_key', 'fallback');

        window.GM_deleteValue('sa_test_key');
        out.afterDelete = window.GM_getValue('sa_test_key', 'fallback');

        return out;
    });

    expect(result.defaultWhenUnset).toBe('fallback');
    expect(result.afterSet).toBe(42);
    expect(result.afterDelete).toBe('fallback');
});

// loadPage.js relies on this to force sa_enable_caa_pics/sa_enable_relationships_column
// off for fixture tests, keeping that suite network-free — verify the seeding mechanism itself.
test('buildGmStubsScript(initialValues) pre-seeds the GM_getValue store', async ({ page }) => {
    await page.addInitScript({ content: buildGmStubsScript({ sa_enable_caa_pics: false }) });
    await page.goto('about:blank');

    const value = await page.evaluate(() => window.GM_getValue('sa_enable_caa_pics', true));
    expect(value).toBe(false);
});
