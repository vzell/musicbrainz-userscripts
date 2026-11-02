#!/usr/bin/env python3
"""Probe how archive.org names collections, for the ia-search table's
Collection column (vzell, 2026-11-02: "the cell values should have their
hyperlinks intact as on the IP").

The search API returns a row's collections as identifiers only
(`radionowhere`), while an item page names them by their own titles
("Radio Nowhere"). This asks:

  1. the 1975 Springsteen search's collections (first page, 100 rows);
  2. ONE advancedsearch request for all of them plus five named ones,
     `identifier:("a" OR "b" ...)` with `fl[]=identifier,title`, the
     shape `_iaCollTitlesUrl()` builds;

and prints every id with its title, the ids the answer left out, and the
request's URL length. Read-only, anonymous.

Usage: python3 scripts/probe-ia-collection-titles.py
"""

import json
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
NAMED = ['radionowhere', 'roiocollection', 'folksoundomy', 'etree', 'opensource_audio']


def get(url):
    """GET a URL; returns (status, body bytes)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b''


def search(params):
    """advancedsearch.php with these params, as JSON (None on failure)."""
    url = 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(params)
    st, body = get(url)
    if st != 200:
        print(f'HTTP {st} for {url}')
        return None, url
    return json.loads(body), url


def main():
    """Prints the 1975 search's collections and their titles."""
    d, _ = search([
        ('q', '(subject:"Bruce Springsteen") AND year:"1975"'), ('fl[]', 'identifier'), ('fl[]', 'collection'),
        ('sort[]', 'date asc'), ('rows', '100'), ('page', '1'), ('output', 'json'),
    ])
    ids = set(NAMED)
    if d:
        for doc in d['response']['docs']:
            c = doc.get('collection') or []
            for x in (c if isinstance(c, list) else [c]):
                if x and not x.startswith('fav-'):
                    ids.add(x)
    ids = sorted(ids)
    print(f'{len(ids)} distinct collections (no fav-*)')
    q = 'identifier:(' + ' OR '.join(f'"{i}"' for i in ids) + ')'
    t, url = search([('q', q), ('fl[]', 'identifier'), ('fl[]', 'title'), ('rows', str(len(ids))), ('output', 'json')])
    print(f'titles request: {len(url)} chars')
    if not t:
        return
    got = {doc['identifier']: doc.get('title') for doc in t['response']['docs']}
    for i in ids:
        print(f'  {i:32} {got.get(i)!r}')
    missing = [i for i in ids if i not in got]
    print(f'answered {len(got)} of {len(ids)}; missing: {missing}')


if __name__ == '__main__':
    main()
