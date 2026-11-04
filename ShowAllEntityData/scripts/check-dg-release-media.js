#!/usr/bin/env node
'use strict';
/**
 * Runs the Discogs Tracks view's splitter on saved release answers and
 * prints, per release, its media (kind, key, title, track count), the
 * sections, and every release credit whose `tracks` spec could not be
 * placed — the cases that stay in "Release credits" with their spec.
 *
 * The functions are read from ShowAllEntityData.user.js itself
 * (`_dgReleaseMedia()`, `_dgExpandTrackSpec()`, `_dgSplitRoles()`,
 * `_dgRoleColumn()`, `_DG_OTHER_ROLE_RE`, `_extDiscogsCredit()`,
 * `_extDiscogsName()`, `_dgFormatUnits()`), so this checks the shipped code.
 *
 * Answers: scripts/probe-dg-release-shapes.py writes them (release-<id>.json).
 *
 * usage: node scripts/check-dg-release-media.js DIR [--roles]
 *   --roles  also print every role and the column it lands in.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'ShowAllEntityData.user.js'), 'utf8');

/**
 * The source of one top-level declaration (`function name(` or `const name =`),
 * up to its closing brace or semicolon at the same depth (strings and
 * regex literals in these functions hold no unbalanced braces).
 *
 * @param {string} name
 * @returns {string}
 */
function grab(name) {
    const re = new RegExp(`^    (?:function ${name}\\(|const ${name} = )`, 'm');
    const m = re.exec(SRC);
    if (!m) throw new Error(`not found: ${name}`);
    let i = m.index;
    let depth = 0;
    let seen = false;
    for (; i < SRC.length; i++) {
        const ch = SRC[i];
        if (ch === '{' || ch === '(' || ch === '[') { depth++; seen = true; }
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
        if (seen && depth === 0 && (ch === '}' || ch === ';' || ch === ')')) {
            if (SRC[i] === '}' && SRC.slice(m.index, m.index + 10).startsWith('    functi')) break;
            if (SRC[i + 1] === ';' || ch === ';') { i += ch === ';' ? 0 : 1; break; }
        }
    }
    return SRC.slice(m.index, i + 1);
}

const names = ['_extDiscogsName', '_extDiscogsCredit', '_DG_OTHER_ROLE_RE', '_dgRoleColumn', '_dgSplitRoles', '_dgFormatUnits',
    '_dgReleaseMedia', '_dgExpandTrackSpec'];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(names.map(grab).join('\n') + `\nthis.api = { ${names.join(', ')} };`, ctx);
const api = ctx.api;

const dir = process.argv[2];
const roles = process.argv.includes('--roles');
const roleCols = new Map();
let unplaced = 0;
let ranged = 0;
for (const f of fs.readdirSync(dir).filter(x => /^release-\d+\.json$/.test(x)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const m = api._dgReleaseMedia(d);
    const units = api._dgFormatUnits(d.formats).map(u => u.label);
    const media = m.media.map(x => `${x.kind}${x.key ? `:${x.key}` : ''}${x.sides.length ? `[${x.sides.join('')}]` : ''}` +
        `${x.title ? ` "${x.title.slice(0, 24)}"` : ''} ×${x.tracks.length}`);
    const sections = [...new Set(m.tracks.map(t => t.section).filter(Boolean))];
    const bad = [];
    (d.extraartists || []).filter(a => a && a.name && String(a.tracks || '').trim()).forEach((a) => {
        ranged++;
        if (!api._dgExpandTrackSpec(a.tracks, m)) { bad.push(a.tracks); unplaced++; }
    });
    console.log(`${f} | ${String(d.title || '').slice(0, 30)} | units ${units.length} ${[...new Set(units)].join('/')} | media ${m.media.length}: ` +
        `${media.slice(0, 6).join(', ')}${media.length > 6 ? ' …' : ''}${sections.length ? ` | sections ${sections.length}` : ''}` +
        `${bad.length ? ` | UNPLACED ${JSON.stringify([...new Set(bad)].slice(0, 4))}` : ''}`);
    if (roles) {
        const all = (d.extraartists || []).concat(...(d.tracklist || []).map(t => (t.extraartists || []).concat(...(t.sub_tracks || []).map(s => s.extraartists || []))));
        all.forEach(a => api._dgSplitRoles(a.role).forEach((r) => {
            const k = `${api._dgRoleColumn(r)} ← ${r.replace(/\s*\[.*$/, '')}`;
            roleCols.set(k, (roleCols.get(k) || 0) + 1);
        }));
    }
}
console.log(`\nranged release credits: ${ranged}, unplaced: ${unplaced}`);
if (roles) [...roleCols.entries()].sort().forEach(([k, n]) => console.log(`${String(n).padStart(5)}  ${k}`));
