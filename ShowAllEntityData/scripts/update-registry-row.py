"""Update one or more cells of a row in tests/snapshots/registry.org, keeping
the org table's column alignment intact.

Hand-editing these rows is how the 'script version'/'last captured' columns
drift out of step with the files they describe — the cells are padded to a
fixed width and a manual edit silently breaks the alignment, so the next
reader reformats the whole table and the real change is lost in the noise.

usage: python3 scripts/update-registry-row.py <pageType> <column>=<value> [...]
"""
import sys

PATH = 'tests/snapshots/registry.org'
page_type = sys.argv[1]
updates = dict(a.split('=', 1) for a in sys.argv[2:])

lines = open(PATH, encoding='utf-8').readlines()
tbl = [i for i, l in enumerate(lines) if l.startswith('|')]
hdr = [c.strip() for c in lines[tbl[0]].split('|')[1:-1]]
for col in updates:
    if col not in hdr:
        raise SystemExit(f'unknown column {col!r}; have {hdr}')

hits = 0
for i in tbl[1:]:
    raw = lines[i].rstrip('\n')
    if set(raw.strip()) <= set('|-+'):
        continue
    cells = raw.split('|')[1:-1]
    if len(cells) != len(hdr):
        continue
    if cells[0].strip() != page_type:
        continue
    hits += 1
    for col, val in updates.items():
        j = hdr.index(col)
        width = len(cells[j])
        new = ' ' + val
        if len(new) > width:
            raise SystemExit(
                f'value {val!r} is {len(new)} chars, column {col!r} is {width} — '
                'widen the whole column by hand rather than breaking alignment')
        cells[j] = new.ljust(width)
    lines[i] = '|' + '|'.join(cells) + '|\n'

if hits != 1:
    raise SystemExit(f'expected exactly 1 row for {page_type!r}, matched {hits}')
open(PATH, 'w', encoding='utf-8').writelines(lines)
print(f'{page_type}: ' + ', '.join(f'{k} -> {v}' for k, v in updates.items()))
