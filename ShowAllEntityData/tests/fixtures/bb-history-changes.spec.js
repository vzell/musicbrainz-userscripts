'use strict';

// Brucebase Phase 10 (org/brucebase.org): the Recent changes "changes" button
// (the original "BB changes button" TODO) and the first difference scrolled
// to (the TODO "create userscript which directly scrolls to the first
// difference … when clicking history"), in our History pane and in the
// wiki's own comparison. Recent changes is served from its fixture, its list
// answered with one change of song:the-promise; the window's page and its
// history modules come from tests/fixtures/bb-history/ (loadBbHistoryPage()).
// See docs/claude/brucebase.md, "Phase 10".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadBbHistoryPage, BB_HISTORY_DIR, BB_CHANGES_URL, BB_CHANGES_FIXTURE } = require('../support/bbFixture');
const { waitForRenderComplete } = require('../support/browser');

const dialog = (page) => page.locator('#mb-dp-dialog');
/** Revision ids of song:the-promise (tests/fixtures/bb-history/list-p1.json). */
const REV = { 45: '1543144702', 46: '1543144715', 47: '1543144729' };

/**
 * One Recent changes answer (SiteChangesListModule's JSON) listing the given
 * changes of song:the-promise, in the site's markup.
 *
 * @param {number[]} revs Revision numbers, newest first (0 = "(new)").
 * @returns {{status: string, body: string}}
 */
function changesAnswer(revs) {
    const item = (n) => '<div class="changes-list-item"><table><tr>' +
        '<td class="title"><a href="/song:the-promise">song: The Promise</a></td>' +
        '<td class="flags"><span class="spantip" title="content source text changed">S</span></td>' +
        '<td class="mod-date"><span class="odate time_1775447360">06 Apr 2026 03:49</span></td>' +
        `<td class="revision-no">${n ? `(rev. ${n})` : '(new)'}</td>` +
        '<td class="mod-by"><span class="printuser"><a href="https://www.wikidot.com/user:info/editor-1">Editor 1</a></span></td>' +
        '</tr></table></div>';
    return { status: 'ok', body: `<div class="pager"><span class="pager-no">page 1</span></div>${revs.map(item).join('')}` };
}

/**
 * Loads Recent changes with the given changes of song:the-promise, presses
 * "the last 200 changes", and returns the module POSTs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number[]} revs
 * @param {Object} [settings]
 * @returns {Promise<Array<object>>}
 */
async function loadChanges(page, revs, settings = {}) {
    const { posts } = await loadBbHistoryPage(page, {
        url: BB_CHANGES_URL,
        fixtureFile: BB_CHANGES_FIXTURE,
        settingsOverride: { sa_bb_detail_preview: true, ...settings },
        answer: ({ module }) => (module === 'changes/SiteChangesListModule' ? { json: changesAnswer(revs) } : null),
    });
    await page.click('button[data-label="Show the last 200 changes"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    return posts;
}

test.describe('Brucebase Phase 10: the changes button and the first difference', () => {
    test('a row\'s changes button: the page\'s History in the window, that revision against the one before', async ({ page }) => {
        const posts = await loadChanges(page, [46]);
        const btn = page.locator('table.tbl tbody tr').first().locator('button.mb-bb-changes-btn');
        await expect(btn).toHaveAttribute('data-mb-bb-rev', '46');
        // No text of its own: the Page cell still reads as the title.
        await expect(page.locator('table.tbl tbody tr').first().locator('td').first()).toHaveText('The Promise');
        await btn.click();
        const hist = dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="History"]');
        await expect(hist).toHaveJSProperty('open', true);
        await expect(hist.locator('.mb-bbh-pane')).toContainText('Revision 46 · against 45');
        await expect(hist.locator(`label.mb-bbh-pk[data-mb-bbh-act="to"][data-mb-bbh-v="${REV[46]}"] input`)).toBeChecked();
        await expect(hist.locator(`label.mb-bbh-pk[data-mb-bbh-act="from"][data-mb-bbh-v="${REV[45]}"] input`)).toBeChecked();
        // The first changed line is marked and in view.
        const first = hist.locator('.mb-bbh-diff .mb-bbh-first');
        await expect(first).toHaveCount(1);
        await expect(first).toHaveClass(/mb-bbh-(chg|rem|add)/);
        const firstChanged = await hist.locator('.mb-bbh-diff').evaluate((d) => {
            const f = d.querySelector('.mb-bbh-chg, .mb-bbh-rem, .mb-bbh-add');
            return f && f.classList.contains('mb-bbh-first');
        });
        expect(firstChanged, 'the mark is on the FIRST changed cell').toBe(true);
        await expect(first).toBeInViewport();
        // One comparison asked: 45 against 46 (never the newest pair first).
        expect(posts.filter((p) => p.module === 'history/PageDiffModule').map((p) => p.pair)).toEqual([`${REV[45]}-${REV[46]}`]);
    });

    test('an older revision (not in the list\'s first page): the next page is read for its row', async ({ page }) => {
        const p1 = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, 'list-p1.json'), 'utf8')).body;
        const nums = [...p1.matchAll(/revision-row-\d+[\s\S]*?<td>(\d+)\.<\/td>/g)].map((m) => parseInt(m[1], 10));
        const want = Math.min(...nums) - 3;
        const p2 = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, 'list-p2.json'), 'utf8')).body;
        // The row (each one "revision-row-<id>" … "<td>N.</td>") whose number is `want`.
        const id = p2.split('revision-row-').slice(1).map((r) => [r.match(/^\d+/)[0], (r.match(/<td>(\d+)\.<\/td>/) || [])[1]])
            .find(([, n]) => n === String(want))[0];
        const posts = await loadChanges(page, [want]);
        await page.locator('table.tbl tbody tr').first().locator('button.mb-bb-changes-btn').click();
        const hist = dialog(page).locator('details.mb-dp-sec[data-mb-dp-sec="History"]');
        await expect(hist.locator(`label.mb-bbh-pk[data-mb-bbh-act="to"][data-mb-bbh-v="${id}"] input`)).toBeChecked();
        expect(posts.filter((p) => p.module === 'history/PageRevisionListModule').map((p) => p.page)).toEqual(['1', '2']);
    });

    test('with the history off (sa_bb_history), no button', async ({ page }) => {
        await loadChanges(page, [46], { sa_bb_history: false });
        await expect(page.locator('table.tbl tbody tr')).toHaveCount(1);
        await expect(page.locator('button.mb-bb-changes-btn')).toHaveCount(0);
    });

    test('the wiki\'s own comparison: its first difference is scrolled into view and marked', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 700 });
        await loadBbHistoryPage(page);
        const body = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, `compare-${REV[45]}-${REV[46]}.json`), 'utf8')).body;
        // As the wiki's history module draws it: a sub-area under
        // #action-area, far below the top, the comparison inside.
        await page.evaluate((html) => {
            window.scrollTo(0, 0);
            const area = document.getElementById('action-area');
            area.style.display = 'block';
            const pad = document.createElement('div');
            pad.style.height = '2500px';
            area.appendChild(pad);
            const sub = document.createElement('div');
            sub.id = 'history-subarea';
            area.appendChild(sub);
            sub.innerHTML = html;
        }, body);
        const first = page.locator('#action-area .diff-box .mb-bb-first-diff');
        await expect(first).toHaveCount(1);
        const isFirst = await page.evaluate(() => document.querySelector('#action-area .inline-diff').querySelector('ins, del').classList.contains('mb-bb-first-diff'));
        expect(isFirst).toBe(true);
        await expect(first).toBeInViewport();
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    });

    test('the wiki\'s comparison with the history off: left alone', async ({ page }) => {
        await loadBbHistoryPage(page, { settingsOverride: { sa_bb_history: false } });
        const body = JSON.parse(fs.readFileSync(path.join(BB_HISTORY_DIR, `compare-${REV[45]}-${REV[46]}.json`), 'utf8')).body;
        await page.evaluate((html) => {
            const area = document.getElementById('action-area');
            area.style.display = 'block';
            area.insertAdjacentHTML('beforeend', `<div id="history-subarea">${html}</div>`);
        }, body);
        await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
        await expect(page.locator('.mb-bb-first-diff')).toHaveCount(0);
    });
});
