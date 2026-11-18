#!/usr/bin/env node
'use strict';

/**
 * Parity batch 4 (org/bbp-parity.org): is the Python probe's port of
 * BruceBaseParser's venue, song, relation and retail page-tag rules the rule
 * BruceBaseParser really runs?
 *
 * Takes BruceBaseParser's OWN functions out of its userscript by name
 * (computeExpected{Venue,Retail,Song,Relation}Tags(), the isManaged*Tag()s,
 * checkVenuePageLocationTags(), checkSongExactTitleTag(),
 * computeExpectedRelationNameTags() and what they call), runs them in
 * Chromium on every page the probe checked (the page put into the live
 * document, its scripts taken out: two of the functions read `document`),
 * and compares, per page, the missing and the spurious tags with the
 * probe's "bbp" reading (scripts/probe-bb-page-tags.py --rows FILE).
 *
 * Missing as BruceBaseParser's annotate*PageTags() compute it: the fixed
 * tags by Set.has(), the venue's place results, the song's exact-title tag
 * and the relation's name tags by their own matchedTag/Set.has(). Spurious:
 * a managed own tag that is not in the fixed set.
 *
 * Read-only, no network. Exit code 1 when anything differs.
 *
 * usage: node scripts/check-bbp-page-tag-oracle.js ROWS.json [--mirror DIR] [--bbp FILE]
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

const CONSTS = ['MONTH_NAMES', 'NON_DECOMPOSABLE_LETTERS', 'US_STATE_NAMES', 'CA_PROVINCE_NAMES',
    'COUNTRY_EXTRA_TAGS', 'VENUE_TAG_ALIAS_OVERRIDES'];
const FUNCS = ['hasUnderConstructionBanner', 'stripDiacritics', 'isTagPresent', 'buildTabMap', 'getTabEl',
    'computeExpectedVenueTags', 'isManagedVenueTag', 'parseLocationParts', 'parseVenuePageLocation',
    'toLocationTagSlug', 'checkLocationNameTag', 'checkVenueNameTag', 'checkParsedLocationTags',
    'checkVenuePageLocationTags',
    'parseRetailReleaseDates', 'computeExpectedRetailTags', 'isManagedRetailTag',
    'computeExpectedYearSongTags', 'computeExpectedSongTags', 'isManagedYearSongTag', 'isManagedSongTag',
    'songTagSlug', 'checkSongExactTitleTag',
    'computeExpectedRelationTags', 'isManagedRelationTag', 'parseRelationPersonTitle', 'stripTrailingThe',
    'stripLeadingThe', 'splitAmpersandName', 'normalizeRelationTagName', 'collectRelationListLinks',
    'computeExpectedRelationNameTags'];

/**
 * The text of a declaration from its start to the end of its balanced
 * braces or brackets (strings, templates, comments and regex literals after
 * "(" , "," , "=" , ":" , "!" or an arrow's ">" are skipped). The reader of
 * scripts/check-bbp-tag-oracle.js, plus the ">" (parseRetailReleaseDates()
 * has a regex right after an arrow).
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
        // ">" too: a regex right after an arrow (l => /^…/i.test(l))
        if (c === '/' && '(,=:!&|?{};>\n'.includes(prev)) {
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
 * The mirror's file of a page name ("venue:stone-pony-asbury-park-nj").
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
 * A sorted list of the tags of a {family: [tag]} map.
 *
 * @param {Object<string, string[]>} byFam - The probe's map.
 * @returns {string[]} Every tag, sorted, once.
 */
function flat(byFam) {
    return [...new Set(Object.values(byFam || {}).flat())].sort();
}

(async () => {
    if (!ROWS) {
        console.error('usage: node scripts/check-bbp-page-tag-oracle.js ROWS.json [--mirror DIR] [--bbp FILE]');
        process.exit(2);
    }
    const rows = JSON.parse(fs.readFileSync(ROWS, 'utf8'));
    const code = bbpCode();
    if (opt('--dump', '')) fs.writeFileSync(opt('--dump', ''), code);
    const browser = await chromium.launch();
    const page = await browser.newPage({ javaScriptEnabled: true });
    await page.route('**/*', r => r.abort());
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.evaluate(src => {
        window.log = () => {};
        window.logWarn = () => {};
        window.logErr = () => {};
        window.Lib = { settings: {} };
        (0, eval)(src + `
            window.__bbp = function (html, kind) {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                document.documentElement.replaceWith(document.importNode(doc.documentElement, true));
                const title = (document.getElementById('page-title') || { textContent: '' }).textContent.trim();
                const links = [...document.querySelectorAll('.page-tags a[href]')];
                const own = links.map(a => a.textContent.trim().toLowerCase());
                const actual = new Set(own);
                let expected;
                let managed;
                const extra = [];
                if (kind === 'venue') {
                    expected = computeExpectedVenueTags(title, document);
                    managed = isManagedVenueTag;
                    for (const r of checkVenuePageLocationTags(title, actual)) {
                        if (!r.matchedTag) extra.push(r.candidateTag);
                    }
                } else if (kind === 'retail') {
                    expected = computeExpectedRetailTags(title, document);
                    managed = isManagedRetailTag;
                } else if (kind === 'song') {
                    expected = computeExpectedSongTags(title, buildTabMap(document));
                    managed = isManagedSongTag;
                    const ex = checkSongExactTitleTag(title, actual);
                    if (ex.tag && !ex.matchedTag) extra.push(ex.tag);
                } else {
                    expected = computeExpectedRelationTags();
                    managed = isManagedRelationTag;
                    for (const t of computeExpectedRelationNameTags(document).keys()) {
                        if (!expected.has(t) && !actual.has(t)) extra.push(t);
                    }
                }
                const missing = [...expected].filter(t => !actual.has(t)).concat(extra);
                const spurious = own.filter(t => managed(t) && !expected.has(t));
                return { missing: [...new Set(missing)].sort(), spurious: [...new Set(spurious)].sort() };
            };`);
    }, code);

    let diffs = 0;
    let n = 0;
    const byKind = {};
    for (const row of rows) {
        const html = fs.readFileSync(fileOf(row.name), 'utf8')
            .replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
        const got = await page.evaluate(([h, k]) => window.__bbp(h, k), [html, row.kind]);
        n++;
        const pm = flat(row.bbp.missing);
        const ps = flat(row.bbp.spurious);
        const m1 = got.missing.filter(t => !pm.includes(t));
        const m2 = pm.filter(t => !got.missing.includes(t));
        const s1 = got.spurious.filter(t => !ps.includes(t));
        const s2 = ps.filter(t => !got.spurious.includes(t));
        if (m1.length || m2.length || s1.length || s2.length) {
            diffs++;
            byKind[row.kind] = (byKind[row.kind] || 0) + 1;
            if (diffs <= 40) {
                console.log(`DIFF ${row.name}\n   missing only BBP: ${JSON.stringify(m1)}  only probe: ${JSON.stringify(m2)}`
                    + `\n   spurious only BBP: ${JSON.stringify(s1)}  only probe: ${JSON.stringify(s2)}`);
            }
        }
    }
    await browser.close();
    console.log(`${n} pages, BruceBaseParser's own functions against the probe: ${diffs} differ`
        + (diffs ? ` ${JSON.stringify(byKind)}` : ''));
    process.exit(diffs ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
