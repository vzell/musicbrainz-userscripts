"""Print the Relationships column's cells from a captured debug HTML page.

Written for the 2026-09-16 report that the 📊 unique-values filter on the
Relationships column stops working after a collapse/uncollapse cycle: the
column repopulates (data-rel-done comes back) but the match highlight never
appears and no row is narrowed.

The captures are large single-line documents, so grep can count markers but
cannot show structure. This prints, per rel cell: the row's first-column text
(so cells can be matched up between captures), the cell's attributes, each
anchor's href/class, and every hidden .mb-rel-filter-key value — which is the
text getCleanColumnText() matches a typed or dropdown-chosen filter against.

    python3 scripts/inspect-rel-cells.py debug/rg-r-filter-rel-sl.html [...]
"""
import re
import sys
from html.parser import HTMLParser


class RelCellParser(HTMLParser):
    """Collects rel cells, their anchors and their hidden filter keys."""

    def __init__(self):
        super().__init__()
        self.rows = []          # [{'label': str, 'cells': [...]}]
        self._row = None
        self._cell = None
        self._depth = 0
        self._text_target = None
        self._first_cell_text = None
        self._in_first_cell = False
        self._cell_index = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class', '')
        if tag == 'tr':
            self._row = {'label': '', 'cells': []}
            self._cell_index = 0
        elif tag == 'td' and self._row is not None:
            self._cell_index += 1
            if self._cell_index == 1:
                self._in_first_cell = True
                self._first_cell_text = []
            if 'mb-rel-cell' in cls:
                self._cell = {
                    'attrs': {k: v for k, v in a.items() if k != 'style'},
                    'anchors': [],
                    'keys': [],
                    # 0-based, to compare against the filter input's
                    # data-col-idx: testRowMatch() resolves the cell as
                    # row.cells[f.idx], so a shifted index silently tests the
                    # wrong column.
                    'index': self._cell_index - 1,
                }
        elif tag == 'a' and self._cell is not None:
            self._cell['anchors'].append({
                'href': a.get('href', ''),
                'class': cls,
                'title': (a.get('title', '') or '')[:60],
            })
        elif tag == 'img' and self._cell is not None and self._cell['anchors']:
            self._cell['anchors'][-1]['img_class'] = cls
        elif tag == 'span' and self._cell is not None and 'mb-rel-filter-key' in cls:
            self._text_target = 'key'

    def handle_endtag(self, tag):
        if tag == 'td':
            if self._cell is not None and self._row is not None:
                self._row['cells'].append(self._cell)
                self._cell = None
            if self._in_first_cell:
                self._row['label'] = re.sub(
                    r'\s+', ' ', ''.join(self._first_cell_text)).strip()[:40]
                self._in_first_cell = False
        elif tag == 'tr' and self._row is not None:
            if self._row['cells']:
                self._row['cell_count'] = self._cell_index
                self.rows.append(self._row)
            self._row = None
        elif tag == 'span':
            self._text_target = None

    def handle_data(self, data):
        if self._text_target == 'key' and self._cell is not None:
            self._cell['keys'].append(data.strip())
        elif self._in_first_cell:
            self._first_cell_text.append(data)


def main():
    """Parses each file named on the command line and prints its rel cells."""
    for path in sys.argv[1:]:
        with open(path, encoding='utf-8', errors='replace') as fh:
            parser = RelCellParser()
            parser.feed(fh.read())
        print(f'=== {path} ===')
        print(f'    rows with a rel cell: {len(parser.rows)}')
        for row in parser.rows:
            for cell in row['cells']:
                attrs = ' '.join(f'{k}={v!r}' for k, v in sorted(cell['attrs'].items()))
                print(f'  ROW {row["label"]!r}')
                print(f'    rel td at index {cell["index"]} of {row.get("cell_count")} cells')
                print(f'    td: {attrs}')
                for anc in cell['anchors']:
                    img = anc.get('img_class', '')
                    print(f'      a class={anc["class"]!r} img={img!r} href={anc["href"][:70]!r}')
                for key in cell['keys']:
                    if key:
                        print(f'      filter-key: {key[:70]!r}')
        print()


if __name__ == '__main__':
    main()
