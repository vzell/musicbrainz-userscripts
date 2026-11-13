'use strict';

// bb-event (org/brucebase.org, Plan 2026-11-11, Phase 2; mockup M1,
// https://claude.ai/artifact/3rAGVKsBHEv9jGspkJ5X7Z): a Brucebase event page
// (gig, no gig, recording session, rehearsal, interview) as a detail view —
// the head (byline, About, Event/Tags/Media cards, the pictures by kind and
// photographer) and a sub-table per kind of list, the wiki's own page below,
// folded. Fixtures: six real pages from the BruceParser mirror
// (scripts/build-bb-event-fixtures.py).
//
// Pinned against the FIXTURE, read here independently of the script (row
// counts from the page's own tabs, not from what the script rendered):
// the gates (Brucebase off, sa_bb_detail_pages off); one button; the tables,
// their exact headers and row counts; vzell's answers 1 (one Setlist table,
// the set a column), 2 (Storyteller a table, its songs linked), 5 (the wiki's
// page folded below, untouched), 6 (MusicBrainz title case, the wiki's
// capitals as the hover text); the head's cards and pictures; no
// MusicBrainz/CAA request; Save → Load from Disk.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbEventPage, BB_EVENT_PAGES, BB_EVENT_BUTTON } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

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
 * Presses the event page's button and waits for the render.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function showEvent(page) {
    await page.click(`button[data-label="${BB_EVENT_BUTTON}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * The rendered sub-tables: name (the h3's own text), headers, rows as
 * cell texts, keyed by name.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object<string, {headers: string[], rows: string[][]}>>}
 */
function tables(page) {
    return page.evaluate(() => {
        const out = {};
        document.querySelectorAll('table.tbl').forEach((t) => {
            const h3 = t.previousElementSibling && t.previousElementSibling.tagName === 'H3' ? t.previousElementSibling : null;
            if (!h3) return;
            // The h3 holds its controls after the name and count: "▼On stage (8)↔️👁️…".
            const m = h3.textContent.replace(/[▲▼]/g, '').trim().match(/^(.*?)\s*\(\d+\)/);
            const name = m ? m[1] : h3.textContent.trim();
            out[name] = {
                headers: Array.from(t.tHead.rows[0].cells, c => c.dataset.colName || c.textContent.trim()),
                rows: Array.from(t.tBodies[0].rows, r => Array.from(r.cells, c => c.textContent.replace(/\s+/g, ' ').trim())),
            };
        });
        return out;
    });
}

/**
 * Counts in the FIXTURE, read with a plain DOM (not the script): items of a
 * tab by its label, and the page's tags and gallery pictures.
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @returns {Promise<{tab: Object<string, number>, tags: number, pictures: number}>}
 */
function fixtureCounts(page, key) {
    const html = fs.readFileSync(BB_EVENT_PAGES[key].file, 'utf8');
    return page.evaluate((h) => {
        const d = new DOMParser().parseFromString(h, 'text/html');
        const nav = d.querySelector('#page-content div.yui-navset');
        const labels = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li'), li => li.textContent.trim());
        const panels = Array.from(nav.querySelector(':scope > .yui-content').children);
        const tab = {};
        labels.forEach((l, i) => { tab[l] = panels[i].querySelectorAll('li').length; });
        return {
            tab,
            tags: d.querySelectorAll('div.page-tags a[href*="/system:page-tags/tag/"]').length,
            pictures: d.querySelectorAll('#page-content .gallery-box .gallery-item img').length,
        };
    }, html);
}

test.describe('bb-event: gates', () => {
    test('with Brucebase support off, an event page is left alone', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07', { enabled: false });
        await expect(page.locator('button[data-label]')).toHaveCount(0);
        await expect(page.locator('#page-title')).toBeVisible();
    });

    test('with sa_bb_detail_pages off, an event page has no button (link previews only, bb-page)', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'gig-1978-07-07', { detail: false });
        await expect(page.locator('button[data-label]')).toHaveCount(0);
        await expect(page.locator('h1.mb-bb-preview-only')).toBeHidden();
        await expect(page.locator('#page-title')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('with it on (the default), one button and nothing changed before it is pressed', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07', { settingsOverride: { sa_bb_detail_pages: undefined } });
        await expect(page.locator('button[data-label]')).toHaveCount(1);
        await expect(page.locator(`button[data-label="${BB_EVENT_BUTTON}"]`)).toBeVisible();
        await expect(page.locator('table.tbl')).toHaveCount(0);
        await expect(page.locator('#page-content')).toBeVisible();
    });
});

test.describe('bb-event: the 1978-07-07 Roxy gig', () => {
    test('the sub-tables, their headers and rows, counted from the page\'s own tabs', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'gig-1978-07-07');
        const c = await fixtureCounts(page, 'gig-1978-07-07');
        await showEvent(page);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Setlist', 'On stage', 'Performances', 'Appearances', 'Recording', 'Storyteller']);
        expect(t.Setlist.headers).toEqual(['Set', '#', 'Song', 'Segue', 'Premiere', 'Note']);
        expect(t['On stage'].headers).toEqual(['Name', 'Band', 'Role']);
        expect(t.Performances.headers).toEqual(['Date', 'Event', 'Show', 'Type']);
        expect(t.Recording.headers).toEqual(['Release', 'Kind', 'Label']);
        expect(t.Storyteller.headers).toEqual(['Moment', 'Song', 'Words']);
        // Every sub-table starts open (features.openSubTables): a detail
        // page's few tables are its content.
        expect(await page.evaluate(() => Array.from(document.querySelectorAll('table.tbl'))
            .filter(x => x.previousElementSibling && x.previousElementSibling.tagName === 'H3')
            .map(x => getComputedStyle(x).display))).toEqual(Array(6).fill('table'));
        expect(t.Setlist.rows).toHaveLength(c.tab.Setlist);
        expect(t['On stage'].rows).toHaveLength(c.tab['On Stage']);
        expect(t.Performances.rows).toHaveLength(c.tab.Performances);
        expect(t.Appearances.rows).toHaveLength(c.tab.Appearances);
        // Answer 1: one Setlist table, the set a column ("Show" where the
        // page names none), numbered within the set.
        expect(new Set(t.Setlist.rows.map(r => r[0]))).toEqual(new Set(['Show']));
        expect(t.Setlist.rows.map(r => Number(r[1]))).toEqual(t.Setlist.rows.map((r, i) => i + 1));
        // A premiere in bold; a segue "MONA - SHE'S THE ONE" is one row.
        const row = (title) => t.Setlist.rows.find(r => r[2] === title);
        expect(row('Rave On')[4]).toBe('★');
        expect(row('Badlands')[4]).toBe('');
        expect(row('Mona')[3]).toMatch(/^→ She[’']s the One$/);
        // A band's members carry the band; the band its own row.
        expect(t['On stage'].rows).toContainEqual(['Roy Bittan', 'The E Street Band', '']);
        expect(t['On stage'].rows).toContainEqual(['The E Street Band', '', '']);
        // The page's own entry in Performances, bold, not linked; an Early/Late show.
        expect(t.Performances.rows).toContainEqual(['1978-07-07', 'Roxy Theatre (The), West Hollywood, CA (this page)', '', 'Gig']);
        expect(t.Performances.rows).toContainEqual(['1975-10-18', 'Roxy Theatre (The), West Hollywood, CA', 'Late', 'Gig']);
        expect(t.Appearances.rows).toEqual([['1982-03', 'Roxy Theatre (The), West Hollywood, CA', '', 'No gig']]);
        // Recording: a bootleg with its label, the official releases, the live download.
        expect(t.Recording.rows).toContainEqual(['Roxy Night', 'Bootleg', 'Crystal Cat']);
        expect(t.Recording.rows).toContainEqual(['Live/1975-85', 'Official', '']);
        expect(t.Recording.rows).toContainEqual(['Live download · 1978-07-07', 'Live download', '']);
        // Answer 2: Storyteller a table, a row per "Intro to …" heading.
        const html = fs.readFileSync(BB_EVENT_PAGES['gig-1978-07-07'].file, 'utf8');
        const stories = await page.evaluate((h) => {
            const d = new DOMParser().parseFromString(h, 'text/html');
            const nav = d.querySelector('#page-content div.yui-navset');
            const i = Array.from(nav.querySelectorAll(':scope > ul.yui-nav > li'), li => li.textContent.trim()).indexOf('Storyteller');
            return Array.from(nav.querySelector(':scope > .yui-content').children[i].querySelectorAll('p > strong:first-child'))
                .filter(s => /["“´]/.test(s.textContent)).length;
        }, html);
        expect(t.Storyteller.rows).toHaveLength(stories);
        expect(t.Storyteller.rows[0].slice(0, 2)).toEqual(['Intro to', 'Rave On']);
        // Nothing asked of MusicBrainz or the archives.
        expect(requests.filter(u => /musicbrainz\.org|coverartarchive|eventartarchive/.test(u))).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('songs: MusicBrainz case, the wiki\'s capitals as the hover text, linked to their pages (answer 6)', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        await showEvent(page);
        const a = page.locator('table.tbl a[href="https://brucebase.wikidot.com/song:spirit-in-the-night"]').first();
        await expect(a).toHaveText('Spirit in the Night');
        await expect(a.locator('xpath=..')).toHaveAttribute('title', 'As written on Brucebase:\nSPIRIT IN THE NIGHT');
        // A Storyteller song links the setlist's page for it.
        const story = page.locator('table.tbl tbody tr', { hasText: 'Intro to' }).first();
        await expect(story.locator('a[href="https://brucebase.wikidot.com/song:rave-on"]')).toHaveCount(1);
    });

    test('the head: byline, About, the Event card, Tags, Media, the pictures by kind and photographer', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const c = await fixtureCounts(page, 'gig-1978-07-07');
        await showEvent(page);
        await expect(page.locator('p.mb-fd-sub')).toHaveText('~ Gig at Roxy Theatre (The), West Hollywood, CA (1978-07-07)');
        const heads = await page.locator('.mb-fd-head > h2').evaluateAll(hs => hs.map(h => h.textContent.replace(/[▲▼]/g, '').trim()));
        expect(heads).toEqual(['About this show', 'Recording notes', 'Eyewitness', 'News/Memorabilia', expect.stringMatching(/^Details \(\d+\)$/), `Pictures (${c.pictures})`]);
        const card = (name) => page.locator('.mb-fd-details .mb-sb-card', { has: page.locator('.mb-sb-card-head', { hasText: new RegExp(`^${name}`) }) });
        const ev = await card('Event').locator('dt, dd').evaluateAll(ns => ns.map(n => n.textContent.trim()));
        const kv = {};
        for (let i = 0; i < ev.length; i += 2) kv[ev[i]] = ev[i + 1];
        expect(kv).toEqual(expect.objectContaining({
            Type: 'Gig', Date: '1978-07-07 (Friday)', Scheduled: '21:00 · start and end not known',
            Venue: 'Roxy Theatre (The), West Hollywood, CA', Tour: 'doteot', 'Year page': '1978#070778', 'Running time': '3:06:17',
        }));
        await expect(card('Event').locator('dd a[href="https://brucebase.wikidot.com/venue:roxy-theatre-west-hollywood-ca"]')).toHaveCount(1);
        await expect(card('Tags').locator('.mb-sb-chip a')).toHaveCount(c.tags);
        await expect(card('Tags').locator('.mb-sb-chip-kind').first()).toHaveText('Date');
        await expect(card('Media').locator('.mb-sb-chip a')).toHaveCount(2);
        // The pictures' chips: a kind each, Photo once per photographer (answer 3).
        const chips = await page.locator('.mb-fd-art').first().evaluate(sec => sec.textContent);
        expect(chips).toContain('Photo · Cliff Breining');
        expect(chips).toContain('Ticket');
    });

    test('the wiki\'s page is below, folded, and as it was (answer 5)', async ({ page }) => {
        await loadBbEventPage(page, 'gig-1978-07-07');
        const text = (el) => el.textContent.replace(/[▲▼]/g, '').replace(/\s+/g, ' ').trim();
        const before = await page.locator('#page-content').evaluate(text);
        await showEvent(page);
        const native = page.locator('h2.mb-bb-native-h2');
        await expect(native).toHaveCount(1);
        await expect(page.locator('#page-content')).toBeHidden();
        // Our data heading comes first, the wiki's page after it.
        expect(await page.evaluate(() => {
            const ours = document.querySelector('h2.mb-bb-event-heading');
            return !!(ours.compareDocumentPosition(document.querySelector('h2.mb-bb-native-h2')) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);
        await native.click();
        await expect(page.locator('#page-content')).toBeVisible();
        // As it was, in words: the wiki's own h2s (an article's title in
        // News/Memorabilia) fold like ours — a toggle icon each, their text
        // wrapped — which is the only change.
        expect(await page.locator('#page-content').evaluate(text)).toBe(before);
        const own = page.locator('#page-content h2.mb-toggle-h2');
        expect(await own.count()).toBeGreaterThan(0);
    });
});

test.describe('bb-event: link previews in the rendered tables (FRP)', () => {
    // docs/non-mb-coverage.json, bb-event "frp": a person's link in On stage
    // is one of this host's detail pages (`ownLinks`): Ctrl+hover shows its
    // card, read through the detail-page reader (a request for that page).
    test('a person in On stage previews', async ({ page }) => {
        const errors = trackPageErrors(page);
        const { requests } = await loadBbEventPage(page, 'gig-1978-07-07', {
            settingsOverride: { sa_bb_event_preview: true, sa_pop_ext: true, sa_rich_tooltip_delay_ms: 0 },
        });
        await showEvent(page);
        const a = page.locator('table.tbl tbody a[href="https://brucebase.wikidot.com/relation:max-weinberg"]').first();
        await a.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.keyboard.down('Control');
        await a.hover();
        await page.keyboard.up('Control');
        await expect(page.locator('#mb-dp-peek')).toBeVisible();
        await expect.poll(() => requests).toContain('https://brucebase.wikidot.com/relation:max-weinberg');
        expect(errors).toEqual([]);
    });
});

test.describe('bb-event: the other kinds of event', () => {
    test('a gig with a soundcheck: the Set column says Soundcheck and Show', async ({ page }) => {
        await loadBbEventPage(page, 'gig-2005-06-20');
        const c = await fixtureCounts(page, 'gig-2005-06-20');
        await showEvent(page);
        const t = await tables(page);
        expect(t.Setlist.rows).toHaveLength(c.tab.Setlist);
        const sets = t.Setlist.rows.map(r => r[0]);
        expect(sets[0]).toBe('Soundcheck');
        expect(sets[sets.length - 1]).toBe('Show');
        expect(sets.indexOf('Show')).toBeGreaterThan(0);
        expect(t.Setlist.rows.find(r => r[0] === 'Show')[1]).toBe('1');
        expect(t['On stage'].rows).toContainEqual(['Elliott Murphy', '', '(Guest)']);
    });

    test('a recording session: its cast is "In studio", its About says session', async ({ page }) => {
        await loadBbEventPage(page, 'recording-1979-04-09');
        await showEvent(page);
        const t = await tables(page);
        expect(Object.keys(t)).toContain('In studio');
        expect(t['In studio'].rows[0][0]).toBe('Bruce Springsteen');
        await expect(page.locator('p.mb-fd-sub')).toHaveText(/^~ Recording session at Power Station, New York City, NY \(1979-04-09\)$/);
        await expect(page.locator('.mb-fd-head > h2').first()).toContainText('About this session');
    });

    test('an interview: its other tabs (Playlist, From My Home To Yours) are text sections', async ({ page }) => {
        await loadBbEventPage(page, 'interview-2021-04-28');
        await showEvent(page);
        const heads = await page.locator('.mb-fd-head > h2').evaluateAll(hs => hs.map(h => h.textContent.replace(/[▲▼]/g, '').trim()));
        expect(heads).toEqual(expect.arrayContaining(['About this interview', 'Playlist', 'From My Home To Yours']));
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(expect.arrayContaining(['In studio', 'Performances', 'Appearances']));
    });

    test('a no gig: no Setlist table, its Appearances list', async ({ page }) => {
        await loadBbEventPage(page, 'nogig-2013-04-16');
        await showEvent(page);
        const t = await tables(page);
        expect(Object.keys(t)).toEqual(['Appearances']);
        expect(t.Appearances.rows[0][1]).toMatch(/\(this page\)$/);
        await expect(page.locator('p.mb-fd-sub')).toContainText('~ No gig at Richard Rodgers Theatre');
    });

    test('a rehearsal renders its setlist and cast', async ({ page }) => {
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'rehearsal-2009-01-29a');
        const c = await fixtureCounts(page, 'rehearsal-2009-01-29a');
        await showEvent(page);
        const t = await tables(page);
        expect(t.Setlist.rows).toHaveLength(c.tab.Setlist);
        expect(t['On stage'].rows.length).toBeGreaterThan(5);
        expect(errors).toEqual([]);
    });
});

test.describe('bb-event: Save to Disk → Load from Disk', () => {
    let tmpDir;
    test.beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bb-event-')); });
    test.afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('a reopened event renders its tables again, the wiki\'s page below', async ({ context }) => {
        const source = await context.newPage();
        await loadBbEventPage(source, 'gig-1978-07-07');
        await showEvent(source);
        const before = await tables(source);
        const downloadPromise = source.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source, '#mb-save-to-disk-btn');
        await source.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.click('#sa-sd-save-confirm');
        const saved = path.join(tmpDir, 'bb-event.json.gz');
        await (await downloadPromise).saveAs(saved);
        await source.close();

        const page = await context.newPage();
        const errors = trackPageErrors(page);
        await loadBbEventPage(page, 'gig-1978-07-07');
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
