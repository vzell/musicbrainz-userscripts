"""Print every occurrence of a literal string in a file with surrounding
context and a byte offset, one per line.

`grep -o` collapses occurrences that share a line, and these snapshot files
are effectively one enormous line — so a count from grep and a count from a
context-window grep can disagree without either being wrong. This reports
every occurrence individually.

usage: python3 scripts/locate-string.py <file> <needle> [context]
"""
import sys

path, needle = sys.argv[1], sys.argv[2]
ctx = int(sys.argv[3]) if len(sys.argv) > 3 else 70

data = open(path, encoding='utf-8', errors='replace').read()
i = data.find(needle)
n = 0
while i != -1:
    n += 1
    lo = max(0, i - ctx)
    hi = min(len(data), i + len(needle) + ctx)
    snippet = data[lo:hi].replace('\n', '\\n')
    print(f'[{n}] @{i}: …{snippet}…')
    i = data.find(needle, i + 1)
print(f'total: {n}')
