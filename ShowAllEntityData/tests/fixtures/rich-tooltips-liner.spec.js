'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// "Liner notes" rich tooltips: every hover text the script sets itself goes
// through _setTip() (or carries data-mb-tip in its markup), and the delegated
// engine in _initStatTooltip() shows it as a cream card in #mb-stat-tooltip.
// MusicBrainz's own titles must stay native.
//
// Each test names the property it pins:
//   - an own tooltip shows as a card, with its title stashed while shown and
//     handed back (and its aria-description removed) afterwards;
//   - the card waits for sa_rich_tooltip_delay_ms;
//   - a native MusicBrainz title is never touched;
//   - sa_rich_tooltips off leaves every title native;
//   - the marker survives a re-render's cloneNode(true) (delegation, no wiring);
//   - a title changed under the pointer is shown on the next move;
//   - a mousedown hides the card for the rest of the hover;
//   - the formatter's title / body / footnote / keycap rules.

const RG_URL = 'https://musicbrainz.org/release-group/aaaaaaaa-0000-0000-0000-000000000002';
const RG_FIXTURE = path.join(__dirname, 'releasegroup-releases-live-titles.html');
const RG_BUTTON = 'Show all Releases for ReleaseGroup';
const LINER_BG = 'rgb(251, 248, 241)';

/**
 * Loads the release-group fixture and renders it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings] - extra GM settings
 */
async function openRg(page, settings = {}) {
    await loadUserscriptPage(page, {
        url: RG_URL, fixtureFile: RG_FIXTURE, testMode: true,
        settingsOverride: {
            sa_enable_caa_pics: false, sa_enable_relationships_column: false,
            sa_rich_tooltip_delay_ms: 0, ...settings,
        },
    });
    await page.route(`${RG_URL}*`, (r) => r.fulfill({ path: RG_FIXTURE, contentType: 'text/html' }));
    await page.click(`button[data-label="${RG_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const master = page.locator('.mb-master-toggle');
    if (await master.count() && (await master.getAttribute('data-state')) === 'collapsed') {
        await master.click();
    }
    // Park the pointer: resting on an own-tip element stashes its title, and
    // the click above leaves it wherever the toggle was.
    await page.mouse.move(0, 0);
}

/** The settings ⚙️ button: an own tooltip with a prefix-key shortcut hint. */
const ownButton = (page) => page.locator('#mb-settings-btn[data-mb-tip]');

const card = (page) => page.locator('#mb-stat-tooltip');

test.describe('rich tooltips: Liner notes', () => {
    test('an own tooltip shows as a Liner notes card, and its title comes back after', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await openRg(page);
        const btn = ownButton(page);
        const title = await btn.getAttribute('title');
        expect(title).toContain('Ctrl+M');

        await page.mouse.move(0, 0);
        await btn.hover();
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toHaveClass(/mb-tt-liner/);
        expect(await card(page).evaluate((t) => getComputedStyle(t).backgroundColor)).toBe(LINER_BG);
        expect(await card(page).evaluate((t) => getComputedStyle(t).fontFamily)).toContain('Georgia');
        await expect(card(page).locator('.mb-tt-title, .mb-tt-body').first()).toContainText('settings manager');
        await expect(card(page).locator('kbd').first()).toHaveText('Ctrl');
        // While the card shows, the browser has no title to draw its own box
        // from, and the text is still offered to assistive technology.
        expect(await btn.getAttribute('title')).toBe('');
        expect(await btn.getAttribute('aria-description')).toBe(title);

        await page.mouse.move(0, 0);
        await expect(card(page)).toBeHidden();
        expect(await btn.getAttribute('title')).toBe(title);
        expect(await btn.getAttribute('aria-description')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('the card waits for sa_rich_tooltip_delay_ms', async ({ page }) => {
        await openRg(page, { sa_rich_tooltip_delay_ms: 700 });
        await page.mouse.move(0, 0);
        await ownButton(page).hover();
        await page.waitForTimeout(300);
        await expect(card(page)).toBeHidden();
        await expect(card(page)).toBeVisible({ timeout: 2000 });
    });

    test('a native MusicBrainz title stays native', async ({ page }) => {
        await openRg(page);
        const native = page.locator('table.tbl tbody a[title]:not([data-mb-tip])').first();
        await expect(native).toHaveCount(1);
        const title = await native.getAttribute('title');
        await page.mouse.move(0, 0);
        await native.hover();
        await page.waitForTimeout(200);
        await expect(card(page)).toBeHidden();
        expect(await native.getAttribute('title')).toBe(title);
    });

    test('with sa_rich_tooltips off, an own tooltip is a plain title again', async ({ page }) => {
        await openRg(page, { sa_rich_tooltips: false });
        const btn = ownButton(page);
        const title = await btn.getAttribute('title');
        await page.mouse.move(0, 0);
        await btn.hover();
        await page.waitForTimeout(200);
        await expect(card(page)).toBeHidden();
        expect(await btn.getAttribute('title')).toBe(title);
    });

    test('an own tooltip inside a re-rendered (cloned) row still shows its card', async ({ page }) => {
        await openRg(page);
        // A filter round trip re-renders every sub-table from cloneNode(true)
        // copies of the source rows: no listener survives that, the marker does.
        await page.fill('#mb-global-filter-input', '1975');
        await page.fill('#mb-global-filter-input', '');
        await page.waitForTimeout(300);
        const cell = page.locator('table.tbl tbody td[data-mb-tip][title]').first();
        await expect(cell).toHaveCount(1);
        const title = await cell.getAttribute('title');
        await page.mouse.move(0, 0);
        await cell.hover();
        await expect(card(page)).toBeVisible();
        await expect(card(page)).toContainText(title.split('\n')[0].slice(0, 30));
    });

    test('a title changed under the pointer is shown on the next move', async ({ page }) => {
        await openRg(page);
        const btn = ownButton(page);
        await page.mouse.move(0, 0);
        await btn.hover();
        await expect(card(page)).toBeVisible();
        // What a button does when it relabels itself on click (_setTip again).
        await btn.evaluate((b) => { b.title = 'Relabelled while hovered'; });
        const box = await btn.boundingBox();
        await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
        await expect(card(page)).toContainText('Relabelled while hovered');
        expect(await btn.getAttribute('title')).toBe('');
        await page.mouse.move(0, 0);
        expect(await btn.getAttribute('title')).toBe('Relabelled while hovered');
    });

    test('a mousedown hides the card for the rest of the hover', async ({ page }) => {
        await openRg(page);
        const btn = page.locator('[data-mb-tip][title]:not(button)').first();
        const box = await btn.boundingBox();
        await page.mouse.move(0, 0);
        await page.mouse.move(box.x + 2, box.y + 2);
        await expect(card(page)).toBeVisible();
        await page.mouse.down();
        await expect(card(page)).toBeHidden();
        await page.mouse.move(box.x + 3, box.y + 2);
        await page.waitForTimeout(150);
        await expect(card(page)).toBeHidden();
        await page.mouse.up();
    });

    test('over an open 📊 dropdown, the card of one of its entries is drawn ON TOP of the dropdown', async ({ page }) => {
        await openRg(page);
        // The dropdown sits at z-index 999999; the card used to be at 99999,
        // under it (reported 2026-10-04 with a screenshot).
        await page.evaluate(() => {
            const wrap = Array.from(document.querySelectorAll('table.tbl thead th .mb-col-uniq-wrap'))
                .find((el) => el.getClientRects().length > 0);
            wrap.click();
        });
        const drop = page.locator('#mb-col-uniq-dropdown');
        await expect(drop).toBeVisible();
        // A section header, as in the report's screenshot.
        const entry = drop.locator('.mb-uniq-section-hdr[data-mb-tip][title]:visible').first();
        await expect(entry).toHaveCount(1);
        const box = await entry.boundingBox();
        await page.mouse.move(0, 0);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
        await expect(card(page)).toBeVisible();
        // Whatever is painted at the card's centre must be the card itself.
        const onTop = await page.evaluate(() => {
            const t = document.getElementById('mb-stat-tooltip');
            const r = t.getBoundingClientRect();
            // pointer-events:none hides the card from elementFromPoint, so
            // ask the stacking order through a probe that takes the card's
            // z-index and compares it with the dropdown's.
            const z = (el) => Number(getComputedStyle(el).zIndex) || 0;
            const d = document.getElementById('mb-col-uniq-dropdown');
            const dr = d.getBoundingClientRect();
            const overlaps = r.left < dr.right && r.right > dr.left && r.top < dr.bottom && r.bottom > dr.top;
            return { overlaps, cardZ: z(t), dropZ: z(d) };
        });
        expect(onTop.overlaps, 'premise: the card overlaps the dropdown').toBe(true);
        expect(onTop.cardZ).toBeGreaterThan(onTop.dropZ);
    });

    test('the formatter: title, body, footnote and keycaps', async ({ page }) => {
        await openRg(page);
        const html = (t) => page.evaluate((s) => window.__saTest.tipTextToHtml(s), t);

        // One short line: a title on its own.
        expect(await html('Clear filter')).toBe('<div class="mb-tt-title">Clear filter</div>');
        // One long line: body text, not a heading.
        const long = 'Filter rows while loading from disk. Remember you must have at least saved a dataset before.';
        expect(await html(long)).toBe(`<div class="mb-tt-body">${long}</div>`);
        // Several lines: title, body, and a "Configurable in" footnote.
        expect(await html('Not linked to a work\nMost recordings should be.\nConfigurable in ⚙️ Settings'))
            .toBe('<div class="mb-tt-title">Not linked to a work</div>'
                + '<div class="mb-tt-body">Most recordings should be.</div>'
                + '<div class="mb-tt-foot">Configurable in ⚙️ Settings</div>');
        // Keycaps: a combo, the key after "then", Escape; and markup is escaped.
        expect(await html('Resize (Ctrl+M, then R, or Ctrl+Shift+R)'))
            .toBe('<div class="mb-tt-title">Resize (<kbd>Ctrl</kbd>+<kbd>M</kbd>, then <kbd>R</kbd>, or '
                + '<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>)</div>');
        expect(await html('Close (Escape)')).toBe('<div class="mb-tt-title">Close (<kbd>Escape</kbd>)</div>');
        expect(await html('<b>"x"</b>')).toBe('<div class="mb-tt-title">&lt;b&gt;&quot;x&quot;&lt;/b&gt;</div>');
    });
});
