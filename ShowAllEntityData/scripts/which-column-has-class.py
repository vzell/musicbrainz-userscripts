"""Report which COLUMN (by header name and index) carries a given class on its
body cells, in a captured rendered.html.

A count alone cannot answer "is this my column?" — 1688 occurrences of a
per-row class is one column times every row, and which column it is decides
whether a diff is the change under review or unrelated drift.

usage: python3 scripts/which-column-has-class.py <rendered.html> <class> [...]
"""
import collections
import re
import sys

path = sys.argv[1]
classes = sys.argv[2:]
html = open(path, encoding='utf-8', errors='replace').read()
html = re.sub(r'<style\b[^>]*>.*?</style>', '', html, flags=re.S | re.I)

# Header names, in order, from the first header row of the first table.
thead = re.search(r'<thead\b[^>]*>(.*?)</thead>', html, re.S | re.I)
headers = []
if thead:
    first_row = re.search(r'<tr\b[^>]*>(.*?)</tr>', thead.group(1), re.S | re.I)
    if first_row:
        for th in re.findall(r'<th\b[^>]*>(.*?)</th>', first_row.group(1), re.S | re.I):
            txt = re.sub(r'<[^>]+>', '', th)
            txt = re.sub(r'[⇅▲▼📊▶◀▤\s]+', ' ', txt).strip()
            headers.append(txt[:28] or '(blank)')

# Walk body rows, tracking each cell's index.
rows = re.findall(r'<tr\b[^>]*>(.*?)</tr>', html, re.S | re.I)
found = {c: collections.Counter() for c in classes}
for row in rows:
    cells = re.findall(r'<t[dh]\b[^>]*>', row, re.I)
    for idx, tag in enumerate(cells):
        m = re.search(r'class="([^"]*)"', tag)
        if not m:
            continue
        owned = set(m.group(1).split())
        for c in classes:
            if c in owned:
                found[c][idx] += 1

print(f'{path}')
print(f'  headers ({len(headers)}): ' + ' | '.join(f'{i}:{h}' for i, h in enumerate(headers)))
for c in classes:
    print(f'  {c}:')
    if not found[c]:
        print('     (none)')
    for idx, n in sorted(found[c].items()):
        name = headers[idx] if idx < len(headers) else '(beyond header count)'
        print(f'     col {idx:2} "{name}" — {n} cells')
