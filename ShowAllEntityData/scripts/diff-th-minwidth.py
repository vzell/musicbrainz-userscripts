#!/usr/bin/env python3
"""
Compares the <th> min-width floors between two versions of a rendered.html
snapshot baseline. These files are a single very long line, so `git diff` is
useless on them; this reports per-column deltas instead.

    python3 scripts/diff-th-minwidth.py <old.html> <new.html>
"""
import re
import sys

TH = re.compile(r'<th\b[^>]*>')
COLNAME = re.compile(r'data-col-name="([^"]*)"')
MINW = re.compile(r'min-width:\s*([0-9.]+)px')
STAMP = re.compile(r'data-mb-collapse-min-px="([^"]*)"')


def read(path):
    html = open(path, encoding='utf-8').read()
    out = []
    for i, tag in enumerate(TH.findall(html)):
        name = COLNAME.search(tag)
        minw = MINW.search(tag)
        stamp = STAMP.search(tag)
        out.append({
            'i': i,
            'col': name.group(1) if name else '(unnamed)',
            'min': float(minw.group(1)) if minw else None,
            'stamp': stamp.group(1) if stamp else None,
        })
    return out


def main():
    old, new = read(sys.argv[1]), read(sys.argv[2])
    print('th count: %d -> %d' % (len(old), len(new)))
    if len(old) != len(new):
        print('COLUMN COUNT CHANGED — compare by name, not index')
    changed = smaller = larger = 0
    for o, n in zip(old, new):
        if o['min'] != n['min']:
            changed += 1
            if o['min'] is not None and n['min'] is not None:
                if n['min'] < o['min']:
                    smaller += 1
                else:
                    larger += 1
            print('  %-38s min %s -> %s   stamp %s -> %s'
                  % (n['col'][:38], o['min'], n['min'], o['stamp'], n['stamp']))
    gained = [n['col'] for o, n in zip(old, new) if n['stamp'] and not o['stamp']]
    print('min-width changed on %d of %d <th> (%d smaller, %d larger)'
          % (changed, len(new), smaller, larger))
    print('gained data-mb-collapse-min-px: %d  %s' % (len(gained), gained[:12]))


main()
