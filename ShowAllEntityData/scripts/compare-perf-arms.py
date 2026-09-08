#!/usr/bin/env python3
"""Prints a side-by-side of two (or more) interaction-perf JSON arms."""
import io, json, sys

arms = []
for path in sys.argv[1:]:
    d = json.load(io.open(path, encoding='utf-8'))
    arms.append((d['branch'], d['interactions']))

names = [k for k in arms[0][1]]
w = max(len(n) for n in names) + 2
hdr = 'metric'.ljust(w) + ''.join(label.rjust(14) for label, _ in arms)
if len(arms) > 1:
    hdr += 'delta vs first'.rjust(18)
print(hdr)
print('-' * len(hdr))
for n in names:
    base = arms[0][1][n]['medianMs']
    row = n.ljust(w) + ''.join(f"{a[1][n]['medianMs']:>13.0f}" + ' ' for a in arms)
    if len(arms) > 1:
        last = arms[-1][1][n]['medianMs']
        pct = (last - base) / base * 100.0
        row += f"{pct:>+16.1f}%"
    print(row)
