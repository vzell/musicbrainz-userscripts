"""Capture real answers of the external link readers' APIs as fixtures for
tests/fixtures/popup-ext.spec.js (org/iframe.org, "* generalize to URLs",
U3: Wikipedia, Wikidata, Discogs).

Each fixture is the exact request a reader makes — the URL the userscript
builds, with a browser in English (`navigator.language` "en-US" in the
Playwright profile, so Wikidata is asked for `en` and `enwiki` only) — saved
as tests/fixtures/ext-<name>.json: {url, status, contentType, body}, the body
as the text the API sent. A spec hands them to the GM_xmlhttpRequest stub
(window.__gmXhrResponses) by their `url`.

Politeness, per the sites' own pages (read 2026-10-08 for U0): an
identifying User-Agent (and Wikimedia's Api-User-Agent), one request per
1.1 s overall, Discogs well inside its 25 a minute without a token. No token
is sent, so the fixtures are what a user without one gets.

usage: python3 scripts/capture-ext-fixtures.py [--list] [name ...]
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-ext-fixtures/1.0 ( info@volkerzell.de )'
SPACING_S = 1.1
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures')
WP = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
WD = ('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids={}'
      '&props=labels%7Cdescriptions%7Caliases%7Csitelinks&languages=en&sitefilter=enwiki')
DG = 'https://api.discogs.com/'

# name -> the reader's request, as _extWikipediaLoad(), _extWikidataLoad() and
# _extDiscogsLoad() build it.
FIXTURES = {
    # The event annotation's link (no thumbnail, U0 X1).
    'wikipedia-teachrock': WP + 'TeachRock',
    # As MusicBrainz writes it, with %2C (U0 X1); it has a thumbnail.
    'wikipedia-greetings': WP + 'Greetings_from_Asbury_Park%2C_N.J.',
    # type "disambiguation".
    'wikipedia-mercury': WP + 'Mercury',
    # 404.
    'wikipedia-missing': WP + 'No_such_article_ShowAllEntityData_probe',
    # Bruce Springsteen's item (U0 X2).
    'wikidata-q1225': WD.format('Q1225'),
    # An item that does not exist: `missing`.
    'wikidata-missing': WD.format('Q999999999'),
    # U0 X4's three, and Columbia's label.
    'discogs-release': DG + 'releases/1874253',
    'discogs-master': DG + 'masters/26725',
    'discogs-artist': DG + 'artists/219986',
    'discogs-label': DG + 'labels/1866',
    # 404.
    'discogs-missing': DG + 'releases/999999999',
}

_last = [0.0]


def get(url, attempts=4):
    """GET one URL politely; returns (status, content-type, body text)."""
    headers = {'User-Agent': UA, 'Api-User-Agent': UA, 'Accept': 'application/json'}
    status, ctype, body = 0, '', b''
    for attempt in range(1, attempts + 1):
        wait = _last[0] + SPACING_S - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        hdrs = {}
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                status, ctype, body = r.status, r.headers.get('Content-Type', ''), r.read()
        except urllib.error.HTTPError as e:
            status, ctype, body, hdrs = e.code, e.headers.get('Content-Type', ''), e.read(), dict(e.headers or {})
        except Exception as e:  # transport failure: retry like a 503
            status, body = 0, str(e).encode()
        if status in (0, 429, 502, 503, 504) and attempt < attempts:
            ra = next((v for k, v in hdrs.items() if k.lower() == 'retry-after'), None)
            time.sleep(max(SPACING_S * attempt * 2, float(ra) if ra and ra.isdigit() else 0))
            continue
        break
    return status, ctype, body.decode('utf-8', 'replace')


def main():
    """Capture the named fixtures (all by default) and report each one."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true', help='list the fixtures and exit')
    ap.add_argument('names', nargs='*')
    args = ap.parse_args()
    if args.list:
        for name, url in FIXTURES.items():
            print(f'{name:22} {url}')
        return 0
    names = args.names or list(FIXTURES)
    bad = [n for n in names if n not in FIXTURES]
    if bad:
        print(f'unknown: {", ".join(bad)}', file=sys.stderr)
        return 2
    failed = 0
    for name in names:
        url = FIXTURES[name]
        status, ctype, body = get(url)
        if not status:
            print(f'FAIL {name}: no answer ({body[:80]})')
            failed += 1
            continue
        out = os.path.join(OUT_DIR, f'ext-{name}.json')
        with open(out, 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'url': url, 'status': status, 'contentType': ctype, 'body': body}, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'ok   {name}: HTTP {status}, {len(body)} chars -> {os.path.relpath(out)}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
