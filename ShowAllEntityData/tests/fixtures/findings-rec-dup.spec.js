'use strict';

// The "Possible duplicate recording" finding (rec-dup): majkinetor's Fusion
// gates, ported verbatim (scripts/check-fusion-port.js pins the port against
// the clone and against Fusion's own spec cases). Mockup approved 2026-11-20:
// https://claude.ai/artifact/LCthm5p9EiftZC6znZsqVB — design in
// docs/claude/findings.md, "Possible duplicate recordings: rec-dup".
//
// What each block pins, and the neighbouring property it keeps apart:
//
//  1. STRICT ON AN ARTIST'S RECORDINGS (Petty, 2512 rows; the cutoff Auto picks
//     there). The oracle is the page itself, read in the test, never the
//     grouping code: two rows that share an ISRC, are both audio, lie within
//     30 s and carry no two different live dates or an open edit MUST be in one
//     group; and every group must be held together by shared ISRCs. A stamp
//     that marked any row with an ISRC would pass a count; the first half
//     sees it. A grouping that ignored the gates would pass the second half;
//     the first half's "kept apart" rows see that.
//  2. THE MENU AND THE FILTER: the ⚠️ row counts ROWS, clicking it leaves
//     exactly the stamped rows, clicking again brings every row back.
//  3. THE 📊 SECTION: one entry per group, in the context's order; ticking
//     one leaves exactly that group's rows; the quickfilter finds an entry.
//  4. THE LOOK: the generic tint and ⚠️ on the title cell; the tint setting
//     off keeps the menu row but no tint.
//  5. THE CARD: a kind 'dup' entry, its tier pill and the other members.
//  6. SURVIVAL: the stamp is on the SOURCE rows (it is still there after a
//     filter re-render).
//  7. THE SWITCH: sa_findings_rec_dup off, no stamp, no menu row, no 📊.
//
// Network-free: the committed Petty disk fixture.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { findingRow, clickFinding, findingRowState } = require('../support/findingsMenu');
const { typeGlobalFilter } = require('../support/filterSortAssertions');
const { waitForRenderComplete } = require('../support/browser');

const PETTY = {
    url: 'https://musicbrainz.org/artist/f93dbc64-6f08-4033-bcc7-8a0bb4689849/recordings',
    fixture: path.join(__dirname, 'saved-data', 'artist-recordings-petty.json.gz'),
    total: 2512,
};
const SECTION = 'Duplicate recordings - Group';
const SETTLE = { timeout: 30000 };

/**
 * Loads the Petty recordings fixture (cover art and relationships off).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings] extra settings
 */
async function openPetty(page, settings = {}) {
    await loadFromDiskFixture(page, {
        url: PETTY.url, fixturePath: PETTY.fixture, testMode: true,
        settingsOverride: { sa_enable_relationships_column: false, sa_enable_caa_pics: false, ...settings },
    });
    await expect.poll(() => findingRowState(page).then(s => s.visible), SETTLE).toBe(PETTY.total);
    await waitForRenderComplete(page, { waitForAutoResize: false });
    // the stamp runs at the render tail, after the rows are in
    await expect.poll(() => page.evaluate(() => window.__saTest.recDup().why.stampGen), SETTLE).toBeGreaterThan(0);
}

/**
 * Every row of the page as the oracle reads it, from the DOM: the recording
 * MBID, its ISRCs (hrefs), length in seconds, video or audio, the comment's
 * live date, an open edit on the recording link, the stamp and group key.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<Object>>}
 */
function pageRows(page) {
    return page.evaluate(() => {
        const t = document.querySelector('table.tbl');
        const names = Array.from(t.querySelectorAll('thead tr:first-child th')).map(th => th.dataset.colName || '');
        const ix = n => names.indexOf(n);
        const [iName, iIsrc, iLen, iVid, iCom] = [ix('Name'), ix('ISRCs'), ix('Length'), ix('Video'), ix('Comment')];
        return Array.from(t.tBodies[0].rows).filter(r => r.cells.length > 1).map(r => {
            const name = r.cells[iName];
            const a = name.querySelector('a[href*="/recording/"]');
            const len = /(\d+):(\d{2})/.exec(r.cells[iLen].textContent.replace(/\s+/g, ''));
            const com = r.cells[iCom].textContent.replace(/‐/g, '-');
            const date = /^(?:live|live rehearsal|studio|rehearsal|soundcheck)[, ]+(\d{4}(?:-[\d?]{2}){0,2})/i.exec(com.trim());
            return {
                mbid: (/\/recording\/([0-9a-f-]{36})/.exec(a.getAttribute('href')) || [])[1],
                isrcs: Array.from(r.cells[iIsrc].querySelectorAll('a[href^="/isrc/"]')).map(x => x.getAttribute('href').slice(6).toUpperCase()),
                secs: len ? Number(len[1]) * 60 + Number(len[2]) : null,
                video: (r.cells[iVid].querySelector('.mb-video-sort-key') || {}).textContent || '',
                date: date ? date[1] : null,
                pending: !!a.closest('span.mp'),
                stamped: (name.dataset.mbFindings || '').split(' ').includes('rec-dup'),
                key: name.dataset.mbRecDup || null,
            };
        });
    });
}

/**
 * Opens the title column's 📊 panel.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} col
 */
async function openUniq(page, col) {
    await page.evaluate((name) => {
        const th = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th')).find(x => (x.dataset.colName || '') === name);
        th.querySelector('.mb-col-uniq-wrap').click();
    }, col);
    await expect(page.locator('#mb-col-uniq-dropdown')).toBeVisible();
}

/**
 * One 📊 section's entries: label and count.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sec
 * @returns {Promise<?Array<{label: string, count: number, hidden: boolean}>>}
 */
function sectionItems(page, sec) {
    return page.evaluate((name) => {
        const el = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
            .find(x => (x.querySelector('.mb-uniq-section-label')?.textContent || '').includes(name));
        return el ? Array.from(el.querySelectorAll('.mb-col-uniq-item')).map(i => ({
            label: i.dataset.mbUniqSynLabel,
            count: Number((/\((\d+)\)/.exec(i.querySelector('.mb-uniq-count-badge')?.textContent || '') || [])[1]),
            hidden: i.style.display === 'none',
        })) : null;
    }, sec);
}

test.describe('rec-dup: strict on an artist\'s recordings (Petty)', () => {
    test('the stamp groups exactly the rows the page says belong together', async ({ page }) => {
        await openPetty(page);
        const ctx = await page.evaluate(() => window.__saTest.recDup());
        expect(ctx.active, JSON.stringify(ctx.why)).toBe(true);
        expect(ctx.cutoff).toBe('strict');
        expect(ctx.groups.length).toBeGreaterThan(3);
        expect(ctx.groups.every(g => g.tier === 'strict' && g.sig === 'ISRC')).toBe(true);
        const rows = await pageRows(page);
        const stamped = rows.filter(r => r.stamped);
        // the stamp and the key agree, row for row
        expect(rows.every(r => r.stamped === !!r.key)).toBe(true);
        expect(new Set(stamped.map(r => r.mbid))).toEqual(new Set(ctx.groups.flatMap(g => g.members)));
        // the oracle, half 1: every pair the page says is a duplicate is in one group
        const free = (a, b) => a.video === b.video && a.secs != null && b.secs != null && Math.abs(a.secs - b.secs) <= 30 &&
            !(a.date && b.date && a.date !== b.date) && !a.pending && !b.pending;
        let pairs = 0;
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const a = rows[i], b = rows[j];
                if (!a.isrcs.some(x => b.isrcs.includes(x)) || !free(a, b)) continue;
                pairs++;
                expect(a.key && a.key === b.key, `${a.mbid} and ${b.mbid} share an ISRC and nothing keeps them apart`).toBe(true);
            }
        }
        expect(pairs).toBeGreaterThan(0);
        // half 2: every group is held together by shared ISRCs
        const byKey = new Map();
        stamped.forEach(r => { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key).push(r); });
        for (const members of byKey.values()) {
            expect(members.length).toBeGreaterThan(1);
            for (const m of members) {
                expect(members.some(o => o !== m && o.isrcs.some(x => m.isrcs.includes(x))), `${m.mbid} shares an ISRC in its group`).toBe(true);
            }
        }
    });

    test('the ⚠️ row counts the rows, and filters to exactly them', async ({ page }) => {
        await openPetty(page);
        const rows = await pageRows(page);
        const n = rows.filter(r => r.stamped).length;
        const row = await findingRow(page, 'warn', 'rec-dup');
        expect(row && row.count).toBe(n);
        expect(row.label).toContain('Possible duplicate recording');
        await clickFinding(page, 'rec-dup');
        await expect.poll(() => findingRowState(page, 'rec-dup'), SETTLE).toEqual({ visible: n, withFinding: n });
        await clickFinding(page, 'rec-dup');
        await expect.poll(() => findingRowState(page).then(s => s.visible), SETTLE).toBe(PETTY.total);
    });

    test('📊 lists one entry per group; ticking one leaves its rows; the quickfilter finds it', async ({ page }) => {
        await openPetty(page);
        const ctx = await page.evaluate(() => window.__saTest.recDup());
        await openUniq(page, 'Name');
        const items = await sectionItems(page, SECTION);
        expect(items, 'the section is there').not.toBeNull();
        expect(items.length).toBe(ctx.groups.length);
        // in the context's order, with each group's size as its count
        ctx.groups.forEach((g, i) => expect(items[i].count).toBe(g.members.length));
        expect(items.every(i => / · ISRC$/.test(i.label))).toBe(true);
        // the quickfilter: an entry's title finds it (mbUniqSynLabel), and
        // hides an entry of another title
        const q = page.locator('#mb-col-uniq-dropdown .mb-uniq-qf-input');
        const other = items.find(i => i.label.split(' · ')[0] !== items[1].label.split(' · ')[0]);
        await q.fill(items[1].label.split(' · ')[0]);
        await expect.poll(async () => (await sectionItems(page, SECTION) || []).filter(i => !i.hidden).map(i => i.label), SETTLE)
            .toContain(items[1].label);
        expect((await sectionItems(page, SECTION)).find(i => i.label === other.label).hidden).toBe(true);
        await q.fill('');
        const g = ctx.groups[0];
        await page.evaluate(([sec, lbl]) => {
            const s = Array.from(document.querySelectorAll('#mb-col-uniq-dropdown .mb-uniq-section'))
                .find(x => (x.querySelector('.mb-uniq-section-label')?.textContent || '').includes(sec));
            Array.from(s.querySelectorAll('.mb-col-uniq-item')).find(el => el.dataset.mbUniqSynLabel === lbl).click();
        }, [SECTION, items[0].label]);
        await expect.poll(async () => (await pageRows(page)).length, SETTLE).toBe(g.members.length);
        const shown = await pageRows(page);
        expect(shown.every(r => r.key === g.key)).toBe(true);
        expect(new Set(shown.map(r => r.mbid))).toEqual(new Set(g.members));
    });

    test('the title cell is tinted with ⚠️; the tint setting off keeps the menu row', async ({ page }) => {
        await openPetty(page);
        const look = await page.evaluate(() => {
            const td = document.querySelector('td[data-mb-findings~="rec-dup"]');
            const plain = Array.from(document.querySelectorAll('table.tbl tbody td')).find(c => c.cellIndex === td.cellIndex && !c.dataset.mbFindings);
            return { level: td.dataset.mbFinding, bg: getComputedStyle(td).backgroundColor, plainBg: getComputedStyle(plain).backgroundColor,
                after: getComputedStyle(td, '::after').content };
        });
        expect(look.level).toBe('warn');
        expect(look.bg).not.toBe(look.plainBg);
        expect(look.after).toContain('⚠');
    });

    test('tint off: no tint, the finding and its menu row stay', async ({ page }) => {
        await openPetty(page, { sa_findings_tint_rec_dup: false });
        const td = await page.evaluate(() => {
            const c = document.querySelector('td[data-mb-findings~="rec-dup"]');
            return c ? { level: c.dataset.mbFinding || null } : null;
        });
        expect(td).not.toBeNull();
        expect(td.level).toBeNull();
        expect((await findingRow(page, 'warn', 'rec-dup')).count).toBeGreaterThan(0);
    });

    test('the card: a dup entry with its tier pill and the other members', async ({ page }) => {
        await openPetty(page);
        const card = await page.evaluate(() => {
            const td = document.querySelector('td[data-mb-findings~="rec-dup"]');
            const raw = JSON.parse(td.getAttribute('data-mb-tip-cmp'));
            const el = document.createElement('div');
            return { title: td.getAttribute('title'), entry: raw.c.find(c => c.kind === 'dup'), key: td.dataset.mbRecDup, el: !!el };
        });
        expect(card.title).toContain('Possible duplicate recording: same recording as');
        expect(card.entry.tier).toBe('strict');
        expect(card.entry.m.length).toBeGreaterThan(0);
        expect(card.entry.isrc).toMatch(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/);
        // the rendered card: hover the cell and read the shared tooltip
        const cell = page.locator('td[data-mb-findings~="rec-dup"]').first();
        await cell.scrollIntoViewIfNeeded();
        await cell.hover();
        const tip = page.locator('#mb-stat-tooltip');
        await expect(tip).toBeVisible({ timeout: 5000 });
        await expect(tip.locator('.mb-tt-pill.mb-recdup-strict')).toHaveText('strict');
        await expect(tip).toContainText('They share the ISRC');
        await expect(tip.locator('ul.mb-recdup-list li')).toHaveCount(card.entry.m.length);
        await expect(tip).toContainText('Fusion\'s rules (majkinetor), cutoff strict');
    });

    test('the stamp is on the source rows: it survives a filter re-render', async ({ page }) => {
        await openPetty(page);
        const before = (await pageRows(page)).filter(r => r.stamped).map(r => r.mbid).sort();
        await typeGlobalFilter(page, 'zzzz-no-such-row');
        await expect.poll(async () => (await pageRows(page)).length, SETTLE).toBe(0);
        await page.locator('#mb-global-filter-input').click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await expect.poll(async () => (await pageRows(page)).length, SETTLE).toBe(PETTY.total);
        const after = (await pageRows(page)).filter(r => r.stamped).map(r => r.mbid).sort();
        expect(after).toEqual(before);
    });

    test('the switch off: no stamp, no menu row, no 📊 section', async ({ page }) => {
        await openPetty(page, { sa_findings_rec_dup: false });
        expect((await pageRows(page)).filter(r => r.stamped || r.key).length).toBe(0);
        expect(await findingRow(page, 'warn', 'rec-dup')).toBeUndefined();
        await openUniq(page, 'Name');
        expect(await sectionItems(page, SECTION)).toBeNull();
    });
});
