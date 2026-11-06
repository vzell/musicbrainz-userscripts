#!/usr/bin/env python3
"""Re-check the code anchors org/majkinetor.org depends on, after a refresh of majkinetor's repo.

Reads scripts/majkinetor-anchors.json. Each anchor is a per-line regex in either majkinetor's clone
(debug/majkinetor/, root "clone") or this project (root "saed"). For each it reports:

    ok      found once (with the line drift since the last refresh)
    MULTI   found a different number of times than its "count" (default 1): the regex is too loose
            now, or a copy was added or removed
    GONE    an expected anchor is missing: the claim it backs must be re-checked by hand
    BACK    an anchor expected ABSENT is present (e.g. ISRC Scout restored its title attribute, or a
            proposed shared convention, the conv-* anchors, was adopted upstream)

A SAED-side "DEFECT" anchor going GONE usually means its TODO was fixed: mark the TODO done and
switch the anchor to the fixed shape (or drop it).

    python3 scripts/check-majkinetor-anchors.py               # report; exit 1 if anything is GONE/BACK/MULTI
    python3 scripts/check-majkinetor-anchors.py --versions    # also: @version of each harness copy vs the clone
    python3 scripts/check-majkinetor-anchors.py --update-lines  # write the found lines back into the JSON

Read-only on both trees except --update-lines, which rewrites only the "line" values of the JSON.
The clone is untrusted third-party code: this script only reads it as text.
"""
import json
import pathlib
import re
import subprocess
import sys

PROJECT = pathlib.Path(__file__).resolve().parent.parent
CLONE = PROJECT / 'debug' / 'majkinetor'
ANCHORS = PROJECT / 'scripts' / 'majkinetor-anchors.json'
HARNESS = PROJECT / 'tests' / 'fixtures' / 'live-userscripts'

# The three majkinetor scripts the live-interop harness carries: clone path -> harness file name.
HARNESS_COPIES = {
    'userscripts/event_horizon/event_horizon.user.js': 'event_horizon.user.js',
    'userscripts/string_theory/string_theory.user.js': 'string_theory.user.js',
    'userscripts/isrc_scout/isrc_scout.user.js': 'ISRC-scout.user.js',
}


def find(path, regex):
    """Return the 1-based line numbers of `path` whose text matches `regex` (empty if the file is missing)."""
    if not path.exists():
        return None
    rx = re.compile(regex)
    with path.open(encoding='utf-8', errors='replace') as fh:
        return [n for n, line in enumerate(fh, 1) if rx.search(line)]


def version_of(path):
    """Return the `// @version` value of a userscript, or None when the file or the line is missing."""
    if not path.exists():
        return None
    with path.open(encoding='utf-8', errors='replace') as fh:
        for line in fh:
            m = re.match(r'//\s*@version\s+(\S+)', line)
            if m:
                return m.group(1)
            if '==/UserScript==' in line:
                break
    return None


def clone_head():
    """Return the clone's short HEAD SHA, or '(no clone)'."""
    if not CLONE.exists():
        return '(no clone)'
    out = subprocess.run(['git', '-C', str(CLONE), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True)
    return out.stdout.strip() or '(unknown)'


def update_lines(found):
    """Rewrite the "line" value of each anchor found exactly once, keeping the JSON's one-anchor-per-line layout."""
    text = ANCHORS.read_text(encoding='utf-8')
    out = []
    for line in text.splitlines(keepends=True):
        m = re.search(r'"id": "([^"]+)"', line)
        if m and m.group(1) in found and '"line": ' in line:
            line = re.sub(r'"line": \d+', f'"line": {found[m.group(1)]}', line)
        out.append(line)
    ANCHORS.write_text(''.join(out), encoding='utf-8')
    json.loads(ANCHORS.read_text(encoding='utf-8'))


def main():
    """Report every anchor's state; with --versions also the harness copies; exit 1 on GONE/BACK/MULTI."""
    args = set(sys.argv[1:])
    data = json.loads(ANCHORS.read_text(encoding='utf-8'))
    print(f"clone HEAD {clone_head()} (analysis pinned at {data.get('pinned')})")
    bad = 0
    found_once = {}
    for a in data['anchors']:
        base = CLONE if a['root'] == 'clone' else PROJECT
        hits = find(base / a['file'], a['regex'])
        expect = a.get('expect', 'present')
        if hits is None:
            state, where = 'GONE', f"file missing: {a['file']}"
        elif expect == 'absent':
            state, where = ('ok', 'absent') if not hits else ('BACK', f'lines {hits[:5]}')
        elif not hits:
            state, where = 'GONE', ''
        elif len(hits) != a.get('count', 1):
            state, where = 'MULTI', f"lines {hits[:5]} (expected {a.get('count', 1)})"
        elif len(hits) > 1:
            state, where = 'ok', f'lines {hits[:5]}'
        else:
            drift = f" (was {a['line']}, {hits[0] - a['line']:+d})" if a.get('line') else ''
            state, where = 'ok', f'line {hits[0]}{drift}'
            found_once[a['id']] = hits[0]
        bad += state != 'ok'
        todo = f"  [TODO: {a['todo']}]" if a.get('todo') and state != 'ok' else ''
        print(f"{state:5} {a['id']:24} {where:28} {a['claim']}{todo}")
    if '--versions' in args:
        print()
        for src, dst in HARNESS_COPIES.items():
            cv, hv = version_of(CLONE / src), version_of(HARNESS / dst)
            flag = 'same' if cv == hv else 'DIFFERS'
            print(f"{flag:7} {dst:24} harness {hv}  clone {cv}")
    if '--update-lines' in args:
        update_lines(found_once)
        print(f'\nline values updated for {len(found_once)} anchors')
    print(f'\n{bad} anchor(s) need a look' if bad else '\nall anchors hold')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
