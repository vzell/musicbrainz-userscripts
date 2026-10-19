"""List, per HTML file, each table's header texts and how many /recording/ links it holds.

Used to pick fixtures for the "Recording of" pageType specs
(tests/fixtures/recording-of-pagetypes.spec.js): a usable fixture has a table
whose anchor header ("Name", "Title" or "Recording") sits over recording links.
For a page whose list is a <ul> (tag, ratings, artist-credit pages), the
count of /recording/ links in the whole file is printed instead.

usage: python3 scripts/list-fixture-recording-tables.py FILE...
"""
import re
import sys
from html.parser import HTMLParser


class _T(HTMLParser):
    """Collects header texts and recording-link counts per <table>."""

    def __init__(self):
        super().__init__()
        self.tables, self.stack, self.in_th = [], [], False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'table':
            self.stack.append({'cls': a.get('class', ''), 'th': [], 'rec': 0})
        elif tag == 'th' and self.stack:
            self.in_th = True
            self.stack[-1]['th'].append('')
        elif tag == 'a' and self.stack and re.search(r'/recording/[0-9a-f-]{36}', a.get('href', '')):
            self.stack[-1]['rec'] += 1

    def handle_endtag(self, tag):
        if tag == 'th':
            self.in_th = False
        elif tag == 'table' and self.stack:
            self.tables.append(self.stack.pop())

    def handle_data(self, data):
        if self.in_th and self.stack:
            self.stack[-1]['th'][-1] += data.strip()


for f in sys.argv[1:]:
    html = open(f, encoding='utf-8', errors='replace').read()
    p = _T()
    p.feed(html)
    links = len(re.findall(r'href="[^"]*/recording/[0-9a-f-]{36}"', html))
    print(f'== {f}: {links} recording links in file')
    for t in p.tables:
        if t['rec']:
            print(f"   table.{t['cls']!r}: {t['rec']} rec links; headers {t['th']}")
