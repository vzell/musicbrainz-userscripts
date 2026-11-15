#!/usr/bin/env node
'use strict';

/**
 * Track A batch 3 (org/bbp-parity.org): is the Python probe's port of
 * BruceBaseParser's expected-tags rule the rule BruceBaseParser really runs?
 *
 * Takes BruceBaseParser's OWN functions out of its userscript by name
 * (computeExpectedTags() and what it calls, isTagPresent(), isManagedTag(),
 * extractEventDaySuffix(), the icon readers), runs them in Chromium on every
 * event page of the mirror, and compares, per event:
 *   1. the expected tags (without the tour tags, which the probe adds from
 *      checkEventTourTags() and this script leaves out),
 *   2. which of the page's own tags are "managed" and not expected.
 * with the probe's rows (scripts/probe-bb-batch3-findings.py --rows FILE).
 *
 * The date is the probe's (the page title's); BruceBaseParser takes it from
 * the year page's link, which the probe found equal on every page.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bbp-tag-oracle.js ROWS.json [--mirror DIR] [--bbp FILE] [--families date,letter,type,prem]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const ROWS = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
/**
 * The value after a flag, or a default.
 *
 * @param {string} flag - "--mirror".
 * @param {string} dflt - The default.
 * @returns {string} The value.
 */
function opt(flag, dflt) {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : dflt;
}
const MIRROR = fs.realpathSync(opt('--mirror', path.join(os.homedir(), 'git/scripts/BruceParser/bb/latest')));
const BBP = opt('--bbp', path.join(os.homedir(), 'git/userscripts/BruceBaseParser/BruceBaseParser.user.js'));
const FAMILIES = opt('--families', '').split(',').filter(Boolean);

const CONSTS = ['SORRY_RE', 'MONTH_NAMES', 'DAY_NAMES', 'MANAGED_CONTENT_TAGS', 'TOUR_DEFINITIONS',
    'TOUR_TAG_SET', 'TOUR_NO_TAG'];
const FUNCS = ['buildTabMap', 'getTabEl', 'getNewsMemTab', 'isLiveDLSplit', 'getSetlistContainer',
    'countTourPremiereSongs', 'computeTourPremiereTagValue', 'hasUnderConstructionBanner',
    'extractPageNotes', 'extractPageNotesText', 'computeExpectedTags', 'isTagPresent', 'isManagedTag',
    'extractEventDaySuffix', 'hasHelpIcon', 'hasFeaturedIcon'];

/**
 * The text of a declaration from its start to the end of its balanced
 * braces or brackets (strings, templates, comments and regex literals after
 * "(" , "," , "=" , ":" or "!" are skipped).
 *
 * @param {string} src - The userscript.
 * @param {number} start - Where the declaration starts.
 * @param {boolean} toSemicolon - A const: read on to the ";" at depth 0.
 * @returns {string} The declaration.
 */
function balanced(src, start, toSemicolon) {
    let depth = 0;
    let seen = false;
    let prev = '';
    for (let i = start; i < src.length; i++) {
        const c = src[i];
        const two = src.substr(i, 2);
        if (two === '//') { i = src.indexOf('\n', i); continue; }
        if (two === '/*') { i = src.indexOf('*/', i) + 1; continue; }
        if (c === '"' || c === "'" || c === '`') {
            for (i++; src[i] !== c; i++) if (src[i] === '\\') i++;
            prev = c;
            continue;
        }
        if (c === '/' && '(,=:!&|?{};\n'.includes(prev)) {
            let cls = false;
            for (i++; cls || src[i] !== '/'; i++) {
                if (src[i] === '\\') i++;
                else if (src[i] === '[') cls = true;
                else if (src[i] === ']') cls = false;
            }
            prev = '/';
            continue;
        }
        if (c === '{' || c === '[' || c === '(') { depth++; seen = true; }
        if (c === '}' || c === ']' || c === ')') depth--;
        if (!toSemicolon && seen && depth === 0 && c === '}') return src.slice(start, i + 1);
        if (toSemicolon && depth === 0 && c === ';') return src.slice(start, i + 1);
        if (!/\s/.test(c)) prev = c;
    }
    throw new Error('unbalanced declaration at ' + start);
}

/**
 * BruceBaseParser's own declarations, as one script.
 *
 * @returns {string} JavaScript defining the constants and functions.
 */
function bbpCode() {
    const src = fs.readFileSync(BBP, 'utf8');
    const out = [];
    for (const name of CONSTS) {
        const m = new RegExp('^  const ' + name + '\\s*=', 'm').exec(src);
        if (!m) throw new Error('BruceBaseParser has no const ' + name);
        out.push(balanced(src, m.index, true));
    }
    for (const name of FUNCS) {
        const m = new RegExp('^  (?:async )?function ' + name + '\\(', 'm').exec(src);
        if (!m) throw new Error('BruceBaseParser has no function ' + name);
        out.push(balanced(src, m.index, false));
    }
    return out.join('\n\n');
}

/**
 * The mirror's file of a page name ("gig:1985-01-13-…").
 *
 * @param {string} name - The page name.
 * @returns {string} The file.
 */
function fileOf(name) {
    const i = name.indexOf(':');
    const cat = name.slice(0, i);
    return path.join(MIRROR, cat, cat + '_' + name.slice(i + 1) + '.html');
}

/**
 * The family the probe gives a tag BruceBaseParser expects.
 *
 * @param {string} tag - The tag.
 * @param {Object} row - The probe's row.
 * @returns {string} The family, or '?'.
 */
function familyOf(tag, row) {
    return row.expected[tag] || '?';
}

(async () => {
    if (!ROWS) {
        console.error('usage: node scripts/check-bbp-tag-oracle.js ROWS.json [--mirror DIR] [--bbp FILE] [--families a,b]');
        process.exit(2);
    }
    const rows = JSON.parse(fs.readFileSync(ROWS, 'utf8'));
    const code = bbpCode();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.evaluate(src => {
        // BruceBaseParser logs through these
        window.log = () => {};
        window.logWarn = () => {};
        (0, eval)(src + `
            window.__bbp = function (html, name, date, helpYear, featYear) {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const tabMap = buildTabMap(doc);
                const type = name.slice(0, name.indexOf(':'));
                const hasHelp = helpYear || hasHelpIcon(doc);
                const hasFeatured = featYear || hasFeaturedIcon(doc);
                const expected = computeExpectedTags(doc, tabMap, date, type,
                    extractEventDaySuffix(name), hasHelp, hasFeatured, null);
                const own = [...doc.querySelectorAll('.page-tags a[href]')]
                    .map(a => a.textContent.trim().toLowerCase());
                return {
                    expected: [...expected],
                    managed: own.filter(t => isManagedTag(t)),
                    unexpected: own.filter(t => isManagedTag(t) && !isTagPresent(t, expected)),
                };
            };`);
    }, code);

    let diffs = 0;
    let n = 0;
    const famDiffs = {};
    for (const row of rows) {
        const html = fs.readFileSync(fileOf(row.name), 'utf8');
        const got = await page.evaluate(([h, name, date, hy, fy]) => window.__bbp(h, name, date, hy, fy),
            [html, row.name, row.date, row.helpYear, row.featYear]);
        n++;
        const mine = Object.keys(row.expected).filter(t => row.expected[t] !== 'tour');
        const a = new Set(got.expected);
        const b = new Set(mine);
        const onlyBbp = got.expected.filter(t => !b.has(t));
        const onlyProbe = mine.filter(t => !a.has(t));
        // the probe's "spurious" also takes out tags a cast check matched and
        // counts tour tags against the tour check: compare what both can know
        const expAll = new Set(Object.keys(row.expected));
        const tourish = t => /^tour_/.test(t);
        const probeUnexpected = row.tags.filter((t, i) => row.tags.indexOf(t) === i || true)
            .filter(t => got.managed.includes(t) && !tourish(t)
                && !expAll.has(t) && !(/^\d+$/.test(t)
                    && (expAll.has(String(parseInt(t, 10))) || expAll.has(String(parseInt(t, 10)).padStart(2, '0')))));
        const bbpUnexpected = got.unexpected.filter(t => !tourish(t));
        const u1 = bbpUnexpected.filter(t => !probeUnexpected.includes(t));
        const u2 = probeUnexpected.filter(t => !bbpUnexpected.includes(t));
        let bad = onlyBbp.length || onlyProbe.length || u1.length || u2.length;
        if (bad && FAMILIES.length) {
            const fams = new Set([...onlyProbe.map(t => familyOf(t, row)),
                ...onlyBbp.map(() => '?'), ...u1.map(() => '?'), ...u2.map(() => '?')]);
            bad = [...fams].some(f => f === '?' || FAMILIES.includes(f));
        }
        if (bad) {
            diffs++;
            for (const t of onlyProbe) famDiffs[familyOf(t, row)] = (famDiffs[familyOf(t, row)] || 0) + 1;
            if (diffs <= 40) {
                console.log(`DIFF ${row.name}\n   expected only BBP: ${JSON.stringify(onlyBbp)}  only probe: ${JSON.stringify(onlyProbe)}`
                    + `\n   unexpected only BBP: ${JSON.stringify(u1)}  only probe: ${JSON.stringify(u2)}`);
            }
        }
    }
    await browser.close();
    console.log(`${n} events, BruceBaseParser's own functions against the probe: ${diffs} differ`
        + (FAMILIES.length ? ` (families ${FAMILIES.join(', ')} and anything unplaced)` : '')
        + (diffs ? `; probe-only by family ${JSON.stringify(famDiffs)}` : ''));
    process.exit(diffs ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
