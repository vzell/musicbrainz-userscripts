"""Capture real MusicBrainz Web Service answers as fixtures for the popup
engine's entity-card specs (org/iframe.org, Phase 2).

Each fixture is the exact request a card or window makes (same path, same
inc set), saved as tests/fixtures/ws2-pop-<name>.json, so a spec serves what
the live endpoint answered. The requests follow
https://musicbrainz.org/doc/MusicBrainz_API (checked 2026-10-07) and
https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting: 1.1 s between
requests, a User-Agent with a contact, 429/502/503/504 retried with
Retry-After as a floor (as scripts/probe-mb-entity-lookups.py does).

The default set grows with each Phase 2 step; pass names to capture only
those:

usage: python3 scripts/capture-ws2-fixtures.py [--list] [name ...]
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-popup-engine-fixtures/1.0 ( info@volkerzell.de )'
WS = 'https://musicbrainz.org/ws/2'
SPACING_S = 1.1
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures')

# name -> Web Service path (without fmt), the userscript's own request.
FIXTURES = {
    # WIP.1: a release of "Greetings From Asbury Park, N.J." — the first row
    # of tests/fixtures/releasegroup-releases-multirow-catalog.html.
    'release-greetings': 'release/3ce46b79-5e8c-470a-bcdc-45f301d09f60'
                         '?inc=artist-credits+labels+recordings+release-groups+media',
}

_last = [0.0]


def get(url, attempts=5):
    """GET one URL politely; returns (status, body-bytes)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    status, body = 0, b''
    for attempt in range(1, attempts + 1):
        wait = _last[0] + SPACING_S - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        headers = {}
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, body = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, body, headers = e.code, e.read(), dict(e.headers or {})
        except Exception as e:  # transport failure: retry like a 503
            status, body = 0, str(e).encode()
        if status in (0, 429, 502, 503, 504) and attempt < attempts:
            ra = next((v for k, v in headers.items() if k.lower() == 'retry-after'), None)
            time.sleep(max(SPACING_S * attempt, float(ra) if ra and ra.isdigit() else 0))
            continue
        return status, body
    return status, body


def main():
    """Capture the named fixtures (all by default) and report each one."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true', help='list the fixtures and exit')
    ap.add_argument('names', nargs='*')
    args = ap.parse_args()
    if args.list:
        for name, path in FIXTURES.items():
            print(f'{name:28} {path}')
        return 0
    names = args.names or list(FIXTURES)
    bad = [n for n in names if n not in FIXTURES]
    if bad:
        print(f'unknown: {", ".join(bad)}', file=sys.stderr)
        return 2
    failed = 0
    for name in names:
        path = FIXTURES[name]
        sep = '&' if '?' in path else '?'
        status, body = get(f'{WS}/{path}{sep}fmt=json')
        if status != 200:
            print(f'FAIL {name}: HTTP {status}')
            failed += 1
            continue
        data = json.loads(body.decode('utf-8'))
        out = os.path.join(OUT_DIR, f'ws2-pop-{name}.json')
        with open(out, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'ok   {name}: {len(body)} bytes -> {os.path.relpath(out)}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
