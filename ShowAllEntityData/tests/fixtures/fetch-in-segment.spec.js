'use strict';

// A fetch runs inside the segment that started it — option (b) of the SAED
// button (approved mockup v6, https://claude.ai/artifact/QUqoriyP6qX3D3EutjhyzX;
// docs/claude/toolbar-and-header-ui.md, "The SAED button").
//
// Until 2026-10-23 a fetch showed a separate red Stop button and a
// 600–750 px progress bar beside the toolbar. Now, while pages load, the
// pressed action segment IS both: a blue fill to `--p`, "■ Stop · n / N",
// and the line under the heading says the page, the rows so far and the time
// left. A failure ends as a red 🔄 indicator whose list resumes the fetch.
// What each test pins, and the neighbouring property it would still catch:
//
//   • THE RUNNING STATE while page 2 is held back: class, aria-label, label
//     AND the fill's `--p` (a label that counts while the fill stays empty
//     would pass a text-only check); the progress line is in the status
//     line, not in the toolbar; the bar holds nothing but the SAED button.
//   • THE OTHER ACTIONS WAIT (on artist-releasegroups, which has several),
//     and every one is usable again afterwards.
//   • STOP KEEPS THE ROWS: the segment says "Stopping…", page 3 is never
//     asked for, and exactly pages 1–2 are rendered (200 rows) — not 0 (the
//     run dropped) and not 300 (Stop ignored). The status says it was
//     stopped, so a short table is not taken for the whole listing.
//   • RENDERING, THEN THE RESTORE: the segment is seen striped with the row
//     count, then has its own label, tooltip card and enabled state back.
//   • PREFIX-MODE O is the same Stop.
//   • A FAILED PAGE: a red "🔄 2" segment (pages 2 and 3 missing) whose list
//     names the page and the reason; its row resumes, the indicator is gone
//     WHILE the resume runs (cleared at the run's start, not only at its
//     end), and the run ends with all 300 rows. A load from disk removes
//     it too (its rows have no page K to carry on from).
//
// Network-free: artist-events, 100 rows per page, 3 pages
// (html-fetch-transient-events.html, shared with resume-from-failed-page).
// Page 1 is the live document; pages 2 and 3 are fetched. A failure is a
// 404, which `fetchHtml()` does not retry (a 503 costs 7 s of backoff).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');
const { RUNNING_SEGMENT, MISSING_PAGES_SEGMENT, RESUME_ROW } = require('../support/stopButton');
const { clickToolbarItem } = require('../support/toolbarMenu');

const EVENTS = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f/events',
    shell: path.join(__dirname, 'html-fetch-transient-events.html'),
    label: 'Show all Events for Artist',
};
const SEGMENT = `button[data-label="${EVENTS.label}"]`;

// artist-releasegroups, several actions; its main pass is all=1
// (html-fetch-transient-rg.html, shared with html-fetch-transient).
const RG = {
    url: 'https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f',
    shell: path.join(__dirname, 'html-fetch-transient-rg.html'),
    labelMatch: 'Artist RGs',
};

/**
 * Loads the events shell and answers every paginated page fetch. Page
 * `hold` (if any) waits until the returned `release()` is called; `fail`
 * maps a page number to how many times it answers 404 before it succeeds.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{hold?: number, fail?: Object<number, number>}} [opts]
 * @returns {Promise<{asked: number[], release: function(): void}>}
 */
async function loadEvents(page, { hold = 0, fail = {} } = {}) {
    const asked = [];
    let release = () => {};
    let held = new Promise((r) => { release = r; });
    if (!hold) { release(); held = Promise.resolve(); }
    const failsLeft = { ...fail };
    await loadUserscriptPage(page, { url: EVENTS.url, fixtureFile: EVENTS.shell, testMode: true });
    await page.route('https://musicbrainz.org/artist/**', async (route) => {
        const p = Number(new URL(route.request().url()).searchParams.get('page') || '1');
        asked.push(p);
        if (failsLeft[p] > 0) {
            failsLeft[p]--;
            return route.fulfill({ status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not Found' });
        }
        if (p === hold) await held;
        return route.fulfill({ path: EVENTS.shell, contentType: 'text/html' });
    });
    return { asked, release: () => release() };
}

/** @returns {Promise<number>} Rendered data rows. */
const renderedRows = (page) => page.evaluate(() => document.querySelectorAll('table.tbl tbody tr').length);

/**
 * Records every class/label state the action segment passes through, so a
 * state shorter than a poll interval (the striped render) is still seen.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function recordSegmentStates(page) {
    await page.evaluate((sel) => {
        const b = document.querySelector(sel);
        window.__segStates = [];
        new MutationObserver(() => {
            window.__segStates.push({ cls: b.className, text: b.textContent, disabled: b.disabled });
        }).observe(b, { attributes: true, childList: true, characterData: true, subtree: true });
    }, SEGMENT);
}

test.describe('a fetch runs inside the segment that started it', () => {
    test('while pages load, the pressed segment is the progress bar and the Stop button', async ({ page }) => {
        const { release } = await loadEvents(page, { hold: 2 });
        const seg = page.locator(SEGMENT);
        const before = await seg.evaluate((b) => ({ text: b.textContent, mbtt: b.dataset.mbtt }));
        await seg.click();

        await expect(seg).toHaveClass(/mb-seg-running/);
        await expect(seg).toHaveAttribute('aria-label', 'Stop loading');
        await expect(seg).toHaveText('Stop · 1 / 3');
        await expect(seg.locator('.mb-seg-stop-glyph'), 'the ■').toHaveCount(1);
        expect(await seg.evaluate((b) => b.style.getPropertyValue('--p')), 'the fill is a third of the way').toBe('33%');
        expect(await seg.evaluate((b) => b.dataset.mbtt), 'its card says what a click does now').toMatch(/Stop loading/);
        expect(before.mbtt).not.toMatch(/Stop loading/);

        const line = page.locator('#mb-fetch-progress-label');
        await expect(line).toHaveText(/^Loading page 1 of 3 · 100 rows so far · about \d+(\.\d) s left$/);
        await expect(line).toBeVisible();
        expect(await page.evaluate(() => !!document.querySelector('#mb-status-displays-container #mb-fetch-progress-wrap')),
            'the progress line is in the status line under the heading').toBe(true);
        expect(await page.evaluate(() => Array.from(document.getElementById('mb-show-all-controls-container').children)
            .map((c) => c.id).filter((id) => id && id !== 'mb-file-input')),
        'no Stop button or progress bar beside the SAED button and its attention bar').toEqual(['mb-saed-bar', 'mb-saed-attn-bar']);

        await expect(seg, 'the running segment stays clickable: it is Stop').toBeEnabled();

        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect(seg).toHaveText(before.text);
        await expect(line).toBeHidden();
    });

    test('the other action segments wait while one runs, and come back after', async ({ page }) => {
        // artist-releasegroups has several actions (this events page has one).
        // Its main pass is all=1; page 2 of it is held.
        let release = () => {};
        const held = new Promise((r) => { release = r; });
        await loadUserscriptPage(page, { url: RG.url, fixtureFile: RG.shell, testMode: true });
        await page.route('https://musicbrainz.org/artist/**', async (route) => {
            const u = new URL(route.request().url());
            if (u.searchParams.get('all') === '1' && u.searchParams.get('page') === '2') await held;
            return route.fulfill({ path: RG.shell, contentType: 'text/html' });
        });
        const seg = page.locator(`#mb-saed-bar button.mb-seg-action[data-label*="${RG.labelMatch}"]`).first();
        await seg.click();
        await expect(seg).toHaveClass(/mb-seg-running/, { timeout: 30000 });

        const states = () => page.evaluate(() => Array.from(
            document.querySelectorAll('#mb-saed-bar [data-mb-area="actions"] .mb-seg-action'),
            (b) => ({ running: b.classList.contains('mb-seg-running'), disabled: b.disabled })));
        const during = await states();
        const others = during.filter((x) => !x.running);
        expect(others.length, 'premise: the page has other action segments').toBeGreaterThan(0);
        expect(others.every((x) => x.disabled), `the others wait: ${JSON.stringify(during)}`).toBe(true);
        expect(during.filter((x) => x.running)).toEqual([{ running: true, disabled: false }]);

        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect((await states()).every((x) => !x.running && !x.disabled), 'all usable again').toBe(true);
    });

    test('Stop keeps the rows loaded so far and says it stopped', async ({ page }) => {
        const { asked, release } = await loadEvents(page, { hold: 2 });
        const seg = page.locator(SEGMENT);
        await seg.click();
        await expect(seg).toHaveText('Stop · 1 / 3');

        await page.locator(RUNNING_SEGMENT).click();
        await expect(seg).toHaveText('Stopping…');
        await expect(seg).toHaveAttribute('aria-disabled', 'true');
        // A second click while stopping is no new fetch. (aria-disabled, so
        // Playwright would refuse a real click; a script click still lands.)
        await seg.evaluate((b) => b.click());
        await expect(seg).toHaveText('Stopping…');
        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });

        expect(await renderedRows(page), 'pages 1 and 2: the page in flight finished, the rest did not').toBe(200);
        expect(asked.filter((p) => p === 3), 'page 3 was never asked for').toEqual([]);
        await expect(page.locator('#mb-global-status-display'))
            .toContainText('Stopped by you after page 2 of 3 (200 rows) — the rest was not loaded');
        await expect(page.locator(RUNNING_SEGMENT)).toHaveCount(0);
    });

    test('prefix-mode O stops the same way', async ({ page }) => {
        const { release } = await loadEvents(page, { hold: 2 });
        const seg = page.locator(SEGMENT);
        await seg.click();
        await expect(seg).toHaveText('Stop · 1 / 3');
        await page.keyboard.press('Control+m');
        await page.keyboard.press('o');
        await expect(seg).toHaveText('Stopping…');
        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        expect(await renderedRows(page)).toBe(200);
    });

    test('rendering shows striped with the row count, then the segment is itself again', async ({ page }) => {
        await loadEvents(page);
        const seg = page.locator(SEGMENT);
        const before = await seg.evaluate((b) => ({
            text: b.textContent, mbtt: b.dataset.mbtt, title: b.getAttribute('title'),
        }));
        await recordSegmentStates(page);
        await seg.click();
        await waitForRenderComplete(page, { waitForAutoResize: false });

        const states = await page.evaluate(() => window.__segStates);
        const rendering = states.filter((s) => /\bmb-seg-rendering\b/.test(s.cls));
        expect(rendering.length, 'the segment was seen rendering').toBeGreaterThan(0);
        expect(rendering[rendering.length - 1].text).toBe('Rendering 300 rows…');
        expect(rendering.every((s) => s.disabled), 'and disabled while it rendered').toBe(true);
        // The last count can be overwritten by the render state before an
        // observer sees it (no await in between); page 2's cannot.
        expect(states.some((s) => /\bmb-seg-running\b/.test(s.cls) && /Stop · 2 \/ 3/.test(s.text)),
            'it counted the pages').toBe(true);

        await expect(seg).not.toHaveClass(/mb-seg-running|mb-seg-rendering/);
        await expect(seg).toBeEnabled();
        await expect(seg).toHaveText(before.text);
        expect(await seg.evaluate((b) => ({
            text: b.textContent, mbtt: b.dataset.mbtt, title: b.getAttribute('title'),
        })), 'label, card and tooltip are its own again').toEqual(before);
        expect(await seg.evaluate((b) => b.hasAttribute('aria-label') || b.style.getPropertyValue('--p') !== ''))
            .toBe(false);
    });

    test('a failed page ends as a red 🔄 indicator whose list resumes the fetch', async ({ page }) => {
        // Page 2 fails once (the first run) and is held on the resume, so the
        // indicator can be checked while the resume runs.
        const { asked, release } = await loadEvents(page, { fail: { 2: 1 }, hold: 2 });
        await page.locator(SEGMENT).click();

        const ind = page.locator(MISSING_PAGES_SEGMENT);
        await expect(ind).toBeVisible({ timeout: 30000 });
        expect(await ind.evaluate((b) => b.parentElement.dataset.mbArea), 'in the attention area').toBe('attn');
        expect(await ind.evaluate((b) => b.closest('.mb-saed-bar').id), 'of the attention bar, with ❌ / ⚠️').toBe('mb-saed-attn-bar');
        await expect(ind).toHaveClass(/mb-saed-lv-alert/);
        await expect(ind).toHaveText(/🔄 2/);
        await expect(ind).toHaveAttribute('aria-label', '2 pages missing');
        expect(await renderedRows(page), 'page 1 is shown').toBe(100);

        // The SAED menu lists it under "Needs attention".
        await page.locator('#mb-saed-menu-btn').click();
        await expect(page.locator('#mb-saed-attn-row-fetch-missing')).toBeVisible();
        await page.keyboard.press('Escape');

        await ind.click();
        const panel = page.locator('#mb-fetch-missing-menu-btn-panel');
        await expect(panel).toBeVisible();
        await expect(panel.locator('.mb-saed-ind-note')).toHaveText(
            'Page 2 of 3 could not be loaded (HTTP 404), so it and the page after it are missing. The page before it is shown.');
        const row = page.locator(RESUME_ROW);
        await expect(row).toHaveText('↻ Load the 2 missing pages');
        const askedBefore = asked.length;
        await row.click();

        // Cleared as the resume starts, not only when it ends.
        await expect(page.locator(SEGMENT)).toHaveClass(/mb-seg-running/);
        await expect(ind).toHaveCount(0);
        release();
        await waitForRenderComplete(page, { waitForAutoResize: false });
        await expect.poll(() => renderedRows(page)).toBe(300);
        expect([...new Set(asked.slice(askedBefore))].sort(), 'the resume asked for pages 2 and 3 only').toEqual([2, 3]);
        await expect(ind).toHaveCount(0);
        await expect(page.locator('#mb-saed-attn-row-fetch-missing')).toHaveCount(0);
    });

    test('a load from disk takes the 🔄 indicator off: file rows have no page to carry on from', async ({ page }) => {
        await loadEvents(page, { fail: { 2: 1 } });
        await page.locator(SEGMENT).click();
        const ind = page.locator(MISSING_PAGES_SEGMENT);
        await expect(ind).toBeVisible({ timeout: 30000 });

        await clickToolbarItem(page, '#mb-load-from-disk-btn');
        await page.locator('input[type="file"][accept*="json"]')
            .setInputFiles(path.join(__dirname, 'saved-data', 'artist-events.json.gz'));
        const render = page.locator('#sa-render-no-filter-confirm');
        await render.waitFor({ state: 'attached' });
        await render.evaluate((el) => el.click());
        await expect(page.locator('#mb-global-status-display')).toContainText('from disk', { timeout: 30000 });

        expect(await page.evaluate(() => window.__saTest.resumeState())).toBeNull();
        await expect(ind).toHaveCount(0);
    });
});
