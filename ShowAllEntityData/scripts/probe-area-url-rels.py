#!/usr/bin/env python3
"""Probe: which external links (url-rels) MusicBrainz areas carry.

For the area window's links table (mockup question A3, 2026-11-23): asks
/ws/2/area/<id>?inc=url-rels for a few areas of each type, one request a
second (MusicBrainz's rate limit), and prints each link's relationship type
and host, plus a count per area. Anonymous; a generic User-Agent.

Usage: python3 scripts/probe-area-url-rels.py [--json OUT] [MBID ...]
"""
import json
import sys
import time
import urllib.parse
import urllib.request

AREAS = {
    'United States': '489ce91b-6658-3307-9877-795b68554c98',
    'Germany': '85752fda-13c4-31a3-bee5-0e5cb1f51dad',
    'New Jersey': '32b61673-e0b4-4c46-82b2-6806f88bd113',
    'Berlin': 'c9ac1239-e832-41bc-9930-e252a1fd1105',
    'Asbury Park': '10fa66f7-aa08-4823-8af8-52108f350a5a',
    'Monmouth County': '604b7841-36b7-4bea-9bdc-7eeb52520e35',
}
UA = 'SAED-probe/1.0 (userscript development probe)'


def get(mbid):
    """Return the area lookup with url-rels, or None on an error."""
    url = f'https://musicbrainz.org/ws/2/area/{mbid}?inc=url-rels&fmt=json'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except Exception as e:  # noqa: BLE001 - a probe reports and goes on
        print(f'  ! {mbid}: {e}')
        return None


def main(argv):
    out = None
    if '--json' in argv:
        i = argv.index('--json')
        out = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    ids = [(m, m) for m in argv] or [(n, m) for n, m in AREAS.items() if m]
    result = {}
    for name, mbid in ids:
        d = get(mbid)
        time.sleep(1.1)
        if not d:
            continue
        rels = [r for r in d.get('relations', []) if r.get('url')]
        print(f"{d.get('name')} ({d.get('type')}): {len(rels)} links")
        for r in rels:
            res = r['url']['resource']
            host = urllib.parse.urlparse(res).hostname or res
            print(f"  {r.get('type', ''):<28} {res}")
        result[d.get('name')] = {'id': mbid, 'type': d.get('type'),
                                 'links': [{'type': r.get('type'), 'url': r['url']['resource']} for r in rels]}
    if out:
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1:])
