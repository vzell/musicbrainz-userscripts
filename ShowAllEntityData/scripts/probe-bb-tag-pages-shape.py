#!/usr/bin/env python3
"""Reads the pages scripts/probe-bb-tag-pages.py saved in debug/ (no network)
and reports what Phase 11's converters need: a tag page's item markup and
the prefixes (categories) of its pages, the pages-and-tags table's prefixes
and tag counts, and the page code behind the tag page's list (a ListPages
module? its order).

    python3 scripts/probe-bb-tag-pages-shape.py
"""

import collections
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DBG = os.path.join(ROOT, 'debug')


def read(name):
    """One saved page's text, or '' when it is missing."""
    p = os.path.join(DBG, name)
    if not os.path.exists(p):
        return ''
    with open(p, encoding='utf-8') as f:
        return f.read()


def prefix(href):
    """A page's category: the part before ':' ('_default' without one)."""
    name = href.lstrip('/')
    return name.split(':', 1)[0] if ':' in name else '_default'


def tag_page(name):
    """A tag page: where the list sits, an item's markup, the prefixes."""
    t = read(name)
    if not t:
        return
    print(f'== {name}: {len(t):,} bytes')
    i = t.find('pages-list-item')
    print('   before the first item: ' + re.sub(r'\s+', ' ', t[max(0, i - 700):i])[-700:])
    items = re.findall(r'<div class="pages-list-item">\s*(.*?)\s*</div>', t, re.S)
    print(f'   items: {len(items)}')
    for it in items[:3]:
        print('   item: ' + re.sub(r'\s+', ' ', it)[:300])
    hrefs = [m for it in items for m in re.findall(r'href="([^"]+)"', it)]
    c = collections.Counter(prefix(h) for h in hrefs)
    print(f'   prefixes: {c.most_common(25)}')
    j = t.rfind('pages-list-item')
    print('   after the last item: ' + re.sub(r'\s+', ' ', t[j:j + 900]))
    texts = [re.sub(r'<[^>]+>', '', it).strip() for it in items]
    print(f'   first titles: {texts[:5]}; last: {texts[-3:]}')
    print(f'   sorted by title? {texts == sorted(texts)}; by href? {hrefs == sorted(hrefs)}')


def pat():
    """pages-and-tags: prefixes, tag counts per row, title order."""
    rows = []
    for n in (1, 2, 35):
        t = read(f'bb-pages-and-tags-p{n}-raw.html')
        tb = re.search(r'<table class="wiki-content-table">(.*?)</table>', t, re.S)
        if not tb:
            continue
        for r in re.findall(r'<tr>(.*?)</tr>', tb.group(1), re.S):
            a = re.search(r'<a href="([^"]+)">(.*?)</a>', r)
            tds = re.findall(r'<td>(.*?)</td>', r, re.S)
            if a and len(tds) == 2:
                rows.append((n, a.group(1), a.group(2), tds[1].split()))
    print(f'== pages-and-tags: {len(rows)} rows read (p1, p2, p35)')
    print(f'   prefixes: {collections.Counter(prefix(h) for _, h, _, _ in rows).most_common()}')
    counts = [len(tg) for *_, tg in rows]
    print(f'   tags per row: min {min(counts)}, max {max(counts)}, mean {sum(counts) / len(counts):.1f}; rows with none: {counts.count(0)}')
    print(f'   p1 first/last: {rows[0][2]} / {[r for r in rows if r[0] == 1][-1][2]}')
    td = re.search(r'<table class="wiki-content-table">.*?</table>', read('bb-pages-and-tags-p1-raw.html'), re.S)
    print('   raw first rows: ' + re.sub(r'\s+', ' ', td.group(0))[:500] if td else '')
    t = read('bb-pages-and-tags-p1-raw.html')
    pg = re.search(r'<div class="pager">.*?</div>', t, re.S)
    print('   pager: ' + re.sub(r'\s+', ' ', pg.group(0))[:900] if pg else '   no pager')


def main():
    """Runs both readers."""
    tag_page('bb-tag-storyteller-raw.html')
    tag_page('bb-tag-content-raw.html')
    pat()


if __name__ == '__main__':
    main()
