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
  ext-ia-colltitles-<year>-p<N>.json     the titles of the collections search page N
                                         names that no earlier page of that search named
                                         (_iaCollTitlesFor(), 2026-11-02); none when a
                                         page brings no new collection

Each answer is {url, status, contentType, body} with `body` the answer's text,
the shape the Discogs fixtures have. The search URLs are built exactly as
_iaSearchPageUrl() builds them (same fields, same order), the titles URLs as
_iaCollTitlesUrl() does (the ids sorted, each quoted), so a spec can key the
GM stub's answers by URL.

Usage: python3 scripts/build-ia-fixtures.py [--out tests/fixtures] [--metadata-only | --titles-only]

--metadata-only rewrites the ext-ia-metadata-*.json files alone, so the search
pages (whose counts change as archive.org grows) stay as the specs know them.
--titles-only rewrites the ext-ia-colltitles-*.json files alone, from the
collections of the search pages already in --out.
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
# 'original': a derivative's source file (a "JPEG Thumb" of a scan; 2026-11-01).
FILE_KEYS = ('name', 'source', 'format', 'title', 'track', 'length', 'size', 'original')
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


def titles_url(ids):
    """The advancedsearch.php URL _iaCollTitlesUrl() builds for these collections."""
    ids = sorted(ids)
    q = 'identifier:(' + ' OR '.join('"' + i.replace('"', '').replace('\\', '') + '"' for i in ids) + ')'
    p = [('q', q), ('fl[]', 'identifier'), ('fl[]', 'title'), ('rows', str(len(ids))), ('output', 'json')]
    return 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(p)


def page_collections(path):
    """The collections (no fav-*) a search fixture's rows name."""
    with open(path, encoding='utf-8') as f:
        docs = json.loads(json.load(f)['body'])['response']['docs']
    out = set()
    for d in docs:
        c = d.get('collection') or []
        for x in (c if isinstance(c, list) else [c]):
            if x and not str(x).startswith('fav-'):
                out.add(str(x))
    return out


def write_titles(out_dir):
    """Writes each search page's titles answer, as a run asks them: page by
    page, only the collections no earlier page of the search named."""
    for year, pages in (('1975', 1), ('2016', 2)):
        seen = set()
        for p in range(1, pages + 1):
            new = page_collections(os.path.join(out_dir, f'ext-ia-search-{year}-p{p}.json')) - seen
            seen |= new
            if not new:
                print(f'ext-ia-colltitles-{year}-p{p}.json: no new collection, none written')
                continue
            url = titles_url(new)
            st, ct, body = get(url)
            write(out_dir, f'ext-ia-colltitles-{year}-p{p}.json', url, st, ct, body)


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
    ap.add_argument('--metadata-only', action='store_true')
    ap.add_argument('--titles-only', action='store_true')
    a = ap.parse_args()
    if a.titles_only:
        write_titles(a.out)
        return 0
    for ident in ITEMS:
        url = f'https://archive.org/metadata/{urllib.parse.quote(ident)}'
        st, ct, body = get(url)
        write(a.out, f'ext-ia-metadata-{ident}.json', url, st, ct, trim_metadata(body) if st == 200 else body)
    if a.metadata_only:
        return 0
    with open(os.path.join(a.out, 'ia-search.html'), 'w', encoding='utf-8') as f:
        f.write(SHELL)
    for year, pages in (('1975', 1), ('2016', 2)):
        solr = f'(subject:"Bruce Springsteen") AND year:"{year}"'
        for p in range(1, pages + 1):
            url = search_url(solr, p)
            st, ct, body = get(url)
            write(a.out, f'ext-ia-search-{year}-p{p}.json', url, st, ct, body)
    write_titles(a.out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
