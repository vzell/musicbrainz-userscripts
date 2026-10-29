'use strict';

// release-tracks: work suggestions for the tracks whose "Recording of work"
// cell is empty (_wsug*, sa_release_tracks_work_suggest). Only those cells get
// a 💡; nothing is requested until ▶💡 or a 💡 cell is clicked; then each
// track ARTIST's work list is loaded once (the same matcher and IndexedDB
// store as the artist Recordings page's suggestions) and the closest title is
// shown in orange. A suggestion is not a link: the 🚫 no-work count, the
// Title flag and the cells that do have a work stay exactly as they were.
//
// Fixture: "Live and Swingin': The Ultimate Rat Pack Collection" (25 tracks,
// 4 without a work — see release-tracks-no-work-flag.spec.js). Their artists:
//   Fanfare & Introduction       Matty Malneck
//   Comedy                       Frank Sinatra, Dean Martin
//   Impressions                  Frank Sinatra, Dean Martin, Sammy Davis Jr.
//   Danny Thomas Introduction    Frank Sinatra, Dean Martin, Sammy Davis Jr.
// The work lists below are made up for the test, served by a WS/2 mock.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { clickToolbarItem } = require('../support/toolbarMenu');

const RELEASE_URL = 'https://musicbrainz.org/release/a9a3b139-cf22-4d28-801e-3f3d49521d0e';
const FIXTURE = path.join(__dirname, 'release-tracks-medley.html');
const SETTINGS = { sa_enable_release_tracks: true };
const THIRD_PARTY = [/supported-browser-check/, /Unexpected token '<'/];

const MALNECK = 'f81cf9ba-53fc-4b02-88ca-853689320111';
const SINATRA = '197450cd-0124-4164-b723-3c22dd16494d';
const MARTIN = '5e6c760b-42e0-4df4-a221-0269355da00a';
const SAMMY = '4bc9e8c3-7eae-454f-a56c-bccf96f3926b';

/** A made-up work id, distinct per (artist, n). */
const wid = (artist, n) => `${artist.slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Filler works that match no track title. */
const filler = (artist, from, count) => Array.from({ length: count }, (_, i) =>
    ({ id: wid(artist, from + i), title: `Filler Song Number ${from + i}`, disambiguation: '' }));

// Sinatra's list has 150 works, so it takes two requests; "Impressions" is
// on the second page. Martin has "Comedy" exactly; Malneck a near title.
const WORKS = {
    [MALNECK]: [{ id: wid(MALNECK, 1), title: 'Fanfare and Introduction', disambiguation: '' }, ...filler(MALNECK, 2, 4)],
    [SINATRA]: [...filler(SINATRA, 1, 120), { id: wid(SINATRA, 500), title: 'Impressions', disambiguation: 'Rat Pack medley' }, ...filler(SINATRA, 121, 29)],
    [MARTIN]: [{ id: wid(MARTIN, 1), title: 'Comedy', disambiguation: '' }, ...filler(MARTIN, 2, 9)],
    [SAMMY]: filler(SAMMY, 1, 8),
};

/**
 * Opens the release, installs the WS/2 mock and renders "Show all Tracks".
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string[]} pageErrors
 * @param {{settings?: Object, fail?: (artist: string) => boolean}} [opts]
 * @returns {Promise<{page: import('@playwright/test').Page, calls: Array<{artist: string, offset: number}>, mock: {fail: ?Function}}>}
 */
async function openRelease(context, pageErrors, opts = {}) {
    const page = await context.newPage();
    page.on('pageerror', (e) => {
        const where = String(e.stack || e.message || '');
        if (!THIRD_PARTY.some((re) => re.test(where))) pageErrors.push(where);
    });
    const calls = [];
    const mock = { fail: opts.fail || null };
    await page.route('**/ws/2/work?**', (route) => {
        const u = new URL(route.request().url());
        const artist = u.searchParams.get('artist');
        const offset = Number(u.searchParams.get('offset') || 0);
        calls.push({ artist, offset });
        if (mock.fail && mock.fail(artist)) {
            route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"busy"}' });
            return;
        }
        const all = WORKS[artist] || [];
        const body = { 'work-count': all.length, 'work-offset': offset, works: all.slice(offset, offset + 100) };
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await loadUserscriptPage(page, { url: RELEASE_URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: { ...SETTINGS, ...(opts.settings || {}) } });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    await page.mouse.move(0, 0);
    return { page, calls, mock };
}

/**
 * Every visible row: title, its "Recording of work" cell (state, text,
 * suggested title, match note, relate href, HTML) and the Title tooltip.
 *
 * @param {import('@playwright/test').Page} page
 */
const rows = (page) => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('table.tbl').forEach((tbl) => {
        const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th'));
        const tIdx = ths.findIndex((t) => t.dataset.colName === 'Title');
        const wIdx = ths.findIndex((t) => t.dataset.colName === 'Recording of work');
        if (tIdx < 0 || wIdx < 0) return;
        tbl.querySelectorAll('tbody tr').forEach((tr) => {
            if (tr.style.display === 'none') return;
            const td = tr.cells[wIdx];
            const title = tr.cells[tIdx];
            const sugg = td.querySelector('li.mb-recof-suggested > a:not(.mb-wsug-relate)');
            const pill = td.querySelector('.mb-wsug-pill');
            const relate = td.querySelector('a.mb-wsug-relate');
            out.push({
                title: (title.querySelector('a[href*="/recording/"]') || title).textContent.trim(),
                titleTip: title.title,
                flag: title.dataset.mbWorkFlag || null,
                state: td.dataset.wsug || null,
                glyph: getComputedStyle(td, '::before').content,
                text: td.textContent.replace(/\s+/g, ' ').trim(),
                sugg: sugg ? sugg.textContent : null,
                suggHref: sugg ? sugg.getAttribute('href') : null,
                match: pill ? pill.dataset.mbWsugMatch : null,
                relate: relate ? relate.getAttribute('href') : null,
                html: td.innerHTML,
            });
        });
    });
    return out;
});

const byTitle = (list) => Object.fromEntries(list.map((r) => [r.title, r]));
const NO_WORK = ['Fanfare & Introduction', 'Comedy', 'Impressions', 'Danny Thomas Introduction'];

/**
 * Clicks the "Recording of work" cell of the row with this title.
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function clickCell(page, title) {
    await page.locator('tr', { hasText: title }).locator('td[data-wsug]').evaluate((el) => el.click());
}

/** Clicks ▶💡 and waits until no target is queued or loading. */
async function loadAll(page) {
    await page.click('.mb-wsug-col-hdr-btn');
    await expect.poll(async () => page.locator('td[data-wsug="queued"], td[data-wsug="loading"], td[data-wsug="pending"]').count(),
        { timeout: 60000 }).toBe(0);
}

test.describe('release-tracks: work suggestions for tracks without a work', () => {
    let pageErrors;

    test.beforeEach(() => { pageErrors = []; });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    });

    test('only the empty cells get a 💡, and nothing is requested before a click', async ({ context }) => {
        const { page, calls } = await openRelease(context, pageErrors);
        const list = await rows(page);
        expect(list.length).toBe(25);
        const targets = list.filter((r) => r.state);
        expect(targets.map((r) => r.title).sort()).toEqual([...NO_WORK].sort());
        expect(targets.every((r) => r.state === 'pending' && r.glyph === '"💡"' && r.text === '')).toBe(true);
        // A cell with a work carries no state at all.
        expect(list.filter((r) => !r.state).every((r) => r.html.includes('/work/'))).toBe(true);
        await expect(page.locator('.mb-wsug-col-hdr-btn')).toHaveCount(1);
        // Re-renders run the toggle's init on every pass: still no request.
        await page.fill('#mb-global-filter-input', 'Comedy');
        await expect.poll(async () => (await rows(page)).length, { timeout: 15000 }).toBe(1);
        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await rows(page)).length, { timeout: 15000 }).toBe(25);
        await expect(page.locator('td[data-wsug="pending"]')).toHaveCount(4);
        expect(calls).toEqual([]);
    });

    test('▶💡 loads each artist\'s work list once and suggests the closest title', async ({ context }) => {
        const { page, calls } = await openRelease(context, pageErrors);
        const before = byTitle(await rows(page));
        await loadAll(page);

        // Malneck, Sinatra (two pages), Martin, Sammy: each artist once.
        expect(calls.map((c) => `${c.artist.slice(0, 8)}@${c.offset}`).sort())
            .toEqual([`${MALNECK.slice(0, 8)}@0`, `${SINATRA.slice(0, 8)}@0`, `${SINATRA.slice(0, 8)}@100`, `${MARTIN.slice(0, 8)}@0`, `${SAMMY.slice(0, 8)}@0`].sort());

        const after = byTitle(await rows(page));
        expect(after['Fanfare & Introduction']).toMatchObject({ state: 'suggested', sugg: 'Fanfare and Introduction', suggHref: `/work/${wid(MALNECK, 1)}` });
        expect(after['Fanfare & Introduction'].match).toMatch(/^≈ \d+ % alike$/);
        expect(after.Comedy).toMatchObject({ state: 'suggested', sugg: 'Comedy', match: 'exact title' });
        // Found on the second page of Sinatra's list; its disambiguation shows.
        expect(after.Impressions).toMatchObject({ state: 'suggested', sugg: 'Impressions', match: 'exact title' });
        expect(after.Impressions.text).toContain('(Rat Pack medley)');
        expect(after['Danny Thomas Introduction']).toMatchObject({ state: 'none', sugg: null, glyph: '"–"' });

        // The relate link opens the recording's edit page; its text and the
        // match note are CSS, so the cell's text is just the suggestion.
        expect(after.Comedy.relate).toMatch(/^\/recording\/[a-f0-9-]{36}\/edit$/);
        expect(after.Comedy.text).toBe('suggested: Comedy');

        // Cells that have a work are untouched, byte for byte.
        Object.values(before).filter((r) => !r.state).forEach((r) => expect(after[r.title].html).toBe(r.html));

        // A suggestion is not a link: the Title flag stays, its tooltip names it.
        expect(after.Comedy.flag).toBe('none');
        expect(after.Comedy.titleTip).toContain('not linked to any work');
        expect(after.Comedy.titleTip).toContain('Suggested: Comedy (exact title');
        expect(after['Danny Thomas Introduction'].titleTip).toContain('No work of the track\'s artists has a close title.');
        const titleSections = await page.evaluate(() => window.__saTest.getUniqDropSections('Title'));
        const work = titleSections.find((s) => s.label === 'Title info - Work');
        expect(work.items.find((i) => i.label === '🚫 no associated work').count).toBe(4);

        await expect(page.locator('.mb-wsug-col-hdr-btn')).toHaveAttribute('aria-pressed', 'true');
    });

    test('the 📊 counts the suggestions, and they survive a filter re-render with a highlight', async ({ context }) => {
        const { page } = await openRelease(context, pageErrors);
        await loadAll(page);

        const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Recording of work'));
        const states = sections.find((s) => s.label === 'Recording of work - Suggestions');
        expect(Object.fromEntries(states.items.map((i) => [i.label, i.count])))
            .toEqual({ '💡 work suggested': 3, '– no suggestion': 1 });
        const titles = sections.find((s) => s.label === 'Recording of - Suggested work');
        expect(titles.items.map((i) => i.label).sort()).toEqual(['» suggested: Comedy', '» suggested: Fanfare and Introduction', '» suggested: Impressions']);

        // The filter re-render clones the source rows: the suggestion must be
        // on them too, and the filter finds it by its title.
        await page.fill('#mb-global-filter-input', 'Fanfare and');
        await expect.poll(async () => (await rows(page)).map((r) => [r.title, r.sugg]), { timeout: 15000 })
            .toEqual([['Fanfare & Introduction', 'Fanfare and Introduction']]);
        await expect(page.locator('li.mb-recof-suggested .mb-global-filter-highlight').first()).toBeVisible();

        await page.fill('#mb-global-filter-input', '');
        await expect.poll(async () => (await rows(page)).filter((r) => r.state === 'suggested').length, { timeout: 15000 }).toBe(3);
        // The match note is not text: filtering for it matches nothing.
        await page.fill('#mb-global-filter-input', 'exact title');
        await expect.poll(async () => (await rows(page)).length, { timeout: 15000 }).toBe(0);
    });

    test('a 💡 cell loads only its own track', async ({ context }) => {
        const { page, calls } = await openRelease(context, pageErrors);
        // el.click(): Playwright scrolls the cell to the left edge, under the
        // sticky Title column, which would take a pointer click.
        await clickCell(page, 'Fanfare & Introduction');
        await expect.poll(async () => byTitle(await rows(page))['Fanfare & Introduction'].state, { timeout: 30000 }).toBe('suggested');
        expect(calls.map((c) => c.artist)).toEqual([MALNECK]);
        const list = byTitle(await rows(page));
        ['Comedy', 'Impressions', 'Danny Thomas Introduction'].forEach((t) => expect(list[t].state).toBe('pending'));
        await expect(page.locator('td[data-wsug="pending"]')).toHaveCount(3);
        await expect(page.locator('.mb-wsug-col-hdr-btn')).toHaveAttribute('aria-pressed', 'false');
    });

    test('a failed work list marks only the tracks it leaves unanswered, and a retry fixes them', async ({ context }) => {
        const { page, calls, mock } = await openRelease(context, pageErrors, { fail: (artist) => artist === SAMMY });
        await page.click('.mb-wsug-col-hdr-btn');
        await expect.poll(async () => page.locator('td[data-wsug="queued"], td[data-wsug="loading"], td[data-wsug="pending"]').count(),
            { timeout: 90000 }).toBe(0);
        let list = byTitle(await rows(page));
        // Impressions still finds its exact title in Sinatra's list.
        expect(list.Impressions.state).toBe('suggested');
        // Danny Thomas has no match in the lists that did load: unknown, not "none".
        expect(list['Danny Thomas Introduction'].state).toBe('error');
        expect(list['Danny Thomas Introduction'].glyph).toBe('"⚠︎"');
        await expect(page.locator('.mb-wsug-col-hdr-btn')).toHaveAttribute('data-wsug-state', 'error');
        const sammyTries = calls.filter((c) => c.artist === SAMMY).length;
        expect(sammyTries).toBeGreaterThan(1);

        mock.fail = null;
        const already = calls.length;
        await clickCell(page, 'Danny Thomas Introduction');
        await expect.poll(async () => byTitle(await rows(page))['Danny Thomas Introduction'].state, { timeout: 30000 }).toBe('none');
        // Only the failed artist is asked again; the others are in memory.
        expect(calls.slice(already).map((c) => c.artist)).toEqual([SAMMY]);
        list = byTitle(await rows(page));
        expect(list.Comedy.state).toBe('suggested');
    });

    test('switched off: no toggle, no 💡, no state on any cell', async ({ context }) => {
        const { page } = await openRelease(context, pageErrors, { settings: { sa_release_tracks_work_suggest: false } });
        await expect(page.locator('.mb-wsug-col-hdr-btn')).toHaveCount(0);
        await expect(page.locator('td[data-wsug]')).toHaveCount(0);
        // The no-work flag is a separate feature and stays.
        expect((await rows(page)).filter((r) => r.flag === 'none').length).toBe(4);
    });
});

test.describe('release-tracks: work suggestions and Save to Disk', () => {
    let pageErrors;
    let tmpDir;

    test.beforeEach(() => {
        pageErrors = [];
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-wsug-'));
    });
    test.afterEach(() => {
        expect(pageErrors, `uncaught page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('suggestions are not saved; a reload fills them again from the cache without a request', async ({ context }) => {
        const source = await openRelease(context, pageErrors);
        await loadAll(source.page);
        expect((await rows(source.page)).filter((r) => r.state === 'suggested').length).toBe(3);

        const downloadPromise = source.page.waitForEvent('download', { timeout: 60000 });
        await clickToolbarItem(source.page, '#mb-save-to-disk-btn');
        await source.page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
        await source.page.click('#sa-sd-save-confirm');
        const file = path.join(tmpDir, 'rat-pack.json.gz');
        await (await downloadPromise).saveAs(file);
        await source.page.close();

        // Same browser context: the work lists are in IndexedDB now.
        const { page, calls } = await openRelease(context, pageErrors);
        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]').setInputFiles(file);
        const renderBtn = page.locator('#sa-render-no-filter-confirm');
        await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
        await renderBtn.evaluate((el) => el.click());
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const loaded = await rows(page);
        expect(loaded.filter((r) => r.html.includes('mb-recof-suggested')).length).toBe(0);
        expect(loaded.filter((r) => r.state === 'pending').map((r) => r.title).sort()).toEqual([...NO_WORK].sort());

        await loadAll(page);
        expect((await rows(page)).filter((r) => r.state === 'suggested').length).toBe(3);
        expect(calls).toEqual([]);
    });
});
