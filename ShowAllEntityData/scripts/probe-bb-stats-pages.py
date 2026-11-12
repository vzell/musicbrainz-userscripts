#!/usr/bin/env python3
"""Survey Brucebase's stats:* pages (org/brucebase.org, Phase 13).

Reads every stats_*.html (and content_files*.html) in a local copy of the
mirror's stats folder (default debug/bb-mirror/stats, filled by
scripts/copy-bb-stats-sample.sh) and reports, per page and per family, the
SHAPE of #page-content: YUI tabviews (letter tabs "=- A -=" as on
stats:songs, or named tabs), tables (rows, columns, header cells, how many
cells are numbers), lists, images, headings, and where the links go
(song:, relation:, venue:, bootleg:, a show /YYYY#ddmmyy, other stats:,
external hosts). No network.

Writes debug/bb-stats-probe.json (with an Env stamp) and prints a summary.

Usage: python3 scripts/probe-bb-stats-pages.py [stats_dir] [out_json]
"""
import collections
import datetime
import json
import os
import platform
import re
import socket
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'debug', 'bb-mirror', 'stats')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'debug', 'bb-stats-probe.json')

VOID = {'br', 'img', 'hr', 'input', 'meta', 'link', 'col', 'wbr', 'source', 'area', 'param', 'embed'}

# Families: (name, regex over the page name without "stats_"/".html").
FAMILIES = [
    ('song-count-by-tour-*', r'song-count-by-tour-.+'),
    ('<song>-tour', r'(?!song-count-by-tour-).+-tour'),
    ('awards-*', r'awards-.+'),
    ('*-studio-sessions*', r'.*studio-sessions.*'),
    ('bootlegs-live-label-*', r'bootlegs-live-label-.+'),
    ('songs-<letter>', r'songs-(0|[a-z])'),
    ('venues-in-*', r'venues-in-.+'),
    ('performances-with-bruce-*', r'performances-with-bruce-.+'),
    ('special-events-*', r'special-events-.+'),
    ('scans-*', r'scans-.+'),
    ('discography-*', r'discography-.+'),
    ('relations-*', r'relations-.+'),
    ('*-performance-count', r'.+-performance-count'),
    ('content:files-*', r'content_files-.+'),
]


class Node:
    """A minimal element: tag, attrs, children (Nodes and str)."""

    __slots__ = ('tag', 'attrs', 'kids', 'parent')

    def __init__(self, tag, attrs, parent):
        self.tag = tag
        self.attrs = dict(attrs)
        self.kids = []
        self.parent = parent

    def cls(self):
        """The class attribute's words."""
        return (self.attrs.get('class') or '').split()

    def walk(self):
        """Every descendant element, depth first."""
        for k in self.kids:
            if isinstance(k, Node):
                yield k
                yield from k.walk()

    def text(self):
        """The text content, whitespace collapsed."""
        out = []
        stack = [self]
        while stack:
            n = stack.pop()
            if not isinstance(n, Node):
                out.append(n)
                continue
            if n.tag in ('script', 'style'):
                continue
            if n.tag == 'br':
                out.append(' ')
            stack.extend(reversed(n.kids))
        return re.sub(r'\s+', ' ', ''.join(out)).strip()

    def find_all(self, tag=None, klass=None):
        """Descendants by tag and/or class."""
        return [n for n in self.walk()
                if (tag is None or n.tag == tag) and (klass is None or klass in n.cls())]

    def has_ancestor(self, tag, stop):
        """Whether an ancestor below `stop` has this tag."""
        p = self.parent
        while p is not None and p is not stop:
            if p.tag == tag:
                return True
            p = p.parent
        return False


class Builder(HTMLParser):
    """Builds a Node tree; forgiving about unclosed tags."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root', [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        p = self.cur
        while p is not None and p.tag != tag:
            p = p.parent
        if p is not None and p.parent is not None:
            self.cur = p.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def page_content(text):
    """#page-content's HTML, up to the page tags (or the page info)."""
    i = text.find('<div id="page-content">')
    if i < 0:
        return ''
    j = text.find('<div class="page-tags">', i)
    if j < 0:
        j = text.find('id="page-info"', i)
    return text[i:j if j > 0 else len(text)]


SHOW_RE = re.compile(r'^(?:https?://brucebase\.wikidot\.com)?/(\d{4}|1949-64)(-list)?(#\w*)?$')
PREFIX_RE = re.compile(r'^(?:https?://brucebase\.wikidot\.com)?/([a-z][a-z0-9-]*):')
NUM_RE = re.compile(r'^[\d,.%#()+\- ]+$')
LETTER_RE = re.compile(r'^=-\s*.+?\s*-=$')


def link_kind(href):
    """Where a link goes: a page prefix, a show, a year page, a host, or other."""
    if not href or href.startswith('javascript:') or href.startswith('#'):
        return None
    m = SHOW_RE.match(href)
    if m:
        return 'show' if m.group(3) else ('year-list' if m.group(2) else 'year')
    m = PREFIX_RE.match(href)
    if m:
        return m.group(1) + ':'
    m = re.match(r'^https?://([^/]+)', href)
    if m:
        host = m.group(1).lower()
        return 'local-files' if host.endswith('wikidot.com') and '/local--files/' in href else host
    if href.startswith('mailto:'):
        return 'mailto'
    if href.startswith('/local--files/'):
        return 'local-files'
    return 'other'


def table_info(t):
    """Rows, widest row, header cells, numeric share of a table's own cells."""
    rows = [r for r in t.walk() if r.tag == 'tr' and nearest(r, 'table') is t]
    cells_all = 0
    numeric = 0
    width = 0
    header = []
    for i, r in enumerate(rows):
        cells = [c for c in r.kids if isinstance(c, Node) and c.tag in ('td', 'th')]
        width = max(width, sum(int(c.attrs.get('colspan') or 1) for c in cells))
        for c in cells:
            tx = c.text()
            if not tx:
                continue
            cells_all += 1
            if NUM_RE.match(tx):
                numeric += 1
        if i == 0:
            header = [c.text()[:40] for c in cells]
    return {'rows': len(rows), 'cols': width, 'header': header,
            'numeric': round(numeric / cells_all, 2) if cells_all else 0,
            'class': ' '.join(t.cls()), 'nested': nearest(t.parent, 'table') is not None}


def nearest(n, tag):
    """The nearest ancestor-or-self with this tag."""
    while n is not None:
        if isinstance(n, Node) and n.tag == tag:
            return n
        n = n.parent
    return None


def probe(path):
    """One page's shape record."""
    raw = open(path, encoding='utf-8', errors='replace').read()
    html = page_content(raw)
    b = Builder()
    b.feed(html)
    root = b.root
    rec = {'bytes': len(raw)}
    m = re.search(r'<div id="page-title">\s*(.*?)\s*</div>', raw, re.S)
    rec['title'] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''
    tabviews = []
    for nav in root.find_all('div', 'yui-navset'):
        labels = [li.text() for ul in nav.kids if isinstance(ul, Node) and 'yui-nav' in ul.cls()
                  for li in ul.kids if isinstance(li, Node) and li.tag == 'li']
        tabviews.append({'tabs': len(labels), 'letters': bool(labels) and all(LETTER_RE.match(x) for x in labels),
                         'labels': labels[:12], 'nested': any('yui-navset' in a.cls() for a in ancestors(nav))})
    rec['tabviews'] = tabviews
    tables = [table_info(t) for t in root.find_all('table')]
    rec['tables'] = [t for t in tables if not t['nested']]
    rec['nested_tables'] = sum(1 for t in tables if t['nested'])
    lis = root.find_all('li')
    content_lis = [li for li in lis if not any('yui-nav' in a.cls() for a in ancestors(li))]
    rec['ul'] = len(root.find_all('ul')) - len(tabviews)
    rec['ol'] = len(root.find_all('ol'))
    rec['li'] = len(content_lis)
    rec['li_linked'] = sum(1 for li in content_lis if li.find_all('a'))
    imgs = [i.attrs.get('src', '') for i in root.find_all('img')]
    rec['img'] = len(imgs)
    rec['img_local'] = sum(1 for s in imgs if '/local--files/' in s)
    rec['img_samples'] = [s.rsplit('/', 1)[-1] for s in imgs if '/local--files/' in s][:5]
    links = collections.Counter()
    for a in root.find_all('a'):
        k = link_kind(a.attrs.get('href', ''))
        if k:
            links[k] += 1
    rec['links'] = dict(links.most_common())
    rec['headings'] = [(h.tag, h.text()[:60]) for h in root.walk() if h.tag in ('h1', 'h2', 'h3')][:15]
    rec['div_code'] = len(root.find_all('div', 'code'))
    rec['list_pages_box'] = len(root.find_all('div', 'list-pages-box'))
    ptext = sum(len(p.text()) for p in root.find_all('p')
                if nearest(p.parent, 'table') is None and nearest(p.parent, 'li') is None)
    rec['p_chars'] = ptext
    rec['iframes'] = len(root.find_all('iframe'))
    whole = root.text()
    rec['tour_counts'] = len(re.findall(r'Performed at \d+ show\(s\) of', whole))
    rec['wiki_markup'] = len(re.findall(r'\[\[/?(?:row|cell|table)\b', whole))
    rec['shape'] = shape_of(rec)
    return rec


def ancestors(n):
    """Every ancestor element."""
    p = n.parent
    while p is not None:
        yield p
        p = p.parent


def shape_of(r):
    """The page's shape words, most telling first."""
    s = []
    if r['wiki_markup'] >= 4:
        s.append('include-fragment')
    if r['tour_counts'] >= 3:
        s.append('tour-counts')
    if any(t['letters'] for t in r['tabviews']):
        s.append('letter-tabview')
    if any(not t['letters'] for t in r['tabviews']):
        s.append('named-tabview')
    big = [t for t in r['tables'] if t['rows'] >= 4]
    if any(t['numeric'] >= 0.5 for t in big):
        s.append('number-grid')
    elif big:
        s.append('table')
    if r['li_linked'] >= 10:
        s.append('list')
    if r['img_local'] >= 10:
        s.append('images')
    if r['p_chars'] >= 1500 and len(s) <= 1:
        s.append('text')
    return s or ['small']


def family(name):
    """The page's family, or None for a page of its own."""
    for fam, rx in FAMILIES:
        if re.fullmatch(rx, name):
            return fam
    return None


def env():
    """The Env stamp: Berlin time, host, OS, no browser."""
    os_name = 'unknown'
    try:
        for line in open('/etc/os-release'):
            if line.startswith('PRETTY_NAME='):
                os_name = line.split('=', 1)[1].strip().strip('"')
    except OSError:
        pass
    now = os.popen('TZ=Europe/Berlin date +%FT%T%:z').read().strip() or datetime.datetime.now().isoformat()
    return f'{now} · {socket.gethostname()} · WSL2 {os_name} (Linux {platform.release().split("-")[0]}) · n/a'


def main():
    files = sorted(f for f in os.listdir(SRC) if f.endswith('.html'))
    pages = {}
    for f in files:
        name = f[len('stats_'):-5] if f.startswith('stats_') else f[:-5]
        pages[name] = probe(os.path.join(SRC, f))
        pages[name]['family'] = family(name)
    fams = collections.defaultdict(list)
    for name, r in pages.items():
        fams[r['family'] or '(own)'].append(name)
    fam_sum = {}
    for fam, names in sorted(fams.items()):
        if fam == '(own)':
            continue
        shapes = collections.Counter('+'.join(pages[n]['shape']) for n in names)
        rows = [max([t['rows'] for t in pages[n]['tables']] or [0]) for n in names]
        lis = [pages[n]['li_linked'] for n in names]
        links = collections.Counter()
        for n in names:
            links.update(pages[n]['links'])
        fam_sum[fam] = {'pages': len(names), 'shapes': dict(shapes.most_common()),
                        'max_table_rows': [min(rows), max(rows)], 'li_linked': [min(lis), max(lis)],
                        'links': dict(links.most_common(8)), 'sample': names[0]}
    out = {'env': env(), 'source': os.path.abspath(SRC), 'pages_read': len(pages),
           'families': fam_sum, 'pages': pages}
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    print(f'Env: {out["env"]}')
    print(f'{len(pages)} pages read from {SRC}\n')
    print('== families')
    for fam, s in fam_sum.items():
        print(f'{fam:28} {s["pages"]:5}  {s["shapes"]}  rows {s["max_table_rows"]}  li {s["li_linked"]}  '
              f'links {dict(list(s["links"].items())[:4])}')
    print('\n== pages of their own')
    for name in sorted(fams['(own)']):
        r = pages[name]
        tv = ' '.join(f'tv{t["tabs"]}{"L" if t["letters"] else ""}' for t in r['tabviews'])
        tb = ' '.join(f'{t["rows"]}x{t["cols"]}{"#" if t["numeric"] >= 0.5 else ""}' for t in r['tables'] if t['rows'] >= 2)
        lk = dict(list(r['links'].items())[:3])
        print(f'{name:44} {"+".join(r["shape"]):28} {tv:10} tbl[{tb[:40]}] li{r["li_linked"]} img{r["img_local"]} {lk}')
    print(f'\nwrote {os.path.abspath(OUT)}')


if __name__ == '__main__':
    main()
