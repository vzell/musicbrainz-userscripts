'use strict';

// The ❓ button's two routes, and the Markdown renderer behind the second one.
//
// What is under test is the set of properties that make "help lives on GitHub
// now" safe, each of which fails silently:
//
//   • **The two routes are different destinations.** A plain click opens the
//     GitHub page; Shift-click opens the in-page dialog. Getting the modifier
//     test backwards swaps them, and both still "work" — you just always land
//     somewhere other than where you meant to.
//
//   • **The dialog renders Markdown, it does not print it.** The source stopped
//     being a hand-laid-out .txt, so the old `<pre>` would now show the syntax
//     rather than the document. A renderer that silently fell back to text
//     would look almost right and be wrong on every heading, table and link.
//
//   • **`_italic_` is deliberately unsupported.** Half the nouns in this script
//     are snake_case settings keys, and an underscore-emphasis rule turns
//     `sa_enable_caa_pics` into "sa" + italic "enable_caa" + "pics". There is a
//     test for the absence of a feature because the plausible "improvement" is
//     to add it back.
//
//   • **The fetched bytes are never trusted as HTML.** The renderer builds DOM
//     nodes; a link whose href is not http(s) or a same-document anchor renders
//     as inert text.
//
// The last test renders the REAL committed ShowAllEntityData_HELP.md. That is
// the one that keeps the help file and the renderer in agreement — the file is
// written to stay inside what this renderer supports, and nothing else checks
// that it still does.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { clickToolbarItem } = require('../support/toolbarMenu');

const ARTIST_RECORDINGS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE_FILE = path.join(__dirname, 'uniq-drop-viewport-clip.html');

const HELP_MD_PATH = path.join(__dirname, '..', '..', 'ShowAllEntityData_HELP.md');
const HELP_URL = 'https://raw.githubusercontent.com/vzell/mb-userscripts/master/ShowAllEntityData_HELP.md';
const GITHUB_URL = 'https://github.com/vzell/mb-userscripts/blob/master/ShowAllEntityData_HELP.md';

/**
 * Loads the fixture with the ❓ button present, `window.open` recorded rather
 * than performed, and the help fetch answered with `md`.
 *
 * No "Show all" click: the toolbar's pinned ⚙️ / ❓ pair is built during the
 * initial render, so nothing here needs a fetch to have run.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} md - the Markdown the help fetch will return
 * @returns {Promise<void>}
 */
async function loadWithHelp(page, md) {
    await page.context().addInitScript({ content: `
        window.__openCalls = [];
        window.open = function (url, target, features) {
            window.__openCalls.push({ url: url, target: target, features: features });
            return null;
        };
        window.__gmXhrResponses = {
            ${JSON.stringify(HELP_URL)}: { status: 200, responseText: ${JSON.stringify(md)} },
        };
    ` });
    await loadUserscriptPage(page, {
        url: ARTIST_RECORDINGS_URL, fixtureFile: FIXTURE_FILE, testMode: true,
    });
    await page.waitForSelector('#mb-app-help-btn');
}

/** Opens the in-page dialog and waits for the rendered body. */
async function openHelpDialog(page) {
    await page.locator('#mb-app-help-btn').click({ modifiers: ['Shift'] });
    await page.waitForSelector('#mb-app-help-body .mb-md-p, #mb-app-help-body .mb-md-h1', { timeout: 5000 });
}

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
    // the separator guard this starts a table AND swallows the line after it,
    // because the table branch consumes header-plus-separator unconditionally.
    // A well-formed table alone cannot tell the guard is there.
    '| a pipe-led line that is not a table',
    'and the prose line under it',
    '',
    '> a quoted line',
    '',
    // A list with a heading directly under it, no blank line between. The
    // continuation rule must refuse an UNINDENTED line, or the heading is
    // swallowed as the last bullet's text.
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

test.describe('the ❓ button: GitHub by default, the dialog on Shift-click', () => {
    test('a plain click opens the GitHub help page in a new tab, and opens no dialog', async ({ page }) => {
        await loadWithHelp(page, SAMPLE_MD);

        await page.locator('#mb-app-help-btn').click();

        const calls = await page.evaluate(() => window.__openCalls);
        expect(calls, 'exactly one window.open').toHaveLength(1);
        expect(calls[0].url).toBe(GITHUB_URL);
        expect(calls[0].target).toBe('_blank');
        // noopener so the opened page gets no window.opener handle back into a
        // MusicBrainz tab this script is driving.
        expect(calls[0].features).toContain('noopener');

        await expect(page.locator('#mb-app-help-dialog')).toHaveCount(0);
    });

    test('a Shift-click opens the in-page dialog, and opens no tab', async ({ page }) => {
        await loadWithHelp(page, SAMPLE_MD);

        await openHelpDialog(page);

        await expect(page.locator('#mb-app-help-dialog')).toHaveCount(1);
        expect(await page.evaluate(() => window.__openCalls), 'no tab opened').toHaveLength(0);
    });

    test('the dialog links to GitHub, so the keyboard route reaches it too', async ({ page }) => {
        // Prefix mode refuses Shift (its own guard is `!e.shiftKey`), so the
        // keyboard has ONE route and it is this dialog. Without this link,
        // GitHub's rendering would be mouse-only.
        await loadWithHelp(page, SAMPLE_MD);
        await openHelpDialog(page);

        const link = page.locator('#mb-app-help-github-link');
        await expect(link).toHaveCount(1);
        expect(await link.getAttribute('href')).toBe(GITHUB_URL);
        expect(await link.getAttribute('rel')).toContain('noopener');
    });

    test('the button fetches the .md, not the retired .txt', async ({ page }) => {
        // gmStubs 404s any URL it was not given, and the dialog's error arm is
        // visibly different from its content arm — so pointing REMOTE_HELP_URL
        // at the old .txt fails here rather than silently serving nothing.
        await loadWithHelp(page, SAMPLE_MD);
        await openHelpDialog(page);

        await expect(page.locator('#mb-app-help-body .mb-md-h1')).toHaveText('Title');
    });
});

test.describe('the help dialog renders Markdown as DOM', () => {
    test.beforeEach(async ({ page }) => {
        await loadWithHelp(page, SAMPLE_MD);
        await openHelpDialog(page);
    });

    test('headings, emphasis, code spans and links become elements', async ({ page }) => {
        const body = page.locator('#mb-app-help-body');

        await expect(body.locator('h1.mb-md-h1')).toHaveText('Title');
        await expect(body.locator('h2.mb-md-h2').first()).toHaveText('Contents');
        await expect(body.locator('strong').first()).toHaveText('bold');
        await expect(body.locator('em').first()).toHaveText('italic');
        await expect(body.locator('code.mb-md-code').first()).toHaveText('code');

        const ext = body.locator('a.mb-md-a[href="https://example.org/x"]');
        await expect(ext).toHaveCount(1);
        expect(await ext.getAttribute('target')).toBe('_blank');

        // And none of the syntax survived as text.
        const text = await body.innerText();
        expect(text, 'no raw heading marker').not.toContain('# Title');
        expect(text, 'no raw bold marker').not.toContain('**bold**');
    });

    test('a snake_case identifier is NOT italicised', async ({ page }) => {
        // The reason `_italic_` is unsupported. An emphasis rule on underscores
        // renders this as "sa" + <em>enable_caa</em> + "pics".
        const body = page.locator('#mb-app-help-body');
        await expect(body.getByText('sa_enable_caa_pics', { exact: false })).toHaveCount(1);

        const ems = await body.locator('em').allTextContents();
        expect(ems, 'nothing from inside the identifier became emphasis')
            .not.toEqual(expect.arrayContaining([expect.stringContaining('enable')]));
    });

    test('a non-http link renders as inert text, not as a link', async ({ page }) => {
        const body = page.locator('#mb-app-help-body');
        await expect(body.locator('a[href^="javascript:"]')).toHaveCount(0);
        expect(await body.innerText()).toContain('bad link');
    });

    test('fenced code keeps its content verbatim, markers and all', async ({ page }) => {
        const pre = page.locator('#mb-app-help-body pre.mb-md-pre');
        await expect(pre).toHaveCount(1);
        // Inline syntax inside a fence is content, not markup.
        await expect(pre).toContainText('**not** bold here');
        await expect(pre.locator('strong')).toHaveCount(0);
    });

    test('the stylesheet is actually injected, not just the class names', async ({ page }) => {
        // The renderer stamps classes and injects one GM_addStyle sheet for
        // them. Those are two separate things, and a document with every class
        // correct and no rules behind them still has correct STRUCTURE — which
        // is all the other tests here look at. Assert a computed value so the
        // sheet going missing is a failure rather than a flat-looking page.
        await expect(page.locator('#mb-md-help-style')).toHaveCount(1);
        const paint = await page.evaluate(() => {
            const cs = getComputedStyle(document.querySelector('#mb-app-help-body pre.mb-md-pre'));
            const th = getComputedStyle(document.querySelector('#mb-app-help-body table.mb-md-table'));
            return { preBg: cs.backgroundColor, collapse: th.borderCollapse };
        });
        expect(paint.preBg, 'the code block is painted, not transparent').toBe('rgb(246, 248, 250)');
        expect(paint.collapse, 'the table collapses its borders').toBe('collapse');
    });

    test('a pipe table becomes a real table with a header row', async ({ page }) => {
        const table = page.locator('#mb-app-help-body table.mb-md-table');
        await expect(table).toHaveCount(1);
        expect(await table.locator('thead th').allTextContents()).toEqual(['Col A', 'Col B']);
        expect(await table.locator('tbody tr')).toHaveCount(1);
        expect(await table.locator('tbody td').allTextContents()).toEqual(['one', 'two']);
    });

    test('a pipe-led line with no separator under it is prose, and keeps its neighbour', async ({ page }) => {
        // The separator row is what stops the table rule firing on prose. It
        // cannot be seen on a well-formed table, because the branch consumes
        // header-plus-separator unconditionally either way — so the guard needs
        // a line the rule should REFUSE. Without it this becomes a second
        // table whose header is the sentence, and the line after it disappears
        // into the skipped separator slot.
        const body = page.locator('#mb-app-help-body');
        await expect(body.locator('table.mb-md-table')).toHaveCount(1);
        const text = await body.innerText();
        expect(text).toContain('a pipe-led line that is not a table');
        expect(text, 'the following line was not swallowed').toContain('and the prose line under it');
    });

    test('lists nest one level, and a blockquote is its own block', async ({ page }) => {
        const body = page.locator('#mb-app-help-body');
        await expect(body.locator('ul.mb-md-ul ul.mb-md-ul li')).toHaveText(['nested']);
        await expect(body.locator('.mb-md-quote')).toHaveText('a quoted line');
    });

    test('a wrapped bullet stays ONE item of ONE list', async ({ page }) => {
        // Lazy continuation. Without it a wrapped bullet ends its list, emits
        // the continuation as a stray paragraph and reopens a new list for the
        // next bullet — and every fragment is individually well-formed, which
        // is why counting elements catches it and reading the output does not.
        // This is what the whole "Supported pages" section of the real help
        // file did; found by scripts/probe-help-md-render.js, not by a test.
        const body = page.locator('#mb-app-help-body');
        const top = body.locator('details.mb-md-details > ul.mb-md-ul');
        await expect(top, 'one list, not one per bullet').toHaveCount(1);
        await expect(top.locator('> li')).toHaveCount(3);
        await expect(top.locator('> li').nth(1))
            .toHaveText('second, whose text wraps onto a continuation line');
    });

    test('a heading directly under a list is a heading, not the last bullet', async ({ page }) => {
        // The other half of the continuation rule: it requires an INDENT.
        // Without that requirement a list swallows whatever follows it, and
        // the committed help file cannot show this because every list there is
        // followed by a blank line — which ends the list either way.
        const body = page.locator('#mb-app-help-body');
        await expect(body.locator('h2.mb-md-h2', { hasText: 'Immediately after a list' }))
            .toHaveCount(1);
        const bullets = await body.locator('ul.mb-md-ul > li').allTextContents();
        expect(bullets, 'the heading did not become bullet text')
            .toEqual(expect.arrayContaining(['beta']));
    });

    test('a <details> block renders OPEN, so the quick filter cannot hit hidden text', async ({ page }) => {
        // Collapsed content is still in the DOM, so the dialog's quick filter
        // would highlight matches inside a closed box — a filter reporting hits
        // the reader cannot see is worse than no filter. GitHub is where the
        // sections collapse.
        const details = page.locator('#mb-app-help-body details.mb-md-details');
        await expect(details).toHaveCount(1);
        expect(await details.evaluate((el) => el.open)).toBe(true);
        await expect(details.locator('summary')).toHaveText('Folded reference');
    });

    test('an in-document anchor link scrolls the dialog instead of navigating the page', async ({ page }) => {
        // The dialog is a fixed overlay with its own scroll area. Letting the
        // browser follow the fragment would scroll MusicBrainz's page
        // underneath while the table of contents appeared to do nothing.
        const before = page.url();
        const toc = page.locator('#mb-app-help-body a.mb-md-a[href^="#"]').first();
        await expect(toc).toHaveCount(1);
        // The href carries the PREFIXED id: the file's own fragments are
        // written for GitHub's bare slug, and the prefix is what keeps a
        // heading id from colliding with MusicBrainz's own page.
        expect(await toc.getAttribute('href')).toBe('#mb-md-deep-section');
        await expect(page.locator('#mb-md-deep-section')).toHaveCount(1);

        await toc.click();
        expect(page.url(), 'no fragment navigation').toBe(before);
        await expect(page.locator('#mb-app-help-dialog')).toHaveCount(1);
    });
});

test.describe('the committed help file stays inside what the renderer supports', () => {
    test('ShowAllEntityData_HELP.md renders with no Markdown syntax left as text', async ({ page }) => {
        const md = fs.readFileSync(HELP_MD_PATH, 'utf8');
        await loadWithHelp(page, md);
        await openHelpDialog(page);

        const body = page.locator('#mb-app-help-body');

        // Structure the real document is known to contain. Bare counts, not
        // exact numbers: this guards "the renderer still handles the file",
        // not the file's editorial content.
        expect(await body.locator('h1.mb-md-h1').count(), 'one H1').toBe(1);
        expect(await body.locator('h2.mb-md-h2').count(), 'section headings').toBeGreaterThan(10);
        expect(await body.locator('table.mb-md-table').count(), 'tables').toBeGreaterThan(3);
        expect(await body.locator('details.mb-md-details').count(), 'folded sections').toBeGreaterThan(5);
        expect(await body.locator('a.mb-md-a[href^="#"]').count(), 'a real table of contents').toBeGreaterThan(10);

        // Every table-of-contents entry resolves to a heading this renderer
        // stamped. A broken anchor is invisible on GitHub too, so nothing else
        // would catch it.
        const dangling = await body.evaluate((el) => Array.from(
            el.querySelectorAll('a.mb-md-a[href^="#"]')
        ).map((a) => a.getAttribute('href')).filter((h) => !el.ownerDocument.querySelector(
            '[id="' + h.slice(1) + '"]'
        )));
        expect(dangling, 'no table-of-contents entry points at a missing heading').toEqual([]);

        // No line of the document came through as unrendered syntax.
        const text = await body.innerText();
        for (const marker of ['\n# ', '\n## ', '\n- [', '<details>', '<summary>', '|---']) {
            expect(text, `"${marker.trim()}" was rendered, not printed`).not.toContain(marker);
        }
    });
});

test.describe('🔍 Filter help text… actually searches the rendered Markdown', () => {
    // The bug: _createInfoDialogQuickFilter()'s applyQF() only ever recognised
    // two shapes — [data-qf-item] rows (hide/show, what showShortcutsHelp()
    // uses) and <pre> (highlight-only, what the OLD single-<pre> plain-text
    // help format used). _mdRenderInto() produces neither — headings,
    // paragraphs, list items and table cells, none of them [data-qf-item],
    // none of them <pre> — so the input updated and its ✕ button worked, but
    // nothing was ever hidden or highlighted: it silently did nothing.
    //
    // The fix stamps #mb-app-help-body with data-qf-freetext, and applyQF()'s
    // free-text branch now highlights (never hides) any [data-qf-freetext]
    // container the same way it always highlighted a <pre>.
    test('typing a query highlights every matching occurrence in the body', async ({ page }) => {
        await loadWithHelp(page, SAMPLE_MD);
        await openHelpDialog(page);

        const input = page.locator('#mb-app-help-dialog input[placeholder="🔍 Filter help text…"]');
        await input.fill('bold');

        const marks = page.locator('#mb-app-help-body mark.mb-dialog-hl');
        // "bold" appears once as prose ("with **bold**, ...") and once inside
        // the fenced code block's own comment ("not** bold here") — both must
        // be found: the fenced code block is a <pre>, the paragraph is not.
        await expect(marks).toHaveCount(2);
        for (const text of await marks.allTextContents()) {
            expect(text.toLowerCase()).toBe('bold');
        }
    });

    test('a match highlights inside a heading, a list item, and a table cell — not just prose', async ({ page }) => {
        await loadWithHelp(page, SAMPLE_MD);
        await openHelpDialog(page);

        const input = page.locator('#mb-app-help-dialog input[placeholder="🔍 Filter help text…"]');

        await input.fill('Deep section');
        // Matches the H2 heading text AND the table-of-contents list item
        // linking to it — two different element kinds, neither a <pre>.
        await expect(page.locator('#mb-app-help-body h2.mb-md-h2 mark.mb-dialog-hl')).toHaveCount(1);
        await expect(page.locator('#mb-app-help-body li.mb-md-li mark.mb-dialog-hl')).toHaveCount(1);

        await input.fill('');
        await input.fill('Col B');
        await expect(page.locator('#mb-app-help-body table.mb-md-table mark.mb-dialog-hl')).toHaveCount(1);
    });

    test('non-matching content stays VISIBLE — free text is highlighted, never hidden', async ({ page }) => {
        // Unlike a flat [data-qf-item] list (where hiding a non-matching row
        // is the point), hiding individual paragraphs/headings out of prose
        // would destroy its reading order. This is also what the OLD
        // single-<pre> plain-text format did: highlight only, nothing hidden.
        await loadWithHelp(page, SAMPLE_MD);
        await openHelpDialog(page);

        const input = page.locator('#mb-app-help-dialog input[placeholder="🔍 Filter help text…"]');
        await input.fill('Deep section');

        const hidden = await page.locator('#mb-app-help-body *').evaluateAll(
            (els) => els.filter((el) => el.style.display === 'none').map((el) => el.tagName));
        expect(hidden, 'nothing inside the Markdown body is ever hidden by this filter').toEqual([]);

        // The heading from the OTHER, non-matching section is still there.
        await expect(page.locator('#mb-app-help-body h1.mb-md-h1')).toBeVisible();
    });

    test('clearing the filter removes the highlights', async ({ page }) => {
        await loadWithHelp(page, SAMPLE_MD);
        await openHelpDialog(page);

        const input = page.locator('#mb-app-help-dialog input[placeholder="🔍 Filter help text…"]');
        await input.fill('bold');
        await expect(page.locator('#mb-app-help-body mark.mb-dialog-hl')).not.toHaveCount(0);

        await input.fill('');
        await expect(page.locator('#mb-app-help-body mark.mb-dialog-hl')).toHaveCount(0);
    });

    test('showShortcutsHelp still hides non-matching rows — the fix did not touch that path', async ({ page }) => {
        // Regression guard: the free-text branch grew a second selector
        // ('pre, [data-qf-freetext]'), but showShortcutsHelp()'s own
        // [data-qf-item]/[data-qf-section] hide/show branch is untouched code
        // and must keep behaving exactly as before.
        await loadWithHelp(page, SAMPLE_MD);
        // Adopted into 🛠 View ▾ — a row in a closed panel has a zero
        // bounding rect, so a bare click times out. See toolbarMenu.js.
        await clickToolbarItem(page, '#mb-shortcuts-help-btn');
        await page.waitForSelector('#mb-shortcuts-help [data-qf-item]');

        const input = page.locator('#mb-shortcuts-help input[placeholder="🔍 Filter shortcuts…"]');
        await input.fill('zzz-no-such-shortcut-zzz');

        const visibleItems = await page.locator('#mb-shortcuts-help [data-qf-item]').evaluateAll(
            (els) => els.filter((el) => el.style.display !== 'none').length);
        expect(visibleItems, 'a query matching nothing hides every row').toBe(0);
    });
});
