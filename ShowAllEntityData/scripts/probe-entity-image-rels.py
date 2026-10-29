#!/usr/bin/env python3
"""Which URL relationships of an entity point at a picture, per entity kind.

For the entity images (WIP.5 of feature/poh-setlist-images-dg-history,
2026-10-29): zabe's "MusicBrainz Entity Images" userscript
(tests/fixtures/live-userscripts/entity-image.user.js) takes the url-rels of
types `image`, `logo` and `poster`, plus any Wikimedia Commons `File:` link.
This asks /ws/2/<kind>/<mbid>?inc=url-rels for one entity of each kind and
prints every url relation's type, and which of them a picture would come
from, so the code rests on what the Web Service answers rather than on the
docs (https://musicbrainz.org/doc/MusicBrainz_API: `url-rels` is the include
for an entity's URL relationships). One request a second
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Usage: python3 scripts/probe-entity-image-rels.py [--save]
  --save  also writes tests/fixtures/ws2-images-<kind>-<name>.json (the answers).

Result 2026-10-29T01:30+01:00 (NB-3641): label CBS, 10 url rels, six `logo`
(the six of debug/mb-label-CBS-logos-initial.html, one http-only:
logos-vector.com); artist Bruce Springsteen, 77 url rels, one `image`, a
Commons File: link; series The Rising Tour, event be07d2a9, instrument
guitar: no picture rel (only wikidata / review); place: 503. A second run
(2026-10-29T01:55+01:00, `--save`): place Capital One Arena, 10 url rels,
one `image`, a Commons File: link. The code therefore takes these three
types plus Commons File: links on any kind (zabe's rule) and does not
hard-code which kind has which type. Kept as a fixture: the CBS answer only,
ws2-images-label-cbs.json (entity-images.spec.js, pop-mb-image.spec.js).
"""
import json
import os
import sys
import time
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( https://github.com/vzell/mb-userscripts )'
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
PICTURE_TYPES = {'image', 'logo', 'poster'}
ENTITIES = [
    ('label', 'cbs', 'b8d33bec-92cc-40d9-bd92-4eb089b401a9'),
    ('artist', 'bruce', '70248960-cb53-4ea4-943a-edb18f7d336f'),
    ('place', 'capital-one-arena', 'a9bcf8f0-cdcc-4ea7-bbd3-64f22279bd6b'),
    ('series', 'rising-tour', '5c605c0d-de8d-478e-9b93-d518ccecc748'),
    ('event', 'mci-2002', 'be07d2a9-d1c9-47c8-98ac-69e2b392209a'),
    ('instrument', 'guitar', '63021302-86cd-4aee-80df-2270d54f4978'),
]


def main():
    save = '--save' in sys.argv
    for kind, name, mbid in ENTITIES:
        url = f'https://musicbrainz.org/ws/2/{kind}/{mbid}?inc=url-rels&fmt=json'
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
        except Exception as e:  # noqa: BLE001 - a probe reports and goes on
            print(f'{kind:10} {name}: {e}')
            time.sleep(1.2)
            continue
        rels = [x for x in data.get('relations', []) if x.get('target-type') == 'url']
        types = sorted({x.get('type', '') for x in rels})
        pics = [(x.get('type'), x['url']['resource']) for x in rels
                if x.get('type') in PICTURE_TYPES or '/commons.wikimedia.org/wiki/File:' in x['url']['resource']]
        print(f'{kind:10} {name}: {len(rels)} url rels; types {types}')
        for t, res in pics:
            print(f'{"":12}picture? {t:8} {res}')
        if save:
            path = os.path.join(OUT, f'ws2-images-{kind}-{name}.json')
            with open(path, 'w', encoding='utf-8', newline='\n') as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
                fh.write('\n')
        time.sleep(1.2)


if __name__ == '__main__':
    main()
