#!/usr/bin/env python3
"""Probe: which Wikidata pictures MusicBrainz areas have (feat/area-pictures).

For the area window's pictures (mockup https://claude.ai/artifact/C2YZCFYWfMndTv37pBRr2o
part A, approved 2026-11-23): every area linked from the HTML fixtures
(tests/fixtures/*.html), or the MBIDs given, is looked up on MusicBrainz with
inc=url-rels (its Wikidata item), then Wikidata is asked one wbgetclaims per
property in Event Horizon's order (areaImages(): P242 locator map, P41 flag,
P94 coat of arms, P158 seal, P18 image), one request a second, anonymous.

Per area it records each property's claims: how many, their ranks, and the
file SAED's _mbPopClaimFile() would pick (a preferred value, else the first
not deprecated). Prints a summary: how often each property exists, how often
the map is first (so the flag badge sits on it), and the areas with none.

Usage: python3 scripts/probe-area-images.py [--limit N] [--json OUT] [MBID ...]
"""
import glob
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

PROPS = ['P242', 'P41', 'P94', 'P158', 'P18']
NAMES = {'P242': 'locator map', 'P41': 'flag', 'P94': 'coat of arms', 'P158': 'seal', 'P18': 'image'}
UA = 'SAED-probe/1.0 (userscript development probe)'
HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, '..', 'tests', 'fixtures')
LINK_RE = re.compile(r'area/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"[^<>]{0,80}>(?:<bdi>)?([^<]{1,80})<')


def fixture_areas():
    """Return {mbid: name} for every area link in the HTML fixtures."""
    out = {}
    for path in sorted(glob.glob(os.path.join(FIXTURES, '*.html'))):
        with open(path, encoding='utf-8', errors='replace') as f:
            for mbid, name in LINK_RE.findall(f.read()):
                if not mbid.startswith(('cccccccc', '00000000')):
                    out.setdefault(mbid, name.strip())
    return out


def get_json(url, headers=None):
    """GET a JSON answer; (data, error)."""
    h = {'User-Agent': UA, 'Accept': 'application/json'}
    h.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
            return json.load(r), None
    except Exception as e:  # noqa: BLE001 - a probe reports and goes on
        return None, str(e)


def wikidata_item(rels):
    """The Q-id of the first wikidata url relation, or ''."""
    for r in rels or []:
        m = re.search(r'wikidata\.org/wiki/(Q\d+)', ((r.get('url') or {}).get('resource')) or '')
        if r.get('type') == 'wikidata' and m:
            return m.group(1)
    return ''


def claim_pick(claims):
    """The file _mbPopClaimFile() picks: a preferred value, else the first not deprecated."""
    def val(c):
        v = ((c.get('mainsnak') or {}).get('datavalue') or {}).get('value')
        return v if isinstance(v, str) else ''
    for c in claims:
        if c.get('rank') == 'preferred' and val(c):
            return val(c)
    for c in claims:
        if c.get('rank') != 'deprecated' and val(c):
            return val(c)
    return ''


def main(argv):
    out_path, limit = None, None
    if '--json' in argv:
        i = argv.index('--json')
        out_path = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    if '--limit' in argv:
        i = argv.index('--limit')
        limit = int(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    areas = {m: m for m in argv} if argv else fixture_areas()
    ids = list(areas)[:limit] if limit else list(areas)
    print(f'{len(ids)} areas')
    result = {}
    for mbid in ids:
        d, err = get_json(f'https://musicbrainz.org/ws/2/area/{mbid}?inc=url-rels&fmt=json')
        time.sleep(1.1)
        if err:
            # One retry after a 503 (MusicBrainz's rate limit under load).
            time.sleep(3)
            d, err = get_json(f'https://musicbrainz.org/ws/2/area/{mbid}?inc=url-rels&fmt=json')
            time.sleep(1.1)
        if err:
            print(f'  ! {mbid}: {err}')
            result[mbid] = {'name': areas[mbid], 'error': err}
            continue
        q = wikidata_item(d.get('relations'))
        rec = {'name': d.get('name'), 'type': d.get('type'), 'item': q, 'props': {}}
        for p in PROPS if q else []:
            w, werr = get_json('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(
                {'action': 'wbgetclaims', 'format': 'json', 'entity': q, 'property': p}),
                {'Api-User-Agent': UA})
            time.sleep(1.0)
            if werr:
                rec['props'][p] = {'error': werr}
                continue
            cs = (w.get('claims') or {}).get(p) or []
            rec['props'][p] = {'n': len(cs), 'ranks': [c.get('rank') for c in cs], 'pick': claim_pick(cs)}
        found = [p for p in PROPS if (rec['props'].get(p) or {}).get('pick')]
        rec['found'] = found
        result[mbid] = rec
        print(f"  {rec['name']} ({rec['type']}, {q or 'no Wikidata'}): " +
              (', '.join(NAMES[p] for p in found) or 'no pictures'))
    done = [r for r in result.values() if 'found' in r]
    print('\nSummary')
    print(f'  areas asked: {len(done)} (errors {len(result) - len(done)}); no Wikidata item: '
          f'{sum(1 for r in done if not r["item"])}')
    for p in PROPS:
        print(f'  {NAMES[p]:<13} {p:<5} {sum(1 for r in done if p in r["found"]):>3}')
    print(f'  map first (badge possible): {sum(1 for r in done if r["found"][:1] == ["P242"])}; '
          f'map + flag (badge shown): {sum(1 for r in done if r["found"][:1] == ["P242"] and "P41" in r["found"])}')
    print(f'  no picture at all: {sum(1 for r in done if not r["found"])}')
    by_type = {}
    for r in done:
        by_type.setdefault(r['type'] or '?', []).append(len(r['found']))
    for t, ns in sorted(by_type.items()):
        print(f'  {t:<14} {len(ns):>3} areas, pictures per area {min(ns)}–{max(ns)}')
    if out_path:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1:])
