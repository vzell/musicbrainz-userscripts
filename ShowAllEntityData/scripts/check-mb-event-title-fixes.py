#!/usr/bin/env python3
"""Check the 24 MusicBrainz event titles of org/bbp-parity.org against MusicBrainz now.

Usage:
    python3 scripts/check-mb-event-title-fixes.py [--out FILE]

For each event of the list "MusicBrainz event titles to fix by hand" (A typos,
B dropped accents, C disagreements), one lookup
/ws/2/event/<mbid>?inc=place-rels+url-rels&fmt=json (MusicBrainz API, lookup;
https://musicbrainz.org/doc/MusicBrainz_API), 1.1 s apart (the documented
limit is about 1 request/s), a generic User-Agent. Prints an org table: the
title now, the title after the fix (A and B: the wrong text replaced; C: no
proposal, the linked place and the Brucebase review link shown instead), and
whether the fix is still needed. Read-only; no login, no edit.
Written 2026-11-23 (vzell: "tackle also the 24 MusicBrainz event titles").
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

UA = 'mb-event-title-check/1.0 (read-only lookups)'
WS = 'https://musicbrainz.org/ws/2/event/{}?inc=place-rels+url-rels&fmt=json'

# (group, mbid, wrong text, right text); C has no fix of its own
EVENTS = [
    ('A', '5ca9be81-4cc4-4dd0-8a07-9d932e6b4b23', 'Steetcar', 'Streetcar'),
    ('A', '4713487c-62d6-4151-b628-8a5804fea9d3', 'Pollack', 'Pollak'),
    ('A', 'bb6c1d8c-1f4e-4675-ae5c-eafdb3edda81', 'Pollack', 'Pollak'),
    ('A', '5a9c9a6d-1c74-422e-a27f-2a52c7aeb8eb', 'Toronto, On,', 'Toronto, ON,'),
    ('A', '57b91acb-7d48-44cb-9e46-8b1f0dfbef56', 'first direct arena', 'First Direct Arena'),
    ('A', 'd36cb15d-43df-41dc-b0ab-01d242bd0d6d', 'Oriole Park At Camden', 'Oriole Park at Camden'),
    ('A', '1fd3133f-6bd8-4a5f-a183-626fb00ad6cd', 'NY; USA', 'NY, USA'),
    ('A', 'b85fb122-d690-4c64-91ea-2396c006a274', 'New York, City NY', 'New York City, NY'),
    ('A', 'e97fbe44-af64-4767-b857-d21e532d42bb', 'Geneve', 'Geneva'),
    ('A', 'cff64fec-4c82-466d-ac24-8d6339b92e3d', 'Grand Mountain', 'Grouse Mountain'),
    ('B', 'ec63eb3c-f14d-4897-9cb0-523074ee2044', 'Dusseldorf', 'Düsseldorf'),
    ('B', '6dc5adec-ea05-4ccf-b3a8-c46de9266b10', 'Dusseldorf', 'Düsseldorf'),
    ('B', '1fae7591-bd75-4618-9fa0-045fd2bd98a4', 'Dusseldorf', 'Düsseldorf'),
    ('B', '4738997b-713b-4201-af76-ff998521a8d4', 'Sao Paulo', 'São Paulo'),
    ('B', '086d2f9d-8e65-4328-8c38-b0e46992b196', 'Keflavik', 'Keflavík'),
    ('B', 'a0dfe2a3-9fef-407d-8f76-2f3f3eaf47e1', 'San Sebastian', 'San Sebastián'),
    ('B', 'bd5b9284-e097-4059-a803-01b6c174f483', 'San Sebastian', 'San Sebastián'),
    ('B', 'b8f1e69f-7834-491e-a93f-e4973eb6e100', 'Bernabeu', 'Bernabéu'),
    ('B', 'ca016b8b-6657-404d-8950-00b11a5093ec', 'Cafe Eckstein', 'Café Eckstein'),
    ('C', 'd12c08c6-1b5a-413c-b0d0-866a0426652b', '', 'The Hit Factory (Brucebase)'),
    ('C', '2b4dc146-46c4-450c-b3c9-f2b7e46ec0b5', '', 'Record Plant (Brucebase)'),
    ('C', 'f74adb5d-c3a1-4058-880d-58b81eec41b8', '', 'The Metro (Brucebase)'),
    ('C', 'a212dc66-4f02-47f6-b120-7dafe5c3b781', '', 'The Metro (Brucebase)'),
    ('C', '84ab5c59-2e03-4071-884f-34a1090a332c', '', "Joe's Place (Brucebase)"),
]


def lookup(mbid):
    """One event lookup; a 503 (MusicBrainz busy) is retried after 5, 10, 20, 40 s."""
    req = urllib.request.Request(WS.format(mbid), headers={'User-Agent': UA, 'Accept': 'application/json'})
    for wait in (5, 10, 20, 40, None):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 503 or wait is None:
                raise
            time.sleep(wait)


def main():
    """Look every event up and print the table."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out')
    args = ap.parse_args()
    rows = []
    for i, (group, mbid, wrong, right) in enumerate(EVENTS):
        if i:
            time.sleep(1.1)
        try:
            ev = lookup(mbid)
        except Exception as e:  # noqa: BLE001 - report and go on
            rows.append((group, mbid, f'(lookup failed: {e})', '', 'unknown', ''))
            continue
        name = ev.get('name', '')
        places = [r['place']['name'] for r in ev.get('relations', []) if r.get('target-type') == 'place' and r.get('place')]
        bb = [r['url']['resource'] for r in ev.get('relations', [])
              if r.get('target-type') == 'url' and 'brucebase.wikidot.com' in r.get('url', {}).get('resource', '')]
        if group == 'C':
            rows.append((group, mbid, name, right, 'check a source', f'place: {", ".join(places) or "-"}; {", ".join(bb) or "no Brucebase link"}'))
        elif wrong in name:
            rows.append((group, mbid, name, name.replace(wrong, right), 'to fix', f'place: {", ".join(places) or "-"}'))
        elif right in name:
            rows.append((group, mbid, name, name, 'fixed already', f'place: {", ".join(places) or "-"}'))
        else:
            rows.append((group, mbid, name, '', 'changed otherwise', f'place: {", ".join(places) or "-"}'))
    lines = ['| Group | Event | Title now | Title after the fix | State | Note |',
             '|-------+-------+-----------+---------------------+-------+------|']
    for group, mbid, name, fixed, state, note in rows:
        lines.append(f'| {group} | [[https://musicbrainz.org/event/{mbid}/edit][{mbid[:8]}]] | {name} | {fixed} | {state} | {note} |')
    text = '\n'.join(lines) + '\n'
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(text)
    sys.stdout.write(text)


if __name__ == '__main__':
    main()
