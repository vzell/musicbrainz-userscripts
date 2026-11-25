'use strict';

// The switch between our tables and the original page on the Springsteen
// sites (vzell, 2026-11-25; org/majkinetor.org, "Switch between SAED's view
// and the original page (EH's V)", phase 4): springsteenlyrics.com,
// jungleland.it, brucespringsteen.it, brucebase.wikidot.com. They remove their
// own list when our table is built and put our section inside their own
// containers, so the original page is the page's HTML taken at the press
// (_origViewPageHtml()), shown in a sandboxed full-window frame
// (_origViewFrame()). Properties pinned:
//   - no ☰ row before a press; after a render the row shows the frame;
//   - the frame holds the page as it was BEFORE the press: the site's list
//     (cards, entries, records, the letter tabview), none of ours (toolbar
//     h1, mb- classes: a Brucebase title we hid is back), no script, a
//     <base target="_top"> so its links open in the tab;
//   - the note names the action pressed;
//   - "Back to the tables" and Ctrl+M P (inside the frame too) hide it, and
//     the table is there as it was.

const { test, expect } = require('../support/test');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { loadSlListPage } = require('../support/slFixture');
const { JL_BUTTON, loadJlListPage } = require('../support/jlFixture');
const { loadBsRecordsPage } = require('../support/bsFixture');
const { BB_BUTTON, loadBbSongsPage } = require('../support/bbFixture');

const { BB_EVENT_BUTTON, loadBbEventPage } = require('../support/bbFixture');

const ROW = '#mb-orig-view-btn';
const BACK = '#mb-orig-back-btn';
const FRAME = '#mb-orig-frame';

/**
 * Whether each selector's first match is visible (laid out, not hidden).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, string>} sels - Name → selector.
 * @returns {Promise<Object<string, boolean>>}
 */
const shown = (page, sels) => page.evaluate((s) => Object.fromEntries(Object.entries(s).map(([k, sel]) => {
    const el = document.querySelector(sel);
    return [k, !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'];
})), sels);

/**
 * Presses an action of our toolbar and waits for the render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * What the original-page frame shows: its document's facts.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} probe - A selector counted inside the frame (the site's list).
 * @returns {Promise<object>}
 */
const frameFacts = (page, probe) => page.locator(FRAME).evaluate((f, sel) => {
    const d = f.contentDocument;
    const ours = Array.from(d.querySelectorAll('*')).filter((el) => Array.from(el.classList).some((c) => c.startsWith('mb-'))
        || /^mbu?-/.test(el.id) && el.id !== 'mb-orig-frame-note');
    const base = d.querySelector('base');
    return {
        shown: !f.hidden && f.getBoundingClientRect().height > 0,
        list: d.querySelectorAll(sel).length,
        ours: ours.map((el) => el.id || el.className).slice(0, 5),
        scripts: d.querySelectorAll('script').length,
        baseTarget: base && base.getAttribute('target'),
        note: (d.getElementById('mb-orig-frame-note') || {}).textContent || '',
    };
}, probe);

/**
 * Switches back with Ctrl+M P typed INSIDE the frame.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function backByKeyInFrame(page) {
    await page.frameLocator(FRAME).locator('#mb-orig-frame-note').click();
    await page.keyboard.press('Control+M');
    await page.keyboard.press('p');
}

test.describe('the original page on springsteenlyrics.com', () => {
    test('a collection list: the cards as they were, in the frame; Ctrl+M P inside it brings the table back', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'collection' });
        expect(await page.locator(ROW).count()).toBe(0);
        await press(page, spec.button);
        // The converter took the cards off the live page.
        expect(await page.locator('div.blog-post').count()).toBe(0);
        await clickToolbarItem(page, ROW);
        const f = await frameFacts(page, 'div.blog-post');
        expect(f.shown).toBe(true);
        expect(f.list).toBeGreaterThan(0);
        expect(f.ours, 'none of ours in the copy').toEqual([]);
        expect(f.scripts).toBe(0);
        expect(f.baseTarget).toBe('_top');
        expect(f.note).toContain(`before you pressed “${spec.button}”`);
        await expect(page.locator(BACK)).toBeVisible();
        await backByKeyInFrame(page);
        await expect(page.locator(FRAME)).toBeHidden();
        await expect(page.locator(BACK)).toBeHidden();
        expect(await page.locator('table.tbl tbody tr').count()).toBeGreaterThan(0);
    });
});

test.describe('the original page on jungleland.it', () => {
    test('the list: its entries and jump menu as they were; the corner button brings the table back', async ({ page }) => {
        await loadJlListPage(page);
        await press(page, JL_BUTTON);
        await clickToolbarItem(page, ROW);
        const f = await frameFacts(page, 'a[target="inferioredx1"]');
        expect(f).toMatchObject({ shown: true, ours: [], scripts: 0, baseTarget: '_top' });
        expect(f.list).toBeGreaterThan(0);
        expect(await page.locator(FRAME).evaluate((fr) => !!fr.contentDocument.querySelector('form[name="theForm"]'))).toBe(true);
        await page.locator(BACK).click();
        await expect(page.locator(FRAME)).toBeHidden();
        expect(await page.locator('table.tbl tbody tr').count()).toBeGreaterThan(0);
    });
});

test.describe('the original page on brucespringsteen.it', () => {
    test('the records list as it was (the live page got an empty table)', async ({ page }) => {
        await loadBsRecordsPage(page);
        await press(page, 'Unofficial');
        await clickToolbarItem(page, ROW);
        const f = await frameFacts(page, 'form[name="mio"]');
        expect(f).toMatchObject({ shown: true, ours: [], scripts: 0, baseTarget: '_top' });
        expect(f.list).toBe(1);
        await page.locator(BACK).click();
        await expect(page.locator(FRAME)).toBeHidden();
    });
});

test.describe('the original page on brucebase.wikidot.com', () => {
    test('the songs page: the letter tabview and the wiki\'s title we hid, as the wiki drew them', async ({ page }) => {
        await loadBbSongsPage(page);
        await press(page, BB_BUTTON);
        await clickToolbarItem(page, ROW);
        const f = await frameFacts(page, '.yui-navset');
        expect(f).toMatchObject({ shown: true, ours: [], scripts: 0, baseTarget: '_top' });
        expect(f.list).toBeGreaterThan(0);
        // _bbPrepareLivePage() hid #page-title (mb-bb-hidden) and arranged the
        // side bar (mb-bb-cw): neither in the copy.
        const title = await page.locator(FRAME).evaluate((fr) => {
            const t = fr.contentDocument.getElementById('page-title');
            return t && { cls: t.className, cw: fr.contentDocument.getElementById('content-wrap').className };
        });
        expect(title.cls).not.toContain('mb-');
        expect(title.cw).not.toContain('mb-');
        await page.locator(BACK).click();
        await expect(page.locator(FRAME)).toBeHidden();
    });

    // vzell, 2026-11-25: "the tabs do not react on clicks" (the frame runs no
    // script; _origViewFrameTab() switches them).
    test('the songs page: a letter tab of the copy switches its panel, as the wiki does', async ({ page }) => {
        await loadBbSongsPage(page);
        await press(page, BB_BUTTON);
        await clickToolbarItem(page, ROW);
        const fl = page.frameLocator(FRAME);
        const tabState = () => page.locator(FRAME).evaluate((fr) => {
            const set = fr.contentDocument.querySelector('#page-content .yui-navset');
            const lis = Array.from(set.querySelector('.yui-nav').children);
            const panels = Array.from(set.querySelector('.yui-content').children);
            return {
                selected: lis.findIndex(li => li.classList.contains('selected')),
                shown: panels.map((p, k) => (p.getClientRects().length ? k : -1)).filter(k => k >= 0),
            };
        });
        expect(await tabState()).toEqual({ selected: 0, shown: [0] });
        await fl.locator('#page-content .yui-nav a', { hasText: '=- B -=' }).click();
        expect(await tabState()).toEqual({ selected: 2, shown: [2] });
        await expect(page.locator(FRAME)).toBeVisible();
        await fl.locator('#page-content .yui-nav a', { hasText: '=- 0-9 -=' }).click();
        expect(await tabState()).toEqual({ selected: 0, shown: [0] });
    });
});

// The table view (vzell's answer to the mockup's question 4): only our
// section and the kept headers; the site's leftovers hide
// (_origViewTagRest(), measured by scripts/probe-springsteen-table-view.js).
test.describe('the table view on the Springsteen sites: the site\'s leftovers hide, the kept headers stay', () => {
    test('springsteenlyrics.com: navbar and breadcrumb stay; the formats guide, the item count and the footer go', async ({ page }) => {
        const { spec } = await loadSlListPage(page, { kind: 'collection' });
        const PARTS = { top: '#header-top', nav: '.sticky-wrapper', crumb: '.breadcrumb-wrap', footer: 'footer#footer-option' };
        expect(await shown(page, PARTS)).toEqual({ top: true, nav: true, crumb: true, footer: true });
        await press(page, spec.button);
        expect(await shown(page, PARTS)).toEqual({ top: true, nav: true, crumb: true, footer: false });
        expect(await page.locator('[data-mb-site-rest]').evaluateAll((els) => els.some((el) => /Showing items/.test(el.textContent)))).toBe(true);
        await expect(page.locator('table.tbl').first()).toBeVisible();
    });

    test('brucespringsteen.it: the filter form and the reload lines go (the site\'s text the fold code wrapped too)', async ({ page }) => {
        await loadBsRecordsPage(page);
        await press(page, 'Unofficial');
        expect(await shown(page, { form: 'form[name="mio"]' })).toEqual({ form: false });
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('body *'))
            .filter((el) => el.children.length === 0 && /Last computed/.test(el.textContent) && el.getClientRects().length).length)).toBe(0);
    });

    test('Brucebase songs: the wiki header and side bar stay; breadcrumbs, page tags and footer go', async ({ page }) => {
        await loadBbSongsPage(page);
        await press(page, BB_BUTTON);
        expect(await shown(page, { header: '#header', crumbs: '#breadcrumbs', tags: '.page-tags', footer: '#footer' }))
            .toEqual({ header: true, crumbs: false, tags: false, footer: false });
        expect(await page.locator('#side-bar').evaluate((el) => el.hasAttribute('data-mb-site-rest'))).toBe(false);
    });
});

// A Brucebase detail page (vzell, 2026-11-25: "Live wiki page"): the folded
// "Brucebase page" leaves the table view, and the original view is the LIVE
// wiki page in place (_origViewBbLive()), not the frame.
test.describe('the original page on a Brucebase detail page: the live wiki page', () => {
    test('an event page: our blocks hide, the wiki\'s title and page come back unfolded, and back again', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        await press(page, BB_EVENT_BUTTON);
        const PARTS = { native: 'h2.mb-bb-native-h2', title: '#page-title', content: '#page-content', ours: '#main-content > table.tbl', toolbar: 'h1.mb-bb-h1', note: '#mb-orig-live-note' };
        expect(await shown(page, PARTS)).toEqual({ native: false, title: false, content: false, ours: true, toolbar: true, note: false });

        await clickToolbarItem(page, ROW);
        expect(await page.locator(FRAME).count(), 'no frame on a detail page').toBe(0);
        expect(await shown(page, PARTS)).toEqual({ native: false, title: true, content: true, ours: false, toolbar: false, note: true });
        await expect(page.locator('#mb-orig-live-note')).toContainText('Brucebase’s own page');
        // The wiki's own headings are not ours to fold.
        expect(await page.locator('#page-content h2.mb-toggle-h2').count()).toBe(0);

        await page.locator(BACK).click();
        expect(await shown(page, PARTS)).toEqual({ native: false, title: false, content: false, ours: true, toolbar: true, note: false });
    });
});

// The note names what does not work in that copy (vzell, 2026-11-25: the
// fixed "the site's own buttons may not respond here" stood on every copy;
// _origViewFrameDead(), measured by scripts/probe-orig-frame-controls.js).
test.describe('the note of the copy names what does not work in it', () => {
    const CASES = [
        {
            name: 'Brucebase songs: tabs work; search, sign-in and the page options do not',
            load: async (p) => { await loadBbSongsPage(p); return BB_BUTTON; },
            says: 'Links and tabs work; searching, signing in and the page’s own buttons (Edit, Tags, History …) do not.',
        },
        {
            name: 'jungleland.it: only the Year menu does not',
            load: async (p) => { await loadJlListPage(p); return JL_BUTTON; },
            says: 'Links work; the jump menu does not.',
        },
        {
            name: 'brucespringsteen.it: the filter form and the Section menu do not (one form wraps the page)',
            load: async (p) => { await loadBsRecordsPage(p); return 'Unofficial'; },
            says: 'Links work; the filter form and the jump menu do not.',
        },
    ];
    for (const c of CASES) {
        test(c.name, async ({ page }) => {
            const label = await c.load(page);
            await press(page, label);
            await clickToolbarItem(page, ROW);
            const note = page.frameLocator(FRAME).locator('#mb-orig-frame-note');
            await expect(note).toContainText(c.says);
            await expect(note).toContainText(`before you pressed “${label}”`);
            await expect(note).not.toContainText('may not respond');
        });
    }
});
