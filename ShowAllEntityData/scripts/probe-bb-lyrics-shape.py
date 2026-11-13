#!/usr/bin/env python3
"""Phase 16 batch 3 (org/brucebase.org): the shape of every Brucebase lyrics page.

Over the mirror's lyrics/ folder (bb/latest/lyrics/lyrics_<slug>.html, 508 pages
on 2026-10-18), per page: the version headings (h2 in #page-content), the verse
paragraphs (p with text, outside a table) after each heading, the
springsteenlyrics.com links, and anything else with text (not a heading, a
verse or the link tables): what a lyrics reader must expect. Prints counts and
up to five samples per odd shape. No network.

usage: python3 scripts/probe-bb-lyrics-shape.py [mirror-dir]
"""

import collections
import os
import re
import socket
import subprocess
import sys
from html.parser import HTMLParser

MIRROR = sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest/lyrics'


class Page(HTMLParser):
    """Collects h2s, verse paragraphs and links inside #page-content."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0          # div depth inside #page-content (0 = outside)
        self.table = 0
        self.tag = None
        self.buf = []
        self.versions = []      # [name, verses, other]
        self.sl = 0
        self.other = []
        self.pre = []           # text before the first heading

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'div':
            if self.depth:
                self.depth += 1
            elif a.get('id') == 'page-content':
                self.depth = 1
            return
        if not self.depth:
            return
        if tag == 'table':
            self.table += 1
        if tag == 'h2' or (tag in ('p', 'li', 'h1', 'h3', 'td') and self.tag is None):
            self.tag, self.buf = tag, []
        if tag == 'a' and 'springsteenlyrics.com' in (a.get('href') or ''):
            self.sl += 1
        if tag == 'br' and self.tag:
            self.buf.append('\n')

    def handle_endtag(self, tag):
        if tag == 'div' and self.depth:
            self.depth -= 1
            return
        if not self.depth:
            return
        if tag == self.tag:
            text = re.sub(r'[ \t]+', ' ', ''.join(self.buf)).strip()
            if tag == 'h2':
                self.versions.append([text, 0, 0])
            elif text and tag == 'p' and not self.table:
                if self.versions:
                    self.versions[-1][1] += 1
                else:
                    self.pre.append(text)
            elif text and tag != 'h2' and 'SpringsteenLyrics' not in text and not (tag == 'td' and self.table):
                self.other.append(f'{tag}: {text[:80]}')
            self.tag = None
        if tag == 'table':
            self.table -= 1

    def handle_data(self, data):
        if self.tag:
            self.buf.append(data)


def main():
    """Reads every page and prints the summary."""
    at = subprocess.run(['date', '+%FT%T%:z'], env={**os.environ, 'TZ': 'Europe/Berlin'},
                        capture_output=True, text=True, check=True).stdout.strip()
    files = sorted(f for f in os.listdir(MIRROR) if f.startswith('lyrics_') and f.endswith('.html'))
    nver = collections.Counter()
    nsl = collections.Counter()
    odd = collections.defaultdict(list)
    for f in files:
        p = Page()
        p.feed(open(os.path.join(MIRROR, f), encoding='utf-8', errors='replace').read())
        nver[len(p.versions)] += 1
        nsl[p.sl] += 1
        if not p.versions:
            odd['no heading'].append(f)
        if any(v[1] == 0 for v in p.versions):
            odd['a heading with no verse'].append(f'{f}: ' + ', '.join(v[0] for v in p.versions if v[1] == 0))
        if p.pre:
            odd['text before the first heading'].append(f'{f}: {p.pre[0][:60]}')
        if p.other:
            odd['other text'].append(f'{f}: {p.other[0]}')
    print(f'Env: {at} · {socket.gethostname()} · n/a (no browser) · {MIRROR}')
    print(f'{len(files)} pages')
    print('versions per page:', dict(sorted(nver.items())))
    print('springsteenlyrics.com links per page:', dict(sorted(nsl.items())))
    for k, v in odd.items():
        print(f'{k}: {len(v)}')
        for s in v[:5]:
            print('   ', s)
    return 0


if __name__ == '__main__':
    sys.exit(main())
