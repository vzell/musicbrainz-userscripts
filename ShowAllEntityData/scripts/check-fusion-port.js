#!/usr/bin/env node
/**
 * Checks the rec-dup finding's port of majkinetor's Fusion (org/majkinetor.org,
 * "Possible duplicate recordings"), three ways:
 *
 *  1. Parity: every declaration of scripts/fusion-port-map.json, cut out of
 *     ShowAllEntityData.user.js's generated section, with its renames undone and
 *     its indent removed, must equal the same declaration in the clone
 *     (debug/majkinetor/userscripts/fusion/fusion.user.js), line for line; and the
 *     map's settings must equal the clone's SETTINGS_DEFAULTS. A refresh that
 *     changes Fusion fails here, so the port is regenerated on purpose
 *     (python3 scripts/gen-fusion-port.py --write), never drifts. The clone is
 *     only READ as text, never run.
 *  2. Vectors: Fusion's own spec cases (its test/760-similar-titles, 789-live-
 *     recordings, 565-unknown-length, 594-artist-mbid, 623-gated-grouping,
 *     623-non-latin), the expected verdicts copied from those specs' check()
 *     lines, run against SAED's port and its grouping driver
 *     (`_recDupGroups()`), never against Fusion's code. Plus SAED's own adapter
 *     cases (`_recDupCommentSetting()`).
 *  3. Bucketing (with --dump FILE.json.gz, or every dump in debug/probe-rec-dup/):
 *     the bucketed `_recDupGroups()` against the all-pairs loop of Fusion's
 *     autoMatch(), on the same records: at strict they must be IDENTICAL (the
 *     ISRC/AcoustID index is exact); at normal and loose the missed and extra
 *     groups are reported (the title blocks are not exact). All pairs of 74,000
 *     recordings is 2.7e9 pairs, so the all-pairs side runs only up to
 *     --max-all-pairs records (default 12000) unless raised.
 *
 * usage: node scripts/check-fusion-port.js [--vectors-only | --dump FILE [--groups-out FILE]] [--max-all-pairs N] [--examples N]
 * exit:  0 when parity and vectors hold and strict bucketing is exact; 1 otherwise.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fusion-port-map.json'), 'utf8'));
const USERSCRIPT = fs.readFileSync(path.join(ROOT, 'ShowAllEntityData.user.js'), 'utf8');
const CLONE_FILE = path.join(ROOT, 'debug/majkinetor', MAP.source);
const BEGIN = '// ── Fusion port BEGIN';
const GROUP_END = '// ── rec-dup grouping END ──';

let failures = 0;
/**
 * Records one check.
 * @param {boolean} ok
 * @param {string} what
 */
function check(ok, what) {
    if (!ok) { failures++; console.log('FAIL  ' + what); } else if (process.env.VERBOSE) console.log('ok    ' + what);
}

/**
 * The lines of one top-level declaration, the same rule as scripts/gen-fusion-port.py:
 * one line when it ends in ';' or '}' and the next non-blank line starts in column 0;
 * otherwise up to the first column-0 line, included when it closes ('}', ']', ')').
 * @param {string[]} lines
 * @param {RegExp} startRe
 * @param {string} what
 * @returns {?string[]}
 */
function declLines(lines, startRe, what) {
    const starts = [];
    lines.forEach((l, i) => { if (startRe.test(l)) starts.push(i); });
    if (starts.length !== 1) { check(false, `${what}: ${starts.length} declarations`); return null; }
    const i = starts[0];
    let nxt = i + 1;
    while (nxt < lines.length && !lines[nxt].trim()) nxt++;
    if (/[;}]\s*$/.test(lines[i]) && (nxt >= lines.length || !/^\s/.test(lines[nxt]))) return lines.slice(i, i + 1);
    for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() && !/^\s/.test(lines[j])) {
            if (/^[}\])]/.test(lines[j])) return lines.slice(i, j + 1);
            let k = j;
            while (!lines[k - 1].trim()) k--;
            return lines.slice(i, k);
        }
    }
    return null;
}

/**
 * Escapes a string for a RegExp.
 * @param {string} s
 * @returns {string}
 */
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Part 1: parity with the clone, and the settings. */
function parity() {
    if (!fs.existsSync(CLONE_FILE)) {
        console.log(`SKIP  parity: no clone at ${path.relative(ROOT, CLONE_FILE)} (refresh-majkinetor skill)`);
        return;
    }
    const clone = fs.readFileSync(CLONE_FILE, 'utf8').split('\n');
    const a = USERSCRIPT.indexOf(BEGIN);
    const b = USERSCRIPT.indexOf('// ── Fusion port END ──');
    check(a > 0 && b > a, 'the generated section has its markers');
    const section = USERSCRIPT.slice(a, b).split('\n').map(l => l.replace(/^ {4}/, ''));
    const back = Object.entries(MAP.rename).sort((x, y) => y[1].length - x[1].length);
    const unrename = l => back.reduce((s, [orig, ren]) => s.replace(new RegExp('(?<![\\w$.])' + reEsc(ren) + '(?![\\w$])', 'g'), orig), l);
    for (const d of MAP.decls) {
        const ren = MAP.rename[d.name];
        const start = n => new RegExp('^(?:async\\s+)?(?:function\\s+' + reEsc(n) + '\\s*\\(|const\\s+' + reEsc(n) + '\\s*=)');
        const ours = declLines(section, start(ren), 'SAED ' + ren);
        const theirs = declLines(clone, start(d.name), 'Fusion ' + d.name);
        if (!ours || !theirs) continue;
        const o = ours.map(l => unrename(l).replace(/\s+$/, ''));
        const t = theirs.map(l => l.replace(/\s+$/, '').replace(/\t/g, '    '));
        const same = o.length === t.length && o.every((l, i) => l === t[i]);
        if (!same) {
            const k = o.findIndex((l, i) => l !== t[i]);
            console.log(`      ${d.name}: first difference at line ${k + 1}:\n        SAED:   ${o[k]}\n        Fusion: ${t[k]}`);
        }
        check(same, `parity: ${ren} is Fusion's ${d.name}, verbatim`);
    }
    const def = clone.find(l => /^const SETTINGS_DEFAULTS = \{/.test(l)) || '';
    for (const [k, v] of Object.entries(MAP.settings)) {
        const m = new RegExp('\\b' + k + ':\\s*(\\d+)').exec(def);
        check(m && Number(m[1]) === v, `settings: Fusion's ${k} is ${v} (${m ? m[1] : 'absent'})`);
    }
    const ourSettings = /const _FZ_SETTINGS = Object\.freeze\(\{([^}]*)\}\)/.exec(USERSCRIPT);
    check(ourSettings && Object.entries(MAP.settings).every(([k, v]) => new RegExp('\\b' + k + ': ' + v + '\\b').test(ourSettings[1])), 'settings: _FZ_SETTINGS carries the map\'s values');
}

/**
 * SAED's port and grouping driver as functions, built from the userscript's
 * text (its own code, not the clone's): the generated section through
 * "rec-dup grouping END", with EVENT_TYPE_KEYWORDS taken from the script too.
 * @returns {Object}
 */
function loadPort() {
    const a = USERSCRIPT.indexOf(BEGIN);
    const b = USERSCRIPT.indexOf(GROUP_END);
    if (a < 0 || b < 0) throw new Error('port markers not found');
    const kw = /const EVENT_TYPE_KEYWORDS = (\[[^\]]*\]);/.exec(USERSCRIPT);
    const body = `const EVENT_TYPE_KEYWORDS = ${kw[1]};\n${USERSCRIPT.slice(a, b)}\nreturn { _fzNormName, _fzTitleAlike, _fzTitleDistinctWords, _fzIsrcConflict, _fzPlaceConflict, _fzArtistSimilar, _fzShouldUnion, _fzPairSignals, _fzGatedUnionFind, _fzGroupTier, _fzGroupConfidence, _FZ_SETTINGS, _recDupGroups, _recDupCandidatePairs, _recDupCommentSetting, _recDupBlockPairs };`;
    return new Function(body)();
}

/**
 * The all-pairs loop of Fusion's autoMatch(): every pair i < j in pool order,
 * union when shouldUnion() accepts (its logging and position mode left out).
 * @param {Object} F the port
 * @param {Array<Object>} pool
 * @param {string} cutoff
 * @returns {number[][]} groups of pool indices, each sorted, sorted by first index
 */
function allPairs(F, pool, cutoff) {
    const uf = F._fzGatedUnionFind(pool);
    for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
            const sig = F._fzPairSignals(pool[i], pool[j], F._FZ_SETTINGS.lengthToleranceMs);
            if (F._fzShouldUnion(sig, cutoff)) uf.union(pool[i].gid, pool[j].gid);
        }
    }
    return groupsOf(pool, uf.find);
}

/**
 * Groups of two or more by union-find root.
 * @param {Array<Object>} pool
 * @param {function(string): string} find
 * @returns {number[][]}
 */
function groupsOf(pool, find) {
    const by = new Map();
    pool.forEach((r, i) => { const k = find(r.gid); if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
    return [...by.values()].filter(g => g.length > 1).sort((x, y) => x[0] - y[0]);
}

/**
 * A Fusion-shaped record, as Fusion's specs build them with mkRecording().
 * @param {string} gid
 * @param {Object} o
 * @returns {Object}
 */
function mk(gid, o) {
    return Object.assign({ gid, title: 'Same Song', length: 200000, isrcs: [], acoustids: null, artistCredit: 'Same Artist',
        artistGids: [], video: false, editsPending: false, live: null, places: null, liveDate: null }, o);
}

/** Part 2: Fusion's spec cases and SAED's adapter cases. */
function vectors(F) {
    const titlesOf = (pool, groups) => groups.map(g => g.map(i => pool[i].title).sort());
    const both = (pool, cutoff) => {
        const a = allPairs(F, pool, cutoff);
        const r = F._recDupGroups(pool, cutoff);
        const b = r.groups.map(g => g.members.slice().sort((x, y) => x - y)).sort((x, y) => x[0] - y[0]);
        check(JSON.stringify(a) === JSON.stringify(b), `bucketed = all pairs for ${JSON.stringify(pool.map(p => p.title))} at ${cutoff}`);
        return titlesOf(pool, b);
    };
    const AR = '11111111-2222-4333-8444-555555555555';
    const v760 = recs => recs.map(([title, length, isrcs, acoustids], i) => mk('760-' + i, { title, length, isrcs, acoustids: acoustids || null, artistCredit: 'Aiuole', artistGids: [AR] }));

    // 760: In Volo, Dwell, Interlude, AcoustID, what must still match
    const inVolo = [['In Volo - Drift', 112000, ['QZTRX2699407']], ['In Volo - Grain', 113000, ['QZTRX2699409']], ['In Volo - Trace', 116000, ['QZTRX2699406']]];
    for (const c of ['normal', 'loose']) check(both(v760(inVolo), c).length === 0, `760 In Volo: not grouped at ${c}`);
    check(both(v760(inVolo.map(([t, l]) => [t, l, []])), 'loose').length === 0, '760 In Volo: not grouped at loose without ISRCs');
    check(!(F._fzTitleAlike('In Volo - Drift', 'In Volo - Trace') && !F._fzTitleDistinctWords('In Volo - Drift', 'In Volo - Trace')), '760: "In Volo - Drift" / "In Volo - Trace" not similar');
    const dwell = [['Dwell IV', 560000, ['GBSMU9781309']], ['Dwell I', 560000, ['GBSMU9781306']]];
    check(both(v760(dwell), 'normal').length === 0, '760 Dwell: not grouped at normal');
    check(both(v760(dwell.map(([t, l]) => [t, l, []])), 'loose').length === 0, '760 Dwell: not grouped at loose on titles alone');
    check(!!F._fzTitleDistinctWords('Part 1', 'Part 2'), '760: "Part 1" / "Part 2" differ');
    check(both(v760([['Interlude', 60000, ['QZTRX2699407']], ['Interlude', 60000, ['QZTRX2699409']]]), 'normal').length === 0, '760 Interlude: one ISRC batch, not grouped');
    check(!both(v760([['Interlude', 60000, ['QZTRX2699407']], ['Interlude', 60000, []], ['Interlude', 60000, ['QZTRX2699409']]]), 'normal').some(g => g.length === 3), '760 Interlude: an ISRC-less recording does not bridge');
    const ids = ['e8aa6bc2-0000-4000-8000-000000000001', 'f6d77593-0000-4000-8000-000000000002'];
    for (const c of ['strict', 'normal', 'loose']) check(both(v760([['Feel What You Feel', 505000, [], ids], ['Suspended Space', 504000, ['GBCCH9900253'], ids]]), c).length === 0, `760 AcoustID: different titles not grouped at ${c}`);
    check(both(v760([['Feel What You Feel', 505000, [], ids], ['Feel What You Feel (Original Mix)', 504000, [], ids]]), 'strict').length === 1, '760 AcoustID: a title and its mix spelling still group');
    check(both(v760([['Oburumankoma', 505000, [], ids], ['Oburumakoma', 504000, [], ids]]), 'strict').length === 1, '760 AcoustID: a typo still groups');
    check(both(v760([['Feel What You Feel', 505000, ['GBCCH9900253'], ids], ['Suspended Space', 504000, ['GBCCH9900253'], ids]]), 'strict').length === 1, '760: a shared ISRC groups whatever the titles');
    for (const [x, y] of [['Long Song Title (Original Mix)', 'Long Song Title'], ['Song - Radio Edit', 'Song (Radio Edit)'], ['Song (Extended Mix)', 'Song (Extended Version)'],
        ['Song - Remastered 2011', 'Song (2011 Remaster)'], ['Song (Radio Edit)', 'Song (Radio Mix)'], ['Oburumankoma', 'Oburumakoma'], ['Rock & Roll', 'Rock and Roll']]) {
        check(F._fzTitleAlike(x, y) && !F._fzTitleDistinctWords(x, y), `760: "${x}" / "${y}" still similar`);
    }
    check(both(v760([['Song', 200000, ['USUM70000001']], ['Song', 201000, ['GBAYE0000001']]]), 'normal').length === 1, '760: other registrants still group on title');
    check(both(v760([['Song', 200000, ['USUM70000001']], ['Song', 201000, ['USUM71000001']]]), 'normal').length === 1, '760: one registrant, other years still group');
    check(both(v760([['In Volo - Drift', 112000, ['QZTRX2699407']], ['In Volo - Trace', 113000, ['QZTRX2699407', 'QZTRX2699406']]]), 'strict').length === 1, '760: a shared ISRC groups different titles');

    // 789: live and places (Fusion's recordingSetting() shape, built by hand)
    const r789 = (n, live, places) => mk('789-' + n, { title: 'Praise Lamented Shade', length: 345000, acoustids: ['acid-1'], artistCredit: 'Paradise Lost', artistGids: ['ar'], live, places });
    const koko = () => [{ gid: 'p1', name: 'KOKO', kind: 'place', date: '2007-04-12' }];
    const g789 = pool => both(pool, 'strict').length > 0;
    check(!g789([r789(0, false, []), r789(1, true, koko())]), '789: live and studio not grouped on a shared AcoustID');
    check(!g789([Object.assign(r789(0, false, []), { isrcs: ['GBX000000001'] }), Object.assign(r789(1, true, koko()), { isrcs: ['GBX000000001'] })]), '789: nor on a shared ISRC');
    check(!g789([r789(1, true, koko()), r789(2, true, [{ gid: 'p2', name: 'Wacken', kind: 'place', date: '2008-08-01' }])]), '789: two places not grouped');
    check(!g789([r789(1, true, koko()), r789(2, true, [{ gid: 'p1', name: 'KOKO', kind: 'place', date: '2009-01-01' }])]), '789: one place on two dates not grouped');
    check(g789([r789(1, true, koko()), r789(2, true, koko())]), '789: one place on one date groups');
    check(g789([r789(1, true, koko()), r789(2, true, [{ gid: 'a1', name: 'London', kind: 'area', date: null }])]), '789: a place and an area do not contradict');
    check(g789([r789(1, true, koko()), r789(2, null, null)]), '789: an unknown setting does not block');
    check(!both([r789(0, false, []), r789(3, null, null), r789(1, true, koko())], 'strict').some(g => g.length === 3), '789: an unknown setting does not bridge live and studio');

    // 565: an unknown length does not veto at normal
    const r565 = (n, o) => mk('565-' + n, Object.assign({ title: '23', artistGids: [AR] }, o));
    check(both([r565(0, { length: null }), r565(1, {})], 'normal').length === 1, '565: unknown length groups at normal');
    check(both([r565(0, { length: null }), r565(1, {})], 'strict').length === 0, '565: and not at strict');
    check(both([r565(0, { length: 200000 }), r565(1, { length: 220000 })], 'normal').length === 0, '565: two KNOWN lengths 20 s apart refused at normal');
    check(both([r565(0, { length: 200000 }), r565(1, { length: 260000 })], 'loose').length === 0, '565: a gross difference refused');
    check(both([r565(0, { length: null }), r565(1, { artistGids: ['other'] })], 'normal').length === 0, '565: another artist refused at normal');
    check(both([r565(0, { video: true }), r565(1, { video: false })], 'loose').length === 0, '565: video/audio refused');

    // 594: artist MBIDs over credit strings
    const g = 'gid-radium';
    const r594 = (n, credit, gids, o) => mk('594-' + n, Object.assign({ title: 'Power Surgeon', length: 305000, artistCredit: credit, artistGids: gids }, o));
    check(!F._fzArtistSimilar('Radium', 'DJ Radium'), '594: "Radium" / "DJ Radium" fail the string test');
    check(both([r594(0, 'Radium', [g]), r594(1, 'DJ Radium', [g])], 'normal').length === 1, '594: same MBID, other credit, groups at normal');
    check(both([r594(0, 'Radium', [g]), r594(1, 'Radium', ['other'])], 'normal').length === 0, '594: two MBIDs do not match');
    check(both([r594(0, 'Radium', [g]), r594(1, 'Radium feat. X', [g, 'x'])], 'normal').length === 0, '594: an extra artist is not the same credit');
    check(both([r594(0, 'A & B', ['a', 'b']), r594(1, 'B & A', ['b', 'a'])], 'normal').length === 1, '594: the same two artists in another order match');
    check(both([r594(0, 'Radium', []), r594(1, 'Radium', [])], 'normal').length === 1, '594: no MBIDs, same strings match');
    check(both([r594(0, 'Radium', []), r594(1, 'DJ Radium', [])], 'normal').length === 0, '594: no MBIDs, other strings do not');
    check(both([r594(0, 'Radium', [g], { length: 249000 }), r594(1, 'Radium', [g], { length: 299000 })], 'normal').length === 0, '594: the length guard holds');
    check(both([r594(0, 'Radium', [g], { video: true }), r594(1, 'Radium', [g], { video: false })], 'normal').length === 0, '594: the video gate holds');

    // 623: gated grouping and non-Latin
    const r623 = (n, o) => mk(n, o);
    const has = (gs, a, c) => gs.some(x => x.includes(a) && x.includes(c));
    const ids623 = (pool, cutoff) => { both(pool, cutoff); return allPairs(F, pool, cutoff).map(x => x.map(i => pool[i].gid)); };
    const vid = ids623([r623('a', { video: true }), r623('b', { video: null }), r623('c', { video: false })], 'normal');
    check(!has(vid, 'a', 'c') && vid.length === 1, '623: video and audio never share a group through an unknown');
    const len = ids623([r623('a', { length: 180000 }), r623('b', { length: null }), r623('c', { length: 270000 })], 'normal');
    check(!has(len, 'a', 'c'), '623: 3:00 and 4:30 never share a group through an unknown length');
    check(ids623([r623('a', {}), r623('b', { length: null }), r623('c', {})], 'normal').join() === 'a,b,c', '623: a clean group still forms');
    check(F._fzGroupTier([r623('a', { video: true }), r623('b', { video: null }), r623('c', { video: false })]) === 'manual', '623: a group holding video/audio has no tier');
    check(F._fzGroupTier([r623('a', {}), r623('b', {})]) === 'normal', '623: a clean pair is normal');
    check(F._fzNormName('夜に駆ける') === '夜に駆ける' && F._fzNormName('Кино') === 'кино' && F._fzNormName('Χάρις') === 'χαρις', '623: non-Latin survives normalisation');
    check(F._fzNormName('ザ・ブック') === 'ザ ブック' && F._fzNormName('Café Tacvba!') === 'cafe tacvba', '623: kana keep their marks; Latin folds');
    const nl = (t, c) => [r623('a', { title: t, artistCredit: c, length: 245000 }), r623('b', { title: t, artistCredit: c, length: 245000 })];
    check(both(nl('夜に駆ける', 'YOASOBI'), 'normal').length === 1 && both(nl('Группа крови', 'Кино'), 'normal').length === 1, '623: identical non-Latin recordings group at normal');
    check(both([r623('a', { title: 'Группа крови', artistCredit: 'Кино' }), r623('b', { title: 'Кукушка', artistCredit: 'Кино' })], 'normal').length === 0, '623: different non-Latin titles stay apart');

    // SAED's adapter: a comment's setting
    const s = F._recDupCommentSetting;
    const h = s('live, 1975‐11‐18: Hammersmith Odeon, London, UK');
    check(h.live === true && h.liveDate === '1975-11-18' && h.places.length === 1 && h.places[0].gid === 'comment:hammersmith odeon' && h.places[0].kind === 'place', 'adapter: a live comment gives live, the date and the venue');
    check(s('studio, 1975').live === false && s('studio, 1975').liveDate === '1975', 'adapter: "studio, 1975" is studio');
    check(s('live').live === true && s('live').places === null, 'adapter: "live" alone is live, nowhere known');
    check(s('alternate take').live === null && s('alternate take').places === null, 'adapter: another comment is unknown');
    check(s('live, 2001‐12‐22/23: Convention Hall, Asbury Park, NJ, USA').liveDate === '2001-12-22/23', 'adapter: an uncertain day stays in the date');
    check(s('livery').live === null, 'adapter: "livery" is not "live"');
    const a1 = mk('h1', { title: 'Thunder Road', ...s('live, 1975‐11‐18: Hammersmith Odeon, London, UK') });
    const a2 = mk('h2', { title: 'Thunder Road', ...s('live, 1975‐11‐24: Hammersmith Odeon, London, UK') });
    const a3 = mk('h3', { title: 'Thunder Road', ...s('live, 1975‐11‐18: Hammersmith Odeon, London, UK') });
    check(both([a1, a2], 'normal').length === 0, 'adapter: two dates at one venue stay apart at normal');
    check(both([a1, a3], 'normal').length === 1, 'adapter: one date at one venue groups at normal');
    check(both([a1, mk('s', { title: 'Thunder Road', ...s('studio') })], 'normal').length === 0, 'adapter: live and studio stay apart');
    check(F._recDupCandidatePairs([a1, a2], 'normal').length === 0, 'adapter: two known different dates are not even a candidate pair');

    // the up-front lower bound (2026-11-21): the count is the loop's, and an
    // over-the-cap pool gives up before building its pairs
    const dates = [null, '1975-11-18', '1975-11-18', '1975-11-24', null, '1978-07-07', '1975-11-24'];
    const blk = dates.map((d, i) => mk('d' + i, { liveDate: d }));
    let brute = 0;
    for (let i = 0; i < blk.length; i++) for (let j = i + 1; j < blk.length; j++) {
        if (!(blk[i].liveDate && blk[j].liveDate && blk[i].liveDate !== blk[j].liveDate)) brute++;
    }
    check(F._recDupBlockPairs(blk, blk.map((_, i) => i)) === brute, `the block count is the loop's (${brute})`);
    const big = Array.from({ length: 2001 }, (_, i) => mk('big' + i, { title: 'Same Song' }));
    const t0 = Date.now();
    check(F._recDupCandidatePairs(big, 'normal') === null, '2001 identical titles are over the cap at normal');
    const ms = Date.now() - t0;
    check(ms < 400, `and give up at once (${ms} ms; building the pairs took about 1 s)`);
    check(F._recDupCandidatePairs(big.slice(0, 2000), 'normal') !== null, '2000 identical titles (1,999,000 pairs) are not');

    // the driver's own outputs
    const r = F._recDupGroups([mk('x1', { title: 'Interlude', isrcs: ['QZTRX2699407'] }), mk('x2', { title: 'Interlude' }), mk('x3', { title: 'Interlude', isrcs: ['QZTRX2699409'] })], 'normal');
    check(r.groups.length === 1 && r.groups[0].members.join() === '0,1', 'driver: the Interlude pool forms one pair, in Fusion\'s order');
    check(r.apart.get(2) && r.apart.get(2).some(x => /from one batch/.test(x.reason)), 'driver: the refused third names the batch');
    const t = F._recDupGroups([mk('y1', { title: 'Song', isrcs: ['USUM70000001'] }), mk('y2', { title: 'Song', isrcs: ['USUM70000001'] })], 'strict');
    check(t.groups[0].tier === 'strict' && t.groups[0].isrc === 'USUM70000001' && t.groups[0].signals.includes('isrc'), 'driver: a shared ISRC is strict and named');
    const v = F._recDupGroups([mk('z1', { title: 'Song', isrcs: ['USUM70000001'], video: true }), mk('z2', { title: 'Song', isrcs: ['USUM70000001'], video: false })], 'strict');
    check(v.groups.length === 0 && v.apart.get(0) && v.apart.get(0)[0].reason === 'video and audio', 'driver: a video beside audio is kept apart, and says why');
}

/**
 * Fusion-shaped records from a probe dump (scripts/probe-rec-dup-examples.py),
 * the way `_recDupRecord()` reads a row: gid, title, length, ISRCs, the credit's
 * MBIDs and string, video, the comment's setting. No AcoustIDs (an artist's
 * recordings page has none), no pending edits (the browse does not say).
 * @param {Object} F
 * @param {Object} dump
 * @returns {Array<Object>}
 */
function recordsOfDump(F, dump) {
    return dump.recordings.map(r => {
        const st = F._recDupCommentSetting(r.disambiguation);
        return {
            gid: r.id, title: r.title, length: r.length == null ? null : r.length, isrcs: r.isrcs || [], acoustids: null,
            artistGids: r.ac.map(c => c[0]).filter(Boolean), artistCredit: r.ac.map(c => (c[1] || '') + (c[2] || '')).join(''),
            video: typeof r.video === 'boolean' ? r.video : null, editsPending: false,
            live: st.live, places: st.places, liveDate: st.liveDate, comment: r.disambiguation,
        };
    });
}

/**
 * Part 3: bucketing against all pairs on a dump, and example groups.
 * @param {Object} F
 * @param {string} file
 * @param {number} maxAll
 * @param {number} nExamples
 */
function bucketing(F, file, maxAll, nExamples, groupsOut) {
    const dump = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    const pool = recordsOfDump(F, dump);
    console.log(`\n${path.basename(file)}: ${pool.length} recordings (artist ${dump.artist}, dumped ${dump.env && dump.env.finished})`);
    const key = gs => gs.map(g => g.join(',')).sort();
    for (const cutoff of ['strict', 'normal', 'loose']) {
        const t0 = process.hrtime.bigint();
        const r = F._recDupGroups(pool, cutoff);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (!r) { console.log(`  ${cutoff}: over the pair cap, given up after ${ms.toFixed(0)} ms`); check(cutoff !== 'strict', `${cutoff}: within the pair cap`); continue; }
        const b = r.groups.map(g => g.members.slice().sort((x, y) => x - y));
        if (groupsOut && cutoff === 'strict') {
            fs.writeFileSync(groupsOut, JSON.stringify({ dump: file, cutoff, groups: r.groups.map(g => ({
                title: pool[g.members[0]].title, isrc: g.isrc, members: g.members.map(i => ({ gid: pool[i].gid, title: pool[i].title })),
            })) }, null, 1) + '\n');
        }
        const rows = b.reduce((n, g) => n + g.length, 0);
        const tiers = {};
        r.groups.forEach(g => { tiers[g.tier] = (tiers[g.tier] || 0) + 1; });
        let line = `  ${cutoff}: ${b.length} groups, ${rows} rows, ${r.pairs} candidate pairs, ${ms.toFixed(0)} ms, tiers ${JSON.stringify(tiers)}, ${r.apart.size} rows with a "kept apart"`;
        if (pool.length <= maxAll) {
            const t1 = process.hrtime.bigint();
            const a = allPairs(F, pool, cutoff);
            const ams = Number(process.hrtime.bigint() - t1) / 1e6;
            const ka = new Set(key(a)), kb = new Set(key(b));
            const missed = [...ka].filter(x => !kb.has(x)), extra = [...kb].filter(x => !ka.has(x));
            line += ` | all pairs: ${a.length} groups in ${ams.toFixed(0)} ms; missed ${missed.length}, extra ${extra.length}`;
            if (cutoff === 'strict') check(missed.length === 0 && extra.length === 0, `${path.basename(file)} strict: bucketed groups equal all pairs`);
            missed.slice(0, 5).forEach(x => { line += `\n      missed: ${x.split(',').map(i => JSON.stringify(pool[i].title)).join(' ~ ')}`; });
        } else {
            line += ` | all pairs skipped (${pool.length} > --max-all-pairs ${maxAll})`;
        }
        console.log(line);
        r.groups.slice().sort((x, y) => y.members.length - x.members.length).slice(0, nExamples).forEach(g => {
            const m = g.members.map(i => pool[i]);
            console.log(`      ${g.tier} ${g.isrc || g.signalsAll.join('+')}: ` + m.slice(0, 4).map(x => `${x.title} [${x.comment || '-'}] https://musicbrainz.org/recording/${x.gid}`).join(' | ') + (m.length > 4 ? ` … (${m.length})` : ''));
        });
    }
}

/** Entry point. */
function main() {
    const args = process.argv.slice(2);
    const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
    parity();
    const F = loadPort();
    vectors(F);
    const dir = path.join(ROOT, 'debug/probe-rec-dup');
    const dumps = args.includes('--vectors-only') ? []
        : opt('--dump') ? [opt('--dump')] : (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).map(f => path.join(dir, f)) : []);
    dumps.forEach(f => bucketing(F, f, Number(opt('--max-all-pairs', 12000)), Number(opt('--examples', 0)), opt('--groups-out')));
    console.log(failures ? `\n${failures} check(s) failed` : '\nall checks hold');
    process.exit(failures ? 1 : 0);
}

main();
