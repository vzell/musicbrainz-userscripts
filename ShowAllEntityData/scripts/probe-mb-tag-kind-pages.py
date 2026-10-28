"""Probe the pages behind the tag windows' per-kind lists
(org/MB-POH-sync-withDiscogs.org, Phase 3c): a tag's kind page
`/tag/<tag>/<kind>?page=N` and an editor's `/user/<editor>/tag/<tag>/<kind>`.

The Web Service has no browse by tag (MusicBrainz_API, checked 2026-10-27:
tags are an `inc=` and a search field, not a linked entity), so these lists
can only be read from the pages. What the windows need from each page, and
this probe prints:

  - the entities table(s): `table.tbl` headers, rows per page, the link kind
    of each row's first entity link, how artwork is marked (`.caa-icon`);
  - the pager (`ul.pagination`): current page, last page;
  - the total, wherever the page says it (a "Found N …" / "N entities"
    line, the sidebar), so "Load N more pages" can say how many are left;
  - the headings around the table (h1/h2/h3 texts).

Pages go to debug/poh-sync/ (gitignored); with --fixtures the ones the
specs use are copied to tests/fixtures/ with the Mapbox token MusicBrainz
embeds scrubbed (memory "MB pages embed a Mapbox token").

Result 2026-10-27 (NB-3641, browser n/a): no `table.tbl` on these pages.
A "15,606 releases found" line, the pager (`ul.pagination`, absolute
`?page=N` links, `a.sel` the current one; 157 pages for 15,606, so 100 a
page), then a `ul` of `li`: "4 - <entity link> (<comment>) by <credit
bdi>", the number the tag's votes. An editor's page has no votes and, at
44 releases, no pager. Its "recording" page answered "0 recordings found"
for a tag whose overview lists none.

usage: python3 scripts/probe-mb-tag-kind-pages.py [--fixtures]
"""
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

from html.parser import HTMLParser

UA = 'ShowAllEntityData-tag-kind-probe/1.0 (info@volkerzell.de)'
ROOT = pathlib.Path(__file__).resolve().parent.parent
DEBUG = ROOT / 'debug' / 'poh-sync'
FIX = ROOT / 'tests' / 'fixtures'
PAGES = [
    ('tag-kind-alternative-rock-release-p1.html', '/tag/alternative%20rock/release'),
    ('tag-kind-alternative-rock-release-p2.html', '/tag/alternative%20rock/release?page=2'),
    ('tag-kind-alternative-rock-artist-p1.html', '/tag/alternative%20rock/artist'),
    ('user-tag-kind-vzell-live-release-p1.html', '/user/vzell/tag/live/release'),
    # The tag fixture's biggest kind (129,479 recordings): its window opens on it.
    ('tag-kind-alternative-rock-recording-p1.html', '/tag/alternative%20rock/recording'),
]
# The pages the specs use (popup-mb.spec.js, popup-mb-user-lists.spec.js);
# the others are printed for their structure only.
FIXTURES = {'tag-kind-alternative-rock-recording-p1.html', 'tag-kind-alternative-rock-artist-p1.html',
            'user-tag-kind-vzell-live-release-p1.html'}
_last = [0.0]


def get(path):
    """GET one musicbrainz.org page, at most one request per 1.1 s; a 503 is tried again."""
    for attempt in range(4):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request('https://musicbrainz.org' + path, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code != 503 or attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    return ''


class Outline(HTMLParser):
    """Collects what the probe prints: headings, table headers and rows, the pager, totals."""

    def __init__(self):
        super().__init__()
        self.stack = []
        self.heads = []
        self.tables = []
        self.cur = None
        self.in_th = self.in_h = False
        self.text = ''
        self.pager = []
        self.in_pager = False
        self.caa = 0
        self.lines = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if tag == 'table' and 'tbl' in cls.split():
            self.cur = {'heads': [], 'rows': 0, 'kinds': {}}
            self.tables.append(self.cur)
        if tag == 'th' and self.cur is not None and not self.cur['rows']:
            self.in_th, self.text = True, ''
        if tag == 'tr' and self.cur is not None:
            self.row_first = True
        if tag == 'a' and self.cur is not None and getattr(self, 'row_first', False):
            m = re.match(r'^/(artist|release-group|release|recording|work|label|event|place|area|series|instrument)/[0-9a-f-]{36}$',
                         a.get('href') or '')
            if m:
                self.cur['kinds'][m.group(1)] = self.cur['kinds'].get(m.group(1), 0) + 1
                self.row_first = False
        if 'caa-icon' in cls:
            self.caa += 1
        if tag in ('h1', 'h2', 'h3'):
            self.in_h, self.text = tag, ''
        if tag == 'ul' and 'pagination' in cls:
            self.in_pager = True
        if tag == 'a' and self.in_pager:
            m = re.search(r'[?&]page=(\d+)', a.get('href') or '')
            if m:
                self.pager.append(int(m.group(1)))

    def handle_endtag(self, tag):
        if tag == 'th' and self.in_th:
            self.cur['heads'].append(re.sub(r'\s+', ' ', self.text).strip())
            self.in_th = False
        if tag == 'tbody' and self.cur is not None:
            pass
        if tag == 'tr' and self.cur is not None and not self.in_th:
            self.cur['rows'] += 1
        if tag == 'table':
            self.cur = None
        if tag == self.in_h:
            self.heads.append(f'{self.in_h}: ' + re.sub(r'\s+', ' ', self.text).strip())
            self.in_h = False
        if tag == 'ul':
            self.in_pager = False

    def handle_data(self, data):
        if self.in_th or self.in_h:
            self.text += data
        t = data.strip()
        if re.search(r'\b(found|entities|results)\b', t, re.I) and re.search(r'\d', t) and len(t) < 120:
            self.lines.append(t)


def main():
    """Fetch each page, save it under debug/, print its outline."""
    DEBUG.mkdir(parents=True, exist_ok=True)
    for name, path in PAGES:
        html = get(path)
        (DEBUG / name).write_text(html, encoding='utf-8')
        o = Outline()
        o.feed(html)
        print(f'== {path}  ({len(html)} bytes)')
        print('  headings:', o.heads[:8])
        for t in o.tables:
            print(f'  table: {t["rows"] - 1} rows (header row excluded), heads {t["heads"]}, first-link kinds {t["kinds"]}')
        print(f'  pager pages: {sorted(set(o.pager))[:3]} … {max(o.pager) if o.pager else "none"}; caa-icon {o.caa}')
        print('  total lines:', o.lines[:4])
        if '--fixtures' in sys.argv and name in FIXTURES:
            scrubbed = re.sub(r'\b([ps]k)\.eyJ[\w.-]+', r'\1.SCRUBBED', html)
            (FIX / name).write_text(scrubbed, encoding='utf-8')
            print(f'  fixture tests/fixtures/{name}')


if __name__ == '__main__':
    main()
