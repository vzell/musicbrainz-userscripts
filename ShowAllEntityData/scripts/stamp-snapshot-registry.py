#!/usr/bin/env python3
"""Stamps re-captured pageTypes in tests/snapshots/registry.org's table: sets
their "script version" and "last captured" cells, keeping each cell's width
(the cells are right-aligned and padded). Only the file's first table is
read; every pageType named must have exactly one row in it, or nothing is
written.

Usage: python3 scripts/stamp-snapshot-registry.py <version> <YYYY-MM-DD> <pageType>...
"""
import re
import sys

PATH = 'tests/snapshots/registry.org'


def main():
    version, date, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    with open(PATH, encoding='utf-8') as fh:
        lines = fh.read().split('\n')
    # The registry table is the file's first block of '|' lines; later
    # tables (the drift notes) name pageTypes too.
    end = next((i for i, l in enumerate(lines) if not l.startswith('|')), len(lines))
    for name in names:
        hits = [i for i, l in enumerate(lines[:end]) if re.match(rf'^\| {re.escape(name)} +\|', l)]
        if len(hits) != 1:
            print(f'{name}: {len(hits)} rows, expected 1 — nothing written')
            return 1
        cells = lines[hits[0]].split('|')
        # cells[0] is '' before the first bar; 5 = script version, 6 = last captured.
        for idx, val in ((5, version), (6, date)):
            w = len(cells[idx])
            cells[idx] = (' ' + val + ' ').rjust(w)
        lines[hits[0]] = '|'.join(cells)
    with open(PATH, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(lines))
    print(f'stamped {len(names)} rows: {version} {date}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
