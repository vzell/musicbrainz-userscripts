#!/usr/bin/env python3
"""Summarise the WIP.3 fixtures."""
import json
import collections
F = 'tests/fixtures/ws2-pop-{}.json'
def L(n):
    return json.load(open(F.format(n), encoding='utf-8'))
a = L('artist-bruce')
print('ARTIST', {k: a.get(k) for k in ('name', 'sort-name', 'type', 'gender', 'country', 'disambiguation', 'ipis', 'isnis', 'life-span')})
print('  area', (a.get('area') or {}).get('name'), (a.get('begin-area') or {}).get('name'), 'genres', [g['name'] for g in a.get('genres', [])][:6], 'rating', a.get('rating'), 'aliases', len(a.get('aliases', [])))
p = L('artist-bruce-pin')
print('  pin rels', len(p.get('relations', [])), collections.Counter(r['type'] for r in p['relations']).most_common(5))
for t in ('album', 'single', 'ep', 'broadcast', 'other'):
    print('  rg', t, L(f'artist-bruce-rg-{t}').get('release-group-count'))
l = L('label-columbia')
print('LABEL', {k: l.get(k) for k in ('name', 'type', 'label-code', 'country', 'disambiguation', 'life-span', 'ipis')}, (l.get('area') or {}).get('name'), [g['name'] for g in l.get('genres', [])][:5], len(l.get('aliases', [])))
lp = L('label-columbia-pin')
print('  pin', collections.Counter((r['target-type'], r['type'], r.get('direction')) for r in lp['relations']).most_common(8))
print('  count', L('label-columbia-count').get('release-count'))
ar = L('area-nj')
print('AREA', {k: ar.get(k) for k in ('name', 'type', 'iso-3166-2-codes', 'iso-3166-1-codes', 'disambiguation', 'life-span')})
print('  rels', collections.Counter((r['type'], r.get('direction')) for r in ar.get('relations', [])))
i = L('instrument-guitar')
print('INSTR', {k: i.get(k) for k in ('name', 'type', 'description', 'disambiguation')}, len(i.get('aliases', [])))
print('  rels', collections.Counter((r['type'], r.get('direction')) for r in i.get('relations', [])))
print('--- label rel targets')
for key in (('label ownership', 'forward'), ('label ownership', 'backward'), ('imprint', 'backward'), ('imprint', 'forward')):
    print(key, [r['label']['name'] for r in lp['relations'] if (r['type'], r.get('direction')) == key][:5])
print('--- instrument')
for key in (('subtype', 'forward'), ('hybrid of', 'backward'), ('parts', 'backward')):
    print(key, [r['instrument']['name'] for r in i['relations'] if (r['type'], r.get('direction')) == key][:5])
print('--- area', [r['area']['name'] for r in ar['relations'] if r.get('direction') == 'backward'], [r['area']['name'] for r in ar['relations'] if r.get('direction') == 'forward'][:4])
