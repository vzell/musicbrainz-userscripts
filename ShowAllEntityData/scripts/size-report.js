/**
 * Where do the userscript's bytes go, and which parts drove its growth?
 * (org/userscript-size.org.)
 *
 * Read-only. Parses ShowAllEntityData.user.js with acorn (tokens, never
 * regexes over the raw text) and prints:
 *
 *   composition   comments, strings, the CSS template literals handed to
 *                 GM_addStyle (and the CSS comments inside them), regexes,
 *                 indentation and the rest (code); plus the line-based
 *                 comment share org/build-framework.org used on 2026-10-10
 *                 (a line is a comment line if, after leading whitespace, it
 *                 starts with //, /* or *)
 *   subsystems    every top-level statement of the IIFE assigned to ONE
 *                 subsystem by the name rules in
 *                 scripts/size-report-subsystems.json (names are stable
 *                 across versions; line numbers are not). A statement's
 *                 bytes run from the end of the previous statement, so its
 *                 JSDoc and the comments above it count with it. Members of
 *                 two big literals are split further: configSchema keys and
 *                 pageDefinitions entries (an entry with `host:` is a
 *                 foreign-site pageType)
 *   growth        the subsystem table for several git revisions side by side
 *
 * The buckets must add up to the file's size; the script exits 1 if they do
 * not.
 *
 *     node scripts/size-report.js [--rev <rev>,…] [--out file.json]
 *         [--unattributed 30] [--rules scripts/size-report-subsystems.json]
 *
 * Without --rev it reads the working copy; `--rev WORKTREE` names the working
 * copy inside a list.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseWithTokens, insideRange, findIife, sizeFacts } = require('./lib/userscript-source');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(PROJECT_ROOT, '..');
const USERSCRIPT_PATH = path.join(PROJECT_ROOT, 'ShowAllEntityData.user.js');
const USERSCRIPT_REPO_PATH = 'ShowAllEntityData/ShowAllEntityData.user.js';
const DEFAULT_RULES = path.join(__dirname, 'size-report-subsystems.json');

/**
 * Parse `--name value` pairs from the command line.
 *
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {{revs: string[], out: string|null, unattributed: number, rules: string}}
 */
function parseArgs(argv) {
    const opts = { revs: ['WORKTREE'], out: null, unattributed: 0, rules: DEFAULT_RULES };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        const val = argv[i + 1];
        if (val === undefined) throw new Error(`${key} needs a value`);
        if (key === '--rev') opts.revs = val.split(',');
        else if (key === '--out') opts.out = val;
        else if (key === '--unattributed') opts.unattributed = Number(val);
        else if (key === '--rules') opts.rules = val;
        else throw new Error(`unknown argument ${key}`);
    }
    return opts;
}

/**
 * The userscript text of a revision (`WORKTREE` = the working copy), with
 * its version and commit date.
 *
 * @param {string} rev - Git revision or `WORKTREE`.
 * @returns {{rev: string, version: string, date: string, source: string}}
 */
function readSource(rev) {
    const source = rev === 'WORKTREE'
        ? fs.readFileSync(USERSCRIPT_PATH, 'utf8')
        : execFileSync('git', ['show', `${rev}:${USERSCRIPT_REPO_PATH}`], {
            cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024,
        }).toString('utf8');
    const m = source.slice(0, 2000).match(/\/\/ @version\s+(\S+)/);
    const date = rev === 'WORKTREE'
        ? 'working copy'
        : execFileSync('git', ['log', '-1', '--format=%cs', rev], { cwd: REPO_ROOT }).toString().trim();
    return { rev, version: m ? m[1] : 'unknown', date, source };
}

/**
 * Prefix sums of UTF-8 bytes per JavaScript offset, so that the byte size of
 * any range is two lookups instead of a re-encode.
 *
 * @param {string} src - Source text.
 * @returns {Uint32Array} cum[i] = bytes of src.slice(0, i).
 */
function byteIndex(src) {
    const cum = new Uint32Array(src.length + 1);
    for (let i = 0; i < src.length; i++) {
        const c = src.charCodeAt(i);
        let b;
        if (c < 0x80) b = 1;
        else if (c < 0x800) b = 2;
        else if (c >= 0xd800 && c <= 0xdbff) b = 4;   // a surrogate pair is 4 bytes, counted on the lead
        else if (c >= 0xdc00 && c <= 0xdfff) b = 0;
        else b = 3;
        cum[i + 1] = cum[i] + b;
    }
    return cum;
}

/**
 * Names a top-level statement declares or is about, for the name rules:
 * function and class names, every declared variable, the callee of a call
 * statement (`GM_addStyle`, `initSidebarCollapse`), the target of an
 * assignment (`ctrlMFunctionMap`), and `__saTest` for the test hook block.
 *
 * @param {Object} stmt - acorn statement node.
 * @param {string} src - Source text.
 * @returns {string[]}
 */
function statementNames(stmt, src) {
    if (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') return [stmt.id.name];
    if (stmt.type === 'VariableDeclaration') {
        // `const style = GM_addStyle(…)` (the global stylesheet until 9.99.1180-ish)
        // is the same statement as a bare `GM_addStyle(…)` call later on.
        const css = stmt.declarations.some(d => d.init && d.init.type === 'CallExpression'
            && d.init.callee.type === 'Identifier' && d.init.callee.name === 'GM_addStyle');
        if (css) return ['GM_addStyle'];
        return stmt.declarations.flatMap(d => (d.id.type === 'Identifier' ? [d.id.name] : []));
    }
    const text = src.slice(stmt.start, Math.min(stmt.end, stmt.start + 400));
    if (stmt.type === 'IfStatement' && /__SA_TEST_MODE__/.test(text)) return ['__saTest'];
    if (stmt.type === 'ExpressionStatement') {
        let e = stmt.expression;
        if (e.type === 'AwaitExpression') e = e.argument;
        if (e.type === 'CallExpression') {
            const c = e.callee;
            if (c.type === 'Identifier') return [c.name];
            if (c.type === 'MemberExpression' && c.object.type === 'Identifier') return [`${c.object.name}.${c.property.name || ''}`];
            if (c.type === 'FunctionExpression' || c.type === 'ArrowFunctionExpression') return ['<iife>'];
        }
        if (e.type === 'AssignmentExpression') {
            const t = e.left;
            if (t.type === 'Identifier') return [t.name];
            if (t.type === 'MemberExpression') {
                let o = t;
                while (o.type === 'MemberExpression') o = o.object;
                if (o.type === 'Identifier') return [o.name];
            }
        }
    }
    return [`<${stmt.type}>`];
}

/**
 * Compile the rules file: each subsystem's name patterns, exclusions and
 * member-split patterns as RegExps.
 *
 * @param {string} file - Rules JSON path.
 * @returns {{subsystems: Array<Object>, fallback: string, memberSplits: Object}}
 */
function loadRules(file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const re = (list) => (list || []).map(p => new RegExp(p));
    return {
        fallback: raw.fallback,
        subsystems: raw.subsystems.map(s => ({ ...s, namesRe: re(s.names), excludeRe: re(s.exclude) })),
        memberSplits: Object.fromEntries(Object.entries(raw.memberSplits || {}).map(([name, splits]) => [
            name, splits.map(sp => ({ ...sp, keysRe: re(sp.keys) })),
        ])),
        labels: Object.fromEntries(raw.subsystems.map(s => [s.id, s.label]).concat([[raw.fallback, raw.fallbackLabel]])),
    };
}

/**
 * The subsystem a list of names belongs to: the first subsystem (in file
 * order) one of whose patterns matches a name its exclusions do not.
 *
 * @param {string[]} names - statementNames() result.
 * @param {Object} rules - loadRules() result.
 * @returns {string} Subsystem id.
 */
function classify(names, rules) {
    for (const s of rules.subsystems) {
        for (const n of names) {
            if (s.excludeRe.some(r => r.test(n))) continue;
            if (s.namesRe.some(r => r.test(n))) return s.id;
        }
    }
    return rules.fallback;
}

/**
 * The literal a member split works on: the object/array initialiser of
 * `const <name> = …`.
 *
 * @param {Object} stmt - acorn VariableDeclaration.
 * @returns {Object|null} ObjectExpression or ArrayExpression node.
 */
function splitTarget(stmt) {
    const d = stmt.declarations && stmt.declarations[0];
    const init = d && d.init;
    return init && (init.type === 'ObjectExpression' || init.type === 'ArrayExpression') ? init : null;
}

/**
 * The key a member split matches against: a property's key for an object,
 * and for an array entry the value of its `type:` property, prefixed with
 * `host:` when the entry also has a `host:` property.
 *
 * @param {Object} member - Property or array element node.
 * @returns {string}
 */
function memberKey(member) {
    if (member.type === 'Property') return member.key.name || member.key.value || '';
    if (member.type === 'ObjectExpression') {
        const prop = (k) => member.properties.find(p => p.type === 'Property' && (p.key.name || p.key.value) === k);
        const type = prop('type');
        const typeName = type && type.value.type === 'Literal' ? String(type.value.value) : '';
        return (prop('host') ? 'host:' : '') + typeName;
    }
    return '';
}

/**
 * Analyse one source text.
 *
 * @param {{rev: string, version: string, date: string, source: string}} input - readSource() result.
 * @param {Object} rules - loadRules() result.
 * @returns {Object} The report for this revision.
 */
function analyse(input, rules) {
    const src = input.source;
    const lineAt = lineLookup(src);
    const cum = byteIndex(src);
    const span = (a, b) => cum[b] - cum[a];
    const { ast, comments, literals, regexps } = parseWithTokens(src);
    const total = cum[src.length];

    // --- composition -----------------------------------------------------
    const commentBytes = comments.reduce((n, c) => n + span(c.start, c.end), 0);
    const literalBytes = literals.reduce((n, [a, b]) => n + span(a, b), 0);
    const regexBytes = regexps.reduce((n, [a, b]) => n + span(a, b), 0);
    let indentBytes = 0;
    let lineCommentBytes = 0;
    let blankLines = 0;
    let commentLines = 0;
    let pos = 0;
    for (const line of src.split('\n')) {
        const lineBytes = Buffer.byteLength(line) + 1;
        const lead = line.length - line.trimStart().length;
        const t = line.trimStart();
        if (!t) blankLines++;
        else if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
            commentLines++;
            lineCommentBytes += lineBytes;
        }
        // Indentation outside string/template content only (a multi-line
        // template literal's leading spaces are part of its value).
        if (lead && t && !insideRange(literals, pos)) indentBytes += lead;
        pos += line.length + 1;
    }
    let cssBytes = 0;
    let cssCommentBytes = 0;
    const visit = (node) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'GM_addStyle'
            && node.arguments[0] && node.arguments[0].type === 'TemplateLiteral') {
            const tl = node.arguments[0];
            cssBytes += span(tl.start, tl.end);
            for (const q of tl.quasis) {
                const text = src.slice(q.start, q.end);
                for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) cssCommentBytes += Buffer.byteLength(m[0]);
            }
        }
        for (const key of Object.keys(node)) {
            const v = node[key];
            if (Array.isArray(v)) v.forEach(visit);
            else if (v && typeof v.type === 'string') visit(v);
        }
    };
    visit(ast);

    // --- subsystems ------------------------------------------------------
    const iife = findIife(ast);
    const body = iife.body.body;
    const buckets = {};
    const add = (id, bytes, codeBytes, item) => {
        const b = buckets[id] || (buckets[id] = { bytes: 0, codeBytes: 0, statements: 0, items: [] });
        b.bytes += bytes;
        b.codeBytes += codeBytes;
        b.statements++;
        if (item) b.items.push(item);
    };
    // Comment bytes inside [a, b), so a bucket can also say how much of it is
    // code: a prefix sum over a per-offset "comment byte" mark.
    const commentCum = new Uint32Array(src.length + 1);
    {
        let ci = 0;
        for (let i = 0; i < src.length; i++) {
            while (ci < comments.length && comments[ci].end <= i) ci++;
            const inComment = ci < comments.length && comments[ci].start <= i;
            commentCum[i + 1] = commentCum[i] + (inComment ? cum[i + 1] - cum[i] : 0);
        }
    }
    const commentIn = (a, b) => commentCum[b] - commentCum[a];
    const bodyStart = iife.body.start + 1;   // after the IIFE's `{`
    add('header', span(0, bodyStart), span(0, bodyStart) - commentIn(0, bodyStart), null);
    let prev = bodyStart;
    for (const stmt of body) {
        const names = statementNames(stmt, src);
        const id = classify(names, rules);
        const splits = names.length === 1 ? rules.memberSplits[names[0]] : null;
        const target = splits ? splitTarget(stmt) : null;
        if (target) {
            const members = target.type === 'ObjectExpression' ? target.properties : target.elements;
            let rest = prev;
            let restBytes = 0;
            let restCode = 0;
            let mPrev = prev;
            for (const member of members) {
                if (!member) continue;
                const key = memberKey(member);
                const hit = splits.find(sp => sp.keysRe.some(r => r.test(key)));
                if (hit) {
                    add(hit.subsystem, span(mPrev, member.end), span(mPrev, member.end) - commentIn(mPrev, member.end),
                        { name: `${names[0]}.${key}`, bytes: span(mPrev, member.end), line: lineAt(member.start) });
                    restBytes += span(rest, mPrev);
                    restCode += span(rest, mPrev) - commentIn(rest, mPrev);
                    rest = member.end;
                }
                mPrev = member.end;
            }
            restBytes += span(rest, stmt.end);
            restCode += span(rest, stmt.end) - commentIn(rest, stmt.end);
            add(id, restBytes, restCode, { name: names[0], bytes: restBytes, line: lineAt(stmt.start) });
        } else {
            const bytes = span(prev, stmt.end);
            add(id, bytes, bytes - commentIn(prev, stmt.end), { name: names.join(','), bytes, line: lineAt(stmt.start) });
        }
        prev = stmt.end;
    }
    add('header', span(prev, src.length), span(prev, src.length) - commentIn(prev, src.length), null);

    const sum = Object.values(buckets).reduce((n, b) => n + b.bytes, 0);
    return {
        rev: input.rev,
        version: input.version,
        date: input.date,
        size: { ...sizeFacts(src), commentLines, blankLines },
        composition: {
            totalBytes: total,
            commentBytes,
            lineCommentBytes,
            literalBytes,
            cssBytes,
            cssCommentBytes,
            regexBytes,
            indentBytes,
            otherCodeBytes: total - commentBytes - literalBytes - regexBytes - indentBytes,
        },
        subsystems: Object.fromEntries(Object.entries(buckets).map(([id, b]) => [id, {
            label: rules.labels[id] || id,
            bytes: b.bytes,
            codeBytes: b.codeBytes,
            statements: b.statements,
            largest: b.items.sort((x, y) => y.bytes - x.bytes).slice(0, 400),
        }])),
        bucketSum: sum,
        balanced: sum === total,
    };
}

/**
 * A lookup from offset to 1-based line number, by binary search over the
 * line starts.
 *
 * @param {string} src - Source text.
 * @returns {function(number): number}
 */
function lineLookup(src) {
    const starts = [0];
    for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
    return (pos) => {
        let lo = 0;
        let hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= pos) lo = mid;
            else hi = mid - 1;
        }
        return lo + 1;
    };
}

/**
 * Format bytes as KB with one decimal and a thousands separator.
 *
 * @param {number} n - Bytes.
 * @returns {string}
 */
function kb(n) {
    return (n / 1024).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Percentage with one decimal.
 *
 * @param {number} part - Part.
 * @param {number} whole - Whole.
 * @returns {string}
 */
function pct(part, whole) {
    return (100 * part / whole).toFixed(1);
}

/**
 * Print one org table with aligned columns.
 *
 * @param {string[]} head - Header cells.
 * @param {string[][]} rows - Body rows.
 * @returns {void}
 */
function printTable(head, rows) {
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
    const line = (cells) => '| ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
    console.log(line(head));
    console.log('|' + widths.map(w => '-'.repeat(w + 2)).join('+') + '|');
    rows.forEach(r => console.log(line(r)));
}

(() => {
    const opts = parseArgs(process.argv.slice(2));
    const rules = loadRules(opts.rules);
    const reports = opts.revs.map(rev => analyse(readSource(rev), rules));
    let ok = true;
    for (const r of reports) {
        const c = r.composition;
        console.log(`* ${r.version} (${r.rev}, ${r.date}): ${c.totalBytes.toLocaleString('en-US')} bytes, `
            + `${r.size.lines.toLocaleString('en-US')} lines, ${r.size.charsAboveFF.toLocaleString('en-US')} chars above U+00FF\n`);
        printTable(['Kind', 'KB', '% of bytes'], [
            ['comments (tokens)', kb(c.commentBytes), pct(c.commentBytes, c.totalBytes)],
            ['comment lines (2026-10-10 definition)', kb(c.lineCommentBytes), pct(c.lineCommentBytes, c.totalBytes)],
            ['strings and templates', kb(c.literalBytes), pct(c.literalBytes, c.totalBytes)],
            ['  of which GM_addStyle CSS templates', kb(c.cssBytes), pct(c.cssBytes, c.totalBytes)],
            ['  of which CSS comments inside them', kb(c.cssCommentBytes), pct(c.cssCommentBytes, c.totalBytes)],
            ['regex literals', kb(c.regexBytes), pct(c.regexBytes, c.totalBytes)],
            ['indentation outside literals', kb(c.indentBytes), pct(c.indentBytes, c.totalBytes)],
            ['everything else (code)', kb(c.otherCodeBytes), pct(c.otherCodeBytes, c.totalBytes)],
        ]);
        console.log('');
        const rows = Object.entries(r.subsystems).sort((a, b) => b[1].bytes - a[1].bytes).map(([id, s]) => [
            s.label, kb(s.bytes), pct(s.bytes, c.totalBytes), kb(s.codeBytes), String(s.statements),
        ]);
        printTable(['Subsystem', 'KB', '%', 'KB without comments', 'statements'], rows);
        console.log(`\nbuckets add up: ${r.balanced ? 'yes' : `NO (${r.bucketSum} vs ${c.totalBytes})`}\n`);
        if (!r.balanced) ok = false;
        if (opts.unattributed) {
            const other = r.subsystems[rules.fallback];
            console.log(`Largest unattributed statements (${rules.fallback}):`);
            (other ? other.largest : []).slice(0, opts.unattributed).forEach(i => console.log(`  ${kb(i.bytes)} KB  ${i.name}  (line ${i.line})`));
            console.log('');
        }
    }
    if (reports.length > 1) {
        const ids = [...new Set(reports.flatMap(r => Object.keys(r.subsystems)))];
        const last = reports[reports.length - 1];
        ids.sort((a, b) => (last.subsystems[b] ? last.subsystems[b].bytes : 0) - (last.subsystems[a] ? last.subsystems[a].bytes : 0));
        const head = ['Subsystem (KB)'].concat(reports.map(r => `${r.version.split('+')[0]} (${r.date})`), ['growth KB', 'share of growth %']);
        const first = reports[0];
        const growth = last.composition.totalBytes - first.composition.totalBytes;
        const rows = ids.map((id) => {
            const v = reports.map(r => (r.subsystems[id] ? r.subsystems[id].bytes : 0));
            const g = v[v.length - 1] - v[0];
            return [rules.labels[id] || id].concat(v.map(kb), [kb(g), pct(g, growth)]);
        });
        rows.push(['total'].concat(reports.map(r => kb(r.composition.totalBytes)), [kb(growth), '100.0']));
        console.log('* Growth by subsystem\n');
        printTable(head, rows);
        console.log('');
    }
    if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(reports, null, 2) + '\n');
    if (!ok) process.exit(1);
})();
