#!/usr/bin/env node
'use strict';

/**
 * Checks `_mbTitleCase()` / `_mbNormalizeTitle()` / `_mbTypography()` — the
 * MusicBrainz title style and typographic punctuation of the
 * non-MusicBrainz converters (docs/claude/foreign-title-case.md)
 * — without a browser.
 *
 * Reads the userscript's "MusicBrainz title style on the non-MusicBrainz
 * sites" section (from its banner to the jungleland.it banner), evaluates it
 * in a sandbox with `Lib` and `_setTip` stubbed, and then:
 *
 *   1. runs the CASES table below, printing every mismatch (exit 1 if any);
 *   2. with `--sample` (add `--typo` for the punctuation too), rewrites the real titles of the saved snapshots in
 *      debug/ (gitignored; a missing one is skipped) and prints, per source,
 *      how many changed and a sample of before → after, so a rule change can
 *      be judged on the whole data, not on the cases alone.
 *
 *   3. runs `_mbTitleStyleCheck()` (the MusicBrainz title-style findings)
 *      over the STYLE_CASES of tests/support/mbTitleStyleCases.js;
 *   4. with `--mb-sample`, runs `_mbTitleStyleCheck()` over the MusicBrainz
 *      titles of the snapshots in debug/ and tests/fixtures/, and times it.
 *
 *     node scripts/check-mb-title-case.js [--sample [--typo]] [--mb-sample]
 *
 * The fixture spec tests/fixtures/mb-title-case.spec.js runs the same CASES
 * through `window.__saTest.mbTitleCase` in Chromium.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CASES = require('../tests/support/mbTitleCaseCases.js');
const STYLE_CASES = require('../tests/support/mbTitleStyleCases.js');

function loadSection() {
    const src = fs.readFileSync(path.join(ROOT, 'ShowAllEntityData.user.js'), 'utf8');
    const a = src.indexOf('// MusicBrainz title style on the non-MusicBrainz sites');
    const b = src.indexOf('// jungleland.it: the bootleg artwork list');
    if (a < 0 || b < 0) throw new Error('section banners not found');
    const code = src.slice(a, b) + '\n;({ _mbTitleCase, _mbNormalizeTitle, _mbTypography, _mbSiteTitleText, _mbTitleStyleCheck, _mbTitleStyleMemo });';
    const sandbox = { Lib: { settings: {} }, _setTip: () => {} };
    return vm.runInNewContext(code, sandbox);
}

function decode(s) {
    return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function sample(fn) {
    const read = (p) => (fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : null);
    const sources = [];
    const songs = read('debug/bb-songs.html');
    if (songs) sources.push(['bb-songs', [...songs.matchAll(/<li><a href="\/song:[^"]*">(.*?)<\/a>/g)].map(m => decode(m[1]))]);
    const jl = read('debug/jungleland.it.html');
    if (jl) {
        sources.push(['jl-list', [...jl.matchAll(/target="inferioredx1"[^>]*>([\s\S]*?)<\/a>/g)]
            .map(m => decode(m[1]).replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, ''))]);
    }
    ['unofficial', 'official', 'lp'].forEach(kind => {
        const bs = read(`debug/bs-records-${kind}-raw.html`);
        if (bs) sources.push([`bs-${kind}`, [...bs.matchAll(/detrec\.aspx\?code=[^"]*"\s*>([\s\S]*?)<\/a>/g)].map(m => decode(m[1]))]);
    });
    // springsteenlyrics.com: card titles (collection, bootlegs, CD/vinyl
    // bootlegs) and the lyrics index's song lines.
    const slCards = [];
    ['debug/sl-collection.html', 'debug/sl-collection-category.html', 'debug/sl-bootleg.html', 'debug/sl-bootlegs-initial.html',
        'debug/sl-brucelegs.html'].forEach(f => {
        const h = read(f);
        if (h) for (const m of h.matchAll(/<a [^>]*href="[^"]*item=[^"]*"[^>]*><b>([^<]+)<\/b><\/a>/g)) slCards.push(decode(m[1]));
    });
    if (slCards.length) sources.push(['sl cards', slCards.filter(Boolean)]);
    const slLyrics = [];
    ['debug/sl-lyrics.html', 'debug/sl-b.html', 'debug/sl-(.html'].forEach(f => {
        const h = read(f);
        if (h) for (const m of h.matchAll(/<a [^>]*href="[^"]*lyrics\.php\?song=[^"]*"[^>]*>([^<]+)<\/a>/g)) slLyrics.push(decode(m[1]));
    });
    if (slLyrics.length) sources.push(['sl lyrics', slLyrics.filter(Boolean)]);
    const cache = path.join(ROOT, 'debug/bb-year-cache');
    if (fs.existsSync(cache)) {
        const venues = [];
        const cities = [];
        const countries = [];
        const songsSet = [];
        fs.readdirSync(cache).filter(f => f.endsWith('.html')).forEach(f => {
            const s = fs.readFileSync(path.join(cache, f), 'utf8');
            for (const m of s.matchAll(/<strong>(?:<a [^>]*>|<span[^>]*>)?(\d{4}-\d\d-\d\d[^<]*)</g)) {
                const t = decode(m[1]).split(' - ').slice(1).join(' - ');
                if (t) {
                    const parts = t.split(', ');
                    venues.push(parts[0]);
                    // Roughly the converter's split: the city second to last
                    // before a state code or a country, the country last.
                    if (parts.length >= 3) cities.push(parts[parts.length - 2]);
                    if (parts.length >= 2 && !/^[A-Z]{2}(?:\/[A-Z]{2})*$/.test(parts[parts.length - 1])) countries.push(parts[parts.length - 1]);
                }
            }
            for (const m of s.matchAll(/<p>([^\n]*? \/ [^\n]*?)<\/p>/g)) {
                decode(m[1]).split(' / ').forEach(x => songsSet.push(x));
            }
        });
        sources.push(['bb-year venues', venues]);
        sources.push(['bb-year cities (approx.)', cities]);
        sources.push(['bb-year countries (approx.)', countries]);
        sources.push(['bb-year setlist songs (capsOnly)', songsSet, { capsOnly: true }]);
    }
    sources.forEach(([name, titles, opts]) => {
        const uniq = [...new Set(titles)];
        const typo = process.argv.includes('--typo');
        const conv = (t) => {
            const c = opts ? fn._mbTitleCase(t, opts) : fn._mbNormalizeTitle(t);
            return typo ? fn._mbTypography(c) : c;
        };
        const changed = uniq.map(t => [t, conv(t)]).filter(([a, b]) => a !== b);
        console.log(`\n=== ${name}: ${uniq.length} distinct, ${changed.length} changed`);
        const step = Math.max(1, Math.floor(changed.length / 40));
        changed.filter((_, i) => i % step === 0).slice(0, 40).forEach(([a, b]) => console.log(`  ${a}\n    → ${b}`));
    });
}

/**
 * `--mb-sample`: the same rewriters over MusicBrainz titles — every
 * recording, release, release group, work and track link's `<bdi>` (the
 * element `_findCellTitleEl()` reads) in the MusicBrainz snapshots of
 * debug/ and the fixtures of tests/fixtures/. Prints, per entity kind, how
 * many distinct titles the case and the typography rewriters would change,
 * a spread of before → after for each, how many titles have no Latin letter
 * (the MusicBrainz findings skip those), and what one title costs.
 *
 * @param {object} fn - The evaluated section's functions.
 */
function mbSample(fn) {
    const dirs = ['debug', 'tests/fixtures'];
    const foreign = /^(bb-|bs-|jl-|jungleland|sl-|dg-|discogs|brucebase|springsteenlyrics)/;
    const linkRe = /<a [^>]*href="(?:https?:\/\/[^/"]*musicbrainz\.org)?\/(recording|release|release-group|work|track)\/[0-9a-f-]{36}\/?"[^>]*>\s*<bdi>([\s\S]*?)<\/bdi>/g;
    const byKind = new Map();
    let files = 0;
    dirs.forEach(d => {
        const dir = path.join(ROOT, d);
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).filter(f => f.endsWith('.html') && !foreign.test(f)).forEach(f => {
            const s = fs.readFileSync(path.join(dir, f), 'utf8');
            files++;
            for (const m of s.matchAll(linkRe)) {
                const t = decode(m[2]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
                    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
                if (!t) continue;
                if (!byKind.has(m[1])) byKind.set(m[1], new Set());
                byKind.get(m[1]).add(t);
            }
        });
    });
    console.log(`\n${files} MusicBrainz snapshot files read`);
    const all = [];
    const latin = /\p{Script=Latin}/u;
    byKind.forEach((set, kind) => {
        const uniq = [...set];
        all.push(...uniq);
        const checked = uniq.filter(t => latin.test(t));
        const res = uniq.map(t => [t, fn._mbTitleStyleCheck(t)]);
        const pick = k => res.filter(([, r]) => r[k]).map(([t, r]) => [t, r[k]]);
        const fields = [['case', pick('caseFix')], ['typography', pick('typoFix')], ['series', pick('seriesFix')],
            ['feat', pick('feat')], ['eti-remove', pick('etiRemove')]];
        console.log(`\n=== ${kind}: ${uniq.length} distinct, ${uniq.length - checked.length} without a Latin letter, ` +
            fields.map(([l, c]) => `${c.length} ${l}`).join(', '));
        fields.forEach(([label, changed]) => {
            if (!changed.length) return;
            console.log(`  --- ${label}`);
            const step = Math.max(1, Math.floor(changed.length / 40));
            changed.filter((_, i) => i % step === 0).slice(0, 40).forEach(([a, b]) => console.log(`  ${a}\n    → ${b}`));
        });
    });
    const reps = Math.max(1, Math.ceil(200000 / Math.max(1, all.length)));
    const t0 = process.hrtime.bigint();
    let n = 0;
    for (let r = 0; r < reps; r++) {
        fn._mbTitleStyleMemo.clear();
        for (const t of all) { fn._mbTitleStyleCheck(t); n++; }
    }
    const us = Number(process.hrtime.bigint() - t0) / 1000 / n;
    const t1 = process.hrtime.bigint();
    for (let r = 0; r < reps; r++) for (const t of all) fn._mbTitleStyleCheck(t);
    const usMemo = Number(process.hrtime.bigint() - t1) / 1000 / n;
    console.log(`\nCost of _mbTitleStyleCheck(): ${us.toFixed(2)} µs per distinct title, ` +
        `${(us * 10).toFixed(1)} ms per 10,000; a repeated title ${usMemo.toFixed(2)} µs (memo); ` +
        `${all.length} distinct titles × ${reps}`);
}

function main() {
    const fn = loadSection();
    let bad = 0;
    CASES.forEach(([input, expected, opts]) => {
        const got = opts && opts.full ? fn._mbSiteTitleText(input, { caseOn: true, typoOn: true })
            : opts && opts.typo ? fn._mbTypography(input)
                : opts && opts.normalize ? fn._mbNormalizeTitle(input) : fn._mbTitleCase(input, opts || {});
        if (got !== expected) {
            bad++;
            console.log(`MISMATCH ${JSON.stringify(input)}${opts ? ' ' + JSON.stringify(opts) : ''}\n   want ${JSON.stringify(expected)}\n   got  ${JSON.stringify(got)}`);
        }
    });
    console.log(`${CASES.length - bad}/${CASES.length} cases pass`);
    let badStyle = 0;
    STYLE_CASES.forEach(([input, expected]) => {
        const r = fn._mbTitleStyleCheck(input);
        const got = {};
        Object.keys(r).forEach(k => { if (r[k] !== null) got[k] = r[k]; });
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
            badStyle++;
            console.log(`STYLE MISMATCH ${JSON.stringify(input)}\n   want ${JSON.stringify(expected)}\n   got  ${JSON.stringify(got)}`);
        }
    });
    console.log(`${STYLE_CASES.length - badStyle}/${STYLE_CASES.length} title-style cases pass`);
    bad += badStyle;
    if (process.argv.includes('--sample')) sample(fn);
    if (process.argv.includes('--mb-sample')) mbSample(fn);
    process.exitCode = bad ? 1 : 0;
}

main();
