"""Probe the pages behind the CD stub and documentation windows
(org/MB-POH-sync-withDiscogs.org, Phase 3f): a CD stub `/cdstub/<disc ID>`,
a documentation page `/doc/<Page>`, the site's documentation search
`/search?query=…&type=doc`, and the MusicBrainz wiki's search API.

What the readers need, and this probe prints:

  - CD stub: the `.blankheader h1` (title, `.comment`), the subheader
    ("CD stub by …"), the Tracklist `table.tbl` headers and row count, the
    "Disc ID information" `table.details` labels, the sidebar's `dt` labels;
  - documentation page: `#content.wikicontent`, its `h1`, the status box
    (`table.wikitable` starting "Status:"), `#toc` entries by level, the
    headings in `.mw-parser-output` (bare `h2` or wrapped in `div.mw-heading`);
  - documentation search: whether the site's page carries any results in its
    HTML (it is Google's custom search, rendered in the browser);
  - the wiki's search API: JSON, `query.searchinfo.totalhits`, the fields of
    a hit.

Pages go to debug/poh-sync/ (gitignored); with --fixtures the ones the specs
use are copied to tests/fixtures/ with the Mapbox token MusicBrainz embeds
scrubbed (memory "MB pages embed a Mapbox token").

Result 2026-10-27 (NB-3641, browser n/a): the CD stub page has `h1` "Blues In
Orbit (mfsl-cd-sacd)" with the comment in `span.comment`, the subheader "~ CD
stub by Ellington, Duke", a Tracklist `table.tbl` (# · Title · Length), a
`table.details` (Disc ID, Total tracks, Total length, Full TOC) and sidebar
`dt`s Added, Last modified, Lookup count, Modify count, Barcode. The
documentation page has `#content.wikicontent`, `h1.hierarchy-links` "Style /
Titles", a "Status:" `table.wikitable`, a `#toc` of `li.toclevel-N`, and its
headings wrapped in `div.mw-heading mw-headingN`. The site's search page
holds no results (Google custom search). The wiki API answered JSON:
totalhits 19 for "release group", each hit ns, title, pageid, size,
wordcount, snippet (HTML, `span.searchmatch`), timestamp.

usage: python3 scripts/probe-mb-docs-cdstub.py [--fixtures]
"""
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-docs-cdstub-probe/1.0 (info@volkerzell.de)'
ROOT = pathlib.Path(__file__).resolve().parent.parent
DEBUG = ROOT / 'debug' / 'poh-sync'
FIX = ROOT / 'tests' / 'fixtures'
PAGES = [
    ('cdstub-one.html', 'https://musicbrainz.org/cdstub/.0bu2pqNY67hHTrw09eWyhBPhsA-'),
    ('doc-style-titles.html', 'https://musicbrainz.org/doc/Style/Titles'),
    ('doc-search-release-group.html', 'https://musicbrainz.org/search?query=release%20group&type=doc'),
    ('wiki-api-search-release-group.json',
     'https://wiki.musicbrainz.org/api.php?action=query&list=search&format=json&srlimit=50&srsearch=release%20group'),
]
# The pages the specs use (popup-mb.spec.js), by probe name → fixture name.
FIXTURES = {
    'cdstub-one.html': 'cdstub-blues-in-orbit.html',
    'doc-style-titles.html': 'doc-style-titles.html',
    'wiki-api-search-release-group.json': 'wiki-api-search-release-group.json',
}
_last = {}


def get(url):
    """GET one page, at most one request per 1.1 s per host; a 503 is tried again."""
    host = url.split('/')[2]
    for attempt in range(4):
        wait = 1.1 - (time.time() - _last.get(host, 0.0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code != 503 or attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    return ''


def show(name, body):
    """Prints what the reader for this page relies on."""
    print(f'== {name} ({len(body)} bytes)')
    if name.endswith('.json'):
        d = json.loads(body)
        q = d.get('query', {})
        print('  totalhits:', q.get('searchinfo', {}).get('totalhits'), '· hits:', len(q.get('search', [])))
        if q.get('search'):
            print('  hit fields:', sorted(q['search'][0]))
        return
    find = lambda pat: re.findall(pat, body, re.S)
    print('  h1:', [re.sub(r'<[^>]+>', '', h).strip() for h in find(r'<h1\b[^>]*>(.*?)</h1>')][:2])
    print('  subheader:', [re.sub(r'<[^>]+>|\s+', ' ', h).strip() for h in find(r'class="subheader"[^>]*>(.*?)</p>')][:1])
    print('  table.tbl:', len(find(r'<table class="tbl')), '· th:', [re.sub(r'<[^>]+>', '', h).strip() for h in find(r'<th\b[^>]*>(.*?)</th>')][:12])
    print('  dt:', [re.sub(r'<[^>]+>', '', h).strip() for h in find(r'<dt\b[^>]*>(.*?)</dt>')][:10])
    print('  wikicontent:', 'wikicontent' in body, '· status box:', bool(re.search(r'Status:', body)),
          '· toc entries:', len(find(r'class="toclevel-\d')), '· mw-heading:', len(find(r'class="mw-heading ')))
    print('  results in HTML:', bool(re.search(r'class="gs-title"|class="results"', body)), '· gcse:', 'gcse' in body)


def main():
    DEBUG.mkdir(parents=True, exist_ok=True)
    for name, url in PAGES:
        body = get(url)
        (DEBUG / name).write_text(body, encoding='utf-8')
        show(name, body)
        if '--fixtures' in sys.argv and name in FIXTURES:
            scrubbed = re.sub(r'\b([ps]k)\.eyJ[\w.-]+', r'\1.SCRUBBED', body)
            (FIX / FIXTURES[name]).write_text(scrubbed, encoding='utf-8')
            print(f'  fixture tests/fixtures/{FIXTURES[name]}')


if __name__ == '__main__':
    main()
