'use strict';

/**
 * Check for scripts/probe-bb-history.user.js (org/brucebase.org, Phase 6).
 *
 *   node scripts/check-probe-bb-history.js
 *
 * Runs the probe's pure functions in Playwright's Chromium (a real
 * DOMParser; there is no jsdom in this repo) on planted Wikidot answers —
 * a revision list naming two made-up members with a comment that names one
 * of them, a page source and an inline diff whose lines hold a made-up
 * phrase — and asserts:
 *   1. the page id is read from WIKIREQUEST.info.pageId;
 *   2. the revision ids come out newest first, from the from/to radios;
 *   3. the list's cells read as kinds (number, flags, user, odate, comment
 *      length, radios, the action handlers with digits as N);
 *   4. the source's line count and the diff's marks are counted;
 *   5. the report never holds a member's name, the comment, a source line,
 *      the diff's text, or a revision id;
 *   6. a refused answer ("no_permission") reports its status and message.
 * Exit code 0 when all hold, 1 otherwise. No network.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
// PROBE_FILE points the check at a mutated copy, never at anything but a copy of the probe.
const PROBE = process.env.PROBE_FILE || path.join(ROOT, 'scripts', 'probe-bb-history.user.js');

const MEMBERS = ['Zyxwer Editone', 'Qwvbn Ed'];
const COMMENT = 'fixed setlist for Zyxwer Editone';
const SOURCE_LINE = 'Plxqz unique source phrase';
const DIFF_TEXT = 'Vrmnt unique diff phrase';
const REV_IDS = ['7771234567', '7771234500'];

/**
 * A made-up revision list in the shape Wikidot's PageRevisionListModule is
 * expected to send (the probe reports the real one).
 * @returns {string} The JSON answer.
 */
function revisionList() {
    const row = (id, n, flags, who, comment) =>
        `<tr id="revision-row-${id}"><td>${n}.</td>` +
        `<td><input type="radio" name="from" value="${id}"/><input type="radio" name="to" value="${id}"/></td>` +
        `<td><span class="spantip" title="content source text changed">${flags}</span></td>` +
        `<td><a href="javascript:;" onclick="WIKIDOT.modules.PageHistoryModule.listeners.showVersion(event,${id})">V</a> ` +
        `<a href="javascript:;" onclick="WIKIDOT.modules.PageHistoryModule.listeners.showSource(event,${id})">S</a></td>` +
        `<td><span class="printuser avatarhover"><a href="http://www.wikidot.com/user:info/x">${who}</a></span></td>` +
        `<td><span class="odate time_1760000000 format_%25e%20%25b%20%25Y">12 Oct 2026</span></td>` +
        `<td>${comment}</td></tr>`;
    const body = '<table class="page-history"><tr><td>rev.</td><td></td><td>flags</td><td>actions</td><td>by</td><td>date</td><td>comments</td></tr>' +
        row(REV_IDS[0], 2, 'S', MEMBERS[0], COMMENT) + row(REV_IDS[1], 1, 'N', MEMBERS[1], '') + '</table>' +
        '<div class="pager"><span class="pager-no">page 1 of 1</span></div>';
    return JSON.stringify({ status: 'ok', body, CURRENT_TIMESTAMP: 1760000000, jsInclude: [], cssInclude: [] });
}

/**
 * @returns {string} A made-up PageSourceModule answer.
 */
function source() {
    return JSON.stringify({ status: 'ok', body: `<h1>Page source</h1><div class="page-source">${SOURCE_LINE}<br />\nline two<br />\nline three</div>` });
}

/**
 * @returns {string} A made-up PageDiffModule answer.
 */
function diff() {
    return JSON.stringify({ status: 'ok', body: `<div class="diff-box"><ins>${DIFF_TEXT}</ins> kept <del>${DIFF_TEXT}</del></div>` });
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
        const out = await page.evaluate(({ list, src, dif, members }) => {
            const C = globalThis.__saedBbHistoryProbe;
            const L = C.describeAnswer({ http: 200, ms: 5, text: list });
            const S = C.describeAnswer({ http: 200, ms: 5, text: src });
            const D = C.describeAnswer({ http: 200, ms: 5, text: dif });
            const R = C.describeAnswer({ http: 200, ms: 5, text: JSON.stringify({ status: 'no_permission', message: 'You are not allowed to view the history.' }) });
            const result = { requests: [L.out, S.out, D.out, R.out] };
            return {
                pageId: C.pageIdOf('<script>WIKIREQUEST.info.pageId = 546367264;</script>'),
                ids: C.revisionIds(L.root),
                list: L.out,
                src: S.out,
                dif: D.out,
                refused: R.out,
                json: C.report(result, []),
                members,
            };
        }, { list: revisionList(), src: source(), dif: diff(), members: MEMBERS });

        const check = (ok, what) => {
            console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
            if (!ok) failures++;
        };
        check(out.pageId === '546367264', `page id read (${out.pageId})`);
        check(JSON.stringify(out.ids) === JSON.stringify(REV_IDS), `revision ids newest first (${JSON.stringify(out.ids)})`);
        const t = (out.list.tables || [])[0] || {};
        check(t.rows === 2, `two revision rows (${t.rows})`);
        const kinds = (t.firstRows || [])[0] || [];
        check(kinds[0] === 'number', `rev cell is a number (${kinds[0]})`);
        check(/radio:from=digits/.test(kinds[1] || '') && /radio:to=digits/.test(kinds[1] || ''), `radios read by name (${kinds[1]})`);
        check(kinds[2] === 'flags:S', `flags cell (${kinds[2]})`);
        check(/showVersion\(event,N\)/.test(kinds[3] || '') && /a\[S\]/.test(kinds[3] || ''), `action handlers with digits as N (${kinds[3]})`);
        check(kinds[4] === 'user', `member cell is "user" (${kinds[4]})`);
        check(/^odate\(time_N\)/.test(kinds[5] || ''), `date cell is an odate (${kinds[5]})`);
        check(kinds[6] === `text(${COMMENT.length})`, `comment by length only (${kinds[6]})`);
        check(out.src.text.sourceLines === 3 && out.src.text.brCount === 2, `source lines counted (${out.src.text.sourceLines}, br ${out.src.text.brCount})`);
        check(out.dif.text.marks.ins === 1 && out.dif.text.marks.del === 1, `diff marks counted (${JSON.stringify(out.dif.text.marks)})`);
        check(out.refused.status === 'no_permission' && /not allowed/.test(out.refused.message || ''), `refusal reported (${out.refused.status})`);
        for (const s of [...out.members, COMMENT, SOURCE_LINE, DIFF_TEXT, ...REV_IDS, 'line two']) {
            check(!out.json.includes(s), `report never contains "${s}"`);
        }
        console.log(`\nreport ${out.json.length} chars`);
    } finally {
        await browser.close();
    }
    console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
    return failures ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(1); });
