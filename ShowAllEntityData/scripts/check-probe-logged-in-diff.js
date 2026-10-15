'use strict';

/**
 * Check for scripts/probe-logged-in-diff.user.js (org/springsteenlyrics.org,
 * "add support for logged in case", item 2).
 *
 *   node scripts/check-probe-logged-in-diff.js
 *
 * Runs the probe's pure functions in Playwright's Chromium (a real DOMParser;
 * there is no jsdom in this repo) on two pages built from one saved,
 * logged-out springsteenlyrics.com detail page:
 *   - "public": debug/detail-sl-collection-7431.html as saved;
 *   - "logged in": the same page with the log-in form replaced by a user menu
 *     naming a made-up user, and one planted block that holds that name, an
 *     e-mail address, a session-like id in a link, a long token and a form
 *     field with a private value.
 * Then it asserts what the probe must and must not report:
 *   1. login state: public 'out' (hTxtPassword), logged in 'in';
 *   2. the planted block is reported once, as a top-most block, with its
 *      heading as context, its field NAME and its link kind;
 *   3. none of the secrets appears anywhere in the report — name, e-mail,
 *      session id, token, the field's value;
 *   4. a Brucebase-style hyphenated page name survives redaction.
 * Exit code 0 when all hold, 1 otherwise. No network.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
// PROBE_FILE points the check at a mutated copy (mutation check), never at
// anything but a copy of the probe.
const PROBE = process.env.PROBE_FILE || path.join(ROOT, 'scripts', 'probe-logged-in-diff.user.js');
const PAGE = path.join(ROOT, 'debug', 'detail-sl-collection-7431.html');
const URL_ = 'https://www.springsteenlyrics.com/collection.php?item=7431&category=audioboot';

const USER = 'Zyxwer Testperson';
const SECRETS = [USER, 'zyx.test@example.org', 'S3ss10nAbcdefGhij12345', 'Tok3nZZ99887766aabbccddee', 'my private shelf note'];

/**
 * Builds the "logged in" variant of the saved page.
 * @param {string} html - The saved public page.
 * @returns {string} The variant.
 */
function loggedInVariant(html) {
    const form = /<form[^>]*name="login_form"[\s\S]*?<\/form>/;
    if (!form.test(html)) throw new Error('login_form not found in the saved page — the fixture changed');
    const menu = `<a href="#" class="dropdown-toggle">${USER}</a>` +
        '<ul class="dropdown-menu"><li><a href="logout.php">Log out</a></li></ul>';
    const block = '<div class="my-copy-box"><h4>My copy</h4>' +
        `<p>Owned by ${USER} (zyx.test@example.org), ref Tok3nZZ99887766aabbccddee</p>` +
        '<a href="mycollection.php?cmd=edit&amp;item=7431&amp;sid=S3ss10nAbcdefGhij12345">Edit my copy</a>' +
        '<textarea name="hNotes">my private shelf note</textarea></div>';
    const withMenu = html.replace(form, menu);
    const anchor = withMenu.indexOf('</body>');
    return withMenu.slice(0, anchor) + block + withMenu.slice(anchor);
}

/**
 * Runs the checks and prints one line per check.
 * @returns {Promise<number>} The exit code.
 */
async function main() {
    const pub = fs.readFileSync(PAGE, 'utf8');
    const mine = loggedInVariant(pub);
    const browser = await chromium.launch();
    let failures = 0;
    try {
        const page = await browser.newPage();
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ content: fs.readFileSync(PROBE, 'utf8') });
        const out = await page.evaluate(({ pub, mine, url }) => {
            const C = globalThis.__saedLoggedInProbe;
            const seen = new Set();
            const r = C.compare({ status: 200, html: pub }, { status: 200, html: mine }, { url, site: 'sl', terms: [], seen });
            return {
                result: r,
                json: C.report([r], { host: 'test' }, [...seen]),
                slug: C.redact('/gig:2025-03-26-carnegie-hall-new-york-city-ny', []),
            };
        }, { pub, mine, url: URL_ });

        const check = (ok, label) => {
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
            if (!ok) failures++;
        };
        const r = out.result;
        check(r.public.login.state === 'out', `public login state is 'out' (${r.public.login.state}, ${r.public.login.marker})`);
        check(r.loggedIn.login.state === 'in', `logged-in login state is 'in' (${r.loggedIn.login.state}, ${r.loggedIn.login.marker})`);
        check(r.userNameDetected === true, `user name detected past an icon-only toggle (${r.userNameDetected})`);
        const planted = r.onlyLoggedIn.filter(b => /my-copy-box/.test(b.path));
        check(planted.length === 1, `planted block reported once as top-most (${planted.length})`);
        const b = planted[0] || {};
        check(b.context === 'My copy' || /My copy/.test(b.text || ''), `planted block carries its heading (${b.context})`);
        check((b.fields || []).some(f => /hNotes/.test(f)), `field NAME reported (${JSON.stringify(b.fields)})`);
        check(Object.keys(b.links || {}).some(k => /^mycollection\.php cmd=edit \?cmd,item,sid$/.test(k)),
            `link kind keeps script, cmd and parameter names only (${JSON.stringify(b.links)})`);
        for (const s of SECRETS) check(!out.json.includes(s), `report never contains "${s}"`);
        check(out.slug === '/gig:2025-03-26-carnegie-hall-new-york-city-ny', `hyphenated page name survives redaction (${out.slug})`);
        console.log(`\n${r.onlyLoggedIn.length} logged-in-only block(s), report ${out.json.length} chars`);
    } finally {
        await browser.close();
    }
    console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
    return failures ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(1); });
