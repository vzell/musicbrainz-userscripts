#!/usr/bin/env python3
"""Builds the Internet Archive fixtures of the ia-search and iadetails specs
(docs/claude/internet-archive.md) from the live APIs, anonymously.

Writes into tests/fixtures/:
  ia-search.html                         the search page's shell (<app-root> only:
                                         archive.org's own page holds no rows)
  ext-ia-search-1975-p1.json             advancedsearch.php, subject "Bruce Springsteen",
                                         year 1975, page 1 (all 73 items)
  ext-ia-search-2016-p1.json / -p2.json  the same for 2016 (1,064 items), pages 1 and 2:
                                         a run of more than one page
  ext-ia-metadata-<identifier>.json      /metadata/<identifier> for a show, a video and a
                                         missing item, trimmed to what _extIaItem() reads

Each answer is {url, status, contentType, body} with `body` the answer's text,
the shape the Discogs fixtures have. The search URLs are built exactly as
_iaSearchPageUrl() builds them (same fields, same order), so a spec can key
the GM stub's answers by URL.

Usage: python3 scripts/build-ia-fixtures.py [--out tests/fixtures]
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-fixtures/1.0 (https://github.com/vzell/mb-userscripts)'
FIELDS = ['identifier', 'title', 'date', 'mediatype', 'venue', 'source', 'downloads', 'item_size',
          'num_reviews', 'avg_rating', 'num_favorites', 'addeddate', 'collection']
ITEMS = [
    'bs1975-12-27.aud.jk.cb.hrubesh.flac16',
    '1975-bruce-springsteen-widener-college-audience-cam',
    'this-item-does-not-exist-sa-fixture',
]
FILE_KEYS = ('name', 'source', 'format', 'title', 'track', 'length', 'size')
META_KEYS = ('identifier', 'title', 'date', 'venue', 'source', 'mediatype', 'collection', 'creator', 'uploader',
             'addeddate', 'lineage', 'taper', 'transferer', 'brucebase_url', 'databruce_url', 'description')
SHELL = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">'
         '<title>Internet Archive: Digital Library of Free &amp; Borrowable Texts, Movies, Music &amp; Wayback Machine</title>'
         '</head><body><app-root></app-root></body></html>\n')


def search_url(solr, page):
    """The advancedsearch.php URL _iaSearchPageUrl() builds for page `page`."""
    p = [('q', solr)] + [('fl[]', f) for f in FIELDS]
    p += [('sort[]', 'date asc'), ('sort[]', 'titleSorter asc'), ('rows', '100'), ('page', str(page)), ('output', 'json')]
    return 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(p)


def get(url):
    """GET; returns (status, content type, text)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.headers.get('Content-Type', ''), r.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Content-Type', ''), e.read().decode('utf-8', 'replace')


def write(out, name, url, status, ctype, body):
    """Writes one fixture answer."""
    with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
        json.dump({'url': url, 'status': status, 'contentType': ctype, 'body': body}, f, ensure_ascii=False)
        f.write('\n')
    print(f'{name}: {status} {len(body)} chars')


def trim_metadata(text):
    """Keeps the metadata fields and file fields the reader reads."""
    d = json.loads(text)
    if not d.get('metadata'):
        return json.dumps(d)
    out = {'metadata': {k: v for k, v in d['metadata'].items() if k in META_KEYS},
           'files': [{k: f[k] for k in FILE_KEYS if k in f} for f in d.get('files', [])],
           'item_size': d.get('item_size'),
           'reviews': [{'stars': r.get('stars')} for r in d.get('reviews', [])]}
    return json.dumps(out, ensure_ascii=False)


def main():
    """Fetches and writes every fixture."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures'))
    a = ap.parse_args()
    with open(os.path.join(a.out, 'ia-search.html'), 'w', encoding='utf-8') as f:
        f.write(SHELL)
    for year, pages in (('1975', 1), ('2016', 2)):
        solr = f'(subject:"Bruce Springsteen") AND year:"{year}"'
        for p in range(1, pages + 1):
            url = search_url(solr, p)
            st, ct, body = get(url)
            write(a.out, f'ext-ia-search-{year}-p{p}.json', url, st, ct, body)
    for ident in ITEMS:
        url = f'https://archive.org/metadata/{urllib.parse.quote(ident)}'
        st, ct, body = get(url)
        write(a.out, f'ext-ia-metadata-{ident}.json', url, st, ct, trim_metadata(body) if st == 200 else body)
    return 0


if __name__ == '__main__':
    sys.exit(main())
