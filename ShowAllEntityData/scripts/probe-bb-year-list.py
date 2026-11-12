#!/usr/bin/env python3
"""Probe Brucebase's year listing pages (/YYYY-list, /1949-64-list) in the
local mirror (org/brucebase.org, Phase 9).

Reads every `<year>-list.html` under the mirror (default
/home/vzell/git/scripts/BruceParser/bb/latest) and reports, over
#page-content: the h1, the intro div.code, the <ul> lists and their <li>
entries (link shape, heading shape "DATE - VENUE", note <em>(…)</em>), the
tour boxes between lists (their text shapes), and any other top-level
markup. No network.

Usage: python3 scripts/probe-bb-year-list.py [mirror_dir]
"""
import collections
import html
import os
import re
import sys
from html.parser import HTMLParser

MIRROR = sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest'


def page_content(text):
    """The #page-content div's inner HTML (up to the page-tags / footer)."""
    i = text.find('<div id="page-content">')
    if i < 0:
        return ''
    j = text.find('<div class="page-tags">', i)
    if j < 0:
        j = text.find('id="page-info"', i)
    return text[i:j if j > 0 else len(text)]


class Top(HTMLParser):
    """Collects the top-level children of #page-content (tag names) and
    their text, depth-aware."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.tops = []   # [tag, text]
        self.cur = None

    def handle_starttag(self, tag, attrs):
        if tag in ('br', 'img', 'hr', 'input', 'meta', 'link'):
            if self.depth == 1:
                self.tops.append([tag, ''])
            return
        self.depth += 1
        if self.depth == 2:
            self.cur = [tag + ('.' + dict(attrs).get('class', '').replace(' ', '.') if dict(attrs).get('class') else ''), '']
            self.tops.append(self.cur)

    def handle_endtag(self, tag):
        if tag in ('br', 'img', 'hr', 'input', 'meta', 'link'):
            return
        self.depth -= 1

    def handle_data(self, data):
        if self.depth >= 2 and self.cur is not None:
            self.cur[1] += data


LI_RE = re.compile(r'<li>(.*?)</li>', re.S)
A_RE = re.compile(r'^\s*<a href="([^"]*)">(.*?)</a>(.*)$', re.S)
NOTE_RE = re.compile(r'^\s*<span style="font-size:80%;"><em>\((.*)\)</em></span>\s*$', re.S)
HEAD_RE = re.compile(r'^(\d{4}-\d\d-\d\d) - (.+)$')


def main():
    files = sorted(f for f in os.listdir(MIRROR) if re.fullmatch(r'(\d{4}|1949-64)-list\.html', f))
    print(f'{len(files)} listing pages in {MIRROR}')
    tops = collections.Counter()
    box_shapes = collections.Counter()
    notes = collections.Counter()
    hrefs = collections.Counter()
    odd_li = []
    odd_head = []
    zero_dates = 0
    entries = 0
    with_note = 0
    intro = 0
    per_page = {}
    for f in files:
        text = open(os.path.join(MIRROR, f), encoding='utf-8', errors='replace').read()
        pc = page_content(text)
        t = Top()
        t.feed(pc)
        for tag, txt in t.tops:
            tops[tag] += 1
            if tag.startswith('table'):
                s = ' '.join(html.unescape(txt).split())
                box_shapes[re.sub(r'"[^"]*"', '"X"', s)[:90]] += 1
        if 'class="code"' in pc:
            intro += 1
        n = 0
        for li in LI_RE.findall(pc):
            if 'href="/' not in li or '#' not in li:
                continue
            m = A_RE.match(li)
            if not m:
                odd_li.append((f, li[:120]))
                continue
            href, label, rest = m.groups()
            hm = re.fullmatch(r'/(\d{4}|1949-64)#(\d{6}[a-z]?)', href)
            hrefs['/YEAR#ddmmyy' if hm else re.sub(r'\d', 'N', href)[:40]] += 1
            label = ' '.join(html.unescape(re.sub(r'<[^>]+>', '', label)).split())
            h = HEAD_RE.match(label)
            if not h:
                odd_head.append((f, label[:100]))
            elif '-00' in h.group(1):
                zero_dates += 1
            rest = rest.strip()
            if rest:
                nm = NOTE_RE.match(rest)
                if nm:
                    with_note += 1
                    notes[html.unescape(nm.group(1))] += 1
                else:
                    odd_li.append((f, 'REST ' + rest[:100]))
            n += 1
        entries += n
        per_page[f] = n
    print(f'entries {entries}, with a note {with_note}, 00 dates {zero_dates}, pages with an intro div.code {intro}')
    print('fewest / most entries:', sorted(per_page.items(), key=lambda x: x[1])[:3], sorted(per_page.items(), key=lambda x: -x[1])[:3])
    print('\nhref shapes:', dict(hrefs))
    print('\ntop-level elements of #page-content:')
    for k, v in tops.most_common():
        print(f'  {v:5} {k}')
    print('\ntour box shapes ("X" = a quoted name):')
    for k, v in box_shapes.most_common(25):
        print(f'  {v:4} {k}')
    print(f'\nnotes: {len(notes)} distinct; top 25:')
    for k, v in notes.most_common(25):
        print(f'  {v:4} {k}')
    print(f'\nentries whose heading is not "DATE - VENUE" ({len(odd_head)}):')
    for x in odd_head[:15]:
        print('  ', x)
    print(f'\nentries with other markup ({len(odd_li)}):')
    for x in odd_li[:15]:
        print('  ', x)


if __name__ == '__main__':
    main()
