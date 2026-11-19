#!/usr/bin/env python3
"""Pad every cell of one org/markdown pipe table to its column's widest entry.

Usage: python3 scripts/align-org-table.py FILE LINE

LINE is any line of the table (1-based). The table is the run of lines
starting with '|' around it. Separator rows ('|---+---|' or '|---|---|') are
rebuilt with dashes; the joiner ('+' for org, '|' for markdown) is kept.
Widths are counted in characters (len()), as the hand-aligned tables of this
repo are. Only that table is rewritten.
"""
import sys


def main(path, line_no):
    """Rewrite the table around line `line_no` of `path` in place."""
    with open(path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')
    i = line_no - 1
    if not lines[i].startswith('|'):
        raise SystemExit(f'line {line_no} is not a table row')
    start, end = i, i
    while start > 0 and lines[start - 1].startswith('|'):
        start -= 1
    while end + 1 < len(lines) and lines[end + 1].startswith('|'):
        end += 1
    rows = []
    for ln in lines[start:end + 1]:
        inner = ln.strip()[1:-1]
        is_sep = set(inner) <= set('-+|: ')
        rows.append((is_sep, '+' if is_sep and '+' in inner else '|',
                     None if is_sep else [c.strip() for c in inner.split('|')]))
    ncols = max(len(r[2]) for r in rows if r[2] is not None)
    widths = [0] * ncols
    for is_sep, _, cells in rows:
        if cells:
            for k, c in enumerate(cells):
                widths[k] = max(widths[k], len(c))
    out = []
    for is_sep, joiner, cells in rows:
        if is_sep:
            out.append('|' + joiner.join('-' * (w + 2) for w in widths) + '|')
        else:
            cells = cells + [''] * (ncols - len(cells))
            out.append('|' + '|'.join(f' {c.ljust(w)} ' for c, w in zip(cells, widths)) + '|')
    lines[start:end + 1] = out
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
    print(f'{path}: lines {start + 1}-{end + 1} aligned, widths {widths}')


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]))
