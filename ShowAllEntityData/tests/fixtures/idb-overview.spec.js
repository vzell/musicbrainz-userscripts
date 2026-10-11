'use strict';

const path = require('path');
const { test, expect } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { setupRecordingOf } = require('../support/recordingOf');
const { seedCacheOverview } = require('../support/idbFixture');

// The 💾 browser cache overview (_idbo*): what the script keeps in IndexedDB,
// for the user. Both databases are seeded before the userscript opens them:
// fresh and expired records in several parts, one part empty. Properties:
//   - per part: entries, expired count, and a size (images count their Blob);
//     one donut arc per part with data, none for the empty part;
//   - picking a part (row, legend, arc) shows its keys; the search narrows them;
//   - every delete asks inside the dialog first and Cancel deletes nothing;
//     "Delete N expired" / "Clear" / one entry / everything expired /
//     older than N days / Clear all change IndexedDB itself, not just the view;
//   - Esc cancels a pending confirmation before it closes the dialog;
//   - the ways in: ⚙️ Settings registry, the Statistics panel, a progress
//     card's cache rows, the Tampermonkey menu.

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, 'artist-recordings.html');
const dlg = (page) => page.locator('#mb-idb-overview');
const row = (page, id) => page.locator(`#mb-idb-overview tr[data-part="${id}"]`);

/**
 * Seeds both databases (art cache v4, link previews v1) before any script
 * runs, then loads the page.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [settings]
 */
async function setup(page, settings = {}) {
    await seedCacheOverview(page);
    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true, settingsOverride: settings });
    await page.waitForFunction(() => window.__seedDone === 2);
}

/** Opens the overview through the test hook and waits for the scan. */
async function open(page) {
    await page.evaluate(() => window.__saTest.idbOverview.open());
    await expect(row(page, 'images')).toBeVisible();
}

/** A fresh scan straight from IndexedDB, keyed by part id. */
const scan = (page) => page.evaluate(() => window.__saTest.idbOverview.scan()
    .then((ps) => Object.fromEntries(ps.map((p) => [p.id, p]))));

test.describe('💾 browser cache overview', () => {
    test('lists every part with entries, expired counts and sizes; one arc per part with data', async ({ page }) => {
        await setup(page);
        await open(page);
        const counts = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#mb-idb-overview tr[data-part]'))
            .map((tr) => [tr.dataset.part, tr.querySelector('[data-idbo-count]').textContent])));
        expect(counts).toEqual({
            images: '2', metadata: '3', 'rel-ws2': '2', 'ms-rec-len': '0', 'recof-ws2': '3', 'artist-works': '1', pages: '2',
        });
        await expect(row(page, 'images')).toContainText('Delete 1 expired');
        await expect(row(page, 'rel-ws2')).toContainText('nothing expired');
        await expect(row(page, 'pages')).toContainText('Delete 1 expired');
        // The images part counts its Blob bytes (5000 + 3000 plus JSON).
        const s = await scan(page);
        expect(s.images.bytes).toBeGreaterThan(8000);
        expect(s['ms-rec-len'].count).toBe(0);
        await expect(page.locator('#mb-idb-overview .mb-idbo-seg')).toHaveCount(6);
        await expect(page.locator('#mb-idb-overview [data-idbo-stat="entries"]')).toContainText('13');
        await expect(page.locator('#mb-idb-overview [data-idbo-stat="entries"]')).toContainText('4 past their keep time');
    });

    test('picking a part shows its keys; the search narrows them', async ({ page }) => {
        await setup(page);
        await open(page);
        await row(page, 'recof-ws2').click();
        const keys = page.locator('#mb-idb-overview [data-idbo-key-row]');
        await expect(keys).toHaveCount(3);
        await page.locator('#mb-idbo-q').fill('r2');
        await expect(keys).toHaveCount(1);
        await expect(keys.first()).toContainText('recording:r2|work-rels');
        // The legend and the donut pick too.
        await page.locator('#mb-idb-overview .mb-idbo-legend button[data-part="pages"]').click();
        await expect(keys).toHaveCount(2);
        // An arc's bounding-box centre is the donut's hole, so a pointer click
        // there would miss; drive its click handler, and the keyboard.
        await page.locator('#mb-idb-overview .mb-idbo-seg[data-part="metadata"]').dispatchEvent('click');
        await expect(keys).toHaveCount(3);
        await page.locator('#mb-idb-overview .mb-idbo-seg[data-part="images"]').focus();
        await page.keyboard.press('Enter');
        await expect(keys).toHaveCount(2);
        await expect(page.locator('#mb-idb-overview .mb-idbo-donut-c')).toContainText('Cover art images');
    });

    test('a delete asks first; Cancel deletes nothing; "Delete N expired" removes only those from IndexedDB', async ({ page }) => {
        await setup(page);
        await open(page);
        await row(page, 'images').locator('[data-idbo="expired"]').click();
        await expect(page.locator('#mb-idb-overview .mb-idbo-confirm')).toContainText('Delete 1 expired entries from “Cover art images”');
        await page.locator('#mb-idb-overview [data-idbo="no"]').click();
        expect((await scan(page)).images.count).toBe(2);
        await row(page, 'images').locator('[data-idbo="expired"]').click();
        await page.locator('#mb-idb-overview [data-idbo="yes"]').click();
        await expect(page.locator('#mb-idb-overview [data-idbo-toast]')).toContainText('Deleted 1 entries');
        const s = await scan(page);
        expect(s.images).toMatchObject({ count: 1, expired: 0 });
        expect(s.metadata.count).toBe(3); // other parts untouched
        await expect(row(page, 'images')).toContainText('nothing expired');
    });

    test('Clear empties one part; a single entry can be deleted', async ({ page }) => {
        await setup(page);
        await open(page);
        await row(page, 'rel-ws2').locator('[data-idbo="clear"]').click();
        await page.locator('#mb-idb-overview [data-idbo="yes"]').click();
        await expect.poll(async () => (await scan(page))['rel-ws2'].count).toBe(0);
        await row(page, 'recof-ws2').click();
        await page.locator('#mb-idb-overview [data-idbo-key-row]', { hasText: 'recording:r1' }).locator('[data-idbo="key"]').click();
        await page.locator('#mb-idb-overview [data-idbo="yes"]').click();
        await expect.poll(async () => (await scan(page))['recof-ws2'].count).toBe(2);
        await expect(page.locator('#mb-idb-overview [data-idbo-key-row]', { hasText: 'recording:r1' })).toHaveCount(0);
    });

    test('global deletes: everything expired, then older than 7 days, then Clear all', async ({ page }) => {
        await setup(page);
        await open(page);
        await page.locator('#mb-idb-overview [data-idbo="all-expired"]').click();
        await page.locator('#mb-idb-overview [data-idbo="yes"]').click();
        await expect.poll(async () => Object.values(await scan(page)).reduce((n, p) => n + p.expired, 0)).toBe(0);
        let s = await scan(page);
        expect([s.images.count, s.metadata.count, s['recof-ws2'].count, s.pages.count]).toEqual([1, 2, 2, 1]);
        await page.locator('#mb-idbo-older').selectOption('7');
        await page.locator('#mb-idb-overview [data-idbo="older"]').click();
        await page.locator('#mb-idb-overview [data-idbo="yes"]').click();
        await expect.poll(async () => (await scan(page))['recof-ws2'].count).toBe(1); // the 10-day entry went
        s = await scan(page);
        expect(s.metadata.count).toBe(2); // 2 days old stays
        await page.locator('#mb-idb-overview [data-idbo="all"]').click();
        await page.locator('#mb-idb-overview [data-idbo="yes"]').click();
        await expect.poll(async () => Object.values(await scan(page)).reduce((n, p) => n + p.count, 0)).toBe(0);
    });

    test('Esc cancels a pending confirmation first, then closes', async ({ page }) => {
        await setup(page);
        await open(page);
        await row(page, 'images').locator('[data-idbo="clear"]').click();
        await expect(page.locator('#mb-idb-overview .mb-idbo-confirm')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mb-idb-overview .mb-idbo-confirm')).toHaveCount(0);
        await expect(dlg(page)).toBeVisible();
        expect((await scan(page)).images.count).toBe(2);
        await page.keyboard.press('Escape');
        await expect(dlg(page)).toHaveCount(0);
    });

    test('the Statistics panel opens it', async ({ page }) => {
        // A rendered page is needed for the 📊 Statistics button.
        await seedCacheOverview(page);
        await setupRecordingOf(page);
        await page.evaluate(() => document.getElementById('mb-stats-btn').click());
        await page.locator('#mb-stats-idb-overview-btn').click();
        await expect(row(page, 'images')).toBeVisible();
    });

    test('the ways in: Settings registry, Tampermonkey menu, a progress card\'s cache rows', async ({ page }) => {
        await setup(page, { sa_async_pop_auto_open: true });
        // Tampermonkey menu.
        const viaMenu = await page.evaluate(() => {
            const c = Object.values(window.__gmMenuCommands || {}).find((x) => /Browser cache/.test(x.name));
            if (!c) return false;
            c.callback();
            return true;
        });
        expect(viaMenu).toBe(true);
        await expect(row(page, 'images')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dlg(page)).toHaveCount(0);
        // A progress card with cache rows gets the action automatically.
        await page.evaluate(() => {
            const th = document.querySelector('table.tbl thead th');
            const b = document.createElement('button');
            b.id = 'aj-anchor'; b.textContent = '▶🧪'; b.dataset.mbAj = 'test';
            th.prepend(b);
            window.__saTest.asyncPop.register('test', {
                glyph: '🧪', label: 'Test job',
                snapshot: (scope, job) => ({ phase: job ? job.phase : 'idle', summary: 's', cache: [['Store', 'x']] }),
            });
            window.__saTest.asyncPop.start('test', document.querySelector('table.tbl'), { user: true, anchor: b });
        });
        await page.locator('#mb-async-pop [data-mb-aj-act="__idb"]').click();
        await expect(row(page, 'images')).toBeVisible();
        await expect(page.locator('#mb-async-pop')).toBeHidden();
    });
});
