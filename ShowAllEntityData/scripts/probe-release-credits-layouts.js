'use strict';

/**
 * What does a release page's `#bottom-credits` section hold in each of
 * MusicBrainz's two credit layouts (org/relationship-tables-pt.org, Step 1)?
 *
 *   node scripts/probe-release-credits-layouts.js <release-mbid>
 *
 * The release page carries a native `button#toggle-credits` ("Display
 * credits at bottom" / "Display credits inline"); its label names the layout
 * a click switches TO. This probe loads the page logged out, describes
 * `#bottom-credits` (direct children, their ids, headings, `table.details`
 * phrases) in the layout the page opens in, clicks the toggle, waits for the
 * label to flip, and describes it again. It also reports whether the choice
 * survives a reload (cookie or local storage), because a pageType that
 * depends on the layout would otherwise behave differently per user.
 *
 * Network: the page load that passes the browser check, one reload. Anonymous.
 */

const { chromium } = require('playwright');

const mbid = process.argv[2];

/**
 * Runs inside the page: the structure of #bottom-credits.
 *
 * @returns {Object}
 */
function describe() {
    const btn = document.querySelector('#toggle-credits');
    const bc = document.getElementById('bottom-credits');
    const out = { toggleLabel: btn ? btn.textContent.trim() : null, bottomCredits: null, inlineDlArs: document.querySelectorAll('table.tbl dl.ars').length };
    if (!bc) return out;
    out.bottomCredits = Array.from(bc.children).map(c => ({
        tag: c.tagName,
        id: c.id || '',
        cls: c.className || '',
        heading: (c.matches('h2, h3') ? c : c.querySelector(':scope > h2, :scope > h3'))?.textContent.replace(/\s+/g, ' ').trim() || '',
        details: Array.from(c.matches('table.details') ? [c] : c.querySelectorAll('table.details')).map(t =>
            Array.from(t.querySelectorAll('th')).map(th => th.textContent.trim()).join(' | ')),
        other: Array.from(c.querySelectorAll('ul, ol, table:not(.details)')).length
    }));
    return out;
}

(async () => {
    if (!mbid) throw new Error('usage: node scripts/probe-release-credits-layouts.js <release-mbid>');
    const url = `https://musicbrainz.org/release/${mbid}`;
    const browser = await chromium.launch();
    try {
        const page = await (await browser.newContext()).newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForSelector('#toggle-credits', { timeout: 60000 });
        await page.waitForTimeout(1500);
        const first = await page.evaluate(describe);
        console.log('LAYOUT A (as opened):', JSON.stringify(first, null, 1));
        await page.click('#toggle-credits');
        await page.waitForFunction(l => document.querySelector('#toggle-credits').textContent.trim() !== l, first.toggleLabel, { timeout: 20000 });
        await page.waitForTimeout(1500);
        console.log('LAYOUT B (after toggle):', JSON.stringify(await page.evaluate(describe), null, 1));
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('#toggle-credits', { timeout: 60000 });
        await page.waitForTimeout(1500);
        const after = await page.evaluate(describe);
        console.log(`AFTER RELOAD: toggle label "${after.toggleLabel}" (opened as "${first.toggleLabel}")`);
    } finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
