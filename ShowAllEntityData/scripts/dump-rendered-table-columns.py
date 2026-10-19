"""Dumps a saved page's first table.tbl: header names, then per row each cell's
class, item count and text, side by side for two files.

For diagnosing "a column shows the wrong data" bugs from two final rendered
page snapshots (e.g. before/after a column was inserted): misaligned cells
show up as a header whose cells carry another column's text.

usage: python3 scripts/dump-rendered-table-columns.py FILE [FILE] [--rows N] [--cols A,B,...]
"""
import argparse
import re
from html.parser import HTMLParser

GLYPHS = re.compile(r'[⇅▲▼✂▶◀▤\U0001F4CA⏱︎\U0001F3BC✕]|\d+$')


class _Tbl(HTMLParser):
    """Collects the first table.tbl: header texts and, per body row, its cells."""

    def __init__(self):
        super().__init__()
        self.depth = 0          # nesting of <table> inside the first table.tbl
        self.done = False
        self.part = None        # 'thead' | 'tbody'
        self.headers, self.rows = [], []
        self.cell = None
        self.cell_depth = 0
        self.first_hdr_row_done = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.done:
            return
        if tag == 'table':
            if self.depth == 0 and 'tbl' not in (a.get('class') or '').split():
                return
            self.depth += 1
            return
        if self.depth != 1:
            if self.cell is not None and tag == 'li':
                self.cell['li'] += 1
            return
        if tag in ('thead', 'tbody'):
            self.part = tag
        elif tag == 'tr' and self.part == 'tbody':
            self.rows.append([])
        elif tag in ('th', 'td') and self.cell is None:
            if self.part == 'thead' and self.first_hdr_row_done:
                return
            self.cell = {'cls': a.get('class') or '', 'text': '', 'li': 0, 'name': a.get('data-col-name')}
        elif tag == 'li' and self.cell is not None:
            self.cell['li'] += 1

    def handle_endtag(self, tag):
        if self.done:
            return
        if tag == 'table' and self.depth:
            self.depth -= 1
            if self.depth == 0:
                self.done = True
            return
        if self.depth != 1:
            return
        if tag == 'tr' and self.part == 'thead' and self.headers:
            self.first_hdr_row_done = True
        if tag in ('th', 'td') and self.cell is not None:
            c, self.cell = self.cell, None
            c['text'] = re.sub(r'\s+', ' ', c['text']).strip()
            if self.part == 'thead':
                self.headers.append(c['name'] or GLYPHS.sub('', c['text']).strip())
            elif self.rows:
                self.rows[-1].append(c)

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['text'] += data


def load(path):
    """Parses one file.

    @param path: HTML file.
    @return:     (headers, rows)
    """
    p = _Tbl()
    p.feed(open(path, encoding='utf-8', errors='replace').read())
    return p.headers, p.rows


def main():
    """Prints the dump.

    @return: None
    """
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--rows', type=int, default=3)
    ap.add_argument('--cols', default='')
    args = ap.parse_args()
    want = [c for c in args.cols.split(',') if c]
    for f in args.files:
        hdr, rows = load(f)
        print(f'== {f}: {len(hdr)} headers, {len(rows)} rows; cells per row: {sorted(set(len(r) for r in rows))}')
        print('   headers:', hdr)
        for ri, row in enumerate(rows[:args.rows]):
            print(f'   row {ri}:')
            for i, c in enumerate(row):
                name = hdr[i] if i < len(hdr) else '?'
                if want and name not in want:
                    continue
                print(f'     [{i:2}] {name[:22]:22} li={c["li"]:<2} cls={c["cls"][:40]:40} {c["text"][:90]}')


if __name__ == '__main__':
    main()
