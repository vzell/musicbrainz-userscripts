#!/usr/bin/env python3
"""Resolve an append-only merge conflict by keeping both sides, HEAD first.

Usage: python3 scripts/resolve-append-conflict.py FILE [FILE ...]

For each <<<<<<< / ======= / >>>>>>> block, writes HEAD's lines, one blank line
(unless HEAD's side already ends with one), then the other side's lines. Meant
for dated logs (DEBUG-NOTES.md, tests/MEASUREMENTS.org) where two branches each
appended an entry at the same spot. Refuses a file with nested or unbalanced
markers.
"""
import sys


def resolve(path):
    """Rewrite one file in place; return the number of blocks resolved."""
    with open(path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')
    out, ours, theirs, state, blocks = [], [], [], None, 0
    for ln in lines:
        if ln.startswith('<<<<<<< '):
            if state is not None:
                raise SystemExit(f'{path}: nested conflict marker')
            state, ours, theirs = 'ours', [], []
        elif ln == '=======' and state == 'ours':
            state = 'theirs'
        elif ln.startswith('>>>>>>> ') and state == 'theirs':
            out.extend(ours)
            if ours and ours[-1].strip():
                out.append('')
            out.extend(theirs)
            state, blocks = None, blocks + 1
        elif state == 'ours':
            ours.append(ln)
        elif state == 'theirs':
            theirs.append(ln)
        else:
            out.append(ln)
    if state is not None:
        raise SystemExit(f'{path}: unbalanced conflict markers')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out))
    return blocks


if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(f'{p}: {resolve(p)} block(s) resolved')
