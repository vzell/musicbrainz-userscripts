'use strict';

/**
 * How many Cover Art Archive METADATA requests end in 404 — i.e. how many
 * requests a `cover-art-archive.count: 0` hint from WS/2 could have skipped?
 *
 * Standalone Node script (not a Playwright test), run directly:
 *
 *   node tests/support/measure-caa-metadata-404s.js
 *   node tests/support/measure-caa-metadata-404s.js --only=bodeans-releases
 *
 * This is step 1 of the plan to seed `ctx.countCache` from the WS/2 release
 * block (PERFORMANCE candidate; see tests/MEASUREMENTS.org 2026-09-18 for the
 * probe that showed the block is accurate). It is a GATE: if few metadata
 * requests are 404s on the pages this script actually renders, the change
 * saves nothing and should not be built.
 *
 * What is counted: page-side `fetch()` calls to
 * `https://{coverartarchive,eventartarchive}.org/{release,release-group,event}/<guid>`
 * — `_artEnrichIcon()`'s Tier 3 (and the big-image strip's own lookups, if it
 * makes any). NOT counted: image bytes, which travel through the exposed
 * `__realGmFetch` (Playwright's APIRequestContext) and are not observable as
 * page requests. Images only exist for count > 0, so a count-0 hint could
 * never have skipped them anyway.
 *
 * Each request is classified by the FINAL response of its redirect chain,
 * because a hit redirects to archive.org (`307`) and a miss answers 404. The
 * script also records requests with no response (failed), which are excluded
 * from the 404 share rather than counted as either.
 *
 * Preconditions taken from CLAUDE.md's artwork-test rules, each of which
 * otherwise makes a run measure almost nothing while looking clean:
 *   - every sub-table is expanded BEFORE measuring, and that is asserted;
 *   - the big-image strips are uncollapsed via `#mb-caa-toggle-btn-global`;
 *   - "settled" means the metadata request count stopped changing, never a
 *     fixed sleep, and never `waitForCaaEaaComplete()` (its toast does not
 *     fire on a big page).
 *
 * Output: a table on stdout and a JSON file in `tests/snapshots/caa-404-share/`
 * carrying the `machine` block and UTC `startedAt`/`finishedAt`, per the
 * project rule that every timing/measurement names its host and time.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPageWithRealNetwork } = require('./realNetworkGmXhr');
const { machineInfo } = require('./runMetadata');

const META_URL = /^https:\/\/(?:coverartarchive|eventartarchive)\.org\/(release|release-group|event)\/[0-9a-f-]{36}\/?$/;
const SETTLE_QUIET_MS = 30000;
const SETTLE_MAX_MS = 15 * 60 * 1000;
const POLL_MS = 3000;

/**
 * One measurement target.
 * `pathClass` records which extractor path the page's CAA cell takes, which is
 * the variable this whole question turns on.
 */
const TARGETS = [
    {
        id: 'rg-releases-greetings',
        pageType: 'releasegroup-releases',
        tableMode: 'multi',
        pathClass: 'native markup (expected Path A/B)',
        url: 'https://musicbrainz.org/release-group/f83d2211-dd81-4b1e-9a02-e89733891e1c',
        button: 'button[data-label="Show all Releases for ReleaseGroup"]',
        title: 'Greetings From Asbury Park, N.J. (release group, ~124 releases)',
    },
    {
        id: 'bodeans-releases',
        pageType: 'artist-releases',
        tableMode: 'single',
        pathClass: 'native markup (expected Path A/B)',
        url: 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases',
        button: 'button[data-label="🧮 Artist releases"]',
        title: 'BoDeans - releases (~56 rows)',
    },
    {
        id: 'bodeans-relationships',
        pageType: 'artist-relationships',
        tableMode: 'multi',
        pathClass: 'no native icon (expected Path C, synthetic anchors)',
        url: 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/relationships',
        button: 'button[data-label="Show all Relationships for Artist"]',
        title: 'BoDeans - relationships overview',
    },
];

/**
 * Expands every sub-table (multi pages) without ever collapsing an expanded one.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{total: number, hidden: number}>}
 */
async function expandAll(page) {
    const toggle = page.locator('.mb-master-toggle');
    if (await toggle.count() === 0) return { total: await page.locator('table.tbl').count(), hidden: 0 };
    const hidden = () => page.evaluate(() =>
        Array.from(document.querySelectorAll('table.tbl')).filter((t) => t.offsetParent === null).length);
    if ((await toggle.getAttribute('data-state')) === 'collapsed') await toggle.click();
    if (await hidden() > 0) {        // the flag lies; force a full cycle
        await toggle.click();
        await toggle.click();
    }
    return { total: await page.locator('table.tbl').count(), hidden: await hidden() };
}

/**
 * Measures one target end to end.
 * @param {import('@playwright/test').Browser} browser
 * @param {Object} t  An entry of TARGETS.
 * @returns {Promise<Object>} the result row
 */
async function measure(browser, t) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const startedAt = new Date().toISOString();
    const roots = new Map();          // root request URL -> { entity, status }
    let lastChange = Date.now();

    page.on('response', (resp) => {
        const req = resp.request();
        if (req.redirectedTo()) return;                  // an intermediate hop
        let root = req;
        while (root.redirectedFrom()) root = root.redirectedFrom();
        const m = META_URL.exec(root.url());
        if (!m) return;
        roots.set(root.url(), { entity: m[1], status: resp.status() });
        lastChange = Date.now();
    });
    page.on('requestfailed', (req) => {
        let root = req;
        while (root.redirectedFrom()) root = root.redirectedFrom();
        const m = META_URL.exec(root.url());
        if (!m) return;
        roots.set(root.url(), { entity: m[1], status: 'failed' });
        lastChange = Date.now();
    });

    await loadUserscriptPageWithRealNetwork(page, {
        url: t.url,
        testMode: true,
        // Never let a threshold dialog stall the run (CLAUDE.md, "Threshold dialogs").
        settingsOverride: { sa_render_threshold: 1000000, sa_render_warning_threshold: 1000000, sa_max_page: 1000 },
    });

    const btn = page.locator(t.button);
    await btn.waitFor({ state: 'visible', timeout: 60000 });
    // What MusicBrainz ITSELF rendered on the first native page, before this
    // script rewrites anything (the caa extractor deletes `span.blank-icon`).
    const nativeCensus = await page.evaluate(() => ({
        rows: document.querySelectorAll('table.tbl tbody tr').length,
        caaAnchors: document.querySelectorAll('table.tbl a[href$="/cover-art"] span.caa-icon').length,
        blankIcons: document.querySelectorAll('table.tbl span.blank-icon').length,
    }));
    await btn.click();
    await page.locator('#mb-filter-container').waitFor({ state: 'visible', timeout: 10 * 60 * 1000 });

    const expanded = await expandAll(page);
    const globalBtn = page.locator('#mb-caa-toggle-btn-global');
    // The strip button is built late; wait for it rather than sampling once.
    const stripToggled = await globalBtn.waitFor({ state: 'visible', timeout: 60000 }).then(() => true, () => false);
    if (stripToggled) await globalBtn.click();

    const census = await page.evaluate(() => ({
        rows: document.querySelectorAll('table.tbl tbody tr').length,
        caaIcons: document.querySelectorAll('table.tbl span.caa-icon').length,
        caaIconsPainted: Array.from(document.querySelectorAll('table.tbl span.caa-icon'))
            .filter((i) => /url\(/.test(i.style.backgroundImage || '')).length,
        blankIcons: document.querySelectorAll('table.tbl span.blank-icon').length,
        syntheticAnchors: document.querySelectorAll('a[data-caa-synthetic="1"]').length,
        bigboxWrappers: document.querySelectorAll('.mb-caa-bigbox a[data-caa-href]').length,
    }));

    // Settle: no NEW metadata request for SETTLE_QUIET_MS, and at least one seen.
    lastChange = Date.now();
    const settleStart = Date.now();
    while (Date.now() - settleStart < SETTLE_MAX_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (roots.size > 0 && Date.now() - lastChange >= SETTLE_QUIET_MS) break;
    }
    const settled = roots.size > 0 && Date.now() - lastChange >= SETTLE_QUIET_MS;

    const byStatus = {};
    const byEntity = {};
    for (const { entity, status } of roots.values()) {
        const bucket = status === 404 ? '404' : (status === 'failed' ? 'failed' : (status >= 500 ? '5xx' : 'ok(' + status + ')'));
        byStatus[bucket] = (byStatus[bucket] || 0) + 1;
        byEntity[entity] = byEntity[entity] || { total: 0, n404: 0 };
        byEntity[entity].total++;
        if (status === 404) byEntity[entity].n404++;
    }
    const total = roots.size;
    const n404 = byStatus['404'] || 0;
    await context.close();

    return {
        id: t.id, pageType: t.pageType, tableMode: t.tableMode, title: t.title, pathClass: t.pathClass, url: t.url,
        nativeCensus, expanded, stripToggled, census, settled,
        metadataRequests: total, n404, share404: total ? +(n404 / total).toFixed(3) : null,
        byStatus, byEntity,
        startedAt, finishedAt: new Date().toISOString(),
    };
}

/**
 * Entry point.
 * @returns {Promise<void>}
 */
async function main() {
    const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
    const targets = TARGETS.filter((t) => !only || t.id === only);
    const startedAt = new Date().toISOString();
    const browser = await chromium.launch();
    const results = [];
    for (const t of targets) {
        console.log(`\n== ${t.id} (${t.pageType}, ${t.tableMode}) ==`);
        try {
            const r = await measure(browser, t);
            results.push(r);
            console.log(JSON.stringify(r, null, 2));
        } catch (e) {
            console.log('FAILED:', e && e.message);
            results.push({ id: t.id, pageType: t.pageType, error: String(e && e.message) });
        }
    }
    await browser.close();

    const outDir = path.join(__dirname, '..', 'snapshots', 'caa-404-share');
    fs.mkdirSync(outDir, { recursive: true });
    const machine = machineInfo();
    const stamp = startedAt.slice(0, 10);
    const file = path.join(outDir, `caa-404-share-${stamp}${only ? '-' + only : ''}${machine.hostname ? '-' + machine.hostname : ''}.json`);
    fs.writeFileSync(file, JSON.stringify({ machine, startedAt, finishedAt: new Date().toISOString(), results }, null, 2));

    console.log('\nid                          rows  metaReqs  404s  share   settled');
    for (const r of results) {
        if (r.error) { console.log(`${r.id.padEnd(27)} ERROR ${r.error}`); continue; }
        console.log(`${r.id.padEnd(27)} ${String(r.census.rows).padStart(4)}  ${String(r.metadataRequests).padStart(8)}  ` +
            `${String(r.n404).padStart(4)}  ${String(r.share404).padStart(5)}   ${r.settled}`);
    }
    console.log('\nwrote', file);
}

main().catch((e) => { console.error(e); process.exit(1); });
