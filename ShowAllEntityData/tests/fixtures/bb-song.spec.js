'use strict';

// bb-song and bb-ott (org/brucebase.org, Plan 2026-11-11, Phase 3; mockup M3,
// https://claude.ai/artifact/3rAGVKsBHEv9jGspkJ5X7Z): a Brucebase song page
// and an On The Tracks page as a detail view. Fixtures: real pages from the
// BruceParser mirror, lyrics blanked (scripts/build-bb-event-fixtures.py).
//
// Pinned against the FIXTURE, read here with a plain DOM (counts from the
// page's own tabs): the gate; the tables, their headers and rows; Credits'
// person and note rows; the breakdown by tour (only tours the song was
// played on, its share); which tables start open; titles in MusicBrainz
// case; the head's texts and cards; an event link in a table previews; the
// On The Tracks page; Save → Load from Disk.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage, BB_EVENT_PAGES } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const SONG_BUTTON = 'Show the song';
const OTT_BUTTON = 'Show the versions';

/**
 * Collects uncaught page errors.
 * @param {import('@playwright/test').Page} page
 * @returns {string[]}
 */
function trackPageErrors(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e)));
    return errors;
}

/**
 * Presses a button and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function press(page, label) {
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The rendered sub-tables by name: headers, rows (cell texts), open or not.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {headers: string[], rows: string[][], open: boolean}>>}
 */
function tables(page) {
    return page.evaluate(() => {
        const out = {};
        document.querySelectorAll('table.tbl').forEach((t) => {
            const h3 = t.previousElementSibling && t.previousElementSibling.tagName === 'H3' ? t.previousElementSibling : null;
            if (!h3) return;
            const m = h3.textContent.replace(/[▲▼]/g, '').trim().match(/^(.*?)\s*\(\d+\)/);
            out[m ? m[1] : h3.textContent.trim()] = {
                headers: Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim()),
                rows: Array.from(t.tBodies[0].rows, r => Array.from(r.cells, c => c.textContent.replace(/\s+/g, ' ').trim())),
                open: getComputedStyle(t).display !== 'none',
            };
        });
        return out;
    });
}

/**
 * Counts in the FIXTURE, read with a plain DOM: the items of each tab (the
 * Performances tab: its left cell only), the On The Tracks rows, the tours
 * with a non-zero "Performed at N show(s)".
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @returns {Promise<{tab: Object<string, number>, ott: number, tours: number}>}
 */
function fixtureCounts(page, key) {
    const html = fs.readFileSync(BB_EVENT_PAGES[key].file, 'utf8');
    return page.evaluate((h) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const nav = d.querySelector('#page-content div.yui-navset');
        const tab = {};
        let ott = 0;
        let tours = 0;
        const root = nav ? null : d.getElementById('page-content');
        if (nav) {
            const labels = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li'), li => li.textContent.trim());
            const panels = Array.from(nav.querySelector(':scope > .yui-content').children);
            labels.forEach((l, i) => {
                const p = panels[i];
                const left = l === 'Performances' && p.querySelector('table td') ? p.querySelector('table td') : p;
                tab[l] = left.querySelectorAll('li').length;
                if (l === 'On The Tracks') ott = Array.from(p.querySelectorAll('tr')).filter(tr => tr.children.length >= 3).length;
                if (l === 'Performances') {
                    tours = Array.from(p.querySelectorAll('li')).filter(li => /Performed at\s+[1-9]\d*\s+show/.test(li.textContent)).length;
                }
            });
        } else {
            ott = Array.from(root.querySelectorAll('tr')).filter(tr => tr.children.length >= 3).length;
        }
        return { tab, ott, tours };
    }, html);
}

test.describe('bb-song: the gate', () => {
    test('with sa_bb_detail_pages off, a song page has no button', async ({ page }) => {
        await loadBbEventPage(page, 'song-the-promise', { detail: false });
        await expect(page.locator('button[data-label]')).toHaveCount(0);
        await expect(page.locator('#page-title')).toBeVisible();
    });
});

test.describe('bb-song: "The Promise"', () => {
    test('the sub-tables, their headers and rows, counted from the page\'s own tabs; which start open', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'song-the-promise');
        const c = await fixtureCounts(page, 'song-the-promise');
        await press(page, SONG_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Credits', 'Performances by tour', 'Performances', 'Multiples', 'Live downloads', 'On The Tracks']);
        expect(t.Credits.headers).toEqual(['Release', 'Year', 'Person', 'Role']);
        expect(t['Performances by tour'].headers).toEqual(['Tour', 'Played', 'Shows', 'Share']);
        expect(t.Performances.headers).toEqual(['Date', 'Event', 'Show', 'Type']);
        expect(t['On The Tracks'].headers).toEqual(['Title', 'Version', 'Time', 'Releases']);
        expect(t.Performances.rows).toHaveLength(c.tab.Performances);
        expect(t.Multiples.rows).toHaveLength(c.tab.Multiples);
        expect(t['Live downloads'].rows).toHaveLength(c.tab['Released as Live Download']);
        expect(t['On The Tracks'].rows).toHaveLength(c.ott);
        // Credits: a row per person under each release, its year; a line
        // under a person naming no one is a row of its own.
        expect(t.Credits.rows).toContainEqual(['18 Tracks', '1999', 'Bruce Springsteen', 'vocals, piano']);
        expect(t.Credits.rows).toContainEqual(['The Promise', '2010', 'Max Weinberg', 'drums']);
        expect(t.Credits.rows).toContainEqual(['The Promise', '2010', '', 'String arrangement by Ken Asher']);
        // By tour: only the tours it was played on, each with its share.
        expect(t['Performances by tour'].rows).toHaveLength(c.tours);
        expect(t['Performances by tour'].rows.every(r => Number(r[1]) > 0)).toBe(true);
        expect(t['Performances by tour'].rows).toContainEqual(['The River Tour 2016', '1', '75', '1 %']);
        // A Multiples row is a "multi" page: several shows on one date.
        expect(t.Multiples.rows[0][3]).toBe('Multiple shows');
        // On The Tracks: title and take split; every release linked.
        expect(t['On The Tracks'].rows[0]).toEqual(['The Promise', 'V1', '5:32', 'DO-2 / UP / SOTE / LUTHER']);
        // Open at first: the short tables; the long lists stay folded.
        expect(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.open]))).toEqual({
            Credits: true, 'Performances by tour': true, Performances: false, Multiples: true, 'Live downloads': false, 'On The Tracks': true,
        });
        expect(requests.filter(u => /musicbrainz\.org|coverartarchive|eventartarchive/.test(u))).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('titles in MusicBrainz case with the wiki\'s capitals on hover; links to the releases', async ({ page }) => {
        await loadBbEventPage(page, 'song-the-promise');
        await press(page, SONG_BUTTON);
        const cell = page.locator('table.tbl tbody tr', { hasText: 'V1' }).first().locator('td').first();
        await expect(cell.locator('[data-mb-tip]')).toHaveAttribute('title', 'As written on Brucebase:\nTHE PROMISE');
        await expect(page.locator('table.tbl a[href="https://brucebase.wikidot.com/bootleg:darkness-outtakes-1978-vol-2-scrp"]').first()).toHaveText('DO-2');
        await expect(page.locator('table.tbl a[href="https://brucebase.wikidot.com/relation:roy-bittan"]').first()).toHaveText('Roy Bittan');
    });

    test('the head: About, the word tabs, the Song card, Tags, Media, Links', async ({ page }) => {
        await loadBbEventPage(page, 'song-the-promise');
        await press(page, SONG_BUTTON);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Song');
        const heads = await page.locator('.mb-fd-head > h2').evaluateAll(hs => hs.map(h => h.textContent.replace(/[▲▼]/g, '').trim()));
        expect(heads).toEqual(['About this song', 'Released on Album', 'On The Tracks notes', 'Lyrics', expect.stringMatching(/^Details \(\d+\)$/)]);
        const card = (name) => page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) });
        const kv = await card('Song').locator('dt, dd').evaluateAll(ns => {
            const o = {};
            for (let i = 0; i < ns.length; i += 2) o[ns[i].textContent.trim()] = ns[i + 1].textContent.replace(/\s+/g, ' ').trim();
            return o;
        });
        expect(kv).toEqual(expect.objectContaining({
            'Performed live': '73 times', 'Last played': '2016-06-25 Ullevi, Gothenburg, Sweden', 'Live downloads': '10', Versions: '10',
        }));
        expect(kv['Released on']).toContain('18 Tracks (1999)');
        await expect(card('Links').locator('.mb-sb-chip a', { hasText: 'MusicBrainz' })).toHaveCount(1);
        await expect(card('Media').locator('.mb-sb-chip a')).toHaveCount(1);
        await expect(card('Tags').locator('.mb-sb-chip a').first()).toBeVisible();
        // The origin, as the page writes it before its tabs.
        await page.locator('.mb-fd-head > h2', { hasText: 'About this song' }).click();
        await expect(page.locator('.mb-fd-head .mb-fd-text').first()).toContainText('Track 18 of 18 Tracks, 1999.');
    });

    // A person's page is one of this host's detail pages (`ownLinks`); a
    // "multi" page (Multiples) is not, so it is not the link used here.
    test('a person in Credits previews (FRP)', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'song-the-promise', {
            settingsOverride: { sa_bb_event_preview: true, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 },
        });
        await press(page, SONG_BUTTON);
        const multi = page.locator('table.tbl tbody a[href="https://brucebase.wikidot.com/relation:roy-bittan"]:visible').first();
        await multi.scrollIntoViewIfNeeded();
        const target = await multi.getAttribute('href');
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await multi.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect.poll(() => requests).toContain(target);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-song: other pages', () => {
    test('a song with snippets and no credits', async ({ page }) => {
        await loadBbEventPage(page, 'song-we-gotta-get-out-of-this-place');
        const c = await fixtureCounts(page, 'song-we-gotta-get-out-of-this-place');
        await press(page, SONG_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).not.toContain('Credits');
        expect(t.Snippets.rows).toHaveLength(c.tab.Snippets);
        expect(t.Performances.rows).toHaveLength(c.tab.Performances);
        const dd = await page.locator('.mb-fd-details dt', { hasText: /^Snippets$/ }).locator('xpath=following-sibling::dd[1]').textContent();
        expect(dd.trim()).toBe(`${c.tab.Snippets} times`);
    });

    test('an On The Tracks page: its takes as one table, "uncirculating" where no release has it', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'ott-do-you-want-me-to-say-alright');
        const c = await fixtureCounts(page, 'ott-do-you-want-me-to-say-alright');
        await expect(page.locator('button[data-label]')).toHaveCount(1);
        await press(page, OTT_BUTTON);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['On The Tracks']);
        expect(t['On The Tracks'].rows).toHaveLength(c.ott);
        expect(t['On The Tracks'].rows).toContainEqual(['Do You Want Me to Say Alright', 'V9', '', 'uncirculating']);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ On The Tracks');
        const vers = await page.locator('.mb-fd-details dt', { hasText: /^Versions$/ }).locator('xpath=following-sibling::dd[1]').textContent();
        expect(vers.trim()).toBe(String(c.ott));
        expect(errors).toEqual([]);
    });
});

test.describe('bb-song: Save to Disk → Load from Disk', () => {
    let tmpDir;
    test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-song-')); });
    test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('a reopened song renders its tables again', async ({ context }) => {
        const source = await context.newPage();
        await loadBbEventPage(source, 'song-the-promise');
        await press(source, SONG_BUTTON);
        const before = await tables(source);
        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-song.json.gz');
        await (await downloadPromise).saveAs(saved);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'song-the-promise');
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const after = await tables(page);
        expect(Object.keys(after)).toEqual(Object.keys(before));
        Object.keys(before).forEach((k) => expect(after[k].rows.length, k).toBe(before[k].rows.length));
        await expect(page.locator('h2.mb-bb-native-h2')).toHaveCount(1);
        expect(errors).toEqual([]);
    });
});
