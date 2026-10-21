#!/usr/bin/env python3
"""Captures the WS/2 event lookups the "#" cell's stacked event card asks for
on the Brixton Night fixture (tests/fixtures/release-tracks-brixton-night.html),
with the event card's own inc set (_MB_KINDS.event.cardInc), and writes them
as tests/fixtures/ws2-pop-event-<name>.json. One request a second
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Usage: python3 scripts/probe-event-card-fixtures.py
"""
import json
import os
import time
import urllib.request

INC = 'artist-rels+place-rels+event-rels+series-rels+url-rels'
EVENTS = {
    'brixton-0424': '066b48dd-4246-4553-ba5d-94fd2d29115a',
    'rah-0422': '0ee722a0-00b8-45a4-ba21-f4d549ce29bd',
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
UA = 'ShowAllEntityData-probe/1.0 ( https://github.com/vzell/mb-userscripts )'


def main():
    for name, mbid in EVENTS.items():
        url = f'https://musicbrainz.org/ws/2/event/{mbid}?inc={INC}&fmt=json'
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        path = os.path.join(OUT, f'ws2-pop-event-{name}.json')
        with open(path, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        print(f'{name}: {data.get("name")!r} type={data.get("type")!r} '
              f'relations={len(data.get("relations", []))} setlist={"yes" if data.get("setlist") else "no"} -> {path}')
        time.sleep(1.2)


if __name__ == '__main__':
    main()
