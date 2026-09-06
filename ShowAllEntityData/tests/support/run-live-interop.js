'use strict';

/**
 * Live third-party-userscript interop harness — standalone Node script (not
 * a Playwright test, and not part of the CI-safe suite). Opens a REAL
 * musicbrainz.org page with a chosen combination of your own real,
 * gitignored Tampermonkey scripts (`tests/fixtures/live-userscripts/`, see
 * its README.md) injected alongside ShowAllEntityData, so you can see how
 * they actually interact — visually, and optionally via an automated diff
 * against the committed snapshot baseline.
 *
 * There is no pass/fail here by design: a third-party script's own behavior
 * isn't this repo's to assert correct or incorrect. This is a debugging
 * aid, not a regression gate — see `tests/support/thirdPartyScripts.js` /
 * `tests/live/third-party-*.spec.js` for the actual committed regression
 * tests, which each target ONE verified DOM side-effect at a time rather
 * than a real script's full behavior.
 *
 *   node tests/support/run-live-interop.js --pagetype release-tracks --combo jesus2099-only
 *   node tests/support/run-live-interop.js --pagetype release-tracks --combo kitchen-sink --diff
 *   node tests/support/run-live-interop.js --url <live-url> --show-all-button 'button[data-label="..."]' --scripts jesus2099-supermind
 *   node tests/support/run-live-interop.js --pagetype release-tracks   # no combo/scripts — clean baseline, no third-party scripts loaded
 *
 * Leaves the browser open for visual inspection until you close its window
 * (or Ctrl+C the process) — pass --headless to skip that and exit as soon
 * as the (optional) --diff report is printed.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadUserscriptPage } = require('./loadPage');
const { waitForRenderComplete } = require('./browser');
const { captureRendered, scrub, diffSummary } = require('./snapshot');
const { seedGmValues } = require('./gmStubs');
const { authStorageState } = require('./authState');
const { dismissCustomConfirmDialog } = require('./customDialog');
const { collectPageErrors } = require('./liveAssertions');
const { loadManifest, resolveScripts, injectLiveUserscripts } = require('./liveUserscripts');

const PAGETYPES_PATH = path.join(__dirname, '..', 'pagetypes.json');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');

/**
 * @param {string[]} argv - `process.argv.slice(2)`
 * @returns {{ pageType: string|null, url: string|null, showAllButton: string|null, combo: string|null, scripts: string[]|null, diff: boolean, headless: boolean }}
 */
function parseArgs(argv) {
    const arg = (flag) => {
        const found = argv.find((a) => a.startsWith(`${flag}=`));
        return found ? found.slice(flag.length + 1) : null;
    };
    const scriptsArg = arg('--scripts');
    return {
        pageType: arg('--pagetype'),
        url: arg('--url'),
        showAllButton: arg('--show-all-button'),
        combo: arg('--combo'),
        scripts: scriptsArg ? scriptsArg.split(',').map((s) => s.trim()).filter(Boolean) : null,
        diff: argv.includes('--diff'),
        headless: argv.includes('--headless'),
    };
}

/**
 * Resolves CLI args into a page config shaped like a `tests/pagetypes.json`
 * entry — either read straight from that file (`--pagetype`) or built
 * manually from `--url`/`--show-all-button` for a page not registered
 * there yet.
 *
 * @param {ReturnType<parseArgs>} args
 * @returns {{ pageType: string, url: string, showAllButtonSelector: string } & Object}
 */
function resolveConfig({ pageType, url, showAllButton }) {
    if (pageType) {
        const allConfigs = JSON.parse(fs.readFileSync(PAGETYPES_PATH, 'utf8'));
        const config = allConfigs.find((c) => c.pageType === pageType);
        if (!config) {
            throw new Error(`Unknown --pagetype "${pageType}" — not in ${PAGETYPES_PATH}. Known: ${allConfigs.map((c) => c.pageType).join(', ')}`);
        }
        return config;
    }
    if (!showAllButton) {
        throw new Error('--url requires --show-all-button <selector> too (no tests/pagetypes.json entry to read it from).');
    }
    return { pageType: '(manual)', url, showAllButtonSelector: showAllButton };
}

(async () => {
    const args = parseArgs(process.argv.slice(2));

    if (args.combo && args.scripts) {
        throw new Error('Pass either --combo or --scripts, not both.');
    }
    if (!args.pageType && !args.url) {
        throw new Error('Pass --pagetype=<name> (from tests/pagetypes.json) or --url=<live-url> --show-all-button=<selector>.');
    }
    if (args.diff && !args.pageType) {
        throw new Error('--diff needs --pagetype (it compares against tests/snapshots/<pageType>/rendered.html).');
    }

    const config = resolveConfig(args);

    const manifest = loadManifest();
    const entries = (args.combo || args.scripts) ? resolveScripts(manifest, { combo: args.combo, ids: args.scripts }) : [];
    console.log(entries.length
        ? `Injecting: ${entries.map((e) => e.id).join(', ')}`
        : 'No third-party scripts selected — clean ShowAllEntityData-only run (pass --combo=<name> or --scripts=id1,id2 to add some).');

    const initEntries = entries.filter((e) => e.when === 'init');
    const nowEntries = entries.filter((e) => e.when !== 'init');

    const browser = await chromium.launch({ headless: args.headless });
    const context = await browser.newContext(authStorageState({ label: 'run-live-interop' }));
    const page = await context.newPage();
    const pageErrors = collectPageErrors(page);

    await injectLiveUserscripts(page, initEntries);
    await seedGmValues(page, config.seedGmValues);
    await loadUserscriptPage(page, { url: config.url, testMode: true });

    const showAllBtn = page.locator(config.showAllButtonSelector);
    await showAllBtn.waitFor({ state: 'visible', timeout: 15000 });
    await showAllBtn.click();
    await dismissCustomConfirmDialog(page);
    await waitForRenderComplete(page, {
        hasCaaOrEaa: config.hasCaaOrEaa,
        hasRelationships: config.hasRelationships,
        waitForAutoResize: config.waitForAutoResize,
        timeout: config.renderTimeout || 90000,
    });

    await injectLiveUserscripts(page, nowEntries);
    // Give a 'now' script's own async side effects (the whole point of
    // simulating one that finishes after ShowAllEntityData already
    // rendered) a moment to actually land before diffing/inspecting.
    await page.waitForTimeout(1000);

    if (pageErrors.length) {
        console.log(`\nPage errors (${pageErrors.length}) — may be a real script's own unstubbed GM_* API, see tests/support/gmStubs.js:`);
        pageErrors.forEach((e) => console.log(`  ${e}`));
    }

    if (args.diff) {
        const renderedHtml = scrub(await captureRendered(page), config.pageType);
        const baselinePath = path.join(SNAPSHOTS_DIR, config.pageType, 'rendered.html');
        if (!fs.existsSync(baselinePath)) {
            console.log(`\nNo baseline at ${baselinePath} yet — run "node tests/support/capture-snapshots.js --only=${config.pageType}" first.`);
        } else {
            const summary = diffSummary(fs.readFileSync(baselinePath, 'utf8'), renderedHtml);
            if (summary.identical) {
                console.log('\nDiff: identical to the committed clean baseline — no structural interop effect detected.');
            } else {
                console.log(`\nDiff: differs from the clean baseline starting at line ${summary.firstDiffLine}:`);
                summary.preview.forEach((line) => console.log(`  ${line}`));
            }
        }
    }

    if (args.headless) {
        await context.close();
        await browser.close();
        return;
    }

    console.log('\nBrowser left open for inspection — close its window (or Ctrl+C this process) when done.');
    await page.waitForEvent('close', { timeout: 0 });
    await browser.close();
})().catch((err) => {
    console.error('run-live-interop failed:', err);
    process.exit(1);
});
