'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// MusicBrainz sidebar sections (_sb*, docs/claude/sidebar.md). Mockup
// approved 2026-10-10: https://claude.ai/artifact/9ZZtr9hR7uUGBPSk2ohvfW
//
// On Bruce Springsteen's real artist page (57 external links plus "View all relationships", Tags with its
// native Genres / Other tags h3s, Collections with its two h3s), after a
// render. The guarantees pinned:
//   - sections start closed when nothing is remembered (as before);
//   - a section you open is open again after a reload and render, and only on
//     the same kind of page; a closed one stays closed;
//   - Ctrl+Click opens every SIDEBAR section and leaves the main content's
//     headings alone;
//   - each heading counts its entries; Enter and Space toggle it;
//   - external links are grouped by kind WITHOUT moving a link: every link
//     stays in the same list with the same href; groups count right and fold;
//   - a native h3 (Genres) folds its own list and is remembered;
//   - another script's list item and heading are left where they are.

const URL = 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0';
const FIXTURE = path.join(__dirname, 'artist-releasegroups-live-titles.html');
const SETTINGS = { sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false };
const side = (page) => page.locator('#sidebar');
const h2 = (page, cls) => page.locator(`#sidebar h2.${cls}`);
const links = (page) => page.locator('#sidebar ul.external_links');

/**
 * Loads the artist page and renders it (the sidebar is enhanced at the end
 * of every render). `before` runs on the page first (another script's
 * additions, say).
 * @param {import('@playwright/test').Page} page
 * @param {Object} [opts]
 * @param {Object} [opts.settings]
 * @param {function(): void} [opts.before] - Evaluated in the page before the render.
 */
async function render(page, { settings = {}, before = null } = {}) {
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: { ...SETTINGS, ...settings } });
    await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    if (before) await page.evaluate(before);
    await page.click('button[data-label="🧮 Artist RGs"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await expect(side(page).locator('.mb-sb-bar')).toBeVisible();
}

/** Whether a sidebar h2's section is open, read from what is shown, not from the icon alone. */
const isOpen = (page, cls) => page.evaluate((c) => {
    const h = document.querySelector(`#sidebar h2.${c}`);
    const next = h.nextElementSibling;
    return { icon: h.querySelector('.mb-toggle-icon').textContent, aria: h.getAttribute('aria-expanded'), shown: !!next && next.style.display !== 'none' };
}, cls);

test.describe('MusicBrainz sidebar sections', () => {
    test('closed by default; a section opened stays open after a reload, and closed ones stay closed', async ({ page }) => {
        await render(page);
        expect(await isOpen(page, 'external-links')).toEqual({ icon: '▲', aria: 'false', shown: false });
        expect(await isOpen(page, 'artist-information')).toEqual({ icon: '▲', aria: 'false', shown: false });
        await h2(page, 'external-links').click();
        expect(await isOpen(page, 'external-links')).toEqual({ icon: '▼', aria: 'true', shown: true });
        // A second tab of the same browser: the same stored settings (a reload
        // would stop at the navigation guard's leave-page question).
        const page2 = await page.context().newPage();
        await render(page2);
        expect(await isOpen(page2, 'external-links'), 'remembered open').toEqual({ icon: '▼', aria: 'true', shown: true });
        expect(await isOpen(page2, 'artist-information'), 'never opened: closed').toEqual({ icon: '▲', aria: 'false', shown: false });
        const mem = await page2.evaluate(() => JSON.parse(window.GM_getValue('sa_sidebar_open_sections', '{}')));
        expect(mem, 'remembered per kind of page').toEqual({ artist: { 'external-links': true } });
    });

    test('Ctrl+Click opens every sidebar section and leaves the main headings alone', async ({ page }) => {
        await render(page);
        const mainBefore = await page.evaluate(() => Array.from(document.querySelectorAll('#content h2 > .mb-toggle-icon')).map((i) => i.textContent));
        await h2(page, 'editing').click({ modifiers: ['Control'] });
        const icons = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar h2 > .mb-toggle-icon')).map((i) => i.textContent));
        expect(icons.length).toBeGreaterThan(4);
        expect(new Set(icons)).toEqual(new Set(['▼']));
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('#content h2 > .mb-toggle-icon')).map((i) => i.textContent))).toEqual(mainBefore);
        await side(page).locator('[data-mb-sb-all="0"]').click();
        const after = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar h2 > .mb-toggle-icon')).map((i) => i.textContent));
        expect(new Set(after), 'Close all').toEqual(new Set(['▲']));
    });

    test('counts per heading; Enter and Space toggle', async ({ page }) => {
        await render(page);
        const nLinks = await page.evaluate(() => document.querySelectorAll('#sidebar ul.external_links > li:not(.mb-sbl-head):not(.all-relationships)').length);
        expect(nLinks, 'premise: the real page has its 57 external links').toBe(57);
        await expect(h2(page, 'external-links').locator('.mb-sb-count')).toHaveText(String(nLinks));
        const dt = await page.evaluate(() => document.querySelectorAll('#sidebar dl.properties > dt').length);
        await expect(h2(page, 'artist-information').locator('.mb-sb-count')).toHaveText(String(dt));
        await expect(h2(page, 'rating').locator('.mb-sb-count')).toHaveCount(0);
        await h2(page, 'editing').focus();
        await page.keyboard.press('Enter');
        expect((await isOpen(page, 'editing')).icon).toBe('▼');
        await page.keyboard.press(' ');
        expect((await isOpen(page, 'editing')).icon).toBe('▲');
    });

    test('links are grouped by kind without moving one; a group folds and is remembered', async ({ page }) => {
        await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: SETTINGS });
        const before = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar ul.external_links > li > a')).map((a) => a.href));
        await page.route(`${URL}*`, (r) => r.fulfill({ path: FIXTURE, contentType: 'text/html' }));
        await page.click('button[data-label="🧮 Artist RGs"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await h2(page, 'external-links').click();
        const after = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar ul.external_links > li:not(.mb-sbl-head) > a')).map((a) => a.href));
        expect(after, 'same links, same list, same DOM order').toEqual(before);
        const heads = links(page).locator('li.mb-sbl-head');
        await expect(heads.first()).toContainText('Official');
        const official = links(page).locator('li[data-mb-sbl-kind="Official"]:not(.mb-sbl-head)');
        await expect(official).toHaveCount(1);
        await expect(official.locator('a')).toHaveAttribute('href', 'https://brucespringsteen.net/');
        await expect(links(page).locator('li.spotify-favicon')).toHaveAttribute('data-mb-sbl-kind', 'Streaming');
        const sum = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar li.mb-sbl-head .mb-sb-count')).reduce((s, c) => s + Number(c.textContent), 0));
        expect(sum, 'every external link is in exactly one group ("View all relationships" in none)').toBe(before.length - 1);
        const tail = await page.evaluate(() => { const t = document.querySelector('#sidebar ul.external_links > li.all-relationships');
            const max = Math.max(...Array.from(document.querySelectorAll('#sidebar ul.external_links > li')).map((li) => Number(li.style.order)));
            return { kind: t.dataset.mbSblKind || '', last: Number(t.style.order) === max }; });
        expect(tail, '"View all relationships" stays last, ungrouped').toEqual({ kind: '', last: true });
        // Shown order: Official first, then Social.
        const firstShown = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar ul.external_links > li'))
            .sort((a, b) => Number(a.style.order) - Number(b.style.order)).slice(0, 3).map((li) => li.dataset.mbSblKind + (li.classList.contains('mb-sbl-head') ? ':head' : '')));
        expect(firstShown).toEqual(['Official:head', 'Official', 'Social:head']);
        const streamHead = links(page).locator('li.mb-sbl-head[data-mb-sbl-kind="Streaming"]');
        await streamHead.click();
        await expect(links(page).locator('li.spotify-favicon')).toBeHidden();
        await expect(official).toBeVisible();
        const mem = await page.evaluate(() => JSON.parse(window.GM_getValue('sa_sidebar_open_sections', '{}')));
        expect(mem.artist['external-links>streaming']).toBe(false);
        // Closing and reopening the section keeps the folded group folded.
        await h2(page, 'external-links').click();
        await h2(page, 'external-links').click();
        await expect(links(page).locator('li.spotify-favicon')).toBeHidden();
        await expect(official).toBeVisible();
    });

    test('a closed section never hides the next one: Tags (in its own wrapper) stays visible', async ({ page }) => {
        await render(page);
        expect((await isOpen(page, 'artist-information')).icon, 'premise: Artist information is closed').toBe('▲');
        const tagsH2 = page.locator('#sidebar h2', { hasText: 'Tags' });
        await expect(tagsH2).toBeVisible();
        const ownWrapper = await tagsH2.evaluate((h) => h.parentElement.id !== 'sidebar');
        expect(ownWrapper, 'premise: MusicBrainz wraps Tags in its own element').toBe(true);
        await expect(h2(page, 'artist-information').locator('.mb-sb-count'), 'the count does not include the tags')
            .toHaveText(String(await page.evaluate(() => document.querySelectorAll('#sidebar dl.properties > dt').length)));
    });

    test('a native h3 folds its own list and is remembered', async ({ page }) => {
        await render(page);
        const tagsH2 = page.locator('#sidebar h2', { hasText: 'Tags' });
        await tagsH2.click();
        const genres = page.locator('#sidebar h3.mb-sb-h3', { hasText: 'Genres' });
        await expect(page.locator('#sidebar ul.genre-list')).toBeVisible();
        await genres.click();
        await expect(page.locator('#sidebar ul.genre-list')).toBeHidden();
        await expect(genres).toHaveAttribute('aria-expanded', 'false');
        const mem = await page.evaluate(() => JSON.parse(window.GM_getValue('sa_sidebar_open_sections', '{}')));
        expect(mem.artist['text:tags>genres']).toBe(false);
        await tagsH2.click();
        await tagsH2.click();
        await expect(page.locator('#sidebar ul.genre-list'), 'reopening Tags keeps Genres folded').toBeHidden();
    });

    test("another script's list item and heading are left where they are", async ({ page }) => {
        await render(page, {
            before: () => {
                const ul = document.querySelector('#sidebar ul.external_links');
                const li = document.createElement('li');
                li.id = 'foreign-li';
                li.innerHTML = '<a href="https://example.org/x">Their link</a>';
                ul.appendChild(li);
                const h = document.createElement('h2');
                h.id = 'foreign-h2';
                h.textContent = 'Search the web';
                const list = document.createElement('ul');
                list.id = 'foreign-list';
                list.innerHTML = '<li><a href="https://example.org/s">Web pages</a></li>';
                document.querySelector('#sidebar h2.external-links').parentNode.appendChild(h);
                h.after(list);
            },
        });
        const where = await page.evaluate(() => ({
            liParent: document.getElementById('foreign-li').parentElement.className,
            liLast: document.querySelector('#sidebar ul.external_links > li:not(.mb-sbl-head):last-of-type') === document.getElementById('foreign-li')
                || Array.from(document.querySelectorAll('#sidebar ul.external_links > li:not(.mb-sbl-head)')).pop() === document.getElementById('foreign-li'),
            kind: document.getElementById('foreign-li').dataset.mbSblKind,
            h2Next: document.getElementById('foreign-h2').nextElementSibling.id,
            h2Toggle: !!document.querySelector('#foreign-h2 > .mb-toggle-icon'),
        }));
        expect(where).toEqual({ liParent: 'external_links mb-sbl-grouped', liLast: true, kind: 'Other', h2Next: 'foreign-list', h2Toggle: true });
    });

    test('settings off: no counts, no groups; "open every section" opens them all', async ({ page }) => {
        await render(page, { settings: { sa_sidebar_section_counts: false, sa_sidebar_link_groups: false, sa_sidebar_open_all: true } });
        await expect(side(page).locator('.mb-sb-count')).toHaveCount(0);
        await expect(side(page).locator('li.mb-sbl-head')).toHaveCount(0);
        const icons = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebar h2 > .mb-toggle-icon')).map((i) => i.textContent));
        expect(new Set(icons)).toEqual(new Set(['▼']));
    });
});
