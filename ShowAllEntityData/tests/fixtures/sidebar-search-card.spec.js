// @ts-check
// The "Sidebar" cards on a release whose sidebar carries jesus2099's
// "mb. ALL LINKS" search lists (mockup https://claude.ai/artifact/V9Pqx5r7K37Qe3PEm93cpc,
// picked 2026-10-17: "A3 + B1 + D2 + C1, variants merged, empty sections at
// the foot"). Fixture: the raw page of Devils & Dust (bootleg, PROF Records),
// saved with that script active (debug/DaD-ISRC-Links-initial.html).
//
// Before: every nested `ul.external_links` of the script was a card of its own
// (26 cards named "Search …"), and an item's "details" was the text of the
// whole tree under it run together (378 characters on the "By genre" item).
//
// Guarantees pinned here, each named:
//   - ONE CARD: the script's three headings are ONE card "Search", where the
//     sidebar has them (between the two link cards); no other card holds one
//     of its links; it starts closed;
//   - EVERY LINK ONCE: the card holds each of the script's links exactly once,
//     and the section's count is the number of distinct entries, not more;
//   - NO BLOB: no chip carries more than its own text; text another script
//     puts in an item ("edit", "choose languages") is left out; a nested link
//     is a small child link (Wikidata › en);
//   - INDEX: sections, groups and sites as the script nests them; empty
//     sections and groups only in the foot line;
//   - VARIANTS: "X (by a)" / "X (by b)" / "X" are one entry with variant links;
//   - SCOPE + FIND: the switch shows one heading; typing narrows the entries
//     and their count; Esc empties the box and goes no further;
//   - LAYOUT: facts on the left, links beside them; stacked when narrow;
//   - HOVER: a search link's card names the site behind the forwarding page;
//   - TABLES: the Credits render gets ONE "Sidebar: Search" table with the
//     section and group of each link, and clean link details;
//   - DEFAULT OPEN (2026-10-17): every card starts open but Search;
//   - ICONS (2026-10-17): a link shows the site icon its sidebar item shows
//     (MusicBrainz's *-favicon class, the script's inline background), in
//     the cards and in the Sidebar tables; a variant link shows none.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL_ = 'https://musicbrainz.org/release/6336b8db-ac72-4afa-a954-94b437b49abc';
const FIXTURE = path.join(__dirname, 'release-tracks-sidebar-search-links.html');
// MusicBrainz's own rule for a *-favicon class, as its icons-*.css writes it:
// a data: URI (checked in a real browser 2026-10-17; the first ICONS spec used
// an https URL and missed that the script dropped every data: icon).
const DISCOGS_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const DISCOGS_ICON_CSS = `ul.external_links li.discogs-favicon { background-image: url("${DISCOGS_ICON}"); }`;

/**
 * Loads the fixture (network refused) and presses one of its buttons.
 * @param {import('@playwright/test').Page} page
 * @param {string} label The button's data-label.
 * @param {Object} [settings]
 * @param {string} [css] A style sheet added before the button is pressed
 *   (MusicBrainz's own, refused here, draws the sidebar's site icons).
 */
async function open(page, label = 'Show all Tracks for Release', settings = {}, css = '') {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: URL_, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_relationship_tables: true, sa_enable_release_tracks: true,
                            sa_enable_caa_pics: false, sa_enable_relationships_column: false, sa_collabsable_sidebar: false, ...settings },
    });
    await page.route('https://musicbrainz.org/ws/2/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(/^https:\/\/musicbrainz\.org\/(?!ws\/)/, (route) => route.fulfill({ path: FIXTURE, contentType: 'text/html' }));
    await page.route('https://coverartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    if (css) await page.addStyleTag({ content: css });
    await page.click(`button[data-label="${label}"]`);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

/** The script's search links, read straight from the sidebar (the test's own oracle). */
const searchOracle = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('#sidebar ul.jesus2099_all-links_searchLinks a[href]')).map((a) => a.href));

/** The cards in order, with what each holds. */
const cards = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.mb-sb-inline .mb-sb-card')).map((c) => ({
    key: c.dataset.mbSbKey,
    name: c.querySelector('.mb-sb-card-head span').textContent,
    count: Number(c.querySelector('.mb-sb-card-count').textContent),
    shut: c.classList.contains('mb-sb-card-shut'),
    hrefs: Array.from(c.querySelectorAll('.mb-sb-card-body a[href]')).map((a) => a.href),
    details: Array.from(c.querySelectorAll('.mb-sb-chip-detail')).map((d) => d.textContent),
})));

/** Opens the Search card (it starts closed). */
async function openSearch(page) {
    await page.locator('.mb-sb-card[data-mb-sb-key="search"] > .mb-sb-card-head').click();
    await expect(page.locator('.mb-sb-search')).toBeVisible();
}

/** The Search card's visible index: parts → sections → lines, as text. */
const index = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.mb-sb-ix-part')).filter((p) => !p.hidden).map((p) => ({
    source: p.dataset.mbSbSource,
    secs: Array.from(p.querySelectorAll('.mb-sb-ix-sec')).filter((s) => !s.hidden).map((s) => ({
        h: (s.querySelector('.mb-sb-ix-h') || { textContent: '' }).textContent,
        lines: Array.from(s.querySelectorAll('.mb-sb-ix-g')).filter((g) => !g.hidden).map((g) => ({
            group: (g.querySelector(':scope > em') || { textContent: '' }).textContent,
            entries: Array.from(g.querySelectorAll('.mb-sb-ix-it')).filter((i) => !i.hidden).map((i) => ({
                base: i.firstChild.textContent,
                variants: Array.from(i.querySelectorAll('.mb-sb-ix-vv a')).map((a) => a.textContent),
            })),
        })),
    })),
})));

test.describe('the Search card (jesus2099 mb. ALL LINKS)', () => {
    test('ONE CARD + EVERY LINK ONCE: one "Search" card between the link cards, closed, each link exactly once', async ({ page }) => {
        await open(page);
        const c = await cards(page);
        expect(c.map((x) => x.name)).toEqual(['Release information', 'Additional details', 'Labels', 'Release events',
            'External links', 'Search', 'Release group external links']);
        const oracle = await searchOracle(page);
        expect(oracle.length, 'the fixture has the script\'s lists').toBe(56);
        const search = c.find((x) => x.key === 'search');
        expect(search.count).toBe(56);
        expect(search.shut, 'it starts closed').toBe(true);
        expect([...search.hrefs].sort(), 'each of the script\'s links exactly once').toEqual([...oracle].sort());
        const others = c.filter((x) => x.key !== 'search').flatMap((x) => x.hrefs);
        expect(others.filter((h) => oracle.includes(h)), 'no other card holds a search link').toEqual([]);
        // 10 facts + 1 + 56 + 9 links: the section counts each entry once.
        const h2 = await page.locator('.mb-sb-inline-wrap > h2').textContent();
        expect(h2).toMatch(/\(76\)/);
    });

    test('NO BLOB: chips carry only their own text; Wikidata\'s nested Wikipedia link is a small child link', async ({ page }) => {
        await open(page);
        const c = await cards(page);
        const links = c.filter((x) => x.key === 'links');
        expect(links.flatMap((x) => x.details), 'no item text from another script').toEqual([]);
        const kid = await page.evaluate(() => {
            const chip = Array.from(document.querySelectorAll('.mb-sb-chip')).find((ch) => /Wikidata/.test(ch.textContent));
            const k = chip && chip.querySelector('.mb-sb-chip-kid a');
            return chip && { text: chip.textContent.replace(/\s+/g, ' ').trim(), kid: k && k.textContent, href: k && k.href };
        });
        expect(kid).toEqual({ text: 'Wikidata: Q2038517› en', kid: 'en', href: 'https://en.wikipedia.org/wiki/Devils_%26_Dust' });
        const discogs = await page.evaluate(() => Array.from(document.querySelectorAll('.mb-sb-chip'))
            .filter((ch) => /^Discogs/.test(ch.textContent.trim())).map((ch) => ch.textContent.trim()));
        expect(discogs, 'no "edit" from the script\'s edit icon').toEqual(['Discogs', 'Discogs']);
    });

    test('INDEX + VARIANTS: sections, groups and sites as nested; variants merged; empty ones in the foot', async ({ page }) => {
        await open(page);
        await openSearch(page);
        const ix = await index(page);
        expect(ix.map((p) => p.source)).toEqual(['Search the web', 'Search in the whitelist', 'Search further']);
        const wl = ix[1];
        expect(wl.secs.map((s) => s.h)).toEqual(['By genre · 19', 'By area · 11', 'Online shops · 2', 'Other databases · 11']);
        const rock = wl.secs[0].lines.find((l) => l.group === 'Rock');
        expect(rock.entries).toEqual([
            { base: 'Prog Archives', variants: ['barcode', 'name'] },
            { base: 'Spirit of Rock', variants: [] },
        ]);
        const other = wl.secs[3].lines[0];
        expect(other.group, 'a section without groups').toBe('');
        expect(other.entries.find((e) => e.base === 'Discogs')).toEqual({ base: 'Discogs', variants: ['artist credit', 'barcode'] });
        expect(other.entries.find((e) => e.base === 'Wikipedia')).toEqual({ base: 'Wikipedia', variants: ['en'] });
        const jp = ix[2].secs[0].lines.find((l) => l.group === 'Japan');
        expect(jp.entries.find((e) => e.base === 'MINC')).toEqual({ base: 'MINC', variants: ['CD商品タイトル', '品番/POS'] });
        expect(jp.entries.find((e) => /ヨドバシ/.test(e.base)), 'a lone "(cat)" stays as written').toEqual({ base: 'ヨドバシカメラ (cat)', variants: [] });
        // The plain "Discogs" links its own search; the variant links theirs.
        const hrefs = await page.evaluate(() => {
            const it = Array.from(document.querySelectorAll('.mb-sb-ix-it')).find((i) => /^Discogs/.test(i.textContent));
            return { base: it.querySelector(':scope > a').href, vv: Array.from(it.querySelectorAll('.mb-sb-ix-vv a')).map((a) => a.href) };
        });
        expect(hrefs.base).toBe('https://www.discogs.com/en/search?title=Devils%20%26%20Dust&type=release');
        expect(hrefs.vv[1]).toBe('https://www.discogs.com/en/search/?q=498172653986&type=release');
        await expect(page.locator('.mb-sb-foot')).toHaveText('Nothing for this release in: Lyrics, Score, Korea (by area), Social networks, France (by area), USA (by area).');
        const all = JSON.stringify(ix);
        expect(all, 'empty sections are not in the index').not.toMatch(/Lyrics|Score|Social networks|Korea|USA/);
    });

    test('SCOPE + FIND: the switch shows one heading; typing narrows; Esc empties the box and goes no further', async ({ page }) => {
        await open(page);
        await openSearch(page);
        const n = page.locator('.mb-sb-find-n');
        await expect(n).toHaveText(/^\d+ entries$/);
        const all = await n.evaluate((el) => el.textContent);
        await page.locator('.mb-sb-scope-btn', { hasText: 'Whitelist' }).click();
        expect((await index(page)).map((p) => p.source)).toEqual(['Search in the whitelist']);
        await expect(page.locator('.mb-sb-scope-btn[aria-pressed="true"]')).toHaveText('Whitelist 43');
        await expect(page.locator('.mb-sb-foot')).toHaveText('Nothing for this release in: Lyrics, Score, Korea (by area), Social networks.');
        await page.locator('.mb-sb-scope-btn', { hasText: 'All' }).click();
        await expect(n).toHaveText(all);

        const find = page.locator('.mb-sb-find');
        await find.fill('prog');
        const ix = await index(page);
        expect(ix.flatMap((p) => p.secs.flatMap((s) => s.lines.flatMap((l) => l.entries.map((e) => e.base))))).toEqual(['Prog Archives']);
        await expect(n).toHaveText(new RegExp(`^1 of ${all.replace(/ entries$/, '')} entries$`));
        await expect(page.locator('.mb-sb-foot'), 'no foot while finding').toBeHidden();
        await expect(page.locator('.mb-sb-ix-it.mb-sb-hit')).toHaveCount(1);
        // A group name finds its sites too.
        await find.fill('japan');
        expect((await index(page)).flatMap((p) => p.secs.flatMap((s) => s.lines.map((l) => l.group)))).toEqual(['Japan', 'Japan']);

        await find.press('Escape');
        await expect(find).toHaveValue('');
        await expect(n).toHaveText(all);
        await expect(page.locator('.mb-sb-search'), 'Esc stopped at the box: the card is still open').toBeVisible();
        await expect(page.locator('.mb-sb-inline'), 'and the section too').toBeVisible();
    });

    test('BOXES: every section is a box its sites stay inside; group names line up; Search the web is one row', async ({ page }) => {
        await open(page);
        await openSearch(page);
        // What the screenshot of 2026-10-17 showed broken: sites with no
        // break between them ran out of their column into the next one,
        // and "Web pages" broke after "Web".
        const measure = () => page.evaluate(() => {
            const out = { boxes: 0, unboxed: [], outside: [], split: [], misaligned: [], webRows: 0, webSplit: [] };
            document.querySelectorAll('.mb-sb-ix-sec').forEach((sec) => {
                if (!sec.checkVisibility()) return;
                out.boxes++;
                const name = (sec.querySelector('.mb-sb-ix-h') || { textContent: '(no name)' }).textContent;
                if (getComputedStyle(sec).borderTopStyle !== 'solid') out.unboxed.push(name);
                const box = sec.getBoundingClientRect();
                sec.querySelectorAll('.mb-sb-ix-it').forEach((it) => {
                    for (const r of it.getClientRects()) {
                        if (r.left < box.left - 0.5 || r.right > box.right + 0.5) out.outside.push(it.textContent);
                    }
                    // A site's name (and its icon) on one line: the fixture
                    // has no name wider than a box.
                    const a = it.querySelector(':scope > a');
                    if (a && a.getClientRects().length !== 1) out.split.push(it.textContent);
                });
                const lefts = new Set(Array.from(sec.querySelectorAll('.mb-sb-ix-s')).map((s) => Math.round(s.getBoundingClientRect().left)));
                if (lefts.size > 1) out.misaligned.push(name);
            });
            const web = document.querySelector('.mb-sb-ix-part[data-mb-sb-source="Search the web"]');
            const its = Array.from(web.querySelectorAll('.mb-sb-ix-it'));
            out.webRows = new Set(its.map((it) => Math.round(it.getBoundingClientRect().top))).size;
            its.forEach((it) => { if (it.querySelector('a').getClientRects().length !== 1) out.webSplit.push(it.textContent); });
            out.webOne = web.querySelector('.mb-sb-ix').classList.contains('mb-sb-ix-one');
            return out;
        });
        for (const width of [1400, 560]) {
            await page.setViewportSize({ width, height: 900 });
            const m = await measure();
            expect(m.boxes, `${width}px: boxes shown`).toBeGreaterThan(5);
            expect(m.unboxed, `${width}px: sections without a box`).toEqual([]);
            expect(m.outside, `${width}px: sites outside their box`).toEqual([]);
            expect(m.split, `${width}px: site names split over two lines`).toEqual([]);
            expect(m.misaligned, `${width}px: boxes whose group sites start at different edges`).toEqual([]);
            expect(m.webRows, `${width}px: Search the web in one row`).toBe(1);
            expect(m.webSplit, `${width}px: no web link split over two lines`).toEqual([]);
            expect(m.webOne, 'one section: one box in one row').toBe(true);
        }
        // Finding hides a whole group: its name goes with it, though the
        // line itself has no box (display: contents).
        await page.locator('.mb-sb-find').fill('prog');
        const genre = page.locator('.mb-sb-ix-sec', { has: page.locator('.mb-sb-ix-h', { hasText: /^By genre/ }) });
        await expect(genre.locator('.mb-sb-ix-g > em:visible')).toHaveText(['Rock']);
    });

    test('LAYOUT: facts in a column on the left, links beside them; stacked when narrow', async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await open(page);
        const box = () => page.evaluate(() => {
            const r = (el) => el.getBoundingClientRect();
            const rail = document.querySelector('.mb-sb-rail');
            const main = document.querySelector('.mb-sb-main');
            return {
                railKeys: Array.from(rail.querySelectorAll(':scope > .mb-sb-card')).map((c) => c.dataset.mbSbKey),
                mainKeys: Array.from(main.querySelectorAll(':scope > .mb-sb-card')).map((c) => c.dataset.mbSbKey),
                rail: r(rail), main: r(main),
            };
        });
        const wide = await box();
        expect(wide.railKeys).toEqual(['info', 'info', 'labels', 'events']);
        expect(wide.mainKeys).toEqual(['links', 'search', 'links']);
        expect(wide.main.left, 'side by side').toBeGreaterThanOrEqual(wide.rail.right);
        expect(wide.main.top).toBeLessThan(wide.rail.bottom);
        await page.setViewportSize({ width: 700, height: 1000 });
        const narrow = await box();
        expect(narrow.main.top, 'stacked: links below the facts').toBeGreaterThanOrEqual(narrow.rail.bottom);
    });

    test('HOVER: a search link\'s card names the site behind jesus2099\'s forwarding page', async ({ page }) => {
        await open(page);
        await openSearch(page);
        await page.locator('.mb-sb-ix-it a', { hasText: 'DRAM' }).hover();
        const card = page.locator('#mb-stat-tooltip');
        await expect(card).toBeVisible();
        await expect(card.locator('.mb-tt-title')).toHaveText('DRAM');
        await expect(card).toContainText('Search in the whitelist › By genre › Classical');
        await expect(card).toContainText('Searches dramonline.org through jesus2099\'s forwarding page');
    });

    // Reported 2026-10-17 (vzell's browser, "Tougher Than the Rest"): with
    // link previews on, a card link's hover card and the preview card showed
    // side by side. Like every other tip, the link's card goes into the
    // preview's note stack, and the separate box gives way.
    test('HOVER STACK: with link previews on, the link\'s card is a box of the preview\'s stack, never a second box', async ({ page }) => {
        await open(page, 'Show all Tracks for Release', { sa_pop_ext: true, sa_pop_mb_page: true, sa_dp_hover_without_ctrl: true });
        await openSearch(page);
        const link = page.locator('.mb-sb-ix-it a', { hasText: 'DRAM' });
        await link.hover();
        const peek = page.locator('#mb-dp-peek');
        const notes = page.locator('#mb-dp-notes');
        const tip = page.locator('#mb-stat-tooltip');
        await expect(peek).toBeVisible();
        await expect(notes, 'the link\'s card is in the stack').toContainText('Searches dramonline.org');
        await expect(notes.locator('.mb-dp-note-tip .mb-tt-title')).toHaveText('DRAM');
        // The box's kind line, with the hairline under it.
        await expect(notes.locator('.mb-dp-note-tip > .mb-pop-kind-head')).toHaveText('Link');
        await expect(notes.locator('.mb-dp-note-tip > .mb-pop-kind-head')).toHaveCSS('border-bottom-style', 'solid');
        await expect(tip, 'no second box').toBeHidden();
        // A link with child elements (a <bdi> in it) gets a mouseover again
        // each time the pointer crosses from a child back onto it, while its
        // preview stays: no second box then either.
        const box = await link.boundingBox();
        await link.evaluate((a, p) => a.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true, cancelable: true, view: window, clientX: p.x, clientY: p.y,
            sourceCapabilities: window.InputDeviceCapabilities ? new window.InputDeviceCapabilities({ firesTouchEvents: false }) : undefined,
        })), { x: box.x + 2, y: box.y + 2 });
        // The card would show synchronously in that mouseover: nothing to wait for.
        await expect(peek).toBeVisible();
        await expect(tip, 'no second box when the pointer comes back onto the link').toBeHidden();

        // The same for a link of MusicBrainz's own list.
        await page.mouse.move(5, 5);
        await expect(peek).toBeHidden();
        // Open from the start (the default since 2026-10-17).
        await expect(page.locator('.mb-sb-card[data-mb-sb-key="links"]').first()).not.toHaveClass(/mb-sb-card-shut/);
        const discogs = page.locator('.mb-sb-chip a', { hasText: 'Discogs' }).first();
        await discogs.hover();
        await expect(peek).toBeVisible();
        await expect(notes).toContainText('External links › Databases');
        await expect(tip).toBeHidden();
    });
});

test.describe('the Search links in the Credits render', () => {
    test('TABLES: one "Sidebar: Search" table with section and group; clean link details', async ({ page }) => {
        await open(page, 'Show all Credits for Release', { sa_sidebar_inline_skip_dup_links: false });
        const g = await page.evaluate(() => Array.from(document.querySelectorAll('h3.mb-toggle-h3')).map((h3) => {
            let t = h3.nextElementSibling;
            while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
            const icon = h3.querySelector('.mb-toggle-icon');
            const name = icon && icon.nextSibling ? icon.nextSibling.textContent.trim() : h3.textContent.trim();
            const heads = t ? Array.from(t.querySelectorAll('thead tr:first-child th')).map((th) => (th.dataset.colName || th.textContent).replace(/[⇅▲▼📊\d]/gu, '').trim()) : [];
            const rows = t ? Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.cells).map((td) => td.textContent.replace(/\s+/g, ' ').trim())) : [];
            return { name, heads, rows };
        }).filter((x) => x.name.startsWith('Sidebar: ')));
        expect(g.filter((x) => /^Sidebar: Search/.test(x.name)).map((x) => x.name)).toEqual(['Sidebar: Search']);
        const s = g.find((x) => x.name === 'Sidebar: Search');
        expect(s.heads).toEqual(['#', 'Search', 'Section', 'Group', 'Site', 'Link']);
        expect(s.rows.length).toBe(56);
        expect(s.rows.find((r) => r[5] === 'Prog Archives (by barcode)').slice(1, 4)).toEqual(['Search in the whitelist', 'By genre', 'Rock']);
        expect(s.rows.find((r) => r[5] === 'Images').slice(1, 4)).toEqual(['Search the web', '', '']);
        const rg = g.find((x) => x.name === 'Sidebar: Release group external links');
        expect(rg.rows.find((r) => /Wikidata/.test(r[2]))[4]).toBe('en: Devils & Dust');
        const ext = g.find((x) => x.name === 'Sidebar: External links');
        expect(ext.rows[0][4], 'no "edit"').toBe('');
    });

    test('DEFAULT OPEN: every card starts open but Search', async ({ page }) => {
        await open(page);
        const c = await cards(page);
        expect(c.filter((x) => x.shut).map((x) => x.name), 'only Search starts closed').toEqual(['Search']);
    });

    test('ICONS: each link shows its sidebar item\'s site icon, in the cards and the tables; a variant link none', async ({ page }) => {
        // MusicBrainz's own rule for its *-favicon classes (its stylesheet is refused here).
        const CSS = DISCOGS_ICON_CSS;
        await open(page, 'Show all Tracks for Release', {}, CSS);
        /** The site icon a link shows: the URL in its background, '' for none. */
        const iconOf = (loc) => loc.evaluate((a) => {
            const m = /url\("?(.*?)"?\)/.exec(getComputedStyle(a).backgroundImage);
            return a.classList.contains('mb-sb-ico') && m ? m[1] : '';
        });
        // MusicBrainz's class: as the real sidebar draws it.
        const discogs = page.locator('.mb-sb-chip a', { hasText: 'Discogs' }).first();
        expect(await iconOf(discogs)).toBe(DISCOGS_ICON);
        // Written once in a style sheet, never inline on each link (a data: icon is ~10 KB).
        expect(await discogs.evaluate((a) => a.style.backgroundImage), 'no inline icon').toBe('');
        expect(await discogs.getAttribute('data-mb-sb-ico')).toMatch(/^[0-9a-z]+$/);
        expect(await discogs.evaluate((a) => getComputedStyle(a).paddingLeft), 'room for it, left of the name').toBe('20px');
        // A link whose item shows no icon gets none.
        const plain = await page.evaluate(() => {
            const li = Array.from(document.querySelectorAll('#sidebar ul.external_links:not(.jesus2099_all-links_searchLinks) > li'))
                .find((x) => !x.closest('ul.jesus2099_all-links_searchLinks') && x.querySelector(':scope > a[href]') &&
                    getComputedStyle(x).backgroundImage === 'none');
            return li ? li.querySelector(':scope > a[href]').getAttribute('href') : null;
        });
        expect(plain, 'premise: an item without an icon').not.toBeNull();
        expect(await iconOf(page.locator(`.mb-sb-chip a[href="${plain}"]`).first())).toBe('');
        // The script's inline background on a search item.
        await openSearch(page);
        const web = page.locator('.mb-sb-ix-it a', { hasText: 'Web pages' }).first();
        expect(await iconOf(web)).toBe('https://duckduckgo.com/favicon.ico');
        // A merged entry shows its site's icon once, before its name: never on a variant link.
        const variants = page.locator('.mb-sb-ix-vv a');
        expect(await variants.count(), 'premise: variant links').toBeGreaterThan(0);
        expect(await variants.evaluateAll((as) => as.filter((a) => a.classList.contains('mb-sb-ico')).length)).toBe(0);
    });

    test('ICONS in the Credits render: the URL rows and the Sidebar tables, duplicates skipped (the default) or not', async ({ page }) => {
        // MusicBrainz's rules for two classes: Discogs (MusicBrainz's own link
        // and a search site) and AllMusic (a search site of the whitelist).
        const CSS = DISCOGS_ICON_CSS + ' ' + DISCOGS_ICON_CSS.replace('discogs-favicon', 'allmusic-favicon');
        const iconOf = (loc) => loc.evaluate((a) => (a.classList.contains('mb-sb-ico') ? getComputedStyle(a).backgroundImage : 'none'));
        /** The link in the first table under the h3 named `name` (the tables start collapsed: in the page, not on screen). */
        const inTable = (name, href) => page.locator('h3.mb-toggle-h3', { hasText: name }).first()
            .locator(`xpath=following-sibling::table[1]//a[@href="${href}"]`).first();

        // The default: the release's and its group's links are relationship
        // rows ("URLs", "Via release group"), left out of the Sidebar tables.
        await open(page, 'Show all Credits for Release', {}, CSS);
        const own = inTable('URLs', 'https://www.discogs.com/release/7644701');
        await expect(own, 'the release\'s Discogs link is a URL row').toBeAttached();
        expect(await iconOf(own), 'a URL row has the icon its sidebar item shows').toContain(DISCOGS_ICON);
        const master = inTable('Via release group', 'https://www.discogs.com/master/27097');
        await expect(master).toBeAttached();
        expect(await iconOf(master)).toContain(DISCOGS_ICON);
        // The Search table: a class-drawn icon (AllMusic) and an inline one (DuckDuckGo).
        const search = page.locator('h3.mb-toggle-h3', { hasText: 'Sidebar: Search' }).first().locator('xpath=following-sibling::table[1]');
        expect(await iconOf(search.locator('a', { hasText: /^AllMusic$/ }).first())).toContain(DISCOGS_ICON);
        expect(await iconOf(search.locator('a', { hasText: 'Web pages' }).first())).toContain('duckduckgo.com/favicon.ico');

        // Duplicates kept: the Sidebar tables' own copies have it too.
        await page.goto('about:blank');
        await open(page, 'Show all Credits for Release', { sa_sidebar_inline_skip_dup_links: false }, CSS);
        const copy = inTable('Sidebar: External links', 'https://www.discogs.com/release/7644701');
        await expect(copy).toBeAttached();
        expect(await iconOf(copy)).toContain(DISCOGS_ICON);
    });
});
