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
    # WIP.2: the studio "Thunder Road" (org/iframe.org R10: found through its
    # ISRC USSM17500803) and its work: the card's lookup, the window's
    # lookup and count, the work's first page of recordings.
    'recording-thunder': 'recording/bbcedc0f-2fff-42f4-9ca6-6d2263d1a042'
                         '?inc=artist-credits+isrcs+releases+work-rels',
    'recording-thunder-pin': 'recording/bbcedc0f-2fff-42f4-9ca6-6d2263d1a042'
                             '?inc=artist-rels+place-rels+event-rels',
    'recording-thunder-count': 'release?recording=bbcedc0f-2fff-42f4-9ca6-6d2263d1a042&limit=1',
    'work-btr': 'work/9893a23c-f282-3b07-a2db-b4f2f3b9f4b2?inc=artist-rels+label-rels+work-rels',
    'work-btr-recordings': 'recording?work=9893a23c-f282-3b07-a2db-b4f2f3b9f4b2&limit=100&inc=artist-credits',
    # WIP.3: the legend's artist, label, area and instrument
    # (PAGETYPES-TESTING-REFERENCE.org; the Phase 0 probe's ids). The artist
    # card leaves url-rels to the window (R1: 75 links are most of its
    # 30 KB); the window counts release groups per primary type.
    'artist-bruce': 'artist/70248960-cb53-4ea4-943a-edb18f7d336f?inc=genres+ratings+aliases',
    'artist-bruce-pin': 'artist/70248960-cb53-4ea4-943a-edb18f7d336f?inc=url-rels',
    'artist-bruce-rg-album': 'release-group?artist=70248960-cb53-4ea4-943a-edb18f7d336f&type=album&limit=1',
    'artist-bruce-rg-single': 'release-group?artist=70248960-cb53-4ea4-943a-edb18f7d336f&type=single&limit=1',
    'artist-bruce-rg-ep': 'release-group?artist=70248960-cb53-4ea4-943a-edb18f7d336f&type=ep&limit=1',
    'artist-bruce-rg-broadcast': 'release-group?artist=70248960-cb53-4ea4-943a-edb18f7d336f&type=broadcast&limit=1',
    'artist-bruce-rg-other': 'release-group?artist=70248960-cb53-4ea4-943a-edb18f7d336f&type=other&limit=1',
    'label-columbia': 'label/011d1192-6f65-45bd-85c4-0400dd45693e?inc=genres+aliases',
    'label-columbia-pin': 'label/011d1192-6f65-45bd-85c4-0400dd45693e?inc=url-rels+label-rels',
    'label-columbia-count': 'release?label=011d1192-6f65-45bd-85c4-0400dd45693e&limit=1',
    'area-nj': 'area/a36544c1-cb40-4f44-9e0e-7a5a69e403a8?inc=area-rels',
    'instrument-guitar': 'instrument/63021302-86cd-4aee-80df-2270d54f4978?inc=instrument-rels+aliases',
    # WIP.4: the Manchester event (it has event art, R4), a place, a series.
    # A series' item kind follows its type, so the lookup asks for every
    # item-kind relation (R1).
    'event-manchester': 'event/3f2ca30a-7de4-4964-ad30-48376535fec8?inc=artist-rels+place-rels',
    'event-manchester-pin': 'event/3f2ca30a-7de4-4964-ad30-48376535fec8?inc=recording-rels+release-rels',
    'place-sp': 'place/6a59a67c-fcc5-491f-949c-bfc45bc97463?inc=area-rels+url-rels',
    'place-sp-events': 'event?place=6a59a67c-fcc5-491f-949c-bfc45bc97463&limit=100',
    'series-st': 'series/aa3694d3-a3d0-48ed-8f07-5b576de87908'
                 '?inc=release-rels+release-group-rels+recording-rels+work-rels+event-rels+artist-rels',
    # WIP.5: codes. Thunder Road's ISRC, Born to Run's ISWC, a disc ID of the
    # probe's "Darkness" release, and a public collection (the user's own,
    # found by the Phase 0 probe's editor browse).
    'isrc-thunder': 'isrc/USSM17500803?inc=artist-credits',
    'iswc-btr': 'iswc/T-070.014.903-6',
    'discid-dark': 'discid/coDDysS5IdmG1aPONqJSQd6TJws-',
    'collection-attending': 'collection/60df131d-bdb7-3c83-840d-e31e566baabe',
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
