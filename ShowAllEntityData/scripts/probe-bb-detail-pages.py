#!/usr/bin/env python3
"""Probe the local Brucebase sample for the detail-page overhaul.

Reads every page under ``debug/bb-mirror/<cat>/`` (written by
``scripts/sample-bb-mirror.py``) and reports, per category:

- how often each tab label occurs (tabviews read as the userscript will:
  ``div.yui-navset > ul.yui-nav > li`` labels, scoped per tabview),
- the fill rate of the event-family markers (the ``Scheduled:`` code line,
  the "Info & Setlist | Venue" nav line, the gignote box), breadcrumbs,
  ``div.page-tags``, galleries and YouTube iframes,
- the tag families (``_bbTagFamily()``'s planned classes),

and, over every image URL of the sample, how many filenames each shape of
the planned ``_bbParseImageName()`` grammar (A-H) reads, with the names no
shape reads. Standard library only (html.parser), read-only.

Usage:
    python3 scripts/probe-bb-detail-pages.py [--cat gig …] [--unread N]
"""
import argparse
import collections
import html
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'debug', 'bb-mirror')

# The planned filename grammar (org/brucebase.org, "Plan (2026-11-11)").
SHAPES = [
    ('A', re.compile(r'^(\d{4})(\d{2})(\d{2})([a-z])?_([A-Za-z]+)_(\d{2,3})([a-z])?(?:_(.+))?\.(?:jpe?g|png|gif)$', re.I)),
    ('B', re.compile(r'^Retail-([A-Z0-9]+)_([A-Za-z]+)_(\d{2})([a-z])?(?:_(.+))?\.', re.I)),
    ('C', re.compile(r'^(\d{4})-([A-Z0-9]+)_([A-Za-z]+)_(\d{2})([a-z])?(?:[-_](.+))?\.', re.I)),
    ('D', re.compile(r'^(disco|digital)_([a-z0-9-]+)(?:_([a-z0-9_]+))?\.', re.I)),
    ('E', re.compile(r'^bs(\d{6}|\d{4}_)', re.I)),
    ('F', re.compile(r'^(lyricsheet|note|recording|graph)_(.+)\.', re.I)),
    ('H', re.compile(r'^Bootleg_(.+?)(?:_([A-Za-z]+))?_(Front|Back|Disc|Cover|Label|Booklet|Tray|Inlay|Insert|Whiteliner)\d*\.', re.I)),
    ('G', re.compile(r'^([a-z0-9-]+)_(\d{2})(?:_(\d{8}|[a-z0-9-]+))?\.', re.I)),
]
IMG_RE = re.compile(r'brucebase\.wdfiles\.com/local--(?:files|resized-images)/([^/"\s]+)/([^/"\s]+)')
TAG_RE = re.compile(r'href="/system:page-tags/tag/[^"#]*#pages">([^<]*)</a>')
MONTHS = {'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
          'september', 'october', 'november', 'december'}
DAYS = {'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'}
CATEGORIES = {'gig', 'nogig', 'recording', 'rehearsal', 'interview', 'song', 'venue', 'relation',
              'retail', 'bootleg', 'lyrics', 'ott', 'playlist', 'files', 'content', 'info',
              'gignote', 'news', 'media', 'gallery', 'story', 'eye', 'recnote', 'onstage', 'offstage'}
MATERIAL = {'audio', 'bootleg', 'eyewitness', 'news', 'storyteller', 'ticket', 'livedl', 'boxset',
            'files', 'private', 'guest', 'help', 'cancelled', 'rescheduled', 'video', 'prem',
            'setlist', 'pass', 'photo'}


class TabviewReader(HTMLParser):
    """Collects the tab labels of every YUI tabview, one list per tabview."""

    def __init__(self):
        """Start with no tabview open."""
        super().__init__(convert_charrefs=True)
        self.tabviews = []
        self._nav_depth = None
        self._depth = 0
        self._in_em = False
        self._label = ''

    def handle_starttag(self, tag, attrs):
        """Track ``ul.yui-nav`` and the ``em`` labels inside it."""
        self._depth += 1
        cls = dict(attrs).get('class') or ''
        if tag == 'ul' and 'yui-nav' in cls.split():
            self._nav_depth = self._depth
            self.tabviews.append([])
        elif self._nav_depth is not None and tag == 'em':
            self._in_em = True
            self._label = ''

    def handle_endtag(self, tag):
        """Close a label or the nav list."""
        if self._in_em and tag == 'em':
            self._in_em = False
            self.tabviews[-1].append(' '.join(self._label.split()))
        if self._nav_depth is not None and tag == 'ul' and self._depth == self._nav_depth:
            self._nav_depth = None
        self._depth -= 1

    def handle_data(self, data):
        """Accumulate label text."""
        if self._in_em:
            self._label += data


def tag_family(tag, cat):
    """Classify one wiki tag (the planned ``_bbTagFamily()``)."""
    t = tag.lower()
    if re.fullmatch(r'\d{4}', t) or re.fullmatch(r'\d{2}', t) or t in MONTHS or t in DAYS:
        return 'date'
    if re.fullmatch(r'[a-z]|0-9', t):
        return 'letter'
    if t in CATEGORIES:
        return 'category'
    m = re.match(r'(tour|r|ott|lbl|pl|key|toursnip)_', t)
    if m:
        return 'prefix:' + m.group(1)
    if t in MATERIAL:
        return 'material'
    if re.search(r'\([a-z]{2}\)$', t) or t in {'usa', 'england', 'germany', 'canada', 'italy',
                                               'france', 'spain', 'sweden', 'australia', 'ireland'}:
        return 'place'
    if '.' in t:
        return 'alias'
    if re.fullmatch(r'\d+', t):
        return 'number'
    return 'word'


def shape_of(name):
    """Return the grammar shape letter that reads ``name``, or None."""
    for letter, rx in SHAPES:
        if rx.match(name):
            return letter
    return None


def probe_category(cat, files, report, names):
    """Read one category's pages, fill ``report`` and the global filename set ``names``."""
    tabs = collections.Counter()
    tabsets = collections.Counter()
    marks = collections.Counter()
    fams = collections.Counter()
    for path in files:
        with open(path, encoding='utf-8', errors='replace') as fh:
            text = fh.read()
        start = text.find('id="page-content"')
        end = text.find('class="page-tags"')
        body = text[start:end] if start >= 0 else ''
        r = TabviewReader()
        try:
            r.feed(body)
        except Exception:  # a broken page must not stop the probe
            marks['parse error'] += 1
        for tv in r.tabviews:
            tabsets[' | '.join(tv)] += 1
            for lab in tv:
                tabs[lab] += 1
        marks['pages'] += 1
        if 'Scheduled:' in body:
            marks['Scheduled line'] += 1
        if 'Info &amp; Setlist' in body:
            marks['Info & Setlist nav'] += 1
        if 'href="/venue:' in body:
            marks['venue link'] += 1
        if 'id="breadcrumbs"' in text:
            marks['breadcrumbs'] += 1
        if 'gallery-box' in body:
            marks['gallery'] += 1
        if re.search(r'<iframe[^>]+youtube', body):
            marks['YouTube'] += 1
        if r.tabviews:
            marks['tabview'] += 1
        tags = [html.unescape(t) for t in TAG_RE.findall(text[end:]) ] if end >= 0 else []
        if tags:
            marks['page-tags'] += 1
        for t in tags:
            fams[tag_family(t, cat)] += 1
        for folder, name in IMG_RE.findall(text):
            if folder.startswith('content:') or folder.startswith('files:artwork-disco') and cat not in ('retail', 'gig', 'recording'):
                pass
            if name in ('thumbnail.jpg', 'small.jpg', 'medium.jpg'):
                continue
            names.add((folder, name))
    report.append((cat, marks, tabs, tabsets, fams))


def main():
    """Probe the categories and print the report."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--cat', action='append', help='category (repeatable; default: every sampled one)')
    ap.add_argument('--unread', type=int, default=25, help='unread filenames to list')
    args = ap.parse_args()
    if not os.path.isdir(ROOT):
        print(f'no sample at {ROOT}: run scripts/sample-bb-mirror.py first', file=sys.stderr)
        return 1
    cats = args.cat or sorted(d for d in os.listdir(ROOT) if d != 'pick' and os.path.isdir(os.path.join(ROOT, d)))
    report, names = [], set()
    for cat in cats:
        d = os.path.join(ROOT, cat)
        files = sorted(os.path.join(d, n) for n in os.listdir(d) if n.endswith('.html'))
        probe_category(cat, files, report, names)
    for cat, marks, tabs, tabsets, fams in report:
        n = marks['pages'] or 1
        print(f'\n=== {cat} ({marks["pages"]} pages)')
        print('  ' + ' · '.join(f'{k} {v * 100 // n}%' for k, v in sorted(marks.items()) if k != 'pages'))
        print('  tabs: ' + ', '.join(f'{k} {v}' for k, v in tabs.most_common(16)))
        for s, c in tabsets.most_common(3):
            print(f'  tabset ×{c}: {s[:150]}')
        print('  tag families: ' + ', '.join(f'{k} {v}' for k, v in fams.most_common(14)))
    by_shape = collections.Counter()
    unread = []
    for folder, name in sorted(names):
        s = shape_of(name)
        by_shape[s or 'unread'] += 1
        if not s:
            unread.append(f'{folder}/{name}')
    total = sum(by_shape.values()) or 1
    print(f'\n=== image filenames ({total} distinct in the sample)')
    print('  ' + ' · '.join(f'{k} {v} ({v * 1000 // total / 10}%)' for k, v in by_shape.most_common()))
    for u in unread[:args.unread]:
        print('  unread: ' + u)
    return 0


if __name__ == '__main__':
    sys.exit(main())
