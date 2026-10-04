'use strict';

// A column header that carries an emoji must keep it whole when the script
// strips its own header decorations (⇅ ▲ ▼ 📊 ▶ ◀ ▤, digits, superscripts).
//
// The strip regexes are character classes holding 📊 (U+1F4CA). Without the
// `u` flag a class matches UTF-16 code units, not code points, so 📊 adds its
// two halves `\uD83D` and `\uDCCA` as two separate members. Every other emoji
// whose high half is `\uD83D` (🔗 🖼 📋 💿 …) then loses that half and leaves a
// lone low surrogate behind: "🔗 Links" became "\uDD17 Links", which renders
// as a broken glyph in the 👁️ column-visibility menu and is also the key the
// menu persists that column's show/hide state under. ESLint reports this as
// `no-misleading-character-class`.
//
// The property pinned here is "the emoji survives the name strip", not "the
// column is still listed": a lone surrogate leaves the label present, non-empty
// and still ending in "Links", so only an exact comparison, plus
// `isWellFormed()`, can tell the two apart.
//
// The fixture is copied with one extra column, the shape a third-party script
// that adds a decorated column produces. Neither native header (Event,
// Location) is renamed, because both drive this pageType's extractors.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const SOURCE_FIXTURE = path.join(__dirname, 'area-flag-region-filter.html');
const EMOJI_HEADER = '🔗 Links';

/**
 * Writes a copy of the artist-events fixture with an extra `🔗 Links` column
 * (one header cell, one body cell per row) and returns its path.
 *
 * @param {import('@playwright/test').TestInfo} testInfo
 * @returns {string}
 */
function writeEmojiHeaderFixture(testInfo) {
    const html = fs.readFileSync(SOURCE_FIXTURE, 'utf8');
    const [head, body] = html.split('<tbody>');
    expect(body, 'the fixture has a <tbody>').toBeDefined();
    const newHead = head.replace('<th>Location</th>', `<th>Location</th><th>${EMOJI_HEADER}</th>`);
    expect(newHead, 'the fixture has a "Location" header to insert after').not.toBe(head);
    const newBody = body.replace(/<\/tr>/g, '<td>x</td></tr>');
    const out = testInfo.outputPath('artist-events-emoji-header.html');
    fs.writeFileSync(out, `${newHead}<tbody>${newBody}`);
    return out;
}

test.describe('header names keep their emoji through the decoration strip', () => {
    test('👁️ column-visibility label for "🔗 Links" is exactly "🔗 Links"', async ({ page }, testInfo) => {
        const fixtureFile = writeEmojiHeaderFixture(testInfo);
        await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile, testMode: true });
        await page.click('button[data-label="Show all Events for Artist"]');
        await waitForRenderComplete(page, { waitForAutoResize: false });

        // The header itself really does carry the script's 📊 button by now, so
        // the strip has something to remove besides the emoji it must keep.
        const thText = await page.evaluate((name) => {
            const th = Array.from(document.querySelectorAll('table.tbl thead tr:first-child th'))
                .find((c) => c.textContent.includes(name.slice(2)));
            return th ? th.textContent : null;
        }, EMOJI_HEADER);
        expect(thText, 'the added header is rendered').not.toBeNull();
        expect(thText).toContain('📊');

        await page.click('#mb-visible-btn');
        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll('label[for^="mb-col-vis-"]')).map((l) => ({
                text: l.textContent,
                wellFormed: l.textContent.isWellFormed(),
            })));

        const links = labels.find((l) => l.text.endsWith('Links'));
        expect(links, 'the column-visibility menu lists the added column').toBeDefined();
        expect(links.wellFormed, 'no lone surrogate left in the label').toBe(true);
        expect(links.text).toBe(EMOJI_HEADER);
        // The native headers come through as before.
        expect(labels.map((l) => l.text)).toEqual(expect.arrayContaining(['Event', 'Location']));
    });
});
