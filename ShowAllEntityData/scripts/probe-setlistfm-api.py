#!/usr/bin/env python3
"""Probe the setlist.fm API for the setlist.fm reader and save its answers as fixtures.

The reader (branch B, mockup 4: https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag)
reads setlist.fm through its official API (vzell 2026-10-29: "Official API
with a key"; https://api.setlist.fm/docs/1.0/index.html), never its pages,
which answer a script with a bot check. Every request carries the user's
own key in `x-api-key` and asks JSON (`Accept: application/json`). This
records, before any code depends on it, for the three pages vzell named:

1. a setlist (`/1.0/setlist/{setlistId}`): its sets, songs, info, covers;
2. an artist's setlists (`/1.0/artist/{mbid}/setlists?p=1`) and the artist
   (`/1.0/artist/{mbid}`): `itemsPerPage`, `total`, how many pages;
3. a venue (`/1.0/venue/{venueId}`) and its setlists
   (`/1.0/venue/{venueId}/setlists?p=1`);
4. the rate limit headers the API sends, if any (`X-RateLimit-*`), and what
   a second request inside a second answers (429?);
5. an unknown setlist id (404?) and a request without a key (401/403?);
6. a tour's setlists by name (`/1.0/search/setlists?artistMbid=…&tourName=…&p=1`,
   org/setlistfm.org "venue additions" item 5, 2026-11-02): the API names a
   tour only by its name, so the reader's tour links search by it. Saved as
   ext-sfm-tour-setlists-p1.json; prints whether every hit carries that tour.

A setlist.fm page names its ids in the URL: a setlist ends "-<id>.html"
(4bf0375a), an artist's list "-<id>.html" (2bd6dcce, setlist.fm's own artist
id, NOT the MusicBrainz MBID the API wants: the artist lookup below maps
it), a venue "-<id>.html" (3d6c967).

Each answer is saved as tests/fixtures/ext-sfm-<what>.json (the fixtures the
specs serve through the GM_xmlhttpRequest stub). The key is never printed or
saved: it is read from the environment.

Run: SETLISTFM_API_KEY=… python3 scripts/probe-setlistfm-api.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.setlist.fm/rest/1.0'
SETLIST = '4bf0375a'                                   # Los Angeles Sports Arena, 2016-03-19
ARTIST_MBID = '70248960-cb53-4ea4-943a-edb18f7d336f'   # Bruce Springsteen
VENUE = '3d6c967'                                      # Los Angeles Sports Arena
TOUR = 'The River Tour 2016'                           # the tour of SETLIST
ARTIST_NAME = 'Bruce Springsteen'                      # ARTIST_MBID's name
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'


def get(path, key, keep=None):
    """GET one API path; print status, bytes, time and rate headers; save it as a fixture."""
    req = urllib.request.Request(API + path, headers={'Accept': 'application/json', 'User-Agent': UA,
                                                      **({'x-api-key': key} if key else {})})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body, status, hdrs = r.read(), r.status, r.headers
    except urllib.error.HTTPError as e:
        body, status, hdrs = e.read(), e.code, e.headers
    rate = {k: v for k, v in hdrs.items() if 'rate' in k.lower() or k.lower() == 'retry-after'}
    print(f'{path}: {status} {len(body)} B {time.time() - t0:.2f} s {rate or ""}')
    if keep and status == 200:
        with open(os.path.join(OUT, f'ext-sfm-{keep}.json'), 'w', encoding='utf-8') as fh:
            json.dump(json.loads(body), fh, ensure_ascii=False, indent=1)
            fh.write('\n')
    try:
        return status, json.loads(body)
    except ValueError:
        return status, None


def main():
    """Run the probes; exit 2 without a key."""
    key = os.environ.get('SETLISTFM_API_KEY', '').strip()
    if not key:
        print('Set SETLISTFM_API_KEY (your setlist.fm API key) in the environment.', file=sys.stderr)
        return 2
    st, d = get(f'/setlist/{SETLIST}', key, 'setlist')
    if d:
        # The docs' example has `set` at the top; older answers wrap it as `sets.set`.
        sets = d.get('set') or (d.get('sets') or {}).get('set') or []
        print(f'  shape: {"set" if d.get("set") else "sets.set" if d.get("sets") else "no sets"}')
        songs = [s for x in sets for s in x.get('song') or []]
        print(f'  sets {len(sets)} ({[x.get("name") or ("encore " + str(x.get("encore"))) if x.get("encore") else x.get("name", "") for x in sets]}), '
              f'songs {len(songs)}, with info {sum(1 for s in songs if s.get("info"))}, covers {sum(1 for s in songs if s.get("cover"))}, '
              f'tour {(d.get("tour") or {}).get("name")!r}, keys {sorted(d)}')
    time.sleep(1.1)
    get(f'/artist/{ARTIST_MBID}', key, 'artist')
    time.sleep(1.1)
    st, d = get(f'/artist/{ARTIST_MBID}/setlists?p=1', key, 'artist-setlists-p1')
    if d:
        print(f'  itemsPerPage {d.get("itemsPerPage")}, total {d.get("total")}, page {d.get("page")}, items {len(d.get("setlist") or [])}')
    time.sleep(1.1)
    st, d = get(f'/venue/{VENUE}', key, 'venue')
    if d:
        print(f'  venue keys {sorted(d)}, city keys {sorted((d.get("city") or {}))}')
    time.sleep(1.1)
    st, d = get(f'/venue/{VENUE}/setlists?p=1', key, 'venue-setlists-p1')
    if d:
        print(f'  itemsPerPage {d.get("itemsPerPage")}, total {d.get("total")}, items {len(d.get("setlist") or [])}')
    time.sleep(1.1)
    q = urllib.parse.urlencode({'artistMbid': ARTIST_MBID, 'tourName': TOUR, 'p': 1})
    st, d = get(f'/search/setlists?{q}', key, 'tour-setlists-p1')
    if d:
        rows = d.get('setlist') or []
        tours = sorted({(x.get('tour') or {}).get('name', '') for x in rows})
        print(f'  itemsPerPage {d.get("itemsPerPage")}, total {d.get("total")}, items {len(rows)}, tours {tours}, '
              f'tour keys {sorted((rows[0].get("tour") or {})) if rows else []}')
    # 7. The same tour by the artist's NAME (a tour link carries setlist.fm's
    # search URL, which names the artist, not its MBID; 2026-11-02): the same
    # total? And a name two artists share (Nirvana: the 1960s UK band and the
    # US one) — does the API mix their setlists?
    for name, tour in ((ARTIST_NAME, TOUR), ('Journey', 'Final Frontier Tour'), ('Nirvana', '')):
        time.sleep(1.1)
        q = urllib.parse.urlencode({k: v for k, v in (('artistName', name), ('tourName', tour), ('p', 1)) if v})
        st, d = get(f'/search/setlists?{q}', key)
        if d:
            rows = d.get('setlist') or []
            arts = sorted({f'{(x.get("artist") or {}).get("name")} {(x.get("artist") or {}).get("mbid")}' for x in rows})
            print(f'  total {d.get("total")}, items {len(rows)}, artists {arts}, '
                  f'tours {sorted({(x.get("tour") or {}).get("name", "") for x in rows})[:5]}')
    # Two at once: does the API answer 429 inside a second?
    get(f'/setlist/{SETLIST}', key)
    get(f'/setlist/{SETLIST}', key)
    time.sleep(1.1)
    get('/setlist/00000000', key)
    time.sleep(1.1)
    get(f'/setlist/{SETLIST}', '')
    return 0


if __name__ == '__main__':
    sys.exit(main())
