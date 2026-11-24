'use strict';

// VZ_MBLibrary 4.7.0's activity log (section 1b): every printed line goes
// into a ring buffer, and Lib.logWindow shows it inside the page with a text
// filter, level and channel chips, Clear (asked first) and Copy as Markdown.
// Approved mockup: https://claude.ai/artifact/4gzcR5shSasSuRWYvJ2wMT.
//
// What is pinned here, each of which fails silently:
//
//   • **A debug line costs nothing while debug logging is off**: it is not
//     recorded at all, while info, warnings and errors always are.
//   • **The buffer never holds a live value.** Extra data becomes a short
//     text when the line is recorded; changing the object afterwards cannot
//     change the line, and a page element is only its tag.
//   • **The cap trims, and the copy says so.** A buffer that grew for ever
//     would be a leak on a long session; one that dropped lines silently
//     would make a report look complete when it is not.
//   • **error() keeps its channel** (it used to pass 'error' as the icon, so
//     every error would have landed in one "error" channel).
//   • **Escape order**: a filled filter empties first, a pending question is
//     cancelled next, only then does the window close.
//   • **Clear asks first, inside the window**, and says what it cleared.
//   • **The Markdown is pasteable**: <details>, a fenced "log" block whose
//     fence is longer than any backtick run in the lines.
//   • **Line text is never markup**: a line quoting HTML shows as text; URLs
//     become links without their trailing punctuation.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

// The test's own library instance: scriptId 'vz-log-test', so the window is #vz-log-test-log.
const WIN = '#vz-log-test-log';
const ROWS = `${WIN} .vz-log-li`;

/**
 * Loads a fixture page (which brings the library in through the harness) and
 * builds the test's own library instance, whose debug flag is window.__dbg.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function loadPage(page) {
    await loadUserscriptPage(page, {
        url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true,
    });
    await page.evaluate(() => {
        window.__dbg = false;
        // eslint-disable-next-line no-undef
        window.__logLib = new VZ_MBLibrary('vz-log-test', 'Log Test', null, null, () => window.__dbg === true, null);
        window.__logLib.configureLog({ version: '1.2.3' });
        // The constructor logs its own "Changelog source" line; each test starts from none.
        window.__logLib.logClear();
    });
}

/**
 * Logs through the test library: [[level, channel, msg, data?], …].
 * @param {import('@playwright/test').Page} page
 * @param {Array<Array<*>>} lines
 * @returns {Promise<void>}
 */
async function log(page, lines) {
    await page.evaluate((ls) => {
        ls.forEach(([lvl, cat, msg, data]) => {
            if (data === undefined) window.__logLib[lvl](cat, msg);
            else window.__logLib[lvl](cat, msg, data);
        });
    }, lines);
}

/**
 * The buffer as the API hands it out.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<object>>}
 */
async function entries(page) {
    return page.evaluate(() => window.__logLib.logEntries());
}

/**
 * Opens the window through the API.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function openWin(page) {
    await page.evaluate(() => window.__logLib.logWindow.open());
    await expect(page.locator(WIN)).toBeVisible();
}

test.describe('Lib activity log: the buffer', () => {
    test('a debug line is recorded only while debug logging is on; info, warn and error always', async ({ page }) => {
        await loadPage(page);
        await log(page, [['debug', 'fetch', 'hidden detail'], ['info', 'fetch', 'page 1'],
            ['warn', 'fetch', 'HTTP 503'], ['error', 'render', 'failed']]);
        let e = await entries(page);
        expect(e.map((x) => x.msg)).toEqual(['page 1', 'HTTP 503', 'failed']);
        expect(e.map((x) => x.lvl)).toEqual(['info', 'warn', 'error']);

        await page.evaluate(() => { window.__dbg = true; });
        await log(page, [['debug', 'fetch', 'shown detail']]);
        e = await entries(page);
        expect(e.at(-1)).toMatchObject({ lvl: 'debug', cat: 'fetch', msg: 'shown detail' });
        expect(await page.evaluate(() => window.__logLib.logCounts())).toEqual({ lines: 4, warn: 1, error: 1, dropped: 0 });
    });

    test('error() keeps its channel in the log', async ({ page }) => {
        await loadPage(page);
        await log(page, [['error', 'rel-ws2', 'lookup failed']]);
        expect((await entries(page))[0]).toMatchObject({ lvl: 'error', cat: 'rel-ws2' });
    });

    test('extra data is kept as a short text, never as the value', async ({ page }) => {
        await loadPage(page);
        const d = await page.evaluate(() => {
            const err = new TypeError('Cannot read properties of undefined (reading \'rows\')');
            const tr = document.createElement('tr');
            tr.id = 'r7';
            tr.className = 'odd mb-row';
            const big = {};
            for (let i = 0; i < 25; i++) big['k' + i] = i;
            const live = { rows: 1336, mode: 'single' };
            const L = window.__logLib;
            L.warn('findings', 'an error', err);
            L.info('ui', 'an element', tr);
            L.info('ui', 'an array', [1, 'two', tr, [3]]);
            L.info('ui', 'a big object', big);
            L.info('ui', 'a map', new Map([[1, 2]]));
            L.info('render', 'a live object', live);
            live.rows = 0;               // changed after logging: the line must not follow
            return L.logEntries().map((x) => x.data);
        });
        expect(d.every((x) => typeof x === 'string')).toBe(true);
        expect(d[0]).toMatch(/^TypeError: Cannot read properties of undefined \(reading 'rows'\) · /);
        expect(d[1]).toBe('<tr#r7.odd>');
        expect(d[2]).toBe('Array(4) [1, "two", <tr#r7.odd>, Array(1)]');
        expect(d[3]).toContain('k19: 19');
        expect(d[3]).not.toContain('k20:');
        expect(d[3]).toContain('… 5 more');
        expect(d[4]).toBe('Map(1)');
        expect(d[5]).toBe('{ rows: 1336, mode: "single" }');
    });

    test('past the cap the oldest lines go, and the copy says how many', async ({ page }) => {
        await loadPage(page);
        const r = await page.evaluate(() => {
            const L = window.__logLib;
            L.configureLog({ max: 50 });
            L.warn('fetch', 'line 0 (a warning)');
            for (let i = 1; i < 60; i++) L.info('fetch', 'line ' + i);
            return { counts: L.logCounts(), first: L.logEntries()[0].msg, md: L.logMarkdown() };
        });
        // 56 lines pass the cap (50 + a tenth): the oldest 6 go in one chunk.
        expect(r.counts).toEqual({ lines: 54, warn: 0, error: 0, dropped: 6 });
        expect(r.first).toBe('line 6');
        expect(r.md).toContain('(6 earlier lines not kept)');
    });

    test('onCounts hears about warnings once per burst', async ({ page }) => {
        await loadPage(page);
        const calls = await page.evaluate(async () => {
            const got = [];
            const L = window.__logLib;
            L.configureLog({ onCounts: (c) => got.push(c) });
            L.info('ui', 'no call for this');
            L.warn('fetch', 'one');
            L.warn('fetch', 'two');
            L.error('fetch', 'three');
            await new Promise((r) => setTimeout(r, 20));
            return got;
        });
        expect(calls).toEqual([{ lines: 4, warn: 2, error: 1, dropped: 0 }]);
    });
});

test.describe('Lib activity log: the window', () => {
    test('shows the lines and appends new ones live', async ({ page }) => {
        await loadPage(page);
        await log(page, [['info', 'fetch', 'page 1'], ['info', 'fetch', 'page 2'], ['warn', 'fetch', 'HTTP 503']]);
        await openWin(page);
        await expect(page.locator(ROWS)).toHaveCount(3);
        await expect(page.locator(`${WIN} .vz-log-who`)).toHaveText('Log Test 1.2.3');
        await expect(page.locator(`${WIN} .vz-log-pill-warn`)).toHaveText('1 ⚠');

        await log(page, [['error', 'render', 'failed']]);
        await expect(page.locator(ROWS)).toHaveCount(4);
        await expect(page.locator(`${ROWS}.vz-log-error .vz-log-m`)).toHaveText('failed');
        await expect(page.locator(`${WIN} .vz-log-footl`)).toHaveText('4 lines');
    });

    test('chips appear only when there is a choice, and a chip filters', async ({ page }) => {
        await loadPage(page);
        await log(page, [['info', 'fetch', 'page 1'], ['info', 'fetch', 'page 2']]);
        await openWin(page);
        await expect(page.locator(`${WIN} .vz-log-chips`)).toBeHidden();

        await log(page, [['warn', 'caa', 'cover art slow']]);
        await expect(page.locator(`${WIN} .vz-log-chips`)).toBeVisible();
        await page.locator(`${WIN} .vz-log-chip[data-cat="fetch"]`).click();
        await expect(page.locator(ROWS)).toHaveCount(2);
        await expect(page.locator(`${WIN} .vz-log-footl`)).toHaveText('3 lines · 2 shown');
        await page.locator(`${WIN} .vz-log-chip[data-cat="fetch"]`).click();
        await expect(page.locator(ROWS)).toHaveCount(3);

        await page.locator(`${WIN} .vz-log-chip[data-lvl="warn"]`).click();
        await expect(page.locator(ROWS)).toHaveCount(1);
        await expect(page.locator(`${ROWS} .vz-log-m`)).toHaveText('cover art slow');
    });

    test('the text filter narrows; Esc empties it first, then closes the window', async ({ page }) => {
        await loadPage(page);
        await log(page, [['info', 'fetch', 'page 1'], ['warn', 'fetch', 'HTTP 503 on page 6'], ['info', 'render', 'rendered']]);
        await openWin(page);
        const q = page.locator(`${WIN} .vz-log-q`);
        await expect(q).toBeFocused();
        await q.fill('503');
        await expect(page.locator(ROWS)).toHaveCount(1);

        await page.keyboard.press('Escape');
        await expect(q).toHaveValue('');
        await expect(page.locator(ROWS)).toHaveCount(3);
        await expect(page.locator(WIN)).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator(WIN)).toHaveCount(0);
        expect(await page.evaluate(() => window.__logLib.logWindow.isOpen())).toBe(false);
        expect((await entries(page)).length, 'closing keeps the lines').toBe(3);
    });

    // 4.7.1 (vzell, 2026-11-24): "when filtering the filter string should be highlighted".
    test('the filter text is marked in the lines, case-insensitively, data and links included', async ({ page }) => {
        await loadPage(page);
        await log(page, [['warn', 'rel-ws2', 'HTTP 503 (Retry-After: 1)', 'status 503'],
            ['info', 'fetch', 'see https://musicbrainz.org/ws/2/http-test'], ['info', 'render', 'rendered']]);
        await openWin(page);
        const q = page.locator(`${WIN} .vz-log-q`);
        await q.fill('http');
        await expect(page.locator(ROWS)).toHaveCount(2);
        const marks = page.locator(`${WIN} mark.vz-log-hl`);
        // "HTTP" in the warning, and "https" + "http" inside the link of the second line
        await expect(marks).toHaveText(['HTTP', 'http', 'http']);
        await expect(page.locator(`${ROWS} a mark.vz-log-hl`)).toHaveCount(2);

        await q.fill('503');
        await expect(marks).toHaveText(['503', '503']);       // the message and its data
        await expect(page.locator(`${ROWS} .vz-log-dt mark.vz-log-hl`)).toHaveCount(1);

        // a line arriving while the filter is set is marked too
        await log(page, [['info', 'fetch', 'page 6: 503 again']]);
        await expect(marks).toHaveCount(3);

        await page.keyboard.press('Escape');
        await expect(page.locator(ROWS)).toHaveCount(4);
        await expect(marks).toHaveCount(0);
    });

    // 4.7.1 (vzell, 2026-11-24): "reuse our icons from the real browser console".
    test("each line shows the console's icon, an error ❌; the copy stays plain text", async ({ page }) => {
        await loadPage(page);
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
            });
        });
        await log(page, [['info', 'fetch', 'page 1'], ['warn', 'rel-ws2', 'HTTP 503'], ['error', 'render', 'failed'],
            ['info', 'ui', 'menu built']]);
        await openWin(page);
        await expect(page.locator(`${ROWS} .vz-log-ct`)).toHaveText(['📥 fetch', '📝 rel-ws2', '❌ render', '🖥️ ui']);
        await expect(page.locator(`${WIN} .vz-log-chip[data-cat="fetch"]`)).toContainText('📥 fetch');
        await expect(page.locator(`${WIN} .vz-log-chip[data-cat="ui"]`)).toContainText('🖥️ ui');

        await page.locator(`${WIN} .vz-log-copybtn`).click();
        await expect(page.locator(`${WIN} .vz-log-copymsg`)).toHaveText(/^Copied ✓/);
        const md = await page.evaluate(() => window.__copied);
        expect(md).toMatch(/ {2}INFO \[fetch\] page 1\n/);
        expect(md).toMatch(/ {2}ERR {2}\[render\] failed\n/);
        expect(md).not.toMatch(/[📥📝❌🖥]/u);
    });

    test('Clear asks first inside the window: Cancel keeps every line, Clear empties and says how many', async ({ page }) => {
        await loadPage(page);
        await log(page, [['info', 'fetch', 'a'], ['info', 'fetch', 'b'], ['warn', 'fetch', 'c']]);
        await openWin(page);
        await page.locator(`${WIN} .vz-log-clearbtn`).click();
        await expect(page.locator(`${WIN} .vz-log-confirm`)).toBeVisible();
        await expect(page.locator(`${WIN} .vz-log-confirm-txt`)).toHaveText(/^Clear 3 lines\? /);

        await page.keyboard.press('Escape');           // a pending question goes before the window
        await expect(page.locator(`${WIN} .vz-log-confirm`)).toBeHidden();
        await expect(page.locator(WIN)).toBeVisible();
        expect((await entries(page)).length).toBe(3);

        await page.locator(`${WIN} .vz-log-clearbtn`).click();
        await page.locator(`${WIN} .vz-log-no`).click();
        expect((await entries(page)).length).toBe(3);

        await page.locator(`${WIN} .vz-log-clearbtn`).click();
        await page.locator(`${WIN} .vz-log-yes`).click();
        await expect(page.locator(`${WIN} .vz-log-note`)).toHaveText('Cleared 3 lines.');
        await expect(page.locator(ROWS)).toHaveCount(0);
        await expect(page.locator(`${WIN} .vz-log-empty`)).toBeVisible();
        expect(await page.evaluate(() => window.__logLib.logCounts())).toEqual({ lines: 0, warn: 0, error: 0, dropped: 0 });
    });

    test('Copy as Markdown copies a <details> block with a fenced log', async ({ page }) => {
        await loadPage(page);
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
            });
            window.__logLib.configureLog({ subtitle: () => 'artist-recordings' });
        });
        await log(page, [['info', 'fetch', 'page 1'], ['warn', 'fetch', 'HTTP 503', 'Retry-After: 2'],
            ['info', 'ui', 'a line quoting ```code``` in Markdown']]);
        await openWin(page);
        await page.locator(`${WIN} .vz-log-copybtn`).click();
        await expect(page.locator(`${WIN} .vz-log-copymsg`)).toHaveText(/^Copied ✓ 3 lines\./);
        const md = await page.evaluate(() => window.__copied);
        expect(md).toMatch(/^<details><summary>Log Test 1\.2\.3 · VZ_MBLibrary \d+\.\d+\.\d+\S* · artist-recordings · \/artist\/89729b97-90a3-4f84-9e88-e16f96cab350\/recordings — activity log \(1 warning, 0 errors\)<\/summary>/);
        expect(md).toContain('\n````log\n');               // longer than the ``` in a line
        expect(md).toMatch(/\d\d:\d\d:\d\d\.\d{3} {2}WARN \[fetch\] HTTP 503\n {19}↳ Retry-After: 2/);
        expect(md).toMatch(/Times are local, UTC[+-]\d\d:\d\d\./);
        expect(md.endsWith('\n````\n\n</details>')).toBe(true);
        expect(await page.evaluate((sel) => document.querySelector(sel).textContent, `${WIN} .vz-log-copytext`),
            'the copy view shows exactly what was copied').toBe(md);

        await page.keyboard.press('Escape');           // the copy view goes before the window
        await expect(page.locator(`${WIN} .vz-log-copy`)).toBeHidden();
        await expect(page.locator(WIN)).toBeVisible();
    });

    test('Record detail turns debug lines on for this page only', async ({ page }) => {
        await loadPage(page);
        await page.evaluate(() => {
            window.__onDebug = [];
            window.__logLib.configureLog({ onDebug: (v) => window.__onDebug.push(v) });
        });
        await openWin(page);
        await log(page, [['debug', 'gate', 'not recorded']]);
        const box = page.locator(`${WIN} .vz-log-dbg input`);
        await expect(box).not.toBeChecked();
        await box.check();
        await log(page, [['debug', 'gate', 'recorded now']]);
        await expect(page.locator(ROWS)).toHaveCount(1);
        expect((await entries(page)).map((x) => x.msg)).toEqual(['recorded now']);
        expect(await page.evaluate(() => window.__onDebug)).toEqual([true]);
        await expect(page.locator(`${WIN} .vz-log-footr`)).toHaveText('detail lines: on (this page)');
        expect(await page.evaluate(() => window.__dbg), "the consumer's own flag is untouched").toBe(false);
    });

    test('line text is never markup; URLs become links without trailing punctuation', async ({ page }) => {
        await loadPage(page);
        await log(page, [['info', 'fetch', '<img src=x onerror="window.__xss=1"> see https://musicbrainz.org/ws/2/artist/x?inc=aliases.']]);
        await openWin(page);
        await expect(page.locator(`${ROWS} img`)).toHaveCount(0);
        await expect(page.locator(`${ROWS} .vz-log-m`)).toContainText('<img src=x');
        await expect(page.locator(`${ROWS} a`)).toHaveAttribute('href', 'https://musicbrainz.org/ws/2/artist/x?inc=aliases');
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    });

    test('the window goes into the configured host', async ({ page }) => {
        await loadPage(page);
        await page.evaluate(() => {
            const host = document.createElement('div');
            host.id = 'my-host';
            document.body.appendChild(host);
            window.__logLib.configureLog({ host: () => host });
        });
        await openWin(page);
        await expect(page.locator(`#my-host > ${WIN}`)).toHaveCount(1);
    });

    test('the Tampermonkey menu entry toggles the window', async ({ page }) => {
        await loadPage(page);
        const toggle = () => page.evaluate(() => {
            const all = Object.values(window.__gmMenuCommands || {}).filter((c) => c.name === '🧾 Activity log');
            all[all.length - 1].callback();      // the newest: the test library's own
        });
        await toggle();
        await expect(page.locator(WIN)).toBeVisible();
        await toggle();
        await expect(page.locator(WIN)).toHaveCount(0);
    });

    test('under 600 px the window is full screen', async ({ page }) => {
        await loadPage(page);
        await page.setViewportSize({ width: 400, height: 760 });
        await openWin(page);
        const b = await page.locator(WIN).boundingBox();
        expect(b).toMatchObject({ x: 0, y: 0, width: 400, height: 760 });
    });
});
