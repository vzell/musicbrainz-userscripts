// @ts-check
// The rich event card of an EAA image (big-picture strip, inline thumbnail)
// on '<entity>-events': its line-up lists each artist with its role on a line
// of its own (reported 2026-10-17 on The Stone Pony's events, where 17
// artists ran together as one comma-separated paragraph).
//
// Guarantee pinned: ONE LINE PER ARTIST, in the cell's order, MusicBrainz's
// collapsed entries included, each "Name (role)", the role still coloured;
// the lines sit one under the other (each starts below the one before).

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL_ = 'https://musicbrainz.org/place/6a59a67c-fcc5-491f-949c-bfc45bc97463/events';
const FIXTURE = path.join(__dirname, 'place-events-lineup.html');

// 1x1 transparent PNG, so <img>.onload fires.
const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

/**
 * Answers every Event Art Archive request: the metadata with one Front image,
 * every image with the 1x1 PNG.
 * @param {import('@playwright/test').Page} page
 */
async function routeArchive(page) {
    await page.route('https://eventartarchive.org/**', async (route) => {
        const m = route.request().url().match(/\/event\/([0-9a-f-]{36})\/?$/);
        if (m) {
            await route.fulfill({
                status: 200,
                headers: { 'access-control-allow-origin': '*' },
                contentType: 'application/json',
                body: JSON.stringify({ images: [{
                    image: `https://eventartarchive.org/event/${m[1]}/1.jpg`,
                    thumbnails: { '250': `https://eventartarchive.org/event/${m[1]}/1-250.jpg` },
                    types: ['Poster'],
                }] }),
            });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG });
    });
}

test('ONE LINE PER ARTIST: the event card of a strip image lists each artist and role on its own line', async ({ page }) => {
    await loadUserscriptPage(page, {
        url: URL_, fixtureFile: FIXTURE, testMode: true,
        settingsOverride: { sa_enable_caa_pics: true, sa_caa_pics_big: true, sa_caa_pics_initially_collapsed: false,
                            sa_art_idb_enable: false, sa_caa_hover_preview: false, sa_enable_relationships_column: false },
    });
    await routeArchive(page);
    await page.click('button[data-label="Show all Events for Place"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });
    const img = page.locator('.mb-eaa-bigbox a').first();
    await expect(img.locator('img')).toBeVisible();
    // The served image is 1x1: give it a real size to hover (test-only styling).
    await img.evaluate((a) => { const i = a.querySelector('img'); i.style.width = '48px'; i.style.height = '48px'; });
    await page.mouse.move(0, 0);
    await img.hover();
    const tip = page.locator('#mb-art-bigbox-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Hungerthon Benefit');

    const lines = await tip.evaluate((t) => Array.from(t.querySelectorAll('.mb-tt-artist-role')).map((l) => ({
        text: l.textContent.replace(/\s+/g, ' ').trim(),
        top: l.getBoundingClientRect().top,
        role: (() => { const s = l.querySelector('span'); return s ? getComputedStyle(s).fontWeight : ''; })(),
    })));
    expect(lines.map((l) => l.text)).toEqual([
        'Bruce Springsteen (guest performer)',
        'Little Steven and the Disciples of Soul (main performer)',
        'Audrey Martells (main performer)',
        'Stan Harrison (main performer)',
    ]);
    for (let i = 1; i < lines.length; i++) {
        expect(lines[i].top, `line ${i + 1} starts below line ${i}`).toBeGreaterThan(lines[i - 1].top);
    }
    expect(lines.every((l) => l.role === '700'), 'the role is still bold and coloured').toBe(true);
    await expect(tip, 'no comma-joined list').not.toContainText('(guest performer),');
});
