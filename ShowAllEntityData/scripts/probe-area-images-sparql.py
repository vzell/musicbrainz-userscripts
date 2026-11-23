#!/usr/bin/env python3
"""Probe: an area's five pictures in ONE Wikidata Query Service request.

probe-area-images.py asks five wbgetclaims per area (Event Horizon's way) and
met HTTP 429 after about 19 requests at one a second (2026-11-23). This asks
the same five properties (P242, P41, P94, P158, P18) for an item in one
SPARQL query, with each statement's rank, and compares the pick with
probe-area-images.json's (a preferred value, else the first not deprecated;
wdt: would give only the best rank, so p:/ps:/wikibase:rank is used).

Prints per item: the files found, the answer's size and time, and whether it
agrees with the wbgetclaims picks. Anonymous, one request every 2 s.

Usage: python3 scripts/probe-area-images-sparql.py Q30 Q1408 Q64 ...
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

PROPS = ['P242', 'P41', 'P94', 'P158', 'P18']
UA = 'SAED-probe/1.0 (userscript development probe)'
HERE = os.path.dirname(os.path.abspath(__file__))
CLAIMS = os.path.join(HERE, '..', 'debug', 'probe-area-images.json')


def query(q):
    """The SPARQL text for item q: every statement of the five properties with its rank."""
    vals = ' '.join(f'p:{p}' for p in PROPS)
    return ('SELECT ?prop ?file ?rank WHERE { VALUES ?p { ' + vals + ' } '
            f'wd:{q} ?p ?st . ?st ?ps ?file ; wikibase:rank ?rank . '
            '?prop wikibase:claim ?p ; wikibase:statementProperty ?ps . }')


def picks(rows):
    """Per property: a preferred value, else the first normal one (deprecated never)."""
    out = {}
    for p in PROPS:
        rs = [r for r in rows if r['prop'].endswith('/' + p)]
        pref = [r for r in rs if r['rank'].endswith('PreferredRank')]
        norm = [r for r in rs if r['rank'].endswith('NormalRank')]
        pick = (pref or norm or [None])[0]
        if pick:
            out[p] = urllib.parse.unquote(pick['file'].rsplit('/', 1)[-1]).replace('_', ' ')
    return out


def main(items):
    known = {}
    if os.path.exists(CLAIMS):
        for r in json.load(open(CLAIMS, encoding='utf-8')).values():
            if r.get('item') and r.get('props') and not any('error' in v for v in r['props'].values()):
                known[r['item']] = {p: v['pick'] for p, v in r['props'].items() if v.get('pick')}
    for q in items:
        url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query(q), 'format': 'json'})
        t0 = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={
                    'User-Agent': UA, 'Accept': 'application/sparql-results+json'}), timeout=60) as r:
                raw = r.read()
            status = 200
        except Exception as e:  # noqa: BLE001 - a probe reports and goes on
            print(f'{q}: {e}')
            time.sleep(2)
            continue
        ms = int((time.time() - t0) * 1000)
        rows = [{k: v['value'] for k, v in b.items()} for b in json.loads(raw)['results']['bindings']]
        got = picks(rows)
        agree = '' if q not in known else (' agrees with wbgetclaims' if known[q] == got else f' DIFFERS: {known[q]}')
        print(f'{q}: {status}, {len(raw)} bytes, {ms} ms, {len(rows)} statements -> {sorted(got)}{agree}')
        for p in PROPS:
            if p in got:
                print(f'    {p:<5} {got[p]}')
        time.sleep(2)


if __name__ == '__main__':
    main(sys.argv[1:])
