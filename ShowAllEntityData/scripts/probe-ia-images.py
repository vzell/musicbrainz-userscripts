#!/usr/bin/env python3
"""Probe which pictures an archive.org item has, for the ia-search Art
column's hover card and viewer (vzell, 2026-11-01: "image hovering").

For each item of a 1975 search (the first N rows) and a few named ones,
asks /metadata/<id> and prints every file whose format is a picture
(JPEG, PNG, GIF, "Item Tile", "Thumbnail", "JPEG Thumb", …) with its
source (original/derivative), size and dimensions where given. Also what
/services/img/<id> answers (status, type, final URL, bytes). Read-only,
anonymous.

Usage: python3 scripts/probe-ia-images.py [N]
"""

import json
import sys
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
NAMED = [
    'bs1975-12-27.aud.jk.cb.hrubesh.flac16',
    'live-at-the-ahmanson-theater-los-angeles-1973',
    '1975-bruce-springsteen-widener-college-audience-cam',
]
PIC = ('jpeg', 'png', 'gif', 'tile', 'thumb', 'image', 'webp')


def get(url, limit=None):
    """GET a URL; returns (status, headers, body bytes, final url)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.headers, r.read(limit) if limit else r.read(), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, b'', url


def search_ids(n):
    """The first n identifiers of the 1975 Springsteen search, by date."""
    q = urllib.parse.urlencode([
        ('q', '(subject:"Bruce Springsteen") AND year:"1975"'), ('fl[]', 'identifier'),
        ('sort[]', 'date asc'), ('rows', str(n)), ('output', 'json'),
    ])
    st, _, body, _ = get(f'https://archive.org/advancedsearch.php?{q}')
    if st != 200:
        print(f'search: {st}')
        return []
    return [d['identifier'] for d in json.loads(body)['response']['docs']]


def main():
    """Prints each item's pictures and its /services/img answer."""
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    ids = NAMED + [i for i in search_ids(n) if i not in NAMED]
    for ident in ids:
        st, _, body, _ = get(f'https://archive.org/metadata/{urllib.parse.quote(ident)}')
        if st != 200:
            print(f'== {ident}: metadata {st}')
            continue
        d = json.loads(body)
        md = d.get('metadata', {})
        files = d.get('files', [])
        pics = [f for f in files if any(k in str(f.get('format', '')).lower() for k in PIC)]
        print(f'== {ident} [{md.get("mediatype")}] files={len(files)} pictures={len(pics)}')
        formats = {}
        for f in pics:
            formats.setdefault(f.get('format'), []).append(f)
        for fmt, fs in formats.items():
            print(f'   {fmt!r}: {len(fs)}')
            for f in fs[:4]:
                dims = f'{f.get("width", "?")}x{f.get("height", "?")}'
                print(f'      {f.get("source")} {f.get("name")} size={f.get("size")} {dims} original={f.get("original", "")}')
        st, h, body, final = get(f'https://archive.org/services/img/{urllib.parse.quote(ident)}')
        print(f'   services/img: {st} {h.get("Content-Type")} {len(body)} bytes -> {final}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
