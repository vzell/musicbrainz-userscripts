// @ts-check
// The sidebar beside the page's own data (org/sidebar-info.org "Overwhole",
// mockup picks 2026-10-15 "P2 + A3, B1"):
//
//   - a relationship-tables render ("Credits"/"Relationships", the place /
//     area / instrument overviews) appends the sidebar's groups as
//     "Sidebar: …" tables after the relationship tables, in the same dataset
//     (sa_sidebar_in_rel_tables, _sbAppendRelTablesGroups());
//   - every other render gets a read-only h2 "Sidebar" of cards right below
//     the Credits/Relationships section (sa_sidebar_inline_main,
//     _sbInlineInsertSection()).
//
// Guarantees pinned here, each named:
//   - ORDER: the "Sidebar: …" tables come after every relationship table;
//   - FILTER/SORT: the h2's global filter narrows them; a column sort orders
//     them (not just "survives");
//   - DUPLICATES: a sidebar link already in a relationship table is left out,
//     and is back with the switch off;
//   - CLEAN COLUMNS: exactly the sidebar's columns (no Picard, CAA, Details);
//   - PLACE: the cards' h2 sits right after #bottom-credits / the
//     Relationships section / right above the data h2, and stays there after
//     an empty-query re-render;
//   - ISOLATION: no table.tbl and no h3 inside it; folding Credits /
//     Relationships does not fold it (the makeH2sCollapsible() boundary);
//   - CONTENT: one card per group, as many entries as the sidebar has;
//   - card folding: only the first information card starts open (INITIAL
//     STATE, and the select's three values and a stray one); Ctrl+Click makes every card follow the
//     clicked one (CTRL+CLICK ALL); a closed card shows ▶ (MARKER); every
//     head has a rich hover card (TOOLTIP).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('../support/test');
const { clickToolbarItem } = require('../support/toolbarMenu');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { typeGlobalFilter, waitForFilterSettled, waitForSortSettled } = require('../support/filterSortAssertions');

const PAGES = {
    release: ['https://musicbrainz.org/release/f50fcf09-4339-4e1c-91cd-e1d2a7b3a7bc', 'rel-release-overview.html',
        'Show all Credits for Release', 'Show all Tracks for Release'],
    'release-group': ['https://musicbrainz.org/release-group/d5f992ab-6238-3b28-bf2b-7b16d913c9f6', 'rel-release-group-overview.html',
        'Show all Relationships for ReleaseGroup', 'Show all Releases for ReleaseGroup'],
    place: ['https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463', 'rel-place-overview.html',
        'Show all Relationships for Place', null],
    artist: ['https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f', 'artist-releasegroups-live-titles.html',
        null, '🧮 Artist RGs'],
    // Several facts cards (Work information, Work attributes, …): the page that sees
    // whether the release-only facts rule leaks to other pageTypes.
    work: ['https://musicbrainz.org/work/1f573511-eb4b-3106-8fb2-f15de52e4868', 'rel-work-overview.html',
        'Show all Relationships for Work', 'Show all Recordings for Work'],
};

/**
 * Loads a fixture (MusicBrainz's bundles blocked, every page fetch answered
 * with the same fixture, ws/2 and the art archives refused) and presses one
 * of its buttons: `which` 'rel' (the relationship tables) or 'own' (the
 * page's own render).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} kind A key of PAGES.
 * @param {'rel'|'own'} which
 * @param {Object} [settings]
 */
async function open(page, kind, which, settings = {}) {
    const [url, file, relLabel, ownLabel] = PAGES[kind];
    const fixture = path.join(__dirname, file);
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url, fixtureFile: fixture, testMode: true,
        settingsOverride: { sa_enable_relationship_tables: true, sa_enable_release_tracks: true,
                            sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false, ...settings },
    });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: fixture, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.click(`button[data-label="${which === 'rel' ? relLabel : ownLabel}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/**
 * Every rendered group in document order as { name, heads, rows, hrefs }.
 * @param {import('@playwright/test').Page} page
 */
const groups = (page) => page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
    let t = h3.nextElementSibling;
    while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
    const icon = h3.querySelector('.mb-toggle-icon');
    const name = icon && icon.nextSibling ? icon.nextSibling.textContent.trim() : h3.textContent.trim();
    const heads = t ? Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊\d]/gu, '').trim()) : [];
    const rows = t ? Array.from(t.querySelectorAll('tbody tr')).filter((tr) => tr.style.display !== 'none')
        .map((tr) => Array.from(tr.cells).map((td) => td.textContent.replace(/\s+/g, ' ').trim())) : [];
    const hrefs = t ? Array.from(t.querySelectorAll('tbody a[href]')).map((a) => a.href) : [];
    return { name, heads, rows, hrefs };
}));

/** What the page's sidebar holds, read straight from it (the test's own oracle). */
const sidebarFacts = (page) => page.evaluate(() => {
    const side = document.getElementById('sidebar');
    const links = Array.from(side.querySelectorAll('ul.external_links > li:not(.all-relationships):not(.mb-sbl-head) a[href]')).map((a) => a.href);
    return {
        dt: side.querySelectorAll('dl.properties > dt').length,
        links,
        tags: side.querySelectorAll('ul.genre-list > li a[href], ul.tag-list > li a[href]').length,
    };
});

/** A normalised link, as the script compares them (no scheme, no www., no trailing slash). */
const key = (href) => { const u = new URL(href); return u.host.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search; };

/** The read-only section: where it is, what it holds. */
const inline = (page) => page.evaluate(() => {
    const wrap = document.querySelector('#content .mb-sb-inline-wrap');
    if (!wrap) return null;
    const h2 = wrap.querySelector(':scope > h2');
    const sec = wrap.querySelector(':scope > .mb-sb-inline');
    const prev = wrap.previousElementSibling;
    return {
        h2: h2.textContent.replace(/[▲▼]/g, '').replace(/\s+/g, ' ').trim(),
        // Really on screen: a hidden ancestor (a section that swallowed ours)
        // leaves its own computed display untouched.
        open: sec.getClientRects().length > 0,
        prevId: prev ? prev.id : null,
        nextIsDataH2: !!(wrap.nextElementSibling && wrap.nextElementSibling.querySelector && wrap.nextElementSibling.matches('h2') && wrap.nextElementSibling.querySelector('.mb-row-count-stat')),
        tbl: wrap.querySelectorAll('table.tbl').length,
        h3: wrap.querySelectorAll('h3').length,
        cards: Array.from(wrap.querySelectorAll('.mb-sb-card')).map((c) => ({
            key: c.dataset.mbSbKey,
            name: c.querySelector('.mb-sb-card-head span').textContent,
            count: Number(c.querySelector('.mb-sb-card-count').textContent),
            dt: c.querySelectorAll('dl > dt').length,
            chips: c.querySelectorAll('.mb-sb-chip').length,
            pills: c.querySelectorAll('.mb-sb-pill').length,
        })),
    };
});

// ── "Sidebar: …" tables in the relationship-tables render (9.99.1351) ──────────

test.describe('sidebar in the Credits/Relationships view', () => {
    test('ORDER + CLEAN COLUMNS: "Sidebar: …" tables after every relationship table, with only their own columns', async ({ page }) => {
        await open(page, 'release', 'rel');
        const g = await groups(page);
        const names = g.map((x) => x.name);
        const first = names.findIndex((n) => n.startsWith('Sidebar: '));
        expect(first, names.join(' | ')).toBeGreaterThan(0);
        expect(names.slice(first).every((n) => n.startsWith('Sidebar: ')), names.join(' | ')).toBe(true);
        expect(names).toContain('Sidebar: Release information');
        expect(names).toContain('Sidebar: Additional details');
        const want = {
            'Sidebar: Release information': ['#', 'Property', 'Value'],
            'Sidebar: Additional details': ['#', 'Property', 'Value'],
            'Sidebar: Labels': ['#', 'Label', 'Catalog number'],
            'Sidebar: Release events': ['#', 'Country', 'Date'],
            'Sidebar: Tags': ['#', 'Tag', 'Kind', 'Votes'],
        };
        for (const x of g.filter((y) => want[y.name])) expect(x.heads, x.name).toEqual(want[x.name]);
        for (const x of g.filter((y) => /External links/.test(y.name) && y.name.startsWith('Sidebar: '))) {
            expect(x.heads, x.name).toEqual(['#', 'Site', 'Link', 'Kind', 'Details']);
        }
        // One row per sidebar fact across the facts tables.
        const facts = await sidebarFacts(page);
        const factRows = g.filter((x) => want[x.name] && want[x.name][1] === 'Property').reduce((n, x) => n + x.rows.length, 0);
        expect(factRows).toBe(facts.dt);
        // No cards view on this render.
        expect(await inline(page)).toBeNull();
    });

    test('DUPLICATES: a sidebar link already in a relationship table is left out, and back with the switch off', async ({ page }) => {
        await open(page, 'release', 'rel');
        const g = await groups(page);
        const relHrefs = new Set(g.filter((x) => !x.name.startsWith('Sidebar: ')).flatMap((x) => x.hrefs).map(key));
        const sbLinks = g.filter((x) => x.name.startsWith('Sidebar: ') && x.heads.includes('Link'));
        const facts = await sidebarFacts(page);
        const dupes = facts.links.filter((h) => relHrefs.has(key(h)));
        expect(dupes.length, 'the fixture has sidebar links that are also relationship rows').toBeGreaterThan(0);
        const shown = sbLinks.flatMap((x) => x.hrefs.filter((h) => !/\/url\//.test(h))).map(key);
        expect(shown.filter((h) => relHrefs.has(h)), 'no duplicate shown').toEqual([]);
        expect(shown.length).toBe(facts.links.length - dupes.length);

        await page.goto('about:blank');
        await open(page, 'release', 'rel', { sa_sidebar_inline_skip_dup_links: false });
        const g2 = await groups(page);
        const all = g2.filter((x) => x.name.startsWith('Sidebar: ') && x.heads.includes('Link')).reduce((n, x) => n + x.rows.length, 0);
        expect(all).toBe(facts.links.length);
    });

    test('FILTER + SORT: the global filter narrows them, a column sort orders them', async ({ page }) => {
        await open(page, 'release', 'rel');
        const before = (await groups(page)).find((x) => x.name === 'Sidebar: Additional details');
        expect(before.rows.length).toBeGreaterThan(2);
        // Sort Property descending: the rows come back in reverse text order.
        const h3 = page.locator('h3.mb-toggle-h3', { hasText: 'Sidebar: Additional details' }).first();
        const table = h3.locator('xpath=following-sibling::table[contains(concat(" ", @class, " "), " tbl ")][1]');
        if (!await table.isVisible()) {
            await h3.evaluate((el) => el.click());
            await table.waitFor({ state: 'visible', timeout: 30000 });
        }
        const desc = table.locator('thead tr:first-child th[data-col-name="Property"] .sort-icon-btn', { hasText: '▼' }).first();
        await waitForSortSettled(page, () => desc.click(), { statusLocator: h3.locator('.mb-sort-status') });
        const sorted = (await groups(page)).find((x) => x.name === 'Sidebar: Additional details').rows.map((r) => r[1]);
        expect(sorted).toEqual([...sorted].sort((a, b) => b.localeCompare(a)));
        expect(sorted).not.toEqual(before.rows.map((r) => r[1]));

        // A value only that table holds: the global filter leaves its row.
        const target = before.rows.find((r) => r[2] && r[2].length > 3);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, target[2]));
        const after = (await groups(page)).find((x) => x.name === 'Sidebar: Additional details');
        expect(after.rows.map((r) => r[2])).toContain(target[2]);
        expect(after.rows.length).toBeLessThan(before.rows.length);
    });

    test('the overview pageTypes get them too (place)', async ({ page }) => {
        await open(page, 'place', 'rel');
        const names = (await groups(page)).map((x) => x.name);
        expect(names).toContain('Sidebar: Place information');
    });

    test('the switches: off, and links / tags left out', async ({ page }) => {
        await open(page, 'release', 'rel', { sa_sidebar_in_rel_tables: false });
        expect((await groups(page)).filter((x) => x.name.startsWith('Sidebar: '))).toEqual([]);
        await page.goto('about:blank');
        await open(page, 'release', 'rel', { sa_sidebar_in_rel_tables: true, sa_sidebar_inline_links: false, sa_sidebar_inline_tags: false, sa_sidebar_inline_skip_dup_links: false });
        const sb = (await groups(page)).filter((x) => x.name.startsWith('Sidebar: '));
        expect(sb.length).toBeGreaterThan(0);
        expect(sb.filter((x) => x.heads.includes('Link') || x.heads.includes('Tag')).map((x) => x.name)).toEqual([]);
    });

    test('a Save to Disk → Load from Disk round trip keeps them', async ({ page, context }) => {
        await open(page, 'release', 'rel');
        const before = (await groups(page)).map((x) => [x.name, x.rows.length]);
        expect(before.some(([n]) => n.startsWith('Sidebar: '))).toBe(true);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-sidebar-inline-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const reopened = await context.newPage();
            const [url, file] = PAGES.release;
            await reopened.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
            await loadUserscriptPage(reopened, { url, fixtureFile: path.join(__dirname, file), testMode: true,
                settingsOverride: { sa_enable_relationship_tables: true, sa_enable_release_tracks: true,
                                    sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false } });
            await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
            await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(reopened, { waitForAutoResize: false });
            expect((await groups(reopened)).map((x) => [x.name, x.rows.length])).toEqual(before);
            await reopened.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

// ── The read-only "Sidebar" cards after the page's own render (9.99.1352) ──────

test.describe('sidebar cards after the page render', () => {
    test('PLACE + CONTENT: release — right after Credits, open, one card per group', async ({ page }) => {
        await open(page, 'release', 'own');
        const s = await inline(page);
        expect(s, 'the section is there').not.toBeNull();
        expect(s.prevId).toBe('bottom-credits');
        expect(s.open).toBe(true);
        expect(s.tbl + s.h3, 'no table.tbl, no h3 inside').toBe(0);
        const facts = await sidebarFacts(page);
        const info = s.cards.filter((c) => c.key === 'info');
        expect(info.length).toBeGreaterThan(0);
        expect(info.reduce((n, c) => n + c.dt, 0)).toBe(facts.dt);
        info.forEach((c) => expect(c.count, c.name).toBe(c.dt));
        expect(s.cards.filter((c) => c.key === 'links').reduce((n, c) => n + c.chips, 0)).toBe(facts.links.length);
        expect(s.cards.filter((c) => c.key === 'tags').reduce((n, c) => n + c.pills, 0)).toBe(facts.tags);
        const total = s.cards.reduce((n, c) => n + c.count, 0);
        expect(s.h2).toBe(`Sidebar (${total})`);
    });

    // Without the relocation Credits stays below the tracklist: "right above
    // the data h2" would no longer be "right after Credits".
    test('PLACE: release with the h2 relocation off — still right after Credits', async ({ page }) => {
        await open(page, 'release', 'own', { sa_enable_h2_section_relocation_on_final_page: false });
        const s = await inline(page);
        expect(s).not.toBeNull();
        expect(s.prevId).toBe('bottom-credits');
        expect(s.open).toBe(true);
    });

    test('ISOLATION: folding Credits leaves it; its own h2 folds it; a card folds on click and Enter', async ({ page }) => {
        await open(page, 'release', 'own');
        await page.locator('#bottom-credits > h2').click();
        expect((await inline(page)).open, 'still open after Credits folds').toBe(true);
        await page.locator('.mb-sb-inline-wrap > h2').click();
        expect((await inline(page)).open).toBe(false);
        await page.locator('.mb-sb-inline-wrap > h2').click();
        const head = page.locator('.mb-sb-card-head').first();
        const body = page.locator('.mb-sb-card').first().locator('.mb-sb-card-body');
        await head.click();
        await expect(body).toBeHidden();
        await expect(head).toHaveAttribute('aria-expanded', 'false');
        await head.focus();
        await page.keyboard.press('Enter');
        await expect(body).toBeVisible();
    });

    test('PLACE: release group — right after the Relationships section, kept there after an empty-query re-render', async ({ page }) => {
        await open(page, 'release-group', 'own');
        const where = () => page.evaluate(() => {
            const wrap = document.querySelector('#content .mb-sb-inline-wrap');
            // The last h2 before it, outside it.
            const h2s = Array.from(document.querySelectorAll('#content h2')).filter((h) => !wrap.contains(h) &&
                (h.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING));
            const last = h2s[h2s.length - 1];
            // Nothing but that section's own nodes between it and the wrap.
            let clean = true;
            for (let n = last.nextElementSibling; n && n !== wrap; n = n.nextElementSibling) if (n.tagName === 'H2' || n.querySelector('h2')) clean = false;
            return { prev: last.classList.contains('relationships'), sameParent: last.parentNode === wrap.parentNode, clean };
        });
        expect(await where()).toEqual({ prev: true, sameParent: true, clean: true });
        expect((await inline(page)).open, 'open after the render').toBe(true);
        // Relationships starts closed like every non-data h2: open it, then
        // fold it again. Ours stays on screen both times.
        const rel = page.locator('#content h2.relationships');
        const relOpen = () => rel.evaluate((h) => h.querySelector('.mb-toggle-icon').textContent === '▼');
        if (!await relOpen()) await rel.click();
        expect(await relOpen()).toBe(true);
        await rel.click();
        expect(await relOpen()).toBe(false);
        expect((await inline(page)).open, 'folding Relationships leaves it open').toBe(true);
        await waitForFilterSettled(page, () => typeGlobalFilter(page, 'zzzz'));
        await waitForFilterSettled(page, () => page.locator('#mb-global-filter-input').fill(''));
        expect(await where()).toEqual({ prev: true, sameParent: true, clean: true });
        expect((await inline(page)).cards.length).toBeGreaterThan(0);
    });

    // The disk-load tail relocates the trailing h2 sections AFTER
    // finalCleanup() placed the section, and that pass would put our h2
    // before the Relationships section: it is placed again there.
    test('PLACE: release group — still right after Relationships after a Save → Load round trip', async ({ page, context }) => {
        await open(page, 'release-group', 'own');
        const where = (p) => p.evaluate(() => {
            const wrap = document.querySelector('#content .mb-sb-inline-wrap');
            if (!wrap) return null;
            const h2s = Array.from(document.querySelectorAll('#content h2')).filter((h) => !wrap.contains(h) &&
                (h.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING));
            const last = h2s[h2s.length - 1];
            return { prev: !!last && last.classList.contains('relationships'), open: wrap.querySelector('.mb-sb-inline').getClientRects().length > 0 };
        });
        expect(await where(page)).toEqual({ prev: true, open: true });
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-sidebar-inline-rg-'));
        try {
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            await clickToolbarItem(page, '#mb-save-to-disk-btn');
            await page.locator('#sa-sd-save-confirm').waitFor({ state: 'visible', timeout: 15000 });
            await page.click('#sa-sd-save-confirm');
            const download = await downloadPromise;
            const saved = path.join(tmpDir, download.suggestedFilename() || 'snapshot.json.gz');
            await download.saveAs(saved);

            const reopened = await context.newPage();
            const [url, file] = PAGES['release-group'];
            await reopened.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
            await loadUserscriptPage(reopened, { url, fixtureFile: path.join(__dirname, file), testMode: true,
                settingsOverride: { sa_enable_relationship_tables: true, sa_enable_caa_pics: false,
                                    sa_enable_relationships_column: false, sa_collabsable_sidebar: false } });
            await clickToolbarItem(reopened, '#mb-load-from-disk-btn');
            await reopened.locator('input[type="file"][accept*="json"]').setInputFiles(saved);
            const renderBtn = reopened.locator('#sa-render-no-filter-confirm');
            await renderBtn.waitFor({ state: 'attached', timeout: 15000 });
            await renderBtn.evaluate((el) => el.click());
            await waitForRenderComplete(reopened, { waitForAutoResize: false });
            expect(await where(reopened)).toEqual({ prev: true, open: true });
            expect(await reopened.locator('#content .mb-sb-inline-wrap').count(), 'one section').toBe(1);
            await reopened.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('PLACE: artist — no such section, so right above the data h2', async ({ page }) => {
        await open(page, 'artist', 'own');
        const s = await inline(page);
        expect(s).not.toBeNull();
        expect(s.nextIsDataH2).toBe(true);
        expect(s.cards.some((c) => c.key === 'links' && c.chips > 0)).toBe(true);
    });

    // Reported 2026-10-15 on PolyGram Distribution's Relationships tab: with
    // "MusicBrainz More Flags Everywhere" every area of the Area value is a
    // `span.mfe-flag-wrapper` (name, comment, flag image, comma) that the
    // script makes `white-space: nowrap !important`. In a fixed grid column
    // the flags stuck out of the card. Here the script's markup and rule are
    // rebuilt on the fixture's own sidebar before the render.
    test('NO OVERFLOW: an Area value with More Flags Everywhere\'s unbreakable flag spans stays inside its card', async ({ page }) => {
        const fixture = path.join(__dirname, 'rel-label-rels-overview.html');
        await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
        await loadUserscriptPage(page, {
            url: 'https://musicbrainz.org/label/0b805b9c-ea03-4fc1-b50d-6dcef76433e0/relationships', fixtureFile: fixture, testMode: true,
            settingsOverride: { sa_enable_relationship_tables: true, sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false },
        });
        await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
        await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: fixture, contentType: 'text/html' }));
        await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
        await page.evaluate(() => {
            const st = document.createElement('style');
            st.textContent = '.mfe-flag-wrapper, .mfe-flag-wrapper * { white-space: nowrap !important; }';
            document.head.appendChild(st);
            const dd = document.querySelector('#sidebar dd.area');
            dd.querySelectorAll('a[href*="/area/"]').forEach((a) => {
                const w = document.createElement('span');
                w.className = 'mfe-flag-wrapper';
                a.before(w);
                w.appendChild(a);
                const next = w.nextSibling && w.nextSibling.nextSibling;
                if (next && next.nodeType === 1 && next.matches('span.comment')) w.append(' ', next);
                const img = document.createElement('img');
                img.alt = '';
                img.width = 22;
                img.height = 14;
                img.style.cssText = 'display:inline-block;width:22px;height:14px;margin-left:4px;background:#c33';
                w.appendChild(img);
                if (w.nextSibling && w.nextSibling.nodeType === 3 && /^,/.test(w.nextSibling.textContent)) {
                    w.append(',');
                    w.nextSibling.textContent = w.nextSibling.textContent.slice(1);
                }
            });
        });
        await page.click('button[data-label="Show all Relationships for Label"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });
        const fit = await page.evaluate(() => {
            const card = document.querySelector('.mb-sb-card[data-mb-sb-key="info"]');
            const box = card.getBoundingClientRect();
            const out = Array.from(card.querySelectorAll('*')).filter((el) => el.getBoundingClientRect().right > box.right + 1)
                .map((el) => el.tagName + (el.className ? '.' + el.className : ''));
            const dd = Array.from(card.querySelectorAll('dd')).find((d) => d.querySelector('.mfe-flag-wrapper'));
            return { wrappers: card.querySelectorAll('.mfe-flag-wrapper').length, out, ddScrolls: dd.scrollWidth > dd.clientWidth + 1 };
        });
        expect(fit.wrappers, 'the flag spans were copied into the card').toBeGreaterThan(2);
        expect(fit.out, 'nothing sticks out of the card').toEqual([]);
        expect(fit.ddScrolls, 'at desktop width the value needs no scrolling').toBe(false);
    });

    test('the switches: off; start closed', async ({ page }) => {
        await open(page, 'release', 'own', { sa_sidebar_inline_main: false });
        expect(await inline(page)).toBeNull();
        await page.goto('about:blank');
        await open(page, 'release', 'own', { sa_sidebar_inline_main: true, sa_sidebar_inline_collapsed: true });
        const s = await inline(page);
        expect(s).not.toBeNull();
        expect(s.open).toBe(false);
    });

    // ── Card folding (WIP.1): only the first information card starts open,
    // Ctrl+Click folds every card, a closed card shows ▶, every head has a
    // rich hover card. ─────────────────────────────────────────────────────

    test('INITIAL STATE: every card but Search by default; "Information card" opens only the first (a release: every facts card); the switches, a stray value', async ({ page }) => {
        /** Exactly the cards `want(card, index)` names are open. */
        const openAre = (c, want, why) => c.forEach((x, i) => {
            expect(x.shown, `${why} — ${x.name}: body on screen`).toBe(want(x, i));
            expect(x.aria, `${why} — ${x.name}: aria-expanded`).toBe(String(want(x, i)));
        });
        const firstInfoOnly = (c) => { const f = c.findIndex((x) => x.key === 'info'); return (x, i) => i === f; };
        const FACTS = ['info', 'labels', 'events'];
        const factsOnly = (x) => FACTS.includes(x.key);

        // The default since 2026-10-17: every card open (Search is the one
        // exception: sidebar-search-card.spec.js, whose fixture has it).
        await open(page, 'release', 'own');
        let c = await cardStates(page);
        expect(c.some((x) => x.key === 'search'), 'premise: no Search card on this page').toBe(false);
        expect(c.filter((x) => !x.shown).map((x) => x.name), 'default: every card open').toEqual([]);

        // "Information card" on a release (release-tracks): Release
        // information, Additional details, Labels, Release events open;
        // links (and tags) closed.
        await page.goto('about:blank');
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: 'info' });
        c = await cardStates(page);
        expect(c.filter((x) => x.key === 'info').length, 'premise: two information cards').toBe(2);
        expect(c.some((x) => x.key === 'labels') && c.some((x) => x.key === 'events'), 'premise: labels and events').toBe(true);
        expect(c.some((x) => !factsOnly(x)), 'premise: a card that is no facts card').toBe(true);
        openAre(c, factsOnly, 'release, information card');

        // GM values outlive a goto: every arm seeds the keys itself.
        await page.goto('about:blank');
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: 'info', sa_sidebar_inline_release_facts_open: false });
        c = await cardStates(page);
        openAre(c, firstInfoOnly(c), 'release, switch off');

        // Any other pageType: only the first information card — even a work,
        // whose sidebar has a second facts card the release rule would open.
        await page.goto('about:blank');
        await open(page, 'release-group', 'own', { sa_sidebar_inline_cards_open: 'info', sa_sidebar_inline_release_facts_open: true });
        c = await cardStates(page);
        expect(c.length, 'premise: several cards on the release group').toBeGreaterThan(1);
        openAre(c, firstInfoOnly(c), 'release group, information card');
        await page.goto('about:blank');
        await open(page, 'work', 'own', { sa_sidebar_inline_cards_open: 'info', sa_sidebar_inline_release_facts_open: true });
        c = await cardStates(page);
        expect(c.filter((x) => x.key === 'info').length, 'premise: more than one facts card on the work').toBeGreaterThan(1);
        openAre(c, firstInfoOnly(c), 'work, information card');

        await page.goto('about:blank');
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: 'all' });
        c = await cardStates(page);
        expect(c.filter((x) => !x.shown).map((x) => x.name), 'all: every card open').toEqual([]);

        await page.goto('about:blank');
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: 'none' });
        c = await cardStates(page);
        expect(c.filter((x) => x.shown).map((x) => x.name), 'none: no card open').toEqual([]);

        // Matched trimmed and case-insensitively, as a text box once stored it.
        await page.goto('about:blank');
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: ' ALL ' });
        c = await cardStates(page);
        expect(c.filter((x) => !x.shown).map((x) => x.name), '" ALL " reads as all').toEqual([]);

        // A value that is no option reads as the default.
        await page.goto('about:blank');
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: 'bogus' });
        expect((await cardStates(page)).filter((x) => !x.shown).map((x) => x.name), 'a stray value: every card open').toEqual([]);
    });

    test('CTRL+CLICK ALL: every card follows the clicked one, from a mixed state, both ways; a plain click folds one', async ({ page }) => {
        // "Information card": a mixed state to start from (the default opens every card here).
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: 'info' });
        const heads = page.locator('.mb-sb-card-head');
        const shown = async () => (await cardStates(page)).map((x) => x.shown);
        const n = (await shown()).length;
        const mixed = await shown();
        expect(mixed.includes(true) && mixed.includes(false), 'premise: a mixed state').toBe(true);
        const shutIdx = mixed.indexOf(false);

        await heads.nth(shutIdx).click({ modifiers: ['Control'] });
        expect(await shown(), 'Ctrl+Click on a closed card opens all').toEqual(Array(n).fill(true));
        await heads.nth(n - 1).click({ modifiers: ['Control'] });
        expect(await shown(), 'Ctrl+Click again closes all').toEqual(Array(n).fill(false));

        // A plain click folds only its own card: a mixed state again.
        await heads.nth(1).click();
        expect(await shown(), 'a plain click opens one').toEqual(Array.from({ length: n }, (_, i) => i === 1));
        await heads.nth(1).click({ modifiers: ['Control'] });
        expect(await shown(), 'Ctrl+Click on the one OPEN card closes all').toEqual(Array(n).fill(false));
        await heads.nth(0).click({ modifiers: ['Meta'] });
        expect(await shown(), 'Cmd+Click opens all').toEqual(Array(n).fill(true));

        await heads.nth(0).focus();
        await page.keyboard.press('Control+Enter');
        expect(await shown(), 'Ctrl+Enter closes all').toEqual(Array(n).fill(false));
        expect((await cardStates(page)).map((x) => x.aria), 'aria-expanded follows').toEqual(Array(n).fill('false'));
    });

    test('MARKER: a closed card shows ▶ before its title, an open one nothing, following each fold', async ({ page }) => {
        await open(page, 'release', 'own', { sa_sidebar_inline_cards_open: 'info' });
        let c = await cardStates(page);
        c.forEach((x) => expect(x.marker, `${x.name}`).toBe(x.shown ? 'none' : '"▶"'));
        expect(c.some((x) => x.marker === '"▶"') && c.some((x) => x.marker === 'none'), 'premise: both kinds').toBe(true);
        const openIdx = c.findIndex((x) => x.shown);
        const shutIdx = c.findIndex((x) => !x.shown);
        await page.locator('.mb-sb-card-head').nth(openIdx).click();
        await page.locator('.mb-sb-card-head').nth(shutIdx).click();
        c = await cardStates(page);
        expect(c[openIdx].marker, 'closed by a click: marked').toBe('"▶"');
        expect(c[shutIdx].marker, 'opened by a click: unmarked').toBe('none');
        expect(c[openIdx].name, 'the marker is no part of the title text').not.toMatch(/▶/);
    });

    test('TOOLTIP: every head carries a rich card with its name, count and the Ctrl+Click hint; hovering shows it', async ({ page }) => {
        await open(page, 'release', 'own');
        const tips = await page.evaluate(() => Array.from(document.querySelectorAll('.mb-sb-card')).map((c) => {
            const h = c.querySelector('.mb-sb-card-head');
            return { name: h.querySelector('span').textContent, count: h.querySelector('.mb-sb-card-count').textContent,
                     tip: h.dataset.mbtt || '', title: h.getAttribute('title') };
        }));
        expect(tips.length).toBeGreaterThan(2);
        tips.forEach((t) => {
            expect(t.tip, `${t.name}: its name`).toContain(`<div class="mb-tt-title">${t.name}</div>`);
            expect(t.tip, `${t.name}: its count`).toContain(`>${t.count}</span>`);
            expect(t.tip, `${t.name}: the Ctrl+Click hint`).toContain('<kbd>Ctrl</kbd>+<kbd>Click</kbd>');
            expect(t.title, `${t.name}: no native title on top`).toBeNull();
        });
        const last = page.locator('.mb-sb-card-head').last();
        await last.hover();
        const card = page.locator('#mb-stat-tooltip');
        await expect(card).toBeVisible();
        await expect(card.locator('.mb-tt-title')).toHaveText(tips[tips.length - 1].name);
        await expect(card).toContainText('open or close every card');
    });
});

/**
 * Every card of the read-only section in order: its key, name, whether its
 * body is on screen, its aria-expanded and its title's ::before content.
 * @param {import('@playwright/test').Page} page
 */
const cardStates = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.mb-sb-inline .mb-sb-card')).map((c) => {
    const head = c.querySelector(':scope > .mb-sb-card-head');
    const title = head.querySelector('span');
    return {
        key: c.dataset.mbSbKey,
        name: title.textContent,
        shown: c.querySelector(':scope > .mb-sb-card-body').getClientRects().length > 0,
        aria: head.getAttribute('aria-expanded'),
        marker: getComputedStyle(title, '::before').content,
    };
}));
