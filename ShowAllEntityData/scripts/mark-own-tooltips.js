'use strict';

/**
 * One-off conversion for the rich-tooltip engine (feature/rich-tooltips-liner):
 * marks every tooltip ShowAllEntityData sets itself, so the engine can show it
 * as a rich "Liner notes" card while MusicBrainz's own and other userscripts'
 * `title`s stay native.
 *
 * Parses ShowAllEntityData.user.js with acorn and rewrites:
 *
 *   X.title = EXPR           →  _setTip(X, EXPR)
 *       every AssignmentExpression whose target is a non-computed `.title`
 *       member, wherever it sits (statement, `if`, ternary, one-liner).
 *       `_setTip()` assigns the title, stamps `data-mb-tip`, and returns
 *       EXPR, so an assignment used as a value keeps its value.
 *   title="…" in a string or template literal  →  data-mb-tip title="…"
 *       an attribute in HTML the script builds. A `[title="…"]` CSS
 *       selector (preceded by `[`) is left alone.
 *
 * Skipped on purpose, and listed in the report:
 *   - assignments inside the two tooltip engines, which stash and restore a
 *     title while their own popup shows (`_initStatTooltip`,
 *     `_initRelTooltipListeners`);
 *   - assignments inside `_setTip` itself.
 *
 * Usage:  node scripts/mark-own-tooltips.js            # dry run, report only
 *         node scripts/mark-own-tooltips.js --apply    # write the file
 *
 * The edits are applied back to front by source offset, so earlier offsets
 * stay valid. The rewritten file is parsed again before it is written; a
 * parse failure aborts without touching it.
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const FILE = path.join(__dirname, '..', 'ShowAllEntityData.user.js');
const SKIP_FUNCS = new Set(['_initStatTooltip', '_initRelTooltipListeners', '_setTip']);
const APPLY = process.argv.includes('--apply');

const src = fs.readFileSync(FILE, 'utf8');
const parseOpts = { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true };
const ast = acorn.parse(src, parseOpts);

/** @type {{start:number,end:number,text:string,line:number,kind:string,ctx:string}[]} */
const edits = [];
const skipped = [];
const valueContexts = [];

/**
 * Name of the innermost named function enclosing the node, from the ancestor
 * chain acorn-walk passes to an `ancestor` visitor.
 *
 * @param {object[]} ancestors
 * @returns {string|null}
 */
function enclosingFunctionName(ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i];
        if (a.type === 'FunctionDeclaration' && a.id) return a.id.name;
        if ((a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression')) {
            const p = ancestors[i - 1];
            if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
            if (a.id) return a.id.name;
        }
    }
    return null;
}

walk.ancestor(ast, {
    AssignmentExpression(node, _state, ancestors) {
        const l = node.left;
        if (node.operator !== '=' || l.type !== 'MemberExpression' || l.computed) return;
        if (l.property.type !== 'Identifier' || l.property.name !== 'title') return;
        const line = node.loc.start.line;
        const fn = enclosingFunctionName(ancestors);
        if (fn && SKIP_FUNCS.has(fn)) {
            skipped.push(`${line}: in ${fn}()  ${src.slice(node.start, node.end).split('\n')[0]}`);
            return;
        }
        const parent = ancestors[ancestors.length - 2];
        if (!parent || parent.type !== 'ExpressionStatement') {
            valueContexts.push(`${line}: parent ${parent && parent.type}  ${src.slice(node.start, node.end).split('\n')[0]}`);
        }
        const obj = src.slice(l.object.start, l.object.end);
        const rhs = src.slice(node.right.start, node.right.end);
        edits.push({
            start: node.start, end: node.end, line, kind: 'assign',
            text: `_setTip(${obj}, ${rhs})`,
            ctx: src.slice(node.start, node.end).split('\n')[0],
        });
    },
});

/**
 * Collects `title="` attribute positions inside one string/template chunk.
 *
 * @param {string} raw - The chunk's source text.
 * @param {number} offset - Its start offset in the file.
 * @param {number} line - Its start line, for the report.
 */
function scanChunk(raw, offset, line) {
    const re = /(^|[\s"'])title="/g;
    let m;
    while ((m = re.exec(raw))) {
        const at = m.index + m[1].length;
        if (raw.slice(Math.max(0, at - 1), at) === '[') continue;
        // Prose QUOTING MusicBrainz markup, e.g. a column description
        // "the primary alias (<i title="Primary alias">), split from …":
        // the tag opens right after "(", which generated markup never does.
        const lt = raw.lastIndexOf('<', at);
        if (lt > 0 && raw[lt - 1] === '(') {
            skipped.push(`${line}: quoted markup in prose  …${raw.slice(Math.max(0, lt - 30), at + 30)}…`);
            continue;
        }
        if (raw.slice(at - 12 > 0 ? at - 12 : 0, at).includes('data-mb-tip')) continue;
        edits.push({
            start: offset + at, end: offset + at, line, kind: 'attr', text: 'data-mb-tip ',
            ctx: raw.slice(Math.max(0, at - 30), at + 40).replace(/\n/g, ' '),
        });
    }
}

walk.full(ast, (node) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
        scanChunk(src.slice(node.start, node.end), node.start, node.loc.start.line);
    } else if (node.type === 'TemplateElement') {
        scanChunk(src.slice(node.start, node.end), node.start, node.loc.start.line);
    }
});

// Report.
const assigns = edits.filter((e) => e.kind === 'assign');
const attrs = edits.filter((e) => e.kind === 'attr');
console.log(`.title assignments to rewrite: ${assigns.length}`);
assigns.forEach((e) => console.log(`  ${e.line}: ${e.ctx.slice(0, 110)}`));
console.log(`\ntitle="…" attributes to tag: ${attrs.length}`);
attrs.forEach((e) => console.log(`  ${e.line}: …${e.ctx}…`));
console.log(`\nskipped (tooltip engines): ${skipped.length}`);
skipped.forEach((s) => console.log(`  ${s.slice(0, 120)}`));
console.log(`\nassignments used as a value (not a plain statement): ${valueContexts.length}`);
valueContexts.forEach((s) => console.log(`  ${s.slice(0, 120)}`));

if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    process.exit(0);
}

let out = src;
edits.sort((a, b) => b.start - a.start || b.end - a.end);
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
try {
    acorn.parse(out, parseOpts);
} catch (err) {
    console.error(`\nRewritten source does not parse (${err.message}) — file NOT written.`);
    process.exit(1);
}
fs.writeFileSync(FILE, out);
console.log(`\nWrote ${path.basename(FILE)}: ${assigns.length} assignments, ${attrs.length} attributes.`);
