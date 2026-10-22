'use strict';

// VZ_MBLibrary 4.5.0's Lib.showMarkdownHelp(): the Markdown help dialog that
// used to be ShowAllEntityData's Shift-click ❓ popup, moved into the library
// so other scripts can still show it.
//
// What is pinned here, each of which fails silently:
//
//   • **It renders Markdown, it does not print it.** A renderer that fell back
//     to text would look almost right and be wrong on every heading, table and
//     link.
//   • **`_italic_` is deliberately unsupported** (snake_case settings keys).
//     There is a test for the absence of a feature because the plausible
//     "improvement" is to add it back.
//   • **The fetched bytes are never trusted as HTML**: nodes only, and a link
//     that is not http(s) or a same-document anchor is inert text.
//   • **The quick filter highlights and never hides**, across headings, list
//     items, table cells and fenced code.
//   • **The text never reaches GM storage.** Tampermonkey hands the whole GM
//     store to every page, so a cached document costs every page view whether
//     or not the dialog opens (org/userscript-size.org 2.3). It is kept in
//     memory for the page only: a second open makes no request, Force refresh
//     makes one.
//
// One test renders the REAL committed ShowAllEntityData_HELP.md: that is what
// keeps the help file inside what this renderer supports.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

const HELP_MD_PATH = path.join(__dirname, '..', '..', 'ShowAllEntityData_HELP.md');
const MD_URL = 'https://raw.githubusercontent.com/vzell/mb-userscripts/master/ShowAllEntityData_HELP.md';
const GITHUB_URL = 'https://github.com/vzell/mb-userscripts/blob/master/ShowAllEntityData_HELP.md';

// The test's own library instance: scriptId 'vz-md-test', so the dialog is
// #vz-md-test-md-help and its body #vz-md-test-md-help-body.
const DIALOG = '#vz-md-test-md-help';
const BODY = '#vz-md-test-md-help-body';
const FILTER = `${DIALOG} input.vz-md-filter`;

const SAMPLE_MD = [
    '# Title',
    '',
    'A paragraph with **bold**, *italic*, `code` and a',
    '[link](https://example.org/x).',
    '',
    'Settings keys like sa_enable_caa_pics must not become italic.',
    '',
    'A [bad link](javascript:alert(1)) must not be a link.',
    '',
    '## Contents',
    '',
    '- [Deep section](#deep-section)',
    '',
    '## Deep section',
    '',
    '```',
    'fenced code — **not** bold here',
    '```',
    '',
    '| Col A | Col B |',
    '|-------|-------|',
    '| one   | two   |',
    '',
    // A pipe-led line that is NOT a table: no separator row under it. Without
    // the separator guard this starts a table AND swallows the line after it.
    '| a pipe-led line that is not a table',
    'and the prose line under it',
    '',
    '> a quoted line',
    '',
    // A heading directly under a list: the continuation rule must refuse an
    // UNINDENTED line, or the heading is swallowed as the last bullet's text.
    '- alpha',
    '- beta',
    '## Immediately after a list',
    '',
    '<details>',
    '<summary>Folded reference</summary>',
    '',
    '- first',
    '- second, whose text wraps onto',
    '  a continuation line',
    '- third',
    '  - nested',
    '',
    '</details>',
].join('\n');

/**
 * Loads a fixture page (which brings the library in through the harness),
 * with the Markdown fetch answered by `md` (or left unanswered → 404) and
 * `window.open` recorded.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|null} md
 * @returns {Promise<void>}
 */
async function loadPage(page, md) {
    await page.context().addInitScript({ content: `
        window.__openCalls = [];
        window.open = function (url, target, features) {
            window.__openCalls.push({ url: url, target: target, features: features });
            return null;
        };
        window.__gmXhrResponses = ${md === null ? '{}' : `{
            ${JSON.stringify(MD_URL)}: { status: 200, responseText: ${JSON.stringify(md)} },
        }`};
    ` });
    await loadUserscriptPage(page, {
        url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true,
    });
}

/**
 * Builds the test's own library instance (once) and opens the dialog.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [extra] - Extra showMarkdownHelp() options.
 * @returns {Promise<boolean|null>} The `ready` result, or null when the call closed the dialog.
 */
async function openHelp(page, extra = {}) {
    return page.evaluate(async ({ url, githubUrl, extra }) => {
        // eslint-disable-next-line no-undef
        if (!window.__mdLib) window.__mdLib = new VZ_MBLibrary('vz-md-test', 'MD Test', null, null, false, null);
        const r = window.__mdLib.showMarkdownHelp(Object.assign({ url, githubUrl, title: '❓ Test help' }, extra));
        return r ? r.ready : null;
    }, { url: MD_URL, githubUrl: GITHUB_URL, extra });
}

/**
 * How many times the Markdown URL was requested.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function mdRequests(page) {
    return page.evaluate((u) => (window.__gmXhrLog || []).filter((r) => r.url === u).length, MD_URL);
}

test.describe('Lib.showMarkdownHelp(): the dialog', () => {
    test('opens with the GitHub link, renders, and is the only thing a second call closes', async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        expect(await openHelp(page)).toBe(true);

        await expect(page.locator(DIALOG)).toHaveCount(1);
        const gh = page.locator(`${DIALOG} a.vz-md-github`);
        await expect(gh).toHaveAttribute('href', GITHUB_URL);
        await expect(gh).toHaveAttribute('rel', /noopener/);
        await expect(page.locator(`${BODY} h1.vz-md-h1`)).toHaveText('Title');

        // A second call is a toggle: it closes and returns null.
        expect(await openHelp(page)).toBeNull();
        await expect(page.locator(DIALOG)).toHaveCount(0);
        expect(await page.evaluate(() => window.__openCalls), 'nothing opened a tab').toHaveLength(0);
    });

    test('the text is kept in memory only: no GM value, a second open makes no request', async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        await openHelp(page);
        expect(await mdRequests(page)).toBe(1);

        // No GM value holds the document. The stubs persist GM values in
        // localStorage, so scan both the live map and the persisted copy.
        const leaked = await page.evaluate(() => {
            const all = Object.assign({}, window.__gmValues || {});
            try { Object.assign(all, JSON.parse(localStorage.getItem('__sa_test_gm_values__') || '{}')); } catch (e) { /* none */ }
            return Object.keys(all).filter((k) => JSON.stringify(all[k]).includes('fenced code'));
        });
        expect(leaked, 'no GM key carries the help text').toEqual([]);

        await openHelp(page);               // close
        expect(await openHelp(page)).toBe(true);
        expect(await mdRequests(page), 'the reopen used the copy in memory').toBe(1);
    });

    test('Force refresh fetches again', async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        await openHelp(page);
        await page.locator(`${DIALOG} a.vz-md-refresh`).click();
        await expect.poll(() => mdRequests(page)).toBe(2);
        await expect(page.locator(`${BODY} h1.vz-md-h1`)).toHaveText('Title');
    });

    test('a failed fetch shows the error with Retry, and Retry renders once the text is there', async ({ page }) => {
        await loadPage(page, null);         // unanswered → the stub's 404
        expect(await openHelp(page)).toBe(false);
        await expect(page.locator(`${DIALOG} .vz-md-error`)).toContainText('HTTP 404');

        await page.evaluate(({ url, md }) => {
            window.__gmXhrResponses[url] = { status: 200, responseText: md };
        }, { url: MD_URL, md: SAMPLE_MD });
        await page.locator(`${DIALOG} button.vz-md-retry`).click();
        await expect(page.locator(`${BODY} h1.vz-md-h1`)).toHaveText('Title');
        await expect(page.locator(`${DIALOG} .vz-md-error`)).toHaveCount(0);
    });

    test('Escape clears the filter first, leaves it second, and only then closes the dialog', async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        await openHelp(page);
        const input = page.locator(FILTER);
        await input.fill('bold');
        await input.press('Escape');
        await expect(input).toHaveValue('');
        await expect(page.locator(DIALOG)).toHaveCount(1);
        await input.press('Escape');        // leaves the field
        await expect(page.locator(DIALOG)).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(page.locator(DIALOG)).toHaveCount(0);
    });

    test('a click outside closes it', async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        await openHelp(page);
        await page.mouse.click(5, 5);
        await expect(page.locator(DIALOG)).toHaveCount(0);
    });

    test('with geometryKey the position and size are stored on close', async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        await openHelp(page, { geometryKey: 'vz_md_test_geometry' });
        await page.keyboard.press('Escape');                     // leaves the auto-focused filter
        await page.keyboard.press('Escape');                     // closes
        await expect(page.locator(DIALOG)).toHaveCount(0);
        const geo = await page.evaluate(() => window.GM_getValue('vz_md_test_geometry', null));
        expect(geo, 'geometry stored').not.toBeNull();
        expect(geo.width).toBeGreaterThan(300);
        expect(geo.height).toBeGreaterThan(150);
    });
});

test.describe('Lib.showMarkdownHelp(): Markdown becomes DOM', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        await openHelp(page);
    });

    test('headings, emphasis, code spans and links become elements', async ({ page }) => {
        const body = page.locator(BODY);
        await expect(body.locator('h1.vz-md-h1')).toHaveText('Title');
        await expect(body.locator('h2.vz-md-h2').first()).toHaveText('Contents');
        await expect(body.locator('strong').first()).toHaveText('bold');
        await expect(body.locator('em').first()).toHaveText('italic');
        await expect(body.locator('code.vz-md-code').first()).toHaveText('code');

        const ext = body.locator('a.vz-md-a[href="https://example.org/x"]');
        await expect(ext).toHaveCount(1);
        await expect(ext).toHaveAttribute('target', '_blank');

        const text = await body.innerText();
        expect(text, 'no raw heading marker').not.toContain('# Title');
        expect(text, 'no raw bold marker').not.toContain('**bold**');
    });

    test('a snake_case identifier is NOT italicised', async ({ page }) => {
        const body = page.locator(BODY);
        await expect(body.getByText('sa_enable_caa_pics', { exact: false })).toHaveCount(1);
        await expect(body.locator('em', { hasText: 'enable' }),
            'nothing from inside the identifier became emphasis').toHaveCount(0);
    });

    test('a non-http link renders as inert text, not as a link', async ({ page }) => {
        const body = page.locator(BODY);
        await expect(body.locator('a[href^="javascript:"]')).toHaveCount(0);
        expect(await body.innerText()).toContain('bad link');
    });

    test('fenced code keeps its content verbatim, markers and all', async ({ page }) => {
        const pre = page.locator(`${BODY} pre.vz-md-pre`);
        await expect(pre).toHaveCount(1);
        await expect(pre).toContainText('**not** bold here');
        await expect(pre.locator('strong')).toHaveCount(0);
    });

    test('the stylesheet is actually injected, not just the class names', async ({ page }) => {
        await expect(page.locator('#vz-md-help-style')).toHaveCount(1);
        const paint = await page.evaluate((sel) => {
            const cs = getComputedStyle(document.querySelector(`${sel} pre.vz-md-pre`));
            const th = getComputedStyle(document.querySelector(`${sel} table.vz-md-table`));
            return { preBg: cs.backgroundColor, collapse: th.borderCollapse };
        }, BODY);
        expect(paint.preBg, 'the code block is painted, not transparent').toBe('rgb(246, 248, 250)');
        expect(paint.collapse, 'the table collapses its borders').toBe('collapse');
    });

    test('a pipe table becomes a real table with a header row', async ({ page }) => {
        const table = page.locator(`${BODY} table.vz-md-table`);
        await expect(table).toHaveCount(1);
        await expect(table.locator('thead th')).toHaveText(['Col A', 'Col B']);
        await expect(table.locator('tbody tr')).toHaveCount(1);
        await expect(table.locator('tbody td')).toHaveText(['one', 'two']);
    });

    test('a pipe-led line with no separator under it is prose, and keeps its neighbour', async ({ page }) => {
        const body = page.locator(BODY);
        await expect(body.locator('table.vz-md-table')).toHaveCount(1);
        const text = await body.innerText();
        expect(text).toContain('a pipe-led line that is not a table');
        expect(text, 'the following line was not swallowed').toContain('and the prose line under it');
    });

    test('lists nest one level, and a blockquote is its own block', async ({ page }) => {
        const body = page.locator(BODY);
        await expect(body.locator('ul.vz-md-ul ul.vz-md-ul li')).toHaveText(['nested']);
        await expect(body.locator('.vz-md-quote')).toHaveText('a quoted line');
    });

    test('a wrapped bullet stays ONE item of ONE list', async ({ page }) => {
        const top = page.locator(`${BODY} details.vz-md-details > ul.vz-md-ul`);
        await expect(top, 'one list, not one per bullet').toHaveCount(1);
        await expect(top.locator('> li')).toHaveCount(3);
        await expect(top.locator('> li').nth(1))
            .toHaveText('second, whose text wraps onto a continuation line');
    });

    test('a heading directly under a list is a heading, not the last bullet', async ({ page }) => {
        const body = page.locator(BODY);
        await expect(body.locator('h2.vz-md-h2', { hasText: 'Immediately after a list' })).toHaveCount(1);
        await expect(body.locator('ul.vz-md-ul > li', { hasText: /^beta$/ }),
            'the heading did not become bullet text').toHaveCount(1);
    });

    test('a <details> block renders OPEN, so the quick filter cannot hit hidden text', async ({ page }) => {
        const details = page.locator(`${BODY} details.vz-md-details`);
        await expect(details).toHaveCount(1);
        expect(await details.evaluate((el) => el.open)).toBe(true);
        await expect(details.locator('summary')).toHaveText('Folded reference');
    });

    test('an in-document anchor link scrolls the dialog instead of navigating the page', async ({ page }) => {
        const before = page.url();
        const toc = page.locator(`${BODY} a.vz-md-a[href^="#"]`).first();
        await expect(toc).toHaveCount(1);
        // The PREFIXED id: the file's fragments are written for GitHub's bare
        // slug; the prefix keeps a heading id from colliding with the page's.
        await expect(toc).toHaveAttribute('href', '#vz-md-deep-section');
        await expect(page.locator('#vz-md-deep-section')).toHaveCount(1);
        await toc.click();
        expect(page.url(), 'no fragment navigation').toBe(before);
        await expect(page.locator(DIALOG)).toHaveCount(1);
    });
});

test.describe('Lib.showMarkdownHelp(): the quick filter highlights, never hides', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page, SAMPLE_MD);
        await openHelp(page);
    });

    test('typing a query highlights every occurrence, fenced code included', async ({ page }) => {
        await page.locator(FILTER).fill('bold');
        const marks = page.locator(`${BODY} mark.vz-md-hl`);
        // Once in prose ("with **bold**") and once inside the fenced block.
        await expect(marks).toHaveCount(2);
        for (const text of await marks.allTextContents()) expect(text.toLowerCase()).toBe('bold');
    });

    test('a match highlights inside a heading, a list item and a table cell', async ({ page }) => {
        const input = page.locator(FILTER);
        await input.fill('Deep section');
        await expect(page.locator(`${BODY} h2.vz-md-h2 mark.vz-md-hl`)).toHaveCount(1);
        await expect(page.locator(`${BODY} li.vz-md-li mark.vz-md-hl`)).toHaveCount(1);
        await input.fill('Col B');
        await expect(page.locator(`${BODY} table.vz-md-table mark.vz-md-hl`)).toHaveCount(1);
    });

    test('non-matching content stays VISIBLE', async ({ page }) => {
        await page.locator(FILTER).fill('Deep section');
        const hidden = await page.locator(`${BODY} *`).evaluateAll(
            (els) => els.filter((el) => el.style.display === 'none').map((el) => el.tagName));
        expect(hidden, 'nothing inside the body is hidden by the filter').toEqual([]);
        await expect(page.locator(`${BODY} h1.vz-md-h1`)).toBeVisible();
    });

    test('clearing the filter removes the highlights and leaves whole text nodes', async ({ page }) => {
        const input = page.locator(FILTER);
        await input.fill('bold');
        await expect(page.locator(`${BODY} mark.vz-md-hl`)).not.toHaveCount(0);
        await input.fill('');
        await expect(page.locator(`${BODY} mark.vz-md-hl`)).toHaveCount(0);
        // A second query after clearing still finds both: the text nodes were
        // merged back, not left split where the marks were.
        await input.fill('bold');
        await expect(page.locator(`${BODY} mark.vz-md-hl`)).toHaveCount(2);
    });
});

test.describe('the committed help file stays inside what the renderer supports', () => {
    test('ShowAllEntityData_HELP.md renders with no Markdown syntax left as text', async ({ page }) => {
        const md = fs.readFileSync(HELP_MD_PATH, 'utf8');
        await loadPage(page, md);
        await openHelp(page);

        const body = page.locator(BODY);
        expect(await body.locator('h1.vz-md-h1').count(), 'one H1').toBe(1);
        expect(await body.locator('h2.vz-md-h2').count(), 'section headings').toBeGreaterThan(10);
        expect(await body.locator('table.vz-md-table').count(), 'tables').toBeGreaterThan(3);
        expect(await body.locator('details.vz-md-details').count(), 'folded sections').toBeGreaterThan(5);
        expect(await body.locator('a.vz-md-a[href^="#"]').count(), 'a real table of contents').toBeGreaterThan(10);

        const dangling = await body.evaluate((el) => Array.from(
            el.querySelectorAll('a.vz-md-a[href^="#"]')
        ).map((a) => a.getAttribute('href')).filter((h) => !el.ownerDocument.querySelector(
            '[id="' + h.slice(1) + '"]'
        )));
        expect(dangling, 'no table-of-contents entry points at a missing heading').toEqual([]);

        const text = await body.innerText();
        for (const marker of ['\n# ', '\n## ', '\n- [', '<details>', '<summary>', '|---']) {
            expect(text, `"${marker.trim()}" was rendered, not printed`).not.toContain(marker);
        }
    });
});
