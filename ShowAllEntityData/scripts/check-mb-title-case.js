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
 *     node scripts/check-mb-title-case.js [--sample [--typo]]
 *
 * The fixture spec tests/fixtures/mb-title-case.spec.js runs the same CASES
 * through `window.__saTest.mbTitleCase` in Chromium.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CASES = require('../tests/support/mbTitleCaseCases.js');

function loadSection() {
    const src = fs.readFileSync(path.join(ROOT, 'ShowAllEntityData.user.js'), 'utf8');
    const a = src.indexOf('// MusicBrainz title style on the non-MusicBrainz sites');
    const b = src.indexOf('// jungleland.it: the bootleg artwork list');
    if (a < 0 || b < 0) throw new Error('section banners not found');
    const code = src.slice(a, b) + '\n;({ _mbTitleCase, _mbNormalizeTitle, _mbTypography, _mbSiteTitleText });';
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
    if (process.argv.includes('--sample')) sample(fn);
    process.exitCode = bad ? 1 : 0;
}

main();
