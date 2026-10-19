'use strict';

// The event page's URL table shows each link's site icon, as the sidebar
// draws it (org/TODO.org, 2026-10-19: the brucebase "Review" link of
// https://musicbrainz.org/event/47b84024-bd3b-4e36-80e1-b051e12ede2f had its
// icon in the sidebar card and none in the URLs table, debug/event-review-glyph.html).
//
// applyRelDetailsToTables() ran the icon pass (_sbIconRelLinks()); the event
// page's own converter, applyEventDetailsToTables(), never did.
//
// Guarantee pinned: in the "URLs" table every link whose sidebar item draws an
// icon shows THAT icon (the computed background, not only the class), the
// review link included; and a link whose item draws none shows none.

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const PAGE_URL = 'https://musicbrainz.org/event/3f2ca30a-7de4-4964-ad30-48376535fec8';
const FIXTURE = path.join(__dirname, 'event-overview.html');
const BUTTON = 'button[data-label="Show all Relationships for Event"]';
// MusicBrainz draws a site icon from its stylesheet (refused here) as a data: URI.
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * Loads the event fixture, adds MusicBrainz's rule for the review icon (only
 * that one: setlist.fm's item stays without an icon) and presses the button.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openEvent(page) {
    await page.context().route('https://static.metabrainz.org/**', (route) => route.abort('blockedbyclient'));
    await loadUserscriptPage(page, {
        url: PAGE_URL, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_event_overview: true, sa_event_overview_setlist: false },
    });
    await page.route('https://eventartarchive.org/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.addStyleTag({ content: `ul.external_links li.review-favicon { background-image: url("${ICON}"); }` });
    await page.click(BUTTON);
    await waitForRenderComplete(page, { waitForAutoResize: false });
}

test.describe('event-overview: site icons in the URLs table', () => {
    test('the review link shows its sidebar icon; a link whose item has none shows none', async ({ page }) => {
        await openEvent(page);
        const st = await page.evaluate(() => {
            const h3 = Array.from(document.querySelectorAll('h3.mb-toggle-h3')).find((h) => /\bURLs\b/.test(h.textContent));
            let t = h3 && h3.nextElementSibling;
            while (t && t.tagName !== 'TABLE') t = t.nextElementSibling;
            const out = {};
            if (!t) return null;
            t.querySelectorAll('tbody a[href^="http"]').forEach((a) => {
                const m = /url\("?(.*?)"?\)/.exec(getComputedStyle(a).backgroundImage);
                out[new URL(a.href).hostname] = a.classList.contains('mb-sb-ico') && m ? m[1] : '';
            });
            return out;
        });
        expect(st, 'the URLs table').not.toBeNull();
        expect(st['brucebase.wikidot.com'], 'the review link has the icon its sidebar item draws').toBe(ICON);
        expect(st['www.setlist.fm'], 'no icon where the sidebar item draws none').toBe('');
    });
});
