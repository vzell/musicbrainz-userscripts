'use strict';

/**
 * Check for scripts/probe-bb-history-xorigin.user.js (org/brucebase.org, Phase 15).
 *
 *   node scripts/check-probe-bb-history-xorigin.js
 *
 * Runs the probe's pure functions in Playwright's Chromium on planted
 * Wikidot answers — a revision list naming two made-up members with a
 * comment, a page source with a made-up line, a refusal — and asserts:
 *   1. the page id is read from WIKIREQUEST.info.pageId;
 *   2. the revision ids come out newest first;
 *   3. an accepted list reports its rows and member links by count;
 *   4. a source reports its line count;
 *   5. a refusal is not accepted and keeps Wikidot's message;
 *   6. the verdict: usable only when a cookie variant was accepted AND both
 *      controls were refused;
 *   7. the report never holds a member's name, the comment, a source line,
 *      a page id or a revision id.
 * Exit code 0 when all hold, 1 otherwise. No network.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
// PROBE_FILE points the check at a mutated copy, never at anything but a copy of the probe.
const PROBE = process.env.PROBE_FILE || path.join(ROOT, 'scripts', 'probe-bb-history-xorigin.user.js');

const MEMBERS = ['Zyxwer Editone', 'Qwvbn Ed'];
const COMMENT = 'fixed setlist for Zyxwer Editone';
const SOURCE_LINE = 'Plxqz unique source phrase';
const REV_IDS = ['7771234567', '7771234500'];
const PAGE_ID = '546367264';

/**
 * @returns {string} A made-up PageRevisionListModule answer.
 */
function revisionList() {
    const row = (id, n, who, comment) =>
        `<tr id="revision-row-${id}"><td>${n}.</td><td><span class="spantip">S</span></td>` +
        `<td><span class="printuser avatarhover"><a href="http://www.wikidot.com/user:info/x">${who}</a></span></td>` +
        `<td><span class="odate time_1760000000">12 Oct 2026</span></td><td>${comment}</td></tr>`;
    const body = `<table class="page-history">${row(REV_IDS[0], 2, MEMBERS[0], COMMENT)}${row(REV_IDS[1], 1, MEMBERS[1], '')}</table>` +
        '<div class="pager"><span class="pager-no">page 1 of 1</span></div>';
    return JSON.stringify({ status: 'ok', body });
}

/**
 * @returns {string} A made-up PageSourceModule answer.
 */
function source() {
    return JSON.stringify({ status: 'ok', body: `<h1>Page source</h1><div class="page-source">${SOURCE_LINE}<br />\nline two<br />\nline three</div>` });
}

/**
 * Runs the checks and prints one line per check.
 * @returns {Promise<number>} The exit code.
 */
async function main() {
    const browser = await chromium.launch();
    let failures = 0;
    try {
        const page = await browser.newPage();
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ content: fs.readFileSync(PROBE, 'utf8') });
        const out = await page.evaluate(({ list, src, pageId, comment }) => {
            const C = globalThis.__saedBbHistoryXoriginProbe;
            const refusal = JSON.stringify({ status: 'wrong_token7', message: `Wrong token for user info@example.org on page ${pageId}.` });
            const P = C.describeAnswer('', { http: 200, ms: 300, text: `<script>WIKIREQUEST.info.pageId = ${pageId};</script>` });
            const L = C.describeAnswer(C.LIST_MODULE, { http: 200, ms: 400, text: list });
            const S = C.describeAnswer(C.SOURCE_MODULE, { http: 200, ms: 200, text: src });
            const R = C.describeAnswer(C.LIST_MODULE, { http: 200, ms: 100, text: refusal });
            const H = C.describeAnswer(C.LIST_MODULE, { http: 403, ms: 50, text: '<html>Forbidden</html>' });
            const requests = [
                { variant: 'page', ...P },
                { variant: 'cookie header', ...L },
                { variant: 'cookie field', ...R },
                { variant: 'no cookie', ...R },
                { variant: 'cookie ≠ body', ...R },
                { variant: 'source, cookie header', ...S },
            ];
            const leaky = { requests, extra: { pageId, comment, ids: C.revisionIds(JSON.parse(list).body) } };
            return {
                pageId: C.pageIdOf(`<script>WIKIREQUEST.info.pageId = ${pageId};</script>`),
                ids: C.revisionIds(JSON.parse(list).body),
                P, L, S, R, H,
                v1: C.verdict(requests),
                v2: C.verdict(requests.map(r => (r.variant === 'no cookie' ? { ...r, ...L } : r))),
                v3: C.verdict(requests.map(r => (r.variant === 'cookie header' ? { ...r, ...R } : r))),
                json: C.report({ requests }),
                masked: C.report(leaky),
            };
        }, { list: revisionList(), src: source(), pageId: PAGE_ID, comment: COMMENT });

        const check = (ok, what) => {
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
            if (!ok) failures++;
        };
        check(out.pageId === PAGE_ID, `page id read (${out.pageId})`);
        check(out.P.pageId === 'digits', `the page's id reported as "digits" (${out.P.pageId})`);
        check(JSON.stringify(out.ids) === JSON.stringify(REV_IDS), `revision ids newest first (${JSON.stringify(out.ids)})`);
        check(out.L.accepted === true && out.L.revisionRows === 2 && out.L.memberLinks === 2 && out.L.pager === true,
            `accepted list by counts (${out.L.accepted}, rows ${out.L.revisionRows}, members ${out.L.memberLinks})`);
        check(out.S.accepted === true && out.S.pageSource === true && out.S.sourceLines === 3, `source lines counted (${out.S.sourceLines})`);
        check(out.R.accepted === false && out.R.status === 'wrong_token7' && /Wrong token/.test(out.R.message || ''), `refusal kept with its message (${out.R.status})`);
        check(!/example\.org/.test(out.R.message || '') && !(out.R.message || '').includes(PAGE_ID), `refusal message masked (${out.R.message})`);
        check(out.H.accepted === false && out.H.json === false && out.H.http === 403, `an HTML 403 is not accepted (${out.H.http})`);
        check(out.v1.usable === true && JSON.stringify(out.v1.accepted) === '["cookie header"]', `verdict usable with the header (${JSON.stringify(out.v1)})`);
        check(out.v2.usable === false && out.v2.acceptedControls.includes('no cookie'), `verdict not usable when a control is accepted (${JSON.stringify(out.v2)})`);
        check(out.v3.usable === false && out.v3.accepted.length === 0, `verdict not usable when no cookie variant is accepted (${JSON.stringify(out.v3)})`);
        for (const s of [...MEMBERS, COMMENT, SOURCE_LINE, 'line two', PAGE_ID, ...REV_IDS]) {
            check(!out.json.includes(s), `report never contains "${s}"`);
        }
        for (const s of [PAGE_ID, ...REV_IDS]) {
            check(!out.masked.includes(s), `the final mask removes id "${s}" even if a field leaked it`);
        }
        console.log(`\nreport ${out.json.length} chars`);
    } finally {
        await browser.close();
    }
    console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
    return failures ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(1); });
