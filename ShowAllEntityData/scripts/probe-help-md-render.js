'use strict';

/**
 * Probe: what does ShowAllEntityData_HELP.md actually look like once the ❓
 * dialog's Markdown renderer has been through it?
 *
 * `tests/fixtures/app-help-github-and-markdown.spec.js` proves the renderer
 * handles every construct the file uses. It cannot tell you whether the RESULT
 * reads well — whether a section came out as one wall of text, whether a table
 * lost its shape, whether something rendered correctly but pointlessly. This
 * dumps the rendered element tree so that can be read.
 *
 * Structure only by default; `--text` adds each block's text, which is what to
 * use when reviewing an edit to the help file itself.
 *
 *   node scripts/probe-help-md-render.js
 *   node scripts/probe-help-md-render.js --text
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { loadUserscriptPage } = require('../tests/support/loadPage');

const URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/recordings';
const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'uniq-drop-viewport-clip.html');
const HELP_MD = path.join(__dirname, '..', 'ShowAllEntityData_HELP.md');
const HELP_URL = 'https://raw.githubusercontent.com/vzell/mb-userscripts/master/ShowAllEntityData_HELP.md';

(async () => {
    const withText = process.argv.includes('--text');
    const md = fs.readFileSync(HELP_MD, 'utf8');

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript({ content: `
        window.__gmXhrResponses = {
            ${JSON.stringify(HELP_URL)}: { status: 200, responseText: ${JSON.stringify(md)} },
        };
    ` });
    const page = await context.newPage();

    await loadUserscriptPage(page, { url: URL, fixtureFile: FIXTURE, testMode: true });
    await page.waitForSelector('#mb-app-help-btn');
    await page.locator('#mb-app-help-btn').click({ modifiers: ['Shift'] });
    await page.waitForSelector('#mb-app-help-body .mb-md-h1', { timeout: 5000 });

    const report = await page.evaluate((showText) => {
        const body = document.getElementById('mb-app-help-body');
        const out = [];
        const walk = (el, depth) => {
            for (const child of el.children) {
                const tag = child.tagName.toLowerCase();
                let note = '';
                if (tag === 'table') {
                    note = `${child.querySelectorAll('thead th').length} cols x `
                         + `${child.querySelectorAll('tbody tr').length} rows`;
                } else if (tag === 'ul' || tag === 'ol') {
                    note = `${child.children.length} items`;
                } else if (tag === 'details') {
                    const s = child.querySelector('summary');
                    note = (child.open ? 'open' : 'CLOSED') + ' — ' + (s ? s.textContent : '(no summary)');
                } else if (tag === 'pre') {
                    note = `${child.textContent.split('\n').length} lines`;
                } else if (showText) {
                    note = child.textContent.replace(/\s+/g, ' ').slice(0, 110);
                }
                out.push('  '.repeat(depth) + tag.padEnd(8) + ' ' + note);
                if (tag === 'details') walk(child, depth + 1);
            }
        };
        walk(body, 0);
        return {
            lines: out,
            counts: {
                h1: body.querySelectorAll('h1').length,
                h2: body.querySelectorAll('h2').length,
                h3: body.querySelectorAll('h3').length,
                tables: body.querySelectorAll('table').length,
                details: body.querySelectorAll('details').length,
                pre: body.querySelectorAll('pre').length,
                links: body.querySelectorAll('a').length,
                anchors: body.querySelectorAll('a[href^="#"]').length,
                chars: body.innerText.length,
            },
        };
    }, withText);

    console.log(report.lines.join('\n'));
    console.log('\n--- totals ---');
    for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k.padEnd(9)} ${v}`);

    await browser.close();
})();
