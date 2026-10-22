/**
 * Source-text helpers for tools that analyse ShowAllEntityData.user.js as
 * TEXT (size, composition, comment stripping) rather than run it.
 *
 * Shared by scripts/measure-script-load-cost.js and scripts/size-report.js
 * (org/build-framework.org, org/userscript-size.org). Everything here works on
 * acorn TOKENS, never on regexes over the raw text: the userscript's CSS
 * contains `/* *\/` inside template literals and its URLs contain `//`, so a
 * regex would take string content for comments.
 *
 * Offsets are JavaScript string offsets (UTF-16 code units), as acorn reports
 * them. Convert to UTF-8 bytes with `Buffer.byteLength(src.slice(a, b))`.
 */

'use strict';

const acorn = require('acorn');

/**
 * Parse a script with acorn, collecting its comments and the ranges of its
 * string, template and regex tokens.
 *
 * `literals` (strings and template chunks) is what stripCommentsKeepLines()
 * needs: a line start inside one is string content, so its whitespace must
 * survive. `regexps` is kept apart because only escapeAboveLatin1() needs it.
 *
 * @param {string} src - Script source.
 * @returns {{ast: Object, comments: Array<{block: boolean, start: number, end: number}>, literals: Array<number[]>, regexps: Array<number[]>}}
 */
function parseWithTokens(src) {
    const comments = [];
    const literals = [];
    const regexps = [];
    const ast = acorn.parse(src, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        allowHashBang: true,
        onComment: (block, text, start, end) => comments.push({ block, start, end }),
        onToken: (tok) => {
            const label = tok.type.label;
            if (label === 'template' || label === 'string') literals.push([tok.start, tok.end]);
            else if (label === 'regexp') regexps.push([tok.start, tok.end]);
        },
    });
    return { ast, comments, literals, regexps };
}

/**
 * Whether `pos` lies inside one of the sorted, non-overlapping `ranges`.
 *
 * @param {Array<number[]>} ranges - Sorted [start, end) pairs.
 * @param {number} pos - Offset to test.
 * @returns {boolean}
 */
function insideRange(ranges, pos) {
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (pos < ranges[mid][0]) hi = mid - 1;
        else if (pos >= ranges[mid][1]) lo = mid + 1;
        else return true;
    }
    return false;
}

/**
 * Offset of the first character of 1-based line `line`.
 *
 * @param {string} src - Source text.
 * @param {number} line - 1-based line number.
 * @returns {number}
 */
function offsetOfLine(src, line) {
    let pos = 0;
    for (let l = 1; l < line; l++) {
        pos = src.indexOf('\n', pos) + 1;
        if (pos === 0) return src.length;
    }
    return pos;
}

/**
 * Offset of the line that opens the userscript's IIFE (`(function…`), i.e.
 * the end of the header, licence and credits block that a publish copy keeps
 * verbatim.
 *
 * @param {string} src - Userscript source.
 * @returns {number}
 */
function iifeLineOffset(src) {
    const idx = src.slice(0, 20000).split('\n').findIndex(l => l.startsWith('(function'));
    if (idx < 0) throw new Error('no line starting with "(function" in the first 20,000 characters');
    return offsetOfLine(src, idx + 1);
}

/**
 * Remove comments and leading indentation from `src`, keeping every newline
 * so line numbers stay 1:1. Everything before `keepFrom` is copied verbatim
 * (the ==UserScript== header and the credits block). A block comment becomes
 * its own newlines, or one space if it had none, so ASI and token boundaries
 * do not change.
 *
 * @param {string} src - Script source.
 * @param {number} keepFrom - Offset before which nothing is touched.
 * @returns {string}
 */
function stripCommentsKeepLines(src, keepFrom) {
    const { comments, literals } = parseWithTokens(src);
    const out = [];
    let ci = 0;
    let chunkStart = 0;
    let atLineStart = true;
    let i = 0;
    while (ci < comments.length && comments[ci].start < keepFrom) ci++;
    while (i < src.length) {
        if (i < keepFrom) {
            i = keepFrom;
            atLineStart = true;
            continue;
        }
        if (ci < comments.length && i === comments[ci].start) {
            out.push(src.slice(chunkStart, i));
            const body = src.slice(comments[ci].start, comments[ci].end);
            const newlines = body.split('\n').length - 1;
            out.push(comments[ci].block ? (newlines ? '\n'.repeat(newlines) : ' ') : '');
            i = comments[ci].end;
            chunkStart = i;
            ci++;
            atLineStart = false;
            continue;
        }
        const ch = src[i];
        if (atLineStart && (ch === ' ' || ch === '\t') && !insideRange(literals, i)) {
            out.push(src.slice(chunkStart, i));
            i++;
            chunkStart = i;
            continue;
        }
        atLineStart = ch === '\n';
        i++;
    }
    out.push(src.slice(chunkStart));
    return out.join('');
}

/**
 * Ranges of the quasis (literal chunks) of every TAGGED template in `ast`.
 * A tag can read `.raw`, so writing an escape there would change what it
 * sees; escapeAboveLatin1() refuses to touch them.
 *
 * @param {Object} ast - acorn Program node.
 * @returns {Array<number[]>} Sorted [start, end) pairs.
 */
function taggedQuasiRanges(ast) {
    const ranges = [];
    const visit = (node) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'TaggedTemplateExpression') {
            node.quasi.quasis.forEach(q => ranges.push([q.start, q.end]));
        }
        for (const key of Object.keys(node)) {
            const v = node[key];
            if (Array.isArray(v)) v.forEach(visit);
            else if (v && typeof v.type === 'string') visit(v);
        }
    };
    visit(ast);
    return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * Rewrite `src` so that it has no character above U+00FF and can therefore be
 * held as a ONE-byte string by V8/Blink (one such character anywhere makes the
 * whole source two-byte).
 *
 * Inside string, template and regex tokens each UTF-16 code unit above U+00FF
 * becomes `\uXXXX`: a valid escape in all three, and a surrogate pair written
 * as two escapes denotes the same code point with or without the `u` flag.
 * Inside comments such a character becomes `?` (comments carry no meaning;
 * only the kept header and credits block still has comments in a stripped
 * copy). Anywhere else (an identifier, a tagged template's raw text) it
 * throws, because no escape there is guaranteed to mean the same thing.
 *
 * @param {string} src - Script source.
 * @returns {{source: string, escaped: number, replacedInComments: number}}
 */
function escapeAboveLatin1(src) {
    const { ast, comments, literals, regexps } = parseWithTokens(src);
    const tokens = literals.concat(regexps).sort((a, b) => a[0] - b[0]);
    const commentRanges = comments.map(c => [c.start, c.end]);
    const tagged = taggedQuasiRanges(ast);
    const out = [];
    let chunkStart = 0;
    let escaped = 0;
    let replacedInComments = 0;
    for (let i = 0; i < src.length; i++) {
        const code = src.charCodeAt(i);
        if (code <= 0xff) continue;
        let replacement;
        if (insideRange(tagged, i)) {
            throw new Error(`character U+${code.toString(16)} inside a tagged template at offset ${i}`);
        } else if (insideRange(tokens, i)) {
            replacement = '\\u' + code.toString(16).padStart(4, '0');
            escaped++;
        } else if (insideRange(commentRanges, i)) {
            replacement = '?';
            replacedInComments++;
        } else {
            throw new Error(`character U+${code.toString(16)} outside any literal or comment at offset ${i}`);
        }
        out.push(src.slice(chunkStart, i), replacement);
        chunkStart = i + 1;
    }
    out.push(src.slice(chunkStart));
    const source = out.join('');
    parseWithTokens(source);
    return { source, escaped, replacedInComments };
}

/**
 * The FunctionExpression of the file's top-level IIFE.
 *
 * @param {Object} ast - acorn Program node.
 * @returns {Object} acorn FunctionExpression node.
 */
function findIife(ast) {
    for (const stmt of ast.body) {
        const call = stmt.type === 'ExpressionStatement' ? stmt.expression : null;
        const fn = call && call.type === 'CallExpression' ? call.callee : null;
        if (fn && fn.type === 'FunctionExpression') return fn;
    }
    throw new Error('no top-level IIFE found');
}

/**
 * Body statements of the file's top-level IIFE, as [start, end) ranges.
 *
 * @param {Object} ast - acorn Program node.
 * @returns {Array<number[]>}
 */
function iifeStatementRanges(ast) {
    return findIife(ast).body.body.map(s => [s.start, s.end]);
}

/**
 * Size facts of one source text. `lines` counts like `wc -l` plus a last
 * line without a newline, so a file that ends in a newline is not counted
 * one line long.
 *
 * @param {string} source - Source text.
 * @returns {{bytes: number, chars: number, charsAboveFF: number, lines: number}}
 */
function sizeFacts(source) {
    let above = 0;
    for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) > 0xff) above++;
    const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
    return {
        bytes: Buffer.byteLength(source),
        chars: source.length,
        charsAboveFF: above,
        lines,
    };
}

module.exports = {
    parseWithTokens,
    insideRange,
    offsetOfLine,
    iifeLineOffset,
    stripCommentsKeepLines,
    taggedQuasiRanges,
    escapeAboveLatin1,
    findIife,
    iifeStatementRanges,
    sizeFacts,
};
