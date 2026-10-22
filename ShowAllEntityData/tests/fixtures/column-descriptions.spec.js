'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { loadFromDiskFixture } = require('../support/diskFixture');
const { waitForRenderComplete } = require('../support/browser');
const { setupRecordingOf } = require('../support/recordingOf');
const { URL: ARTIST_EVENTS_URL, FIXTURE_PATH: ARTIST_EVENTS_FIXTURE } = require('../support/artistEventsFixture');

// Column header tooltips: every header's card is titled with its column's
// name in bold (`_tipHeaderColumnName()` in `_tipTextToHtml()`), above
// whatever the tip says — a derived column's origin, an injected column's
// explanation, or, for a column MusicBrainz renders itself, a description
// (`_COLUMN_DESCRIPTIONS`, `sa_column_descriptions`). Properties:
//   - a native column gets its description as its tip, and its card is
//     titled with its name;
//   - a derived/extracted column keeps its own tip, and its card is titled
//     with its name above it;
//   - a name that means different things gets the text for what the
//     table's rows are (`_tableRowEntity()`): "Type" on an artist's events;
//   - `features.columnDescriptions` overrides, an entity variant falls back
//     to `default`;
//   - with the setting off, native columns get no tip, and a foreign site
//     never gets a MusicBrainz text.

/**
 * A header's tip text and the card it renders: title and body lines.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name - The column's `data-col-name`.
 * @returns {Promise<?{tip: string, title: ?string, body: string[]}>}
 */
const headerCard = (page, name) => page.evaluate((n) => {
    const th = document.querySelector(`table.tbl thead tr:first-child th[data-col-name="${n}"]`);
    if (!th) return null;
    const tip = th.getAttribute('title') || th.dataset.mbTipSaved || '';
    const d = document.createElement('div');
    d.innerHTML = tip ? window.__saTest.tipTextToHtml(tip, th) : '';
    const title = d.querySelector('.mb-tt-title');
    return {
        tip,
        hasTip: th.hasAttribute('data-mb-tip'),
        title: title ? title.textContent : null,
        titles: d.querySelectorAll('.mb-tt-title').length,
        body: Array.from(d.querySelectorAll('.mb-tt-body')).map((b) => b.textContent),
    };
}, name);

test.describe('column header tooltips', () => {
    test('a MusicBrainz column gets its description, titled with its name', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        expect(await page.evaluate(() => window.__saTest.tableRowEntity(document.querySelector('table.tbl')))).toBe('recording');
        const artist = await headerCard(page, 'Artist');
        expect(artist.tip).toMatch(/^The artist credit/);
        expect(artist.title).toBe('Artist');
        expect(artist.body).toEqual([artist.tip]);
        // The recording variant of "Name".
        expect((await headerCard(page, 'Name')).tip).toMatch(/^The recording's title/);
        expect((await headerCard(page, 'ISRCs')).tip).toMatch(/ISRCs \(International Standard Recording Codes\)/);
    });

    test('a derived column keeps its tip, now under its name', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        const ev = await headerCard(page, 'Event-Date');
        expect(ev.tip).toMatch(/^Derived from 'Comment'/);
        expect(ev.title).toBe('Event-Date');
        expect(ev.body).toEqual([ev.tip]);
        // A labelled column: its full name, once, above its explanation.
        const rec = await headerCard(page, 'Recording of');
        expect(rec.title).toBe('Recording of');
        expect(rec.titles).toBe(1);
        expect(rec.body[0]).toMatch(/^Injected column/);
    });

    test('hovering a header shows the card with the name in bold', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false, sa_rich_tooltips: true, sa_rich_tooltip_delay_ms: 0 } });
        const th = page.locator('table.tbl thead tr:first-child th[data-col-name="Artist"]');
        await th.hover({ position: { x: 3, y: 3 } });
        const card = page.locator('#mb-stat-tooltip');
        await expect(card).toBeVisible();
        await expect(card.locator('.mb-tt-title')).toHaveText('Artist');
        await expect(card.locator('.mb-tt-body')).toContainText('The artist credit');
    });

    test('"Type" on an artist\'s events is the kind of event', async ({ page }) => {
        await loadFromDiskFixture(page, { url: ARTIST_EVENTS_URL, fixturePath: ARTIST_EVENTS_FIXTURE, testMode: true });
        await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 60000 });
        expect(await page.evaluate(() => window.__saTest.tableRowEntity(document.querySelector('table.tbl')))).toBe('event');
        const type = await headerCard(page, 'Type');
        expect(type.tip).toMatch(/^The kind of event: concert, festival/);
        expect(type.title).toBe('Type');
        expect((await headerCard(page, 'Date')).tip).toMatch(/^The date the event took place/);
    });

    test('features.columnDescriptions overrides; a variant falls back to default', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false } });
        const r = await page.evaluate(() => ({
            own: window.__saTest.columnDescriptionFor('Type', 'event', { features: { columnDescriptions: { Type: 'Own text.' } } }),
            ownVariant: window.__saTest.columnDescriptionFor('Type', 'work', { features: { columnDescriptions: { Type: { default: 'D.', work: 'W.' } } } }),
            fallback: window.__saTest.columnDescriptionFor('Type', 'genre', { features: {} }),
            none: window.__saTest.columnDescriptionFor('No such column', '', { features: {} }),
        }));
        expect(r.own).toBe('Own text.');
        expect(r.ownVariant).toBe('W.');
        expect(r.fallback).toBe('The type MusicBrainz gives the item.');
        expect(r.none).toBe('');
    });

    test('with sa_column_descriptions off, MusicBrainz columns have no tip', async ({ page }) => {
        await setupRecordingOf(page, { settings: { sa_recording_of_suggest_enable: false, sa_column_descriptions: false } });
        const artist = await headerCard(page, 'Artist');
        expect(artist.hasTip).toBe(false);
        expect(artist.tip).toBe('');
        // The script's own columns keep theirs, titled.
        expect((await headerCard(page, 'Event-Date')).title).toBe('Event-Date');
    });

    test('a foreign site never gets a MusicBrainz description', async ({ page }) => {
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        await page.route(/^https?:\/\//, (route) => route.abort('blockedbyclient'));
        await page.route('https://i.discogs.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await loadUserscriptPage(page, {
            url: 'https://www.discogs.com/release/1874253-Bruce-Springsteen-Born-To-Run',
            fixtureFile: path.join(__dirname, 'dg-release.html'),
            testMode: true,
            settingsOverride: { sa_enable_discogs: true, sa_render_threshold: 100000 },
        });
        await expect.poll(() => page.evaluate(() => !!window.__saTest)).toBe(true);
        expect(await page.evaluate(() => window.__saTest.columnDescriptionFor('Title', 'release', { features: {} }))).toBe('');
        expect(await page.evaluate(() => window.__saTest.columnDescriptionFor('Artist', '', { features: {} }))).toBe('');
    });
});
