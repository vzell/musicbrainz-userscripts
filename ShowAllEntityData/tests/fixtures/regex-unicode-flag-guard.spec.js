'use strict';

// Source-level guard: no regex literal in the userscript or the library may
// put a character into a class that the class cannot hold as ONE member.
//
//   1. An astral code point (📊, 🔗, …) inside `[...]` without the `u` or `v`
//      flag. The class then holds the two UTF-16 halves separately and strips
//      the matching half from any OTHER emoji that shares it — "🔗 Links"
//      became "\uDD17 Links". tests/fixtures/header-emoji-surrogate.spec.js
//      shows the user-visible effect at one call site; this file covers every
//      call site, since the same strip regex is copied two dozen times.
//   2. A combining mark (U+FE0F, U+200D, any \p{M}) written right after
//      another class member. `[⚠️]` reads as "the ⚠️ emoji" but is two
//      members, ⚠ and U+FE0F, with or without `u`. Writing U+FE0F first in
//      the class keeps the set and drops the misreading.
//
// This is ESLint's `no-misleading-character-class`, restated here because
// ESLint is report-only (tests/README.org, "Lint") and `npm test` is not:
// the ratchet stops new hits only when someone runs it.

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const { test, expect } = require('../support/test');
const { USERSCRIPT_PATH, MB_LIBRARY_PATH } = require('../support/loadPage');

const COMBINING_RE = /^[\u200d\p{M}]$/u;

/**
 * Reads one code point of a regex pattern at `i`, decoding the `\uXXXX`,
 * `\u{X…}` and `\xXX` escapes. Any other escape (`\d`, `\-`, `\]`, `\p{…}`, …) is
 * returned with `cp: null`, so it counts as a class member that is not a
 * character this check cares about.
 *
 * @param {string} pattern
 * @param {number} i
 * @returns {{cp: (number|null), next: number}}
 */
function readCodePoint(pattern, i) {
    if (pattern[i] !== '\\') {
        const cp = pattern.codePointAt(i);
        return { cp, next: i + (cp > 0xffff ? 2 : 1) };
    }
    const m = /^\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))/.exec(pattern.slice(i));
    if (m) return { cp: parseInt(m[1] || m[2] || m[3], 16), next: i + m[0].length };
    const prop = /^\\[pP]\{[^}]*\}/.exec(pattern.slice(i));
    return { cp: null, next: i + (prop ? prop[0].length : 2) };
}

/**
 * Lists what makes a regex's character classes misleading (see the header
 * comment). Nested classes (`v` flag) are not in use and are not tracked.
 *
 * @param {string} pattern
 * @param {string} flags
 * @returns {string[]} one message per problem; empty when the regex is fine
 */
function misleadingClassProblems(pattern, flags) {
    const unicode = flags.includes('u') || flags.includes('v');
    const problems = [];
    let i = 0;
    while (i < pattern.length) {
        if (pattern[i] === '\\') { i += 2; continue; }
        if (pattern[i] !== '[') { i++; continue; }
        i++;
        if (pattern[i] === '^') i++;
        let prev = null;  // previous member's code point; null at the start or after a range dash
        let first = true;
        while (i < pattern.length && (pattern[i] !== ']' || first)) {
            first = false;
            if (pattern[i] === '-' && prev !== null) { prev = null; i++; continue; }
            const { cp, next } = readCodePoint(pattern, i);
            if (cp !== null && cp > 0xffff && !unicode) {
                problems.push(`U+${cp.toString(16).toUpperCase()} in a class without the u flag`);
            }
            if (cp !== null && prev !== null && COMBINING_RE.test(String.fromCodePoint(cp))) {
                problems.push(`combining U+${cp.toString(16).toUpperCase().padStart(4, '0')} after another class member`);
            }
            prev = cp === null ? -1 : cp;
            i = next;
        }
        i++;
    }
    return problems;
}

/**
 * Every regex literal in a source file, with its line number.
 *
 * @param {string} file
 * @returns {{line: number, pattern: string, flags: string}[]}
 */
function regexLiterals(file) {
    const src = fs.readFileSync(file, 'utf8');
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
    const out = [];
    walk.simple(ast, {
        Literal(node) {
            if (node.regex) out.push({ line: node.loc.start.line, ...node.regex });
        },
    });
    return out;
}

test.describe('regex character classes hold whole characters', () => {
    test('the checker itself flags both kinds and passes the fixed forms', () => {
        expect(misleadingClassProblems('[⇅▲▼📊0-9]', 'g')).toHaveLength(1);
        expect(misleadingClassProblems('[⇅▲▼📊0-9]', 'gu')).toEqual([]);
        expect(misleadingClassProblems('[🖼️📋]', 'gu')).toHaveLength(1);
        expect(misleadingClassProblems('[\\u25b6\\u26a0\\ufe0f]', 'g')).toHaveLength(1);
        expect(misleadingClassProblems('[\\ufe0f\\u25b6\\u26a0]', 'g')).toEqual([]);
        expect(misleadingClassProblems('[\\u{1F300}-\\u{1FAFF}]', 'u')).toEqual([]);
        // A property escape is one member, and a joiner written after it is not.
        expect(misleadingClassProblems('[\\u200d\\p{M}]', 'u')).toEqual([]);
        expect(misleadingClassProblems('[\\p{M}\\u200d]', 'u')).toHaveLength(1);
        // Outside a class, and escaped brackets, are not class members.
        expect(misleadingClassProblems('📊|\\[📊\\]', 'g')).toEqual([]);
    });

    for (const [label, file] of [['userscript', USERSCRIPT_PATH], ['library', MB_LIBRARY_PATH]]) {
        test(`${label}: no misleading character class`, () => {
            const literals = regexLiterals(file);
            const bad = literals
                .map((r) => ({ ...r, problems: misleadingClassProblems(r.pattern, r.flags) }))
                .filter((r) => r.problems.length)
                .map((r) => `${path.basename(file)}:${r.line} /${r.pattern}/${r.flags} — ${r.problems.join('; ')}`);
            expect(bad).toEqual([]);
        });
    }

    test('userscript: the guard is not vacuous', () => {
        // The header-decoration strip alone appears two dozen times; if the
        // walk stopped finding it, the test above would pass on nothing.
        const withAstralClass = regexLiterals(USERSCRIPT_PATH)
            .filter((r) => /\[[^\]]*[\u{10000}-\u{10FFFF}]/u.test(r.pattern));
        expect(withAstralClass.length).toBeGreaterThan(20);
    });
});
