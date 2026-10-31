#!/usr/bin/env python3
"""Probe the Internet Archive's search and metadata APIs for the planned
`ia-year` pageType and the archive.org detail-page reader
(org/internet.archive.org).

The search page (archive.org/search?query=…) is a Lit web-component app:
its saved HTML (debug/ia-1975-*-view-initial.html) holds no result rows, and
its Tile / Compact list views are the same document. So the rows must come
from an API. This asks, without a token or cookie:

  1. advancedsearch.php (Solr) — the documented search API: count + rows for
     subject "Bruce Springsteen", year 1975, sorted by title, with the
     fields a row would show;
  2. the scrape API (/services/search/v1/scrape) — cursor paging, no 10k cap;
  3. the metadata API (/metadata/<identifier>) for the detail pages named in
     the org file: the keys a hover card / window would show, the file list
     (audio tracks, video), and which files are derivatives.

Prints status, content type, keys, counts and the first rows. Read-only.

Usage: python3 scripts/probe-ia-search.py [--year 1975] [--json OUT_DIR]
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
QUERY = 'subject:"Bruce Springsteen"'
FIELDS = ['identifier', 'title', 'date', 'year', 'mediatype', 'collection', 'creator',
          'coverage', 'venue', 'downloads', 'item_size', 'num_reviews', 'avg_rating',
          'publicdate', 'addeddate', 'source', 'subject', 'description', 'runtime', 'format']
DETAILS = [
    'live-at-the-ahmanson-theater-los-angeles-1973',
    '1975-bruce-springsteen-widener-college-audience-cam',
    'bs1975-02-05.prefm-fm.prodigalson.jems.flac16',
    'bs1975-03-07.aud.cdr.unknown.flac16',
    'bs1975-12-27.aud.jk.cb.hrubesh.flac16',
]


def get(url):
    """GET a URL; returns (status, content type, body text)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get('Content-Type', ''), r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Content-Type', ''), e.read().decode('utf-8', 'replace')[:400]


def save(out, name, data):
    """Writes one answer as JSON when --json is given."""
    if not out:
        return
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def main():
    """Runs the three probes and prints what each answered."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--year', default='1975')
    ap.add_argument('--json', default='')
    a = ap.parse_args()

    q = f'{QUERY} AND year:{a.year}'
    params = [('q', q), ('rows', '50'), ('page', '1'), ('output', 'json'), ('sort[]', 'titleSorter asc')]
    params += [('fl[]', f) for f in FIELDS]
    url = 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(params)
    st, ct, body = get(url)
    print(f'== advancedsearch {st} {ct}\n   {url}')
    if st == 200:
        d = json.loads(body)
        resp = d.get('response', {})
        docs = resp.get('docs', [])
        print(f'   numFound={resp.get("numFound")} rows={len(docs)}')
        seen = {}
        for doc in docs:
            for k in doc:
                seen[k] = seen.get(k, 0) + 1
        print('   field presence:', json.dumps(seen, ensure_ascii=False))
        mt = {}
        for doc in docs:
            mt[doc.get('mediatype')] = mt.get(doc.get('mediatype'), 0) + 1
        print('   mediatypes:', mt)
        for doc in docs[:4]:
            short = {k: (v if not isinstance(v, str) or len(v) < 120 else v[:120] + '…') for k, v in doc.items()}
            print('   row:', json.dumps(short, ensure_ascii=False))
        save(a.json, f'ext-ia-search-{a.year}.json', d)
    else:
        print('   ', body[:300])

    surl = 'https://archive.org/services/search/v1/scrape?' + urllib.parse.urlencode(
        {'q': q, 'fields': ','.join(FIELDS[:8]), 'count': '100'})
    st, ct, body = get(surl)
    print(f'\n== scrape {st} {ct}\n   {surl}')
    if st == 200:
        d = json.loads(body)
        print(f'   keys={list(d)} total={d.get("total")} count={d.get("count")} cursor={"yes" if d.get("cursor") else "no"}')
    else:
        print('   ', body[:300])

    for ident in DETAILS:
        st, ct, body = get(f'https://archive.org/metadata/{ident}')
        print(f'\n== metadata {ident}: {st} {ct}')
        if st != 200:
            print('   ', body[:300])
            continue
        d = json.loads(body)
        md = d.get('metadata', {})
        files = d.get('files', [])
        print('   top keys:', list(d))
        print('   metadata keys:', sorted(md))
        for k in ('title', 'date', 'venue', 'coverage', 'mediatype', 'collection', 'creator', 'source', 'lineage', 'taper', 'transferer', 'runtime'):
            if k in md:
                v = md[k]
                print(f'   {k}: {json.dumps(v, ensure_ascii=False)[:160]}')
        fmts = {}
        for f in files:
            fmts[f.get('format')] = fmts.get(f.get('format'), 0) + 1
        print(f'   files={len(files)} formats={json.dumps(fmts, ensure_ascii=False)}')
        tracks = [f for f in files if f.get('source') == 'original' and (f.get('title') or f.get('track'))]
        for f in tracks[:4]:
            print('   track:', json.dumps({k: f.get(k) for k in ('name', 'title', 'track', 'length', 'format', 'source')}, ensure_ascii=False))
        print(f'   original files with a title or track: {len(tracks)}')
        save(a.json, f'ext-ia-metadata-{ident}.json', d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
