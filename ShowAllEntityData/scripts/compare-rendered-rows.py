"""Matches the rows of two saved renders of the same table by a key column and
prints every column whose item count or text differs.

Companion to scripts/dump-rendered-table-columns.py (whose parser it reuses):
for a before/after pair of final rendered pages, it shows WHICH rows and
columns changed, independent of sort order.

usage: python3 scripts/compare-rendered-rows.py OK.html BUG.html [--key Name] [--extra Length]
"""
import argparse
import importlib.util
import os

_spec = importlib.util.spec_from_file_location(
    'dumpcols', os.path.join(os.path.dirname(__file__), 'dump-rendered-table-columns.py'))
dumpcols = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dumpcols)


def keyed(path, key, extra):
    """Rows of one file as {(key text, extra text): {column: cell}}.

    @param path:  HTML file.
    @param key:   Header of the key column.
    @param extra: Header of a second column that disambiguates equal keys.
    @return:      (headers, dict)
    """
    hdr, rows = dumpcols.load(path)
    ki, ei = hdr.index(key), (hdr.index(extra) if extra in hdr else None)
    out = {}
    for r in rows:
        k = (r[ki]['text'], r[ei]['text'] if ei is not None and ei < len(r) else '')
        out.setdefault(k, {hdr[i] if i < len(hdr) else f'?{i}': c for i, c in enumerate(r)})
    return hdr, out


def main():
    """Prints the differences.

    @return: None
    """
    ap = argparse.ArgumentParser()
    ap.add_argument('ok')
    ap.add_argument('bug')
    ap.add_argument('--key', default='Name')
    ap.add_argument('--extra', default='Length')
    args = ap.parse_args()
    _, a = keyed(args.ok, args.key, args.extra)
    _, b = keyed(args.bug, args.key, args.extra)
    both = [k for k in a if k in b]
    print(f'rows: ok {len(a)}, bug {len(b)}, matched {len(both)}; only ok {len(set(a) - set(b))}, only bug {len(set(b) - set(a))}')
    diffs = 0
    for k in both:
        for col, ca in a[k].items():
            cb = b[k].get(col)
            if cb is None or col in ('Picard',):
                continue
            if ca['li'] != cb['li']:
                diffs += 1
                if diffs <= 40:
                    print(f'  {k[0][:40]:40} {k[1]:6} {col:10} li ok={ca["li"]} bug={cb["li"]}')
    print(f'{diffs} differing (row, column) item counts')
    for k in list(set(a) - set(b))[:8]:
        print('  only ok :', k)
    for k in list(set(b) - set(a))[:8]:
        print('  only bug:', k)


if __name__ == '__main__':
    main()
